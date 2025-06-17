/**
 * CloudFormation export utilities for auth infrastructure resources
 * This file contains constants and functions for exporting values from this stack
 */

/**
 * Common export names for auth infrastructure resources (exported by this stack)
 */
export const AUTH_EXPORT_NAMES = {
  DATABASE_ENDPOINT: 'Database-Endpoint',
  DATABASE_SECRET_ARN: 'Database-Secret-ARN',
  REDIS_ENDPOINT: 'Redis-Endpoint',
  REDIS_AUTH_TOKEN_ARN: 'Redis-AuthToken-ARN',
  EFS_ID: 'EFS-ID',
  EFS_MEDIA_ACCESS_POINT: 'EFS-Media-AccessPoint',
  EFS_TEMPLATES_ACCESS_POINT: 'EFS-Templates-AccessPoint',
  AUTHENTIK_SECRET_KEY_ARN: 'Authentik-SecretKey-ARN',
  AUTHENTIK_ADMIN_TOKEN_ARN: 'Authentik-AdminToken-ARN',
  AUTHENTIK_LDAP_TOKEN_ARN: 'Authentik-LdapToken-ARN',
  AUTHENTIK_ALB_DNS: 'Authentik-ALB-DNS',
  AUTHENTIK_URL: 'Authentik-URL',
  LDAP_NLB_DNS: 'LDAP-NLB-DNS',
  LDAP_ENDPOINT: 'LDAP-Endpoint',
  LDAPS_ENDPOINT: 'LDAPS-Endpoint',
  LDAP_TOKEN_RETRIEVER_LAMBDA_ARN: 'LDAP-TokenRetriever-Lambda-ARN'
} as const;

/**
 * Helper to create CloudFormation Fn::Sub expression for dynamic export names
 * The StackName parameter contains the full stack name (e.g., "TAK-devtest-AuthInfra")
 * This function creates the export name: {StackName}-{resource}
 * @param resourceType - The resource type suffix from AUTH_EXPORT_NAMES
 * @returns CloudFormation Fn::Sub template string for dynamic export naming
 * @example createDynamicExportName('Database-Endpoint') → '${StackName}-Database-Endpoint'
 */
export function createDynamicExportName(resourceType: string): string {
  return `\${StackName}-${resourceType}`;
}
