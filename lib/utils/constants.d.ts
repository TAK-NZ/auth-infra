/**
 * Constants and configuration definitions
 * Centralizes magic values and reusable configurations for the TAK-NZ auth infrastructure
 */
/**
 * AWS Region constants
 * Predefined regions commonly used in TAK-NZ deployments
 */
export declare const AWS_REGIONS: {
    /** Asia Pacific (Sydney) - Primary region for TAK-NZ */
    readonly AP_SOUTHEAST_2: "ap-southeast-2";
    /** US East (N. Virginia) - Global services region */
    readonly US_EAST_1: "us-east-1";
};
/**
 * Infrastructure default configuration values
 * These can be overridden via CDK context
 */
export declare const INFRASTRUCTURE_DEFAULTS: {
    /** Default AWS region for all deployments */
    readonly DEFAULT_AWS_REGION: "ap-southeast-2";
    /** Default VPC CIDR block - provides ~4000 IP addresses */
    readonly DEFAULT_VPC_CIDR: "10.0.0.0/20";
    /** Maximum number of Availability Zones to use */
    readonly MAX_AZS: 3;
};
/**
 * Export individual constants for convenience
 */
export declare const DEFAULT_AWS_REGION: "ap-southeast-2", DEFAULT_VPC_CIDR: "10.0.0.0/20", MAX_AZS: 3;
/**
 * Network port constants for security group rules
 */
export declare const NETWORK_PORTS: {
    /** HTTP port */
    readonly HTTP: 80;
    /** HTTPS port */
    readonly HTTPS: 443;
    /** PostgreSQL default port */
    readonly POSTGRES: 5432;
    /** Redis default port */
    readonly REDIS: 6379;
    /** LDAP port */
    readonly LDAP: 389;
    /** LDAPS (LDAP over SSL) port */
    readonly LDAPS: 636;
    /** Authentik default port */
    readonly AUTHENTIK: 9000;
};
/**
 * Service-specific constants
 */
export declare const SERVICE_CONSTANTS: {
    /** Authentik service configuration */
    readonly AUTHENTIK: {
        /** Default container port */
        readonly CONTAINER_PORT: 9000;
        /** Health check path */
        readonly HEALTH_CHECK_PATH: "/-/health/ready/";
        /** Default image repository */
        readonly IMAGE_REPOSITORY: "ghcr.io/goauthentik/server";
    };
    /** LDAP service configuration */
    readonly LDAP: {
        /** Default LDAP port */
        readonly PORT: 389;
        /** Default LDAPS port */
        readonly SECURE_PORT: 636;
        /** Default image repository */
        readonly IMAGE_REPOSITORY: "osixia/openldap";
    };
};
/**
 * Tag constants for resource tagging
 */
export declare const TAG_CONSTANTS: {
    /** Project identifier */
    readonly PROJECT: "TAK";
    /** Component identifier for auth infrastructure */
    readonly AUTH_COMPONENT: "AuthInfra";
    /** Managed by identifier */
    readonly MANAGED_BY: "CDK";
};
/**
 * Secret name constants for AWS Secrets Manager
 * These are used as aliases/names for secrets, not actual secret values
 */
export declare const SECRET_NAMES: {
    /** Authentik secret key alias */
    readonly AUTHENTIK_SECRET_KEY: "authentik-secret-key";
    /** Authentik PostgreSQL password alias */
    readonly AUTHENTIK_POSTGRES_PASSWORD: "authentik-postgres-password";
    /** Authentik Redis password alias */
    readonly AUTHENTIK_REDIS_PASSWORD: "authentik-redis-password";
    /** LDAP admin password alias */
    readonly LDAP_ADMIN_PASSWORD: "ldap-admin-password";
    /** LDAP config password alias */
    readonly LDAP_CONFIG_PASSWORD: "ldap-config-password";
    /** LDAP readonly user alias */
    readonly LDAP_READONLY_USER: "readonly";
    /** LDAP readonly password alias */
    readonly LDAP_READONLY_PASSWORD: "ldap-readonly-password";
};
