"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.STAGING_CONFIG = exports.PROD_CONFIG = exports.DEV_CONFIG = void 0;
exports.getEnvironmentConfig = getEnvironmentConfig;
exports.mergeEnvironmentConfig = mergeEnvironmentConfig;
/**
 * Environment-specific configuration objects and utilities
 */
const cdk = __importStar(require("aws-cdk-lib"));
/**
 * Development/Test environment configuration
 * Optimized for cost and development workflow
 */
exports.DEV_CONFIG = {
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
exports.PROD_CONFIG = {
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
exports.STAGING_CONFIG = {
    ...exports.PROD_CONFIG,
    database: {
        ...exports.PROD_CONFIG.database,
        instanceCount: 1,
        backupRetentionDays: 3,
    },
    ecs: {
        ...exports.PROD_CONFIG.ecs,
        desiredCount: 1,
        maxCapacity: 4,
    },
    general: {
        ...exports.PROD_CONFIG.general,
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
function getEnvironmentConfig(envType) {
    switch (envType) {
        case 'prod':
        case 'production':
            return exports.PROD_CONFIG;
        case 'staging':
        case 'stage':
            return exports.STAGING_CONFIG;
        case 'dev':
        case 'dev-test':
        case 'development':
        default:
            return exports.DEV_CONFIG;
    }
}
/**
 * Merge environment config with overrides
 * @param envType - Environment type
 * @param overrides - Configuration overrides
 * @returns Merged configuration
 */
function mergeEnvironmentConfig(envType, overrides) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW52aXJvbm1lbnQtY29uZmlnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZW52aXJvbm1lbnQtY29uZmlnLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBMk1BLG9EQWNDO0FBUUQsd0RBMkJDO0FBNVBEOztHQUVHO0FBQ0gsaURBQW1DO0FBcUVuQzs7O0dBR0c7QUFDVSxRQUFBLFVBQVUsR0FBK0I7SUFDcEQsUUFBUSxFQUFFO1FBQ1IsYUFBYSxFQUFFLGNBQWM7UUFDN0IsYUFBYSxFQUFFLENBQUM7UUFDaEIsbUJBQW1CLEVBQUUsQ0FBQztRQUN0QixrQkFBa0IsRUFBRSxLQUFLO1FBQ3pCLHlCQUF5QixFQUFFLEtBQUs7UUFDaEMsZ0JBQWdCLEVBQUUsS0FBSztLQUN4QjtJQUNELEtBQUssRUFBRTtRQUNMLFFBQVEsRUFBRSxpQkFBaUI7UUFDM0IsZ0JBQWdCLEVBQUUsQ0FBQztRQUNuQix3QkFBd0IsRUFBRSxLQUFLO0tBQ2hDO0lBQ0QsR0FBRyxFQUFFO1FBQ0gsT0FBTyxFQUFFLEdBQUc7UUFDWixVQUFVLEVBQUUsSUFBSTtRQUNoQixZQUFZLEVBQUUsQ0FBQztRQUNmLFdBQVcsRUFBRSxDQUFDO1FBQ2QsV0FBVyxFQUFFLENBQUM7S0FDZjtJQUNELEdBQUcsRUFBRTtRQUNILGNBQWMsRUFBRSxVQUFVO0tBQzNCO0lBQ0QsT0FBTyxFQUFFO1FBQ1AsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztRQUN4QyxxQkFBcUIsRUFBRSxJQUFJO0tBQzVCO0lBQ0QsVUFBVSxFQUFFO1FBQ1Ysc0JBQXNCLEVBQUUsS0FBSztRQUM3QixnQkFBZ0IsRUFBRSxDQUFDO0tBQ3BCO0lBQ0QsK0NBQStDO0lBQy9DLE1BQU0sRUFBRSxLQUFLO0lBQ2IsZUFBZSxFQUFFLGNBQWM7SUFDL0IsZUFBZSxFQUFFLENBQUM7SUFDbEIscUJBQXFCLEVBQUUsQ0FBQztJQUN4QixVQUFVLEVBQUUsR0FB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ZW50LXNwZWNpZmljIGNvbmZpZ3VyYXRpb24gb2JqZWN0cyBhbmQgdXRpbGl0aWVzXG4gKi9cbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5cbi8qKlxuICogRW52aXJvbm1lbnQtc3BlY2lmaWMgY29uZmlndXJhdGlvbiBmb3IgYXV0aCBpbmZyYXN0cnVjdHVyZSByZXNvdXJjZXNcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZyB7XG4gIC8vIERhdGFiYXNlIGNvbmZpZ3VyYXRpb25cbiAgZGF0YWJhc2U6IHtcbiAgICBpbnN0YW5jZUNsYXNzOiBzdHJpbmc7XG4gICAgaW5zdGFuY2VDb3VudDogbnVtYmVyO1xuICAgIGJhY2t1cFJldGVudGlvbkRheXM6IG51bWJlcjtcbiAgICBkZWxldGlvblByb3RlY3Rpb246IGJvb2xlYW47XG4gICAgZW5hYmxlUGVyZm9ybWFuY2VJbnNpZ2h0czogYm9vbGVhbjtcbiAgICBlbmFibGVNb25pdG9yaW5nOiBib29sZWFuO1xuICB9O1xuICBcbiAgLy8gUmVkaXMgY29uZmlndXJhdGlvblxuICByZWRpczoge1xuICAgIG5vZGVUeXBlOiBzdHJpbmc7XG4gICAgbnVtQ2FjaGVDbHVzdGVyczogbnVtYmVyO1xuICAgIGF1dG9tYXRpY0ZhaWxvdmVyRW5hYmxlZDogYm9vbGVhbjtcbiAgfTtcbiAgXG4gIC8vIEVDUyBjb25maWd1cmF0aW9uXG4gIGVjczoge1xuICAgIHRhc2tDcHU6IG51bWJlcjtcbiAgICB0YXNrTWVtb3J5OiBudW1iZXI7XG4gICAgZGVzaXJlZENvdW50OiBudW1iZXI7XG4gICAgbWluQ2FwYWNpdHk6IG51bWJlcjtcbiAgICBtYXhDYXBhY2l0eTogbnVtYmVyO1xuICB9O1xuICBcbiAgLy8gRUZTIGNvbmZpZ3VyYXRpb25cbiAgZWZzOiB7XG4gICAgdGhyb3VnaHB1dE1vZGU6ICdidXJzdGluZycgfCAncHJvdmlzaW9uZWQnO1xuICAgIHByb3Zpc2lvbmVkVGhyb3VnaHB1dD86IG51bWJlcjtcbiAgfTtcbiAgXG4gIC8vIExlZ2FjeSBwcm9wZXJ0eSBtYXBwaW5ncyBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuICBpc1Byb2Q6IGJvb2xlYW47XG4gIGRiSW5zdGFuY2VDbGFzczogc3RyaW5nO1xuICBkYkluc3RhbmNlQ291bnQ6IG51bWJlcjtcbiAgZGJCYWNrdXBSZXRlbnRpb25EYXlzOiBudW1iZXI7XG4gIGVjc1Rhc2tDcHU6IG51bWJlcjtcbiAgZWNzVGFza01lbW9yeTogbnVtYmVyO1xuICBlY3NUYXNrRGVzaXJlZENvdW50OiBudW1iZXI7XG4gIHJlZGlzQ2FjaGVOb2RlVHlwZTogc3RyaW5nO1xuICByZWRpc051bUNhY2hlQ2x1c3RlcnM6IG51bWJlcjtcbiAgbWluQ2FwYWNpdHk6IG51bWJlcjtcbiAgbWF4Q2FwYWNpdHk6IG51bWJlcjtcbiAgXG4gIC8vIEdlbmVyYWwgaW5mcmFzdHJ1Y3R1cmUgc2V0dGluZ3NcbiAgZ2VuZXJhbDoge1xuICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5O1xuICAgIGVuYWJsZURldGFpbGVkTG9nZ2luZzogYm9vbGVhbjtcbiAgfTtcbiAgXG4gIC8vIE1vbml0b3JpbmcgY29uZmlndXJhdGlvblxuICBtb25pdG9yaW5nOiB7XG4gICAgZW5hYmxlQ2xvdWRXYXRjaEFsYXJtczogYm9vbGVhbjtcbiAgICBsb2dSZXRlbnRpb25EYXlzOiBudW1iZXI7XG4gIH07XG59XG5cbi8qKlxuICogQWxpYXMgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHlcbiAqL1xuZXhwb3J0IHR5cGUgQmFzZUNvbmZpZyA9IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnO1xuXG4vKipcbiAqIERldmVsb3BtZW50L1Rlc3QgZW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxuICogT3B0aW1pemVkIGZvciBjb3N0IGFuZCBkZXZlbG9wbWVudCB3b3JrZmxvd1xuICovXG5leHBvcnQgY29uc3QgREVWX0NPTkZJRzogQXV0aEluZnJhRW52aXJvbm1lbnRDb25maWcgPSB7XG4gIGRhdGFiYXNlOiB7XG4gICAgaW5zdGFuY2VDbGFzczogJ2RiLnQ0Zy5taWNybycsXG4gICAgaW5zdGFuY2VDb3VudDogMSxcbiAgICBiYWNrdXBSZXRlbnRpb25EYXlzOiAxLFxuICAgIGRlbGV0aW9uUHJvdGVjdGlvbjogZmFsc2UsXG4gICAgZW5hYmxlUGVyZm9ybWFuY2VJbnNpZ2h0czogZmFsc2UsXG4gICAgZW5hYmxlTW9uaXRvcmluZzogZmFsc2UsXG4gIH0sXG4gIHJlZGlzOiB7XG4gICAgbm9kZVR5cGU6ICdjYWNoZS50NGcubWljcm8nLFxuICAgIG51bUNhY2hlQ2x1c3RlcnM6IDEsXG4gICAgYXV0b21hdGljRmFpbG92ZXJFbmFibGVkOiBmYWxzZSxcbiAgfSxcbiAgZWNzOiB7XG4gICAgdGFza0NwdTogNTEyLFxuICAgIHRhc2tNZW1vcnk6IDEwMjQsXG4gICAgZGVzaXJlZENvdW50OiAxLFxuICAgIG1pbkNhcGFjaXR5OiAxLFxuICAgIG1heENhcGFjaXR5OiAzLFxuICB9LFxuICBlZnM6IHtcbiAgICB0aHJvdWdocHV0TW9kZTogJ2J1cnN0aW5nJyxcbiAgfSxcbiAgZ2VuZXJhbDoge1xuICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgZW5hYmxlRGV0YWlsZWRMb2dnaW5nOiB0cnVlLFxuICB9LFxuICBtb25pdG9yaW5nOiB7XG4gICAgZW5hYmxlQ2xvdWRXYXRjaEFsYXJtczogZmFsc2UsXG4gICAgbG9nUmV0ZW50aW9uRGF5czogNyxcbiAgfSxcbiAgLy8gTGVnYWN5IHByb3BlcnRpZXMgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHlcbiAgaXNQcm9kOiBmYWxzZSxcbiAgZGJJbnN0YW5jZUNsYXNzOiAnZGIudDRnLm1pY3JvJyxcbiAgZGJJbnN0YW5jZUNvdW50OiAxLFxuICBkYkJhY2t1cFJldGVudGlvbkRheXM6IDEsXG4gIGVjc1Rhc2tDcHU6IDUxMixcbiAgZWNzVGFza01lbW9yeTogMTAyNCxcbiAgZWNzVGFza0Rlc2lyZWRDb3VudDogMSxcbiAgcmVkaXNDYWNoZU5vZGVUeXBlOiAnY2FjaGUudDRnLm1pY3JvJyxcbiAgcmVkaXNOdW1DYWNoZUNsdXN0ZXJzOiAxLFxuICBtaW5DYXBhY2l0eTogMSxcbiAgbWF4Q2FwYWNpdHk6IDMsXG59O1xuXG4vKipcbiAqIFByb2R1Y3Rpb24gZW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxuICogT3B0aW1pemVkIGZvciBoaWdoIGF2YWlsYWJpbGl0eSwgc2VjdXJpdHksIGFuZCBwcm9kdWN0aW9uIHdvcmtsb2Fkc1xuICovXG5leHBvcnQgY29uc3QgUFJPRF9DT05GSUc6IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnID0ge1xuICBkYXRhYmFzZToge1xuICAgIGluc3RhbmNlQ2xhc3M6ICdkYi50NGcuc21hbGwnLFxuICAgIGluc3RhbmNlQ291bnQ6IDIsXG4gICAgYmFja3VwUmV0ZW50aW9uRGF5czogNyxcbiAgICBkZWxldGlvblByb3RlY3Rpb246IHRydWUsXG4gICAgZW5hYmxlUGVyZm9ybWFuY2VJbnNpZ2h0czogdHJ1ZSxcbiAgICBlbmFibGVNb25pdG9yaW5nOiB0cnVlLFxuICB9LFxuICByZWRpczoge1xuICAgIG5vZGVUeXBlOiAnY2FjaGUudDRnLnNtYWxsJyxcbiAgICBudW1DYWNoZUNsdXN0ZXJzOiAyLFxuICAgIGF1dG9tYXRpY0ZhaWxvdmVyRW5hYmxlZDogdHJ1ZSxcbiAgfSxcbiAgZWNzOiB7XG4gICAgdGFza0NwdTogMTAyNCxcbiAgICB0YXNrTWVtb3J5OiAyMDQ4LFxuICAgIGRlc2lyZWRDb3VudDogMixcbiAgICBtaW5DYXBhY2l0eTogMixcbiAgICBtYXhDYXBhY2l0eTogNixcbiAgfSxcbiAgZWZzOiB7XG4gICAgdGhyb3VnaHB1dE1vZGU6ICdidXJzdGluZycsXG4gIH0sXG4gIGdlbmVyYWw6IHtcbiAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgZW5hYmxlRGV0YWlsZWRMb2dnaW5nOiB0cnVlLFxuICB9LFxuICBtb25pdG9yaW5nOiB7XG4gICAgZW5hYmxlQ2xvdWRXYXRjaEFsYXJtczogdHJ1ZSxcbiAgICBsb2dSZXRlbnRpb25EYXlzOiAzMCxcbiAgfSxcbiAgLy8gTGVnYWN5IHByb3BlcnRpZXMgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHlcbiAgaXNQcm9kOiB0cnVlLFxuICBkYkluc3RhbmNlQ2xhc3M6ICdkYi50NGcuc21hbGwnLFxuICBkYkluc3RhbmNlQ291bnQ6IDIsXG4gIGRiQmFja3VwUmV0ZW50aW9uRGF5czogNyxcbiAgZWNzVGFza0NwdTogMTAyNCxcbiAgZWNzVGFza01lbW9yeTogMjA0OCxcbiAgZWNzVGFza0Rlc2lyZWRDb3VudDogMixcbiAgcmVkaXNDYWNoZU5vZGVUeXBlOiAnY2FjaGUudDRnLnNtYWxsJyxcbiAgcmVkaXNOdW1DYWNoZUNsdXN0ZXJzOiAyLFxuICBtaW5DYXBhY2l0eTogMixcbiAgbWF4Q2FwYWNpdHk6IDYsXG59O1xuXG4vKipcbiAqIFN0YWdpbmcgZW52aXJvbm1lbnQgY29uZmlndXJhdGlvbiAoaW5oZXJpdHMgZnJvbSBwcm9kIHdpdGggc29tZSBvcHRpbWl6YXRpb25zKVxuICovXG5leHBvcnQgY29uc3QgU1RBR0lOR19DT05GSUc6IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnID0ge1xuICAuLi5QUk9EX0NPTkZJRyxcbiAgZGF0YWJhc2U6IHtcbiAgICAuLi5QUk9EX0NPTkZJRy5kYXRhYmFzZSxcbiAgICBpbnN0YW5jZUNvdW50OiAxLFxuICAgIGJhY2t1cFJldGVudGlvbkRheXM6IDMsXG4gIH0sXG4gIGVjczoge1xuICAgIC4uLlBST0RfQ09ORklHLmVjcyxcbiAgICBkZXNpcmVkQ291bnQ6IDEsXG4gICAgbWF4Q2FwYWNpdHk6IDQsXG4gIH0sXG4gIGdlbmVyYWw6IHtcbiAgICAuLi5QUk9EX0NPTkZJRy5nZW5lcmFsLFxuICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiwgLy8gS2VlcCBzdGFnaW5nIGRhdGEgZm9yIHRyb3VibGVzaG9vdGluZ1xuICB9LFxuICAvLyBPdmVycmlkZSBsZWdhY3kgcHJvcGVydGllcyBmb3Igc3RhZ2luZ1xuICBkYkluc3RhbmNlQ291bnQ6IDEsXG4gIGRiQmFja3VwUmV0ZW50aW9uRGF5czogMyxcbiAgZWNzVGFza0Rlc2lyZWRDb3VudDogMSxcbiAgbWF4Q2FwYWNpdHk6IDQsXG59O1xuXG4vKipcbiAqIEdldCBlbnZpcm9ubWVudC1zcGVjaWZpYyBjb25maWd1cmF0aW9uIGJhc2VkIG9uIHRoZSBwcm92aWRlZCBlbnZpcm9ubWVudCB0eXBlXG4gKiBAcGFyYW0gZW52VHlwZSAtIEVudmlyb25tZW50IHR5cGUgKCdwcm9kJywgJ2Rldi10ZXN0JywgJ3N0YWdpbmcnLCBldGMuKVxuICogQHJldHVybnMgRW52aXJvbm1lbnQtc3BlY2lmaWMgY29uZmlndXJhdGlvblxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0RW52aXJvbm1lbnRDb25maWcoZW52VHlwZTogc3RyaW5nKTogQXV0aEluZnJhRW52aXJvbm1lbnRDb25maWcge1xuICBzd2l0Y2ggKGVudlR5cGUpIHtcbiAgICBjYXNlICdwcm9kJzpcbiAgICBjYXNlICdwcm9kdWN0aW9uJzpcbiAgICAgIHJldHVybiBQUk9EX0NPTkZJRztcbiAgICBjYXNlICdzdGFnaW5nJzpcbiAgICBjYXNlICdzdGFnZSc6XG4gICAgICByZXR1cm4gU1RBR0lOR19DT05GSUc7XG4gICAgY2FzZSAnZGV2JzpcbiAgICBjYXNlICdkZXYtdGVzdCc6XG4gICAgY2FzZSAnZGV2ZWxvcG1lbnQnOlxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gREVWX0NPTkZJRztcbiAgfVxufVxuXG4vKipcbiAqIE1lcmdlIGVudmlyb25tZW50IGNvbmZpZyB3aXRoIG92ZXJyaWRlc1xuICogQHBhcmFtIGVudlR5cGUgLSBFbnZpcm9ubWVudCB0eXBlXG4gKiBAcGFyYW0gb3ZlcnJpZGVzIC0gQ29uZmlndXJhdGlvbiBvdmVycmlkZXNcbiAqIEByZXR1cm5zIE1lcmdlZCBjb25maWd1cmF0aW9uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZXJnZUVudmlyb25tZW50Q29uZmlnKFxuICBlbnZUeXBlOiBzdHJpbmcsIFxuICBvdmVycmlkZXM6IFBhcnRpYWw8QXV0aEluZnJhRW52aXJvbm1lbnRDb25maWc+XG4pOiBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZyB7XG4gIGNvbnN0IGJhc2VDb25maWcgPSBnZXRFbnZpcm9ubWVudENvbmZpZyhlbnZUeXBlKTtcbiAgXG4gIC8vIERlZXAgbWVyZ2UgdGhlIGNvbmZpZ3VyYXRpb25cbiAgcmV0dXJuIHtcbiAgICBkYXRhYmFzZTogeyAuLi5iYXNlQ29uZmlnLmRhdGFiYXNlLCAuLi5vdmVycmlkZXMuZGF0YWJhc2UgfSxcbiAgICByZWRpczogeyAuLi5iYXNlQ29uZmlnLnJlZGlzLCAuLi5vdmVycmlkZXMucmVkaXMgfSxcbiAgICBlY3M6IHsgLi4uYmFzZUNvbmZpZy5lY3MsIC4uLm92ZXJyaWRlcy5lY3MgfSxcbiAgICBlZnM6IHsgLi4uYmFzZUNvbmZpZy5lZnMsIC4uLm92ZXJyaWRlcy5lZnMgfSxcbiAgICBnZW5lcmFsOiB7IC4uLmJhc2VDb25maWcuZ2VuZXJhbCwgLi4ub3ZlcnJpZGVzLmdlbmVyYWwgfSxcbiAgICBtb25pdG9yaW5nOiB7IC4uLmJhc2VDb25maWcubW9uaXRvcmluZywgLi4ub3ZlcnJpZGVzLm1vbml0b3JpbmcgfSxcbiAgICAvLyBMZWdhY3kgcHJvcGVydGllc1xuICAgIGlzUHJvZDogYmFzZUNvbmZpZy5pc1Byb2QsXG4gICAgZGJJbnN0YW5jZUNsYXNzOiBiYXNlQ29uZmlnLmRiSW5zdGFuY2VDbGFzcyxcbiAgICBkYkluc3RhbmNlQ291bnQ6IGJhc2VDb25maWcuZGJJbnN0YW5jZUNvdW50LFxuICAgIGRiQmFja3VwUmV0ZW50aW9uRGF5czogYmFzZUNvbmZpZy5kYkJhY2t1cFJldGVudGlvbkRheXMsXG4gICAgZWNzVGFza0NwdTogYmFzZUNvbmZpZy5lY3NUYXNrQ3B1LFxuICAgIGVjc1Rhc2tNZW1vcnk6IGJhc2VDb25maWcuZWNzVGFza01lbW9yeSxcbiAgICBlY3NUYXNrRGVzaXJlZENvdW50OiBiYXNlQ29uZmlnLmVjc1Rhc2tEZXNpcmVkQ291bnQsXG4gICAgcmVkaXNDYWNoZU5vZGVUeXBlOiBiYXNlQ29uZmlnLnJlZGlzQ2FjaGVOb2RlVHlwZSxcbiAgICByZWRpc051bUNhY2hlQ2x1c3RlcnM6IGJhc2VDb25maWcucmVkaXNOdW1DYWNoZUNsdXN0ZXJzLFxuICAgIG1pbkNhcGFjaXR5OiBiYXNlQ29uZmlnLm1pbkNhcGFjaXR5LFxuICAgIG1heENhcGFjaXR5OiBiYXNlQ29uZmlnLm1heENhcGFjaXR5LFxuICB9O1xufVxuIl19