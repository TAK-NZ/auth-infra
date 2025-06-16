/**
 * Environment-specific configuration objects and utilities
 * Pure configuration approach following reference template pattern
 */
import * as cdk from 'aws-cdk-lib';

/**
 * Environment-specific configuration for auth infrastructure resources
 */
export interface AuthInfraEnvironmentConfig {
  // Database configuration
  database: {
    instanceClass: string;
    instanceCount: number;
    backupRetentionDays: number;
    deletionProtection: boolean;
    enablePerformanceInsights: boolean;
    enableMonitoring: boolean;
  };
  
  // Redis configuration
  redis: {
    nodeType: string;
    numCacheClusters: number;
    automaticFailoverEnabled: boolean;
  };
  
  // ECS configuration
  ecs: {
    taskCpu: number;
    taskMemory: number;
    desiredCount: number;
    minCapacity: number;
    maxCapacity: number;
    workerDesiredCount?: number;
    workerMinCapacity?: number;
    workerMaxCapacity?: number;
  };
   // EFS configuration
  efs: {
    throughputMode: 'bursting' | 'provisioned';
    provisionedThroughput?: number;
  };

  // General infrastructure settings
  general: {
    removalPolicy: cdk.RemovalPolicy;
    enableDetailedLogging: boolean;
  };

  // Monitoring configuration
  monitoring: {
    enableCloudWatchAlarms: boolean;
    logRetentionDays: number;
  };
}

/**
 * Development/Test environment configuration
 * Optimized for cost and development workflow
 */
export const DEV_CONFIG: AuthInfraEnvironmentConfig = {
  database: {
    instanceClass: 'db.serverless',
    instanceCount: 1,
    backupRetentionDays: 1,
    deletionProtection: false,
    enablePerformanceInsights: false,
    enableMonitoring: false,
  },
  redis: {
    nodeType: 'cache.t4g.micro',
    numCacheClusters: 1,
    automaticFailoverEnabled: false,
  },
  ecs: {
    taskCpu: 512,
    taskMemory: 1024,
    desiredCount: 1,
    minCapacity: 1,
    maxCapacity: 3,
    workerDesiredCount: 1,
    workerMinCapacity: 1,
    workerMaxCapacity: 2,
  },
  efs: {
    throughputMode: 'bursting',
  },
  general: {
    removalPolicy: cdk.RemovalPolicy.DESTROY,
    enableDetailedLogging: true,
  },
  monitoring: {
    enableCloudWatchAlarms: false,
    logRetentionDays: 7,
  },
};

/**
 * Production environment configuration
 * Optimized for high availability, security, and production workloads
 */
export const PROD_CONFIG: AuthInfraEnvironmentConfig = {
  database: {
    instanceClass: 'db.t4g.large',
    instanceCount: 2,
    backupRetentionDays: 7,
    deletionProtection: true,
    enablePerformanceInsights: true,
    enableMonitoring: true,
  },
  redis: {
    nodeType: 'cache.t4g.small',
    numCacheClusters: 2,
    automaticFailoverEnabled: true,
  },
  ecs: {
    taskCpu: 1024,
    taskMemory: 2048,
    desiredCount: 2,
    minCapacity: 2,
    maxCapacity: 6,
    workerDesiredCount: 2,
    workerMinCapacity: 1,
    workerMaxCapacity: 4,
  },
  efs: {
    throughputMode: 'bursting',
  },
  general: {
    removalPolicy: cdk.RemovalPolicy.RETAIN,
    enableDetailedLogging: true,
  },
  monitoring: {
    enableCloudWatchAlarms: true,
    logRetentionDays: 30,
  },
};

/**
 * Get environment-specific configuration based on the provided environment type
 * @param envType - Environment type ('prod', 'dev-test', 'staging', etc.)
 * @returns Environment-specific configuration
 */
export function getEnvironmentConfig(envType: string): AuthInfraEnvironmentConfig {
  switch (envType) {
    case 'prod':
    case 'production':
      return PROD_CONFIG;
    case 'dev':
    case 'dev-test':
    case 'development':
    default:
      return DEV_CONFIG;
  }
}

/**
 * Merge environment config with custom overrides
 * Allows fine-grained control over individual settings
 */
export function mergeEnvironmentConfig(
  baseConfig: AuthInfraEnvironmentConfig,
  overrides: {
    database?: Partial<AuthInfraEnvironmentConfig['database']>;
    redis?: Partial<AuthInfraEnvironmentConfig['redis']>;
    ecs?: Partial<AuthInfraEnvironmentConfig['ecs']>;
    efs?: Partial<AuthInfraEnvironmentConfig['efs']>;
    general?: Partial<AuthInfraEnvironmentConfig['general']>;
    monitoring?: Partial<AuthInfraEnvironmentConfig['monitoring']>;
  }
): AuthInfraEnvironmentConfig {
  // Deep merge the configuration
  return {
    database: { ...baseConfig.database, ...overrides.database },
    redis: { ...baseConfig.redis, ...overrides.redis },
    ecs: { ...baseConfig.ecs, ...overrides.ecs },
    efs: { ...baseConfig.efs, ...overrides.efs },
    general: { ...baseConfig.general, ...overrides.general },
    monitoring: { ...baseConfig.monitoring, ...overrides.monitoring },
  };
}
