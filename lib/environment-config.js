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
exports.PROD_CONFIG = exports.DEV_CONFIG = void 0;
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
        case 'dev':
        case 'dev-test':
        case 'development':
        default:
            return exports.DEV_CONFIG;
    }
}
/**
 * Merge environment config with custom overrides
 * Allows fine-grained control over individual settings
 */
function mergeEnvironmentConfig(baseConfig, overrides) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW52aXJvbm1lbnQtY29uZmlnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZW52aXJvbm1lbnQtY29uZmlnLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBc0lBLG9EQVdDO0FBTUQsd0RBb0JDO0FBM0tEOztHQUVHO0FBQ0gsaURBQW1DO0FBa0RuQzs7O0dBR0c7QUFDVSxRQUFBLFVBQVUsR0FBK0I7SUFDcEQsUUFBUSxFQUFFO1FBQ1IsYUFBYSxFQUFFLGNBQWM7UUFDN0IsYUFBYSxFQUFFLENBQUM7UUFDaEIsbUJBQW1CLEVBQUUsQ0FBQztRQUN0QixrQkFBa0IsRUFBRSxLQUFLO1FBQ3pCLHlCQUF5QixFQUFFLEtBQUs7UUFDaEMsZ0JBQWdCLEVBQUUsS0FBSztLQUN4QjtJQUNELEtBQUssRUFBRTtRQUNMLFFBQVEsRUFBRSxpQkFBaUI7UUFDM0IsZ0JBQWdCLEVBQUUsQ0FBQztRQUNuQix3QkFBd0IsRUFBRSxLQUFLO0tBQ2hDO0lBQ0QsR0FBRyxFQUFFO1FBQ0gsT0FBTyxFQUFFLEdBQUc7UUFDWixVQUFVLEVBQUUsSUFBSTtRQUNoQixZQUFZLEVBQUUsQ0FBQztRQUNmLFdBQVcsRUFBRSxDQUFDO1FBQ2QsV0FBVyxFQUFFLENBQUM7S0FDZjtJQUNELEdBQUcsRUFBRTtRQUNILGNBQWMsRUFBRSxVQUFVO0tBQzNCO0lBQ0QsT0FBTyxFQUFFO1FBQ1AsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztRQUN4QyxxQkFBcUIsRUFBRSxJQUFJO0tBQzVCO0lBQ0QsVUFBVSxFQUFFO1FBQ1Ysc0JBQXNCLEVBQUUsS0FBSztRQUM3QixnQkFBZ0IsRUFBRSxDQUFDO0tBQ3BCO0NBQ0YsQ0FBQztBQUVGOzs7R0FHRztBQUNVLFFBQUEsV0FBVyxHQUErQjtJQUNyRCxRQUFRLEVBQUU7UUFDUixhQUFhLEVBQUUsY0FBYztRQUM3QixhQUFhLEVBQUUsQ0FBQztRQUNoQixtQkFBbUIsRUFBRSxDQUFDO1FBQ3RCLGtCQUFrQixFQUFFLElBQUk7UUFDeEIseUJBQXlCLEVBQUUsSUFBSTtRQUMvQixnQkFBZ0IsRUFBRSxJQUFJO0tBQ3ZCO0lBQ0QsS0FBSyxFQUFFO1FBQ0wsUUFBUSxFQUFFLGlCQUFpQjtRQUMzQixnQkFBZ0IsRUFBRSxDQUFDO1FBQ25CLHdCQUF3QixFQUFFLElBQUk7S0FDL0I7SUFDRCxHQUFHLEVBQUU7UUFDSCxPQUFPLEVBQUUsSUFBSTtRQUNiLFVBQVUsRUFBRSxJQUFJO1FBQ2hCLFlBQVksRUFBRSxDQUFDO1FBQ2YsV0FBVyxFQUFFLENBQUM7UUFDZCxXQUFXLEVBQUUsQ0FBQztLQUNmO0lBQ0QsR0FBRyxFQUFFO1FBQ0gsY0FBYyxFQUFFLFVBQVU7S0FDM0I7SUFDRCxPQUFPLEVBQUU7UUFDUCxhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxNQUFNO1FBQ3ZDLHFCQUFxQixFQUFFLElBQUk7S0FDNUI7SUFDRCxVQUFVLEVBQUU7UUFDVixzQkFBc0IsRUFBRSxJQUFJO1FBQzVCLGdCQUFnQixFQUFFLEVBQUU7S0FDckI7Q0FDRixDQUFDO0FBRUY7Ozs7R0FJRztBQUNILFNBQWdCLG9CQUFvQixDQUFDLE9BQWU7SUFDbEQsUUFBUSxPQUFPLEVBQUUsQ0FBQztRQUNoQixLQUFLLE1BQU0sQ0FBQztRQUNaLEtBQUssWUFBWTtZQUNmLE9BQU8sbUJBQVcsQ0FBQztRQUNyQixLQUFLLEtBQUssQ0FBQztRQUNYLEtBQUssVUFBVSxDQUFDO1FBQ2hCLEtBQUssYUFBYSxDQUFDO1FBQ25CO1lBQ0UsT0FBTyxrQkFBVSxDQUFDO0lBQ3RCLENBQUM7QUFDSCxDQUFDO0FBRUQ7OztHQUdHO0FBQ0gsU0FBZ0Isc0JBQXNCLENBQ3BDLFVBQXNDLEVBQ3RDLFNBT0M7SUFFRCwrQkFBK0I7SUFDL0IsT0FBTztRQUNMLFFBQVEsRUFBRSxFQUFFLEdBQUcsVUFBVSxDQUFDLFFBQVEsRUFBRSxHQUFHLFNBQVMsQ0FBQyxRQUFRLEVBQUU7UUFDM0QsS0FBSyxFQUFFLEVBQUUsR0FBRyxVQUFVLENBQUMsS0FBSyxFQUFFLEdBQUcsU0FBUyxDQUFDLEtBQUssRUFBRTtRQUNsRCxHQUFHLEVBQUUsRUFBRSxHQUFHLFVBQVUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxTQUFTLENBQUMsR0FBRyxFQUFFO1FBQzVDLEdBQUcsRUFBRSxFQUFFLEdBQUcsVUFBVSxDQUFDLEdBQUcsRUFBRSxHQUFHLFNBQVMsQ0FBQyxHQUFHLEVBQUU7UUFDNUMsT0FBTyxFQUFFLEVBQUUsR0FBRyxVQUFVLENBQUMsT0FBTyxFQUFFLEdBQUcsU0FBUyxDQUFDLE9BQU8sRUFBRTtRQUN4RCxVQUFVLEVBQUUsRUFBRSxHQUFHLFVBQVUsQ0FBQyxVQUFVLEVBQUUsR0FBRyxTQUFTLENBQUMsVUFBVSxFQUFFO0tBQ2xFLENBQUM7QUFDSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBFbnZpcm9ubWVudC1zcGVjaWZpYyBjb25maWd1cmF0aW9uIG9iamVjdHMgYW5kIHV0aWxpdGllc1xuICovXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuXG4vKipcbiAqIEVudmlyb25tZW50LXNwZWNpZmljIGNvbmZpZ3VyYXRpb24gZm9yIGF1dGggaW5mcmFzdHJ1Y3R1cmUgcmVzb3VyY2VzXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aEluZnJhRW52aXJvbm1lbnRDb25maWcge1xuICAvLyBEYXRhYmFzZSBjb25maWd1cmF0aW9uXG4gIGRhdGFiYXNlOiB7XG4gICAgaW5zdGFuY2VDbGFzczogc3RyaW5nO1xuICAgIGluc3RhbmNlQ291bnQ6IG51bWJlcjtcbiAgICBiYWNrdXBSZXRlbnRpb25EYXlzOiBudW1iZXI7XG4gICAgZGVsZXRpb25Qcm90ZWN0aW9uOiBib29sZWFuO1xuICAgIGVuYWJsZVBlcmZvcm1hbmNlSW5zaWdodHM6IGJvb2xlYW47XG4gICAgZW5hYmxlTW9uaXRvcmluZzogYm9vbGVhbjtcbiAgfTtcbiAgXG4gIC8vIFJlZGlzIGNvbmZpZ3VyYXRpb25cbiAgcmVkaXM6IHtcbiAgICBub2RlVHlwZTogc3RyaW5nO1xuICAgIG51bUNhY2hlQ2x1c3RlcnM6IG51bWJlcjtcbiAgICBhdXRvbWF0aWNGYWlsb3ZlckVuYWJsZWQ6IGJvb2xlYW47XG4gIH07XG4gIFxuICAvLyBFQ1MgY29uZmlndXJhdGlvblxuICBlY3M6IHtcbiAgICB0YXNrQ3B1OiBudW1iZXI7XG4gICAgdGFza01lbW9yeTogbnVtYmVyO1xuICAgIGRlc2lyZWRDb3VudDogbnVtYmVyO1xuICAgIG1pbkNhcGFjaXR5OiBudW1iZXI7XG4gICAgbWF4Q2FwYWNpdHk6IG51bWJlcjtcbiAgfTtcbiAgIC8vIEVGUyBjb25maWd1cmF0aW9uXG4gIGVmczoge1xuICAgIHRocm91Z2hwdXRNb2RlOiAnYnVyc3RpbmcnIHwgJ3Byb3Zpc2lvbmVkJztcbiAgICBwcm92aXNpb25lZFRocm91Z2hwdXQ/OiBudW1iZXI7XG4gIH07XG5cbiAgLy8gR2VuZXJhbCBpbmZyYXN0cnVjdHVyZSBzZXR0aW5nc1xuICBnZW5lcmFsOiB7XG4gICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3k7XG4gICAgZW5hYmxlRGV0YWlsZWRMb2dnaW5nOiBib29sZWFuO1xuICB9O1xuXG4gIC8vIE1vbml0b3JpbmcgY29uZmlndXJhdGlvblxuICBtb25pdG9yaW5nOiB7XG4gICAgZW5hYmxlQ2xvdWRXYXRjaEFsYXJtczogYm9vbGVhbjtcbiAgICBsb2dSZXRlbnRpb25EYXlzOiBudW1iZXI7XG4gIH07XG59XG5cbi8qKlxuICogRGV2ZWxvcG1lbnQvVGVzdCBlbnZpcm9ubWVudCBjb25maWd1cmF0aW9uXG4gKiBPcHRpbWl6ZWQgZm9yIGNvc3QgYW5kIGRldmVsb3BtZW50IHdvcmtmbG93XG4gKi9cbmV4cG9ydCBjb25zdCBERVZfQ09ORklHOiBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZyA9IHtcbiAgZGF0YWJhc2U6IHtcbiAgICBpbnN0YW5jZUNsYXNzOiAnZGIudDRnLm1pY3JvJyxcbiAgICBpbnN0YW5jZUNvdW50OiAxLFxuICAgIGJhY2t1cFJldGVudGlvbkRheXM6IDEsXG4gICAgZGVsZXRpb25Qcm90ZWN0aW9uOiBmYWxzZSxcbiAgICBlbmFibGVQZXJmb3JtYW5jZUluc2lnaHRzOiBmYWxzZSxcbiAgICBlbmFibGVNb25pdG9yaW5nOiBmYWxzZSxcbiAgfSxcbiAgcmVkaXM6IHtcbiAgICBub2RlVHlwZTogJ2NhY2hlLnQ0Zy5taWNybycsXG4gICAgbnVtQ2FjaGVDbHVzdGVyczogMSxcbiAgICBhdXRvbWF0aWNGYWlsb3ZlckVuYWJsZWQ6IGZhbHNlLFxuICB9LFxuICBlY3M6IHtcbiAgICB0YXNrQ3B1OiA1MTIsXG4gICAgdGFza01lbW9yeTogMTAyNCxcbiAgICBkZXNpcmVkQ291bnQ6IDEsXG4gICAgbWluQ2FwYWNpdHk6IDEsXG4gICAgbWF4Q2FwYWNpdHk6IDMsXG4gIH0sXG4gIGVmczoge1xuICAgIHRocm91Z2hwdXRNb2RlOiAnYnVyc3RpbmcnLFxuICB9LFxuICBnZW5lcmFsOiB7XG4gICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICBlbmFibGVEZXRhaWxlZExvZ2dpbmc6IHRydWUsXG4gIH0sXG4gIG1vbml0b3Jpbmc6IHtcbiAgICBlbmFibGVDbG91ZFdhdGNoQWxhcm1zOiBmYWxzZSxcbiAgICBsb2dSZXRlbnRpb25EYXlzOiA3LFxuICB9LFxufTtcblxuLyoqXG4gKiBQcm9kdWN0aW9uIGVudmlyb25tZW50IGNvbmZpZ3VyYXRpb25cbiAqIE9wdGltaXplZCBmb3IgaGlnaCBhdmFpbGFiaWxpdHksIHNlY3VyaXR5LCBhbmQgcHJvZHVjdGlvbiB3b3JrbG9hZHNcbiAqL1xuZXhwb3J0IGNvbnN0IFBST0RfQ09ORklHOiBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZyA9IHtcbiAgZGF0YWJhc2U6IHtcbiAgICBpbnN0YW5jZUNsYXNzOiAnZGIudDRnLnNtYWxsJyxcbiAgICBpbnN0YW5jZUNvdW50OiAyLFxuICAgIGJhY2t1cFJldGVudGlvbkRheXM6IDcsXG4gICAgZGVsZXRpb25Qcm90ZWN0aW9uOiB0cnVlLFxuICAgIGVuYWJsZVBlcmZvcm1hbmNlSW5zaWdodHM6IHRydWUsXG4gICAgZW5hYmxlTW9uaXRvcmluZzogdHJ1ZSxcbiAgfSxcbiAgcmVkaXM6IHtcbiAgICBub2RlVHlwZTogJ2NhY2hlLnQ0Zy5zbWFsbCcsXG4gICAgbnVtQ2FjaGVDbHVzdGVyczogMixcbiAgICBhdXRvbWF0aWNGYWlsb3ZlckVuYWJsZWQ6IHRydWUsXG4gIH0sXG4gIGVjczoge1xuICAgIHRhc2tDcHU6IDEwMjQsXG4gICAgdGFza01lbW9yeTogMjA0OCxcbiAgICBkZXNpcmVkQ291bnQ6IDIsXG4gICAgbWluQ2FwYWNpdHk6IDIsXG4gICAgbWF4Q2FwYWNpdHk6IDYsXG4gIH0sXG4gIGVmczoge1xuICAgIHRocm91Z2hwdXRNb2RlOiAnYnVyc3RpbmcnLFxuICB9LFxuICBnZW5lcmFsOiB7XG4gICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIGVuYWJsZURldGFpbGVkTG9nZ2luZzogdHJ1ZSxcbiAgfSxcbiAgbW9uaXRvcmluZzoge1xuICAgIGVuYWJsZUNsb3VkV2F0Y2hBbGFybXM6IHRydWUsXG4gICAgbG9nUmV0ZW50aW9uRGF5czogMzAsXG4gIH0sXG59O1xuXG4vKipcbiAqIEdldCBlbnZpcm9ubWVudC1zcGVjaWZpYyBjb25maWd1cmF0aW9uIGJhc2VkIG9uIHRoZSBwcm92aWRlZCBlbnZpcm9ubWVudCB0eXBlXG4gKiBAcGFyYW0gZW52VHlwZSAtIEVudmlyb25tZW50IHR5cGUgKCdwcm9kJywgJ2Rldi10ZXN0JywgJ3N0YWdpbmcnLCBldGMuKVxuICogQHJldHVybnMgRW52aXJvbm1lbnQtc3BlY2lmaWMgY29uZmlndXJhdGlvblxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0RW52aXJvbm1lbnRDb25maWcoZW52VHlwZTogc3RyaW5nKTogQXV0aEluZnJhRW52aXJvbm1lbnRDb25maWcge1xuICBzd2l0Y2ggKGVudlR5cGUpIHtcbiAgICBjYXNlICdwcm9kJzpcbiAgICBjYXNlICdwcm9kdWN0aW9uJzpcbiAgICAgIHJldHVybiBQUk9EX0NPTkZJRztcbiAgICBjYXNlICdkZXYnOlxuICAgIGNhc2UgJ2Rldi10ZXN0JzpcbiAgICBjYXNlICdkZXZlbG9wbWVudCc6XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBERVZfQ09ORklHO1xuICB9XG59XG5cbi8qKlxuICogTWVyZ2UgZW52aXJvbm1lbnQgY29uZmlnIHdpdGggY3VzdG9tIG92ZXJyaWRlc1xuICogQWxsb3dzIGZpbmUtZ3JhaW5lZCBjb250cm9sIG92ZXIgaW5kaXZpZHVhbCBzZXR0aW5nc1xuICovXG5leHBvcnQgZnVuY3Rpb24gbWVyZ2VFbnZpcm9ubWVudENvbmZpZyhcbiAgYmFzZUNvbmZpZzogQXV0aEluZnJhRW52aXJvbm1lbnRDb25maWcsXG4gIG92ZXJyaWRlczoge1xuICAgIGRhdGFiYXNlPzogUGFydGlhbDxBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZ1snZGF0YWJhc2UnXT47XG4gICAgcmVkaXM/OiBQYXJ0aWFsPEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnWydyZWRpcyddPjtcbiAgICBlY3M/OiBQYXJ0aWFsPEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnWydlY3MnXT47XG4gICAgZWZzPzogUGFydGlhbDxBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZ1snZWZzJ10+O1xuICAgIGdlbmVyYWw/OiBQYXJ0aWFsPEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnWydnZW5lcmFsJ10+O1xuICAgIG1vbml0b3Jpbmc/OiBQYXJ0aWFsPEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnWydtb25pdG9yaW5nJ10+O1xuICB9XG4pOiBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZyB7XG4gIC8vIERlZXAgbWVyZ2UgdGhlIGNvbmZpZ3VyYXRpb25cbiAgcmV0dXJuIHtcbiAgICBkYXRhYmFzZTogeyAuLi5iYXNlQ29uZmlnLmRhdGFiYXNlLCAuLi5vdmVycmlkZXMuZGF0YWJhc2UgfSxcbiAgICByZWRpczogeyAuLi5iYXNlQ29uZmlnLnJlZGlzLCAuLi5vdmVycmlkZXMucmVkaXMgfSxcbiAgICBlY3M6IHsgLi4uYmFzZUNvbmZpZy5lY3MsIC4uLm92ZXJyaWRlcy5lY3MgfSxcbiAgICBlZnM6IHsgLi4uYmFzZUNvbmZpZy5lZnMsIC4uLm92ZXJyaWRlcy5lZnMgfSxcbiAgICBnZW5lcmFsOiB7IC4uLmJhc2VDb25maWcuZ2VuZXJhbCwgLi4ub3ZlcnJpZGVzLmdlbmVyYWwgfSxcbiAgICBtb25pdG9yaW5nOiB7IC4uLmJhc2VDb25maWcubW9uaXRvcmluZywgLi4ub3ZlcnJpZGVzLm1vbml0b3JpbmcgfSxcbiAgfTtcbn1cbiJdfQ==