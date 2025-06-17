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
import { EcrImageValidator } from './constructs/ecr-image-validator';

// Utility imports
import { registerOutputs } from './outputs';
import { createBaseImportValue, BASE_EXPORT_NAMES } from './cloudformation-imports';
import { AuthInfraConfigResult } from './stack-config';

export interface AuthInfraStackProps extends StackProps {
  configResult: AuthInfraConfigResult;
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

    const { 
      stackConfig, 
      environmentConfig, 
      computedValues 
    } = props.configResult;
    
    // Extract configuration values
    const envType = stackConfig.envType;
    const stackNameComponent = stackConfig.stackName; // This is the STACK_NAME part (e.g., "MyFirstStack")
    const resolvedStackName = id;
    
    // Use computed values from configuration
    const enableHighAvailability = computedValues.enableHighAvailability;
    const enableDetailedMonitoring = computedValues.enableDetailedMonitoring;

    // Add Environment Type tag to the stack
    cdk.Tags.of(this).add('Environment Type', computedValues.environmentLabel);

    const stackName = Fn.ref('AWS::StackName');
    const region = cdk.Stack.of(this).region;

    // Context-based parameter resolution
    const gitSha = this.node.tryGetContext('calculatedGitSha') || 'development';
    const enableExecute = Boolean(this.node.tryGetContext('enableExecute') || false);
    const authentikAdminUserEmail = this.node.tryGetContext('validatedAuthentikAdminUserEmail') || '';
    const useAuthentikConfigFile = Boolean(this.node.tryGetContext('useAuthentikConfigFile') || false);
    const ldapBaseDn = this.node.tryGetContext('ldapBaseDn') || 'dc=example,dc=com';
    const hostnameAuthentik = this.node.tryGetContext('hostnameAuthentik') || 'account';
    const hostnameLdap = this.node.tryGetContext('hostnameLdap') || 'ldap';

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

    // Add DNS domain name tag
    cdk.Tags.of(this).add('DNS Zone', hostedZoneName);

    // S3 Environment File paths - assumes authentik-config.env already exists in S3
    const envFileS3Key = `${stackNameComponent}/authentik-config.env`;
    const envFileS3Uri = `arn:aws:s3:::${s3ConfBucket.bucketName}/${envFileS3Key}`;

    // =================
    // SECURITY GROUPS
    // =================

    // Security Groups
    const ecsSecurityGroup = this.createEcsSecurityGroup(vpc);
    const dbSecurityGroup = this.createDbSecurityGroup(vpc, ecsSecurityGroup);

    // =================
    // CORE INFRASTRUCTURE
    // =================

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
      config: environmentConfig,
      vpc,
      kmsKey,
      securityGroups: [dbSecurityGroup]
    });

    // Redis
    const redis = new Redis(this, 'Redis', {
      environment: stackNameComponent,
      stackName: resolvedStackName,
      config: environmentConfig,
      vpc,
      kmsKey,
      securityGroups: [ecsSecurityGroup]
    });

    // EFS
    const efs = new Efs(this, 'EFS', {
      environment: stackNameComponent,
      config: environmentConfig,
      vpc,
      vpcCidrBlock: Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.VPC_CIDR_IPV4)),
      kmsKey,
      allowAccessFrom: [ecsSecurityGroup]
    });

    // =================
    // IMAGE VALIDATION
    // =================

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

    // =================
    // APPLICATION SERVICES
    // =================

    // Authentik Load Balancer
    const authentikELB = new Elb(this, 'AuthentikELB', {
      environment: stackNameComponent,
      config: environmentConfig,
      vpc,
      sslCertificateArn: sslCertificateArn
    });

    // Authentik Server
    const authentikServer = new AuthentikServer(this, 'AuthentikServer', {
      environment: stackNameComponent,
      config: environmentConfig,
      vpc,
      ecsSecurityGroup,
      ecsCluster,
      s3ConfBucket,
      envFileS3Uri: envFileS3Uri,
      envFileS3Key: envFileS3Key,
      adminUserEmail: authentikAdminUserEmail,
      ldapBaseDn: ldapBaseDn,
      useAuthentikConfigFile: useAuthentikConfigFile,
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
      kmsKey,
      efsId: efs.fileSystem.fileSystemId,
      efsMediaAccessPointId: efs.mediaAccessPoint.accessPointId,
      efsCustomTemplatesAccessPointId: efs.customTemplatesAccessPoint.accessPointId
    });

    // Ensure Authentik Server waits for ECR image validation
    authentikServer.node.addDependency(ecrValidator);

    // Authentik Worker
    const authentikWorker = new AuthentikWorker(this, 'AuthentikWorker', {
      environment: stackNameComponent,
      config: environmentConfig,
      vpc,
      ecsSecurityGroup,
      ecsCluster,
      s3ConfBucket,
      envFileS3Key: envFileS3Key,
      useAuthentikConfigFile: useAuthentikConfigFile,
      adminUserEmail: authentikAdminUserEmail,
      ldapBaseDn: ldapBaseDn,
      ldapServiceUser: secretsManager.ldapServiceUser,
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
      kmsKey,
      efsId: efs.fileSystem.fileSystemId,
      efsMediaAccessPointId: efs.mediaAccessPoint.accessPointId,
      efsCustomTemplatesAccessPointId: efs.customTemplatesAccessPoint.accessPointId,
      authentikHost: `https://${hostnameAuthentik}.${hostedZoneName}`
    });

    // Ensure Authentik Worker waits for ECR image validation
    authentikWorker.node.addDependency(ecrValidator);

    // Connect Authentik Server to Load Balancer
    authentikServer.createTargetGroup(vpc, authentikELB.httpsListener);

    // =================
    // DNS SETUP (AUTHENTIK)
    // =================

    // Route53 Authentik DNS Records (needed before LDAP token retriever)
    const route53Authentik = new Route53Authentik(this, 'Route53Authentik', {
      environment: stackNameComponent,
      config: environmentConfig,
      hostedZoneId: hostedZoneId,
      hostedZoneName: hostedZoneName,
      hostnameAuthentik: hostnameAuthentik,
      authentikLoadBalancer: authentikELB.loadBalancer
    });

    // =================
    // LDAP CONFIGURATION
    // =================

    // LDAP Token Retriever
    const ldapTokenRetriever = new LdapTokenRetriever(this, 'LdapTokenRetriever', {
      environment: stackNameComponent,
      config: environmentConfig,
      kmsKey,
      // Use proper FQDN that matches TLS certificate, not ELB DNS name
      authentikHost: route53Authentik.getAuthentikUrl(),
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
      config: environmentConfig,
      vpc,
      ecsSecurityGroup,
      ecsCluster,
      s3ConfBucket,
      sslCertificateArn: sslCertificateArn,
      authentikHost: route53Authentik.authentikFqdn,
      ecrRepositoryArn: ecrRepository,
      gitSha: gitSha,
      enableExecute: enableExecute,
      kmsKey,
      ldapToken: secretsManager.ldapToken
    });

    // Ensure LDAP waits for ECR image validation
    ldap.node.addDependency(ecrValidator);
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
      environment: stackNameComponent,
      config: environmentConfig,
      hostedZoneId: hostedZoneId,
      hostedZoneName: hostedZoneName,
      hostnameLdap: hostnameLdap,
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

  // =================
  // HELPER METHODS
  // =================

  /**
   * Create security group for ECS tasks
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
