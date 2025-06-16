/**
 * Utility functions for the TAK Auth Infrastructure CDK project
 */

import { execSync } from 'child_process';

/**
 * Get the current git SHA for tagging resources
 * @returns Current git SHA or 'development' if unable to determine
 */
export function getGitSha(): string {
  try {
    // Get the full git SHA (not short version)
    return execSync('git rev-parse HEAD').toString().trim();
  } catch (error) {
    console.warn('Unable to get git SHA, using "development"');
    return 'development';
  }
}

/**
 * Validate environment type
 * @param envType Environment type to validate
 * @throws Error if envType is invalid
 */
export function validateEnvType(envType: string): void {
  if (envType !== 'prod' && envType !== 'dev-test') {
    throw new Error(`Invalid envType: ${envType}. Must be 'prod' or 'dev-test'`);
  }
}

/**
 * Validate required CDK context parameters
 * @param params Object containing parameters to validate
 */
export function validateRequiredParams(params: {
  stackName?: string;
  authentikAdminUserEmail?: string;
}): void {
  const { stackName, authentikAdminUserEmail } = params;

  if (!stackName) {
    throw new Error('stackName is required. Use --context stackName=YourStackName\n' +
      'This parameter is mandatory as it determines the correct CloudFormation export names\n' +
      'for importing VPC and other resources from the base infrastructure stack.\n' +
      'Examples: --context stackName=Demo (for TAK-Demo-BaseInfra exports)');
  }

  if (!authentikAdminUserEmail || authentikAdminUserEmail.trim() === '') {
    throw new Error('authentikAdminUserEmail is required. Use --context authentikAdminUserEmail=user@example.com');
  }
}
