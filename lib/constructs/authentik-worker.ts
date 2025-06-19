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
 * Properties for the Authentik Worker construct
 */
export interface AuthentikWorkerProps {
  /**
   * Environment type ('prod' | 'dev-test')
   */
  environment: 'prod' | 'dev-test';

  /**
   * Context-based environment configuration (direct from cdk.json)
   */
  contextConfig: ContextEnvironmentConfig;

  /**
   * Infrastructure configuration (VPC, ECS, security groups)
   */
  infrastructure: InfrastructureConfig;

  /**
   * Secrets configuration (database, Redis, Authentik secrets)
   */
  secrets: SecretsConfig;

  /**
   * Storage configuration (S3, EFS)
   */
  storage: StorageConfig;

  /**
   * Deployment configuration (ECR, Git SHA, execution settings)
   */
  deployment: DeploymentConfig;

  /**
   * Authentik application configuration (admin settings, LDAP, host URL)
   */
  application: AuthentikApplicationConfig;
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

  constructor(scope: Construct, id: string, props: AuthentikWorkerProps) {
    super(scope, id);

    // Derive environment-specific values from context (matches reference pattern)
    const isHighAvailability = props.environment === 'prod';
    const removalPolicy = props.contextConfig.general.removalPolicy === 'RETAIN' ? 
      RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;
    const logRetentionDays = isHighAvailability ? 30 : 7;

    // Create the log group for workers
    const logGroup = new logs.LogGroup(this, 'WorkerLogs', {
      logGroupName: `${id}-worker`,
      retention: logRetentionDays,
      removalPolicy: removalPolicy
    });

    // Create task execution role
    const executionRole = new iam.Role(this, 'WorkerTaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
      ]
    });

    // Add permissions to access secrets
    props.secrets.database.grantRead(executionRole);
    props.secrets.redisAuthToken.grantRead(executionRole);
    props.secrets.authentik.secretKey.grantRead(executionRole);
    if (props.secrets.authentik.ldapServiceUser) {
      props.secrets.authentik.ldapServiceUser.grantRead(executionRole);
    }
    props.secrets.authentik.adminUserPassword.grantRead(executionRole);
    props.secrets.authentik.adminUserToken.grantRead(executionRole);

    // Grant explicit KMS permissions for secrets decryption
    props.infrastructure.kmsKey.grantDecrypt(executionRole);

    // Grant S3 access to execution role for environment files (needed during task initialization)
    if (props.storage.s3.envFileKey) {
      props.storage.s3.configBucket.grantRead(executionRole);
    }

    // Create task role
    const taskRole = new iam.Role(this, 'WorkerTaskRole', {
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

    // Grant read access to S3 configuration bucket for task role (for runtime access)
    if (props.storage.s3.envFileKey) {
      props.storage.s3.configBucket.grantRead(taskRole);
    }

    // Create task definition
    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'WorkerTaskDef', {
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

    // Determine Docker image - Always use ECR (workers use the same image as server)
    if (!props.deployment.ecrRepositoryArn) {
      throw new Error('ECR repository ARN is required for Authentik Worker deployment');
    }
    
    // Convert ECR ARN to proper repository URI
    const ecrRepositoryUri = this.convertEcrArnToRepositoryUri(props.deployment.ecrRepositoryArn);
    const dockerImage = `${ecrRepositoryUri}:auth-infra-server-${props.deployment.gitSha}`;

    // Prepare container definition options for worker
    let containerDefinitionOptions: ecs.ContainerDefinitionOptions = {
      image: ecs.ContainerImage.fromRegistry(dockerImage),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'authentik-worker',
        logGroup
      }),
      command: ['worker'], // Worker command
      environment: {
        AUTHENTIK_POSTGRESQL__HOST: props.application.database.hostname,
        AUTHENTIK_POSTGRESQL__USER: 'authentik',
        AUTHENTIK_REDIS__HOST: props.application.redis.hostname,
        AUTHENTIK_REDIS__TLS: 'True',
        AUTHENTIK_REDIS__TLS_REQS: 'required',
        // Add essential bootstrap configuration for worker
        AUTHENTIK_BOOTSTRAP_EMAIL: props.application.adminUserEmail,
        AUTHENTIK_BOOTSTRAP_LDAP_BASEDN: props.application.ldapBaseDn,
        // Authentik service host URL for API communications from LDAP Outpost
        AUTHENTIK_BOOTSTRAP_LDAP_AUTHENTIK_HOST: props.application.authentikHost || '',
      },
      secrets: {
        AUTHENTIK_POSTGRESQL__PASSWORD: ecs.Secret.fromSecretsManager(props.secrets.database, 'password'),
        AUTHENTIK_REDIS__PASSWORD: ecs.Secret.fromSecretsManager(props.secrets.redisAuthToken),
        AUTHENTIK_SECRET_KEY: ecs.Secret.fromSecretsManager(props.secrets.authentik.secretKey),
        ...(props.secrets.authentik.ldapServiceUser ? {
          AUTHENTIK_BOOTSTRAP_LDAPSERVICE_USERNAME: ecs.Secret.fromSecretsManager(props.secrets.authentik.ldapServiceUser, 'username'),
          AUTHENTIK_BOOTSTRAP_LDAPSERVICE_PASSWORD: ecs.Secret.fromSecretsManager(props.secrets.authentik.ldapServiceUser, 'password'),
        } : {}),
        AUTHENTIK_BOOTSTRAP_PASSWORD: ecs.Secret.fromSecretsManager(props.secrets.authentik.adminUserPassword, 'password'),
        AUTHENTIK_BOOTSTRAP_TOKEN: ecs.Secret.fromSecretsManager(props.secrets.authentik.adminUserToken)
      },
      // Add basic health check for worker (workers don't expose HTTP endpoints)
      healthCheck: {
        command: ['CMD', 'ak', 'healthcheck'],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(30),
        retries: 3,
        startPeriod: Duration.seconds(60)
      },
      essential: true
    };

    // Add environment files if S3 key is provided and useAuthentikConfigFile is enabled
    if (props.storage.s3.envFileKey && props.deployment.useConfigFile) {
      containerDefinitionOptions = {
        ...containerDefinitionOptions,
        environmentFiles: [
          ecs.EnvironmentFile.fromBucket(props.storage.s3.configBucket, props.storage.s3.envFileKey)
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
      cluster: props.infrastructure.ecsCluster,
      taskDefinition: this.taskDefinition,
      desiredCount: props.contextConfig.ecs.desiredCount, // Use same as server
      securityGroups: [props.infrastructure.ecsSecurityGroup],
      enableExecuteCommand: props.deployment.enableExecute,
      assignPublicIp: false,
      // Disable circuit breaker temporarily to get better error information
      // circuitBreaker: { rollback: true }
    });

    // Add auto scaling for workers
    const scaling = this.ecsService.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: isHighAvailability ? 10 : 3
    });

    // Scale based on CPU utilization (workers may have different scaling patterns)
    scaling.scaleOnCpuUtilization('WorkerCpuScaling', {
      targetUtilizationPercent: 80, // Higher threshold for workers
      scaleInCooldown: Duration.minutes(5),
      scaleOutCooldown: Duration.minutes(2)
    });
  }
}
