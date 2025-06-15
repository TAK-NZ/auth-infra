#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AuthInfraStack } from '../lib/auth-infra-stack';
import { createStackConfig } from '../lib/stack-config';

const app = new cdk.App();

// Read configuration from CDK context only (command line --context parameters)
const envType = app.node.tryGetContext('envType') || 'dev-test';
const stackName = app.node.tryGetContext('stackName');

// Validate envType
if (envType !== 'prod' && envType !== 'dev-test') {
  throw new Error(`Invalid envType: ${envType}. Must be 'prod' or 'dev-test'`);
}

// Validate required parameters
if (!stackName) {
  throw new Error('stackName is required. Use --context stackName=YourStackName');
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

// Create configuration
const config = createStackConfig(
  envType as 'prod' | 'dev-test',
  stackName,
  Object.keys(overrides).length > 0 ? overrides : undefined,
  'TAK', // Always use TAK as project prefix
  'AuthInfra'
);

// Create the stack with environment configuration for AWS API calls only
const resolvedStackName = `${config.projectName}-${stackName}-${config.componentName}`;
const stack = new AuthInfraStack(app, resolvedStackName, {
  stackConfig: config,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'ap-southeast-2',
  },
  description: 'TAK Authentication Layer - Authentik & LDAP',
});
