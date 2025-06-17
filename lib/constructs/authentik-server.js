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
        // Create the log group
        const logGroup = new aws_cdk_lib_1.aws_logs.LogGroup(this, 'ServerLogs', {
            logGroupName: `${id}-server`,
            retention: aws_cdk_lib_1.aws_logs.RetentionDays.ONE_WEEK,
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY
        });
        // Create config bucket if using config file
        let configBucket;
        if (props.useAuthentikConfigFile) {
            configBucket = new aws_cdk_lib_1.aws_s3.Bucket(this, 'ConfigBucket', {
                bucketName: `${id}-config`.toLowerCase(),
                removalPolicy: aws_cdk_lib_1.RemovalPolicy.RETAIN,
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
        props.dbSecret.grantRead(executionRole);
        props.redisAuthToken.grantRead(executionRole);
        props.secretKey.grantRead(executionRole);
        props.adminUserPassword.grantRead(executionRole);
        props.adminUserToken.grantRead(executionRole);
        // Grant explicit KMS permissions for secrets decryption
        props.kmsKey.grantDecrypt(executionRole);
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
                `arn:aws:elasticfilesystem:${aws_cdk_lib_1.Stack.of(this).region}:${aws_cdk_lib_1.Stack.of(this).account}:file-system/${props.efsId}`,
                `arn:aws:elasticfilesystem:${aws_cdk_lib_1.Stack.of(this).region}:${aws_cdk_lib_1.Stack.of(this).account}:access-point/${props.efsMediaAccessPointId}`,
                `arn:aws:elasticfilesystem:${aws_cdk_lib_1.Stack.of(this).region}:${aws_cdk_lib_1.Stack.of(this).account}:access-point/${props.efsCustomTemplatesAccessPointId}`
            ]
        }));
        // Add task permissions
        if (props.useAuthentikConfigFile && configBucket) {
            configBucket.grantRead(taskRole);
        }
        // Grant read access to S3 configuration bucket for environment files
        if (props.envFileS3Key) {
            props.s3ConfBucket.grantRead(taskRole);
        }
        // Create task definition
        this.taskDefinition = new aws_cdk_lib_1.aws_ecs.FargateTaskDefinition(this, 'TaskDef', {
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
        // Determine Docker image - ECR repository is required
        if (!props.ecrRepositoryArn) {
            throw new Error('ecrRepositoryArn is required for Authentik Server deployment');
        }
        // Convert ECR ARN to proper repository URI
        const ecrRepositoryUri = this.convertEcrArnToRepositoryUri(props.ecrRepositoryArn);
        const dockerImage = `${ecrRepositoryUri}:auth-infra-server-${props.gitSha}`;
        // Prepare container definition options
        let containerDefinitionOptions = {
            image: aws_cdk_lib_1.aws_ecs.ContainerImage.fromRegistry(dockerImage),
            logging: aws_cdk_lib_1.aws_ecs.LogDrivers.awsLogs({
                streamPrefix: 'authentik-server',
                logGroup
            }),
            command: ['server'], // Server command
            environment: {
                AUTHENTIK_POSTGRESQL__HOST: props.dbHostname,
                AUTHENTIK_POSTGRESQL__USER: 'authentik',
                AUTHENTIK_REDIS__HOST: props.redisHostname,
                AUTHENTIK_REDIS__TLS: 'True',
                AUTHENTIK_REDIS__TLS_REQS: 'required',
            },
            secrets: {
                AUTHENTIK_POSTGRESQL__PASSWORD: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.dbSecret, 'password'),
                AUTHENTIK_REDIS__PASSWORD: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.redisAuthToken),
                AUTHENTIK_SECRET_KEY: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.secretKey),
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
        // Add environment files if S3 key is provided and useAuthentikConfigFile is enabled
        if (props.envFileS3Key && props.useAuthentikConfigFile) {
            containerDefinitionOptions = {
                ...containerDefinitionOptions,
                environmentFiles: [
                    aws_cdk_lib_1.aws_ecs.EnvironmentFile.fromBucket(props.s3ConfBucket, props.envFileS3Key)
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
            cluster: props.ecsCluster,
            taskDefinition: this.taskDefinition,
            healthCheckGracePeriod: aws_cdk_lib_1.Duration.seconds(300),
            desiredCount: props.config.ecs.desiredCount,
            securityGroups: [props.ecsSecurityGroup],
            enableExecuteCommand: props.enableExecute,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aGVudGlrLXNlcnZlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGhlbnRpay1zZXJ2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUE7O0dBRUc7QUFDSCwyQ0FBdUM7QUFDdkMsNkNBY3FCO0FBMElyQjs7R0FFRztBQUNILE1BQWEsZUFBZ0IsU0FBUSxzQkFBUztJQVc1Qzs7OztPQUlHO0lBQ0ssNEJBQTRCLENBQUMsTUFBYztRQUNqRCw0Q0FBNEM7UUFDNUMsSUFBSSxtQkFBSyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQy9CLG1GQUFtRjtZQUNuRixPQUFPLGdCQUFFLENBQUMsR0FBRyxDQUFDLHdEQUF3RCxFQUFFO2dCQUN0RSxPQUFPLEVBQUUsZ0JBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLGdCQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDNUMsTUFBTSxFQUFFLGdCQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxnQkFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQzNDLFFBQVEsRUFBRSxnQkFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsZ0JBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLGdCQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxnQkFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQzNFLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCw2REFBNkQ7UUFDN0QsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNuQyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFD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TyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUM7U0FDcEQsQ0FBQyxDQUFDO1FBRUgsT0FBTyxXQUFXLENBQUM7SUFDckIsQ0FBQztDQUNGO0FBN1FELDBDQTZRQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQXV0aGVudGlrIFNlcnZlciBDb25zdHJ1Y3QgLSBTZXJ2ZXIgY29udGFpbmVyIGFuZCBFQ1Mgc2VydmljZSBjb25maWd1cmF0aW9uXG4gKi9cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHtcbiAgYXdzX2VjMiBhcyBlYzIsXG4gIGF3c19lY3MgYXMgZWNzLFxuICBhd3NfZWxhc3RpY2xvYWRiYWxhbmNpbmd2MiBhcyBlbGJ2MixcbiAgYXdzX2xvZ3MgYXMgbG9ncyxcbiAgYXdzX3NlY3JldHNtYW5hZ2VyIGFzIHNlY3JldHNtYW5hZ2VyLFxuICBhd3NfczMgYXMgczMsXG4gIGF3c19pYW0gYXMgaWFtLFxuICBhd3Nfa21zIGFzIGttcyxcbiAgRHVyYXRpb24sXG4gIFJlbW92YWxQb2xpY3ksXG4gIEZuLFxuICBUb2tlbixcbiAgU3RhY2tcbn0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHR5cGUgeyBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZyB9IGZyb20gJy4uL2Vudmlyb25tZW50LWNvbmZpZyc7XG5cbi8qKlxuICogUHJvcGVydGllcyBmb3IgdGhlIEF1dGhlbnRpayBTZXJ2ZXIgY29uc3RydWN0XG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aGVudGlrU2VydmVyUHJvcHMge1xuICAvKipcbiAgICogRW52aXJvbm1lbnQgbmFtZSAoZS5nLiAncHJvZCcsICdkZXYnLCBldGMuKVxuICAgKi9cbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcblxuICAvKipcbiAgICogRW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxuICAgKi9cbiAgY29uZmlnOiBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZztcblxuICAvKipcbiAgICogVlBDIGZvciBkZXBsb3ltZW50XG4gICAqL1xuICB2cGM6IGVjMi5JVnBjO1xuXG4gIC8qKlxuICAgKiBTZWN1cml0eSBncm91cCBmb3IgRUNTIHRhc2tzXG4gICAqL1xuICBlY3NTZWN1cml0eUdyb3VwOiBlYzIuU2VjdXJpdHlHcm91cDtcblxuICAvKipcbiAgICogRUNTIGNsdXN0ZXJcbiAgICovXG4gIGVjc0NsdXN0ZXI6IGVjcy5JQ2x1c3RlcjtcblxuICAvKipcbiAgICogUzMgY29uZmlndXJhdGlvbiBidWNrZXQgZm9yIGVudmlyb25tZW50IGZpbGVzXG4gICAqL1xuICBzM0NvbmZCdWNrZXQ6IHMzLklCdWNrZXQ7XG5cbiAgLyoqXG4gICAqIFMzIFVSSSBmb3IgdGhlIGVudmlyb25tZW50IGZpbGUgKG9wdGlvbmFsKVxuICAgKi9cbiAgZW52RmlsZVMzVXJpPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBTMyBrZXkgZm9yIHRoZSBlbnZpcm9ubWVudCBmaWxlIChvcHRpb25hbClcbiAgICovXG4gIGVudkZpbGVTM0tleT86IHN0cmluZztcblxuICAvKipcbiAgICogQXV0aGVudGlrIGFkbWluIHVzZXIgZW1haWxcbiAgICovXG4gIGFkbWluVXNlckVtYWlsOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIExEQVAgYmFzZSBETlxuICAgKi9cbiAgbGRhcEJhc2VEbjogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBVc2UgYXV0aGVudGlrIGNvbmZpZyBmaWxlIGZyb20gUzMgKGRlZmF1bHQ6IGZhbHNlKVxuICAgKi9cbiAgdXNlQXV0aGVudGlrQ29uZmlnRmlsZTogYm9vbGVhbjtcblxuICAvKipcbiAgICogRUNSIHJlcG9zaXRvcnkgQVJOIGZvciBFQ1IgaW1hZ2VzXG4gICAqL1xuICBlY3JSZXBvc2l0b3J5QXJuPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBHaXQgU0hBIGZvciBEb2NrZXIgaW1hZ2UgdGFnZ2luZ1xuICAgKi9cbiAgZ2l0U2hhOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEFsbG93IFNTSCBleGVjIGludG8gY29udGFpbmVyXG4gICAqL1xuICBlbmFibGVFeGVjdXRlOiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBEYXRhYmFzZSBzZWNyZXRcbiAgICovXG4gIGRiU2VjcmV0OiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xuXG4gIC8qKlxuICAgKiBEYXRhYmFzZSBob3N0bmFtZVxuICAgKi9cbiAgZGJIb3N0bmFtZTogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBSZWRpcyBhdXRoIHRva2VuXG4gICAqL1xuICByZWRpc0F1dGhUb2tlbjogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcblxuICAvKipcbiAgICogUmVkaXMgaG9zdG5hbWVcbiAgICovXG4gIHJlZGlzSG9zdG5hbWU6IHN0cmluZztcblxuICAvKipcbiAgICogQXV0aGVudGlrIHNlY3JldCBrZXlcbiAgICovXG4gIHNlY3JldEtleTogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcblxuICAvKipcbiAgICogQWRtaW4gdXNlciBwYXNzd29yZFxuICAgKi9cbiAgYWRtaW5Vc2VyUGFzc3dvcmQ6IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG5cbiAgLyoqXG4gICAqIEFkbWluIHVzZXIgdG9rZW5cbiAgICovXG4gIGFkbWluVXNlclRva2VuOiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xuXG4gIC8qKlxuICAgKiBMREFQIHRva2VuXG4gICAqL1xuICBsZGFwVG9rZW46IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG5cbiAgLyoqXG4gICAqIEtNUyBrZXkgZm9yIHNlY3JldHMgZW5jcnlwdGlvblxuICAgKi9cbiAga21zS2V5OiBrbXMuSUtleTtcblxuICAvKipcbiAgICogRUZTIGZpbGUgc3lzdGVtIElEXG4gICAqL1xuICBlZnNJZDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBFRlMgbWVkaWEgYWNjZXNzIHBvaW50IElEXG4gICAqL1xuICBlZnNNZWRpYUFjY2Vzc1BvaW50SWQ6IHN0cmluZztcblxuICAvKipcbiAgICogRUZTIGN1c3RvbSB0ZW1wbGF0ZXMgYWNjZXNzIHBvaW50IElEXG4gICAqL1xuICBlZnNDdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludElkOiBzdHJpbmc7XG59XG5cbi8qKlxuICogQ0RLIGNvbnN0cnVjdCBmb3IgdGhlIEF1dGhlbnRpayBzZXJ2ZXIgY29udGFpbmVyIGFuZCBFQ1Mgc2VydmljZVxuICovXG5leHBvcnQgY2xhc3MgQXV0aGVudGlrU2VydmVyIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgLyoqXG4gICAqIFRoZSBFQ1MgdGFzayBkZWZpbml0aW9uIGZvciB0aGUgQXV0aGVudGlrIHNlcnZlclxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IHRhc2tEZWZpbml0aW9uOiBlY3MuVGFza0RlZmluaXRpb247XG5cbiAgLyoqXG4gICAqIFRoZSBFQ1Mgc2VydmljZSBmb3IgQXV0aGVudGlrIHNlcnZlclxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGVjc1NlcnZpY2U6IGVjcy5GYXJnYXRlU2VydmljZTtcblxuICAvKipcbiAgICogQ29udmVydHMgYW4gRUNSIHJlcG9zaXRvcnkgQVJOIHRvIGEgcHJvcGVyIEVDUiByZXBvc2l0b3J5IFVSSSBmb3IgRG9ja2VyIGltYWdlc1xuICAgKiBAcGFyYW0gZWNyQXJuIC0gRUNSIHJlcG9zaXRvcnkgQVJOIChlLmcuLCBcImFybjphd3M6ZWNyOnJlZ2lvbjphY2NvdW50OnJlcG9zaXRvcnkvcmVwby1uYW1lXCIpXG4gICAqIEByZXR1cm5zIEVDUiByZXBvc2l0b3J5IFVSSSAoZS5nLiwgXCJhY2NvdW50LmRrci5lY3IucmVnaW9uLmFtYXpvbmF3cy5jb20vcmVwby1uYW1lXCIpXG4gICAqL1xuICBwcml2YXRlIGNvbnZlcnRFY3JBcm5Ub1JlcG9zaXRvcnlVcmkoZWNyQXJuOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIC8vIEhhbmRsZSBDREsgdG9rZW5zICh1bnJlc29sdmVkIHJlZmVyZW5jZXMpXG4gICAgaWYgKFRva2VuLmlzVW5yZXNvbHZlZChlY3JBcm4pKSB7XG4gICAgICAvLyBGb3IgdG9rZW5zLCB3ZSBuZWVkIHRvIHVzZSBDREsncyBGbi5zdWIgdG8gcGVyZm9ybSB0aGUgY29udmVyc2lvbiBhdCBkZXBsb3kgdGltZVxuICAgICAgcmV0dXJuIEZuLnN1YignJHtBY2NvdW50fS5ka3IuZWNyLiR7UmVnaW9ufS5hbWF6b25hd3MuY29tLyR7UmVwb05hbWV9Jywge1xuICAgICAgICBBY2NvdW50OiBGbi5zZWxlY3QoNCwgRm4uc3BsaXQoJzonLCBlY3JBcm4pKSxcbiAgICAgICAgUmVnaW9uOiBGbi5zZWxlY3QoMywgRm4uc3BsaXQoJzonLCBlY3JBcm4pKSxcbiAgICAgICAgUmVwb05hbWU6IEZuLnNlbGVjdCgxLCBGbi5zcGxpdCgnLycsIEZuLnNlbGVjdCg1LCBGbi5zcGxpdCgnOicsIGVjckFybikpKSlcbiAgICAgIH0pO1xuICAgIH1cbiAgICBcbiAgICAvLyBQYXJzZSBBUk46IGFybjphd3M6ZWNyOnJlZ2lvbjphY2NvdW50OnJlcG9zaXRvcnkvcmVwby1uYW1lXG4gICAgY29uc3QgYXJuUGFydHMgPSBlY3JBcm4uc3BsaXQoJzonKTtcbiAgICBpZiAoYXJuUGFydHMubGVuZ3RoICE9PSA2IHx8ICFhcm5QYXJ0c1s1XS5zdGFydHNXaXRoKCdyZXBvc2l0b3J5LycpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgRUNSIHJlcG9zaXRvcnkgQVJOIGZvcm1hdDogJHtlY3JBcm59YCk7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IHJlZ2lvbiA9IGFyblBhcnRzWzNdO1xuICAgIGNvbnN0IGFjY291bnQgPSBhcm5QYXJ0c1s0XTtcbiAgICBjb25zdCByZXBvc2l0b3J5TmFtZSA9IGFyblBhcnRzWzVdLnJlcGxhY2UoJ3JlcG9zaXRvcnkvJywgJycpO1xuICAgIFxuICAgIHJldHVybiBgJHthY2NvdW50fS5ka3IuZWNyLiR7cmVnaW9ufS5hbWF6b25hd3MuY29tLyR7cmVwb3NpdG9yeU5hbWV9YDtcbiAgfVxuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBBdXRoZW50aWtTZXJ2ZXJQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIGxvZyBncm91cFxuICAgIGNvbnN0IGxvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1NlcnZlckxvZ3MnLCB7XG4gICAgICBsb2dHcm91cE5hbWU6IGAke2lkfS1zZXJ2ZXJgLFxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICByZW1vdmFsUG9saWN5OiBSZW1vdmFsUG9saWN5LkRFU1RST1lcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBjb25maWcgYnVja2V0IGlmIHVzaW5nIGNvbmZpZyBmaWxlXG4gICAgbGV0IGNvbmZpZ0J1Y2tldDtcbiAgICBpZiAocHJvcHMudXNlQXV0aGVudGlrQ29uZmlnRmlsZSkge1xuICAgICAgY29uZmlnQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnQ29uZmlnQnVja2V0Jywge1xuICAgICAgICBidWNrZXROYW1lOiBgJHtpZH0tY29uZmlnYC50b0xvd2VyQ2FzZSgpLFxuICAgICAgICByZW1vdmFsUG9saWN5OiBSZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgdGFzayBleGVjdXRpb24gcm9sZVxuICAgIGNvbnN0IGV4ZWN1dGlvblJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1Rhc2tFeGVjdXRpb25Sb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2Vjcy10YXNrcy5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQW1hem9uRUNTVGFza0V4ZWN1dGlvblJvbGVQb2xpY3knKVxuICAgICAgXVxuICAgIH0pO1xuXG4gICAgLy8gQWRkIHBlcm1pc3Npb25zIHRvIGFjY2VzcyBzZWNyZXRzXG4gICAgcHJvcHMuZGJTZWNyZXQuZ3JhbnRSZWFkKGV4ZWN1dGlvblJvbGUpO1xuICAgIHByb3BzLnJlZGlzQXV0aFRva2VuLmdyYW50UmVhZChleGVjdXRpb25Sb2xlKTtcbiAgICBwcm9wcy5zZWNyZXRLZXkuZ3JhbnRSZWFkKGV4ZWN1dGlvblJvbGUpO1xuICAgIHByb3BzLmFkbWluVXNlclBhc3N3b3JkLmdyYW50UmVhZChleGVjdXRpb25Sb2xlKTtcbiAgICBwcm9wcy5hZG1pblVzZXJUb2tlbi5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG5cbiAgICAvLyBHcmFudCBleHBsaWNpdCBLTVMgcGVybWlzc2lvbnMgZm9yIHNlY3JldHMgZGVjcnlwdGlvblxuICAgIHByb3BzLmttc0tleS5ncmFudERlY3J5cHQoZXhlY3V0aW9uUm9sZSk7XG5cbiAgICAvLyBDcmVhdGUgdGFzayByb2xlXG4gICAgY29uc3QgdGFza1JvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1Rhc2tSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2Vjcy10YXNrcy5hbWF6b25hd3MuY29tJyksXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgRUZTIHBlcm1pc3Npb25zIGZvciB0YXNrIHJvbGVcbiAgICB0YXNrUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdlbGFzdGljZmlsZXN5c3RlbTpDbGllbnRNb3VudCcsXG4gICAgICAgICdlbGFzdGljZmlsZXN5c3RlbTpDbGllbnRXcml0ZScsXG4gICAgICAgICdlbGFzdGljZmlsZXN5c3RlbTpDbGllbnRSb290QWNjZXNzJyxcbiAgICAgICAgJ2VsYXN0aWNmaWxlc3lzdGVtOkRlc2NyaWJlTW91bnRUYXJnZXRzJyxcbiAgICAgICAgJ2VsYXN0aWNmaWxlc3lzdGVtOkRlc2NyaWJlRmlsZVN5c3RlbXMnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOmVsYXN0aWNmaWxlc3lzdGVtOiR7U3RhY2sub2YodGhpcykucmVnaW9ufToke1N0YWNrLm9mKHRoaXMpLmFjY291bnR9OmZpbGUtc3lzdGVtLyR7cHJvcHMuZWZzSWR9YCxcbiAgICAgICAgYGFybjphd3M6ZWxhc3RpY2ZpbGVzeXN0ZW06JHtTdGFjay5vZih0aGlzKS5yZWdpb259OiR7U3RhY2sub2YodGhpcykuYWNjb3VudH06YWNjZXNzLXBvaW50LyR7cHJvcHMuZWZzTWVkaWFBY2Nlc3NQb2ludElkfWAsXG4gICAgICAgIGBhcm46YXdzOmVsYXN0aWNmaWxlc3lzdGVtOiR7U3RhY2sub2YodGhpcykucmVnaW9ufToke1N0YWNrLm9mKHRoaXMpLmFjY291bnR9OmFjY2Vzcy1wb2ludC8ke3Byb3BzLmVmc0N1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50SWR9YFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIEFkZCB0YXNrIHBlcm1pc3Npb25zXG4gICAgaWYgKHByb3BzLnVzZUF1dGhlbnRpa0NvbmZpZ0ZpbGUgJiYgY29uZmlnQnVja2V0KSB7XG4gICAgICBjb25maWdCdWNrZXQuZ3JhbnRSZWFkKHRhc2tSb2xlKTtcbiAgICB9XG5cbiAgICAvLyBHcmFudCByZWFkIGFjY2VzcyB0byBTMyBjb25maWd1cmF0aW9uIGJ1Y2tldCBmb3IgZW52aXJvbm1lbnQgZmlsZXNcbiAgICBpZiAocHJvcHMuZW52RmlsZVMzS2V5KSB7XG4gICAgICBwcm9wcy5zM0NvbmZCdWNrZXQuZ3JhbnRSZWFkKHRhc2tSb2xlKTtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgdGFzayBkZWZpbml0aW9uXG4gICAgdGhpcy50YXNrRGVmaW5pdGlvbiA9IG5ldyBlY3MuRmFyZ2F0ZVRhc2tEZWZpbml0aW9uKHRoaXMsICdUYXNrRGVmJywge1xuICAgICAgY3B1OiBwcm9wcy5jb25maWcuZWNzLnRhc2tDcHUsXG4gICAgICBtZW1vcnlMaW1pdE1pQjogcHJvcHMuY29uZmlnLmVjcy50YXNrTWVtb3J5LFxuICAgICAgZXhlY3V0aW9uUm9sZSxcbiAgICAgIHRhc2tSb2xlXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgdm9sdW1lcyBmb3IgRUZTXG4gICAgdGhpcy50YXNrRGVmaW5pdGlvbi5hZGRWb2x1bWUoe1xuICAgICAgbmFtZTogJ21lZGlhJyxcbiAgICAgIGVmc1ZvbHVtZUNvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgZmlsZVN5c3RlbUlkOiBwcm9wcy5lZnNJZCxcbiAgICAgICAgdHJhbnNpdEVuY3J5cHRpb246ICdFTkFCTEVEJyxcbiAgICAgICAgYXV0aG9yaXphdGlvbkNvbmZpZzoge1xuICAgICAgICAgIGFjY2Vzc1BvaW50SWQ6IHByb3BzLmVmc01lZGlhQWNjZXNzUG9pbnRJZCxcbiAgICAgICAgICBpYW06ICdFTkFCTEVEJ1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICB0aGlzLnRhc2tEZWZpbml0aW9uLmFkZFZvbHVtZSh7XG4gICAgICBuYW1lOiAnY3VzdG9tLXRlbXBsYXRlcycsXG4gICAgICBlZnNWb2x1bWVDb25maWd1cmF0aW9uOiB7XG4gICAgICAgIGZpbGVTeXN0ZW1JZDogcHJvcHMuZWZzSWQsXG4gICAgICAgIHRyYW5zaXRFbmNyeXB0aW9uOiAnRU5BQkxFRCcsXG4gICAgICAgIGF1dGhvcml6YXRpb25Db25maWc6IHtcbiAgICAgICAgICBhY2Nlc3NQb2ludElkOiBwcm9wcy5lZnNDdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludElkLFxuICAgICAgICAgIGlhbTogJ0VOQUJMRUQnXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIERldGVybWluZSBEb2NrZXIgaW1hZ2UgLSBFQ1IgcmVwb3NpdG9yeSBpcyByZXF1aXJlZFxuICAgIGlmICghcHJvcHMuZWNyUmVwb3NpdG9yeUFybikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdlY3JSZXBvc2l0b3J5QXJuIGlzIHJlcXVpcmVkIGZvciBBdXRoZW50aWsgU2VydmVyIGRlcGxveW1lbnQnKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQ29udmVydCBFQ1IgQVJOIHRvIHByb3BlciByZXBvc2l0b3J5IFVSSVxuICAgIGNvbnN0IGVjclJlcG9zaXRvcnlVcmkgPSB0aGlzLmNvbnZlcnRFY3JBcm5Ub1JlcG9zaXRvcnlVcmkocHJvcHMuZWNyUmVwb3NpdG9yeUFybik7XG4gICAgY29uc3QgZG9ja2VySW1hZ2UgPSBgJHtlY3JSZXBvc2l0b3J5VXJpfTphdXRoLWluZnJhLXNlcnZlci0ke3Byb3BzLmdpdFNoYX1gO1xuXG4gICAgLy8gUHJlcGFyZSBjb250YWluZXIgZGVmaW5pdGlvbiBvcHRpb25zXG4gICAgbGV0IGNvbnRhaW5lckRlZmluaXRpb25PcHRpb25zOiBlY3MuQ29udGFpbmVyRGVmaW5pdGlvbk9wdGlvbnMgPSB7XG4gICAgICBpbWFnZTogZWNzLkNvbnRhaW5lckltYWdlLmZyb21SZWdpc3RyeShkb2NrZXJJbWFnZSksXG4gICAgICBsb2dnaW5nOiBlY3MuTG9nRHJpdmVycy5hd3NMb2dzKHtcbiAgICAgICAgc3RyZWFtUHJlZml4OiAnYXV0aGVudGlrLXNlcnZlcicsXG4gICAgICAgIGxvZ0dyb3VwXG4gICAgICB9KSxcbiAgICAgIGNvbW1hbmQ6IFsnc2VydmVyJ10sIC8vIFNlcnZlciBjb21tYW5kXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBBVVRIRU5USUtfUE9TVEdSRVNRTF9fSE9TVDogcHJvcHMuZGJIb3N0bmFtZSxcbiAgICAgICAgQVVUSEVOVElLX1BPU1RHUkVTUUxfX1VTRVI6ICdhdXRoZW50aWsnLFxuICAgICAgICBBVVRIRU5USUtfUkVESVNfX0hPU1Q6IHByb3BzLnJlZGlzSG9zdG5hbWUsXG4gICAgICAgIEFVVEhFTlRJS19SRURJU19fVExTOiAnVHJ1ZScsXG4gICAgICAgIEFVVEhFTlRJS19SRURJU19fVExTX1JFUVM6ICdyZXF1aXJlZCcsXG4gICAgICB9LFxuICAgICAgc2VjcmV0czoge1xuICAgICAgICBBVVRIRU5USUtfUE9TVEdSRVNRTF9fUEFTU1dPUkQ6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHByb3BzLmRiU2VjcmV0LCAncGFzc3dvcmQnKSxcbiAgICAgICAgQVVUSEVOVElLX1JFRElTX19QQVNTV09SRDogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIocHJvcHMucmVkaXNBdXRoVG9rZW4pLFxuICAgICAgICBBVVRIRU5USUtfU0VDUkVUX0tFWTogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIocHJvcHMuc2VjcmV0S2V5KSxcbiAgICAgIH0sXG4gICAgICBoZWFsdGhDaGVjazoge1xuICAgICAgICBjb21tYW5kOiBbJ0NNRCcsICdhaycsICdoZWFsdGhjaGVjayddLFxuICAgICAgICBpbnRlcnZhbDogRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoNSksXG4gICAgICAgIHJldHJpZXM6IDMsXG4gICAgICAgIHN0YXJ0UGVyaW9kOiBEdXJhdGlvbi5zZWNvbmRzKDYwKVxuICAgICAgfSxcbiAgICAgIGVzc2VudGlhbDogdHJ1ZVxuICAgIH07XG5cbiAgICAvLyBBZGQgZW52aXJvbm1lbnQgZmlsZXMgaWYgUzMga2V5IGlzIHByb3ZpZGVkIGFuZCB1c2VBdXRoZW50aWtDb25maWdGaWxlIGlzIGVuYWJsZWRcbiAgICBpZiAocHJvcHMuZW52RmlsZVMzS2V5ICYmIHByb3BzLnVzZUF1dGhlbnRpa0NvbmZpZ0ZpbGUpIHtcbiAgICAgIGNvbnRhaW5lckRlZmluaXRpb25PcHRpb25zID0ge1xuICAgICAgICAuLi5jb250YWluZXJEZWZpbml0aW9uT3B0aW9ucyxcbiAgICAgICAgZW52aXJvbm1lbnRGaWxlczogW1xuICAgICAgICAgIGVjcy5FbnZpcm9ubWVudEZpbGUuZnJvbUJ1Y2tldChwcm9wcy5zM0NvbmZCdWNrZXQsIHByb3BzLmVudkZpbGVTM0tleSlcbiAgICAgICAgXVxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCBjb250YWluZXIgPSB0aGlzLnRhc2tEZWZpbml0aW9uLmFkZENvbnRhaW5lcignQXV0aGVudGlrU2VydmVyJywgY29udGFpbmVyRGVmaW5pdGlvbk9wdGlvbnMpO1xuXG4gICAgLy8gQWRkIHBvcnQgbWFwcGluZ3NcbiAgICBjb250YWluZXIuYWRkUG9ydE1hcHBpbmdzKHtcbiAgICAgIGNvbnRhaW5lclBvcnQ6IDkwMDAsXG4gICAgICBob3N0UG9ydDogOTAwMCxcbiAgICAgIHByb3RvY29sOiBlY3MuUHJvdG9jb2wuVENQXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgbW91bnQgcG9pbnRzIGZvciBFRlMgdm9sdW1lc1xuICAgIGNvbnRhaW5lci5hZGRNb3VudFBvaW50cyh7XG4gICAgICBjb250YWluZXJQYXRoOiAnL21lZGlhJyxcbiAgICAgIHNvdXJjZVZvbHVtZTogJ21lZGlhJyxcbiAgICAgIHJlYWRPbmx5OiBmYWxzZVxuICAgIH0pO1xuXG4gICAgY29udGFpbmVyLmFkZE1vdW50UG9pbnRzKHtcbiAgICAgIGNvbnRhaW5lclBhdGg6ICcvdGVtcGxhdGVzJyxcbiAgICAgIHNvdXJjZVZvbHVtZTogJ2N1c3RvbS10ZW1wbGF0ZXMnLFxuICAgICAgcmVhZE9ubHk6IGZhbHNlXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgRUNTIHNlcnZpY2VcbiAgICB0aGlzLmVjc1NlcnZpY2UgPSBuZXcgZWNzLkZhcmdhdGVTZXJ2aWNlKHRoaXMsICdTZXJ2aWNlJywge1xuICAgICAgY2x1c3RlcjogcHJvcHMuZWNzQ2x1c3RlcixcbiAgICAgIHRhc2tEZWZpbml0aW9uOiB0aGlzLnRhc2tEZWZpbml0aW9uLFxuICAgICAgaGVhbHRoQ2hlY2tHcmFjZVBlcmlvZDogRHVyYXRpb24uc2Vjb25kcygzMDApLFxuICAgICAgZGVzaXJlZENvdW50OiBwcm9wcy5jb25maWcuZWNzLmRlc2lyZWRDb3VudCxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbcHJvcHMuZWNzU2VjdXJpdHlHcm91cF0sXG4gICAgICBlbmFibGVFeGVjdXRlQ29tbWFuZDogcHJvcHMuZW5hYmxlRXhlY3V0ZSxcbiAgICAgIGFzc2lnblB1YmxpY0lwOiBmYWxzZSxcbiAgICAgIC8vIERpc2FibGUgY2lyY3VpdCBicmVha2VyIHRlbXBvcmFyaWx5IHRvIGdldCBiZXR0ZXIgZXJyb3IgaW5mb3JtYXRpb25cbiAgICAgIC8vIGNpcmN1aXRCcmVha2VyOiB7IHJvbGxiYWNrOiB0cnVlIH1cbiAgICB9KTtcblxuICAgIC8vIEFkZCBhdXRvIHNjYWxpbmdcbiAgICBjb25zdCBzY2FsaW5nID0gdGhpcy5lY3NTZXJ2aWNlLmF1dG9TY2FsZVRhc2tDb3VudCh7XG4gICAgICBtaW5DYXBhY2l0eTogcHJvcHMuY29uZmlnLmVjcy5taW5DYXBhY2l0eSxcbiAgICAgIG1heENhcGFjaXR5OiBwcm9wcy5jb25maWcuZWNzLm1heENhcGFjaXR5XG4gICAgfSk7XG5cbiAgICAvLyBTY2FsZSBiYXNlZCBvbiBDUFUgdXRpbGl6YXRpb25cbiAgICBzY2FsaW5nLnNjYWxlT25DcHVVdGlsaXphdGlvbignQ3B1U2NhbGluZycsIHtcbiAgICAgIHRhcmdldFV0aWxpemF0aW9uUGVyY2VudDogNzAsXG4gICAgICBzY2FsZUluQ29vbGRvd246IER1cmF0aW9uLm1pbnV0ZXMoMyksXG4gICAgICBzY2FsZU91dENvb2xkb3duOiBEdXJhdGlvbi5taW51dGVzKDEpXG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGFuZCByZWdpc3RlciBhIHRhcmdldCBncm91cCBmb3IgdGhpcyBzZXJ2aWNlXG4gICAqL1xuICBwdWJsaWMgY3JlYXRlVGFyZ2V0R3JvdXAodnBjOiBlYzIuSVZwYywgbGlzdGVuZXI6IGVsYnYyLkFwcGxpY2F0aW9uTGlzdGVuZXIpOiBlbGJ2Mi5BcHBsaWNhdGlvblRhcmdldEdyb3VwIHtcbiAgICAvLyBDcmVhdGUgdGFyZ2V0IGdyb3VwIGZvciB0aGUgQXV0aGVudGlrIHNlcnZpY2VcbiAgICBjb25zdCB0YXJnZXRHcm91cCA9IG5ldyBlbGJ2Mi5BcHBsaWNhdGlvblRhcmdldEdyb3VwKHRoaXMsICdUYXJnZXRHcm91cCcsIHtcbiAgICAgIHZwYzogdnBjLFxuICAgICAgdGFyZ2V0VHlwZTogZWxidjIuVGFyZ2V0VHlwZS5JUCxcbiAgICAgIHBvcnQ6IDkwMDAsXG4gICAgICBwcm90b2NvbDogZWxidjIuQXBwbGljYXRpb25Qcm90b2NvbC5IVFRQLFxuICAgICAgaGVhbHRoQ2hlY2s6IHtcbiAgICAgICAgcGF0aDogJy8tL2hlYWx0aC9saXZlLycsXG4gICAgICAgIGludGVydmFsOiBEdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgaGVhbHRoeUh0dHBDb2RlczogJzIwMC0yOTknXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBSZWdpc3RlciB0YXJnZXRzXG4gICAgdGFyZ2V0R3JvdXAuYWRkVGFyZ2V0KHRoaXMuZWNzU2VydmljZSk7XG5cbiAgICAvLyBBZGQgZGVmYXVsdCBhY3Rpb24gdG8gdGhlIEhUVFBTIGxpc3RlbmVyXG4gICAgbGlzdGVuZXIuYWRkQWN0aW9uKCdEZWZhdWx0QWN0aW9uJywge1xuICAgICAgYWN0aW9uOiBlbGJ2Mi5MaXN0ZW5lckFjdGlvbi5mb3J3YXJkKFt0YXJnZXRHcm91cF0pXG4gICAgfSk7XG5cbiAgICByZXR1cm4gdGFyZ2V0R3JvdXA7XG4gIH1cbn1cbiJdfQ==