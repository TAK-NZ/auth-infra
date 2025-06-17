/**
 * Utility functions for CDK infrastructure
 */

/**
 * Validates environment type parameter
 * @param envType - The environment type to validate
 * @throws Error if envType is not valid
 */
export function validateEnvType(envType: string): void {
  if (envType !== 'prod' && envType !== 'dev-test') {
    throw new Error(`Invalid envType: ${envType}. Must be 'prod' or 'dev-test'`);
  }
}

/**
 * Validates required stack name parameter
 * @param stackName - The stack name to validate
 * @throws Error if stackName is missing or empty
 */
export function validateStackName(stackName: string | undefined): void {
  if (!stackName) {
    throw new Error('stackName is required. Use --context stackName=YourStackName');
  }
}

/**
 * Validates required Authentik admin user email parameter
 * @param authentikAdminUserEmail - The admin user email to validate
 * @throws Error if authentikAdminUserEmail is missing or empty
 */
export function validateAuthentikAdminUserEmail(authentikAdminUserEmail: string | undefined): void {
  if (!authentikAdminUserEmail || authentikAdminUserEmail.trim() === '') {
    throw new Error('authentikAdminUserEmail is required. Use --context authentikAdminUserEmail=user@example.com');
  }
}

/**
 * Validates optional ldapBaseDn parameter when used
 * Note: This is a utility function for optional parameter validation within the stack
 * @param ldapBaseDn - The LDAP base DN to validate
 * @throws Error if ldapBaseDn is provided but empty
 */
export function validateLdapBaseDn(ldapBaseDn: string | undefined): void {
  if (ldapBaseDn !== undefined && ldapBaseDn.trim() === '') {
    throw new Error('ldapBaseDn cannot be empty when provided. Use --context ldapBaseDn=DC=example,DC=com');
  }
}

/**
 * Validates optional useAuthentikConfigFile parameter when used  
 * Note: This is a utility function for optional parameter validation within the stack
 * @param useAuthentikConfigFile - The useAuthentikConfigFile setting to validate
 * @throws Error if useAuthentikConfigFile is provided but invalid
 */
export function validateUseAuthentikConfigFile(useAuthentikConfigFile: string | undefined): void {
  if (useAuthentikConfigFile !== undefined && useAuthentikConfigFile !== 'true' && useAuthentikConfigFile !== 'false') {
    throw new Error('useAuthentikConfigFile must be either "true" or "false" when provided. Use --context useAuthentikConfigFile=true or --context useAuthentikConfigFile=false');
  }
}

/**
 * Gets the current Git SHA for tagging resources
 * @returns Git SHA string or 'unknown' if not available
 */
export function getGitSha(): string {
  try {
    const { execSync } = require('child_process');
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch (error) {
    return 'unknown';
  }
}

/**
 * Validates all required CDK context parameters
 * @param params - Object containing all parameters to validate
 */
export function validateCdkContextParams(params: {
  envType: string;
  stackName: string | undefined;
  authentikAdminUserEmail: string | undefined;
}): void {
  validateEnvType(params.envType);
  validateStackName(params.stackName);
  validateAuthentikAdminUserEmail(params.authentikAdminUserEmail);
}
