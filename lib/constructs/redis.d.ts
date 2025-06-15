/**
 * Redis Construct - CDK implementation of the Redis/Valkey cache
 */
import { Construct } from 'constructs';
import { aws_elasticache as elasticache, aws_ec2 as ec2, aws_secretsmanager as secretsmanager, aws_kms as kms } from 'aws-cdk-lib';
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
export declare class Redis extends Construct {
    /**
     * The auth token secret for Redis
     */
    readonly authToken: secretsmanager.Secret;
    /**
     * The Redis replication group
     */
    readonly replicationGroup: elasticache.CfnReplicationGroup;
    /**
     * The Redis hostname
     */
    readonly hostname: string;
    constructor(scope: Construct, id: string, props: RedisProps);
}
