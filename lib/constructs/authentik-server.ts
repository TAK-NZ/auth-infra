/**
 * Authentik Server Construct - Server container and ECS service configuration
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
  RemovalPolicy
} from 'aws-cdk-lib';
import type { AuthInfraEnvironmentConfig } from '../environment-config';

/**
 * Properties for the Authentik Server construct
 */
export interface AuthentikServerProps {
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
   * S3 URI for the environment file (optional)
   */
  envFileS3Uri?: string;

  /**
   * S3 key for the environment file (optional)
   */
  envFileS3Key?: string;

  /**
   * Authentik admin user email
   */
  adminUserEmail: string;

  /**
   * LDAP base DN
   */
  ldapBaseDn: string;

  /**
   * Use authentik config file from S3 (default: false)
   */
  useAuthentikConfigFile: boolean;

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
   * Database secret
   */
  dbSecret: secretsmanager.ISecret;

  /**
   * Database hostname
   */
  dbHostname: string;

  /**
   * Redis auth token
   */
  redisAuthToken: secretsmanager.ISecret;

  /**
   * Redis hostname
   */
  redisHostname: string;

  /**
   * Authentik secret key
   */
  secretKey: secretsmanager.ISecret;

  /**
   * Admin user password
   */
  adminUserPassword: secretsmanager.ISecret;

  /**
   * Admin user token
   */
  adminUserToken: secretsmanager.ISecret;

  /**
   * LDAP token
   */
  ldapToken: secretsmanager.ISecret;

  /**
   * EFS file system ID
   */
  efsId: string;

  /**
   * EFS media access point ID
   */
  efsMediaAccessPointId: string;

  /**
   * EFS custom templates access point ID
   */
  efsCustomTemplatesAccessPointId: string;
}

/**
 * CDK construct for the Authentik server container and ECS service
 */
export class AuthentikServer extends Construct {
  /**
   * The ECS task definition for the Authentik server
   */
  public readonly taskDefinition: ecs.TaskDefinition;

  /**
   * The ECS service for Authentik server
   */
  public readonly ecsService: ecs.FargateService;

  constructor(scope: Construct, id: string, props: AuthentikServerProps) {
    super(scope, id);

    // Create the log group
    const logGroup = new logs.LogGroup(this, 'ServerLogs', {
      logGroupName: `${id}-server`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY
    });

    // Create config bucket if using config file
    let configBucket;
    if (props.useAuthentikConfigFile) {
      configBucket = new s3.Bucket(this, 'ConfigBucket', {
        bucketName: `${id}-config`.toLowerCase(),
        removalPolicy: RemovalPolicy.RETAIN,
        encryption: s3.BucketEncryption.S3_MANAGED,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL
      });
    }

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
    if (props.useAuthentikConfigFile && configBucket) {
      configBucket.grantRead(taskRole);
    }

    // Grant read access to S3 configuration bucket for environment files
    if (props.envFileS3Key) {
      props.s3ConfBucket.grantRead(taskRole);
    }

    // Create task definition
    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      cpu: props.config.ecs.taskCpu,
      memoryLimitMiB: props.config.ecs.taskMemory,
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

    // Determine Docker image - Always use ECR
    const dockerImage = props.ecrRepositoryArn 
      ? `${props.ecrRepositoryArn}:auth-infra-server-${props.gitSha}`
      : 'placeholder-for-local-ecr'; // Fallback for backwards compatibility

    // Prepare container definition options
    let containerDefinitionOptions: ecs.ContainerDefinitionOptions = {
      image: ecs.ContainerImage.fromRegistry(dockerImage),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'authentik-server',
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
    };

    // Add environment files if S3 key is provided and useAuthentikConfigFile is enabled
    if (props.envFileS3Key && props.useAuthentikConfigFile) {
      containerDefinitionOptions = {
        ...containerDefinitionOptions,
        environmentFiles: [
          ecs.EnvironmentFile.fromBucket(props.s3ConfBucket, props.envFileS3Key)
        ]
      };
    }

    const container = this.taskDefinition.addContainer('AuthentikServer', containerDefinitionOptions);

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
      desiredCount: props.config.ecs.desiredCount,
      securityGroups: [props.ecsSecurityGroup],
      enableExecuteCommand: props.enableExecute,
      assignPublicIp: false,
      circuitBreaker: { rollback: true }
    });

    // Add auto scaling
    const scaling = this.ecsService.autoScaleTaskCount({
      minCapacity: props.config.ecs.minCapacity,
      maxCapacity: props.config.ecs.maxCapacity
    });

    // Scale based on CPU utilization
    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: Duration.minutes(3),
      scaleOutCooldown: Duration.minutes(1)
    });
  }

  /**
   * Create and register a target group for this service
   */
  public createTargetGroup(vpc: ec2.IVpc, listener: elbv2.ApplicationListener): elbv2.ApplicationTargetGroup {
    // Create target group for the Authentik service
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      vpc: vpc,
      targetType: elbv2.TargetType.IP,
      port: 9000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      healthCheck: {
        path: '/-/health/live/',
        interval: Duration.seconds(30),
        healthyHttpCodes: '200-299'
      }
    });

    // Register targets
    targetGroup.addTarget(this.ecsService);

    // Add default action to the HTTPS listener
    listener.addAction('DefaultAction', {
      action: elbv2.ListenerAction.forward([targetGroup])
    });

    return targetGroup;
  }
}
