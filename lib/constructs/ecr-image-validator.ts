/**
 * ECR Image Validator - Ensures required Docker images exist before deployment
 */
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
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
export class EcrImageValidator extends Construct {
  constructor(scope: Construct, id: string, props: EcrImageValidatorProps) {
    super(scope, id);

    // Extract repository name from ARN
    // ECR ARN format: arn:aws:ecr:region:account:repository/repository-name
    // Note: At construct time, props.ecrRepositoryArn might be a CloudFormation token
    // so we'll defer the repository name extraction to the Lambda function
    
    // For validation during synthesis, check if it's a token or a real ARN
    const isToken = cdk.Token.isUnresolved(props.ecrRepositoryArn);
    
    if (!isToken) {
      // Only validate format if it's not a CloudFormation token
      if (!props.ecrRepositoryArn.startsWith('arn:aws:ecr:') || !props.ecrRepositoryArn.includes('repository/')) {
        throw new Error(`Invalid ECR repository ARN: ${props.ecrRepositoryArn}`);
      }
      
      const repositoryName = props.ecrRepositoryArn.split('/').pop();
      if (!repositoryName) {
        throw new Error(`Invalid ECR repository ARN: ${props.ecrRepositoryArn}`);
      }
    }

    // Create IAM role for the custom resource Lambda
    const customResourceRole = new iam.Role(this, 'CustomResourceRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ],
      inlinePolicies: {
        ECRAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'ecr:DescribeImages',
                'ecr:ListImages',
                'ecr:GetAuthorizationToken'
              ],
              resources: [props.ecrRepositoryArn]
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['ecr:GetAuthorizationToken'],
              resources: ['*'] // GetAuthorizationToken requires * resource
            })
          ]
        })
      }
    });

    // Create log group for the custom resource
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/lambda/ecr-image-validator-${props.environment}`,
      retention: props.config.monitoring.logRetentionDays,
      removalPolicy: props.config.general.removalPolicy
    });

    // Lambda function code for validating ECR images
    const lambdaCode = `
import json
import boto3
import urllib3

def handler(event, context):
    print(f"Event: {json.dumps(event)}")
    
    ecr_client = boto3.client('ecr')
    ecr_repository_arn = event['ResourceProperties']['EcrRepositoryArn']
    required_tags = event['ResourceProperties']['RequiredTags']
    
    try:
        if event['RequestType'] in ['Create', 'Update']:
            print(f"ECR Repository ARN: {ecr_repository_arn}")
            print(f"Required tags: {required_tags}")
            
            # Extract repository name from ARN at runtime
            # ECR ARN format: arn:aws:ecr:region:account:repository/repository-name
            if not ecr_repository_arn.startswith('arn:aws:ecr:') or 'repository/' not in ecr_repository_arn:
                error_msg = f"Invalid ECR repository ARN: {ecr_repository_arn}"
                print(f"ERROR: {error_msg}")
                send_response(event, context, "FAILED", {"Error": error_msg})
                return
                
            repository_name = ecr_repository_arn.split('/')[-1]
            if not repository_name:
                error_msg = f"Could not extract repository name from ARN: {ecr_repository_arn}"
                print(f"ERROR: {error_msg}")
                send_response(event, context, "FAILED", {"Error": error_msg})
                return
            
            print(f"Extracted repository name: {repository_name}")
            print(f"Validating images in repository: {repository_name}")
            
            # List all images in the repository
            response = ecr_client.describe_images(repositoryName=repository_name)
            
            # Extract all available tags
            available_tags = set()
            for image in response.get('imageDetails', []):
                for tag in image.get('imageTags', []):
                    available_tags.add(tag)
            
            print(f"Available tags: {list(available_tags)}")
            
            # Check if all required tags are present
            missing_tags = []
            for required_tag in required_tags:
                if required_tag not in available_tags:
                    missing_tags.append(required_tag)
            
            if missing_tags:
                error_msg = f"Missing required ECR images in repository '{repository_name}': {missing_tags}. Available tags: {list(available_tags)}"
                print(f"ERROR: {error_msg}")
                send_response(event, context, "FAILED", {"Error": error_msg})
                return
            
            print("All required ECR images are available")
            send_response(event, context, "SUCCESS", {"Message": "All required images validated successfully"})
            
        elif event['RequestType'] == 'Delete':
            print("Delete request - no validation needed")
            send_response(event, context, "SUCCESS", {"Message": "Delete completed"})
            
    except Exception as e:
        error_msg = f"Error validating ECR images: {str(e)}"
        print(f"ERROR: {error_msg}")
        send_response(event, context, "FAILED", {"Error": error_msg})

def send_response(event, context, response_status, response_data):
    response_url = event['ResponseURL']
    
    response_body = {
        'Status': response_status,
        'Reason': f'See the details in CloudWatch Log Stream: {context.log_stream_name}',
        'PhysicalResourceId': context.log_stream_name,
        'StackId': event['StackId'],
        'RequestId': event['RequestId'],
        'LogicalResourceId': event['LogicalResourceId'],
        'Data': response_data
    }
    
    json_response_body = json.dumps(response_body)
    
    headers = {
        'content-type': '',
        'content-length': str(len(json_response_body))
    }
    
    http = urllib3.PoolManager()
    try:
        response = http.request('PUT', response_url, body=json_response_body, headers=headers)
        print(f"Status code: {response.status}")
    except Exception as e:
        print(f"send_response Error: {e}")
`;

    // Create the custom resource provider
    const provider = new cr.Provider(this, 'Provider', {
      onEventHandler: new cdk.aws_lambda.Function(this, 'ValidatorFunction', {
        runtime: cdk.aws_lambda.Runtime.PYTHON_3_11,
        handler: 'index.handler',
        code: cdk.aws_lambda.Code.fromInline(lambdaCode),
        timeout: cdk.Duration.minutes(5),
        role: customResourceRole,
        logGroup: logGroup,
        environment: {
          LOG_LEVEL: 'INFO'
        }
      })
    });

    // Create the custom resource
    const customResource = new cdk.CustomResource(this, 'ImageValidation', {
      serviceToken: provider.serviceToken,
      properties: {
        EcrRepositoryArn: props.ecrRepositoryArn,
        RequiredTags: props.requiredImageTags,
        // Add a timestamp to force updates when tags change
        Timestamp: new Date().toISOString()
      }
    });

    // Add metadata for troubleshooting
    customResource.node.addMetadata('Description', 'Validates that required ECR images exist before deployment');
    customResource.node.addMetadata('RequiredTags', props.requiredImageTags.join(', '));
  }
}
