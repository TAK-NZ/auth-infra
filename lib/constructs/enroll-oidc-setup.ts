import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import { Construct } from 'constructs';
import { ContextEnvironmentConfig } from '../stack-config';

export interface EnrollOidcSetupProps {
  readonly stackConfig: ContextEnvironmentConfig;
  readonly authentikAdminSecret: cdk.aws_secretsmanager.ISecret;
  readonly authentikUrl: string;
}

export class EnrollOidcSetup extends Construct {
  public readonly clientId: string;
  public readonly clientSecret: string;
  public readonly providerName: string;
  public readonly issuer: string;
  public readonly authorizeUrl: string;
  public readonly tokenUrl: string;
  public readonly userInfoUrl: string;
  public readonly jwksUri: string;

  constructor(scope: Construct, id: string, props: EnrollOidcSetupProps) {
    super(scope, id);

    const { stackConfig, authentikAdminSecret, authentikUrl } = props;
    const enrollmentConfig = stackConfig.enrollment;
    
    // Extract domain from authentikUrl (e.g., https://account.tak.nz -> tak.nz)
    const domainMatch = authentikUrl.match(/https:\/\/[^.]+\.([^/]+)/);
    const domain = domainMatch ? domainMatch[1] : 'tak.nz'; // Default to tak.nz if extraction fails
    
    // Ensure enrollmentConfig exists before using it
    if (!enrollmentConfig) {
      throw new Error('Enrollment configuration is missing in stackConfig.enrollment');
    }
    
    // Construct redirect URI and launch URL from enrollmentHostname and domain
    const redirectUri = `https://${enrollmentConfig.enrollmentHostname}.${domain}/oauth2/idpresponse`;
    const launchUrl = `https://${enrollmentConfig.enrollmentHostname}.${domain}/`;

    // Create Lambda function for Authentik OIDC setup using NodejsFunction
    const setupLambda = new nodejs.NodejsFunction(this, 'SetupLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../../src/enroll-oidc-setup/index.js'),
      handler: 'handler',
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node22',
        externalModules: ['@aws-sdk/*'], // AWS SDK v3 is available in the Lambda runtime
        nodeModules: ['axios', 'form-data'], // Include these dependencies
        forceDockerBundling: false,
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (inputDir: string, outputDir: string) => [
            `cp ${inputDir}/src/enroll-oidc-setup/TAK-Enroll.png ${outputDir}/TAK-Enroll.png`
          ]
        }
      },
      // Increase timeout to allow for potential API delays
      timeout: cdk.Duration.minutes(10),
      memorySize: 512,
      retryAttempts: 2,
      environment: {
        AUTHENTIK_URL: authentikUrl,
        AUTHENTIK_ADMIN_SECRET_ARN: authentikAdminSecret.secretArn,
        PROVIDER_NAME: enrollmentConfig.providerName,
        APPLICATION_NAME: enrollmentConfig.applicationName,
        APPLICATION_SLUG: enrollmentConfig.applicationSlug || enrollmentConfig.applicationName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        REDIRECT_URIS: JSON.stringify([redirectUri]),
        LAUNCH_URL: launchUrl,
        OPEN_IN_NEW_TAB: enrollmentConfig.openInNewTab ? 'true' : 'false',
        ...(enrollmentConfig.enrollmentIcon ? { ICON_URL: enrollmentConfig.enrollmentIcon } : {}),
        ...(enrollmentConfig.authenticationFlowName ? { AUTHENTICATION_FLOW_NAME: enrollmentConfig.authenticationFlowName } : {}),
        ...(enrollmentConfig.authorizationFlowName ? { AUTHORIZATION_FLOW_NAME: enrollmentConfig.authorizationFlowName } : {}),
        ...(enrollmentConfig.invalidationFlowName ? { INVALIDATION_FLOW_NAME: enrollmentConfig.invalidationFlowName } : {}),
        ...(enrollmentConfig.groupName ? { GROUP_NAME: enrollmentConfig.groupName } : {}),
        ...(enrollmentConfig.description ? { APPLICATION_DESCRIPTION: enrollmentConfig.description } : {}),
        ...(enrollmentConfig.signingKeyName ? { SIGNING_KEY_NAME: enrollmentConfig.signingKeyName } : {}),
      },
    });

    // Grant Lambda permission to read Authentik admin secret
    authentikAdminSecret.grantRead(setupLambda);
    
    // Grant Lambda permission to use KMS for decrypting secrets
    // Get the KMS key ARN from the secret
    const kmsKeyId = authentikAdminSecret.encryptionKey?.keyArn || '*';
    
    setupLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'kms:Decrypt',
        'kms:DescribeKey',
        'kms:GenerateDataKey'
      ],
      resources: [kmsKeyId]
    }));
    
    // Add permissions to list secrets in case we need to find the secret by name
    setupLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:ListSecrets'],
      resources: ['*']
    }));

    // Create custom resource to invoke Lambda during deployment
    const provider = new cr.Provider(this, 'Provider', {
      onEventHandler: setupLambda,
      logGroup: new logs.LogGroup(this, 'ProviderLogGroup', {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY
      })
    });
    
    // Instead of trying to grant to the provider directly, add the necessary permissions to the Lambda
    // The provider will use the Lambda's permissions when executing
    if (authentikAdminSecret.encryptionKey) {
      // The Lambda already has the necessary permissions from the earlier policy statement
      // No additional grants needed here
    }

    // Create custom resource that will invoke the Lambda
    const customResource = new cdk.CustomResource(this, 'OidcSetupResource', {
      serviceToken: provider.serviceToken,
      properties: {
        // Configuration properties that trigger updates when changed
        providerName: enrollmentConfig.providerName,
        applicationName: enrollmentConfig.applicationName,
        applicationSlug: enrollmentConfig.applicationSlug || enrollmentConfig.applicationName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        redirectUris: JSON.stringify([redirectUri]),
        launchUrl: launchUrl,
        groupName: enrollmentConfig.groupName || '',
        // Add a timestamp to force updates on every deployment
        UpdateTimestamp: Date.now().toString()

      },
    });

    // Export the client ID, secret, and OIDC endpoints from the custom resource outputs
    // Try both formats - with and without 'Data.' prefix
    // The Lambda returns these values in a 'Data' object, but the CDK custom resource
    // provider might flatten this structure or keep it nested
    // Set provider name from config
    this.providerName = enrollmentConfig.providerName;
    
    // Try both formats to get the attributes
    // First try direct access
    let directAccess = false;
    try {
      this.clientId = customResource.getAttString('clientId');
      this.clientSecret = customResource.getAttString('clientSecret');
      this.issuer = customResource.getAttString('issuer');
      this.authorizeUrl = customResource.getAttString('authorizeUrl');
      this.tokenUrl = customResource.getAttString('tokenUrl') || customResource.getAttString('token_endpoint');
      this.userInfoUrl = customResource.getAttString('userInfoUrl') || customResource.getAttString('userinfo_endpoint');
      this.jwksUri = customResource.getAttString('jwksUri') || customResource.getAttString('jwks_uri');
      directAccess = true;
    } catch (error) {
      // Ignore error and try with Data prefix
    }
    
    // If direct access failed, try with Data prefix
    if (!directAccess) {
      try {
        this.clientId = customResource.getAttString('Data.clientId');
        this.clientSecret = customResource.getAttString('Data.clientSecret');
        this.issuer = customResource.getAttString('Data.issuer');
        this.authorizeUrl = customResource.getAttString('Data.authorizeUrl');
        this.tokenUrl = customResource.getAttString('Data.tokenUrl') || customResource.getAttString('Data.token_endpoint');
        this.userInfoUrl = customResource.getAttString('Data.userInfoUrl') || customResource.getAttString('Data.userinfo_endpoint');
        this.jwksUri = customResource.getAttString('Data.jwksUri') || customResource.getAttString('Data.jwks_uri');
      } catch (error) {
        // If both access methods fail, use default values
        const appSlug = enrollmentConfig.applicationSlug || 
                        enrollmentConfig.applicationName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        
        this.clientId = 'error-retrieving-client-id';
        this.clientSecret = 'error-retrieving-client-secret';
        this.issuer = `${authentikUrl}/application/o/${appSlug}/`;
        this.authorizeUrl = `${authentikUrl}/application/o/authorize/`;
        this.tokenUrl = `${authentikUrl}/application/o/token/`;
        this.userInfoUrl = `${authentikUrl}/application/o/userinfo/`;
        this.jwksUri = `${authentikUrl}/application/o/jwks/`;
      }
    }
    
    // Add debug output
    new cdk.CfnOutput(this, 'OidcSetupDebug', {
      value: JSON.stringify({
        clientIdAvailable: this.clientId !== 'error-retrieving-client-id',
        issuerAvailable: this.issuer.startsWith('http'),
        accessMethod: directAccess ? 'direct' : 'nested',
        clientId: this.clientId,
        issuer: this.issuer
      }),
      description: 'OIDC setup debug information',
    });
  }
}