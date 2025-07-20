import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { RemovalPolicy, StackProps, Fn, CfnOutput, Token } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';

// Construct imports
import { Database } from './constructs/database';
import { Redis } from './constructs/redis';
import { Efs } from './constructs/efs';
import { SecretsManager } from './constructs/secrets-manager';
import { SecurityGroups } from './constructs/security-groups';
import { Elb } from './constructs/elb';
import { AuthentikServer } from './constructs/authentik-server';
import { AuthentikWorker } from './constructs/authentik-worker';
import { Ldap } from './constructs/ldap';
import { LdapTokenRetriever } from './constructs/ldap-token-retriever';
import { Route53 } from './constructs/route53-ldap';
import { Route53Authentik } from './constructs/route53-authentik';
import { Route53Enrollment } from './constructs/route53-enrollment';
import { EnrollOidcSetup } from './constructs/enroll-oidc-setup';
import { EnrollAlbOidc } from './constructs/enroll-alb-oidc';
import { EnrollAlbOidcAuth } from './constructs/enroll-alb-oidc-auth';
import { EnrollmentLambda } from './constructs/enrollment-lambda';

// Configuration imports
import type {
  InfrastructureConfig,
  SecretsConfig,
  StorageConfig,
  DeploymentConfig,
  AuthentikApplicationConfig,
  NetworkConfig,
  TokenConfig
} from './construct-configs';

// Utility imports
import { registerOutputs } from './outputs';
import { createBaseImportValue, BASE_EXPORT_NAMES } from './cloudformation-imports';
import { ContextEnvironmentConfig } from './stack-config';
import { ConfigValidator } from './utils/config-validator';


export interface AuthInfraStackProps extends StackProps {
  environment: 'prod' | 'dev-test';
  envConfig: ContextEnvironmentConfig; // Environment configuration from context
}

/**
 * Main CDK stack for the TAK Auth Infrastructure
 */
export class AuthInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AuthInfraStackProps) {
    super(scope, id, {
      ...props,
      description: 'TAK Authentication Layer - Authentik, LDAP Outpost',
    });

    // Validate configuration early
    ConfigValidator.validateEnvironmentConfig(props.envConfig, props.environment);

    // Use environment configuration directly (no complex transformations needed)
    const { envConfig } = props;
    
    // Extract configuration values directly from envConfig
    const stackNameComponent = envConfig.stackName; // This is the STACK_NAME part (e.g., "DevTest")
    
    // Import values from BaseInfra stack exports instead of using config parameters
    const vpcCidr = Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.VPC_CIDR_IPV4));
    const r53ZoneName = Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.HOSTED_ZONE_NAME));
    
    const isHighAvailability = props.environment === 'prod';
    const environmentLabel = props.environment === 'prod' ? 'Prod' : 'Dev-Test';
    const resolvedStackName = id;
    
    // Use computed values from configuration
    const enableHighAvailability = isHighAvailability;
    const enableDetailedMonitoring = envConfig.general.enableDetailedLogging;

    // Get runtime CloudFormation values for stack outputs and resource naming
    const stackName = Fn.ref('AWS::StackName');
    const region = cdk.Stack.of(this).region;

    // Configuration-based parameter resolution
    const authentikAdminUserEmail = envConfig.authentik.adminUserEmail;
    const ldapBaseDn = envConfig.authentik.ldapBaseDn ?? 'dc=tak,dc=nz';
    const hostnameAuthentik = envConfig.authentik.hostname;
    const hostnameLdap = envConfig.authentik.ldapHostname;
    const enableEcsExec = envConfig.ecs.enableEcsExec ?? false;
    const useS3AuthentikConfigFile = envConfig.authentik.useS3AuthentikConfigFile ?? false;
    // NOTE: Postgres read replicas are currently broken in Authentik - see https://github.com/goauthentik/authentik/issues/15191
    const enablePostgresReadReplicas = envConfig.authentik.enablePostgresReadReplicas ?? false;

    // =================
    // IMPORT BASE INFRASTRUCTURE RESOURCES
    // =================

    // Import VPC and networking from base infrastructure
    // Note: Base infrastructure provides 2 subnets (A and B), so we limit to 2 AZs
    const vpcAvailabilityZones = this.availabilityZones.slice(0, 2);
    
    const vpc = ec2.Vpc.fromVpcAttributes(this, 'VPC', {
      vpcId: Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.VPC_ID)),
      availabilityZones: vpcAvailabilityZones,
      // Import subnet IDs from base infrastructure
      publicSubnetIds: [
        Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.SUBNET_PUBLIC_A)),
        Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.SUBNET_PUBLIC_B))
      ],
      privateSubnetIds: [
        Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.SUBNET_PRIVATE_A)),
        Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.SUBNET_PRIVATE_B))
      ],
      vpcCidrBlock: Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.VPC_CIDR_IPV4))
    });

    // KMS
    const kmsKey = kms.Key.fromKeyArn(this, 'KMSKey', 
      Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.KMS_KEY))
    );

    // ECS
    const ecsClusterArn = Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.ECS_CLUSTER));
    // Extract cluster name from ARN: arn:aws:ecs:region:account:cluster/cluster-name
    const ecsClusterName = Fn.select(1, Fn.split('/', ecsClusterArn));
    const ecsCluster = ecs.Cluster.fromClusterAttributes(this, 'ECSCluster', {
      clusterArn: ecsClusterArn,
      clusterName: ecsClusterName,
      vpc: vpc
    });

    // S3
    const s3ConfBucket = s3.Bucket.fromBucketArn(this, 'S3ConfBucket',
      Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.S3_ENV_CONFIG))
    );



    // Route53
    const hostedZoneId = Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.HOSTED_ZONE_ID));
    const hostedZoneName = Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.HOSTED_ZONE_NAME));

    // SSL Certificate
    const sslCertificateArn = Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.CERTIFICATE_ARN));

    // S3 Environment File paths - assumes authentik-config.env already exists in S3
    const envFileS3Key = `authentik-config.env`;
    const envFileS3Uri = `arn:aws:s3:::${s3ConfBucket.bucketName}/${envFileS3Key}`;

    // =================
    // LOAD BALANCER (needed first for security group reference)
    // =================

    // Build network config for DNS and load balancers
    const authentikNetworkConfig: NetworkConfig = {
      hostedZoneId: hostedZoneId,
      hostedZoneName: hostedZoneName,
      sslCertificateArn: sslCertificateArn,
      hostname: hostnameAuthentik
    };

    // Authentik Load Balancer (create first to get security group)
    const authentikELB = new Elb(this, 'AuthentikELB', {
      environment: props.environment,
      contextConfig: envConfig,
      infrastructure: {
        vpc,
        ecsSecurityGroup: new ec2.SecurityGroup(this, 'TempSG', { vpc }), // Temporary, will be replaced
        ecsCluster,
        kmsKey
      },
      network: authentikNetworkConfig
    });

    // =================
    // SECURITY GROUPS
    // =================

    // Create all security groups using dedicated construct
    const securityGroups = new SecurityGroups(this, 'SecurityGroups', {
      vpc,
      stackNameComponent,
      albSecurityGroup: authentikELB.loadBalancer.connections.securityGroups[0],
      outboundEmailServerPort: envConfig.authentik.outboundEmailServerPort
    });

    // =================
    // BUILD CONFIGURATION OBJECTS
    // =================

    // Build infrastructure config for Authentik Server
    const authentikServerInfrastructureConfig: InfrastructureConfig = {
      vpc,
      ecsSecurityGroup: securityGroups.authentikServer,
      ecsCluster,
      kmsKey
    };

    // Build infrastructure config for Authentik Worker
    const authentikWorkerInfrastructureConfig: InfrastructureConfig = {
      vpc,
      ecsSecurityGroup: securityGroups.authentikWorker,
      ecsCluster,
      kmsKey
    };

    // Build shared infrastructure config for LDAP Outpost services
    const ldapInfrastructureConfig: InfrastructureConfig = {
      vpc,
      ecsSecurityGroup: securityGroups.ldap,
      ecsCluster,
      kmsKey
    };

    // =================
    // CORE INFRASTRUCTURE
    // =================

    // SecretsManager
    const secretsManager = new SecretsManager(this, 'SecretsManager', {
      environment: stackNameComponent,
      stackName: resolvedStackName,
      infrastructure: authentikServerInfrastructureConfig
    });

    // Database
    const database = new Database(this, 'Database', {
      environment: props.environment,
      stackName: resolvedStackName,
      contextConfig: envConfig,
      infrastructure: authentikServerInfrastructureConfig,
      securityGroups: [securityGroups.database]
    });

    // Redis
    const redis = new Redis(this, 'Redis', {
      environment: props.environment,
      stackName: resolvedStackName,
      contextConfig: envConfig,
      infrastructure: authentikServerInfrastructureConfig,
      securityGroups: [securityGroups.redis]
    });

    // EFS
    const efs = new Efs(this, 'EFS', {
      environment: props.environment,
      contextConfig: envConfig,
      infrastructure: authentikServerInfrastructureConfig,
      allowAccessFrom: [securityGroups.authentikServer, securityGroups.authentikWorker]
    });

    // =================
    // BUILD CONFIGURATION OBJECTS
    // =================

    // Build shared config objects
    const secretsConfig: SecretsConfig = {
      database: database.masterSecret,
      redisAuthToken: redis.authToken,
      authentik: {
        secretKey: secretsManager.secretKey,
        adminUserPassword: secretsManager.adminUserPassword,
        adminUserToken: secretsManager.adminUserToken,
        ldapToken: secretsManager.ldapToken,
        ldapServiceUser: secretsManager.ldapServiceUser
      }
    };

    const storageConfig: StorageConfig = {
      s3: {
        configBucket: s3ConfBucket,
        envFileUri: envFileS3Uri,
        envFileKey: envFileS3Key
      },
      efs: {
        fileSystemId: efs.fileSystem.fileSystemId,
        mediaAccessPointId: efs.mediaAccessPoint.accessPointId,
        customTemplatesAccessPointId: efs.customTemplatesAccessPoint.accessPointId
      }
    };

    const deploymentConfig: DeploymentConfig = {
      enableExecute: enableEcsExec,
      useConfigFile: useS3AuthentikConfigFile
    };

    const applicationConfig: AuthentikApplicationConfig = {
      adminUserEmail: authentikAdminUserEmail,
      ldapBaseDn: ldapBaseDn,
      database: {
        hostname: database.hostname,
        readReplicaHostname: enablePostgresReadReplicas ? database.readerEndpoint : undefined
      },
      redis: {
        hostname: redis.hostname
      },
      authentikHost: `https://${hostnameAuthentik}.${hostedZoneName}`
    };

    const ldapNetworkConfig: NetworkConfig = {
      hostedZoneId: hostedZoneId,
      hostedZoneName: hostedZoneName,
      sslCertificateArn: sslCertificateArn,
      hostname: hostnameLdap
    };

    // =================
    // APPLICATION SERVICES
    // =================

    // Determine container image strategy
    const app = cdk.App.of(this)!;
    const usePreBuiltImages = app.node.tryGetContext('usePreBuiltImages') ?? false;
    
    // Build image tags from configuration
    const authentikVersion = envConfig.authentik.authentikVersion;
    const branding = envConfig.authentik.branding;
    const buildRevision = envConfig.authentik.buildRevision;
    
    const defaultAuthentikTag = `authentik:${authentikVersion}-${branding}-r${buildRevision}`;
    const defaultLdapTag = `ldap:${authentikVersion}-r${buildRevision}`;
    
    // Allow override via context parameters
    const authentikImageTag = app.node.tryGetContext('authentikImageTag') ?? defaultAuthentikTag;
    const ldapImageTag = app.node.tryGetContext('ldapImageTag') ?? defaultLdapTag;
    
    // Build container image URIs if using pre-built images
    let authentikImageUri: string | undefined;
    let ldapImageUri: string | undefined;
    let sharedDockerAsset: ecrAssets.DockerImageAsset | undefined;
    
    if (usePreBuiltImages) {
      // Get ECR repository ARN from BaseInfra and extract repository name
      const ecrRepoArn = Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.ECR_REPO));
      const ecrRepoName = Fn.select(1, Fn.split('/', ecrRepoArn));
      
      // Construct full image URIs with correct repository and tag format
      authentikImageUri = `${this.account}.dkr.ecr.${this.region}.amazonaws.com/${Token.asString(ecrRepoName)}:${authentikImageTag}`;
      ldapImageUri = `${this.account}.dkr.ecr.${this.region}.amazonaws.com/${Token.asString(ecrRepoName)}:${ldapImageTag}`;
    }
    
    // Create shared Docker image asset only if not using pre-built images
    if (!usePreBuiltImages) {
      const dockerfileName = `Dockerfile.${envConfig.authentik.branding}`;
      sharedDockerAsset = new ecrAssets.DockerImageAsset(this, 'AuthentikDockerAsset', {
        directory: '.',
        file: `docker/authentik-server/${dockerfileName}`,
        buildArgs: {
          AUTHENTIK_VERSION: envConfig.authentik.authentikVersion
        },
        // Exclude files that change frequently but don't affect the Docker build
        exclude: [
          'node_modules/**',
          'cdk.out/**',
          '.cdk.staging/**',
          '**/*.log',
          '**/*.tmp',
          '.git/**',
          '.vscode/**',
          '.idea/**',
          'test/**',
          'docs/**',
          'lib/**/*.js',
          'lib/**/*.d.ts',
          'lib/**/*.js.map',
          'bin/**/*.js',
          'bin/**/*.d.ts',
          '**/.DS_Store',
          '**/Thumbs.db'
        ]
      });
    }

    // Authentik Server
    const authentikServer = new AuthentikServer(this, 'AuthentikServer', {
      environment: props.environment,
      contextConfig: envConfig,
      infrastructure: authentikServerInfrastructureConfig,
      secrets: secretsConfig,
      storage: storageConfig,
      deployment: deploymentConfig,
      application: applicationConfig,
      dockerImageAsset: sharedDockerAsset,
      containerImageUri: authentikImageUri
    });

    // Authentik Worker  
    // Update authentication host for worker after Route53 setup
    const authentikWorkerConfig = { ...applicationConfig };
    const authentikWorker = new AuthentikWorker(this, 'AuthentikWorker', {
      environment: props.environment,
      contextConfig: envConfig,
      infrastructure: authentikWorkerInfrastructureConfig,
      secrets: secretsConfig,
      storage: storageConfig,
      deployment: deploymentConfig,
      application: authentikWorkerConfig,
      dockerImageAsset: sharedDockerAsset,
      containerImageUri: authentikImageUri
    });

    // Connect Authentik Server to Load Balancer
    authentikServer.createTargetGroup(vpc, authentikELB.httpsListener, `tak-${envConfig.stackName.toLowerCase()}-authentik`);

    // =================
    // DNS SETUP (AUTHENTIK)
    // =================

    // Route53 Authentik DNS Records (needed before LDAP token retriever and OIDC setup)
    const route53Authentik = new Route53Authentik(this, 'Route53Authentik', {
      environment: props.environment,
      contextConfig: envConfig,
      network: authentikNetworkConfig,
      authentikLoadBalancer: authentikELB.loadBalancer
    });

    // =================
    // LDAP CONFIGURATION
    // =================

    // Build token config for LDAP token retrieval
    const tokenConfig: TokenConfig = {
      outpostName: 'LDAP',
      adminTokenSecret: secretsManager.adminUserToken,
      ldapTokenSecret: secretsManager.ldapToken,
      authentikServerService: authentikServer.ecsService,
      authentikWorkerService: authentikWorker.ecsService
    };

    // Update application config with proper Authentik URL
    const ldapApplicationConfig: AuthentikApplicationConfig = {
      ...applicationConfig,
      authentikHost: route53Authentik.getAuthentikUrl()
    };

    // LDAP Token Retriever
    const ldapTokenRetriever = new LdapTokenRetriever(this, 'LdapTokenRetriever', {
      environment: props.environment,
      contextConfig: envConfig,
      infrastructure: authentikServerInfrastructureConfig,
      deployment: deploymentConfig,
      token: tokenConfig,
      application: ldapApplicationConfig
    });

    // LDAP Outpost
    const ldap = new Ldap(this, 'LDAP', {
      environment: props.environment,
      contextConfig: envConfig,
      infrastructure: ldapInfrastructureConfig,
      storage: storageConfig,
      deployment: deploymentConfig,
      network: ldapNetworkConfig,
      application: ldapApplicationConfig,
      ldapToken: secretsManager.ldapToken,
      nlbSecurityGroup: securityGroups.ldapNlb,
      containerImageUri: ldapImageUri
    });

    // Ensure LDAP waits for the token to be retrieved
    ldap.node.addDependency(ldapTokenRetriever);

    // =================
    // DNS AND ROUTING
    // =================

    // =================
    // DNS SETUP (LDAP)
    // =================

    // Route53 LDAP DNS Records (after LDAP construct is created)
    const route53 = new Route53(this, 'Route53', {
      environment: props.environment,
      contextConfig: envConfig,
      network: ldapNetworkConfig,
      ldapLoadBalancer: ldap.loadBalancer
    });

    // Add dependency for LDAP token retriever to wait for Authentik DNS records
    ldapTokenRetriever.customResource.node.addDependency(route53Authentik.authentikARecord);
    ldapTokenRetriever.customResource.node.addDependency(route53Authentik.authentikAAAARecord);

    // =================
    // OIDC SETUP FOR TAK ENROLLMENT
    // =================

    // Create OIDC provider and application for TAK enrollment
    const oidcSetup = new EnrollOidcSetup(this, 'OidcSetup', {
      stackConfig: envConfig,
      authentikAdminSecret: secretsManager.adminUserToken,
      authentikUrl: route53Authentik.getAuthentikUrl()
    });
    
    // Add debug outputs for OIDC setup
    new cdk.CfnOutput(this, 'OidcSetupClientId', {
      value: oidcSetup.clientId || 'undefined',
      description: 'OIDC Client ID from setup',
    });
    
    new cdk.CfnOutput(this, 'OidcSetupIssuer', {
      value: oidcSetup.issuer || 'undefined',
      description: 'OIDC Issuer from setup',
    });
    
    // Add comprehensive debug output for OIDC setup
    new cdk.CfnOutput(this, 'OidcSetupDebugInfo', {
      value: JSON.stringify({
        clientId: oidcSetup.clientId,
        issuer: oidcSetup.issuer,
        authorizeUrl: oidcSetup.authorizeUrl,
        tokenUrl: oidcSetup.tokenUrl,
        userInfoUrl: oidcSetup.userInfoUrl,
        jwksUri: oidcSetup.jwksUri
      }),
      description: 'Complete OIDC setup information',
    });
    
    // Create enrollment Lambda function
    const enrollmentLambda = new EnrollmentLambda(this, 'EnrollmentLambda', {
      stackConfig: envConfig,
      authentikAdminSecret: secretsManager.adminUserToken,
      authentikUrl: route53Authentik.getAuthentikUrl(),
      takServerDomain: `ops.${hostedZoneName}`,
      domainName: hostedZoneName,
      stackName: stackNameComponent
    });
    
    // Configure ALB with OIDC authentication for enrollment
    const enrollAlbOidc = new EnrollAlbOidc(this, 'EnrollAlbOidc', {
      alb: authentikELB.loadBalancer,
      httpsListener: authentikELB.httpsListener,
      stackConfig: envConfig,
      domainName: hostedZoneName,
      clientId: oidcSetup.clientId,
      clientSecret: oidcSetup.clientSecret,
      issuer: oidcSetup.issuer,
      authorizeUrl: oidcSetup.authorizeUrl,
      tokenUrl: oidcSetup.tokenUrl,
      userInfoUrl: oidcSetup.userInfoUrl,
      jwksUri: oidcSetup.jwksUri,
      targetFunction: enrollmentLambda.function,
      stackName: stackNameComponent
    });
    
    // Configure OIDC authentication for the enrollment listener rule
    const enrollAlbOidcAuth = new EnrollAlbOidcAuth(this, 'EnrollAlbOidcAuth', {
      listenerArn: enrollAlbOidc.ruleArn,
      enrollmentHostname: envConfig.enrollment?.enrollmentHostname || 'enroll',
      clientId: oidcSetup.clientId,
      clientSecret: oidcSetup.clientSecret,
      issuer: oidcSetup.issuer,
      authorizeUrl: oidcSetup.authorizeUrl,
      tokenUrl: oidcSetup.tokenUrl,
      userInfoUrl: oidcSetup.userInfoUrl,
      stackName: stackNameComponent
    });
    
    // Create Route53 DNS records for enrollment
    const enrollmentNetworkConfig: NetworkConfig = {
      hostedZoneId: hostedZoneId,
      hostedZoneName: hostedZoneName,
      sslCertificateArn: sslCertificateArn,
      hostname: envConfig.enrollment?.enrollmentHostname || 'enroll'
    };
    
    const route53Enrollment = new Route53Enrollment(this, 'Route53Enrollment', {
      environment: props.environment,
      contextConfig: envConfig,
      network: enrollmentNetworkConfig,
      loadBalancer: authentikELB.loadBalancer
    });

    // =================
    // STACK OUTPUTS
    // =================

    // Build custom domain URLs
    const authentikCustomDomain = `${hostnameAuthentik}.${hostedZoneName}`;
    const ldapCustomDomain = `${hostnameLdap}.${hostedZoneName}`;
    
    // Outputs
    registerOutputs({
      stack: this,
      stackName: stackName,
      databaseEndpoint: database.hostname,
      databaseSecretArn: database.masterSecret.secretArn,
      redisEndpoint: redis.hostname,
      redisAuthTokenArn: redis.authToken.secretArn,
      efsId: efs.fileSystem.fileSystemId,
      efsMediaAccessPointId: efs.mediaAccessPoint.accessPointId,
      efsTemplatesAccessPointId: efs.customTemplatesAccessPoint.accessPointId,
      authentikSecretKeyArn: secretsManager.secretKey.secretArn,
      authentikAdminTokenArn: secretsManager.adminUserToken.secretArn,
      authentikLdapTokenArn: secretsManager.ldapToken.secretArn,
      authentikLdapServiceUserArn: secretsManager.ldapServiceUser.secretArn,
      authentikAlbDns: authentikELB.loadBalancer.loadBalancerDnsName,
      authentikUrl: `https://${authentikCustomDomain}`,
      ldapNlbDns: ldap.loadBalancer.loadBalancerDnsName,
      ldapEndpoint: `ldap://${ldapCustomDomain}:389`,
      ldapsEndpoint: `ldaps://${ldapCustomDomain}:636`,
      ldapBaseDn: ldapBaseDn,
      ldapTokenRetrieverLambdaArn: ldapTokenRetriever.lambdaFunction.functionArn,
      oidcClientId: oidcSetup.clientId,
      oidcClientSecret: oidcSetup.clientSecret,
      oidcProviderName: oidcSetup.providerName,
      oidcIssuer: oidcSetup.issuer,
      oidcAuthorizeUrl: oidcSetup.authorizeUrl,
      oidcTokenUrl: oidcSetup.tokenUrl,
      oidcUserInfoUrl: oidcSetup.userInfoUrl,
      oidcJwksUri: oidcSetup.jwksUri,
      enrollmentTargetGroupArn: enrollAlbOidc.targetGroup.targetGroupArn,
      enrollmentUrl: route53Enrollment.getEnrollmentUrl()
    });
  }


}


