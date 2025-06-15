/**
 * Main Auth Infrastructure Stack - CDK implementation
 */
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import {
  Stack,
  StackProps,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_kms as kms,
  CfnOutput,
  Fn
} from 'aws-cdk-lib';
import { createBaseImportValue } from './stack-naming';
import { getEnvironmentConfig } from './environment-config';
import { resolveStackParameters } from './parameters';
import { registerAuthInfraOutputs } from './outputs';
import { Database } from './constructs/database';
import { Redis } from './constructs/redis';
import { Efs } from './constructs/efs';
import { SecretsManager } from './constructs/secrets-manager';
import { Authentik } from './constructs/authentik';
import { Ldap } from './constructs/ldap';
import { LdapTokenRetriever } from './constructs/ldap-token-retriever';

/**
 * Properties for the Auth Infrastructure Stack
 */
export interface AuthInfraStackProps extends StackProps {
  /**
   * Environment type
   */
  envType?: 'prod' | 'dev-test';
}

/**
 * Main CDK stack for the Auth Infrastructure
 */
export class AuthInfraStack extends Stack {
  /**
   * The database construct
   */
  public readonly database: Database;

  /**
   * The Redis construct
   */
  public readonly redis: Redis;

  /**
   * The EFS construct
   */
  public readonly efs: Efs;

  /**
   * The secrets manager construct
   */
  public readonly secretsManager: SecretsManager;

  /**
   * The Authentik construct
   */
  public readonly authentik: Authentik;

  /**
   * The LDAP construct
   */
  public readonly ldap: Ldap;

  /**
   * The LDAP token retriever construct
   */
  public readonly ldapTokenRetriever: LdapTokenRetriever;

  constructor(scope: Construct, id: string, props: AuthInfraStackProps) {
    super(scope, id, {
      ...props,
      description: props.description || 'TAK Authentication Layer - Authentik',
    });

    // Resolve parameters from context, env vars, or defaults
    const params = resolveStackParameters(this);
    
    const envType = (props.envType || params.envType) as 'prod' | 'dev-test';
    const resolvedStackName = id;

    // Get environment configuration
    const config = getEnvironmentConfig(envType);

    // Add Environment Type tag to the stack
    const environmentLabel = envType === 'prod' ? 'Prod' : 'Dev-Test';
    cdk.Tags.of(this).add('Environment Type', environmentLabel);

    const stackName = Fn.ref('AWS::StackName');
    const region = cdk.Stack.of(this).region;

    // Import VPC and networking from base infrastructure
    const vpc = ec2.Vpc.fromLookup(this, 'VPC', {
      vpcId: createBaseImportValue(resolvedStackName, 'vpc-id')
    });

    // Import KMS key from base infrastructure
    const kmsKey = kms.Key.fromKeyArn(this, 'KMSKey', 
      createBaseImportValue(resolvedStackName, 'kms')
    );

    // Create ECS cluster
    const ecsCluster = new ecs.Cluster(this, 'ECSCluster', {
      vpc,
      clusterName: `${id}-cluster`,
      enableFargateCapacityProviders: true
    });

    // Create security group for ECS tasks
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

    // Create security group for database
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

    // Create security group for Redis
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

    // Create SecretsManager construct
    this.secretsManager = new SecretsManager(this, 'SecretsManager', {
      environment: resolvedStackName,
      kmsKey
    });

    // Create Database construct
    this.database = new Database(this, 'Database', {
      environment: resolvedStackName,
      config,
      vpc,
      kmsKey,
      securityGroups: [dbSecurityGroup]
    });

    // Create Redis construct
    this.redis = new Redis(this, 'Redis', {
      environment: resolvedStackName,
      config,
      vpc,
      kmsKey,
      securityGroups: [redisSecurityGroup]
    });

    // Create EFS construct
    this.efs = new Efs(this, 'EFS', {
      environment: resolvedStackName,
      vpc,
      kmsKey,
      allowAccessFrom: [ecsSecurityGroup]
    });

    // Create Authentik construct
    this.authentik = new Authentik(this, 'Authentik', {
      environment: resolvedStackName,
      config,
      vpc,
      ecsSecurityGroup,
      ecsCluster,
      sslCertificateArn: params.sslCertificateArn || '',
      adminUserEmail: params.authentikAdminUserEmail,
      ldapBaseDn: params.authentikLdapBaseDn,
      useConfigFile: params.useAuthentikConfigFile || false,
      ipAddressType: params.ipAddressType,
      dockerImageLocation: params.dockerImageLocation || 'Github',
      enableExecute: params.enableExecute,
      dbSecret: this.database.masterSecret,
      dbHostname: this.database.hostname,
      redisAuthToken: this.redis.authToken,
      redisHostname: this.redis.hostname,
      secretKey: this.secretsManager.secretKey,
      adminUserPassword: this.secretsManager.adminUserPassword,
      adminUserToken: this.secretsManager.adminUserToken,
      ldapToken: this.secretsManager.ldapToken,
      efsId: this.efs.fileSystem.fileSystemId,
      efsMediaAccessPointId: this.efs.mediaAccessPoint.accessPointId,
      efsCustomTemplatesAccessPointId: this.efs.customTemplatesAccessPoint.accessPointId
    });

    // Create LDAP token retriever to get the token from Authentik
    this.ldapTokenRetriever = new LdapTokenRetriever(this, 'LdapTokenRetriever', {
      environment: resolvedStackName,
      config,
      kmsKey,
      authentikHost: `https://${this.authentik.dnsName}`,
      outpostName: 'LDAP',
      adminTokenSecret: this.secretsManager.adminUserToken,
      ldapTokenSecret: this.secretsManager.ldapToken,
      gitSha: params.gitSha
    });

    // Create LDAP outpost construct
    this.ldap = new Ldap(this, 'LDAP', {
      environment: resolvedStackName,
      config,
      vpc,
      ecsSecurityGroup,
      ecsCluster,
      sslCertificateArn: params.sslCertificateArn || '',
      authentikHost: this.authentik.dnsName,
      dockerImageLocation: params.dockerImageLocation || 'Github',
      enableExecute: params.enableExecute,
      ldapToken: this.secretsManager.ldapToken
    });

    // Ensure LDAP waits for the token to be retrieved
    this.ldap.node.addDependency(this.ldapTokenRetriever);

    // Register outputs using the centralized outputs system
    registerAuthInfraOutputs({
      stack: this,
      stackName: resolvedStackName,
      databaseEndpoint: this.database.hostname,
      databaseSecretArn: this.database.masterSecret.secretArn,
      redisEndpoint: this.redis.hostname,
      redisAuthTokenArn: this.redis.authToken.secretArn,
      efsId: this.efs.fileSystem.fileSystemId,
      efsMediaAccessPointId: this.efs.mediaAccessPoint.accessPointId,
      efsTemplatesAccessPointId: this.efs.customTemplatesAccessPoint.accessPointId,
      authentikSecretKeyArn: this.secretsManager.secretKey.secretArn,
      authentikAdminTokenArn: this.secretsManager.adminUserToken.secretArn,
      authentikLdapTokenArn: this.secretsManager.ldapToken.secretArn,
      authentikAlbDns: this.authentik.loadBalancer.loadBalancerDnsName,
      authentikUrl: `https://${this.authentik.dnsName}`,
      ldapAlbDns: this.ldap.loadBalancer.loadBalancerDnsName,
      ldapEndpoint: `${this.ldap.loadBalancer.loadBalancerDnsName}:389`,
      ldapsEndpoint: `${this.ldap.loadBalancer.loadBalancerDnsName}:636`,
      ldapTokenRetrieverLambdaArn: this.ldapTokenRetriever.lambdaFunction.functionArn
    });
  }
}
