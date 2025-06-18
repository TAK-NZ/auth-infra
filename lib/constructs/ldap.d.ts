/**
 * LDAP Construct - CDK implementation of the Authentik LDAP outpost
 */
import { Construct } from 'constructs';
import { aws_ecs as ecs, aws_elasticloadbalancingv2 as elbv2, aws_secretsmanager as secretsmanager } from 'aws-cdk-lib';
import type { AuthInfraEnvironmentConfig } from '../environment-config';
import type { InfrastructureConfig, StorageConfig, DeploymentConfig, NetworkConfig, AuthentikApplicationConfig } from '../construct-configs';
/**
 * Properties for the LDAP construct
 */
export interface LdapProps {
    /**
     * Environment name (e.g. 'prod', 'dev', etc.)
     */
    environment: string;
    /**
     * Environment configuration
     */
    config: AuthInfraEnvironmentConfig;
    /**
     * Infrastructure configuration (VPC, security groups, ECS cluster, KMS)
     */
    infrastructure: InfrastructureConfig;
    /**
     * Storage configuration (S3 bucket)
     */
    storage: StorageConfig;
    /**
     * Deployment configuration (ECR repository, Git SHA, enable execute)
     */
    deployment: DeploymentConfig;
    /**
     * Network configuration (SSL certificate)
     */
    network: NetworkConfig;
    /**
     * Application configuration (Authentik host)
     */
    application: AuthentikApplicationConfig;
    /**
     * LDAP token secret from Authentik
     */
    ldapToken: secretsmanager.ISecret;
}
/**
 * CDK construct for the LDAP outpost service
 */
export declare class Ldap extends Construct {
    /**
     * The network load balancer for the LDAP service
     */
    readonly loadBalancer: elbv2.NetworkLoadBalancer;
    /**
     * The ECS task definition for the LDAP service
     */
    readonly taskDefinition: ecs.TaskDefinition;
    /**
     * The ECS service for LDAP
     */
    readonly ecsService: ecs.FargateService;
    /**
     * DNS name of the load balancer
     */
    readonly dnsName: string;
    /**
     * Converts an ECR repository ARN to a proper ECR repository URI for Docker images
     * @param ecrArn - ECR repository ARN (e.g., "arn:aws:ecr:region:account:repository/repo-name")
     * @returns ECR repository URI (e.g., "account.dkr.ecr.region.amazonaws.com/repo-name")
     */
    private convertEcrArnToRepositoryUri;
    constructor(scope: Construct, id: string, props: LdapProps);
}
