/**
 * Route53 LDAP Construct - DNS record management for LDAP service only
 * 
 * This construct creates only the LDAP DNS records. Authentik DNS records
 * are handled by the Route53Authentik construct.
 */
import { Construct } from 'constructs';
import {
  aws_route53 as route53,
  aws_route53_targets as targets,
  aws_elasticloadbalancingv2 as elbv2
} from 'aws-cdk-lib';
import type { ContextEnvironmentConfig } from '../stack-config';
import type { NetworkConfig } from '../construct-configs';

/**
 * Properties for the Route53 LDAP construct
 */
export interface Route53Props {
  /**
   * Environment name (e.g. 'prod', 'dev', etc.)
   */
  environment: 'prod' | 'dev-test';

  /**
   * Environment configuration
   */
  contextConfig: ContextEnvironmentConfig;

  /**
   * Network configuration (DNS zones, hostname, load balancer)
   */
  network: NetworkConfig;

  /**
   * LDAP Network Load Balancer for A alias record
   */
  ldapLoadBalancer: elbv2.NetworkLoadBalancer;
}

/**
 * CDK construct for Route53 DNS record management - LDAP only
 */
export class Route53 extends Construct {
  /**
   * The hosted zone reference
   */
  public readonly hostedZone: route53.IHostedZone;

  /**
   * LDAP A record
   */
  public readonly ldapARecord: route53.ARecord;

  /**
   * Full DNS name for LDAP service
   */
  public readonly ldapFqdn: string;

  constructor(scope: Construct, id: string, props: Route53Props) {
    super(scope, id);

    // Import the hosted zone from base infrastructure
    this.hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: props.network.hostedZoneId,
      zoneName: props.network.hostedZoneName
    });

    // Calculate full domain name
    this.ldapFqdn = `${props.network.hostname}.${props.network.hostedZoneName}`;

    // Create A record alias for LDAP (IPv4 only for NLB)
    this.ldapARecord = new route53.ARecord(this, 'LdapARecord', {
      zone: this.hostedZone,
      recordName: props.network.hostname,
      target: route53.RecordTarget.fromAlias(
        new targets.LoadBalancerTarget(props.ldapLoadBalancer)
      ),
      comment: `LDAP IPv4 alias record for ${props.environment} environment`
    });
  }

  /**
   * Get the LDAP service hostname
   */
  public getLdapHostname(): string {
    return this.ldapFqdn;
  }
}
