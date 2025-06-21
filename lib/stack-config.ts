/**
 * Configuration interface for AuthInfra stack template
 * This makes the stack reusable across different projects and environments
 */

/**
 * Context-based configuration interface matching cdk.context.json structure
 * This is used directly by the stack without complex transformations
 */
export interface ContextEnvironmentConfig {
  stackName: string;
  database: {
    instanceClass: string;
    instanceCount: number;
    engineVersion?: string;
    allocatedStorage: number;
    maxAllocatedStorage: number;
    enablePerformanceInsights: boolean;
    monitoringInterval: number;
    backupRetentionDays: number;
    deleteProtection: boolean;
  };
  redis: {
    nodeType: string;
    numCacheNodes: number;
    enableTransit: boolean;
    enableAtRest: boolean;
  };
  ecs: {
    taskCpu: number;
    taskMemory: number;
    desiredCount: number;
    enableDetailedLogging: boolean;
    enableEcsExec?: boolean;
  };
  authentik: {
    hostname: string;
    adminUserEmail: string;
    ldapHostname: string;
    ldapBaseDn?: string;
    useS3AuthentikConfigFile?: boolean;
    enablePostgresReadReplicas?: boolean;
    branding: string;
    authentikVersion: string;
  };
  general: {
    removalPolicy: string;
    enableDetailedLogging: boolean;
    enableContainerInsights: boolean;
  };
}
