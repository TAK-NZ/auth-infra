/**
 * Authentik Construct - CDK implementation of the Authentik service
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
import type { BaseConfig } from '../environment-config';

/**
 * Properties for the Authentik construct
 */
export interface AuthentikProps {
  /**
   * Environment name (e.g. 'prod', 'dev', etc.)
   */
  environment: string;

  /**
   * Environment configuration
   */
  config: BaseConfig;

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
  ecsCluster: ecs.Cluster;

  /**
   * SSL certificate ARN for HTTPS
   */
  sslCertificateArn: string;

  /**
   * Authentik admin user email
   */
  adminUserEmail: string;

  /**
   * LDAP base DN
   */
  ldapBaseDn: string;

  /**
   * Whether to use authentik-config.env file
   */
  useConfigFile: boolean;

  /**
   * IP address type for load balancers
   */
  ipAddressType: 'ipv4' | 'dualstack';

  /**
   * Docker image location (Github or Local ECR)
   */
  dockerImageLocation: 'Github' | 'Local ECR';

  /**
   * Allow SSH exec into container
   */
  enableExecute: boolean;

  /**
   * Database credentials secret
   */
  dbSecret: secretsmanager.Secret;

  /**
   * Database hostname
   */
  dbHostname: string;

  /**
   * Redis auth token secret
   */
  redisAuthToken: secretsmanager.Secret;

  /**
   * Redis hostname
   */
  redisHostname: string;

  /**
   * Authentik secret key
   */
  secretKey: secretsmanager.Secret;

  /**
   * Admin user password secret
   */
  adminUserPassword: secretsmanager.Secret;

  /**
   * Admin user token secret
   */
  adminUserToken: secretsmanager.Secret;

  /**
   * LDAP token secret
   */
  ldapToken: secretsmanager.Secret;

  /**
   * EFS filesystem ID
   */
  efsId: string;

  /**
   * EFS access point ID for media
   */
  efsMediaAccessPointId: string;

  /**
   * EFS access point ID for custom templates
   */
  efsCustomTemplatesAccessPointId: string;
}

/**
 * CDK construct for the Authentik service
 */
export class Authentik extends Construct {
  /**
   * The load balancer for the Authentik service
   */
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;

  /**
   * The ECS task definition for the Authentik service
   */
  public readonly taskDefinition: ecs.TaskDefinition;

  /**
   * The ECS service for Authentik
   */
  public readonly ecsService: ecs.FargateService;

  /**
   * DNS name of the load balancer
   */
  public readonly dnsName: string;

  constructor(scope: Construct, id: string, props: AuthentikProps) {
    super(scope, id);

    // Create the log group
    const logGroup = new logs.LogGroup(this, 'Logs', {
      logGroupName: id,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY
    });

    // Create config bucket if using config file
    let configBucket;
    if (props.useConfigFile) {
      configBucket = new s3.Bucket(this, 'ConfigBucket', {
        bucketName: `${id}-config`.toLowerCase(),
        removalPolicy: RemovalPolicy.RETAIN,
        encryption: s3.BucketEncryption.S3_MANAGED,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL
      });
    }

    // Create load balancer
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc: props.vpc,
      internetFacing: true,
      ipAddressType: props.ipAddressType === 'ipv4' ? 
        elbv2.IpAddressType.IPV4 : 
        elbv2.IpAddressType.DUAL_STACK
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
    const httpsListener = this.loadBalancer.addListener('HttpsListener', {
      port: 443,
      certificates: [{ certificateArn: props.sslCertificateArn }],
      open: true
    });

    // Create task execution role
    const executionRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
      ]
    });

    // Add permissions to access secrets
    props.dbSecret.grantRead(executionRole);
    props.redisAuthToken.grantRead(executionRole);
    props.secretKey.grantRead(executionRole);
    props.adminUserPassword.grantRead(executionRole);
    props.adminUserToken.grantRead(executionRole);

    // Create task role
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Add task permissions
    if (props.useConfigFile && configBucket) {
      configBucket.grantRead(taskRole);
    }

    // Create task definition
    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      cpu: props.config.ecsTaskCpu,
      memoryLimitMiB: props.config.ecsTaskMemory,
      executionRole,
      taskRole
    });

    // Add volumes for EFS
    this.taskDefinition.addVolume({
      name: 'media',
      efsVolumeConfiguration: {
        fileSystemId: props.efsId,
        transitEncryption: 'ENABLED',
        authorizationConfig: {
          accessPointId: props.efsMediaAccessPointId,
          iam: 'ENABLED'
        }
      }
    });

    this.taskDefinition.addVolume({
      name: 'custom-templates',
      efsVolumeConfiguration: {
        fileSystemId: props.efsId,
        transitEncryption: 'ENABLED',
        authorizationConfig: {
          accessPointId: props.efsCustomTemplatesAccessPointId,
          iam: 'ENABLED'
        }
      }
    });

    // Determine Docker image
    const dockerImage = props.dockerImageLocation === 'Github' 
      ? 'ghcr.io/tak-nz/authentik-server:latest'
      : 'placeholder-for-local-ecr'; // Replace with actual ECR URL in production

    // Create container definition
    const container = this.taskDefinition.addContainer('AuthentikServer', {
      image: ecs.ContainerImage.fromRegistry(dockerImage),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'authentik',
        logGroup
      }),
      environment: {
        AUTHENTIK_REDIS__HOST: props.redisHostname,
        AUTHENTIK_POSTGRESQL__HOST: props.dbHostname,
        AUTHENTIK_POSTGRESQL__NAME: 'authentik',
        AUTHENTIK_POSTGRESQL__USER: 'authentik',
        AUTHENTIK_BOOTSTRAP_EMAIL: props.adminUserEmail,
        AUTHENTIK_BOOTSTRAP_FLOW_AUTHENTICATION: 'default-authentication-flow',
        AUTHENTIK_BOOTSTRAP_FLOW_AUTHORIZATION: 'default-provider-authorization-explicit-consent',
        AUTHENTIK_BOOTSTRAP_FLOW_ENROLLMENT: 'default-enrollment-flow',
        AUTHENTIK_BOOTSTRAP_FLOW_INVALIDATION: 'default-invalidation-flow',
        AUTHENTIK_BOOTSTRAP_FLOW_RECOVERY: 'default-recovery-flow',
        AUTHENTIK_BOOTSTRAP_FLOW_UNENROLLMENT: 'default-unenrollment-flow',
        AUTHENTIK_BOOTSTRAP_TOKEN: props.adminUserToken.secretValueFromJson('SecretString').toString(),
        AUTHENTIK_LDAP__BIND_DN_TEMPLATE: props.ldapBaseDn
      },
      secrets: {
        AUTHENTIK_POSTGRESQL__PASSWORD: ecs.Secret.fromSecretsManager(props.dbSecret, 'password'),
        AUTHENTIK_REDIS__PASSWORD: ecs.Secret.fromSecretsManager(props.redisAuthToken),
        AUTHENTIK_SECRET_KEY: ecs.Secret.fromSecretsManager(props.secretKey),
        AUTHENTIK_BOOTSTRAP_PASSWORD: ecs.Secret.fromSecretsManager(props.adminUserPassword, 'password')
      },
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:9000/healthz/ || exit 1'],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 3,
        startPeriod: Duration.seconds(60)
      },
      essential: true
    });

    // Add port mappings
    container.addPortMappings({
      containerPort: 9000,
      hostPort: 9000,
      protocol: ecs.Protocol.TCP
    });

    // Add mount points for EFS volumes
    container.addMountPoints({
      containerPath: '/media',
      sourceVolume: 'media',
      readOnly: false
    });

    container.addMountPoints({
      containerPath: '/templates',
      sourceVolume: 'custom-templates',
      readOnly: false
    });

    // Create ECS service
    this.ecsService = new ecs.FargateService(this, 'Service', {
      cluster: props.ecsCluster,
      taskDefinition: this.taskDefinition,
      desiredCount: props.config.ecsTaskDesiredCount,
      securityGroups: [props.ecsSecurityGroup],
      enableExecuteCommand: props.enableExecute,
      assignPublicIp: false,
      circuitBreaker: { rollback: true }
    });

    // Add auto scaling
    const scaling = this.ecsService.autoScaleTaskCount({
      minCapacity: props.config.minCapacity,
      maxCapacity: props.config.maxCapacity
    });

    // Scale based on CPU utilization
    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: Duration.minutes(3),
      scaleOutCooldown: Duration.minutes(1)
    });

    // Create target group for the Authentik service
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      vpc: props.vpc,
      targetType: elbv2.TargetType.IP,
      port: 9000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      healthCheck: {
        path: '/healthz/',
        interval: Duration.seconds(30),
        healthyHttpCodes: '200-299'
      }
    });

    // Register targets
    targetGroup.addTarget(this.ecsService);

    // Add default action to the HTTPS listener
    httpsListener.addAction('DefaultAction', {
      action: elbv2.ListenerAction.forward([targetGroup])
    });

    // Store the DNS name for output
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
}
