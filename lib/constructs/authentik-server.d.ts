/**
 * Authentik Server Construct - Server container and ECS service configuration
 */
import { Construct } from 'constructs';
import { aws_ec2 as ec2, aws_ecs as ecs, aws_elasticloadbalancingv2 as elbv2 } from 'aws-cdk-lib';
import type { ContextEnvironmentConfig } from '../stack-config';
import type { InfrastructureConfig, SecretsConfig, StorageConfig, DeploymentConfig, AuthentikApplicationConfig } from '../construct-configs';
/**
 * Properties for the Authentik Server construct
 */
export interface AuthentikServerProps {
    /**
     * Environment type ('prod' | 'dev-test')
     */
    environment: 'prod' | 'dev-test';
    /**
     * Context-based environment configuration (direct from cdk.json)
     */
    contextConfig: ContextEnvironmentConfig;
    /**
     * Infrastructure configuration
     */
    infrastructure: InfrastructureConfig;
    /**
     * Secrets configuration
     */
    secrets: SecretsConfig;
    /**
     * Storage configuration
     */
    storage: StorageConfig;
    /**
     * Deployment configuration
     */
    deployment: DeploymentConfig;
    /**
     * Application configuration
     */
    application: AuthentikApplicationConfig;
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
