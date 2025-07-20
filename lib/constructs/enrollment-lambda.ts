import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import * as path from 'path';
import { Construct } from 'constructs';
import { ContextEnvironmentConfig } from '../stack-config';

export interface EnrollmentLambdaProps {
  /**
   * The stack configuration
   */
  readonly stackConfig: ContextEnvironmentConfig;
  
  /**
   * The Authentik admin token secret
   */
  readonly authentikAdminSecret: cdk.aws_secretsmanager.ISecret;
  
  /**
   * The Authentik URL
   */
  readonly authentikUrl: string;
  
  /**
   * The TAK server domain
   */
  readonly takServerDomain: string;
  
  /**
   * The domain name for the application
   */
  readonly domainName: string;

  /**
   * The stack name
   */
  readonly stackName: string;
}

export class EnrollmentLambda extends Construct {
  /**
   * The Lambda function
   */
  public readonly function: lambda.Function;
  
  /**
   * The Lambda target for the ALB
   */
  public readonly lambdaTarget: targets.LambdaTarget;

  constructor(scope: Construct, id: string, props: EnrollmentLambdaProps) {
    super(scope, id);

    const { 
      stackConfig, 
      authentikAdminSecret, 
      authentikUrl,
      takServerDomain,
      domainName
    } = props;

    const enrollmentConfig = stackConfig.enrollment;
    
    // Ensure enrollmentConfig exists before using it
    if (!enrollmentConfig) {
      throw new Error('Enrollment configuration is missing in stackConfig.enrollment');
    }
    
    // Create Lambda function role
    const enrollmentLambdaRole = new iam.Role(this, 'EnrollmentLambdaRole', {
      roleName: `TAK-${props.stackName}-AuthInfra-enrollment`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ]
    });
    
    // Grant Lambda permission to read Authentik admin secret
    authentikAdminSecret.grantRead(enrollmentLambdaRole);
    
    // Grant Lambda permission to use KMS for decrypting secrets
    // Get the KMS key ARN from the secret
    const kmsKeyId = authentikAdminSecret.encryptionKey?.keyArn || '*';
    
    enrollmentLambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'kms:Decrypt',
        'kms:DescribeKey',
        'kms:GenerateDataKey'
      ],
      resources: [kmsKeyId]
    }));
    
    // Add permissions to list secrets in case we need to find the secret by name
    enrollmentLambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:ListSecrets'],
      resources: ['*']
    }));
    
    // Create Lambda function using NodejsFunction
    this.function = new nodejs.NodejsFunction(this, 'EnrollmentFunction', {
      functionName: `TAK-${props.stackName}-AuthInfra-enrollment`,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../../src/enrollment-lambda/index.js'),
      handler: 'handler',
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node22',
        externalModules: ['aws-sdk'], // AWS SDK is available in the Lambda runtime
        forceDockerBundling: false, // Force local bundling
        commandHooks: {
          beforeBundling(inputDir: string, outputDir: string): string[] {
            return [];
          },
          beforeInstall(inputDir: string, outputDir: string): string[] {
            return [];
          },
          afterBundling(inputDir: string, outputDir: string): string[] {
            return [
              `cp ${path.join(__dirname, '../../src/enrollment-lambda/template.html')} ${outputDir}/`
            ];
          },
        },
      },
      role: enrollmentLambdaRole,
      environment: {
        AUTHENTIK_API_TOKEN_SECRET_ARN: authentikAdminSecret.secretArn,
        AUTHENTIK_API_ENDPOINT: authentikUrl,
        TAK_SERVER_DOMAIN: takServerDomain,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      description: 'TAK Device Enrollment Lambda'
    });
    
    // Create Lambda target for ALB
    this.lambdaTarget = new targets.LambdaTarget(this.function);
    
    // Add permission for ALB to invoke Lambda
    this.function.addPermission('AllowALBInvocation', {
      principal: new iam.ServicePrincipal('elasticloadbalancing.amazonaws.com'),
      action: 'lambda:InvokeFunction',
    });
    
    // Add outputs
    new cdk.CfnOutput(this, 'EnrollmentLambdaArn', {
      value: this.function.functionArn,
      description: 'ARN of the enrollment Lambda function',
      exportName: `TAK-${props.stackName}-AuthInfra-EnrollmentLambdaArn`,
    });
  }
}