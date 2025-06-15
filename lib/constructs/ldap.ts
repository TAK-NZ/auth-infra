/**
 * LDAP Construct - CDK implementation of the Authentik LDAP outpost
 */
import { Construct } from 'constructs';
import {
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_elasticloadbalancingv2 as elbv2,
  aws_logs as logs,
  aws_secretsmanager as secretsmanager,
  aws_s3 as s3,
  aws_iam as iam,
  Duration,
  RemovalPolicy,
  CfnOutput
} from 'aws-cdk-lib';

import type { AuthInfraEnvironmentConfig } from '../environment-config';

/**
 * Properties for the LDAP construct
 */
export interface LdapProps {
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
   * Security group for ECS tasks
   */
  ecsSecurityGroup: ec2.SecurityGroup;

  /**
   * ECS cluster
   */
  ecsCluster: ecs.ICluster;

  /**
   * S3 configuration bucket for environment files
   */
  s3ConfBucket: s3.IBucket;

  /**
   * SSL certificate ARN for LDAPS
   */
  sslCertificateArn: string;

  /**
   * Authentik host URL
   */
  authentikHost: string;

  /**
   * ECR repository ARN for ECR images
   */
  ecrRepositoryArn?: string;

  /**
   * Allow SSH exec into container
   */
  enableExecute: boolean;

  /**
   * LDAP token secret from Authentik
   */
  ldapToken: secretsmanager.ISecret;
}

/**
 * CDK construct for the LDAP outpost service
 */
export class Ldap extends Construct {
  /**
   * The network load balancer for the LDAP service
   */
  public readonly loadBalancer: elbv2.NetworkLoadBalancer;

  /**
   * The ECS task definition for the LDAP service
   */
  public readonly taskDefinition: ecs.TaskDefinition;

  /**
   * The ECS service for LDAP
   */
  public readonly ecsService: ecs.FargateService;

  /**
   * DNS name of the load balancer
   */
  public readonly dnsName: string;

  constructor(scope: Construct, id: string, props: LdapProps) {
    super(scope, id);

    // Create the log group
    const logGroup = new logs.LogGroup(this, 'Logs', {
      logGroupName: id,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY
    });

    // Create security group for NLB
    const nlbSecurityGroup = new ec2.SecurityGroup(this, 'NLBSecurityGroup', {
      vpc: props.vpc,
      description: 'Allow 389 and 636 Access to NLB',
      allowAllOutbound: false
    });

    // Allow LDAP traffic
    nlbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4('10.0.0.0/8'),
      ec2.Port.tcp(389),
      'Allow LDAP access'
    );

    nlbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4('10.0.0.0/8'),
      ec2.Port.tcp(636),
      'Allow LDAPS access'
    );

    // Create network load balancer
    this.loadBalancer = new elbv2.NetworkLoadBalancer(this, 'NLB', {
      vpc: props.vpc,
      internetFacing: false,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      }
    });

    // Create listeners for LDAP and LDAPS
    const ldapListener = this.loadBalancer.addListener('LdapListener', {
      port: 389,
      protocol: elbv2.Protocol.TCP
    });

    const ldapsListener = this.loadBalancer.addListener('LdapsListener', {
      port: 636,
      protocol: elbv2.Protocol.TLS,
      certificates: [{ certificateArn: props.sslCertificateArn }]
    });

    // Create task execution role
    const executionRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
      ]
    });

    // Add permissions to access secrets
    props.ldapToken.grantRead(executionRole);

    // Create task role
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Create task definition
    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      cpu: props.config.ecs.taskCpu,
      memoryLimitMiB: props.config.ecs.taskMemory,
      executionRole,
      taskRole
    });

    // Determine Docker image - Always use ECR
    const dockerImage = props.ecrRepositoryArn 
      ? `${props.ecrRepositoryArn}:latest`
      : 'placeholder-for-local-ecr'; // Fallback for backwards compatibility

    // Create container definition
    const container = this.taskDefinition.addContainer('AuthentikLdap', {
      image: ecs.ContainerImage.fromRegistry(dockerImage),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'authentik-ldap',
        logGroup
      }),
      environment: {
        AUTHENTIK_HOST: props.authentikHost,
        AUTHENTIK_INSECURE: 'false'
      },
      secrets: {
        AUTHENTIK_TOKEN: ecs.Secret.fromSecretsManager(props.ldapToken)
      },
      healthCheck: {
        command: ['CMD-SHELL', 'netstat -an | grep ":389 " || exit 1'],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 3,
        startPeriod: Duration.seconds(60)
      },
      essential: true
    });

    // Add port mappings
    container.addPortMappings(
      {
        containerPort: 389,
        hostPort: 389,
        protocol: ecs.Protocol.TCP
      },
      {
        containerPort: 636,
        hostPort: 636,
        protocol: ecs.Protocol.TCP
      }
    );

    // Create ECS service
    this.ecsService = new ecs.FargateService(this, 'Service', {
      cluster: props.ecsCluster,
      taskDefinition: this.taskDefinition,
      desiredCount: props.config.ecs.desiredCount,
      securityGroups: [props.ecsSecurityGroup],
      enableExecuteCommand: props.enableExecute,
      assignPublicIp: false,
      circuitBreaker: { rollback: true }
    });

    // Create target groups for LDAP and LDAPS
    const ldapTargetGroup = new elbv2.NetworkTargetGroup(this, 'LdapTargetGroup', {
      vpc: props.vpc,
      targetType: elbv2.TargetType.IP,
      port: 389,
      protocol: elbv2.Protocol.TCP,
      healthCheck: {
        port: '389',
        protocol: elbv2.Protocol.TCP,
        interval: Duration.seconds(30)
      }
    });

    const ldapsTargetGroup = new elbv2.NetworkTargetGroup(this, 'LdapsTargetGroup', {
      vpc: props.vpc,
      targetType: elbv2.TargetType.IP,
      port: 636,
      protocol: elbv2.Protocol.TCP,
      healthCheck: {
        port: '636',
        protocol: elbv2.Protocol.TCP,
        interval: Duration.seconds(30)
      }
    });

    // Register targets
    ldapTargetGroup.addTarget(this.ecsService);
    ldapsTargetGroup.addTarget(this.ecsService);

    // Add default actions to listeners
    ldapListener.addAction('LdapAction', {
      action: elbv2.NetworkListenerAction.forward([ldapTargetGroup])
    });

    ldapsListener.addAction('LdapsAction', {
      action: elbv2.NetworkListenerAction.forward([ldapsTargetGroup])
    });

    // Store the DNS name for output
    this.dnsName = this.loadBalancer.loadBalancerDnsName;

    // Export outputs
    new CfnOutput(this, 'LoadBalancerDnsName', {
      value: this.dnsName,
      description: 'The DNS name of the LDAP load balancer'
    });

    new CfnOutput(this, 'LdapEndpoint', {
      value: `ldap://${this.dnsName}:389`,
      description: 'The LDAP endpoint URL'
    });

    new CfnOutput(this, 'LdapsEndpoint', {
      value: `ldaps://${this.dnsName}:636`,
      description: 'The LDAPS endpoint URL'  
    });
  }
}
