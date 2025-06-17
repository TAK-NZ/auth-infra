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
  aws_kms as kms,
  Duration,
  Fn,
  Token,
  Stack
} from 'aws-cdk-lib';
import type { AuthInfraEnvironmentConfig } from '../environment-config';
import type { 
  InfrastructureConfig,
  SecretsConfig, 
  StorageConfig,
  DeploymentConfig,
  AuthentikApplicationConfig 
} from '../construct-configs';

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
   * Infrastructure configuration
   */
  infrastructure: InfrastructureConfig;

  /**
   * Secrets configuration
   */
  secrets: SecretsConfig;

  /**
   * Storage configuration
   */
  storage: StorageConfig;

  /**
   * Deployment configuration
   */
  deployment: DeploymentConfig;

  /**
   * Application configuration
   */
  application: AuthentikApplicationConfig;
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

  constructor(scope: Construct, id: string, props: AuthentikServerProps) {
    super(scope, id);

    // Create the log group
    const logGroup = new logs.LogGroup(this, 'ServerLogs', {
      logGroupName: `${id}-server`,
      retention: props.config.monitoring.logRetentionDays,
      removalPolicy: props.config.general.removalPolicy
    });

    // Create config bucket if using config file
    let configBucket;
    if (props.deployment.useConfigFile) {
      configBucket = new s3.Bucket(this, 'ConfigBucket', {
        bucketName: `${id}-config`.toLowerCase(),
        removalPolicy: props.config.general.removalPolicy,
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
    props.secrets.database.grantRead(executionRole);
    props.secrets.redisAuthToken.grantRead(executionRole);
    props.secrets.authentik.secretKey.grantRead(executionRole);
    props.secrets.authentik.adminUserPassword.grantRead(executionRole);
    props.secrets.authentik.adminUserToken.grantRead(executionRole);

    // Grant explicit KMS permissions for secrets decryption
    props.infrastructure.kmsKey.grantDecrypt(executionRole);

    // Grant S3 access to execution role for environment files (needed during task initialization)
    if (props.storage.s3.envFileKey) {
      props.storage.s3.configBucket.grantRead(executionRole);
    }

    // Create task role
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Add EFS permissions for task role
    taskRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'elasticfilesystem:ClientMount',
        'elasticfilesystem:ClientWrite',
        'elasticfilesystem:ClientRootAccess',
        'elasticfilesystem:DescribeMountTargets',
        'elasticfilesystem:DescribeFileSystems'
      ],
      resources: [
        `arn:aws:elasticfilesystem:${Stack.of(this).region}:${Stack.of(this).account}:file-system/${props.storage.efs.fileSystemId}`,
        `arn:aws:elasticfilesystem:${Stack.of(this).region}:${Stack.of(this).account}:access-point/${props.storage.efs.mediaAccessPointId}`,
        `arn:aws:elasticfilesystem:${Stack.of(this).region}:${Stack.of(this).account}:access-point/${props.storage.efs.customTemplatesAccessPointId}`
      ]
    }));

    // Add task permissions
    if (props.deployment.useConfigFile && configBucket) {
      configBucket.grantRead(taskRole);
    }

    // Grant read access to S3 configuration bucket for environment files
    if (props.storage.s3.envFileKey) {
      props.storage.s3.configBucket.grantRead(taskRole);
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
        fileSystemId: props.storage.efs.fileSystemId,
        transitEncryption: 'ENABLED',
        authorizationConfig: {
          accessPointId: props.storage.efs.mediaAccessPointId,
          iam: 'ENABLED'
        }
      }
    });

    this.taskDefinition.addVolume({
      name: 'custom-templates',
      efsVolumeConfiguration: {
        fileSystemId: props.storage.efs.fileSystemId,
        transitEncryption: 'ENABLED',
        authorizationConfig: {
          accessPointId: props.storage.efs.customTemplatesAccessPointId,
          iam: 'ENABLED'
        }
      }
    });

    // Determine Docker image - ECR repository is required
    if (!props.deployment.ecrRepositoryArn) {
      throw new Error('ecrRepositoryArn is required for Authentik Server deployment');
    }
    
    // Convert ECR ARN to proper repository URI
    const ecrRepositoryUri = this.convertEcrArnToRepositoryUri(props.deployment.ecrRepositoryArn);
    const dockerImage = `${ecrRepositoryUri}:auth-infra-server-${props.deployment.gitSha}`;

    // Prepare container definition options
    let containerDefinitionOptions: ecs.ContainerDefinitionOptions = {
      image: ecs.ContainerImage.fromRegistry(dockerImage),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'authentik-server',
        logGroup
      }),
      command: ['server'], // Server command
      environment: {
        AUTHENTIK_POSTGRESQL__HOST: props.application.database.hostname,
        AUTHENTIK_POSTGRESQL__USER: 'authentik',
        AUTHENTIK_REDIS__HOST: props.application.redis.hostname,
        AUTHENTIK_REDIS__TLS: 'True',
        AUTHENTIK_REDIS__TLS_REQS: 'required',
      },
      secrets: {
        AUTHENTIK_POSTGRESQL__PASSWORD: ecs.Secret.fromSecretsManager(props.secrets.database, 'password'),
        AUTHENTIK_REDIS__PASSWORD: ecs.Secret.fromSecretsManager(props.secrets.redisAuthToken),
        AUTHENTIK_SECRET_KEY: ecs.Secret.fromSecretsManager(props.secrets.authentik.secretKey),
      },
      healthCheck: {
        command: ['CMD', 'ak', 'healthcheck'],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 3,
        startPeriod: Duration.seconds(60)
      },
      essential: true
    };

    // Add environment files if S3 key is provided and useConfigFile is enabled
    if (props.storage.s3.envFileKey && props.deployment.useConfigFile) {
      containerDefinitionOptions = {
        ...containerDefinitionOptions,
        environmentFiles: [
          ecs.EnvironmentFile.fromBucket(props.storage.s3.configBucket, props.storage.s3.envFileKey)
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
      cluster: props.infrastructure.ecsCluster,
      taskDefinition: this.taskDefinition,
      healthCheckGracePeriod: Duration.seconds(300),
      desiredCount: props.config.ecs.desiredCount,
      securityGroups: [props.infrastructure.ecsSecurityGroup],
      enableExecuteCommand: props.deployment.enableExecute,
      assignPublicIp: false,
      // Disable circuit breaker temporarily to get better error information
      // circuitBreaker: { rollback: true }
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
