/**
 * Constants and configuration definitions
 * Centralizes magic values and reusable configurations for the TAK-NZ auth infrastructure
 */

/**
 * AWS Region constants
 * Predefined regions commonly used in TAK-NZ deployments
 */
export const AWS_REGIONS = {
  /** Asia Pacific (Sydney) - Primary region for TAK-NZ */
  AP_SOUTHEAST_2: 'ap-southeast-2' as const,
  /** US East (N. Virginia) - Global services region */
  US_EAST_1: 'us-east-1' as const,
} as const;

/**
 * Infrastructure default configuration values
 * These can be overridden via CDK context
 */
export const INFRASTRUCTURE_DEFAULTS = {
  /** Default AWS region for all deployments */
  DEFAULT_AWS_REGION: AWS_REGIONS.AP_SOUTHEAST_2,
  /** Default VPC CIDR block - provides ~4000 IP addresses */
  DEFAULT_VPC_CIDR: '10.0.0.0/20' as const,
  /** Maximum number of Availability Zones to use */
  MAX_AZS: 3 as const,
} as const;

/**
 * Export individual constants for convenience
 */
export const { DEFAULT_AWS_REGION, DEFAULT_VPC_CIDR, MAX_AZS } = INFRASTRUCTURE_DEFAULTS;

/**
 * Network port constants for security group rules
 */
export const NETWORK_PORTS = {
  /** HTTP port */
  HTTP: 80 as const,
  /** HTTPS port */
  HTTPS: 443 as const,
  /** PostgreSQL default port */
  POSTGRES: 5432 as const,
  /** Redis default port */
  REDIS: 6379 as const,
  /** LDAP port */
  LDAP: 389 as const,
  /** LDAPS (LDAP over SSL) port */
  LDAPS: 636 as const,
  /** Authentik default port */
  AUTHENTIK: 9000 as const,
} as const;

/**
 * Service-specific constants
 */
export const SERVICE_CONSTANTS = {
  /** Authentik service configuration */
  AUTHENTIK: {
    /** Default container port */
    CONTAINER_PORT: NETWORK_PORTS.AUTHENTIK,
    /** Health check path */
    HEALTH_CHECK_PATH: '/-/health/ready/',
    /** Default image repository */
    IMAGE_REPOSITORY: 'ghcr.io/goauthentik/server',
  },
  /** LDAP service configuration */
  LDAP: {
    /** Default LDAP port */
    PORT: NETWORK_PORTS.LDAP,
    /** Default LDAPS port */
    SECURE_PORT: NETWORK_PORTS.LDAPS,
    /** Default image repository */
    IMAGE_REPOSITORY: 'osixia/openldap',
  },
} as const;

/**
 * Tag constants for resource tagging
 */
export const TAG_CONSTANTS = {
  /** Project identifier */
  PROJECT: 'TAK' as const,
  /** Component identifier for auth infrastructure */
  AUTH_COMPONENT: 'AuthInfra' as const,
  /** Managed by identifier */
  MANAGED_BY: 'CDK' as const,
} as const;

/**
 * Secret name constants for AWS Secrets Manager
 * These are used as aliases/names for secrets, not actual secret values
 */
export const SECRET_NAMES = {
  /** Authentik secret key alias */
  AUTHENTIK_SECRET_KEY: 'authentik-secret-key' as const,
  /** Authentik PostgreSQL password alias */
  AUTHENTIK_POSTGRES_PASSWORD: 'authentik-postgres-password' as const,
  /** Authentik Redis password alias */
  AUTHENTIK_REDIS_PASSWORD: 'authentik-redis-password' as const,
  /** LDAP admin password alias */
  LDAP_ADMIN_PASSWORD: 'ldap-admin-password' as const,
  /** LDAP config password alias */
  LDAP_CONFIG_PASSWORD: 'ldap-config-password' as const,
  /** LDAP readonly user alias */
  LDAP_READONLY_USER: 'readonly' as const,
  /** LDAP readonly password alias */
  LDAP_READONLY_PASSWORD: 'ldap-readonly-password' as const,
} as const;
