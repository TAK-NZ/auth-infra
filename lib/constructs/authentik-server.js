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
            retention: props.config.monitoring.logRetentionDays,
            removalPolicy: props.config.general.removalPolicy
        });
        // Create config bucket if using config file
        let configBucket;
        if (props.useAuthentikConfigFile) {
            configBucket = new aws_cdk_lib_1.aws_s3.Bucket(this, 'ConfigBucket', {
                bucketName: `${id}-config`.toLowerCase(),
                removalPolicy: props.config.general.removalPolicy,
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
        // Grant S3 access to execution role for environment files (needed during task initialization)
        if (props.envFileS3Key) {
            props.s3ConfBucket.grantRead(executionRole);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aGVudGlrLXNlcnZlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGhlbnRpay1zZXJ2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUE7O0dBRUc7QUFDSCwyQ0FBdUM7QUFDdkMsNkNBYXFCO0FBMElyQjs7R0FFRztBQUNILE1BQWEsZUFBZ0IsU0FBUSxzQkFBUztJQVc1Qzs7OztPQUlHO0lBQ0ssNEJBQTRCLENBQUMsTUFBYztRQUNqRCw0Q0FBNEM7UUFDNUMsSUFBSSxtQkFBSyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQy9CLG1GQUFtRjtZQUNuRixPQUFPLGdCQUFFLENBQUMsR0FBRyxDQUFDLHdEQUF3RCxFQUFFO2dCQUN0RSxPQUFPLEVBQUUsZ0JBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLGdCQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDNUMsTUFBTSxFQUFFLGdCQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxnQkFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQzNDLFFBQVEsRUFBRSxnQkFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsZ0JBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLGdCQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxnQkFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQzNFLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCw2REFBNkQ7UUFDN0QsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNuQyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFD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QyxDQUFDO1FBRUgsbUJBQW1CO1FBQ25CLFdBQVcsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRXZDLDJDQUEyQztRQUMzQyxRQUFRLENBQUMsU0FBUyxDQUFDLGVBQWUsRUFBRTtZQUNsQyxNQUFNLEVBQUUsd0NBQUssQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUM7U0FDcEQsQ0FBQyxDQUFDO1FBRUgsT0FBTyxXQUFXLENBQUM7SUFDckIsQ0FBQztDQUNGO0FBbFJELDBDQWtSQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQXV0aGVudGlrIFNlcnZlciBDb25zdHJ1Y3QgLSBTZXJ2ZXIgY29udGFpbmVyIGFuZCBFQ1Mgc2VydmljZSBjb25maWd1cmF0aW9uXG4gKi9cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHtcbiAgYXdzX2VjMiBhcyBlYzIsXG4gIGF3c19lY3MgYXMgZWNzLFxuICBhd3NfZWxhc3RpY2xvYWRiYWxhbmNpbmd2MiBhcyBlbGJ2MixcbiAgYXdzX2xvZ3MgYXMgbG9ncyxcbiAgYXdzX3NlY3JldHNtYW5hZ2VyIGFzIHNlY3JldHNtYW5hZ2VyLFxuICBhd3NfczMgYXMgczMsXG4gIGF3c19pYW0gYXMgaWFtLFxuICBhd3Nfa21zIGFzIGttcyxcbiAgRHVyYXRpb24sXG4gIEZuLFxuICBUb2tlbixcbiAgU3RhY2tcbn0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHR5cGUgeyBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZyB9IGZyb20gJy4uL2Vudmlyb25tZW50LWNvbmZpZyc7XG5cbi8qKlxuICogUHJvcGVydGllcyBmb3IgdGhlIEF1dGhlbnRpayBTZXJ2ZXIgY29uc3RydWN0XG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aGVudGlrU2VydmVyUHJvcHMge1xuICAvKipcbiAgICogRW52aXJvbm1lbnQgbmFtZSAoZS5nLiAncHJvZCcsICdkZXYnLCBldGMuKVxuICAgKi9cbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcblxuICAvKipcbiAgICogRW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxuICAgKi9cbiAgY29uZmlnOiBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZztcblxuICAvKipcbiAgICogVlBDIGZvciBkZXBsb3ltZW50XG4gICAqL1xuICB2cGM6IGVjMi5JVnBjO1xuXG4gIC8qKlxuICAgKiBTZWN1cml0eSBncm91cCBmb3IgRUNTIHRhc2tzXG4gICAqL1xuICBlY3NTZWN1cml0eUdyb3VwOiBlYzIuU2VjdXJpdHlHcm91cDtcblxuICAvKipcbiAgICogRUNTIGNsdXN0ZXJcbiAgICovXG4gIGVjc0NsdXN0ZXI6IGVjcy5JQ2x1c3RlcjtcblxuICAvKipcbiAgICogUzMgY29uZmlndXJhdGlvbiBidWNrZXQgZm9yIGVudmlyb25tZW50IGZpbGVzXG4gICAqL1xuICBzM0NvbmZCdWNrZXQ6IHMzLklCdWNrZXQ7XG5cbiAgLyoqXG4gICAqIFMzIFVSSSBmb3IgdGhlIGVudmlyb25tZW50IGZpbGUgKG9wdGlvbmFsKVxuICAgKi9cbiAgZW52RmlsZVMzVXJpPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBTMyBrZXkgZm9yIHRoZSBlbnZpcm9ubWVudCBmaWxlIChvcHRpb25hbClcbiAgICovXG4gIGVudkZpbGVTM0tleT86IHN0cmluZztcblxuICAvKipcbiAgICogQXV0aGVudGlrIGFkbWluIHVzZXIgZW1haWxcbiAgICovXG4gIGFkbWluVXNlckVtYWlsOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIExEQVAgYmFzZSBETlxuICAgKi9cbiAgbGRhcEJhc2VEbjogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBVc2UgYXV0aGVudGlrIGNvbmZpZyBmaWxlIGZyb20gUzMgKGRlZmF1bHQ6IGZhbHNlKVxuICAgKi9cbiAgdXNlQXV0aGVudGlrQ29uZmlnRmlsZTogYm9vbGVhbjtcblxuICAvKipcbiAgICogRUNSIHJlcG9zaXRvcnkgQVJOIGZvciBFQ1IgaW1hZ2VzXG4gICAqL1xuICBlY3JSZXBvc2l0b3J5QXJuPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBHaXQgU0hBIGZvciBEb2NrZXIgaW1hZ2UgdGFnZ2luZ1xuICAgKi9cbiAgZ2l0U2hhOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEFsbG93IFNTSCBleGVjIGludG8gY29udGFpbmVyXG4gICAqL1xuICBlbmFibGVFeGVjdXRlOiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBEYXRhYmFzZSBzZWNyZXRcbiAgICovXG4gIGRiU2VjcmV0OiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xuXG4gIC8qKlxuICAgKiBEYXRhYmFzZSBob3N0bmFtZVxuICAgKi9cbiAgZGJIb3N0bmFtZTogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBSZWRpcyBhdXRoIHRva2VuXG4gICAqL1xuICByZWRpc0F1dGhUb2tlbjogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcblxuICAvKipcbiAgICogUmVkaXMgaG9zdG5hbWVcbiAgICovXG4gIHJlZGlzSG9zdG5hbWU6IHN0cmluZztcblxuICAvKipcbiAgICogQXV0aGVudGlrIHNlY3JldCBrZXlcbiAgICovXG4gIHNlY3JldEtleTogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcblxuICAvKipcbiAgICogQWRtaW4gdXNlciBwYXNzd29yZFxuICAgKi9cbiAgYWRtaW5Vc2VyUGFzc3dvcmQ6IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG5cbiAgLyoqXG4gICAqIEFkbWluIHVzZXIgdG9rZW5cbiAgICovXG4gIGFkbWluVXNlclRva2VuOiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xuXG4gIC8qKlxuICAgKiBMREFQIHRva2VuXG4gICAqL1xuICBsZGFwVG9rZW46IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG5cbiAgLyoqXG4gICAqIEtNUyBrZXkgZm9yIHNlY3JldHMgZW5jcnlwdGlvblxuICAgKi9cbiAga21zS2V5OiBrbXMuSUtleTtcblxuICAvKipcbiAgICogRUZTIGZpbGUgc3lzdGVtIElEXG4gICAqL1xuICBlZnNJZDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBFRlMgbWVkaWEgYWNjZXNzIHBvaW50IElEXG4gICAqL1xuICBlZnNNZWRpYUFjY2Vzc1BvaW50SWQ6IHN0cmluZztcblxuICAvKipcbiAgICogRUZTIGN1c3RvbSB0ZW1wbGF0ZXMgYWNjZXNzIHBvaW50IElEXG4gICAqL1xuICBlZnNDdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludElkOiBzdHJpbmc7XG59XG5cbi8qKlxuICogQ0RLIGNvbnN0cnVjdCBmb3IgdGhlIEF1dGhlbnRpayBzZXJ2ZXIgY29udGFpbmVyIGFuZCBFQ1Mgc2VydmljZVxuICovXG5leHBvcnQgY2xhc3MgQXV0aGVudGlrU2VydmVyIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgLyoqXG4gICAqIFRoZSBFQ1MgdGFzayBkZWZpbml0aW9uIGZvciB0aGUgQXV0aGVudGlrIHNlcnZlclxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IHRhc2tEZWZpbml0aW9uOiBlY3MuVGFza0RlZmluaXRpb247XG5cbiAgLyoqXG4gICAqIFRoZSBFQ1Mgc2VydmljZSBmb3IgQXV0aGVudGlrIHNlcnZlclxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGVjc1NlcnZpY2U6IGVjcy5GYXJnYXRlU2VydmljZTtcblxuICAvKipcbiAgICogQ29udmVydHMgYW4gRUNSIHJlcG9zaXRvcnkgQVJOIHRvIGEgcHJvcGVyIEVDUiByZXBvc2l0b3J5IFVSSSBmb3IgRG9ja2VyIGltYWdlc1xuICAgKiBAcGFyYW0gZWNyQXJuIC0gRUNSIHJlcG9zaXRvcnkgQVJOIChlLmcuLCBcImFybjphd3M6ZWNyOnJlZ2lvbjphY2NvdW50OnJlcG9zaXRvcnkvcmVwby1uYW1lXCIpXG4gICAqIEByZXR1cm5zIEVDUiByZXBvc2l0b3J5IFVSSSAoZS5nLiwgXCJhY2NvdW50LmRrci5lY3IucmVnaW9uLmFtYXpvbmF3cy5jb20vcmVwby1uYW1lXCIpXG4gICAqL1xuICBwcml2YXRlIGNvbnZlcnRFY3JBcm5Ub1JlcG9zaXRvcnlVcmkoZWNyQXJuOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIC8vIEhhbmRsZSBDREsgdG9rZW5zICh1bnJlc29sdmVkIHJlZmVyZW5jZXMpXG4gICAgaWYgKFRva2VuLmlzVW5yZXNvbHZlZChlY3JBcm4pKSB7XG4gICAgICAvLyBGb3IgdG9rZW5zLCB3ZSBuZWVkIHRvIHVzZSBDREsncyBGbi5zdWIgdG8gcGVyZm9ybSB0aGUgY29udmVyc2lvbiBhdCBkZXBsb3kgdGltZVxuICAgICAgcmV0dXJuIEZuLnN1YignJHtBY2NvdW50fS5ka3IuZWNyLiR7UmVnaW9ufS5hbWF6b25hd3MuY29tLyR7UmVwb05hbWV9Jywge1xuICAgICAgICBBY2NvdW50OiBGbi5zZWxlY3QoNCwgRm4uc3BsaXQoJzonLCBlY3JBcm4pKSxcbiAgICAgICAgUmVnaW9uOiBGbi5zZWxlY3QoMywgRm4uc3BsaXQoJzonLCBlY3JBcm4pKSxcbiAgICAgICAgUmVwb05hbWU6IEZuLnNlbGVjdCgxLCBGbi5zcGxpdCgnLycsIEZuLnNlbGVjdCg1LCBGbi5zcGxpdCgnOicsIGVjckFybikpKSlcbiAgICAgIH0pO1xuICAgIH1cbiAgICBcbiAgICAvLyBQYXJzZSBBUk46IGFybjphd3M6ZWNyOnJlZ2lvbjphY2NvdW50OnJlcG9zaXRvcnkvcmVwby1uYW1lXG4gICAgY29uc3QgYXJuUGFydHMgPSBlY3JBcm4uc3BsaXQoJzonKTtcbiAgICBpZiAoYXJuUGFydHMubGVuZ3RoICE9PSA2IHx8ICFhcm5QYXJ0c1s1XS5zdGFydHNXaXRoKCdyZXBvc2l0b3J5LycpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgRUNSIHJlcG9zaXRvcnkgQVJOIGZvcm1hdDogJHtlY3JBcm59YCk7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IHJlZ2lvbiA9IGFyblBhcnRzWzNdO1xuICAgIGNvbnN0IGFjY291bnQgPSBhcm5QYXJ0c1s0XTtcbiAgICBjb25zdCByZXBvc2l0b3J5TmFtZSA9IGFyblBhcnRzWzVdLnJlcGxhY2UoJ3JlcG9zaXRvcnkvJywgJycpO1xuICAgIFxuICAgIHJldHVybiBgJHthY2NvdW50fS5ka3IuZWNyLiR7cmVnaW9ufS5hbWF6b25hd3MuY29tLyR7cmVwb3NpdG9yeU5hbWV9YDtcbiAgfVxuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBBdXRoZW50aWtTZXJ2ZXJQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIGxvZyBncm91cFxuICAgIGNvbnN0IGxvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1NlcnZlckxvZ3MnLCB7XG4gICAgICBsb2dHcm91cE5hbWU6IGAke2lkfS1zZXJ2ZXJgLFxuICAgICAgcmV0ZW50aW9uOiBwcm9wcy5jb25maWcubW9uaXRvcmluZy5sb2dSZXRlbnRpb25EYXlzLFxuICAgICAgcmVtb3ZhbFBvbGljeTogcHJvcHMuY29uZmlnLmdlbmVyYWwucmVtb3ZhbFBvbGljeVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIGNvbmZpZyBidWNrZXQgaWYgdXNpbmcgY29uZmlnIGZpbGVcbiAgICBsZXQgY29uZmlnQnVja2V0O1xuICAgIGlmIChwcm9wcy51c2VBdXRoZW50aWtDb25maWdGaWxlKSB7XG4gICAgICBjb25maWdCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdDb25maWdCdWNrZXQnLCB7XG4gICAgICAgIGJ1Y2tldE5hbWU6IGAke2lkfS1jb25maWdgLnRvTG93ZXJDYXNlKCksXG4gICAgICAgIHJlbW92YWxQb2xpY3k6IHByb3BzLmNvbmZpZy5nZW5lcmFsLnJlbW92YWxQb2xpY3ksXG4gICAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIHRhc2sgZXhlY3V0aW9uIHJvbGVcbiAgICBjb25zdCBleGVjdXRpb25Sb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdUYXNrRXhlY3V0aW9uUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlY3MtdGFza3MuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FtYXpvbkVDU1Rhc2tFeGVjdXRpb25Sb2xlUG9saWN5JylcbiAgICAgIF1cbiAgICB9KTtcblxuICAgIC8vIEFkZCBwZXJtaXNzaW9ucyB0byBhY2Nlc3Mgc2VjcmV0c1xuICAgIHByb3BzLmRiU2VjcmV0LmdyYW50UmVhZChleGVjdXRpb25Sb2xlKTtcbiAgICBwcm9wcy5yZWRpc0F1dGhUb2tlbi5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG4gICAgcHJvcHMuc2VjcmV0S2V5LmdyYW50UmVhZChleGVjdXRpb25Sb2xlKTtcbiAgICBwcm9wcy5hZG1pblVzZXJQYXNzd29yZC5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG4gICAgcHJvcHMuYWRtaW5Vc2VyVG9rZW4uZ3JhbnRSZWFkKGV4ZWN1dGlvblJvbGUpO1xuXG4gICAgLy8gR3JhbnQgZXhwbGljaXQgS01TIHBlcm1pc3Npb25zIGZvciBzZWNyZXRzIGRlY3J5cHRpb25cbiAgICBwcm9wcy5rbXNLZXkuZ3JhbnREZWNyeXB0KGV4ZWN1dGlvblJvbGUpO1xuXG4gICAgLy8gR3JhbnQgUzMgYWNjZXNzIHRvIGV4ZWN1dGlvbiByb2xlIGZvciBlbnZpcm9ubWVudCBmaWxlcyAobmVlZGVkIGR1cmluZyB0YXNrIGluaXRpYWxpemF0aW9uKVxuICAgIGlmIChwcm9wcy5lbnZGaWxlUzNLZXkpIHtcbiAgICAgIHByb3BzLnMzQ29uZkJ1Y2tldC5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIHRhc2sgcm9sZVxuICAgIGNvbnN0IHRhc2tSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdUYXNrUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlY3MtdGFza3MuYW1hem9uYXdzLmNvbScpLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIEVGUyBwZXJtaXNzaW9ucyBmb3IgdGFzayByb2xlXG4gICAgdGFza1JvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZWxhc3RpY2ZpbGVzeXN0ZW06Q2xpZW50TW91bnQnLFxuICAgICAgICAnZWxhc3RpY2ZpbGVzeXN0ZW06Q2xpZW50V3JpdGUnLFxuICAgICAgICAnZWxhc3RpY2ZpbGVzeXN0ZW06Q2xpZW50Um9vdEFjY2VzcycsXG4gICAgICAgICdlbGFzdGljZmlsZXN5c3RlbTpEZXNjcmliZU1vdW50VGFyZ2V0cycsXG4gICAgICAgICdlbGFzdGljZmlsZXN5c3RlbTpEZXNjcmliZUZpbGVTeXN0ZW1zJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czplbGFzdGljZmlsZXN5c3RlbToke1N0YWNrLm9mKHRoaXMpLnJlZ2lvbn06JHtTdGFjay5vZih0aGlzKS5hY2NvdW50fTpmaWxlLXN5c3RlbS8ke3Byb3BzLmVmc0lkfWAsXG4gICAgICAgIGBhcm46YXdzOmVsYXN0aWNmaWxlc3lzdGVtOiR7U3RhY2sub2YodGhpcykucmVnaW9ufToke1N0YWNrLm9mKHRoaXMpLmFjY291bnR9OmFjY2Vzcy1wb2ludC8ke3Byb3BzLmVmc01lZGlhQWNjZXNzUG9pbnRJZH1gLFxuICAgICAgICBgYXJuOmF3czplbGFzdGljZmlsZXN5c3RlbToke1N0YWNrLm9mKHRoaXMpLnJlZ2lvbn06JHtTdGFjay5vZih0aGlzKS5hY2NvdW50fTphY2Nlc3MtcG9pbnQvJHtwcm9wcy5lZnNDdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludElkfWBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBBZGQgdGFzayBwZXJtaXNzaW9uc1xuICAgIGlmIChwcm9wcy51c2VBdXRoZW50aWtDb25maWdGaWxlICYmIGNvbmZpZ0J1Y2tldCkge1xuICAgICAgY29uZmlnQnVja2V0LmdyYW50UmVhZCh0YXNrUm9sZSk7XG4gICAgfVxuXG4gICAgLy8gR3JhbnQgcmVhZCBhY2Nlc3MgdG8gUzMgY29uZmlndXJhdGlvbiBidWNrZXQgZm9yIGVudmlyb25tZW50IGZpbGVzXG4gICAgaWYgKHByb3BzLmVudkZpbGVTM0tleSkge1xuICAgICAgcHJvcHMuczNDb25mQnVja2V0LmdyYW50UmVhZCh0YXNrUm9sZSk7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIHRhc2sgZGVmaW5pdGlvblxuICAgIHRoaXMudGFza0RlZmluaXRpb24gPSBuZXcgZWNzLkZhcmdhdGVUYXNrRGVmaW5pdGlvbih0aGlzLCAnVGFza0RlZicsIHtcbiAgICAgIGNwdTogcHJvcHMuY29uZmlnLmVjcy50YXNrQ3B1LFxuICAgICAgbWVtb3J5TGltaXRNaUI6IHByb3BzLmNvbmZpZy5lY3MudGFza01lbW9yeSxcbiAgICAgIGV4ZWN1dGlvblJvbGUsXG4gICAgICB0YXNrUm9sZVxuICAgIH0pO1xuXG4gICAgLy8gQWRkIHZvbHVtZXMgZm9yIEVGU1xuICAgIHRoaXMudGFza0RlZmluaXRpb24uYWRkVm9sdW1lKHtcbiAgICAgIG5hbWU6ICdtZWRpYScsXG4gICAgICBlZnNWb2x1bWVDb25maWd1cmF0aW9uOiB7XG4gICAgICAgIGZpbGVTeXN0ZW1JZDogcHJvcHMuZWZzSWQsXG4gICAgICAgIHRyYW5zaXRFbmNyeXB0aW9uOiAnRU5BQkxFRCcsXG4gICAgICAgIGF1dGhvcml6YXRpb25Db25maWc6IHtcbiAgICAgICAgICBhY2Nlc3NQb2ludElkOiBwcm9wcy5lZnNNZWRpYUFjY2Vzc1BvaW50SWQsXG4gICAgICAgICAgaWFtOiAnRU5BQkxFRCdcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgdGhpcy50YXNrRGVmaW5pdGlvbi5hZGRWb2x1bWUoe1xuICAgICAgbmFtZTogJ2N1c3RvbS10ZW1wbGF0ZXMnLFxuICAgICAgZWZzVm9sdW1lQ29uZmlndXJhdGlvbjoge1xuICAgICAgICBmaWxlU3lzdGVtSWQ6IHByb3BzLmVmc0lkLFxuICAgICAgICB0cmFuc2l0RW5jcnlwdGlvbjogJ0VOQUJMRUQnLFxuICAgICAgICBhdXRob3JpemF0aW9uQ29uZmlnOiB7XG4gICAgICAgICAgYWNjZXNzUG9pbnRJZDogcHJvcHMuZWZzQ3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnRJZCxcbiAgICAgICAgICBpYW06ICdFTkFCTEVEJ1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBEZXRlcm1pbmUgRG9ja2VyIGltYWdlIC0gRUNSIHJlcG9zaXRvcnkgaXMgcmVxdWlyZWRcbiAgICBpZiAoIXByb3BzLmVjclJlcG9zaXRvcnlBcm4pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignZWNyUmVwb3NpdG9yeUFybiBpcyByZXF1aXJlZCBmb3IgQXV0aGVudGlrIFNlcnZlciBkZXBsb3ltZW50Jyk7XG4gICAgfVxuICAgIFxuICAgIC8vIENvbnZlcnQgRUNSIEFSTiB0byBwcm9wZXIgcmVwb3NpdG9yeSBVUklcbiAgICBjb25zdCBlY3JSZXBvc2l0b3J5VXJpID0gdGhpcy5jb252ZXJ0RWNyQXJuVG9SZXBvc2l0b3J5VXJpKHByb3BzLmVjclJlcG9zaXRvcnlBcm4pO1xuICAgIGNvbnN0IGRvY2tlckltYWdlID0gYCR7ZWNyUmVwb3NpdG9yeVVyaX06YXV0aC1pbmZyYS1zZXJ2ZXItJHtwcm9wcy5naXRTaGF9YDtcblxuICAgIC8vIFByZXBhcmUgY29udGFpbmVyIGRlZmluaXRpb24gb3B0aW9uc1xuICAgIGxldCBjb250YWluZXJEZWZpbml0aW9uT3B0aW9uczogZWNzLkNvbnRhaW5lckRlZmluaXRpb25PcHRpb25zID0ge1xuICAgICAgaW1hZ2U6IGVjcy5Db250YWluZXJJbWFnZS5mcm9tUmVnaXN0cnkoZG9ja2VySW1hZ2UpLFxuICAgICAgbG9nZ2luZzogZWNzLkxvZ0RyaXZlcnMuYXdzTG9ncyh7XG4gICAgICAgIHN0cmVhbVByZWZpeDogJ2F1dGhlbnRpay1zZXJ2ZXInLFxuICAgICAgICBsb2dHcm91cFxuICAgICAgfSksXG4gICAgICBjb21tYW5kOiBbJ3NlcnZlciddLCAvLyBTZXJ2ZXIgY29tbWFuZFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgQVVUSEVOVElLX1BPU1RHUkVTUUxfX0hPU1Q6IHByb3BzLmRiSG9zdG5hbWUsXG4gICAgICAgIEFVVEhFTlRJS19QT1NUR1JFU1FMX19VU0VSOiAnYXV0aGVudGlrJyxcbiAgICAgICAgQVVUSEVOVElLX1JFRElTX19IT1NUOiBwcm9wcy5yZWRpc0hvc3RuYW1lLFxuICAgICAgICBBVVRIRU5USUtfUkVESVNfX1RMUzogJ1RydWUnLFxuICAgICAgICBBVVRIRU5USUtfUkVESVNfX1RMU19SRVFTOiAncmVxdWlyZWQnLFxuICAgICAgfSxcbiAgICAgIHNlY3JldHM6IHtcbiAgICAgICAgQVVUSEVOVElLX1BPU1RHUkVTUUxfX1BBU1NXT1JEOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihwcm9wcy5kYlNlY3JldCwgJ3Bhc3N3b3JkJyksXG4gICAgICAgIEFVVEhFTlRJS19SRURJU19fUEFTU1dPUkQ6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHByb3BzLnJlZGlzQXV0aFRva2VuKSxcbiAgICAgICAgQVVUSEVOVElLX1NFQ1JFVF9LRVk6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHByb3BzLnNlY3JldEtleSksXG4gICAgICB9LFxuICAgICAgaGVhbHRoQ2hlY2s6IHtcbiAgICAgICAgY29tbWFuZDogWydDTUQnLCAnYWsnLCAnaGVhbHRoY2hlY2snXSxcbiAgICAgICAgaW50ZXJ2YWw6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDUpLFxuICAgICAgICByZXRyaWVzOiAzLFxuICAgICAgICBzdGFydFBlcmlvZDogRHVyYXRpb24uc2Vjb25kcyg2MClcbiAgICAgIH0sXG4gICAgICBlc3NlbnRpYWw6IHRydWVcbiAgICB9O1xuXG4gICAgLy8gQWRkIGVudmlyb25tZW50IGZpbGVzIGlmIFMzIGtleSBpcyBwcm92aWRlZCBhbmQgdXNlQXV0aGVudGlrQ29uZmlnRmlsZSBpcyBlbmFibGVkXG4gICAgaWYgKHByb3BzLmVudkZpbGVTM0tleSAmJiBwcm9wcy51c2VBdXRoZW50aWtDb25maWdGaWxlKSB7XG4gICAgICBjb250YWluZXJEZWZpbml0aW9uT3B0aW9ucyA9IHtcbiAgICAgICAgLi4uY29udGFpbmVyRGVmaW5pdGlvbk9wdGlvbnMsXG4gICAgICAgIGVudmlyb25tZW50RmlsZXM6IFtcbiAgICAgICAgICBlY3MuRW52aXJvbm1lbnRGaWxlLmZyb21CdWNrZXQocHJvcHMuczNDb25mQnVja2V0LCBwcm9wcy5lbnZGaWxlUzNLZXkpXG4gICAgICAgIF1cbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgY29udGFpbmVyID0gdGhpcy50YXNrRGVmaW5pdGlvbi5hZGRDb250YWluZXIoJ0F1dGhlbnRpa1NlcnZlcicsIGNvbnRhaW5lckRlZmluaXRpb25PcHRpb25zKTtcblxuICAgIC8vIEFkZCBwb3J0IG1hcHBpbmdzXG4gICAgY29udGFpbmVyLmFkZFBvcnRNYXBwaW5ncyh7XG4gICAgICBjb250YWluZXJQb3J0OiA5MDAwLFxuICAgICAgaG9zdFBvcnQ6IDkwMDAsXG4gICAgICBwcm90b2NvbDogZWNzLlByb3RvY29sLlRDUFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIG1vdW50IHBvaW50cyBmb3IgRUZTIHZvbHVtZXNcbiAgICBjb250YWluZXIuYWRkTW91bnRQb2ludHMoe1xuICAgICAgY29udGFpbmVyUGF0aDogJy9tZWRpYScsXG4gICAgICBzb3VyY2VWb2x1bWU6ICdtZWRpYScsXG4gICAgICByZWFkT25seTogZmFsc2VcbiAgICB9KTtcblxuICAgIGNvbnRhaW5lci5hZGRNb3VudFBvaW50cyh7XG4gICAgICBjb250YWluZXJQYXRoOiAnL3RlbXBsYXRlcycsXG4gICAgICBzb3VyY2VWb2x1bWU6ICdjdXN0b20tdGVtcGxhdGVzJyxcbiAgICAgIHJlYWRPbmx5OiBmYWxzZVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIEVDUyBzZXJ2aWNlXG4gICAgdGhpcy5lY3NTZXJ2aWNlID0gbmV3IGVjcy5GYXJnYXRlU2VydmljZSh0aGlzLCAnU2VydmljZScsIHtcbiAgICAgIGNsdXN0ZXI6IHByb3BzLmVjc0NsdXN0ZXIsXG4gICAgICB0YXNrRGVmaW5pdGlvbjogdGhpcy50YXNrRGVmaW5pdGlvbixcbiAgICAgIGhlYWx0aENoZWNrR3JhY2VQZXJpb2Q6IER1cmF0aW9uLnNlY29uZHMoMzAwKSxcbiAgICAgIGRlc2lyZWRDb3VudDogcHJvcHMuY29uZmlnLmVjcy5kZXNpcmVkQ291bnQsXG4gICAgICBzZWN1cml0eUdyb3VwczogW3Byb3BzLmVjc1NlY3VyaXR5R3JvdXBdLFxuICAgICAgZW5hYmxlRXhlY3V0ZUNvbW1hbmQ6IHByb3BzLmVuYWJsZUV4ZWN1dGUsXG4gICAgICBhc3NpZ25QdWJsaWNJcDogZmFsc2UsXG4gICAgICAvLyBEaXNhYmxlIGNpcmN1aXQgYnJlYWtlciB0ZW1wb3JhcmlseSB0byBnZXQgYmV0dGVyIGVycm9yIGluZm9ybWF0aW9uXG4gICAgICAvLyBjaXJjdWl0QnJlYWtlcjogeyByb2xsYmFjazogdHJ1ZSB9XG4gICAgfSk7XG5cbiAgICAvLyBBZGQgYXV0byBzY2FsaW5nXG4gICAgY29uc3Qgc2NhbGluZyA9IHRoaXMuZWNzU2VydmljZS5hdXRvU2NhbGVUYXNrQ291bnQoe1xuICAgICAgbWluQ2FwYWNpdHk6IHByb3BzLmNvbmZpZy5lY3MubWluQ2FwYWNpdHksXG4gICAgICBtYXhDYXBhY2l0eTogcHJvcHMuY29uZmlnLmVjcy5tYXhDYXBhY2l0eVxuICAgIH0pO1xuXG4gICAgLy8gU2NhbGUgYmFzZWQgb24gQ1BVIHV0aWxpemF0aW9uXG4gICAgc2NhbGluZy5zY2FsZU9uQ3B1VXRpbGl6YXRpb24oJ0NwdVNjYWxpbmcnLCB7XG4gICAgICB0YXJnZXRVdGlsaXphdGlvblBlcmNlbnQ6IDcwLFxuICAgICAgc2NhbGVJbkNvb2xkb3duOiBEdXJhdGlvbi5taW51dGVzKDMpLFxuICAgICAgc2NhbGVPdXRDb29sZG93bjogRHVyYXRpb24ubWludXRlcygxKVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhbmQgcmVnaXN0ZXIgYSB0YXJnZXQgZ3JvdXAgZm9yIHRoaXMgc2VydmljZVxuICAgKi9cbiAgcHVibGljIGNyZWF0ZVRhcmdldEdyb3VwKHZwYzogZWMyLklWcGMsIGxpc3RlbmVyOiBlbGJ2Mi5BcHBsaWNhdGlvbkxpc3RlbmVyKTogZWxidjIuQXBwbGljYXRpb25UYXJnZXRHcm91cCB7XG4gICAgLy8gQ3JlYXRlIHRhcmdldCBncm91cCBmb3IgdGhlIEF1dGhlbnRpayBzZXJ2aWNlXG4gICAgY29uc3QgdGFyZ2V0R3JvdXAgPSBuZXcgZWxidjIuQXBwbGljYXRpb25UYXJnZXRHcm91cCh0aGlzLCAnVGFyZ2V0R3JvdXAnLCB7XG4gICAgICB2cGM6IHZwYyxcbiAgICAgIHRhcmdldFR5cGU6IGVsYnYyLlRhcmdldFR5cGUuSVAsXG4gICAgICBwb3J0OiA5MDAwLFxuICAgICAgcHJvdG9jb2w6IGVsYnYyLkFwcGxpY2F0aW9uUHJvdG9jb2wuSFRUUCxcbiAgICAgIGhlYWx0aENoZWNrOiB7XG4gICAgICAgIHBhdGg6ICcvLS9oZWFsdGgvbGl2ZS8nLFxuICAgICAgICBpbnRlcnZhbDogRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIGhlYWx0aHlIdHRwQ29kZXM6ICcyMDAtMjk5J1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gUmVnaXN0ZXIgdGFyZ2V0c1xuICAgIHRhcmdldEdyb3VwLmFkZFRhcmdldCh0aGlzLmVjc1NlcnZpY2UpO1xuXG4gICAgLy8gQWRkIGRlZmF1bHQgYWN0aW9uIHRvIHRoZSBIVFRQUyBsaXN0ZW5lclxuICAgIGxpc3RlbmVyLmFkZEFjdGlvbignRGVmYXVsdEFjdGlvbicsIHtcbiAgICAgIGFjdGlvbjogZWxidjIuTGlzdGVuZXJBY3Rpb24uZm9yd2FyZChbdGFyZ2V0R3JvdXBdKVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHRhcmdldEdyb3VwO1xuICB9XG59XG4iXX0=