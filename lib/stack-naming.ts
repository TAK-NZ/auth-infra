/**
 * Utility functions for consistent stack naming across the application
 */

export interface StackNamingConfig {
  project?: string;
  environment?: string;
  component?: string;
  suffix?: string;
}

/**
 * Fixed configuration for the organization
 */
export const FIXED_STACK_CONFIG = {
  PROJECT: 'TAK',
  COMPONENT: 'AuthInfra'
} as const;

/**
 * Generate a consistent stack name based on configuration
 * @param config.environment - The environment/deployment identifier (from stackName in config)
 */
export function generateStackName(config: StackNamingConfig): string {
  const parts = [
    config.project || FIXED_STACK_CONFIG.PROJECT,
    config.environment || 'MyFirstStack',  // This comes from stackName in config
    config.component || FIXED_STACK_CONFIG.COMPONENT
  ];
  
  if (config.suffix) {
    parts.push(config.suffix);
  }
  
  return parts.join('-');
}

/**
 * Generate consistent stack name for the Auth Infra stack
 * @param environment - Environment name (e.g. 'prod', 'dev', 'test', etc.)
 * @returns Full stack name for the auth infrastructure
 */
export function generateAuthInfraStackName(environment: string): string {
  return generateStackName({
    project: FIXED_STACK_CONFIG.PROJECT,
    environment,
    component: FIXED_STACK_CONFIG.COMPONENT
  });
}

/**
 * Common export names for auth infrastructure resources
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
  LDAP_ALB_DNS: 'LDAP-ALB-DNS',
  LDAP_ENDPOINT: 'LDAP-Endpoint',
  LDAPS_ENDPOINT: 'LDAPS-Endpoint',
  LDAP_TOKEN_RETRIEVER_LAMBDA_ARN: 'LDAP-TokenRetriever-Lambda-ARN'
} as const;

/**
 * Common export names for base infrastructure resources (imported)
 */
export const BASE_EXPORT_NAMES = {
  VPC_ID: 'VPC-ID',
  VPC_CIDR_IPV4: 'VpcIPv4CIDR',
  VPC_CIDR_IPV6: 'VpcIPv6CIDR',
  SUBNET_PRIVATE_A: 'SubnetPrivateA',
  SUBNET_PRIVATE_B: 'SubnetPrivateB',
  SUBNET_PUBLIC_A: 'SubnetPublicA',
  SUBNET_PUBLIC_B: 'SubnetPublicB',
  ECS_CLUSTER: 'Ecs-ARN',
  ECR_REPO: 'Ecr-ARN',
  KMS_KEY: 'Kms-ARN',
  KMS_ALIAS: 'Kms-Alias',
  S3_BUCKET: 'S3ConfBucket-ARN',
  S3_ID: 'S3-ID',
  CERTIFICATE_ARN: 'AcmCert-ARN',
  HOSTED_ZONE_ID: 'R53Zone-ID',
} as const;

/**
 * Helper to create CloudFormation Fn::Sub expression for dynamic export names
 * The StackName parameter contains the full stack name (e.g., "TAK-devtest-AuthInfra")
 * This function creates the export name: {StackName}-{resource}
 */
export function createDynamicExportName(resourceType: string): string {
  return `\${StackName}-${resourceType}`;
}

/**
 * Helper to create base infrastructure import value names
 * @param environment - Environment name (e.g. 'prod', 'dev', 'test', etc.)
 * @param exportName - The specific export name suffix
 * @returns Full import value reference for base infrastructure
 */
export function createBaseImportValue(environment: string, exportName: string): string {
  const baseStackName = generateStackName({
    project: FIXED_STACK_CONFIG.PROJECT,
    environment,
    component: 'BaseInfra'
  });
  return `${baseStackName}-${exportName}`;
}

/**
 * Helper to create auth infrastructure import value names
 * @param environment - Environment name (e.g. 'prod', 'dev', 'test', etc.)
 * @param exportName - The specific export name suffix
 * @returns Full import value reference for auth infrastructure
 */
export function createAuthImportValue(environment: string, exportName: string): string {
  const authStackName = generateAuthInfraStackName(environment);
  return `${authStackName}-${exportName}`;
}
