import { Template } from 'aws-cdk-lib/assertions';
import { CDKTestHelper } from '../../__helpers__/cdk-test-utils';
import { MOCK_CONFIGS } from '../../__fixtures__/mock-configs';
import { EnrollOidcSetup } from '../../../lib/constructs/enroll-oidc-setup';

describe('EnrollOidcSetup', () => {
  let testStack: ReturnType<typeof CDKTestHelper.createTestStack>;
  let mockSecrets: ReturnType<typeof CDKTestHelper.createMockSecrets>;

  beforeEach(() => {
    testStack = CDKTestHelper.createTestStack();
    mockSecrets = CDKTestHelper.createMockSecrets(testStack.stack);
  });

  test('creates OIDC setup with valid configuration', () => {
    const config = { ...MOCK_CONFIGS.DEV_TEST };
    config.enrollment!.enrollmentEnabled = true;

    const setup = new EnrollOidcSetup(testStack.stack, 'TestOidcSetup', {
      stackConfig: config,
      authentikAdminSecret: mockSecrets.adminToken,
      authentikUrl: 'https://account.test.com'
    });

    expect(setup.providerName).toBe('TAK Enrollment');
    expect(setup.clientId).toBeDefined();
    expect(setup.issuer).toBeDefined();

    const template = Template.fromStack(testStack.stack);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Handler: 'index.handler'
    });
  });

  test('throws error when enrollment config is missing', () => {
    const config = { ...MOCK_CONFIGS.DEV_TEST };
    delete config.enrollment;

    expect(() => {
      new EnrollOidcSetup(testStack.stack, 'TestOidcSetup', {
        stackConfig: config,
        authentikAdminSecret: mockSecrets.adminToken,
        authentikUrl: 'https://account.test.com'
      });
    }).toThrow('Enrollment configuration is missing');
  });

  test('handles domain extraction from authentikUrl', () => {
    const config = { ...MOCK_CONFIGS.DEV_TEST };
    config.enrollment!.enrollmentEnabled = true;

    new EnrollOidcSetup(testStack.stack, 'TestOidcSetup', {
      stackConfig: config,
      authentikAdminSecret: mockSecrets.adminToken,
      authentikUrl: 'https://account.example.org'
    });

    const template = Template.fromStack(testStack.stack);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: {
          AUTHENTIK_URL: 'https://account.example.org',
          PROVIDER_NAME: 'TAK Enrollment'
        }
      }
    });
  });

  test('configures Lambda with all environment variables', () => {
    const config = { ...MOCK_CONFIGS.DEV_TEST };
    config.enrollment = {
      enrollmentEnabled: true,
      enrollmentHostname: 'enroll',
      providerName: 'Test Provider',
      applicationName: 'Test App',
      applicationSlug: 'test-app',
      enrollmentIcon: 'https://example.com/icon.png',
      openInNewTab: true,
      authenticationFlowName: 'test-auth-flow',
      authorizationFlowName: 'test-authz-flow',
      invalidationFlowName: 'test-invalid-flow',
      groupName: 'test-group',
      description: 'Test description'
    };

    new EnrollOidcSetup(testStack.stack, 'TestOidcSetup', {
      stackConfig: config,
      authentikAdminSecret: mockSecrets.adminToken,
      authentikUrl: 'https://account.test.com'
    });

    const template = Template.fromStack(testStack.stack);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: {
          PROVIDER_NAME: 'Test Provider',
          APPLICATION_NAME: 'Test App',
          APPLICATION_SLUG: 'test-app',
          ICON_URL: 'https://example.com/icon.png',
          OPEN_IN_NEW_TAB: 'true',
          AUTHENTICATION_FLOW_NAME: 'test-auth-flow',
          AUTHORIZATION_FLOW_NAME: 'test-authz-flow',
          INVALIDATION_FLOW_NAME: 'test-invalid-flow',
          GROUP_NAME: 'test-group',
          APPLICATION_DESCRIPTION: 'Test description'
        }
      }
    });
  });

  test('creates custom resource with provider', () => {
    const config = { ...MOCK_CONFIGS.DEV_TEST };
    config.enrollment!.enrollmentEnabled = true;

    new EnrollOidcSetup(testStack.stack, 'TestOidcSetup', {
      stackConfig: config,
      authentikAdminSecret: mockSecrets.adminToken,
      authentikUrl: 'https://account.test.com'
    });

    const template = Template.fromStack(testStack.stack);
    template.resourceCountIs('AWS::CloudFormation::CustomResource', 1);
    template.resourceCountIs('AWS::Lambda::Function', 2); // Setup lambda + provider lambda
  });

  test('grants necessary IAM permissions', () => {
    const config = { ...MOCK_CONFIGS.DEV_TEST };
    config.enrollment!.enrollmentEnabled = true;

    new EnrollOidcSetup(testStack.stack, 'TestOidcSetup', {
      stackConfig: config,
      authentikAdminSecret: mockSecrets.adminToken,
      authentikUrl: 'https://account.test.com'
    });

    const template = Template.fromStack(testStack.stack);
    template.resourceCountIs('AWS::IAM::Policy', 2); // One for setup lambda, one for provider
    template.resourceCountIs('AWS::IAM::Role', 2); // One for setup lambda, one for provider
  });

  test('handles missing optional configuration fields', () => {
    const config = { ...MOCK_CONFIGS.DEV_TEST };
    config.enrollment = {
      enrollmentEnabled: true,
      enrollmentHostname: 'enroll',
      providerName: 'Test Provider',
      applicationName: 'Test App'
    };

    new EnrollOidcSetup(testStack.stack, 'TestOidcSetup', {
      stackConfig: config,
      authentikAdminSecret: mockSecrets.adminToken,
      authentikUrl: 'https://account.test.com'
    });

    const template = Template.fromStack(testStack.stack);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: {
          APPLICATION_SLUG: 'test-app',
          OPEN_IN_NEW_TAB: 'false'
        }
      }
    });
  });
});