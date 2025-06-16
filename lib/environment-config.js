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
exports.PROD_CONFIG = {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW52aXJvbm1lbnQtY29uZmlnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZW52aXJvbm1lbnQtY29uZmlnLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBZ0pBLG9EQVdDO0FBTUQsd0RBb0JDO0FBckxEOzs7R0FHRztBQUNILGlEQUFtQztBQXFEbkM7OztHQUdHO0FBQ1UsUUFBQSxVQUFVLEdBQStCO0lBQ3BELFFBQVEsRUFBRTtRQUNSLGFBQWEsRUFBRSxlQUFlO1FBQzlCLGFBQWEsRUFBRSxDQUFDO1FBQ2hCLG1CQUFtQixFQUFFLENBQUM7UUFDdEIsa0JBQWtCLEVBQUUsS0FBSztRQUN6Qix5QkFBeUIsRUFBRSxLQUFLO1FBQ2hDLGdCQUFnQixFQUFFLEtBQUs7S0FDeEI7SUFDRCxLQUFLLEVBQUU7UUFDTCxRQUFRLEVBQUUsaUJBQWlCO1FBQzNCLGdCQUFnQixFQUFFLENBQUM7UUFDbkIsd0JBQXdCLEVBQUUsS0FBSztLQUNoQztJQUNELEdBQUcsRUFBRTtRQUNILE9BQU8sRUFBRSxHQUFHO1FBQ1osVUFBVSxFQUFFLElBQUk7UUFDaEIsWUFBWSxFQUFFLENBQUM7UUFDZixXQUFXLEVBQUUsQ0FBQztRQUNkLFdBQVcsRUFBRSxDQUFDO1FBQ2Qsa0JBQWtCLEVBQUUsQ0FBQztRQUNyQixpQkFBaUIsRUFBRSxDQUFDO1FBQ3BCLGlCQUFpQixFQUFFLENBQUM7S0FDckI7SUFDRCxHQUFHLEVBQUU7UUFDSCxjQUFjLEVBQUUsVUFBVTtLQUMzQjtJQUNELE9BQU8sRUFBRTtRQUNQLGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU87UUFDeEMscUJBQXFCLEVBQUUsSUFBSTtLQUM1QjtJQUNELFVBQVUsRUFBRTtRQUNWLHNCQUFzQixFQUFFLEtBQUs7UUFDN0IsZ0JBQWdCLEVBQUUsQ0FBQztLQUNwQjtDQUNGLENBQUM7QUFFRjs7O0dBR0c7QUFDVSxRQUFBLFdBQVcsR0FBK0I7SUFDckQsUUFBUSxFQUFFO1FBQ1IsYUFBYSxFQUFFLGNBQWM7UUFDN0IsYUFBYSxFQUFFLENBQUM7UUFDaEIsbUJBQW1CLEVBQUUsQ0FBQztRQUN0QixrQkFBa0IsRUFBRSxJQUFJO1FBQ3hCLHlCQUF5QixFQUFFLElBQUk7UUFDL0IsZ0JBQWdCLEVBQUUsSUFBSTtLQUN2QjtJQUNELEtBQUssRUFBRTtRQUNMLFFBQVEsRUFBRSxpQkFBaUI7UUFDM0IsZ0JBQWdCLEVBQUUsQ0FBQztRQUNuQix3QkFBd0IsRUFBRSxJQUFJO0tBQy9CO0lBQ0QsR0FBRyxFQUFFO1FBQ0gsT0FBTyxFQUFFLElBQUk7UUFDYixVQUFVLEVBQUUsSUFBSTtRQUNoQixZQUFZLEVBQUUsQ0FBQztRQUNmLFdBQVcsRUFBRSxDQUFDO1FBQ2QsV0FBVyxFQUFFLENBQUM7UUFDZCxrQkFBa0IsRUFBRSxDQUFDO1FBQ3JCLGlCQUFpQixFQUFFLENBQUM7UUFDcEIsaUJBQWlCLEVBQUUsQ0FBQztLQUNyQjtJQUNELEdBQUcsRUFBRTtRQUNILGNBQWMsRUFBRSxVQUFVO0tBQzNCO0lBQ0QsT0FBTyxFQUFFO1FBQ1AsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTTtRQUN2QyxxQkFBcUIsRUFBRSxJQUFJO0tBQzVCO0lBQ0QsVUFBVSxFQUFFO1FBQ1Ysc0JBQXNCLEVBQUUsSUFBSTtRQUM1QixnQkFBZ0IsRUFBRSxFQUFFO0tBQ3JCO0NBQ0YsQ0FBQztBQUVGOzs7O0dBSUc7QUFDSCxTQUFnQixvQkFBb0IsQ0FBQyxPQUFlO0lBQ2xELFFBQVEsT0FBTyxFQUFFLENBQUM7UUFDaEIsS0FBSyxNQUFNLENBQUM7UUFDWixLQUFLLFlBQVk7WUFDZixPQUFPLG1CQUFXLENBQUM7UUFDckIsS0FBSyxLQUFLLENBQUM7UUFDWCxLQUFLLFVBQVUsQ0FBQztRQUNoQixLQUFLLGFBQWEsQ0FBQztRQUNuQjtZQUNFLE9BQU8sa0JBQVUsQ0FBQztJQUN0QixDQUFDO0FBQ0gsQ0FBQztBQUVEOzs7R0FHRztBQUNILFNBQWdCLHNCQUFzQixDQUNwQyxVQUFzQyxFQUN0QyxTQU9DO0lBRUQsK0JBQStCO0lBQy9CLE9BQU87UUFDTCxRQUFRLEVBQUUsRUFBRSxHQUFHLFVBQVUsQ0FBQyxRQUFRLEVBQUUsR0FBRyxTQUFTLENBQUMsUUFBUSxFQUFFO1FBQzNELEtBQUssRUFBRSxFQUFFLEdBQUcsVUFBVSxDQUFDLEtBQUssRUFBRSxHQUFHLFNBQVMsQ0FBQyxLQUFLLEVBQUU7UUFDbEQsR0FBRyxFQUFFLEVBQUUsR0FBRyxVQUFVLENBQUMsR0FBRyxFQUFFLEdBQUcsU0FBUyxDQUFDLEdBQUcsRUFBRTtRQUM1QyxHQUFHLEVBQUUsRUFBRSxHQUFHLFVBQVUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxTQUFTLENBQUMsR0FBRyxFQUFFO1FBQzVDLE9BQU8sRUFBRSxFQUFFLEdBQUcsVUFBVSxDQUFDLE9BQU8sRUFBRSxHQUFHLFNBQVMsQ0FBQyxPQUFPLEVBQUU7UUFDeEQsVUFBVSxFQUFFLEVBQUUsR0FBRyxVQUFVLENBQUMsVUFBVSxFQUFFLEdBQUcsU0FBUyxDQUFDLFVBQVUsRUFBRTtLQUNsRSxDQUFDO0FBQ0osQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogRW52aXJvbm1lbnQtc3BlY2lmaWMgY29uZmlndXJhdGlvbiBvYmplY3RzIGFuZCB1dGlsaXRpZXNcbiAqIFB1cmUgY29uZmlndXJhdGlvbiBhcHByb2FjaCBmb2xsb3dpbmcgcmVmZXJlbmNlIHRlbXBsYXRlIHBhdHRlcm5cbiAqL1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcblxuLyoqXG4gKiBFbnZpcm9ubWVudC1zcGVjaWZpYyBjb25maWd1cmF0aW9uIGZvciBhdXRoIGluZnJhc3RydWN0dXJlIHJlc291cmNlc1xuICovXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnIHtcbiAgLy8gRGF0YWJhc2UgY29uZmlndXJhdGlvblxuICBkYXRhYmFzZToge1xuICAgIGluc3RhbmNlQ2xhc3M6IHN0cmluZztcbiAgICBpbnN0YW5jZUNvdW50OiBudW1iZXI7XG4gICAgYmFja3VwUmV0ZW50aW9uRGF5czogbnVtYmVyO1xuICAgIGRlbGV0aW9uUHJvdGVjdGlvbjogYm9vbGVhbjtcbiAgICBlbmFibGVQZXJmb3JtYW5jZUluc2lnaHRzOiBib29sZWFuO1xuICAgIGVuYWJsZU1vbml0b3Jpbmc6IGJvb2xlYW47XG4gIH07XG4gIFxuICAvLyBSZWRpcyBjb25maWd1cmF0aW9uXG4gIHJlZGlzOiB7XG4gICAgbm9kZVR5cGU6IHN0cmluZztcbiAgICBudW1DYWNoZUNsdXN0ZXJzOiBudW1iZXI7XG4gICAgYXV0b21hdGljRmFpbG92ZXJFbmFibGVkOiBib29sZWFuO1xuICB9O1xuICBcbiAgLy8gRUNTIGNvbmZpZ3VyYXRpb25cbiAgZWNzOiB7XG4gICAgdGFza0NwdTogbnVtYmVyO1xuICAgIHRhc2tNZW1vcnk6IG51bWJlcjtcbiAgICBkZXNpcmVkQ291bnQ6IG51bWJlcjtcbiAgICBtaW5DYXBhY2l0eTogbnVtYmVyO1xuICAgIG1heENhcGFjaXR5OiBudW1iZXI7XG4gICAgd29ya2VyRGVzaXJlZENvdW50PzogbnVtYmVyO1xuICAgIHdvcmtlck1pbkNhcGFjaXR5PzogbnVtYmVyO1xuICAgIHdvcmtlck1heENhcGFjaXR5PzogbnVtYmVyO1xuICB9O1xuICAgLy8gRUZTIGNvbmZpZ3VyYXRpb25cbiAgZWZzOiB7XG4gICAgdGhyb3VnaHB1dE1vZGU6ICdidXJzdGluZycgfCAncHJvdmlzaW9uZWQnO1xuICAgIHByb3Zpc2lvbmVkVGhyb3VnaHB1dD86IG51bWJlcjtcbiAgfTtcblxuICAvLyBHZW5lcmFsIGluZnJhc3RydWN0dXJlIHNldHRpbmdzXG4gIGdlbmVyYWw6IHtcbiAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeTtcbiAgICBlbmFibGVEZXRhaWxlZExvZ2dpbmc6IGJvb2xlYW47XG4gIH07XG5cbiAgLy8gTW9uaXRvcmluZyBjb25maWd1cmF0aW9uXG4gIG1vbml0b3Jpbmc6IHtcbiAgICBlbmFibGVDbG91ZFdhdGNoQWxhcm1zOiBib29sZWFuO1xuICAgIGxvZ1JldGVudGlvbkRheXM6IG51bWJlcjtcbiAgfTtcbn1cblxuLyoqXG4gKiBEZXZlbG9wbWVudC9UZXN0IGVudmlyb25tZW50IGNvbmZpZ3VyYXRpb25cbiAqIE9wdGltaXplZCBmb3IgY29zdCBhbmQgZGV2ZWxvcG1lbnQgd29ya2Zsb3dcbiAqL1xuZXhwb3J0IGNvbnN0IERFVl9DT05GSUc6IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnID0ge1xuICBkYXRhYmFzZToge1xuICAgIGluc3RhbmNlQ2xhc3M6ICdkYi5zZXJ2ZXJsZXNzJyxcbiAgICBpbnN0YW5jZUNvdW50OiAxLFxuICAgIGJhY2t1cFJldGVudGlvbkRheXM6IDEsXG4gICAgZGVsZXRpb25Qcm90ZWN0aW9uOiBmYWxzZSxcbiAgICBlbmFibGVQZXJmb3JtYW5jZUluc2lnaHRzOiBmYWxzZSxcbiAgICBlbmFibGVNb25pdG9yaW5nOiBmYWxzZSxcbiAgfSxcbiAgcmVkaXM6IHtcbiAgICBub2RlVHlwZTogJ2NhY2hlLnQ0Zy5taWNybycsXG4gICAgbnVtQ2FjaGVDbHVzdGVyczogMSxcbiAgICBhdXRvbWF0aWNGYWlsb3ZlckVuYWJsZWQ6IGZhbHNlLFxuICB9LFxuICBlY3M6IHtcbiAgICB0YXNrQ3B1OiA1MTIsXG4gICAgdGFza01lbW9yeTogMTAyNCxcbiAgICBkZXNpcmVkQ291bnQ6IDEsXG4gICAgbWluQ2FwYWNpdHk6IDEsXG4gICAgbWF4Q2FwYWNpdHk6IDMsXG4gICAgd29ya2VyRGVzaXJlZENvdW50OiAxLFxuICAgIHdvcmtlck1pbkNhcGFjaXR5OiAxLFxuICAgIHdvcmtlck1heENhcGFjaXR5OiAyLFxuICB9LFxuICBlZnM6IHtcbiAgICB0aHJvdWdocHV0TW9kZTogJ2J1cnN0aW5nJyxcbiAgfSxcbiAgZ2VuZXJhbDoge1xuICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgZW5hYmxlRGV0YWlsZWRMb2dnaW5nOiB0cnVlLFxuICB9LFxuICBtb25pdG9yaW5nOiB7XG4gICAgZW5hYmxlQ2xvdWRXYXRjaEFsYXJtczogZmFsc2UsXG4gICAgbG9nUmV0ZW50aW9uRGF5czogNyxcbiAgfSxcbn07XG5cbi8qKlxuICogUHJvZHVjdGlvbiBlbnZpcm9ubWVudCBjb25maWd1cmF0aW9uXG4gKiBPcHRpbWl6ZWQgZm9yIGhpZ2ggYXZhaWxhYmlsaXR5LCBzZWN1cml0eSwgYW5kIHByb2R1Y3Rpb24gd29ya2xvYWRzXG4gKi9cbmV4cG9ydCBjb25zdCBQUk9EX0NPTkZJRzogQXV0aEluZnJhRW52aXJvbm1lbnRDb25maWcgPSB7XG4gIGRhdGFiYXNlOiB7XG4gICAgaW5zdGFuY2VDbGFzczogJ2RiLnQ0Zy5sYXJnZScsXG4gICAgaW5zdGFuY2VDb3VudDogMixcbiAgICBiYWNrdXBSZXRlbnRpb25EYXlzOiA3LFxuICAgIGRlbGV0aW9uUHJvdGVjdGlvbjogdHJ1ZSxcbiAgICBlbmFibGVQZXJmb3JtYW5jZUluc2lnaHRzOiB0cnVlLFxuICAgIGVuYWJsZU1vbml0b3Jpbmc6IHRydWUsXG4gIH0sXG4gIHJlZGlzOiB7XG4gICAgbm9kZVR5cGU6ICdjYWNoZS50NGcuc21hbGwnLFxuICAgIG51bUNhY2hlQ2x1c3RlcnM6IDIsXG4gICAgYXV0b21hdGljRmFpbG92ZXJFbmFibGVkOiB0cnVlLFxuICB9LFxuICBlY3M6IHtcbiAgICB0YXNrQ3B1OiAxMDI0LFxuICAgIHRhc2tNZW1vcnk6IDIwNDgsXG4gICAgZGVzaXJlZENvdW50OiAyLFxuICAgIG1pbkNhcGFjaXR5OiAyLFxuICAgIG1heENhcGFjaXR5OiA2LFxuICAgIHdvcmtlckRlc2lyZWRDb3VudDogMixcbiAgICB3b3JrZXJNaW5DYXBhY2l0eTogMSxcbiAgICB3b3JrZXJNYXhDYXBhY2l0eTogNCxcbiAgfSxcbiAgZWZzOiB7XG4gICAgdGhyb3VnaHB1dE1vZGU6ICdidXJzdGluZycsXG4gIH0sXG4gIGdlbmVyYWw6IHtcbiAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgZW5hYmxlRGV0YWlsZWRMb2dnaW5nOiB0cnVlLFxuICB9LFxuICBtb25pdG9yaW5nOiB7XG4gICAgZW5hYmxlQ2xvdWRXYXRjaEFsYXJtczogdHJ1ZSxcbiAgICBsb2dSZXRlbnRpb25EYXlzOiAzMCxcbiAgfSxcbn07XG5cbi8qKlxuICogR2V0IGVudmlyb25tZW50LXNwZWNpZmljIGNvbmZpZ3VyYXRpb24gYmFzZWQgb24gdGhlIHByb3ZpZGVkIGVudmlyb25tZW50IHR5cGVcbiAqIEBwYXJhbSBlbnZUeXBlIC0gRW52aXJvbm1lbnQgdHlwZSAoJ3Byb2QnLCAnZGV2LXRlc3QnLCAnc3RhZ2luZycsIGV0Yy4pXG4gKiBAcmV0dXJucyBFbnZpcm9ubWVudC1zcGVjaWZpYyBjb25maWd1cmF0aW9uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRFbnZpcm9ubWVudENvbmZpZyhlbnZUeXBlOiBzdHJpbmcpOiBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZyB7XG4gIHN3aXRjaCAoZW52VHlwZSkge1xuICAgIGNhc2UgJ3Byb2QnOlxuICAgIGNhc2UgJ3Byb2R1Y3Rpb24nOlxuICAgICAgcmV0dXJuIFBST0RfQ09ORklHO1xuICAgIGNhc2UgJ2Rldic6XG4gICAgY2FzZSAnZGV2LXRlc3QnOlxuICAgIGNhc2UgJ2RldmVsb3BtZW50JzpcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIERFVl9DT05GSUc7XG4gIH1cbn1cblxuLyoqXG4gKiBNZXJnZSBlbnZpcm9ubWVudCBjb25maWcgd2l0aCBjdXN0b20gb3ZlcnJpZGVzXG4gKiBBbGxvd3MgZmluZS1ncmFpbmVkIGNvbnRyb2wgb3ZlciBpbmRpdmlkdWFsIHNldHRpbmdzXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZXJnZUVudmlyb25tZW50Q29uZmlnKFxuICBiYXNlQ29uZmlnOiBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZyxcbiAgb3ZlcnJpZGVzOiB7XG4gICAgZGF0YWJhc2U/OiBQYXJ0aWFsPEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnWydkYXRhYmFzZSddPjtcbiAgICByZWRpcz86IFBhcnRpYWw8QXV0aEluZnJhRW52aXJvbm1lbnRDb25maWdbJ3JlZGlzJ10+O1xuICAgIGVjcz86IFBhcnRpYWw8QXV0aEluZnJhRW52aXJvbm1lbnRDb25maWdbJ2VjcyddPjtcbiAgICBlZnM/OiBQYXJ0aWFsPEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnWydlZnMnXT47XG4gICAgZ2VuZXJhbD86IFBhcnRpYWw8QXV0aEluZnJhRW52aXJvbm1lbnRDb25maWdbJ2dlbmVyYWwnXT47XG4gICAgbW9uaXRvcmluZz86IFBhcnRpYWw8QXV0aEluZnJhRW52aXJvbm1lbnRDb25maWdbJ21vbml0b3JpbmcnXT47XG4gIH1cbik6IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnIHtcbiAgLy8gRGVlcCBtZXJnZSB0aGUgY29uZmlndXJhdGlvblxuICByZXR1cm4ge1xuICAgIGRhdGFiYXNlOiB7IC4uLmJhc2VDb25maWcuZGF0YWJhc2UsIC4uLm92ZXJyaWRlcy5kYXRhYmFzZSB9LFxuICAgIHJlZGlzOiB7IC4uLmJhc2VDb25maWcucmVkaXMsIC4uLm92ZXJyaWRlcy5yZWRpcyB9LFxuICAgIGVjczogeyAuLi5iYXNlQ29uZmlnLmVjcywgLi4ub3ZlcnJpZGVzLmVjcyB9LFxuICAgIGVmczogeyAuLi5iYXNlQ29uZmlnLmVmcywgLi4ub3ZlcnJpZGVzLmVmcyB9LFxuICAgIGdlbmVyYWw6IHsgLi4uYmFzZUNvbmZpZy5nZW5lcmFsLCAuLi5vdmVycmlkZXMuZ2VuZXJhbCB9LFxuICAgIG1vbml0b3Jpbmc6IHsgLi4uYmFzZUNvbmZpZy5tb25pdG9yaW5nLCAuLi5vdmVycmlkZXMubW9uaXRvcmluZyB9LFxuICB9O1xufVxuIl19