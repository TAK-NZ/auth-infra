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
    ldapEndpoint: string;
    ldapsEndpoint: string;
    ldapTokenRetrieverLambdaArn: string;
}
export declare function registerOutputs(params: OutputParams): void;
