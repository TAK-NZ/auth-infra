/**
 * Authentik Worker Construct - Worker container configuration for background tasks
 */
import { Construct } from 'constructs';
import {
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_logs as logs,
  aws_secretsmanager as secretsmanager,
  aws_s3 as s3,
  aws_iam as iam,
  Duration,
  RemovalPolicy
} from 'aws-cdk-lib';
import type { AuthInfraEnvironmentConfig } from '../environment-config';

/**
 * Properties for the Authentik Worker construct
 */
export interface AuthentikWorkerProps {
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
   * S3 key for the environment file (optional)
   */
  envFileS3Key?: string;

  /**
   * Use environment file from S3 (default: false)
   */
  useEnvironmentFile: boolean;

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
 * CDK construct for the Authentik worker container
 */
export class AuthentikWorker extends Construct {
  /**
   * The ECS task definition for the Authentik worker
   */
  public readonly taskDefinition: ecs.TaskDefinition;

  /**
   * The ECS service for Authentik worker
   */
  public readonly ecsService: ecs.FargateService;

  constructor(scope: Construct, id: string, props: AuthentikWorkerProps) {
    super(scope, id);

    // Create the log group for workers
    const logGroup = new logs.LogGroup(this, 'WorkerLogs', {
      logGroupName: `${id}-worker`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY
    });

    // Create task execution role
    const executionRole = new iam.Role(this, 'WorkerTaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
      ]
    });

    // Add permissions to access secrets
    props.dbSecret.grantRead(executionRole);
    props.redisAuthToken.grantRead(executionRole);
    props.secretKey.grantRead(executionRole);

    // Create task role
    const taskRole = new iam.Role(this, 'WorkerTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Grant read access to S3 configuration bucket for environment files
    if (props.envFileS3Key) {
      props.s3ConfBucket.grantRead(taskRole);
    }

    // Create task definition
    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'WorkerTaskDef', {
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

    // Determine Docker image - Always use ECR (workers use the same image as server)
    const dockerImage = props.ecrRepositoryArn 
      ? `${props.ecrRepositoryArn}:auth-infra-server-${props.gitSha}`
      : 'placeholder-for-local-ecr'; // Fallback for backwards compatibility

    // Prepare container definition options for worker
    let containerDefinitionOptions: ecs.ContainerDefinitionOptions = {
      image: ecs.ContainerImage.fromRegistry(dockerImage),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'authentik-worker',
        logGroup
      }),
      command: ['ak', 'worker'], // Worker command
      environment: {
        AUTHENTIK_REDIS__HOST: props.redisHostname,
        AUTHENTIK_POSTGRESQL__HOST: props.dbHostname,
        AUTHENTIK_POSTGRESQL__NAME: 'authentik',
        AUTHENTIK_POSTGRESQL__USER: 'authentik',
      },
      secrets: {
        AUTHENTIK_POSTGRESQL__PASSWORD: ecs.Secret.fromSecretsManager(props.dbSecret, 'password'),
        AUTHENTIK_REDIS__PASSWORD: ecs.Secret.fromSecretsManager(props.redisAuthToken),
        AUTHENTIK_SECRET_KEY: ecs.Secret.fromSecretsManager(props.secretKey),
      },
      essential: true
    };

    // Add environment files if S3 key is provided and useEnvironmentFile is enabled
    if (props.envFileS3Key && props.useEnvironmentFile) {
      containerDefinitionOptions = {
        ...containerDefinitionOptions,
        environmentFiles: [
          ecs.EnvironmentFile.fromBucket(props.s3ConfBucket, props.envFileS3Key)
        ]
      };
    }

    const container = this.taskDefinition.addContainer('AuthentikWorker', containerDefinitionOptions);

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

    // Create ECS service for worker
    this.ecsService = new ecs.FargateService(this, 'WorkerService', {
      cluster: props.ecsCluster,
      taskDefinition: this.taskDefinition,
      desiredCount: props.config.ecs.workerDesiredCount || 1, // Default to 1 worker
      securityGroups: [props.ecsSecurityGroup],
      enableExecuteCommand: props.enableExecute,
      assignPublicIp: false,
      circuitBreaker: { rollback: true }
    });

    // Add auto scaling for workers
    const scaling = this.ecsService.autoScaleTaskCount({
      minCapacity: props.config.ecs.workerMinCapacity || 1,
      maxCapacity: props.config.ecs.workerMaxCapacity || 3
    });

    // Scale based on CPU utilization (workers may have different scaling patterns)
    scaling.scaleOnCpuUtilization('WorkerCpuScaling', {
      targetUtilizationPercent: 80, // Higher threshold for workers
      scaleInCooldown: Duration.minutes(5),
      scaleOutCooldown: Duration.minutes(2)
    });
  }
}
