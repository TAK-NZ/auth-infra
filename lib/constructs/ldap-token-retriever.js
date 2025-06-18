"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LdapTokenRetriever = void 0;
/**
 * LDAP Token Retriever Custom Resource Construct
 *
 * This construct creates a Lambda function that automatically retrieves
 * the LDAP outpost token from Authentik and stores it in AWS Secrets Manager.
 * This is necessary because the LDAP outpost needs the token to connect to Authentik,
 * but the token can only be retrieved after Authentik is fully running.
 */
const constructs_1 = require("constructs");
const aws_cdk_lib_1 = require("aws-cdk-lib");
/**
 * LDAP Token Retriever construct
 */
class LdapTokenRetriever extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        // Create CloudWatch log group for the Lambda function
        const logGroup = new aws_cdk_lib_1.aws_logs.LogGroup(this, 'LogGroup', {
            logGroupName: `/aws/lambda/TAK-${props.environment}-AuthInfra-update-ldap-token`,
            retention: props.config.monitoring.logRetentionDays,
            removalPolicy: props.config.general.removalPolicy
        });
        // Create IAM role for the Lambda function
        const lambdaRole = new aws_cdk_lib_1.aws_iam.Role(this, 'LambdaRole', {
            roleName: `TAK-${props.environment}-AuthInfra-update-ldap-token-lambda-role`,
            assumedBy: new aws_cdk_lib_1.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                aws_cdk_lib_1.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
            ],
            inlinePolicies: {
                SecretsManagerAccess: new aws_cdk_lib_1.aws_iam.PolicyDocument({
                    statements: [
                        new aws_cdk_lib_1.aws_iam.PolicyStatement({
                            effect: aws_cdk_lib_1.aws_iam.Effect.ALLOW,
                            actions: [
                                'secretsmanager:UpdateSecret',
                                'secretsmanager:PutSecretValue',
                                'secretsmanager:GetSecretValue'
                            ],
                            resources: [
                                props.token.adminTokenSecret.secretArn,
                                props.token.ldapTokenSecret.secretArn,
                                // Legacy secret patterns for backward compatibility
                                `arn:aws:secretsmanager:${aws_cdk_lib_1.Stack.of(this).region}:${aws_cdk_lib_1.Stack.of(this).account}:secret:coe-auth-*`,
                                `arn:aws:secretsmanager:${aws_cdk_lib_1.Stack.of(this).region}:${aws_cdk_lib_1.Stack.of(this).account}:secret:${props.environment}/authentik-admin-token*`,
                                `arn:aws:secretsmanager:${aws_cdk_lib_1.Stack.of(this).region}:${aws_cdk_lib_1.Stack.of(this).account}:secret:${props.environment}/authentik-ldap-token*`
                            ]
                        }),
                        new aws_cdk_lib_1.aws_iam.PolicyStatement({
                            effect: aws_cdk_lib_1.aws_iam.Effect.ALLOW,
                            actions: [
                                'kms:Encrypt',
                                'kms:Decrypt',
                                'kms:ReEncryptFrom',
                                'kms:ReEncryptTo',
                                'kms:GenerateDataKey',
                                'kms:GenerateDataKeyWithoutPlaintext',
                                'kms:DescribeKey'
                            ],
                            resources: [props.infrastructure.kmsKey.keyArn]
                        })
                    ]
                })
            }
        });
        // Create the Lambda function
        this.lambdaFunction = new aws_cdk_lib_1.aws_lambda.Function(this, 'Function', {
            functionName: `TAK-${props.environment}-AuthInfra-update-ldap-token`,
            runtime: aws_cdk_lib_1.aws_lambda.Runtime.NODEJS_22_X,
            handler: 'index.handler',
            role: lambdaRole,
            timeout: aws_cdk_lib_1.Duration.minutes(5),
            logGroup: logGroup,
            environment: {
                NODE_OPTIONS: '--enable-source-maps'
            },
            code: aws_cdk_lib_1.aws_lambda.Code.fromInline(`
const { SecretsManagerClient, GetSecretValueCommand, PutSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const https = require('https');
const http = require('http');
const { URL } = require('url');

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

exports.handler = async (event, context) => {
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
        });
        // Create the custom resource provider
        const provider = aws_cdk_lib_1.aws_lambda.Function.fromFunctionArn(this, 'Provider', this.lambdaFunction.functionArn);
        // Create the custom resource
        this.customResource = new aws_cdk_lib_1.CustomResource(this, 'Resource', {
            serviceToken: this.lambdaFunction.functionArn,
            properties: {
                Environment: props.environment,
                AuthentikHost: props.application.authentikHost,
                OutpostName: props.token.outpostName || 'LDAP',
                AdminSecretName: props.token.adminTokenSecret.secretName,
                LDAPSecretName: props.token.ldapTokenSecret.secretName,
                // Add a timestamp to force updates on every deployment
                UpdateTimestamp: props.deployment.gitSha
            }
        });
        // Add dependency to ensure the custom resource runs after the secrets are created
        this.customResource.node.addDependency(props.token.adminTokenSecret);
        this.customResource.node.addDependency(props.token.ldapTokenSecret);
        // Add dependency to ensure the custom resource runs after ECS services are deployed
        this.customResource.node.addDependency(props.token.authentikServerService);
        this.customResource.node.addDependency(props.token.authentikWorkerService);
    }
}
exports.LdapTokenRetriever = LdapTokenRetriever;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGRhcC10b2tlbi1yZXRyaWV2ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJsZGFwLXRva2VuLXJldHJpZXZlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQTs7Ozs7OztHQU9HO0FBQ0gsMkNBQXVDO0FBQ3ZDLDZDQVlxQjtBQXVDckI7O0dBRUc7QUFDSCxNQUFhLGtCQUFtQixTQUFRLHNCQUFTO0lBVy9DLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBOEI7UUFDdEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixzREFBc0Q7UUFDdEQsTUFBTSxRQUFRLEdBQUcsSUFBSSxzQkFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFO1lBQ25ELFlBQVksRUFBRSxtQkFBbUIsS0FBSyxDQUFDLFdBQVcsOEJBQThCO1lBQ2hGLFNBQVMsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0I7WUFDbkQsYUFBYSxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLGFBQWE7U0FDbEQsQ0FBQyxDQUFDO1FBRUgsMENBQTBDO1FBQzFDLE1BQU0sVUFBVSxHQUFHLElBQUkscUJBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNsRCxRQUFRLEVBQUUsT0FBTyxLQUFLLENBQUMsV0FBVywwQ0FBMEM7WUFDNUUsU0FBUyxFQUFFLElBQUkscUJBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxzQkFBc0IsQ0FBQztZQUMzRCxlQUFlLEVBQUU7Z0JBQ2YscUJBQUcsQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQUMsMENBQTBDLENBQUM7YUFDdkY7WUFDRCxjQUFjLEVBQUU7Z0JBQ2Qsb0JBQW9CLEVBQUUsSUFBSSxxQkFBRyxDQUFDLGNBQWMsQ0FBQztvQkFDM0MsVUFBVSxFQUFFO3dCQUNWLElBQUkscUJBQUcsQ0FBQyxlQUFlLENBQUM7NEJBQ3RCLE1B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S0FBSyxDQUFDLFdBQVcsQ0FBQyxhQUFhO2dCQUM5QyxXQUFXLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxXQUFXLElBQUksTUFBTTtnQkFDOUMsZUFBZSxFQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsVUFBVTtnQkFDeEQsY0FBYyxFQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLFVBQVU7Z0JBQ3RELHVEQUF1RDtnQkFDdkQsZUFBZSxFQUFFLEtBQUssQ0FBQyxVQUFVLENBQUMsTUFBTTthQUN6QztTQUNGLENBQUMsQ0FBQztRQUVILGtGQUFrRjtRQUNsRixJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ3JFLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBRXBFLG9GQUFvRjtRQUNwRixJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1FBQzNFLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLHNCQUFzQixDQUFDLENBQUM7SUFDN0UsQ0FBQztDQUNGO0FBelRELGdEQXlUQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogTERBUCBUb2tlbiBSZXRyaWV2ZXIgQ3VzdG9tIFJlc291cmNlIENvbnN0cnVjdFxuICogXG4gKiBUaGlzIGNvbnN0cnVjdCBjcmVhdGVzIGEgTGFtYmRhIGZ1bmN0aW9uIHRoYXQgYXV0b21hdGljYWxseSByZXRyaWV2ZXNcbiAqIHRoZSBMREFQIG91dHBvc3QgdG9rZW4gZnJvbSBBdXRoZW50aWsgYW5kIHN0b3JlcyBpdCBpbiBBV1MgU2VjcmV0cyBNYW5hZ2VyLlxuICogVGhpcyBpcyBuZWNlc3NhcnkgYmVjYXVzZSB0aGUgTERBUCBvdXRwb3N0IG5lZWRzIHRoZSB0b2tlbiB0byBjb25uZWN0IHRvIEF1dGhlbnRpayxcbiAqIGJ1dCB0aGUgdG9rZW4gY2FuIG9ubHkgYmUgcmV0cmlldmVkIGFmdGVyIEF1dGhlbnRpayBpcyBmdWxseSBydW5uaW5nLlxuICovXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7XG4gIGF3c19sYW1iZGEgYXMgbGFtYmRhLFxuICBhd3NfaWFtIGFzIGlhbSxcbiAgYXdzX2xvZ3MgYXMgbG9ncyxcbiAgYXdzX3NlY3JldHNtYW5hZ2VyIGFzIHNlY3JldHNtYW5hZ2VyLFxuICBhd3Nfa21zIGFzIGttcyxcbiAgYXdzX2VjcyBhcyBlY3MsXG4gIEN1c3RvbVJlc291cmNlLFxuICBEdXJhdGlvbixcbiAgUmVtb3ZhbFBvbGljeSxcbiAgU3RhY2ssXG4gIEZuXG59IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB0eXBlIHsgQXV0aEluZnJhRW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuLi9lbnZpcm9ubWVudC1jb25maWcnO1xuaW1wb3J0IHR5cGUgeyBJbmZyYXN0cnVjdHVyZUNvbmZpZywgRGVwbG95bWVudENvbmZpZywgVG9rZW5Db25maWcsIEF1dGhlbnRpa0FwcGxpY2F0aW9uQ29uZmlnIH0gZnJvbSAnLi4vY29uc3RydWN0LWNvbmZpZ3MnO1xuXG4vKipcbiAqIFByb3BlcnRpZXMgZm9yIHRoZSBMREFQIFRva2VuIFJldHJpZXZlciBjb25zdHJ1Y3RcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBMZGFwVG9rZW5SZXRyaWV2ZXJQcm9wcyB7XG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBuYW1lIChlLmcuICdwcm9kJywgJ2RldicsIGV0Yy4pXG4gICAqL1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBjb25maWd1cmF0aW9uXG4gICAqL1xuICBjb25maWc6IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnO1xuXG4gIC8qKlxuICAgKiBJbmZyYXN0cnVjdHVyZSBjb25maWd1cmF0aW9uIChLTVMga2V5KVxuICAgKi9cbiAgaW5mcmFzdHJ1Y3R1cmU6IEluZnJhc3RydWN0dXJlQ29uZmlnO1xuXG4gIC8qKlxuICAgKiBEZXBsb3ltZW50IGNvbmZpZ3VyYXRpb24gKEdpdCBTSEEpXG4gICAqL1xuICBkZXBsb3ltZW50OiBEZXBsb3ltZW50Q29uZmlnO1xuXG4gIC8qKlxuICAgKiBUb2tlbiBjb25maWd1cmF0aW9uIChzZWNyZXRzLCBzZXJ2aWNlcywgb3V0cG9zdCBuYW1lKVxuICAgKi9cbiAgdG9rZW46IFRva2VuQ29uZmlnO1xuXG4gIC8qKlxuICAgKiBBcHBsaWNhdGlvbiBjb25maWd1cmF0aW9uIChBdXRoZW50aWsgaG9zdClcbiAgICovXG4gIGFwcGxpY2F0aW9uOiBBdXRoZW50aWtBcHBsaWNhdGlvbkNvbmZpZztcbn1cblxuLyoqXG4gKiBMREFQIFRva2VuIFJldHJpZXZlciBjb25zdHJ1Y3RcbiAqL1xuZXhwb3J0IGNsYXNzIExkYXBUb2tlblJldHJpZXZlciBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBUaGUgTGFtYmRhIGZ1bmN0aW9uIHRoYXQgcmV0cmlldmVzIExEQVAgdG9rZW5zXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgbGFtYmRhRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcblxuICAvKipcbiAgICogVGhlIGN1c3RvbSByZXNvdXJjZSB0aGF0IHRyaWdnZXJzIHRoZSBMYW1iZGFcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBjdXN0b21SZXNvdXJjZTogQ3VzdG9tUmVzb3VyY2U7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IExkYXBUb2tlblJldHJpZXZlclByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIC8vIENyZWF0ZSBDbG91ZFdhdGNoIGxvZyBncm91cCBmb3IgdGhlIExhbWJkYSBmdW5jdGlvblxuICAgIGNvbnN0IGxvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0xvZ0dyb3VwJywge1xuICAgICAgbG9nR3JvdXBOYW1lOiBgL2F3cy9sYW1iZGEvVEFLLSR7cHJvcHMuZW52aXJvbm1lbnR9LUF1dGhJbmZyYS11cGRhdGUtbGRhcC10b2tlbmAsXG4gICAgICByZXRlbnRpb246IHByb3BzLmNvbmZpZy5tb25pdG9yaW5nLmxvZ1JldGVudGlvbkRheXMsXG4gICAgICByZW1vdmFsUG9saWN5OiBwcm9wcy5jb25maWcuZ2VuZXJhbC5yZW1vdmFsUG9saWN5XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgSUFNIHJvbGUgZm9yIHRoZSBMYW1iZGEgZnVuY3Rpb25cbiAgICBjb25zdCBsYW1iZGFSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdMYW1iZGFSb2xlJywge1xuICAgICAgcm9sZU5hbWU6IGBUQUstJHtwcm9wcy5lbnZpcm9ubWVudH0tQXV0aEluZnJhLXVwZGF0ZS1sZGFwLXRva2VuLWxhbWJkYS1yb2xlYCxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScpXG4gICAgICBdLFxuICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgU2VjcmV0c01hbmFnZXJBY2Nlc3M6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOlVwZGF0ZVNlY3JldCcsXG4gICAgICAgICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOlB1dFNlY3JldFZhbHVlJyxcbiAgICAgICAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6R2V0U2VjcmV0VmFsdWUnXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICAgIHByb3BzLnRva2VuLmFkbWluVG9rZW5TZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgICAgICAgICAgIHByb3BzLnRva2VuLmxkYXBUb2tlblNlY3JldC5zZWNyZXRBcm4sXG4gICAgICAgICAgICAgICAgLy8gTGVnYWN5IHNlY3JldCBwYXR0ZXJucyBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuICAgICAgICAgICAgICAgIGBhcm46YXdzOnNlY3JldHNtYW5hZ2VyOiR7U3RhY2sub2YodGhpcykucmVnaW9ufToke1N0YWNrLm9mKHRoaXMpLmFjY291bnR9OnNlY3JldDpjb2UtYXV0aC0qYCxcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpzZWNyZXRzbWFuYWdlcjoke1N0YWNrLm9mKHRoaXMpLnJlZ2lvbn06JHtTdGFjay5vZih0aGlzKS5hY2NvdW50fTpzZWNyZXQ6JHtwcm9wcy5lbnZpcm9ubWVudH0vYXV0aGVudGlrLWFkbWluLXRva2VuKmAsXG4gICAgICAgICAgICAgICAgYGFybjphd3M6c2VjcmV0c21hbmFnZXI6JHtTdGFjay5vZih0aGlzKS5yZWdpb259OiR7U3RhY2sub2YodGhpcykuYWNjb3VudH06c2VjcmV0OiR7cHJvcHMuZW52aXJvbm1lbnR9L2F1dGhlbnRpay1sZGFwLXRva2VuKmBcbiAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdrbXM6RW5jcnlwdCcsXG4gICAgICAgICAgICAgICAgJ2ttczpEZWNyeXB0JyxcbiAgICAgICAgICAgICAgICAna21zOlJlRW5jcnlwdEZyb20nLFxuICAgICAgICAgICAgICAgICdrbXM6UmVFbmNyeXB0VG8nLFxuICAgICAgICAgICAgICAgICdrbXM6R2VuZXJhdGVEYXRhS2V5JyxcbiAgICAgICAgICAgICAgICAna21zOkdlbmVyYXRlRGF0YUtleVdpdGhvdXRQbGFpbnRleHQnLFxuICAgICAgICAgICAgICAgICdrbXM6RGVzY3JpYmVLZXknXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW3Byb3BzLmluZnJhc3RydWN0dXJlLmttc0tleS5rZXlBcm5dXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIF1cbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSB0aGUgTGFtYmRhIGZ1bmN0aW9uXG4gICAgdGhpcy5sYW1iZGFGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0Z1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgVEFLLSR7cHJvcHMuZW52aXJvbm1lbnR9LUF1dGhJbmZyYS11cGRhdGUtbGRhcC10b2tlbmAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgbG9nR3JvdXA6IGxvZ0dyb3VwLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgTk9ERV9PUFRJT05TOiAnLS1lbmFibGUtc291cmNlLW1hcHMnXG4gICAgICB9LFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUlubGluZShgXG5jb25zdCB7IFNlY3JldHNNYW5hZ2VyQ2xpZW50LCBHZXRTZWNyZXRWYWx1ZUNvbW1hbmQsIFB1dFNlY3JldFZhbHVlQ29tbWFuZCB9ID0gcmVxdWlyZSgnQGF3cy1zZGsvY2xpZW50LXNlY3JldHMtbWFuYWdlcicpO1xuY29uc3QgaHR0cHMgPSByZXF1aXJlKCdodHRwcycpO1xuY29uc3QgaHR0cCA9IHJlcXVpcmUoJ2h0dHAnKTtcbmNvbnN0IHsgVVJMIH0gPSByZXF1aXJlKCd1cmwnKTtcblxuY29uc3Qgc2VjcmV0c01hbmFnZXIgPSBuZXcgU2VjcmV0c01hbmFnZXJDbGllbnQoe30pO1xuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gc2VuZCBDbG91ZEZvcm1hdGlvbiByZXNwb25zZVxuYXN5bmMgZnVuY3Rpb24gc2VuZFJlc3BvbnNlKGV2ZW50LCBjb250ZXh0LCByZXNwb25zZVN0YXR1cywgcmVzcG9uc2VEYXRhID0ge30sIHBoeXNpY2FsUmVzb3VyY2VJZCA9IG51bGwpIHtcbiAgICBjb25zdCByZXNwb25zZUJvZHkgPSBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIFN0YXR1czogcmVzcG9uc2VTdGF0dXMsXG4gICAgICAgIFJlYXNvbjogXFxgU2VlIHRoZSBkZXRhaWxzIGluIENsb3VkV2F0Y2ggTG9nIFN0cmVhbTogXFwke2NvbnRleHQubG9nU3RyZWFtTmFtZX1cXGAsXG4gICAgICAgIFBoeXNpY2FsUmVzb3VyY2VJZDogcGh5c2ljYWxSZXNvdXJjZUlkIHx8IGNvbnRleHQubG9nU3RyZWFtTmFtZSxcbiAgICAgICAgU3RhY2tJZDogZXZlbnQuU3RhY2tJZCxcbiAgICAgICAgUmVxdWVzdElkOiBldmVudC5SZXF1ZXN0SWQsXG4gICAgICAgIExvZ2ljYWxSZXNvdXJjZUlkOiBldmVudC5Mb2dpY2FsUmVzb3VyY2VJZCxcbiAgICAgICAgRGF0YTogcmVzcG9uc2VEYXRhXG4gICAgfSk7XG5cbiAgICBjb25zdCBwYXJzZWRVcmwgPSBuZXcgVVJMKGV2ZW50LlJlc3BvbnNlVVJMKTtcbiAgICBjb25zdCBvcHRpb25zID0ge1xuICAgICAgICBob3N0bmFtZTogcGFyc2VkVXJsLmhvc3RuYW1lLFxuICAgICAgICBwb3J0OiA0NDMsXG4gICAgICAgIHBhdGg6IHBhcnNlZFVybC5wYXRobmFtZSArIHBhcnNlZFVybC5zZWFyY2gsXG4gICAgICAgIG1ldGhvZDogJ1BVVCcsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICdjb250ZW50LXR5cGUnOiAnJyxcbiAgICAgICAgICAgICdjb250ZW50LWxlbmd0aCc6IHJlc3BvbnNlQm9keS5sZW5ndGhcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICBjb25zdCByZXF1ZXN0ID0gaHR0cHMucmVxdWVzdChvcHRpb25zLCAocmVzcG9uc2UpID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFxcYFN0YXR1cyBjb2RlOiBcXCR7cmVzcG9uc2Uuc3RhdHVzQ29kZX1cXGApO1xuICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIHJlcXVlc3Qub24oJ2Vycm9yJywgKGVycm9yKSA9PiB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcXGBzZW5kKC4uKSBmYWlsZWQgZXhlY3V0aW5nIGh0dHBzLnJlcXVlc3QoLi4pOlxcYCwgZXJyb3IpO1xuICAgICAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICByZXF1ZXN0LndyaXRlKHJlc3BvbnNlQm9keSk7XG4gICAgICAgIHJlcXVlc3QuZW5kKCk7XG4gICAgfSk7XG59XG5cbi8vIEhlbHBlciBmdW5jdGlvbiB0byBmZXRjaCBKU09OIGRhdGFcbmFzeW5jIGZ1bmN0aW9uIGZldGNoSnNvbih1cmwsIG9wdGlvbnMpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICBjb25zdCB1cmxPYmogPSBuZXcgVVJMKHVybCk7XG4gICAgICAgIGNvbnN0IGxpYiA9IHVybE9iai5wcm90b2NvbCA9PT0gJ2h0dHBzOicgPyBodHRwcyA6IGh0dHA7XG4gICAgICAgIFxuICAgICAgICBjb25zdCByZXEgPSBsaWIucmVxdWVzdCh1cmwsIHtcbiAgICAgICAgICAgIG1ldGhvZDogb3B0aW9ucy5tZXRob2QgfHwgJ0dFVCcsXG4gICAgICAgICAgICBoZWFkZXJzOiBvcHRpb25zLmhlYWRlcnMgfHwge31cbiAgICAgICAgfSwgKHJlcykgPT4ge1xuICAgICAgICAgICAgbGV0IGRhdGEgPSAnJztcbiAgICAgICAgICAgIHJlcy5vbignZGF0YScsIGNodW5rID0+IGRhdGEgKz0gY2h1bmspO1xuICAgICAgICAgICAgcmVzLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID49IDIwMCAmJiByZXMuc3RhdHVzQ29kZSA8IDMwMCkge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShKU09OLnBhcnNlKGRhdGEpKTtcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihcXGBJbnZhbGlkIEpTT04gcmVzcG9uc2U6IFxcJHtlLm1lc3NhZ2V9XFxgKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKFxcYEhUVFAgZXJyb3IhIHN0YXR1czogXFwke3Jlcy5zdGF0dXNDb2RlfVxcYCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIHJlcS5vbignZXJyb3InLCByZWplY3QpO1xuICAgICAgICByZXEuZW5kKCk7XG4gICAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldEFkbWluVG9rZW4oYWRtaW5TZWNyZXROYW1lKSB7XG4gICAgY29uc29sZS5sb2coJ0dldHRpbmcgYWRtaW4gdG9rZW4gZnJvbSBzZWNyZXQ6JywgYWRtaW5TZWNyZXROYW1lKTtcbiAgICBcbiAgICBjb25zdCBjb21tYW5kID0gbmV3IEdldFNlY3JldFZhbHVlQ29tbWFuZCh7XG4gICAgICAgIFNlY3JldElkOiBhZG1pblNlY3JldE5hbWVcbiAgICB9KTtcbiAgICBcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHNlY3JldHNNYW5hZ2VyLnNlbmQoY29tbWFuZCk7XG4gICAgcmV0dXJuIHJlc3BvbnNlLlNlY3JldFN0cmluZztcbn1cblxuYXN5bmMgZnVuY3Rpb24gcmV0cmlldmVUb2tlbihhdXRoZW50aWtIb3N0LCBhdXRoZW50aWtBcGlUb2tlbiwgb3V0cG9zdE5hbWUpIHtcbiAgICBvdXRwb3N0TmFtZSA9IG91dHBvc3ROYW1lIHx8ICdMREFQJztcbiAgICBcbiAgICB0cnkge1xuICAgICAgICAvLyBGZXRjaCBvdXRwb3N0IGluc3RhbmNlcyBmcm9tIEFQSVxuICAgICAgICBjb25zdCBvdXRwb3N0SW5zdGFuY2VzVXJsID0gbmV3IFVSTCgnL2FwaS92My9vdXRwb3N0cy9pbnN0YW5jZXMvJywgYXV0aGVudGlrSG9zdCk7XG4gICAgICAgIG91dHBvc3RJbnN0YW5jZXNVcmwuc2VhcmNoUGFyYW1zLmFwcGVuZCgnbmFtZV9faWV4YWN0Jywgb3V0cG9zdE5hbWUpO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKCdGZXRjaGluZyBvdXRwb3N0IGluc3RhbmNlcyBmcm9tOicsIG91dHBvc3RJbnN0YW5jZXNVcmwudG9TdHJpbmcoKSk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBvdXRwb3N0SW5zdGFuY2VzID0gYXdhaXQgZmV0Y2hKc29uKG91dHBvc3RJbnN0YW5jZXNVcmwudG9TdHJpbmcoKSwge1xuICAgICAgICAgICAgbWV0aG9kOiAnR0VUJyxcbiAgICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICAgICAgICdBdXRob3JpemF0aW9uJzogXFxgQmVhcmVyIFxcJHthdXRoZW50aWtBcGlUb2tlbn1cXGBcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgd2UgZm91bmQgdGhlIG91dHBvc3RcbiAgICAgICAgY29uc3QgcmVzdWx0cyA9IG91dHBvc3RJbnN0YW5jZXMucmVzdWx0cyB8fCBbXTtcbiAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXFxgT3V0cG9zdCB3aXRoIG5hbWUgXFwke291dHBvc3ROYW1lfSBub3QgZm91bmQsIGFib3J0aW5nLi4uXFxgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEV4dHJhY3QgdGhlIHRva2VuIGlkZW50aWZpZXJcbiAgICAgICAgY29uc3Qgb3V0cG9zdCA9IHJlc3VsdHMuZmluZCgoaXRlbSkgPT4gaXRlbS5uYW1lID09PSBvdXRwb3N0TmFtZSk7XG4gICAgICAgIGlmICghb3V0cG9zdCB8fCAhb3V0cG9zdC50b2tlbl9pZGVudGlmaWVyKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXFxgVG9rZW4gaWRlbnRpZmllciBmb3Igb3V0cG9zdCBcXCR7b3V0cG9zdE5hbWV9IG5vdCBmb3VuZCwgYWJvcnRpbmcuLi5cXGApO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdG9rZW5JZGVudGlmaWVyID0gb3V0cG9zdC50b2tlbl9pZGVudGlmaWVyO1xuICAgICAgICBjb25zb2xlLmxvZygnRm91bmQgdG9rZW4gaWRlbnRpZmllcjonLCB0b2tlbklkZW50aWZpZXIpO1xuXG4gICAgICAgIC8vIEZldGNoIHRoZSB0b2tlblxuICAgICAgICBjb25zdCB2aWV3S2V5VXJsID0gbmV3IFVSTChcXGAvYXBpL3YzL2NvcmUvdG9rZW5zL1xcJHt0b2tlbklkZW50aWZpZXJ9L3ZpZXdfa2V5L1xcYCwgYXV0aGVudGlrSG9zdCk7XG5cbiAgICAgICAgY29uc3Qgdmlld0tleVJlc3VsdCA9IGF3YWl0IGZldGNoSnNvbih2aWV3S2V5VXJsLnRvU3RyaW5nKCksIHtcbiAgICAgICAgICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAgICAgJ0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAgICAgICAnQXV0aG9yaXphdGlvbic6IFxcYEJlYXJlciBcXCR7YXV0aGVudGlrQXBpVG9rZW59XFxgXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IG91dHBvc3RUb2tlbiA9IHZpZXdLZXlSZXN1bHQua2V5O1xuICAgICAgICBpZiAoIW91dHBvc3RUb2tlbikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxcYFRva2VuIGZvciBvdXRwb3N0IFxcJHtvdXRwb3N0TmFtZX0gbm90IGZvdW5kLCBhYm9ydGluZy4uLlxcYCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gb3V0cG9zdFRva2VuO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXFxgRXJyb3IgcmV0cmlldmluZyB0b2tlbjogXFwke2Vycm9yLm1lc3NhZ2V9XFxgKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBwdXRMREFQU2VjcmV0KHNlY3JldE5hbWUsIHNlY3JldFZhbHVlKSB7XG4gICAgY29uc29sZS5sb2coJ1VwZGF0aW5nIExEQVAgdG9rZW4gc2VjcmV0OicsIHNlY3JldE5hbWUpO1xuICAgIFxuICAgIGNvbnN0IGNvbW1hbmQgPSBuZXcgUHV0U2VjcmV0VmFsdWVDb21tYW5kKHtcbiAgICAgICAgU2VjcmV0SWQ6IHNlY3JldE5hbWUsXG4gICAgICAgIFNlY3JldFN0cmluZzogc2VjcmV0VmFsdWVcbiAgICB9KTtcbiAgICBcbiAgICB0cnkge1xuICAgICAgICBhd2FpdCBzZWNyZXRzTWFuYWdlci5zZW5kKGNvbW1hbmQpO1xuICAgICAgICBjb25zb2xlLmxvZygnTERBUCB0b2tlbiBzZWNyZXQgdXBkYXRlZCBzdWNjZXNzZnVsbHknKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciB1cGRhdGluZyBzZWNyZXQ6JywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG59XG5cbmV4cG9ydHMuaGFuZGxlciA9IGFzeW5jIChldmVudCwgY29udGV4dCkgPT4ge1xuICAgIGNvbnNvbGUubG9nKCdFdmVudDonLCBKU09OLnN0cmluZ2lmeShldmVudCwgbnVsbCwgMikpO1xuICAgIFxuICAgIGNvbnN0IHsgUmVxdWVzdFR5cGUsIFJlc291cmNlUHJvcGVydGllcyB9ID0gZXZlbnQ7XG4gICAgY29uc3QgeyBcbiAgICAgICAgRW52aXJvbm1lbnQsIFxuICAgICAgICBBdXRoZW50aWtIb3N0LCBcbiAgICAgICAgT3V0cG9zdE5hbWUsXG4gICAgICAgIEFkbWluU2VjcmV0TmFtZSxcbiAgICAgICAgTERBUFNlY3JldE5hbWVcbiAgICB9ID0gUmVzb3VyY2VQcm9wZXJ0aWVzO1xuICAgIFxuICAgIHRyeSB7XG4gICAgICAgIGlmIChSZXF1ZXN0VHlwZSA9PT0gJ0NyZWF0ZScgfHwgUmVxdWVzdFR5cGUgPT09ICdVcGRhdGUnKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnUHJvY2Vzc2luZyBMREFQIHRva2VuIHJldHJpZXZhbC4uLicpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ0Vudmlyb25tZW50OicsIEVudmlyb25tZW50KTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdBdXRoZW50aWsgVVJMOicsIEF1dGhlbnRpa0hvc3QpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ091dHBvc3QgTmFtZTonLCBPdXRwb3N0TmFtZSk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnQWRtaW4gU2VjcmV0IE5hbWU6JywgQWRtaW5TZWNyZXROYW1lKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdMREFQIFNlY3JldCBOYW1lOicsIExEQVBTZWNyZXROYW1lKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gR2V0IHRoZSBhZG1pbiB0b2tlbiBmcm9tIEFXUyBTZWNyZXRzIE1hbmFnZXJcbiAgICAgICAgICAgIGNvbnN0IGFkbWluVG9rZW4gPSBhd2FpdCBnZXRBZG1pblRva2VuKEFkbWluU2VjcmV0TmFtZSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIFJldHJpZXZlIHRoZSBMREFQIHRva2VuIGZyb20gQXV0aGVudGlrXG4gICAgICAgICAgICBjb25zdCBsZGFwVG9rZW4gPSBhd2FpdCByZXRyaWV2ZVRva2VuKEF1dGhlbnRpa0hvc3QsIGFkbWluVG9rZW4sIE91dHBvc3ROYW1lKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gU3RvcmUgdGhlIExEQVAgdG9rZW4gYmFjayBpbiBBV1MgU2VjcmV0cyBNYW5hZ2VyXG4gICAgICAgICAgICBhd2FpdCBwdXRMREFQU2VjcmV0KExEQVBTZWNyZXROYW1lLCBsZGFwVG9rZW4pO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBhd2FpdCBzZW5kUmVzcG9uc2UoZXZlbnQsIGNvbnRleHQsICdTVUNDRVNTJywge1xuICAgICAgICAgICAgICAgIE1lc3NhZ2U6ICdMREFQIHRva2VuIHJldHJpZXZlZCBhbmQgdXBkYXRlZCBzdWNjZXNzZnVsbHknLFxuICAgICAgICAgICAgICAgIExEQVBUb2tlbjogbGRhcFRva2VuLnN1YnN0cmluZygwLCAxMCkgKyAnLi4uJyAvLyBMb2cgb25seSBmaXJzdCAxMCBjaGFycyBmb3Igc2VjdXJpdHlcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2UgaWYgKFJlcXVlc3RUeXBlID09PSAnRGVsZXRlJykge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ0RlbGV0ZSByZXF1ZXN0IC0gbm8gYWN0aW9uIG5lZWRlZCBmb3IgTERBUCB0b2tlbiByZXRyaWV2YWwnKTtcbiAgICAgICAgICAgIGF3YWl0IHNlbmRSZXNwb25zZShldmVudCwgY29udGV4dCwgJ1NVQ0NFU1MnLCB7XG4gICAgICAgICAgICAgICAgTWVzc2FnZTogJ0RlbGV0ZSBjb21wbGV0ZWQnXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yOicsIGVycm9yKTtcbiAgICAgICAgYXdhaXQgc2VuZFJlc3BvbnNlKGV2ZW50LCBjb250ZXh0LCAnRkFJTEVEJywge1xuICAgICAgICAgICAgTWVzc2FnZTogZXJyb3IubWVzc2FnZVxuICAgICAgICB9KTtcbiAgICB9XG59O1xuICAgICAgYClcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSB0aGUgY3VzdG9tIHJlc291cmNlIHByb3ZpZGVyXG4gICAgY29uc3QgcHJvdmlkZXIgPSBsYW1iZGEuRnVuY3Rpb24uZnJvbUZ1bmN0aW9uQXJuKHRoaXMsICdQcm92aWRlcicsIHRoaXMubGFtYmRhRnVuY3Rpb24uZnVuY3Rpb25Bcm4pO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBjdXN0b20gcmVzb3VyY2VcbiAgICB0aGlzLmN1c3RvbVJlc291cmNlID0gbmV3IEN1c3RvbVJlc291cmNlKHRoaXMsICdSZXNvdXJjZScsIHtcbiAgICAgIHNlcnZpY2VUb2tlbjogdGhpcy5sYW1iZGFGdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgRW52aXJvbm1lbnQ6IHByb3BzLmVudmlyb25tZW50LFxuICAgICAgICBBdXRoZW50aWtIb3N0OiBwcm9wcy5hcHBsaWNhdGlvbi5hdXRoZW50aWtIb3N0LFxuICAgICAgICBPdXRwb3N0TmFtZTogcHJvcHMudG9rZW4ub3V0cG9zdE5hbWUgfHwgJ0xEQVAnLFxuICAgICAgICBBZG1pblNlY3JldE5hbWU6IHByb3BzLnRva2VuLmFkbWluVG9rZW5TZWNyZXQuc2VjcmV0TmFtZSxcbiAgICAgICAgTERBUFNlY3JldE5hbWU6IHByb3BzLnRva2VuLmxkYXBUb2tlblNlY3JldC5zZWNyZXROYW1lLFxuICAgICAgICAvLyBBZGQgYSB0aW1lc3RhbXAgdG8gZm9yY2UgdXBkYXRlcyBvbiBldmVyeSBkZXBsb3ltZW50XG4gICAgICAgIFVwZGF0ZVRpbWVzdGFtcDogcHJvcHMuZGVwbG95bWVudC5naXRTaGFcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEFkZCBkZXBlbmRlbmN5IHRvIGVuc3VyZSB0aGUgY3VzdG9tIHJlc291cmNlIHJ1bnMgYWZ0ZXIgdGhlIHNlY3JldHMgYXJlIGNyZWF0ZWRcbiAgICB0aGlzLmN1c3RvbVJlc291cmNlLm5vZGUuYWRkRGVwZW5kZW5jeShwcm9wcy50b2tlbi5hZG1pblRva2VuU2VjcmV0KTtcbiAgICB0aGlzLmN1c3RvbVJlc291cmNlLm5vZGUuYWRkRGVwZW5kZW5jeShwcm9wcy50b2tlbi5sZGFwVG9rZW5TZWNyZXQpO1xuICAgIFxuICAgIC8vIEFkZCBkZXBlbmRlbmN5IHRvIGVuc3VyZSB0aGUgY3VzdG9tIHJlc291cmNlIHJ1bnMgYWZ0ZXIgRUNTIHNlcnZpY2VzIGFyZSBkZXBsb3llZFxuICAgIHRoaXMuY3VzdG9tUmVzb3VyY2Uubm9kZS5hZGREZXBlbmRlbmN5KHByb3BzLnRva2VuLmF1dGhlbnRpa1NlcnZlclNlcnZpY2UpO1xuICAgIHRoaXMuY3VzdG9tUmVzb3VyY2Uubm9kZS5hZGREZXBlbmRlbmN5KHByb3BzLnRva2VuLmF1dGhlbnRpa1dvcmtlclNlcnZpY2UpO1xuICB9XG59XG4iXX0=