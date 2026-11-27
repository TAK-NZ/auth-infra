/**
 * Tests for the AWS WAF on the Authentik load balancer
 */
import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { AuthWaf } from '../../../lib/constructs/waf';
import { AuthInfraStack } from '../../../lib/auth-infra-stack';
import { ConfigValidator } from '../../../lib/utils/config-validator';
import type { ContextEnvironmentConfig } from '../../../lib/stack-config';
import { MOCK_CONFIGS } from '../../__fixtures__/mock-configs';

type WafConfig = NonNullable<ContextEnvironmentConfig['waf']>;

function synthWaf(waf: WafConfig, removalPolicy = 'DESTROY'): Template {
  const stack = new Stack(new App(), 'WafTest', { env: { account: '123456789012', region: 'ap-southeast-6' } });
  const vpc = new ec2.Vpc(stack, 'Vpc');
  const loadBalancer = new elbv2.ApplicationLoadBalancer(stack, 'Alb', { vpc, internetFacing: true });
  new AuthWaf(stack, 'Waf', {
    contextConfig: { ...MOCK_CONFIGS.DEV_TEST, waf, general: { ...MOCK_CONFIGS.DEV_TEST.general, removalPolicy } },
    loadBalancer
  });
  return Template.fromStack(stack);
}

function rules(template: Template): any[] {
  const acls = Object.values(template.findResources('AWS::WAFv2::WebACL')) as any[];
  expect(acls).toHaveLength(1);
  return acls[0].Properties.Rules;
}

function rule(template: Template, name: string): any {
  const found = rules(template).filter((r) => r.Name === name);
  expect(found).toHaveLength(1);
  return found[0];
}

describe('AuthWaf', () => {
  describe('defaults', () => {
    const template = synthWaf({ enabled: true });

    test('creates a regional web ACL that allows by default and is attached to the load balancer', () => {
      template.hasResourceProperties('AWS::WAFv2::WebACL', {
        Name: 'tak-devtest-auth',
        Scope: 'REGIONAL',
        DefaultAction: { Allow: {} }
      });
      template.resourceCountIs('AWS::WAFv2::WebACLAssociation', 1);
      template.hasResourceProperties('AWS::WAFv2::WebACLAssociation', {
        ResourceArn: { Ref: Match.stringLikeRegexp('^Alb') },
        WebACLArn: { 'Fn::GetAtt': [Match.stringLikeRegexp('^WafWebAcl'), 'Arn'] }
      });
    });

    test('every rule only counts until it is switched to block', () => {
      expect(rule(template, 'ClientSuppliedForwardingHeaders').Action).toEqual({ Count: {} });
      expect(rule(template, 'RateLimitFlowExecutor').Action).toEqual({ Count: {} });
      expect(rule(template, 'AWSManagedRulesAmazonIpReputationList').OverrideAction).toEqual({ Count: {} });
    });

    test('rule priorities are unique and the metric names are alphanumeric', () => {
      const all = rules(template);
      expect(new Set(all.map((r) => r.Priority)).size).toBe(all.length);
      for (const r of all) {
        expect(r.VisibilityConfig.MetricName).toMatch(/^[A-Za-z0-9]+$/);
        expect(r.VisibilityConfig.CloudWatchMetricsEnabled).toBe(true);
        expect(r.VisibilityConfig.SampledRequestsEnabled).toBe(true);
      }
    });

    test('the forwarding header rule matches X-Forwarded-For, X-Real-IP or Forwarded being present', () => {
      const statements = rule(template, 'ClientSuppliedForwardingHeaders').Statement.OrStatement.Statements;
      expect(statements.map((s: any) => s.SizeConstraintStatement.FieldToMatch.SingleHeader.Name)).toEqual([
        'x-forwarded-for',
        'x-real-ip',
        'forwarded'
      ]);
      for (const s of statements) {
        expect(s.SizeConstraintStatement.ComparisonOperator).toBe('GT');
        expect(s.SizeConstraintStatement.Size).toBe(0);
      }
    });

    test('the rate rule is per source IP on the flow executor, excludes the LDAP flow and normalises the path', () => {
      const rate = rule(template, 'RateLimitFlowExecutor').Statement.RateBasedStatement;
      expect(rate.Limit).toBe(300);
      expect(rate.EvaluationWindowSec).toBe(300);
      expect(rate.AggregateKeyType).toBe('IP');
      expect(rate.ForwardedIPConfig).toBeUndefined();
      const [include, exclude] = rate.ScopeDownStatement.AndStatement.Statements;
      expect(include.ByteMatchStatement.SearchString).toBe('/api/v3/flows/executor/');
      expect(exclude.NotStatement.Statement.ByteMatchStatement.SearchString).toBe(
        '/api/v3/flows/executor/ldap-authentication-flow/'
      );
      for (const s of [include, exclude.NotStatement.Statement]) {
        expect(s.ByteMatchStatement.PositionalConstraint).toBe('STARTS_WITH');
        expect(s.ByteMatchStatement.TextTransformations.map((t: any) => t.Type)).toEqual(['URL_DECODE', 'NORMALIZE_PATH']);
      }
    });

    test('uses the AWS managed IP reputation group', () => {
      expect(rule(template, 'AWSManagedRulesAmazonIpReputationList').Statement.ManagedRuleGroupStatement).toEqual({
        VendorName: 'AWS',
        Name: 'AWSManagedRulesAmazonIpReputationList'
      });
    });
  });

  describe('logging', () => {
    const template = synthWaf({ enabled: true });

    test('logs to a CloudWatch log group whose name starts with aws-waf-logs-', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: 'aws-waf-logs-tak-devtest-auth',
        RetentionInDays: 30
      });
      const logging = Object.values(template.findResources('AWS::WAFv2::LoggingConfiguration'))[0] as any;
      // WAF rejects a log group ARN that ends in ":*"
      expect(JSON.stringify(logging.Properties.LogDestinationConfigs)).not.toContain(':*');
    });

    test('redacts the query string (flow tokens) and credential headers', () => {
      const logging = Object.values(template.findResources('AWS::WAFv2::LoggingConfiguration'))[0] as any;
      const redacted = logging.Properties.RedactedFields;
      expect(redacted).toContainEqual({ QueryString: {} });
      for (const header of ['cookie', 'authorization', 'x-authentik-outpost-token']) {
        expect(redacted).toContainEqual({ SingleHeader: { Name: header } });
      }
    });

    test('only logs requests that matched a count or block rule', () => {
      const logging = Object.values(template.findResources('AWS::WAFv2::LoggingConfiguration'))[0] as any;
      expect(logging.Properties.LoggingFilter.DefaultBehavior).toBe('DROP');
      expect(JSON.stringify(logging.Properties.LoggingFilter.Filters)).toContain('COUNT');
      expect(JSON.stringify(logging.Properties.LoggingFilter.Filters)).toContain('BLOCK');
    });

    test('keeps the log group when the removal policy is RETAIN', () => {
      const retained = synthWaf({ enabled: true }, 'RETAIN');
      const group = Object.values(retained.findResources('AWS::Logs::LogGroup'))[0] as any;
      expect(group.DeletionPolicy).toBe('Retain');
    });
  });

  describe('configuration', () => {
    test('block actions, the rate limit and the log retention come from the configuration', () => {
      const template = synthWaf({
        enabled: true,
        forwardingHeaders: 'block',
        rateLimit: { requestsPer5Minutes: 1000, action: 'block' },
        ipReputation: 'block',
        logRetentionDays: 90
      });
      expect(rule(template, 'ClientSuppliedForwardingHeaders').Action).toEqual({ Block: {} });
      expect(rule(template, 'RateLimitFlowExecutor').Action).toEqual({ Block: {} });
      expect(rule(template, 'RateLimitFlowExecutor').Statement.RateBasedStatement.Limit).toBe(1000);
      // none keeps the managed group's own action, which is block
      expect(rule(template, 'AWSManagedRulesAmazonIpReputationList').OverrideAction).toEqual({ None: {} });
      template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 90 });
    });

    test('refuses to build a web ACL that is not enabled', () => {
      const stack = new Stack(new App(), 'WafOff');
      const vpc = new ec2.Vpc(stack, 'Vpc');
      const loadBalancer = new elbv2.ApplicationLoadBalancer(stack, 'Alb', { vpc });
      expect(
        () => new AuthWaf(stack, 'Waf', { contextConfig: { ...MOCK_CONFIGS.DEV_TEST, waf: { enabled: false } }, loadBalancer })
      ).toThrow('waf.enabled');
    });
  });

  describe('validation', () => {
    const validate = (waf: unknown) =>
      ConfigValidator.validateEnvironmentConfig({ ...MOCK_CONFIGS.DEV_TEST, waf } as ContextEnvironmentConfig, 'dev-test');

    test('accepts a valid configuration and ignores a disabled one', () => {
      expect(() => validate({ enabled: true, forwardingHeaders: 'block', rateLimit: { requestsPer5Minutes: 10 } })).not.toThrow();
      expect(() => validate({ enabled: false, forwardingHeaders: 'nonsense' })).not.toThrow();
      expect(() => validate(undefined)).not.toThrow();
    });

    test.each([
      [{ enabled: true, forwardingHeaders: 'deny' }, 'waf.forwardingHeaders'],
      [{ enabled: true, rateLimit: { action: 'allow' } }, 'waf.rateLimit.action'],
      [{ enabled: true, ipReputation: 'off' }, 'waf.ipReputation'],
      [{ enabled: true, rateLimit: { requestsPer5Minutes: 5 } }, 'between 10'],
      [{ enabled: true, rateLimit: { requestsPer5Minutes: 12.5 } }, 'between 10'],
      [{ enabled: true, logRetentionDays: 31 }, 'logRetentionDays']
    ])('rejects %j', (waf, message) => {
      expect(() => validate(waf)).toThrow(message);
    });
  });

  describe('in the stack', () => {
    function stackTemplate(waf?: WafConfig): Template {
      const app = new App();
      const stack = new AuthInfraStack(app, `WafStack${Math.random().toString(36).slice(2, 8)}`, {
        environment: 'dev-test',
        envConfig: { ...MOCK_CONFIGS.DEV_TEST, ...(waf ? { waf } : {}) },
        env: { account: '123456789012', region: 'ap-southeast-6' }
      });
      return Template.fromStack(stack);
    }

    test('creates the web ACL and an output when enabled', () => {
      const template = stackTemplate({ enabled: true });
      template.resourceCountIs('AWS::WAFv2::WebACL', 1);
      template.resourceCountIs('AWS::WAFv2::WebACLAssociation', 1);
      template.resourceCountIs('AWS::WAFv2::LoggingConfiguration', 1);
      expect(Object.keys(template.toJSON().Outputs)).toContain('WafWebAclArnOutput');
    });

    test('creates nothing when the block is absent or disabled', () => {
      for (const template of [stackTemplate(), stackTemplate({ enabled: false })]) {
        template.resourceCountIs('AWS::WAFv2::WebACL', 0);
        template.resourceCountIs('AWS::WAFv2::WebACLAssociation', 0);
        expect(Object.keys(template.toJSON().Outputs)).not.toContain('WafWebAclArnOutput');
      }
    });
  });
});
