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
  aws_kms as kms,
  Duration,
  CfnOutput,
  Fn,
  Token
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
   * Git SHA for Docker image tagging
   */
  gitSha: string;

  /**
   * Allow SSH exec into container
   */
  enableExecute: boolean;

  /**
   * LDAP token secret from Authentik
   */
  ldapToken: secretsmanager.ISecret;

  /**
   * KMS key for secrets encryption
   */
  kmsKey: kms.IKey;
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

  /**
   * Converts an ECR repository ARN to a proper ECR repository URI for Docker images
   * @param ecrArn - ECR repository ARN (e.g., "arn:aws:ecr:region:account:repository/repo-name")
   * @returns ECR repository URI (e.g., "account.dkr.ecr.region.amazonaws.com/repo-name")
   */
  private convertEcrArnToRepositoryUri(ecrArn: string): string {
    // Handle CDK tokens (unresolved references)
    if (Token.isUnresolved(ecrArn)) {
      // For tokens, we need to use CDK's Fn.sub to perform the conversion at deploy time
      return Fn.sub('${Account}.dkr.ecr.${Region}.amazonaws.com/${RepoName}', {
        Account: Fn.select(4, Fn.split(':', ecrArn)),
        Region: Fn.select(3, Fn.split(':', ecrArn)),
        RepoName: Fn.select(1, Fn.split('/', Fn.select(5, Fn.split(':', ecrArn))))
      });
    }
    
    // Parse ARN: arn:aws:ecr:region:account:repository/repo-name
    const arnParts = ecrArn.split(':');
    if (arnParts.length !== 6 || !arnParts[5].startsWith('repository/')) {
      throw new Error(`Invalid ECR repository ARN format: ${ecrArn}`);
    }
    
    const region = arnParts[3];
    const account = arnParts[4];
    const repositoryName = arnParts[5].replace('repository/', '');
    
    return `${account}.dkr.ecr.${region}.amazonaws.com/${repositoryName}`;
  }

  constructor(scope: Construct, id: string, props: LdapProps) {
    super(scope, id);

    // Create the log group
    const logGroup = new logs.LogGroup(this, 'Logs', {
      logGroupName: id,
      retention: props.config.monitoring.logRetentionDays,
      removalPolicy: props.config.general.removalPolicy
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

    // Grant explicit KMS permissions for secrets decryption
    props.kmsKey.grantDecrypt(executionRole);

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

    // Determine Docker image - ECR repository is required
    if (!props.ecrRepositoryArn) {
      throw new Error('ecrRepositoryArn is required for Authentik LDAP deployment');
    }
    
    // Convert ECR ARN to proper repository URI  
    const ecrRepositoryUri = this.convertEcrArnToRepositoryUri(props.ecrRepositoryArn);
    const dockerImage = `${ecrRepositoryUri}:auth-infra-ldap-${props.gitSha}`;

    // Create container definition
    const container = this.taskDefinition.addContainer('AuthentikLdap', {
      image: ecs.ContainerImage.fromRegistry(dockerImage),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'authentik-ldap',
        logGroup
      }),
      environment: {
        AUTHENTIK_HOST: `https://${props.authentikHost}/`,
        AUTHENTIK_INSECURE: 'false'
      },
      secrets: {
        AUTHENTIK_TOKEN: ecs.Secret.fromSecretsManager(props.ldapToken)
      },
      essential: true
    });

    // Add port mappings
    container.addPortMappings(
      {
        containerPort: 3389,
        hostPort: 3389,
        protocol: ecs.Protocol.TCP
      },
      {
        containerPort: 6636,
        hostPort: 6636,
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
      port: 3389,
      protocol: elbv2.Protocol.TCP,
      healthCheck: {
        port: '3389',
        protocol: elbv2.Protocol.TCP,
        interval: Duration.seconds(30)
      }
    });

    const ldapsTargetGroup = new elbv2.NetworkTargetGroup(this, 'LdapsTargetGroup', {
      vpc: props.vpc,
      targetType: elbv2.TargetType.IP,
      port: 6636,
      protocol: elbv2.Protocol.TCP,
      healthCheck: {
        port: '6636',
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
