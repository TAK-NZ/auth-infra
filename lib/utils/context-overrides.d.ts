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
export declare const OVERRIDE_CONFIG: {
    stackName: {
        type: "string";
        path: string[];
    };
    'database.instanceClass': {
        type: "string";
        path: string[];
    };
    'database.instanceCount': {
        type: "number";
        path: string[];
    };
    'database.allocatedStorage': {
        type: "number";
        path: string[];
    };
    'database.maxAllocatedStorage': {
        type: "number";
        path: string[];
    };
    'database.enablePerformanceInsights': {
        type: "boolean";
        path: string[];
    };
    'database.monitoringInterval': {
        type: "number";
        path: string[];
    };
    'database.backupRetentionDays': {
        type: "number";
        path: string[];
    };
    'database.deleteProtection': {
        type: "boolean";
        path: string[];
    };
    'redis.nodeType': {
        type: "string";
        path: string[];
    };
    'redis.numCacheNodes': {
        type: "number";
        path: string[];
    };
    'redis.enableTransit': {
        type: "boolean";
        path: string[];
    };
    'redis.enableAtRest': {
        type: "boolean";
        path: string[];
    };
    'ecs.taskCpu': {
        type: "number";
        path: string[];
    };
    'ecs.taskMemory': {
        type: "number";
        path: string[];
    };
    'ecs.desiredCount': {
        type: "number";
        path: string[];
    };
    'ecs.enableDetailedLogging': {
        type: "boolean";
        path: string[];
    };
    'authentik.domain': {
        type: "string";
        path: string[];
    };
    'authentik.adminUserEmail': {
        type: "string";
        path: string[];
    };
    'ldap.domain': {
        type: "string";
        path: string[];
    };
    'general.removalPolicy': {
        type: "string";
        path: string[];
    };
    'general.enableDetailedLogging': {
        type: "boolean";
        path: string[];
    };
    'general.enableContainerInsights': {
        type: "boolean";
        path: string[];
    };
};
/**
 * Applies context overrides to environment configuration dynamically
 *
 * @param app - CDK App instance to read context from
 * @param baseConfig - Base environment configuration from cdk.json
 * @returns Configuration with applied overrides
 */
export declare function applyContextOverrides(app: cdk.App, baseConfig: ContextEnvironmentConfig): ContextEnvironmentConfig;
