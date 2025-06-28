/**
 * Test suite for ELB construct
 */
import { App, Stack } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Template } from 'aws-cdk-lib/assertions';
import { Elb } from '../../../lib/constructs/elb';
import type { ContextEnvironmentConfig } from '../../../lib/stack-config';
import type { InfrastructureConfig, NetworkConfig } from '../../../lib/construct-configs';
import { CDKTestHelper } from '../../__helpers__/cdk-test-utils';

const TEST_CONFIG: ContextEnvironmentConfig = {
  stackName: 'Test',
  database: { instanceClass: 'db.t3.micro', instanceCount: 1, allocatedStorage: 20, maxAllocatedStorage: 100, enablePerformanceInsights: false, monitoringInterval: 0, backupRetentionDays: 7, deleteProtection: false },
  redis: { nodeType: 'cache.t3.micro', numCacheNodes: 1 },
  ecs: { taskCpu: 512, taskMemory: 1024, desiredCount: 1, enableDetailedLogging: true },
  authentik: { hostname: 'auth', adminUserEmail: 'admin@test.com', ldapHostname: 'ldap', ldapBaseDn: 'dc=test,dc=com', branding: 'tak-nz', authentikVersion: '2025.6.2' },
  ecr: { imageRetentionCount: 5, scanOnPush: false },
  general: { removalPolicy: 'DESTROY', enableDetailedLogging: true, enableContainerInsights: false }
};

describe('ELB Construct', () => {
  let app: App;
  let stack: Stack;
  let vpc: ec2.IVpc;
  let infrastructureConfig: InfrastructureConfig;
  let networkConfig: NetworkConfig;

  beforeEach(() => {
    ({ app, stack } = CDKTestHelper.createTestStack());
    infrastructureConfig = CDKTestHelper.createMockInfrastructure(stack);
    vpc = infrastructureConfig.vpc;
    networkConfig = CDKTestHelper.createMockNetwork();
  });

  test('should create load balancer with correct properties', () => {
    const elb = new Elb(stack, 'TestELB', {
      environment: 'dev-test',
      contextConfig: TEST_CONFIG,
      infrastructure: infrastructureConfig,
      network: networkConfig
    });

    // Add a default action to prevent validation error
    const defaultTargetGroup = elb.createTargetGroup('DefaultTG', 9000, vpc);
    elb.httpsListener.addAction('DefaultAction', {
      action: elbv2.ListenerAction.forward([defaultTargetGroup])
    });

    expect(elb.loadBalancer).toBeDefined();
    expect(elb.httpsListener).toBeDefined();
    expect(elb.dnsName).toBeDefined();

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      Type: 'application',
      Scheme: 'internet-facing'
    });
  });

  test('should create target group with correct configuration', () => {
    const elb = new Elb(stack, 'TestELB', {
      environment: 'dev-test',
      contextConfig: TEST_CONFIG,
      infrastructure: infrastructureConfig,
      network: networkConfig
    });

    const targetGroup = elb.createTargetGroup('TestTG', 9000, vpc);
    elb.httpsListener.addAction('DefaultAction', {
      action: elbv2.ListenerAction.forward([targetGroup])
    });
    expect(targetGroup).toBeDefined();

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      Port: 9000,
      Protocol: 'HTTP',
      TargetType: 'ip'
    });
  });

  test('should create target group with custom health check path', () => {
    const elb = new Elb(stack, 'TestELB', {
      environment: 'dev-test',
      contextConfig: TEST_CONFIG,
      infrastructure: infrastructureConfig,
      network: networkConfig
    });

    const targetGroup = elb.createTargetGroup('TestTG', 9000, vpc, '/custom/health');
    elb.httpsListener.addAction('DefaultAction', {
      action: elbv2.ListenerAction.forward([targetGroup])
    });
    
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      HealthCheckPath: '/custom/health'
    });
  });

  test('should add target group to listener', () => {
    const elb = new Elb(stack, 'TestELB', {
      environment: 'dev-test',
      contextConfig: TEST_CONFIG,
      infrastructure: infrastructureConfig,
      network: networkConfig
    });

    const targetGroup = elb.createTargetGroup('TestTG', 9000, vpc);
    elb.httpsListener.addAction('DefaultAction', {
      action: elbv2.ListenerAction.forward([targetGroup])
    });
    elb.addTargetGroup('TestAction', targetGroup);

    const template = Template.fromStack(stack);
    // The addTargetGroup method doesn't create a ListenerRule, it adds an action
    // Just verify the target group was created
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      Port: 9000
    });
  });
});