/**
 * WAF Construct - AWS WAF web ACL for the Authentik load balancer
 *
 * Three rules, each switchable between COUNT and BLOCK in cdk.json so a new rule can be measured
 * before it blocks anything:
 *
 * 1. Client-supplied forwarding headers. Authentik takes the leftmost X-Forwarded-For value as the
 *    client IP, and the load balancer appends the real address to the right, so any client can choose
 *    the IP Authentik records and uses (reputation scores, audit events). The load balancer adds its
 *    own X-Forwarded-For after WAF has inspected the request, so a request that already carries
 *    X-Forwarded-For, X-Real-IP or Forwarded was sent that way by the client or by a proxy in front of it.
 * 2. A per-source-IP rate limit on the flow executor API (every login step is a call to it). WAF sees
 *    the real connection address, so unlike Authentik it cannot be spoofed. The LDAP flow is excluded:
 *    the LDAP outpost runs flows through this load balancer from the VPC's NAT address, and that flow
 *    only runs for an authenticated outpost.
 * 3. The AWS managed IP reputation list.
 *
 * Requests that match a COUNT or BLOCK rule are logged to CloudWatch Logs, with the query string and
 * the cookie, authorization and outpost token headers redacted (flow links carry their token in the
 * query string).
 */
import { Construct } from 'constructs';
import {
  ArnFormat,
  RemovalPolicy,
  Stack,
  aws_elasticloadbalancingv2 as elbv2,
  aws_logs as logs,
  aws_wafv2 as wafv2
} from 'aws-cdk-lib';
import type { ContextEnvironmentConfig, WafAction } from '../stack-config';

export interface WafProps {
  /**
   * Context-based environment configuration (direct from cdk.json)
   */
  contextConfig: ContextEnvironmentConfig;
  /**
   * The load balancer to protect
   */
  loadBalancer: elbv2.ApplicationLoadBalancer;
}

export const WAF_DEFAULTS = {
  forwardingHeaders: 'count' as WafAction,
  rateLimitRequestsPer5Minutes: 300,
  rateLimitAction: 'count' as WafAction,
  ipReputation: 'count' as WafAction,
  logRetentionDays: 30
};

// Flow executor path, and the LDAP flow that the LDAP outpost runs through this load balancer
const EXECUTOR_PATH = '/api/v3/flows/executor/';
const LDAP_FLOW_PATH = '/api/v3/flows/executor/ldap-authentication-flow/';

// Decode %2e%2e and similar, then resolve ../ and //, so a crafted path cannot slip past the prefix match
const PATH_TRANSFORMS: wafv2.CfnWebACL.TextTransformationProperty[] = [
  { priority: 0, type: 'URL_DECODE' },
  { priority: 1, type: 'NORMALIZE_PATH' }
];

export class AuthWaf extends Construct {
  public readonly webAcl: wafv2.CfnWebACL;
  public readonly logGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: WafProps) {
    super(scope, id);

    const config = props.contextConfig.waf;
    if (!config?.enabled) {
      throw new Error('AuthWaf requires waf.enabled to be true');
    }
    const stackName = props.contextConfig.stackName;
    const name = `tak-${stackName.toLowerCase()}-auth`;
    const metricPrefix = `Tak${stackName.replace(/[^A-Za-z0-9]/g, '')}Auth`;

    const forwardingAction = config.forwardingHeaders ?? WAF_DEFAULTS.forwardingHeaders;
    const rateAction = config.rateLimit?.action ?? WAF_DEFAULTS.rateLimitAction;
    const rateLimit = config.rateLimit?.requestsPer5Minutes ?? WAF_DEFAULTS.rateLimitRequestsPer5Minutes;
    const reputationAction = config.ipReputation ?? WAF_DEFAULTS.ipReputation;

    const visibility = (metricName: string): wafv2.CfnWebACL.VisibilityConfigProperty => ({
      cloudWatchMetricsEnabled: true,
      sampledRequestsEnabled: true,
      metricName
    });
    const ruleAction = (action: WafAction): wafv2.CfnWebACL.RuleActionProperty =>
      action === 'block' ? { block: {} } : { count: {} };

    // singleHeader is an untyped JSON property in the CDK L1 constructs, so it takes the CloudFormation
    // spelling ('Name'), not the camelCase one
    const headerPresent = (header: string): wafv2.CfnWebACL.StatementProperty => ({
      sizeConstraintStatement: {
        fieldToMatch: { singleHeader: { Name: header } },
        comparisonOperator: 'GT',
        size: 0,
        textTransformations: [{ priority: 0, type: 'NONE' }]
      }
    });
    const pathStartsWith = (prefix: string): wafv2.CfnWebACL.StatementProperty => ({
      byteMatchStatement: {
        fieldToMatch: { uriPath: {} },
        positionalConstraint: 'STARTS_WITH',
        searchString: prefix,
        textTransformations: PATH_TRANSFORMS
      }
    });

    this.webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name,
      description: `TAK-${stackName}-AuthInfra: client IP integrity, login rate limit and IP reputation`,
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: visibility(`${metricPrefix}WebAcl`),
      rules: [
        {
          name: 'ClientSuppliedForwardingHeaders',
          priority: 10,
          action: ruleAction(forwardingAction),
          statement: {
            orStatement: {
              statements: [headerPresent('x-forwarded-for'), headerPresent('x-real-ip'), headerPresent('forwarded')]
            }
          },
          visibilityConfig: visibility(`${metricPrefix}ForwardingHeaders`)
        },
        {
          name: 'RateLimitFlowExecutor',
          priority: 20,
          action: ruleAction(rateAction),
          statement: {
            rateBasedStatement: {
              limit: rateLimit,
              evaluationWindowSec: 300,
              aggregateKeyType: 'IP',
              scopeDownStatement: {
                andStatement: {
                  statements: [pathStartsWith(EXECUTOR_PATH), { notStatement: { statement: pathStartsWith(LDAP_FLOW_PATH) } }]
                }
              }
            }
          },
          visibilityConfig: visibility(`${metricPrefix}RateLimitFlowExecutor`)
        },
        {
          name: 'AWSManagedRulesAmazonIpReputationList',
          priority: 30,
          // Managed rule groups take an override: none keeps the group's own action (block), count only counts
          overrideAction: reputationAction === 'block' ? { none: {} } : { count: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesAmazonIpReputationList'
            }
          },
          visibilityConfig: visibility(`${metricPrefix}IpReputation`)
        }
      ]
    });

    new wafv2.CfnWebACLAssociation(this, 'Association', {
      resourceArn: props.loadBalancer.loadBalancerArn,
      webAclArn: this.webAcl.attrArn
    });

    // Logging. The log group name must start with aws-waf-logs-. WAF adds the CloudWatch Logs resource
    // policy that lets it deliver, which needs logs:PutResourcePolicy for the deploying role.
    this.logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `aws-waf-logs-${name}`,
      retention: (config.logRetentionDays ?? WAF_DEFAULTS.logRetentionDays) as logs.RetentionDays,
      removalPolicy: props.contextConfig.general.removalPolicy === 'RETAIN' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY
    });
    // WAF wants the log group ARN without the trailing ":*" that logGroupArn carries
    const logGroupArn = Stack.of(this).formatArn({
      service: 'logs',
      resource: 'log-group',
      resourceName: this.logGroup.logGroupName,
      arnFormat: ArnFormat.COLON_RESOURCE_NAME
    });
    const logging = new wafv2.CfnLoggingConfiguration(this, 'Logging', {
      resourceArn: this.webAcl.attrArn,
      logDestinationConfigs: [logGroupArn],
      redactedFields: [
        { queryString: {} },
        { singleHeader: { Name: 'cookie' } },
        { singleHeader: { Name: 'authorization' } },
        { singleHeader: { Name: 'x-authentik-outpost-token' } }
      ],
      // Only log what a COUNT or BLOCK rule matched
      loggingFilter: {
        DefaultBehavior: 'DROP',
        Filters: [
          {
            Behavior: 'KEEP',
            Requirement: 'MEETS_ANY',
            Conditions: [{ ActionCondition: { Action: 'BLOCK' } }, { ActionCondition: { Action: 'COUNT' } }]
          }
        ]
      }
    });
    logging.node.addDependency(this.logGroup);
  }
}
