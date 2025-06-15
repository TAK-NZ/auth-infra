/**
 * Centralized outputs management for the Auth Infrastructure stack
 */
import * as cdk from 'aws-cdk-lib';
export interface AuthInfraOutputParams {
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
    ldapAlbDns: string;
    ldapEndpoint: string;
    ldapsEndpoint: string;
    ldapTokenRetrieverLambdaArn: string;
}
export interface LdapOutputParams {
    stack: cdk.Stack;
    stackName: string;
    loadBalancerDns: string;
    ldapEndpoint: string;
    ldapsEndpoint: string;
}
/**
 * Register all outputs for the Auth Infrastructure stack
 */
export declare function registerAuthInfraOutputs({ stack, stackName, databaseEndpoint, databaseSecretArn, redisEndpoint, redisAuthTokenArn, efsId, efsMediaAccessPointId, efsTemplatesAccessPointId, authentikSecretKeyArn, authentikAdminTokenArn, authentikLdapTokenArn, authentikAlbDns, authentikUrl, ldapAlbDns, ldapEndpoint, ldapsEndpoint, ldapTokenRetrieverLambdaArn }: AuthInfraOutputParams): void;
/**
 * Register all outputs for the LDAP stack
 */
export declare function registerLdapOutputs({ stack, stackName, loadBalancerDns, ldapEndpoint, ldapsEndpoint }: LdapOutputParams): void;
