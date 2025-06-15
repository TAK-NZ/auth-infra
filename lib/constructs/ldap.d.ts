/**
 * LDAP Construct - CDK implementation of the Authentik LDAP outpost
 */
import { Construct } from 'constructs';
import { aws_ec2 as ec2, aws_ecs as ecs, aws_elasticloadbalancingv2 as elbv2, aws_secretsmanager as secretsmanager, aws_s3 as s3 } from 'aws-cdk-lib';
import type { AuthInfraEnvironmentConfig } from '../environment-config';
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
     * SSL certificate ARN for LDAPS
     */
    sslCertificateArn: string;
    /**
     * Authentik host URL
     */
    authentikHost: string;
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
    constructor(scope: Construct, id: string, props: LdapProps);
}
