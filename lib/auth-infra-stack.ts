import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
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
import { EcrImageValidator } from './constructs/ecr-image-validator';
import { StackProps, Fn } from 'aws-cdk-lib';
import { registerOutputs } from './outputs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { createBaseImportValue, BASE_EXPORT_NAMES } from './cloudformation-imports';
import { getEnvironmentConfig, mergeEnvironmentConfig } from './environment-config';
import { AuthInfraConfig } from './stack-config';

export interface AuthInfraStackProps extends StackProps {
  stackConfig: AuthInfraConfig;
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

    const config = props.stackConfig;
    
    // Extract configuration values
    const envType = config.envType;
    const stackNameComponent = config.stackName; // This is the STACK_NAME part (e.g., "MyFirstStack")
    const resolvedStackName = id;
    
    // Get environment-specific defaults (following reference template pattern)
    const envConfig = config.envType === 'prod' ? 
      { enableHighAvailability: true, enableDetailedMonitoring: true } :
      { enableHighAvailability: false, enableDetailedMonitoring: false };
    
    const enableHighAvailability = envConfig.enableHighAvailability;
    
    // Get base configuration and merge with overrides
    const baseConfig = getEnvironmentConfig(envType);
    const mergedConfig = config.overrides ? 
      mergeEnvironmentConfig(baseConfig, config.overrides) : 
      baseConfig;
    
    // Set container counts based on high availability setting
    // enableHighAvailability=true: 2 containers (Server, Worker, LDAP)
    // enableHighAvailability=false: 1 container each
    const desiredContainerCount = enableHighAvailability ? 2 : 1;
    
    // Override container counts in merged config unless explicitly set via context
    if (!config.overrides?.ecs?.desiredCount) {
      mergedConfig.ecs.desiredCount = desiredContainerCount;
    }
    if (!config.overrides?.ecs?.workerDesiredCount) {
      mergedConfig.ecs.workerDesiredCount = desiredContainerCount;
    }

    // Add Environment Type tag to the stack
    const environmentLabel = envType === 'prod' ? 'Prod' : 'Dev-Test';
    cdk.Tags.of(this).add('Environment Type', environmentLabel);

    const awsStackName = Fn.ref('AWS::StackName');
    const awsRegion = cdk.Stack.of(this).region;

    // Context-based parameter resolution (CDK context only)
    const gitSha = this.node.tryGetContext('gitSha') || this.getGitSha();
    const enableExecute = Boolean(this.node.tryGetContext('enableExecute') || false);
    const authentikAdminUserEmail = this.node.tryGetContext('authentikAdminUserEmail') || '';
    const authentikLdapBaseDn = this.node.tryGetContext('authentikLdapBaseDn') || 'DC=example,DC=com';
    const sslCertificateArn = this.node.tryGetContext('sslCertificateArn') || '';
    const useAuthentikConfigFile = Boolean(this.node.tryGetContext('useAuthentikConfigFile') || false);
    const useEnvironmentFile = Boolean(this.node.tryGetContext('useEnvironmentFile') || false);
    const hostnameAuthentik = this.node.tryGetContext('hostnameAuthentik') || 'account';
    const hostnameLdap = this.node.tryGetContext('hostnameLdap') || 'ldap';

    // Validate required parameters
    if (!authentikAdminUserEmail || authentikAdminUserEmail.trim() === '') {
      throw new Error('authentikAdminUserEmail is required. Set it via --context authentikAdminUserEmail=user@example.com');
    }

    const stackName = Fn.ref('AWS::StackName');
    const region = cdk.Stack.of(this).region;

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

    // Import KMS key from base infrastructure
    const kmsKey = kms.Key.fromKeyArn(this, 'KMSKey', 
      Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.KMS_KEY))
    );

    // Import ECS Cluster from base infrastructure
    const ecsClusterArn = Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.ECS_CLUSTER));
    const ecsCluster = ecs.Cluster.fromClusterAttributes(this, 'ECSCluster', {
      clusterArn: ecsClusterArn,
      clusterName: `TAK-${stackNameComponent}-EcsCluster`, // Standard cluster name from base infra
      vpc: vpc,
      securityGroups: []
    });

    // Import S3 configuration bucket from base infrastructure
    const s3ConfBucket = s3.Bucket.fromBucketArn(this, 'S3ConfBucket',
      Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.S3_BUCKET))
    );

    // Import ECR repository from base infrastructure (for local ECR option)
    const ecrRepository = Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.ECR_REPO));

    // Validate required ECR images exist before deployment
    const requiredImageTags = [
      `auth-infra-server-${gitSha}`,
      `auth-infra-ldap-${gitSha}`
    ];
    
    const ecrValidator = new EcrImageValidator(this, 'EcrImageValidator', {
      ecrRepositoryArn: ecrRepository,
      requiredImageTags: requiredImageTags,
      environment: stackNameComponent
    });

    // Import Route53 hosted zone from base infrastructure
    const hostedZoneId = Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.HOSTED_ZONE_ID));
    const hostedZoneName = Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.HOSTED_ZONE_NAME));

    // S3 Environment File paths - assumes authentik-config.env already exists in S3
    const envFileS3Key = `${stackNameComponent}/authentik-config.env`;
    const envFileS3Uri = `arn:aws:s3:::${s3ConfBucket.bucketName}/${envFileS3Key}`;

    // Security Groups
    const ecsSecurityGroup = this.createEcsSecurityGroup(vpc);
    const dbSecurityGroup = this.createDbSecurityGroup(vpc, ecsSecurityGroup);
    const redisSecurityGroup = this.createRedisSecurityGroup(vpc, ecsSecurityGroup);

    // SecretsManager
    // SecretsManager
    const secretsManager = new SecretsManager(this, 'SecretsManager', {
      environment: stackNameComponent,
      stackName: resolvedStackName,
      kmsKey
    });

    // Database
    const database = new Database(this, 'Database', {
      environment: stackNameComponent,
      stackName: resolvedStackName,
      config: mergedConfig,
      vpc,
      kmsKey,
      securityGroups: [dbSecurityGroup]
    });

    // Redis
    // Redis
    const redis = new Redis(this, 'Redis', {
      environment: stackNameComponent,
      stackName: resolvedStackName,
      config: mergedConfig,
      vpc,
      kmsKey,
      securityGroups: [redisSecurityGroup]
    });

    // EFS
    const efs = new Efs(this, 'EFS', {
      environment: stackNameComponent,
      vpc,
      vpcCidrBlock: Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.VPC_CIDR_IPV4)),
      kmsKey,
      allowAccessFrom: [ecsSecurityGroup]
    });

    // Authentik Load Balancer
    const authentikELB = new Elb(this, 'AuthentikELB', {
      environment: stackNameComponent,
      config: mergedConfig,
      vpc,
      sslCertificateArn: sslCertificateArn
    });

    // Authentik Server
    const authentikServer = new AuthentikServer(this, 'AuthentikServer', {
      environment: stackNameComponent,
      config: mergedConfig,
      vpc,
      ecsSecurityGroup,
      ecsCluster,
      s3ConfBucket,
      envFileS3Uri: envFileS3Uri,
      envFileS3Key: envFileS3Key,
      adminUserEmail: authentikAdminUserEmail,
      ldapBaseDn: authentikLdapBaseDn,
      useConfigFile: useAuthentikConfigFile,
      useEnvironmentFile: useEnvironmentFile,
      ecrRepositoryArn: ecrRepository,
      gitSha: gitSha,
      enableExecute: enableExecute,
      dbSecret: database.masterSecret,
      dbHostname: database.hostname,
      redisAuthToken: redis.authToken,
      redisHostname: redis.hostname,
      secretKey: secretsManager.secretKey,
      adminUserPassword: secretsManager.adminUserPassword,
      adminUserToken: secretsManager.adminUserToken,
      ldapToken: secretsManager.ldapToken,
      efsId: efs.fileSystem.fileSystemId,
      efsMediaAccessPointId: efs.mediaAccessPoint.accessPointId,
      efsCustomTemplatesAccessPointId: efs.customTemplatesAccessPoint.accessPointId
    });

    // Ensure Authentik Server waits for ECR image validation
    authentikServer.node.addDependency(ecrValidator);

    // Authentik Worker
    const authentikWorker = new AuthentikWorker(this, 'AuthentikWorker', {
      environment: stackNameComponent,
      config: mergedConfig,
      vpc,
      ecsSecurityGroup,
      ecsCluster,
      s3ConfBucket,
      envFileS3Key: envFileS3Key,
      useEnvironmentFile: useEnvironmentFile,
      ecrRepositoryArn: ecrRepository,
      gitSha: gitSha,
      enableExecute: enableExecute,
      dbSecret: database.masterSecret,
      dbHostname: database.hostname,
      redisAuthToken: redis.authToken,
      redisHostname: redis.hostname,
      secretKey: secretsManager.secretKey,
      efsId: efs.fileSystem.fileSystemId,
      efsMediaAccessPointId: efs.mediaAccessPoint.accessPointId,
      efsCustomTemplatesAccessPointId: efs.customTemplatesAccessPoint.accessPointId
    });

    // Ensure Authentik Worker waits for ECR image validation
    authentikWorker.node.addDependency(ecrValidator);

    // Connect Authentik Server to Load Balancer
    authentikServer.createTargetGroup(vpc, authentikELB.httpsListener);

    // LDAP Token Retriever
    const ldapTokenRetriever = new LdapTokenRetriever(this, 'LdapTokenRetriever', {
      environment: stackNameComponent,
      config: mergedConfig,
      kmsKey,
      authentikHost: `https://${authentikELB.dnsName}`,
      outpostName: 'LDAP',
      adminTokenSecret: secretsManager.adminUserToken,
      ldapTokenSecret: secretsManager.ldapToken,
      gitSha: gitSha,
      authentikServerService: authentikServer.ecsService,
      authentikWorkerService: authentikWorker.ecsService
    });

    // LDAP
    const ldap = new Ldap(this, 'LDAP', {
      environment: stackNameComponent,
      config: mergedConfig,
      vpc,
      ecsSecurityGroup,
      ecsCluster,
      s3ConfBucket,
      sslCertificateArn: sslCertificateArn,
      authentikHost: authentikELB.dnsName,
      ecrRepositoryArn: ecrRepository,
      gitSha: gitSha,
      enableExecute: enableExecute,
      ldapToken: secretsManager.ldapToken
    });

    // Ensure LDAP waits for ECR image validation
    ldap.node.addDependency(ecrValidator);
    // Ensure LDAP waits for the token to be retrieved
    ldap.node.addDependency(ldapTokenRetriever);

    // Route53 DNS Records
    const route53 = new Route53(this, 'Route53', {
      environment: stackNameComponent,
      config: mergedConfig,
      hostedZoneId: hostedZoneId,
      hostedZoneName: hostedZoneName,
      hostnameAuthentik: hostnameAuthentik,
      hostnameLdap: hostnameLdap,
      authentikLoadBalancer: authentikELB.loadBalancer,
      ldapLoadBalancer: ldap.loadBalancer
    });

    // Outputs
    registerOutputs({
      stack: this,
      stackName: stackNameComponent,
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
      ldapTokenRetrieverLambdaArn: ldapTokenRetriever.lambdaFunction.functionArn
    });
  }

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

  private createRedisSecurityGroup(vpc: ec2.IVpc, ecsSecurityGroup: ec2.SecurityGroup): ec2.SecurityGroup {
    const redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
      vpc,
      description: 'Security group for Redis',
      allowAllOutbound: false
    });

    // Allow Redis access from ECS tasks
    redisSecurityGroup.addIngressRule(
      ec2.Peer.securityGroupId(ecsSecurityGroup.securityGroupId),
      ec2.Port.tcp(6379),
      'Allow Redis access from ECS tasks'
    );

    return redisSecurityGroup;
  }

  /**
   * Get the current git SHA for tagging resources
   * @returns Current git SHA
   */
  private getGitSha(): string {
    try {
      // Get the current git SHA
      const { execSync } = require('child_process');
      return execSync('git rev-parse --short HEAD').toString().trim();
    } catch (error) {
      console.warn('Unable to get git SHA, using "development"');
      return 'development';
    }
  }
}
