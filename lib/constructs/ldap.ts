/**
 * LDAP Construct - CDK implementation of the Authentik LDAP outpost
 */
import { Construct } from 'constructs';
import {
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_ecr as ecr,
  aws_ecr_assets as ecrAssets,
  aws_elasticloadbalancingv2 as elbv2,
  aws_logs as logs,
  aws_secretsmanager as secretsmanager,
  aws_s3 as s3,
  aws_iam as iam,
  Duration,
  Fn,
  Token,
  RemovalPolicy
} from 'aws-cdk-lib';

import type { ContextEnvironmentConfig } from '../stack-config';
import type { 
  InfrastructureConfig, 
  StorageConfig, 
  DeploymentConfig, 
  NetworkConfig,
  AuthentikApplicationConfig
} from '../construct-configs';

/**
 * Properties for the LDAP construct
 */
export interface LdapProps {
  /**
   * Environment name (e.g. 'prod', 'dev', etc.)
   */
  environment: 'prod' | 'dev-test';

  /**
   * Environment configuration
   */
  contextConfig: ContextEnvironmentConfig;

  /**
   * Infrastructure configuration (VPC, security groups, ECS cluster, KMS)
   */
  infrastructure: InfrastructureConfig;

  /**
   * Storage configuration (S3 bucket)
   */
  storage: StorageConfig;

  /**
   * Deployment configuration (ECR repository, Git SHA, enable execute)
   */
  deployment: DeploymentConfig;

  /**
   * Network configuration (SSL certificate)
   */
  network: NetworkConfig;

  /**
   * Application configuration (Authentik host)
   */
  application: AuthentikApplicationConfig;

  /**
   * LDAP token secret from Authentik
   */
  ldapToken: secretsmanager.ISecret;

  /**
   * Security group for the Network Load Balancer
   */
  nlbSecurityGroup: ec2.SecurityGroup;

  /**
   * Optional container image URI for pre-built images
   */
  containerImageUri?: string;
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

    // Derive environment-specific values from context (matches reference pattern)
    const isHighAvailability = props.environment === 'prod';
    const removalPolicy = props.contextConfig.general.removalPolicy === 'RETAIN' ? 
      RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;
    const logRetention = isHighAvailability ? 
      logs.RetentionDays.ONE_MONTH : 
      logs.RetentionDays.ONE_WEEK;

    // Create the log group
    const logGroup = new logs.LogGroup(this, 'Logs', {
      logGroupName: id,
      retention: logRetention,
      removalPolicy: removalPolicy
    });

    // Use the provided NLB security group
    const nlbSecurityGroup = props.nlbSecurityGroup;

    // Create network load balancer
    this.loadBalancer = new elbv2.NetworkLoadBalancer(this, 'NLB', {
      loadBalancerName: `tak-${props.contextConfig.stackName.toLowerCase()}-ldap`,
      vpc: props.infrastructure.vpc,
      internetFacing: false,
      ipAddressType: elbv2.IpAddressType.DUAL_STACK,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      },
      securityGroups: [nlbSecurityGroup]
    });

    // Create listeners for LDAP and LDAPS
    const ldapListener = this.loadBalancer.addListener('LdapListener', {
      port: 389,
      protocol: elbv2.Protocol.TCP
    });

    const ldapsListener = this.loadBalancer.addListener('LdapsListener', {
      port: 636,
      protocol: elbv2.Protocol.TLS,
      certificates: [{ certificateArn: props.network.sslCertificateArn }]
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
    props.infrastructure.kmsKey.grantDecrypt(executionRole);

    // Create task role
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Add ECS Exec and logging permissions to task role
    taskRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ssmmessages:CreateControlChannel',
        'ssmmessages:CreateDataChannel',
        'ssmmessages:OpenControlChannel',
        'ssmmessages:OpenDataChannel'
      ],
      resources: ['*']
    }));

    taskRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogStream',
        'logs:DescribeLogStreams',
        'logs:PutLogEvents',
        'logs:DescribeLogGroups'
      ],
      resources: ['*']
    }));

    // Create task definition
    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      family: 'TAK-Demo-AuthInfra-LDAPService',
      cpu: props.contextConfig.ecs.taskCpu,
      memoryLimitMiB: props.contextConfig.ecs.taskMemory,
      executionRole,
      taskRole
    });



    // Use container image with fallback strategy
    let containerImage: ecs.ContainerImage;
    
    if (props.containerImageUri) {
      // Use pre-built image from registry
      containerImage = ecs.ContainerImage.fromRegistry(props.containerImageUri);
    } else {
      // Fall back to building Docker image asset
      const dockerImageAsset = new ecrAssets.DockerImageAsset(this, 'LdapDockerAsset', {
        directory: './docker/authentik-ldap',
        buildArgs: {
          AUTHENTIK_VERSION: props.contextConfig.authentik.authentikVersion
        }
      });
      containerImage = ecs.ContainerImage.fromDockerImageAsset(dockerImageAsset);
    }

    // Create container definition
    const container = this.taskDefinition.addContainer('AuthentikLdap', {
      image: containerImage,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'authentik-ldap',
        logGroup
      }),
      environment: {
        AUTHENTIK_HOST: props.application.authentikHost || '',
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
      cluster: props.infrastructure.ecsCluster,
      taskDefinition: this.taskDefinition,
      desiredCount: props.contextConfig.ecs.desiredCount,
      securityGroups: [props.infrastructure.ecsSecurityGroup],
      enableExecuteCommand: props.deployment.enableExecute,
      assignPublicIp: false,
      // Configure deployment to maintain availability
      minHealthyPercent: isHighAvailability ? 100 : 50,
      maxHealthyPercent: 200,
      circuitBreaker: { rollback: true }
    });

    // Create target groups for LDAP and LDAPS
    const ldapTargetGroup = new elbv2.NetworkTargetGroup(this, 'LdapTargetGroup', {
      targetGroupName: `tak-${props.contextConfig.stackName.toLowerCase()}-ldap`,
      vpc: props.infrastructure.vpc,
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
      targetGroupName: `tak-${props.contextConfig.stackName.toLowerCase()}-ldaps`,
      vpc: props.infrastructure.vpc,
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
  }
}
