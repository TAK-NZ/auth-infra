import * as cdk from 'aws-cdk-lib';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import { Construct } from 'constructs';
import { ENROLLMENT_CONSTANTS } from '../utils/constants';
import { CustomResource } from 'aws-cdk-lib';
import { CfnOutput } from 'aws-cdk-lib';

export interface EnrollAlbOidcAuthProps {
  /**
   * The ARN of the listener
   */
  readonly listenerArn: string;
  
  /**
   * The hostname for the enrollment domain
   */
  readonly enrollmentHostname: string;
  
  /**
   * The OIDC client ID
   */
  readonly clientId: string;
  
  /**
   * The OIDC client secret
   */
  readonly clientSecret: string;
  
  /**
   * The OIDC issuer URL
   */
  readonly issuer: string;
  
  /**
   * The OIDC authorization endpoint URL
   */
  readonly authorizeUrl: string;
  
  /**
   * The OIDC token endpoint URL
   */
  readonly tokenUrl: string;
  
  /**
   * The OIDC user info endpoint URL
   */
  readonly userInfoUrl: string;
  
  /**
   * The target group ARN
   */
  readonly targetGroupArn: string;
  
  /**
   * The stack name for resource naming
   */
  readonly stackName: string;
  
  /**
   * Optional priority for the listener rule
   * If not provided, will use the default from ENROLLMENT_CONSTANTS
   */
  readonly priority?: number;
  
  /**
   * Optional listener rule ARN
   * If provided, will modify this rule instead of creating a new one
   */
  readonly listenerRuleArn?: string;
}

/**
 * Custom resource to configure OIDC authentication for an ALB listener rule
 * This is needed because AWS CDK doesn't currently have a direct AuthenticateOidcAction class
 */
export class EnrollAlbOidcAuth extends Construct {
  public readonly customResource: CustomResource;
  constructor(scope: Construct, id: string, props: EnrollAlbOidcAuthProps) {
    super(scope, id);

    const { 
      listenerArn, 
      enrollmentHostname,
      clientId, 
      clientSecret,
      issuer,
      authorizeUrl,
      tokenUrl,
      userInfoUrl,
      targetGroupArn,
      stackName
    } = props;

    // Create Lambda function to configure the listener rule using NodejsFunction
    const setupLambda = new nodejs.NodejsFunction(this, 'SetupLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../../src/enroll-alb-oidc-auth/index.js'),
      handler: 'handler',
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node22',
        externalModules: ['aws-sdk'], // AWS SDK is available in the Lambda runtime
        forceDockerBundling: false, // Force local bundling
      },
      timeout: cdk.Duration.minutes(5),
    });
    
    // Grant Lambda permission to modify listener rules
    setupLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'elasticloadbalancing:DescribeRules',
        'elasticloadbalancing:ModifyRule',
        'elasticloadbalancing:CreateRule',
        'elasticloadbalancing:DeleteRule'
      ],
      resources: ['*']
    }));
    
    // Create custom resource to invoke Lambda during deployment
    const provider = new cr.Provider(this, 'Provider', {
      onEventHandler: setupLambda,
      logGroup: new logs.LogGroup(this, 'ProviderLogGroup', {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY
      })
    });
    
    // Create a unique physical ID for this resource to avoid conflicts
    const physicalResourceId = `EnrollAlbOidcAuth-${props.stackName}-${props.enrollmentHostname}`;
    
    // Log the values being passed to the custom resource for debugging
    new cdk.CfnOutput(this, 'OidcDebugInfo', {
      value: JSON.stringify({
        clientId: clientId ? 'provided' : 'missing',
        issuer: issuer ? 'provided' : 'missing',
        listenerArn: listenerArn ? 'provided' : 'missing',
        hostname: enrollmentHostname ? 'provided' : 'missing'
      }),
      description: 'Debug information for OIDC setup',
    });
    
    // Add more detailed debug output
    new cdk.CfnOutput(this, 'OidcAuthDetails', {
      value: JSON.stringify({
        listenerArn: listenerArn,
        enrollmentHostname: enrollmentHostname,
        clientId: clientId,
        issuer: issuer,
        authorizeUrl: authorizeUrl,
        tokenUrl: tokenUrl,
        userInfoUrl: userInfoUrl
      }),
      description: 'Detailed OIDC auth configuration',
    });
    
    // Create custom resource that will invoke the Lambda
    this.customResource = new cdk.CustomResource(this, 'OidcAuthResource', {
      serviceToken: provider.serviceToken,
      properties: {
        PhysicalResourceId: physicalResourceId,
        ListenerArn: listenerArn,
        EnrollmentHostname: enrollmentHostname,
        TargetGroupArn: targetGroupArn,
        ClientId: clientId,
        ClientSecret: clientSecret,
        Issuer: issuer,
        AuthorizeUrl: authorizeUrl,
        TokenUrl: tokenUrl,
        UserInfoUrl: userInfoUrl,
        Scope: ENROLLMENT_CONSTANTS.OIDC_SCOPES,
        SessionCookieName: ENROLLMENT_CONSTANTS.SESSION_COOKIE_NAME,
        SessionTimeout: ENROLLMENT_CONSTANTS.SESSION_TIMEOUT_DAYS * 86400, // Convert days to seconds
        Priority: props.priority || ENROLLMENT_CONSTANTS.LISTENER_PRIORITY,
        ListenerRuleArn: props.listenerRuleArn || '',
        // Add a timestamp to force the custom resource to update on each deployment
        Timestamp: new Date().toISOString(),
      },
    });
    
    // Add output for debugging
    new CfnOutput(this, 'OidcAuthResourceId', {
      value: physicalResourceId,
      description: 'Physical ID of the OIDC auth resource',
    });
  }
}