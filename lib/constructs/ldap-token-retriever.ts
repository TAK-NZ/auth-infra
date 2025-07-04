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
                } else if (res.statusCode === 404) {
                    // Check if we got HTML instead of JSON (likely hitting wrong endpoint)
                    if (data.includes('<!DOCTYPE html>') || data.includes('<html>')) {
                        reject(new Error(\`API endpoint not found - got HTML page instead of API response. Check Authentik URL and API path.\`));
                    } else {
                        reject(new Error(\`API endpoint not found: \${res.statusCode}, response: \${data.substring(0, 200)}\`));
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
        
        if (options.body) {
            req.write(JSON.stringify(options.body));
        }
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

// Helper function to get or create resource
async function getOrCreate(getUrl, createData, resourceName, headers) {
    try {
        const existing = await fetchJson(getUrl, { method: 'GET', headers });
        if (existing.results && existing.results.length > 0) {
            logWithTimestamp('info', \`\${resourceName} already exists\`, { id: existing.results[0].pk });
            return existing.results[0];
        }
    } catch (error) {
        logWithTimestamp('debug', \`Error checking existing \${resourceName}\`, { error: error.message });
    }
    
    const created = await fetchJson(createData.url, {
        method: 'POST',
        headers,
        body: createData.body
    });
    logWithTimestamp('info', \`\${resourceName} created\`, { id: created.pk });
    return created;
}

// Check for blueprint-created LDAP resources with exponential backoff
async function waitForBlueprintResources(authentikHost, adminToken) {
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${adminToken}\`
    };

    const maxWaitTime = 10 * 60 * 1000; // 10 minutes
    const startTime = Date.now();
    let attempt = 0;
    const maxAttempts = 20;

    logWithTimestamp('info', 'Waiting for blueprint to create LDAP resources');

    while (Date.now() - startTime < maxWaitTime && attempt < maxAttempts) {
        attempt++;
        const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 30000); // Cap at 30s
        
        logWithTimestamp('info', \`Checking for blueprint resources (attempt \${attempt}/\${maxAttempts})\`);
        
        try {
            // Check required resources in order
            const missingResources = [];
            
            // 1. Check service account
            try {
                const users = await fetchJson(\`\${authentikHost}/api/v3/core/users/?username__exact=ldapservice\`, { method: 'GET', headers });
                if (!users.results || users.results.length === 0) {
                    missingResources.push('LDAP service account (ldapservice)');
                }
            } catch (error) {
                missingResources.push('LDAP service account (ldapservice)');
            }
            
            // 2. Check authentication flow
            try {
                const flows = await fetchJson(\`\${authentikHost}/api/v3/flows/instances/?slug__exact=ldap-authentication-flow\`, { method: 'GET', headers });
                if (!flows.results || flows.results.length === 0) {
                    missingResources.push('LDAP authentication flow (ldap-authentication-flow)');
                }
            } catch (error) {
                missingResources.push('LDAP authentication flow (ldap-authentication-flow)');
            }
            
            // 3. Check LDAP provider
            try {
                const providers = await fetchJson(\`\${authentikHost}/api/v3/providers/ldap/?name__iexact=Provider for LDAP\`, { method: 'GET', headers });
                if (!providers.results || providers.results.length === 0) {
                    missingResources.push('LDAP provider (Provider for LDAP)');
                }
            } catch (error) {
                missingResources.push('LDAP provider (Provider for LDAP)');
            }
            
            // 4. Check application
            try {
                const apps = await fetchJson(\`\${authentikHost}/api/v3/core/applications/?slug__iexact=ldap\`, { method: 'GET', headers });
                if (!apps.results || apps.results.length === 0) {
                    missingResources.push('LDAP application (ldap)');
                }
            } catch (error) {
                missingResources.push('LDAP application (ldap)');
            }
            
            // 5. Check outpost
            try {
                const outposts = await fetchJson(\`\${authentikHost}/api/v3/outposts/instances/?name__iexact=LDAP\`, { method: 'GET', headers });
                if (!outposts.results || outposts.results.length === 0) {
                    missingResources.push('LDAP outpost (LDAP)');
                }
            } catch (error) {
                missingResources.push('LDAP outpost (LDAP)');
            }
            
            if (missingResources.length === 0) {
                logWithTimestamp('info', 'All blueprint resources found successfully');
                return;
            }
            
            logWithTimestamp('info', \`Missing resources: \${missingResources.join(', ')}. Retrying in \${backoffDelay}ms\`);
            
        } catch (error) {
            logWithTimestamp('warn', \`Error checking blueprint resources: \${error.message}\`);
        }
        
        // Wait before next attempt
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
    
    // Final check to provide detailed error message
    const missingResources = [];
    try {
        const users = await fetchJson(\`\${authentikHost}/api/v3/core/users/?username__iexact=ldapservice\`, { method: 'GET', headers });
        if (!users.results || users.results.length === 0) missingResources.push('LDAP service account (ldapservice)');
        
        const flows = await fetchJson(\`\${authentikHost}/api/v3/flows/instances/?slug__iexact=ldap-authentication-flow\`, { method: 'GET', headers });
        if (!flows.results || flows.results.length === 0) missingResources.push('LDAP authentication flow (ldap-authentication-flow)');
        
        const providers = await fetchJson(\`\${authentikHost}/api/v3/providers/ldap/?name__iexact=Provider for LDAP\`, { method: 'GET', headers });
        if (!providers.results || providers.results.length === 0) missingResources.push('LDAP provider (Provider for LDAP)');
        
        const apps = await fetchJson(\`\${authentikHost}/api/v3/core/applications/?slug__iexact=ldap\`, { method: 'GET', headers });
        if (!apps.results || apps.results.length === 0) missingResources.push('LDAP application (ldap)');
        
        const outposts = await fetchJson(\`\${authentikHost}/api/v3/outposts/instances/?name__iexact=LDAP\`, { method: 'GET', headers });
        if (!outposts.results || outposts.results.length === 0) missingResources.push('LDAP outpost (LDAP)');
    } catch (error) {
        throw new Error(\`Failed to check blueprint resources after timeout: \${error.message}\`);
    }
    
    throw new Error(\`Blueprint failed to create required LDAP resources within 10 minutes. Missing: \${missingResources.join(', ')}. Check Authentik logs and blueprint configuration.\`);
}

async function retrieveToken(authentikHost, authentikApiToken, outpostName, baseDn) {
    outpostName = outpostName || 'LDAP';
    
    logWithTimestamp('info', 'Starting token retrieval process', {
        authentikHost,
        outpostName
    });
    
    // Validate Authentik host URL
    if (!authentikHost || !authentikHost.startsWith('http')) {
        throw new Error(\`Invalid Authentik host URL: \${authentikHost}\`);
    }
    
    // First, try to get existing outpost instances (like original working code)
    let outpost;
    try {
        const outpostInstances = await fetchJson(\`\${authentikHost}/api/v3/outposts/instances/?name__iexact=\${outpostName}\`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': \`Bearer \${authentikApiToken}\`
            }
        });
        
        if (outpostInstances.results && outpostInstances.results.length > 0) {
            // Found running instance, use it directly
            outpost = outpostInstances.results[0];
        }
        
        if (!outpost) {
            logWithTimestamp('info', 'Outpost not found, waiting for blueprint to create resources');
            await waitForBlueprintResources(authentikHost, authentikApiToken);
            
            // Try again after blueprint resources are created
            const outpostInstances = await fetchJson(\`\${authentikHost}/api/v3/outposts/instances/?name__iexact=LDAP\`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': \`Bearer \${authentikApiToken}\`
                }
            });
            outpost = outpostInstances.results?.[0];
            
            if (!outpost) {
                throw new Error('LDAP outpost not found even after blueprint resources were created');
            }
        }
    } catch (error) {
        logWithTimestamp('info', 'Error checking outpost, waiting for blueprint to create resources', { error: error.message });
        await waitForBlueprintResources(authentikHost, authentikApiToken);
        
        // Try again after blueprint resources are created
        const outpostInstances = await fetchJson(\`\${authentikHost}/api/v3/outposts/instances/?name__iexact=LDAP\`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': \`Bearer \${authentikApiToken}\`
            }
        });
        outpost = outpostInstances.results?.[0];
        
        if (!outpost) {
            throw new Error('LDAP outpost not found even after blueprint resources were created');
        }
    }

    // Get the token (with retry for token_identifier)
    if (!outpost.token_identifier) {
        // Refresh outpost data to get token_identifier
        const refreshedOutpost = await fetchJson(\`\${authentikHost}/api/v3/outposts/instances/\${outpost.pk}/\`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': \`Bearer \${authentikApiToken}\`
            }
        });
        outpost = refreshedOutpost;
    }
    
    if (!outpost.token_identifier) {
        throw new Error('Outpost token_identifier not available');
    }

    const tokenUrl = \`\${authentikHost}/api/v3/core/tokens/\${outpost.token_identifier}/view_key/\`;
    const tokenResult = await fetchJson(tokenUrl, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Authorization': \`Bearer \${authentikApiToken}\`
        }
    });

    if (!tokenResult.key) {
        throw new Error('Token not found in response');
    }

    logWithTimestamp('info', 'Token retrieved successfully', {
        tokenLength: tokenResult.key.length
    });

    return tokenResult.key;
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
        LDAPSecretName,
        BaseDN
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
            
            // Create LDAP configuration and retrieve token
            const ldapToken = await withRetry(
                () => retrieveToken(AuthentikHost, adminToken, OutpostName, ResourceProperties.BaseDN || 'DC=example,DC=com'),
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
        BaseDN: props.contextConfig.authentik?.ldapBaseDn || 'DC=example,DC=com',
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
