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
     * Defaults to false: read replica support is currently broken in Authentik and
     * requires manual intervention to work correctly.
     * See https://github.com/goauthentik/authentik/issues/15191
     */
    enablePostgresReadReplicas?: boolean;
    branding: string;
    authentikVersion: string;
    buildRevision: number;
    outboundEmailServerPort?: number;
  };
  enrollment?: {
    enrollmentEnabled?: boolean;
    providerName: string;
    applicationName: string;
    applicationSlug?: string;
    enrollmentHostname: string;
    enrollmentIcon?: string;
    openInNewTab?: boolean;
    authenticationFlowName?: string;
    authorizationFlowName?: string;
    invalidationFlowName?: string;
    groupName?: string;
    description?: string;
    listenerPriority?: number;
    signingKeyName?: string;
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
