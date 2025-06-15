/**
 * ECR Image Validator - Ensures required Docker images exist before deployment
 */
import { Construct } from 'constructs';
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
}
/**
 * Custom resource to validate ECR images exist before deployment
 */
export declare class EcrImageValidator extends Construct {
    constructor(scope: Construct, id: string, props: EcrImageValidatorProps);
}
