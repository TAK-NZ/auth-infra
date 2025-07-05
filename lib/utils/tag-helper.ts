/**
 * Interface for tag-related defaults from cdk.json context
 */
export interface TagDefaults {
  project?: string;
  component?: string;
}

/**
 * Generate standardized tags for TAK infrastructure resources
 * 
 * @param stackName - Stack name for environment identification
 * @param environment - Environment type ('prod' | 'dev-test')
 * @param defaults - Default values from cdk.json context
 * @returns Object containing all standard tags
 */
export function generateStandardTags(
  stackName: string,
  environment: 'prod' | 'dev-test',
  defaults?: TagDefaults
): Record<string, string> {
  const environmentLabel = environment === 'prod' ? 'Prod' : 'Dev-Test';
  
  return {
    // Core identification tags
    Project: defaults?.project || 'TAK',
    Environment: stackName,
    Component: defaults?.component || 'AuthInfra',
    ManagedBy: 'CDK',
    
    // Environment type classification
    'Environment Type': environmentLabel,
  };
}