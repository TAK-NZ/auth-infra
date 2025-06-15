/**
 * Authentik Construct - CDK implementation of the Authentik service
 */
import { Construct } from 'constructs';
import { aws_ec2 as ec2, aws_ecs as ecs, aws_elasticloadbalancingv2 as elbv2, aws_secretsmanager as secretsmanager } from 'aws-cdk-lib';
import type { BaseConfig } from '../environment-config';
/**
 * Properties for the Authentik construct
 */
export interface AuthentikProps {
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
     * Security group for ECS tasks
     */
    ecsSecurityGroup: ec2.SecurityGroup;
    /**
     * ECS cluster
     */
    ecsCluster: ecs.Cluster;
    /**
     * SSL certificate ARN for HTTPS
     */
    sslCertificateArn: string;
    /**
     * Authentik admin user email
     */
    adminUserEmail: string;
    /**
     * LDAP base DN
     */
    ldapBaseDn: string;
    /**
     * Whether to use authentik-config.env file
     */
    useConfigFile: boolean;
    /**
     * IP address type for load balancers
     */
    ipAddressType: 'ipv4' | 'dualstack';
    /**
     * Docker image location (Github or Local ECR)
     */
    dockerImageLocation: 'Github' | 'Local ECR';
    /**
     * Allow SSH exec into container
     */
    enableExecute: boolean;
    /**
     * Database credentials secret
     */
    dbSecret: secretsmanager.Secret;
    /**
     * Database hostname
     */
    dbHostname: string;
    /**
     * Redis auth token secret
     */
    redisAuthToken: secretsmanager.Secret;
    /**
     * Redis hostname
     */
    redisHostname: string;
    /**
     * Authentik secret key
     */
    secretKey: secretsmanager.Secret;
    /**
     * Admin user password secret
     */
    adminUserPassword: secretsmanager.Secret;
    /**
     * Admin user token secret
     */
    adminUserToken: secretsmanager.Secret;
    /**
     * LDAP token secret
     */
    ldapToken: secretsmanager.Secret;
    /**
     * EFS filesystem ID
     */
    efsId: string;
    /**
     * EFS access point ID for media
     */
    efsMediaAccessPointId: string;
    /**
     * EFS access point ID for custom templates
     */
    efsCustomTemplatesAccessPointId: string;
}
/**
 * CDK construct for the Authentik service
 */
export declare class Authentik extends Construct {
    /**
     * The load balancer for the Authentik service
     */
    readonly loadBalancer: elbv2.ApplicationLoadBalancer;
    /**
     * The ECS task definition for the Authentik service
     */
    readonly taskDefinition: ecs.TaskDefinition;
    /**
     * The ECS service for Authentik
     */
    readonly ecsService: ecs.FargateService;
    /**
     * DNS name of the load balancer
     */
    readonly dnsName: string;
    constructor(scope: Construct, id: string, props: AuthentikProps);
}
