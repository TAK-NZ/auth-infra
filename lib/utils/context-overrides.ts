/**
 * Dynamic context override utilities
 * Handles command-line context overrides without manual property mapping
 */

import * as cdk from 'aws-cdk-lib';
import { ContextEnvironmentConfig } from '../stack-config';

/**
 * Configuration mapping for context overrides
 * Defines which properties can be overridden and their types
 */
export const OVERRIDE_CONFIG = {
  // Top-level properties
  'r53ZoneName': { type: 'string' as const, path: ['r53ZoneName'] },
  'vpcCidr': { type: 'string' as const, path: ['vpcCidr'] },
  'stackName': { type: 'string' as const, path: ['stackName'] },
  
  // Networking properties
  'networking.createNatGateways': { type: 'boolean' as const, path: ['networking', 'createNatGateways'] },
  'networking.createVpcEndpoints': { type: 'boolean' as const, path: ['networking', 'createVpcEndpoints'] },
  
  // Database properties
  'database.instanceClass': { type: 'string' as const, path: ['database', 'instanceClass'] },
  'database.instanceCount': { type: 'number' as const, path: ['database', 'instanceCount'] },
  'database.allocatedStorage': { type: 'number' as const, path: ['database', 'allocatedStorage'] },
  'database.maxAllocatedStorage': { type: 'number' as const, path: ['database', 'maxAllocatedStorage'] },
  'database.enablePerformanceInsights': { type: 'boolean' as const, path: ['database', 'enablePerformanceInsights'] },
  'database.monitoringInterval': { type: 'number' as const, path: ['database', 'monitoringInterval'] },
  'database.backupRetentionDays': { type: 'number' as const, path: ['database', 'backupRetentionDays'] },
  'database.deleteProtection': { type: 'boolean' as const, path: ['database', 'deleteProtection'] },
  
  // Redis properties
  'redis.nodeType': { type: 'string' as const, path: ['redis', 'nodeType'] },
  'redis.numCacheNodes': { type: 'number' as const, path: ['redis', 'numCacheNodes'] },
  'redis.enableTransit': { type: 'boolean' as const, path: ['redis', 'enableTransit'] },
  'redis.enableAtRest': { type: 'boolean' as const, path: ['redis', 'enableAtRest'] },
  
  // ECS properties
  'ecs.taskCpu': { type: 'number' as const, path: ['ecs', 'taskCpu'] },
  'ecs.taskMemory': { type: 'number' as const, path: ['ecs', 'taskMemory'] },
  'ecs.desiredCount': { type: 'number' as const, path: ['ecs', 'desiredCount'] },
  'ecs.enableDetailedLogging': { type: 'boolean' as const, path: ['ecs', 'enableDetailedLogging'] },
  
  // Authentik properties
  'authentik.domain': { type: 'string' as const, path: ['authentik', 'domain'] },
  'authentik.adminUserEmail': { type: 'string' as const, path: ['authentik', 'adminUserEmail'] },
  
  // LDAP properties
  'ldap.domain': { type: 'string' as const, path: ['ldap', 'domain'] },
  
  // General properties
  'general.removalPolicy': { type: 'string' as const, path: ['general', 'removalPolicy'] },
  'general.enableDetailedLogging': { type: 'boolean' as const, path: ['general', 'enableDetailedLogging'] },
  'general.enableContainerInsights': { type: 'boolean' as const, path: ['general', 'enableContainerInsights'] },
};

/**
 * Applies context overrides to environment configuration dynamically
 * 
 * @param app - CDK App instance to read context from
 * @param baseConfig - Base environment configuration from cdk.json
 * @returns Configuration with applied overrides
 */
export function applyContextOverrides(
  app: cdk.App, 
  baseConfig: ContextEnvironmentConfig
): ContextEnvironmentConfig {
  // Deep clone the base configuration to avoid mutations
  const result = JSON.parse(JSON.stringify(baseConfig)) as ContextEnvironmentConfig;
  
  // Apply each possible override
  for (const [contextKey, config] of Object.entries(OVERRIDE_CONFIG)) {
    const contextValue = app.node.tryGetContext(contextKey);
    
    if (contextValue !== undefined) {
      // Convert context value to appropriate type
      const convertedValue = convertContextValue(contextValue, config.type);
      
      // Set the value at the specified path
      setNestedProperty(result, [...config.path], convertedValue);
    }
  }
  
  return result;
}

/**
 * Converts context string values to appropriate types
 */
function convertContextValue(value: any, type: string): any {
  if (value === undefined || value === null) {
    return value;
  }
  
  switch (type) {
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const lower = value.toLowerCase();
        if (lower === 'true') return true;
        if (lower === 'false') return false;
      }
      return Boolean(value);
      
    case 'number':
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const parsed = parseInt(value, 10);
        if (!isNaN(parsed)) return parsed;
      }
      return Number(value);
      
    case 'string':
    default:
      return String(value);
  }
}

/**
 * Sets a nested property value using a path array
 */
function setNestedProperty(obj: any, path: string[], value: any): void {
  let current = obj;
  
  // Navigate to the parent of the target property
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  
  // Set the final property
  const finalKey = path[path.length - 1];
  current[finalKey] = value;
}
