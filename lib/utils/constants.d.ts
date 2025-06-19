/**
 * Constants and configuration definitions
 * Centralizes core values for the TAK-NZ auth infrastructure
 */
export declare const AWS_REGIONS: {
    readonly AP_SOUTHEAST_2: "ap-southeast-2";
    readonly US_EAST_1: "us-east-1";
};
export declare const INFRASTRUCTURE_DEFAULTS: {
    readonly DEFAULT_AWS_REGION: "ap-southeast-2";
    readonly DEFAULT_VPC_CIDR: "10.0.0.0/20";
    readonly MAX_AZS: 2;
};
export declare const DEFAULT_AWS_REGION: "ap-southeast-2";
export declare const DEFAULT_VPC_CIDR: "10.0.0.0/20";
/**
 * Tag constants for resource tagging
 */
export declare const TAG_CONSTANTS: {
    readonly PROJECT: "TAK";
    readonly AUTH_COMPONENT: "AuthInfra";
    readonly MANAGED_BY: "CDK";
};
/**
 * Secret name constants for AWS Secrets Manager
 */
export declare const SECRET_NAMES: {
    readonly AUTHENTIK_SECRET_KEY: "authentik-secret-key";
    readonly AUTHENTIK_POSTGRES_PASSWORD: "authentik-postgres-password";
    readonly AUTHENTIK_REDIS_PASSWORD: "authentik-redis-password";
    readonly LDAP_ADMIN_PASSWORD: "ldap-admin-password";
    readonly LDAP_CONFIG_PASSWORD: "ldap-config-password";
    readonly LDAP_READONLY_USER: "readonly";
    readonly LDAP_READONLY_PASSWORD: "ldap-readonly-password";
};
