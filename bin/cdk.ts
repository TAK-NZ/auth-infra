#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AuthInfraStack } from '../lib/auth-infra-stack';
import { createStackConfig } from '../lib/stack-config';

const app = new cdk.App();

// Read configuration from CDK context only (command line --context parameters)
const ProjectName = app.node.tryGetContext('project');
const customStackName = app.node.tryGetContext('stackName');
const envType = app.node.tryGetContext('envType') || 'dev-test';
const authentikAdminUserEmail = app.node.tryGetContext('authentikAdminUserEmail');

// Validate envType
if (envType !== 'prod' && envType !== 'dev-test') {
  throw new Error(`Invalid envType: ${envType}. Must be 'prod' or 'dev-test'`);
}

// Validate required parameters
if (!customStackName) {
  throw new Error('stackName is required. Use --context stackName=YourStackName\n' +
    'This parameter is mandatory as it determines the correct CloudFormation export names\n' +
    'for importing VPC and other resources from the base infrastructure stack.\n' +
    'Examples: --context stackName=Demo (for TAK-Demo-BaseInfra exports)');
}

if (!authentikAdminUserEmail || authentikAdminUserEmail.trim() === '') {
  throw new Error('authentikAdminUserEmail is required. Use --context authentikAdminUserEmail=user@example.com');
}

// Read optional context overrides
const overrides = {
  ...(app.node.tryGetContext('dbInstanceClass') && {
    database: { instanceClass: app.node.tryGetContext('dbInstanceClass') }
  }),
  ...(app.node.tryGetContext('dbInstanceCount') && {
    database: { instanceCount: parseInt(app.node.tryGetContext('dbInstanceCount'), 10) }
  }),
  ...(app.node.tryGetContext('redisNodeType') && {
    redis: { nodeType: app.node.tryGetContext('redisNodeType') }
  }),
  ...(app.node.tryGetContext('ecsTaskCpu') && {
    ecs: { taskCpu: parseInt(app.node.tryGetContext('ecsTaskCpu'), 10) }
  }),
  ...(app.node.tryGetContext('ecsTaskMemory') && {
    ecs: { taskMemory: parseInt(app.node.tryGetContext('ecsTaskMemory'), 10) }
  }),
  ...(app.node.tryGetContext('enableDetailedLogging') !== undefined && {
    general: { enableDetailedLogging: app.node.tryGetContext('enableDetailedLogging') === 'true' }
  }),
};

// Create the stack name early so we can use it in configuration
const environmentName = customStackName || 'Dev';
const stackName = `TAK-${environmentName}-AuthInfra`; // Always use TAK prefix

// Create configuration
const config = createStackConfig(
  envType as 'prod' | 'dev-test',
  customStackName,
  Object.keys(overrides).length > 0 ? overrides : undefined,
  'TAK', // Always use TAK as project prefix
  'AuthInfra'
);

// Create the stack with environment configuration for AWS API calls only
const stack = new AuthInfraStack(app, stackName, {
  stackConfig: config,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'ap-southeast-2',
  },
  tags: {
    Project: ProjectName || 'TAK',
    'Environment Name': environmentName,
    Component: 'AuthInfra',
    ManagedBy: 'CDK',    
  }
});
