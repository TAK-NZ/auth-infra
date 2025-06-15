#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import { AuthInfraStack } from './lib/auth-infra-stack.js';

const app = new cdk.App();
app.node.setContext('authentikAdminUserEmail', 'admin@example.com');

const stack = new AuthInfraStack(app, 'DebugStack', {
  environment: 'test',
  envType: 'dev-test',
});

const template = app.synth().getStackByName('DebugStack').template;

console.log('=== STACK OUTPUTS ===');
if (template.Outputs) {
  console.log(JSON.stringify(template.Outputs, null, 2));
} else {
  console.log('No outputs found in template');
}

console.log('\n=== LOOKING FOR AUTHENTIK OUTPUTS ===');
const keys = Object.keys(template.Outputs || {});
const authentikOutputs = keys.filter(key => key.toLowerCase().includes('authentik'));
console.log('Authentik-related outputs:', authentikOutputs);

console.log('\n=== ALL OUTPUT KEYS ===');
console.log(keys);
