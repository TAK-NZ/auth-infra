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
        if (!props.ecrRepositoryArn.startsWith('arn:aws:ecr:') || !props.ecrRepositoryArn.includes('repository/')) {
            throw new Error(`Invalid ECR repository ARN: ${props.ecrRepositoryArn}`);
        }
        const repositoryName = props.ecrRepositoryArn.split('/').pop();
        if (!repositoryName) {
            throw new Error(`Invalid ECR repository ARN: ${props.ecrRepositoryArn}`);
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
    repository_name = event['ResourceProperties']['RepositoryName']
    required_tags = event['ResourceProperties']['RequiredTags']
    
    try:
        if event['RequestType'] in ['Create', 'Update']:
            print(f"Validating images in repository: {repository_name}")
            print(f"Required tags: {required_tags}")
            
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
                RepositoryName: repositoryName,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWNyLWltYWdlLXZhbGlkYXRvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImVjci1pbWFnZS12YWxpZGF0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTs7R0FFRztBQUNILDJDQUF1QztBQUN2QyxpREFBbUM7QUFDbkMsaUVBQW1EO0FBQ25ELHlEQUEyQztBQUMzQywyREFBNkM7QUFzQjdDOztHQUVHO0FBQ0gsTUFBYSxpQkFBa0IsU0FBUSxzQkFBUztJQUM5QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTZCO1FBQ3JFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsbUNBQW1DO1FBQ25DLHdFQUF3RTtRQUN4RSxJQUFJLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztZQUMxRyxNQUFNLElBQUksS0FBSyxDQUFDLCtCQUErQixLQUFLLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDO1FBQzNFLENBQUM7UUFFRCxNQUFNLGNBQWMsR0FBRyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQy9ELElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUNwQixNQUFNLElBQUksS0FBSyxDQUFDLCtCQUErQixLQUFLLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDO1FBQzNFLENBQUM7UUFFRCxpREFBaUQ7UUFDakQsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQ2xFLFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxzQkFBc0IsQ0FBQztZQUMzRCxlQUFl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LCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEVDUiBJbWFnZSBWYWxpZGF0b3IgLSBFbnN1cmVzIHJlcXVpcmVkIERvY2tlciBpbWFnZXMgZXhpc3QgYmVmb3JlIGRlcGxveW1lbnRcbiAqL1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgY3IgZnJvbSAnYXdzLWNkay1saWIvY3VzdG9tLXJlc291cmNlcyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciBFQ1IgSW1hZ2UgVmFsaWRhdG9yXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgRWNySW1hZ2VWYWxpZGF0b3JQcm9wcyB7XG4gIC8qKlxuICAgKiBFQ1IgcmVwb3NpdG9yeSBBUk5cbiAgICovXG4gIGVjclJlcG9zaXRvcnlBcm46IHN0cmluZztcblxuICAvKipcbiAgICogTGlzdCBvZiByZXF1aXJlZCBpbWFnZSB0YWdzIHRvIHZhbGlkYXRlXG4gICAqL1xuICByZXF1aXJlZEltYWdlVGFnczogc3RyaW5nW107XG5cbiAgLyoqXG4gICAqIEVudmlyb25tZW50IG5hbWUgZm9yIGxvZ2dpbmdcbiAgICovXG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG59XG5cbi8qKlxuICogQ3VzdG9tIHJlc291cmNlIHRvIHZhbGlkYXRlIEVDUiBpbWFnZXMgZXhpc3QgYmVmb3JlIGRlcGxveW1lbnRcbiAqL1xuZXhwb3J0IGNsYXNzIEVjckltYWdlVmFsaWRhdG9yIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEVjckltYWdlVmFsaWRhdG9yUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gRXh0cmFjdCByZXBvc2l0b3J5IG5hbWUgZnJvbSBBUk5cbiAgICAvLyBFQ1IgQVJOIGZvcm1hdDogYXJuOmF3czplY3I6cmVnaW9uOmFjY291bnQ6cmVwb3NpdG9yeS9yZXBvc2l0b3J5LW5hbWVcbiAgICBpZiAoIXByb3BzLmVjclJlcG9zaXRvcnlBcm4uc3RhcnRzV2l0aCgnYXJuOmF3czplY3I6JykgfHwgIXByb3BzLmVjclJlcG9zaXRvcnlBcm4uaW5jbHVkZXMoJ3JlcG9zaXRvcnkvJykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBFQ1IgcmVwb3NpdG9yeSBBUk46ICR7cHJvcHMuZWNyUmVwb3NpdG9yeUFybn1gKTtcbiAgICB9XG4gICAgXG4gICAgY29uc3QgcmVwb3NpdG9yeU5hbWUgPSBwcm9wcy5lY3JSZXBvc2l0b3J5QXJuLnNwbGl0KCcvJykucG9wKCk7XG4gICAgaWYgKCFyZXBvc2l0b3J5TmFtZSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIEVDUiByZXBvc2l0b3J5IEFSTjogJHtwcm9wcy5lY3JSZXBvc2l0b3J5QXJufWApO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSBJQU0gcm9sZSBmb3IgdGhlIGN1c3RvbSByZXNvdXJjZSBMYW1iZGFcbiAgICBjb25zdCBjdXN0b21SZXNvdXJjZVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0N1c3RvbVJlc291cmNlUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScpXG4gICAgICBdLFxuICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgRUNSQWNjZXNzOiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdlY3I6RGVzY3JpYmVJbWFnZXMnLFxuICAgICAgICAgICAgICAgICdlY3I6TGlzdEltYWdlcycsXG4gICAgICAgICAgICAgICAgJ2VjcjpHZXRBdXRob3JpemF0aW9uVG9rZW4nXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW3Byb3BzLmVjclJlcG9zaXRvcnlBcm5dXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbJ2VjcjpHZXRBdXRob3JpemF0aW9uVG9rZW4nXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSAvLyBHZXRBdXRob3JpemF0aW9uVG9rZW4gcmVxdWlyZXMgKiByZXNvdXJjZVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICBdXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgbG9nIGdyb3VwIGZvciB0aGUgY3VzdG9tIHJlc291cmNlXG4gICAgY29uc3QgbG9nR3JvdXAgPSBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnTG9nR3JvdXAnLCB7XG4gICAgICBsb2dHcm91cE5hbWU6IGAvYXdzL2xhbWJkYS9lY3ItaW1hZ2UtdmFsaWRhdG9yLSR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWVxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhIGZ1bmN0aW9uIGNvZGUgZm9yIHZhbGlkYXRpbmcgRUNSIGltYWdlc1xuICAgIGNvbnN0IGxhbWJkYUNvZGUgPSBgXG5pbXBvcnQganNvblxuaW1wb3J0IGJvdG8zXG5pbXBvcnQgdXJsbGliM1xuXG5kZWYgaGFuZGxlcihldmVudCwgY29udGV4dCk6XG4gICAgcHJpbnQoZlwiRXZlbnQ6IHtqc29uLmR1bXBzKGV2ZW50KX1cIilcbiAgICBcbiAgICBlY3JfY2xpZW50ID0gYm90bzMuY2xpZW50KCdlY3InKVxuICAgIHJlcG9zaXRvcnlfbmFtZSA9IGV2ZW50WydSZXNvdXJjZVByb3BlcnRpZXMnXVsnUmVwb3NpdG9yeU5hbWUnXVxuICAgIHJlcXVpcmVkX3RhZ3MgPSBldmVudFsnUmVzb3VyY2VQcm9wZXJ0aWVzJ11bJ1JlcXVpcmVkVGFncyddXG4gICAgXG4gICAgdHJ5OlxuICAgICAgICBpZiBldmVudFsnUmVxdWVzdFR5cGUnXSBpbiBbJ0NyZWF0ZScsICdVcGRhdGUnXTpcbiAgICAgICAgICAgIHByaW50KGZcIlZhbGlkYXRpbmcgaW1hZ2VzIGluIHJlcG9zaXRvcnk6IHtyZXBvc2l0b3J5X25hbWV9XCIpXG4gICAgICAgICAgICBwcmludChmXCJSZXF1aXJlZCB0YWdzOiB7cmVxdWlyZWRfdGFnc31cIilcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgIyBMaXN0IGFsbCBpbWFnZXMgaW4gdGhlIHJlcG9zaXRvcnlcbiAgICAgICAgICAgIHJlc3BvbnNlID0gZWNyX2NsaWVudC5kZXNjcmliZV9pbWFnZXMocmVwb3NpdG9yeU5hbWU9cmVwb3NpdG9yeV9uYW1lKVxuICAgICAgICAgICAgXG4gICAgICAgICAgICAjIEV4dHJhY3QgYWxsIGF2YWlsYWJsZSB0YWdzXG4gICAgICAgICAgICBhdmFpbGFibGVfdGFncyA9IHNldCgpXG4gICAgICAgICAgICBmb3IgaW1hZ2UgaW4gcmVzcG9uc2UuZ2V0KCdpbWFnZURldGFpbHMnLCBbXSk6XG4gICAgICAgICAgICAgICAgZm9yIHRhZyBpbiBpbWFnZS5nZXQoJ2ltYWdlVGFncycsIFtdKTpcbiAgICAgICAgICAgICAgICAgICAgYXZhaWxhYmxlX3RhZ3MuYWRkKHRhZylcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcHJpbnQoZlwiQXZhaWxhYmxlIHRhZ3M6IHtsaXN0KGF2YWlsYWJsZV90YWdzKX1cIilcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgIyBDaGVjayBpZiBhbGwgcmVxdWlyZWQgdGFncyBhcmUgcHJlc2VudFxuICAgICAgICAgICAgbWlzc2luZ190YWdzID0gW11cbiAgICAgICAgICAgIGZvciByZXF1aXJlZF90YWcgaW4gcmVxdWlyZWRfdGFnczpcbiAgICAgICAgICAgICAgICBpZiByZXF1aXJlZF90YWcgbm90IGluIGF2YWlsYWJsZV90YWdzOlxuICAgICAgICAgICAgICAgICAgICBtaXNzaW5nX3RhZ3MuYXBwZW5kKHJlcXVpcmVkX3RhZylcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgbWlzc2luZ190YWdzOlxuICAgICAgICAgICAgICAgIGVycm9yX21zZyA9IGZcIk1pc3NpbmcgcmVxdWlyZWQgRUNSIGltYWdlcyBpbiByZXBvc2l0b3J5ICd7cmVwb3NpdG9yeV9uYW1lfSc6IHttaXNzaW5nX3RhZ3N9LiBBdmFpbGFibGUgdGFnczoge2xpc3QoYXZhaWxhYmxlX3RhZ3MpfVwiXG4gICAgICAgICAgICAgICAgcHJpbnQoZlwiRVJST1I6IHtlcnJvcl9tc2d9XCIpXG4gICAgICAgICAgICAgICAgc2VuZF9yZXNwb25zZShldmVudCwgY29udGV4dCwgXCJGQUlMRURcIiwge1wiRXJyb3JcIjogZXJyb3JfbXNnfSlcbiAgICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcHJpbnQoXCJBbGwgcmVxdWlyZWQgRUNSIGltYWdlcyBhcmUgYXZhaWxhYmxlXCIpXG4gICAgICAgICAgICBzZW5kX3Jlc3BvbnNlKGV2ZW50LCBjb250ZXh0LCBcIlNVQ0NFU1NcIiwge1wiTWVzc2FnZVwiOiBcIkFsbCByZXF1aXJlZCBpbWFnZXMgdmFsaWRhdGVkIHN1Y2Nlc3NmdWxseVwifSlcbiAgICAgICAgICAgIFxuICAgICAgICBlbGlmIGV2ZW50WydSZXF1ZXN0VHlwZSddID09ICdEZWxldGUnOlxuICAgICAgICAgICAgcHJpbnQoXCJEZWxldGUgcmVxdWVzdCAtIG5vIHZhbGlkYXRpb24gbmVlZGVkXCIpXG4gICAgICAgICAgICBzZW5kX3Jlc3BvbnNlKGV2ZW50LCBjb250ZXh0LCBcIlNVQ0NFU1NcIiwge1wiTWVzc2FnZVwiOiBcIkRlbGV0ZSBjb21wbGV0ZWRcIn0pXG4gICAgICAgICAgICBcbiAgICBleGNlcHQgRXhjZXB0aW9uIGFzIGU6XG4gICAgICAgIGVycm9yX21zZyA9IGZcIkVycm9yIHZhbGlkYXRpbmcgRUNSIGltYWdlczoge3N0cihlKX1cIlxuICAgICAgICBwcmludChmXCJFUlJPUjoge2Vycm9yX21zZ31cIilcbiAgICAgICAgc2VuZF9yZXNwb25zZShldmVudCwgY29udGV4dCwgXCJGQUlMRURcIiwge1wiRXJyb3JcIjogZXJyb3JfbXNnfSlcblxuZGVmIHNlbmRfcmVzcG9uc2UoZXZlbnQsIGNvbnRleHQsIHJlc3BvbnNlX3N0YXR1cywgcmVzcG9uc2VfZGF0YSk6XG4gICAgcmVzcG9uc2VfdXJsID0gZXZlbnRbJ1Jlc3BvbnNlVVJMJ11cbiAgICBcbiAgICByZXNwb25zZV9ib2R5ID0ge1xuICAgICAgICAnU3RhdHVzJzogcmVzcG9uc2Vfc3RhdHVzLFxuICAgICAgICAnUmVhc29uJzogZidTZWUgdGhlIGRldGFpbHMgaW4gQ2xvdWRXYXRjaCBMb2cgU3RyZWFtOiB7Y29udGV4dC5sb2dfc3RyZWFtX25hbWV9JyxcbiAgICAgICAgJ1BoeXNpY2FsUmVzb3VyY2VJZCc6IGNvbnRleHQubG9nX3N0cmVhbV9uYW1lLFxuICAgICAgICAnU3RhY2tJZCc6IGV2ZW50WydTdGFja0lkJ10sXG4gICAgICAgICdSZXF1ZXN0SWQnOiBldmVudFsnUmVxdWVzdElkJ10sXG4gICAgICAgICdMb2dpY2FsUmVzb3VyY2VJZCc6IGV2ZW50WydMb2dpY2FsUmVzb3VyY2VJZCddLFxuICAgICAgICAnRGF0YSc6IHJlc3BvbnNlX2RhdGFcbiAgICB9XG4gICAgXG4gICAganNvbl9yZXNwb25zZV9ib2R5ID0ganNvbi5kdW1wcyhyZXNwb25zZV9ib2R5KVxuICAgIFxuICAgIGhlYWRlcnMgPSB7XG4gICAgICAgICdjb250ZW50LXR5cGUnOiAnJyxcbiAgICAgICAgJ2NvbnRlbnQtbGVuZ3RoJzogc3RyKGxlbihqc29uX3Jlc3BvbnNlX2JvZHkpKVxuICAgIH1cbiAgICBcbiAgICBodHRwID0gdXJsbGliMy5Qb29sTWFuYWdlcigpXG4gICAgdHJ5OlxuICAgICAgICByZXNwb25zZSA9IGh0dHAucmVxdWVzdCgnUFVUJywgcmVzcG9uc2VfdXJsLCBib2R5PWpzb25fcmVzcG9uc2VfYm9keSwgaGVhZGVycz1oZWFkZXJzKVxuICAgICAgICBwcmludChmXCJTdGF0dXMgY29kZToge3Jlc3BvbnNlLnN0YXR1c31cIilcbiAgICBleGNlcHQgRXhjZXB0aW9uIGFzIGU6XG4gICAgICAgIHByaW50KGZcInNlbmRfcmVzcG9uc2UgRXJyb3I6IHtlfVwiKVxuYDtcblxuICAgIC8vIENyZWF0ZSB0aGUgY3VzdG9tIHJlc291cmNlIHByb3ZpZGVyXG4gICAgY29uc3QgcHJvdmlkZXIgPSBuZXcgY3IuUHJvdmlkZXIodGhpcywgJ1Byb3ZpZGVyJywge1xuICAgICAgb25FdmVudEhhbmRsZXI6IG5ldyBjZGsuYXdzX2xhbWJkYS5GdW5jdGlvbih0aGlzLCAnVmFsaWRhdG9yRnVuY3Rpb24nLCB7XG4gICAgICAgIHJ1bnRpbWU6IGNkay5hd3NfbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTEsXG4gICAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgICAgY29kZTogY2RrLmF3c19sYW1iZGEuQ29kZS5mcm9tSW5saW5lKGxhbWJkYUNvZGUpLFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgICAgcm9sZTogY3VzdG9tUmVzb3VyY2VSb2xlLFxuICAgICAgICBsb2dHcm91cDogbG9nR3JvdXAsXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgTE9HX0xFVkVMOiAnSU5GTydcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSB0aGUgY3VzdG9tIHJlc291cmNlXG4gICAgY29uc3QgY3VzdG9tUmVzb3VyY2UgPSBuZXcgY2RrLkN1c3RvbVJlc291cmNlKHRoaXMsICdJbWFnZVZhbGlkYXRpb24nLCB7XG4gICAgICBzZXJ2aWNlVG9rZW46IHByb3ZpZGVyLnNlcnZpY2VUb2tlbixcbiAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgUmVwb3NpdG9yeU5hbWU6IHJlcG9zaXRvcnlOYW1lLFxuICAgICAgICBSZXF1aXJlZFRhZ3M6IHByb3BzLnJlcXVpcmVkSW1hZ2VUYWdzLFxuICAgICAgICAvLyBBZGQgYSB0aW1lc3RhbXAgdG8gZm9yY2UgdXBkYXRlcyB3aGVuIHRhZ3MgY2hhbmdlXG4gICAgICAgIFRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBBZGQgbWV0YWRhdGEgZm9yIHRyb3VibGVzaG9vdGluZ1xuICAgIGN1c3RvbVJlc291cmNlLm5vZGUuYWRkTWV0YWRhdGEoJ0Rlc2NyaXB0aW9uJywgJ1ZhbGlkYXRlcyB0aGF0IHJlcXVpcmVkIEVDUiBpbWFnZXMgZXhpc3QgYmVmb3JlIGRlcGxveW1lbnQnKTtcbiAgICBjdXN0b21SZXNvdXJjZS5ub2RlLmFkZE1ldGFkYXRhKCdSZXF1aXJlZFRhZ3MnLCBwcm9wcy5yZXF1aXJlZEltYWdlVGFncy5qb2luKCcsICcpKTtcbiAgfVxufVxuIl19