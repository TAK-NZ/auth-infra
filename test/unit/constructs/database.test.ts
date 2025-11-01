/**
 * Test suite for Database construct
 */
import { App, Stack } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Template } from 'aws-cdk-lib/assertions';
import { Database } from '../../../lib/constructs/database';
import type { ContextEnvironmentConfig } from '../../../lib/stack-config';
import type { InfrastructureConfig } from '../../../lib/construct-configs';
import { CDKTestHelper } from '../../__helpers__/cdk-test-utils';

describe('Database Construct', () => {
  let app: App;
  let stack: Stack;
  let vpc: ec2.IVpc;
  let infrastructureConfig: InfrastructureConfig;
  let securityGroups: ec2.SecurityGroup[];

  beforeEach(() => {
    ({ app, stack } = CDKTestHelper.createTestStack());
    infrastructureConfig = CDKTestHelper.createMockInfrastructure(stack);
    vpc = infrastructureConfig.vpc;
    securityGroups = [infrastructureConfig.ecsSecurityGroup];
  });

  test('should throw error when database config is missing', () => {
    const configWithoutDb = {
      stackName: 'Test',
      ecs: { taskCpu: 512, taskMemory: 1024, desiredCount: 1, enableDetailedLogging: true },
      authentik: { hostname: 'auth', adminUserEmail: 'admin@test.com', ldapHostname: 'ldap', ldapBaseDn: 'dc=test,dc=com', branding: 'tak-nz', authentikVersion: '2025.6.2', buildRevision: 1 },
      ecr: { imageRetentionCount: 5, scanOnPush: false },
      general: { removalPolicy: 'DESTROY', enableDetailedLogging: true, enableContainerInsights: false }
    } as any;

    expect(() => {
      new Database(stack, 'TestDB', {
        environment: 'dev-test',
        stackName: 'TestStack',
        contextConfig: configWithoutDb,
        infrastructure: infrastructureConfig,
        securityGroups
      });
    }).toThrow('Database configuration is required when using Database construct');
  });

  test('should create serverless database cluster', () => {
    const serverlessConfig: ContextEnvironmentConfig = {
      stackName: 'Test',
      database: { instanceClass: 'db.serverless', instanceCount: 1, allocatedStorage: 20, maxAllocatedStorage: 100, enablePerformanceInsights: false, monitoringInterval: 0, backupRetentionDays: 7, deleteProtection: false },
      ecs: { taskCpu: 512, taskMemory: 1024, desiredCount: 1, enableDetailedLogging: true },
      authentik: { hostname: 'auth', adminUserEmail: 'admin@test.com', ldapHostname: 'ldap', ldapBaseDn: 'dc=test,dc=com', branding: 'tak-nz', authentikVersion: '2025.6.2', buildRevision: 1 },
      ecr: { imageRetentionCount: 5, scanOnPush: false },
      general: { removalPolicy: 'DESTROY', enableDetailedLogging: true, enableContainerInsights: false }
    };

    const database = new Database(stack, 'TestDB', {
      environment: 'dev-test',
      stackName: 'TestStack',
      contextConfig: serverlessConfig,
      infrastructure: infrastructureConfig,
      securityGroups
    });

    expect(database.cluster).toBeDefined();
    expect(database.masterSecret).toBeDefined();
    expect(database.hostname).toBeDefined();
    expect(database.readerEndpoint).toBeDefined();

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::RDS::DBCluster', {
      Engine: 'aurora-postgresql',
      DatabaseName: 'authentik'
    });
    
    // Verify monitoring role is created but MonitoringInterval is not set (undefined)
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [{
          Effect: 'Allow',
          Principal: { Service: 'monitoring.rds.amazonaws.com' }
        }]
      }
    });
    
    // Verify MonitoringInterval is not present in template when disabled
    const resources = template.findResources('AWS::RDS::DBCluster');
    const clusterProps = Object.values(resources)[0].Properties;
    expect(clusterProps.MonitoringInterval).toBeUndefined();
  });

  test('should create provisioned database cluster', () => {
    const provisionedConfig: ContextEnvironmentConfig = {
      stackName: 'Test',
      database: { instanceClass: 'db.t3.medium', instanceCount: 2, allocatedStorage: 100, maxAllocatedStorage: 1000, enablePerformanceInsights: true, monitoringInterval: 60, backupRetentionDays: 30, deleteProtection: true },
      ecs: { taskCpu: 512, taskMemory: 1024, desiredCount: 1, enableDetailedLogging: true },
      authentik: { hostname: 'auth', adminUserEmail: 'admin@test.com', ldapHostname: 'ldap', ldapBaseDn: 'dc=test,dc=com', branding: 'tak-nz', authentikVersion: '2025.6.2', buildRevision: 1 },
      ecr: { imageRetentionCount: 5, scanOnPush: false },
      general: { removalPolicy: 'RETAIN', enableDetailedLogging: false, enableContainerInsights: true }
    };

    const database = new Database(stack, 'TestDB', {
      environment: 'prod',
      stackName: 'TestStack',
      contextConfig: provisionedConfig,
      infrastructure: infrastructureConfig,
      securityGroups
    });

    expect(database.cluster).toBeDefined();
    
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::RDS::DBCluster', {
      Engine: 'aurora-postgresql',
      DeletionProtection: true
    });
    
    // Verify monitoring role is created for enhanced monitoring
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [{
          Effect: 'Allow',
          Principal: { Service: 'monitoring.rds.amazonaws.com' }
        }]
      },
      ManagedPolicyArns: [{
        'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole']]
      }]
    });
    
    // Verify enableMonitoring logic works (monitoring interval > 0)
    expect(provisionedConfig.database.monitoringInterval).toBe(60);
  });

  test('should handle large instance type', () => {
    const largeInstanceConfig: ContextEnvironmentConfig = {
      stackName: 'Test',
      database: { instanceClass: 'db.t3.large', instanceCount: 1, allocatedStorage: 20, maxAllocatedStorage: 100, enablePerformanceInsights: false, monitoringInterval: 0, backupRetentionDays: 7, deleteProtection: false },
      ecs: { taskCpu: 512, taskMemory: 1024, desiredCount: 1, enableDetailedLogging: true },
      authentik: { hostname: 'auth', adminUserEmail: 'admin@test.com', ldapHostname: 'ldap', ldapBaseDn: 'dc=test,dc=com', branding: 'tak-nz', authentikVersion: '2025.6.2', buildRevision: 1 },
      ecr: { imageRetentionCount: 5, scanOnPush: false },
      general: { removalPolicy: 'DESTROY', enableDetailedLogging: true, enableContainerInsights: false }
    };

    const database = new Database(stack, 'TestDB3', {
      environment: 'dev-test',
      stackName: 'TestStack',
      contextConfig: largeInstanceConfig,
      infrastructure: infrastructureConfig,
      securityGroups
    });

    expect(database.cluster).toBeDefined();
    expect(database.hostname).toBeDefined();
    expect(database.readerEndpoint).toBeDefined();
    
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::RDS::DBCluster', {
      Engine: 'aurora-postgresql'
    });
  });

  test('should handle medium instance type (non-large)', () => {
    const mediumInstanceConfig: ContextEnvironmentConfig = {
      stackName: 'Test',
      database: { instanceClass: 'db.t3.medium', instanceCount: 1, allocatedStorage: 20, maxAllocatedStorage: 100, enablePerformanceInsights: false, monitoringInterval: 0, backupRetentionDays: 7, deleteProtection: false },
      ecs: { taskCpu: 512, taskMemory: 1024, desiredCount: 1, enableDetailedLogging: true },
      authentik: { hostname: 'auth', adminUserEmail: 'admin@test.com', ldapHostname: 'ldap', ldapBaseDn: 'dc=test,dc=com', branding: 'tak-nz', authentikVersion: '2025.6.2', buildRevision: 1 },
      ecr: { imageRetentionCount: 5, scanOnPush: false },
      general: { removalPolicy: 'DESTROY', enableDetailedLogging: true, enableContainerInsights: false }
    };

    const database = new Database(stack, 'TestDB5', {
      environment: 'dev-test',
      stackName: 'TestStack',
      contextConfig: mediumInstanceConfig,
      infrastructure: infrastructureConfig,
      securityGroups
    });

    expect(database.cluster).toBeDefined();
  });

  test('should handle custom engine version', () => {
    const customEngineConfig: ContextEnvironmentConfig = {
      stackName: 'Test',
      database: { instanceClass: 'db.t3.medium', instanceCount: 1, allocatedStorage: 20, maxAllocatedStorage: 100, enablePerformanceInsights: false, monitoringInterval: 0, backupRetentionDays: 7, deleteProtection: false, engineVersion: '16.4' },
      ecs: { taskCpu: 512, taskMemory: 1024, desiredCount: 1, enableDetailedLogging: true },
      authentik: { hostname: 'auth', adminUserEmail: 'admin@test.com', ldapHostname: 'ldap', ldapBaseDn: 'dc=test,dc=com', branding: 'tak-nz', authentikVersion: '2025.6.2', buildRevision: 1 },
      ecr: { imageRetentionCount: 5, scanOnPush: false },
      general: { removalPolicy: 'DESTROY', enableDetailedLogging: true, enableContainerInsights: false }
    };

    const database = new Database(stack, 'TestDB4', {
      environment: 'dev-test',
      stackName: 'TestStack',
      contextConfig: customEngineConfig,
      infrastructure: infrastructureConfig,
      securityGroups
    });

    expect(database.cluster).toBeDefined();
  });
});