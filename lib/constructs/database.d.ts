/**
 * Database Construct - CDK implementation of the PostgreSQL database
 */
import { Construct } from 'constructs';
import { aws_rds as rds, aws_ec2 as ec2, aws_secretsmanager as secretsmanager } from 'aws-cdk-lib';
import type { ContextEnvironmentConfig } from '../stack-config';
import type { InfrastructureConfig } from '../construct-configs';
/**
 * Properties for the Database construct
 */
export interface DatabaseProps {
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
     * Security groups for database access
     */
    securityGroups: ec2.SecurityGroup[];
}
/**
 * CDK construct for the PostgreSQL database cluster
 */
export declare class Database extends Construct {
    /**
     * The master secret for database access
     */
    readonly masterSecret: secretsmanager.Secret;
    /**
     * The RDS database cluster
     */
    readonly cluster: rds.DatabaseCluster;
    /**
     * The database hostname
     */
    readonly hostname: string;
    constructor(scope: Construct, id: string, props: DatabaseProps);
}
