/**
 * Fast unit tests for AuthInfraStack configuration validation
 */
import { ConfigValidator } from '../../lib/utils/config-validator';
import { MOCK_CONFIGS } from '../__fixtures__/mock-configs';

describe('AuthInfraStack Configuration Validation', () => {
  describe('Configuration Validation', () => {
    test('validates dev-test configuration', () => {
      expect(() => {
        ConfigValidator.validateEnvironmentConfig(MOCK_CONFIGS.DEV_TEST, 'dev-test');
      }).not.toThrow();
    });

    test('validates prod configuration', () => {
      expect(() => {
        ConfigValidator.validateEnvironmentConfig(MOCK_CONFIGS.PROD, 'prod');
      }).not.toThrow();
    });

    test('validates serverless configuration', () => {
      expect(() => {
        ConfigValidator.validateEnvironmentConfig(MOCK_CONFIGS.SERVERLESS, 'dev-test');
      }).not.toThrow();
    });
  });

  // NOTE: The former "Configuration Properties" block was removed. It asserted
  // that the mock fixture contained the literals the fixture defines
  // (e.g. stackName === 'DevTest', instanceClass === 'db.t3.micro') — a
  // tautology that passes because the value was typed twice and fails on any
  // legitimate config change. See CDK_TEST_CLEANUP_GUIDE (DELETE #2).
});