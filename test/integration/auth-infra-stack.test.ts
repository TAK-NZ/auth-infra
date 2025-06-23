import { AuthInfraStack } from '../../lib/auth-infra-stack';
import { MOCK_CONFIGS } from '../__fixtures__/mock-configs';
import { ConfigValidator } from '../../lib/utils/config-validator';

describe('AuthInfraStack Integration', () => {
  describe('Stack Configuration Validation', () => {
    test('validates dev-test environment configuration', () => {
      expect(() => {
        ConfigValidator.validateEnvironmentConfig(MOCK_CONFIGS.DEV_TEST, 'dev-test');
      }).not.toThrow();
    });

    test('validates prod environment configuration', () => {
      expect(() => {
        ConfigValidator.validateEnvironmentConfig(MOCK_CONFIGS.PROD, 'prod');
      }).not.toThrow();
    });

    test('validates serverless environment configuration', () => {
      expect(() => {
        ConfigValidator.validateEnvironmentConfig(MOCK_CONFIGS.SERVERLESS, 'dev-test');
      }).not.toThrow();
    });
  });

  describe('Stack Class Validation', () => {
    test('AuthInfraStack class is properly defined', () => {
      expect(AuthInfraStack).toBeDefined();
      expect(typeof AuthInfraStack).toBe('function');
    });

    test('AuthInfraStack constructor accepts required parameters', () => {
      const constructorParams = AuthInfraStack.length;
      expect(constructorParams).toBe(3); // scope, id, props
    });
  });

  describe('Environment-specific Settings', () => {
    test('dev-test configuration has development settings', () => {
      const config = MOCK_CONFIGS.DEV_TEST;
      expect(config.database.instanceCount).toBe(1);
      expect(config.redis.numCacheNodes).toBe(1);
      expect(config.ecs.desiredCount).toBe(1);
      expect(config.general.removalPolicy).toBe('DESTROY');
    });

    test('prod configuration has production settings', () => {
      const config = MOCK_CONFIGS.PROD;
      expect(config.database.instanceCount).toBe(2);
      expect(config.redis.numCacheNodes).toBe(2);
      expect(config.ecs.desiredCount).toBe(2);
      expect(config.general.removalPolicy).toBe('RETAIN');
    });
  });

  describe('Configuration Consistency', () => {
    test('all configurations have required properties', () => {
      const configs = [MOCK_CONFIGS.DEV_TEST, MOCK_CONFIGS.PROD, MOCK_CONFIGS.SERVERLESS];
      
      configs.forEach(config => {
        expect(config.stackName).toBeDefined();
        expect(config.database).toBeDefined();
        expect(config.redis).toBeDefined();
        expect(config.ecs).toBeDefined();
        expect(config.authentik).toBeDefined();
        expect(config.ecr).toBeDefined();
        expect(config.general).toBeDefined();
      });
    });

    test('authentik configuration is consistent', () => {
      const configs = [MOCK_CONFIGS.DEV_TEST, MOCK_CONFIGS.PROD, MOCK_CONFIGS.SERVERLESS];
      
      configs.forEach(config => {
        expect(config.authentik.hostname).toBeDefined();
        expect(config.authentik.adminUserEmail).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
        expect(config.authentik.ldapHostname).toBeDefined();
        expect(config.authentik.ldapBaseDn).toMatch(/^(DC|dc)=/i);
        expect(config.authentik.branding).toBe('tak-nz');
        expect(config.authentik.authentikVersion).toBeDefined();
      });
    });
  });
});