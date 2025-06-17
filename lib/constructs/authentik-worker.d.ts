/**
 * Authentik Worker Construct - Worker container configuration for background tasks
 */
import { Construct } from 'constructs';
import { aws_ecs as ecs } from 'aws-cdk-lib';
import type { AuthInfraEnvironmentConfig } from '../environment-config';
import type { InfrastructureConfig, SecretsConfig, StorageConfig, DeploymentConfig, AuthentikApplicationConfig } from '../construct-configs';
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
     * Infrastructure configuration (VPC, ECS, security groups)
     */
    infrastructure: InfrastructureConfig;
    /**
     * Secrets configuration (database, Redis, Authentik secrets)
     */
    secrets: SecretsConfig;
    /**
     * Storage configuration (S3, EFS)
     */
    storage: StorageConfig;
    /**
     * Deployment configuration (ECR, Git SHA, execution settings)
     */
    deployment: DeploymentConfig;
    /**
     * Authentik application configuration (admin settings, LDAP, host URL)
     */
    application: AuthentikApplicationConfig;
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
