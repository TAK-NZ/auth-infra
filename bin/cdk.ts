#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AuthInfraStack } from '../lib/auth-infra-stack';
import { generateStackName, FIXED_STACK_CONFIG } from '../lib/stack-naming';

const app = new cdk.App();

// Read project tag with cascading priority:
// Priority: 1. Environment Variables, 2. CLI Context, 3. Defaults
const projectTag = process.env.PROJECT || 
                   app.node.tryGetContext('project') || 
                   FIXED_STACK_CONFIG.PROJECT;

const envType = process.env.ENV_TYPE || 
               app.node.tryGetContext('envType') || 
               'dev-test';

const stackNameSuffix = process.env.STACK_NAME || 
                       app.node.tryGetContext('stackName') || 
                       'MyFirstStack';

// Generate consistent stack name using the utility function
const stackName = generateStackName({
  project: FIXED_STACK_CONFIG.PROJECT,
  environment: stackNameSuffix,
  component: FIXED_STACK_CONFIG.COMPONENT
});

// Tag every resource in the stack with the project name
cdk.Tags.of(app).add("Project", projectTag);

// Deploy main auth infrastructure stack (contains both Authentik and LDAP)
new AuthInfraStack(app, stackName, {
  envType: envType as 'prod' | 'dev-test',
  
  // Environment can be resolved from AWS profile or environment variables
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT || process.env.CDK_DEPLOY_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || process.env.CDK_DEPLOY_REGION || 'ap-southeast-2'
  },
  
  description: 'TAK Authentication Layer - Authentik & LDAP',
});
