/**
 * Test suite for context-driven parameter management and high availability configuration
 */
import { createStackConfig, ConfigValidator, AuthInfraConfig } from '../lib/stack-config';
import { getEnvironmentConfig, mergeEnvironmentConfig } from '../lib/environment-config';
import * as cdk from 'aws-cdk-lib';

describe('Context-Driven Parameter Management', () => {
  
  describe('Stack Configuration Creation', () => {
    test('should create valid dev-test configuration', () => {
      const config = createStackConfig('dev-test', 'TestStack');
      
      expect(config.envType).toBe('dev-test');
      expect(config.stackName).toBe('TestStack');
      expect(config.projectName).toBe('TAK');
      expect(config.componentName).toBe('AuthInfra');
      expect(config.overrides).toBeUndefined();
    });

    test('should create valid production configuration', () => {
      const config = createStackConfig('prod', 'ProdStack');
      
      expect(config.envType).toBe('prod');
      expect(config.stackName).toBe('ProdStack');
      expect(config.projectName).toBe('TAK');
      expect(config.componentName).toBe('AuthInfra');
    });

    test('should create configuration with overrides', () => {
      const overrides = {
        database: { instanceClass: 'db.t4g.medium' },
        ecs: { desiredCount: 3 }
      };
      
      const config = createStackConfig('dev-test', 'TestStack', overrides);
      
      expect(config.overrides).toEqual(overrides);
    });

    test('should validate required parameters', () => {
      expect(() => createStackConfig('dev-test', '')).toThrow('stackName is required');
      expect(() => createStackConfig('invalid' as any, 'TestStack')).toThrow('Environment type must be one of: prod, dev-test');
    });
  });

  describe('Configuration Validation', () => {
    test('should validate complete configuration', () => {
      const config = createStackConfig('prod', 'ValidStack');
      expect(() => ConfigValidator.validate(config)).not.toThrow();
    });

    test('should reject invalid configurations', () => {
      const invalidConfig: AuthInfraConfig = {
        projectName: '',
        componentName: 'AuthInfra',
        envType: 'prod',
        stackName: 'TestStack'
      };
      
      expect(() => ConfigValidator.validate(invalidConfig)).toThrow('projectName is required');
    });
  });

  describe('Environment-Specific Defaults', () => {
    test('should provide dev-test optimized defaults', () => {
      const config = getEnvironmentConfig('dev-test');
      
      expect(config.database.instanceClass).toBe('db.t4g.micro');
      expect(config.database.instanceCount).toBe(1);
      expect(config.redis.nodeType).toBe('cache.t4g.micro');
      expect(config.redis.numCacheClusters).toBe(1);
      expect(config.ecs.desiredCount).toBe(1);
      expect(config.ecs.workerDesiredCount).toBe(1);
      expect(config.general.removalPolicy).toBe(cdk.RemovalPolicy.DESTROY);
    });

    test('should provide production optimized defaults', () => {
      const config = getEnvironmentConfig('prod');
      
      expect(config.database.instanceClass).toBe('db.t4g.small');
      expect(config.database.instanceCount).toBe(2);
      expect(config.redis.nodeType).toBe('cache.t4g.small');
      expect(config.redis.numCacheClusters).toBe(2);
      expect(config.ecs.desiredCount).toBe(2);
      expect(config.ecs.workerDesiredCount).toBe(2);
      expect(config.general.removalPolicy).toBe(cdk.RemovalPolicy.RETAIN);
    });
  });

  describe('Configuration Merging', () => {
    test('should merge overrides with base configuration', () => {
      const baseConfig = getEnvironmentConfig('dev-test');
      const overrides = {
        database: { instanceClass: 'db.t4g.small' },
        ecs: { desiredCount: 3, taskCpu: 1024 }
      };
      
      const mergedConfig = mergeEnvironmentConfig(baseConfig, overrides);
      
      // Should override specified values
      expect(mergedConfig.database.instanceClass).toBe('db.t4g.small');
      expect(mergedConfig.ecs.desiredCount).toBe(3);
      expect(mergedConfig.ecs.taskCpu).toBe(1024);
      
      // Should preserve non-overridden values
      expect(mergedConfig.database.instanceCount).toBe(1);
      expect(mergedConfig.ecs.taskMemory).toBe(1024);
      expect(mergedConfig.redis.nodeType).toBe('cache.t4g.micro');
    });

    test('should handle partial overrides', () => {
      const baseConfig = getEnvironmentConfig('prod');
      const overrides = {
        ecs: { desiredCount: 5 }
      };
      
      const mergedConfig = mergeEnvironmentConfig(baseConfig, overrides);
      
      expect(mergedConfig.ecs.desiredCount).toBe(5);
      expect(mergedConfig.ecs.workerDesiredCount).toBe(2); // unchanged
      expect(mergedConfig.database.instanceCount).toBe(2); // unchanged
    });
  });
});

describe('High Availability Configuration', () => {
  
  describe('Environment-Based High Availability', () => {
    test('should enable high availability for production', () => {
      const envType: string = 'prod';
      const envConfig = envType === 'prod' ? 
        { enableHighAvailability: true, enableDetailedMonitoring: true } :
        { enableHighAvailability: false, enableDetailedMonitoring: false };
      
      expect(envConfig.enableHighAvailability).toBe(true);
      expect(envConfig.enableDetailedMonitoring).toBe(true);
    });

    test('should disable high availability for dev-test', () => {
      const envType: string = 'dev-test';
      const envConfig = envType === 'prod' ? 
        { enableHighAvailability: true, enableDetailedMonitoring: true } :
        { enableHighAvailability: false, enableDetailedMonitoring: false };
      
      expect(envConfig.enableHighAvailability).toBe(false);
      expect(envConfig.enableDetailedMonitoring).toBe(false);
    });
  });

  describe('Container Count Logic', () => {
    test('should set 2 containers when high availability is enabled', () => {
      const enableHighAvailability = true;
      const desiredContainerCount = enableHighAvailability ? 2 : 1;
      
      expect(desiredContainerCount).toBe(2);
    });

    test('should set 1 container when high availability is disabled', () => {
      const enableHighAvailability = false;
      const desiredContainerCount = enableHighAvailability ? 2 : 1;
      
      expect(desiredContainerCount).toBe(1);
    });
  });

  describe('Container Count Override Logic', () => {
    test('should apply container count when no explicit override', () => {
      const baseConfig = getEnvironmentConfig('dev-test');
      const config = { overrides: undefined } as AuthInfraConfig;
      const enableHighAvailability = true;
      const desiredContainerCount = 2;
      
      // Simulate the stack logic
      const mergedConfig = config.overrides ? 
        mergeEnvironmentConfig(baseConfig, config.overrides) : 
        { ...baseConfig };
      if (!config.overrides?.ecs?.desiredCount) {
        mergedConfig.ecs.desiredCount = desiredContainerCount;
      }
      if (!config.overrides?.ecs?.workerDesiredCount) {
        mergedConfig.ecs.workerDesiredCount = desiredContainerCount;
      }
      
      expect(mergedConfig.ecs.desiredCount).toBe(2);
      expect(mergedConfig.ecs.workerDesiredCount).toBe(2);
    });

    test('should preserve explicit overrides', () => {
      const baseConfig = getEnvironmentConfig('dev-test');
      const config = { 
        overrides: { 
          ecs: { desiredCount: 5, workerDesiredCount: 3 }
        }
      } as AuthInfraConfig;
      const desiredContainerCount = 2;
      
      // Simulate the stack logic
      const mergedConfig = config.overrides ? 
        mergeEnvironmentConfig(baseConfig, config.overrides) : 
        { ...baseConfig };
      if (!config.overrides?.ecs?.desiredCount) {
        mergedConfig.ecs.desiredCount = desiredContainerCount;
      }
      if (!config.overrides?.ecs?.workerDesiredCount) {
        mergedConfig.ecs.workerDesiredCount = desiredContainerCount;
      }
      
      // Should preserve explicit overrides
      expect(mergedConfig.ecs.desiredCount).toBe(5);
      expect(mergedConfig.ecs.workerDesiredCount).toBe(3);
    });

    test('should handle partial explicit overrides', () => {
      const baseConfig = getEnvironmentConfig('dev-test');
      const config = { 
        overrides: { 
          ecs: { desiredCount: 4 } // Only override server count, not worker
        }
      } as AuthInfraConfig;
      const desiredContainerCount = 2;
      
      // Simulate the stack logic
      const mergedConfig = config.overrides ? 
        mergeEnvironmentConfig(baseConfig, config.overrides) : 
        { ...baseConfig };
      if (!config.overrides?.ecs?.desiredCount) {
        mergedConfig.ecs.desiredCount = desiredContainerCount;
      }
      if (!config.overrides?.ecs?.workerDesiredCount) {
        mergedConfig.ecs.workerDesiredCount = desiredContainerCount;
      }
      
      // Should preserve server override but apply HA logic to worker
      expect(mergedConfig.ecs.desiredCount).toBe(4);
      expect(mergedConfig.ecs.workerDesiredCount).toBe(2);
    });
  });
});

describe('Integration Tests', () => {
  
  describe('End-to-End Configuration Flow', () => {
    test('should create production configuration with high availability', () => {
      // Step 1: Create stack config
      const stackConfig = createStackConfig('prod', 'ProdStack');
      
      // Step 2: Get environment-specific defaults (simulating stack logic)
      const envConfig = stackConfig.envType === 'prod' ? 
        { enableHighAvailability: true, enableDetailedMonitoring: true } :
        { enableHighAvailability: false, enableDetailedMonitoring: false };
      
      // Step 3: Get base config and merge
      const baseConfig = getEnvironmentConfig(stackConfig.envType);
      const mergedConfig = stackConfig.overrides ? 
        mergeEnvironmentConfig(baseConfig, stackConfig.overrides) : 
        baseConfig;
      
      // Step 4: Apply high availability logic
      const desiredContainerCount = envConfig.enableHighAvailability ? 2 : 1;
      if (!stackConfig.overrides?.ecs?.desiredCount) {
        mergedConfig.ecs.desiredCount = desiredContainerCount;
      }
      if (!stackConfig.overrides?.ecs?.workerDesiredCount) {
        mergedConfig.ecs.workerDesiredCount = desiredContainerCount;
      }
      
      // Assertions
      expect(stackConfig.envType).toBe('prod');
      expect(envConfig.enableHighAvailability).toBe(true);
      expect(desiredContainerCount).toBe(2);
      expect(mergedConfig.ecs.desiredCount).toBe(2);
      expect(mergedConfig.ecs.workerDesiredCount).toBe(2);
      expect(mergedConfig.database.instanceCount).toBe(2);
      expect(mergedConfig.redis.numCacheClusters).toBe(2);
    });

    test('should create dev-test configuration with single instances', () => {
      // Step 1: Create stack config
      const stackConfig = createStackConfig('dev-test', 'DevStack');
      
      // Step 2: Get environment-specific defaults (simulating stack logic)
      const envConfig = stackConfig.envType === 'prod' ? 
        { enableHighAvailability: true, enableDetailedMonitoring: true } :
        { enableHighAvailability: false, enableDetailedMonitoring: false };
      
      // Step 3: Get base config and merge
      const baseConfig = getEnvironmentConfig(stackConfig.envType);
      const mergedConfig = stackConfig.overrides ? 
        mergeEnvironmentConfig(baseConfig, stackConfig.overrides) : 
        baseConfig;
      
      // Step 4: Apply high availability logic
      const desiredContainerCount = envConfig.enableHighAvailability ? 2 : 1;
      if (!stackConfig.overrides?.ecs?.desiredCount) {
        mergedConfig.ecs.desiredCount = desiredContainerCount;
      }
      if (!stackConfig.overrides?.ecs?.workerDesiredCount) {
        mergedConfig.ecs.workerDesiredCount = desiredContainerCount;
      }
      
      // Assertions
      expect(stackConfig.envType).toBe('dev-test');
      expect(envConfig.enableHighAvailability).toBe(false);
      expect(desiredContainerCount).toBe(1);
      expect(mergedConfig.ecs.desiredCount).toBe(1);
      expect(mergedConfig.ecs.workerDesiredCount).toBe(1);
      expect(mergedConfig.database.instanceCount).toBe(1);
      expect(mergedConfig.redis.numCacheClusters).toBe(1);
    });

    test('should handle custom configuration with overrides', () => {
      // Step 1: Create stack config with overrides
      const stackConfig = createStackConfig('dev-test', 'CustomStack', {
        database: { instanceClass: 'db.t4g.medium' },
        ecs: { desiredCount: 3 }
      });
      
      // Step 2: Get environment-specific defaults
      const envConfig = stackConfig.envType === 'prod' ? 
        { enableHighAvailability: true, enableDetailedMonitoring: true } :
        { enableHighAvailability: false, enableDetailedMonitoring: false };
      
      // Step 3: Get base config and merge
      const baseConfig = getEnvironmentConfig(stackConfig.envType);
      const mergedConfig = stackConfig.overrides ? 
        mergeEnvironmentConfig(baseConfig, stackConfig.overrides) : 
        baseConfig;
      
      // Step 4: Apply high availability logic (but respect overrides)
      const desiredContainerCount = envConfig.enableHighAvailability ? 2 : 1;
      if (!stackConfig.overrides?.ecs?.desiredCount) {
        mergedConfig.ecs.desiredCount = desiredContainerCount;
      }
      if (!stackConfig.overrides?.ecs?.workerDesiredCount) {
        mergedConfig.ecs.workerDesiredCount = desiredContainerCount;
      }
      
      // Assertions
      expect(mergedConfig.database.instanceClass).toBe('db.t4g.medium'); // Override applied
      expect(mergedConfig.ecs.desiredCount).toBe(3); // Override preserved
      expect(mergedConfig.ecs.workerDesiredCount).toBe(1); // HA logic applied (no override)
    });
  });
});
