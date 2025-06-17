"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthentikWorker = void 0;
/**
 * Authentik Worker Construct - Worker container configuration for background tasks
 */
const constructs_1 = require("constructs");
const aws_cdk_lib_1 = require("aws-cdk-lib");
/**
 * CDK construct for the Authentik worker container
 */
class AuthentikWorker extends constructs_1.Construct {
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
        // Create the log group for workers
        const logGroup = new aws_cdk_lib_1.aws_logs.LogGroup(this, 'WorkerLogs', {
            logGroupName: `${id}-worker`,
            retention: props.config.monitoring.logRetentionDays,
            removalPolicy: props.config.general.removalPolicy
        });
        // Create task execution role
        const executionRole = new aws_cdk_lib_1.aws_iam.Role(this, 'WorkerTaskExecutionRole', {
            assumedBy: new aws_cdk_lib_1.aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
            managedPolicies: [
                aws_cdk_lib_1.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
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
        const taskRole = new aws_cdk_lib_1.aws_iam.Role(this, 'WorkerTaskRole', {
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
        // Grant read access to S3 configuration bucket for task role (for runtime access)
        if (props.storage.s3.envFileKey) {
            props.storage.s3.configBucket.grantRead(taskRole);
        }
        // Create task definition
        this.taskDefinition = new aws_cdk_lib_1.aws_ecs.FargateTaskDefinition(this, 'WorkerTaskDef', {
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
        // Determine Docker image - Always use ECR (workers use the same image as server)
        if (!props.deployment.ecrRepositoryArn) {
            throw new Error('ECR repository ARN is required for Authentik Worker deployment');
        }
        // Convert ECR ARN to proper repository URI
        const ecrRepositoryUri = this.convertEcrArnToRepositoryUri(props.deployment.ecrRepositoryArn);
        const dockerImage = `${ecrRepositoryUri}:auth-infra-server-${props.deployment.gitSha}`;
        // Prepare container definition options for worker
        let containerDefinitionOptions = {
            image: aws_cdk_lib_1.aws_ecs.ContainerImage.fromRegistry(dockerImage),
            logging: aws_cdk_lib_1.aws_ecs.LogDrivers.awsLogs({
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
                AUTHENTIK_POSTGRESQL__PASSWORD: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.secrets.database, 'password'),
                AUTHENTIK_REDIS__PASSWORD: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.secrets.redisAuthToken),
                AUTHENTIK_SECRET_KEY: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.secrets.authentik.secretKey),
                ...(props.secrets.authentik.ldapServiceUser ? {
                    AUTHENTIK_BOOTSTRAP_LDAPSERVICE_USERNAME: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.secrets.authentik.ldapServiceUser, 'username'),
                    AUTHENTIK_BOOTSTRAP_LDAPSERVICE_PASSWORD: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.secrets.authentik.ldapServiceUser, 'password'),
                } : {}),
                AUTHENTIK_BOOTSTRAP_PASSWORD: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.secrets.authentik.adminUserPassword, 'password'),
                AUTHENTIK_BOOTSTRAP_TOKEN: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.secrets.authentik.adminUserToken)
            },
            // Add basic health check for worker (workers don't expose HTTP endpoints)
            healthCheck: {
                command: ['CMD', 'ak', 'healthcheck'],
                interval: aws_cdk_lib_1.Duration.seconds(30),
                timeout: aws_cdk_lib_1.Duration.seconds(30),
                retries: 3,
                startPeriod: aws_cdk_lib_1.Duration.seconds(60)
            },
            essential: true
        };
        // Add environment files if S3 key is provided and useAuthentikConfigFile is enabled
        if (props.storage.s3.envFileKey && props.deployment.useConfigFile) {
            containerDefinitionOptions = {
                ...containerDefinitionOptions,
                environmentFiles: [
                    aws_cdk_lib_1.aws_ecs.EnvironmentFile.fromBucket(props.storage.s3.configBucket, props.storage.s3.envFileKey)
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
        this.ecsService = new aws_cdk_lib_1.aws_ecs.FargateService(this, 'WorkerService', {
            cluster: props.infrastructure.ecsCluster,
            taskDefinition: this.taskDefinition,
            desiredCount: props.config.ecs.workerDesiredCount || 1, // Default to 1 worker
            securityGroups: [props.infrastructure.ecsSecurityGroup],
            enableExecuteCommand: props.deployment.enableExecute,
            assignPublicIp: false,
            // Disable circuit breaker temporarily to get better error information
            // circuitBreaker: { rollback: true }
        });
        // Add auto scaling for workers
        const scaling = this.ecsService.autoScaleTaskCount({
            minCapacity: props.config.ecs.workerMinCapacity || 1,
            maxCapacity: props.config.ecs.workerMaxCapacity || 3
        });
        // Scale based on CPU utilization (workers may have different scaling patterns)
        scaling.scaleOnCpuUtilization('WorkerCpuScaling', {
            targetUtilizationPercent: 80, // Higher threshold for workers
            scaleInCooldown: aws_cdk_lib_1.Duration.minutes(5),
            scaleOutCooldown: aws_cdk_lib_1.Duration.minutes(2)
        });
    }
}
exports.AuthentikWorker = AuthentikWorker;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aGVudGlrLXdvcmtlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGhlbnRpay13b3JrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUE7O0dBRUc7QUFDSCwyQ0FBdUM7QUFDdkMsNkNBWXFCO0FBa0RyQjs7R0FFRztBQUNILE1BQWEsZUFBZ0IsU0FBUSxzQkFBUztJQVc1Qzs7OztPQUlHO0lBQ0ssNEJBQTRCLENBQUMsTUFBYztRQUNqRCw0Q0FBNEM7UUFDNUMsSUFBSSxtQkFBSyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQy9CLG1GQUFtRjtZQUNuRixPQUFPLGdCQUFFLENBQUMsR0FBRyxDQUFDLHdEQUF3RCxFQUFFO2dCQUN0RSxPQUFPLEVBQUUsZ0JBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLGdCQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDNUMsTUFBTSxFQUFFLGdCQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxnQkFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQzNDLFFBQVEsRUFBRSxnQkFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsZ0JBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLGdCQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxnQkFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQzNFLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCw2REFBNkQ7UUFDN0QsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNuQyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFD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QyxVQUFVLENBQUMsa0JBQWtCLENBQUM7WUFDakQsV0FBVyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLGlCQUFpQixJQUFJLENBQUM7WUFDcEQsV0FBVyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLGlCQUFpQixJQUFJLENBQUM7U0FDckQsQ0FBQyxDQUFDO1FBRUgsK0VBQStFO1FBQy9FLE9BQU8sQ0FBQyxxQkFBcUIsQ0FBQyxrQkFBa0IsRUFBRTtZQUNoRCx3QkFBd0IsRUFBRSxFQUFFLEVBQUUsK0JBQStCO1lBQzdELGVBQWUsRUFBRSxzQkFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDcEMsZ0JBQWdCLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1NBQ3RDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQTdPRCwwQ0E2T0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEF1dGhlbnRpayBXb3JrZXIgQ29uc3RydWN0IC0gV29ya2VyIGNvbnRhaW5lciBjb25maWd1cmF0aW9uIGZvciBiYWNrZ3JvdW5kIHRhc2tzXG4gKi9cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHtcbiAgYXdzX2VjMiBhcyBlYzIsXG4gIGF3c19lY3MgYXMgZWNzLFxuICBhd3NfbG9ncyBhcyBsb2dzLFxuICBhd3Nfc2VjcmV0c21hbmFnZXIgYXMgc2VjcmV0c21hbmFnZXIsXG4gIGF3c19zMyBhcyBzMyxcbiAgYXdzX2lhbSBhcyBpYW0sXG4gIGF3c19rbXMgYXMga21zLFxuICBEdXJhdGlvbixcbiAgRm4sXG4gIFRva2VuLFxuICBTdGFja1xufSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgdHlwZSB7IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi4vZW52aXJvbm1lbnQtY29uZmlnJztcbmltcG9ydCB0eXBlIHsgXG4gIEluZnJhc3RydWN0dXJlQ29uZmlnLCBcbiAgU2VjcmV0c0NvbmZpZywgXG4gIFN0b3JhZ2VDb25maWcsIFxuICBEZXBsb3ltZW50Q29uZmlnLCBcbiAgQXV0aGVudGlrQXBwbGljYXRpb25Db25maWcgXG59IGZyb20gJy4uL2NvbnN0cnVjdC1jb25maWdzJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciB0aGUgQXV0aGVudGlrIFdvcmtlciBjb25zdHJ1Y3RcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBBdXRoZW50aWtXb3JrZXJQcm9wcyB7XG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBuYW1lIChlLmcuICdwcm9kJywgJ2RldicsIGV0Yy4pXG4gICAqL1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBjb25maWd1cmF0aW9uXG4gICAqL1xuICBjb25maWc6IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnO1xuXG4gIC8qKlxuICAgKiBJbmZyYXN0cnVjdHVyZSBjb25maWd1cmF0aW9uIChWUEMsIEVDUywgc2VjdXJpdHkgZ3JvdXBzKVxuICAgKi9cbiAgaW5mcmFzdHJ1Y3R1cmU6IEluZnJhc3RydWN0dXJlQ29uZmlnO1xuXG4gIC8qKlxuICAgKiBTZWNyZXRzIGNvbmZpZ3VyYXRpb24gKGRhdGFiYXNlLCBSZWRpcywgQXV0aGVudGlrIHNlY3JldHMpXG4gICAqL1xuICBzZWNyZXRzOiBTZWNyZXRzQ29uZmlnO1xuXG4gIC8qKlxuICAgKiBTdG9yYWdlIGNvbmZpZ3VyYXRpb24gKFMzLCBFRlMpXG4gICAqL1xuICBzdG9yYWdlOiBTdG9yYWdlQ29uZmlnO1xuXG4gIC8qKlxuICAgKiBEZXBsb3ltZW50IGNvbmZpZ3VyYXRpb24gKEVDUiwgR2l0IFNIQSwgZXhlY3V0aW9uIHNldHRpbmdzKVxuICAgKi9cbiAgZGVwbG95bWVudDogRGVwbG95bWVudENvbmZpZztcblxuICAvKipcbiAgICogQXV0aGVudGlrIGFwcGxpY2F0aW9uIGNvbmZpZ3VyYXRpb24gKGFkbWluIHNldHRpbmdzLCBMREFQLCBob3N0IFVSTClcbiAgICovXG4gIGFwcGxpY2F0aW9uOiBBdXRoZW50aWtBcHBsaWNhdGlvbkNvbmZpZztcbn1cblxuLyoqXG4gKiBDREsgY29uc3RydWN0IGZvciB0aGUgQXV0aGVudGlrIHdvcmtlciBjb250YWluZXJcbiAqL1xuZXhwb3J0IGNsYXNzIEF1dGhlbnRpa1dvcmtlciBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBUaGUgRUNTIHRhc2sgZGVmaW5pdGlvbiBmb3IgdGhlIEF1dGhlbnRpayB3b3JrZXJcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSB0YXNrRGVmaW5pdGlvbjogZWNzLlRhc2tEZWZpbml0aW9uO1xuXG4gIC8qKlxuICAgKiBUaGUgRUNTIHNlcnZpY2UgZm9yIEF1dGhlbnRpayB3b3JrZXJcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBlY3NTZXJ2aWNlOiBlY3MuRmFyZ2F0ZVNlcnZpY2U7XG5cbiAgLyoqXG4gICAqIENvbnZlcnRzIGFuIEVDUiByZXBvc2l0b3J5IEFSTiB0byBhIHByb3BlciBFQ1IgcmVwb3NpdG9yeSBVUkkgZm9yIERvY2tlciBpbWFnZXNcbiAgICogQHBhcmFtIGVjckFybiAtIEVDUiByZXBvc2l0b3J5IEFSTiAoZS5nLiwgXCJhcm46YXdzOmVjcjpyZWdpb246YWNjb3VudDpyZXBvc2l0b3J5L3JlcG8tbmFtZVwiKVxuICAgKiBAcmV0dXJucyBFQ1IgcmVwb3NpdG9yeSBVUkkgKGUuZy4sIFwiYWNjb3VudC5ka3IuZWNyLnJlZ2lvbi5hbWF6b25hd3MuY29tL3JlcG8tbmFtZVwiKVxuICAgKi9cbiAgcHJpdmF0ZSBjb252ZXJ0RWNyQXJuVG9SZXBvc2l0b3J5VXJpKGVjckFybjogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAvLyBIYW5kbGUgQ0RLIHRva2VucyAodW5yZXNvbHZlZCByZWZlcmVuY2VzKVxuICAgIGlmIChUb2tlbi5pc1VucmVzb2x2ZWQoZWNyQXJuKSkge1xuICAgICAgLy8gRm9yIHRva2Vucywgd2UgbmVlZCB0byB1c2UgQ0RLJ3MgRm4uc3ViIHRvIHBlcmZvcm0gdGhlIGNvbnZlcnNpb24gYXQgZGVwbG95IHRpbWVcbiAgICAgIHJldHVybiBGbi5zdWIoJyR7QWNjb3VudH0uZGtyLmVjci4ke1JlZ2lvbn0uYW1hem9uYXdzLmNvbS8ke1JlcG9OYW1lfScsIHtcbiAgICAgICAgQWNjb3VudDogRm4uc2VsZWN0KDQsIEZuLnNwbGl0KCc6JywgZWNyQXJuKSksXG4gICAgICAgIFJlZ2lvbjogRm4uc2VsZWN0KDMsIEZuLnNwbGl0KCc6JywgZWNyQXJuKSksXG4gICAgICAgIFJlcG9OYW1lOiBGbi5zZWxlY3QoMSwgRm4uc3BsaXQoJy8nLCBGbi5zZWxlY3QoNSwgRm4uc3BsaXQoJzonLCBlY3JBcm4pKSkpXG4gICAgICB9KTtcbiAgICB9XG4gICAgXG4gICAgLy8gUGFyc2UgQVJOOiBhcm46YXdzOmVjcjpyZWdpb246YWNjb3VudDpyZXBvc2l0b3J5L3JlcG8tbmFtZVxuICAgIGNvbnN0IGFyblBhcnRzID0gZWNyQXJuLnNwbGl0KCc6Jyk7XG4gICAgaWYgKGFyblBhcnRzLmxlbmd0aCAhPT0gNiB8fCAhYXJuUGFydHNbNV0uc3RhcnRzV2l0aCgncmVwb3NpdG9yeS8nKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIEVDUiByZXBvc2l0b3J5IEFSTiBmb3JtYXQ6ICR7ZWNyQXJufWApO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCByZWdpb24gPSBhcm5QYXJ0c1szXTtcbiAgICBjb25zdCBhY2NvdW50ID0gYXJuUGFydHNbNF07XG4gICAgY29uc3QgcmVwb3NpdG9yeU5hbWUgPSBhcm5QYXJ0c1s1XS5yZXBsYWNlKCdyZXBvc2l0b3J5LycsICcnKTtcbiAgICBcbiAgICByZXR1cm4gYCR7YWNjb3VudH0uZGtyLmVjci4ke3JlZ2lvbn0uYW1hem9uYXdzLmNvbS8ke3JlcG9zaXRvcnlOYW1lfWA7XG4gIH1cblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQXV0aGVudGlrV29ya2VyUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBsb2cgZ3JvdXAgZm9yIHdvcmtlcnNcbiAgICBjb25zdCBsb2dHcm91cCA9IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdXb3JrZXJMb2dzJywge1xuICAgICAgbG9nR3JvdXBOYW1lOiBgJHtpZH0td29ya2VyYCxcbiAgICAgIHJldGVudGlvbjogcHJvcHMuY29uZmlnLm1vbml0b3JpbmcubG9nUmV0ZW50aW9uRGF5cyxcbiAgICAgIHJlbW92YWxQb2xpY3k6IHByb3BzLmNvbmZpZy5nZW5lcmFsLnJlbW92YWxQb2xpY3lcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSB0YXNrIGV4ZWN1dGlvbiByb2xlXG4gICAgY29uc3QgZXhlY3V0aW9uUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnV29ya2VyVGFza0V4ZWN1dGlvblJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnZWNzLXRhc2tzLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BbWF6b25FQ1NUYXNrRXhlY3V0aW9uUm9sZVBvbGljeScpXG4gICAgICBdXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgcGVybWlzc2lvbnMgdG8gYWNjZXNzIHNlY3JldHNcbiAgICBwcm9wcy5zZWNyZXRzLmRhdGFiYXNlLmdyYW50UmVhZChleGVjdXRpb25Sb2xlKTtcbiAgICBwcm9wcy5zZWNyZXRzLnJlZGlzQXV0aFRva2VuLmdyYW50UmVhZChleGVjdXRpb25Sb2xlKTtcbiAgICBwcm9wcy5zZWNyZXRzLmF1dGhlbnRpay5zZWNyZXRLZXkuZ3JhbnRSZWFkKGV4ZWN1dGlvblJvbGUpO1xuICAgIGlmIChwcm9wcy5zZWNyZXRzLmF1dGhlbnRpay5sZGFwU2VydmljZVVzZXIpIHtcbiAgICAgIHByb3BzLnNlY3JldHMuYXV0aGVudGlrLmxkYXBTZXJ2aWNlVXNlci5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG4gICAgfVxuICAgIHByb3BzLnNlY3JldHMuYXV0aGVudGlrLmFkbWluVXNlclBhc3N3b3JkLmdyYW50UmVhZChleGVjdXRpb25Sb2xlKTtcbiAgICBwcm9wcy5zZWNyZXRzLmF1dGhlbnRpay5hZG1pblVzZXJUb2tlbi5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG5cbiAgICAvLyBHcmFudCBleHBsaWNpdCBLTVMgcGVybWlzc2lvbnMgZm9yIHNlY3JldHMgZGVjcnlwdGlvblxuICAgIHByb3BzLmluZnJhc3RydWN0dXJlLmttc0tleS5ncmFudERlY3J5cHQoZXhlY3V0aW9uUm9sZSk7XG5cbiAgICAvLyBHcmFudCBTMyBhY2Nlc3MgdG8gZXhlY3V0aW9uIHJvbGUgZm9yIGVudmlyb25tZW50IGZpbGVzIChuZWVkZWQgZHVyaW5nIHRhc2sgaW5pdGlhbGl6YXRpb24pXG4gICAgaWYgKHByb3BzLnN0b3JhZ2UuczMuZW52RmlsZUtleSkge1xuICAgICAgcHJvcHMuc3RvcmFnZS5zMy5jb25maWdCdWNrZXQuZ3JhbnRSZWFkKGV4ZWN1dGlvblJvbGUpO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSB0YXNrIHJvbGVcbiAgICBjb25zdCB0YXNrUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnV29ya2VyVGFza1JvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnZWNzLXRhc2tzLmFtYXpvbmF3cy5jb20nKSxcbiAgICB9KTtcblxuICAgIC8vIEFkZCBFRlMgcGVybWlzc2lvbnMgZm9yIHRhc2sgcm9sZVxuICAgIHRhc2tSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2VsYXN0aWNmaWxlc3lzdGVtOkNsaWVudE1vdW50JyxcbiAgICAgICAgJ2VsYXN0aWNmaWxlc3lzdGVtOkNsaWVudFdyaXRlJyxcbiAgICAgICAgJ2VsYXN0aWNmaWxlc3lzdGVtOkNsaWVudFJvb3RBY2Nlc3MnLFxuICAgICAgICAnZWxhc3RpY2ZpbGVzeXN0ZW06RGVzY3JpYmVNb3VudFRhcmdldHMnLFxuICAgICAgICAnZWxhc3RpY2ZpbGVzeXN0ZW06RGVzY3JpYmVGaWxlU3lzdGVtcydcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6ZWxhc3RpY2ZpbGVzeXN0ZW06JHtTdGFjay5vZih0aGlzKS5yZWdpb259OiR7U3RhY2sub2YodGhpcykuYWNjb3VudH06ZmlsZS1zeXN0ZW0vJHtwcm9wcy5zdG9yYWdlLmVmcy5maWxlU3lzdGVtSWR9YCxcbiAgICAgICAgYGFybjphd3M6ZWxhc3RpY2ZpbGVzeXN0ZW06JHtTdGFjay5vZih0aGlzKS5yZWdpb259OiR7U3RhY2sub2YodGhpcykuYWNjb3VudH06YWNjZXNzLXBvaW50LyR7cHJvcHMuc3RvcmFnZS5lZnMubWVkaWFBY2Nlc3NQb2ludElkfWAsXG4gICAgICAgIGBhcm46YXdzOmVsYXN0aWNmaWxlc3lzdGVtOiR7U3RhY2sub2YodGhpcykucmVnaW9ufToke1N0YWNrLm9mKHRoaXMpLmFjY291bnR9OmFjY2Vzcy1wb2ludC8ke3Byb3BzLnN0b3JhZ2UuZWZzLmN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50SWR9YFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIEdyYW50IHJlYWQgYWNjZXNzIHRvIFMzIGNvbmZpZ3VyYXRpb24gYnVja2V0IGZvciB0YXNrIHJvbGUgKGZvciBydW50aW1lIGFjY2VzcylcbiAgICBpZiAocHJvcHMuc3RvcmFnZS5zMy5lbnZGaWxlS2V5KSB7XG4gICAgICBwcm9wcy5zdG9yYWdlLnMzLmNvbmZpZ0J1Y2tldC5ncmFudFJlYWQodGFza1JvbGUpO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSB0YXNrIGRlZmluaXRpb25cbiAgICB0aGlzLnRhc2tEZWZpbml0aW9uID0gbmV3IGVjcy5GYXJnYXRlVGFza0RlZmluaXRpb24odGhpcywgJ1dvcmtlclRhc2tEZWYnLCB7XG4gICAgICBjcHU6IHByb3BzLmNvbmZpZy5lY3MudGFza0NwdSxcbiAgICAgIG1lbW9yeUxpbWl0TWlCOiBwcm9wcy5jb25maWcuZWNzLnRhc2tNZW1vcnksXG4gICAgICBleGVjdXRpb25Sb2xlLFxuICAgICAgdGFza1JvbGVcbiAgICB9KTtcblxuICAgIC8vIEFkZCB2b2x1bWVzIGZvciBFRlNcbiAgICB0aGlzLnRhc2tEZWZpbml0aW9uLmFkZFZvbHVtZSh7XG4gICAgICBuYW1lOiAnbWVkaWEnLFxuICAgICAgZWZzVm9sdW1lQ29uZmlndXJhdGlvbjoge1xuICAgICAgICBmaWxlU3lzdGVtSWQ6IHByb3BzLnN0b3JhZ2UuZWZzLmZpbGVTeXN0ZW1JZCxcbiAgICAgICAgdHJhbnNpdEVuY3J5cHRpb246ICdFTkFCTEVEJyxcbiAgICAgICAgYXV0aG9yaXphdGlvbkNvbmZpZzoge1xuICAgICAgICAgIGFjY2Vzc1BvaW50SWQ6IHByb3BzLnN0b3JhZ2UuZWZzLm1lZGlhQWNjZXNzUG9pbnRJZCxcbiAgICAgICAgICBpYW06ICdFTkFCTEVEJ1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICB0aGlzLnRhc2tEZWZpbml0aW9uLmFkZFZvbHVtZSh7XG4gICAgICBuYW1lOiAnY3VzdG9tLXRlbXBsYXRlcycsXG4gICAgICBlZnNWb2x1bWVDb25maWd1cmF0aW9uOiB7XG4gICAgICAgIGZpbGVTeXN0ZW1JZDogcHJvcHMuc3RvcmFnZS5lZnMuZmlsZVN5c3RlbUlkLFxuICAgICAgICB0cmFuc2l0RW5jcnlwdGlvbjogJ0VOQUJMRUQnLFxuICAgICAgICBhdXRob3JpemF0aW9uQ29uZmlnOiB7XG4gICAgICAgICAgYWNjZXNzUG9pbnRJZDogcHJvcHMuc3RvcmFnZS5lZnMuY3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnRJZCxcbiAgICAgICAgICBpYW06ICdFTkFCTEVEJ1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBEZXRlcm1pbmUgRG9ja2VyIGltYWdlIC0gQWx3YXlzIHVzZSBFQ1IgKHdvcmtlcnMgdXNlIHRoZSBzYW1lIGltYWdlIGFzIHNlcnZlcilcbiAgICBpZiAoIXByb3BzLmRlcGxveW1lbnQuZWNyUmVwb3NpdG9yeUFybikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdFQ1IgcmVwb3NpdG9yeSBBUk4gaXMgcmVxdWlyZWQgZm9yIEF1dGhlbnRpayBXb3JrZXIgZGVwbG95bWVudCcpO1xuICAgIH1cbiAgICBcbiAgICAvLyBDb252ZXJ0IEVDUiBBUk4gdG8gcHJvcGVyIHJlcG9zaXRvcnkgVVJJXG4gICAgY29uc3QgZWNyUmVwb3NpdG9yeVVyaSA9IHRoaXMuY29udmVydEVjckFyblRvUmVwb3NpdG9yeVVyaShwcm9wcy5kZXBsb3ltZW50LmVjclJlcG9zaXRvcnlBcm4pO1xuICAgIGNvbnN0IGRvY2tlckltYWdlID0gYCR7ZWNyUmVwb3NpdG9yeVVyaX06YXV0aC1pbmZyYS1zZXJ2ZXItJHtwcm9wcy5kZXBsb3ltZW50LmdpdFNoYX1gO1xuXG4gICAgLy8gUHJlcGFyZSBjb250YWluZXIgZGVmaW5pdGlvbiBvcHRpb25zIGZvciB3b3JrZXJcbiAgICBsZXQgY29udGFpbmVyRGVmaW5pdGlvbk9wdGlvbnM6IGVjcy5Db250YWluZXJEZWZpbml0aW9uT3B0aW9ucyA9IHtcbiAgICAgIGltYWdlOiBlY3MuQ29udGFpbmVySW1hZ2UuZnJvbVJlZ2lzdHJ5KGRvY2tlckltYWdlKSxcbiAgICAgIGxvZ2dpbmc6IGVjcy5Mb2dEcml2ZXJzLmF3c0xvZ3Moe1xuICAgICAgICBzdHJlYW1QcmVmaXg6ICdhdXRoZW50aWstd29ya2VyJyxcbiAgICAgICAgbG9nR3JvdXBcbiAgICAgIH0pLFxuICAgICAgY29tbWFuZDogWyd3b3JrZXInXSwgLy8gV29ya2VyIGNvbW1hbmRcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEFVVEhFTlRJS19QT1NUR1JFU1FMX19IT1NUOiBwcm9wcy5hcHBsaWNhdGlvbi5kYXRhYmFzZS5ob3N0bmFtZSxcbiAgICAgICAgQVVUSEVOVElLX1BPU1RHUkVTUUxfX1VTRVI6ICdhdXRoZW50aWsnLFxuICAgICAgICBBVVRIRU5USUtfUkVESVNfX0hPU1Q6IHByb3BzLmFwcGxpY2F0aW9uLnJlZGlzLmhvc3RuYW1lLFxuICAgICAgICBBVVRIRU5USUtfUkVESVNfX1RMUzogJ1RydWUnLFxuICAgICAgICBBVVRIRU5USUtfUkVESVNfX1RMU19SRVFTOiAncmVxdWlyZWQnLFxuICAgICAgICAvLyBBZGQgZXNzZW50aWFsIGJvb3RzdHJhcCBjb25maWd1cmF0aW9uIGZvciB3b3JrZXJcbiAgICAgICAgQVVUSEVOVElLX0JPT1RTVFJBUF9FTUFJTDogcHJvcHMuYXBwbGljYXRpb24uYWRtaW5Vc2VyRW1haWwsXG4gICAgICAgIEFVVEhFTlRJS19CT09UU1RSQVBfTERBUF9CQVNFRE46IHByb3BzLmFwcGxpY2F0aW9uLmxkYXBCYXNlRG4sXG4gICAgICAgIC8vIEF1dGhlbnRpayBzZXJ2aWNlIGhvc3QgVVJMIGZvciBBUEkgY29tbXVuaWNhdGlvbnMgZnJvbSBMREFQIE91dHBvc3RcbiAgICAgICAgQVVUSEVOVElLX0JPT1RTVFJBUF9MREFQX0FVVEhFTlRJS19IT1NUOiBwcm9wcy5hcHBsaWNhdGlvbi5hdXRoZW50aWtIb3N0IHx8ICcnLFxuICAgICAgfSxcbiAgICAgIHNlY3JldHM6IHtcbiAgICAgICAgQVVUSEVOVElLX1BPU1RHUkVTUUxfX1BBU1NXT1JEOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihwcm9wcy5zZWNyZXRzLmRhdGFiYXNlLCAncGFzc3dvcmQnKSxcbiAgICAgICAgQVVUSEVOVElLX1JFRElTX19QQVNTV09SRDogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIocHJvcHMuc2VjcmV0cy5yZWRpc0F1dGhUb2tlbiksXG4gICAgICAgIEFVVEhFTlRJS19TRUNSRVRfS0VZOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihwcm9wcy5zZWNyZXRzLmF1dGhlbnRpay5zZWNyZXRLZXkpLFxuICAgICAgICAuLi4ocHJvcHMuc2VjcmV0cy5hdXRoZW50aWsubGRhcFNlcnZpY2VVc2VyID8ge1xuICAgICAgICAgIEFVVEhFTlRJS19CT09UU1RSQVBfTERBUFNFUlZJQ0VfVVNFUk5BTUU6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHByb3BzLnNlY3JldHMuYXV0aGVudGlrLmxkYXBTZXJ2aWNlVXNlciwgJ3VzZXJuYW1lJyksXG4gICAgICAgICAgQVVUSEVOVElLX0JPT1RTVFJBUF9MREFQU0VSVklDRV9QQVNTV09SRDogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIocHJvcHMuc2VjcmV0cy5hdXRoZW50aWsubGRhcFNlcnZpY2VVc2VyLCAncGFzc3dvcmQnKSxcbiAgICAgICAgfSA6IHt9KSxcbiAgICAgICAgQVVUSEVOVElLX0JPT1RTVFJBUF9QQVNTV09SRDogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIocHJvcHMuc2VjcmV0cy5hdXRoZW50aWsuYWRtaW5Vc2VyUGFzc3dvcmQsICdwYXNzd29yZCcpLFxuICAgICAgICBBVVRIRU5USUtfQk9PVFNUUkFQX1RPS0VOOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihwcm9wcy5zZWNyZXRzLmF1dGhlbnRpay5hZG1pblVzZXJUb2tlbilcbiAgICAgIH0sXG4gICAgICAvLyBBZGQgYmFzaWMgaGVhbHRoIGNoZWNrIGZvciB3b3JrZXIgKHdvcmtlcnMgZG9uJ3QgZXhwb3NlIEhUVFAgZW5kcG9pbnRzKVxuICAgICAgaGVhbHRoQ2hlY2s6IHtcbiAgICAgICAgY29tbWFuZDogWydDTUQnLCAnYWsnLCAnaGVhbHRoY2hlY2snXSxcbiAgICAgICAgaW50ZXJ2YWw6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgcmV0cmllczogMyxcbiAgICAgICAgc3RhcnRQZXJpb2Q6IER1cmF0aW9uLnNlY29uZHMoNjApXG4gICAgICB9LFxuICAgICAgZXNzZW50aWFsOiB0cnVlXG4gICAgfTtcblxuICAgIC8vIEFkZCBlbnZpcm9ubWVudCBmaWxlcyBpZiBTMyBrZXkgaXMgcHJvdmlkZWQgYW5kIHVzZUF1dGhlbnRpa0NvbmZpZ0ZpbGUgaXMgZW5hYmxlZFxuICAgIGlmIChwcm9wcy5zdG9yYWdlLnMzLmVudkZpbGVLZXkgJiYgcHJvcHMuZGVwbG95bWVudC51c2VDb25maWdGaWxlKSB7XG4gICAgICBjb250YWluZXJEZWZpbml0aW9uT3B0aW9ucyA9IHtcbiAgICAgICAgLi4uY29udGFpbmVyRGVmaW5pdGlvbk9wdGlvbnMsXG4gICAgICAgIGVudmlyb25tZW50RmlsZXM6IFtcbiAgICAgICAgICBlY3MuRW52aXJvbm1lbnRGaWxlLmZyb21CdWNrZXQocHJvcHMuc3RvcmFnZS5zMy5jb25maWdCdWNrZXQsIHByb3BzLnN0b3JhZ2UuczMuZW52RmlsZUtleSlcbiAgICAgICAgXVxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCBjb250YWluZXIgPSB0aGlzLnRhc2tEZWZpbml0aW9uLmFkZENvbnRhaW5lcignQXV0aGVudGlrV29ya2VyJywgY29udGFpbmVyRGVmaW5pdGlvbk9wdGlvbnMpO1xuXG4gICAgLy8gQWRkIG1vdW50IHBvaW50cyBmb3IgRUZTIHZvbHVtZXNcbiAgICBjb250YWluZXIuYWRkTW91bnRQb2ludHMoe1xuICAgICAgY29udGFpbmVyUGF0aDogJy9tZWRpYScsXG4gICAgICBzb3VyY2VWb2x1bWU6ICdtZWRpYScsXG4gICAgICByZWFkT25seTogZmFsc2VcbiAgICB9KTtcblxuICAgIGNvbnRhaW5lci5hZGRNb3VudFBvaW50cyh7XG4gICAgICBjb250YWluZXJQYXRoOiAnL3RlbXBsYXRlcycsXG4gICAgICBzb3VyY2VWb2x1bWU6ICdjdXN0b20tdGVtcGxhdGVzJyxcbiAgICAgIHJlYWRPbmx5OiBmYWxzZVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIEVDUyBzZXJ2aWNlIGZvciB3b3JrZXJcbiAgICB0aGlzLmVjc1NlcnZpY2UgPSBuZXcgZWNzLkZhcmdhdGVTZXJ2aWNlKHRoaXMsICdXb3JrZXJTZXJ2aWNlJywge1xuICAgICAgY2x1c3RlcjogcHJvcHMuaW5mcmFzdHJ1Y3R1cmUuZWNzQ2x1c3RlcixcbiAgICAgIHRhc2tEZWZpbml0aW9uOiB0aGlzLnRhc2tEZWZpbml0aW9uLFxuICAgICAgZGVzaXJlZENvdW50OiBwcm9wcy5jb25maWcuZWNzLndvcmtlckRlc2lyZWRDb3VudCB8fCAxLCAvLyBEZWZhdWx0IHRvIDEgd29ya2VyXG4gICAgICBzZWN1cml0eUdyb3VwczogW3Byb3BzLmluZnJhc3RydWN0dXJlLmVjc1NlY3VyaXR5R3JvdXBdLFxuICAgICAgZW5hYmxlRXhlY3V0ZUNvbW1hbmQ6IHByb3BzLmRlcGxveW1lbnQuZW5hYmxlRXhlY3V0ZSxcbiAgICAgIGFzc2lnblB1YmxpY0lwOiBmYWxzZSxcbiAgICAgIC8vIERpc2FibGUgY2lyY3VpdCBicmVha2VyIHRlbXBvcmFyaWx5IHRvIGdldCBiZXR0ZXIgZXJyb3IgaW5mb3JtYXRpb25cbiAgICAgIC8vIGNpcmN1aXRCcmVha2VyOiB7IHJvbGxiYWNrOiB0cnVlIH1cbiAgICB9KTtcblxuICAgIC8vIEFkZCBhdXRvIHNjYWxpbmcgZm9yIHdvcmtlcnNcbiAgICBjb25zdCBzY2FsaW5nID0gdGhpcy5lY3NTZXJ2aWNlLmF1dG9TY2FsZVRhc2tDb3VudCh7XG4gICAgICBtaW5DYXBhY2l0eTogcHJvcHMuY29uZmlnLmVjcy53b3JrZXJNaW5DYXBhY2l0eSB8fCAxLFxuICAgICAgbWF4Q2FwYWNpdHk6IHByb3BzLmNvbmZpZy5lY3Mud29ya2VyTWF4Q2FwYWNpdHkgfHwgM1xuICAgIH0pO1xuXG4gICAgLy8gU2NhbGUgYmFzZWQgb24gQ1BVIHV0aWxpemF0aW9uICh3b3JrZXJzIG1heSBoYXZlIGRpZmZlcmVudCBzY2FsaW5nIHBhdHRlcm5zKVxuICAgIHNjYWxpbmcuc2NhbGVPbkNwdVV0aWxpemF0aW9uKCdXb3JrZXJDcHVTY2FsaW5nJywge1xuICAgICAgdGFyZ2V0VXRpbGl6YXRpb25QZXJjZW50OiA4MCwgLy8gSGlnaGVyIHRocmVzaG9sZCBmb3Igd29ya2Vyc1xuICAgICAgc2NhbGVJbkNvb2xkb3duOiBEdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgc2NhbGVPdXRDb29sZG93bjogRHVyYXRpb24ubWludXRlcygyKVxuICAgIH0pO1xuICB9XG59XG4iXX0=