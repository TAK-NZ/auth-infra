"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3EnvFileManager = void 0;
/**
 * S3 Environment File Manager Construct
 * Manages the authentik-config.env file in the S3 configuration bucket
 */
const constructs_1 = require("constructs");
const aws_cdk_lib_1 = require("aws-cdk-lib");
/**
 * CDK construct for managing environment files in S3
 */
class S3EnvFileManager extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const envFileName = props.envFileName || 'authentik-config.env';
        this.envFileS3Key = `${props.environment}/${envFileName}`;
        this.envFileS3Uri = `arn:aws:s3:::${props.s3ConfBucket.bucketName}/${this.envFileS3Key}`;
        // Create Lambda function to manage the environment file
        const envFileManagerFunction = new aws_cdk_lib_1.aws_lambda.Function(this, 'EnvFileManagerFunction', {
            runtime: aws_cdk_lib_1.aws_lambda.Runtime.PYTHON_3_11,
            handler: 'index.handler',
            timeout: aws_cdk_lib_1.Duration.minutes(5),
            logRetention: aws_cdk_lib_1.aws_logs.RetentionDays.ONE_WEEK,
            code: aws_cdk_lib_1.aws_lambda.Code.fromInline(`
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
        const envFileManagerProvider = new aws_cdk_lib_1.custom_resources.Provider(this, 'EnvFileManagerProvider', {
            onEventHandler: envFileManagerFunction,
            logRetention: aws_cdk_lib_1.aws_logs.RetentionDays.ONE_WEEK
        });
        const envFileManagerCustomResource = new aws_cdk_lib_1.custom_resources.AwsCustomResource(this, 'EnvFileManagerCustomResource', {
            policy: aws_cdk_lib_1.custom_resources.AwsCustomResourcePolicy.fromSdkCalls({
                resources: aws_cdk_lib_1.custom_resources.AwsCustomResourcePolicy.ANY_RESOURCE
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
        new aws_cdk_lib_1.CfnOutput(this, 'EnvFileS3Key', {
            value: this.envFileS3Key,
            description: 'S3 object key for the environment file'
        });
        new aws_cdk_lib_1.CfnOutput(this, 'EnvFileS3Uri', {
            value: this.envFileS3Uri,
            description: 'S3 URI for the environment file (for ECS environmentFiles)'
        });
    }
}
exports.S3EnvFileManager = S3EnvFileManager;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiczMtZW52LWZpbGUtbWFuYWdlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInMzLWVudi1maWxlLW1hbmFnZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUE7OztHQUdHO0FBQ0gsMkNBQXVDO0FBQ3ZDLDZDQVNxQjtBQXVCckI7O0dBRUc7QUFDSCxNQUFhLGdCQUFpQixTQUFRLHNCQUFTO0lBVzdDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBNEI7UUFDcEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLFdBQVcsR0FBRyxLQUFLLENBQUMsV0FBVyxJQUFJLHNCQUFzQixDQUFDO1FBQ2hFLElBQUksQ0FBQyxZQUFZLEdBQUcsR0FBRyxLQUFLLENBQUMsV0FBVyxJQUFJLFdBQVcsRUFBRSxDQUFDO1FBQzFELElBQUksQ0FBQyxZQUFZLEdBQUcsZ0JBQWdCLEtBQUssQ0FBQyxZQUFZLENBQUMsVUFBVSxJQUFJLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUV6Rix3REFBd0Q7UUFDeEQsTUFBTSxzQkFBc0IsR0FBRyxJQUFJLHdCQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSx3QkFBd0IsRUFBRTtZQUNqRixPQUFPLEVBQUUsd0JBQU0sQ0FBQyxPQUFPLENBQUMsV0FBVztZQUNuQyxPQUFPLEVBQUUsZUFBZTtZQUN4QixPQUFPLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQzVCLFlBQVksRUFBRSxzQkFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRO1lBQ3pDLElBQUksRUFBRSx3QkFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUM7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztDQW9GbEMsQ0FBQztTQUNHLENBQUMsQ0FBQztRQUVILHVFQUF1RTtRQUN2RSxLQUFLLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1FBRTFELHVEQUF1RDtRQUN2RCxNQUFNLHNCQUFzQixHQUFHLElBQUksOEJBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLHdCQUF3QixFQUFFO1lBQzdFLGNBQWMsRUFBRSxzQkFBc0I7WUFDdEMsWUFBWSxFQUFFLHNCQUFJLENBQUMsYUFBYSxDQUFDLFFBQVE7U0FDMUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSw0QkFBNEIsR0FBRyxJQUFJLDhCQUFFLENBQUMsaUJBQWlCLENBQUMsSUFBSSxFQUFFLDhCQUE4QixFQUFFO1lBQ2xHLE1BQU0sRUFBRSw4QkFBRSxDQUFDLHVCQUF1QixDQUFDLFlBQVksQ0FBQztnQkFDOUMsU0FBUyxFQUFFLDhCQUFFLENBQUMsdUJBQXVCLENBQUMsWUFBWTthQUNuRCxDQUFDO1lBQ0YsUUFBUSxFQUFFO2dCQUNSLE9BQU8sRUFBRSxRQUFRO2dCQUNqQixNQUFNLEVBQUUsUUFBUTtnQkFDaEIsVUFBVSxFQUFFO29CQUNWLFlBQVksRUFBRSxzQkFBc0IsQ0FBQyxZQUFZO29CQUNqRCxPQUFPLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQzt3QkFDdEIsV0FBVyxFQUFFLFFBQVE7d0JBQ3JCLGtCQUFrQixFQUFFOzRCQUNsQixVQUFVLEVBQUUsS0FBSyxDQUFDLFlBQVksQ0FBQyxVQUFVOzRCQUN6QyxTQUFTLEVBQUUsSUFBSSxDQUFDLFlBQVk7eUJBQzdCO3FCQUNGLENBQUM7aUJBQ0g7YUFDRjtZQUNELFFBQVEsRUFBRTtnQkFDUixPQUFPLEVBQUUsUUFBUTtnQkFDakIsTUFBTSxFQUFFLFFBQVE7Z0JBQ2hCLFVBQVUsRUFBRTtvQkFDVixZQUFZLEVBQUUsc0JBQXNCLENBQUMsWUFBWTtvQkFDakQsT0FBTyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUM7d0JBQ3RCLFdBQVcsRUFBRSxRQUFRO3dCQUNyQixrQkFBa0IsRUFBRTs0QkFDbEIsVUFBVSxFQUFFLEtBQUssQ0FBQyxZQUFZLENBQUMsVUFBVTs0QkFDekMsU0FBUyxFQUFFLElBQUksQ0FBQyxZQUFZO3lCQUM3QjtxQkFDRixDQUFDO2lCQUNIO2FBQ0Y7WUFDRCxRQUFRLEVBQUU7Z0JBQ1IsT0FBTyxFQUFFLFFBQVE7Z0JBQ2pCLE1BQU0sRUFBRSxRQUFRO2dCQUNoQixVQUFVLEVBQUU7b0JBQ1YsWUFBWSxFQUFFLHNCQUFzQixDQUFDLFlBQVk7b0JBQ2pELE9BQU8sRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO3dCQUN0QixXQUFXLEVBQUUsUUFBUTt3QkFDckIsa0JBQWtCLEVBQUU7NEJBQ2xCLFVBQVUsRUFBRSxLQUFLLENBQUMsWUFBWSxDQUFDLFVBQVU7NEJBQ3pDLFNBQVMsRUFBRSxJQUFJLENBQUMsWUFBWTt5QkFDN0I7cUJBQ0YsQ0FBQztpQkFDSDthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsaUJBQWlCO1FBQ2pCLElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQ2xDLEtBQUssRUFBRSxJQUFJLENBQUMsWUFBWTtZQUN4QixXQUFXLEVBQUUsd0NBQXdDO1NBQ3RELENBQUMsQ0FBQztRQUVILElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQ2xDLEtBQUssRUFBRSxJQUFJLENBQUMsWUFBWTtZQUN4QixXQUFXLEVBQUUsNERBQTREO1NBQzFFLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQW5MRCw0Q0FtTEMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFMzIEVudmlyb25tZW50IEZpbGUgTWFuYWdlciBDb25zdHJ1Y3RcbiAqIE1hbmFnZXMgdGhlIGF1dGhlbnRpay1jb25maWcuZW52IGZpbGUgaW4gdGhlIFMzIGNvbmZpZ3VyYXRpb24gYnVja2V0XG4gKi9cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHtcbiAgYXdzX3MzIGFzIHMzLFxuICBhd3NfbGFtYmRhIGFzIGxhbWJkYSxcbiAgYXdzX2lhbSBhcyBpYW0sXG4gIGF3c19sb2dzIGFzIGxvZ3MsXG4gIGN1c3RvbV9yZXNvdXJjZXMgYXMgY3IsXG4gIER1cmF0aW9uLFxuICBSZW1vdmFsUG9saWN5LFxuICBDZm5PdXRwdXRcbn0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciB0aGUgUzMgRW52aXJvbm1lbnQgRmlsZSBNYW5hZ2VyIGNvbnN0cnVjdFxuICovXG5leHBvcnQgaW50ZXJmYWNlIFMzRW52RmlsZU1hbmFnZXJQcm9wcyB7XG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBuYW1lIChlLmcuICdwcm9kJywgJ2RldicsIGV0Yy4pXG4gICAqL1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBTMyBjb25maWd1cmF0aW9uIGJ1Y2tldFxuICAgKi9cbiAgczNDb25mQnVja2V0OiBzMy5JQnVja2V0O1xuXG4gIC8qKlxuICAgKiBUaGUgZW52aXJvbm1lbnQgZmlsZSBuYW1lIHRvIG1hbmFnZVxuICAgKi9cbiAgZW52RmlsZU5hbWU/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogQ0RLIGNvbnN0cnVjdCBmb3IgbWFuYWdpbmcgZW52aXJvbm1lbnQgZmlsZXMgaW4gUzNcbiAqL1xuZXhwb3J0IGNsYXNzIFMzRW52RmlsZU1hbmFnZXIgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICAvKipcbiAgICogVGhlIFMzIG9iamVjdCBrZXkgZm9yIHRoZSBlbnZpcm9ubWVudCBmaWxlXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgZW52RmlsZVMzS2V5OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBTMyBVUkkgZm9yIHRoZSBlbnZpcm9ubWVudCBmaWxlIChmb3IgRUNTIGVudmlyb25tZW50RmlsZXMpXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgZW52RmlsZVMzVXJpOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFMzRW52RmlsZU1hbmFnZXJQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCBlbnZGaWxlTmFtZSA9IHByb3BzLmVudkZpbGVOYW1lIHx8ICdhdXRoZW50aWstY29uZmlnLmVudic7XG4gICAgdGhpcy5lbnZGaWxlUzNLZXkgPSBgJHtwcm9wcy5lbnZpcm9ubWVudH0vJHtlbnZGaWxlTmFtZX1gO1xuICAgIHRoaXMuZW52RmlsZVMzVXJpID0gYGFybjphd3M6czM6Ojoke3Byb3BzLnMzQ29uZkJ1Y2tldC5idWNrZXROYW1lfS8ke3RoaXMuZW52RmlsZVMzS2V5fWA7XG5cbiAgICAvLyBDcmVhdGUgTGFtYmRhIGZ1bmN0aW9uIHRvIG1hbmFnZSB0aGUgZW52aXJvbm1lbnQgZmlsZVxuICAgIGNvbnN0IGVudkZpbGVNYW5hZ2VyRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdFbnZGaWxlTWFuYWdlckZ1bmN0aW9uJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTEsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tSW5saW5lKGBcbmltcG9ydCBib3RvM1xuaW1wb3J0IGpzb25cbmltcG9ydCBsb2dnaW5nXG5cbmxvZ2dlciA9IGxvZ2dpbmcuZ2V0TG9nZ2VyKClcbmxvZ2dlci5zZXRMZXZlbChsb2dnaW5nLklORk8pXG5cbnMzX2NsaWVudCA9IGJvdG8zLmNsaWVudCgnczMnKVxuXG5kZWYgaGFuZGxlcihldmVudCwgY29udGV4dCk6XG4gICAgbG9nZ2VyLmluZm8oZlwiUmVjZWl2ZWQgZXZlbnQ6IHtqc29uLmR1bXBzKGV2ZW50KX1cIilcbiAgICBcbiAgICByZXF1ZXN0X3R5cGUgPSBldmVudC5nZXQoJ1JlcXVlc3RUeXBlJylcbiAgICBwcm9wZXJ0aWVzID0gZXZlbnQuZ2V0KCdSZXNvdXJjZVByb3BlcnRpZXMnLCB7fSlcbiAgICBcbiAgICBidWNrZXRfbmFtZSA9IHByb3BlcnRpZXMuZ2V0KCdCdWNrZXROYW1lJylcbiAgICBvYmplY3Rfa2V5ID0gcHJvcGVydGllcy5nZXQoJ09iamVjdEtleScpXG4gICAgXG4gICAgaWYgbm90IGJ1Y2tldF9uYW1lIG9yIG5vdCBvYmplY3Rfa2V5OlxuICAgICAgICByYWlzZSBWYWx1ZUVycm9yKFwiQnVja2V0TmFtZSBhbmQgT2JqZWN0S2V5IGFyZSByZXF1aXJlZFwiKVxuICAgIFxuICAgIHRyeTpcbiAgICAgICAgaWYgcmVxdWVzdF90eXBlIGluIFsnQ3JlYXRlJywgJ1VwZGF0ZSddOlxuICAgICAgICAgICAgIyBDaGVjayBpZiB0aGUgZmlsZSBhbHJlYWR5IGV4aXN0c1xuICAgICAgICAgICAgdHJ5OlxuICAgICAgICAgICAgICAgIHMzX2NsaWVudC5oZWFkX29iamVjdChCdWNrZXQ9YnVja2V0X25hbWUsIEtleT1vYmplY3Rfa2V5KVxuICAgICAgICAgICAgICAgIGxvZ2dlci5pbmZvKGZcIkZpbGUge29iamVjdF9rZXl9IGFscmVhZHkgZXhpc3RzIGluIGJ1Y2tldCB7YnVja2V0X25hbWV9LCBub3QgbW9kaWZ5aW5nXCIpXG4gICAgICAgICAgICAgICAgcmVzcG9uc2VfZGF0YSA9IHtcbiAgICAgICAgICAgICAgICAgICAgJ1N0YXR1cyc6ICdFWElTVFMnLFxuICAgICAgICAgICAgICAgICAgICAnTWVzc2FnZSc6IGYnRmlsZSB7b2JqZWN0X2tleX0gYWxyZWFkeSBleGlzdHMgYW5kIHdhcyBub3QgbW9kaWZpZWQnXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgZXhjZXB0IHMzX2NsaWVudC5leGNlcHRpb25zLk5vU3VjaEtleTpcbiAgICAgICAgICAgICAgICAjIEZpbGUgZG9lc24ndCBleGlzdCwgY3JlYXRlIGl0IHdpdGggZW1wdHkgY29udGVudFxuICAgICAgICAgICAgICAgIGxvZ2dlci5pbmZvKGZcIkNyZWF0aW5nIGVtcHR5IGZpbGUge29iamVjdF9rZXl9IGluIGJ1Y2tldCB7YnVja2V0X25hbWV9XCIpXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgIyBDcmVhdGUgZW1wdHkgLmVudiBmaWxlIHdpdGggaGVscGZ1bCBjb21tZW50c1xuICAgICAgICAgICAgICAgIGVtcHR5X2Vudl9jb250ZW50ID0gXCJcIlwiIyBBdXRoZW50aWsgQ29uZmlndXJhdGlvbiBFbnZpcm9ubWVudCBGaWxlXG4jIFRoaXMgZmlsZSBpcyBhdXRvbWF0aWNhbGx5IGNyZWF0ZWQgYnkgdGhlIEF1dGhJbmZyYSBzdGFja1xuIyBBZGQgeW91ciBjdXN0b20gQXV0aGVudGlrIGNvbmZpZ3VyYXRpb24gdmFyaWFibGVzIGhlcmVcbiMgXG4jIENvbW1vbiBjb25maWd1cmF0aW9uczpcbiMgQVVUSEVOVElLX0VNQUlMX19IT1NUPXNtdHAuZXhhbXBsZS5jb21cbiMgQVVUSEVOVElLX0VNQUlMX19QT1JUPTU4N1xuIyBBVVRIRU5USUtfRU1BSUxfX1VTRVJOQU1FPXlvdXItZW1haWxAZXhhbXBsZS5jb21cbiMgQVVUSEVOVElLX0VNQUlMX19QQVNTV09SRD15b3VyLXBhc3N3b3JkXG4jIEFVVEhFTlRJS19FTUFJTF9fVVNFX1RMUz10cnVlXG4jIEFVVEhFTlRJS19FTUFJTF9fRlJPTT1hdXRoZW50aWtAZXhhbXBsZS5jb21cbiNcbiMgRm9yIG1vcmUgY29uZmlndXJhdGlvbiBvcHRpb25zLCBzZWU6XG4jIGh0dHBzOi8vZG9jcy5nb2F1dGhlbnRpay5pby9kb2NzL2luc3RhbGwtY29uZmlnL2NvbmZpZ3VyYXRpb24vXG5cIlwiXCJcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBzM19jbGllbnQucHV0X29iamVjdChcbiAgICAgICAgICAgICAgICAgICAgQnVja2V0PWJ1Y2tldF9uYW1lLFxuICAgICAgICAgICAgICAgICAgICBLZXk9b2JqZWN0X2tleSxcbiAgICAgICAgICAgICAgICAgICAgQm9keT1lbXB0eV9lbnZfY29udGVudC5lbmNvZGUoJ3V0Zi04JyksXG4gICAgICAgICAgICAgICAgICAgIENvbnRlbnRUeXBlPSd0ZXh0L3BsYWluJ1xuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICByZXNwb25zZV9kYXRhID0ge1xuICAgICAgICAgICAgICAgICAgICAnU3RhdHVzJzogJ0NSRUFURUQnLFxuICAgICAgICAgICAgICAgICAgICAnTWVzc2FnZSc6IGYnQ3JlYXRlZCBlbXB0eSBmaWxlIHtvYmplY3Rfa2V5fSBpbiBidWNrZXQge2J1Y2tldF9uYW1lfSdcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgZWxpZiByZXF1ZXN0X3R5cGUgPT0gJ0RlbGV0ZSc6XG4gICAgICAgICAgICAjIE9uIHN0YWNrIGRlbGV0aW9uLCB3ZSBkb24ndCBkZWxldGUgdGhlIGZpbGUgdG8gcHJlc2VydmUgdXNlciBjb25maWd1cmF0aW9uXG4gICAgICAgICAgICBsb2dnZXIuaW5mbyhmXCJTdGFjayBkZWxldGlvbiAtIHByZXNlcnZpbmcgZmlsZSB7b2JqZWN0X2tleX0gaW4gYnVja2V0IHtidWNrZXRfbmFtZX1cIilcbiAgICAgICAgICAgIHJlc3BvbnNlX2RhdGEgPSB7XG4gICAgICAgICAgICAgICAgJ1N0YXR1cyc6ICdQUkVTRVJWRUQnLFxuICAgICAgICAgICAgICAgICdNZXNzYWdlJzogZidGaWxlIHtvYmplY3Rfa2V5fSBwcmVzZXJ2ZWQgaW4gYnVja2V0IHtidWNrZXRfbmFtZX0nXG4gICAgICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBlbHNlOlxuICAgICAgICAgICAgcmFpc2UgVmFsdWVFcnJvcihmXCJVbmtub3duIHJlcXVlc3QgdHlwZToge3JlcXVlc3RfdHlwZX1cIilcbiAgICAgICAgXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAnU3RhdHVzJzogJ1NVQ0NFU1MnLFxuICAgICAgICAgICAgJ0RhdGEnOiByZXNwb25zZV9kYXRhXG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgZXhjZXB0IEV4Y2VwdGlvbiBhcyBlOlxuICAgICAgICBsb2dnZXIuZXJyb3IoZlwiRXJyb3IgbWFuYWdpbmcgZW52aXJvbm1lbnQgZmlsZToge3N0cihlKX1cIilcbiAgICAgICAgcmFpc2UgZVxuYClcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IHRoZSBMYW1iZGEgZnVuY3Rpb24gcGVybWlzc2lvbnMgdG8gcmVhZC93cml0ZSB0byB0aGUgUzMgYnVja2V0XG4gICAgcHJvcHMuczNDb25mQnVja2V0LmdyYW50UmVhZFdyaXRlKGVudkZpbGVNYW5hZ2VyRnVuY3Rpb24pO1xuXG4gICAgLy8gQ3JlYXRlIGN1c3RvbSByZXNvdXJjZSB0byBpbnZva2UgdGhlIExhbWJkYSBmdW5jdGlvblxuICAgIGNvbnN0IGVudkZpbGVNYW5hZ2VyUHJvdmlkZXIgPSBuZXcgY3IuUHJvdmlkZXIodGhpcywgJ0VudkZpbGVNYW5hZ2VyUHJvdmlkZXInLCB7XG4gICAgICBvbkV2ZW50SGFuZGxlcjogZW52RmlsZU1hbmFnZXJGdW5jdGlvbixcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLXG4gICAgfSk7XG5cbiAgICBjb25zdCBlbnZGaWxlTWFuYWdlckN1c3RvbVJlc291cmNlID0gbmV3IGNyLkF3c0N1c3RvbVJlc291cmNlKHRoaXMsICdFbnZGaWxlTWFuYWdlckN1c3RvbVJlc291cmNlJywge1xuICAgICAgcG9saWN5OiBjci5Bd3NDdXN0b21SZXNvdXJjZVBvbGljeS5mcm9tU2RrQ2FsbHMoe1xuICAgICAgICByZXNvdXJjZXM6IGNyLkF3c0N1c3RvbVJlc291cmNlUG9saWN5LkFOWV9SRVNPVVJDRVxuICAgICAgfSksXG4gICAgICBvbkNyZWF0ZToge1xuICAgICAgICBzZXJ2aWNlOiAnTGFtYmRhJyxcbiAgICAgICAgYWN0aW9uOiAnaW52b2tlJyxcbiAgICAgICAgcGFyYW1ldGVyczoge1xuICAgICAgICAgIEZ1bmN0aW9uTmFtZTogZW52RmlsZU1hbmFnZXJGdW5jdGlvbi5mdW5jdGlvbk5hbWUsXG4gICAgICAgICAgUGF5bG9hZDogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgUmVxdWVzdFR5cGU6ICdDcmVhdGUnLFxuICAgICAgICAgICAgUmVzb3VyY2VQcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgIEJ1Y2tldE5hbWU6IHByb3BzLnMzQ29uZkJ1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICAgICAgICBPYmplY3RLZXk6IHRoaXMuZW52RmlsZVMzS2V5XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIG9uVXBkYXRlOiB7XG4gICAgICAgIHNlcnZpY2U6ICdMYW1iZGEnLFxuICAgICAgICBhY3Rpb246ICdpbnZva2UnLFxuICAgICAgICBwYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgRnVuY3Rpb25OYW1lOiBlbnZGaWxlTWFuYWdlckZ1bmN0aW9uLmZ1bmN0aW9uTmFtZSxcbiAgICAgICAgICBQYXlsb2FkOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBSZXF1ZXN0VHlwZTogJ1VwZGF0ZScsXG4gICAgICAgICAgICBSZXNvdXJjZVByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgICAgQnVja2V0TmFtZTogcHJvcHMuczNDb25mQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgICAgICAgIE9iamVjdEtleTogdGhpcy5lbnZGaWxlUzNLZXlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgb25EZWxldGU6IHtcbiAgICAgICAgc2VydmljZTogJ0xhbWJkYScsXG4gICAgICAgIGFjdGlvbjogJ2ludm9rZScsXG4gICAgICAgIHBhcmFtZXRlcnM6IHtcbiAgICAgICAgICBGdW5jdGlvbk5hbWU6IGVudkZpbGVNYW5hZ2VyRnVuY3Rpb24uZnVuY3Rpb25OYW1lLFxuICAgICAgICAgIFBheWxvYWQ6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIFJlcXVlc3RUeXBlOiAnRGVsZXRlJyxcbiAgICAgICAgICAgIFJlc291cmNlUHJvcGVydGllczoge1xuICAgICAgICAgICAgICBCdWNrZXROYW1lOiBwcm9wcy5zM0NvbmZCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgICAgICAgT2JqZWN0S2V5OiB0aGlzLmVudkZpbGVTM0tleVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBvdXRwdXRzXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRW52RmlsZVMzS2V5Jywge1xuICAgICAgdmFsdWU6IHRoaXMuZW52RmlsZVMzS2V5LFxuICAgICAgZGVzY3JpcHRpb246ICdTMyBvYmplY3Qga2V5IGZvciB0aGUgZW52aXJvbm1lbnQgZmlsZSdcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0VudkZpbGVTM1VyaScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmVudkZpbGVTM1VyaSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUzMgVVJJIGZvciB0aGUgZW52aXJvbm1lbnQgZmlsZSAoZm9yIEVDUyBlbnZpcm9ubWVudEZpbGVzKSdcbiAgICB9KTtcbiAgfVxufVxuIl19