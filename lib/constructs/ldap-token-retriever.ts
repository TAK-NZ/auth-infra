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
import type { AuthInfraEnvironmentConfig } from '../environment-config';

/**
 * Properties for the LDAP Token Retriever construct
 */
export interface LdapTokenRetrieverProps {
  /**
   * Environment name (e.g. 'prod', 'dev', etc.)
   */
  environment: string;

  /**
   * Environment configuration
   */
  config: AuthInfraEnvironmentConfig;

  /**
   * KMS key for encryption
   */
  kmsKey: kms.IKey;

  /**
   * Authentik host URL
   */
  authentikHost: string;

  /**
   * Name of the LDAP outpost in Authentik
   */
  outpostName?: string;

  /**
   * Admin token secret for accessing Authentik API
   */
  adminTokenSecret: secretsmanager.ISecret;

  /**
   * LDAP token secret to update
   */
  ldapTokenSecret: secretsmanager.ISecret;

  /**
   * Git SHA for versioning
   */
  gitSha: string;

  /**
   * Authentik server ECS service (to ensure it's running before token retrieval)
   */
  authentikServerService: ecs.FargateService;

  /**
   * Authentik worker ECS service (to ensure it's running before token retrieval)
   */
  authentikWorkerService: ecs.FargateService;
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

    // Create CloudWatch log group for the Lambda function
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/lambda/TAK-${props.environment}-AuthInfra-update-ldap-token`,
      retention: props.config.monitoring.logRetentionDays,
      removalPolicy: props.config.general.removalPolicy
    });

    // Create IAM role for the Lambda function
    const lambdaRole = new iam.Role(this, 'LambdaRole', {
      roleName: `TAK-${props.environment}-AuthInfra-update-ldap-token-lambda-role`,
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
                props.adminTokenSecret.secretArn,
                props.ldapTokenSecret.secretArn,
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
              resources: [props.kmsKey.keyArn]
            })
          ]
        })
      }
    });

    // Create the Lambda function
    this.lambdaFunction = new lambda.Function(this, 'Function', {
      functionName: `TAK-${props.environment}-AuthInfra-update-ldap-token`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      role: lambdaRole,
      timeout: Duration.minutes(5),
      logGroup: logGroup,
      environment: {
        NODE_OPTIONS: '--enable-source-maps'
      },
      code: lambda.Code.fromInline(`
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
    const provider = lambda.Function.fromFunctionArn(this, 'Provider', this.lambdaFunction.functionArn);

    // Create the custom resource
    this.customResource = new CustomResource(this, 'Resource', {
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
