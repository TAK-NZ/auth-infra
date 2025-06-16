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
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWNyLWltYWdlLXZhbGlkYXRvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImVjci1pbWFnZS12YWxpZGF0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTs7R0FFRztBQUNILDJDQUF1QztBQUN2QyxpREFBbUM7QUFDbkMsaUVBQW1EO0FBQ25ELHlEQUEyQztBQUMzQywyREFBNkM7QUFzQjdDOztHQUVHO0FBQ0gsTUFBYSxpQkFBa0IsU0FBUSxzQkFBUztJQUM5QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTZCO1FBQ3JFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsbUNBQW1DO1FBQ25DLHdFQUF3RTtRQUN4RSxrRkFBa0Y7UUFDbEYsdUVBQXVFO1FBRXZFLHVFQUF1RTtRQUN2RSxNQUFNLE9BQU8sR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUUvRCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDYiwwREFBMEQ7WUFDMUQsSUFBSSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUM7Z0JBQzFHLE1BQU0sSUFBSSxLQUFLLENBQUMsK0JBQStCLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLENBQUM7WUFDM0UsQ0FBQztZQUVELE1BQU0sY0FBYyxHQUFHLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDL0QsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO2dCQUNwQixNQUFNLElBQUksS0FBSyxDQUFDLCtCQUErQixLQUFLLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxD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QztRQUVILG1DQUFtQztRQUNuQyxjQUFjLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxhQUFhLEVBQUUsNERBQTRELENBQUMsQ0FBQztRQUM3RyxjQUFjLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxjQUFjLEVBQUUsS0FBSyxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ3RGLENBQUM7Q0FDRjtBQTVMRCw4Q0E0TEMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEVDUiBJbWFnZSBWYWxpZGF0b3IgLSBFbnN1cmVzIHJlcXVpcmVkIERvY2tlciBpbWFnZXMgZXhpc3QgYmVmb3JlIGRlcGxveW1lbnRcbiAqL1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgY3IgZnJvbSAnYXdzLWNkay1saWIvY3VzdG9tLXJlc291cmNlcyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciBFQ1IgSW1hZ2UgVmFsaWRhdG9yXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgRWNySW1hZ2VWYWxpZGF0b3JQcm9wcyB7XG4gIC8qKlxuICAgKiBFQ1IgcmVwb3NpdG9yeSBBUk5cbiAgICovXG4gIGVjclJlcG9zaXRvcnlBcm46IHN0cmluZztcblxuICAvKipcbiAgICogTGlzdCBvZiByZXF1aXJlZCBpbWFnZSB0YWdzIHRvIHZhbGlkYXRlXG4gICAqL1xuICByZXF1aXJlZEltYWdlVGFnczogc3RyaW5nW107XG5cbiAgLyoqXG4gICAqIEVudmlyb25tZW50IG5hbWUgZm9yIGxvZ2dpbmdcbiAgICovXG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG59XG5cbi8qKlxuICogQ3VzdG9tIHJlc291cmNlIHRvIHZhbGlkYXRlIEVDUiBpbWFnZXMgZXhpc3QgYmVmb3JlIGRlcGxveW1lbnRcbiAqL1xuZXhwb3J0IGNsYXNzIEVjckltYWdlVmFsaWRhdG9yIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEVjckltYWdlVmFsaWRhdG9yUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gRXh0cmFjdCByZXBvc2l0b3J5IG5hbWUgZnJvbSBBUk5cbiAgICAvLyBFQ1IgQVJOIGZvcm1hdDogYXJuOmF3czplY3I6cmVnaW9uOmFjY291bnQ6cmVwb3NpdG9yeS9yZXBvc2l0b3J5LW5hbWVcbiAgICAvLyBOb3RlOiBBdCBjb25zdHJ1Y3QgdGltZSwgcHJvcHMuZWNyUmVwb3NpdG9yeUFybiBtaWdodCBiZSBhIENsb3VkRm9ybWF0aW9uIHRva2VuXG4gICAgLy8gc28gd2UnbGwgZGVmZXIgdGhlIHJlcG9zaXRvcnkgbmFtZSBleHRyYWN0aW9uIHRvIHRoZSBMYW1iZGEgZnVuY3Rpb25cbiAgICBcbiAgICAvLyBGb3IgdmFsaWRhdGlvbiBkdXJpbmcgc3ludGhlc2lzLCBjaGVjayBpZiBpdCdzIGEgdG9rZW4gb3IgYSByZWFsIEFSTlxuICAgIGNvbnN0IGlzVG9rZW4gPSBjZGsuVG9rZW4uaXNVbnJlc29sdmVkKHByb3BzLmVjclJlcG9zaXRvcnlBcm4pO1xuICAgIFxuICAgIGlmICghaXNUb2tlbikge1xuICAgICAgLy8gT25seSB2YWxpZGF0ZSBmb3JtYXQgaWYgaXQncyBub3QgYSBDbG91ZEZvcm1hdGlvbiB0b2tlblxuICAgICAgaWYgKCFwcm9wcy5lY3JSZXBvc2l0b3J5QXJuLnN0YXJ0c1dpdGgoJ2Fybjphd3M6ZWNyOicpIHx8ICFwcm9wcy5lY3JSZXBvc2l0b3J5QXJuLmluY2x1ZGVzKCdyZXBvc2l0b3J5LycpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBFQ1IgcmVwb3NpdG9yeSBBUk46ICR7cHJvcHMuZWNyUmVwb3NpdG9yeUFybn1gKTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgY29uc3QgcmVwb3NpdG9yeU5hbWUgPSBwcm9wcy5lY3JSZXBvc2l0b3J5QXJuLnNwbGl0KCcvJykucG9wKCk7XG4gICAgICBpZiAoIXJlcG9zaXRvcnlOYW1lKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBFQ1IgcmVwb3NpdG9yeSBBUk46ICR7cHJvcHMuZWNyUmVwb3NpdG9yeUFybn1gKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgSUFNIHJvbGUgZm9yIHRoZSBjdXN0b20gcmVzb3VyY2UgTGFtYmRhXG4gICAgY29uc3QgY3VzdG9tUmVzb3VyY2VSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdDdXN0b21SZXNvdXJjZVJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKVxuICAgICAgXSxcbiAgICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgIEVDUkFjY2VzczogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnZWNyOkRlc2NyaWJlSW1hZ2VzJyxcbiAgICAgICAgICAgICAgICAnZWNyOkxpc3RJbWFnZXMnLFxuICAgICAgICAgICAgICAgICdlY3I6R2V0QXV0aG9yaXphdGlvblRva2VuJ1xuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtwcm9wcy5lY3JSZXBvc2l0b3J5QXJuXVxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogWydlY3I6R2V0QXV0aG9yaXphdGlvblRva2VuJ10sXG4gICAgICAgICAgICAgIHJlc291cmNlczogWycqJ10gLy8gR2V0QXV0aG9yaXphdGlvblRva2VuIHJlcXVpcmVzICogcmVzb3VyY2VcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgXVxuICAgICAgICB9KVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIGxvZyBncm91cCBmb3IgdGhlIGN1c3RvbSByZXNvdXJjZVxuICAgIGNvbnN0IGxvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0xvZ0dyb3VwJywge1xuICAgICAgbG9nR3JvdXBOYW1lOiBgL2F3cy9sYW1iZGEvZWNyLWltYWdlLXZhbGlkYXRvci0ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1lcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiBjb2RlIGZvciB2YWxpZGF0aW5nIEVDUiBpbWFnZXNcbiAgICBjb25zdCBsYW1iZGFDb2RlID0gYFxuaW1wb3J0IGpzb25cbmltcG9ydCBib3RvM1xuaW1wb3J0IHVybGxpYjNcblxuZGVmIGhhbmRsZXIoZXZlbnQsIGNvbnRleHQpOlxuICAgIHByaW50KGZcIkV2ZW50OiB7anNvbi5kdW1wcyhldmVudCl9XCIpXG4gICAgXG4gICAgZWNyX2NsaWVudCA9IGJvdG8zLmNsaWVudCgnZWNyJylcbiAgICBlY3JfcmVwb3NpdG9yeV9hcm4gPSBldmVudFsnUmVzb3VyY2VQcm9wZXJ0aWVzJ11bJ0VjclJlcG9zaXRvcnlBcm4nXVxuICAgIHJlcXVpcmVkX3RhZ3MgPSBldmVudFsnUmVzb3VyY2VQcm9wZXJ0aWVzJ11bJ1JlcXVpcmVkVGFncyddXG4gICAgXG4gICAgdHJ5OlxuICAgICAgICBpZiBldmVudFsnUmVxdWVzdFR5cGUnXSBpbiBbJ0NyZWF0ZScsICdVcGRhdGUnXTpcbiAgICAgICAgICAgIHByaW50KGZcIkVDUiBSZXBvc2l0b3J5IEFSTjoge2Vjcl9yZXBvc2l0b3J5X2Fybn1cIilcbiAgICAgICAgICAgIHByaW50KGZcIlJlcXVpcmVkIHRhZ3M6IHtyZXF1aXJlZF90YWdzfVwiKVxuICAgICAgICAgICAgXG4gICAgICAgICAgICAjIEV4dHJhY3QgcmVwb3NpdG9yeSBuYW1lIGZyb20gQVJOIGF0IHJ1bnRpbWVcbiAgICAgICAgICAgICMgRUNSIEFSTiBmb3JtYXQ6IGFybjphd3M6ZWNyOnJlZ2lvbjphY2NvdW50OnJlcG9zaXRvcnkvcmVwb3NpdG9yeS1uYW1lXG4gICAgICAgICAgICBpZiBub3QgZWNyX3JlcG9zaXRvcnlfYXJuLnN0YXJ0c3dpdGgoJ2Fybjphd3M6ZWNyOicpIG9yICdyZXBvc2l0b3J5Lycgbm90IGluIGVjcl9yZXBvc2l0b3J5X2FybjpcbiAgICAgICAgICAgICAgICBlcnJvcl9tc2cgPSBmXCJJbnZhbGlkIEVDUiByZXBvc2l0b3J5IEFSTjoge2Vjcl9yZXBvc2l0b3J5X2Fybn1cIlxuICAgICAgICAgICAgICAgIHByaW50KGZcIkVSUk9SOiB7ZXJyb3JfbXNnfVwiKVxuICAgICAgICAgICAgICAgIHNlbmRfcmVzcG9uc2UoZXZlbnQsIGNvbnRleHQsIFwiRkFJTEVEXCIsIHtcIkVycm9yXCI6IGVycm9yX21zZ30pXG4gICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICByZXBvc2l0b3J5X25hbWUgPSBlY3JfcmVwb3NpdG9yeV9hcm4uc3BsaXQoJy8nKVstMV1cbiAgICAgICAgICAgIGlmIG5vdCByZXBvc2l0b3J5X25hbWU6XG4gICAgICAgICAgICAgICAgZXJyb3JfbXNnID0gZlwiQ291bGQgbm90IGV4dHJhY3QgcmVwb3NpdG9yeSBuYW1lIGZyb20gQVJOOiB7ZWNyX3JlcG9zaXRvcnlfYXJufVwiXG4gICAgICAgICAgICAgICAgcHJpbnQoZlwiRVJST1I6IHtlcnJvcl9tc2d9XCIpXG4gICAgICAgICAgICAgICAgc2VuZF9yZXNwb25zZShldmVudCwgY29udGV4dCwgXCJGQUlMRURcIiwge1wiRXJyb3JcIjogZXJyb3JfbXNnfSlcbiAgICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcHJpbnQoZlwiRXh0cmFjdGVkIHJlcG9zaXRvcnkgbmFtZToge3JlcG9zaXRvcnlfbmFtZX1cIilcbiAgICAgICAgICAgIHByaW50KGZcIlZhbGlkYXRpbmcgaW1hZ2VzIGluIHJlcG9zaXRvcnk6IHtyZXBvc2l0b3J5X25hbWV9XCIpXG4gICAgICAgICAgICBcbiAgICAgICAgICAgICMgTGlzdCBhbGwgaW1hZ2VzIGluIHRoZSByZXBvc2l0b3J5XG4gICAgICAgICAgICByZXNwb25zZSA9IGVjcl9jbGllbnQuZGVzY3JpYmVfaW1hZ2VzKHJlcG9zaXRvcnlOYW1lPXJlcG9zaXRvcnlfbmFtZSlcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgIyBFeHRyYWN0IGFsbCBhdmFpbGFibGUgdGFnc1xuICAgICAgICAgICAgYXZhaWxhYmxlX3RhZ3MgPSBzZXQoKVxuICAgICAgICAgICAgZm9yIGltYWdlIGluIHJlc3BvbnNlLmdldCgnaW1hZ2VEZXRhaWxzJywgW10pOlxuICAgICAgICAgICAgICAgIGZvciB0YWcgaW4gaW1hZ2UuZ2V0KCdpbWFnZVRhZ3MnLCBbXSk6XG4gICAgICAgICAgICAgICAgICAgIGF2YWlsYWJsZV90YWdzLmFkZCh0YWcpXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHByaW50KGZcIkF2YWlsYWJsZSB0YWdzOiB7bGlzdChhdmFpbGFibGVfdGFncyl9XCIpXG4gICAgICAgICAgICBcbiAgICAgICAgICAgICMgQ2hlY2sgaWYgYWxsIHJlcXVpcmVkIHRhZ3MgYXJlIHByZXNlbnRcbiAgICAgICAgICAgIG1pc3NpbmdfdGFncyA9IFtdXG4gICAgICAgICAgICBmb3IgcmVxdWlyZWRfdGFnIGluIHJlcXVpcmVkX3RhZ3M6XG4gICAgICAgICAgICAgICAgaWYgcmVxdWlyZWRfdGFnIG5vdCBpbiBhdmFpbGFibGVfdGFnczpcbiAgICAgICAgICAgICAgICAgICAgbWlzc2luZ190YWdzLmFwcGVuZChyZXF1aXJlZF90YWcpXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIG1pc3NpbmdfdGFnczpcbiAgICAgICAgICAgICAgICBlcnJvcl9tc2cgPSBmXCJNaXNzaW5nIHJlcXVpcmVkIEVDUiBpbWFnZXMgaW4gcmVwb3NpdG9yeSAne3JlcG9zaXRvcnlfbmFtZX0nOiB7bWlzc2luZ190YWdzfS4gQXZhaWxhYmxlIHRhZ3M6IHtsaXN0KGF2YWlsYWJsZV90YWdzKX1cIlxuICAgICAgICAgICAgICAgIHByaW50KGZcIkVSUk9SOiB7ZXJyb3JfbXNnfVwiKVxuICAgICAgICAgICAgICAgIHNlbmRfcmVzcG9uc2UoZXZlbnQsIGNvbnRleHQsIFwiRkFJTEVEXCIsIHtcIkVycm9yXCI6IGVycm9yX21zZ30pXG4gICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHByaW50KFwiQWxsIHJlcXVpcmVkIEVDUiBpbWFnZXMgYXJlIGF2YWlsYWJsZVwiKVxuICAgICAgICAgICAgc2VuZF9yZXNwb25zZShldmVudCwgY29udGV4dCwgXCJTVUNDRVNTXCIsIHtcIk1lc3NhZ2VcIjogXCJBbGwgcmVxdWlyZWQgaW1hZ2VzIHZhbGlkYXRlZCBzdWNjZXNzZnVsbHlcIn0pXG4gICAgICAgICAgICBcbiAgICAgICAgZWxpZiBldmVudFsnUmVxdWVzdFR5cGUnXSA9PSAnRGVsZXRlJzpcbiAgICAgICAgICAgIHByaW50KFwiRGVsZXRlIHJlcXVlc3QgLSBubyB2YWxpZGF0aW9uIG5lZWRlZFwiKVxuICAgICAgICAgICAgc2VuZF9yZXNwb25zZShldmVudCwgY29udGV4dCwgXCJTVUNDRVNTXCIsIHtcIk1lc3NhZ2VcIjogXCJEZWxldGUgY29tcGxldGVkXCJ9KVxuICAgICAgICAgICAgXG4gICAgZXhjZXB0IEV4Y2VwdGlvbiBhcyBlOlxuICAgICAgICBlcnJvcl9tc2cgPSBmXCJFcnJvciB2YWxpZGF0aW5nIEVDUiBpbWFnZXM6IHtzdHIoZSl9XCJcbiAgICAgICAgcHJpbnQoZlwiRVJST1I6IHtlcnJvcl9tc2d9XCIpXG4gICAgICAgIHNlbmRfcmVzcG9uc2UoZXZlbnQsIGNvbnRleHQsIFwiRkFJTEVEXCIsIHtcIkVycm9yXCI6IGVycm9yX21zZ30pXG5cbmRlZiBzZW5kX3Jlc3BvbnNlKGV2ZW50LCBjb250ZXh0LCByZXNwb25zZV9zdGF0dXMsIHJlc3BvbnNlX2RhdGEpOlxuICAgIHJlc3BvbnNlX3VybCA9IGV2ZW50WydSZXNwb25zZVVSTCddXG4gICAgXG4gICAgcmVzcG9uc2VfYm9keSA9IHtcbiAgICAgICAgJ1N0YXR1cyc6IHJlc3BvbnNlX3N0YXR1cyxcbiAgICAgICAgJ1JlYXNvbic6IGYnU2VlIHRoZSBkZXRhaWxzIGluIENsb3VkV2F0Y2ggTG9nIFN0cmVhbToge2NvbnRleHQubG9nX3N0cmVhbV9uYW1lfScsXG4gICAgICAgICdQaHlzaWNhbFJlc291cmNlSWQnOiBjb250ZXh0LmxvZ19zdHJlYW1fbmFtZSxcbiAgICAgICAgJ1N0YWNrSWQnOiBldmVudFsnU3RhY2tJZCddLFxuICAgICAgICAnUmVxdWVzdElkJzogZXZlbnRbJ1JlcXVlc3RJZCddLFxuICAgICAgICAnTG9naWNhbFJlc291cmNlSWQnOiBldmVudFsnTG9naWNhbFJlc291cmNlSWQnXSxcbiAgICAgICAgJ0RhdGEnOiByZXNwb25zZV9kYXRhXG4gICAgfVxuICAgIFxuICAgIGpzb25fcmVzcG9uc2VfYm9keSA9IGpzb24uZHVtcHMocmVzcG9uc2VfYm9keSlcbiAgICBcbiAgICBoZWFkZXJzID0ge1xuICAgICAgICAnY29udGVudC10eXBlJzogJycsXG4gICAgICAgICdjb250ZW50LWxlbmd0aCc6IHN0cihsZW4oanNvbl9yZXNwb25zZV9ib2R5KSlcbiAgICB9XG4gICAgXG4gICAgaHR0cCA9IHVybGxpYjMuUG9vbE1hbmFnZXIoKVxuICAgIHRyeTpcbiAgICAgICAgcmVzcG9uc2UgPSBodHRwLnJlcXVlc3QoJ1BVVCcsIHJlc3BvbnNlX3VybCwgYm9keT1qc29uX3Jlc3BvbnNlX2JvZHksIGhlYWRlcnM9aGVhZGVycylcbiAgICAgICAgcHJpbnQoZlwiU3RhdHVzIGNvZGU6IHtyZXNwb25zZS5zdGF0dXN9XCIpXG4gICAgZXhjZXB0IEV4Y2VwdGlvbiBhcyBlOlxuICAgICAgICBwcmludChmXCJzZW5kX3Jlc3BvbnNlIEVycm9yOiB7ZX1cIilcbmA7XG5cbiAgICAvLyBDcmVhdGUgdGhlIGN1c3RvbSByZXNvdXJjZSBwcm92aWRlclxuICAgIGNvbnN0IHByb3ZpZGVyID0gbmV3IGNyLlByb3ZpZGVyKHRoaXMsICdQcm92aWRlcicsIHtcbiAgICAgIG9uRXZlbnRIYW5kbGVyOiBuZXcgY2RrLmF3c19sYW1iZGEuRnVuY3Rpb24odGhpcywgJ1ZhbGlkYXRvckZ1bmN0aW9uJywge1xuICAgICAgICBydW50aW1lOiBjZGsuYXdzX2xhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLFxuICAgICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICAgIGNvZGU6IGNkay5hd3NfbGFtYmRhLkNvZGUuZnJvbUlubGluZShsYW1iZGFDb2RlKSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICAgIHJvbGU6IGN1c3RvbVJlc291cmNlUm9sZSxcbiAgICAgICAgbG9nR3JvdXA6IGxvZ0dyb3VwLFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIExPR19MRVZFTDogJ0lORk8nXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIGN1c3RvbSByZXNvdXJjZVxuICAgIGNvbnN0IGN1c3RvbVJlc291cmNlID0gbmV3IGNkay5DdXN0b21SZXNvdXJjZSh0aGlzLCAnSW1hZ2VWYWxpZGF0aW9uJywge1xuICAgICAgc2VydmljZVRva2VuOiBwcm92aWRlci5zZXJ2aWNlVG9rZW4sXG4gICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgIEVjclJlcG9zaXRvcnlBcm46IHByb3BzLmVjclJlcG9zaXRvcnlBcm4sXG4gICAgICAgIFJlcXVpcmVkVGFnczogcHJvcHMucmVxdWlyZWRJbWFnZVRhZ3MsXG4gICAgICAgIC8vIEFkZCBhIHRpbWVzdGFtcCB0byBmb3JjZSB1cGRhdGVzIHdoZW4gdGFncyBjaGFuZ2VcbiAgICAgICAgVGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEFkZCBtZXRhZGF0YSBmb3IgdHJvdWJsZXNob290aW5nXG4gICAgY3VzdG9tUmVzb3VyY2Uubm9kZS5hZGRNZXRhZGF0YSgnRGVzY3JpcHRpb24nLCAnVmFsaWRhdGVzIHRoYXQgcmVxdWlyZWQgRUNSIGltYWdlcyBleGlzdCBiZWZvcmUgZGVwbG95bWVudCcpO1xuICAgIGN1c3RvbVJlc291cmNlLm5vZGUuYWRkTWV0YWRhdGEoJ1JlcXVpcmVkVGFncycsIHByb3BzLnJlcXVpcmVkSW1hZ2VUYWdzLmpvaW4oJywgJykpO1xuICB9XG59XG4iXX0=