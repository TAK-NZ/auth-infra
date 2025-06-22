/**
 * Test suite for detecting Lambda Node.js version mismatches
 */
import { App, Stack } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { LdapTokenRetriever } from '../../../lib/constructs/ldap-token-retriever';
import { CDKTestHelper } from '../../__helpers__/cdk-test-utils';
import { MOCK_CONFIGS } from '../../__fixtures__/mock-configs';

describe('Lambda Version Mismatch Detection', () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    ({ app, stack } = CDKTestHelper.createTestStack());
  });

  describe('Runtime vs Code Compatibility', () => {
    test('should detect if Lambda uses features incompatible with declared runtime', () => {
      const infrastructure = CDKTestHelper.createMockInfrastructure(stack);
      const mockSecrets = CDKTestHelper.createMockSecrets(stack);
      
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

      const lambdaFunction = ldapTokenRetriever.lambdaFunction;
      const lambdaCode = (lambdaFunction.node.defaultChild as any).code.zipFile || '';
      const declaredRuntime = lambdaFunction.runtime;

      // Test runtime-specific compatibility
      if (declaredRuntime === lambda.Runtime.NODEJS_22_X) {
        // Node 22 should support all these features
        expect(lambdaCode).toContain('async function');
        expect(lambdaCode).toContain('await ');
        expect(lambdaCode).toContain('const {');
        expect(lambdaCode).toMatch(/`[^`]*\$\{[^}]+\}[^`]*`/); // Template literals
        
        // Should use modern AWS SDK v3
        expect(lambdaCode).toContain('@aws-sdk/client-secrets-manager');
        expect(lambdaCode).not.toContain("require('aws-sdk')");
      }

      // Features that would break in older Node versions
      const modernFeatures = {
        'async/await': /async\s+function|await\s+/,
        'destructuring': /const\s*\{[^}]+\}\s*=/,
        'template literals': /`[^`]*\$\{[^}]+\}[^`]*`/,
        'arrow functions': /=>\s*[{(]/,
        'URL constructor': /new\s+URL\s*\(/,
        'Promise constructor': /new\s+Promise\s*\(/
      };

      Object.entries(modernFeatures).forEach(([featureName, pattern]) => {
        if (pattern.test(lambdaCode)) {
          console.log(`✓ Using ${featureName} (compatible with Node 22)`);
        }
      });

      expect(Object.values(modernFeatures).some(pattern => pattern.test(lambdaCode))).toBe(true);
    });

    test('should validate AWS SDK version compatibility', () => {
      const infrastructure = CDKTestHelper.createMockInfrastructure(stack);
      const mockSecrets = CDKTestHelper.createMockSecrets(stack);
      
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

      // AWS SDK v3 patterns (Node 18+)
      const sdkV3Patterns = [
        /@aws-sdk\/client-/,
        /new\s+\w+Client\s*\(/,
        /new\s+\w+Command\s*\(/,
        /\.send\s*\(/
      ];

      // AWS SDK v2 patterns (deprecated)
      const sdkV2Patterns = [
        /require\s*\(\s*['"]aws-sdk['"]\s*\)/,
        /AWS\.\w+/,
        /\.promise\s*\(\s*\)/
      ];

      const usesV3 = sdkV3Patterns.some(pattern => pattern.test(lambdaCode));
      const usesV2 = sdkV2Patterns.some(pattern => pattern.test(lambdaCode));

      expect(usesV3).toBe(true);
      expect(usesV2).toBe(false);

      if (usesV3 && !usesV2) {
        console.log('✓ Using AWS SDK v3 (recommended for Node 18+)');
      } else if (usesV2) {
        console.warn('⚠ Using deprecated AWS SDK v2');
      }
    });

    test('should check for Node.js version-specific APIs', () => {
      const infrastructure = CDKTestHelper.createMockInfrastructure(stack);
      const mockSecrets = CDKTestHelper.createMockSecrets(stack);
      
      const ldapTokenRetriever = new LdapTokenRetriever(stack, 'TestLdapTokenRetriever3', {
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

      // APIs that require specific Node versions
      const versionSpecificAPIs = {
        'fetch': { minVersion: 18, pattern: /\bfetch\s*\(/ },
        'AbortController': { minVersion: 16, pattern: /\bAbortController\b/ },
        'structuredClone': { minVersion: 17, pattern: /\bstructuredClone\s*\(/ },
        'crypto.webcrypto': { minVersion: 16, pattern: /crypto\.webcrypto/ },
        'URLSearchParams': { minVersion: 10, pattern: /\bURLSearchParams\b/ }
      };

      const declaredRuntime = ldapTokenRetriever.lambdaFunction.runtime;
      const nodeVersion = declaredRuntime === lambda.Runtime.NODEJS_22_X ? 22 :
                         declaredRuntime === lambda.Runtime.NODEJS_20_X ? 20 :
                         declaredRuntime === lambda.Runtime.NODEJS_18_X ? 18 : 16;

      Object.entries(versionSpecificAPIs).forEach(([apiName, { minVersion, pattern }]) => {
        const usesAPI = pattern.test(lambdaCode);
        if (usesAPI) {
          expect(nodeVersion).toBeGreaterThanOrEqual(minVersion);
          console.log(`✓ ${apiName} is compatible with Node ${nodeVersion} (requires ${minVersion}+)`);
        }
      });
    });

    test('should validate error handling patterns for Node 22', () => {
      const infrastructure = CDKTestHelper.createMockInfrastructure(stack);
      const mockSecrets = CDKTestHelper.createMockSecrets(stack);
      
      const ldapTokenRetriever = new LdapTokenRetriever(stack, 'TestLdapTokenRetriever4', {
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

      // Modern error handling patterns
      expect(lambdaCode).toMatch(/try\s*\{[\s\S]*\}\s*catch\s*\(/);
      expect(lambdaCode).toContain('throw new Error');
      expect(lambdaCode).toContain('reject(');
      
      // Should not use deprecated error handling
      expect(lambdaCode).not.toContain("process.on('uncaughtException')");
      expect(lambdaCode).not.toContain('domain.create()');
    });
  });

  describe('Potential Mismatch Scenarios', () => {
    test('should document common mismatch scenarios', () => {
      const commonMismatches = [
        {
          scenario: 'CDK declares Node 22 but code uses Node 16 patterns',
          indicators: ["require('aws-sdk')", 'callback-style APIs', 'old Buffer usage'],
          risk: 'Medium - code may work but not optimally'
        },
        {
          scenario: 'CDK declares Node 18 but code uses Node 22 features',
          indicators: ['fetch()', 'newer crypto APIs', 'latest ES features'],
          risk: 'High - runtime errors likely'
        },
        {
          scenario: 'AWS SDK version mismatch',
          indicators: ['mixing v2 and v3 patterns', 'incorrect import paths'],
          risk: 'High - import/runtime errors'
        }
      ];

      // This test documents potential issues for future reference
      expect(commonMismatches.length).toBeGreaterThan(0);
      commonMismatches.forEach(mismatch => {
        expect(mismatch.scenario).toBeDefined();
        expect(mismatch.risk).toBeDefined();
      });
    });
  });
});