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

  describe('Configuration Properties', () => {
    test('dev-test has expected properties', () => {
      const config = MOCK_CONFIGS.DEV_TEST;
      expect(config.stackName).toBe('DevTest');
      expect(config.database.instanceClass).toBe('db.t3.micro');

      expect(config.ecs.taskCpu).toBe(512);
    });

    test('prod has expected properties', () => {
      const config = MOCK_CONFIGS.PROD;
      expect(config.stackName).toBe('Prod');
      expect(config.database.instanceClass).toBe('db.t3.small');

      expect(config.ecs.taskCpu).toBe(1024);
    });
  });
});