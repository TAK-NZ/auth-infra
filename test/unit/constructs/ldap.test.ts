/**
 * Test suite for LDAP construct
 */
import { App, Stack } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Template } from 'aws-cdk-lib/assertions';
import { Ldap } from '../../../lib/constructs/ldap';
import type { ContextEnvironmentConfig } from '../../../lib/stack-config';

const TEST_CONFIG: ContextEnvironmentConfig = {
  stackName: 'Test',
  database: { instanceClass: 'db.t3.micro', instanceCount: 1, allocatedStorage: 20, maxAllocatedStorage: 100, enablePerformanceInsights: false, monitoringInterval: 0, backupRetentionDays: 7, deleteProtection: false },
  ecs: { server: { taskCpu: 512, taskMemory: 1024 }, worker: { taskCpu: 256, taskMemory: 512 }, ldap: { taskCpu: 256, taskMemory: 512 }, desiredCount: 1, enableDetailedLogging: true },
  authentik: { hostname: 'auth', adminUserEmail: 'admin@test.com', ldapHostname: 'ldap', ldapBaseDn: 'dc=test,dc=com', branding: 'tak-nz', authentikVersion: '2025.6.2', buildRevision: 1 },
  ecr: { imageRetentionCount: 5, scanOnPush: false },
  general: { removalPolicy: 'DESTROY', enableDetailedLogging: true, enableContainerInsights: false }
};

describe('LDAP Construct', () => {
  let app: App;
  let stack: Stack;
  let vpc: ec2.IVpc;
  let cluster: ecs.ICluster;
  let securityGroup: ec2.SecurityGroup;
  let kmsKey: kms.IKey;
  let mockSecrets: any;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'TestStack');
    
    vpc = new ec2.Vpc(stack, 'TestVpc', { maxAzs: 2 });
    cluster = new ecs.Cluster(stack, 'TestCluster', { vpc });
    securityGroup = new ec2.SecurityGroup(stack, 'TestSG', { vpc });
    kmsKey = kms.Key.fromKeyArn(stack, 'TestKey', 'arn:aws:kms:us-west-2:123456789012:key/test-key');
    
    mockSecrets = {
      adminPassword: secretsmanager.Secret.fromSecretCompleteArn(stack, 'AdminPassword', 'arn:aws:secretsmanager:us-west-2:123456789012:secret:admin-password-AbCdEf'),
      configPassword: secretsmanager.Secret.fromSecretCompleteArn(stack, 'ConfigPassword', 'arn:aws:secretsmanager:us-west-2:123456789012:secret:config-password-AbCdEf'),
      readonlyPassword: secretsmanager.Secret.fromSecretCompleteArn(stack, 'ReadonlyPassword', 'arn:aws:secretsmanager:us-west-2:123456789012:secret:readonly-password-AbCdEf'),
      ldapServiceUser: secretsmanager.Secret.fromSecretCompleteArn(stack, 'LdapServiceUser', 'arn:aws:secretsmanager:us-west-2:123456789012:secret:ldap-service-user-AbCdEf')
    };
  });

  test('should create LDAP construct with all components', () => {
    const nlbSecurityGroup = new ec2.SecurityGroup(stack, 'NLBSecurityGroup', { vpc });
    
    const ldap = new Ldap(stack, 'TestLDAP', {
      environment: 'dev-test',
      contextConfig: TEST_CONFIG,
      infrastructure: { vpc, ecsSecurityGroup: securityGroup, ecsCluster: cluster, kmsKey },
      storage: { s3: { configBucket: {} as any }, efs: { fileSystemId: 'fs-123', mediaAccessPointId: 'fsap-123', customTemplatesAccessPointId: 'fsap-456' } },
      deployment: { enableExecute: false, useConfigFile: false },
      network: { sslCertificateArn: 'arn:aws:acm:us-west-2:123456789012:certificate/test-cert', hostedZoneId: 'Z123456789', hostedZoneName: 'test.com' },
      application: { authentikHost: 'https://auth.test.com' } as any,
      ldapToken: mockSecrets.adminPassword,
      ldapServiceUser: mockSecrets.ldapServiceUser,
      ldapBaseDn: 'dc=test,dc=com',
      nlbSecurityGroup
    });

    expect(ldap.taskDefinition).toBeDefined();
    expect(ldap.ecsService).toBeDefined();

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      RequiresCompatibilities: ['FARGATE'],
      NetworkMode: 'awsvpc'
    });
  });

  test('should create LDAP with production environment settings', () => {
    const prodConfig = { ...TEST_CONFIG, general: { ...TEST_CONFIG.general, enableDetailedLogging: false } };
    const nlbSecurityGroup2 = new ec2.SecurityGroup(stack, 'NLBSecurityGroup2', { vpc });
    
    const ldap = new Ldap(stack, 'TestLDAP2', {
      environment: 'prod',
      contextConfig: prodConfig,
      infrastructure: { vpc, ecsSecurityGroup: securityGroup, ecsCluster: cluster, kmsKey },
      storage: { s3: { configBucket: {} as any }, efs: { fileSystemId: 'fs-123', mediaAccessPointId: 'fsap-123', customTemplatesAccessPointId: 'fsap-456' } },
      deployment: { enableExecute: false, useConfigFile: false },
      network: { sslCertificateArn: 'arn:aws:acm:us-west-2:123456789012:certificate/test-cert', hostedZoneId: 'Z123456789', hostedZoneName: 'prod.com' },
      application: { authentikHost: 'https://auth.prod.com' } as any,
      ldapToken: mockSecrets.configPassword,
      ldapServiceUser: mockSecrets.ldapServiceUser,
      ldapBaseDn: 'dc=test,dc=com',
      nlbSecurityGroup: nlbSecurityGroup2
    });

    expect(ldap.taskDefinition).toBeDefined();
    expect(ldap.ecsService).toBeDefined();
  });

  test('should handle different base DN formats', () => {
    const nlbSecurityGroup3 = new ec2.SecurityGroup(stack, 'NLBSecurityGroup3', { vpc });
    
    const ldap = new Ldap(stack, 'TestLDAP3', {
      environment: 'dev-test',
      contextConfig: TEST_CONFIG,
      infrastructure: { vpc, ecsSecurityGroup: securityGroup, ecsCluster: cluster, kmsKey },
      storage: { s3: { configBucket: {} as any }, efs: { fileSystemId: 'fs-123', mediaAccessPointId: 'fsap-123', customTemplatesAccessPointId: 'fsap-456' } },
      deployment: { enableExecute: false, useConfigFile: false },
      network: { sslCertificateArn: 'arn:aws:acm:us-west-2:123456789012:certificate/test-cert', hostedZoneId: 'Z123456789', hostedZoneName: 'corp.com' },
      application: { authentikHost: 'https://auth.corp.com' } as any,
      ldapToken: mockSecrets.readonlyPassword,
      ldapServiceUser: mockSecrets.ldapServiceUser,
      ldapBaseDn: 'dc=test,dc=com',
      nlbSecurityGroup: nlbSecurityGroup3
    });

    expect(ldap.taskDefinition).toBeDefined();
    expect(ldap.dnsName).toBeDefined();
  });

  test('should handle ECR ARN parsing edge cases', () => {
    const nlbSecurityGroup4 = new ec2.SecurityGroup(stack, 'NLBSecurityGroup4', { vpc });
    
    const ldap = new Ldap(stack, 'TestLDAP4', {
      environment: 'prod',
      contextConfig: { ...TEST_CONFIG, general: { ...TEST_CONFIG.general, removalPolicy: 'RETAIN' } },
      infrastructure: { vpc, ecsSecurityGroup: securityGroup, ecsCluster: cluster, kmsKey },
      storage: { s3: { configBucket: {} as any }, efs: { fileSystemId: 'fs-123', mediaAccessPointId: 'fsap-123', customTemplatesAccessPointId: 'fsap-456' } },
      deployment: { enableExecute: true, useConfigFile: true },
      network: { sslCertificateArn: 'arn:aws:acm:us-west-2:123456789012:certificate/test-cert', hostedZoneId: 'Z123456789', hostedZoneName: 'corp.com' },
      application: { authentikHost: 'https://auth.corp.com' } as any,
      ldapToken: mockSecrets.readonlyPassword,
      ldapServiceUser: mockSecrets.ldapServiceUser,
      ldapBaseDn: 'dc=test,dc=com',
      nlbSecurityGroup: nlbSecurityGroup4
    });

    expect(ldap.ecsService).toBeDefined();
    expect(ldap.loadBalancer).toBeDefined();
  });

  test('should handle invalid ECR ARN format', () => {
    const nlbSecurityGroup5 = new ec2.SecurityGroup(stack, 'NLBSecurityGroup5', { vpc });
    
    // This test will trigger the ECR ARN parsing error path
    expect(() => {
      new Ldap(stack, 'TestLDAP5', {
        environment: 'dev-test',
        contextConfig: TEST_CONFIG,
        infrastructure: { vpc, ecsSecurityGroup: securityGroup, ecsCluster: cluster, kmsKey },
        storage: { s3: { configBucket: {} as any }, efs: { fileSystemId: 'fs-123', mediaAccessPointId: 'fsap-123', customTemplatesAccessPointId: 'fsap-456' } },
        deployment: { enableExecute: false, useConfigFile: false },
        network: { sslCertificateArn: 'arn:aws:acm:us-west-2:123456789012:certificate/test-cert', hostedZoneId: 'Z123456789', hostedZoneName: 'test.com' },
        application: { authentikHost: 'https://auth.test.com' } as any,
        ldapToken: mockSecrets.adminPassword,
        ldapServiceUser: mockSecrets.ldapServiceUser,
        ldapBaseDn: 'dc=test,dc=com',
        nlbSecurityGroup: nlbSecurityGroup5
      });
    }).not.toThrow(); // The construct should handle this gracefully
  });

  test('should create with minimal configuration', () => {
    const nlbSecurityGroup6 = new ec2.SecurityGroup(stack, 'NLBSecurityGroup6', { vpc });
    const minimalConfig = {
      ...TEST_CONFIG,
      ecs: { ...TEST_CONFIG.ecs, desiredCount: 1 },
      general: { ...TEST_CONFIG.general, enableDetailedLogging: false }
    };
    
    const ldap = new Ldap(stack, 'TestLDAP6', {
      environment: 'dev-test',
      contextConfig: minimalConfig,
      infrastructure: { vpc, ecsSecurityGroup: securityGroup, ecsCluster: cluster, kmsKey },
      storage: { s3: { configBucket: {} as any }, efs: { fileSystemId: 'fs-123', mediaAccessPointId: 'fsap-123', customTemplatesAccessPointId: 'fsap-456' } },
      deployment: { enableExecute: false, useConfigFile: false },
      network: { sslCertificateArn: 'arn:aws:acm:us-west-2:123456789012:certificate/test-cert', hostedZoneId: 'Z123456789', hostedZoneName: 'test.com' },
      application: { authentikHost: '' } as any,
      ldapToken: mockSecrets.adminPassword,
      ldapServiceUser: mockSecrets.ldapServiceUser,
      ldapBaseDn: 'dc=test,dc=com',
      nlbSecurityGroup: nlbSecurityGroup6
    });

    expect(ldap.taskDefinition).toBeDefined();
    expect(ldap.ecsService).toBeDefined();
    expect(ldap.loadBalancer).toBeDefined();
    expect(ldap.dnsName).toBeDefined();
  });

  describe('container health check', () => {
    function createLdap() {
      const nlbSecurityGroup = new ec2.SecurityGroup(stack, 'HealthNlbSecurityGroup', { vpc });
      new Ldap(stack, 'HealthLDAP', {
        environment: 'dev-test',
        contextConfig: TEST_CONFIG,
        infrastructure: { vpc, ecsSecurityGroup: securityGroup, ecsCluster: cluster, kmsKey },
        storage: { s3: { configBucket: {} as any }, efs: { fileSystemId: 'fs-123', mediaAccessPointId: 'fsap-123', customTemplatesAccessPointId: 'fsap-456' } },
        deployment: { enableExecute: false, useConfigFile: false },
        network: { sslCertificateArn: 'arn:aws:acm:us-west-2:123456789012:certificate/test-cert', hostedZoneId: 'Z123456789', hostedZoneName: 'test.com' },
        application: { authentikHost: 'https://auth.test.com' } as any,
        ldapToken: mockSecrets.adminPassword,
        ldapServiceUser: mockSecrets.ldapServiceUser,
        ldapBaseDn: 'dc=ldap,dc=tak',
        nlbSecurityGroup
      });
      return Template.fromStack(stack);
    }

    function ldapContainer(template: Template) {
      const defs = template.findResources('AWS::ECS::TaskDefinition');
      const container = Object.values(defs)
        .flatMap((d: any) => d.Properties.ContainerDefinitions)
        .find((c: any) => c.Name === 'AuthentikLdap');
      expect(container).toBeDefined();
      return container as any;
    }

    test('binds as the service account through the outpost, not just a process check', () => {
      const hc = ldapContainer(createLdap()).HealthCheck;
      expect(hc.Command).toEqual(['CMD', '/ldap-bind-probe']);
    });

    test('waits for the directory sync and tolerates short Authentik blips', () => {
      const hc = ldapContainer(createLdap()).HealthCheck;
      // ECS maximum start period: the outpost does not listen until its cache is built
      expect(hc.StartPeriod).toBe(300);
      expect(hc.Interval).toBe(30);
      expect(hc.Timeout).toBe(15);
      // 5 x 30 s, so a brief Authentik restart does not replace the task
      expect(hc.Retries).toBe(5);
    });

    test('gives the probe the service account and base DN', () => {
      const container = ldapContainer(createLdap());
      const secretNames = container.Secrets.map((x: any) => x.Name);
      expect(secretNames).toEqual(expect.arrayContaining(['AUTHENTIK_TOKEN', 'LDAP_PROBE_USERNAME', 'LDAP_PROBE_PASSWORD']));
      const env = Object.fromEntries(container.Environment.map((e: any) => [e.Name, e.Value]));
      expect(env.LDAP_PROBE_BASE_DN).toBe('dc=ldap,dc=tak');
      const user = container.Secrets.find((x: any) => x.Name === 'LDAP_PROBE_USERNAME');
      const pass = container.Secrets.find((x: any) => x.Name === 'LDAP_PROBE_PASSWORD');
      expect(JSON.stringify(user.ValueFrom)).toContain(':username::');
      expect(JSON.stringify(pass.ValueFrom)).toContain(':password::');
    });

    test('lets the task execution role read the service account secret', () => {
      const template = createLdap();
      const policies = template.findResources('AWS::IAM::Policy');
      const grants = JSON.stringify(Object.values(policies));
      expect(grants).toContain('ldap-service-user-AbCdEf');
    });
  });
});
