/**
 * Main Auth Infrastructure Stack - CDK implementation
 */
import { Construct } from 'constructs';
import {
  Stack,
  StackProps,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_kms as kms,
  CfnOutput
} from 'aws-cdk-lib';
import { importBaseInfraValue } from './stack-naming';
import { getEnvironmentConfig } from './environment-config';
import { AuthInfraParameters } from './parameters';
import { Database } from './constructs/database';
import { Redis } from './constructs/redis';
import { Efs } from './constructs/efs';
import { SecretsManager } from './constructs/secrets-manager';
import { Authentik } from './constructs/authentik';

/**
 * Properties for the Auth Infrastructure Stack
 */
export interface AuthInfraStackProps extends StackProps {
  /**
   * Stack name/environment
   */
  stackName: string;

  /**
   * Environment type
   */
  envType: 'prod' | 'dev-test';

  /**
   * Optional parameters override
   */
  parameters?: Partial<AuthInfraParameters>;
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

  constructor(scope: Construct, id: string, props: AuthInfraStackProps) {
    super(scope, id, props);

    // Get environment configuration
    const config = getEnvironmentConfig(props.envType);

    // Import VPC and networking from base infrastructure
    const vpc = ec2.Vpc.fromLookup(this, 'VPC', {
      vpcId: importBaseInfraValue(props.stackName, 'vpc-id')
    });

    // Import KMS key from base infrastructure
    const kmsKey = kms.Key.fromKeyArn(this, 'KMSKey', 
      importBaseInfraValue(props.stackName, 'kms')
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
      environment: props.stackName,
      kmsKey
    });

    // Create Database construct
    this.database = new Database(this, 'Database', {
      environment: props.stackName,
      config,
      vpc,
      kmsKey,
      securityGroups: [dbSecurityGroup]
    });

    // Create Redis construct
    this.redis = new Redis(this, 'Redis', {
      environment: props.stackName,
      config,
      vpc,
      kmsKey,
      securityGroups: [redisSecurityGroup]
    });

    // Create EFS construct
    this.efs = new Efs(this, 'EFS', {
      environment: props.stackName,
      vpc,
      kmsKey,
      allowAccessFrom: [ecsSecurityGroup]
    });

    // Create default parameters (these would normally come from the app)
    const defaultParams: AuthInfraParameters = {
      gitSha: 'development',
      environment: props.stackName,
      envType: props.envType,
      enableExecute: false,
      sslCertificateArn: '',
      authentikAdminUserEmail: '',
      authentikLdapBaseDn: 'DC=example,DC=com',
      useAuthentikConfigFile: false,
      ipAddressType: 'dualstack',
      dockerImageLocation: 'Github'
    };

    // Merge with provided parameters
    const parameters = { ...defaultParams, ...(props.parameters || {}) };

    // Create Authentik construct
    this.authentik = new Authentik(this, 'Authentik', {
      environment: props.stackName,
      config,
      vpc,
      ecsSecurityGroup,
      ecsCluster,
      sslCertificateArn: parameters.sslCertificateArn,
      adminUserEmail: parameters.authentikAdminUserEmail,
      ldapBaseDn: parameters.authentikLdapBaseDn,
      useConfigFile: parameters.useAuthentikConfigFile,
      ipAddressType: parameters.ipAddressType,
      dockerImageLocation: parameters.dockerImageLocation,
      enableExecute: parameters.enableExecute,
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

    // Create stack outputs
    new CfnOutput(this, 'StackName', {
      value: this.stackName,
      description: 'Name of the deployed stack'
    });

    new CfnOutput(this, 'Environment', {
      value: props.stackName,
      description: 'Environment name'
    });

    new CfnOutput(this, 'EnvType', {
      value: props.envType,
      description: 'Environment type'
    });
  }
}
