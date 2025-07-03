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

// LDAP Configuration constants
const LDAP_CONFIG = {
    username: 'ldapservice',
    gidStart: 4000,
    uidStart: 2000
};

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

// Enhanced helper function to send CloudFormation response
async function sendResponse(event, context, responseStatus, responseData = {}) {
    const responseBody = JSON.stringify({
        Status: responseStatus,
        Reason: responseStatus === 'FAILED' ? responseData.Message : 'Success',
        PhysicalResourceId: context.logStreamName,
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

// HTTP client with detailed logging
async function apiCall(url, options) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const lib = urlObj.protocol === 'https:' ? https : http;
        
        logWithTimestamp('debug', 'Making API request', {
            url: url,
            method: options.method || 'GET'
        });
        
        const req = lib.request(url, {
            method: options.method || 'GET',
            headers: options.headers || {},
            timeout: 30000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                logWithTimestamp('debug', 'API response received', {
                    statusCode: res.statusCode,
                    url: url
                });
                
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        const jsonData = JSON.parse(data);
                        resolve(jsonData);
                    } catch (e) {
                        reject(new Error(\`Invalid JSON response: \${e.message}\`));
                    }
                } else {
                    reject(new Error(\`HTTP error! status: \${res.statusCode}, response: \${data.substring(0, 200)}\`));
                }
            });
        });
        
        req.on('error', reject);
        req.on('timeout', () => {
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
    
    const command = new GetSecretValueCommand({ SecretId: adminSecretName });
    const response = await secretsManager.send(command);
    
    if (!response.SecretString) {
        throw new Error('Admin token secret is empty or invalid');
    }
    
    return response.SecretString;
}

// Helper function to get or create resource
async function getOrCreate(getUrl, createData, resourceName, headers) {
    try {
        const existing = await apiCall(getUrl, { method: 'GET', headers });
        if (existing.results && existing.results.length > 0) {
            logWithTimestamp('info', \`\${resourceName} already exists\`, { id: existing.results[0].pk });
            return existing.results[0];
        }
    } catch (error) {
        logWithTimestamp('debug', \`Error checking existing \${resourceName}\`, { error: error.message });
    }
    
    const created = await apiCall(createData.url, {
        method: 'POST',
        headers,
        body: createData.body
    });
    logWithTimestamp('info', \`\${resourceName} created\`, { id: created.pk });
    return created;
}

// Create LDAP configuration via Authentik API
async function createLdapConfiguration(authentikHost, adminToken, baseDn) {
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${adminToken}\`
    };

    logWithTimestamp('info', 'Creating LDAP configuration via API');

    // 1. Get or create service account
    const serviceAccount = await getOrCreate(
        \`\${authentikHost}/api/v3/core/users/?username=\${LDAP_CONFIG.username}\`,
        {
            url: \`\${authentikHost}/api/v3/core/users/\`,
            body: {
                username: LDAP_CONFIG.username,
                name: 'LDAP Service account',
                type: 'service_account',
                password: \`ldap-\${Date.now()}\`
            }
        },
        'Service account',
        headers
    );

    // 2. Get default flows
    const flows = await apiCall(\`\${authentikHost}/api/v3/flows/flows/\`, { method: 'GET', headers });
    const invalidationFlow = flows.results.find(f => f.slug === 'default-invalidation-flow');

    // 3. Get or create authentication flow
    const authFlow = await getOrCreate(
        \`\${authentikHost}/api/v3/flows/flows/?slug=ldap-authentication-flow\`,
        {
            url: \`\${authentikHost}/api/v3/flows/flows/\`,
            body: {
                name: 'ldap-authentication-flow',
                slug: 'ldap-authentication-flow',
                title: 'ldap-authentication-flow',
                designation: 'authentication',
                authentication: 'require_outpost',
                denied_action: 'message_continue',
                layout: 'stacked',
                policy_engine_mode: 'any'
            }
        },
        'Authentication flow',
        headers
    );

    // 4. Get or create stages
    const identificationStage = await getOrCreate(
        \`\${authentikHost}/api/v3/stages/identification/?name=ldap-identification-stage\`,
        {
            url: \`\${authentikHost}/api/v3/stages/identification/\`,
            body: {
                name: 'ldap-identification-stage',
                case_insensitive_matching: true,
                pretend_user_exists: true,
                show_matched_user: true,
                user_fields: ['username', 'email']
            }
        },
        'Identification stage',
        headers
    );

    const loginStage = await getOrCreate(
        \`\${authentikHost}/api/v3/stages/user_login/?name=ldap-authentication-login\`,
        {
            url: \`\${authentikHost}/api/v3/stages/user_login/\`,
            body: {
                name: 'ldap-authentication-login',
                geoip_binding: 'bind_continent',
                network_binding: 'bind_asn',
                remember_me_offset: 'seconds=0',
                session_duration: 'seconds=0'
            }
        },
        'Login stage',
        headers
    );

    // 5. Create stage bindings (check if they exist first)
    try {
        const bindings = await apiCall(\`\${authentikHost}/api/v3/flows/bindings/?target=\${authFlow.pk}\`, { method: 'GET', headers });
        const hasIdentificationBinding = bindings.results.some(b => b.stage === identificationStage.pk);
        const hasLoginBinding = bindings.results.some(b => b.stage === loginStage.pk);
        
        if (!hasIdentificationBinding) {
            await apiCall(\`\${authentikHost}/api/v3/flows/bindings/\`, {
                method: 'POST',
                headers,
                body: {
                    target: authFlow.pk,
                    stage: identificationStage.pk,
                    order: 10,
                    evaluate_on_plan: true,
                    invalid_response_action: 'retry',
                    policy_engine_mode: 'any',
                    re_evaluate_policies: true
                }
            });
            logWithTimestamp('info', 'Identification stage binding created');
        }
        
        if (!hasLoginBinding) {
            await apiCall(\`\${authentikHost}/api/v3/flows/bindings/\`, {
                method: 'POST',
                headers,
                body: {
                    target: authFlow.pk,
                    stage: loginStage.pk,
                    order: 30,
                    evaluate_on_plan: true,
                    invalid_response_action: 'retry',
                    policy_engine_mode: 'any',
                    re_evaluate_policies: true
                }
            });
            logWithTimestamp('info', 'Login stage binding created');
        }
    } catch (error) {
        logWithTimestamp('warn', 'Error managing stage bindings', { error: error.message });
    }

    // 6. Get or create LDAP provider
    const ldapProvider = await getOrCreate(
        \`\${authentikHost}/api/v3/providers/ldap/?name=LDAP\`,
        {
            url: \`\${authentikHost}/api/v3/providers/ldap/\`,
            body: {
                name: 'LDAP',
                authorization_flow: authFlow.pk,
                base_dn: baseDn,
                bind_mode: 'cached',
                gid_start_number: LDAP_CONFIG.gidStart,
                invalidation_flow: invalidationFlow?.pk,
                mfa_support: true,
                search_mode: 'cached',
                uid_start_number: LDAP_CONFIG.uidStart
            }
        },
        'LDAP provider',
        headers
    );

    // 7. Add service account permissions to LDAP provider
    try {
        await apiCall(\`\${authentikHost}/api/v3/providers/ldap/\${ldapProvider.pk}/\`, {
            method: 'PATCH',
            headers,
            body: {
                search_group: serviceAccount.pk
            }
        });
        logWithTimestamp('info', 'Service account permissions added to LDAP provider');
    } catch (error) {
        logWithTimestamp('warn', 'Error adding service account permissions', { error: error.message });
    }

    // 8. Get or create application
    const application = await getOrCreate(
        \`\${authentikHost}/api/v3/core/applications/?slug=ldap\`,
        {
            url: \`\${authentikHost}/api/v3/core/applications/\`,
            body: {
                name: 'LDAP',
                slug: 'ldap',
                policy_engine_mode: 'any',
                provider: ldapProvider.pk
            }
        },
        'Application',
        headers
    );

    // 9. Get or create outpost
    const outpost = await getOrCreate(
        \`\${authentikHost}/api/v3/outposts/outposts/?name=LDAP\`,
        {
            url: \`\${authentikHost}/api/v3/outposts/outposts/\`,
            body: {
                name: 'LDAP',
                type: 'ldap',
                providers: [ldapProvider.pk],
                config: {
                    authentik_host: authentikHost
                }
            }
        },
        'Outpost',
        headers
    );

    return outpost;
}

async function retrieveToken(authentikHost, adminToken, outpostName, baseDn) {
    logWithTimestamp('info', 'Starting token retrieval process', {
        authentikHost,
        outpostName
    });
    
    // First, try to get existing outpost
    let outpost;
    try {
        const outposts = await apiCall(\`\${authentikHost}/api/v3/outposts/outposts/?name=\${outpostName}\`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': \`Bearer \${adminToken}\`
            }
        });
        
        outpost = outposts.results?.[0];
        if (!outpost) {
            logWithTimestamp('info', 'Outpost not found, creating LDAP configuration');
            outpost = await createLdapConfiguration(authentikHost, adminToken, baseDn);
        }
    } catch (error) {
        logWithTimestamp('info', 'Error checking outpost, creating LDAP configuration', { error: error.message });
        outpost = await createLdapConfiguration(authentikHost, adminToken, baseDn);
    }

    // Get the token (with retry for token_identifier)
    if (!outpost.token_identifier) {
        // Refresh outpost data to get token_identifier
        const refreshedOutpost = await apiCall(\`\${authentikHost}/api/v3/outposts/outposts/\${outpost.pk}/\`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': \`Bearer \${adminToken}\`
            }
        });
        outpost = refreshedOutpost;
    }
    
    if (!outpost.token_identifier) {
        throw new Error('Outpost token_identifier not available');
    }

    const tokenUrl = \`\${authentikHost}/api/v3/core/tokens/\${outpost.token_identifier}/view_key/\`;
    const tokenResult = await apiCall(tokenUrl, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Authorization': \`Bearer \${adminToken}\`
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
    logWithTimestamp('info', 'Updating LDAP token secret', { secretName });
    
    const command = new PutSecretValueCommand({
        SecretId: secretName,
        SecretString: secretValue
    });
    
    await secretsManager.send(command);
    logWithTimestamp('info', 'LDAP token secret updated successfully');
}

exports.handler = async (event, context) => {
    const startTime = Date.now();
    
    logWithTimestamp('info', 'Lambda function started', {
        requestId: context.awsRequestId,
        functionName: context.functionName
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
            logWithTimestamp('info', 'Processing LDAP configuration and token retrieval', {
                requestType: RequestType,
                environment: Environment,
                authentikHost: AuthentikHost,
                outpostName: OutpostName
            });
            
            // Get admin token
            const adminToken = await withRetry(
                () => getAdminToken(AdminSecretName),
                'getAdminToken',
                { secretName: AdminSecretName }
            );
            
            // Create LDAP configuration and retrieve token
            const ldapToken = await withRetry(
                () => retrieveToken(AuthentikHost, adminToken, OutpostName, BaseDN),
                'retrieveToken',
                { authentikHost: AuthentikHost, outpostName: OutpostName }
            );
            
            // Store token in Secrets Manager
            await withRetry(
                () => putLDAPSecret(LDAPSecretName, ldapToken),
                'putLDAPSecret',
                { secretName: LDAPSecretName }
            );
            
            const executionTime = Date.now() - startTime;
            
            logWithTimestamp('info', 'LDAP configuration and token retrieval completed', {
                executionTimeMs: executionTime
            });
            
            await sendResponse(event, context, 'SUCCESS', {
                Message: 'LDAP configuration created and token retrieved successfully',
                ExecutionTimeMs: executionTime
            });
        } else if (RequestType === 'Delete') {
            await sendResponse(event, context, 'SUCCESS', {
                Message: 'Delete completed - no action needed'
            });
        }
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        logWithTimestamp('error', 'Lambda function failed', {
            error: error.message,
            errorType: error.constructor.name,
            executionTimeMs: executionTime
        });
        
        await sendResponse(event, context, 'FAILED', {
            Message: error.message,
            ErrorType: error.constructor.name,
            ExecutionTimeMs: executionTime
        });
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
