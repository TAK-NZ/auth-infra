/**
 * Redis Construct - CDK implementation of the Redis/Valkey cache
 */
import { Construct } from 'constructs';
import { aws_elasticache as elasticache, aws_ec2 as ec2, aws_secretsmanager as secretsmanager } from 'aws-cdk-lib';
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
