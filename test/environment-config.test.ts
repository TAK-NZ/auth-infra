import { getEnvironmentConfig, devTestConfig, prodConfig, mergeConfig } from '../lib/environment-config';

describe('Environment Configuration', () => {
  describe('getEnvironmentConfig', () => {
    it('should return dev-test config for dev-test environment', () => {
      expect(getEnvironmentConfig('dev-test')).toEqual(devTestConfig);
    });

    it('should return prod config for prod environment', () => {
      expect(getEnvironmentConfig('prod')).toEqual(prodConfig);
    });
  });

  describe('Environment-specific configurations', () => {
    it('should have appropriate dev-test settings', () => {
      expect(devTestConfig.isProd).toBe(false);
      expect(devTestConfig.envType).toBe('dev-test');
      expect(devTestConfig.ecsTaskDesiredCount).toBe(1);
      expect(devTestConfig.dbInstanceCount).toBe(1);
      expect(devTestConfig.redisNumCacheClusters).toBe(1);
      expect(devTestConfig.minCapacity).toBe(1);
      expect(devTestConfig.maxCapacity).toBe(3);
    });

    it('should have appropriate prod settings', () => {
      expect(prodConfig.isProd).toBe(true);
      expect(prodConfig.envType).toBe('prod');
      expect(prodConfig.ecsTaskDesiredCount).toBe(2);
      expect(prodConfig.dbInstanceCount).toBe(2);
      expect(prodConfig.redisNumCacheClusters).toBe(2);
      expect(prodConfig.minCapacity).toBe(2);
      expect(prodConfig.maxCapacity).toBe(6);
    });
  });

  describe('mergeConfig', () => {
    it('should merge config with overrides', () => {
      const merged = mergeConfig('dev-test', { ecsTaskDesiredCount: 5 });
      expect(merged.ecsTaskDesiredCount).toBe(5);
      expect(merged.isProd).toBe(false); // Should keep other values
    });

    it('should work without overrides', () => {
      const merged = mergeConfig('prod');
      expect(merged).toEqual(prodConfig);
    });
  });
});
