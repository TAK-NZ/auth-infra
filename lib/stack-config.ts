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
  r53ZoneName: string;
  vpcCidr?: string;
  networking: {
    createNatGateways: boolean;
    createVpcEndpoints: boolean;
  };
  database: {
    instanceClass: string;
    instanceCount: number;
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
  };
  authentik: {
    domain: string;
    adminUserEmail: string;
  };
  ldap: {
    domain: string;
  };
  general: {
    removalPolicy: string;
    enableDetailedLogging: boolean;
    enableContainerInsights: boolean;
  };
}
