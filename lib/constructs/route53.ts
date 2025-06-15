/**
 * Route53 Construct - DNS record management for Authentik and LDAP services
 */
import { Construct } from 'constructs';
import {
  aws_route53 as route53,
  aws_route53_targets as targets,
  aws_elasticloadbalancingv2 as elbv2,
  Fn
} from 'aws-cdk-lib';
import type { AuthInfraEnvironmentConfig } from '../environment-config';

/**
 * Properties for the Route53 construct
 */
export interface Route53Props {
  /**
   * Environment name (e.g. 'prod', 'dev', etc.)
   */
  environment: string;

  /**
   * Environment configuration
   */
  config: AuthInfraEnvironmentConfig;

  /**
   * Hosted Zone ID imported from base infrastructure
   */
  hostedZoneId: string;

  /**
   * Hosted Zone Name imported from base infrastructure
   */
  hostedZoneName: string;

  /**
   * Hostname for Authentik service (creates A/AAAA alias records)
   */
  hostnameAuthentik: string;

  /**
   * Hostname for LDAP service (creates A alias record)
   */
  hostnameLdap: string;

  /**
   * Authentik Application Load Balancer for A/AAAA alias records
   */
  authentikLoadBalancer: elbv2.ApplicationLoadBalancer;

  /**
   * LDAP Network Load Balancer for A alias record
   */
  ldapLoadBalancer: elbv2.NetworkLoadBalancer;
}

/**
 * CDK construct for Route53 DNS record management
 */
export class Route53 extends Construct {
  /**
   * The hosted zone reference
   */
  public readonly hostedZone: route53.IHostedZone;

  /**
   * Authentik A record
   */
  public readonly authentikARecord: route53.ARecord;

  /**
   * Authentik AAAA record
   */
  public readonly authentikAAAARecord: route53.AaaaRecord;

  /**
   * LDAP A record
   */
  public readonly ldapARecord: route53.ARecord;

  /**
   * Full DNS name for Authentik service
   */
  public readonly authentikFqdn: string;

  /**
   * Full DNS name for LDAP service
   */
  public readonly ldapFqdn: string;

  constructor(scope: Construct, id: string, props: Route53Props) {
    super(scope, id);

    // Import the hosted zone from base infrastructure
    this.hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.hostedZoneName
    });

    // Calculate full domain names
    this.authentikFqdn = `${props.hostnameAuthentik}.${props.hostedZoneName}`;
    this.ldapFqdn = `${props.hostnameLdap}.${props.hostedZoneName}`;

    // Create A record alias for Authentik (IPv4)
    this.authentikARecord = new route53.ARecord(this, 'AuthentikARecord', {
      zone: this.hostedZone,
      recordName: props.hostnameAuthentik,
      target: route53.RecordTarget.fromAlias(
        new targets.LoadBalancerTarget(props.authentikLoadBalancer)
      ),
      comment: `Authentik IPv4 alias record for ${props.environment} environment`
    });

    // Create AAAA record alias for Authentik (IPv6)
    this.authentikAAAARecord = new route53.AaaaRecord(this, 'AuthentikAAAARecord', {
      zone: this.hostedZone,
      recordName: props.hostnameAuthentik,
      target: route53.RecordTarget.fromAlias(
        new targets.LoadBalancerTarget(props.authentikLoadBalancer)
      ),
      comment: `Authentik IPv6 alias record for ${props.environment} environment`
    });

    // Create A record alias for LDAP (IPv4 only for NLB)
    this.ldapARecord = new route53.ARecord(this, 'LdapARecord', {
      zone: this.hostedZone,
      recordName: props.hostnameLdap,
      target: route53.RecordTarget.fromAlias(
        new targets.LoadBalancerTarget(props.ldapLoadBalancer)
      ),
      comment: `LDAP IPv4 alias record for ${props.environment} environment`
    });
  }

  /**
   * Get the Authentik service URL
   */
  public getAuthentikUrl(): string {
    return `https://${this.authentikFqdn}`;
  }

  /**
   * Get the LDAP service hostname
   */
  public getLdapHostname(): string {
    return this.ldapFqdn;
  }
}
