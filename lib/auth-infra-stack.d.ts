import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StackProps } from 'aws-cdk-lib';
import { AuthInfraConfig } from './stack-config';
export interface AuthInfraStackProps extends StackProps {
    stackConfig: AuthInfraConfig;
}
/**
 * Main CDK stack for the TAK Auth Infrastructure
 */
export declare class AuthInfraStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: AuthInfraStackProps);
    private createEcsSecurityGroup;
    private createDbSecurityGroup;
    private createRedisSecurityGroup;
    /**
     * Get the current git SHA for tagging resources
     * @returns Current git SHA
     */
    private getGitSha;
}
