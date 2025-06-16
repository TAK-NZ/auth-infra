/**
 * Authentik Server Construct - Server container and ECS service configuration
 */
import { Construct } from 'constructs';
import { aws_ec2 as ec2, aws_ecs as ecs, aws_elasticloadbalancingv2 as elbv2, aws_secretsmanager as secretsmanager, aws_s3 as s3, aws_kms as kms } from 'aws-cdk-lib';
import type { AuthInfraEnvironmentConfig } from '../environment-config';
/**
 * Properties for the Authentik Server construct
 */
export interface AuthentikServerProps {
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
     * S3 URI for the environment file (optional)
     */
    envFileS3Uri?: string;
    /**
     * S3 key for the environment file (optional)
     */
    envFileS3Key?: string;
    /**
     * Authentik admin user email
     */
    adminUserEmail: string;
    /**
     * LDAP base DN
     */
    ldapBaseDn: string;
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
     * Admin user password
     */
    adminUserPassword: secretsmanager.ISecret;
    /**
     * Admin user token
     */
    adminUserToken: secretsmanager.ISecret;
    /**
     * LDAP token
     */
    ldapToken: secretsmanager.ISecret;
    /**
     * KMS key for secrets encryption
     */
    kmsKey: kms.IKey;
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
}
/**
 * CDK construct for the Authentik server container and ECS service
 */
export declare class AuthentikServer extends Construct {
    /**
     * The ECS task definition for the Authentik server
     */
    readonly taskDefinition: ecs.TaskDefinition;
    /**
     * The ECS service for Authentik server
     */
    readonly ecsService: ecs.FargateService;
    /**
     * Converts an ECR repository ARN to a proper ECR repository URI for Docker images
     * @param ecrArn - ECR repository ARN (e.g., "arn:aws:ecr:region:account:repository/repo-name")
     * @returns ECR repository URI (e.g., "account.dkr.ecr.region.amazonaws.com/repo-name")
     */
    private convertEcrArnToRepositoryUri;
    constructor(scope: Construct, id: string, props: AuthentikServerProps);
    /**
     * Create and register a target group for this service
     */
    createTargetGroup(vpc: ec2.IVpc, listener: elbv2.ApplicationListener): elbv2.ApplicationTargetGroup;
}
