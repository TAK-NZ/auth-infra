/**
 * ELB Construct - Load balancer and networking for Authentik
 */
import { Construct } from 'constructs';
import { aws_ec2 as ec2, aws_elasticloadbalancingv2 as elbv2 } from 'aws-cdk-lib';
import type { AuthInfraEnvironmentConfig } from '../environment-config';
/**
 * Properties for the ELB construct
 */
export interface ElbProps {
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
     * SSL certificate ARN for HTTPS
     */
    sslCertificateArn: string;
}
/**
 * CDK construct for the Application Load Balancer
 */
export declare class Elb extends Construct {
    /**
     * The application load balancer
     */
    readonly loadBalancer: elbv2.ApplicationLoadBalancer;
    /**
     * The HTTPS listener
     */
    readonly httpsListener: elbv2.ApplicationListener;
    /**
     * DNS name of the load balancer
     */
    readonly dnsName: string;
    constructor(scope: Construct, id: string, props: ElbProps);
    /**
     * Create a target group for Authentik services
     */
    createTargetGroup(id: string, port: number, vpc: ec2.IVpc, healthCheckPath?: string): elbv2.ApplicationTargetGroup;
    /**
     * Add a target group to the HTTPS listener
     */
    addTargetGroup(id: string, targetGroup: elbv2.ApplicationTargetGroup, priority?: number): void;
}
