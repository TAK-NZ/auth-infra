import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StackProps } from 'aws-cdk-lib';
import { AuthInfraConfigResult } from './stack-config';
export interface AuthInfraStackProps extends StackProps {
    configResult: AuthInfraConfigResult;
}
/**
 * Main CDK stack for the TAK Auth Infrastructure
 */
export declare class AuthInfraStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: AuthInfraStackProps);
    /**
     * Create security group for ECS tasks
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
    /**
     * Create security group for Redis access
     * @param vpc The VPC to create the security group in
     * @param ecsSecurityGroup The ECS security group to allow access from
     * @returns The created security group
     */
    private createRedisSecurityGroup;
}
