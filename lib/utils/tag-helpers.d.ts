import { ContextEnvironmentConfig } from '../stack-config';
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
export declare function generateStandardTags(envConfig: ContextEnvironmentConfig, environment: 'prod' | 'dev-test', defaults?: TagDefaults): Record<string, string>;
