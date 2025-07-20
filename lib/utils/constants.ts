/**
 * Constants and configuration definitions
 * Centralizes magic values and reusable configurations for the TAK-NZ authentication infrastructure
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
 * Database configuration constants
 * PostgreSQL settings for Authentik backend storage
 */
export const DATABASE_CONSTANTS = {
  /** Standard PostgreSQL port */
  PORT: 5432,
  /** Generated password length for security */
  PASSWORD_LENGTH: 64,
  /** Default database name for Authentik */
  DEFAULT_DATABASE_NAME: 'authentik',
  /** Database username for Authentik service */
  USERNAME: 'authentik'
} as const;

/**
 * Redis/Valkey configuration constants
 * Cache and session storage settings for Authentik
 */
export const REDIS_CONSTANTS = {
  /** Standard Redis port */
  PORT: 6379,
  /** Generated password length for security */
  PASSWORD_LENGTH: 64,
  /** Redis-compatible engine (AWS ElastiCache) */
  ENGINE: 'valkey',
  /** Engine version for compatibility and features */
  ENGINE_VERSION: '7.2'
} as const;

/**
 * Authentik service port configuration
 * Network ports for Authentik server and LDAP services
 */
export const AUTHENTIK_CONSTANTS = {
  /** Authentik web server HTTPS port */
  SERVER_PORT: 9443,
  /** Standard LDAP port */
  LDAP_PORT: 389,
  /** Secure LDAP port */
  LDAPS_PORT: 636,
  /** Network Load Balancer LDAP port */
  NLB_LDAP_PORT: 3389,
  /** Network Load Balancer LDAPS port */
  NLB_LDAPS_PORT: 6636
} as const;

/**
 * Enrollment configuration constants
 * Settings for device enrollment application
 */
export const ENROLLMENT_CONSTANTS = {
  /** ALB listener rule priority for enrollment endpoint */
  LISTENER_PRIORITY: 100,
  /** Session cookie name for enrollment application */
  SESSION_COOKIE_NAME: 'AWSELBAuthSessionCookie-Enrollment',
  /** Session timeout duration in days */
  SESSION_TIMEOUT_DAYS: 1,
  /** OIDC scopes required for enrollment */
  OIDC_SCOPES: 'openid email profile'
} as const;

/**
 * Elastic File System constants
 * Shared storage configuration for Authentik data persistence
 */
export const EFS_CONSTANTS = {
  /** Standard NFS port for EFS */
  PORT: 2049
} as const;

/**
 * Infrastructure default configuration values
 * These can be overridden via CDK context
 */
export const INFRASTRUCTURE_DEFAULTS = {
  /** Default AWS region for all deployments */
  DEFAULT_AWS_REGION: AWS_REGIONS.AP_SOUTHEAST_2
} as const;

// Export individual constants for backward compatibility
export const DEFAULT_AWS_REGION = INFRASTRUCTURE_DEFAULTS.DEFAULT_AWS_REGION;