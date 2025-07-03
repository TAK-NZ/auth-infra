/**
 * LDAP Token Retriever Custom Resource Construct
 * 
 * This construct creates a Lambda function that automatically retrieves
 * the LDAP outpost token from Authentik and stores it in AWS Secrets Manager.
 * This is necessary because the LDAP outpost needs the token to connect to Authentik,
 * but the token can only be retrieved after Authentik is fully running.
 */
import { Construct } from 'constructs';
import {
  aws_lambda as lambda,
  aws_iam as iam,
  aws_logs as logs,
  aws_secretsmanager as secretsmanager,
  aws_kms as kms,
  aws_ecs as ecs,
  CustomResource,
  Duration,
  RemovalPolicy,
  Stack,
  Fn
} from 'aws-cdk-lib';
import type { ContextEnvironmentConfig } from '../stack-config';
import type { InfrastructureConfig, DeploymentConfig, TokenConfig, AuthentikApplicationConfig } from '../construct-configs';

/**
 * Properties for the LDAP Token Retriever construct
 */
export interface LdapTokenRetrieverProps {
  /**
   * Environment name (e.g. 'prod', 'dev', etc.)
   */
  environment: 'prod' | 'dev-test';

  /**
   * Environment configuration
   */
  contextConfig: ContextEnvironmentConfig;

  /**
   * Infrastructure configuration (KMS key)
   */
  infrastructure: InfrastructureConfig;

  /**
   * Deployment configuration (Git SHA)
   */
  deployment: DeploymentConfig;

  /**
   * Token configuration (secrets, services, outpost name)
   */
  token: TokenConfig;

  /**
   * Application configuration (Authentik host)
   */
  application: AuthentikApplicationConfig;
}

/**
 * LDAP Token Retriever construct
 */
export class LdapTokenRetriever extends Construct {
  /**
   * The Lambda function that retrieves LDAP tokens
   */
  public readonly lambdaFunction: lambda.Function;

  /**
   * The custom resource that triggers the Lambda
   */
  public readonly customResource: CustomResource;

  constructor(scope: Construct, id: string, props: LdapTokenRetrieverProps) {
    super(scope, id);

    // Derive environment-specific values from context (matches reference pattern)
    const isHighAvailability = props.environment === 'prod';
    const removalPolicy = props.contextConfig.general.removalPolicy === 'RETAIN' ? 
      RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;
    const logRetention = isHighAvailability ? 
      logs.RetentionDays.ONE_MONTH : 
      logs.RetentionDays.ONE_WEEK;

    // Create CloudWatch log group for the Lambda function
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      retention: logRetention,
      removalPolicy: removalPolicy
    });

    // Create IAM role for the Lambda function
    const lambdaRole = new iam.Role(this, 'LambdaRole', {
      roleName: `TAK-${props.contextConfig.stackName}-AuthInfra-update-ldap-token-lambda-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ],
      inlinePolicies: {
        SecretsManagerAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'secretsmanager:UpdateSecret',
                'secretsmanager:PutSecretValue',
                'secretsmanager:GetSecretValue'
              ],
              resources: [
                props.token.adminTokenSecret.secretArn,
                props.token.ldapTokenSecret.secretArn,
                // Legacy secret patterns for backward compatibility
                `arn:aws:secretsmanager:${Stack.of(this).region}:${Stack.of(this).account}:secret:coe-auth-*`,
                `arn:aws:secretsmanager:${Stack.of(this).region}:${Stack.of(this).account}:secret:${props.environment}/authentik-admin-token*`,
                `arn:aws:secretsmanager:${Stack.of(this).region}:${Stack.of(this).account}:secret:${props.environment}/authentik-ldap-token*`
              ]
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
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
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'logs:CreateLogStream',
                'logs:PutLogEvents',
                'logs:DescribeLogGroups',
                'logs:DescribeLogStreams'
              ],
              resources: [
                `arn:aws:logs:${Stack.of(this).region}:${Stack.of(this).account}:log-group:/aws/lambda/TAK-${props.contextConfig.stackName}-AuthInfra-update-ldap-token*`
              ]
            })
          ]
        })
      }
    });

    // Create the Lambda function
    this.lambdaFunction = new lambda.Function(this, 'Function', {
      functionName: `TAK-${props.contextConfig.stackName}-AuthInfra-update-ldap-token`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      role: lambdaRole,
      timeout: Duration.minutes(10), // Increased timeout for retry logic
      logGroup: logGroup,
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        // Retry configuration (can be overridden via environment)
        MAX_RETRIES: '5',
        BASE_DELAY_MS: '1000',
        MAX_DELAY_MS: '30000',
        BACKOFF_MULTIPLIER: '2'
      },
      code: lambda.Code.fromInline(`
const { SecretsManagerClient, GetSecretValueCommand, PutSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const secretsManager = new SecretsManagerClient({});

// Retry configuration from environment variables with defaults
const RETRY_CONFIG = {
    maxRetries: parseInt(process.env.MAX_RETRIES || '5'),
    baseDelayMs: parseInt(process.env.BASE_DELAY_MS || '1000'),
    maxDelayMs: parseInt(process.env.MAX_DELAY_MS || '30000'),
    backoffMultiplier: parseFloat(process.env.BACKOFF_MULTIPLIER || '2')
};

// Error categorization with codes and remediation suggestions
const ERROR_CATEGORIES = {
    NETWORK: {
        code: 'NET001',
        category: 'NETWORK_CONNECTIVITY',
        suggestion: 'Check security groups, VPC configuration, and network connectivity to Authentik host'
    },
    AUTH: {
        code: 'AUTH001',
        category: 'AUTHENTICATION_FAILED',
        suggestion: 'Verify admin token exists in Secrets Manager and has correct permissions in Authentik'
    },
    CONFIG: {
        code: 'CFG001',
        category: 'CONFIGURATION_ERROR',
        suggestion: 'Check LDAP outpost configuration in Authentik and verify outpost name matches'
    },
    SERVICE: {
        code: 'SVC001',
        category: 'SERVICE_UNAVAILABLE',
        suggestion: 'Authentik service may not be ready. Check ECS service health and wait for full initialization'
    },
    AWS: {
        code: 'AWS001',
        category: 'AWS_SERVICE_ERROR',
        suggestion: 'Check IAM permissions for Secrets Manager and KMS key access'
    },
    TIMEOUT: {
        code: 'TMO001',
        category: 'OPERATION_TIMEOUT',
        suggestion: 'Operation timed out. Check network latency and Authentik service responsiveness'
    }
};

// Enhanced error classification function
function classifyError(error, context = {}) {
    const errorMessage = error.message.toLowerCase();
    const errorType = error.constructor.name;
    
    // Network-related errors
    if (errorMessage.includes('timeout') || errorMessage.includes('econnrefused') || 
        errorMessage.includes('enotfound') || errorMessage.includes('network')) {
        return {
            ...ERROR_CATEGORIES.NETWORK,
            details: 'Network error: ' + error.message,
            context: { errorType, ...context }
        };
    }
    
    // Authentication errors
    if (errorMessage.includes('unauthorized') || errorMessage.includes('forbidden') ||
        errorMessage.includes('invalid token') || errorMessage.includes('authentication')) {
        return {
            ...ERROR_CATEGORIES.AUTH,
            details: 'Authentication error: ' + error.message,
            context: { errorType, ...context }
        };
    }
    
    // Configuration errors
    if (errorMessage.includes('outpost') && errorMessage.includes('not found') ||
        errorMessage.includes('token identifier') || errorMessage.includes('configuration')) {
        return {
            ...ERROR_CATEGORIES.CONFIG,
            details: 'Configuration error: ' + error.message,
            context: { errorType, ...context }
        };
    }
    
    // Service availability errors
    if (errorMessage.includes('500') || errorMessage.includes('503') ||
        errorMessage.includes('service unavailable') || errorMessage.includes('server error')) {
        return {
            ...ERROR_CATEGORIES.SERVICE,
            details: 'Service error: ' + error.message,
            context: { errorType, ...context }
        };
    }
    
    // AWS service errors
    if (errorMessage.includes('secretsmanager') || errorMessage.includes('kms') ||
        errorMessage.includes('access denied') || errorType.includes('AWS')) {
        return {
            ...ERROR_CATEGORIES.AWS,
            details: 'AWS service error: ' + error.message,
            context: { errorType, ...context }
        };
    }
    
    // Timeout errors
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        return {
            ...ERROR_CATEGORIES.TIMEOUT,
            details: 'Timeout error: ' + error.message,
            context: { errorType, ...context }
        };
    }
    
    // Default to service error for unclassified errors
    return {
        ...ERROR_CATEGORIES.SERVICE,
        details: 'Unclassified error: ' + error.message,
        context: { errorType, ...context }
    };
}

// Enhanced logging utility
function logWithTimestamp(level, message, details = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level: level.toUpperCase(),
        message,
        ...details
    };
    console.log(JSON.stringify(logEntry));
}

// Sleep utility for retry delays
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Calculate exponential backoff delay
function calculateDelay(attempt) {
    const delay = Math.min(
        RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
        RETRY_CONFIG.maxDelayMs
    );
    // Add jitter to prevent thundering herd
    return delay + Math.random() * 1000;
}

// Retry wrapper with exponential backoff
async function withRetry(operation, operationName, context = {}) {
    let lastError;
    
    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
        try {
            logWithTimestamp('info', \`Attempting \${operationName}\`, {
                attempt: attempt + 1,
                maxRetries: RETRY_CONFIG.maxRetries + 1,
                ...context
            });
            
            const result = await operation();
            
            if (attempt > 0) {
                logWithTimestamp('info', \`\${operationName} succeeded after retries\`, {
                    attempt: attempt + 1,
                    ...context
                });
            }
            
            return result;
        } catch (error) {
            lastError = error;
            
            logWithTimestamp('warn', \`\${operationName} failed\`, {
                attempt: attempt + 1,
                error: error.message,
                errorType: error.constructor.name,
                ...context
            });
            
            if (attempt < RETRY_CONFIG.maxRetries) {
                const delay = calculateDelay(attempt);
                logWithTimestamp('info', \`Retrying \${operationName} after delay\`, {
                    delayMs: Math.round(delay),
                    nextAttempt: attempt + 2,
                    ...context
                });
                await sleep(delay);
            }
        }
    }
    
    logWithTimestamp('error', \`\${operationName} failed after all retries\`, {
        totalAttempts: RETRY_CONFIG.maxRetries + 1,
        finalError: lastError.message,
        errorType: lastError.constructor.name,
        ...context
    });
    
    throw lastError;
}

// Enhanced helper function to send CloudFormation response with structured error data
async function sendResponse(event, context, responseStatus, responseData = {}, physicalResourceId = null, errorInfo = null) {
    let enhancedData = { ...responseData };
    let reason = \`See the details in CloudWatch Log Stream: \${context.logStreamName}\`;
    
    // Add structured error information for failed responses
    if (responseStatus === 'FAILED' && errorInfo) {
        enhancedData = {
            ...responseData,
            ErrorCode: errorInfo.code,
            ErrorCategory: errorInfo.category,
            ErrorDetails: errorInfo.details,
            RemediationSuggestion: errorInfo.suggestion,
            Context: errorInfo.context || {},
            LogStreamName: context.logStreamName
        };
        
        // Create more descriptive reason for CloudFormation
        reason = \`[\${errorInfo.code}] \${errorInfo.category}: \${errorInfo.details}. Suggestion: \${errorInfo.suggestion}. Logs: \${context.logStreamName}\`;
    }
    
    const responseBody = JSON.stringify({
        Status: responseStatus,
        Reason: reason,
        PhysicalResourceId: physicalResourceId || context.logStreamName,
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
        Data: enhancedData
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
            logWithTimestamp('info', 'CloudFormation response sent', {
                statusCode: response.statusCode,
                responseStatus
            });
            resolve();
        });
        
        request.on('error', (error) => {
            logWithTimestamp('error', 'Failed to send CloudFormation response', {
                error: error.message
            });
            reject(error);
        });
        
        request.write(responseBody);
        request.end();
    });
}

// Enhanced HTTP client with detailed logging
async function fetchJson(url, options) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const lib = urlObj.protocol === 'https:' ? https : http;
        
        logWithTimestamp('debug', 'Making HTTP request', {
            url: url,
            method: options.method || 'GET',
            hasAuth: !!(options.headers && options.headers.Authorization)
        });
        
        const req = lib.request(url, {
            method: options.method || 'GET',
            headers: options.headers || {},
            timeout: 30000 // 30 second timeout
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                logWithTimestamp('debug', 'HTTP response received', {
                    statusCode: res.statusCode,
                    contentLength: data.length,
                    url: url
                });
                
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        const jsonData = JSON.parse(data);
                        resolve(jsonData);
                    } catch (e) {
                        logWithTimestamp('error', 'Invalid JSON response', {
                            error: e.message,
                            responsePreview: data.substring(0, 200)
                        });
                        reject(new Error(\`Invalid JSON response: \${e.message}\`));
                    }
                } else {
                    logWithTimestamp('error', 'HTTP error response', {
                        statusCode: res.statusCode,
                        responsePreview: data.substring(0, 500)
                    });
                    reject(new Error(\`HTTP error! status: \${res.statusCode}, response: \${data.substring(0, 200)}\`));
                }
            });
        });
        
        req.on('error', (error) => {
            logWithTimestamp('error', 'HTTP request failed', {
                error: error.message,
                url: url
            });
            reject(error);
        });
        
        req.on('timeout', () => {
            logWithTimestamp('error', 'HTTP request timeout', { url: url });
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        req.end();
    });
}

async function getAdminToken(adminSecretName) {
    logWithTimestamp('info', 'Retrieving admin token from Secrets Manager', {
        secretName: adminSecretName
    });
    
    const command = new GetSecretValueCommand({
        SecretId: adminSecretName
    });
    
    const response = await secretsManager.send(command);
    
    if (!response.SecretString) {
        throw new Error('Admin token secret is empty or invalid');
    }
    
    logWithTimestamp('info', 'Admin token retrieved successfully', {
        tokenLength: response.SecretString.length
    });
    
    return response.SecretString;
}

async function retrieveToken(authentikHost, authentikApiToken, outpostName) {
    outpostName = outpostName || 'LDAP';
    
    logWithTimestamp('info', 'Starting token retrieval process', {
        authentikHost,
        outpostName,
        tokenLength: authentikApiToken.length
    });
    
    // Fetch outpost instances from API
    const outpostInstancesUrl = new URL('/api/v3/outposts/instances/', authentikHost);
    outpostInstancesUrl.searchParams.append('name__iexact', outpostName);

    logWithTimestamp('info', 'Fetching outpost instances', {
        url: outpostInstancesUrl.toString()
    });
    
    const outpostInstances = await fetchJson(outpostInstancesUrl.toString(), {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Authorization': \`Bearer \${authentikApiToken}\`
        }
    });

    // Check if we found the outpost
    const results = outpostInstances.results || [];
    
    logWithTimestamp('info', 'Outpost instances retrieved', {
        totalResults: results.length,
        outpostNames: results.map(r => r.name)
    });
    
    if (results.length === 0) {
        throw new Error(\`Outpost with name \${outpostName} not found. Available outposts: none\`);
    }

    // Extract the token identifier
    const outpost = results.find((item) => item.name === outpostName);
    if (!outpost) {
        const availableNames = results.map(r => r.name).join(', ');
        throw new Error(\`Outpost with name \${outpostName} not found. Available outposts: \${availableNames}\`);
    }
    
    if (!outpost.token_identifier) {
        logWithTimestamp('error', 'Outpost found but missing token identifier', {
            outpost: { ...outpost, token_identifier: undefined }
        });
        throw new Error(\`Token identifier for outpost \${outpostName} not found\`);
    }

    const tokenIdentifier = outpost.token_identifier;
    logWithTimestamp('info', 'Found outpost and token identifier', {
        outpostName,
        tokenIdentifier,
        outpostId: outpost.pk
    });

    // Fetch the token
    const viewKeyUrl = new URL(\`/api/v3/core/tokens/\${tokenIdentifier}/view_key/\`, authentikHost);

    logWithTimestamp('info', 'Fetching token key', {
        url: viewKeyUrl.toString()
    });

    const viewKeyResult = await fetchJson(viewKeyUrl.toString(), {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Authorization': \`Bearer \${authentikApiToken}\`
        }
    });

    const outpostToken = viewKeyResult.key;
    if (!outpostToken) {
        logWithTimestamp('error', 'Token key response invalid', {
            responseKeys: Object.keys(viewKeyResult)
        });
        throw new Error(\`Token for outpost \${outpostName} not found in response\`);
    }

    logWithTimestamp('info', 'Token retrieved successfully', {
        tokenLength: outpostToken.length,
        tokenPrefix: outpostToken.substring(0, 8) + '...'
    });

    return outpostToken;
}

async function putLDAPSecret(secretName, secretValue) {
    logWithTimestamp('info', 'Updating LDAP token secret', {
        secretName,
        tokenLength: secretValue.length
    });
    
    const command = new PutSecretValueCommand({
        SecretId: secretName,
        SecretString: secretValue
    });
    
    await secretsManager.send(command);
    
    logWithTimestamp('info', 'LDAP token secret updated successfully', {
        secretName
    });
}

exports.handler = async (event, context) => {
    const startTime = Date.now();
    
    logWithTimestamp('info', 'Lambda function started', {
        requestId: context.awsRequestId,
        functionName: context.functionName,
        remainingTimeMs: context.getRemainingTimeInMillis()
    });
    
    logWithTimestamp('debug', 'Received event', {
        event: JSON.stringify(event, null, 2)
    });
    
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
            logWithTimestamp('info', 'Processing LDAP token retrieval', {
                requestType: RequestType,
                environment: Environment,
                authentikHost: AuthentikHost,
                outpostName: OutpostName,
                adminSecretName: AdminSecretName,
                ldapSecretName: LDAPSecretName
            });
            
            // Get the admin token from AWS Secrets Manager with retry
            const adminToken = await withRetry(
                () => getAdminToken(AdminSecretName),
                'getAdminToken',
                { secretName: AdminSecretName }
            );
            
            // Retrieve the LDAP token from Authentik with retry
            const ldapToken = await withRetry(
                () => retrieveToken(AuthentikHost, adminToken, OutpostName),
                'retrieveToken',
                { authentikHost: AuthentikHost, outpostName: OutpostName }
            );
            
            // Store the LDAP token back in AWS Secrets Manager with retry
            await withRetry(
                () => putLDAPSecret(LDAPSecretName, ldapToken),
                'putLDAPSecret',
                { secretName: LDAPSecretName }
            );
            
            const executionTime = Date.now() - startTime;
            
            logWithTimestamp('info', 'LDAP token retrieval completed successfully', {
                executionTimeMs: executionTime,
                tokenLength: ldapToken.length
            });
            
            await sendResponse(event, context, 'SUCCESS', {
                Message: 'LDAP token retrieved and updated successfully',
                ExecutionTimeMs: executionTime,
                TokenLength: ldapToken.length,
                LDAPTokenPrefix: ldapToken.substring(0, 10) + '...'
            });
        } else if (RequestType === 'Delete') {
            logWithTimestamp('info', 'Processing delete request', {
                requestType: RequestType
            });
            
            await sendResponse(event, context, 'SUCCESS', {
                Message: 'Delete completed - no action needed for LDAP token retrieval'
            });
        }
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        logWithTimestamp('error', 'Lambda function failed', {
            error: error.message,
            errorType: error.constructor.name,
            stack: error.stack,
            executionTimeMs: executionTime,
            remainingTimeMs: context.getRemainingTimeInMillis()
        });
        
        // Classify the error and create structured error information
        const errorInfo = classifyError(error, {
            environment: ResourceProperties.Environment,
            authentikHost: ResourceProperties.AuthentikHost,
            outpostName: ResourceProperties.OutpostName,
            executionTimeMs: executionTime,
            remainingTimeMs: context.getRemainingTimeInMillis()
        });
        
        await sendResponse(event, context, 'FAILED', {
            Message: error.message,
            ErrorType: error.constructor.name,
            ExecutionTimeMs: executionTime
        }, null, errorInfo);
    }
};
      `)
    });

    // Create the custom resource provider
    const provider = lambda.Function.fromFunctionArn(this, 'Provider', this.lambdaFunction.functionArn);

    // Create the custom resource
    this.customResource = new CustomResource(this, 'Resource', {
      serviceToken: this.lambdaFunction.functionArn,
      properties: {
        Environment: props.environment,
        AuthentikHost: props.application.authentikHost,
        OutpostName: props.token.outpostName || 'LDAP',
        AdminSecretName: props.token.adminTokenSecret.secretName,
        LDAPSecretName: props.token.ldapTokenSecret.secretName,
        // Add a timestamp to force updates on every deployment
        UpdateTimestamp: Date.now().toString()
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
