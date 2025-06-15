/**
 * Route53 Construct - DNS record management for Authentik and LDAP services
 */
import { Construct } from 'constructs';
import { aws_route53 as route53, aws_elasticloadbalancingv2 as elbv2 } from 'aws-cdk-lib';
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
export declare class Route53 extends Construct {
    /**
     * The hosted zone reference
     */
    readonly hostedZone: route53.IHostedZone;
    /**
     * Authentik A record
     */
    readonly authentikARecord: route53.ARecord;
    /**
     * Authentik AAAA record
     */
    readonly authentikAAAARecord: route53.AaaaRecord;
    /**
     * LDAP A record
     */
    readonly ldapARecord: route53.ARecord;
    /**
     * Full DNS name for Authentik service
     */
    readonly authentikFqdn: string;
    /**
     * Full DNS name for LDAP service
     */
    readonly ldapFqdn: string;
    constructor(scope: Construct, id: string, props: Route53Props);
    /**
     * Get the Authentik service URL
     */
    getAuthentikUrl(): string;
    /**
     * Get the LDAP service hostname
     */
    getLdapHostname(): string;
}
