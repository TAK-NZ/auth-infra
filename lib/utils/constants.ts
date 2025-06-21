/**
 * Constants and configuration definitions
 * Centralizes core values for the TAK-NZ auth infrastructure
 */

export const AWS_REGIONS = {
  AP_SOUTHEAST_2: 'ap-southeast-2' as const,
  US_EAST_1: 'us-east-1' as const,
} as const;

export const INFRASTRUCTURE_DEFAULTS = {
  DEFAULT_AWS_REGION: AWS_REGIONS.AP_SOUTHEAST_2,
} as const;

export const DEFAULT_AWS_REGION = INFRASTRUCTURE_DEFAULTS.DEFAULT_AWS_REGION;



/**
 * Tag constants for resource tagging
 */
export const TAG_CONSTANTS = {
  PROJECT: 'TAK' as const,
  AUTH_COMPONENT: 'AuthInfra' as const,
  MANAGED_BY: 'CDK' as const,
} as const;

/**
 * Secret name constants for AWS Secrets Manager
 */
export const SECRET_NAMES = {
  AUTHENTIK_SECRET_KEY: 'authentik-secret-key' as const,
  AUTHENTIK_POSTGRES_PASSWORD: 'authentik-postgres-password' as const,
  AUTHENTIK_REDIS_PASSWORD: 'authentik-redis-password' as const,
  LDAP_ADMIN_PASSWORD: 'ldap-admin-password' as const,
  LDAP_CONFIG_PASSWORD: 'ldap-config-password' as const,
  LDAP_READONLY_USER: 'readonly' as const,
  LDAP_READONLY_PASSWORD: 'ldap-readonly-password' as const,
} as const;
