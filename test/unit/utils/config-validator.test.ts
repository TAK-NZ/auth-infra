/**
 * Test suite for ConfigValidator utility class
 */
import { ConfigValidator } from '../../../lib/utils/config-validator';
import { MOCK_CONFIGS } from '../../__fixtures__/mock-configs';

describe('ConfigValidator', () => {
  describe('validateEnvironmentConfig', () => {
    test('validates valid dev-test configuration', () => {
      expect(() => {
        ConfigValidator.validateEnvironmentConfig(MOCK_CONFIGS.DEV_TEST, 'dev-test');
      }).not.toThrow();
    });

    test('validates valid prod configuration', () => {
      expect(() => {
        ConfigValidator.validateEnvironmentConfig(MOCK_CONFIGS.PROD, 'prod');
      }).not.toThrow();
    });

    test('throws error for missing stackName', () => {
      const invalidConfig = { ...MOCK_CONFIGS.DEV_TEST };
      delete (invalidConfig as any).stackName;
      
      expect(() => {
        ConfigValidator.validateEnvironmentConfig(invalidConfig, 'dev-test');
      }).toThrow('stackName is required');
    });

    test('throws error for missing admin email', () => {
      const invalidConfig = { 
        ...MOCK_CONFIGS.DEV_TEST,
        authentik: { ...MOCK_CONFIGS.DEV_TEST.authentik }
      };
      (invalidConfig.authentik as any).adminUserEmail = undefined;
      
      expect(() => {
        ConfigValidator.validateEnvironmentConfig(invalidConfig, 'dev-test');
      }).toThrow('authentik.adminUserEmail is required');
    });

    test('throws error for invalid email format', () => {
      const invalidConfig = { 
        ...MOCK_CONFIGS.DEV_TEST,
        authentik: { 
          ...MOCK_CONFIGS.DEV_TEST.authentik,
          adminUserEmail: 'invalid-email'
        }
      };
      
      expect(() => {
        ConfigValidator.validateEnvironmentConfig(invalidConfig, 'dev-test');
      }).toThrow('Invalid email format: invalid-email');
    });
  });

  describe('Database validation', () => {
    test('throws error for invalid database instance class', () => {
      const invalidConfig = { 
        ...MOCK_CONFIGS.DEV_TEST,
        database: { 
          ...MOCK_CONFIGS.DEV_TEST.database,
          instanceClass: 'db.invalid'
        }
      };
      
      expect(() => {
        ConfigValidator.validateEnvironmentConfig(invalidConfig, 'dev-test');
      }).toThrow('Invalid database instance class: db.invalid');
    });

    test('throws error for invalid instance count', () => {
      const invalidConfig = { 
        ...MOCK_CONFIGS.DEV_TEST,
        database: { 
          ...MOCK_CONFIGS.DEV_TEST.database,
          instanceCount: 0
        }
      };
      
      expect(() => {
        ConfigValidator.validateEnvironmentConfig(invalidConfig, 'dev-test');
      }).toThrow('Database instance count must be 1 or 2, got: 0');
    });

    test('throws error for instance count > 2', () => {
      const invalidConfig = { 
        ...MOCK_CONFIGS.DEV_TEST,
        database: { 
          ...MOCK_CONFIGS.DEV_TEST.database,
          instanceCount: 3
        }
      };
      
      expect(() => {
        ConfigValidator.validateEnvironmentConfig(invalidConfig, 'dev-test');
      }).toThrow('Database instance count must be 1 or 2, got: 3');
    });
  });

  describe('Redis validation', () => {
    test('throws error for invalid Redis node type', () => {
      const invalidConfig = { 
        ...MOCK_CONFIGS.DEV_TEST,
        redis: { 
          ...MOCK_CONFIGS.DEV_TEST.redis,
          nodeType: 'cache.invalid'
        }
      };
      
      expect(() => {
        ConfigValidator.validateEnvironmentConfig(invalidConfig, 'dev-test');
      }).toThrow('Invalid Redis node type: cache.invalid');
    });

    test('throws error for invalid cache node count', () => {
      const invalidConfig = { 
        ...MOCK_CONFIGS.DEV_TEST,
        redis: { 
          ...MOCK_CONFIGS.DEV_TEST.redis,
          numCacheNodes: 0
        }
      };
      
      expect(() => {
        ConfigValidator.validateEnvironmentConfig(invalidConfig, 'dev-test');
      }).toThrow('Redis cache node count must be between 1 and 6, got: 0');
    });

    test('throws error for cache node count > 6', () => {
      const invalidConfig = { 
        ...MOCK_CONFIGS.DEV_TEST,
        redis: { 
          ...MOCK_CONFIGS.DEV_TEST.redis,
          numCacheNodes: 7
        }
      };
      
      expect(() => {
        ConfigValidator.validateEnvironmentConfig(invalidConfig, 'dev-test');
      }).toThrow('Redis cache node count must be between 1 and 6, got: 7');
    });
  });

  describe('ECS validation', () => {
    test('throws error for invalid CPU/Memory combination', () => {
      const invalidConfig = { 
        ...MOCK_CONFIGS.DEV_TEST,
        ecs: { 
          ...MOCK_CONFIGS.DEV_TEST.ecs,
          taskCpu: 256,
          taskMemory: 4096  // Invalid combination
        }
      };
      
      expect(() => {
        ConfigValidator.validateEnvironmentConfig(invalidConfig, 'dev-test');
      }).toThrow('Invalid ECS CPU/Memory combination: 256/4096');
    });

    test('accepts valid CPU/Memory combinations', () => {
      const validCombinations = [
        { cpu: 256, memory: 512 },
        { cpu: 512, memory: 1024 },
        { cpu: 1024, memory: 2048 },
        { cpu: 2048, memory: 4096 }
      ];

      validCombinations.forEach(({ cpu, memory }) => {
        const config = { 
          ...MOCK_CONFIGS.DEV_TEST,
          ecs: { 
            ...MOCK_CONFIGS.DEV_TEST.ecs,
            taskCpu: cpu,
            taskMemory: memory
          }
        };
        
        expect(() => {
          ConfigValidator.validateEnvironmentConfig(config, 'dev-test');
        }).not.toThrow();
      });
    });
  });

  describe('Authentik validation', () => {
    test('throws error for missing hostname', () => {
      const invalidConfig = { 
        ...MOCK_CONFIGS.DEV_TEST,
        authentik: { 
          ...MOCK_CONFIGS.DEV_TEST.authentik
        }
      };
      (invalidConfig.authentik as any).hostname = undefined;
      
      expect(() => {
        ConfigValidator.validateEnvironmentConfig(invalidConfig, 'dev-test');
      }).toThrow('authentik.hostname is required');
    });

    test('throws error for missing LDAP hostname', () => {
      const invalidConfig = { 
        ...MOCK_CONFIGS.DEV_TEST,
        authentik: { 
          ...MOCK_CONFIGS.DEV_TEST.authentik
        }
      };
      (invalidConfig.authentik as any).ldapHostname = undefined;
      
      expect(() => {
        ConfigValidator.validateEnvironmentConfig(invalidConfig, 'dev-test');
      }).toThrow('authentik.ldapHostname is required');
    });

    test('throws error for missing LDAP base DN', () => {
      const invalidConfig = { 
        ...MOCK_CONFIGS.DEV_TEST,
        authentik: { 
          ...MOCK_CONFIGS.DEV_TEST.authentik
        }
      };
      (invalidConfig.authentik as any).ldapBaseDn = undefined;
      
      expect(() => {
        ConfigValidator.validateEnvironmentConfig(invalidConfig, 'dev-test');
      }).toThrow('authentik.ldapBaseDn is required');
    });
  });

  describe('Environment constraints', () => {
    test('logs warning for prod with single database instance', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const config = { 
        ...MOCK_CONFIGS.PROD,
        database: { 
          ...MOCK_CONFIGS.PROD.database,
          instanceCount: 1
        }
      };
      
      ConfigValidator.validateEnvironmentConfig(config, 'prod');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Production environment recommended to have at least 2 database instances for high availability'
      );
      
      consoleSpy.mockRestore();
    });

    test('logs warning for prod with single Redis node', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const config = { 
        ...MOCK_CONFIGS.PROD,
        redis: { 
          ...MOCK_CONFIGS.PROD.redis,
          numCacheNodes: 1
        }
      };
      
      ConfigValidator.validateEnvironmentConfig(config, 'prod');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Production environment recommended to have at least 2 Redis nodes for high availability'
      );
      
      consoleSpy.mockRestore();
    });
  });
});