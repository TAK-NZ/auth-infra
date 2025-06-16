/**
 * Environment-specific configuration for auth infrastructure resources
 */
import * as cdk from 'aws-cdk-lib';

/**
 * Environment-specific configuration for auth infrastructure resources
 */
export interface AuthInfraEnvironmentConfig {
  // Database configuration
  database: {
    instanceClass: string;                // RDS instance class (e.g., 'db.serverless', 'db.t4g.large')
    instanceCount: number;                // Number of database instances
    backupRetentionDays: number;          // Backup retention period in days
    deletionProtection: boolean;          // Enable deletion protection
    enablePerformanceInsights: boolean;   // Enable RDS Performance Insights
    enableMonitoring: boolean;            // Enable enhanced monitoring
  };
  
  // Redis configuration
  redis: {
    nodeType: string;                     // ElastiCache node type
    numCacheClusters: number;             // Number of cache clusters
    automaticFailoverEnabled: boolean;    // Enable automatic failover
  };
  
  // ECS configuration
  ecs: {
    taskCpu: number;                      // CPU units for ECS tasks
    taskMemory: number;                   // Memory (MB) for ECS tasks
    desiredCount: number;                 // Desired number of server tasks
    minCapacity: number;                  // Minimum capacity for auto scaling
    maxCapacity: number;                  // Maximum capacity for auto scaling
    workerDesiredCount?: number;          // Desired number of worker tasks
    workerMinCapacity?: number;           // Minimum worker capacity
    workerMaxCapacity?: number;           // Maximum worker capacity
  };
  
  // EFS configuration
  efs: {
    throughputMode: 'bursting' | 'provisioned';  // EFS throughput mode
    provisionedThroughput?: number;               // Provisioned throughput (MB/s)
    removalPolicy: cdk.RemovalPolicy;            // EFS file system removal policy
  };

  // General infrastructure settings
  general: {
    removalPolicy: cdk.RemovalPolicy;     // Resource removal policy
    enableDetailedLogging: boolean;       // Enable detailed CloudWatch logging
  };

  // Monitoring configuration
  monitoring: {
    enableCloudWatchAlarms: boolean;      // Enable CloudWatch alarms
    logRetentionDays: number;             // Log retention period in days
  };
}

/**
 * Development/Test environment configuration
 * Optimized for cost and development workflow
 */
export const DEV_TEST_CONFIG: AuthInfraEnvironmentConfig = {
  database: {
    instanceClass: 'db.serverless',      // Aurora Serverless v2 for cost optimization
    instanceCount: 1,                    // Single instance for dev/test
    backupRetentionDays: 1,              // Minimal backup retention
    deletionProtection: false,           // Allow deletion for dev/test
    enablePerformanceInsights: false,    // Disable to save costs
    enableMonitoring: false,             // Disable enhanced monitoring
  },
  redis: {
    nodeType: 'cache.t4g.micro',         // Smallest instance for cost optimization
    numCacheClusters: 1,                 // Single cluster
    automaticFailoverEnabled: false,     // Disable failover for cost savings
  },
  ecs: {
    taskCpu: 512,                        // Minimal CPU allocation
    taskMemory: 1024,                    // Minimal memory allocation
    desiredCount: 1,                     // Single server instance
    minCapacity: 1,                      // Minimum scaling capacity
    maxCapacity: 3,                      // Limited scaling for cost control
    workerDesiredCount: 1,               // Single worker instance
    workerMinCapacity: 1,                // Minimum worker capacity
    workerMaxCapacity: 2,                // Limited worker scaling
  },
  efs: {
    throughputMode: 'bursting',          // Bursting mode for cost optimization
    removalPolicy: cdk.RemovalPolicy.DESTROY,  // Delete EFS in dev/test environments
  },
  general: {
    removalPolicy: cdk.RemovalPolicy.DESTROY,  // Allow resource deletion
    enableDetailedLogging: true,               // Keep logging for debugging
  },
  monitoring: {
    enableCloudWatchAlarms: false,       // Disable alarms to save costs
    logRetentionDays: 7,                 // Short retention for cost savings
  },
};

/**
 * Production environment configuration
 * Optimized for high availability, security, and production workloads
 */
export const PROD_CONFIG: AuthInfraEnvironmentConfig = {
  database: {
    instanceClass: 'db.t4g.large',       // Larger instance for production workloads
    instanceCount: 2,                    // Multi-AZ deployment for high availability
    backupRetentionDays: 7,              // Extended backup retention
    deletionProtection: true,            // Protect production data
    enablePerformanceInsights: true,     // Enable performance monitoring
    enableMonitoring: true,              // Enable enhanced monitoring
  },
  redis: {
    nodeType: 'cache.t4g.small',         // Adequate size for production
    numCacheClusters: 2,                 // Multi-node for high availability
    automaticFailoverEnabled: true,      // Enable automatic failover
  },
  ecs: {
    taskCpu: 1024,                       // Higher CPU for production performance
    taskMemory: 2048,                    // Higher memory for production performance
    desiredCount: 2,                     // Multiple instances for availability
    minCapacity: 2,                      // Minimum production capacity
    maxCapacity: 6,                      // Higher scaling limits
    workerDesiredCount: 2,               // Multiple worker instances
    workerMinCapacity: 1,                // Minimum worker capacity
    workerMaxCapacity: 4,                // Higher worker scaling limits
  },
  efs: {
    throughputMode: 'bursting',          // Bursting mode for most workloads
    removalPolicy: cdk.RemovalPolicy.RETAIN,  // Retain EFS in production environments
  },
  general: {
    removalPolicy: cdk.RemovalPolicy.RETAIN,  // Protect production resources
    enableDetailedLogging: true,              // Enable detailed logging
  },
  monitoring: {
    enableCloudWatchAlarms: true,        // Enable production monitoring
    logRetentionDays: 30,                // Extended log retention
  },
};

/**
 * Get environment configuration based on environment type
 */
export function getEnvironmentConfig(envType: string): AuthInfraEnvironmentConfig {
  switch (envType.toLowerCase()) {
    case 'prod':
    case 'production':
      return PROD_CONFIG;
    case 'dev':
    case 'dev-test':
    case 'development':
    default:
      return DEV_TEST_CONFIG;
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
  return {
    database: { ...baseConfig.database, ...overrides.database },
    redis: { ...baseConfig.redis, ...overrides.redis },
    ecs: { ...baseConfig.ecs, ...overrides.ecs },
    efs: { ...baseConfig.efs, ...overrides.efs },
    general: { ...baseConfig.general, ...overrides.general },
    monitoring: { ...baseConfig.monitoring, ...overrides.monitoring },
  };
}
