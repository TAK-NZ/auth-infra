import { ContextEnvironmentConfig } from '../stack-config';
import { TAG_CONSTANTS } from './constants';

/**
 * Interface for tag-related defaults from cdk.json context
 */
export interface TagDefaults {
  project?: string;
  component?: string;
  region?: string;
}

/**
 * Generate standardized tags for TAK auth infrastructure resources
 * 
 * @param envConfig - Environment configuration
 * @param environment - Environment type ('prod' | 'dev-test')
 * @param defaults - Default values from cdk.json context
 * @returns Object containing all standard tags
 */
export function generateStandardTags(
  envConfig: ContextEnvironmentConfig,
  environment: 'prod' | 'dev-test',
  defaults?: TagDefaults
): Record<string, string> {
  const environmentLabel = environment === 'prod' ? 'Prod' : 'Dev-Test';
  
  return {
    // Core identification tags
    Project: defaults?.project || TAG_CONSTANTS.PROJECT,
    Environment: envConfig.stackName,
    Component: defaults?.component || TAG_CONSTANTS.AUTH_COMPONENT,
    ManagedBy: TAG_CONSTANTS.MANAGED_BY,
    
    // Environment type classification
    'Environment Type': environmentLabel,
  };
}
