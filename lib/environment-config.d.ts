/**
 * Environment-specific configuration for auth infrastructure resources
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
        workerDesiredCount?: number;
        workerMinCapacity?: number;
        workerMaxCapacity?: number;
    };
    efs: {
        throughputMode: 'bursting' | 'provisioned';
        provisionedThroughput?: number;
        removalPolicy: cdk.RemovalPolicy;
    };
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
 * Development/Test environment configuration
 * Optimized for cost and development workflow
 */
export declare const DEV_TEST_CONFIG: AuthInfraEnvironmentConfig;
/**
 * Production environment configuration
 * Optimized for high availability, security, and production workloads
 */
export declare const PROD_CONFIG: AuthInfraEnvironmentConfig;
/**
 * Get environment configuration based on environment type
 */
export declare function getEnvironmentConfig(envType: string): AuthInfraEnvironmentConfig;
/**
 * Merge environment config with custom overrides
 * Allows fine-grained control over individual settings
 */
export declare function mergeEnvironmentConfig(baseConfig: AuthInfraEnvironmentConfig, overrides: {
    database?: Partial<AuthInfraEnvironmentConfig['database']>;
    redis?: Partial<AuthInfraEnvironmentConfig['redis']>;
    ecs?: Partial<AuthInfraEnvironmentConfig['ecs']>;
    efs?: Partial<AuthInfraEnvironmentConfig['efs']>;
    general?: Partial<AuthInfraEnvironmentConfig['general']>;
    monitoring?: Partial<AuthInfraEnvironmentConfig['monitoring']>;
}): AuthInfraEnvironmentConfig;
