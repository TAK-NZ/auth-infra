/**
 * Route53 LDAP Construct - DNS record management for LDAP service only
 *
 * This construct creates only the LDAP DNS records. Authentik DNS records
 * are handled by the Route53Authentik construct.
 */
import { Construct } from 'constructs';
import { aws_route53 as route53, aws_elasticloadbalancingv2 as elbv2 } from 'aws-cdk-lib';
import type { AuthInfraEnvironmentConfig } from '../environment-config';
/**
 * Properties for the Route53 LDAP construct
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
     * Hostname for LDAP service (creates A alias record)
     */
    hostnameLdap: string;
    /**
     * LDAP Network Load Balancer for A alias record
     */
    ldapLoadBalancer: elbv2.NetworkLoadBalancer;
}
/**
 * CDK construct for Route53 DNS record management - LDAP only
 */
export declare class Route53 extends Construct {
    /**
     * The hosted zone reference
     */
    readonly hostedZone: route53.IHostedZone;
    /**
     * LDAP A record
     */
    readonly ldapARecord: route53.ARecord;
    /**
     * Full DNS name for LDAP service
     */
    readonly ldapFqdn: string;
    constructor(scope: Construct, id: string, props: Route53Props);
    /**
     * Get the LDAP service hostname
     */
    getLdapHostname(): string;
}
