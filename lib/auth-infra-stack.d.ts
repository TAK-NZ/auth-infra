import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StackProps } from 'aws-cdk-lib';
export interface AuthInfraStackProps extends StackProps {
    envType?: 'prod' | 'dev-test';
}
/**
 * Main CDK stack for the Auth Infrastructure
 */
export declare class AuthInfraStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: AuthInfraStackProps);
    private createEcsSecurityGroup;
    private createDbSecurityGroup;
    private createRedisSecurityGroup;
}
