/**
 * ELB Construct - Load balancer and networking for Authentik
 */
import { Construct } from 'constructs';
import {
  aws_ec2 as ec2,
  aws_elasticloadbalancingv2 as elbv2,
  Duration,
  CfnOutput
} from 'aws-cdk-lib';
import type { AuthInfraEnvironmentConfig } from '../environment-config';

/**
 * Properties for the ELB construct
 */
export interface ElbProps {
  /**
   * Environment name (e.g. 'prod', 'dev', etc.)
   */
  environment: string;

  /**
   * Environment configuration
   */
  config: AuthInfraEnvironmentConfig;

  /**
   * VPC for deployment
   */
  vpc: ec2.IVpc;

  /**
   * SSL certificate ARN for HTTPS
   */
  sslCertificateArn: string;
}

/**
 * CDK construct for the Application Load Balancer
 */
export class Elb extends Construct {
  /**
   * The application load balancer
   */
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;

  /**
   * The HTTPS listener
   */
  public readonly httpsListener: elbv2.ApplicationListener;

  /**
   * DNS name of the load balancer
   */
  public readonly dnsName: string;

  constructor(scope: Construct, id: string, props: ElbProps) {
    super(scope, id);

    // Create load balancer with dualstack IP addressing
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc: props.vpc,
      internetFacing: true,
      ipAddressType: elbv2.IpAddressType.DUAL_STACK
    });

    // Create HTTP listener and redirect to HTTPS
    const httpListener = this.loadBalancer.addListener('HttpListener', {
      port: 80,
      open: true
    });
    httpListener.addAction('HttpRedirect', {
      action: elbv2.ListenerAction.redirect({
        port: '443',
        protocol: 'HTTPS'
      })
    });

    // Create HTTPS listener
    this.httpsListener = this.loadBalancer.addListener('HttpsListener', {
      port: 443,
      certificates: [{ certificateArn: props.sslCertificateArn }],
      open: true
    });

    // Store the DNS name
    this.dnsName = this.loadBalancer.loadBalancerDnsName;

    // Export outputs
    new CfnOutput(this, 'LoadBalancerDnsName', {
      value: this.dnsName,
      description: 'The DNS name of the load balancer'
    });

    new CfnOutput(this, 'AuthentikURL', {
      value: `https://${this.dnsName}/`,
      description: 'The URL of the Authentik service'
    });
  }

  /**
   * Create a target group for Authentik services
   */
  public createTargetGroup(id: string, port: number, vpc: ec2.IVpc, healthCheckPath: string = '/healthz/'): elbv2.ApplicationTargetGroup {
    return new elbv2.ApplicationTargetGroup(this, id, {
      vpc: vpc,
      targetType: elbv2.TargetType.IP,
      port: port,
      protocol: elbv2.ApplicationProtocol.HTTP,
      healthCheck: {
        path: healthCheckPath,
        interval: Duration.seconds(30),
        healthyHttpCodes: '200-299'
      }
    });
  }

  /**
   * Add a target group to the HTTPS listener
   */
  public addTargetGroup(id: string, targetGroup: elbv2.ApplicationTargetGroup, priority?: number): void {
    this.httpsListener.addAction(id, {
      action: elbv2.ListenerAction.forward([targetGroup]),
      priority: priority
    });
  }
}
