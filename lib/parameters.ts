/**
 * Parameter handling and environment variable resolution for the AuthInfra stack
 */
import * as cdk from 'aws-cdk-lib';
import { execSync } from 'child_process';
import { getEnvironmentConfig } from './environment-config';

// Direct parameter exports following the reference pattern
export const ENV_TYPE = process.env.ENV_TYPE as 'prod' | 'dev-test' || 'dev-test';
export const GIT_SHA = process.env.GIT_SHA;
export const ENABLE_EXECUTE = process.env.ENABLE_EXECUTE;
export const AUTHENTIK_ADMIN_USER_EMAIL = process.env.AUTHENTIK_ADMIN_USER_EMAIL;
export const AUTHENTIK_LDAP_BASE_DN = process.env.AUTHENTIK_LDAP_BASE_DN;
export const IP_ADDRESS_TYPE = process.env.IP_ADDRESS_TYPE;
export const SSL_CERTIFICATE_ARN = process.env.SSL_CERTIFICATE_ARN;
export const USE_AUTHENTIK_CONFIG_FILE = process.env.USE_AUTHENTIK_CONFIG_FILE;
export const DOCKER_IMAGE_LOCATION = process.env.DOCKER_IMAGE_LOCATION;

/**
 * Get the current git SHA for tagging resources
 * @returns Current git SHA
 */
export function getGitSha(): string {
  try {
    // Get the current git SHA
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch (error) {
    console.warn('Unable to get git SHA, using "development"');
    return 'development';
  }
}

export function getParameters() {
  return {
    envType: ENV_TYPE,
    gitSha: GIT_SHA || getGitSha(),
    enableExecute: ENABLE_EXECUTE === 'true' || false,
  };
}

/**
 * Resolves all AuthInfra stack parameters using cascading resolution
 * Priority: 1. Environment Variables, 2. CDK Context, 3. Default Values
 */
export function resolveStackParameters(stack: cdk.Stack): {
  envType: string;
  stackName: string;
  gitSha: string;
  enableExecute: boolean;
  authentikAdminUserEmail: string;
  authentikLdapBaseDn: string;
  ipAddressType: 'ipv4' | 'dualstack';
  sslCertificateArn: string;
  useAuthentikConfigFile: boolean;
  dockerImageLocation: 'Github' | 'Local ECR';
  authentikHost: string;
} {
  // Environment variables (first priority)
  const STACK_NAME_ENV = process.env.STACK_NAME;
  
  // Context values (second priority)
  const envTypeFromContext = stack.node.tryGetContext('envType');
  const stackNameFromContext = stack.node.tryGetContext('stackName');
  const gitShaFromContext = stack.node.tryGetContext('gitSha');
  const enableExecuteFromContext = stack.node.tryGetContext('enableExecute');
  const authentikAdminUserEmailFromContext = stack.node.tryGetContext('authentikAdminUserEmail');
  const authentikLdapBaseDnFromContext = stack.node.tryGetContext('authentikLdapBaseDn');
  const ipAddressTypeFromContext = stack.node.tryGetContext('ipAddressType');
  const sslCertificateArnFromContext = stack.node.tryGetContext('sslCertificateArn');
  const useAuthentikConfigFileFromContext = stack.node.tryGetContext('useAuthentikConfigFile');
  const dockerImageLocationFromContext = stack.node.tryGetContext('dockerImageLocation');
  const authentikHostFromContext = stack.node.tryGetContext('authentikHost');

  // Resolution with environment variables taking precedence
  const envType = process.env.ENV_TYPE || envTypeFromContext || 'dev-test';
  const stackName = STACK_NAME_ENV || stackNameFromContext || `${envType}-stack`;
  const gitSha = GIT_SHA || gitShaFromContext || getGitSha();

  // Get environment-specific configuration
  const envConfig = getEnvironmentConfig(envType);

  // Boolean parameters: Environment variables override context, which overrides defaults
  const enableExecute = ENABLE_EXECUTE !== undefined 
    ? Boolean(ENABLE_EXECUTE === 'true')
    : enableExecuteFromContext !== undefined
    ? Boolean(enableExecuteFromContext)
    : false;

  const useAuthentikConfigFile = USE_AUTHENTIK_CONFIG_FILE !== undefined
    ? Boolean(USE_AUTHENTIK_CONFIG_FILE === 'true')
    : useAuthentikConfigFileFromContext !== undefined
    ? Boolean(useAuthentikConfigFileFromContext)
    : false;

  // String parameters with validation
  const authentikAdminUserEmail = AUTHENTIK_ADMIN_USER_EMAIL || authentikAdminUserEmailFromContext || '';
  const authentikLdapBaseDn = AUTHENTIK_LDAP_BASE_DN || authentikLdapBaseDnFromContext || 'DC=example,DC=com';
  const ipAddressType = (IP_ADDRESS_TYPE || ipAddressTypeFromContext || 'dualstack') as 'ipv4' | 'dualstack';
  const sslCertificateArn = SSL_CERTIFICATE_ARN || sslCertificateArnFromContext || '';
  const dockerImageLocation = (DOCKER_IMAGE_LOCATION || dockerImageLocationFromContext || 'Github') as 'Github' | 'Local ECR';
  
  // For LDAP, the authentik host will be derived from the Authentik construct within the same stack
  // This is a placeholder that gets overridden during stack construction
  const authentikHost = process.env.AUTHENTIK_HOST || authentikHostFromContext || 'localhost';

  // Validate required parameters
  if (!authentikAdminUserEmail) {
    throw new Error('authentikAdminUserEmail is required. Set it via --context authentikAdminUserEmail=user@example.com or AUTHENTIK_ADMIN_USER_EMAIL environment variable.');
  }

  return {
    envType,
    stackName,
    gitSha,
    enableExecute,
    authentikAdminUserEmail,
    authentikLdapBaseDn,
    ipAddressType,
    sslCertificateArn,
    useAuthentikConfigFile,
    dockerImageLocation,
    authentikHost,
  };
}
