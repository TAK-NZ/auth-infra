/**
 * Test suite for Route53 constructs
 */
import { App, Stack } from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Template } from 'aws-cdk-lib/assertions';
import { Route53 } from '../../../lib/constructs/route53-ldap';

describe('Route53 Constructs', () => {
  let app: App;
  let stack: Stack;
  let hostedZone: route53.IHostedZone;
  let loadBalancer: elbv2.IApplicationLoadBalancer;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'TestStack');
    
    hostedZone = route53.HostedZone.fromHostedZoneAttributes(stack, 'TestZone', {
      hostedZoneId: 'Z123456789',
      zoneName: 'test.com'
    });

    const vpc = new ec2.Vpc(stack, 'TestVpc', { maxAzs: 2 });
    loadBalancer = new elbv2.ApplicationLoadBalancer(stack, 'TestALB', {
      vpc,
      internetFacing: true
    });
  });

  test('should create Route53 LDAP record', () => {
    const nlb = new elbv2.NetworkLoadBalancer(stack, 'TestNLB', {
      vpc: new ec2.Vpc(stack, 'TestVpc2', { maxAzs: 2 }),
      internetFacing: false
    });

    const route53Ldap = new Route53(stack, 'TestRoute53LDAP', {
      environment: 'dev-test',
      contextConfig: { stackName: 'Test', database: {}, ecs: {}, authentik: {}, ecr: {}, general: {} } as any,
      network: {
        hostedZoneId: 'Z123456789',
        hostedZoneName: 'test.com',
        hostname: 'ldap',
        sslCertificateArn: 'arn:aws:acm:us-west-2:123456789012:certificate/test-cert'
      },
      ldapLoadBalancer: nlb
    });

    expect(route53Ldap.ldapARecord).toBeDefined();
    expect(route53Ldap.ldapAAAARecord).toBeDefined();

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Type: 'A',
      Name: 'ldap.test.com.'
    });
  });

  test('should handle different hostname formats', () => {
    const nlb = new elbv2.NetworkLoadBalancer(stack, 'TestNLB2', {
      vpc: new ec2.Vpc(stack, 'TestVpc3', { maxAzs: 2 }),
      internetFacing: false
    });

    const route53Ldap = new Route53(stack, 'TestRoute53LDAP2', {
      environment: 'dev-test',
      contextConfig: { stackName: 'Test', database: {}, ecs: {}, authentik: {}, ecr: {}, general: {} } as any,
      network: {
        hostedZoneId: 'Z123456789',
        hostedZoneName: 'test.com',
        hostname: 'directory.ldap',
        sslCertificateArn: 'arn:aws:acm:us-west-2:123456789012:certificate/test-cert'
      },
      ldapLoadBalancer: nlb
    });

    expect(route53Ldap.ldapARecord).toBeDefined();
    expect(route53Ldap.getLdapHostname()).toBe('directory.ldap.test.com');

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Name: 'directory.ldap.test.com.'
    });
  });
});