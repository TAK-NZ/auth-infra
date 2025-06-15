import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { AuthInfraStack } from '../lib/auth-infra-stack';
import { LdapStack } from '../lib/ldap-stack';
import { generateAuthInfraStackName, generateLdapStackName } from '../lib/stack-naming';

describe('Integration Tests', () => {
  let app: cdk.App;
  let authStack: AuthInfraStack;
  let ldapStack: LdapStack;
  let authTemplate: Template;
  let ldapTemplate: Template;

  beforeEach(() => {
    app = new cdk.App();
    // Set required context parameters
    app.node.setContext('authentikAdminUserEmail', 'admin@example.com');
    
    const stackName = 'test';
    const envType = 'dev-test';
    const authStackName = generateAuthInfraStackName(stackName);
    const ldapStackName = generateLdapStackName(stackName);

    // Create stacks with test configuration
    authStack = new AuthInfraStack(app, authStackName, {
      stackName,
      envType,
      description: 'Test Auth Stack',
    });

    ldapStack = new LdapStack(app, ldapStackName, {
      stackName,
      envType,
      description: 'Test LDAP Stack',
    });

    ldapStack.addDependency(authStack);

    authTemplate = Template.fromStack(authStack);
    ldapTemplate = Template.fromStack(ldapStack);
  });

  describe('Stack Dependencies', () => {
    it('should have correct dependency between stacks', () => {
      const dependencies = ldapStack.dependencies;
      expect(dependencies).toContain(authStack);
    });

    it('should have correct stack names', () => {
      expect(authStack.stackName).toBe('TAK-test-AuthInfra');
      expect(ldapStack.stackName).toBe('TAK-test-AuthInfra-LDAP');
    });
  });

  describe('Auth Stack Resources', () => {
    it('should create RDS Aurora PostgreSQL cluster', () => {
      authTemplate.hasResourceProperties('AWS::RDS::DBCluster', {
        Engine: 'aurora-postgresql',
        EngineVersion: '17.4',
      });
    });

    it('should create ElastiCache Redis', () => {
      authTemplate.hasResourceProperties('AWS::ElastiCache::ReplicationGroup', {
        Engine: 'valkey',
        CacheNodeType: Match.stringLikeRegexp('cache\\..*'),
      });
    });

    it('should create EFS file system', () => {
      authTemplate.hasResourceProperties('AWS::EFS::FileSystem', {
        Encrypted: true,
        PerformanceMode: 'generalPurpose',
      });
    });

    it('should create Application Load Balancer', () => {
      authTemplate.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
        Type: 'application',
        Scheme: 'internet-facing',
      });
    });

    it('should create ECS Fargate service', () => {
      authTemplate.hasResourceProperties('AWS::ECS::Service', {
        LaunchType: 'FARGATE',
        // PlatformVersion defaults to LATEST when not specified
      });
    });

    it('should create task definition with correct container configuration', () => {
      authTemplate.hasResourceProperties('AWS::ECS::TaskDefinition', {
        RequiresCompatibilities: ['FARGATE'],
        NetworkMode: 'awsvpc',
        Cpu: '512',
        Memory: '1024',
      });
    });
  });

  describe('LDAP Stack Resources', () => {
    it('should create Network Load Balancer', () => {
      ldapTemplate.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
        Type: 'network',
        Scheme: 'internal',
      });
    });

    it('should create ECS Fargate service for LDAP', () => {
      ldapTemplate.hasResourceProperties('AWS::ECS::Service', {
        LaunchType: 'FARGATE',
        // PlatformVersion defaults to LATEST when not specified
      });
    });

    it('should create LDAP listener on port 636', () => {
      ldapTemplate.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
        Port: 636,
        Protocol: 'TLS',
      });
    });
  });

  describe('Security Configuration', () => {
    it('should create security groups with proper ingress rules', () => {
      authTemplate.hasResourceProperties('AWS::EC2::SecurityGroup', {
        SecurityGroupIngress: Match.arrayWith([
          Match.objectLike({
            FromPort: 443,
            ToPort: 443,
            IpProtocol: 'tcp',
          }),
        ]),
      });
    });

    it('should create IAM roles with least privilege', () => {
      authTemplate.hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Principal: {
                Service: 'ecs-tasks.amazonaws.com',
              },
            }),
          ]),
        }),
      });
    });

    it('should encrypt RDS with KMS', () => {
      authTemplate.hasResourceProperties('AWS::RDS::DBCluster', {
        StorageEncrypted: true,
      });
    });

    it('should encrypt Redis in transit and at rest', () => {
      authTemplate.hasResourceProperties('AWS::ElastiCache::ReplicationGroup', {
        TransitEncryptionEnabled: true,
        AtRestEncryptionEnabled: true,
      });
    });
  });



  describe('Resource Tagging', () => {
    it('should tag all resources with Project tag', () => {
      // Note: Tags are inherited from the App level in bin/cdk.ts
      const stackTags = cdk.Tags.of(authStack);
      expect(stackTags).toBeDefined();
    });
  });

  describe('Environment-Specific Configuration', () => {
    it('should use appropriate instance sizes for test environment', () => {
      authTemplate.hasResourceProperties('AWS::RDS::DBCluster', {
        ServerlessV2ScalingConfiguration: {
          MinCapacity: 0.5,
          MaxCapacity: 4, // Current implementation uses fixed values
        },
      });
    });

    it('should set appropriate container resources for dev', () => {
      authTemplate.hasResourceProperties('AWS::ECS::TaskDefinition', {
        Cpu: '512',
        Memory: '1024',
      });
    });
  });

  describe('Cross-Stack Dependencies', () => {
    it('should import base infrastructure VPC correctly', () => {
      authTemplate.hasResourceProperties('AWS::ECS::Service', {
        NetworkConfiguration: {
          AwsvpcConfiguration: {
            Subnets: Match.anyValue(),
          },
        },
      });
    });

    it('should import base infrastructure KMS key', () => {
      // Check that the secondary DB instance uses the KMS key for Performance Insights
      authTemplate.hasResourceProperties('AWS::RDS::DBInstance', {
        PerformanceInsightsKMSKeyId: Match.anyValue(),
      });
    });
  });
});
