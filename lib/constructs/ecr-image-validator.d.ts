/**
 * ECR Image Validator - Ensures required Docker images exist before deployment
 */
import { Construct } from 'constructs';
import type { AuthInfraEnvironmentConfig } from '../environment-config';
/**
 * Properties for ECR Image Validator
 */
export interface EcrImageValidatorProps {
    /**
     * ECR repository ARN
     */
    ecrRepositoryArn: string;
    /**
     * List of required image tags to validate
     */
    requiredImageTags: string[];
    /**
     * Environment name for logging
     */
    environment: string;
    /**
     * Environment configuration
     */
    config: AuthInfraEnvironmentConfig;
}
/**
 * Custom resource to validate ECR images exist before deployment
 */
export declare class EcrImageValidator extends Construct {
    constructor(scope: Construct, id: string, props: EcrImageValidatorProps);
}
