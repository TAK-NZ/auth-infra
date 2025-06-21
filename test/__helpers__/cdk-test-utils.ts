/**
 * CDK testing utilities and helpers
 */
import { App, Stack } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { InfrastructureConfig, NetworkConfig } from '../../lib/construct-configs';

export class CDKTestHelper {
  /**
   * Create a test CDK app and stack
   */
  static createTestStack(stackName = 'TestStack'): { app: App; stack: Stack } {
    const app = new App();
    const stack = new Stack(app, stackName);
    return { app, stack };
  }

  /**
   * Create a mock VPC for testing
   */
  static createMockVpc(stack: Stack, id = 'TestVpc'): ec2.IVpc {
    return new ec2.Vpc(stack, id, {
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
  }

  /**
   * Create mock AWS secrets for testing
   */
  static createMockSecrets(stack: Stack) {
    return {
      dbSecret: secretsmanager.Secret.fromSecretCompleteArn(
        stack, 'DbSecret', 
        'arn:aws:secretsmanager:us-west-2:123456789012:secret:db-secret-AbCdEf'
      ),
      redisSecret: secretsmanager.Secret.fromSecretCompleteArn(
        stack, 'RedisSecret', 
        'arn:aws:secretsmanager:us-west-2:123456789012:secret:redis-secret-AbCdEf'
      ),
      secretKey: secretsmanager.Secret.fromSecretCompleteArn(
        stack, 'SecretKey', 
        'arn:aws:secretsmanager:us-west-2:123456789012:secret:secret-key-AbCdEf'
      ),
      adminPassword: secretsmanager.Secret.fromSecretCompleteArn(
        stack, 'AdminPassword', 
        'arn:aws:secretsmanager:us-west-2:123456789012:secret:admin-password-AbCdEf'
      ),
      adminToken: secretsmanager.Secret.fromSecretCompleteArn(
        stack, 'AdminToken', 
        'arn:aws:secretsmanager:us-west-2:123456789012:secret:admin-token-AbCdEf'
      ),
      ldapToken: secretsmanager.Secret.fromSecretCompleteArn(
        stack, 'LdapToken', 
        'arn:aws:secretsmanager:us-west-2:123456789012:secret:ldap-token-AbCdEf'
      ),
      ldapServiceUser: secretsmanager.Secret.fromSecretCompleteArn(
        stack, 'LdapServiceUser', 
        'arn:aws:secretsmanager:us-west-2:123456789012:secret:ldap-service-user-AbCdEf'
      )
    };
  }

  /**
   * Create mock infrastructure configuration
   */
  static createMockInfrastructure(stack: Stack): InfrastructureConfig {
    const vpc = this.createMockVpc(stack);
    const cluster = new ecs.Cluster(stack, 'TestCluster', { vpc });
    const securityGroup = new ec2.SecurityGroup(stack, 'TestSG', { vpc });
    const kmsKey = kms.Key.fromKeyArn(
      stack, 'TestKey', 
      'arn:aws:kms:us-west-2:123456789012:key/12345678-1234-1234-1234-123456789012'
    );

    return {
      vpc,
      ecsSecurityGroup: securityGroup,
      ecsCluster: cluster,
      kmsKey
    };
  }

  /**
   * Create mock network configuration
   */
  static createMockNetwork(): NetworkConfig {
    return {
      sslCertificateArn: 'arn:aws:acm:us-west-2:123456789012:certificate/test-cert',
      hostedZoneId: 'Z123456789',
      hostedZoneName: 'test.com'
    };
  }

  /**
   * Create mock S3 bucket
   */
  static createMockS3Bucket(stack: Stack, id = 'TestBucket'): s3.IBucket {
    return s3.Bucket.fromBucketArn(stack, id, 'arn:aws:s3:::test-bucket');
  }
}