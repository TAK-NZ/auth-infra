#!/usr/bin/env node

/**
 * Example demonstrating how to use the stack naming utility
 * This file is for documentation purposes and shows best practices
 */

import { 
  createBaseImportValue,
  createAuthImportValue,
  BASE_EXPORT_NAMES,
} from '../lib/cloudformation-imports.js';

import {
  AUTH_EXPORT_NAMES,
  createDynamicExportName
} from '../lib/cloudformation-exports.js';

console.log('=== CloudFormation Import/Export Utility Examples ===\n');

// Example 1: Create import values for base infrastructure  
console.log('1. Base Infrastructure Import Values:');
const environment = 'dev';
console.log(`   VPC ID: ${createBaseImportValue(environment, BASE_EXPORT_NAMES.VPC_ID)}`);
console.log(`   Private Subnet A: ${createBaseImportValue(environment, BASE_EXPORT_NAMES.SUBNET_PRIVATE_A)}`);
console.log(`   KMS Key: ${createBaseImportValue(environment, BASE_EXPORT_NAMES.KMS_KEY)}`);
console.log();

// Example 2: Create import values for auth infrastructure
console.log('2. Auth Infrastructure Import Values:');
console.log(`   Authentik URL: ${createAuthImportValue(environment, AUTH_EXPORT_NAMES.AUTHENTIK_URL)}`);
console.log(`   LDAP Token ARN: ${createAuthImportValue(environment, AUTH_EXPORT_NAMES.AUTHENTIK_LDAP_TOKEN_ARN)}`);
console.log();

// Example 3: Generate export name templates
console.log('3. Export Name Template Generation:');
console.log(`   Database Endpoint: ${createDynamicExportName(AUTH_EXPORT_NAMES.DATABASE_ENDPOINT)}`);
console.log(`   Authentik URL: ${createDynamicExportName(AUTH_EXPORT_NAMES.AUTHENTIK_URL)}`);
console.log();

console.log('=== Usage in CDK Code ===\n');
console.log(`
// In your CDK stack constructor:
import { 
  createBaseImportValue, 
  BASE_EXPORT_NAMES
} from './lib/cloudformation-imports.js';

import { 
  createAuthImportValue,
  AUTH_EXPORT_NAMES,
  createDynamicExportName 
} from './lib/cloudformation-exports.js';

// Import VPC from base infrastructure
const vpcId = cdk.Fn.importValue(
  createBaseImportValue(props.environment, BASE_EXPORT_NAMES.VPC_ID)
);

// Import LDAP token from auth stack (cross-stack reference)
const ldapToken = cdk.Fn.importValue(
  createAuthImportValue(props.environment, AUTH_EXPORT_NAMES.AUTHENTIK_LDAP_TOKEN_ARN)
);

// Create a dynamic export using Fn::Sub
new cdk.CfnOutput(this, 'DatabaseEndpoint', {
  exportName: cdk.Fn.sub(createDynamicExportName(AUTH_EXPORT_NAMES.DATABASE_ENDPOINT), {
    StackName: this.stackName
  }),
  value: database.instanceEndpoint.hostname
});
`);
