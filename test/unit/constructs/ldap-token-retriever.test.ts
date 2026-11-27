/**
 * Test suite for LDAP Token Retriever construct
 */
import { App, Stack } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { LdapTokenRetriever } from '../../../lib/constructs/ldap-token-retriever';
import { CDKTestHelper } from '../../__helpers__/cdk-test-utils';
import { MOCK_CONFIGS } from '../../__fixtures__/mock-configs';

describe('LDAP Token Retriever Construct', () => {
  let app: App;
  let stack: Stack;
  let infrastructure: any;
  let mockSecrets: any;

  beforeEach(() => {
    ({ app, stack } = CDKTestHelper.createTestStack());
    infrastructure = CDKTestHelper.createMockInfrastructure(stack);
    mockSecrets = CDKTestHelper.createMockSecrets(stack);
  });

  describe('Lambda Function Configuration', () => {
    test('creates Lambda with correct runtime and timeout', () => {
      const ldapTokenRetriever = new LdapTokenRetriever(stack, 'TestLdapTokenRetriever', {
        environment: 'dev-test',
        contextConfig: MOCK_CONFIGS.DEV_TEST,
        infrastructure,
        deployment: { enableExecute: false, useConfigFile: false },
        token: {
          outpostName: 'LDAP',
          adminTokenSecret: mockSecrets.adminToken,
          ldapTokenSecret: mockSecrets.ldapToken,
          authentikServerService: {} as any,
          authentikWorkerService: {} as any
        },
        application: {
          adminUserEmail: 'admin@test.com',
          ldapBaseDn: 'dc=test,dc=com',
          database: { hostname: 'db.test.com' },
          authentikHost: 'https://auth.test.com'
        }
      });

      expect(ldapTokenRetriever.lambdaFunction.runtime).toBe(lambda.Runtime.NODEJS_22_X);
      expect(ldapTokenRetriever.lambdaFunction.timeout?.toMinutes()).toBe(15);
    });

    test('Lambda code uses modern AWS SDK v3 patterns', () => {
      const ldapTokenRetriever = new LdapTokenRetriever(stack, 'TestLdapTokenRetriever2', {
        environment: 'dev-test',
        contextConfig: MOCK_CONFIGS.DEV_TEST,
        infrastructure,
        deployment: { enableExecute: false, useConfigFile: false },
        token: {
          outpostName: 'LDAP',
          adminTokenSecret: mockSecrets.adminToken,
          ldapTokenSecret: mockSecrets.ldapToken,
          authentikServerService: {} as any,
          authentikWorkerService: {} as any
        },
        application: {
          adminUserEmail: 'admin@test.com',
          ldapBaseDn: 'dc=test,dc=com',
          database: { hostname: 'db.test.com' },
          authentikHost: 'https://auth.test.com'
        }
      });

      const lambdaCode = (ldapTokenRetriever.lambdaFunction.node.defaultChild as any).code.zipFile || '';
      
      // Should use AWS SDK v3
      expect(lambdaCode).toContain('@aws-sdk/client-secrets-manager');
      expect(lambdaCode).toContain('SecretsManagerClient');
      
      // Should NOT use deprecated AWS SDK v2
      expect(lambdaCode).not.toContain("require('aws-sdk')");
    });
  });

  describe('TAK blueprints applied on every deployment', () => {
    function lambdaCode(id: string): string {
      const ldapTokenRetriever = new LdapTokenRetriever(stack, id, {
        environment: 'dev-test',
        contextConfig: MOCK_CONFIGS.DEV_TEST,
        infrastructure,
        deployment: { enableExecute: false, useConfigFile: false },
        token: {
          outpostName: 'LDAP',
          adminTokenSecret: mockSecrets.adminToken,
          ldapTokenSecret: mockSecrets.ldapToken,
          authentikServerService: {} as any,
          authentikWorkerService: {} as any
        },
        application: {
          adminUserEmail: 'admin@test.com',
          ldapBaseDn: 'dc=test,dc=com',
          database: { hostname: 'db.test.com' },
          authentikHost: 'https://auth.test.com'
        }
      });
      return (ldapTokenRetriever.lambdaFunction.node.defaultChild as any).code.zipFile || '';
    }
    test('the Lambda source is valid JavaScript', () => {
      // The code is a template string, so an unescaped backtick or ${ only shows up when it runs.
      expect(() => new Function('require', 'exports', 'module', lambdaCode('SyntaxCheck'))).not.toThrow();
    });
    test('applies the LDAP, branding (which applies the flows first) and cleanup blueprints', () => {
      const code = lambdaCode('Blueprints');
      expect(code).toContain(
        "const TAK_FLOW_BLUEPRINTS = ['tak/tak-ldap-setup.yaml', 'tak/tak-branding-change.yaml', 'tak/tak-cleanup.yaml'];"
      );
      // the blueprint list is paginated (20 by default) and the TAK files are not on the first page
      expect(code).not.toContain("/api/v3/managed/blueprints/`, { method: 'GET', headers }");
      expect(code).toContain('/api/v3/managed/blueprints/?page_size=200');
      // the apply call only queues the task, so the Lambda waits for the result and fails on anything but success
      expect(code).toContain("'/api/v3/managed/blueprints/' + instance.pk + '/apply/'");
      expect(code).toContain("current.status !== 'successful'");
      expect(code).toContain('await applyTakFlowBlueprints(AuthentikHost, adminToken);');
    });
    test('creates the blueprint instance when Authentik has not registered the file yet', () => {
      const code = lambdaCode('Registers');
      expect(code).toContain('/api/v3/managed/blueprints/available/');
      expect(code).toContain('{ name, path, enabled: true, context: {} }');
    });
    test('has time for the blueprints: 15 minutes', () => {
      const ldapTokenRetriever = new LdapTokenRetriever(stack, 'Timeout', {
        environment: 'dev-test',
        contextConfig: MOCK_CONFIGS.DEV_TEST,
        infrastructure,
        deployment: { enableExecute: false, useConfigFile: false },
        token: {
          outpostName: 'LDAP',
          adminTokenSecret: mockSecrets.adminToken,
          ldapTokenSecret: mockSecrets.ldapToken,
          authentikServerService: {} as any,
          authentikWorkerService: {} as any
        },
        application: {
          adminUserEmail: 'admin@test.com',
          ldapBaseDn: 'dc=test,dc=com',
          database: { hostname: 'db.test.com' },
          authentikHost: 'https://auth.test.com'
        }
      });
      expect(ldapTokenRetriever.lambdaFunction.timeout?.toMinutes()).toBe(15);
    });
  });
  describe('Environment Variables and Configuration', () => {
    test('sets correct environment variables', () => {
      const ldapTokenRetriever = new LdapTokenRetriever(stack, 'TestLdapTokenRetriever3', {
        environment: 'prod',
        contextConfig: MOCK_CONFIGS.PROD,
        infrastructure,
        deployment: { enableExecute: true, useConfigFile: true },
        token: {
          outpostName: 'LDAP',
          adminTokenSecret: mockSecrets.adminToken,
          ldapTokenSecret: mockSecrets.ldapToken,
          authentikServerService: {} as any,
          authentikWorkerService: {} as any
        },
        application: {
          adminUserEmail: 'admin@prod.com',
          ldapBaseDn: 'dc=prod,dc=com',
          database: { hostname: 'db.prod.com' },
          authentikHost: 'https://auth.prod.com'
        }
      });

      expect(ldapTokenRetriever.lambdaFunction).toBeDefined();
    });
  });
});