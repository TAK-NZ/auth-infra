/**
 * Route53 Enrollment Construct - DNS record management for Enrollment service
 * 
 * This construct creates the Enrollment DNS records (A and AAAA) that point to the ALB.
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
 * Properties for the Route53 Enrollment construct
 */
export interface Route53EnrollmentProps {
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
   * Application Load Balancer for A/AAAA alias records
   */
  loadBalancer: elbv2.IApplicationLoadBalancer;
}

/**
 * CDK construct for Route53 DNS record management - Enrollment
 */
export class Route53Enrollment extends Construct {
  /**
   * The hosted zone reference
   */
  public readonly hostedZone: route53.IHostedZone;

  /**
   * Enrollment A record
   */
  public readonly enrollmentARecord: route53.ARecord;

  /**
   * Enrollment AAAA record
   */
  public readonly enrollmentAAAARecord: route53.AaaaRecord;

  /**
   * Full DNS name for Enrollment service
   */
  public readonly enrollmentFqdn: string;

  constructor(scope: Construct, id: string, props: Route53EnrollmentProps) {
    super(scope, id);

    // Import the hosted zone from base infrastructure
    this.hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: props.network.hostedZoneId,
      zoneName: props.network.hostedZoneName
    });

    // Get enrollment hostname from config
    const enrollmentHostname = props.contextConfig.enrollment?.enrollmentHostname || 'enroll';

    // Calculate full domain name
    this.enrollmentFqdn = `${enrollmentHostname}.${props.network.hostedZoneName}`;

    // Create A record alias for Enrollment (IPv4)
    this.enrollmentARecord = new route53.ARecord(this, 'EnrollmentARecord', {
      zone: this.hostedZone,
      recordName: enrollmentHostname,
      target: route53.RecordTarget.fromAlias(
        new targets.LoadBalancerTarget(props.loadBalancer)
      ),
      comment: `Enrollment IPv4 alias record for ${props.environment} environment`
    });

    // Create AAAA record alias for Enrollment (IPv6)
    this.enrollmentAAAARecord = new route53.AaaaRecord(this, 'EnrollmentAAAARecord', {
      zone: this.hostedZone,
      recordName: enrollmentHostname,
      target: route53.RecordTarget.fromAlias(
        new targets.LoadBalancerTarget(props.loadBalancer)
      ),
      comment: `Enrollment IPv6 alias record for ${props.environment} environment`
    });
  }

  /**
   * Get the Enrollment service URL
   */
  public getEnrollmentUrl(): string {
    return `https://${this.enrollmentFqdn}`;
  }
}