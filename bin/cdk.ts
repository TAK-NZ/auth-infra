#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AuthInfraStack } from '../lib/auth-infra-stack';
import { createStackConfig } from '../lib/stack-config';
import { getGitSha, validateEnvType, validateRequiredParams } from '../lib/utils';

const app = new cdk.App();

// Read configuration from CDK context only (command line --context parameters)
const ProjectName = app.node.tryGetContext('project');
const customStackName = app.node.tryGetContext('stackName');
const envType = app.node.tryGetContext('envType') || 'dev-test';
const authentikAdminUserEmail = app.node.tryGetContext('authentikAdminUserEmail');

// Calculate Git SHA for ECR image tagging
const gitSha = app.node.tryGetContext('gitSha') || getGitSha();

// Validate parameters
validateEnvType(envType);
validateRequiredParams({
  stackName: customStackName,
  authentikAdminUserEmail
});

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
const stackName = `TAK-${customStackName}-AuthInfra`; // Always use TAK prefix

// Set calculated values in CDK context for the stack to use
app.node.setContext('calculatedGitSha', gitSha);
app.node.setContext('validatedAuthentikAdminUserEmail', authentikAdminUserEmail);

// Create configuration
const configResult = createStackConfig(
  envType as 'prod' | 'dev-test',
  customStackName,
  Object.keys(overrides).length > 0 ? overrides : undefined,
  'TAK', // Always use TAK as project prefix
  'AuthInfra'
);

// Create the stack with environment configuration for AWS API calls only
const stack = new AuthInfraStack(app, stackName, {
  configResult: configResult,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'ap-southeast-2',
  },
  tags: {
    Project: ProjectName || 'TAK',
    Environment: customStackName,
    Component: 'AuthInfra',
    ManagedBy: 'CDK',    
  }
});
