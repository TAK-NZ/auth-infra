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
    enableCloudWatchLogs?: boolean;
  };

  ecs: {
    server: {
      taskCpu: number;
      taskMemory: number;
    };
    worker: {
      taskCpu: number;
      taskMemory: number;
    };
    ldap: {
      taskCpu: number;
      taskMemory: number;
    };
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
    /**
     * Enable routing Authentik read queries to the Aurora reader instance/endpoint.
     * Defaults to false. Requires Authentik 2026.2.0 or later, which fixes first-deploy
     * failures when read replicas are enabled (goauthentik/authentik#15191, PR #19086).
     */
    enablePostgresReadReplicas?: boolean;
    branding: string;
    authentikVersion: string;
    buildRevision: number;
    outboundEmailServerPort?: number;
  };
  ecr: {
    imageRetentionCount: number;
    scanOnPush: boolean;
  };
  general: {
    removalPolicy: string;
    enableDetailedLogging: boolean;
    enableContainerInsights: boolean;
  };
  docker?: {
    authentikImageTag?: string;
    ldapImageTag?: string;
  };
}
