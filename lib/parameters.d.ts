/**
 * Parameter handling and environment variable resolution for the AuthInfra stack
 */
import * as cdk from 'aws-cdk-lib';
export declare const ENV_TYPE: "prod" | "dev-test";
export declare const GIT_SHA: string | undefined;
export declare const ENABLE_EXECUTE: string | undefined;
export declare const AUTHENTIK_ADMIN_USER_EMAIL: string | undefined;
export declare const AUTHENTIK_LDAP_BASE_DN: string | undefined;
export declare const IP_ADDRESS_TYPE: string | undefined;
export declare const SSL_CERTIFICATE_ARN: string | undefined;
export declare const USE_AUTHENTIK_CONFIG_FILE: string | undefined;
export declare const DOCKER_IMAGE_LOCATION: string | undefined;
/**
 * Get the current git SHA for tagging resources
 * @returns Current git SHA
 */
export declare function getGitSha(): string;
export declare function getParameters(): {
    envType: "prod" | "dev-test";
    gitSha: string;
    enableExecute: boolean;
};
/**
 * Resolves all AuthInfra stack parameters using cascading resolution
 * Priority: 1. Environment Variables, 2. CDK Context, 3. Default Values
 */
export declare function resolveStackParameters(stack: cdk.Stack): {
    envType: string;
    stackName: string;
    gitSha: string;
    enableExecute: boolean;
    authentikAdminUserEmail: string;
    authentikLdapBaseDn: string;
    ipAddressType: 'ipv4' | 'dualstack';
    sslCertificateArn: string;
    useAuthentikConfigFile: boolean;
    dockerImageLocation: 'Github' | 'Local ECR';
    authentikHost: string;
};
