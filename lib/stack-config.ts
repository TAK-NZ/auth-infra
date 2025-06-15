/**
 * Configuration interface for AuthInfra stack template
 * This makes the stack reusable across different projects and environments
 */

import * as cdk from 'aws-cdk-lib';

export interface AuthInfraConfig {
  // Stack identification
  projectName: string;
  componentName: string;
  
  // Environment configuration
  envType: 'prod' | 'dev-test';
  
  // Required parameters
  stackName: string;
  
  // Optional overrides
  overrides?: {
    database?: {
      instanceClass?: string;
      instanceCount?: number;
      backupRetentionDays?: number;
      deletionProtection?: boolean;
      enablePerformanceInsights?: boolean;
      enableMonitoring?: boolean;
    };
    redis?: {
      nodeType?: string;
      numCacheClusters?: number;
      automaticFailoverEnabled?: boolean;
    };
    ecs?: {
      taskCpu?: number;
      taskMemory?: number;
      desiredCount?: number;
      minCapacity?: number;
      maxCapacity?: number;
      workerDesiredCount?: number;
      workerMinCapacity?: number;
      workerMaxCapacity?: number;
    };
    efs?: {
      throughputMode?: 'bursting' | 'provisioned';
      provisionedThroughput?: number;
    };
    general?: {
      enableDetailedLogging?: boolean;
      removalPolicy?: cdk.RemovalPolicy;
    };
    monitoring?: {
      enableCloudWatchAlarms?: boolean;
      logRetentionDays?: number;
    };
  };
}

/**
 * Factory function to create stack configuration
 */
export function createStackConfig(
  envType: 'prod' | 'dev-test',
  stackName: string,
  overrides?: AuthInfraConfig['overrides'],
  projectName: string = 'TAK',
  componentName: string = 'AuthInfra'
): AuthInfraConfig {
  // Validate required parameters
  if (!stackName || stackName.trim() === '') {
    throw new Error('stackName is required and cannot be empty');
  }
  
  if (!['prod', 'dev-test'].includes(envType)) {
    throw new Error('Environment type must be one of: prod, dev-test');
  }
  
  return {
    projectName,
    componentName,
    envType,
    stackName,
    overrides,
  };
}

/**
 * Config validator utility
 */
export class ConfigValidator {
  static validate(config: AuthInfraConfig): void {
    if (!config.stackName || config.stackName.trim() === '') {
      throw new Error('stackName is required and cannot be empty');
    }
    
    if (!['prod', 'dev-test'].includes(config.envType)) {
      throw new Error('Environment type must be one of: prod, dev-test');
    }
    
    if (!config.projectName || config.projectName.trim() === '') {
      throw new Error('projectName is required and cannot be empty');
    }
    
    if (!config.componentName || config.componentName.trim() === '') {
      throw new Error('componentName is required and cannot be empty');
    }
  }
}
