/**
 * Configuration interface for AuthInfra stack template
 * This makes the stack reusable across different projects and environments
 */

/**
 * Context-based configuration interface matching cdk.context.json structure
 * This is used directly by the stack without complex transformations
 */
/** What a WAF rule does with a matching request */
export type WafAction = 'count' | 'block';

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
    /**
     * Hostname of TAK Team Manager inside the hosted zone. Defaults to `team`. Used for the
     * request-access redirect in the TAK enrollment flow (TAK_TEAM_MANAGER_URL for blueprints).
     */
    teamManagerHostname?: string;
    /**
     * Lock a source IP out of the login and recovery flows after repeated failed logins (Authentik
     * reputation policy plus a deny stage in tak-flows.yaml). Off unless `enabled` is true. Switch it on only
     * when the client IP can be trusted: Authentik takes the leftmost X-Forwarded-For value, so a client can
     * choose its own IP until the WAF blocks client-supplied forwarding headers (see docs/WAF.md).
     */
    ipLock?: {
      enabled: boolean;
      /**
       * Lock at or below this reputation score. Authentik takes one point per failed login or identification,
       * and keeps each (IP, username) score between its tenant limits, -5 and 5 by default. The policy adds up
       * the scores of every username seen from the IP. So -5 means five failures for one username, or five
       * spread over several, and a threshold below -5 needs failures against at least two usernames.
       * Defaults to -5.
       */
      threshold?: number;
      /** How long a failure counts, in seconds (AUTHENTIK_REPUTATION__EXPIRY). Defaults to 900. */
      windowSeconds?: number;
    };
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
  /**
   * AWS WAF on the Authentik load balancer. Optional: without it (or with enabled false) no web ACL is
   * created. Every rule can run as `count` first (metrics and logs only) and be switched to `block`
   * once the counts look right.
   */
  waf?: {
    enabled: boolean;
    /**
     * Requests that already carry X-Forwarded-For, X-Real-IP or Forwarded. Authentik takes the leftmost
     * X-Forwarded-For value as the client IP, so a client-supplied one lets any client choose its IP.
     * Defaults to `count`. Block it only after checking the counts: proxies that add the header to
     * HTTPS traffic (for example TLS-inspecting gateways) would be blocked too.
     */
    forwardingHeaders?: WafAction;
    /**
     * Rate limit per source IP on the flow executor API (the LDAP flow is excluded).
     * Defaults to 300 requests per 5 minutes and `count`.
     */
    rateLimit?: {
      requestsPer5Minutes?: number;
      action?: WafAction;
    };
    /**
     * AWS managed IP reputation list. Defaults to `count`.
     */
    ipReputation?: WafAction;
    /**
     * Retention of the CloudWatch log group that holds matched requests. Defaults to 30.
     */
    logRetentionDays?: number;
  };
  docker?: {
    authentikImageTag?: string;
    ldapImageTag?: string;
  };
}
