/**
 * Test suite for Authentik Server and Worker constructs - edge cases
 */
import { App, Stack } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { AuthentikServer } from '../../../lib/constructs/authentik-server';
import { AuthentikWorker } from '../../../lib/constructs/authentik-worker';
import type { ContextEnvironmentConfig } from '../../../lib/stack-config';

const TEST_CONFIG: ContextEnvironmentConfig = {
  stackName: 'Test',
  database: { instanceClass: 'db.t3.micro', instanceCount: 1, allocatedStorage: 20, maxAllocatedStorage: 100, enablePerformanceInsights: false, monitoringInterval: 0, backupRetentionDays: 7, deleteProtection: false },
  redis: { nodeType: 'cache.t3.micro', numCacheNodes: 1, enableTransit: false, enableAtRest: false },
  ecs: { taskCpu: 512, taskMemory: 1024, desiredCount: 1, enableDetailedLogging: true },
  authentik: { hostname: 'auth', adminUserEmail: 'admin@test.com', ldapHostname: 'ldap', ldapBaseDn: 'dc=test,dc=com', branding: 'tak-nz', authentikVersion: '2025.6.2' },
  ecr: { imageRetentionCount: 5, scanOnPush: false },
  general: { removalPolicy: 'DESTROY', enableDetailedLogging: true, enableContainerInsights: false }
};

describe('Authentik Constructs - Edge Cases', () => {
  let app: App;
  let stack: Stack;
  let vpc: ec2.IVpc;
  let cluster: ecs.ICluster;
  let securityGroup: ec2.SecurityGroup;
  let kmsKey: kms.IKey;
  let mockSecrets: any;
  let mockS3Bucket: s3.IBucket;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'TestStack');
    
    vpc = new ec2.Vpc(stack, 'TestVpc', { maxAzs: 2 });
    cluster = new ecs.Cluster(stack, 'TestCluster', { vpc });
    securityGroup = new ec2.SecurityGroup(stack, 'TestSG', { vpc });
    kmsKey = kms.Key.fromKeyArn(stack, 'TestKey', 'arn:aws:kms:us-west-2:123456789012:key/test-key');
    mockS3Bucket = s3.Bucket.fromBucketArn(stack, 'TestBucket', 'arn:aws:s3:::test-bucket');
    
    mockSecrets = {
      dbSecret: secretsmanager.Secret.fromSecretCompleteArn(stack, 'DbSecret', 'arn:aws:secretsmanager:us-west-2:123456789012:secret:db-secret-AbCdEf'),
      redisSecret: secretsmanager.Secret.fromSecretCompleteArn(stack, 'RedisSecret', 'arn:aws:secretsmanager:us-west-2:123456789012:secret:redis-secret-AbCdEf'),
      secretKey: secretsmanager.Secret.fromSecretCompleteArn(stack, 'SecretKey', 'arn:aws:secretsmanager:us-west-2:123456789012:secret:secret-key-AbCdEf'),
      adminPassword: secretsmanager.Secret.fromSecretCompleteArn(stack, 'AdminPassword', 'arn:aws:secretsmanager:us-west-2:123456789012:secret:admin-password-AbCdEf'),
      adminToken: secretsmanager.Secret.fromSecretCompleteArn(stack, 'AdminToken', 'arn:aws:secretsmanager:us-west-2:123456789012:secret:admin-token-AbCdEf'),
      ldapToken: secretsmanager.Secret.fromSecretCompleteArn(stack, 'LdapToken', 'arn:aws:secretsmanager:us-west-2:123456789012:secret:ldap-token-AbCdEf'),
      ldapServiceUser: secretsmanager.Secret.fromSecretCompleteArn(stack, 'LdapServiceUser', 'arn:aws:secretsmanager:us-west-2:123456789012:secret:ldap-service-user-AbCdEf')
    };
  });

  test('AuthentikServer with config file deployment', () => {
    const server = new AuthentikServer(stack, 'TestServer', {
      environment: 'prod',
      contextConfig: TEST_CONFIG,
      infrastructure: { vpc, ecsSecurityGroup: securityGroup, ecsCluster: cluster, kmsKey },
      secrets: {
        database: mockSecrets.dbSecret,
        redisAuthToken: mockSecrets.redisSecret,
        authentik: {
          secretKey: mockSecrets.secretKey,
          adminUserPassword: mockSecrets.adminPassword,
          adminUserToken: mockSecrets.adminToken,
          ldapToken: mockSecrets.ldapToken
        }
      },
      storage: {
        s3: { configBucket: mockS3Bucket },
        efs: { fileSystemId: 'fs-12345', mediaAccessPointId: 'fsap-media-12345', customTemplatesAccessPointId: 'fsap-templates-12345' }
      },
      deployment: { enableExecute: true, useConfigFile: true },
      application: {
        adminUserEmail: 'admin@example.com',
        ldapBaseDn: 'DC=example,DC=com',
        database: { hostname: 'test-db.example.com' },
        redis: { hostname: 'test-redis.example.com' }
      }
    });

    expect(server.taskDefinition).toBeDefined();
    expect(server.ecsService).toBeDefined();
  });

  test('AuthentikWorker with detailed logging disabled', () => {
    const configWithoutLogging = { ...TEST_CONFIG, general: { ...TEST_CONFIG.general, enableDetailedLogging: false } };
    
    const worker = new AuthentikWorker(stack, 'TestWorker', {
      environment: 'prod',
      contextConfig: configWithoutLogging,
      infrastructure: { vpc, ecsSecurityGroup: securityGroup, ecsCluster: cluster, kmsKey },
      secrets: {
        database: mockSecrets.dbSecret,
        redisAuthToken: mockSecrets.redisSecret,
        authentik: {
          secretKey: mockSecrets.secretKey,
          adminUserPassword: mockSecrets.adminPassword,
          adminUserToken: mockSecrets.adminToken,
          ldapToken: mockSecrets.ldapToken,
          ldapServiceUser: mockSecrets.ldapServiceUser
        }
      },
      storage: {
        s3: { configBucket: mockS3Bucket },
        efs: { fileSystemId: 'fs-12345', mediaAccessPointId: 'fsap-media-12345', customTemplatesAccessPointId: 'fsap-templates-12345' }
      },
      deployment: { enableExecute: false, useConfigFile: false },
      application: {
        adminUserEmail: 'admin@example.com',
        ldapBaseDn: 'DC=example,DC=com',
        database: { hostname: 'test-db.example.com' },
        redis: { hostname: 'test-redis.example.com' },
        authentikHost: 'https://auth.example.com'
      }
    });

    expect(worker.taskDefinition).toBeDefined();
    expect(worker.ecsService).toBeDefined();
  });

  test('AuthentikServer with ECR ARN edge cases', () => {
    const server = new AuthentikServer(stack, 'TestServerECR', {
      environment: 'dev-test',
      contextConfig: TEST_CONFIG,
      infrastructure: { vpc, ecsSecurityGroup: securityGroup, ecsCluster: cluster, kmsKey },
      secrets: {
        database: mockSecrets.dbSecret,
        redisAuthToken: mockSecrets.redisSecret,
        authentik: {
          secretKey: mockSecrets.secretKey,
          adminUserPassword: mockSecrets.adminPassword,
          adminUserToken: mockSecrets.adminToken,
          ldapToken: mockSecrets.ldapToken
        }
      },
      storage: {
        s3: { configBucket: mockS3Bucket, envFileKey: 'config.env' },
        efs: { fileSystemId: 'fs-12345', mediaAccessPointId: 'fsap-media-12345', customTemplatesAccessPointId: 'fsap-templates-12345' }
      },
      deployment: { enableExecute: true, useConfigFile: true },
      application: {
        adminUserEmail: 'admin@example.com',
        ldapBaseDn: 'DC=example,DC=com',
        database: { hostname: 'test-db.example.com', readReplicaHostname: 'test-db-read.example.com' },
        redis: { hostname: 'test-redis.example.com' }
      }
    });

    expect(server.taskDefinition).toBeDefined();
    expect(server.ecsService).toBeDefined();
  });

  test('AuthentikWorker with LDAP service user', () => {
    const worker = new AuthentikWorker(stack, 'TestWorkerLDAP', {
      environment: 'dev-test',
      contextConfig: TEST_CONFIG,
      infrastructure: { vpc, ecsSecurityGroup: securityGroup, ecsCluster: cluster, kmsKey },
      secrets: {
        database: mockSecrets.dbSecret,
        redisAuthToken: mockSecrets.redisSecret,
        authentik: {
          secretKey: mockSecrets.secretKey,
          adminUserPassword: mockSecrets.adminPassword,
          adminUserToken: mockSecrets.adminToken,
          ldapToken: mockSecrets.ldapToken,
          ldapServiceUser: mockSecrets.ldapServiceUser
        }
      },
      storage: {
        s3: { configBucket: mockS3Bucket, envFileKey: 'config.env' },
        efs: { fileSystemId: 'fs-12345', mediaAccessPointId: 'fsap-media-12345', customTemplatesAccessPointId: 'fsap-templates-12345' }
      },
      deployment: { enableExecute: false, useConfigFile: true },
      application: {
        adminUserEmail: 'admin@example.com',
        ldapBaseDn: 'DC=example,DC=com',
        database: { hostname: 'test-db.example.com', readReplicaHostname: 'test-db-read.example.com' },
        redis: { hostname: 'test-redis.example.com' },
        authentikHost: 'https://auth.example.com'
      }
    });

    expect(worker.taskDefinition).toBeDefined();
    expect(worker.ecsService).toBeDefined();
  });
});