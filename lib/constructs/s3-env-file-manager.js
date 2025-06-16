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
        // Create the custom resource using the provider
        const envFileManagerCustomResource = new aws_cdk_lib_1.CustomResource(this, 'EnvFileManagerCustomResource', {
            serviceToken: envFileManagerProvider.serviceToken,
            properties: {
                BucketName: props.s3ConfBucket.bucketName,
                ObjectKey: this.envFileS3Key
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiczMtZW52LWZpbGUtbWFuYWdlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInMzLWVudi1maWxlLW1hbmFnZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUE7OztHQUdHO0FBQ0gsMkNBQXVDO0FBQ3ZDLDZDQVVxQjtBQXVCckI7O0dBRUc7QUFDSCxNQUFhLGdCQUFpQixTQUFRLHNCQUFTO0lBVzdDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBNEI7UUFDcEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLFdBQVcsR0FBRyxLQUFLLENBQUMsV0FBVyxJQUFJLHNCQUFzQixDQUFDO1FBQ2hFLElBQUksQ0FBQyxZQUFZLEdBQUcsR0FBRyxLQUFLLENBQUMsV0FBVyxJQUFJLFdBQVcsRUFBRSxDQUFDO1FBQzFELElBQUksQ0FBQyxZQUFZLEdBQUcsZ0JBQWdCLEtBQUssQ0FBQyxZQUFZLENBQUMsVUFBVSxJQUFJLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUV6Rix3REFBd0Q7UUFDeEQsTUFBTSxzQkFBc0IsR0FBRyxJQUFJLHdCQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSx3QkFBd0IsRUFBRTtZQUNqRixPQUFPLEVBQUUsd0JBQU0sQ0FBQyxPQUFPLENBQUMsV0FBVztZQUNuQyxPQUFPLEVBQUUsZUFBZTtZQUN4QixPQUFPLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQzVCLFlBQVksRUFBRSxzQkFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRO1lBQ3pDLElBQUksRUFBRSx3QkFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUM7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztDQW9GbEMsQ0FBQztTQUNHLENBQUMsQ0FBQztRQUVILHVFQUF1RTtRQUN2RSxLQUFLLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1FBRTFELHVEQUF1RDtRQUN2RCxNQUFNLHNCQUFzQixHQUFHLElBQUksOEJBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLHdCQUF3QixFQUFFO1lBQzdFLGNBQWMsRUFBRSxzQkFBc0I7WUFDdEMsWUFBWSxFQUFFLHNCQUFJLENBQUMsYUFBYSxDQUFDLFFBQVE7U0FDMUMsQ0FBQyxDQUFDO1FBRUgsZ0RBQWdEO1FBQ2hELE1BQU0sNEJBQTRCLEdBQUcsSUFBSSw0QkFBYyxDQUFDLElBQUksRUFBRSw4QkFBOEIsRUFBRTtZQUM1RixZQUFZLEVBQUUsc0JBQXNCLENBQUMsWUFBWTtZQUNqRCxVQUFVLEVBQUU7Z0JBQ1YsVUFBVSxFQUFFLEtBQUssQ0FBQyxZQUFZLENBQUMsVUFBVTtnQkFDekMsU0FBUyxFQUFFLElBQUksQ0FBQyxZQUFZO2FBQzdCO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsaUJBQWlCO1FBQ2pCLElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQ2xDLEtBQUssRUFBRSxJQUFJLENBQUMsWUFBWTtZQUN4QixXQUFXLEVBQUUsd0NBQXdDO1NBQ3RELENBQUMsQ0FBQztRQUVILElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQ2xDLEtBQUssRUFBRSxJQUFJLENBQUMsWUFBWTtZQUN4QixXQUFXLEVBQUUsNERBQTREO1NBQzFFLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQTVJRCw0Q0E0SUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFMzIEVudmlyb25tZW50IEZpbGUgTWFuYWdlciBDb25zdHJ1Y3RcbiAqIE1hbmFnZXMgdGhlIGF1dGhlbnRpay1jb25maWcuZW52IGZpbGUgaW4gdGhlIFMzIGNvbmZpZ3VyYXRpb24gYnVja2V0XG4gKi9cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHtcbiAgYXdzX3MzIGFzIHMzLFxuICBhd3NfbGFtYmRhIGFzIGxhbWJkYSxcbiAgYXdzX2lhbSBhcyBpYW0sXG4gIGF3c19sb2dzIGFzIGxvZ3MsXG4gIGN1c3RvbV9yZXNvdXJjZXMgYXMgY3IsXG4gIER1cmF0aW9uLFxuICBSZW1vdmFsUG9saWN5LFxuICBDZm5PdXRwdXQsXG4gIEN1c3RvbVJlc291cmNlXG59IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5cbi8qKlxuICogUHJvcGVydGllcyBmb3IgdGhlIFMzIEVudmlyb25tZW50IEZpbGUgTWFuYWdlciBjb25zdHJ1Y3RcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBTM0VudkZpbGVNYW5hZ2VyUHJvcHMge1xuICAvKipcbiAgICogRW52aXJvbm1lbnQgbmFtZSAoZS5nLiAncHJvZCcsICdkZXYnLCBldGMuKVxuICAgKi9cbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcblxuICAvKipcbiAgICogUzMgY29uZmlndXJhdGlvbiBidWNrZXRcbiAgICovXG4gIHMzQ29uZkJ1Y2tldDogczMuSUJ1Y2tldDtcblxuICAvKipcbiAgICogVGhlIGVudmlyb25tZW50IGZpbGUgbmFtZSB0byBtYW5hZ2VcbiAgICovXG4gIGVudkZpbGVOYW1lPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIENESyBjb25zdHJ1Y3QgZm9yIG1hbmFnaW5nIGVudmlyb25tZW50IGZpbGVzIGluIFMzXG4gKi9cbmV4cG9ydCBjbGFzcyBTM0VudkZpbGVNYW5hZ2VyIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgLyoqXG4gICAqIFRoZSBTMyBvYmplY3Qga2V5IGZvciB0aGUgZW52aXJvbm1lbnQgZmlsZVxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGVudkZpbGVTM0tleTogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgUzMgVVJJIGZvciB0aGUgZW52aXJvbm1lbnQgZmlsZSAoZm9yIEVDUyBlbnZpcm9ubWVudEZpbGVzKVxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGVudkZpbGVTM1VyaTogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTM0VudkZpbGVNYW5hZ2VyUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3QgZW52RmlsZU5hbWUgPSBwcm9wcy5lbnZGaWxlTmFtZSB8fCAnYXV0aGVudGlrLWNvbmZpZy5lbnYnO1xuICAgIHRoaXMuZW52RmlsZVMzS2V5ID0gYCR7cHJvcHMuZW52aXJvbm1lbnR9LyR7ZW52RmlsZU5hbWV9YDtcbiAgICB0aGlzLmVudkZpbGVTM1VyaSA9IGBhcm46YXdzOnMzOjo6JHtwcm9wcy5zM0NvbmZCdWNrZXQuYnVja2V0TmFtZX0vJHt0aGlzLmVudkZpbGVTM0tleX1gO1xuXG4gICAgLy8gQ3JlYXRlIExhbWJkYSBmdW5jdGlvbiB0byBtYW5hZ2UgdGhlIGVudmlyb25tZW50IGZpbGVcbiAgICBjb25zdCBlbnZGaWxlTWFuYWdlckZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnRW52RmlsZU1hbmFnZXJGdW5jdGlvbicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgdGltZW91dDogRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUlubGluZShgXG5pbXBvcnQgYm90bzNcbmltcG9ydCBqc29uXG5pbXBvcnQgbG9nZ2luZ1xuXG5sb2dnZXIgPSBsb2dnaW5nLmdldExvZ2dlcigpXG5sb2dnZXIuc2V0TGV2ZWwobG9nZ2luZy5JTkZPKVxuXG5zM19jbGllbnQgPSBib3RvMy5jbGllbnQoJ3MzJylcblxuZGVmIGhhbmRsZXIoZXZlbnQsIGNvbnRleHQpOlxuICAgIGxvZ2dlci5pbmZvKGZcIlJlY2VpdmVkIGV2ZW50OiB7anNvbi5kdW1wcyhldmVudCl9XCIpXG4gICAgXG4gICAgcmVxdWVzdF90eXBlID0gZXZlbnQuZ2V0KCdSZXF1ZXN0VHlwZScpXG4gICAgcHJvcGVydGllcyA9IGV2ZW50LmdldCgnUmVzb3VyY2VQcm9wZXJ0aWVzJywge30pXG4gICAgXG4gICAgYnVja2V0X25hbWUgPSBwcm9wZXJ0aWVzLmdldCgnQnVja2V0TmFtZScpXG4gICAgb2JqZWN0X2tleSA9IHByb3BlcnRpZXMuZ2V0KCdPYmplY3RLZXknKVxuICAgIFxuICAgIGlmIG5vdCBidWNrZXRfbmFtZSBvciBub3Qgb2JqZWN0X2tleTpcbiAgICAgICAgcmFpc2UgVmFsdWVFcnJvcihcIkJ1Y2tldE5hbWUgYW5kIE9iamVjdEtleSBhcmUgcmVxdWlyZWRcIilcbiAgICBcbiAgICB0cnk6XG4gICAgICAgIGlmIHJlcXVlc3RfdHlwZSBpbiBbJ0NyZWF0ZScsICdVcGRhdGUnXTpcbiAgICAgICAgICAgICMgQ2hlY2sgaWYgdGhlIGZpbGUgYWxyZWFkeSBleGlzdHNcbiAgICAgICAgICAgIHRyeTpcbiAgICAgICAgICAgICAgICBzM19jbGllbnQuaGVhZF9vYmplY3QoQnVja2V0PWJ1Y2tldF9uYW1lLCBLZXk9b2JqZWN0X2tleSlcbiAgICAgICAgICAgICAgICBsb2dnZXIuaW5mbyhmXCJGaWxlIHtvYmplY3Rfa2V5fSBhbHJlYWR5IGV4aXN0cyBpbiBidWNrZXQge2J1Y2tldF9uYW1lfSwgbm90IG1vZGlmeWluZ1wiKVxuICAgICAgICAgICAgICAgIHJlc3BvbnNlX2RhdGEgPSB7XG4gICAgICAgICAgICAgICAgICAgICdTdGF0dXMnOiAnRVhJU1RTJyxcbiAgICAgICAgICAgICAgICAgICAgJ01lc3NhZ2UnOiBmJ0ZpbGUge29iamVjdF9rZXl9IGFscmVhZHkgZXhpc3RzIGFuZCB3YXMgbm90IG1vZGlmaWVkJ1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGV4Y2VwdCBzM19jbGllbnQuZXhjZXB0aW9ucy5Ob1N1Y2hLZXk6XG4gICAgICAgICAgICAgICAgIyBGaWxlIGRvZXNuJ3QgZXhpc3QsIGNyZWF0ZSBpdCB3aXRoIGVtcHR5IGNvbnRlbnRcbiAgICAgICAgICAgICAgICBsb2dnZXIuaW5mbyhmXCJDcmVhdGluZyBlbXB0eSBmaWxlIHtvYmplY3Rfa2V5fSBpbiBidWNrZXQge2J1Y2tldF9uYW1lfVwiKVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICMgQ3JlYXRlIGVtcHR5IC5lbnYgZmlsZSB3aXRoIGhlbHBmdWwgY29tbWVudHNcbiAgICAgICAgICAgICAgICBlbXB0eV9lbnZfY29udGVudCA9IFwiXCJcIiMgQXV0aGVudGlrIENvbmZpZ3VyYXRpb24gRW52aXJvbm1lbnQgRmlsZVxuIyBUaGlzIGZpbGUgaXMgYXV0b21hdGljYWxseSBjcmVhdGVkIGJ5IHRoZSBBdXRoSW5mcmEgc3RhY2tcbiMgQWRkIHlvdXIgY3VzdG9tIEF1dGhlbnRpayBjb25maWd1cmF0aW9uIHZhcmlhYmxlcyBoZXJlXG4jIFxuIyBDb21tb24gY29uZmlndXJhdGlvbnM6XG4jIEFVVEhFTlRJS19FTUFJTF9fSE9TVD1zbXRwLmV4YW1wbGUuY29tXG4jIEFVVEhFTlRJS19FTUFJTF9fUE9SVD01ODdcbiMgQVVUSEVOVElLX0VNQUlMX19VU0VSTkFNRT15b3VyLWVtYWlsQGV4YW1wbGUuY29tXG4jIEFVVEhFTlRJS19FTUFJTF9fUEFTU1dPUkQ9eW91ci1wYXNzd29yZFxuIyBBVVRIRU5USUtfRU1BSUxfX1VTRV9UTFM9dHJ1ZVxuIyBBVVRIRU5USUtfRU1BSUxfX0ZST009YXV0aGVudGlrQGV4YW1wbGUuY29tXG4jXG4jIEZvciBtb3JlIGNvbmZpZ3VyYXRpb24gb3B0aW9ucywgc2VlOlxuIyBodHRwczovL2RvY3MuZ29hdXRoZW50aWsuaW8vZG9jcy9pbnN0YWxsLWNvbmZpZy9jb25maWd1cmF0aW9uL1xuXCJcIlwiXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgczNfY2xpZW50LnB1dF9vYmplY3QoXG4gICAgICAgICAgICAgICAgICAgIEJ1Y2tldD1idWNrZXRfbmFtZSxcbiAgICAgICAgICAgICAgICAgICAgS2V5PW9iamVjdF9rZXksXG4gICAgICAgICAgICAgICAgICAgIEJvZHk9ZW1wdHlfZW52X2NvbnRlbnQuZW5jb2RlKCd1dGYtOCcpLFxuICAgICAgICAgICAgICAgICAgICBDb250ZW50VHlwZT0ndGV4dC9wbGFpbidcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgcmVzcG9uc2VfZGF0YSA9IHtcbiAgICAgICAgICAgICAgICAgICAgJ1N0YXR1cyc6ICdDUkVBVEVEJyxcbiAgICAgICAgICAgICAgICAgICAgJ01lc3NhZ2UnOiBmJ0NyZWF0ZWQgZW1wdHkgZmlsZSB7b2JqZWN0X2tleX0gaW4gYnVja2V0IHtidWNrZXRfbmFtZX0nXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgIGVsaWYgcmVxdWVzdF90eXBlID09ICdEZWxldGUnOlxuICAgICAgICAgICAgIyBPbiBzdGFjayBkZWxldGlvbiwgd2UgZG9uJ3QgZGVsZXRlIHRoZSBmaWxlIHRvIHByZXNlcnZlIHVzZXIgY29uZmlndXJhdGlvblxuICAgICAgICAgICAgbG9nZ2VyLmluZm8oZlwiU3RhY2sgZGVsZXRpb24gLSBwcmVzZXJ2aW5nIGZpbGUge29iamVjdF9rZXl9IGluIGJ1Y2tldCB7YnVja2V0X25hbWV9XCIpXG4gICAgICAgICAgICByZXNwb25zZV9kYXRhID0ge1xuICAgICAgICAgICAgICAgICdTdGF0dXMnOiAnUFJFU0VSVkVEJyxcbiAgICAgICAgICAgICAgICAnTWVzc2FnZSc6IGYnRmlsZSB7b2JqZWN0X2tleX0gcHJlc2VydmVkIGluIGJ1Y2tldCB7YnVja2V0X25hbWV9J1xuICAgICAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgZWxzZTpcbiAgICAgICAgICAgIHJhaXNlIFZhbHVlRXJyb3IoZlwiVW5rbm93biByZXF1ZXN0IHR5cGU6IHtyZXF1ZXN0X3R5cGV9XCIpXG4gICAgICAgIFxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgJ1N0YXR1cyc6ICdTVUNDRVNTJyxcbiAgICAgICAgICAgICdEYXRhJzogcmVzcG9uc2VfZGF0YVxuICAgICAgICB9XG4gICAgICAgIFxuICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZTpcbiAgICAgICAgbG9nZ2VyLmVycm9yKGZcIkVycm9yIG1hbmFnaW5nIGVudmlyb25tZW50IGZpbGU6IHtzdHIoZSl9XCIpXG4gICAgICAgIHJhaXNlIGVcbmApXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCB0aGUgTGFtYmRhIGZ1bmN0aW9uIHBlcm1pc3Npb25zIHRvIHJlYWQvd3JpdGUgdG8gdGhlIFMzIGJ1Y2tldFxuICAgIHByb3BzLnMzQ29uZkJ1Y2tldC5ncmFudFJlYWRXcml0ZShlbnZGaWxlTWFuYWdlckZ1bmN0aW9uKTtcblxuICAgIC8vIENyZWF0ZSBjdXN0b20gcmVzb3VyY2UgdG8gaW52b2tlIHRoZSBMYW1iZGEgZnVuY3Rpb25cbiAgICBjb25zdCBlbnZGaWxlTWFuYWdlclByb3ZpZGVyID0gbmV3IGNyLlByb3ZpZGVyKHRoaXMsICdFbnZGaWxlTWFuYWdlclByb3ZpZGVyJywge1xuICAgICAgb25FdmVudEhhbmRsZXI6IGVudkZpbGVNYW5hZ2VyRnVuY3Rpb24sXG4gICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFS1xuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBjdXN0b20gcmVzb3VyY2UgdXNpbmcgdGhlIHByb3ZpZGVyXG4gICAgY29uc3QgZW52RmlsZU1hbmFnZXJDdXN0b21SZXNvdXJjZSA9IG5ldyBDdXN0b21SZXNvdXJjZSh0aGlzLCAnRW52RmlsZU1hbmFnZXJDdXN0b21SZXNvdXJjZScsIHtcbiAgICAgIHNlcnZpY2VUb2tlbjogZW52RmlsZU1hbmFnZXJQcm92aWRlci5zZXJ2aWNlVG9rZW4sXG4gICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgIEJ1Y2tldE5hbWU6IHByb3BzLnMzQ29uZkJ1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICBPYmplY3RLZXk6IHRoaXMuZW52RmlsZVMzS2V5XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgb3V0cHV0c1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0VudkZpbGVTM0tleScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmVudkZpbGVTM0tleSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUzMgb2JqZWN0IGtleSBmb3IgdGhlIGVudmlyb25tZW50IGZpbGUnXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdFbnZGaWxlUzNVcmknLCB7XG4gICAgICB2YWx1ZTogdGhpcy5lbnZGaWxlUzNVcmksXG4gICAgICBkZXNjcmlwdGlvbjogJ1MzIFVSSSBmb3IgdGhlIGVudmlyb25tZW50IGZpbGUgKGZvciBFQ1MgZW52aXJvbm1lbnRGaWxlcyknXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==