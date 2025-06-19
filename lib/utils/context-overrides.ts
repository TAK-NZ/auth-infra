/**
 * Dynamic context override utilities
 * Simplified flat parameter system for command-line context overrides
 */

import * as cdk from 'aws-cdk-lib';
import { ContextEnvironmentConfig } from '../stack-config';

export function applyContextOverrides(
  app: cdk.App, 
  baseConfig: ContextEnvironmentConfig
): ContextEnvironmentConfig {
  const topLevelOverrides = {
    stackName: app.node.tryGetContext('stackName'),
  };

  return {
    ...baseConfig,
    ...Object.fromEntries(Object.entries(topLevelOverrides).filter(([_, v]) => v !== undefined)),
    database: {
      ...baseConfig.database,
      instanceClass: app.node.tryGetContext('instanceClass') ?? baseConfig.database.instanceClass,
      instanceCount: app.node.tryGetContext('instanceCount') ?? baseConfig.database.instanceCount,
      allocatedStorage: app.node.tryGetContext('allocatedStorage') ?? baseConfig.database.allocatedStorage,
      maxAllocatedStorage: app.node.tryGetContext('maxAllocatedStorage') ?? baseConfig.database.maxAllocatedStorage,
      enablePerformanceInsights: app.node.tryGetContext('enablePerformanceInsights') ?? baseConfig.database.enablePerformanceInsights,
      monitoringInterval: app.node.tryGetContext('monitoringInterval') ?? baseConfig.database.monitoringInterval,
      backupRetentionDays: app.node.tryGetContext('backupRetentionDays') ?? baseConfig.database.backupRetentionDays,
      deleteProtection: app.node.tryGetContext('deleteProtection') ?? baseConfig.database.deleteProtection,
    },
    redis: {
      ...baseConfig.redis,
      nodeType: app.node.tryGetContext('nodeType') ?? baseConfig.redis.nodeType,
      numCacheNodes: app.node.tryGetContext('numCacheNodes') ?? baseConfig.redis.numCacheNodes,
      enableTransit: app.node.tryGetContext('enableTransit') ?? baseConfig.redis.enableTransit,
      enableAtRest: app.node.tryGetContext('enableAtRest') ?? baseConfig.redis.enableAtRest,
    },
    ecs: {
      ...baseConfig.ecs,
      taskCpu: app.node.tryGetContext('taskCpu') ?? baseConfig.ecs.taskCpu,
      taskMemory: app.node.tryGetContext('taskMemory') ?? baseConfig.ecs.taskMemory,
      desiredCount: app.node.tryGetContext('desiredCount') ?? baseConfig.ecs.desiredCount,
      enableDetailedLogging: app.node.tryGetContext('enableDetailedLogging') ?? baseConfig.ecs.enableDetailedLogging,
    },
    authentik: {
      ...baseConfig.authentik,
      domain: app.node.tryGetContext('authentikDomain') ?? baseConfig.authentik.domain,
      adminUserEmail: app.node.tryGetContext('adminUserEmail') ?? baseConfig.authentik.adminUserEmail,
    },
    ldap: {
      ...baseConfig.ldap,
      domain: app.node.tryGetContext('ldapDomain') ?? baseConfig.ldap.domain,
    },
    general: {
      ...baseConfig.general,
      removalPolicy: app.node.tryGetContext('removalPolicy') || baseConfig.general.removalPolicy,
      enableDetailedLogging: app.node.tryGetContext('enableDetailedLogging') ?? baseConfig.general.enableDetailedLogging,
      enableContainerInsights: app.node.tryGetContext('enableContainerInsights') ?? baseConfig.general.enableContainerInsights,
    },
  };
}
