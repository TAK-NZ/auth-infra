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
    dbInstanceClass: string;
    dbInstanceCount: number;
    dbBackupRetentionDays: number;
    redisCacheNodeType: string;
    redisNumCacheClusters: number;
    ecsTaskCpu: number;
    ecsTaskMemory: number;
    ecsTaskDesiredCount: number;
    efsThroughputMode: 'bursting' | 'provisioned';
    efsProvisionedThroughput?: number;
    minCapacity: number;
    maxCapacity: number;
}
/**
 * Production environment config
 */
export declare const prodConfig: BaseConfig;
/**
 * Development/Test environment config
 */
export declare const devTestConfig: BaseConfig;
/**
 * Get environment-specific configuration based on the provided environment type
 * @param envType - Environment type ('prod' or 'dev-test')
 * @returns Environment-specific configuration
 */
export declare function getEnvironmentConfig(envType: EnvType): BaseConfig;
/**
 * Merge environment config with overrides
 * @param envType - Environment type ('prod' or 'dev-test')
 * @param overrides - Optional configuration overrides
 * @returns Merged configuration
 */
export declare function mergeConfig(envType: EnvType, overrides?: Partial<BaseConfig>): BaseConfig;
