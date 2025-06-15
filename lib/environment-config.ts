/**
 * Environment-specific configuration objects and utilities
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
  };
  
  // EFS configuration
  efs: {
    throughputMode: 'bursting' | 'provisioned';
    provisionedThroughput?: number;
  };
  
  // Legacy property mappings for backward compatibility
  isProd: boolean;
  dbInstanceClass: string;
  dbInstanceCount: number;
  dbBackupRetentionDays: number;
  ecsTaskCpu: number;
  ecsTaskMemory: number;
  ecsTaskDesiredCount: number;
  redisCacheNodeType: string;
  redisNumCacheClusters: number;
  minCapacity: number;
  maxCapacity: number;
  
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
 * Alias for backward compatibility
 */
export type BaseConfig = AuthInfraEnvironmentConfig;

/**
 * Development/Test environment configuration
 * Optimized for cost and development workflow
 */
export const DEV_CONFIG: AuthInfraEnvironmentConfig = {
  database: {
    instanceClass: 'db.t4g.micro',
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
  // Legacy properties for backward compatibility
  isProd: false,
  dbInstanceClass: 'db.t4g.micro',
  dbInstanceCount: 1,
  dbBackupRetentionDays: 1,
  ecsTaskCpu: 512,
  ecsTaskMemory: 1024,
  ecsTaskDesiredCount: 1,
  redisCacheNodeType: 'cache.t4g.micro',
  redisNumCacheClusters: 1,
  minCapacity: 1,
  maxCapacity: 3,
};

/**
 * Production environment configuration
 * Optimized for high availability, security, and production workloads
 */
export const PROD_CONFIG: AuthInfraEnvironmentConfig = {
  database: {
    instanceClass: 'db.t4g.small',
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
  // Legacy properties for backward compatibility
  isProd: true,
  dbInstanceClass: 'db.t4g.small',
  dbInstanceCount: 2,
  dbBackupRetentionDays: 7,
  ecsTaskCpu: 1024,
  ecsTaskMemory: 2048,
  ecsTaskDesiredCount: 2,
  redisCacheNodeType: 'cache.t4g.small',
  redisNumCacheClusters: 2,
  minCapacity: 2,
  maxCapacity: 6,
};

/**
 * Staging environment configuration (inherits from prod with some optimizations)
 */
export const STAGING_CONFIG: AuthInfraEnvironmentConfig = {
  ...PROD_CONFIG,
  database: {
    ...PROD_CONFIG.database,
    instanceCount: 1,
    backupRetentionDays: 3,
  },
  ecs: {
    ...PROD_CONFIG.ecs,
    desiredCount: 1,
    maxCapacity: 4,
  },
  general: {
    ...PROD_CONFIG.general,
    removalPolicy: cdk.RemovalPolicy.RETAIN, // Keep staging data for troubleshooting
  },
  // Override legacy properties for staging
  dbInstanceCount: 1,
  dbBackupRetentionDays: 3,
  ecsTaskDesiredCount: 1,
  maxCapacity: 4,
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
    case 'staging':
    case 'stage':
      return STAGING_CONFIG;
    case 'dev':
    case 'dev-test':
    case 'development':
    default:
      return DEV_CONFIG;
  }
}

/**
 * Merge environment config with overrides
 * @param envType - Environment type
 * @param overrides - Configuration overrides
 * @returns Merged configuration
 */
export function mergeEnvironmentConfig(
  envType: string, 
  overrides: Partial<AuthInfraEnvironmentConfig>
): AuthInfraEnvironmentConfig {
  const baseConfig = getEnvironmentConfig(envType);
  
  // Deep merge the configuration
  return {
    database: { ...baseConfig.database, ...overrides.database },
    redis: { ...baseConfig.redis, ...overrides.redis },
    ecs: { ...baseConfig.ecs, ...overrides.ecs },
    efs: { ...baseConfig.efs, ...overrides.efs },
    general: { ...baseConfig.general, ...overrides.general },
    monitoring: { ...baseConfig.monitoring, ...overrides.monitoring },
    // Legacy properties
    isProd: baseConfig.isProd,
    dbInstanceClass: baseConfig.dbInstanceClass,
    dbInstanceCount: baseConfig.dbInstanceCount,
    dbBackupRetentionDays: baseConfig.dbBackupRetentionDays,
    ecsTaskCpu: baseConfig.ecsTaskCpu,
    ecsTaskMemory: baseConfig.ecsTaskMemory,
    ecsTaskDesiredCount: baseConfig.ecsTaskDesiredCount,
    redisCacheNodeType: baseConfig.redisCacheNodeType,
    redisNumCacheClusters: baseConfig.redisNumCacheClusters,
    minCapacity: baseConfig.minCapacity,
    maxCapacity: baseConfig.maxCapacity,
  };
}
