/**
 * LDAP Construct - CDK implementation of the Authentik LDAP outpost
 */
import { Construct } from 'constructs';
import { aws_ec2 as ec2, aws_ecs as ecs, aws_elasticloadbalancingv2 as elbv2, aws_secretsmanager as secretsmanager } from 'aws-cdk-lib';
import type { BaseConfig } from '../environment-config';
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
     * SSL certificate ARN for LDAPS
     */
    sslCertificateArn: string;
    /**
     * Authentik host URL
     */
    authentikHost: string;
    /**
     * Docker image location (Github or Local ECR)
     */
    dockerImageLocation: 'Github' | 'Local ECR';
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
