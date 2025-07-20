import * as cdk from 'aws-cdk-lib';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as elbv2_actions from 'aws-cdk-lib/aws-elasticloadbalancingv2-actions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { ContextEnvironmentConfig } from '../stack-config';
import { ENROLLMENT_CONSTANTS } from '../utils/constants';

export interface EnrollAlbOidcProps {
  /**
   * The ALB to configure with OIDC
   */
  readonly alb: elbv2.IApplicationLoadBalancer;
  
  /**
   * The HTTPS listener to add the OIDC rule to
   */
  readonly httpsListener: elbv2.IApplicationListener;
  
  /**
   * The stack configuration
   */
  readonly stackConfig: ContextEnvironmentConfig;
  
  /**
   * The domain name for the application
   */
  readonly domainName: string;
  
  /**
   * The OIDC client ID from Authentik
   */
  readonly clientId: string;
  
  /**
   * The OIDC client secret from Authentik
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
   * The OIDC JWKS URI
   */
  readonly jwksUri: string;
  
  /**
   * The target Lambda function for the enrollment application
   */
  readonly targetFunction?: lambda.IFunction;
  
  /**
   * The stack name
   */
  readonly stackName: string;
}

export class EnrollAlbOidc extends Construct {
  /**
   * The secret containing the OIDC client credentials
   */
  public readonly oidcClientSecret: secretsmanager.ISecret;
  
  /**
   * The ARN of the listener for the enrollment application
   */
  public readonly listenerArn: string;

  constructor(scope: Construct, id: string, props: EnrollAlbOidcProps) {
    super(scope, id);

    const { 
      alb, 
      httpsListener, 
      stackConfig, 
      domainName, 
      clientId, 
      clientSecret,
      issuer,
      authorizeUrl,
      tokenUrl,
      userInfoUrl,
      jwksUri,
      targetFunction
    } = props;

    const enrollmentConfig = stackConfig.enrollment;
    
    // Ensure enrollmentConfig exists before using it
    if (!enrollmentConfig) {
      throw new Error('Enrollment configuration is missing in stackConfig.enrollment');
    }
    
    // Create a secret to store the OIDC client credentials
    // Use a different name to force recreation with the correct name
    this.oidcClientSecret = new secretsmanager.Secret(this, 'OidcClientIdSecret', {
      secretName: `TAK-${props.stackName}-AuthInfra/Enrollment/OIDC-Client-Secret`,
      description: 'OIDC client credentials for enrollment application',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
        }),
        generateStringKey: 'dummy', // Not used, but required
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Ensure old secret is removed
    });
    
    // Add debug output to verify the secret name
    new cdk.CfnOutput(this, 'OidcSecretName', {
      value: this.oidcClientSecret.secretName,
      description: 'The name of the OIDC client secret',
    });
    
    // We no longer create the target group here
    // It's created in the main stack to avoid circular dependencies
    
    // Add debug output for Lambda target if provided
    if (targetFunction) {
      new cdk.CfnOutput(this, 'EnrollmentLambdaTarget', {
        value: targetFunction.functionArn,
        description: 'Lambda function ARN used as target',
      });
    }
    
    // Construct the enrollment domain
    const enrollmentDomain = `${enrollmentConfig.enrollmentHostname}.${domainName}`;
    
    // Store the listener ARN
    // This will be used by the custom resource to find and modify the rule
    this.listenerArn = httpsListener.listenerArn;
    
    // We no longer create the listener rule here
    // The EnrollAlbOidcAuth construct will create the rule with OIDC authentication
    // This breaks the circular dependency between the two constructs
    
    // We no longer need to add dependencies here
    // Dependencies are managed in the main stack
    
    // Note: AWS CDK doesn't currently have a direct AuthenticateOidcAction class
    // We'll need to implement this using CloudFormation directly in the main stack
    // or use a custom resource to configure the OIDC authentication
    
    // Add outputs for the enrollment domain
    new cdk.CfnOutput(this, 'EnrollmentDomain', {
      value: enrollmentDomain,
      description: 'The domain name for the enrollment application',
      exportName: `TAK-${props.stackName}-AuthInfra-EnrollmentDomain`,
    });
  }
}