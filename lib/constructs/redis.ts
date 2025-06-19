/**
 * Redis Construct - CDK implementation of the Redis/Valkey cache
 */
import { Construct } from 'constructs';
import {
  aws_elasticache as elasticache,
  aws_ec2 as ec2,
  aws_secretsmanager as secretsmanager,
  aws_kms as kms
} from 'aws-cdk-lib';

import type { ContextEnvironmentConfig } from '../stack-config';
import type { InfrastructureConfig } from '../construct-configs';

/**
 * Properties for the Redis construct
 */
export interface RedisProps {
  /**
   * Environment type ('prod' | 'dev-test')
   */
  environment: 'prod' | 'dev-test';

  /**
   * Full stack name (e.g., 'TAK-Demo-AuthInfra')
   */
  stackName: string;

  /**
   * Context-based environment configuration (direct from cdk.json)
   */
  contextConfig: ContextEnvironmentConfig;

  /**
   * Infrastructure configuration (VPC, KMS, security groups)
   */
  infrastructure: InfrastructureConfig;

  /**
   * Security groups for Redis access
   */
  securityGroups: ec2.SecurityGroup[];
}

/**
 * CDK construct for the Redis/Valkey cache cluster
 */
export class Redis extends Construct {
  /**
   * The auth token secret for Redis
   */
  public readonly authToken: secretsmanager.Secret;

  /**
   * The Redis replication group
   */
  public readonly replicationGroup: elasticache.CfnReplicationGroup;

  /**
   * The Redis hostname
   */
  public readonly hostname: string;

  constructor(scope: Construct, id: string, props: RedisProps) {
    super(scope, id);

    // Derive environment-specific values from context (matches reference pattern)
    const isHighAvailability = props.environment === 'prod';
    const automaticFailoverEnabled = props.contextConfig.redis.numCacheNodes > 1;

    // Create the auth token secret
    this.authToken = new secretsmanager.Secret(this, 'RedisAuthToken', {
      description: `${id}: Auth Token`,
      secretName: `${props.stackName}/Redis/Auth-Token`,
      encryptionKey: props.infrastructure.kmsKey,
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 64
      }
    });

    // Create subnet group
    const subnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: `${id}-redis-subnets`,
      subnetIds: props.infrastructure.vpc.privateSubnets.map(subnet => subnet.subnetId)
    });

    // Create security group
    const securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc: props.infrastructure.vpc,
      description: `${id} Security Group`,
      allowAllOutbound: false
    });

    // Allow Redis port from other security groups
    props.securityGroups.forEach(sg => {
      securityGroup.addIngressRule(
        ec2.Peer.securityGroupId(sg.securityGroupId),
        ec2.Port.tcp(6379),
        'Allow Redis access from ECS tasks'
      );
    });

    // Create the Redis replication group
    this.replicationGroup = new elasticache.CfnReplicationGroup(this, 'Redis', {
      replicationGroupDescription: 'Valkey (Redis) cluster for Authentik',
      automaticFailoverEnabled: automaticFailoverEnabled,
      atRestEncryptionEnabled: true,
      transitEncryptionEnabled: true,
      transitEncryptionMode: 'required',
      authToken: this.authToken.secretValue.unsafeUnwrap(),
      kmsKeyId: props.infrastructure.kmsKey.keyArn,
      cacheNodeType: props.contextConfig.redis.nodeType,
      cacheSubnetGroupName: subnetGroup.ref,
      engine: 'valkey',
      engineVersion: '7.2',
      autoMinorVersionUpgrade: true,
      numCacheClusters: props.contextConfig.redis.numCacheNodes,
      securityGroupIds: [securityGroup.securityGroupId]
    });

    // Set dependencies
    this.replicationGroup.addDependency(subnetGroup);

    // Store the hostname
    this.hostname = this.replicationGroup.attrPrimaryEndPointAddress;
  }
}
