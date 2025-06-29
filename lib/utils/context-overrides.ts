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
      numCacheNodes: Number(app.node.tryGetContext('numCacheNodes')) || baseConfig.redis.numCacheNodes,
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
      hostname: app.node.tryGetContext('authentikHostname') ?? baseConfig.authentik.hostname,
      adminUserEmail: app.node.tryGetContext('adminUserEmail') ?? baseConfig.authentik.adminUserEmail,
      ldapHostname: app.node.tryGetContext('ldapHostname') ?? baseConfig.authentik.ldapHostname,
      ldapBaseDn: app.node.tryGetContext('ldapBaseDn') ?? baseConfig.authentik.ldapBaseDn,
      useS3AuthentikConfigFile: app.node.tryGetContext('useS3AuthentikConfigFile') ?? baseConfig.authentik.useS3AuthentikConfigFile,
      enablePostgresReadReplicas: app.node.tryGetContext('enablePostgresReadReplicas') ?? baseConfig.authentik.enablePostgresReadReplicas,
      branding: app.node.tryGetContext('branding') ?? baseConfig.authentik.branding,
      authentikVersion: app.node.tryGetContext('authentikVersion') ?? baseConfig.authentik.authentikVersion,
      buildRevision: Number(app.node.tryGetContext('buildRevision')) || baseConfig.authentik.buildRevision,
    },
    ecr: {
      imageRetentionCount: app.node.tryGetContext('imageRetentionCount') ?? baseConfig.ecr.imageRetentionCount,
      scanOnPush: app.node.tryGetContext('scanOnPush') ?? baseConfig.ecr.scanOnPush,
    },
    general: {
      ...baseConfig.general,
      removalPolicy: app.node.tryGetContext('removalPolicy') || baseConfig.general.removalPolicy,
      enableDetailedLogging: app.node.tryGetContext('enableDetailedLogging') ?? baseConfig.general.enableDetailedLogging,
      enableContainerInsights: app.node.tryGetContext('enableContainerInsights') ?? baseConfig.general.enableContainerInsights,
    },
    docker: {
      ...baseConfig.docker,
      authentikImageTag: app.node.tryGetContext('authentikImageTag') ?? baseConfig.docker?.authentikImageTag,
      ldapImageTag: app.node.tryGetContext('ldapImageTag') ?? baseConfig.docker?.ldapImageTag,
    },
  };
}
