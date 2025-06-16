/**
 * Authentik Worker Construct - Worker container configuration for background tasks
 */
import { Construct } from 'constructs';
import { aws_ec2 as ec2, aws_ecs as ecs, aws_secretsmanager as secretsmanager, aws_s3 as s3, aws_kms as kms } from 'aws-cdk-lib';
import type { AuthInfraEnvironmentConfig } from '../environment-config';
/**
 * Properties for the Authentik Worker construct
 */
export interface AuthentikWorkerProps {
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
     * Security group for ECS tasks
     */
    ecsSecurityGroup: ec2.SecurityGroup;
    /**
     * ECS cluster
     */
    ecsCluster: ecs.ICluster;
    /**
     * S3 configuration bucket for environment files
     */
    s3ConfBucket: s3.IBucket;
    /**
     * S3 key for the environment file (optional)
     */
    envFileS3Key?: string;
    /**
     * Use authentik config file from S3 (default: false)
     */
    useAuthentikConfigFile: boolean;
    /**
     * ECR repository ARN for ECR images
     */
    ecrRepositoryArn?: string;
    /**
     * Git SHA for Docker image tagging
     */
    gitSha: string;
    /**
     * Allow SSH exec into container
     */
    enableExecute: boolean;
    /**
     * Authentik admin user email
     */
    adminUserEmail: string;
    /**
     * LDAP base DN
     */
    ldapBaseDn: string;
    /**
     * LDAP service user secret
     */
    ldapServiceUser: secretsmanager.ISecret;
    /**
     * Database secret
     */
    dbSecret: secretsmanager.ISecret;
    /**
     * Database hostname
     */
    dbHostname: string;
    /**
     * Redis auth token
     */
    redisAuthToken: secretsmanager.ISecret;
    /**
     * Redis hostname
     */
    redisHostname: string;
    /**
     * Authentik secret key
     */
    secretKey: secretsmanager.ISecret;
    /**
     * Admin user password secret
     */
    adminUserPassword: secretsmanager.ISecret;
    /**
     * Admin user token secret
     */
    adminUserToken: secretsmanager.ISecret;
    /**
     * EFS file system ID
     */
    efsId: string;
    /**
     * EFS media access point ID
     */
    efsMediaAccessPointId: string;
    /**
     * EFS custom templates access point ID
     */
    efsCustomTemplatesAccessPointId: string;
    /**
     * KMS key for secrets encryption
     */
    kmsKey: kms.IKey;
}
/**
 * CDK construct for the Authentik worker container
 */
export declare class AuthentikWorker extends Construct {
    /**
     * The ECS task definition for the Authentik worker
     */
    readonly taskDefinition: ecs.TaskDefinition;
    /**
     * The ECS service for Authentik worker
     */
    readonly ecsService: ecs.FargateService;
    /**
     * Converts an ECR repository ARN to a proper ECR repository URI for Docker images
     * @param ecrArn - ECR repository ARN (e.g., "arn:aws:ecr:region:account:repository/repo-name")
     * @returns ECR repository URI (e.g., "account.dkr.ecr.region.amazonaws.com/repo-name")
     */
    private convertEcrArnToRepositoryUri;
    constructor(scope: Construct, id: string, props: AuthentikWorkerProps);
}
