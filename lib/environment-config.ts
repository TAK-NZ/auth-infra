/**
 * Environment-specific configuration objects and utilities
 */

/**
 * Environment Type
 */
export type EnvType = 'prod' | 'dev-test';

/**
 * Base Configuration interface for all environments
 */
export interface BaseConfig {
  envType: EnvType;
  isProd: boolean;
  // Database config
  dbInstanceClass: string;
  dbInstanceCount: number;
  dbBackupRetentionDays: number;
  // Redis config
  redisCacheNodeType: string;
  redisNumCacheClusters: number;
  // ECS config
  ecsTaskCpu: number;
  ecsTaskMemory: number;
  ecsTaskDesiredCount: number;
  // EFS config
  efsThroughputMode: 'bursting' | 'provisioned';
  efsProvisionedThroughput?: number;
  // Scaling
  minCapacity: number;
  maxCapacity: number;
}

/**
 * Production environment config
 */
export const prodConfig: BaseConfig = {
  envType: 'prod',
  isProd: true,
  // Database config
  dbInstanceClass: 'db.t4g.medium',
  dbInstanceCount: 2,
  dbBackupRetentionDays: 7,
  // Redis config
  redisCacheNodeType: 'cache.t4g.small',
  redisNumCacheClusters: 2,
  // ECS config
  ecsTaskCpu: 1024,
  ecsTaskMemory: 2048,
  ecsTaskDesiredCount: 2,
  // EFS config
  efsThroughputMode: 'bursting',
  // Scaling
  minCapacity: 2,
  maxCapacity: 6
};

/**
 * Development/Test environment config
 */
export const devTestConfig: BaseConfig = {
  envType: 'dev-test',
  isProd: false,
  // Database config
  dbInstanceClass: 'db.t4g.micro',
  dbInstanceCount: 1,
  dbBackupRetentionDays: 1,
  // Redis config
  redisCacheNodeType: 'cache.t4g.micro',
  redisNumCacheClusters: 1,
  // ECS config
  ecsTaskCpu: 512,
  ecsTaskMemory: 1024,
  ecsTaskDesiredCount: 1,
  // EFS config
  efsThroughputMode: 'bursting',
  // Scaling
  minCapacity: 1,
  maxCapacity: 3
};

/**
 * Get environment-specific configuration based on the provided environment type
 * @param envType - Environment type ('prod' or 'dev-test')
 * @returns Environment-specific configuration
 */
export function getEnvironmentConfig(envType: EnvType): BaseConfig {
  return envType === 'prod' ? prodConfig : devTestConfig;
}

/**
 * Merge environment config with overrides
 * @param envType - Environment type ('prod' or 'dev-test')
 * @param overrides - Optional configuration overrides
 * @returns Merged configuration
 */
export function mergeConfig(envType: EnvType, overrides?: Partial<BaseConfig>): BaseConfig {
  const baseConfig = getEnvironmentConfig(envType);
  return {
    ...baseConfig,
    ...(overrides || {})
  };
}
