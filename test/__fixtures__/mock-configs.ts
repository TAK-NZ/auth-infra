/**
 * Reusable test configuration objects
 */
import type { ContextEnvironmentConfig } from '../../lib/stack-config';

export const MOCK_CONFIGS = {
  DEV_TEST: {
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
      adminUserEmail: 'admin@test.com',
      ldapHostname: 'ldap',
      ldapBaseDn: 'dc=test,dc=com',
      branding: 'tak-nz',
      authentikVersion: '2025.6.2',
      buildRevision: 1
    },
    enrollment: {
      enrollmentEnabled: true,
      enrollmentHostname: 'enroll',
      providerName: 'TAK Enrollment',
      applicationName: 'TAK Enrollment App',
      enrollmentIcon: 'https://example.com/icon.png',
      authenticationFlowName: ''
    },
    ecr: {
      imageRetentionCount: 5,
      scanOnPush: false
    },
    general: {
      removalPolicy: 'DESTROY',
      enableDetailedLogging: true,
      enableContainerInsights: false
    },
    docker: {
      authentikImageTag: 'authentik:test',
      ldapImageTag: 'ldap:test'
    }
  } as ContextEnvironmentConfig,

  PROD: {
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
      adminUserEmail: 'admin@prod.com',
      ldapHostname: 'ldap',
      ldapBaseDn: 'dc=prod,dc=com',
      branding: 'tak-nz',
      authentikVersion: '2025.6.2',
      buildRevision: 1
    },
    enrollment: {
      enrollmentEnabled: true,
      enrollmentHostname: 'enroll',
      providerName: 'TAK Enrollment',
      applicationName: 'TAK Enrollment App',
      enrollmentIcon: 'https://example.com/icon.png',
      authenticationFlowName: ''
    },
    ecr: {
      imageRetentionCount: 20,
      scanOnPush: true
    },
    general: {
      removalPolicy: 'RETAIN',
      enableDetailedLogging: false,
      enableContainerInsights: true
    },
    docker: {
      authentikImageTag: 'authentik:prod',
      ldapImageTag: 'ldap:prod'
    }
  } as ContextEnvironmentConfig,

  SERVERLESS: {
    stackName: 'Serverless',
    database: {
      instanceClass: 'db.serverless',
      instanceCount: 1,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      enablePerformanceInsights: false,
      monitoringInterval: 0,
      backupRetentionDays: 1,
      deleteProtection: false
    },
    redis: {
      nodeType: 'cache.t4g.micro',
      numCacheNodes: 1
    },
    ecs: {
      taskCpu: 512,
      taskMemory: 1024,
      desiredCount: 1,
      enableDetailedLogging: true
    },
    authentik: {
      hostname: 'auth',
      adminUserEmail: 'admin@serverless.com',
      ldapHostname: 'ldap',
      ldapBaseDn: 'dc=serverless,dc=com',
      branding: 'tak-nz',
      authentikVersion: '2025.6.2',
      buildRevision: 1
    },
    enrollment: {
      enrollmentEnabled: true,
      enrollmentHostname: 'enroll',
      providerName: 'TAK Enrollment',
      applicationName: 'TAK Enrollment App',
      enrollmentIcon: 'https://example.com/icon.png',
      authenticationFlowName: ''
    },
    ecr: {
      imageRetentionCount: 5,
      scanOnPush: false
    },
    general: {
      removalPolicy: 'DESTROY',
      enableDetailedLogging: true,
      enableContainerInsights: false
    },
    docker: {
      authentikImageTag: 'authentik:serverless',
      ldapImageTag: 'ldap:serverless'
    }
  } as ContextEnvironmentConfig
};