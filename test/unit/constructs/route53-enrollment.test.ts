import { Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ApplicationLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { Route53Enrollment } from '../../../lib/constructs/route53-enrollment';

describe('Route53Enrollment', () => {
  test('creates A and AAAA records for enrollment hostname', () => {
    // GIVEN
    const stack = new Stack();
    const vpc = new Vpc(stack, 'TestVpc', { maxAzs: 2 });
    const alb = new ApplicationLoadBalancer(stack, 'TestALB', {
      vpc,
      internetFacing: true
    });
    
    // WHEN
    new Route53Enrollment(stack, 'TestRoute53Enrollment', {
      environment: 'dev-test',
      contextConfig: {
        stackName: 'Dev',
        enrollment: {
          enrollmentHostname: 'enroll',
          providerName: 'test-provider',
          applicationName: 'Test App',
          applicationSlug: 'test-app',
          enrollmentIcon: 'https://example.com/icon.png',
          openInNewTab: true,
          authenticationFlowName: '',
          authorizationFlowName: 'default-flow',
          invalidationFlowName: 'default-flow',
          groupName: 'Test Group',
          description: 'Test description'
        }
      } as any,
      network: {
        hostedZoneId: 'Z1234567890',
        hostedZoneName: 'example.com',
        hostname: 'enroll',
        sslCertificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012'
      },
      loadBalancer: alb
    });
    
    // THEN
    const template = Template.fromStack(stack);
    
    // Verify A record exists
    template.resourceCountIs('AWS::Route53::RecordSet', 2);
    
    // Check for A record with correct name and type
    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Name: 'enroll.example.com.',
      Type: 'A'
    });
    
    // Check for AAAA record with correct name and type
    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Name: 'enroll.example.com.',
      Type: 'AAAA'
    });
  });
});