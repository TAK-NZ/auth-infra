#!/usr/bin/env node
import 'source-map-support/register.js';
import * as cdk from 'aws-cdk-lib';
import { AuthInfraStack } from '../lib/auth-infra-stack';
import { LdapStack } from '../lib/ldap-stack';
import { 
  generateAuthInfraStackName,
  generateLdapStackName,
  FIXED_STACK_CONFIG
} from '../lib/stack-naming';

const app = new cdk.App();

// Read project tag with cascading priority (following base-infra pattern)
const projectTag = process.env.PROJECT || 
                   app.node.tryGetContext('project') || 
                   FIXED_STACK_CONFIG.PROJECT;

const stackName = app.node.tryGetContext('stackName') || 
                   process.env.STACK_NAME || 
                   'MyFirstStack';

const envType = app.node.tryGetContext('envType') || 
               process.env.ENV_TYPE || 
               (stackName === 'prod' ? 'prod' : 'dev-test');

// Generate consistent stack names using the naming utility
const authStackName = generateAuthInfraStackName(stackName);
const ldapStackName = generateLdapStackName(stackName);

// Tag every resource in the stack with the project name (following base-infra pattern)
cdk.Tags.of(app).add("Project", projectTag);

// Deploy main auth infrastructure stack
const authStack = new AuthInfraStack(app, authStackName, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  stackName,
  envType: envType as 'prod' | 'dev-test',
  description: 'TAK Authentication Layer - Authentik',
});

// Deploy LDAP outpost stack (depends on auth stack)
const ldapStack = new LdapStack(app, ldapStackName, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  stackName,
  envType: envType as 'prod' | 'dev-test',
  description: 'TAK Authentication Layer - LDAP Outpost',
});

// Add dependency to ensure auth stack deploys before LDAP stack
ldapStack.addDependency(authStack);
