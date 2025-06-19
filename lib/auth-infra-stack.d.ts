import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StackProps } from 'aws-cdk-lib';
import { ContextEnvironmentConfig } from './stack-config';
export interface AuthInfraStackProps extends StackProps {
    environment: 'prod' | 'dev-test';
    envConfig: ContextEnvironmentConfig;
}
/**
 * Main CDK stack for the TAK Auth Infrastructure
 */
export declare class AuthInfraStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: AuthInfraStackProps);
    /**
     * Create security group for Authentik ECS tasks (Server/Worker)
     * @param vpc The VPC to create the security group in
     * @param stackNameComponent The stack name component for imports
     * @returns The created security group
     */
    private createAuthentikSecurityGroup;
    /**
     * Create security group for LDAP ECS tasks
     * @param vpc The VPC to create the security group in
     * @param stackNameComponent The stack name component for imports
     * @returns The created security group
     */
    private createLdapSecurityGroup;
    /**
     * Create security group for ECS tasks (Legacy - keeping for backward compatibility)
     * @param vpc The VPC to create the security group in
     * @returns The created security group
     */
    private createEcsSecurityGroup;
    /**
     * Create security group for database access
     * @param vpc The VPC to create the security group in
     * @param ecsSecurityGroup The ECS security group to allow access from
     * @returns The created security group
     */
    private createDbSecurityGroup;
}
