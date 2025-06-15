/**
 * Environment-specific configuration objects and utilities
 */
import * as cdk from 'aws-cdk-lib';
/**
 * Environment-specific configuration for auth infrastructure resources
 */
export interface AuthInfraEnvironmentConfig {
    database: {
        instanceClass: string;
        instanceCount: number;
        backupRetentionDays: number;
        deletionProtection: boolean;
        enablePerformanceInsights: boolean;
        enableMonitoring: boolean;
    };
    redis: {
        nodeType: string;
        numCacheClusters: number;
        automaticFailoverEnabled: boolean;
    };
    ecs: {
        taskCpu: number;
        taskMemory: number;
        desiredCount: number;
        minCapacity: number;
        maxCapacity: number;
    };
    efs: {
        throughputMode: 'bursting' | 'provisioned';
        provisionedThroughput?: number;
    };
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
    general: {
        removalPolicy: cdk.RemovalPolicy;
        enableDetailedLogging: boolean;
    };
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
export declare const DEV_CONFIG: AuthInfraEnvironmentConfig;
/**
 * Production environment configuration
 * Optimized for high availability, security, and production workloads
 */
export declare const PROD_CONFIG: AuthInfraEnvironmentConfig;
/**
 * Staging environment configuration (inherits from prod with some optimizations)
 */
export declare const STAGING_CONFIG: AuthInfraEnvironmentConfig;
/**
 * Get environment-specific configuration based on the provided environment type
 * @param envType - Environment type ('prod', 'dev-test', 'staging', etc.)
 * @returns Environment-specific configuration
 */
export declare function getEnvironmentConfig(envType: string): AuthInfraEnvironmentConfig;
/**
 * Merge environment config with overrides
 * @param envType - Environment type
 * @param overrides - Configuration overrides
 * @returns Merged configuration
 */
export declare function mergeEnvironmentConfig(envType: string, overrides: Partial<AuthInfraEnvironmentConfig>): AuthInfraEnvironmentConfig;
