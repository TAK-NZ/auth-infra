/**
 * Test suite for context-based configuration
 */
import { ContextEnvironmentConfig } from '../../lib/stack-config';
import { applyContextOverrides } from '../../lib/utils/context-overrides';
import * as cdk from 'aws-cdk-lib';

describe('Context-Based Configuration Management', () => {
  
  describe('ContextEnvironmentConfig interface', () => {
    test('should have all required properties for dev-test', () => {
      const devTestConfig: ContextEnvironmentConfig = {
        stackName: 'DevTest',
        database: {
          instanceClass: 'db.t3.micro',
          instanceCount: 1,
          allocatedStorage: 20,
          maxAllocatedStorage: 100,
          enablePerformanceInsights: false,
          monitoringInterval: 0,
          backupRetentionDays: 7,
          deleteProtection: false
        },
        redis: {
          nodeType: 'cache.t3.micro',
          numCacheNodes: 1
        },
        ecs: {
          taskCpu: 512,
          taskMemory: 1024,
          desiredCount: 1,
          enableDetailedLogging: true
        },
        authentik: {
          hostname: 'account',
          adminUserEmail: 'admin@tak.nz',
          ldapHostname: 'ldap',
          ldapBaseDn: 'dc=tak,dc=nz',
          branding: 'tak-nz',
          authentikVersion: '2025.6.2',
          buildRevision: 1
        },
        ecr: {
          imageRetentionCount: 5,
          scanOnPush: false
        },
        general: {
          removalPolicy: 'DESTROY',
          enableDetailedLogging: true,
          enableContainerInsights: false
        }
      };
      
      // Validate structure
      expect(devTestConfig.stackName).toBe('DevTest');
      expect(devTestConfig.database?.instanceClass).toBe('db.t3.micro');
      expect(devTestConfig.ecs?.desiredCount).toBe(1);
    });

    test('should have different values for production', () => {
      const prodConfig: ContextEnvironmentConfig = {
        stackName: 'Prod',
        database: {
          instanceClass: 'db.t3.small',
          instanceCount: 2,
          allocatedStorage: 100,
          maxAllocatedStorage: 1000,
          enablePerformanceInsights: true,
          monitoringInterval: 60,
          backupRetentionDays: 30,
          deleteProtection: true
        },
        redis: {
          nodeType: 'cache.t3.small',
          numCacheNodes: 2
        },
        ecs: {
          taskCpu: 1024,
          taskMemory: 2048,
          desiredCount: 2,
          enableDetailedLogging: false
        },
        authentik: {
          hostname: 'account',
          adminUserEmail: 'admin@tak.nz',
          ldapHostname: 'ldap',
          ldapBaseDn: 'dc=tak,dc=nz',
          branding: 'tak-nz',
          authentikVersion: '2025.6.2',
          buildRevision: 1
        },
        ecr: {
          imageRetentionCount: 20,
          scanOnPush: true
        },
        general: {
          removalPolicy: 'RETAIN',
          enableDetailedLogging: false,
          enableContainerInsights: true
        }
      };
      
      // Validate production-specific values
      expect(prodConfig.database?.instanceClass).toBe('db.t3.small');
      expect(prodConfig.ecs?.desiredCount).toBe(2);
      expect(prodConfig.general?.removalPolicy).toBe('RETAIN');
    });
  });


});
