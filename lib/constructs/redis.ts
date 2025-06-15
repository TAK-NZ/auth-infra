/**
 * Redis Construct - CDK implementation of the Redis/Valkey cache
 */
import { Construct } from 'constructs';
import {
  aws_elasticache as elasticache,
  aws_ec2 as ec2,
  aws_secretsmanager as secretsmanager,
  aws_kms as kms,
  CfnOutput
} from 'aws-cdk-lib';

import type { BaseConfig } from '../environment-config';

/**
 * Properties for the Redis construct
 */
export interface RedisProps {
  /**
   * Environment name (e.g. 'prod', 'dev', etc.)
   */
  environment: string;

  /**
   * Environment configuration
   */
  config: BaseConfig;

  /**
   * VPC for deployment
   */
  vpc: ec2.IVpc;

  /**
   * KMS key for encryption
   */
  kmsKey: kms.IKey;

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

    // Create the auth token secret
    this.authToken = new secretsmanager.Secret(this, 'RedisAuthToken', {
      description: `${id} Redis Auth Token`,
      secretName: `${id}/redis/auth-token`,
      encryptionKey: props.kmsKey,
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 64
      }
    });

    // Create subnet group
    const subnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: `${id}-redis-subnets`,
      subnetIds: props.vpc.privateSubnets.map(subnet => subnet.subnetId)
    });

    // Create security group
    const securityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
      vpc: props.vpc,
      description: `${id} Redis Security Group`,
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
      automaticFailoverEnabled: props.config.isProd,
      atRestEncryptionEnabled: true,
      transitEncryptionEnabled: true,
      transitEncryptionMode: 'required',
      authToken: this.authToken.secretValue.unsafeUnwrap(),
      kmsKeyId: props.kmsKey.keyArn,
      cacheNodeType: props.config.redisCacheNodeType,
      cacheSubnetGroupName: subnetGroup.ref,
      engine: 'valkey',
      engineVersion: '7.2',
      autoMinorVersionUpgrade: true,
      numCacheClusters: props.config.redisNumCacheClusters,
      securityGroupIds: [securityGroup.securityGroupId]
    });

    // Set dependencies
    this.replicationGroup.addDependency(subnetGroup);

    // Store the hostname
    this.hostname = this.replicationGroup.attrPrimaryEndPointAddress;

    // Create outputs
    new CfnOutput(this, 'RedisEndpoint', {
      value: this.hostname,
      description: 'Redis cluster endpoint'
    });

    new CfnOutput(this, 'RedisAuthTokenArn', {
      value: this.authToken.secretArn,
      description: 'Redis auth token secret ARN'
    });
  }
}
