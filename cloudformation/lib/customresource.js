import cf from '@openaddresses/cloudfriend';

export default {
    Parameters: {
        OutpostName: {
            Type: 'String',
            Description: 'Name of the Authentik LDAP outpost',
            Default: 'LDAP'
        }
    },
    Resources: {
        // IAM Role for the Lambda function
        UpdateLDAPTokenLambdaRole: {
            Type: 'AWS::IAM::Role',
            Properties: {
                RoleName: cf.join([cf.stackName, '-update-ldap-token-lambda-role']),
                AssumeRolePolicyDocument: {
                    Version: '2012-10-17',
                    Statement: [{
                        Effect: 'Allow',
                        Principal: {
                            Service: 'lambda.amazonaws.com'
                        },
                        Action: 'sts:AssumeRole'
                    }]
                },
                ManagedPolicyArns: [
                    'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
                ],
                Policies: [{
                    PolicyName: 'SecretsManagerAccess',
                    PolicyDocument: {
                        Version: '2012-10-17',
                        Statement: [{
                            Effect: 'Allow',
                            Action: [
                                'secretsmanager:UpdateSecret',
                                'secretsmanager:PutSecretValue',
                                'secretsmanager:GetSecretValue'
                            ],
                            Resource: [
                                cf.join([
                                    'arn:aws:secretsmanager:',
                                    cf.region,
                                    ':',
                                    cf.accountId,
                                    ':secret:coe-auth-*'
                                ]),
                                cf.join([
                                    'arn:aws:secretsmanager:',
                                    cf.region,
                                    ':',
                                    cf.accountId,
                                    ':secret:',
                                    cf.stackName,
                                    '/authentik-admin-token*'
                                ]),
                                cf.join([
                                    'arn:aws:secretsmanager:',
                                    cf.region,
                                    ':',
                                    cf.accountId,
                                    ':secret:',
                                    cf.stackName,
                                    '/authentik-ldap-token*'
                                ])
                            ]
                        }, {
                            Effect: 'Allow',
                            Action: [
                                'kms:Encrypt',
                                'kms:Decrypt',
                                'kms:ReEncryptFrom',
                                'kms:ReEncryptTo',
                                'kms:GenerateDataKey',
                                'kms:GenerateDataKeyWithoutPlaintext',
                                'kms:DescribeKey'
                            ],
                            Resource: cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-kms']))
                        }]
                    }
                }]
            }
        },

        // Lambda function to retrieve and update LDAP token
        UpdateLDAPTokenLambda: {
            Type: 'AWS::Lambda::Function',
            Properties: {
                FunctionName: cf.join([cf.stackName, '-update-ldap-token']),
                Runtime: 'nodejs22.x',
                Handler: 'index.handler',
                Role: cf.getAtt('UpdateLDAPTokenLambdaRole', 'Arn'),
                Timeout: 300,
                Code: {
                    ZipFile: cf.sub(`
import { SecretsManagerClient, GetSecretValueCommand, PutSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import https from 'https';
import http from 'http';
import { URL } from 'url';

const secretsManager = new SecretsManagerClient({});

// Helper function to send CloudFormation response
async function sendResponse(event, context, responseStatus, responseData = {}, physicalResourceId = null) {
    const responseBody = JSON.stringify({
        Status: responseStatus,
        Reason: \`See the details in CloudWatch Log Stream: \${context.logStreamName}\`,
        PhysicalResourceId: physicalResourceId || context.logStreamName,
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
        Data: responseData
    });

    const parsedUrl = new URL(event.ResponseURL);
    const options = {
        hostname: parsedUrl.hostname,
        port: 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'PUT',
        headers: {
            'content-type': '',
            'content-length': responseBody.length
        }
    };

    return new Promise((resolve, reject) => {
        const request = https.request(options, (response) => {
            console.log(\`Status code: \${response.statusCode}\`);
            resolve();
        });
        
        request.on('error', (error) => {
            console.log(\`send(..) failed executing https.request(..):\`, error);
            reject(error);
        });
        
        request.write(responseBody);
        request.end();
    });
}

// Helper function to fetch JSON data
async function fetchJson(url, options) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const lib = urlObj.protocol === 'https:' ? https : http;
        
        const req = lib.request(url, {
            method: options.method || 'GET',
            headers: options.headers || {}
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(\`Invalid JSON response: \${e.message}\`));
                    }
                } else {
                    reject(new Error(\`HTTP error! status: \${res.statusCode}\`));
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

async function getAdminToken(adminSecretName) {
    console.log('Getting admin token from secret:', adminSecretName);
    
    const command = new GetSecretValueCommand({
        SecretId: adminSecretName
    });
    
    const response = await secretsManager.send(command);
    return response.SecretString;
}

async function retrieveToken(authentikHost, authentikApiToken, outpostName) {
    outpostName = outpostName || 'LDAP';
    
    try {
        // Fetch outpost instances from API
        const outpostInstancesUrl = new URL('/api/v3/outposts/instances/', authentikHost);
        outpostInstancesUrl.searchParams.append('name__iexact', outpostName);

        console.log('Fetching outpost instances from:', outpostInstancesUrl.toString());
        
        const outpostInstances = await fetchJson(outpostInstancesUrl.toString(), {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': \`Bearer \${authentikApiToken}\`
            }
        });

        // Check if we found the outpost
        const results = outpostInstances.results || [];
        if (results.length === 0) {
            throw new Error(\`Outpost with name \${outpostName} not found, aborting...\`);
        }

        // Extract the token identifier
        const outpost = results.find((item) => item.name === outpostName);
        if (!outpost || !outpost.token_identifier) {
            throw new Error(\`Token identifier for outpost \${outpostName} not found, aborting...\`);
        }

        const tokenIdentifier = outpost.token_identifier;
        console.log('Found token identifier:', tokenIdentifier);

        // Fetch the token
        const viewKeyUrl = new URL(\`/api/v3/core/tokens/\${tokenIdentifier}/view_key/\`, authentikHost);

        const viewKeyResult = await fetchJson(viewKeyUrl.toString(), {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': \`Bearer \${authentikApiToken}\`
            }
        });

        const outpostToken = viewKeyResult.key;
        if (!outpostToken) {
            throw new Error(\`Token for outpost \${outpostName} not found, aborting...\`);
        }

        return outpostToken;
    } catch (error) {
        console.error(\`Error retrieving token: \${error.message}\`);
        throw error;
    }
}

async function putLDAPSecret(secretName, secretValue) {
    console.log('Updating LDAP token secret:', secretName);
    
    const command = new PutSecretValueCommand({
        SecretId: secretName,
        SecretString: secretValue
    });
    
    try {
        await secretsManager.send(command);
        console.log('LDAP token secret updated successfully');
    } catch (error) {
        console.error('Error updating secret:', error);
        throw error;
    }
}

export const handler = async (event, context) => {
    console.log('Event:', JSON.stringify(event, null, 2));
    
    const { RequestType, ResourceProperties } = event;
    const { 
        Environment, 
        AuthentikHost, 
        OutpostName,
        AdminSecretName,
        LDAPSecretName
    } = ResourceProperties;
    
    try {
        if (RequestType === 'Create' || RequestType === 'Update') {
            console.log('Processing LDAP token retrieval...');
            console.log('Environment:', Environment);
            console.log('Authentik URL:', AuthentikHost);
            console.log('Outpost Name:', OutpostName);
            console.log('Admin Secret Name:', AdminSecretName);
            console.log('LDAP Secret Name:', LDAPSecretName);
            
            // Get the admin token from AWS Secrets Manager
            const adminToken = await getAdminToken(AdminSecretName);
            
            // Retrieve the LDAP token from Authentik
            const ldapToken = await retrieveToken(AuthentikHost, adminToken, OutpostName);
            
            // Store the LDAP token back in AWS Secrets Manager
            await putLDAPSecret(LDAPSecretName, ldapToken);
            
            await sendResponse(event, context, 'SUCCESS', {
                Message: 'LDAP token retrieved and updated successfully',
                LDAPToken: ldapToken.substring(0, 10) + '...' // Log only first 10 chars for security
            });
        } else if (RequestType === 'Delete') {
            console.log('Delete request - no action needed for LDAP token retrieval');
            await sendResponse(event, context, 'SUCCESS', {
                Message: 'Delete completed'
            });
        }
    } catch (error) {
        console.error('Error:', error);
        await sendResponse(event, context, 'FAILED', {
            Message: error.message
        });
    }
};
                    `)
                }
            }
        },

        // Custom resource to trigger the Lambda function
        UpdateLDAPTokenSecret: {
            Type: 'AWS::CloudFormation::CustomResource',
            Properties: {
                ServiceToken: cf.getAtt('UpdateLDAPTokenLambda', 'Arn'),
                Environment: cf.ref('Environment'),
                AuthentikHost: cf.ref('AuthentikHost'),
                OutpostName: cf.ref('OutpostName'),
                AdminSecretName: cf.join([cf.stackName, '/authentik-admin-token']),
                LDAPSecretName: cf.join([cf.stackName, '/authentik-ldap-token']),
                // Add a timestamp to force updates on every deployment
                UpdateTimestamp: cf.ref('GitSha')
            },
            DependsOn: [
                'UpdateLDAPTokenLambda',
                'UpdateLDAPTokenLambdaRole'
            ]
        },

        // Lambda permission for CloudFormation to invoke the function
        UpdateLDAPTokenLambdaPermission: {
            Type: 'AWS::Lambda::Permission',
            Properties: {
                FunctionName: cf.ref('UpdateLDAPTokenLambda'),
                Action: 'lambda:InvokeFunction',
                Principal: 'cloudformation.amazonaws.com'
            }
        }
    },

    Outputs: {
        UpdateSecretLambdaArn: {
            Description: 'ARN of the Lambda function that retrieves and updates LDAP tokens',
            Export: {
                Name: cf.join([cf.stackName, '-update-ldap-token-lambda-arn'])
            },
            Value: cf.getAtt('UpdateLDAPTokenLambda', 'Arn')
        },
        LDAPTokenRetrievalStatus: {
            Description: 'Status of the LDAP token retrieval and update process',
            Value: cf.ref('UpdateLDAPTokenSecret')
        }
    }
};
