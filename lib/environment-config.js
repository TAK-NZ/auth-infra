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
 * Pure configuration approach following reference template pattern
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW52aXJvbm1lbnQtY29uZmlnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZW52aXJvbm1lbnQtY29uZmlnLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBZ0pBLG9EQVdDO0FBTUQsd0RBb0JDO0FBckxEOzs7R0FHRztBQUNILGlEQUFtQztBQXFEbkM7OztHQUdHO0FBQ1UsUUFBQSxVQUFVLEdBQStCO0lBQ3BELFFBQVEsRUFBRTtRQUNSLGFBQWEsRUFBRSxjQUFjO1FBQzdCLGFBQWEsRUFBRSxDQUFDO1FBQ2hCLG1CQUFtQixFQUFFLENBQUM7UUFDdEIsa0JBQWtCLEVBQUUsS0FBSztRQUN6Qix5QkFBeUIsRUFBRSxLQUFLO1FBQ2hDLGdCQUFnQixFQUFFLEtBQUs7S0FDeEI7SUFDRCxLQUFLLEVBQUU7UUFDTCxRQUFRLEVBQUUsaUJBQWlCO1FBQzNCLGdCQUFnQixFQUFFLENBQUM7UUFDbkIsd0JBQXdCLEVBQUUsS0FBSztLQUNoQztJQUNELEdBQUcsRUFBRTtRQUNILE9BQU8sRUFBRSxHQUFHO1FBQ1osVUFBVSxFQUFFLElBQUk7UUFDaEIsWUFBWSxFQUFFLENBQUM7UUFDZixXQUFXLEVBQUUsQ0FBQztRQUNkLFdBQVcsRUFBRSxDQUFDO1FBQ2Qsa0JBQWtCLEVBQUUsQ0FBQztRQUNyQixpQkFBaUIsRUFBRSxDQUFDO1FBQ3BCLGlCQUFpQixFQUFFLENBQUM7S0FDckI7SUFDRCxHQUFHLEVBQUU7UUFDSCxjQUFjLEVBQUUsVUFBVTtLQUMzQjtJQUNELE9BQU8sRUFBRTtRQUNQLGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU87UUFDeEMscUJBQXFCLEVBQUUsSUFBSTtLQUM1QjtJQUNELFVBQVUsRUFBRTtRQUNWLHNCQUFzQixFQUFFLEtBQUs7UUFDN0IsZ0JBQWdCLEVBQUUsQ0FBQztLQUNwQjtDQUNGLENBQUM7QUFFRjs7O0dBR0c7QUFDVSxRQUFBLFdBQVcsR0FBK0I7SUFDckQsUUFBUSxFQUFFO1FBQ1IsYUFBYSxFQUFFLGNBQWM7UUFDN0IsYUFBYSxFQUFFLENBQUM7UUFDaEIsbUJBQW1CLEVBQUUsQ0FBQztRQUN0QixrQkFBa0IsRUFBRSxJQUFJO1FBQ3hCLHlCQUF5QixFQUFFLElBQUk7UUFDL0IsZ0JBQWdCLEVBQUUsSUFBSTtLQUN2QjtJQUNELEtBQUssRUFBRTtRQUNMLFFBQVEsRUFBRSxpQkFBaUI7UUFDM0IsZ0JBQWdCLEVBQUUsQ0FBQztRQUNuQix3QkFBd0IsRUFBRSxJQUFJO0tBQy9CO0lBQ0QsR0FBRyxFQUFFO1FBQ0gsT0FBTyxFQUFFLElBQUk7UUFDYixVQUFVLEVBQUUsSUFBSTtRQUNoQixZQUFZLEVBQUUsQ0FBQztRQUNmLFdBQVcsRUFBRSxDQUFDO1FBQ2QsV0FBVyxFQUFFLENBQUM7UUFDZCxrQkFBa0IsRUFBRSxDQUFDO1FBQ3JCLGlCQUFpQixFQUFFLENBQUM7UUFDcEIsaUJBQWlCLEVBQUUsQ0FBQztLQUNyQjtJQUNELEdBQUcsRUFBRTtRQUNILGNBQWMsRUFBRSxVQUFVO0tBQzNCO0lBQ0QsT0FBTyxFQUFFO1FBQ1AsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTTtRQUN2QyxxQkFBcUIsRUFBRSxJQUFJO0tBQzVCO0lBQ0QsVUFBVSxFQUFFO1FBQ1Ysc0JBQXNCLEVBQUUsSUFBSTtRQUM1QixnQkFBZ0IsRUFBRSxFQUFFO0tBQ3JCO0NBQ0YsQ0FBQztBQUVGOzs7O0dBSUc7QUFDSCxTQUFnQixvQkFBb0IsQ0FBQyxPQUFlO0lBQ2xELFFBQVEsT0FBTyxFQUFFLENBQUM7UUFDaEIsS0FBSyxNQUFNLENBQUM7UUFDWixLQUFLLFlBQVk7WUFDZixPQUFPLG1CQUFXLENBQUM7UUFDckIsS0FBSyxLQUFLLENBQUM7UUFDWCxLQUFLLFVBQVUsQ0FBQztRQUNoQixLQUFLLGFBQWEsQ0FBQztRQUNuQjtZQUNFLE9BQU8sa0JBQVUsQ0FBQztJQUN0QixDQUFDO0FBQ0gsQ0FBQztBQUVEOzs7R0FHRztBQUNILFNBQWdCLHNCQUFzQixDQUNwQyxVQUFzQyxFQUN0QyxTQU9DO0lBRUQsK0JBQStCO0lBQy9CLE9BQU87UUFDTCxRQUFRLEVBQUUsRUFBRSxHQUFHLFVBQVUsQ0FBQyxRQUFRLEVBQUUsR0FBRyxTQUFTLENBQUMsUUFBUSxFQUFFO1FBQzNELEtBQUssRUFBRSxFQUFFLEdBQUcsVUFBVSxDQUFDLEtBQUssRUFBRSxHQUFHLFNBQVMsQ0FBQyxLQUFLLEVBQUU7UUFDbEQsR0FBRyxFQUFFLEVBQUUsR0FBRyxVQUFVLENBQUMsR0FBRyxFQUFFLEdBQUcsU0FBUyxDQUFDLEdBQUcsRUFBRTtRQUM1QyxHQUFHLEVBQUUsRUFBRSxHQUFHLFVBQVUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxTQUFTLENBQUMsR0FBRyxFQUFFO1FBQzVDLE9BQU8sRUFBRSxFQUFFLEdBQUcsVUFBVSxDQUFDLE9BQU8sRUFBRSxHQUFHLFNBQVMsQ0FBQyxPQUFPLEVBQUU7UUFDeEQsVUFBVSxFQUFFLEVBQUUsR0FBRyxVQUFVLENBQUMsVUFBVSxFQUFFLEdBQUcsU0FBUyxDQUFDLFVBQVUsRUFBRTtLQUNsRSxDQUFDO0FBQ0osQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogRW52aXJvbm1lbnQtc3BlY2lmaWMgY29uZmlndXJhdGlvbiBvYmplY3RzIGFuZCB1dGlsaXRpZXNcbiAqIFB1cmUgY29uZmlndXJhdGlvbiBhcHByb2FjaCBmb2xsb3dpbmcgcmVmZXJlbmNlIHRlbXBsYXRlIHBhdHRlcm5cbiAqL1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcblxuLyoqXG4gKiBFbnZpcm9ubWVudC1zcGVjaWZpYyBjb25maWd1cmF0aW9uIGZvciBhdXRoIGluZnJhc3RydWN0dXJlIHJlc291cmNlc1xuICovXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnIHtcbiAgLy8gRGF0YWJhc2UgY29uZmlndXJhdGlvblxuICBkYXRhYmFzZToge1xuICAgIGluc3RhbmNlQ2xhc3M6IHN0cmluZztcbiAgICBpbnN0YW5jZUNvdW50OiBudW1iZXI7XG4gICAgYmFja3VwUmV0ZW50aW9uRGF5czogbnVtYmVyO1xuICAgIGRlbGV0aW9uUHJvdGVjdGlvbjogYm9vbGVhbjtcbiAgICBlbmFibGVQZXJmb3JtYW5jZUluc2lnaHRzOiBib29sZWFuO1xuICAgIGVuYWJsZU1vbml0b3Jpbmc6IGJvb2xlYW47XG4gIH07XG4gIFxuICAvLyBSZWRpcyBjb25maWd1cmF0aW9uXG4gIHJlZGlzOiB7XG4gICAgbm9kZVR5cGU6IHN0cmluZztcbiAgICBudW1DYWNoZUNsdXN0ZXJzOiBudW1iZXI7XG4gICAgYXV0b21hdGljRmFpbG92ZXJFbmFibGVkOiBib29sZWFuO1xuICB9O1xuICBcbiAgLy8gRUNTIGNvbmZpZ3VyYXRpb25cbiAgZWNzOiB7XG4gICAgdGFza0NwdTogbnVtYmVyO1xuICAgIHRhc2tNZW1vcnk6IG51bWJlcjtcbiAgICBkZXNpcmVkQ291bnQ6IG51bWJlcjtcbiAgICBtaW5DYXBhY2l0eTogbnVtYmVyO1xuICAgIG1heENhcGFjaXR5OiBudW1iZXI7XG4gICAgd29ya2VyRGVzaXJlZENvdW50PzogbnVtYmVyO1xuICAgIHdvcmtlck1pbkNhcGFjaXR5PzogbnVtYmVyO1xuICAgIHdvcmtlck1heENhcGFjaXR5PzogbnVtYmVyO1xuICB9O1xuICAgLy8gRUZTIGNvbmZpZ3VyYXRpb25cbiAgZWZzOiB7XG4gICAgdGhyb3VnaHB1dE1vZGU6ICdidXJzdGluZycgfCAncHJvdmlzaW9uZWQnO1xuICAgIHByb3Zpc2lvbmVkVGhyb3VnaHB1dD86IG51bWJlcjtcbiAgfTtcblxuICAvLyBHZW5lcmFsIGluZnJhc3RydWN0dXJlIHNldHRpbmdzXG4gIGdlbmVyYWw6IHtcbiAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeTtcbiAgICBlbmFibGVEZXRhaWxlZExvZ2dpbmc6IGJvb2xlYW47XG4gIH07XG5cbiAgLy8gTW9uaXRvcmluZyBjb25maWd1cmF0aW9uXG4gIG1vbml0b3Jpbmc6IHtcbiAgICBlbmFibGVDbG91ZFdhdGNoQWxhcm1zOiBib29sZWFuO1xuICAgIGxvZ1JldGVudGlvbkRheXM6IG51bWJlcjtcbiAgfTtcbn1cblxuLyoqXG4gKiBEZXZlbG9wbWVudC9UZXN0IGVudmlyb25tZW50IGNvbmZpZ3VyYXRpb25cbiAqIE9wdGltaXplZCBmb3IgY29zdCBhbmQgZGV2ZWxvcG1lbnQgd29ya2Zsb3dcbiAqL1xuZXhwb3J0IGNvbnN0IERFVl9DT05GSUc6IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnID0ge1xuICBkYXRhYmFzZToge1xuICAgIGluc3RhbmNlQ2xhc3M6ICdkYi50NGcubWljcm8nLFxuICAgIGluc3RhbmNlQ291bnQ6IDEsXG4gICAgYmFja3VwUmV0ZW50aW9uRGF5czogMSxcbiAgICBkZWxldGlvblByb3RlY3Rpb246IGZhbHNlLFxuICAgIGVuYWJsZVBlcmZvcm1hbmNlSW5zaWdodHM6IGZhbHNlLFxuICAgIGVuYWJsZU1vbml0b3Jpbmc6IGZhbHNlLFxuICB9LFxuICByZWRpczoge1xuICAgIG5vZGVUeXBlOiAnY2FjaGUudDRnLm1pY3JvJyxcbiAgICBudW1DYWNoZUNsdXN0ZXJzOiAxLFxuICAgIGF1dG9tYXRpY0ZhaWxvdmVyRW5hYmxlZDogZmFsc2UsXG4gIH0sXG4gIGVjczoge1xuICAgIHRhc2tDcHU6IDUxMixcbiAgICB0YXNrTWVtb3J5OiAxMDI0LFxuICAgIGRlc2lyZWRDb3VudDogMSxcbiAgICBtaW5DYXBhY2l0eTogMSxcbiAgICBtYXhDYXBhY2l0eTogMyxcbiAgICB3b3JrZXJEZXNpcmVkQ291bnQ6IDEsXG4gICAgd29ya2VyTWluQ2FwYWNpdHk6IDEsXG4gICAgd29ya2VyTWF4Q2FwYWNpdHk6IDIsXG4gIH0sXG4gIGVmczoge1xuICAgIHRocm91Z2hwdXRNb2RlOiAnYnVyc3RpbmcnLFxuICB9LFxuICBnZW5lcmFsOiB7XG4gICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICBlbmFibGVEZXRhaWxlZExvZ2dpbmc6IHRydWUsXG4gIH0sXG4gIG1vbml0b3Jpbmc6IHtcbiAgICBlbmFibGVDbG91ZFdhdGNoQWxhcm1zOiBmYWxzZSxcbiAgICBsb2dSZXRlbnRpb25EYXlzOiA3LFxuICB9LFxufTtcblxuLyoqXG4gKiBQcm9kdWN0aW9uIGVudmlyb25tZW50IGNvbmZpZ3VyYXRpb25cbiAqIE9wdGltaXplZCBmb3IgaGlnaCBhdmFpbGFiaWxpdHksIHNlY3VyaXR5LCBhbmQgcHJvZHVjdGlvbiB3b3JrbG9hZHNcbiAqL1xuZXhwb3J0IGNvbnN0IFBST0RfQ09ORklHOiBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZyA9IHtcbiAgZGF0YWJhc2U6IHtcbiAgICBpbnN0YW5jZUNsYXNzOiAnZGIudDRnLnNtYWxsJyxcbiAgICBpbnN0YW5jZUNvdW50OiAyLFxuICAgIGJhY2t1cFJldGVudGlvbkRheXM6IDcsXG4gICAgZGVsZXRpb25Qcm90ZWN0aW9uOiB0cnVlLFxuICAgIGVuYWJsZVBlcmZvcm1hbmNlSW5zaWdodHM6IHRydWUsXG4gICAgZW5hYmxlTW9uaXRvcmluZzogdHJ1ZSxcbiAgfSxcbiAgcmVkaXM6IHtcbiAgICBub2RlVHlwZTogJ2NhY2hlLnQ0Zy5zbWFsbCcsXG4gICAgbnVtQ2FjaGVDbHVzdGVyczogMixcbiAgICBhdXRvbWF0aWNGYWlsb3ZlckVuYWJsZWQ6IHRydWUsXG4gIH0sXG4gIGVjczoge1xuICAgIHRhc2tDcHU6IDEwMjQsXG4gICAgdGFza01lbW9yeTogMjA0OCxcbiAgICBkZXNpcmVkQ291bnQ6IDIsXG4gICAgbWluQ2FwYWNpdHk6IDIsXG4gICAgbWF4Q2FwYWNpdHk6IDYsXG4gICAgd29ya2VyRGVzaXJlZENvdW50OiAyLFxuICAgIHdvcmtlck1pbkNhcGFjaXR5OiAxLFxuICAgIHdvcmtlck1heENhcGFjaXR5OiA0LFxuICB9LFxuICBlZnM6IHtcbiAgICB0aHJvdWdocHV0TW9kZTogJ2J1cnN0aW5nJyxcbiAgfSxcbiAgZ2VuZXJhbDoge1xuICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICBlbmFibGVEZXRhaWxlZExvZ2dpbmc6IHRydWUsXG4gIH0sXG4gIG1vbml0b3Jpbmc6IHtcbiAgICBlbmFibGVDbG91ZFdhdGNoQWxhcm1zOiB0cnVlLFxuICAgIGxvZ1JldGVudGlvbkRheXM6IDMwLFxuICB9LFxufTtcblxuLyoqXG4gKiBHZXQgZW52aXJvbm1lbnQtc3BlY2lmaWMgY29uZmlndXJhdGlvbiBiYXNlZCBvbiB0aGUgcHJvdmlkZWQgZW52aXJvbm1lbnQgdHlwZVxuICogQHBhcmFtIGVudlR5cGUgLSBFbnZpcm9ubWVudCB0eXBlICgncHJvZCcsICdkZXYtdGVzdCcsICdzdGFnaW5nJywgZXRjLilcbiAqIEByZXR1cm5zIEVudmlyb25tZW50LXNwZWNpZmljIGNvbmZpZ3VyYXRpb25cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEVudmlyb25tZW50Q29uZmlnKGVudlR5cGU6IHN0cmluZyk6IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnIHtcbiAgc3dpdGNoIChlbnZUeXBlKSB7XG4gICAgY2FzZSAncHJvZCc6XG4gICAgY2FzZSAncHJvZHVjdGlvbic6XG4gICAgICByZXR1cm4gUFJPRF9DT05GSUc7XG4gICAgY2FzZSAnZGV2JzpcbiAgICBjYXNlICdkZXYtdGVzdCc6XG4gICAgY2FzZSAnZGV2ZWxvcG1lbnQnOlxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gREVWX0NPTkZJRztcbiAgfVxufVxuXG4vKipcbiAqIE1lcmdlIGVudmlyb25tZW50IGNvbmZpZyB3aXRoIGN1c3RvbSBvdmVycmlkZXNcbiAqIEFsbG93cyBmaW5lLWdyYWluZWQgY29udHJvbCBvdmVyIGluZGl2aWR1YWwgc2V0dGluZ3NcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1lcmdlRW52aXJvbm1lbnRDb25maWcoXG4gIGJhc2VDb25maWc6IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnLFxuICBvdmVycmlkZXM6IHtcbiAgICBkYXRhYmFzZT86IFBhcnRpYWw8QXV0aEluZnJhRW52aXJvbm1lbnRDb25maWdbJ2RhdGFiYXNlJ10+O1xuICAgIHJlZGlzPzogUGFydGlhbDxBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZ1sncmVkaXMnXT47XG4gICAgZWNzPzogUGFydGlhbDxBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZ1snZWNzJ10+O1xuICAgIGVmcz86IFBhcnRpYWw8QXV0aEluZnJhRW52aXJvbm1lbnRDb25maWdbJ2VmcyddPjtcbiAgICBnZW5lcmFsPzogUGFydGlhbDxBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZ1snZ2VuZXJhbCddPjtcbiAgICBtb25pdG9yaW5nPzogUGFydGlhbDxBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZ1snbW9uaXRvcmluZyddPjtcbiAgfVxuKTogQXV0aEluZnJhRW52aXJvbm1lbnRDb25maWcge1xuICAvLyBEZWVwIG1lcmdlIHRoZSBjb25maWd1cmF0aW9uXG4gIHJldHVybiB7XG4gICAgZGF0YWJhc2U6IHsgLi4uYmFzZUNvbmZpZy5kYXRhYmFzZSwgLi4ub3ZlcnJpZGVzLmRhdGFiYXNlIH0sXG4gICAgcmVkaXM6IHsgLi4uYmFzZUNvbmZpZy5yZWRpcywgLi4ub3ZlcnJpZGVzLnJlZGlzIH0sXG4gICAgZWNzOiB7IC4uLmJhc2VDb25maWcuZWNzLCAuLi5vdmVycmlkZXMuZWNzIH0sXG4gICAgZWZzOiB7IC4uLmJhc2VDb25maWcuZWZzLCAuLi5vdmVycmlkZXMuZWZzIH0sXG4gICAgZ2VuZXJhbDogeyAuLi5iYXNlQ29uZmlnLmdlbmVyYWwsIC4uLm92ZXJyaWRlcy5nZW5lcmFsIH0sXG4gICAgbW9uaXRvcmluZzogeyAuLi5iYXNlQ29uZmlnLm1vbml0b3JpbmcsIC4uLm92ZXJyaWRlcy5tb25pdG9yaW5nIH0sXG4gIH07XG59XG4iXX0=