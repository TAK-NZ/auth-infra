/**
 * S3 Environment File Manager Construct
 * Manages the authentik-config.env file in the S3 configuration bucket
 */
import { Construct } from 'constructs';
import {
  aws_s3 as s3,
  aws_lambda as lambda,
  aws_iam as iam,
  aws_logs as logs,
  custom_resources as cr,
  Duration,
  RemovalPolicy,
  CfnOutput
} from 'aws-cdk-lib';
import * as path from 'path';

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
export class S3EnvFileManager extends Construct {
  /**
   * The S3 object key for the environment file
   */
  public readonly envFileS3Key: string;

  /**
   * The S3 URI for the environment file (for ECS environmentFiles)
   */
  public readonly envFileS3Uri: string;

  constructor(scope: Construct, id: string, props: S3EnvFileManagerProps) {
    super(scope, id);

    const envFileName = props.envFileName || 'authentik-config.env';
    this.envFileS3Key = `${props.environment}/${envFileName}`;
    this.envFileS3Uri = `arn:aws:s3:::${props.s3ConfBucket.bucketName}/${this.envFileS3Key}`;

    // Create Lambda function to manage the environment file
    const envFileManagerFunction = new lambda.Function(this, 'EnvFileManagerFunction', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      timeout: Duration.minutes(5),
      logRetention: logs.RetentionDays.ONE_WEEK,
      code: lambda.Code.fromInline(`
import boto3
import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3_client = boto3.client('s3')

def handler(event, context):
    logger.info(f"Received event: {json.dumps(event)}")
    
    request_type = event.get('RequestType')
    properties = event.get('ResourceProperties', {})
    
    bucket_name = properties.get('BucketName')
    object_key = properties.get('ObjectKey')
    
    if not bucket_name or not object_key:
        raise ValueError("BucketName and ObjectKey are required")
    
    try:
        if request_type in ['Create', 'Update']:
            # Check if the file already exists
            try:
                s3_client.head_object(Bucket=bucket_name, Key=object_key)
                logger.info(f"File {object_key} already exists in bucket {bucket_name}, not modifying")
                response_data = {
                    'Status': 'EXISTS',
                    'Message': f'File {object_key} already exists and was not modified'
                }
            except s3_client.exceptions.NoSuchKey:
                # File doesn't exist, create it with empty content
                logger.info(f"Creating empty file {object_key} in bucket {bucket_name}")
                
                # Create empty .env file with helpful comments
                empty_env_content = """# Authentik Configuration Environment File
# This file is automatically created by the AuthInfra stack
# Add your custom Authentik configuration variables here
# 
# Common configurations:
# AUTHENTIK_EMAIL__HOST=smtp.example.com
# AUTHENTIK_EMAIL__PORT=587
# AUTHENTIK_EMAIL__USERNAME=your-email@example.com
# AUTHENTIK_EMAIL__PASSWORD=your-password
# AUTHENTIK_EMAIL__USE_TLS=true
# AUTHENTIK_EMAIL__FROM=authentik@example.com
#
# For more configuration options, see:
# https://docs.goauthentik.io/docs/install-config/configuration/
"""
                
                s3_client.put_object(
                    Bucket=bucket_name,
                    Key=object_key,
                    Body=empty_env_content.encode('utf-8'),
                    ContentType='text/plain'
                )
                
                response_data = {
                    'Status': 'CREATED',
                    'Message': f'Created empty file {object_key} in bucket {bucket_name}'
                }
            
        elif request_type == 'Delete':
            # On stack deletion, we don't delete the file to preserve user configuration
            logger.info(f"Stack deletion - preserving file {object_key} in bucket {bucket_name}")
            response_data = {
                'Status': 'PRESERVED',
                'Message': f'File {object_key} preserved in bucket {bucket_name}'
            }
        
        else:
            raise ValueError(f"Unknown request type: {request_type}")
        
        return {
            'Status': 'SUCCESS',
            'Data': response_data
        }
        
    except Exception as e:
        logger.error(f"Error managing environment file: {str(e)}")
        raise e
`)
    });

    // Grant the Lambda function permissions to read/write to the S3 bucket
    props.s3ConfBucket.grantReadWrite(envFileManagerFunction);

    // Create custom resource to invoke the Lambda function
    const envFileManagerProvider = new cr.Provider(this, 'EnvFileManagerProvider', {
      onEventHandler: envFileManagerFunction,
      logRetention: logs.RetentionDays.ONE_WEEK
    });

    const envFileManagerCustomResource = new cr.AwsCustomResource(this, 'EnvFileManagerCustomResource', {
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE
      }),
      onCreate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: envFileManagerFunction.functionName,
          Payload: JSON.stringify({
            RequestType: 'Create',
            ResourceProperties: {
              BucketName: props.s3ConfBucket.bucketName,
              ObjectKey: this.envFileS3Key
            }
          })
        }
      },
      onUpdate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: envFileManagerFunction.functionName,
          Payload: JSON.stringify({
            RequestType: 'Update',
            ResourceProperties: {
              BucketName: props.s3ConfBucket.bucketName,
              ObjectKey: this.envFileS3Key
            }
          })
        }
      },
      onDelete: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: envFileManagerFunction.functionName,
          Payload: JSON.stringify({
            RequestType: 'Delete',
            ResourceProperties: {
              BucketName: props.s3ConfBucket.bucketName,
              ObjectKey: this.envFileS3Key
            }
          })
        }
      }
    });

    // Create outputs
    new CfnOutput(this, 'EnvFileS3Key', {
      value: this.envFileS3Key,
      description: 'S3 object key for the environment file'
    });

    new CfnOutput(this, 'EnvFileS3Uri', {
      value: this.envFileS3Uri,
      description: 'S3 URI for the environment file (for ECS environmentFiles)'
    });
  }
}
