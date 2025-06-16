/**
 * Configuration interface for AuthInfra stack template
 * This makes the stack reusable across different projects and environments
 */

import * as cdk from 'aws-cdk-lib';
import { AuthInfraEnvironmentConfig, getEnvironmentConfig, mergeEnvironmentConfig } from './environment-config';

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
 * Complete configuration result from createStackConfig
 */
export interface AuthInfraConfigResult {
  stackConfig: AuthInfraConfig;
  environmentConfig: AuthInfraEnvironmentConfig;
  computedValues: {
    enableHighAvailability: boolean;
    enableDetailedMonitoring: boolean;
    desiredContainerCount: number;
    environmentLabel: string;
  };
}

/**
 * Factory function to create complete stack configuration
 * This function consolidates all configuration logic and eliminates redundancy
 */
export function createStackConfig(
  envType: 'prod' | 'dev-test',
  stackName: string,
  overrides?: AuthInfraConfig['overrides'],
  projectName: string = 'TAK',
  componentName: string = 'AuthInfra'
): AuthInfraConfigResult {
  // Validate required parameters
  if (!stackName || stackName.trim() === '') {
    throw new Error('stackName is required and cannot be empty');
  }
  
  if (!['prod', 'dev-test'].includes(envType)) {
    throw new Error('Environment type must be one of: prod, dev-test');
  }

  // Create basic stack config
  const stackConfig: AuthInfraConfig = {
    projectName,
    componentName,
    envType,
    stackName,
    overrides,
  };

  // Get environment-specific defaults
  const envDefaults = envType === 'prod' ? 
    { enableHighAvailability: true, enableDetailedMonitoring: true } :
    { enableHighAvailability: false, enableDetailedMonitoring: false };
  
  const enableHighAvailability = envDefaults.enableHighAvailability;
  const enableDetailedMonitoring = overrides?.general?.enableDetailedLogging ?? envDefaults.enableDetailedMonitoring;
  
  // Load and merge environment configuration
  const baseConfig = getEnvironmentConfig(envType);
  const mergedConfig = overrides ? 
    mergeEnvironmentConfig(baseConfig, overrides) : 
    baseConfig;
  
  // Set container counts based on high availability setting
  // enableHighAvailability=true: 2 containers (Server, Worker, LDAP)
  // enableHighAvailability=false: 1 container each
  const desiredContainerCount = enableHighAvailability ? 2 : 1;
  
  // Override container counts in merged config unless explicitly set via context
  if (!overrides?.ecs?.desiredCount) {
    mergedConfig.ecs.desiredCount = desiredContainerCount;
  }
  if (!overrides?.ecs?.workerDesiredCount) {
    mergedConfig.ecs.workerDesiredCount = desiredContainerCount;
  }

  // Create environment label
  const environmentLabel = envType === 'prod' ? 'Prod' : 'Dev-Test';

  return {
    stackConfig,
    environmentConfig: mergedConfig,
    computedValues: {
      enableHighAvailability,
      enableDetailedMonitoring,
      desiredContainerCount,
      environmentLabel,
    },
  };
}

/**
 * Factory function to create stack configuration (deprecated - use createStackConfig)
 * @deprecated Use createStackConfig instead for complete configuration
 */
export function createStackConfigLegacy(
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
