/**
 * Parameter handling and environment variable resolution for the CDK stacks
 */
import { App } from 'aws-cdk-lib';
import { execSync } from 'child_process';

/**
 * Config parameters for auth infrastructure stack
 */
export interface AuthInfraParameters {
  gitSha: string;
  environment: string;
  envType: 'prod' | 'dev-test';
  enableExecute: boolean;
  sslCertificateArn: string;
  authentikAdminUserEmail: string;
  authentikLdapBaseDn: string;
  useAuthentikConfigFile: boolean;
  ipAddressType: 'ipv4' | 'dualstack';
  dockerImageLocation: 'Github' | 'Local ECR';
}

/**
 * Config parameters for LDAP stack
 */
export interface LdapParameters {
  gitSha: string;
  environment: string;
  envType: 'prod' | 'dev-test';
  enableExecute: boolean;
  sslCertificateArn: string;
  authentikHost: string;
  dockerImageLocation: 'Github' | 'Local ECR';
}

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

/**
 * Resolve Auth Infrastructure parameters from environment variables and CDK context
 * @param app - CDK App instance
 * @param stackName - The name of the stack
 * @param envType - The environment type (prod or dev-test)
 * @returns Resolved parameters for auth infrastructure stack
 */
export function resolveAuthInfraParameters(
  app: App,
  stackName: string,
  envType: 'prod' | 'dev-test'
): AuthInfraParameters {
  return {
    gitSha: getGitSha(),
    environment: stackName,
    envType: envType,
    enableExecute: app.node.tryGetContext('enableExecute') === 'true' || 
                   process.env.ENABLE_EXECUTE === 'true' || 
                   false,
    sslCertificateArn: app.node.tryGetContext('sslCertificateArn') || 
                       process.env.SSL_CERTIFICATE_ARN || 
                       '',
    authentikAdminUserEmail: app.node.tryGetContext('authentikAdminUserEmail') || 
                            process.env.AUTHENTIK_ADMIN_USER_EMAIL || 
                            '',
    authentikLdapBaseDn: app.node.tryGetContext('authentikLdapBaseDn') || 
                        process.env.AUTHENTIK_LDAP_BASE_DN || 
                        'DC=example,DC=com',
    useAuthentikConfigFile: app.node.tryGetContext('useAuthentikConfigFile') === 'true' || 
                           process.env.USE_AUTHENTIK_CONFIG_FILE === 'true' || 
                           false,
    ipAddressType: (app.node.tryGetContext('ipAddressType') || 
                   process.env.IP_ADDRESS_TYPE || 
                   'dualstack') as 'ipv4' | 'dualstack',
    dockerImageLocation: (app.node.tryGetContext('dockerImageLocation') || 
                        process.env.DOCKER_IMAGE_LOCATION || 
                        'Github') as 'Github' | 'Local ECR',
  };
}

/**
 * Resolve LDAP stack parameters from environment variables and CDK context
 * @param app - CDK App instance
 * @param stackName - The name of the stack
 * @param envType - The environment type (prod or dev-test)
 * @returns Resolved parameters for LDAP stack
 */
export function resolveLdapParameters(
  app: App,
  stackName: string,
  envType: 'prod' | 'dev-test'
): LdapParameters {
  return {
    gitSha: getGitSha(),
    environment: stackName,
    envType: envType,
    enableExecute: app.node.tryGetContext('enableExecute') === 'true' || 
                   process.env.ENABLE_EXECUTE === 'true' || 
                   false,
    sslCertificateArn: app.node.tryGetContext('sslCertificateArn') || 
                       process.env.SSL_CERTIFICATE_ARN || 
                       '',
    authentikHost: app.node.tryGetContext('authentikHost') || 
                  process.env.AUTHENTIK_HOST || 
                  '',
    dockerImageLocation: (app.node.tryGetContext('dockerImageLocation') || 
                        process.env.DOCKER_IMAGE_LOCATION || 
                        'Github') as 'Github' | 'Local ECR',
  };
}
