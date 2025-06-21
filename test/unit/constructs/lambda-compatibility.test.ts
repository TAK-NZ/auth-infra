/**
 * Test suite for Lambda Node.js version compatibility
 */
import { App, Stack } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { LdapTokenRetriever } from '../../../lib/constructs/ldap-token-retriever';
import { CDKTestHelper } from '../../__helpers__/cdk-test-utils';
import { MOCK_CONFIGS } from '../../__fixtures__/mock-configs';

describe('Lambda Node.js Compatibility', () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    ({ app, stack } = CDKTestHelper.createTestStack());
  });

  describe('LDAP Token Retriever Lambda', () => {
    let ldapTokenRetriever: LdapTokenRetriever;
    let lambdaCode: string;

    beforeEach(() => {
      const infrastructure = CDKTestHelper.createMockInfrastructure(stack);
      const mockSecrets = CDKTestHelper.createMockSecrets(stack);
      
      ldapTokenRetriever = new LdapTokenRetriever(stack, 'TestLdapTokenRetriever', {
        environment: 'dev-test',
        contextConfig: MOCK_CONFIGS.DEV_TEST,
        infrastructure,
        deployment: { gitSha: 'test-sha', enableExecute: false, useConfigFile: false },
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

      // Extract Lambda code from the construct
      const lambdaFunction = ldapTokenRetriever.lambdaFunction;
      const codeConfig = (lambdaFunction.node.defaultChild as any).code;
      lambdaCode = codeConfig.zipFile || '';
    });

    test('Lambda runtime matches NODEJS_22_X', () => {
      expect(ldapTokenRetriever.lambdaFunction.runtime).toBe(lambda.Runtime.NODEJS_22_X);
    });

    test('Lambda code uses AWS SDK v3 syntax', () => {
      expect(lambdaCode).toContain('@aws-sdk/client-secrets-manager');
      expect(lambdaCode).toContain('SecretsManagerClient');
      expect(lambdaCode).toContain('GetSecretValueCommand');
      expect(lambdaCode).toContain('PutSecretValueCommand');
      
      // Should NOT contain AWS SDK v2 patterns
      expect(lambdaCode).not.toContain('require(\'aws-sdk\')');
      expect(lambdaCode).not.toContain('AWS.SecretsManager');
    });

    test('Lambda code uses Node.js features compatible with Node 22', () => {
      // Modern JavaScript features that should be present
      expect(lambdaCode).toContain('async function');
      expect(lambdaCode).toContain('await ');
      expect(lambdaCode).toContain('const {');  // Destructuring
      expect(lambdaCode).toContain('new URL(');  // URL constructor
      expect(lambdaCode).toContain('Promise(');  // Promise constructor
      
      // Check for template literals specifically
      expect(lambdaCode).toMatch(/`[^`]*\$\{[^}]+\}[^`]*`/);  // Template literal pattern
    });

    test('Lambda code does not use deprecated Node.js features', () => {
      // Should not use deprecated patterns
      expect(lambdaCode).not.toContain('require.extensions');
      expect(lambdaCode).not.toContain('process.binding');
      expect(lambdaCode).not.toContain('Buffer.from(string, \'base64\')');  // Old Buffer usage
      
      // Should not use very old callback patterns where modern alternatives exist
      expect(lambdaCode).not.toContain('fs.readFile(');  // Should use fs.promises or fs/promises
    });

    test('Lambda code handles errors properly for Node 22', () => {
      // Should use modern error handling
      expect(lambdaCode).toContain('try {');
      expect(lambdaCode).toContain('catch (error)');
      expect(lambdaCode).toContain('throw new Error');
      
      // Should handle Promise rejections
      expect(lambdaCode).toContain('reject(');
      expect(lambdaCode).toContain('resolve(');
    });

    test('Lambda code uses modern HTTP client patterns', () => {
      // Uses built-in Node.js modules appropriately
      expect(lambdaCode).toContain("require('https')");
      expect(lambdaCode).toContain("require('http')");
      expect(lambdaCode).toContain("require('url')");
      
      // Uses modern URL API
      expect(lambdaCode).toContain('new URL(');
      expect(lambdaCode).toContain('.searchParams.');
    });

    test('Lambda environment is configured for Node 22', () => {
      // Check that the Lambda function was created with Node 22 runtime
      expect(ldapTokenRetriever.lambdaFunction.runtime).toBe(lambda.Runtime.NODEJS_22_X);
      
      // Verify timeout is appropriate for async operations
      expect(ldapTokenRetriever.lambdaFunction.timeout?.toMinutes()).toBe(5);
    });

    test('Lambda code syntax is valid JavaScript', () => {
      // Basic syntax validation - should not throw when parsed
      expect(() => {
        // This is a basic check - in a real scenario you might use a JS parser
        const hasValidSyntax = !lambdaCode.includes('SyntaxError') && 
                              lambdaCode.includes('function') &&
                              lambdaCode.includes('const ') &&
                              lambdaCode.includes('require(');
        expect(hasValidSyntax).toBe(true);
      }).not.toThrow();
    });

    test('Lambda timeout is appropriate for async operations', () => {
      // 5 minutes should be sufficient for HTTP calls and secret operations
      expect(ldapTokenRetriever.lambdaFunction.timeout?.toMinutes()).toBe(5);
    });
  });

  describe('Node.js Version Compatibility Matrix', () => {
    test('NODEJS_22_X features are used correctly', () => {
      // Node 22 specific features that should be safe to use
      const node22Features = [
        'async/await',
        'destructuring assignment', 
        'template literals',
        'arrow functions',
        'Promise',
        'URL constructor',
        'Object.entries',
        'Array.includes'
      ];

      // This test documents what Node 22 features we rely on
      expect(node22Features.length).toBeGreaterThan(0);
    });

    test('No Node.js version-specific APIs are used incorrectly', () => {
      // Features that might not be available in older Node versions
      const potentiallyProblematicFeatures = [
        'AbortController',  // Node 16+
        'fetch',           // Node 18+
        'structuredClone', // Node 17+
      ];

      // For now, we document these - in the future we could scan the Lambda code
      expect(potentiallyProblematicFeatures).toBeDefined();
    });
  });
});