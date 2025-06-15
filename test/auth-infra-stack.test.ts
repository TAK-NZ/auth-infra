import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { AuthInfraStack } from '../lib/auth-infra-stack';

describe('AuthInfraStack', () => {
  let app: cdk.App;
  let stack: AuthInfraStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    // Set required context parameters
    app.node.setContext('authentikAdminUserEmail', 'admin@example.com');
    
    stack = new AuthInfraStack(app, 'TestStack', {
      stackName: 'test',
      envType: 'dev-test',
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

  test('Contains ECS Task Definitions', () => {
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

  test('Stack has required parameters', () => {
    template.hasParameter('EnableExecute', {
      Type: 'String',
      AllowedValues: ['true', 'false'],
      Default: 'false',
    });

    template.hasParameter('AuthentikAdminUserEmail', {
      Type: 'String',
    });

    template.hasParameter('AuthentikLDAPBaseDN', {
      Type: 'String',
      Default: 'DC=example,DC=com',
    });

    template.hasParameter('IpAddressType', {
      Type: 'String',
      AllowedValues: ['ipv4', 'dualstack'],
      Default: 'dualstack',
    });

    // GitSha parameter was removed - now used directly from imports
    // SSLCertificateARN parameter was removed - now imported from base stack
    
    template.hasParameter('AuthentikAdminUserEmail', {
      Type: 'String',
      Description: 'E-Mail address for the Authentik akadmin user',
    });
  });

  test('Stack has required outputs', () => {
    // CDK generates unique output names with suffixes
    const templateObj = template.toJSON();
    const outputKeys = Object.keys(templateObj.Outputs || {});
    
    // Check for Authentik URL output (name starts with 'Authentik' but may have suffix)
    const authentikOutput = outputKeys.find(key => key.startsWith('Authentik') && !key.includes('LDAP'));
    expect(authentikOutput).toBeDefined();
    if (authentikOutput) {
      expect(templateObj.Outputs[authentikOutput]).toMatchObject({
        Description: 'HTTP(S) ALB endpoint for CNAME',
      });
    }

    // Check for LDAP Base DN output (name starts with 'Authentik' and includes 'LDAP')
    const ldapBaseDnOutput = outputKeys.find(key => key.startsWith('Authentik') && key.includes('LDAP'));
    expect(ldapBaseDnOutput).toBeDefined();
    if (ldapBaseDnOutput) {
      expect(templateObj.Outputs[ldapBaseDnOutput]).toMatchObject({
        Description: 'LDAP Base DN',
      });
    }
  });

  test('Stack has conditions', () => {
    template.hasCondition('CreateProdResources', {});
  });
});
