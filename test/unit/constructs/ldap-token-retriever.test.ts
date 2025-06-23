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
          redis: { hostname: 'redis.test.com' },
          authentikHost: 'https://auth.test.com'
        }
      });

      expect(ldapTokenRetriever.lambdaFunction.runtime).toBe(lambda.Runtime.NODEJS_22_X);
      expect(ldapTokenRetriever.lambdaFunction.timeout?.toMinutes()).toBe(10);
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
          redis: { hostname: 'redis.test.com' },
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
          redis: { hostname: 'redis.prod.com' },
          authentikHost: 'https://auth.prod.com'
        }
      });

      expect(ldapTokenRetriever.lambdaFunction).toBeDefined();
    });
  });
});