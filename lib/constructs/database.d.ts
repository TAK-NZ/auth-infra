/**
 * Database Construct - CDK implementation of the PostgreSQL database
 */
import { Construct } from 'constructs';
import { aws_rds as rds, aws_ec2 as ec2, aws_secretsmanager as secretsmanager, aws_kms as kms } from 'aws-cdk-lib';
import type { AuthInfraEnvironmentConfig } from '../environment-config';
/**
 * Properties for the Database construct
 */
export interface DatabaseProps {
    /**
     * Environment name (e.g. 'prod', 'dev', etc.)
     */
    environment: string;
    /**
     * Environment configuration
     */
    config: AuthInfraEnvironmentConfig;
    /**
     * VPC for deployment
     */
    vpc: ec2.IVpc;
    /**
     * KMS key for encryption
     */
    kmsKey: kms.IKey;
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
