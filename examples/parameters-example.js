#!/usr/bin/env node

/**
 * Example demonstrating how to use the parameters utility
 * This file shows best practices for parameter management in the auth-infra project
 */

import { 
  getParameters,
  getLdapParameters,
  resolveAuthStackParameters,
  resolveLdapStackParameters,
  validateAuthParameters,
  validateLdapParameters,
  getSslCertificateArnImport,
  isProduction,
  getEnvironmentConfig,
  PARAMETER_DEFAULTS
} from '../lib/parameters.js';

console.log('=== Auth Infrastructure Parameters Example ===\n');

// Example 1: Get parameters from environment variables
console.log('1. Basic Parameters from Environment:');
const basicParams = getParameters();
console.log('   Environment:', basicParams.environment);
console.log('   Env Type:', basicParams.envType);
console.log('   Git SHA:', basicParams.gitSha);
console.log('   Enable Execute:', basicParams.enableExecute);
console.log();

// Example 2: Get LDAP-specific parameters
console.log('2. LDAP Parameters:');
const ldapParams = getLdapParameters();
console.log('   Environment:', ldapParams.environment);
console.log('   Env Type:', ldapParams.envType);
console.log('   Authentik Host:', ldapParams.authentikHost || '(not set)');
console.log();

// Example 3: Production detection
console.log('3. Environment Detection:');
console.log('   Is Production:', isProduction(basicParams.envType));
const envConfig = getEnvironmentConfig(basicParams.envType);
console.log('   Log Level:', envConfig.logLevel);
console.log('   Min Capacity:', envConfig.minCapacity);
console.log('   Max Capacity:', envConfig.maxCapacity);
console.log('   Debug Features:', envConfig.enableDebugFeatures);
console.log();

// Example 4: Parameter defaults
console.log('4. Parameter Defaults:');
console.log('   Default Env Type:', PARAMETER_DEFAULTS.ENV_TYPE);
console.log('   Default Stack Name:', PARAMETER_DEFAULTS.STACK_NAME);
console.log('   Default LDAP Base DN:', PARAMETER_DEFAULTS.AUTHENTIK_LDAP_BASE_DN);
console.log('   Default IP Address Type:', PARAMETER_DEFAULTS.IP_ADDRESS_TYPE);
console.log();

// Example 5: Parameter validation (would throw errors in real usage)
console.log('5. Parameter Validation:');
try {
  // This would throw an error if required parameters are missing
  // validateAuthParameters(basicParams);
  console.log('   Auth parameters validation: Would validate required fields');
} catch (error) {
  console.log('   Validation error:', error.message);
}

try {
  // validateLdapParameters(ldapParams);
  console.log('   LDAP parameters validation: Would validate required fields');
} catch (error) {
  console.log('   Validation error:', error.message);
}
console.log();

// Example 6: SSL Certificate ARN lookup
console.log('6. SSL Certificate ARN Lookup:');
const environment = 'MyFirstStack';
console.log('   Certificate ARN Import:', getSslCertificateArnImport(environment));
console.log('   Expected format: TAK-{env}-BaseInfra-CERTIFICATE-ARN');
console.log();

console.log('=== Usage in CDK Stacks ===\n');
console.log(`
// In your CDK stack constructor:
import { 
  resolveAuthStackParameters,
  resolveLdapStackParameters,
  validateAuthParameters,
  getSslCertificateArnReference,
  isProduction,
  getEnvironmentConfig 
} from './lib/parameters.js';

export class AuthInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    // Resolve parameters with cascading fallbacks
    const params = resolveAuthStackParameters(this);
    
    // Validate required parameters
    validateAuthParameters(params);
    
    // Get SSL certificate ARN from BaseInfra stack
    const sslCertificateArn = getSslCertificateArnReference(params.environment);
    
    // Get environment-specific configuration
    const envConfig = getEnvironmentConfig(params.envType);
    
    // Use parameters in constructs
    const authentik = new AuthentikConstruct(this, 'Authentik', {
      environment: params.environment,
      envType: params.envType,
      gitSha: params.gitSha,
      enableExecute: params.enableExecute,
      sslCertificateArn: sslCertificateArn,
      // ... other parameters
    });
  }
}

// Set parameters via:
// 1. CDK Context: --context environment=prod --context envType=prod
// 2. Environment variables: export ENVIRONMENT=prod ENV_TYPE=prod
// 3. Defaults: Automatically used if not set above
// 4. SSL Certificate: Automatically retrieved from BaseInfra stack
`);

console.log('=== Environment Variable Examples ===\n');
console.log('Set these environment variables for different configurations:\n');

console.log('Development:');
console.log('export ENVIRONMENT=MyFirstStack');
console.log('export ENV_TYPE=dev-test');
console.log('export ENABLE_EXECUTE=true');
console.log();

console.log('Production:');
console.log('export ENVIRONMENT=prod');
console.log('export ENV_TYPE=prod');
console.log('export ENABLE_EXECUTE=false');
console.log('export AUTHENTIK_ADMIN_USER_EMAIL="admin@company.com"');
console.log('# SSL Certificate ARN is automatically retrieved from BaseInfra stack');
console.log();
