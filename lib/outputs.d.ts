/**
 * Centralized outputs management for the Auth Infrastructure stack
 */
import * as cdk from 'aws-cdk-lib';
export interface OutputParams {
    stack: cdk.Stack;
    stackName: string;
    databaseEndpoint: string;
    databaseSecretArn: string;
    redisEndpoint: string;
    redisAuthTokenArn: string;
    efsId: string;
    efsMediaAccessPointId: string;
    efsTemplatesAccessPointId: string;
    authentikSecretKeyArn: string;
    authentikAdminTokenArn: string;
    authentikLdapTokenArn: string;
    authentikAlbDns: string;
    authentikUrl: string;
    ldapNlbDns: string;
    ldapTokenRetrieverLambdaArn: string;
}
/**
 * Register all outputs for the Auth Infrastructure stack
 */
export declare function registerOutputs({ stack, stackName, databaseEndpoint, databaseSecretArn, redisEndpoint, redisAuthTokenArn, efsId, efsMediaAccessPointId, efsTemplatesAccessPointId, authentikSecretKeyArn, authentikAdminTokenArn, authentikLdapTokenArn, authentikAlbDns, authentikUrl, ldapNlbDns, ldapTokenRetrieverLambdaArn }: OutputParams): void;
