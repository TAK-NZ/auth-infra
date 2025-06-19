"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthentikServer = void 0;
/**
 * Authentik Server Construct - Server container and ECS service configuration
 */
const constructs_1 = require("constructs");
const aws_cdk_lib_1 = require("aws-cdk-lib");
/**
 * CDK construct for the Authentik server container and ECS service
 */
class AuthentikServer extends constructs_1.Construct {
    /**
     * Converts an ECR repository ARN to a proper ECR repository URI for Docker images
     * @param ecrArn - ECR repository ARN (e.g., "arn:aws:ecr:region:account:repository/repo-name")
     * @returns ECR repository URI (e.g., "account.dkr.ecr.region.amazonaws.com/repo-name")
     */
    convertEcrArnToRepositoryUri(ecrArn) {
        // Handle CDK tokens (unresolved references)
        if (aws_cdk_lib_1.Token.isUnresolved(ecrArn)) {
            // For tokens, we need to use CDK's Fn.sub to perform the conversion at deploy time
            return aws_cdk_lib_1.Fn.sub('${Account}.dkr.ecr.${Region}.amazonaws.com/${RepoName}', {
                Account: aws_cdk_lib_1.Fn.select(4, aws_cdk_lib_1.Fn.split(':', ecrArn)),
                Region: aws_cdk_lib_1.Fn.select(3, aws_cdk_lib_1.Fn.split(':', ecrArn)),
                RepoName: aws_cdk_lib_1.Fn.select(1, aws_cdk_lib_1.Fn.split('/', aws_cdk_lib_1.Fn.select(5, aws_cdk_lib_1.Fn.split(':', ecrArn))))
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
    constructor(scope, id, props) {
        super(scope, id);
        // Derive environment-specific values from context (matches reference pattern)
        const isHighAvailability = props.environment === 'prod';
        const removalPolicy = props.contextConfig.general.removalPolicy === 'RETAIN' ?
            aws_cdk_lib_1.RemovalPolicy.RETAIN : aws_cdk_lib_1.RemovalPolicy.DESTROY;
        const logRetentionDays = isHighAvailability ? 30 : 7;
        // Create the log group
        const logGroup = new aws_cdk_lib_1.aws_logs.LogGroup(this, 'ServerLogs', {
            logGroupName: `${id}-server`,
            retention: logRetentionDays,
            removalPolicy: removalPolicy
        });
        // Create config bucket if using config file
        let configBucket;
        if (props.deployment.useConfigFile) {
            configBucket = new aws_cdk_lib_1.aws_s3.Bucket(this, 'ConfigBucket', {
                bucketName: `${id}-config`.toLowerCase(),
                removalPolicy: removalPolicy,
                encryption: aws_cdk_lib_1.aws_s3.BucketEncryption.S3_MANAGED,
                blockPublicAccess: aws_cdk_lib_1.aws_s3.BlockPublicAccess.BLOCK_ALL
            });
        }
        // Create task execution role
        const executionRole = new aws_cdk_lib_1.aws_iam.Role(this, 'TaskExecutionRole', {
            assumedBy: new aws_cdk_lib_1.aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
            managedPolicies: [
                aws_cdk_lib_1.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
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
        const taskRole = new aws_cdk_lib_1.aws_iam.Role(this, 'TaskRole', {
            assumedBy: new aws_cdk_lib_1.aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        });
        // Add EFS permissions for task role
        taskRole.addToPolicy(new aws_cdk_lib_1.aws_iam.PolicyStatement({
            effect: aws_cdk_lib_1.aws_iam.Effect.ALLOW,
            actions: [
                'elasticfilesystem:ClientMount',
                'elasticfilesystem:ClientWrite',
                'elasticfilesystem:ClientRootAccess',
                'elasticfilesystem:DescribeMountTargets',
                'elasticfilesystem:DescribeFileSystems'
            ],
            resources: [
                `arn:aws:elasticfilesystem:${aws_cdk_lib_1.Stack.of(this).region}:${aws_cdk_lib_1.Stack.of(this).account}:file-system/${props.storage.efs.fileSystemId}`,
                `arn:aws:elasticfilesystem:${aws_cdk_lib_1.Stack.of(this).region}:${aws_cdk_lib_1.Stack.of(this).account}:access-point/${props.storage.efs.mediaAccessPointId}`,
                `arn:aws:elasticfilesystem:${aws_cdk_lib_1.Stack.of(this).region}:${aws_cdk_lib_1.Stack.of(this).account}:access-point/${props.storage.efs.customTemplatesAccessPointId}`
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
        this.taskDefinition = new aws_cdk_lib_1.aws_ecs.FargateTaskDefinition(this, 'TaskDef', {
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
        // Determine Docker image - ECR repository is required
        if (!props.deployment.ecrRepositoryArn) {
            throw new Error('ecrRepositoryArn is required for Authentik Server deployment');
        }
        // Convert ECR ARN to proper repository URI
        const ecrRepositoryUri = this.convertEcrArnToRepositoryUri(props.deployment.ecrRepositoryArn);
        const dockerImage = `${ecrRepositoryUri}:auth-infra-server-${props.deployment.gitSha}`;
        // Prepare container definition options
        let containerDefinitionOptions = {
            image: aws_cdk_lib_1.aws_ecs.ContainerImage.fromRegistry(dockerImage),
            logging: aws_cdk_lib_1.aws_ecs.LogDrivers.awsLogs({
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
                AUTHENTIK_POSTGRESQL__PASSWORD: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.secrets.database, 'password'),
                AUTHENTIK_REDIS__PASSWORD: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.secrets.redisAuthToken),
                AUTHENTIK_SECRET_KEY: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.secrets.authentik.secretKey),
            },
            healthCheck: {
                command: ['CMD', 'ak', 'healthcheck'],
                interval: aws_cdk_lib_1.Duration.seconds(30),
                timeout: aws_cdk_lib_1.Duration.seconds(5),
                retries: 3,
                startPeriod: aws_cdk_lib_1.Duration.seconds(60)
            },
            essential: true
        };
        // Add environment files if S3 key is provided and useConfigFile is enabled
        if (props.storage.s3.envFileKey && props.deployment.useConfigFile) {
            containerDefinitionOptions = {
                ...containerDefinitionOptions,
                environmentFiles: [
                    aws_cdk_lib_1.aws_ecs.EnvironmentFile.fromBucket(props.storage.s3.configBucket, props.storage.s3.envFileKey)
                ]
            };
        }
        const container = this.taskDefinition.addContainer('AuthentikServer', containerDefinitionOptions);
        // Add port mappings
        container.addPortMappings({
            containerPort: 9000,
            hostPort: 9000,
            protocol: aws_cdk_lib_1.aws_ecs.Protocol.TCP
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
        this.ecsService = new aws_cdk_lib_1.aws_ecs.FargateService(this, 'Service', {
            cluster: props.infrastructure.ecsCluster,
            taskDefinition: this.taskDefinition,
            healthCheckGracePeriod: aws_cdk_lib_1.Duration.seconds(300),
            desiredCount: props.contextConfig.ecs.desiredCount,
            securityGroups: [props.infrastructure.ecsSecurityGroup],
            enableExecuteCommand: props.deployment.enableExecute,
            assignPublicIp: false,
            // Disable circuit breaker temporarily to get better error information
            // circuitBreaker: { rollback: true }
        });
        // Add auto scaling
        const scaling = this.ecsService.autoScaleTaskCount({
            minCapacity: 1,
            maxCapacity: isHighAvailability ? 10 : 3
        });
        // Scale based on CPU utilization
        scaling.scaleOnCpuUtilization('CpuScaling', {
            targetUtilizationPercent: 70,
            scaleInCooldown: aws_cdk_lib_1.Duration.minutes(3),
            scaleOutCooldown: aws_cdk_lib_1.Duration.minutes(1)
        });
    }
    /**
     * Create and register a target group for this service
     */
    createTargetGroup(vpc, listener) {
        // Create target group for the Authentik service
        const targetGroup = new aws_cdk_lib_1.aws_elasticloadbalancingv2.ApplicationTargetGroup(this, 'TargetGroup', {
            vpc: vpc,
            targetType: aws_cdk_lib_1.aws_elasticloadbalancingv2.TargetType.IP,
            port: 9000,
            protocol: aws_cdk_lib_1.aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
            healthCheck: {
                path: '/-/health/live/',
                interval: aws_cdk_lib_1.Duration.seconds(30),
                healthyHttpCodes: '200-299'
            }
        });
        // Register targets
        targetGroup.addTarget(this.ecsService);
        // Add default action to the HTTPS listener
        listener.addAction('DefaultAction', {
            action: aws_cdk_lib_1.aws_elasticloadbalancingv2.ListenerAction.forward([targetGroup])
        });
        return targetGroup;
    }
}
exports.AuthentikServer = AuthentikServer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aGVudGlrLXNlcnZlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGhlbnRpay1zZXJ2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUE7O0dBRUc7QUFDSCwyQ0FBdUM7QUFDdkMsNkNBY3FCO0FBa0RyQjs7R0FFRztBQUNILE1BQWEsZUFBZ0IsU0FBUSxzQkFBUztJQVc1Qzs7OztPQUlHO0lBQ0ssNEJBQTRCLENBQUMsTUFBYztRQUNqRCw0Q0FBNEM7UUFDNUMsSUFBSSxtQkFBSyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQy9CLG1GQUFtRjtZQUNuRixPQUFPLGdCQUFFLENBQUMsR0FBRyxDQUFDLHdEQUF3RCxFQUFFO2dCQUN0RSxPQUFPLEVBQUUsZ0JBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLGdCQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDNUMsTUFBTSxFQUFFLGdCQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxnQkFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQzNDLFFBQVEsRUFBRSxnQkFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsZ0JBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLGdCQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxnQkFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQzNFLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCw2REFBNkQ7UUFDN0QsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNuQyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFD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QztRQUVILE9BQU8sV0FBVyxDQUFDO0lBQ3JCLENBQUM7Q0FDRjtBQXhSRCwwQ0F3UkMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEF1dGhlbnRpayBTZXJ2ZXIgQ29uc3RydWN0IC0gU2VydmVyIGNvbnRhaW5lciBhbmQgRUNTIHNlcnZpY2UgY29uZmlndXJhdGlvblxuICovXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7XG4gIGF3c19lYzIgYXMgZWMyLFxuICBhd3NfZWNzIGFzIGVjcyxcbiAgYXdzX2VsYXN0aWNsb2FkYmFsYW5jaW5ndjIgYXMgZWxidjIsXG4gIGF3c19sb2dzIGFzIGxvZ3MsXG4gIGF3c19zZWNyZXRzbWFuYWdlciBhcyBzZWNyZXRzbWFuYWdlcixcbiAgYXdzX3MzIGFzIHMzLFxuICBhd3NfaWFtIGFzIGlhbSxcbiAgYXdzX2ttcyBhcyBrbXMsXG4gIER1cmF0aW9uLFxuICBGbixcbiAgVG9rZW4sXG4gIFN0YWNrLFxuICBSZW1vdmFsUG9saWN5XG59IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB0eXBlIHsgQ29udGV4dEVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi4vc3RhY2stY29uZmlnJztcbmltcG9ydCB0eXBlIHsgXG4gIEluZnJhc3RydWN0dXJlQ29uZmlnLFxuICBTZWNyZXRzQ29uZmlnLCBcbiAgU3RvcmFnZUNvbmZpZyxcbiAgRGVwbG95bWVudENvbmZpZyxcbiAgQXV0aGVudGlrQXBwbGljYXRpb25Db25maWcgXG59IGZyb20gJy4uL2NvbnN0cnVjdC1jb25maWdzJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciB0aGUgQXV0aGVudGlrIFNlcnZlciBjb25zdHJ1Y3RcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBBdXRoZW50aWtTZXJ2ZXJQcm9wcyB7XG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCB0eXBlICgncHJvZCcgfCAnZGV2LXRlc3QnKVxuICAgKi9cbiAgZW52aXJvbm1lbnQ6ICdwcm9kJyB8ICdkZXYtdGVzdCc7XG5cbiAgLyoqXG4gICAqIENvbnRleHQtYmFzZWQgZW52aXJvbm1lbnQgY29uZmlndXJhdGlvbiAoZGlyZWN0IGZyb20gY2RrLmpzb24pXG4gICAqL1xuICBjb250ZXh0Q29uZmlnOiBDb250ZXh0RW52aXJvbm1lbnRDb25maWc7XG5cbiAgLyoqXG4gICAqIEluZnJhc3RydWN0dXJlIGNvbmZpZ3VyYXRpb25cbiAgICovXG4gIGluZnJhc3RydWN0dXJlOiBJbmZyYXN0cnVjdHVyZUNvbmZpZztcblxuICAvKipcbiAgICogU2VjcmV0cyBjb25maWd1cmF0aW9uXG4gICAqL1xuICBzZWNyZXRzOiBTZWNyZXRzQ29uZmlnO1xuXG4gIC8qKlxuICAgKiBTdG9yYWdlIGNvbmZpZ3VyYXRpb25cbiAgICovXG4gIHN0b3JhZ2U6IFN0b3JhZ2VDb25maWc7XG5cbiAgLyoqXG4gICAqIERlcGxveW1lbnQgY29uZmlndXJhdGlvblxuICAgKi9cbiAgZGVwbG95bWVudDogRGVwbG95bWVudENvbmZpZztcblxuICAvKipcbiAgICogQXBwbGljYXRpb24gY29uZmlndXJhdGlvblxuICAgKi9cbiAgYXBwbGljYXRpb246IEF1dGhlbnRpa0FwcGxpY2F0aW9uQ29uZmlnO1xufVxuXG4vKipcbiAqIENESyBjb25zdHJ1Y3QgZm9yIHRoZSBBdXRoZW50aWsgc2VydmVyIGNvbnRhaW5lciBhbmQgRUNTIHNlcnZpY2VcbiAqL1xuZXhwb3J0IGNsYXNzIEF1dGhlbnRpa1NlcnZlciBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBUaGUgRUNTIHRhc2sgZGVmaW5pdGlvbiBmb3IgdGhlIEF1dGhlbnRpayBzZXJ2ZXJcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSB0YXNrRGVmaW5pdGlvbjogZWNzLlRhc2tEZWZpbml0aW9uO1xuXG4gIC8qKlxuICAgKiBUaGUgRUNTIHNlcnZpY2UgZm9yIEF1dGhlbnRpayBzZXJ2ZXJcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBlY3NTZXJ2aWNlOiBlY3MuRmFyZ2F0ZVNlcnZpY2U7XG5cbiAgLyoqXG4gICAqIENvbnZlcnRzIGFuIEVDUiByZXBvc2l0b3J5IEFSTiB0byBhIHByb3BlciBFQ1IgcmVwb3NpdG9yeSBVUkkgZm9yIERvY2tlciBpbWFnZXNcbiAgICogQHBhcmFtIGVjckFybiAtIEVDUiByZXBvc2l0b3J5IEFSTiAoZS5nLiwgXCJhcm46YXdzOmVjcjpyZWdpb246YWNjb3VudDpyZXBvc2l0b3J5L3JlcG8tbmFtZVwiKVxuICAgKiBAcmV0dXJucyBFQ1IgcmVwb3NpdG9yeSBVUkkgKGUuZy4sIFwiYWNjb3VudC5ka3IuZWNyLnJlZ2lvbi5hbWF6b25hd3MuY29tL3JlcG8tbmFtZVwiKVxuICAgKi9cbiAgcHJpdmF0ZSBjb252ZXJ0RWNyQXJuVG9SZXBvc2l0b3J5VXJpKGVjckFybjogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAvLyBIYW5kbGUgQ0RLIHRva2VucyAodW5yZXNvbHZlZCByZWZlcmVuY2VzKVxuICAgIGlmIChUb2tlbi5pc1VucmVzb2x2ZWQoZWNyQXJuKSkge1xuICAgICAgLy8gRm9yIHRva2Vucywgd2UgbmVlZCB0byB1c2UgQ0RLJ3MgRm4uc3ViIHRvIHBlcmZvcm0gdGhlIGNvbnZlcnNpb24gYXQgZGVwbG95IHRpbWVcbiAgICAgIHJldHVybiBGbi5zdWIoJyR7QWNjb3VudH0uZGtyLmVjci4ke1JlZ2lvbn0uYW1hem9uYXdzLmNvbS8ke1JlcG9OYW1lfScsIHtcbiAgICAgICAgQWNjb3VudDogRm4uc2VsZWN0KDQsIEZuLnNwbGl0KCc6JywgZWNyQXJuKSksXG4gICAgICAgIFJlZ2lvbjogRm4uc2VsZWN0KDMsIEZuLnNwbGl0KCc6JywgZWNyQXJuKSksXG4gICAgICAgIFJlcG9OYW1lOiBGbi5zZWxlY3QoMSwgRm4uc3BsaXQoJy8nLCBGbi5zZWxlY3QoNSwgRm4uc3BsaXQoJzonLCBlY3JBcm4pKSkpXG4gICAgICB9KTtcbiAgICB9XG4gICAgXG4gICAgLy8gUGFyc2UgQVJOOiBhcm46YXdzOmVjcjpyZWdpb246YWNjb3VudDpyZXBvc2l0b3J5L3JlcG8tbmFtZVxuICAgIGNvbnN0IGFyblBhcnRzID0gZWNyQXJuLnNwbGl0KCc6Jyk7XG4gICAgaWYgKGFyblBhcnRzLmxlbmd0aCAhPT0gNiB8fCAhYXJuUGFydHNbNV0uc3RhcnRzV2l0aCgncmVwb3NpdG9yeS8nKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIEVDUiByZXBvc2l0b3J5IEFSTiBmb3JtYXQ6ICR7ZWNyQXJufWApO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCByZWdpb24gPSBhcm5QYXJ0c1szXTtcbiAgICBjb25zdCBhY2NvdW50ID0gYXJuUGFydHNbNF07XG4gICAgY29uc3QgcmVwb3NpdG9yeU5hbWUgPSBhcm5QYXJ0c1s1XS5yZXBsYWNlKCdyZXBvc2l0b3J5LycsICcnKTtcbiAgICBcbiAgICByZXR1cm4gYCR7YWNjb3VudH0uZGtyLmVjci4ke3JlZ2lvbn0uYW1hem9uYXdzLmNvbS8ke3JlcG9zaXRvcnlOYW1lfWA7XG4gIH1cblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQXV0aGVudGlrU2VydmVyUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gRGVyaXZlIGVudmlyb25tZW50LXNwZWNpZmljIHZhbHVlcyBmcm9tIGNvbnRleHQgKG1hdGNoZXMgcmVmZXJlbmNlIHBhdHRlcm4pXG4gICAgY29uc3QgaXNIaWdoQXZhaWxhYmlsaXR5ID0gcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJztcbiAgICBjb25zdCByZW1vdmFsUG9saWN5ID0gcHJvcHMuY29udGV4dENvbmZpZy5nZW5lcmFsLnJlbW92YWxQb2xpY3kgPT09ICdSRVRBSU4nID8gXG4gICAgICBSZW1vdmFsUG9saWN5LlJFVEFJTiA6IFJlbW92YWxQb2xpY3kuREVTVFJPWTtcbiAgICBjb25zdCBsb2dSZXRlbnRpb25EYXlzID0gaXNIaWdoQXZhaWxhYmlsaXR5ID8gMzAgOiA3O1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBsb2cgZ3JvdXBcbiAgICBjb25zdCBsb2dHcm91cCA9IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdTZXJ2ZXJMb2dzJywge1xuICAgICAgbG9nR3JvdXBOYW1lOiBgJHtpZH0tc2VydmVyYCxcbiAgICAgIHJldGVudGlvbjogbG9nUmV0ZW50aW9uRGF5cyxcbiAgICAgIHJlbW92YWxQb2xpY3k6IHJlbW92YWxQb2xpY3lcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBjb25maWcgYnVja2V0IGlmIHVzaW5nIGNvbmZpZyBmaWxlXG4gICAgbGV0IGNvbmZpZ0J1Y2tldDtcbiAgICBpZiAocHJvcHMuZGVwbG95bWVudC51c2VDb25maWdGaWxlKSB7XG4gICAgICBjb25maWdCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdDb25maWdCdWNrZXQnLCB7XG4gICAgICAgIGJ1Y2tldE5hbWU6IGAke2lkfS1jb25maWdgLnRvTG93ZXJDYXNlKCksXG4gICAgICAgIHJlbW92YWxQb2xpY3k6IHJlbW92YWxQb2xpY3ksXG4gICAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIHRhc2sgZXhlY3V0aW9uIHJvbGVcbiAgICBjb25zdCBleGVjdXRpb25Sb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdUYXNrRXhlY3V0aW9uUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlY3MtdGFza3MuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FtYXpvbkVDU1Rhc2tFeGVjdXRpb25Sb2xlUG9saWN5JylcbiAgICAgIF1cbiAgICB9KTtcblxuICAgIC8vIEFkZCBwZXJtaXNzaW9ucyB0byBhY2Nlc3Mgc2VjcmV0c1xuICAgIHByb3BzLnNlY3JldHMuZGF0YWJhc2UuZ3JhbnRSZWFkKGV4ZWN1dGlvblJvbGUpO1xuICAgIHByb3BzLnNlY3JldHMucmVkaXNBdXRoVG9rZW4uZ3JhbnRSZWFkKGV4ZWN1dGlvblJvbGUpO1xuICAgIHByb3BzLnNlY3JldHMuYXV0aGVudGlrLnNlY3JldEtleS5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG4gICAgcHJvcHMuc2VjcmV0cy5hdXRoZW50aWsuYWRtaW5Vc2VyUGFzc3dvcmQuZ3JhbnRSZWFkKGV4ZWN1dGlvblJvbGUpO1xuICAgIHByb3BzLnNlY3JldHMuYXV0aGVudGlrLmFkbWluVXNlclRva2VuLmdyYW50UmVhZChleGVjdXRpb25Sb2xlKTtcblxuICAgIC8vIEdyYW50IGV4cGxpY2l0IEtNUyBwZXJtaXNzaW9ucyBmb3Igc2VjcmV0cyBkZWNyeXB0aW9uXG4gICAgcHJvcHMuaW5mcmFzdHJ1Y3R1cmUua21zS2V5LmdyYW50RGVjcnlwdChleGVjdXRpb25Sb2xlKTtcblxuICAgIC8vIEdyYW50IFMzIGFjY2VzcyB0byBleGVjdXRpb24gcm9sZSBmb3IgZW52aXJvbm1lbnQgZmlsZXMgKG5lZWRlZCBkdXJpbmcgdGFzayBpbml0aWFsaXphdGlvbilcbiAgICBpZiAocHJvcHMuc3RvcmFnZS5zMy5lbnZGaWxlS2V5KSB7XG4gICAgICBwcm9wcy5zdG9yYWdlLnMzLmNvbmZpZ0J1Y2tldC5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIHRhc2sgcm9sZVxuICAgIGNvbnN0IHRhc2tSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdUYXNrUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlY3MtdGFza3MuYW1hem9uYXdzLmNvbScpLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIEVGUyBwZXJtaXNzaW9ucyBmb3IgdGFzayByb2xlXG4gICAgdGFza1JvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZWxhc3RpY2ZpbGVzeXN0ZW06Q2xpZW50TW91bnQnLFxuICAgICAgICAnZWxhc3RpY2ZpbGVzeXN0ZW06Q2xpZW50V3JpdGUnLFxuICAgICAgICAnZWxhc3RpY2ZpbGVzeXN0ZW06Q2xpZW50Um9vdEFjY2VzcycsXG4gICAgICAgICdlbGFzdGljZmlsZXN5c3RlbTpEZXNjcmliZU1vdW50VGFyZ2V0cycsXG4gICAgICAgICdlbGFzdGljZmlsZXN5c3RlbTpEZXNjcmliZUZpbGVTeXN0ZW1zJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czplbGFzdGljZmlsZXN5c3RlbToke1N0YWNrLm9mKHRoaXMpLnJlZ2lvbn06JHtTdGFjay5vZih0aGlzKS5hY2NvdW50fTpmaWxlLXN5c3RlbS8ke3Byb3BzLnN0b3JhZ2UuZWZzLmZpbGVTeXN0ZW1JZH1gLFxuICAgICAgICBgYXJuOmF3czplbGFzdGljZmlsZXN5c3RlbToke1N0YWNrLm9mKHRoaXMpLnJlZ2lvbn06JHtTdGFjay5vZih0aGlzKS5hY2NvdW50fTphY2Nlc3MtcG9pbnQvJHtwcm9wcy5zdG9yYWdlLmVmcy5tZWRpYUFjY2Vzc1BvaW50SWR9YCxcbiAgICAgICAgYGFybjphd3M6ZWxhc3RpY2ZpbGVzeXN0ZW06JHtTdGFjay5vZih0aGlzKS5yZWdpb259OiR7U3RhY2sub2YodGhpcykuYWNjb3VudH06YWNjZXNzLXBvaW50LyR7cHJvcHMuc3RvcmFnZS5lZnMuY3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnRJZH1gXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgLy8gQWRkIHRhc2sgcGVybWlzc2lvbnNcbiAgICBpZiAocHJvcHMuZGVwbG95bWVudC51c2VDb25maWdGaWxlICYmIGNvbmZpZ0J1Y2tldCkge1xuICAgICAgY29uZmlnQnVja2V0LmdyYW50UmVhZCh0YXNrUm9sZSk7XG4gICAgfVxuXG4gICAgLy8gR3JhbnQgcmVhZCBhY2Nlc3MgdG8gUzMgY29uZmlndXJhdGlvbiBidWNrZXQgZm9yIGVudmlyb25tZW50IGZpbGVzXG4gICAgaWYgKHByb3BzLnN0b3JhZ2UuczMuZW52RmlsZUtleSkge1xuICAgICAgcHJvcHMuc3RvcmFnZS5zMy5jb25maWdCdWNrZXQuZ3JhbnRSZWFkKHRhc2tSb2xlKTtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgdGFzayBkZWZpbml0aW9uXG4gICAgdGhpcy50YXNrRGVmaW5pdGlvbiA9IG5ldyBlY3MuRmFyZ2F0ZVRhc2tEZWZpbml0aW9uKHRoaXMsICdUYXNrRGVmJywge1xuICAgICAgY3B1OiBwcm9wcy5jb250ZXh0Q29uZmlnLmVjcy50YXNrQ3B1LFxuICAgICAgbWVtb3J5TGltaXRNaUI6IHByb3BzLmNvbnRleHRDb25maWcuZWNzLnRhc2tNZW1vcnksXG4gICAgICBleGVjdXRpb25Sb2xlLFxuICAgICAgdGFza1JvbGVcbiAgICB9KTtcblxuICAgIC8vIEFkZCB2b2x1bWVzIGZvciBFRlNcbiAgICB0aGlzLnRhc2tEZWZpbml0aW9uLmFkZFZvbHVtZSh7XG4gICAgICBuYW1lOiAnbWVkaWEnLFxuICAgICAgZWZzVm9sdW1lQ29uZmlndXJhdGlvbjoge1xuICAgICAgICBmaWxlU3lzdGVtSWQ6IHByb3BzLnN0b3JhZ2UuZWZzLmZpbGVTeXN0ZW1JZCxcbiAgICAgICAgdHJhbnNpdEVuY3J5cHRpb246ICdFTkFCTEVEJyxcbiAgICAgICAgYXV0aG9yaXphdGlvbkNvbmZpZzoge1xuICAgICAgICAgIGFjY2Vzc1BvaW50SWQ6IHByb3BzLnN0b3JhZ2UuZWZzLm1lZGlhQWNjZXNzUG9pbnRJZCxcbiAgICAgICAgICBpYW06ICdFTkFCTEVEJ1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICB0aGlzLnRhc2tEZWZpbml0aW9uLmFkZFZvbHVtZSh7XG4gICAgICBuYW1lOiAnY3VzdG9tLXRlbXBsYXRlcycsXG4gICAgICBlZnNWb2x1bWVDb25maWd1cmF0aW9uOiB7XG4gICAgICAgIGZpbGVTeXN0ZW1JZDogcHJvcHMuc3RvcmFnZS5lZnMuZmlsZVN5c3RlbUlkLFxuICAgICAgICB0cmFuc2l0RW5jcnlwdGlvbjogJ0VOQUJMRUQnLFxuICAgICAgICBhdXRob3JpemF0aW9uQ29uZmlnOiB7XG4gICAgICAgICAgYWNjZXNzUG9pbnRJZDogcHJvcHMuc3RvcmFnZS5lZnMuY3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnRJZCxcbiAgICAgICAgICBpYW06ICdFTkFCTEVEJ1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBEZXRlcm1pbmUgRG9ja2VyIGltYWdlIC0gRUNSIHJlcG9zaXRvcnkgaXMgcmVxdWlyZWRcbiAgICBpZiAoIXByb3BzLmRlcGxveW1lbnQuZWNyUmVwb3NpdG9yeUFybikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdlY3JSZXBvc2l0b3J5QXJuIGlzIHJlcXVpcmVkIGZvciBBdXRoZW50aWsgU2VydmVyIGRlcGxveW1lbnQnKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQ29udmVydCBFQ1IgQVJOIHRvIHByb3BlciByZXBvc2l0b3J5IFVSSVxuICAgIGNvbnN0IGVjclJlcG9zaXRvcnlVcmkgPSB0aGlzLmNvbnZlcnRFY3JBcm5Ub1JlcG9zaXRvcnlVcmkocHJvcHMuZGVwbG95bWVudC5lY3JSZXBvc2l0b3J5QXJuKTtcbiAgICBjb25zdCBkb2NrZXJJbWFnZSA9IGAke2VjclJlcG9zaXRvcnlVcml9OmF1dGgtaW5mcmEtc2VydmVyLSR7cHJvcHMuZGVwbG95bWVudC5naXRTaGF9YDtcblxuICAgIC8vIFByZXBhcmUgY29udGFpbmVyIGRlZmluaXRpb24gb3B0aW9uc1xuICAgIGxldCBjb250YWluZXJEZWZpbml0aW9uT3B0aW9uczogZWNzLkNvbnRhaW5lckRlZmluaXRpb25PcHRpb25zID0ge1xuICAgICAgaW1hZ2U6IGVjcy5Db250YWluZXJJbWFnZS5mcm9tUmVnaXN0cnkoZG9ja2VySW1hZ2UpLFxuICAgICAgbG9nZ2luZzogZWNzLkxvZ0RyaXZlcnMuYXdzTG9ncyh7XG4gICAgICAgIHN0cmVhbVByZWZpeDogJ2F1dGhlbnRpay1zZXJ2ZXInLFxuICAgICAgICBsb2dHcm91cFxuICAgICAgfSksXG4gICAgICBjb21tYW5kOiBbJ3NlcnZlciddLCAvLyBTZXJ2ZXIgY29tbWFuZFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgQVVUSEVOVElLX1BPU1RHUkVTUUxfX0hPU1Q6IHByb3BzLmFwcGxpY2F0aW9uLmRhdGFiYXNlLmhvc3RuYW1lLFxuICAgICAgICBBVVRIRU5USUtfUE9TVEdSRVNRTF9fVVNFUjogJ2F1dGhlbnRpaycsXG4gICAgICAgIEFVVEhFTlRJS19SRURJU19fSE9TVDogcHJvcHMuYXBwbGljYXRpb24ucmVkaXMuaG9zdG5hbWUsXG4gICAgICAgIEFVVEhFTlRJS19SRURJU19fVExTOiAnVHJ1ZScsXG4gICAgICAgIEFVVEhFTlRJS19SRURJU19fVExTX1JFUVM6ICdyZXF1aXJlZCcsXG4gICAgICB9LFxuICAgICAgc2VjcmV0czoge1xuICAgICAgICBBVVRIRU5USUtfUE9TVEdSRVNRTF9fUEFTU1dPUkQ6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHByb3BzLnNlY3JldHMuZGF0YWJhc2UsICdwYXNzd29yZCcpLFxuICAgICAgICBBVVRIRU5USUtfUkVESVNfX1BBU1NXT1JEOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihwcm9wcy5zZWNyZXRzLnJlZGlzQXV0aFRva2VuKSxcbiAgICAgICAgQVVUSEVOVElLX1NFQ1JFVF9LRVk6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHByb3BzLnNlY3JldHMuYXV0aGVudGlrLnNlY3JldEtleSksXG4gICAgICB9LFxuICAgICAgaGVhbHRoQ2hlY2s6IHtcbiAgICAgICAgY29tbWFuZDogWydDTUQnLCAnYWsnLCAnaGVhbHRoY2hlY2snXSxcbiAgICAgICAgaW50ZXJ2YWw6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDUpLFxuICAgICAgICByZXRyaWVzOiAzLFxuICAgICAgICBzdGFydFBlcmlvZDogRHVyYXRpb24uc2Vjb25kcyg2MClcbiAgICAgIH0sXG4gICAgICBlc3NlbnRpYWw6IHRydWVcbiAgICB9O1xuXG4gICAgLy8gQWRkIGVudmlyb25tZW50IGZpbGVzIGlmIFMzIGtleSBpcyBwcm92aWRlZCBhbmQgdXNlQ29uZmlnRmlsZSBpcyBlbmFibGVkXG4gICAgaWYgKHByb3BzLnN0b3JhZ2UuczMuZW52RmlsZUtleSAmJiBwcm9wcy5kZXBsb3ltZW50LnVzZUNvbmZpZ0ZpbGUpIHtcbiAgICAgIGNvbnRhaW5lckRlZmluaXRpb25PcHRpb25zID0ge1xuICAgICAgICAuLi5jb250YWluZXJEZWZpbml0aW9uT3B0aW9ucyxcbiAgICAgICAgZW52aXJvbm1lbnRGaWxlczogW1xuICAgICAgICAgIGVjcy5FbnZpcm9ubWVudEZpbGUuZnJvbUJ1Y2tldChwcm9wcy5zdG9yYWdlLnMzLmNvbmZpZ0J1Y2tldCwgcHJvcHMuc3RvcmFnZS5zMy5lbnZGaWxlS2V5KVxuICAgICAgICBdXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IGNvbnRhaW5lciA9IHRoaXMudGFza0RlZmluaXRpb24uYWRkQ29udGFpbmVyKCdBdXRoZW50aWtTZXJ2ZXInLCBjb250YWluZXJEZWZpbml0aW9uT3B0aW9ucyk7XG5cbiAgICAvLyBBZGQgcG9ydCBtYXBwaW5nc1xuICAgIGNvbnRhaW5lci5hZGRQb3J0TWFwcGluZ3Moe1xuICAgICAgY29udGFpbmVyUG9ydDogOTAwMCxcbiAgICAgIGhvc3RQb3J0OiA5MDAwLFxuICAgICAgcHJvdG9jb2w6IGVjcy5Qcm90b2NvbC5UQ1BcbiAgICB9KTtcblxuICAgIC8vIEFkZCBtb3VudCBwb2ludHMgZm9yIEVGUyB2b2x1bWVzXG4gICAgY29udGFpbmVyLmFkZE1vdW50UG9pbnRzKHtcbiAgICAgIGNvbnRhaW5lclBhdGg6ICcvbWVkaWEnLFxuICAgICAgc291cmNlVm9sdW1lOiAnbWVkaWEnLFxuICAgICAgcmVhZE9ubHk6IGZhbHNlXG4gICAgfSk7XG5cbiAgICBjb250YWluZXIuYWRkTW91bnRQb2ludHMoe1xuICAgICAgY29udGFpbmVyUGF0aDogJy90ZW1wbGF0ZXMnLFxuICAgICAgc291cmNlVm9sdW1lOiAnY3VzdG9tLXRlbXBsYXRlcycsXG4gICAgICByZWFkT25seTogZmFsc2VcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBFQ1Mgc2VydmljZVxuICAgIHRoaXMuZWNzU2VydmljZSA9IG5ldyBlY3MuRmFyZ2F0ZVNlcnZpY2UodGhpcywgJ1NlcnZpY2UnLCB7XG4gICAgICBjbHVzdGVyOiBwcm9wcy5pbmZyYXN0cnVjdHVyZS5lY3NDbHVzdGVyLFxuICAgICAgdGFza0RlZmluaXRpb246IHRoaXMudGFza0RlZmluaXRpb24sXG4gICAgICBoZWFsdGhDaGVja0dyYWNlUGVyaW9kOiBEdXJhdGlvbi5zZWNvbmRzKDMwMCksXG4gICAgICBkZXNpcmVkQ291bnQ6IHByb3BzLmNvbnRleHRDb25maWcuZWNzLmRlc2lyZWRDb3VudCxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbcHJvcHMuaW5mcmFzdHJ1Y3R1cmUuZWNzU2VjdXJpdHlHcm91cF0sXG4gICAgICBlbmFibGVFeGVjdXRlQ29tbWFuZDogcHJvcHMuZGVwbG95bWVudC5lbmFibGVFeGVjdXRlLFxuICAgICAgYXNzaWduUHVibGljSXA6IGZhbHNlLFxuICAgICAgLy8gRGlzYWJsZSBjaXJjdWl0IGJyZWFrZXIgdGVtcG9yYXJpbHkgdG8gZ2V0IGJldHRlciBlcnJvciBpbmZvcm1hdGlvblxuICAgICAgLy8gY2lyY3VpdEJyZWFrZXI6IHsgcm9sbGJhY2s6IHRydWUgfVxuICAgIH0pO1xuXG4gICAgLy8gQWRkIGF1dG8gc2NhbGluZ1xuICAgIGNvbnN0IHNjYWxpbmcgPSB0aGlzLmVjc1NlcnZpY2UuYXV0b1NjYWxlVGFza0NvdW50KHtcbiAgICAgIG1pbkNhcGFjaXR5OiAxLFxuICAgICAgbWF4Q2FwYWNpdHk6IGlzSGlnaEF2YWlsYWJpbGl0eSA/IDEwIDogM1xuICAgIH0pO1xuXG4gICAgLy8gU2NhbGUgYmFzZWQgb24gQ1BVIHV0aWxpemF0aW9uXG4gICAgc2NhbGluZy5zY2FsZU9uQ3B1VXRpbGl6YXRpb24oJ0NwdVNjYWxpbmcnLCB7XG4gICAgICB0YXJnZXRVdGlsaXphdGlvblBlcmNlbnQ6IDcwLFxuICAgICAgc2NhbGVJbkNvb2xkb3duOiBEdXJhdGlvbi5taW51dGVzKDMpLFxuICAgICAgc2NhbGVPdXRDb29sZG93bjogRHVyYXRpb24ubWludXRlcygxKVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhbmQgcmVnaXN0ZXIgYSB0YXJnZXQgZ3JvdXAgZm9yIHRoaXMgc2VydmljZVxuICAgKi9cbiAgcHVibGljIGNyZWF0ZVRhcmdldEdyb3VwKHZwYzogZWMyLklWcGMsIGxpc3RlbmVyOiBlbGJ2Mi5BcHBsaWNhdGlvbkxpc3RlbmVyKTogZWxidjIuQXBwbGljYXRpb25UYXJnZXRHcm91cCB7XG4gICAgLy8gQ3JlYXRlIHRhcmdldCBncm91cCBmb3IgdGhlIEF1dGhlbnRpayBzZXJ2aWNlXG4gICAgY29uc3QgdGFyZ2V0R3JvdXAgPSBuZXcgZWxidjIuQXBwbGljYXRpb25UYXJnZXRHcm91cCh0aGlzLCAnVGFyZ2V0R3JvdXAnLCB7XG4gICAgICB2cGM6IHZwYyxcbiAgICAgIHRhcmdldFR5cGU6IGVsYnYyLlRhcmdldFR5cGUuSVAsXG4gICAgICBwb3J0OiA5MDAwLFxuICAgICAgcHJvdG9jb2w6IGVsYnYyLkFwcGxpY2F0aW9uUHJvdG9jb2wuSFRUUCxcbiAgICAgIGhlYWx0aENoZWNrOiB7XG4gICAgICAgIHBhdGg6ICcvLS9oZWFsdGgvbGl2ZS8nLFxuICAgICAgICBpbnRlcnZhbDogRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIGhlYWx0aHlIdHRwQ29kZXM6ICcyMDAtMjk5J1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gUmVnaXN0ZXIgdGFyZ2V0c1xuICAgIHRhcmdldEdyb3VwLmFkZFRhcmdldCh0aGlzLmVjc1NlcnZpY2UpO1xuXG4gICAgLy8gQWRkIGRlZmF1bHQgYWN0aW9uIHRvIHRoZSBIVFRQUyBsaXN0ZW5lclxuICAgIGxpc3RlbmVyLmFkZEFjdGlvbignRGVmYXVsdEFjdGlvbicsIHtcbiAgICAgIGFjdGlvbjogZWxidjIuTGlzdGVuZXJBY3Rpb24uZm9yd2FyZChbdGFyZ2V0R3JvdXBdKVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHRhcmdldEdyb3VwO1xuICB9XG59XG4iXX0=