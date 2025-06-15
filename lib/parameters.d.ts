/**
 * Parameter handling and environment variable resolution for the CDK stacks
 */
import { App } from 'aws-cdk-lib';
/**
 * Config parameters for auth infrastructure stack
 */
export interface AuthInfraParameters {
    gitSha: string;
    environment: string;
    envType: 'prod' | 'dev-test';
    enableExecute: boolean;
    sslCertificateArn: string;
    authentikAdminUserEmail: string;
    authentikLdapBaseDn: string;
    useAuthentikConfigFile: boolean;
    ipAddressType: 'ipv4' | 'dualstack';
    dockerImageLocation: 'Github' | 'Local ECR';
}
/**
 * Config parameters for LDAP stack
 */
export interface LdapParameters {
    gitSha: string;
    environment: string;
    envType: 'prod' | 'dev-test';
    enableExecute: boolean;
    sslCertificateArn: string;
    authentikHost: string;
    dockerImageLocation: 'Github' | 'Local ECR';
}
/**
 * Get the current git SHA for tagging resources
 * @returns Current git SHA
 */
export declare function getGitSha(): string;
/**
 * Resolve Auth Infrastructure parameters from environment variables and CDK context
 * @param app - CDK App instance
 * @param stackName - The name of the stack
 * @param envType - The environment type (prod or dev-test)
 * @returns Resolved parameters for auth infrastructure stack
 */
export declare function resolveAuthInfraParameters(app: App, stackName: string, envType: 'prod' | 'dev-test'): AuthInfraParameters;
/**
 * Resolve LDAP stack parameters from environment variables and CDK context
 * @param app - CDK App instance
 * @param stackName - The name of the stack
 * @param envType - The environment type (prod or dev-test)
 * @returns Resolved parameters for LDAP stack
 */
export declare function resolveLdapParameters(app: App, stackName: string, envType: 'prod' | 'dev-test'): LdapParameters;
