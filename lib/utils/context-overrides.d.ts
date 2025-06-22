/**
 * Dynamic context override utilities
 * Simplified flat parameter system for command-line context overrides
 */
import * as cdk from 'aws-cdk-lib';
import { ContextEnvironmentConfig } from '../stack-config';
export declare function applyContextOverrides(app: cdk.App, baseConfig: ContextEnvironmentConfig): ContextEnvironmentConfig;
