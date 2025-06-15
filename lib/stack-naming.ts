/**
 * Utility for consistent stack naming and export/import value helpers
 */
import { Fn } from 'aws-cdk-lib';

/**
 * Fixed configuration values for stack naming
 */
export const FIXED_STACK_CONFIG = {
  PROJECT: 'tak',
  AUTH_STACK_PREFIX: 'auth-infra',
  LDAP_STACK_PREFIX: 'ldap',
} as const;

/**
 * Generate consistent stack name for the Auth Infra stack
 * @param environment - Environment name (e.g. 'prod', 'dev', 'test', etc.)
 * @returns Full stack name for the auth infrastructure
 */
export function generateAuthInfraStackName(environment: string): string {
  return `${FIXED_STACK_CONFIG.PROJECT}-${FIXED_STACK_CONFIG.AUTH_STACK_PREFIX}-${environment}`;
}

/**
 * Generate consistent stack name for the LDAP stack
 * @param environment - Environment name (e.g. 'prod', 'dev', 'test', etc.)
 * @returns Full stack name for the LDAP stack
 */
export function generateLdapStackName(environment: string): string {
  return `${FIXED_STACK_CONFIG.PROJECT}-${FIXED_STACK_CONFIG.LDAP_STACK_PREFIX}-${environment}`;
}

/**
 * Helper to generate consistent import value names from the base infrastructure stack
 * @param environment - Environment name (e.g. 'prod', 'dev', 'test', etc.)
 * @param exportName - The specific export name suffix (e.g. 'vpc-id', 'subnet-private-a', etc.)
 * @returns Full import value reference string
 */
export function importBaseInfraValue(environment: string, exportName: string): string {
  return Fn.importValue(`coe-base-${environment}-${exportName}`);
}

/**
 * Helper to generate consistent export value names for the auth infrastructure stack
 * @param environment - Environment name (e.g. 'prod', 'dev', 'test', etc.)
 * @param exportName - The specific export name suffix
 * @returns Full export value name
 */
export function generateAuthInfraExportName(environment: string, exportName: string): string {
  return `${generateAuthInfraStackName(environment)}-${exportName}`;
}

/**
 * Helper to generate consistent export value names for the LDAP stack
 * @param environment - Environment name (e.g. 'prod', 'dev', 'test', etc.)
 * @param exportName - The specific export name suffix
 * @returns Full export value name
 */
export function generateLdapExportName(environment: string, exportName: string): string {
  return `${generateLdapStackName(environment)}-${exportName}`;
}
