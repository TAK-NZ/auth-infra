/**
 * CloudFormation import utilities for base infrastructure resources
 * This file contains constants and functions for importing values from other stacks
 */

/**
 * Common export names for base infrastructure resources (imported from base stack)
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
 * Helper to create base infrastructure import value names
 * @param environment - Environment name (e.g. 'prod', 'dev', 'test', etc.)
 * @param exportName - The specific export name suffix from BASE_EXPORT_NAMES
 * @returns Full import value reference for base infrastructure
 * @example createBaseImportValue('prod', BASE_EXPORT_NAMES.VPC_ID) → 'TAK-prod-BaseInfra-VPC-ID'
 */
export function createBaseImportValue(environment: string, exportName: string): string {
  const baseStackName = `TAK-${environment}-BaseInfra`;
  return `${baseStackName}-${exportName}`;
}

/**
 * Helper to create auth infrastructure import value names for cross-stack references
 * @param environment - Environment name (e.g. 'prod', 'dev', 'test', etc.)  
 * @param exportName - The specific export name suffix from AUTH_EXPORT_NAMES
 * @returns Full import value reference for auth infrastructure
 * @example createAuthImportValue('prod', 'Database-Endpoint') → 'TAK-prod-AuthInfra-Database-Endpoint'
 */
export function createAuthImportValue(environment: string, exportName: string): string {
  const authStackName = `TAK-${environment}-AuthInfra`;
  return `${authStackName}-${exportName}`;
}
