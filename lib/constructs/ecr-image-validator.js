"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EcrImageValidator = void 0;
/**
 * ECR Image Validator - Ensures required Docker images exist before deployment
 */
const constructs_1 = require("constructs");
const cdk = __importStar(require("aws-cdk-lib"));
const cr = __importStar(require("aws-cdk-lib/custom-resources"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
/**
 * Custom resource to validate ECR images exist before deployment
 */
class EcrImageValidator extends constructs_1.Construct {
    constructor(scope, id, props) {
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
exports.EcrImageValidator = EcrImageValidator;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWNyLWltYWdlLXZhbGlkYXRvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImVjci1pbWFnZS12YWxpZGF0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTs7R0FFRztBQUNILDJDQUF1QztBQUN2QyxpREFBbUM7QUFDbkMsaUVBQW1EO0FBQ25ELHlEQUEyQztBQUMzQywyREFBNkM7QUE0QjdDOztHQUVHO0FBQ0gsTUFBYSxpQkFBa0IsU0FBUSxzQkFBUztJQUM5QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTZCO1FBQ3JFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsbUNBQW1DO1FBQ25DLHdFQUF3RTtRQUN4RSxrRkFBa0Y7UUFDbEYsdUVBQXVFO1FBRXZFLHVFQUF1RTtRQUN2RSxNQUFNLE9BQU8sR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUUvRCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDYiwwREFBMEQ7WUFDMUQsSUFBSSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUM7Z0JBQzFHLE1BQU0sSUFBSSxLQUFLLENBQUMsK0JBQStCLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLENBQUM7WUFDM0UsQ0FBQztZQUVELE1BQU0sY0FBYyxHQUFHLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDL0QsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO2dCQUNwQixNQUFNLElBQUksS0FBSyxDQUFDLCtCQUErQixLQUFLLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxD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QUU7YUFDcEM7U0FDRixDQUFDLENBQUM7UUFFSCxtQ0FBbUM7UUFDbkMsY0FBYyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsYUFBYSxFQUFFLDREQUE0RCxDQUFDLENBQUM7UUFDN0csY0FBYyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsY0FBYyxFQUFFLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUN0RixDQUFDO0NBQ0Y7QUE1TEQsOENBNExDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBFQ1IgSW1hZ2UgVmFsaWRhdG9yIC0gRW5zdXJlcyByZXF1aXJlZCBEb2NrZXIgaW1hZ2VzIGV4aXN0IGJlZm9yZSBkZXBsb3ltZW50XG4gKi9cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGNyIGZyb20gJ2F3cy1jZGstbGliL2N1c3RvbS1yZXNvdXJjZXMnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XG5pbXBvcnQgdHlwZSB7IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi4vZW52aXJvbm1lbnQtY29uZmlnJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciBFQ1IgSW1hZ2UgVmFsaWRhdG9yXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgRWNySW1hZ2VWYWxpZGF0b3JQcm9wcyB7XG4gIC8qKlxuICAgKiBFQ1IgcmVwb3NpdG9yeSBBUk5cbiAgICovXG4gIGVjclJlcG9zaXRvcnlBcm46IHN0cmluZztcblxuICAvKipcbiAgICogTGlzdCBvZiByZXF1aXJlZCBpbWFnZSB0YWdzIHRvIHZhbGlkYXRlXG4gICAqL1xuICByZXF1aXJlZEltYWdlVGFnczogc3RyaW5nW107XG5cbiAgLyoqXG4gICAqIEVudmlyb25tZW50IG5hbWUgZm9yIGxvZ2dpbmdcbiAgICovXG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEVudmlyb25tZW50IGNvbmZpZ3VyYXRpb25cbiAgICovXG4gIGNvbmZpZzogQXV0aEluZnJhRW52aXJvbm1lbnRDb25maWc7XG59XG5cbi8qKlxuICogQ3VzdG9tIHJlc291cmNlIHRvIHZhbGlkYXRlIEVDUiBpbWFnZXMgZXhpc3QgYmVmb3JlIGRlcGxveW1lbnRcbiAqL1xuZXhwb3J0IGNsYXNzIEVjckltYWdlVmFsaWRhdG9yIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEVjckltYWdlVmFsaWRhdG9yUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gRXh0cmFjdCByZXBvc2l0b3J5IG5hbWUgZnJvbSBBUk5cbiAgICAvLyBFQ1IgQVJOIGZvcm1hdDogYXJuOmF3czplY3I6cmVnaW9uOmFjY291bnQ6cmVwb3NpdG9yeS9yZXBvc2l0b3J5LW5hbWVcbiAgICAvLyBOb3RlOiBBdCBjb25zdHJ1Y3QgdGltZSwgcHJvcHMuZWNyUmVwb3NpdG9yeUFybiBtaWdodCBiZSBhIENsb3VkRm9ybWF0aW9uIHRva2VuXG4gICAgLy8gc28gd2UnbGwgZGVmZXIgdGhlIHJlcG9zaXRvcnkgbmFtZSBleHRyYWN0aW9uIHRvIHRoZSBMYW1iZGEgZnVuY3Rpb25cbiAgICBcbiAgICAvLyBGb3IgdmFsaWRhdGlvbiBkdXJpbmcgc3ludGhlc2lzLCBjaGVjayBpZiBpdCdzIGEgdG9rZW4gb3IgYSByZWFsIEFSTlxuICAgIGNvbnN0IGlzVG9rZW4gPSBjZGsuVG9rZW4uaXNVbnJlc29sdmVkKHByb3BzLmVjclJlcG9zaXRvcnlBcm4pO1xuICAgIFxuICAgIGlmICghaXNUb2tlbikge1xuICAgICAgLy8gT25seSB2YWxpZGF0ZSBmb3JtYXQgaWYgaXQncyBub3QgYSBDbG91ZEZvcm1hdGlvbiB0b2tlblxuICAgICAgaWYgKCFwcm9wcy5lY3JSZXBvc2l0b3J5QXJuLnN0YXJ0c1dpdGgoJ2Fybjphd3M6ZWNyOicpIHx8ICFwcm9wcy5lY3JSZXBvc2l0b3J5QXJuLmluY2x1ZGVzKCdyZXBvc2l0b3J5LycpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBFQ1IgcmVwb3NpdG9yeSBBUk46ICR7cHJvcHMuZWNyUmVwb3NpdG9yeUFybn1gKTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgY29uc3QgcmVwb3NpdG9yeU5hbWUgPSBwcm9wcy5lY3JSZXBvc2l0b3J5QXJuLnNwbGl0KCcvJykucG9wKCk7XG4gICAgICBpZiAoIXJlcG9zaXRvcnlOYW1lKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBFQ1IgcmVwb3NpdG9yeSBBUk46ICR7cHJvcHMuZWNyUmVwb3NpdG9yeUFybn1gKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgSUFNIHJvbGUgZm9yIHRoZSBjdXN0b20gcmVzb3VyY2UgTGFtYmRhXG4gICAgY29uc3QgY3VzdG9tUmVzb3VyY2VSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdDdXN0b21SZXNvdXJjZVJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKVxuICAgICAgXSxcbiAgICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgIEVDUkFjY2VzczogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnZWNyOkRlc2NyaWJlSW1hZ2VzJyxcbiAgICAgICAgICAgICAgICAnZWNyOkxpc3RJbWFnZXMnLFxuICAgICAgICAgICAgICAgICdlY3I6R2V0QXV0aG9yaXphdGlvblRva2VuJ1xuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtwcm9wcy5lY3JSZXBvc2l0b3J5QXJuXVxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogWydlY3I6R2V0QXV0aG9yaXphdGlvblRva2VuJ10sXG4gICAgICAgICAgICAgIHJlc291cmNlczogWycqJ10gLy8gR2V0QXV0aG9yaXphdGlvblRva2VuIHJlcXVpcmVzICogcmVzb3VyY2VcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgXVxuICAgICAgICB9KVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIGxvZyBncm91cCBmb3IgdGhlIGN1c3RvbSByZXNvdXJjZVxuICAgIGNvbnN0IGxvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0xvZ0dyb3VwJywge1xuICAgICAgbG9nR3JvdXBOYW1lOiBgL2F3cy9sYW1iZGEvZWNyLWltYWdlLXZhbGlkYXRvci0ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICByZXRlbnRpb246IHByb3BzLmNvbmZpZy5tb25pdG9yaW5nLmxvZ1JldGVudGlvbkRheXMsXG4gICAgICByZW1vdmFsUG9saWN5OiBwcm9wcy5jb25maWcuZ2VuZXJhbC5yZW1vdmFsUG9saWN5XG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb24gY29kZSBmb3IgdmFsaWRhdGluZyBFQ1IgaW1hZ2VzXG4gICAgY29uc3QgbGFtYmRhQ29kZSA9IGBcbmltcG9ydCBqc29uXG5pbXBvcnQgYm90bzNcbmltcG9ydCB1cmxsaWIzXG5cbmRlZiBoYW5kbGVyKGV2ZW50LCBjb250ZXh0KTpcbiAgICBwcmludChmXCJFdmVudDoge2pzb24uZHVtcHMoZXZlbnQpfVwiKVxuICAgIFxuICAgIGVjcl9jbGllbnQgPSBib3RvMy5jbGllbnQoJ2VjcicpXG4gICAgZWNyX3JlcG9zaXRvcnlfYXJuID0gZXZlbnRbJ1Jlc291cmNlUHJvcGVydGllcyddWydFY3JSZXBvc2l0b3J5QXJuJ11cbiAgICByZXF1aXJlZF90YWdzID0gZXZlbnRbJ1Jlc291cmNlUHJvcGVydGllcyddWydSZXF1aXJlZFRhZ3MnXVxuICAgIFxuICAgIHRyeTpcbiAgICAgICAgaWYgZXZlbnRbJ1JlcXVlc3RUeXBlJ10gaW4gWydDcmVhdGUnLCAnVXBkYXRlJ106XG4gICAgICAgICAgICBwcmludChmXCJFQ1IgUmVwb3NpdG9yeSBBUk46IHtlY3JfcmVwb3NpdG9yeV9hcm59XCIpXG4gICAgICAgICAgICBwcmludChmXCJSZXF1aXJlZCB0YWdzOiB7cmVxdWlyZWRfdGFnc31cIilcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgIyBFeHRyYWN0IHJlcG9zaXRvcnkgbmFtZSBmcm9tIEFSTiBhdCBydW50aW1lXG4gICAgICAgICAgICAjIEVDUiBBUk4gZm9ybWF0OiBhcm46YXdzOmVjcjpyZWdpb246YWNjb3VudDpyZXBvc2l0b3J5L3JlcG9zaXRvcnktbmFtZVxuICAgICAgICAgICAgaWYgbm90IGVjcl9yZXBvc2l0b3J5X2Fybi5zdGFydHN3aXRoKCdhcm46YXdzOmVjcjonKSBvciAncmVwb3NpdG9yeS8nIG5vdCBpbiBlY3JfcmVwb3NpdG9yeV9hcm46XG4gICAgICAgICAgICAgICAgZXJyb3JfbXNnID0gZlwiSW52YWxpZCBFQ1IgcmVwb3NpdG9yeSBBUk46IHtlY3JfcmVwb3NpdG9yeV9hcm59XCJcbiAgICAgICAgICAgICAgICBwcmludChmXCJFUlJPUjoge2Vycm9yX21zZ31cIilcbiAgICAgICAgICAgICAgICBzZW5kX3Jlc3BvbnNlKGV2ZW50LCBjb250ZXh0LCBcIkZBSUxFRFwiLCB7XCJFcnJvclwiOiBlcnJvcl9tc2d9KVxuICAgICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgcmVwb3NpdG9yeV9uYW1lID0gZWNyX3JlcG9zaXRvcnlfYXJuLnNwbGl0KCcvJylbLTFdXG4gICAgICAgICAgICBpZiBub3QgcmVwb3NpdG9yeV9uYW1lOlxuICAgICAgICAgICAgICAgIGVycm9yX21zZyA9IGZcIkNvdWxkIG5vdCBleHRyYWN0IHJlcG9zaXRvcnkgbmFtZSBmcm9tIEFSTjoge2Vjcl9yZXBvc2l0b3J5X2Fybn1cIlxuICAgICAgICAgICAgICAgIHByaW50KGZcIkVSUk9SOiB7ZXJyb3JfbXNnfVwiKVxuICAgICAgICAgICAgICAgIHNlbmRfcmVzcG9uc2UoZXZlbnQsIGNvbnRleHQsIFwiRkFJTEVEXCIsIHtcIkVycm9yXCI6IGVycm9yX21zZ30pXG4gICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHByaW50KGZcIkV4dHJhY3RlZCByZXBvc2l0b3J5IG5hbWU6IHtyZXBvc2l0b3J5X25hbWV9XCIpXG4gICAgICAgICAgICBwcmludChmXCJWYWxpZGF0aW5nIGltYWdlcyBpbiByZXBvc2l0b3J5OiB7cmVwb3NpdG9yeV9uYW1lfVwiKVxuICAgICAgICAgICAgXG4gICAgICAgICAgICAjIExpc3QgYWxsIGltYWdlcyBpbiB0aGUgcmVwb3NpdG9yeVxuICAgICAgICAgICAgcmVzcG9uc2UgPSBlY3JfY2xpZW50LmRlc2NyaWJlX2ltYWdlcyhyZXBvc2l0b3J5TmFtZT1yZXBvc2l0b3J5X25hbWUpXG4gICAgICAgICAgICBcbiAgICAgICAgICAgICMgRXh0cmFjdCBhbGwgYXZhaWxhYmxlIHRhZ3NcbiAgICAgICAgICAgIGF2YWlsYWJsZV90YWdzID0gc2V0KClcbiAgICAgICAgICAgIGZvciBpbWFnZSBpbiByZXNwb25zZS5nZXQoJ2ltYWdlRGV0YWlscycsIFtdKTpcbiAgICAgICAgICAgICAgICBmb3IgdGFnIGluIGltYWdlLmdldCgnaW1hZ2VUYWdzJywgW10pOlxuICAgICAgICAgICAgICAgICAgICBhdmFpbGFibGVfdGFncy5hZGQodGFnKVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBwcmludChmXCJBdmFpbGFibGUgdGFnczoge2xpc3QoYXZhaWxhYmxlX3RhZ3MpfVwiKVxuICAgICAgICAgICAgXG4gICAgICAgICAgICAjIENoZWNrIGlmIGFsbCByZXF1aXJlZCB0YWdzIGFyZSBwcmVzZW50XG4gICAgICAgICAgICBtaXNzaW5nX3RhZ3MgPSBbXVxuICAgICAgICAgICAgZm9yIHJlcXVpcmVkX3RhZyBpbiByZXF1aXJlZF90YWdzOlxuICAgICAgICAgICAgICAgIGlmIHJlcXVpcmVkX3RhZyBub3QgaW4gYXZhaWxhYmxlX3RhZ3M6XG4gICAgICAgICAgICAgICAgICAgIG1pc3NpbmdfdGFncy5hcHBlbmQocmVxdWlyZWRfdGFnKVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiBtaXNzaW5nX3RhZ3M6XG4gICAgICAgICAgICAgICAgZXJyb3JfbXNnID0gZlwiTWlzc2luZyByZXF1aXJlZCBFQ1IgaW1hZ2VzIGluIHJlcG9zaXRvcnkgJ3tyZXBvc2l0b3J5X25hbWV9Jzoge21pc3NpbmdfdGFnc30uIEF2YWlsYWJsZSB0YWdzOiB7bGlzdChhdmFpbGFibGVfdGFncyl9XCJcbiAgICAgICAgICAgICAgICBwcmludChmXCJFUlJPUjoge2Vycm9yX21zZ31cIilcbiAgICAgICAgICAgICAgICBzZW5kX3Jlc3BvbnNlKGV2ZW50LCBjb250ZXh0LCBcIkZBSUxFRFwiLCB7XCJFcnJvclwiOiBlcnJvcl9tc2d9KVxuICAgICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgXG4gICAgICAgICAgICBwcmludChcIkFsbCByZXF1aXJlZCBFQ1IgaW1hZ2VzIGFyZSBhdmFpbGFibGVcIilcbiAgICAgICAgICAgIHNlbmRfcmVzcG9uc2UoZXZlbnQsIGNvbnRleHQsIFwiU1VDQ0VTU1wiLCB7XCJNZXNzYWdlXCI6IFwiQWxsIHJlcXVpcmVkIGltYWdlcyB2YWxpZGF0ZWQgc3VjY2Vzc2Z1bGx5XCJ9KVxuICAgICAgICAgICAgXG4gICAgICAgIGVsaWYgZXZlbnRbJ1JlcXVlc3RUeXBlJ10gPT0gJ0RlbGV0ZSc6XG4gICAgICAgICAgICBwcmludChcIkRlbGV0ZSByZXF1ZXN0IC0gbm8gdmFsaWRhdGlvbiBuZWVkZWRcIilcbiAgICAgICAgICAgIHNlbmRfcmVzcG9uc2UoZXZlbnQsIGNvbnRleHQsIFwiU1VDQ0VTU1wiLCB7XCJNZXNzYWdlXCI6IFwiRGVsZXRlIGNvbXBsZXRlZFwifSlcbiAgICAgICAgICAgIFxuICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZTpcbiAgICAgICAgZXJyb3JfbXNnID0gZlwiRXJyb3IgdmFsaWRhdGluZyBFQ1IgaW1hZ2VzOiB7c3RyKGUpfVwiXG4gICAgICAgIHByaW50KGZcIkVSUk9SOiB7ZXJyb3JfbXNnfVwiKVxuICAgICAgICBzZW5kX3Jlc3BvbnNlKGV2ZW50LCBjb250ZXh0LCBcIkZBSUxFRFwiLCB7XCJFcnJvclwiOiBlcnJvcl9tc2d9KVxuXG5kZWYgc2VuZF9yZXNwb25zZShldmVudCwgY29udGV4dCwgcmVzcG9uc2Vfc3RhdHVzLCByZXNwb25zZV9kYXRhKTpcbiAgICByZXNwb25zZV91cmwgPSBldmVudFsnUmVzcG9uc2VVUkwnXVxuICAgIFxuICAgIHJlc3BvbnNlX2JvZHkgPSB7XG4gICAgICAgICdTdGF0dXMnOiByZXNwb25zZV9zdGF0dXMsXG4gICAgICAgICdSZWFzb24nOiBmJ1NlZSB0aGUgZGV0YWlscyBpbiBDbG91ZFdhdGNoIExvZyBTdHJlYW06IHtjb250ZXh0LmxvZ19zdHJlYW1fbmFtZX0nLFxuICAgICAgICAnUGh5c2ljYWxSZXNvdXJjZUlkJzogY29udGV4dC5sb2dfc3RyZWFtX25hbWUsXG4gICAgICAgICdTdGFja0lkJzogZXZlbnRbJ1N0YWNrSWQnXSxcbiAgICAgICAgJ1JlcXVlc3RJZCc6IGV2ZW50WydSZXF1ZXN0SWQnXSxcbiAgICAgICAgJ0xvZ2ljYWxSZXNvdXJjZUlkJzogZXZlbnRbJ0xvZ2ljYWxSZXNvdXJjZUlkJ10sXG4gICAgICAgICdEYXRhJzogcmVzcG9uc2VfZGF0YVxuICAgIH1cbiAgICBcbiAgICBqc29uX3Jlc3BvbnNlX2JvZHkgPSBqc29uLmR1bXBzKHJlc3BvbnNlX2JvZHkpXG4gICAgXG4gICAgaGVhZGVycyA9IHtcbiAgICAgICAgJ2NvbnRlbnQtdHlwZSc6ICcnLFxuICAgICAgICAnY29udGVudC1sZW5ndGgnOiBzdHIobGVuKGpzb25fcmVzcG9uc2VfYm9keSkpXG4gICAgfVxuICAgIFxuICAgIGh0dHAgPSB1cmxsaWIzLlBvb2xNYW5hZ2VyKClcbiAgICB0cnk6XG4gICAgICAgIHJlc3BvbnNlID0gaHR0cC5yZXF1ZXN0KCdQVVQnLCByZXNwb25zZV91cmwsIGJvZHk9anNvbl9yZXNwb25zZV9ib2R5LCBoZWFkZXJzPWhlYWRlcnMpXG4gICAgICAgIHByaW50KGZcIlN0YXR1cyBjb2RlOiB7cmVzcG9uc2Uuc3RhdHVzfVwiKVxuICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZTpcbiAgICAgICAgcHJpbnQoZlwic2VuZF9yZXNwb25zZSBFcnJvcjoge2V9XCIpXG5gO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBjdXN0b20gcmVzb3VyY2UgcHJvdmlkZXJcbiAgICBjb25zdCBwcm92aWRlciA9IG5ldyBjci5Qcm92aWRlcih0aGlzLCAnUHJvdmlkZXInLCB7XG4gICAgICBvbkV2ZW50SGFuZGxlcjogbmV3IGNkay5hd3NfbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdWYWxpZGF0b3JGdW5jdGlvbicsIHtcbiAgICAgICAgcnVudGltZTogY2RrLmF3c19sYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcbiAgICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgICBjb2RlOiBjZGsuYXdzX2xhbWJkYS5Db2RlLmZyb21JbmxpbmUobGFtYmRhQ29kZSksXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICByb2xlOiBjdXN0b21SZXNvdXJjZVJvbGUsXG4gICAgICAgIGxvZ0dyb3VwOiBsb2dHcm91cCxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBMT0dfTEVWRUw6ICdJTkZPJ1xuICAgICAgICB9XG4gICAgICB9KVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBjdXN0b20gcmVzb3VyY2VcbiAgICBjb25zdCBjdXN0b21SZXNvdXJjZSA9IG5ldyBjZGsuQ3VzdG9tUmVzb3VyY2UodGhpcywgJ0ltYWdlVmFsaWRhdGlvbicsIHtcbiAgICAgIHNlcnZpY2VUb2tlbjogcHJvdmlkZXIuc2VydmljZVRva2VuLFxuICAgICAgcHJvcGVydGllczoge1xuICAgICAgICBFY3JSZXBvc2l0b3J5QXJuOiBwcm9wcy5lY3JSZXBvc2l0b3J5QXJuLFxuICAgICAgICBSZXF1aXJlZFRhZ3M6IHByb3BzLnJlcXVpcmVkSW1hZ2VUYWdzLFxuICAgICAgICAvLyBBZGQgYSB0aW1lc3RhbXAgdG8gZm9yY2UgdXBkYXRlcyB3aGVuIHRhZ3MgY2hhbmdlXG4gICAgICAgIFRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBBZGQgbWV0YWRhdGEgZm9yIHRyb3VibGVzaG9vdGluZ1xuICAgIGN1c3RvbVJlc291cmNlLm5vZGUuYWRkTWV0YWRhdGEoJ0Rlc2NyaXB0aW9uJywgJ1ZhbGlkYXRlcyB0aGF0IHJlcXVpcmVkIEVDUiBpbWFnZXMgZXhpc3QgYmVmb3JlIGRlcGxveW1lbnQnKTtcbiAgICBjdXN0b21SZXNvdXJjZS5ub2RlLmFkZE1ldGFkYXRhKCdSZXF1aXJlZFRhZ3MnLCBwcm9wcy5yZXF1aXJlZEltYWdlVGFncy5qb2luKCcsICcpKTtcbiAgfVxufVxuIl19