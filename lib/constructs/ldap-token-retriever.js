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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGRhcC10b2tlbi1yZXRyaWV2ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJsZGFwLXRva2VuLXJldHJpZXZlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQTs7Ozs7OztHQU9HO0FBQ0gsMkNBQXVDO0FBQ3ZDLDZDQVlxQjtBQTBEckI7O0dBRUc7QUFDSCxNQUFhLGtCQUFtQixTQUFRLHNCQUFTO0lBVy9DLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBOEI7UUFDdEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixzREFBc0Q7UUFDdEQsTUFBTSxRQUFRLEdBQUcsSUFBSSxzQkFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFO1lBQ25ELFlBQVksRUFBRSxtQkFBbUIsS0FBSyxDQUFDLFdBQVcsOEJBQThCO1lBQ2hGLFNBQVMsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0I7WUFDbkQsYUFBYSxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLGFBQWE7U0FDbEQsQ0FBQyxDQUFDO1FBRUgsMENBQTBDO1FBQzFDLE1BQU0sVUFBVSxHQUFHLElBQUkscUJBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNsRCxRQUFRLEVBQUUsT0FBTyxLQUFLLENBQUMsV0FBVywwQ0FBMEM7WUFDNUUsU0FBUyxFQUFFLElBQUkscUJBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxzQkFBc0IsQ0FBQztZQUMzRCxlQUFlLEVBQUU7Z0JBQ2YscUJBQUcsQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQUMsMENBQTBDLENBQUM7YUFDdkY7WUFDRCxjQUFjLEVBQUU7Z0JBQ2Qsb0JBQW9CLEVBQUUsSUFBSSxxQkFBRyxDQUFDLGNBQWMsQ0FBQztvQkFDM0MsVUFBVSxFQUFFO3dCQUNWLElBQUkscUJBQUcsQ0FBQyxlQUFlLENBQUM7NEJBQ3RCLE1B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RSxLQUFLLENBQUMsV0FBVyxJQUFJLE1BQU07Z0JBQ3hDLGVBQWUsRUFBRSxLQUFLLENBQUMsZ0JBQWdCLENBQUMsVUFBVTtnQkFDbEQsY0FBYyxFQUFFLEtBQUssQ0FBQyxlQUFlLENBQUMsVUFBVTtnQkFDaEQsdURBQXVEO2dCQUN2RCxlQUFlLEVBQUUsS0FBSyxDQUFDLE1BQU07YUFDOUI7U0FDRixDQUFDLENBQUM7UUFFSCxrRkFBa0Y7UUFDbEYsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQy9ELElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLENBQUM7UUFFOUQsb0ZBQW9GO1FBQ3BGLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUNyRSxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLHNCQUFzQixDQUFDLENBQUM7SUFDdkUsQ0FBQztDQUNGO0FBelRELGdEQXlUQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogTERBUCBUb2tlbiBSZXRyaWV2ZXIgQ3VzdG9tIFJlc291cmNlIENvbnN0cnVjdFxuICogXG4gKiBUaGlzIGNvbnN0cnVjdCBjcmVhdGVzIGEgTGFtYmRhIGZ1bmN0aW9uIHRoYXQgYXV0b21hdGljYWxseSByZXRyaWV2ZXNcbiAqIHRoZSBMREFQIG91dHBvc3QgdG9rZW4gZnJvbSBBdXRoZW50aWsgYW5kIHN0b3JlcyBpdCBpbiBBV1MgU2VjcmV0cyBNYW5hZ2VyLlxuICogVGhpcyBpcyBuZWNlc3NhcnkgYmVjYXVzZSB0aGUgTERBUCBvdXRwb3N0IG5lZWRzIHRoZSB0b2tlbiB0byBjb25uZWN0IHRvIEF1dGhlbnRpayxcbiAqIGJ1dCB0aGUgdG9rZW4gY2FuIG9ubHkgYmUgcmV0cmlldmVkIGFmdGVyIEF1dGhlbnRpayBpcyBmdWxseSBydW5uaW5nLlxuICovXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7XG4gIGF3c19sYW1iZGEgYXMgbGFtYmRhLFxuICBhd3NfaWFtIGFzIGlhbSxcbiAgYXdzX2xvZ3MgYXMgbG9ncyxcbiAgYXdzX3NlY3JldHNtYW5hZ2VyIGFzIHNlY3JldHNtYW5hZ2VyLFxuICBhd3Nfa21zIGFzIGttcyxcbiAgYXdzX2VjcyBhcyBlY3MsXG4gIEN1c3RvbVJlc291cmNlLFxuICBEdXJhdGlvbixcbiAgUmVtb3ZhbFBvbGljeSxcbiAgU3RhY2ssXG4gIEZuXG59IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB0eXBlIHsgQXV0aEluZnJhRW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuLi9lbnZpcm9ubWVudC1jb25maWcnO1xuXG4vKipcbiAqIFByb3BlcnRpZXMgZm9yIHRoZSBMREFQIFRva2VuIFJldHJpZXZlciBjb25zdHJ1Y3RcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBMZGFwVG9rZW5SZXRyaWV2ZXJQcm9wcyB7XG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBuYW1lIChlLmcuICdwcm9kJywgJ2RldicsIGV0Yy4pXG4gICAqL1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBjb25maWd1cmF0aW9uXG4gICAqL1xuICBjb25maWc6IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnO1xuXG4gIC8qKlxuICAgKiBLTVMga2V5IGZvciBlbmNyeXB0aW9uXG4gICAqL1xuICBrbXNLZXk6IGttcy5JS2V5O1xuXG4gIC8qKlxuICAgKiBBdXRoZW50aWsgaG9zdCBVUkxcbiAgICovXG4gIGF1dGhlbnRpa0hvc3Q6IHN0cmluZztcblxuICAvKipcbiAgICogTmFtZSBvZiB0aGUgTERBUCBvdXRwb3N0IGluIEF1dGhlbnRpa1xuICAgKi9cbiAgb3V0cG9zdE5hbWU/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEFkbWluIHRva2VuIHNlY3JldCBmb3IgYWNjZXNzaW5nIEF1dGhlbnRpayBBUElcbiAgICovXG4gIGFkbWluVG9rZW5TZWNyZXQ6IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG5cbiAgLyoqXG4gICAqIExEQVAgdG9rZW4gc2VjcmV0IHRvIHVwZGF0ZVxuICAgKi9cbiAgbGRhcFRva2VuU2VjcmV0OiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xuXG4gIC8qKlxuICAgKiBHaXQgU0hBIGZvciB2ZXJzaW9uaW5nXG4gICAqL1xuICBnaXRTaGE6IHN0cmluZztcblxuICAvKipcbiAgICogQXV0aGVudGlrIHNlcnZlciBFQ1Mgc2VydmljZSAodG8gZW5zdXJlIGl0J3MgcnVubmluZyBiZWZvcmUgdG9rZW4gcmV0cmlldmFsKVxuICAgKi9cbiAgYXV0aGVudGlrU2VydmVyU2VydmljZTogZWNzLkZhcmdhdGVTZXJ2aWNlO1xuXG4gIC8qKlxuICAgKiBBdXRoZW50aWsgd29ya2VyIEVDUyBzZXJ2aWNlICh0byBlbnN1cmUgaXQncyBydW5uaW5nIGJlZm9yZSB0b2tlbiByZXRyaWV2YWwpXG4gICAqL1xuICBhdXRoZW50aWtXb3JrZXJTZXJ2aWNlOiBlY3MuRmFyZ2F0ZVNlcnZpY2U7XG59XG5cbi8qKlxuICogTERBUCBUb2tlbiBSZXRyaWV2ZXIgY29uc3RydWN0XG4gKi9cbmV4cG9ydCBjbGFzcyBMZGFwVG9rZW5SZXRyaWV2ZXIgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICAvKipcbiAgICogVGhlIExhbWJkYSBmdW5jdGlvbiB0aGF0IHJldHJpZXZlcyBMREFQIHRva2Vuc1xuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGxhbWJkYUZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG5cbiAgLyoqXG4gICAqIFRoZSBjdXN0b20gcmVzb3VyY2UgdGhhdCB0cmlnZ2VycyB0aGUgTGFtYmRhXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgY3VzdG9tUmVzb3VyY2U6IEN1c3RvbVJlc291cmNlO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBMZGFwVG9rZW5SZXRyaWV2ZXJQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICAvLyBDcmVhdGUgQ2xvdWRXYXRjaCBsb2cgZ3JvdXAgZm9yIHRoZSBMYW1iZGEgZnVuY3Rpb25cbiAgICBjb25zdCBsb2dHcm91cCA9IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdMb2dHcm91cCcsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogYC9hd3MvbGFtYmRhL1RBSy0ke3Byb3BzLmVudmlyb25tZW50fS1BdXRoSW5mcmEtdXBkYXRlLWxkYXAtdG9rZW5gLFxuICAgICAgcmV0ZW50aW9uOiBwcm9wcy5jb25maWcubW9uaXRvcmluZy5sb2dSZXRlbnRpb25EYXlzLFxuICAgICAgcmVtb3ZhbFBvbGljeTogcHJvcHMuY29uZmlnLmdlbmVyYWwucmVtb3ZhbFBvbGljeVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIElBTSByb2xlIGZvciB0aGUgTGFtYmRhIGZ1bmN0aW9uXG4gICAgY29uc3QgbGFtYmRhUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnTGFtYmRhUm9sZScsIHtcbiAgICAgIHJvbGVOYW1lOiBgVEFLLSR7cHJvcHMuZW52aXJvbm1lbnR9LUF1dGhJbmZyYS11cGRhdGUtbGRhcC10b2tlbi1sYW1iZGEtcm9sZWAsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKVxuICAgICAgXSxcbiAgICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgIFNlY3JldHNNYW5hZ2VyQWNjZXNzOiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdzZWNyZXRzbWFuYWdlcjpVcGRhdGVTZWNyZXQnLFxuICAgICAgICAgICAgICAgICdzZWNyZXRzbWFuYWdlcjpQdXRTZWNyZXRWYWx1ZScsXG4gICAgICAgICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOkdldFNlY3JldFZhbHVlJ1xuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgICAgICBwcm9wcy5hZG1pblRva2VuU2VjcmV0LnNlY3JldEFybixcbiAgICAgICAgICAgICAgICBwcm9wcy5sZGFwVG9rZW5TZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgICAgICAgICAgIC8vIExlZ2FjeSBzZWNyZXQgcGF0dGVybnMgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHlcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpzZWNyZXRzbWFuYWdlcjoke1N0YWNrLm9mKHRoaXMpLnJlZ2lvbn06JHtTdGFjay5vZih0aGlzKS5hY2NvdW50fTpzZWNyZXQ6Y29lLWF1dGgtKmAsXG4gICAgICAgICAgICAgICAgYGFybjphd3M6c2VjcmV0c21hbmFnZXI6JHtTdGFjay5vZih0aGlzKS5yZWdpb259OiR7U3RhY2sub2YodGhpcykuYWNjb3VudH06c2VjcmV0OiR7cHJvcHMuZW52aXJvbm1lbnR9L2F1dGhlbnRpay1hZG1pbi10b2tlbipgLFxuICAgICAgICAgICAgICAgIGBhcm46YXdzOnNlY3JldHNtYW5hZ2VyOiR7U3RhY2sub2YodGhpcykucmVnaW9ufToke1N0YWNrLm9mKHRoaXMpLmFjY291bnR9OnNlY3JldDoke3Byb3BzLmVudmlyb25tZW50fS9hdXRoZW50aWstbGRhcC10b2tlbipgXG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAna21zOkVuY3J5cHQnLFxuICAgICAgICAgICAgICAgICdrbXM6RGVjcnlwdCcsXG4gICAgICAgICAgICAgICAgJ2ttczpSZUVuY3J5cHRGcm9tJyxcbiAgICAgICAgICAgICAgICAna21zOlJlRW5jcnlwdFRvJyxcbiAgICAgICAgICAgICAgICAna21zOkdlbmVyYXRlRGF0YUtleScsXG4gICAgICAgICAgICAgICAgJ2ttczpHZW5lcmF0ZURhdGFLZXlXaXRob3V0UGxhaW50ZXh0JyxcbiAgICAgICAgICAgICAgICAna21zOkRlc2NyaWJlS2V5J1xuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtwcm9wcy5rbXNLZXkua2V5QXJuXVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICBdXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIExhbWJkYSBmdW5jdGlvblxuICAgIHRoaXMubGFtYmRhRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYFRBSy0ke3Byb3BzLmVudmlyb25tZW50fS1BdXRoSW5mcmEtdXBkYXRlLWxkYXAtdG9rZW5gLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIGxvZ0dyb3VwOiBsb2dHcm91cCxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIE5PREVfT1BUSU9OUzogJy0tZW5hYmxlLXNvdXJjZS1tYXBzJ1xuICAgICAgfSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21JbmxpbmUoYFxuY29uc3QgeyBTZWNyZXRzTWFuYWdlckNsaWVudCwgR2V0U2VjcmV0VmFsdWVDb21tYW5kLCBQdXRTZWNyZXRWYWx1ZUNvbW1hbmQgfSA9IHJlcXVpcmUoJ0Bhd3Mtc2RrL2NsaWVudC1zZWNyZXRzLW1hbmFnZXInKTtcbmNvbnN0IGh0dHBzID0gcmVxdWlyZSgnaHR0cHMnKTtcbmNvbnN0IGh0dHAgPSByZXF1aXJlKCdodHRwJyk7XG5jb25zdCB7IFVSTCB9ID0gcmVxdWlyZSgndXJsJyk7XG5cbmNvbnN0IHNlY3JldHNNYW5hZ2VyID0gbmV3IFNlY3JldHNNYW5hZ2VyQ2xpZW50KHt9KTtcblxuLy8gSGVscGVyIGZ1bmN0aW9uIHRvIHNlbmQgQ2xvdWRGb3JtYXRpb24gcmVzcG9uc2VcbmFzeW5jIGZ1bmN0aW9uIHNlbmRSZXNwb25zZShldmVudCwgY29udGV4dCwgcmVzcG9uc2VTdGF0dXMsIHJlc3BvbnNlRGF0YSA9IHt9LCBwaHlzaWNhbFJlc291cmNlSWQgPSBudWxsKSB7XG4gICAgY29uc3QgcmVzcG9uc2VCb2R5ID0gSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBTdGF0dXM6IHJlc3BvbnNlU3RhdHVzLFxuICAgICAgICBSZWFzb246IFxcYFNlZSB0aGUgZGV0YWlscyBpbiBDbG91ZFdhdGNoIExvZyBTdHJlYW06IFxcJHtjb250ZXh0LmxvZ1N0cmVhbU5hbWV9XFxgLFxuICAgICAgICBQaHlzaWNhbFJlc291cmNlSWQ6IHBoeXNpY2FsUmVzb3VyY2VJZCB8fCBjb250ZXh0LmxvZ1N0cmVhbU5hbWUsXG4gICAgICAgIFN0YWNrSWQ6IGV2ZW50LlN0YWNrSWQsXG4gICAgICAgIFJlcXVlc3RJZDogZXZlbnQuUmVxdWVzdElkLFxuICAgICAgICBMb2dpY2FsUmVzb3VyY2VJZDogZXZlbnQuTG9naWNhbFJlc291cmNlSWQsXG4gICAgICAgIERhdGE6IHJlc3BvbnNlRGF0YVxuICAgIH0pO1xuXG4gICAgY29uc3QgcGFyc2VkVXJsID0gbmV3IFVSTChldmVudC5SZXNwb25zZVVSTCk7XG4gICAgY29uc3Qgb3B0aW9ucyA9IHtcbiAgICAgICAgaG9zdG5hbWU6IHBhcnNlZFVybC5ob3N0bmFtZSxcbiAgICAgICAgcG9ydDogNDQzLFxuICAgICAgICBwYXRoOiBwYXJzZWRVcmwucGF0aG5hbWUgKyBwYXJzZWRVcmwuc2VhcmNoLFxuICAgICAgICBtZXRob2Q6ICdQVVQnLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAnY29udGVudC10eXBlJzogJycsXG4gICAgICAgICAgICAnY29udGVudC1sZW5ndGgnOiByZXNwb25zZUJvZHkubGVuZ3RoXG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgY29uc3QgcmVxdWVzdCA9IGh0dHBzLnJlcXVlc3Qob3B0aW9ucywgKHJlc3BvbnNlKSA9PiB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcXGBTdGF0dXMgY29kZTogXFwke3Jlc3BvbnNlLnN0YXR1c0NvZGV9XFxgKTtcbiAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICByZXF1ZXN0Lm9uKCdlcnJvcicsIChlcnJvcikgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5sb2coXFxgc2VuZCguLikgZmFpbGVkIGV4ZWN1dGluZyBodHRwcy5yZXF1ZXN0KC4uKTpcXGAsIGVycm9yKTtcbiAgICAgICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgcmVxdWVzdC53cml0ZShyZXNwb25zZUJvZHkpO1xuICAgICAgICByZXF1ZXN0LmVuZCgpO1xuICAgIH0pO1xufVxuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gZmV0Y2ggSlNPTiBkYXRhXG5hc3luYyBmdW5jdGlvbiBmZXRjaEpzb24odXJsLCBvcHRpb25zKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgY29uc3QgdXJsT2JqID0gbmV3IFVSTCh1cmwpO1xuICAgICAgICBjb25zdCBsaWIgPSB1cmxPYmoucHJvdG9jb2wgPT09ICdodHRwczonID8gaHR0cHMgOiBodHRwO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgcmVxID0gbGliLnJlcXVlc3QodXJsLCB7XG4gICAgICAgICAgICBtZXRob2Q6IG9wdGlvbnMubWV0aG9kIHx8ICdHRVQnLFxuICAgICAgICAgICAgaGVhZGVyczogb3B0aW9ucy5oZWFkZXJzIHx8IHt9XG4gICAgICAgIH0sIChyZXMpID0+IHtcbiAgICAgICAgICAgIGxldCBkYXRhID0gJyc7XG4gICAgICAgICAgICByZXMub24oJ2RhdGEnLCBjaHVuayA9PiBkYXRhICs9IGNodW5rKTtcbiAgICAgICAgICAgIHJlcy5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSA+PSAyMDAgJiYgcmVzLnN0YXR1c0NvZGUgPCAzMDApIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoSlNPTi5wYXJzZShkYXRhKSk7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoXFxgSW52YWxpZCBKU09OIHJlc3BvbnNlOiBcXCR7ZS5tZXNzYWdlfVxcYCkpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihcXGBIVFRQIGVycm9yISBzdGF0dXM6IFxcJHtyZXMuc3RhdHVzQ29kZX1cXGApKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICByZXEub24oJ2Vycm9yJywgcmVqZWN0KTtcbiAgICAgICAgcmVxLmVuZCgpO1xuICAgIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRBZG1pblRva2VuKGFkbWluU2VjcmV0TmFtZSkge1xuICAgIGNvbnNvbGUubG9nKCdHZXR0aW5nIGFkbWluIHRva2VuIGZyb20gc2VjcmV0OicsIGFkbWluU2VjcmV0TmFtZSk7XG4gICAgXG4gICAgY29uc3QgY29tbWFuZCA9IG5ldyBHZXRTZWNyZXRWYWx1ZUNvbW1hbmQoe1xuICAgICAgICBTZWNyZXRJZDogYWRtaW5TZWNyZXROYW1lXG4gICAgfSk7XG4gICAgXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBzZWNyZXRzTWFuYWdlci5zZW5kKGNvbW1hbmQpO1xuICAgIHJldHVybiByZXNwb25zZS5TZWNyZXRTdHJpbmc7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJldHJpZXZlVG9rZW4oYXV0aGVudGlrSG9zdCwgYXV0aGVudGlrQXBpVG9rZW4sIG91dHBvc3ROYW1lKSB7XG4gICAgb3V0cG9zdE5hbWUgPSBvdXRwb3N0TmFtZSB8fCAnTERBUCc7XG4gICAgXG4gICAgdHJ5IHtcbiAgICAgICAgLy8gRmV0Y2ggb3V0cG9zdCBpbnN0YW5jZXMgZnJvbSBBUElcbiAgICAgICAgY29uc3Qgb3V0cG9zdEluc3RhbmNlc1VybCA9IG5ldyBVUkwoJy9hcGkvdjMvb3V0cG9zdHMvaW5zdGFuY2VzLycsIGF1dGhlbnRpa0hvc3QpO1xuICAgICAgICBvdXRwb3N0SW5zdGFuY2VzVXJsLnNlYXJjaFBhcmFtcy5hcHBlbmQoJ25hbWVfX2lleGFjdCcsIG91dHBvc3ROYW1lKTtcblxuICAgICAgICBjb25zb2xlLmxvZygnRmV0Y2hpbmcgb3V0cG9zdCBpbnN0YW5jZXMgZnJvbTonLCBvdXRwb3N0SW5zdGFuY2VzVXJsLnRvU3RyaW5nKCkpO1xuICAgICAgICBcbiAgICAgICAgY29uc3Qgb3V0cG9zdEluc3RhbmNlcyA9IGF3YWl0IGZldGNoSnNvbihvdXRwb3N0SW5zdGFuY2VzVXJsLnRvU3RyaW5nKCksIHtcbiAgICAgICAgICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAgICAgJ0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAgICAgICAnQXV0aG9yaXphdGlvbic6IFxcYEJlYXJlciBcXCR7YXV0aGVudGlrQXBpVG9rZW59XFxgXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIENoZWNrIGlmIHdlIGZvdW5kIHRoZSBvdXRwb3N0XG4gICAgICAgIGNvbnN0IHJlc3VsdHMgPSBvdXRwb3N0SW5zdGFuY2VzLnJlc3VsdHMgfHwgW107XG4gICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxcYE91dHBvc3Qgd2l0aCBuYW1lIFxcJHtvdXRwb3N0TmFtZX0gbm90IGZvdW5kLCBhYm9ydGluZy4uLlxcYCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBFeHRyYWN0IHRoZSB0b2tlbiBpZGVudGlmaWVyXG4gICAgICAgIGNvbnN0IG91dHBvc3QgPSByZXN1bHRzLmZpbmQoKGl0ZW0pID0+IGl0ZW0ubmFtZSA9PT0gb3V0cG9zdE5hbWUpO1xuICAgICAgICBpZiAoIW91dHBvc3QgfHwgIW91dHBvc3QudG9rZW5faWRlbnRpZmllcikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxcYFRva2VuIGlkZW50aWZpZXIgZm9yIG91dHBvc3QgXFwke291dHBvc3ROYW1lfSBub3QgZm91bmQsIGFib3J0aW5nLi4uXFxgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHRva2VuSWRlbnRpZmllciA9IG91dHBvc3QudG9rZW5faWRlbnRpZmllcjtcbiAgICAgICAgY29uc29sZS5sb2coJ0ZvdW5kIHRva2VuIGlkZW50aWZpZXI6JywgdG9rZW5JZGVudGlmaWVyKTtcblxuICAgICAgICAvLyBGZXRjaCB0aGUgdG9rZW5cbiAgICAgICAgY29uc3Qgdmlld0tleVVybCA9IG5ldyBVUkwoXFxgL2FwaS92My9jb3JlL3Rva2Vucy9cXCR7dG9rZW5JZGVudGlmaWVyfS92aWV3X2tleS9cXGAsIGF1dGhlbnRpa0hvc3QpO1xuXG4gICAgICAgIGNvbnN0IHZpZXdLZXlSZXN1bHQgPSBhd2FpdCBmZXRjaEpzb24odmlld0tleVVybC50b1N0cmluZygpLCB7XG4gICAgICAgICAgICBtZXRob2Q6ICdHRVQnLFxuICAgICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgICAgICdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgICAgICAgJ0F1dGhvcml6YXRpb24nOiBcXGBCZWFyZXIgXFwke2F1dGhlbnRpa0FwaVRva2VufVxcYFxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBvdXRwb3N0VG9rZW4gPSB2aWV3S2V5UmVzdWx0LmtleTtcbiAgICAgICAgaWYgKCFvdXRwb3N0VG9rZW4pIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcXGBUb2tlbiBmb3Igb3V0cG9zdCBcXCR7b3V0cG9zdE5hbWV9IG5vdCBmb3VuZCwgYWJvcnRpbmcuLi5cXGApO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG91dHBvc3RUb2tlbjtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKFxcYEVycm9yIHJldHJpZXZpbmcgdG9rZW46IFxcJHtlcnJvci5tZXNzYWdlfVxcYCk7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gcHV0TERBUFNlY3JldChzZWNyZXROYW1lLCBzZWNyZXRWYWx1ZSkge1xuICAgIGNvbnNvbGUubG9nKCdVcGRhdGluZyBMREFQIHRva2VuIHNlY3JldDonLCBzZWNyZXROYW1lKTtcbiAgICBcbiAgICBjb25zdCBjb21tYW5kID0gbmV3IFB1dFNlY3JldFZhbHVlQ29tbWFuZCh7XG4gICAgICAgIFNlY3JldElkOiBzZWNyZXROYW1lLFxuICAgICAgICBTZWNyZXRTdHJpbmc6IHNlY3JldFZhbHVlXG4gICAgfSk7XG4gICAgXG4gICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgc2VjcmV0c01hbmFnZXIuc2VuZChjb21tYW5kKTtcbiAgICAgICAgY29uc29sZS5sb2coJ0xEQVAgdG9rZW4gc2VjcmV0IHVwZGF0ZWQgc3VjY2Vzc2Z1bGx5Jyk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgdXBkYXRpbmcgc2VjcmV0OicsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxufVxuXG5leHBvcnRzLmhhbmRsZXIgPSBhc3luYyAoZXZlbnQsIGNvbnRleHQpID0+IHtcbiAgICBjb25zb2xlLmxvZygnRXZlbnQ6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcbiAgICBcbiAgICBjb25zdCB7IFJlcXVlc3RUeXBlLCBSZXNvdXJjZVByb3BlcnRpZXMgfSA9IGV2ZW50O1xuICAgIGNvbnN0IHsgXG4gICAgICAgIEVudmlyb25tZW50LCBcbiAgICAgICAgQXV0aGVudGlrSG9zdCwgXG4gICAgICAgIE91dHBvc3ROYW1lLFxuICAgICAgICBBZG1pblNlY3JldE5hbWUsXG4gICAgICAgIExEQVBTZWNyZXROYW1lXG4gICAgfSA9IFJlc291cmNlUHJvcGVydGllcztcbiAgICBcbiAgICB0cnkge1xuICAgICAgICBpZiAoUmVxdWVzdFR5cGUgPT09ICdDcmVhdGUnIHx8IFJlcXVlc3RUeXBlID09PSAnVXBkYXRlJykge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ1Byb2Nlc3NpbmcgTERBUCB0b2tlbiByZXRyaWV2YWwuLi4nKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdFbnZpcm9ubWVudDonLCBFbnZpcm9ubWVudCk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnQXV0aGVudGlrIFVSTDonLCBBdXRoZW50aWtIb3N0KTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdPdXRwb3N0IE5hbWU6JywgT3V0cG9zdE5hbWUpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ0FkbWluIFNlY3JldCBOYW1lOicsIEFkbWluU2VjcmV0TmFtZSk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnTERBUCBTZWNyZXQgTmFtZTonLCBMREFQU2VjcmV0TmFtZSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIEdldCB0aGUgYWRtaW4gdG9rZW4gZnJvbSBBV1MgU2VjcmV0cyBNYW5hZ2VyXG4gICAgICAgICAgICBjb25zdCBhZG1pblRva2VuID0gYXdhaXQgZ2V0QWRtaW5Ub2tlbihBZG1pblNlY3JldE5hbWUpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBSZXRyaWV2ZSB0aGUgTERBUCB0b2tlbiBmcm9tIEF1dGhlbnRpa1xuICAgICAgICAgICAgY29uc3QgbGRhcFRva2VuID0gYXdhaXQgcmV0cmlldmVUb2tlbihBdXRoZW50aWtIb3N0LCBhZG1pblRva2VuLCBPdXRwb3N0TmFtZSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIFN0b3JlIHRoZSBMREFQIHRva2VuIGJhY2sgaW4gQVdTIFNlY3JldHMgTWFuYWdlclxuICAgICAgICAgICAgYXdhaXQgcHV0TERBUFNlY3JldChMREFQU2VjcmV0TmFtZSwgbGRhcFRva2VuKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgYXdhaXQgc2VuZFJlc3BvbnNlKGV2ZW50LCBjb250ZXh0LCAnU1VDQ0VTUycsIHtcbiAgICAgICAgICAgICAgICBNZXNzYWdlOiAnTERBUCB0b2tlbiByZXRyaWV2ZWQgYW5kIHVwZGF0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgICAgICAgICAgICBMREFQVG9rZW46IGxkYXBUb2tlbi5zdWJzdHJpbmcoMCwgMTApICsgJy4uLicgLy8gTG9nIG9ubHkgZmlyc3QgMTAgY2hhcnMgZm9yIHNlY3VyaXR5XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIGlmIChSZXF1ZXN0VHlwZSA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdEZWxldGUgcmVxdWVzdCAtIG5vIGFjdGlvbiBuZWVkZWQgZm9yIExEQVAgdG9rZW4gcmV0cmlldmFsJyk7XG4gICAgICAgICAgICBhd2FpdCBzZW5kUmVzcG9uc2UoZXZlbnQsIGNvbnRleHQsICdTVUNDRVNTJywge1xuICAgICAgICAgICAgICAgIE1lc3NhZ2U6ICdEZWxldGUgY29tcGxldGVkJ1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvcjonLCBlcnJvcik7XG4gICAgICAgIGF3YWl0IHNlbmRSZXNwb25zZShldmVudCwgY29udGV4dCwgJ0ZBSUxFRCcsIHtcbiAgICAgICAgICAgIE1lc3NhZ2U6IGVycm9yLm1lc3NhZ2VcbiAgICAgICAgfSk7XG4gICAgfVxufTtcbiAgICAgIGApXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIGN1c3RvbSByZXNvdXJjZSBwcm92aWRlclxuICAgIGNvbnN0IHByb3ZpZGVyID0gbGFtYmRhLkZ1bmN0aW9uLmZyb21GdW5jdGlvbkFybih0aGlzLCAnUHJvdmlkZXInLCB0aGlzLmxhbWJkYUZ1bmN0aW9uLmZ1bmN0aW9uQXJuKTtcblxuICAgIC8vIENyZWF0ZSB0aGUgY3VzdG9tIHJlc291cmNlXG4gICAgdGhpcy5jdXN0b21SZXNvdXJjZSA9IG5ldyBDdXN0b21SZXNvdXJjZSh0aGlzLCAnUmVzb3VyY2UnLCB7XG4gICAgICBzZXJ2aWNlVG9rZW46IHRoaXMubGFtYmRhRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgIEVudmlyb25tZW50OiBwcm9wcy5lbnZpcm9ubWVudCxcbiAgICAgICAgQXV0aGVudGlrSG9zdDogcHJvcHMuYXV0aGVudGlrSG9zdCxcbiAgICAgICAgT3V0cG9zdE5hbWU6IHByb3BzLm91dHBvc3ROYW1lIHx8ICdMREFQJyxcbiAgICAgICAgQWRtaW5TZWNyZXROYW1lOiBwcm9wcy5hZG1pblRva2VuU2VjcmV0LnNlY3JldE5hbWUsXG4gICAgICAgIExEQVBTZWNyZXROYW1lOiBwcm9wcy5sZGFwVG9rZW5TZWNyZXQuc2VjcmV0TmFtZSxcbiAgICAgICAgLy8gQWRkIGEgdGltZXN0YW1wIHRvIGZvcmNlIHVwZGF0ZXMgb24gZXZlcnkgZGVwbG95bWVudFxuICAgICAgICBVcGRhdGVUaW1lc3RhbXA6IHByb3BzLmdpdFNoYVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQWRkIGRlcGVuZGVuY3kgdG8gZW5zdXJlIHRoZSBjdXN0b20gcmVzb3VyY2UgcnVucyBhZnRlciB0aGUgc2VjcmV0cyBhcmUgY3JlYXRlZFxuICAgIHRoaXMuY3VzdG9tUmVzb3VyY2Uubm9kZS5hZGREZXBlbmRlbmN5KHByb3BzLmFkbWluVG9rZW5TZWNyZXQpO1xuICAgIHRoaXMuY3VzdG9tUmVzb3VyY2Uubm9kZS5hZGREZXBlbmRlbmN5KHByb3BzLmxkYXBUb2tlblNlY3JldCk7XG4gICAgXG4gICAgLy8gQWRkIGRlcGVuZGVuY3kgdG8gZW5zdXJlIHRoZSBjdXN0b20gcmVzb3VyY2UgcnVucyBhZnRlciBFQ1Mgc2VydmljZXMgYXJlIGRlcGxveWVkXG4gICAgdGhpcy5jdXN0b21SZXNvdXJjZS5ub2RlLmFkZERlcGVuZGVuY3kocHJvcHMuYXV0aGVudGlrU2VydmVyU2VydmljZSk7XG4gICAgdGhpcy5jdXN0b21SZXNvdXJjZS5ub2RlLmFkZERlcGVuZGVuY3kocHJvcHMuYXV0aGVudGlrV29ya2VyU2VydmljZSk7XG4gIH1cbn1cbiJdfQ==