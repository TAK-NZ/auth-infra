import { Template } from 'aws-cdk-lib/assertions';
import { CDKTestHelper } from '../../__helpers__/cdk-test-utils';
import { EnrollAlbOidcAuth } from '../../../lib/constructs/enroll-alb-oidc-auth';

describe('EnrollAlbOidcAuth', () => {
  let testStack: ReturnType<typeof CDKTestHelper.createTestStack>;

  beforeEach(() => {
    testStack = CDKTestHelper.createTestStack();
  });

  test('creates OIDC auth configuration with required parameters', () => {
    const auth = new EnrollAlbOidcAuth(testStack.stack, 'TestOidcAuth', {
      listenerArn: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:listener/app/test-alb/1234567890123456/1234567890123456',
      enrollmentHostname: 'enroll',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      issuer: 'https://account.test.com/application/o/test/',
      authorizeUrl: 'https://account.test.com/application/o/authorize/',
      tokenUrl: 'https://account.test.com/application/o/token/',
      userInfoUrl: 'https://account.test.com/application/o/userinfo/',
      targetGroupArn: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/test-tg/1234567890123456',
      stackName: 'TestStack'
    });

    expect(auth.customResource).toBeDefined();

    const template = Template.fromStack(testStack.stack);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Handler: 'index.handler'
    });
  });

  test('configures Lambda with correct IAM permissions', () => {
    new EnrollAlbOidcAuth(testStack.stack, 'TestOidcAuth', {
      listenerArn: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:listener/app/test-alb/1234567890123456/1234567890123456',
      enrollmentHostname: 'enroll',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      issuer: 'https://account.test.com/application/o/test/',
      authorizeUrl: 'https://account.test.com/application/o/authorize/',
      tokenUrl: 'https://account.test.com/application/o/token/',
      userInfoUrl: 'https://account.test.com/application/o/userinfo/',
      targetGroupArn: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/test-tg/1234567890123456',
      stackName: 'TestStack'
    });

    const template = Template.fromStack(testStack.stack);
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          {
            Action: [
              'elasticloadbalancing:DescribeRules',
              'elasticloadbalancing:ModifyRule',
              'elasticloadbalancing:CreateRule',
              'elasticloadbalancing:DeleteRule'
            ],
            Effect: 'Allow',
            Resource: '*'
          }
        ]
      }
    });
  });

  test('creates custom resource with all properties', () => {
    new EnrollAlbOidcAuth(testStack.stack, 'TestOidcAuth', {
      listenerArn: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:listener/app/test-alb/1234567890123456/1234567890123456',
      enrollmentHostname: 'enroll',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      issuer: 'https://account.test.com/application/o/test/',
      authorizeUrl: 'https://account.test.com/application/o/authorize/',
      tokenUrl: 'https://account.test.com/application/o/token/',
      userInfoUrl: 'https://account.test.com/application/o/userinfo/',
      targetGroupArn: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/test-tg/1234567890123456',
      stackName: 'TestStack',
      priority: 100
    });

    const template = Template.fromStack(testStack.stack);
    template.hasResourceProperties('AWS::CloudFormation::CustomResource', {
      PhysicalResourceId: 'EnrollAlbOidcAuth-TestStack-enroll',
      ListenerArn: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:listener/app/test-alb/1234567890123456/1234567890123456',
      EnrollmentHostname: 'enroll',
      ClientId: 'test-client-id',
      ClientSecret: 'test-client-secret',
      Issuer: 'https://account.test.com/application/o/test/',
      AuthorizeUrl: 'https://account.test.com/application/o/authorize/',
      TokenUrl: 'https://account.test.com/application/o/token/',
      UserInfoUrl: 'https://account.test.com/application/o/userinfo/',
      Priority: 100
    });
  });

  test('uses default priority when not specified', () => {
    new EnrollAlbOidcAuth(testStack.stack, 'TestOidcAuth', {
      listenerArn: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:listener/app/test-alb/1234567890123456/1234567890123456',
      enrollmentHostname: 'enroll',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      issuer: 'https://account.test.com/application/o/test/',
      authorizeUrl: 'https://account.test.com/application/o/authorize/',
      tokenUrl: 'https://account.test.com/application/o/token/',
      userInfoUrl: 'https://account.test.com/application/o/userinfo/',
      targetGroupArn: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/test-tg/1234567890123456',
      stackName: 'TestStack'
    });

    const template = Template.fromStack(testStack.stack);
    template.hasResourceProperties('AWS::CloudFormation::CustomResource', {
      Priority: 100 // Default from ENROLLMENT_CONSTANTS.LISTENER_PRIORITY
    });
  });

  test('creates debug outputs', () => {
    new EnrollAlbOidcAuth(testStack.stack, 'TestOidcAuth', {
      listenerArn: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:listener/app/test-alb/1234567890123456/1234567890123456',
      enrollmentHostname: 'enroll',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      issuer: 'https://account.test.com/application/o/test/',
      authorizeUrl: 'https://account.test.com/application/o/authorize/',
      tokenUrl: 'https://account.test.com/application/o/token/',
      userInfoUrl: 'https://account.test.com/application/o/userinfo/',
      targetGroupArn: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/test-tg/1234567890123456',
      stackName: 'TestStack'
    });

    const template = Template.fromStack(testStack.stack);
    const outputs = template.findOutputs('*');
    expect(Object.keys(outputs).length).toBeGreaterThan(0);
  });

  test('handles optional listener rule ARN', () => {
    new EnrollAlbOidcAuth(testStack.stack, 'TestOidcAuth', {
      listenerArn: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:listener/app/test-alb/1234567890123456/1234567890123456',
      enrollmentHostname: 'enroll',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      issuer: 'https://account.test.com/application/o/test/',
      authorizeUrl: 'https://account.test.com/application/o/authorize/',
      tokenUrl: 'https://account.test.com/application/o/token/',
      userInfoUrl: 'https://account.test.com/application/o/userinfo/',
      targetGroupArn: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/test-tg/1234567890123456',
      stackName: 'TestStack',
      listenerRuleArn: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:listener-rule/app/test-alb/1234567890123456/1234567890123456/1234567890123456'
    });

    const template = Template.fromStack(testStack.stack);
    template.hasResourceProperties('AWS::CloudFormation::CustomResource', {
      ListenerRuleArn: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:listener-rule/app/test-alb/1234567890123456/1234567890123456/1234567890123456'
    });
  });

  test('creates provider with log group', () => {
    new EnrollAlbOidcAuth(testStack.stack, 'TestOidcAuth', {
      listenerArn: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:listener/app/test-alb/1234567890123456/1234567890123456',
      enrollmentHostname: 'enroll',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      issuer: 'https://account.test.com/application/o/test/',
      authorizeUrl: 'https://account.test.com/application/o/authorize/',
      tokenUrl: 'https://account.test.com/application/o/token/',
      userInfoUrl: 'https://account.test.com/application/o/userinfo/',
      targetGroupArn: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/test-tg/1234567890123456',
      stackName: 'TestStack'
    });

    const template = Template.fromStack(testStack.stack);
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      RetentionInDays: 7
    });
  });
});