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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGRhcC10b2tlbi1yZXRyaWV2ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJsZGFwLXRva2VuLXJldHJpZXZlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQTs7Ozs7OztHQU9HO0FBQ0gsMkNBQXVDO0FBQ3ZDLDZDQVdxQjtBQWdEckI7O0dBRUc7QUFDSCxNQUFhLGtCQUFtQixTQUFRLHNCQUFTO0lBVy9DLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBOEI7UUFDdEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixzREFBc0Q7UUFDdEQsTUFBTSxRQUFRLEdBQUcsSUFBSSxzQkFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFO1lBQ25ELFlBQVksRUFBRSxlQUFlLEtBQUssQ0FBQyxXQUFXLG9CQUFvQjtZQUNsRSxTQUFTLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsZ0JBQWdCO1lBQ25ELGFBQWEsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhO1NBQ2xELENBQUMsQ0FBQztRQUVILDBDQUEwQztRQUMxQyxNQUFNLFVBQVUsR0FBRyxJQUFJLHFCQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDbEQsUUFBUSxFQUFFLEdBQUcsS0FBSyxDQUFDLFdBQVcsZ0NBQWdDO1lBQzlELFNBQVMsRUFBRSxJQUFJLHFCQUFHLENBQUMsZ0JBQWdCLENBQUMsc0JBQXNCLENBQUM7WUFDM0QsZUFBZSxFQUFFO2dCQUNmLHFCQUFHLENBQUMsYUFBYSxDQUFDLHdCQUF3QixDQUFDLDBDQUEwQyxDQUFDO2FBQ3ZGO1lBQ0QsY0FBYyxFQUFFO2dCQUNkLG9CQUFvQixFQUFFLElBQUkscUJBQUcsQ0FBQyxjQUFjLENBQUM7b0JBQzNDLFVBQVUsRUFBRTt3QkFDVixJQUFJLHFCQUFHLENBQUMsZUFBZSxDQUFDOzRCQUN0QixNQUFN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S0FBSyxDQUFDLFdBQVcsSUFBSSxNQUFNO2dCQUN4QyxlQUFlLEVBQUUsS0FBSyxDQUFDLGdCQUFnQixDQUFDLFVBQVU7Z0JBQ2xELGNBQWMsRUFBRSxLQUFLLENBQUMsZUFBZSxDQUFDLFVBQVU7Z0JBQ2hELHVEQUF1RDtnQkFDdkQsZUFBZSxFQUFFLEtBQUssQ0FBQyxNQUFNO2FBQzlCO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsa0ZBQWtGO1FBQ2xGLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUMvRCxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQ2hFLENBQUM7Q0FDRjtBQXJURCxnREFxVEMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIExEQVAgVG9rZW4gUmV0cmlldmVyIEN1c3RvbSBSZXNvdXJjZSBDb25zdHJ1Y3RcbiAqIFxuICogVGhpcyBjb25zdHJ1Y3QgY3JlYXRlcyBhIExhbWJkYSBmdW5jdGlvbiB0aGF0IGF1dG9tYXRpY2FsbHkgcmV0cmlldmVzXG4gKiB0aGUgTERBUCBvdXRwb3N0IHRva2VuIGZyb20gQXV0aGVudGlrIGFuZCBzdG9yZXMgaXQgaW4gQVdTIFNlY3JldHMgTWFuYWdlci5cbiAqIFRoaXMgaXMgbmVjZXNzYXJ5IGJlY2F1c2UgdGhlIExEQVAgb3V0cG9zdCBuZWVkcyB0aGUgdG9rZW4gdG8gY29ubmVjdCB0byBBdXRoZW50aWssXG4gKiBidXQgdGhlIHRva2VuIGNhbiBvbmx5IGJlIHJldHJpZXZlZCBhZnRlciBBdXRoZW50aWsgaXMgZnVsbHkgcnVubmluZy5cbiAqL1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQge1xuICBhd3NfbGFtYmRhIGFzIGxhbWJkYSxcbiAgYXdzX2lhbSBhcyBpYW0sXG4gIGF3c19sb2dzIGFzIGxvZ3MsXG4gIGF3c19zZWNyZXRzbWFuYWdlciBhcyBzZWNyZXRzbWFuYWdlcixcbiAgYXdzX2ttcyBhcyBrbXMsXG4gIEN1c3RvbVJlc291cmNlLFxuICBEdXJhdGlvbixcbiAgUmVtb3ZhbFBvbGljeSxcbiAgU3RhY2ssXG4gIEZuXG59IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB0eXBlIHsgQmFzZUNvbmZpZyB9IGZyb20gJy4uL2Vudmlyb25tZW50LWNvbmZpZyc7XG5cbi8qKlxuICogUHJvcGVydGllcyBmb3IgdGhlIExEQVAgVG9rZW4gUmV0cmlldmVyIGNvbnN0cnVjdFxuICovXG5leHBvcnQgaW50ZXJmYWNlIExkYXBUb2tlblJldHJpZXZlclByb3BzIHtcbiAgLyoqXG4gICAqIEVudmlyb25tZW50IG5hbWUgKGUuZy4gJ3Byb2QnLCAnZGV2JywgZXRjLilcbiAgICovXG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEVudmlyb25tZW50IGNvbmZpZ3VyYXRpb25cbiAgICovXG4gIGNvbmZpZzogQmFzZUNvbmZpZztcblxuICAvKipcbiAgICogS01TIGtleSBmb3IgZW5jcnlwdGlvblxuICAgKi9cbiAga21zS2V5OiBrbXMuSUtleTtcblxuICAvKipcbiAgICogQXV0aGVudGlrIGhvc3QgVVJMXG4gICAqL1xuICBhdXRoZW50aWtIb3N0OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIE5hbWUgb2YgdGhlIExEQVAgb3V0cG9zdCBpbiBBdXRoZW50aWtcbiAgICovXG4gIG91dHBvc3ROYW1lPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBBZG1pbiB0b2tlbiBzZWNyZXQgZm9yIGFjY2Vzc2luZyBBdXRoZW50aWsgQVBJXG4gICAqL1xuICBhZG1pblRva2VuU2VjcmV0OiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xuXG4gIC8qKlxuICAgKiBMREFQIHRva2VuIHNlY3JldCB0byB1cGRhdGVcbiAgICovXG4gIGxkYXBUb2tlblNlY3JldDogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcblxuICAvKipcbiAgICogR2l0IFNIQSBmb3IgdmVyc2lvbmluZ1xuICAgKi9cbiAgZ2l0U2hhOiBzdHJpbmc7XG59XG5cbi8qKlxuICogTERBUCBUb2tlbiBSZXRyaWV2ZXIgY29uc3RydWN0XG4gKi9cbmV4cG9ydCBjbGFzcyBMZGFwVG9rZW5SZXRyaWV2ZXIgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICAvKipcbiAgICogVGhlIExhbWJkYSBmdW5jdGlvbiB0aGF0IHJldHJpZXZlcyBMREFQIHRva2Vuc1xuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGxhbWJkYUZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG5cbiAgLyoqXG4gICAqIFRoZSBjdXN0b20gcmVzb3VyY2UgdGhhdCB0cmlnZ2VycyB0aGUgTGFtYmRhXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgY3VzdG9tUmVzb3VyY2U6IEN1c3RvbVJlc291cmNlO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBMZGFwVG9rZW5SZXRyaWV2ZXJQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICAvLyBDcmVhdGUgQ2xvdWRXYXRjaCBsb2cgZ3JvdXAgZm9yIHRoZSBMYW1iZGEgZnVuY3Rpb25cbiAgICBjb25zdCBsb2dHcm91cCA9IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdMb2dHcm91cCcsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogYC9hd3MvbGFtYmRhLyR7cHJvcHMuZW52aXJvbm1lbnR9LXVwZGF0ZS1sZGFwLXRva2VuYCxcbiAgICAgIHJldGVudGlvbjogcHJvcHMuY29uZmlnLm1vbml0b3JpbmcubG9nUmV0ZW50aW9uRGF5cyxcbiAgICAgIHJlbW92YWxQb2xpY3k6IHByb3BzLmNvbmZpZy5nZW5lcmFsLnJlbW92YWxQb2xpY3lcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBJQU0gcm9sZSBmb3IgdGhlIExhbWJkYSBmdW5jdGlvblxuICAgIGNvbnN0IGxhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0xhbWJkYVJvbGUnLCB7XG4gICAgICByb2xlTmFtZTogYCR7cHJvcHMuZW52aXJvbm1lbnR9LXVwZGF0ZS1sZGFwLXRva2VuLWxhbWJkYS1yb2xlYCxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScpXG4gICAgICBdLFxuICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgU2VjcmV0c01hbmFnZXJBY2Nlc3M6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOlVwZGF0ZVNlY3JldCcsXG4gICAgICAgICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOlB1dFNlY3JldFZhbHVlJyxcbiAgICAgICAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6R2V0U2VjcmV0VmFsdWUnXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICAgIHByb3BzLmFkbWluVG9rZW5TZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgICAgICAgICAgIHByb3BzLmxkYXBUb2tlblNlY3JldC5zZWNyZXRBcm4sXG4gICAgICAgICAgICAgICAgLy8gTGVnYWN5IHNlY3JldCBwYXR0ZXJucyBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuICAgICAgICAgICAgICAgIGBhcm46YXdzOnNlY3JldHNtYW5hZ2VyOiR7U3RhY2sub2YodGhpcykucmVnaW9ufToke1N0YWNrLm9mKHRoaXMpLmFjY291bnR9OnNlY3JldDpjb2UtYXV0aC0qYCxcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpzZWNyZXRzbWFuYWdlcjoke1N0YWNrLm9mKHRoaXMpLnJlZ2lvbn06JHtTdGFjay5vZih0aGlzKS5hY2NvdW50fTpzZWNyZXQ6JHtwcm9wcy5lbnZpcm9ubWVudH0vYXV0aGVudGlrLWFkbWluLXRva2VuKmAsXG4gICAgICAgICAgICAgICAgYGFybjphd3M6c2VjcmV0c21hbmFnZXI6JHtTdGFjay5vZih0aGlzKS5yZWdpb259OiR7U3RhY2sub2YodGhpcykuYWNjb3VudH06c2VjcmV0OiR7cHJvcHMuZW52aXJvbm1lbnR9L2F1dGhlbnRpay1sZGFwLXRva2VuKmBcbiAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdrbXM6RW5jcnlwdCcsXG4gICAgICAgICAgICAgICAgJ2ttczpEZWNyeXB0JyxcbiAgICAgICAgICAgICAgICAna21zOlJlRW5jcnlwdEZyb20nLFxuICAgICAgICAgICAgICAgICdrbXM6UmVFbmNyeXB0VG8nLFxuICAgICAgICAgICAgICAgICdrbXM6R2VuZXJhdGVEYXRhS2V5JyxcbiAgICAgICAgICAgICAgICAna21zOkdlbmVyYXRlRGF0YUtleVdpdGhvdXRQbGFpbnRleHQnLFxuICAgICAgICAgICAgICAgICdrbXM6RGVzY3JpYmVLZXknXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW3Byb3BzLmttc0tleS5rZXlBcm5dXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIF1cbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSB0aGUgTGFtYmRhIGZ1bmN0aW9uXG4gICAgdGhpcy5sYW1iZGFGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0Z1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgJHtwcm9wcy5lbnZpcm9ubWVudH0tdXBkYXRlLWxkYXAtdG9rZW5gLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIGxvZ0dyb3VwOiBsb2dHcm91cCxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIE5PREVfT1BUSU9OUzogJy0tZW5hYmxlLXNvdXJjZS1tYXBzJ1xuICAgICAgfSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21JbmxpbmUoYFxuaW1wb3J0IHsgU2VjcmV0c01hbmFnZXJDbGllbnQsIEdldFNlY3JldFZhbHVlQ29tbWFuZCwgUHV0U2VjcmV0VmFsdWVDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNlY3JldHMtbWFuYWdlcic7XG5pbXBvcnQgaHR0cHMgZnJvbSAnaHR0cHMnO1xuaW1wb3J0IGh0dHAgZnJvbSAnaHR0cCc7XG5pbXBvcnQgeyBVUkwgfSBmcm9tICd1cmwnO1xuXG5jb25zdCBzZWNyZXRzTWFuYWdlciA9IG5ldyBTZWNyZXRzTWFuYWdlckNsaWVudCh7fSk7XG5cbi8vIEhlbHBlciBmdW5jdGlvbiB0byBzZW5kIENsb3VkRm9ybWF0aW9uIHJlc3BvbnNlXG5hc3luYyBmdW5jdGlvbiBzZW5kUmVzcG9uc2UoZXZlbnQsIGNvbnRleHQsIHJlc3BvbnNlU3RhdHVzLCByZXNwb25zZURhdGEgPSB7fSwgcGh5c2ljYWxSZXNvdXJjZUlkID0gbnVsbCkge1xuICAgIGNvbnN0IHJlc3BvbnNlQm9keSA9IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgU3RhdHVzOiByZXNwb25zZVN0YXR1cyxcbiAgICAgICAgUmVhc29uOiBcXGBTZWUgdGhlIGRldGFpbHMgaW4gQ2xvdWRXYXRjaCBMb2cgU3RyZWFtOiBcXCR7Y29udGV4dC5sb2dTdHJlYW1OYW1lfVxcYCxcbiAgICAgICAgUGh5c2ljYWxSZXNvdXJjZUlkOiBwaHlzaWNhbFJlc291cmNlSWQgfHwgY29udGV4dC5sb2dTdHJlYW1OYW1lLFxuICAgICAgICBTdGFja0lkOiBldmVudC5TdGFja0lkLFxuICAgICAgICBSZXF1ZXN0SWQ6IGV2ZW50LlJlcXVlc3RJZCxcbiAgICAgICAgTG9naWNhbFJlc291cmNlSWQ6IGV2ZW50LkxvZ2ljYWxSZXNvdXJjZUlkLFxuICAgICAgICBEYXRhOiByZXNwb25zZURhdGFcbiAgICB9KTtcblxuICAgIGNvbnN0IHBhcnNlZFVybCA9IG5ldyBVUkwoZXZlbnQuUmVzcG9uc2VVUkwpO1xuICAgIGNvbnN0IG9wdGlvbnMgPSB7XG4gICAgICAgIGhvc3RuYW1lOiBwYXJzZWRVcmwuaG9zdG5hbWUsXG4gICAgICAgIHBvcnQ6IDQ0MyxcbiAgICAgICAgcGF0aDogcGFyc2VkVXJsLnBhdGhuYW1lICsgcGFyc2VkVXJsLnNlYXJjaCxcbiAgICAgICAgbWV0aG9kOiAnUFVUJyxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgJ2NvbnRlbnQtdHlwZSc6ICcnLFxuICAgICAgICAgICAgJ2NvbnRlbnQtbGVuZ3RoJzogcmVzcG9uc2VCb2R5Lmxlbmd0aFxuICAgICAgICB9XG4gICAgfTtcblxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgIGNvbnN0IHJlcXVlc3QgPSBodHRwcy5yZXF1ZXN0KG9wdGlvbnMsIChyZXNwb25zZSkgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5sb2coXFxgU3RhdHVzIGNvZGU6IFxcJHtyZXNwb25zZS5zdGF0dXNDb2RlfVxcYCk7XG4gICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgcmVxdWVzdC5vbignZXJyb3InLCAoZXJyb3IpID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFxcYHNlbmQoLi4pIGZhaWxlZCBleGVjdXRpbmcgaHR0cHMucmVxdWVzdCguLik6XFxgLCBlcnJvcik7XG4gICAgICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIHJlcXVlc3Qud3JpdGUocmVzcG9uc2VCb2R5KTtcbiAgICAgICAgcmVxdWVzdC5lbmQoKTtcbiAgICB9KTtcbn1cblxuLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGZldGNoIEpTT04gZGF0YVxuYXN5bmMgZnVuY3Rpb24gZmV0Y2hKc29uKHVybCwgb3B0aW9ucykge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgIGNvbnN0IHVybE9iaiA9IG5ldyBVUkwodXJsKTtcbiAgICAgICAgY29uc3QgbGliID0gdXJsT2JqLnByb3RvY29sID09PSAnaHR0cHM6JyA/IGh0dHBzIDogaHR0cDtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IHJlcSA9IGxpYi5yZXF1ZXN0KHVybCwge1xuICAgICAgICAgICAgbWV0aG9kOiBvcHRpb25zLm1ldGhvZCB8fCAnR0VUJyxcbiAgICAgICAgICAgIGhlYWRlcnM6IG9wdGlvbnMuaGVhZGVycyB8fCB7fVxuICAgICAgICB9LCAocmVzKSA9PiB7XG4gICAgICAgICAgICBsZXQgZGF0YSA9ICcnO1xuICAgICAgICAgICAgcmVzLm9uKCdkYXRhJywgY2h1bmsgPT4gZGF0YSArPSBjaHVuayk7XG4gICAgICAgICAgICByZXMub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAocmVzLnN0YXR1c0NvZGUgPj0gMjAwICYmIHJlcy5zdGF0dXNDb2RlIDwgMzAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKEpTT04ucGFyc2UoZGF0YSkpO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKFxcYEludmFsaWQgSlNPTiByZXNwb25zZTogXFwke2UubWVzc2FnZX1cXGApKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoXFxgSFRUUCBlcnJvciEgc3RhdHVzOiBcXCR7cmVzLnN0YXR1c0NvZGV9XFxgKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgcmVxLm9uKCdlcnJvcicsIHJlamVjdCk7XG4gICAgICAgIHJlcS5lbmQoKTtcbiAgICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0QWRtaW5Ub2tlbihhZG1pblNlY3JldE5hbWUpIHtcbiAgICBjb25zb2xlLmxvZygnR2V0dGluZyBhZG1pbiB0b2tlbiBmcm9tIHNlY3JldDonLCBhZG1pblNlY3JldE5hbWUpO1xuICAgIFxuICAgIGNvbnN0IGNvbW1hbmQgPSBuZXcgR2V0U2VjcmV0VmFsdWVDb21tYW5kKHtcbiAgICAgICAgU2VjcmV0SWQ6IGFkbWluU2VjcmV0TmFtZVxuICAgIH0pO1xuICAgIFxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgc2VjcmV0c01hbmFnZXIuc2VuZChjb21tYW5kKTtcbiAgICByZXR1cm4gcmVzcG9uc2UuU2VjcmV0U3RyaW5nO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZXRyaWV2ZVRva2VuKGF1dGhlbnRpa0hvc3QsIGF1dGhlbnRpa0FwaVRva2VuLCBvdXRwb3N0TmFtZSkge1xuICAgIG91dHBvc3ROYW1lID0gb3V0cG9zdE5hbWUgfHwgJ0xEQVAnO1xuICAgIFxuICAgIHRyeSB7XG4gICAgICAgIC8vIEZldGNoIG91dHBvc3QgaW5zdGFuY2VzIGZyb20gQVBJXG4gICAgICAgIGNvbnN0IG91dHBvc3RJbnN0YW5jZXNVcmwgPSBuZXcgVVJMKCcvYXBpL3YzL291dHBvc3RzL2luc3RhbmNlcy8nLCBhdXRoZW50aWtIb3N0KTtcbiAgICAgICAgb3V0cG9zdEluc3RhbmNlc1VybC5zZWFyY2hQYXJhbXMuYXBwZW5kKCduYW1lX19pZXhhY3QnLCBvdXRwb3N0TmFtZSk7XG5cbiAgICAgICAgY29uc29sZS5sb2coJ0ZldGNoaW5nIG91dHBvc3QgaW5zdGFuY2VzIGZyb206Jywgb3V0cG9zdEluc3RhbmNlc1VybC50b1N0cmluZygpKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IG91dHBvc3RJbnN0YW5jZXMgPSBhd2FpdCBmZXRjaEpzb24ob3V0cG9zdEluc3RhbmNlc1VybC50b1N0cmluZygpLCB7XG4gICAgICAgICAgICBtZXRob2Q6ICdHRVQnLFxuICAgICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgICAgICdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgICAgICAgJ0F1dGhvcml6YXRpb24nOiBcXGBCZWFyZXIgXFwke2F1dGhlbnRpa0FwaVRva2VufVxcYFxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBDaGVjayBpZiB3ZSBmb3VuZCB0aGUgb3V0cG9zdFxuICAgICAgICBjb25zdCByZXN1bHRzID0gb3V0cG9zdEluc3RhbmNlcy5yZXN1bHRzIHx8IFtdO1xuICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcXGBPdXRwb3N0IHdpdGggbmFtZSBcXCR7b3V0cG9zdE5hbWV9IG5vdCBmb3VuZCwgYWJvcnRpbmcuLi5cXGApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRXh0cmFjdCB0aGUgdG9rZW4gaWRlbnRpZmllclxuICAgICAgICBjb25zdCBvdXRwb3N0ID0gcmVzdWx0cy5maW5kKChpdGVtKSA9PiBpdGVtLm5hbWUgPT09IG91dHBvc3ROYW1lKTtcbiAgICAgICAgaWYgKCFvdXRwb3N0IHx8ICFvdXRwb3N0LnRva2VuX2lkZW50aWZpZXIpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcXGBUb2tlbiBpZGVudGlmaWVyIGZvciBvdXRwb3N0IFxcJHtvdXRwb3N0TmFtZX0gbm90IGZvdW5kLCBhYm9ydGluZy4uLlxcYCk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB0b2tlbklkZW50aWZpZXIgPSBvdXRwb3N0LnRva2VuX2lkZW50aWZpZXI7XG4gICAgICAgIGNvbnNvbGUubG9nKCdGb3VuZCB0b2tlbiBpZGVudGlmaWVyOicsIHRva2VuSWRlbnRpZmllcik7XG5cbiAgICAgICAgLy8gRmV0Y2ggdGhlIHRva2VuXG4gICAgICAgIGNvbnN0IHZpZXdLZXlVcmwgPSBuZXcgVVJMKFxcYC9hcGkvdjMvY29yZS90b2tlbnMvXFwke3Rva2VuSWRlbnRpZmllcn0vdmlld19rZXkvXFxgLCBhdXRoZW50aWtIb3N0KTtcblxuICAgICAgICBjb25zdCB2aWV3S2V5UmVzdWx0ID0gYXdhaXQgZmV0Y2hKc29uKHZpZXdLZXlVcmwudG9TdHJpbmcoKSwge1xuICAgICAgICAgICAgbWV0aG9kOiAnR0VUJyxcbiAgICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICAgICAgICdBdXRob3JpemF0aW9uJzogXFxgQmVhcmVyIFxcJHthdXRoZW50aWtBcGlUb2tlbn1cXGBcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3Qgb3V0cG9zdFRva2VuID0gdmlld0tleVJlc3VsdC5rZXk7XG4gICAgICAgIGlmICghb3V0cG9zdFRva2VuKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXFxgVG9rZW4gZm9yIG91dHBvc3QgXFwke291dHBvc3ROYW1lfSBub3QgZm91bmQsIGFib3J0aW5nLi4uXFxgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBvdXRwb3N0VG9rZW47XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcXGBFcnJvciByZXRyaWV2aW5nIHRva2VuOiBcXCR7ZXJyb3IubWVzc2FnZX1cXGApO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHB1dExEQVBTZWNyZXQoc2VjcmV0TmFtZSwgc2VjcmV0VmFsdWUpIHtcbiAgICBjb25zb2xlLmxvZygnVXBkYXRpbmcgTERBUCB0b2tlbiBzZWNyZXQ6Jywgc2VjcmV0TmFtZSk7XG4gICAgXG4gICAgY29uc3QgY29tbWFuZCA9IG5ldyBQdXRTZWNyZXRWYWx1ZUNvbW1hbmQoe1xuICAgICAgICBTZWNyZXRJZDogc2VjcmV0TmFtZSxcbiAgICAgICAgU2VjcmV0U3RyaW5nOiBzZWNyZXRWYWx1ZVxuICAgIH0pO1xuICAgIFxuICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHNlY3JldHNNYW5hZ2VyLnNlbmQoY29tbWFuZCk7XG4gICAgICAgIGNvbnNvbGUubG9nKCdMREFQIHRva2VuIHNlY3JldCB1cGRhdGVkIHN1Y2Nlc3NmdWxseScpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHVwZGF0aW5nIHNlY3JldDonLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbn1cblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoZXZlbnQsIGNvbnRleHQpID0+IHtcbiAgICBjb25zb2xlLmxvZygnRXZlbnQ6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcbiAgICBcbiAgICBjb25zdCB7IFJlcXVlc3RUeXBlLCBSZXNvdXJjZVByb3BlcnRpZXMgfSA9IGV2ZW50O1xuICAgIGNvbnN0IHsgXG4gICAgICAgIEVudmlyb25tZW50LCBcbiAgICAgICAgQXV0aGVudGlrSG9zdCwgXG4gICAgICAgIE91dHBvc3ROYW1lLFxuICAgICAgICBBZG1pblNlY3JldE5hbWUsXG4gICAgICAgIExEQVBTZWNyZXROYW1lXG4gICAgfSA9IFJlc291cmNlUHJvcGVydGllcztcbiAgICBcbiAgICB0cnkge1xuICAgICAgICBpZiAoUmVxdWVzdFR5cGUgPT09ICdDcmVhdGUnIHx8IFJlcXVlc3RUeXBlID09PSAnVXBkYXRlJykge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ1Byb2Nlc3NpbmcgTERBUCB0b2tlbiByZXRyaWV2YWwuLi4nKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdFbnZpcm9ubWVudDonLCBFbnZpcm9ubWVudCk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnQXV0aGVudGlrIFVSTDonLCBBdXRoZW50aWtIb3N0KTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdPdXRwb3N0IE5hbWU6JywgT3V0cG9zdE5hbWUpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ0FkbWluIFNlY3JldCBOYW1lOicsIEFkbWluU2VjcmV0TmFtZSk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnTERBUCBTZWNyZXQgTmFtZTonLCBMREFQU2VjcmV0TmFtZSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIEdldCB0aGUgYWRtaW4gdG9rZW4gZnJvbSBBV1MgU2VjcmV0cyBNYW5hZ2VyXG4gICAgICAgICAgICBjb25zdCBhZG1pblRva2VuID0gYXdhaXQgZ2V0QWRtaW5Ub2tlbihBZG1pblNlY3JldE5hbWUpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBSZXRyaWV2ZSB0aGUgTERBUCB0b2tlbiBmcm9tIEF1dGhlbnRpa1xuICAgICAgICAgICAgY29uc3QgbGRhcFRva2VuID0gYXdhaXQgcmV0cmlldmVUb2tlbihBdXRoZW50aWtIb3N0LCBhZG1pblRva2VuLCBPdXRwb3N0TmFtZSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIFN0b3JlIHRoZSBMREFQIHRva2VuIGJhY2sgaW4gQVdTIFNlY3JldHMgTWFuYWdlclxuICAgICAgICAgICAgYXdhaXQgcHV0TERBUFNlY3JldChMREFQU2VjcmV0TmFtZSwgbGRhcFRva2VuKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgYXdhaXQgc2VuZFJlc3BvbnNlKGV2ZW50LCBjb250ZXh0LCAnU1VDQ0VTUycsIHtcbiAgICAgICAgICAgICAgICBNZXNzYWdlOiAnTERBUCB0b2tlbiByZXRyaWV2ZWQgYW5kIHVwZGF0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgICAgICAgICAgICBMREFQVG9rZW46IGxkYXBUb2tlbi5zdWJzdHJpbmcoMCwgMTApICsgJy4uLicgLy8gTG9nIG9ubHkgZmlyc3QgMTAgY2hhcnMgZm9yIHNlY3VyaXR5XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIGlmIChSZXF1ZXN0VHlwZSA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdEZWxldGUgcmVxdWVzdCAtIG5vIGFjdGlvbiBuZWVkZWQgZm9yIExEQVAgdG9rZW4gcmV0cmlldmFsJyk7XG4gICAgICAgICAgICBhd2FpdCBzZW5kUmVzcG9uc2UoZXZlbnQsIGNvbnRleHQsICdTVUNDRVNTJywge1xuICAgICAgICAgICAgICAgIE1lc3NhZ2U6ICdEZWxldGUgY29tcGxldGVkJ1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvcjonLCBlcnJvcik7XG4gICAgICAgIGF3YWl0IHNlbmRSZXNwb25zZShldmVudCwgY29udGV4dCwgJ0ZBSUxFRCcsIHtcbiAgICAgICAgICAgIE1lc3NhZ2U6IGVycm9yLm1lc3NhZ2VcbiAgICAgICAgfSk7XG4gICAgfVxufTtcbiAgICAgIGApXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIGN1c3RvbSByZXNvdXJjZSBwcm92aWRlclxuICAgIGNvbnN0IHByb3ZpZGVyID0gbGFtYmRhLkZ1bmN0aW9uLmZyb21GdW5jdGlvbkFybih0aGlzLCAnUHJvdmlkZXInLCB0aGlzLmxhbWJkYUZ1bmN0aW9uLmZ1bmN0aW9uQXJuKTtcblxuICAgIC8vIENyZWF0ZSB0aGUgY3VzdG9tIHJlc291cmNlXG4gICAgdGhpcy5jdXN0b21SZXNvdXJjZSA9IG5ldyBDdXN0b21SZXNvdXJjZSh0aGlzLCAnUmVzb3VyY2UnLCB7XG4gICAgICBzZXJ2aWNlVG9rZW46IHRoaXMubGFtYmRhRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgIEVudmlyb25tZW50OiBwcm9wcy5lbnZpcm9ubWVudCxcbiAgICAgICAgQXV0aGVudGlrSG9zdDogcHJvcHMuYXV0aGVudGlrSG9zdCxcbiAgICAgICAgT3V0cG9zdE5hbWU6IHByb3BzLm91dHBvc3ROYW1lIHx8ICdMREFQJyxcbiAgICAgICAgQWRtaW5TZWNyZXROYW1lOiBwcm9wcy5hZG1pblRva2VuU2VjcmV0LnNlY3JldE5hbWUsXG4gICAgICAgIExEQVBTZWNyZXROYW1lOiBwcm9wcy5sZGFwVG9rZW5TZWNyZXQuc2VjcmV0TmFtZSxcbiAgICAgICAgLy8gQWRkIGEgdGltZXN0YW1wIHRvIGZvcmNlIHVwZGF0ZXMgb24gZXZlcnkgZGVwbG95bWVudFxuICAgICAgICBVcGRhdGVUaW1lc3RhbXA6IHByb3BzLmdpdFNoYVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQWRkIGRlcGVuZGVuY3kgdG8gZW5zdXJlIHRoZSBjdXN0b20gcmVzb3VyY2UgcnVucyBhZnRlciB0aGUgc2VjcmV0cyBhcmUgY3JlYXRlZFxuICAgIHRoaXMuY3VzdG9tUmVzb3VyY2Uubm9kZS5hZGREZXBlbmRlbmN5KHByb3BzLmFkbWluVG9rZW5TZWNyZXQpO1xuICAgIHRoaXMuY3VzdG9tUmVzb3VyY2Uubm9kZS5hZGREZXBlbmRlbmN5KHByb3BzLmxkYXBUb2tlblNlY3JldCk7XG4gIH1cbn1cbiJdfQ==