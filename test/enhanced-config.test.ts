/**
 * Test suite for the enhanced createStackConfig function
 */
import { createStackConfig, AuthInfraConfigResult } from '../lib/stack-config';

describe('Enhanced Configuration Management', () => {
  
  describe('createStackConfig with complete configuration', () => {
    test('should create valid dev-test configuration with computed values', () => {
      const result = createStackConfig('dev-test', 'TestStack');
      
      // Check stack config
      expect(result.stackConfig.envType).toBe('dev-test');
      expect(result.stackConfig.stackName).toBe('TestStack');
      expect(result.stackConfig.projectName).toBe('TAK');
      expect(result.stackConfig.componentName).toBe('AuthInfra');
      
      // Check computed values
      expect(result.computedValues.enableHighAvailability).toBe(false);
      expect(result.computedValues.environmentLabel).toBe('Dev-Test');
      expect(result.computedValues.desiredContainerCount).toBe(1);
      
      // Check environment config
      expect(result.environmentConfig.ecs.desiredCount).toBe(1);
      expect(result.environmentConfig.ecs.workerDesiredCount).toBe(1);
      expect(result.environmentConfig.database.instanceClass).toBe('db.serverless');
    });

    test('should create valid production configuration with computed values', () => {
      const result = createStackConfig('prod', 'ProdStack');
      
      // Check computed values
      expect(result.computedValues.enableHighAvailability).toBe(true);
      expect(result.computedValues.environmentLabel).toBe('Prod');
      expect(result.computedValues.desiredContainerCount).toBe(2);
      
      // Check environment config
      expect(result.environmentConfig.ecs.desiredCount).toBe(2);
      expect(result.environmentConfig.ecs.workerDesiredCount).toBe(2);
      expect(result.environmentConfig.database.instanceClass).toBe('db.t4g.large');
    });

    test('should apply overrides correctly', () => {
      const overrides = {
        database: { instanceClass: 'db.t4g.medium' },
        ecs: { desiredCount: 3, workerDesiredCount: 4 }
      };
      
      const result = createStackConfig('dev-test', 'TestStack', overrides);
      
      // Check that overrides are applied to environment config
      expect(result.environmentConfig.database.instanceClass).toBe('db.t4g.medium');
      expect(result.environmentConfig.ecs.desiredCount).toBe(3);
      expect(result.environmentConfig.ecs.workerDesiredCount).toBe(4);
      
      // Container count should not override explicit context values
      expect(result.computedValues.desiredContainerCount).toBe(1); // Based on HA setting
    });

    test('should validate required parameters', () => {
      expect(() => createStackConfig('dev-test', '')).toThrow('stackName is required');
      expect(() => createStackConfig('invalid' as any, 'TestStack')).toThrow('Environment type must be one of: prod, dev-test');
    });
  });
});
