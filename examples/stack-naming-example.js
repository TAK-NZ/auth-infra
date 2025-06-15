#!/usr/bin/env node

/**
 * Example demonstrating how to use the stack naming utility
 * This file is for documentation purposes and shows best practices
 */

import { 
  generateAuthInfraStackName,
  generateLdapStackName,
  createBaseImportValue,
  createAuthImportValue,
  generateExportName,
  BASE_EXPORT_NAMES,
  AUTH_EXPORT_NAMES,
  FIXED_STACK_CONFIG
} from '../lib/stack-naming.js';

console.log('=== Stack Naming Utility Examples ===\n');

// Example 1: Generate stack names
console.log('1. Generating Stack Names:');
const environment = 'dev';
const authStackName = generateAuthInfraStackName(environment);
const ldapStackName = generateLdapStackName(environment);

console.log(`   Auth Stack: ${authStackName}`);
console.log(`   LDAP Stack: ${ldapStackName}`);
console.log();

// Example 2: Create import values for base infrastructure
console.log('2. Base Infrastructure Import Values:');
console.log(`   VPC ID: ${createBaseImportValue(environment, BASE_EXPORT_NAMES.VPC_ID)}`);
console.log(`   Private Subnet A: ${createBaseImportValue(environment, BASE_EXPORT_NAMES.SUBNET_PRIVATE_A)}`);
console.log(`   KMS Key: ${createBaseImportValue(environment, BASE_EXPORT_NAMES.KMS_KEY)}`);
console.log();

// Example 3: Create import values for auth infrastructure
console.log('3. Auth Infrastructure Import Values:');
console.log(`   Authentik URL: ${createAuthImportValue(environment, AUTH_EXPORT_NAMES.AUTHENTIK_URL)}`);
console.log(`   LDAP Token ARN: ${createAuthImportValue(environment, AUTH_EXPORT_NAMES.AUTHENTIK_LDAP_TOKEN_ARN)}`);
console.log();

// Example 4: Generate export names
console.log('4. Export Name Generation:');
console.log(`   Custom Export: ${generateExportName(authStackName, 'custom-resource')}`);
console.log(`   DB Secret: ${generateExportName(authStackName, AUTH_EXPORT_NAMES.DB_SECRET_ARN)}`);
console.log();

// Example 5: Configuration
console.log('5. Stack Configuration:');
console.log(`   Project: ${FIXED_STACK_CONFIG.PROJECT}`);
console.log(`   Component: ${FIXED_STACK_CONFIG.COMPONENT}`);
console.log();

console.log('=== Usage in CDK Code ===\n');
console.log(`
// In your CDK stack constructor:
import { 
  createBaseImportValue, 
  createAuthImportValue,
  BASE_EXPORT_NAMES,
  AUTH_EXPORT_NAMES 
} from './lib/stack-naming.js';

// Import VPC from base infrastructure
const vpcId = cdk.Fn.importValue(
  createBaseImportValue(props.environment, BASE_EXPORT_NAMES.VPC_ID)
);

// Import LDAP token from auth stack
const ldapToken = cdk.Fn.importValue(
  createAuthImportValue(props.environment, AUTH_EXPORT_NAMES.AUTHENTIK_LDAP_TOKEN_ARN)
);

// Create an export
new cdk.CfnOutput(this, 'MyResource', {
  exportName: generateExportName(this.stackName, 'my-resource'),
  value: myResource.arn
});
`);
