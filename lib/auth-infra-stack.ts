import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { RemovalPolicy, StackProps, Fn, CfnOutput } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';

// Construct imports
import { Database } from './constructs/database';
import { Redis } from './constructs/redis';
import { Efs } from './constructs/efs';
import { SecretsManager } from './constructs/secrets-manager';
import { Elb } from './constructs/elb';
import { AuthentikServer } from './constructs/authentik-server';
import { AuthentikWorker } from './constructs/authentik-worker';
import { Ldap } from './constructs/ldap';
import { LdapTokenRetriever } from './constructs/ldap-token-retriever';
import { Route53 } from './constructs/route53';
import { Route53Authentik } from './constructs/route53-authentik';

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
import { DEFAULT_VPC_CIDR } from './utils/constants';

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

    // Add Environment Type tag to the stack
    cdk.Tags.of(this).add('Environment Type', environmentLabel);

    // TODO: Replace with direct context usage once constructs are updated
    // For now, we'll use envConfig directly but rename it for clarity
    const environmentConfig = envConfig; // Direct context usage (matches reference pattern)

    const stackName = Fn.ref('AWS::StackName');
    const region = cdk.Stack.of(this).region;

    // Configuration-based parameter resolution
    const authentikAdminUserEmail = envConfig.authentik.adminUserEmail;
    const ldapBaseDn = `dc=${r53ZoneName.split('.').join(',dc=')}`;
    const hostnameAuthentik = envConfig.authentik.domain.split('.')[0]; // Extract subdomain
    const hostnameLdap = envConfig.ldap.domain.split('.')[0]; // Extract subdomain
    const gitSha = 'latest'; // Use fixed tag for context-driven approach
    const enableExecute = false; // Disable by default for security
    const useAuthentikConfigFile = false; // Use environment variables

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
      Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.S3_BUCKET))
    );

    // ECR
    const ecrRepository = Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.ECR_REPO));

    // Route53
    const hostedZoneId = Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.HOSTED_ZONE_ID));
    const hostedZoneName = Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.HOSTED_ZONE_NAME));

    // SSL Certificate
    const sslCertificateArn = Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.CERTIFICATE_ARN));

    // S3 Environment File paths - assumes authentik-config.env already exists in S3
    const envFileS3Key = `authentik-config.env`;
    const envFileS3Uri = `arn:aws:s3:::${s3ConfBucket.bucketName}/${envFileS3Key}`;

    // =================
    // SECURITY GROUPS
    // =================

    // Security Groups
    const authentikSecurityGroup = this.createAuthentikSecurityGroup(vpc, stackNameComponent);
    const ldapSecurityGroup = this.createLdapSecurityGroup(vpc, stackNameComponent);
    const dbSecurityGroup = this.createDbSecurityGroup(vpc, authentikSecurityGroup);

    // =================
    // BUILD CONFIGURATION OBJECTS
    // =================

    // Build shared infrastructure config for Authentik services
    const authentikInfrastructureConfig: InfrastructureConfig = {
      vpc,
      ecsSecurityGroup: authentikSecurityGroup,
      ecsCluster,
      kmsKey
    };

    // Build shared infrastructure config for LDAP services
    const ldapInfrastructureConfig: InfrastructureConfig = {
      vpc,
      ecsSecurityGroup: ldapSecurityGroup,
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
      infrastructure: authentikInfrastructureConfig
    });

    // Database
    const database = new Database(this, 'Database', {
      environment: props.environment,
      stackName: resolvedStackName,
      contextConfig: envConfig,
      infrastructure: authentikInfrastructureConfig,
      securityGroups: [dbSecurityGroup]
    });

    // Redis
    const redis = new Redis(this, 'Redis', {
      environment: props.environment,
      stackName: resolvedStackName,
      contextConfig: envConfig,
      infrastructure: authentikInfrastructureConfig,
      securityGroups: [authentikSecurityGroup]
    });

    // EFS
    const efs = new Efs(this, 'EFS', {
      environment: props.environment,
      contextConfig: envConfig,
      infrastructure: authentikInfrastructureConfig,
      vpcCidrBlock: Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.VPC_CIDR_IPV4)),
      allowAccessFrom: [authentikSecurityGroup]
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
      gitSha: gitSha,
      ecrRepositoryArn: ecrRepository,
      enableExecute: enableExecute,
      useConfigFile: useAuthentikConfigFile
    };

    const applicationConfig: AuthentikApplicationConfig = {
      adminUserEmail: authentikAdminUserEmail,
      ldapBaseDn: ldapBaseDn,
      database: {
        hostname: database.hostname
      },
      redis: {
        hostname: redis.hostname
      },
      authentikHost: `https://${hostnameAuthentik}.${hostedZoneName}`
    };

    // Build network config for DNS and load balancers
    const authentikNetworkConfig: NetworkConfig = {
      hostedZoneId: hostedZoneId,
      hostedZoneName: hostedZoneName,
      sslCertificateArn: sslCertificateArn,
      hostname: hostnameAuthentik
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

    // Authentik Load Balancer
    const authentikELB = new Elb(this, 'AuthentikELB', {
      environment: props.environment,
      contextConfig: envConfig,
      infrastructure: authentikInfrastructureConfig,
      network: authentikNetworkConfig
    });

    // Authentik Server
    const authentikServer = new AuthentikServer(this, 'AuthentikServer', {
      environment: props.environment,
      contextConfig: envConfig,
      infrastructure: authentikInfrastructureConfig,
      secrets: secretsConfig,
      storage: storageConfig,
      deployment: deploymentConfig,
      application: applicationConfig
    });

    // Authentik Worker  
    // Update authentication host for worker after Route53 setup
    const authentikWorkerConfig = { ...applicationConfig };
    const authentikWorker = new AuthentikWorker(this, 'AuthentikWorker', {
      environment: props.environment,
      contextConfig: envConfig,
      infrastructure: authentikInfrastructureConfig,
      secrets: secretsConfig,
      storage: storageConfig,
      deployment: deploymentConfig,
      application: authentikWorkerConfig
    });

    // Connect Authentik Server to Load Balancer
    authentikServer.createTargetGroup(vpc, authentikELB.httpsListener);

    // =================
    // DNS SETUP (AUTHENTIK)
    // =================

    // Route53 Authentik DNS Records (needed before LDAP token retriever)
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
      infrastructure: authentikInfrastructureConfig,
      deployment: deploymentConfig,
      token: tokenConfig,
      application: ldapApplicationConfig
    });

    // LDAP
    const ldap = new Ldap(this, 'LDAP', {
      environment: props.environment,
      contextConfig: envConfig,
      infrastructure: ldapInfrastructureConfig,
      storage: storageConfig,
      deployment: deploymentConfig,
      network: ldapNetworkConfig,
      application: ldapApplicationConfig,
      ldapToken: secretsManager.ldapToken
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
    // STACK OUTPUTS
    // =================

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
      authentikAlbDns: authentikELB.loadBalancer.loadBalancerDnsName,
      authentikUrl: `https://${authentikELB.dnsName}`,
      ldapNlbDns: ldap.loadBalancer.loadBalancerDnsName,
      ldapEndpoint: `ldap://${ldap.dnsName}:389`,
      ldapsEndpoint: `ldaps://${ldap.dnsName}:636`,
      ldapTokenRetrieverLambdaArn: ldapTokenRetriever.lambdaFunction.functionArn
    });
  }

  // =================
  // HELPER METHODS
  // =================

  /**
   * Create security group for Authentik ECS tasks (Server/Worker)
   * @param vpc The VPC to create the security group in
   * @param stackNameComponent The stack name component for imports
   * @returns The created security group
   */
  private createAuthentikSecurityGroup(vpc: ec2.IVpc, stackNameComponent: string): ec2.SecurityGroup {
    const authentikSecurityGroup = new ec2.SecurityGroup(this, 'AuthentikSecurityGroup', {
      vpc,
      description: 'Security group for Authentik ECS tasks (Server/Worker)',
      allowAllOutbound: true
    });

    // Allow HTTP/HTTPS traffic to Authentik tasks
    authentikSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP traffic'
    );

    authentikSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS traffic'
    );

    // Allow Authentik application traffic (port 9000) from VPC CIDR
    authentikSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.VPC_CIDR_IPV4))),
      ec2.Port.tcp(9000),
      'Allow Authentik traffic from VPC'
    );

    return authentikSecurityGroup;
  }

  /**
   * Create security group for LDAP ECS tasks
   * @param vpc The VPC to create the security group in
   * @param stackNameComponent The stack name component for imports
   * @returns The created security group
   */
  private createLdapSecurityGroup(vpc: ec2.IVpc, stackNameComponent: string): ec2.SecurityGroup {
    const ldapSecurityGroup = new ec2.SecurityGroup(this, 'LdapSecurityGroup', {
      vpc,
      description: 'Security group for LDAP ECS tasks',
      allowAllOutbound: true
    });

    // Allow LDAP traffic (port 3389) from VPC CIDR
    ldapSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.VPC_CIDR_IPV4))),
      ec2.Port.tcp(3389),
      'Allow LDAP traffic from VPC'
    );

    // Allow LDAPS traffic (port 6636) from VPC CIDR
    ldapSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.VPC_CIDR_IPV4))),
      ec2.Port.tcp(6636),
      'Allow LDAPS traffic from VPC'
    );

    return ldapSecurityGroup;
  }

  /**
   * Create security group for ECS tasks (Legacy - keeping for backward compatibility)
   * @param vpc The VPC to create the security group in
   * @returns The created security group
   */
  private createEcsSecurityGroup(vpc: ec2.IVpc): ec2.SecurityGroup {
    const ecsSecurityGroup = new ec2.SecurityGroup(this, 'ECSSecurityGroup', {
      vpc,
      description: 'Security group for ECS tasks',
      allowAllOutbound: true
    });

    // Allow HTTP/HTTPS traffic to ECS tasks
    ecsSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP traffic'
    );

    ecsSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS traffic'
    );

    ecsSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(9000),
      'Allow Authentik traffic'
    );

    return ecsSecurityGroup;
  }

  /**
   * Create security group for database access
   * @param vpc The VPC to create the security group in
   * @param ecsSecurityGroup The ECS security group to allow access from
   * @returns The created security group
   */
  private createDbSecurityGroup(vpc: ec2.IVpc, ecsSecurityGroup: ec2.SecurityGroup): ec2.SecurityGroup {
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DBSecurityGroup', {
      vpc,
      description: 'Security group for database',
      allowAllOutbound: false
    });

    // Allow PostgreSQL access from ECS tasks
    dbSecurityGroup.addIngressRule(
      ec2.Peer.securityGroupId(ecsSecurityGroup.securityGroupId),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access from ECS tasks'
    );

    return dbSecurityGroup;
  }
}

/**
 * Converts an ECR repository ARN to a proper ECR repository URI for Docker images
 * @param ecrArn - ECR repository ARN (e.g., "arn:aws:ecr:region:account:repository/repo-name")
 * @returns ECR repository URI (e.g., "account.dkr.ecr.region.amazonaws.com/repo-name")
 */
function convertEcrArnToRepositoryUri(ecrArn: string): string {
  // Parse ARN: arn:aws:ecr:region:account:repository/repo-name
  const arnParts = ecrArn.split(':');
  if (arnParts.length !== 6 || !arnParts[5].startsWith('repository/')) {
    throw new Error(`Invalid ECR repository ARN format: ${ecrArn}`);
  }
  
  const region = arnParts[3];
  const account = arnParts[4];
  const repositoryName = arnParts[5].replace('repository/', '');
  
  return `${account}.dkr.ecr.${region}.amazonaws.com/${repositoryName}`;
}
