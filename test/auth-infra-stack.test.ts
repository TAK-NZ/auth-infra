import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { AuthInfraStack } from '../lib/auth-infra-stack';
import { applyContextOverrides } from '../lib/utils/context-overrides';

describe('AuthInfraStack', () => {
  let app: cdk.App;
  let stack: AuthInfraStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    
    // Mock the dev-test environment configuration
    const mockEnvConfig = {
      stackName: "Dev",
      database: {
        instanceClass: "db.t3.micro",
        instanceCount: 1,
        allocatedStorage: 20,
        maxAllocatedStorage: 100,
        enablePerformanceInsights: false,
        monitoringInterval: 0,
        backupRetentionDays: 7,
        deleteProtection: false
      },
      redis: {
        nodeType: "cache.t3.micro",
        numCacheNodes: 1,
        enableTransit: false,
        enableAtRest: false
      },
      ecs: {
        taskCpu: 512,
        taskMemory: 1024,
        desiredCount: 1,
        enableDetailedLogging: true
      },
      authentik: {
        hostname: "account",
        adminUserEmail: "admin@tak.nz",
        ldapHostname: "ldap",
        ldapBaseDn: "dc=tak,dc=nz",
        branding: "tak-nz",
        authentikVersion: "2025.6.2"
      },
      ecr: {
        imageRetentionCount: 5,
        scanOnPush: false
      },
      general: {
        removalPolicy: "DESTROY",
        enableDetailedLogging: true,
        enableContainerInsights: false
      }
    };
    
    // Apply context overrides (though none for testing)
    const finalEnvConfig = applyContextOverrides(app, mockEnvConfig);
    
    stack = new AuthInfraStack(app, 'TestStack', {
      environment: 'dev-test',
      envConfig: finalEnvConfig,
      env: {
        account: '123456789012',
        region: 'us-west-2',
      },
    });
    template = Template.fromStack(stack);
  });

  test('Stack creates successfully', () => {
    expect(stack).toBeDefined();
  });

  test('Contains Aurora PostgreSQL cluster', () => {
    template.hasResourceProperties('AWS::RDS::DBCluster', {
      Engine: 'aurora-postgresql',
      DatabaseName: 'authentik',
    });
  });

  test('Contains Redis replication group', () => {
    template.hasResourceProperties('AWS::ElastiCache::ReplicationGroup', {
      Engine: 'valkey',
      ReplicationGroupDescription: 'Valkey (Redis) cluster for Authentik',
    });
  });

  test('Contains EFS file system', () => {
    template.hasResourceProperties('AWS::EFS::FileSystem', {
      Encrypted: true,
    });
  });

  test('Contains Application Load Balancer', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      Type: 'application',
      Scheme: 'internet-facing',
    });
  });

  test('Contains both Authentik and LDAP ECS Task Definitions', () => {
    // Should have 3 task definitions - Server, Worker, and LDAP
    template.resourceCountIs('AWS::ECS::TaskDefinition', 3);
    
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      RequiresCompatibilities: ['FARGATE'],
      NetworkMode: 'awsvpc',
    });
  });

  test('Contains Secrets Manager secrets', () => {
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Description: Match.stringLikeRegexp('.*Authentik.*'),
    });
  });

  test('Contains security groups', () => {
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: Match.anyValue(),
    });
  });

  test('Contains IAM roles for ECS tasks', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: 'ecs-tasks.amazonaws.com',
            },
            Action: 'sts:AssumeRole',
          },
        ],
      },
    });
  });

  test('Contains CloudWatch log group', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      RetentionInDays: 7,
    });
  });

  test('Stack has CloudFormation outputs', () => {
    // Check that we have stack outputs for key resources
    const templateObj = template.toJSON();
    const outputKeys = Object.keys(templateObj.Outputs || {});
    
    // Should have outputs for database, Redis, EFS, etc.
    expect(outputKeys.length).toBeGreaterThan(0);
    
    // Check for some key outputs (names may have suffixes due to CDK)
    const hasDbOutput = outputKeys.some(key => key.includes('Database'));
    const hasRedisOutput = outputKeys.some(key => key.includes('Redis'));
    const hasEfsOutput = outputKeys.some(key => key.includes('Efs'));
    
    expect(hasDbOutput).toBe(true);
    expect(hasRedisOutput).toBe(true);
    expect(hasEfsOutput).toBe(true);
  });
});
