/**
 * Dynamic context override utilities
 * Simplified flat parameter system for command-line context overrides
 */

import * as cdk from 'aws-cdk-lib';
import { ContextEnvironmentConfig } from '../stack-config';

/**
 * Convert string context parameter to boolean
 */
function contextBoolean(app: cdk.App, key: string, defaultValue: boolean | undefined): boolean {
  const value = app.node.tryGetContext(key);
  if (value === undefined) return defaultValue ?? false;
  return value === 'true' || value === true;
}

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
      instanceCount: Number(app.node.tryGetContext('instanceCount')) || baseConfig.database.instanceCount,
      engineVersion: app.node.tryGetContext('engineVersion') ?? baseConfig.database.engineVersion,
      allocatedStorage: Number(app.node.tryGetContext('allocatedStorage')) || baseConfig.database.allocatedStorage,
      maxAllocatedStorage: Number(app.node.tryGetContext('maxAllocatedStorage')) || baseConfig.database.maxAllocatedStorage,
      enablePerformanceInsights: contextBoolean(app, 'enablePerformanceInsights', baseConfig.database.enablePerformanceInsights),
      monitoringInterval: Number(app.node.tryGetContext('monitoringInterval')) || baseConfig.database.monitoringInterval,
      backupRetentionDays: Number(app.node.tryGetContext('backupRetentionDays')) || baseConfig.database.backupRetentionDays,
      deleteProtection: contextBoolean(app, 'deleteProtection', baseConfig.database.deleteProtection),
      enableCloudWatchLogs: contextBoolean(app, 'enableCloudWatchLogs', baseConfig.database.enableCloudWatchLogs),
    },
    redis: {
      ...baseConfig.redis,
      nodeType: app.node.tryGetContext('nodeType') ?? baseConfig.redis.nodeType,
      numCacheNodes: Number(app.node.tryGetContext('numCacheNodes')) || baseConfig.redis.numCacheNodes,
    },
    ecs: {
      ...baseConfig.ecs,
      taskCpu: Number(app.node.tryGetContext('taskCpu')) || baseConfig.ecs.taskCpu,
      taskMemory: Number(app.node.tryGetContext('taskMemory')) || baseConfig.ecs.taskMemory,
      desiredCount: Number(app.node.tryGetContext('desiredCount')) || baseConfig.ecs.desiredCount,
      enableDetailedLogging: contextBoolean(app, 'enableDetailedLogging', baseConfig.ecs.enableDetailedLogging),
      enableEcsExec: contextBoolean(app, 'enableEcsExec', baseConfig.ecs.enableEcsExec),
    },
    authentik: {
      ...baseConfig.authentik,
      hostname: app.node.tryGetContext('authentikHostname') ?? baseConfig.authentik.hostname,
      adminUserEmail: app.node.tryGetContext('adminUserEmail') ?? baseConfig.authentik.adminUserEmail,
      ldapHostname: app.node.tryGetContext('ldapHostname') ?? baseConfig.authentik.ldapHostname,
      ldapBaseDn: app.node.tryGetContext('ldapBaseDn') ?? baseConfig.authentik.ldapBaseDn,
      useS3AuthentikConfigFile: contextBoolean(app, 'useS3AuthentikConfigFile', baseConfig.authentik.useS3AuthentikConfigFile),
      enablePostgresReadReplicas: contextBoolean(app, 'enablePostgresReadReplicas', baseConfig.authentik.enablePostgresReadReplicas),
      branding: app.node.tryGetContext('branding') ?? baseConfig.authentik.branding,
      authentikVersion: app.node.tryGetContext('authentikVersion') ?? baseConfig.authentik.authentikVersion,
      buildRevision: Number(app.node.tryGetContext('buildRevision')) || baseConfig.authentik.buildRevision,
      outboundEmailServerPort: Number(app.node.tryGetContext('outboundEmailServerPort')) || baseConfig.authentik.outboundEmailServerPort,
    },
    ecr: {
      imageRetentionCount: Number(app.node.tryGetContext('imageRetentionCount')) || baseConfig.ecr.imageRetentionCount,
      scanOnPush: contextBoolean(app, 'scanOnPush', baseConfig.ecr.scanOnPush),
    },
    general: {
      ...baseConfig.general,
      removalPolicy: app.node.tryGetContext('removalPolicy') || baseConfig.general.removalPolicy,
      enableDetailedLogging: contextBoolean(app, 'enableDetailedLogging', baseConfig.general.enableDetailedLogging),
      enableContainerInsights: contextBoolean(app, 'enableContainerInsights', baseConfig.general.enableContainerInsights),
    },
    docker: {
      ...baseConfig.docker,
      authentikImageTag: app.node.tryGetContext('authentikImageTag') ?? baseConfig.docker?.authentikImageTag,
      ldapImageTag: app.node.tryGetContext('ldapImageTag') ?? baseConfig.docker?.ldapImageTag,
    },
  };
}
