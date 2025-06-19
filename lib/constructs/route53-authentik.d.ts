/**
 * Route53 Authentik Construct - DNS record management for Authentik service only
 *
 * This construct creates only the Authentik DNS records, allowing the FQDN to be
 * available for use by other constructs (like LDAP token retriever) before the
 * LDAP construct is created.
 */
import { Construct } from 'constructs';
import { aws_route53 as route53, aws_elasticloadbalancingv2 as elbv2 } from 'aws-cdk-lib';
import type { ContextEnvironmentConfig } from '../stack-config';
import type { NetworkConfig } from '../construct-configs';
/**
 * Properties for the Route53 Authentik construct
 */
export interface Route53AuthentikProps {
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
     * Authentik Application Load Balancer for A/AAAA alias records
     */
    authentikLoadBalancer: elbv2.ApplicationLoadBalancer;
}
/**
 * CDK construct for Route53 DNS record management - Authentik only
 */
export declare class Route53Authentik extends Construct {
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
     * Full DNS name for Authentik service
     */
    readonly authentikFqdn: string;
    constructor(scope: Construct, id: string, props: Route53AuthentikProps);
    /**
     * Get the Authentik service URL
     */
    getAuthentikUrl(): string;
}
