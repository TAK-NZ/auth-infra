/**
 * S3 Environment File Manager Construct
 * Manages the authentik-config.env file in the S3 configuration bucket
 */
import { Construct } from 'constructs';
import { aws_s3 as s3 } from 'aws-cdk-lib';
/**
 * Properties for the S3 Environment File Manager construct
 */
export interface S3EnvFileManagerProps {
    /**
     * Environment name (e.g. 'prod', 'dev', etc.)
     */
    environment: string;
    /**
     * S3 configuration bucket
     */
    s3ConfBucket: s3.IBucket;
    /**
     * The environment file name to manage
     */
    envFileName?: string;
}
/**
 * CDK construct for managing environment files in S3
 */
export declare class S3EnvFileManager extends Construct {
    /**
     * The S3 object key for the environment file
     */
    readonly envFileS3Key: string;
    /**
     * The S3 URI for the environment file (for ECS environmentFiles)
     */
    readonly envFileS3Uri: string;
    constructor(scope: Construct, id: string, props: S3EnvFileManagerProps);
}
