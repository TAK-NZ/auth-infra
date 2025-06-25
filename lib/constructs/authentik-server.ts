/**
 * Authentik Server Construct - Server container and ECS service configuration
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
  aws_kms as kms,
  Duration,
  Fn,
  Token,
  Stack,
  RemovalPolicy
} from 'aws-cdk-lib';
import type { ContextEnvironmentConfig } from '../stack-config';
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
   * Environment type ('prod' | 'dev-test')
   */
  environment: 'prod' | 'dev-test';

  /**
   * Context-based environment configuration (direct from cdk.json)
   */
  contextConfig: ContextEnvironmentConfig;

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

  /**
   * Optional shared Docker image asset (to prevent rebuilds)
   */
  dockerImageAsset?: ecrAssets.DockerImageAsset;
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

    // Derive environment-specific values from context (matches reference pattern)
    const isHighAvailability = props.environment === 'prod';
    const removalPolicy = props.contextConfig.general.removalPolicy === 'RETAIN' ? 
      RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;
    const logRetentionDays = isHighAvailability ? 30 : 7;

    // Create the log group
    const logGroup = new logs.LogGroup(this, 'ServerLogs', {
      logGroupName: `${id}-server`,
      retention: logRetentionDays,
      removalPolicy: RemovalPolicy.DESTROY
    });

    // Create config bucket if using config file
    let configBucket;
    if (props.deployment.useConfigFile) {
      configBucket = new s3.Bucket(this, 'ConfigBucket', {
        bucketName: `${id}-config`.toLowerCase(),
        removalPolicy: removalPolicy,
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
      cpu: props.contextConfig.ecs.taskCpu,
      memoryLimitMiB: props.contextConfig.ecs.taskMemory,
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



    // Use shared Docker image asset if provided, otherwise create new one
    const dockerImageAsset = props.dockerImageAsset || (() => {
      const dockerfileName = `Dockerfile.${props.contextConfig.authentik.branding}`;
      return new ecrAssets.DockerImageAsset(this, 'ServerDockerAsset', {
        directory: '.',
        file: `docker/authentik-server/${dockerfileName}`,
        buildArgs: {
          AUTHENTIK_VERSION: props.contextConfig.authentik.authentikVersion
        },
        // Exclude files that change frequently but don't affect the Docker build
        exclude: [
          'node_modules/**',
          'cdk.out/**',
          '.cdk.staging/**',
          '**/*.log',
          '**/*.tmp',
          '.git/**',
          '.vscode/**',
          '.idea/**',
          'test/**',
          'docs/**',
          'lib/**/*.js',
          'lib/**/*.d.ts',
          'lib/**/*.js.map',
          'bin/**/*.js',
          'bin/**/*.d.ts',
          '**/.DS_Store',
          '**/Thumbs.db'
        ]
      });
    })();

    const containerImage = ecs.ContainerImage.fromDockerImageAsset(dockerImageAsset);

    // Prepare container definition options
    let containerDefinitionOptions: ecs.ContainerDefinitionOptions = {
      image: containerImage,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'authentik-server',
        logGroup
      }),
      command: ['server'], // Server command
      environment: {
        AUTHENTIK_POSTGRESQL__HOST: props.application.database.hostname,
        ...(props.application.database.readReplicaHostname && {
          AUTHENTIK_POSTGRESQL__READ_REPLICAS__0__HOST: props.application.database.readReplicaHostname,
          AUTHENTIK_POSTGRESQL__READ_REPLICAS__0__NAME: 'authentik',
          AUTHENTIK_POSTGRESQL__READ_REPLICAS__0__PORT: '5432',
        }),
        AUTHENTIK_REDIS__HOST: props.application.redis.hostname,
        AUTHENTIK_REDIS__TLS: 'True',
        AUTHENTIK_REDIS__TLS_REQS: 'required',
      },
      secrets: {
        AUTHENTIK_POSTGRESQL__USER: ecs.Secret.fromSecretsManager(props.secrets.database, 'username'),
        AUTHENTIK_POSTGRESQL__PASSWORD: ecs.Secret.fromSecretsManager(props.secrets.database, 'password'),
        ...(props.application.database.readReplicaHostname && {
          AUTHENTIK_POSTGRESQL__READ_REPLICAS__0__USER: ecs.Secret.fromSecretsManager(props.secrets.database, 'username'),
          AUTHENTIK_POSTGRESQL__READ_REPLICAS__0__PASSWORD: ecs.Secret.fromSecretsManager(props.secrets.database, 'password'),
        }),
        AUTHENTIK_REDIS__PASSWORD: ecs.Secret.fromSecretsManager(props.secrets.redisAuthToken),
        AUTHENTIK_SECRET_KEY: ecs.Secret.fromSecretsManager(props.secrets.authentik.secretKey),
      },
      healthCheck: {
        command: ['CMD', 'ak', 'healthcheck'],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(30),
        retries: 3,
        startPeriod: Duration.seconds(180)
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
      containerPort: 9443,
      hostPort: 9443,
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
      desiredCount: props.contextConfig.ecs.desiredCount,
      securityGroups: [props.infrastructure.ecsSecurityGroup],
      enableExecuteCommand: props.deployment.enableExecute,
      assignPublicIp: false,
      // Configure deployment to maintain availability
      minHealthyPercent: isHighAvailability ? 100 : 50,
      maxHealthyPercent: 200,
      circuitBreaker: { rollback: true }
    });

    // Add auto scaling
    const scaling = this.ecsService.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: isHighAvailability ? 10 : 3
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
      port: 9443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      healthCheck: {
        path: '/-/health/ready/',
        protocol: elbv2.Protocol.HTTPS,
        port: '9443',
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
