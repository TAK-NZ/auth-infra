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
        // Add dependency to ensure the custom resource runs after ECS services are deployed
        this.customResource.node.addDependency(props.authentikServerService);
        this.customResource.node.addDependency(props.authentikWorkerService);
    }
}
exports.LdapTokenRetriever = LdapTokenRetriever;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGRhcC10b2tlbi1yZXRyaWV2ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJsZGFwLXRva2VuLXJldHJpZXZlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQTs7Ozs7OztHQU9HO0FBQ0gsMkNBQXVDO0FBQ3ZDLDZDQVlxQjtBQTBEckI7O0dBRUc7QUFDSCxNQUFhLGtCQUFtQixTQUFRLHNCQUFTO0lBVy9DLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBOEI7UUFDdEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixzREFBc0Q7UUFDdEQsTUFBTSxRQUFRLEdBQUcsSUFBSSxzQkFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFO1lBQ25ELFlBQVksRUFBRSxlQUFlLEtBQUssQ0FBQyxXQUFXLG9CQUFvQjtZQUNsRSxTQUFTLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsZ0JBQWdCO1lBQ25ELGFBQWEsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhO1NBQ2xELENBQUMsQ0FBQztRQUVILDBDQUEwQztRQUMxQyxNQUFNLFVBQVUsR0FBRyxJQUFJLHFCQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDbEQsUUFBUSxFQUFFLEdBQUcsS0FBSyxDQUFDLFdBQVcsZ0NBQWdDO1lBQzlELFNBQVMsRUFBRSxJQUFJLHFCQUFHLENBQUMsZ0JBQWdCLENBQUMsc0JBQXNCLENBQUM7WUFDM0QsZUFBZSxFQUFFO2dCQUNmLHFCQUFHLENBQUMsYUFBYSxDQUFDLHdCQUF3QixDQUFDLDBDQUEwQyxDQUFDO2FBQ3ZGO1lBQ0QsY0FBYyxFQUFFO2dCQUNkLG9CQUFvQixFQUFFLElBQUkscUJBQUcsQ0FBQyxjQUFjLENBQUM7b0JBQzNDLFVBQVUsRUFBRTt3QkFDVixJQUFJLHFCQUFHLENBQUMsZUFBZSxDQUFDOzRCQUN0QixNQUFN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S0FBSyxDQUFDLFdBQVcsSUFBSSxNQUFNO2dCQUN4QyxlQUFlLEVBQUUsS0FBSyxDQUFDLGdCQUFnQixDQUFDLFVBQVU7Z0JBQ2xELGNBQWMsRUFBRSxLQUFLLENBQUMsZUFBZSxDQUFDLFVBQVU7Z0JBQ2hELHVEQUF1RDtnQkFDdkQsZUFBZSxFQUFFLEtBQUssQ0FBQyxNQUFNO2FBQzlCO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsa0ZBQWtGO1FBQ2xGLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUMvRCxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBRTlELG9GQUFvRjtRQUNwRixJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFDckUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO0lBQ3ZFLENBQUM7Q0FDRjtBQXpURCxnREF5VEMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIExEQVAgVG9rZW4gUmV0cmlldmVyIEN1c3RvbSBSZXNvdXJjZSBDb25zdHJ1Y3RcbiAqIFxuICogVGhpcyBjb25zdHJ1Y3QgY3JlYXRlcyBhIExhbWJkYSBmdW5jdGlvbiB0aGF0IGF1dG9tYXRpY2FsbHkgcmV0cmlldmVzXG4gKiB0aGUgTERBUCBvdXRwb3N0IHRva2VuIGZyb20gQXV0aGVudGlrIGFuZCBzdG9yZXMgaXQgaW4gQVdTIFNlY3JldHMgTWFuYWdlci5cbiAqIFRoaXMgaXMgbmVjZXNzYXJ5IGJlY2F1c2UgdGhlIExEQVAgb3V0cG9zdCBuZWVkcyB0aGUgdG9rZW4gdG8gY29ubmVjdCB0byBBdXRoZW50aWssXG4gKiBidXQgdGhlIHRva2VuIGNhbiBvbmx5IGJlIHJldHJpZXZlZCBhZnRlciBBdXRoZW50aWsgaXMgZnVsbHkgcnVubmluZy5cbiAqL1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQge1xuICBhd3NfbGFtYmRhIGFzIGxhbWJkYSxcbiAgYXdzX2lhbSBhcyBpYW0sXG4gIGF3c19sb2dzIGFzIGxvZ3MsXG4gIGF3c19zZWNyZXRzbWFuYWdlciBhcyBzZWNyZXRzbWFuYWdlcixcbiAgYXdzX2ttcyBhcyBrbXMsXG4gIGF3c19lY3MgYXMgZWNzLFxuICBDdXN0b21SZXNvdXJjZSxcbiAgRHVyYXRpb24sXG4gIFJlbW92YWxQb2xpY3ksXG4gIFN0YWNrLFxuICBGblxufSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgdHlwZSB7IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi4vZW52aXJvbm1lbnQtY29uZmlnJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciB0aGUgTERBUCBUb2tlbiBSZXRyaWV2ZXIgY29uc3RydWN0XG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgTGRhcFRva2VuUmV0cmlldmVyUHJvcHMge1xuICAvKipcbiAgICogRW52aXJvbm1lbnQgbmFtZSAoZS5nLiAncHJvZCcsICdkZXYnLCBldGMuKVxuICAgKi9cbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcblxuICAvKipcbiAgICogRW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxuICAgKi9cbiAgY29uZmlnOiBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZztcblxuICAvKipcbiAgICogS01TIGtleSBmb3IgZW5jcnlwdGlvblxuICAgKi9cbiAga21zS2V5OiBrbXMuSUtleTtcblxuICAvKipcbiAgICogQXV0aGVudGlrIGhvc3QgVVJMXG4gICAqL1xuICBhdXRoZW50aWtIb3N0OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIE5hbWUgb2YgdGhlIExEQVAgb3V0cG9zdCBpbiBBdXRoZW50aWtcbiAgICovXG4gIG91dHBvc3ROYW1lPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBBZG1pbiB0b2tlbiBzZWNyZXQgZm9yIGFjY2Vzc2luZyBBdXRoZW50aWsgQVBJXG4gICAqL1xuICBhZG1pblRva2VuU2VjcmV0OiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xuXG4gIC8qKlxuICAgKiBMREFQIHRva2VuIHNlY3JldCB0byB1cGRhdGVcbiAgICovXG4gIGxkYXBUb2tlblNlY3JldDogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcblxuICAvKipcbiAgICogR2l0IFNIQSBmb3IgdmVyc2lvbmluZ1xuICAgKi9cbiAgZ2l0U2hhOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEF1dGhlbnRpayBzZXJ2ZXIgRUNTIHNlcnZpY2UgKHRvIGVuc3VyZSBpdCdzIHJ1bm5pbmcgYmVmb3JlIHRva2VuIHJldHJpZXZhbClcbiAgICovXG4gIGF1dGhlbnRpa1NlcnZlclNlcnZpY2U6IGVjcy5GYXJnYXRlU2VydmljZTtcblxuICAvKipcbiAgICogQXV0aGVudGlrIHdvcmtlciBFQ1Mgc2VydmljZSAodG8gZW5zdXJlIGl0J3MgcnVubmluZyBiZWZvcmUgdG9rZW4gcmV0cmlldmFsKVxuICAgKi9cbiAgYXV0aGVudGlrV29ya2VyU2VydmljZTogZWNzLkZhcmdhdGVTZXJ2aWNlO1xufVxuXG4vKipcbiAqIExEQVAgVG9rZW4gUmV0cmlldmVyIGNvbnN0cnVjdFxuICovXG5leHBvcnQgY2xhc3MgTGRhcFRva2VuUmV0cmlldmVyIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgLyoqXG4gICAqIFRoZSBMYW1iZGEgZnVuY3Rpb24gdGhhdCByZXRyaWV2ZXMgTERBUCB0b2tlbnNcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBsYW1iZGFGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuXG4gIC8qKlxuICAgKiBUaGUgY3VzdG9tIHJlc291cmNlIHRoYXQgdHJpZ2dlcnMgdGhlIExhbWJkYVxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGN1c3RvbVJlc291cmNlOiBDdXN0b21SZXNvdXJjZTtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogTGRhcFRva2VuUmV0cmlldmVyUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gQ3JlYXRlIENsb3VkV2F0Y2ggbG9nIGdyb3VwIGZvciB0aGUgTGFtYmRhIGZ1bmN0aW9uXG4gICAgY29uc3QgbG9nR3JvdXAgPSBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnTG9nR3JvdXAnLCB7XG4gICAgICBsb2dHcm91cE5hbWU6IGAvYXdzL2xhbWJkYS8ke3Byb3BzLmVudmlyb25tZW50fS11cGRhdGUtbGRhcC10b2tlbmAsXG4gICAgICByZXRlbnRpb246IHByb3BzLmNvbmZpZy5tb25pdG9yaW5nLmxvZ1JldGVudGlvbkRheXMsXG4gICAgICByZW1vdmFsUG9saWN5OiBwcm9wcy5jb25maWcuZ2VuZXJhbC5yZW1vdmFsUG9saWN5XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgSUFNIHJvbGUgZm9yIHRoZSBMYW1iZGEgZnVuY3Rpb25cbiAgICBjb25zdCBsYW1iZGFSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdMYW1iZGFSb2xlJywge1xuICAgICAgcm9sZU5hbWU6IGAke3Byb3BzLmVudmlyb25tZW50fS11cGRhdGUtbGRhcC10b2tlbi1sYW1iZGEtcm9sZWAsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKVxuICAgICAgXSxcbiAgICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgIFNlY3JldHNNYW5hZ2VyQWNjZXNzOiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdzZWNyZXRzbWFuYWdlcjpVcGRhdGVTZWNyZXQnLFxuICAgICAgICAgICAgICAgICdzZWNyZXRzbWFuYWdlcjpQdXRTZWNyZXRWYWx1ZScsXG4gICAgICAgICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOkdldFNlY3JldFZhbHVlJ1xuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgICAgICBwcm9wcy5hZG1pblRva2VuU2VjcmV0LnNlY3JldEFybixcbiAgICAgICAgICAgICAgICBwcm9wcy5sZGFwVG9rZW5TZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgICAgICAgICAgIC8vIExlZ2FjeSBzZWNyZXQgcGF0dGVybnMgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHlcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpzZWNyZXRzbWFuYWdlcjoke1N0YWNrLm9mKHRoaXMpLnJlZ2lvbn06JHtTdGFjay5vZih0aGlzKS5hY2NvdW50fTpzZWNyZXQ6Y29lLWF1dGgtKmAsXG4gICAgICAgICAgICAgICAgYGFybjphd3M6c2VjcmV0c21hbmFnZXI6JHtTdGFjay5vZih0aGlzKS5yZWdpb259OiR7U3RhY2sub2YodGhpcykuYWNjb3VudH06c2VjcmV0OiR7cHJvcHMuZW52aXJvbm1lbnR9L2F1dGhlbnRpay1hZG1pbi10b2tlbipgLFxuICAgICAgICAgICAgICAgIGBhcm46YXdzOnNlY3JldHNtYW5hZ2VyOiR7U3RhY2sub2YodGhpcykucmVnaW9ufToke1N0YWNrLm9mKHRoaXMpLmFjY291bnR9OnNlY3JldDoke3Byb3BzLmVudmlyb25tZW50fS9hdXRoZW50aWstbGRhcC10b2tlbipgXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAna21zOkVuY3J5cHQnLFxuICAgICAgICAgICAgICAgICdrbXM6RGVjcnlwdCcsXG4gICAgICAgICAgICAgICAgJ2ttczpSZUVuY3J5cHRGcm9tJyxcbiAgICAgICAgICAgICAgICAna21zOlJlRW5jcnlwdFRvJyxcbiAgICAgICAgICAgICAgICAna21zOkdlbmVyYXRlRGF0YUtleScsXG4gICAgICAgICAgICAgICAgJ2ttczpHZW5lcmF0ZURhdGFLZXlXaXRob3V0UGxhaW50ZXh0JyxcbiAgICAgICAgICAgICAgICAna21zOkRlc2NyaWJlS2V5J1xuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtwcm9wcy5rbXNLZXkua2V5QXJuXVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICBdXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIExhbWJkYSBmdW5jdGlvblxuICAgIHRoaXMubGFtYmRhRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYCR7cHJvcHMuZW52aXJvbm1lbnR9LXVwZGF0ZS1sZGFwLXRva2VuYCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMl9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICBsb2dHcm91cDogbG9nR3JvdXAsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBOT0RFX09QVElPTlM6ICctLWVuYWJsZS1zb3VyY2UtbWFwcydcbiAgICAgIH0sXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tSW5saW5lKGBcbmltcG9ydCB7IFNlY3JldHNNYW5hZ2VyQ2xpZW50LCBHZXRTZWNyZXRWYWx1ZUNvbW1hbmQsIFB1dFNlY3JldFZhbHVlQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zZWNyZXRzLW1hbmFnZXInO1xuaW1wb3J0IGh0dHBzIGZyb20gJ2h0dHBzJztcbmltcG9ydCBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0IHsgVVJMIH0gZnJvbSAndXJsJztcblxuY29uc3Qgc2VjcmV0c01hbmFnZXIgPSBuZXcgU2VjcmV0c01hbmFnZXJDbGllbnQoe30pO1xuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gc2VuZCBDbG91ZEZvcm1hdGlvbiByZXNwb25zZVxuYXN5bmMgZnVuY3Rpb24gc2VuZFJlc3BvbnNlKGV2ZW50LCBjb250ZXh0LCByZXNwb25zZVN0YXR1cywgcmVzcG9uc2VEYXRhID0ge30sIHBoeXNpY2FsUmVzb3VyY2VJZCA9IG51bGwpIHtcbiAgICBjb25zdCByZXNwb25zZUJvZHkgPSBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIFN0YXR1czogcmVzcG9uc2VTdGF0dXMsXG4gICAgICAgIFJlYXNvbjogXFxgU2VlIHRoZSBkZXRhaWxzIGluIENsb3VkV2F0Y2ggTG9nIFN0cmVhbTogXFwke2NvbnRleHQubG9nU3RyZWFtTmFtZX1cXGAsXG4gICAgICAgIFBoeXNpY2FsUmVzb3VyY2VJZDogcGh5c2ljYWxSZXNvdXJjZUlkIHx8IGNvbnRleHQubG9nU3RyZWFtTmFtZSxcbiAgICAgICAgU3RhY2tJZDogZXZlbnQuU3RhY2tJZCxcbiAgICAgICAgUmVxdWVzdElkOiBldmVudC5SZXF1ZXN0SWQsXG4gICAgICAgIExvZ2ljYWxSZXNvdXJjZUlkOiBldmVudC5Mb2dpY2FsUmVzb3VyY2VJZCxcbiAgICAgICAgRGF0YTogcmVzcG9uc2VEYXRhXG4gICAgfSk7XG5cbiAgICBjb25zdCBwYXJzZWRVcmwgPSBuZXcgVVJMKGV2ZW50LlJlc3BvbnNlVVJMKTtcbiAgICBjb25zdCBvcHRpb25zID0ge1xuICAgICAgICBob3N0bmFtZTogcGFyc2VkVXJsLmhvc3RuYW1lLFxuICAgICAgICBwb3J0OiA0NDMsXG4gICAgICAgIHBhdGg6IHBhcnNlZFVybC5wYXRobmFtZSArIHBhcnNlZFVybC5zZWFyY2gsXG4gICAgICAgIG1ldGhvZDogJ1BVVCcsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICdjb250ZW50LXR5cGUnOiAnJyxcbiAgICAgICAgICAgICdjb250ZW50LWxlbmd0aCc6IHJlc3BvbnNlQm9keS5sZW5ndGhcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICBjb25zdCByZXF1ZXN0ID0gaHR0cHMucmVxdWVzdChvcHRpb25zLCAocmVzcG9uc2UpID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFxcYFN0YXR1cyBjb2RlOiBcXCR7cmVzcG9uc2Uuc3RhdHVzQ29kZX1cXGApO1xuICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIHJlcXVlc3Qub24oJ2Vycm9yJywgKGVycm9yKSA9PiB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcXGBzZW5kKC4uKSBmYWlsZWQgZXhlY3V0aW5nIGh0dHBzLnJlcXVlc3QoLi4pOlxcYCwgZXJyb3IpO1xuICAgICAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICByZXF1ZXN0LndyaXRlKHJlc3BvbnNlQm9keSk7XG4gICAgICAgIHJlcXVlc3QuZW5kKCk7XG4gICAgfSk7XG59XG5cbi8vIEhlbHBlciBmdW5jdGlvbiB0byBmZXRjaCBKU09OIGRhdGFcbmFzeW5jIGZ1bmN0aW9uIGZldGNoSnNvbih1cmwsIG9wdGlvbnMpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICBjb25zdCB1cmxPYmogPSBuZXcgVVJMKHVybCk7XG4gICAgICAgIGNvbnN0IGxpYiA9IHVybE9iai5wcm90b2NvbCA9PT0gJ2h0dHBzOicgPyBodHRwcyA6IGh0dHA7XG4gICAgICAgIFxuICAgICAgICBjb25zdCByZXEgPSBsaWIucmVxdWVzdCh1cmwsIHtcbiAgICAgICAgICAgIG1ldGhvZDogb3B0aW9ucy5tZXRob2QgfHwgJ0dFVCcsXG4gICAgICAgICAgICBoZWFkZXJzOiBvcHRpb25zLmhlYWRlcnMgfHwge31cbiAgICAgICAgfSwgKHJlcykgPT4ge1xuICAgICAgICAgICAgbGV0IGRhdGEgPSAnJztcbiAgICAgICAgICAgIHJlcy5vbignZGF0YScsIGNodW5rID0+IGRhdGEgKz0gY2h1bmspO1xuICAgICAgICAgICAgcmVzLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID49IDIwMCAmJiByZXMuc3RhdHVzQ29kZSA8IDMwMCkge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShKU09OLnBhcnNlKGRhdGEpKTtcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihcXGBJbnZhbGlkIEpTT04gcmVzcG9uc2U6IFxcJHtlLm1lc3NhZ2V9XFxgKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKFxcYEhUVFAgZXJyb3IhIHN0YXR1czogXFwke3Jlcy5zdGF0dXNDb2RlfVxcYCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIHJlcS5vbignZXJyb3InLCByZWplY3QpO1xuICAgICAgICByZXEuZW5kKCk7XG4gICAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldEFkbWluVG9rZW4oYWRtaW5TZWNyZXROYW1lKSB7XG4gICAgY29uc29sZS5sb2coJ0dldHRpbmcgYWRtaW4gdG9rZW4gZnJvbSBzZWNyZXQ6JywgYWRtaW5TZWNyZXROYW1lKTtcbiAgICBcbiAgICBjb25zdCBjb21tYW5kID0gbmV3IEdldFNlY3JldFZhbHVlQ29tbWFuZCh7XG4gICAgICAgIFNlY3JldElkOiBhZG1pblNlY3JldE5hbWVcbiAgICB9KTtcbiAgICBcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHNlY3JldHNNYW5hZ2VyLnNlbmQoY29tbWFuZCk7XG4gICAgcmV0dXJuIHJlc3BvbnNlLlNlY3JldFN0cmluZztcbn1cblxuYXN5bmMgZnVuY3Rpb24gcmV0cmlldmVUb2tlbihhdXRoZW50aWtIb3N0LCBhdXRoZW50aWtBcGlUb2tlbiwgb3V0cG9zdE5hbWUpIHtcbiAgICBvdXRwb3N0TmFtZSA9IG91dHBvc3ROYW1lIHx8ICdMREFQJztcbiAgICBcbiAgICB0cnkge1xuICAgICAgICAvLyBGZXRjaCBvdXRwb3N0IGluc3RhbmNlcyBmcm9tIEFQSVxuICAgICAgICBjb25zdCBvdXRwb3N0SW5zdGFuY2VzVXJsID0gbmV3IFVSTCgnL2FwaS92My9vdXRwb3N0cy9pbnN0YW5jZXMvJywgYXV0aGVudGlrSG9zdCk7XG4gICAgICAgIG91dHBvc3RJbnN0YW5jZXNVcmwuc2VhcmNoUGFyYW1zLmFwcGVuZCgnbmFtZV9faWV4YWN0Jywgb3V0cG9zdE5hbWUpO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKCdGZXRjaGluZyBvdXRwb3N0IGluc3RhbmNlcyBmcm9tOicsIG91dHBvc3RJbnN0YW5jZXNVcmwudG9TdHJpbmcoKSk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBvdXRwb3N0SW5zdGFuY2VzID0gYXdhaXQgZmV0Y2hKc29uKG91dHBvc3RJbnN0YW5jZXNVcmwudG9TdHJpbmcoKSwge1xuICAgICAgICAgICAgbWV0aG9kOiAnR0VUJyxcbiAgICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICAgICAgICdBdXRob3JpemF0aW9uJzogXFxgQmVhcmVyIFxcJHthdXRoZW50aWtBcGlUb2tlbn1cXGBcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgd2UgZm91bmQgdGhlIG91dHBvc3RcbiAgICAgICAgY29uc3QgcmVzdWx0cyA9IG91dHBvc3RJbnN0YW5jZXMucmVzdWx0cyB8fCBbXTtcbiAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXFxgT3V0cG9zdCB3aXRoIG5hbWUgXFwke291dHBvc3ROYW1lfSBub3QgZm91bmQsIGFib3J0aW5nLi4uXFxgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEV4dHJhY3QgdGhlIHRva2VuIGlkZW50aWZpZXJcbiAgICAgICAgY29uc3Qgb3V0cG9zdCA9IHJlc3VsdHMuZmluZCgoaXRlbSkgPT4gaXRlbS5uYW1lID09PSBvdXRwb3N0TmFtZSk7XG4gICAgICAgIGlmICghb3V0cG9zdCB8fCAhb3V0cG9zdC50b2tlbl9pZGVudGlmaWVyKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXFxgVG9rZW4gaWRlbnRpZmllciBmb3Igb3V0cG9zdCBcXCR7b3V0cG9zdE5hbWV9IG5vdCBmb3VuZCwgYWJvcnRpbmcuLi5cXGApO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdG9rZW5JZGVudGlmaWVyID0gb3V0cG9zdC50b2tlbl9pZGVudGlmaWVyO1xuICAgICAgICBjb25zb2xlLmxvZygnRm91bmQgdG9rZW4gaWRlbnRpZmllcjonLCB0b2tlbklkZW50aWZpZXIpO1xuXG4gICAgICAgIC8vIEZldGNoIHRoZSB0b2tlblxuICAgICAgICBjb25zdCB2aWV3S2V5VXJsID0gbmV3IFVSTChcXGAvYXBpL3YzL2NvcmUvdG9rZW5zL1xcJHt0b2tlbklkZW50aWZpZXJ9L3ZpZXdfa2V5L1xcYCwgYXV0aGVudGlrSG9zdCk7XG5cbiAgICAgICAgY29uc3Qgdmlld0tleVJlc3VsdCA9IGF3YWl0IGZldGNoSnNvbih2aWV3S2V5VXJsLnRvU3RyaW5nKCksIHtcbiAgICAgICAgICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAgICAgJ0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAgICAgICAnQXV0aG9yaXphdGlvbic6IFxcYEJlYXJlciBcXCR7YXV0aGVudGlrQXBpVG9rZW59XFxgXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IG91dHBvc3RUb2tlbiA9IHZpZXdLZXlSZXN1bHQua2V5O1xuICAgICAgICBpZiAoIW91dHBvc3RUb2tlbikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxcYFRva2VuIGZvciBvdXRwb3N0IFxcJHtvdXRwb3N0TmFtZX0gbm90IGZvdW5kLCBhYm9ydGluZy4uLlxcYCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gb3V0cG9zdFRva2VuO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXFxgRXJyb3IgcmV0cmlldmluZyB0b2tlbjogXFwke2Vycm9yLm1lc3NhZ2V9XFxgKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBwdXRMREFQU2VjcmV0KHNlY3JldE5hbWUsIHNlY3JldFZhbHVlKSB7XG4gICAgY29uc29sZS5sb2coJ1VwZGF0aW5nIExEQVAgdG9rZW4gc2VjcmV0OicsIHNlY3JldE5hbWUpO1xuICAgIFxuICAgIGNvbnN0IGNvbW1hbmQgPSBuZXcgUHV0U2VjcmV0VmFsdWVDb21tYW5kKHtcbiAgICAgICAgU2VjcmV0SWQ6IHNlY3JldE5hbWUsXG4gICAgICAgIFNlY3JldFN0cmluZzogc2VjcmV0VmFsdWVcbiAgICB9KTtcbiAgICBcbiAgICB0cnkge1xuICAgICAgICBhd2FpdCBzZWNyZXRzTWFuYWdlci5zZW5kKGNvbW1hbmQpO1xuICAgICAgICBjb25zb2xlLmxvZygnTERBUCB0b2tlbiBzZWNyZXQgdXBkYXRlZCBzdWNjZXNzZnVsbHknKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciB1cGRhdGluZyBzZWNyZXQ6JywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG59XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKGV2ZW50LCBjb250ZXh0KSA9PiB7XG4gICAgY29uc29sZS5sb2coJ0V2ZW50OicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCAyKSk7XG4gICAgXG4gICAgY29uc3QgeyBSZXF1ZXN0VHlwZSwgUmVzb3VyY2VQcm9wZXJ0aWVzIH0gPSBldmVudDtcbiAgICBjb25zdCB7IFxuICAgICAgICBFbnZpcm9ubWVudCwgXG4gICAgICAgIEF1dGhlbnRpa0hvc3QsIFxuICAgICAgICBPdXRwb3N0TmFtZSxcbiAgICAgICAgQWRtaW5TZWNyZXROYW1lLFxuICAgICAgICBMREFQU2VjcmV0TmFtZVxuICAgIH0gPSBSZXNvdXJjZVByb3BlcnRpZXM7XG4gICAgXG4gICAgdHJ5IHtcbiAgICAgICAgaWYgKFJlcXVlc3RUeXBlID09PSAnQ3JlYXRlJyB8fCBSZXF1ZXN0VHlwZSA9PT0gJ1VwZGF0ZScpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdQcm9jZXNzaW5nIExEQVAgdG9rZW4gcmV0cmlldmFsLi4uJyk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnRW52aXJvbm1lbnQ6JywgRW52aXJvbm1lbnQpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ0F1dGhlbnRpayBVUkw6JywgQXV0aGVudGlrSG9zdCk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnT3V0cG9zdCBOYW1lOicsIE91dHBvc3ROYW1lKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdBZG1pbiBTZWNyZXQgTmFtZTonLCBBZG1pblNlY3JldE5hbWUpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ0xEQVAgU2VjcmV0IE5hbWU6JywgTERBUFNlY3JldE5hbWUpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBHZXQgdGhlIGFkbWluIHRva2VuIGZyb20gQVdTIFNlY3JldHMgTWFuYWdlclxuICAgICAgICAgICAgY29uc3QgYWRtaW5Ub2tlbiA9IGF3YWl0IGdldEFkbWluVG9rZW4oQWRtaW5TZWNyZXROYW1lKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gUmV0cmlldmUgdGhlIExEQVAgdG9rZW4gZnJvbSBBdXRoZW50aWtcbiAgICAgICAgICAgIGNvbnN0IGxkYXBUb2tlbiA9IGF3YWl0IHJldHJpZXZlVG9rZW4oQXV0aGVudGlrSG9zdCwgYWRtaW5Ub2tlbiwgT3V0cG9zdE5hbWUpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBTdG9yZSB0aGUgTERBUCB0b2tlbiBiYWNrIGluIEFXUyBTZWNyZXRzIE1hbmFnZXJcbiAgICAgICAgICAgIGF3YWl0IHB1dExEQVBTZWNyZXQoTERBUFNlY3JldE5hbWUsIGxkYXBUb2tlbik7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGF3YWl0IHNlbmRSZXNwb25zZShldmVudCwgY29udGV4dCwgJ1NVQ0NFU1MnLCB7XG4gICAgICAgICAgICAgICAgTWVzc2FnZTogJ0xEQVAgdG9rZW4gcmV0cmlldmVkIGFuZCB1cGRhdGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgICAgICAgICAgICAgTERBUFRva2VuOiBsZGFwVG9rZW4uc3Vic3RyaW5nKDAsIDEwKSArICcuLi4nIC8vIExvZyBvbmx5IGZpcnN0IDEwIGNoYXJzIGZvciBzZWN1cml0eVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSBpZiAoUmVxdWVzdFR5cGUgPT09ICdEZWxldGUnKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnRGVsZXRlIHJlcXVlc3QgLSBubyBhY3Rpb24gbmVlZGVkIGZvciBMREFQIHRva2VuIHJldHJpZXZhbCcpO1xuICAgICAgICAgICAgYXdhaXQgc2VuZFJlc3BvbnNlKGV2ZW50LCBjb250ZXh0LCAnU1VDQ0VTUycsIHtcbiAgICAgICAgICAgICAgICBNZXNzYWdlOiAnRGVsZXRlIGNvbXBsZXRlZCdcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3I6JywgZXJyb3IpO1xuICAgICAgICBhd2FpdCBzZW5kUmVzcG9uc2UoZXZlbnQsIGNvbnRleHQsICdGQUlMRUQnLCB7XG4gICAgICAgICAgICBNZXNzYWdlOiBlcnJvci5tZXNzYWdlXG4gICAgICAgIH0pO1xuICAgIH1cbn07XG4gICAgICBgKVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBjdXN0b20gcmVzb3VyY2UgcHJvdmlkZXJcbiAgICBjb25zdCBwcm92aWRlciA9IGxhbWJkYS5GdW5jdGlvbi5mcm9tRnVuY3Rpb25Bcm4odGhpcywgJ1Byb3ZpZGVyJywgdGhpcy5sYW1iZGFGdW5jdGlvbi5mdW5jdGlvbkFybik7XG5cbiAgICAvLyBDcmVhdGUgdGhlIGN1c3RvbSByZXNvdXJjZVxuICAgIHRoaXMuY3VzdG9tUmVzb3VyY2UgPSBuZXcgQ3VzdG9tUmVzb3VyY2UodGhpcywgJ1Jlc291cmNlJywge1xuICAgICAgc2VydmljZVRva2VuOiB0aGlzLmxhbWJkYUZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgcHJvcGVydGllczoge1xuICAgICAgICBFbnZpcm9ubWVudDogcHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICAgIEF1dGhlbnRpa0hvc3Q6IHByb3BzLmF1dGhlbnRpa0hvc3QsXG4gICAgICAgIE91dHBvc3ROYW1lOiBwcm9wcy5vdXRwb3N0TmFtZSB8fCAnTERBUCcsXG4gICAgICAgIEFkbWluU2VjcmV0TmFtZTogcHJvcHMuYWRtaW5Ub2tlblNlY3JldC5zZWNyZXROYW1lLFxuICAgICAgICBMREFQU2VjcmV0TmFtZTogcHJvcHMubGRhcFRva2VuU2VjcmV0LnNlY3JldE5hbWUsXG4gICAgICAgIC8vIEFkZCBhIHRpbWVzdGFtcCB0byBmb3JjZSB1cGRhdGVzIG9uIGV2ZXJ5IGRlcGxveW1lbnRcbiAgICAgICAgVXBkYXRlVGltZXN0YW1wOiBwcm9wcy5naXRTaGFcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEFkZCBkZXBlbmRlbmN5IHRvIGVuc3VyZSB0aGUgY3VzdG9tIHJlc291cmNlIHJ1bnMgYWZ0ZXIgdGhlIHNlY3JldHMgYXJlIGNyZWF0ZWRcbiAgICB0aGlzLmN1c3RvbVJlc291cmNlLm5vZGUuYWRkRGVwZW5kZW5jeShwcm9wcy5hZG1pblRva2VuU2VjcmV0KTtcbiAgICB0aGlzLmN1c3RvbVJlc291cmNlLm5vZGUuYWRkRGVwZW5kZW5jeShwcm9wcy5sZGFwVG9rZW5TZWNyZXQpO1xuICAgIFxuICAgIC8vIEFkZCBkZXBlbmRlbmN5IHRvIGVuc3VyZSB0aGUgY3VzdG9tIHJlc291cmNlIHJ1bnMgYWZ0ZXIgRUNTIHNlcnZpY2VzIGFyZSBkZXBsb3llZFxuICAgIHRoaXMuY3VzdG9tUmVzb3VyY2Uubm9kZS5hZGREZXBlbmRlbmN5KHByb3BzLmF1dGhlbnRpa1NlcnZlclNlcnZpY2UpO1xuICAgIHRoaXMuY3VzdG9tUmVzb3VyY2Uubm9kZS5hZGREZXBlbmRlbmN5KHByb3BzLmF1dGhlbnRpa1dvcmtlclNlcnZpY2UpO1xuICB9XG59XG4iXX0=