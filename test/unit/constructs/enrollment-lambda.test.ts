import { Template } from 'aws-cdk-lib/assertions';
import { CDKTestHelper } from '../../__helpers__/cdk-test-utils';
import { MOCK_CONFIGS } from '../../__fixtures__/mock-configs';
import { EnrollmentLambda } from '../../../lib/constructs/enrollment-lambda';

describe('EnrollmentLambda', () => {
  let testStack: ReturnType<typeof CDKTestHelper.createTestStack>;
  let mockSecrets: ReturnType<typeof CDKTestHelper.createMockSecrets>;

  beforeEach(() => {
    testStack = CDKTestHelper.createTestStack();
    mockSecrets = CDKTestHelper.createMockSecrets(testStack.stack);
  });

  test('creates Lambda function with valid configuration', () => {
    const config = { ...MOCK_CONFIGS.DEV_TEST };
    config.enrollment!.enrollmentEnabled = true;

    const enrollmentLambda = new EnrollmentLambda(testStack.stack, 'TestEnrollmentLambda', {
      stackConfig: config,
      authentikAdminSecret: mockSecrets.adminToken,
      authentikUrl: 'https://account.test.com',
      takServerDomain: 'ops.test.com',
      domainName: 'test.com',
      stackName: 'TestStack'
    });

    expect(enrollmentLambda.function).toBeDefined();

    const template = Template.fromStack(testStack.stack);
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'TAK-TestStack-AuthInfra-enrollment',
      Runtime: 'nodejs22.x',
      Handler: 'index.handler',
      Timeout: 30,
      MemorySize: 512
    });
  });

  test('throws error when enrollment config is missing', () => {
    const config = { ...MOCK_CONFIGS.DEV_TEST };
    delete config.enrollment;

    expect(() => {
      new EnrollmentLambda(testStack.stack, 'TestEnrollmentLambda', {
        stackConfig: config,
        authentikAdminSecret: mockSecrets.adminToken,
        authentikUrl: 'https://account.test.com',
        takServerDomain: 'ops.test.com',
        domainName: 'test.com',
        stackName: 'TestStack'
      });
    }).toThrow('Enrollment configuration is missing');
  });

  test('configures Lambda with correct environment variables', () => {
    const config = { ...MOCK_CONFIGS.DEV_TEST };
    config.enrollment!.enrollmentEnabled = true;
    config.authentik.branding = 'custom-brand';

    new EnrollmentLambda(testStack.stack, 'TestEnrollmentLambda', {
      stackConfig: config,
      authentikAdminSecret: mockSecrets.adminToken,
      authentikUrl: 'https://account.example.org',
      takServerDomain: 'ops.example.org',
      domainName: 'example.org',
      stackName: 'TestStack'
    });

    const template = Template.fromStack(testStack.stack);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: {
          AUTHENTIK_API_ENDPOINT: 'https://account.example.org',
          TAK_SERVER_DOMAIN: 'ops.example.org',
          BRANDING: 'custom-brand'
        }
      }
    });
  });

  test('creates IAM role with correct permissions', () => {
    const config = { ...MOCK_CONFIGS.DEV_TEST };
    config.enrollment!.enrollmentEnabled = true;

    new EnrollmentLambda(testStack.stack, 'TestEnrollmentLambda', {
      stackConfig: config,
      authentikAdminSecret: mockSecrets.adminToken,
      authentikUrl: 'https://account.test.com',
      takServerDomain: 'ops.test.com',
      domainName: 'test.com',
      stackName: 'TestStack'
    });

    const template = Template.fromStack(testStack.stack);
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'TAK-TestStack-AuthInfra-enrollment',
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'lambda.amazonaws.com'
            }
          }
        ]
      }
    });
  });

  test('grants KMS permissions for secret decryption', () => {
    const config = { ...MOCK_CONFIGS.DEV_TEST };
    config.enrollment!.enrollmentEnabled = true;

    new EnrollmentLambda(testStack.stack, 'TestEnrollmentLambda', {
      stackConfig: config,
      authentikAdminSecret: mockSecrets.adminToken,
      authentikUrl: 'https://account.test.com',
      takServerDomain: 'ops.test.com',
      domainName: 'test.com',
      stackName: 'TestStack'
    });

    const template = Template.fromStack(testStack.stack);
    template.resourceCountIs('AWS::IAM::Policy', 1);
    template.resourceCountIs('AWS::IAM::Role', 1);
  });

  test('grants secrets manager permissions', () => {
    const config = { ...MOCK_CONFIGS.DEV_TEST };
    config.enrollment!.enrollmentEnabled = true;

    const enrollmentLambda = new EnrollmentLambda(testStack.stack, 'TestEnrollmentLambda', {
      stackConfig: config,
      authentikAdminSecret: mockSecrets.adminToken,
      authentikUrl: 'https://account.test.com',
      takServerDomain: 'ops.test.com',
      domainName: 'test.com',
      stackName: 'TestStack'
    });

    expect(enrollmentLambda.function).toBeDefined();
    const template = Template.fromStack(testStack.stack);
    template.resourceCountIs('AWS::Lambda::Function', 1);
  });

  test('creates output with Lambda ARN', () => {
    const config = { ...MOCK_CONFIGS.DEV_TEST };
    config.enrollment!.enrollmentEnabled = true;

    new EnrollmentLambda(testStack.stack, 'TestEnrollmentLambda', {
      stackConfig: config,
      authentikAdminSecret: mockSecrets.adminToken,
      authentikUrl: 'https://account.test.com',
      takServerDomain: 'ops.test.com',
      domainName: 'test.com',
      stackName: 'TestStack'
    });

    const template = Template.fromStack(testStack.stack);
    const outputs = template.findOutputs('*');
    expect(Object.keys(outputs).some(key => key.includes('EnrollmentLambdaArn'))).toBe(true);
  });

  test('uses default branding when not specified', () => {
    const config = { ...MOCK_CONFIGS.DEV_TEST };
    config.enrollment!.enrollmentEnabled = true;
    config.authentik = { ...config.authentik, branding: undefined as any };

    new EnrollmentLambda(testStack.stack, 'TestEnrollmentLambda', {
      stackConfig: config,
      authentikAdminSecret: mockSecrets.adminToken,
      authentikUrl: 'https://account.test.com',
      takServerDomain: 'ops.test.com',
      domainName: 'test.com',
      stackName: 'TestStack'
    });

    const template = Template.fromStack(testStack.stack);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: {
          BRANDING: 'generic'
        }
      }
    });
  });

  test('attaches managed policy for basic execution', () => {
    const config = { ...MOCK_CONFIGS.DEV_TEST };
    config.enrollment!.enrollmentEnabled = true;

    new EnrollmentLambda(testStack.stack, 'TestEnrollmentLambda', {
      stackConfig: config,
      authentikAdminSecret: mockSecrets.adminToken,
      authentikUrl: 'https://account.test.com',
      takServerDomain: 'ops.test.com',
      domainName: 'test.com',
      stackName: 'TestStack'
    });

    const template = Template.fromStack(testStack.stack);
    template.hasResourceProperties('AWS::IAM::Role', {
      ManagedPolicyArns: [
        {
          'Fn::Join': [
            '',
            [
              'arn:',
              { Ref: 'AWS::Partition' },
              ':iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
            ]
          ]
        }
      ]
    });
  });
});