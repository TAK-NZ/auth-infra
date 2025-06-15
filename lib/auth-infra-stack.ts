import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Database } from './constructs/database';
import { Redis } from './constructs/redis';
import { Efs } from './constructs/efs';
import { SecretsManager } from './constructs/secrets-manager';
import { Authentik } from './constructs/authentik';
import { Ldap } from './constructs/ldap';
import { LdapTokenRetriever } from './constructs/ldap-token-retriever';
import { StackProps, Fn } from 'aws-cdk-lib';
import { registerAuthInfraOutputs } from './outputs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as kms from 'aws-cdk-lib/aws-kms';
import { createBaseImportValue } from './stack-naming';
import { getEnvironmentConfig } from './environment-config';
import { resolveStackParameters } from './parameters';

export interface AuthInfraStackProps extends StackProps {
  envType?: 'prod' | 'dev-test';
}

/**
 * Main CDK stack for the Auth Infrastructure
 */
export class AuthInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AuthInfraStackProps) {
    super(scope, id, {
      ...props,
      description: 'TAK Authentication Layer - Authentik, LDAP, Database, Cache',
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

    // ECS Cluster
    const ecsCluster = new ecs.Cluster(this, 'ECSCluster', {
      vpc,
      clusterName: `${id}-cluster`,
      enableFargateCapacityProviders: true
    });

    // Security Groups
    const ecsSecurityGroup = this.createEcsSecurityGroup(vpc);
    const dbSecurityGroup = this.createDbSecurityGroup(vpc, ecsSecurityGroup);
    const redisSecurityGroup = this.createRedisSecurityGroup(vpc, ecsSecurityGroup);

    // SecretsManager
    const secretsManager = new SecretsManager(this, 'SecretsManager', {
      environment: resolvedStackName,
      kmsKey
    });

    // Database
    const database = new Database(this, 'Database', {
      environment: resolvedStackName,
      config,
      vpc,
      kmsKey,
      securityGroups: [dbSecurityGroup]
    });

    // Redis
    const redis = new Redis(this, 'Redis', {
      environment: resolvedStackName,
      config,
      vpc,
      kmsKey,
      securityGroups: [redisSecurityGroup]
    });

    // EFS
    const efs = new Efs(this, 'EFS', {
      environment: resolvedStackName,
      vpc,
      kmsKey,
      allowAccessFrom: [ecsSecurityGroup]
    });

    // Authentik
    const authentik = new Authentik(this, 'Authentik', {
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

    // LDAP Token Retriever
    const ldapTokenRetriever = new LdapTokenRetriever(this, 'LdapTokenRetriever', {
      environment: resolvedStackName,
      config,
      kmsKey,
      authentikHost: `https://${authentik.dnsName}`,
      outpostName: 'LDAP',
      adminTokenSecret: secretsManager.adminUserToken,
      ldapTokenSecret: secretsManager.ldapToken,
      gitSha: params.gitSha
    });

    // LDAP
    const ldap = new Ldap(this, 'LDAP', {
      environment: resolvedStackName,
      config,
      vpc,
      ecsSecurityGroup,
      ecsCluster,
      sslCertificateArn: params.sslCertificateArn || '',
      authentikHost: authentik.dnsName,
      dockerImageLocation: params.dockerImageLocation || 'Github',
      enableExecute: params.enableExecute,
      ldapToken: secretsManager.ldapToken
    });

    // Ensure LDAP waits for the token to be retrieved
    ldap.node.addDependency(ldapTokenRetriever);

    // Outputs
    registerAuthInfraOutputs({
      stack: this,
      stackName: resolvedStackName,
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
      authentikAlbDns: authentik.loadBalancer.loadBalancerDnsName,
      authentikUrl: `https://${authentik.dnsName}`,
      ldapAlbDns: ldap.loadBalancer.loadBalancerDnsName,
      ldapEndpoint: `${ldap.loadBalancer.loadBalancerDnsName}:389`,
      ldapsEndpoint: `${ldap.loadBalancer.loadBalancerDnsName}:636`,
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
}
