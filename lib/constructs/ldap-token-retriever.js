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
            logGroupName: `/aws/lambda/${props.environment}-update-ldap-token`,
            retention: props.config.monitoring.logRetentionDays,
            removalPolicy: props.config.general.removalPolicy
        });
        // Create IAM role for the Lambda function
        const lambdaRole = new aws_cdk_lib_1.aws_iam.Role(this, 'LambdaRole', {
            roleName: `${props.environment}-update-ldap-token-lambda-role`,
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
                                props.adminTokenSecret.secretArn,
                                props.ldapTokenSecret.secretArn,
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
                            resources: [props.kmsKey.keyArn]
                        })
                    ]
                })
            }
        });
        // Create the Lambda function
        this.lambdaFunction = new aws_cdk_lib_1.aws_lambda.Function(this, 'Function', {
            functionName: `${props.environment}-update-ldap-token`,
            runtime: aws_cdk_lib_1.aws_lambda.Runtime.NODEJS_22_X,
            handler: 'index.handler',
            role: lambdaRole,
            timeout: aws_cdk_lib_1.Duration.minutes(5),
            logGroup: logGroup,
            environment: {
                NODE_OPTIONS: '--enable-source-maps'
            },
            code: aws_cdk_lib_1.aws_lambda.Code.fromInline(`
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
        });
        // Create the custom resource provider
        const provider = aws_cdk_lib_1.aws_lambda.Function.fromFunctionArn(this, 'Provider', this.lambdaFunction.functionArn);
        // Create the custom resource
        this.customResource = new aws_cdk_lib_1.CustomResource(this, 'Resource', {
            serviceToken: this.lambdaFunction.functionArn,
            properties: {
                Environment: props.environment,
                AuthentikHost: props.authentikHost,
                OutpostName: props.outpostName || 'LDAP',
                AdminSecretName: props.adminTokenSecret.secretName,
                LDAPSecretName: props.ldapTokenSecret.secretName,
                // Add a timestamp to force updates on every deployment
                UpdateTimestamp: props.gitSha
            }
        });
        // Add dependency to ensure the custom resource runs after the secrets are created
        this.customResource.node.addDependency(props.adminTokenSecret);
        this.customResource.node.addDependency(props.ldapTokenSecret);
    }
}
exports.LdapTokenRetriever = LdapTokenRetriever;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGRhcC10b2tlbi1yZXRyaWV2ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJsZGFwLXRva2VuLXJldHJpZXZlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQTs7Ozs7OztHQU9HO0FBQ0gsMkNBQXVDO0FBQ3ZDLDZDQVdxQjtBQWdEckI7O0dBRUc7QUFDSCxNQUFhLGtCQUFtQixTQUFRLHNCQUFTO0lBVy9DLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBOEI7UUFDdEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixzREFBc0Q7UUFDdEQsTUFBTSxRQUFRLEdBQUcsSUFBSSxzQkFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFO1lBQ25ELFlBQVksRUFBRSxlQUFlLEtBQUssQ0FBQyxXQUFXLG9CQUFvQjtZQUNsRSxTQUFTLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsZ0JBQWdCO1lBQ25ELGFBQWEsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhO1NBQ2xELENBQUMsQ0FBQztRQUVILDBDQUEwQztRQUMxQyxNQUFNLFVBQVUsR0FBRyxJQUFJLHFCQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDbEQsUUFBUSxFQUFFLEdBQUcsS0FBSyxDQUFDLFdBQVcsZ0NBQWdDO1lBQzlELFNBQVMsRUFBRSxJQUFJLHFCQUFHLENBQUMsZ0JBQWdCLENBQUMsc0JBQXNCLENBQUM7WUFDM0QsZUFBZSxFQUFFO2dCQUNmLHFCQUFHLENBQUMsYUFBYSxDQUFDLHdCQUF3QixDQUFDLDBDQUEwQyxDQUFDO2FBQ3ZGO1lBQ0QsY0FBYyxFQUFFO2dCQUNkLG9CQUFvQixFQUFFLElBQUkscUJBQUcsQ0FBQyxjQUFjLENBQUM7b0JBQzNDLFVBQVUsRUFBRTt3QkFDVixJQUFJLHFCQUFHLENBQUMsZUFBZSxDQUFDOzRCQUN0QixNQUFN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S0FBSyxDQUFDLFdBQVcsSUFBSSxNQUFNO2dCQUN4QyxlQUFlLEVBQUUsS0FBSyxDQUFDLGdCQUFnQixDQUFDLFVBQVU7Z0JBQ2xELGNBQWMsRUFBRSxLQUFLLENBQUMsZUFBZSxDQUFDLFVBQVU7Z0JBQ2hELHVEQUF1RDtnQkFDdkQsZUFBZSxFQUFFLEtBQUssQ0FBQyxNQUFNO2FBQzlCO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsa0ZBQWtGO1FBQ2xGLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUMvRCxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQ2hFLENBQUM7Q0FDRjtBQXJURCxnREFxVEMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIExEQVAgVG9rZW4gUmV0cmlldmVyIEN1c3RvbSBSZXNvdXJjZSBDb25zdHJ1Y3RcbiAqIFxuICogVGhpcyBjb25zdHJ1Y3QgY3JlYXRlcyBhIExhbWJkYSBmdW5jdGlvbiB0aGF0IGF1dG9tYXRpY2FsbHkgcmV0cmlldmVzXG4gKiB0aGUgTERBUCBvdXRwb3N0IHRva2VuIGZyb20gQXV0aGVudGlrIGFuZCBzdG9yZXMgaXQgaW4gQVdTIFNlY3JldHMgTWFuYWdlci5cbiAqIFRoaXMgaXMgbmVjZXNzYXJ5IGJlY2F1c2UgdGhlIExEQVAgb3V0cG9zdCBuZWVkcyB0aGUgdG9rZW4gdG8gY29ubmVjdCB0byBBdXRoZW50aWssXG4gKiBidXQgdGhlIHRva2VuIGNhbiBvbmx5IGJlIHJldHJpZXZlZCBhZnRlciBBdXRoZW50aWsgaXMgZnVsbHkgcnVubmluZy5cbiAqL1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQge1xuICBhd3NfbGFtYmRhIGFzIGxhbWJkYSxcbiAgYXdzX2lhbSBhcyBpYW0sXG4gIGF3c19sb2dzIGFzIGxvZ3MsXG4gIGF3c19zZWNyZXRzbWFuYWdlciBhcyBzZWNyZXRzbWFuYWdlcixcbiAgYXdzX2ttcyBhcyBrbXMsXG4gIEN1c3RvbVJlc291cmNlLFxuICBEdXJhdGlvbixcbiAgUmVtb3ZhbFBvbGljeSxcbiAgU3RhY2ssXG4gIEZuXG59IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB0eXBlIHsgQXV0aEluZnJhRW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuLi9lbnZpcm9ubWVudC1jb25maWcnO1xuXG4vKipcbiAqIFByb3BlcnRpZXMgZm9yIHRoZSBMREFQIFRva2VuIFJldHJpZXZlciBjb25zdHJ1Y3RcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBMZGFwVG9rZW5SZXRyaWV2ZXJQcm9wcyB7XG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBuYW1lIChlLmcuICdwcm9kJywgJ2RldicsIGV0Yy4pXG4gICAqL1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBjb25maWd1cmF0aW9uXG4gICAqL1xuICBjb25maWc6IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnO1xuXG4gIC8qKlxuICAgKiBLTVMga2V5IGZvciBlbmNyeXB0aW9uXG4gICAqL1xuICBrbXNLZXk6IGttcy5JS2V5O1xuXG4gIC8qKlxuICAgKiBBdXRoZW50aWsgaG9zdCBVUkxcbiAgICovXG4gIGF1dGhlbnRpa0hvc3Q6IHN0cmluZztcblxuICAvKipcbiAgICogTmFtZSBvZiB0aGUgTERBUCBvdXRwb3N0IGluIEF1dGhlbnRpa1xuICAgKi9cbiAgb3V0cG9zdE5hbWU/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEFkbWluIHRva2VuIHNlY3JldCBmb3IgYWNjZXNzaW5nIEF1dGhlbnRpayBBUElcbiAgICovXG4gIGFkbWluVG9rZW5TZWNyZXQ6IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG5cbiAgLyoqXG4gICAqIExEQVAgdG9rZW4gc2VjcmV0IHRvIHVwZGF0ZVxuICAgKi9cbiAgbGRhcFRva2VuU2VjcmV0OiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xuXG4gIC8qKlxuICAgKiBHaXQgU0hBIGZvciB2ZXJzaW9uaW5nXG4gICAqL1xuICBnaXRTaGE6IHN0cmluZztcbn1cblxuLyoqXG4gKiBMREFQIFRva2VuIFJldHJpZXZlciBjb25zdHJ1Y3RcbiAqL1xuZXhwb3J0IGNsYXNzIExkYXBUb2tlblJldHJpZXZlciBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBUaGUgTGFtYmRhIGZ1bmN0aW9uIHRoYXQgcmV0cmlldmVzIExEQVAgdG9rZW5zXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgbGFtYmRhRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcblxuICAvKipcbiAgICogVGhlIGN1c3RvbSByZXNvdXJjZSB0aGF0IHRyaWdnZXJzIHRoZSBMYW1iZGFcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBjdXN0b21SZXNvdXJjZTogQ3VzdG9tUmVzb3VyY2U7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IExkYXBUb2tlblJldHJpZXZlclByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIC8vIENyZWF0ZSBDbG91ZFdhdGNoIGxvZyBncm91cCBmb3IgdGhlIExhbWJkYSBmdW5jdGlvblxuICAgIGNvbnN0IGxvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0xvZ0dyb3VwJywge1xuICAgICAgbG9nR3JvdXBOYW1lOiBgL2F3cy9sYW1iZGEvJHtwcm9wcy5lbnZpcm9ubWVudH0tdXBkYXRlLWxkYXAtdG9rZW5gLFxuICAgICAgcmV0ZW50aW9uOiBwcm9wcy5jb25maWcubW9uaXRvcmluZy5sb2dSZXRlbnRpb25EYXlzLFxuICAgICAgcmVtb3ZhbFBvbGljeTogcHJvcHMuY29uZmlnLmdlbmVyYWwucmVtb3ZhbFBvbGljeVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIElBTSByb2xlIGZvciB0aGUgTGFtYmRhIGZ1bmN0aW9uXG4gICAgY29uc3QgbGFtYmRhUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnTGFtYmRhUm9sZScsIHtcbiAgICAgIHJvbGVOYW1lOiBgJHtwcm9wcy5lbnZpcm9ubWVudH0tdXBkYXRlLWxkYXAtdG9rZW4tbGFtYmRhLXJvbGVgLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJylcbiAgICAgIF0sXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBTZWNyZXRzTWFuYWdlckFjY2VzczogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6VXBkYXRlU2VjcmV0JyxcbiAgICAgICAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6UHV0U2VjcmV0VmFsdWUnLFxuICAgICAgICAgICAgICAgICdzZWNyZXRzbWFuYWdlcjpHZXRTZWNyZXRWYWx1ZSdcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICAgICAgcHJvcHMuYWRtaW5Ub2tlblNlY3JldC5zZWNyZXRBcm4sXG4gICAgICAgICAgICAgICAgcHJvcHMubGRhcFRva2VuU2VjcmV0LnNlY3JldEFybixcbiAgICAgICAgICAgICAgICAvLyBMZWdhY3kgc2VjcmV0IHBhdHRlcm5zIGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5XG4gICAgICAgICAgICAgICAgYGFybjphd3M6c2VjcmV0c21hbmFnZXI6JHtTdGFjay5vZih0aGlzKS5yZWdpb259OiR7U3RhY2sub2YodGhpcykuYWNjb3VudH06c2VjcmV0OmNvZS1hdXRoLSpgLFxuICAgICAgICAgICAgICAgIGBhcm46YXdzOnNlY3JldHNtYW5hZ2VyOiR7U3RhY2sub2YodGhpcykucmVnaW9ufToke1N0YWNrLm9mKHRoaXMpLmFjY291bnR9OnNlY3JldDoke3Byb3BzLmVudmlyb25tZW50fS9hdXRoZW50aWstYWRtaW4tdG9rZW4qYCxcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpzZWNyZXRzbWFuYWdlcjoke1N0YWNrLm9mKHRoaXMpLnJlZ2lvbn06JHtTdGFjay5vZih0aGlzKS5hY2NvdW50fTpzZWNyZXQ6JHtwcm9wcy5lbnZpcm9ubWVudH0vYXV0aGVudGlrLWxkYXAtdG9rZW4qYFxuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2ttczpFbmNyeXB0JyxcbiAgICAgICAgICAgICAgICAna21zOkRlY3J5cHQnLFxuICAgICAgICAgICAgICAgICdrbXM6UmVFbmNyeXB0RnJvbScsXG4gICAgICAgICAgICAgICAgJ2ttczpSZUVuY3J5cHRUbycsXG4gICAgICAgICAgICAgICAgJ2ttczpHZW5lcmF0ZURhdGFLZXknLFxuICAgICAgICAgICAgICAgICdrbXM6R2VuZXJhdGVEYXRhS2V5V2l0aG91dFBsYWludGV4dCcsXG4gICAgICAgICAgICAgICAgJ2ttczpEZXNjcmliZUtleSdcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbcHJvcHMua21zS2V5LmtleUFybl1cbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgXVxuICAgICAgICB9KVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBMYW1iZGEgZnVuY3Rpb25cbiAgICB0aGlzLmxhbWJkYUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGAke3Byb3BzLmVudmlyb25tZW50fS11cGRhdGUtbGRhcC10b2tlbmAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgbG9nR3JvdXA6IGxvZ0dyb3VwLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgTk9ERV9PUFRJT05TOiAnLS1lbmFibGUtc291cmNlLW1hcHMnXG4gICAgICB9LFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUlubGluZShgXG5pbXBvcnQgeyBTZWNyZXRzTWFuYWdlckNsaWVudCwgR2V0U2VjcmV0VmFsdWVDb21tYW5kLCBQdXRTZWNyZXRWYWx1ZUNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtc2VjcmV0cy1tYW5hZ2VyJztcbmltcG9ydCBodHRwcyBmcm9tICdodHRwcyc7XG5pbXBvcnQgaHR0cCBmcm9tICdodHRwJztcbmltcG9ydCB7IFVSTCB9IGZyb20gJ3VybCc7XG5cbmNvbnN0IHNlY3JldHNNYW5hZ2VyID0gbmV3IFNlY3JldHNNYW5hZ2VyQ2xpZW50KHt9KTtcblxuLy8gSGVscGVyIGZ1bmN0aW9uIHRvIHNlbmQgQ2xvdWRGb3JtYXRpb24gcmVzcG9uc2VcbmFzeW5jIGZ1bmN0aW9uIHNlbmRSZXNwb25zZShldmVudCwgY29udGV4dCwgcmVzcG9uc2VTdGF0dXMsIHJlc3BvbnNlRGF0YSA9IHt9LCBwaHlzaWNhbFJlc291cmNlSWQgPSBudWxsKSB7XG4gICAgY29uc3QgcmVzcG9uc2VCb2R5ID0gSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBTdGF0dXM6IHJlc3BvbnNlU3RhdHVzLFxuICAgICAgICBSZWFzb246IFxcYFNlZSB0aGUgZGV0YWlscyBpbiBDbG91ZFdhdGNoIExvZyBTdHJlYW06IFxcJHtjb250ZXh0LmxvZ1N0cmVhbU5hbWV9XFxgLFxuICAgICAgICBQaHlzaWNhbFJlc291cmNlSWQ6IHBoeXNpY2FsUmVzb3VyY2VJZCB8fCBjb250ZXh0LmxvZ1N0cmVhbU5hbWUsXG4gICAgICAgIFN0YWNrSWQ6IGV2ZW50LlN0YWNrSWQsXG4gICAgICAgIFJlcXVlc3RJZDogZXZlbnQuUmVxdWVzdElkLFxuICAgICAgICBMb2dpY2FsUmVzb3VyY2VJZDogZXZlbnQuTG9naWNhbFJlc291cmNlSWQsXG4gICAgICAgIERhdGE6IHJlc3BvbnNlRGF0YVxuICAgIH0pO1xuXG4gICAgY29uc3QgcGFyc2VkVXJsID0gbmV3IFVSTChldmVudC5SZXNwb25zZVVSTCk7XG4gICAgY29uc3Qgb3B0aW9ucyA9IHtcbiAgICAgICAgaG9zdG5hbWU6IHBhcnNlZFVybC5ob3N0bmFtZSxcbiAgICAgICAgcG9ydDogNDQzLFxuICAgICAgICBwYXRoOiBwYXJzZWRVcmwucGF0aG5hbWUgKyBwYXJzZWRVcmwuc2VhcmNoLFxuICAgICAgICBtZXRob2Q6ICdQVVQnLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAnY29udGVudC10eXBlJzogJycsXG4gICAgICAgICAgICAnY29udGVudC1sZW5ndGgnOiByZXNwb25zZUJvZHkubGVuZ3RoXG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgY29uc3QgcmVxdWVzdCA9IGh0dHBzLnJlcXVlc3Qob3B0aW9ucywgKHJlc3BvbnNlKSA9PiB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcXGBTdGF0dXMgY29kZTogXFwke3Jlc3BvbnNlLnN0YXR1c0NvZGV9XFxgKTtcbiAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICByZXF1ZXN0Lm9uKCdlcnJvcicsIChlcnJvcikgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5sb2coXFxgc2VuZCguLikgZmFpbGVkIGV4ZWN1dGluZyBodHRwcy5yZXF1ZXN0KC4uKTpcXGAsIGVycm9yKTtcbiAgICAgICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgcmVxdWVzdC53cml0ZShyZXNwb25zZUJvZHkpO1xuICAgICAgICByZXF1ZXN0LmVuZCgpO1xuICAgIH0pO1xufVxuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gZmV0Y2ggSlNPTiBkYXRhXG5hc3luYyBmdW5jdGlvbiBmZXRjaEpzb24odXJsLCBvcHRpb25zKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgY29uc3QgdXJsT2JqID0gbmV3IFVSTCh1cmwpO1xuICAgICAgICBjb25zdCBsaWIgPSB1cmxPYmoucHJvdG9jb2wgPT09ICdodHRwczonID8gaHR0cHMgOiBodHRwO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgcmVxID0gbGliLnJlcXVlc3QodXJsLCB7XG4gICAgICAgICAgICBtZXRob2Q6IG9wdGlvbnMubWV0aG9kIHx8ICdHRVQnLFxuICAgICAgICAgICAgaGVhZGVyczogb3B0aW9ucy5oZWFkZXJzIHx8IHt9XG4gICAgICAgIH0sIChyZXMpID0+IHtcbiAgICAgICAgICAgIGxldCBkYXRhID0gJyc7XG4gICAgICAgICAgICByZXMub24oJ2RhdGEnLCBjaHVuayA9PiBkYXRhICs9IGNodW5rKTtcbiAgICAgICAgICAgIHJlcy5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSA+PSAyMDAgJiYgcmVzLnN0YXR1c0NvZGUgPCAzMDApIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoSlNPTi5wYXJzZShkYXRhKSk7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoXFxgSW52YWxpZCBKU09OIHJlc3BvbnNlOiBcXCR7ZS5tZXNzYWdlfVxcYCkpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihcXGBIVFRQIGVycm9yISBzdGF0dXM6IFxcJHtyZXMuc3RhdHVzQ29kZX1cXGApKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICByZXEub24oJ2Vycm9yJywgcmVqZWN0KTtcbiAgICAgICAgcmVxLmVuZCgpO1xuICAgIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRBZG1pblRva2VuKGFkbWluU2VjcmV0TmFtZSkge1xuICAgIGNvbnNvbGUubG9nKCdHZXR0aW5nIGFkbWluIHRva2VuIGZyb20gc2VjcmV0OicsIGFkbWluU2VjcmV0TmFtZSk7XG4gICAgXG4gICAgY29uc3QgY29tbWFuZCA9IG5ldyBHZXRTZWNyZXRWYWx1ZUNvbW1hbmQoe1xuICAgICAgICBTZWNyZXRJZDogYWRtaW5TZWNyZXROYW1lXG4gICAgfSk7XG4gICAgXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBzZWNyZXRzTWFuYWdlci5zZW5kKGNvbW1hbmQpO1xuICAgIHJldHVybiByZXNwb25zZS5TZWNyZXRTdHJpbmc7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJldHJpZXZlVG9rZW4oYXV0aGVudGlrSG9zdCwgYXV0aGVudGlrQXBpVG9rZW4sIG91dHBvc3ROYW1lKSB7XG4gICAgb3V0cG9zdE5hbWUgPSBvdXRwb3N0TmFtZSB8fCAnTERBUCc7XG4gICAgXG4gICAgdHJ5IHtcbiAgICAgICAgLy8gRmV0Y2ggb3V0cG9zdCBpbnN0YW5jZXMgZnJvbSBBUElcbiAgICAgICAgY29uc3Qgb3V0cG9zdEluc3RhbmNlc1VybCA9IG5ldyBVUkwoJy9hcGkvdjMvb3V0cG9zdHMvaW5zdGFuY2VzLycsIGF1dGhlbnRpa0hvc3QpO1xuICAgICAgICBvdXRwb3N0SW5zdGFuY2VzVXJsLnNlYXJjaFBhcmFtcy5hcHBlbmQoJ25hbWVfX2lleGFjdCcsIG91dHBvc3ROYW1lKTtcblxuICAgICAgICBjb25zb2xlLmxvZygnRmV0Y2hpbmcgb3V0cG9zdCBpbnN0YW5jZXMgZnJvbTonLCBvdXRwb3N0SW5zdGFuY2VzVXJsLnRvU3RyaW5nKCkpO1xuICAgICAgICBcbiAgICAgICAgY29uc3Qgb3V0cG9zdEluc3RhbmNlcyA9IGF3YWl0IGZldGNoSnNvbihvdXRwb3N0SW5zdGFuY2VzVXJsLnRvU3RyaW5nKCksIHtcbiAgICAgICAgICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAgICAgJ0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAgICAgICAnQXV0aG9yaXphdGlvbic6IFxcYEJlYXJlciBcXCR7YXV0aGVudGlrQXBpVG9rZW59XFxgXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIENoZWNrIGlmIHdlIGZvdW5kIHRoZSBvdXRwb3N0XG4gICAgICAgIGNvbnN0IHJlc3VsdHMgPSBvdXRwb3N0SW5zdGFuY2VzLnJlc3VsdHMgfHwgW107XG4gICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxcYE91dHBvc3Qgd2l0aCBuYW1lIFxcJHtvdXRwb3N0TmFtZX0gbm90IGZvdW5kLCBhYm9ydGluZy4uLlxcYCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBFeHRyYWN0IHRoZSB0b2tlbiBpZGVudGlmaWVyXG4gICAgICAgIGNvbnN0IG91dHBvc3QgPSByZXN1bHRzLmZpbmQoKGl0ZW0pID0+IGl0ZW0ubmFtZSA9PT0gb3V0cG9zdE5hbWUpO1xuICAgICAgICBpZiAoIW91dHBvc3QgfHwgIW91dHBvc3QudG9rZW5faWRlbnRpZmllcikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxcYFRva2VuIGlkZW50aWZpZXIgZm9yIG91dHBvc3QgXFwke291dHBvc3ROYW1lfSBub3QgZm91bmQsIGFib3J0aW5nLi4uXFxgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHRva2VuSWRlbnRpZmllciA9IG91dHBvc3QudG9rZW5faWRlbnRpZmllcjtcbiAgICAgICAgY29uc29sZS5sb2coJ0ZvdW5kIHRva2VuIGlkZW50aWZpZXI6JywgdG9rZW5JZGVudGlmaWVyKTtcblxuICAgICAgICAvLyBGZXRjaCB0aGUgdG9rZW5cbiAgICAgICAgY29uc3Qgdmlld0tleVVybCA9IG5ldyBVUkwoXFxgL2FwaS92My9jb3JlL3Rva2Vucy9cXCR7dG9rZW5JZGVudGlmaWVyfS92aWV3X2tleS9cXGAsIGF1dGhlbnRpa0hvc3QpO1xuXG4gICAgICAgIGNvbnN0IHZpZXdLZXlSZXN1bHQgPSBhd2FpdCBmZXRjaEpzb24odmlld0tleVVybC50b1N0cmluZygpLCB7XG4gICAgICAgICAgICBtZXRob2Q6ICdHRVQnLFxuICAgICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgICAgICdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgICAgICAgJ0F1dGhvcml6YXRpb24nOiBcXGBCZWFyZXIgXFwke2F1dGhlbnRpa0FwaVRva2VufVxcYFxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBvdXRwb3N0VG9rZW4gPSB2aWV3S2V5UmVzdWx0LmtleTtcbiAgICAgICAgaWYgKCFvdXRwb3N0VG9rZW4pIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcXGBUb2tlbiBmb3Igb3V0cG9zdCBcXCR7b3V0cG9zdE5hbWV9IG5vdCBmb3VuZCwgYWJvcnRpbmcuLi5cXGApO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG91dHBvc3RUb2tlbjtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKFxcYEVycm9yIHJldHJpZXZpbmcgdG9rZW46IFxcJHtlcnJvci5tZXNzYWdlfVxcYCk7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gcHV0TERBUFNlY3JldChzZWNyZXROYW1lLCBzZWNyZXRWYWx1ZSkge1xuICAgIGNvbnNvbGUubG9nKCdVcGRhdGluZyBMREFQIHRva2VuIHNlY3JldDonLCBzZWNyZXROYW1lKTtcbiAgICBcbiAgICBjb25zdCBjb21tYW5kID0gbmV3IFB1dFNlY3JldFZhbHVlQ29tbWFuZCh7XG4gICAgICAgIFNlY3JldElkOiBzZWNyZXROYW1lLFxuICAgICAgICBTZWNyZXRTdHJpbmc6IHNlY3JldFZhbHVlXG4gICAgfSk7XG4gICAgXG4gICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgc2VjcmV0c01hbmFnZXIuc2VuZChjb21tYW5kKTtcbiAgICAgICAgY29uc29sZS5sb2coJ0xEQVAgdG9rZW4gc2VjcmV0IHVwZGF0ZWQgc3VjY2Vzc2Z1bGx5Jyk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgdXBkYXRpbmcgc2VjcmV0OicsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxufVxuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudCwgY29udGV4dCkgPT4ge1xuICAgIGNvbnNvbGUubG9nKCdFdmVudDonLCBKU09OLnN0cmluZ2lmeShldmVudCwgbnVsbCwgMikpO1xuICAgIFxuICAgIGNvbnN0IHsgUmVxdWVzdFR5cGUsIFJlc291cmNlUHJvcGVydGllcyB9ID0gZXZlbnQ7XG4gICAgY29uc3QgeyBcbiAgICAgICAgRW52aXJvbm1lbnQsIFxuICAgICAgICBBdXRoZW50aWtIb3N0LCBcbiAgICAgICAgT3V0cG9zdE5hbWUsXG4gICAgICAgIEFkbWluU2VjcmV0TmFtZSxcbiAgICAgICAgTERBUFNlY3JldE5hbWVcbiAgICB9ID0gUmVzb3VyY2VQcm9wZXJ0aWVzO1xuICAgIFxuICAgIHRyeSB7XG4gICAgICAgIGlmIChSZXF1ZXN0VHlwZSA9PT0gJ0NyZWF0ZScgfHwgUmVxdWVzdFR5cGUgPT09ICdVcGRhdGUnKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnUHJvY2Vzc2luZyBMREFQIHRva2VuIHJldHJpZXZhbC4uLicpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ0Vudmlyb25tZW50OicsIEVudmlyb25tZW50KTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdBdXRoZW50aWsgVVJMOicsIEF1dGhlbnRpa0hvc3QpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ091dHBvc3QgTmFtZTonLCBPdXRwb3N0TmFtZSk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnQWRtaW4gU2VjcmV0IE5hbWU6JywgQWRtaW5TZWNyZXROYW1lKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdMREFQIFNlY3JldCBOYW1lOicsIExEQVBTZWNyZXROYW1lKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gR2V0IHRoZSBhZG1pbiB0b2tlbiBmcm9tIEFXUyBTZWNyZXRzIE1hbmFnZXJcbiAgICAgICAgICAgIGNvbnN0IGFkbWluVG9rZW4gPSBhd2FpdCBnZXRBZG1pblRva2VuKEFkbWluU2VjcmV0TmFtZSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIFJldHJpZXZlIHRoZSBMREFQIHRva2VuIGZyb20gQXV0aGVudGlrXG4gICAgICAgICAgICBjb25zdCBsZGFwVG9rZW4gPSBhd2FpdCByZXRyaWV2ZVRva2VuKEF1dGhlbnRpa0hvc3QsIGFkbWluVG9rZW4sIE91dHBvc3ROYW1lKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gU3RvcmUgdGhlIExEQVAgdG9rZW4gYmFjayBpbiBBV1MgU2VjcmV0cyBNYW5hZ2VyXG4gICAgICAgICAgICBhd2FpdCBwdXRMREFQU2VjcmV0KExEQVBTZWNyZXROYW1lLCBsZGFwVG9rZW4pO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBhd2FpdCBzZW5kUmVzcG9uc2UoZXZlbnQsIGNvbnRleHQsICdTVUNDRVNTJywge1xuICAgICAgICAgICAgICAgIE1lc3NhZ2U6ICdMREFQIHRva2VuIHJldHJpZXZlZCBhbmQgdXBkYXRlZCBzdWNjZXNzZnVsbHknLFxuICAgICAgICAgICAgICAgIExEQVBUb2tlbjogbGRhcFRva2VuLnN1YnN0cmluZygwLCAxMCkgKyAnLi4uJyAvLyBMb2cgb25seSBmaXJzdCAxMCBjaGFycyBmb3Igc2VjdXJpdHlcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2UgaWYgKFJlcXVlc3RUeXBlID09PSAnRGVsZXRlJykge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ0RlbGV0ZSByZXF1ZXN0IC0gbm8gYWN0aW9uIG5lZWRlZCBmb3IgTERBUCB0b2tlbiByZXRyaWV2YWwnKTtcbiAgICAgICAgICAgIGF3YWl0IHNlbmRSZXNwb25zZShldmVudCwgY29udGV4dCwgJ1NVQ0NFU1MnLCB7XG4gICAgICAgICAgICAgICAgTWVzc2FnZTogJ0RlbGV0ZSBjb21wbGV0ZWQnXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yOicsIGVycm9yKTtcbiAgICAgICAgYXdhaXQgc2VuZFJlc3BvbnNlKGV2ZW50LCBjb250ZXh0LCAnRkFJTEVEJywge1xuICAgICAgICAgICAgTWVzc2FnZTogZXJyb3IubWVzc2FnZVxuICAgICAgICB9KTtcbiAgICB9XG59O1xuICAgICAgYClcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSB0aGUgY3VzdG9tIHJlc291cmNlIHByb3ZpZGVyXG4gICAgY29uc3QgcHJvdmlkZXIgPSBsYW1iZGEuRnVuY3Rpb24uZnJvbUZ1bmN0aW9uQXJuKHRoaXMsICdQcm92aWRlcicsIHRoaXMubGFtYmRhRnVuY3Rpb24uZnVuY3Rpb25Bcm4pO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBjdXN0b20gcmVzb3VyY2VcbiAgICB0aGlzLmN1c3RvbVJlc291cmNlID0gbmV3IEN1c3RvbVJlc291cmNlKHRoaXMsICdSZXNvdXJjZScsIHtcbiAgICAgIHNlcnZpY2VUb2tlbjogdGhpcy5sYW1iZGFGdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgRW52aXJvbm1lbnQ6IHByb3BzLmVudmlyb25tZW50LFxuICAgICAgICBBdXRoZW50aWtIb3N0OiBwcm9wcy5hdXRoZW50aWtIb3N0LFxuICAgICAgICBPdXRwb3N0TmFtZTogcHJvcHMub3V0cG9zdE5hbWUgfHwgJ0xEQVAnLFxuICAgICAgICBBZG1pblNlY3JldE5hbWU6IHByb3BzLmFkbWluVG9rZW5TZWNyZXQuc2VjcmV0TmFtZSxcbiAgICAgICAgTERBUFNlY3JldE5hbWU6IHByb3BzLmxkYXBUb2tlblNlY3JldC5zZWNyZXROYW1lLFxuICAgICAgICAvLyBBZGQgYSB0aW1lc3RhbXAgdG8gZm9yY2UgdXBkYXRlcyBvbiBldmVyeSBkZXBsb3ltZW50XG4gICAgICAgIFVwZGF0ZVRpbWVzdGFtcDogcHJvcHMuZ2l0U2hhXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBBZGQgZGVwZW5kZW5jeSB0byBlbnN1cmUgdGhlIGN1c3RvbSByZXNvdXJjZSBydW5zIGFmdGVyIHRoZSBzZWNyZXRzIGFyZSBjcmVhdGVkXG4gICAgdGhpcy5jdXN0b21SZXNvdXJjZS5ub2RlLmFkZERlcGVuZGVuY3kocHJvcHMuYWRtaW5Ub2tlblNlY3JldCk7XG4gICAgdGhpcy5jdXN0b21SZXNvdXJjZS5ub2RlLmFkZERlcGVuZGVuY3kocHJvcHMubGRhcFRva2VuU2VjcmV0KTtcbiAgfVxufVxuIl19