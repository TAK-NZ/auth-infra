import { Template } from 'aws-cdk-lib/assertions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { CDKTestHelper } from '../../__helpers__/cdk-test-utils';
import { MOCK_CONFIGS } from '../../__fixtures__/mock-configs';
import { EnrollAlbOidc } from '../../../lib/constructs/enroll-alb-oidc';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';

describe('EnrollAlbOidc', () => {
  let testStack: ReturnType<typeof CDKTestHelper.createTestStack>;
  let mockInfra: ReturnType<typeof CDKTestHelper.createMockInfrastructure>;
  let mockAlb: elbv2.ApplicationLoadBalancer;
  let mockListener: elbv2.ApplicationListener;
  let mockLambda: lambda.Function;

  beforeEach(() => {
    testStack = CDKTestHelper.createTestStack();
    mockInfra = CDKTestHelper.createMockInfrastructure(testStack.stack);
    
    mockAlb = new elbv2.ApplicationLoadBalancer(testStack.stack, 'TestALB', {
      vpc: mockInfra.vpc,
      internetFacing: true
    });
    
    mockListener = mockAlb.addListener('TestListener', {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [{
        certificateArn: 'arn:aws:acm:us-west-2:123456789012:certificate/test-cert'
      }],
      defaultAction: elbv2.ListenerAction.fixedResponse(200, {
        contentType: 'text/plain',
        messageBody: 'OK'
      })
    });

    mockLambda = new lambda.Function(testStack.stack, 'TestLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => {}')
    });
  });

  test('creates OIDC configuration with valid parameters', () => {
    const config = { ...MOCK_CONFIGS.DEV_TEST };
    config.enrollment!.enrollmentEnabled = true;

    const oidc = new EnrollAlbOidc(testStack.stack, 'TestOidc', {
      alb: mockAlb,
      httpsListener: mockListener,
      stackConfig: config,
      domainName: 'test.com',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      issuer: 'https://account.test.com/application/o/test/',
      authorizeUrl: 'https://account.test.com/application/o/authorize/',
      tokenUrl: 'https://account.test.com/application/o/token/',
      userInfoUrl: 'https://account.test.com/application/o/userinfo/',
      jwksUri: 'https://account.test.com/application/o/jwks/',
      targetFunction: mockLambda,
      stackName: 'TestStack'
    });

    expect(oidc.oidcClientSecret).toBeDefined();
    expect(oidc.listenerArn).toBe(mockListener.listenerArn);

    const template = Template.fromStack(testStack.stack);
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: 'TAK-TestStack-AuthInfra/Enrollment/OIDC-Client-Secret'
    });
  });

  test('throws error when enrollment config is missing', () => {
    const config = { ...MOCK_CONFIGS.DEV_TEST };
    delete config.enrollment;

    expect(() => {
      new EnrollAlbOidc(testStack.stack, 'TestOidc', {
        alb: mockAlb,
        httpsListener: mockListener,
        stackConfig: config,
        domainName: 'test.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        issuer: 'https://account.test.com/application/o/test/',
        authorizeUrl: 'https://account.test.com/application/o/authorize/',
        tokenUrl: 'https://account.test.com/application/o/token/',
        userInfoUrl: 'https://account.test.com/application/o/userinfo/',
        jwksUri: 'https://account.test.com/application/o/jwks/',
        stackName: 'TestStack'
      });
    }).toThrow('Enrollment configuration is missing');
  });

  test('creates secret with correct client credentials', () => {
    const config = { ...MOCK_CONFIGS.DEV_TEST };
    config.enrollment!.enrollmentEnabled = true;

    new EnrollAlbOidc(testStack.stack, 'TestOidc', {
      alb: mockAlb,
      httpsListener: mockListener,
      stackConfig: config,
      domainName: 'test.com',
      clientId: 'my-client-id',
      clientSecret: 'my-client-secret',
      issuer: 'https://account.test.com/application/o/test/',
      authorizeUrl: 'https://account.test.com/application/o/authorize/',
      tokenUrl: 'https://account.test.com/application/o/token/',
      userInfoUrl: 'https://account.test.com/application/o/userinfo/',
      jwksUri: 'https://account.test.com/application/o/jwks/',
      stackName: 'TestStack'
    });

    const template = Template.fromStack(testStack.stack);
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      GenerateSecretString: {
        SecretStringTemplate: JSON.stringify({
          client_id: 'my-client-id',
          client_secret: 'my-client-secret'
        })
      }
    });
  });

  test('creates outputs for enrollment domain', () => {
    const config = { ...MOCK_CONFIGS.DEV_TEST };
    config.enrollment!.enrollmentEnabled = true;
    config.enrollment!.enrollmentHostname = 'enroll';

    new EnrollAlbOidc(testStack.stack, 'TestOidc', {
      alb: mockAlb,
      httpsListener: mockListener,
      stackConfig: config,
      domainName: 'example.com',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      issuer: 'https://account.test.com/application/o/test/',
      authorizeUrl: 'https://account.test.com/application/o/authorize/',
      tokenUrl: 'https://account.test.com/application/o/token/',
      userInfoUrl: 'https://account.test.com/application/o/userinfo/',
      jwksUri: 'https://account.test.com/application/o/jwks/',
      stackName: 'TestStack'
    });

    const template = Template.fromStack(testStack.stack);
    const outputs = template.findOutputs('*');
    expect(Object.keys(outputs).some(key => key.includes('EnrollmentDomain'))).toBe(true);
  });

  test('works without target function', () => {
    const config = { ...MOCK_CONFIGS.DEV_TEST };
    config.enrollment!.enrollmentEnabled = true;

    const oidc = new EnrollAlbOidc(testStack.stack, 'TestOidc', {
      alb: mockAlb,
      httpsListener: mockListener,
      stackConfig: config,
      domainName: 'test.com',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      issuer: 'https://account.test.com/application/o/test/',
      authorizeUrl: 'https://account.test.com/application/o/authorize/',
      tokenUrl: 'https://account.test.com/application/o/token/',
      userInfoUrl: 'https://account.test.com/application/o/userinfo/',
      jwksUri: 'https://account.test.com/application/o/jwks/',
      stackName: 'TestStack'
    });

    expect(oidc.oidcClientSecret).toBeDefined();
    expect(oidc.listenerArn).toBe(mockListener.listenerArn);
  });

  test('creates debug outputs', () => {
    const config = { ...MOCK_CONFIGS.DEV_TEST };
    config.enrollment!.enrollmentEnabled = true;

    new EnrollAlbOidc(testStack.stack, 'TestOidc', {
      alb: mockAlb,
      httpsListener: mockListener,
      stackConfig: config,
      domainName: 'test.com',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      issuer: 'https://account.test.com/application/o/test/',
      authorizeUrl: 'https://account.test.com/application/o/authorize/',
      tokenUrl: 'https://account.test.com/application/o/token/',
      userInfoUrl: 'https://account.test.com/application/o/userinfo/',
      jwksUri: 'https://account.test.com/application/o/jwks/',
      targetFunction: mockLambda,
      stackName: 'TestStack'
    });

    const template = Template.fromStack(testStack.stack);
    const outputs = template.findOutputs('*');
    expect(Object.keys(outputs).length).toBeGreaterThan(0);
  });
});