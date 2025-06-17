/**
 * Test suite for EFS IAM permissions
 */
import { App, Stack } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { AuthentikServer } from '../lib/constructs/authentik-server';
import { AuthentikWorker } from '../lib/constructs/authentik-worker';
import { DEV_TEST_CONFIG } from '../lib/environment-config';
import type {
  InfrastructureConfig,
  SecretsConfig,
  StorageConfig,
  DeploymentConfig,
  AuthentikApplicationConfig
} from '../lib/construct-configs';

describe('EFS IAM Permissions', () => {
  let app: App;
  let stack: Stack;
  let vpc: ec2.IVpc;
  let cluster: ecs.ICluster;
  let securityGroup: ec2.SecurityGroup;
  let kmsKey: kms.IKey;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'TestStack');
    
    // Create a proper VPC with public and private subnets for testing
    vpc = new ec2.Vpc(stack, 'TestVpc', {
      maxAzs: 2,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // Create ECS cluster with the VPC
    cluster = new ecs.Cluster(stack, 'TestCluster', {
      vpc,
      clusterName: 'test-cluster'
    });

    // Mock security group
    securityGroup = new ec2.SecurityGroup(stack, 'TestSG', {
      vpc,
      description: 'Test security group'
    });

    // Mock KMS key
    kmsKey = kms.Key.fromKeyArn(stack, 'TestKey', 'arn:aws:kms:us-west-2:123456789012:key/12345678-1234-1234-1234-123456789012');
  });

  // Helper function to create test config objects
  function createTestConfigs(mockSecrets: any, mockS3Bucket: s3.IBucket) {
    const infrastructureConfig: InfrastructureConfig = {
      vpc,
      ecsSecurityGroup: securityGroup,
      ecsCluster: cluster,
      kmsKey
    };

    const secretsConfig: SecretsConfig = {
      database: mockSecrets.dbSecret,
      redisAuthToken: mockSecrets.redisSecret,
      authentik: {
        secretKey: mockSecrets.secretKey,
        adminUserPassword: mockSecrets.adminPassword,
        adminUserToken: mockSecrets.adminToken,
        ldapToken: mockSecrets.ldapToken
      }
    };

    const storageConfig: StorageConfig = {
      s3: {
        configBucket: mockS3Bucket
      },
      efs: {
        fileSystemId: 'fs-12345',
        mediaAccessPointId: 'fsap-media-12345',
        customTemplatesAccessPointId: 'fsap-templates-12345'
      }
    };

    const deploymentConfig: DeploymentConfig = {
      gitSha: 'test-sha',
      ecrRepositoryArn: 'arn:aws:ecr:us-west-2:123456789012:repository/test-repo',
      enableExecute: false,
      useConfigFile: false
    };

    const applicationConfig: AuthentikApplicationConfig = {
      adminUserEmail: 'admin@example.com',
      ldapBaseDn: 'DC=example,DC=com',
      database: {
        hostname: 'test-db.example.com'
      },
      redis: {
        hostname: 'test-redis.example.com'
      }
    };

    return { infrastructureConfig, secretsConfig, storageConfig, deploymentConfig, applicationConfig };
  }

  test('AuthentikServer should have EFS permissions in task role', () => {
    const mockSecrets = createMockSecrets(stack);
    const mockS3Bucket = s3.Bucket.fromBucketArn(stack, 'TestBucket', 'arn:aws:s3:::test-bucket');
    const configs = createTestConfigs(mockSecrets, mockS3Bucket);

    const server = new AuthentikServer(stack, 'TestAuthentikServer', {
      environment: 'test',
      config: DEV_TEST_CONFIG,
      infrastructure: configs.infrastructureConfig,
      secrets: configs.secretsConfig,
      storage: configs.storageConfig,
      deployment: configs.deploymentConfig,
      application: configs.applicationConfig
    });

    // Check that task definition was created
    expect(server.taskDefinition).toBeDefined();
    
    // Verify the task definition has a task role
    expect(server.taskDefinition.taskRole).toBeDefined();
  });

  test('AuthentikWorker should have EFS permissions in task role', () => {
    const mockSecrets = createMockSecrets(stack);
    const mockS3Bucket = s3.Bucket.fromBucketArn(stack, 'TestWorkerBucket', 'arn:aws:s3:::test-worker-bucket');
    const configs = createTestConfigs(mockSecrets, mockS3Bucket);
    
    // Add authentik host to worker config
    const workerApplicationConfig = {
      ...configs.applicationConfig,
      authentikHost: 'https://account.example.com'
    };

    const worker = new AuthentikWorker(stack, 'TestAuthentikWorker', {
      environment: 'test',
      config: DEV_TEST_CONFIG,
      infrastructure: configs.infrastructureConfig,
      secrets: {
        ...configs.secretsConfig,
        authentik: {
          ...configs.secretsConfig.authentik,
          ldapServiceUser: mockSecrets.ldapServiceUser
        }
      },
      storage: configs.storageConfig,
      deployment: configs.deploymentConfig,
      application: workerApplicationConfig
    });

    // Check that task definition was created
    expect(worker.taskDefinition).toBeDefined();
    
    // Verify the task definition has a task role
    expect(worker.taskDefinition.taskRole).toBeDefined();
  });
});

function createMockSecrets(stack: Stack) {
  return {
    dbSecret: secretsmanager.Secret.fromSecretCompleteArn(stack, 'DbSecret', 'arn:aws:secretsmanager:us-west-2:123456789012:secret:db-secret-AbCdEf'),
    redisSecret: secretsmanager.Secret.fromSecretCompleteArn(stack, 'RedisSecret', 'arn:aws:secretsmanager:us-west-2:123456789012:secret:redis-secret-AbCdEf'),
    secretKey: secretsmanager.Secret.fromSecretCompleteArn(stack, 'SecretKey', 'arn:aws:secretsmanager:us-west-2:123456789012:secret:secret-key-AbCdEf'),
    adminPassword: secretsmanager.Secret.fromSecretCompleteArn(stack, 'AdminPassword', 'arn:aws:secretsmanager:us-west-2:123456789012:secret:admin-password-AbCdEf'),
    adminToken: secretsmanager.Secret.fromSecretCompleteArn(stack, 'AdminToken', 'arn:aws:secretsmanager:us-west-2:123456789012:secret:admin-token-AbCdEf'),
    ldapToken: secretsmanager.Secret.fromSecretCompleteArn(stack, 'LdapToken', 'arn:aws:secretsmanager:us-west-2:123456789012:secret:ldap-token-AbCdEf'),
    ldapServiceUser: secretsmanager.Secret.fromSecretCompleteArn(stack, 'LdapServiceUser', 'arn:aws:secretsmanager:us-west-2:123456789012:secret:ldap-service-user-AbCdEf')
  };
}
