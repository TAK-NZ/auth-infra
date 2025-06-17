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
            retention: aws_cdk_lib_1.aws_logs.RetentionDays.ONE_WEEK,
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY
        });
        // Create task execution role
        const executionRole = new aws_cdk_lib_1.aws_iam.Role(this, 'WorkerTaskExecutionRole', {
            assumedBy: new aws_cdk_lib_1.aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
            managedPolicies: [
                aws_cdk_lib_1.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
            ]
        });
        // Add permissions to access secrets
        props.dbSecret.grantRead(executionRole);
        props.redisAuthToken.grantRead(executionRole);
        props.secretKey.grantRead(executionRole);
        props.ldapServiceUser.grantRead(executionRole);
        props.adminUserPassword.grantRead(executionRole);
        props.adminUserToken.grantRead(executionRole);
        // Grant explicit KMS permissions for secrets decryption
        props.kmsKey.grantDecrypt(executionRole);
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
                `arn:aws:elasticfilesystem:${aws_cdk_lib_1.Stack.of(this).region}:${aws_cdk_lib_1.Stack.of(this).account}:file-system/${props.efsId}`,
                `arn:aws:elasticfilesystem:${aws_cdk_lib_1.Stack.of(this).region}:${aws_cdk_lib_1.Stack.of(this).account}:access-point/${props.efsMediaAccessPointId}`,
                `arn:aws:elasticfilesystem:${aws_cdk_lib_1.Stack.of(this).region}:${aws_cdk_lib_1.Stack.of(this).account}:access-point/${props.efsCustomTemplatesAccessPointId}`
            ]
        }));
        // Grant read access to S3 configuration bucket for environment files
        if (props.envFileS3Key) {
            props.s3ConfBucket.grantRead(taskRole);
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
        if (!props.ecrRepositoryArn) {
            throw new Error('ECR repository ARN is required for Authentik Worker deployment');
        }
        // Convert ECR ARN to proper repository URI
        const ecrRepositoryUri = this.convertEcrArnToRepositoryUri(props.ecrRepositoryArn);
        const dockerImage = `${ecrRepositoryUri}:auth-infra-server-${props.gitSha}`;
        // Prepare container definition options for worker
        let containerDefinitionOptions = {
            image: aws_cdk_lib_1.aws_ecs.ContainerImage.fromRegistry(dockerImage),
            logging: aws_cdk_lib_1.aws_ecs.LogDrivers.awsLogs({
                streamPrefix: 'authentik-worker',
                logGroup
            }),
            command: ['worker'], // Worker command
            environment: {
                AUTHENTIK_POSTGRESQL__HOST: props.dbHostname,
                AUTHENTIK_POSTGRESQL__USER: 'authentik',
                AUTHENTIK_REDIS__HOST: props.redisHostname,
                AUTHENTIK_REDIS__TLS: 'True',
                AUTHENTIK_REDIS__TLS_REQS: 'required',
                // Add essential bootstrap configuration for worker
                AUTHENTIK_BOOTSTRAP_EMAIL: props.adminUserEmail,
                AUTHENTIK_BOOTSTRAP_LDAP_BASEDN: props.ldapBaseDn,
                // Authentik service host URL for API communications
                AUTHENTIK_HOST: props.authentikHost,
            },
            secrets: {
                AUTHENTIK_POSTGRESQL__PASSWORD: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.dbSecret, 'password'),
                AUTHENTIK_REDIS__PASSWORD: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.redisAuthToken),
                AUTHENTIK_SECRET_KEY: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.secretKey),
                AUTHENTIK_BOOTSTRAP_LDAPSERVICE_USERNAME: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.ldapServiceUser, 'username'),
                AUTHENTIK_BOOTSTRAP_LDAPSERVICE_PASSWORD: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.ldapServiceUser, 'password'),
                AUTHENTIK_BOOTSTRAP_PASSWORD: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.adminUserPassword, 'password'),
                AUTHENTIK_BOOTSTRAP_TOKEN: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.adminUserToken)
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
        if (props.envFileS3Key && props.useAuthentikConfigFile) {
            containerDefinitionOptions = {
                ...containerDefinitionOptions,
                environmentFiles: [
                    aws_cdk_lib_1.aws_ecs.EnvironmentFile.fromBucket(props.s3ConfBucket, props.envFileS3Key)
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
            cluster: props.ecsCluster,
            taskDefinition: this.taskDefinition,
            desiredCount: props.config.ecs.workerDesiredCount || 1, // Default to 1 worker
            securityGroups: [props.ecsSecurityGroup],
            enableExecuteCommand: props.enableExecute,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aGVudGlrLXdvcmtlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGhlbnRpay13b3JrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUE7O0dBRUc7QUFDSCwyQ0FBdUM7QUFDdkMsNkNBYXFCO0FBMElyQjs7R0FFRztBQUNILE1BQWEsZUFBZ0IsU0FBUSxzQkFBUztJQVc1Qzs7OztPQUlHO0lBQ0ssNEJBQTRCLENBQUMsTUFBYztRQUNqRCw0Q0FBNEM7UUFDNUMsSUFBSSxtQkFBSyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQy9CLG1GQUFtRjtZQUNuRixPQUFPLGdCQUFFLENBQUMsR0FBRyxDQUFDLHdEQUF3RCxFQUFFO2dCQUN0RSxPQUFPLEVBQUUsZ0JBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLGdCQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDNUMsTUFBTSxFQUFFLGdCQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxnQkFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQzNDLFFBQVEsRUFBRSxnQkFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsZ0JBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLGdCQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxnQkFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQzNFLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCw2REFBNkQ7UUFDN0QsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNuQyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFD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LENBQUMsaUJBQWlCLElBQUksQ0FBQztZQUNwRCxXQUFXLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLElBQUksQ0FBQztTQUNyRCxDQUFDLENBQUM7UUFFSCwrRUFBK0U7UUFDL0UsT0FBTyxDQUFDLHFCQUFxQixDQUFDLGtCQUFrQixFQUFFO1lBQ2hELHdCQUF3QixFQUFFLEVBQUUsRUFBRSwrQkFBK0I7WUFDN0QsZUFBZSxFQUFFLHNCQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUNwQyxnQkFBZ0IsRUFBRSxzQkFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7U0FDdEMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBcE9ELDBDQW9PQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQXV0aGVudGlrIFdvcmtlciBDb25zdHJ1Y3QgLSBXb3JrZXIgY29udGFpbmVyIGNvbmZpZ3VyYXRpb24gZm9yIGJhY2tncm91bmQgdGFza3NcbiAqL1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQge1xuICBhd3NfZWMyIGFzIGVjMixcbiAgYXdzX2VjcyBhcyBlY3MsXG4gIGF3c19sb2dzIGFzIGxvZ3MsXG4gIGF3c19zZWNyZXRzbWFuYWdlciBhcyBzZWNyZXRzbWFuYWdlcixcbiAgYXdzX3MzIGFzIHMzLFxuICBhd3NfaWFtIGFzIGlhbSxcbiAgYXdzX2ttcyBhcyBrbXMsXG4gIER1cmF0aW9uLFxuICBSZW1vdmFsUG9saWN5LFxuICBGbixcbiAgVG9rZW4sXG4gIFN0YWNrXG59IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB0eXBlIHsgQXV0aEluZnJhRW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuLi9lbnZpcm9ubWVudC1jb25maWcnO1xuXG4vKipcbiAqIFByb3BlcnRpZXMgZm9yIHRoZSBBdXRoZW50aWsgV29ya2VyIGNvbnN0cnVjdFxuICovXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhlbnRpa1dvcmtlclByb3BzIHtcbiAgLyoqXG4gICAqIEVudmlyb25tZW50IG5hbWUgKGUuZy4gJ3Byb2QnLCAnZGV2JywgZXRjLilcbiAgICovXG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEVudmlyb25tZW50IGNvbmZpZ3VyYXRpb25cbiAgICovXG4gIGNvbmZpZzogQXV0aEluZnJhRW52aXJvbm1lbnRDb25maWc7XG5cbiAgLyoqXG4gICAqIFZQQyBmb3IgZGVwbG95bWVudFxuICAgKi9cbiAgdnBjOiBlYzIuSVZwYztcblxuICAvKipcbiAgICogU2VjdXJpdHkgZ3JvdXAgZm9yIEVDUyB0YXNrc1xuICAgKi9cbiAgZWNzU2VjdXJpdHlHcm91cDogZWMyLlNlY3VyaXR5R3JvdXA7XG5cbiAgLyoqXG4gICAqIEVDUyBjbHVzdGVyXG4gICAqL1xuICBlY3NDbHVzdGVyOiBlY3MuSUNsdXN0ZXI7XG5cbiAgLyoqXG4gICAqIFMzIGNvbmZpZ3VyYXRpb24gYnVja2V0IGZvciBlbnZpcm9ubWVudCBmaWxlc1xuICAgKi9cbiAgczNDb25mQnVja2V0OiBzMy5JQnVja2V0O1xuXG4gIC8qKlxuICAgKiBTMyBrZXkgZm9yIHRoZSBlbnZpcm9ubWVudCBmaWxlIChvcHRpb25hbClcbiAgICovXG4gIGVudkZpbGVTM0tleT86IHN0cmluZztcblxuICAvKipcbiAgICogVXNlIGF1dGhlbnRpayBjb25maWcgZmlsZSBmcm9tIFMzIChkZWZhdWx0OiBmYWxzZSlcbiAgICovXG4gIHVzZUF1dGhlbnRpa0NvbmZpZ0ZpbGU6IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIEVDUiByZXBvc2l0b3J5IEFSTiBmb3IgRUNSIGltYWdlc1xuICAgKi9cbiAgZWNyUmVwb3NpdG9yeUFybj86IHN0cmluZztcblxuICAvKipcbiAgICogR2l0IFNIQSBmb3IgRG9ja2VyIGltYWdlIHRhZ2dpbmdcbiAgICovXG4gIGdpdFNoYTogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBBbGxvdyBTU0ggZXhlYyBpbnRvIGNvbnRhaW5lclxuICAgKi9cbiAgZW5hYmxlRXhlY3V0ZTogYm9vbGVhbjtcblxuICAvKipcbiAgICogQXV0aGVudGlrIGFkbWluIHVzZXIgZW1haWxcbiAgICovXG4gIGFkbWluVXNlckVtYWlsOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIExEQVAgYmFzZSBETlxuICAgKi9cbiAgbGRhcEJhc2VEbjogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBMREFQIHNlcnZpY2UgdXNlciBzZWNyZXRcbiAgICovXG4gIGxkYXBTZXJ2aWNlVXNlcjogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcblxuICAvKipcbiAgICogRGF0YWJhc2Ugc2VjcmV0XG4gICAqL1xuICBkYlNlY3JldDogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcblxuICAvKipcbiAgICogRGF0YWJhc2UgaG9zdG5hbWVcbiAgICovXG4gIGRiSG9zdG5hbWU6IHN0cmluZztcblxuICAvKipcbiAgICogUmVkaXMgYXV0aCB0b2tlblxuICAgKi9cbiAgcmVkaXNBdXRoVG9rZW46IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG5cbiAgLyoqXG4gICAqIFJlZGlzIGhvc3RuYW1lXG4gICAqL1xuICByZWRpc0hvc3RuYW1lOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEF1dGhlbnRpayBzZWNyZXQga2V5XG4gICAqL1xuICBzZWNyZXRLZXk6IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG5cbiAgLyoqXG4gICAqIEFkbWluIHVzZXIgcGFzc3dvcmQgc2VjcmV0XG4gICAqL1xuICBhZG1pblVzZXJQYXNzd29yZDogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcblxuICAvKipcbiAgICogQWRtaW4gdXNlciB0b2tlbiBzZWNyZXRcbiAgICovXG4gIGFkbWluVXNlclRva2VuOiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xuXG4gIC8qKlxuICAgKiBFRlMgZmlsZSBzeXN0ZW0gSURcbiAgICovXG4gIGVmc0lkOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEVGUyBtZWRpYSBhY2Nlc3MgcG9pbnQgSURcbiAgICovXG4gIGVmc01lZGlhQWNjZXNzUG9pbnRJZDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBFRlMgY3VzdG9tIHRlbXBsYXRlcyBhY2Nlc3MgcG9pbnQgSURcbiAgICovXG4gIGVmc0N1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50SWQ6IHN0cmluZztcblxuICAvKipcbiAgICogS01TIGtleSBmb3Igc2VjcmV0cyBlbmNyeXB0aW9uXG4gICAqL1xuICBrbXNLZXk6IGttcy5JS2V5O1xuXG4gIC8qKlxuICAgKiBBdXRoZW50aWsgc2VydmljZSBob3N0IFVSTCAoZS5nLiwgaHR0cHM6Ly9hY2NvdW50LmRlbW8udGFrLm56KVxuICAgKi9cbiAgYXV0aGVudGlrSG9zdDogc3RyaW5nO1xufVxuXG4vKipcbiAqIENESyBjb25zdHJ1Y3QgZm9yIHRoZSBBdXRoZW50aWsgd29ya2VyIGNvbnRhaW5lclxuICovXG5leHBvcnQgY2xhc3MgQXV0aGVudGlrV29ya2VyIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgLyoqXG4gICAqIFRoZSBFQ1MgdGFzayBkZWZpbml0aW9uIGZvciB0aGUgQXV0aGVudGlrIHdvcmtlclxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IHRhc2tEZWZpbml0aW9uOiBlY3MuVGFza0RlZmluaXRpb247XG5cbiAgLyoqXG4gICAqIFRoZSBFQ1Mgc2VydmljZSBmb3IgQXV0aGVudGlrIHdvcmtlclxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGVjc1NlcnZpY2U6IGVjcy5GYXJnYXRlU2VydmljZTtcblxuICAvKipcbiAgICogQ29udmVydHMgYW4gRUNSIHJlcG9zaXRvcnkgQVJOIHRvIGEgcHJvcGVyIEVDUiByZXBvc2l0b3J5IFVSSSBmb3IgRG9ja2VyIGltYWdlc1xuICAgKiBAcGFyYW0gZWNyQXJuIC0gRUNSIHJlcG9zaXRvcnkgQVJOIChlLmcuLCBcImFybjphd3M6ZWNyOnJlZ2lvbjphY2NvdW50OnJlcG9zaXRvcnkvcmVwby1uYW1lXCIpXG4gICAqIEByZXR1cm5zIEVDUiByZXBvc2l0b3J5IFVSSSAoZS5nLiwgXCJhY2NvdW50LmRrci5lY3IucmVnaW9uLmFtYXpvbmF3cy5jb20vcmVwby1uYW1lXCIpXG4gICAqL1xuICBwcml2YXRlIGNvbnZlcnRFY3JBcm5Ub1JlcG9zaXRvcnlVcmkoZWNyQXJuOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIC8vIEhhbmRsZSBDREsgdG9rZW5zICh1bnJlc29sdmVkIHJlZmVyZW5jZXMpXG4gICAgaWYgKFRva2VuLmlzVW5yZXNvbHZlZChlY3JBcm4pKSB7XG4gICAgICAvLyBGb3IgdG9rZW5zLCB3ZSBuZWVkIHRvIHVzZSBDREsncyBGbi5zdWIgdG8gcGVyZm9ybSB0aGUgY29udmVyc2lvbiBhdCBkZXBsb3kgdGltZVxuICAgICAgcmV0dXJuIEZuLnN1YignJHtBY2NvdW50fS5ka3IuZWNyLiR7UmVnaW9ufS5hbWF6b25hd3MuY29tLyR7UmVwb05hbWV9Jywge1xuICAgICAgICBBY2NvdW50OiBGbi5zZWxlY3QoNCwgRm4uc3BsaXQoJzonLCBlY3JBcm4pKSxcbiAgICAgICAgUmVnaW9uOiBGbi5zZWxlY3QoMywgRm4uc3BsaXQoJzonLCBlY3JBcm4pKSxcbiAgICAgICAgUmVwb05hbWU6IEZuLnNlbGVjdCgxLCBGbi5zcGxpdCgnLycsIEZuLnNlbGVjdCg1LCBGbi5zcGxpdCgnOicsIGVjckFybikpKSlcbiAgICAgIH0pO1xuICAgIH1cbiAgICBcbiAgICAvLyBQYXJzZSBBUk46IGFybjphd3M6ZWNyOnJlZ2lvbjphY2NvdW50OnJlcG9zaXRvcnkvcmVwby1uYW1lXG4gICAgY29uc3QgYXJuUGFydHMgPSBlY3JBcm4uc3BsaXQoJzonKTtcbiAgICBpZiAoYXJuUGFydHMubGVuZ3RoICE9PSA2IHx8ICFhcm5QYXJ0c1s1XS5zdGFydHNXaXRoKCdyZXBvc2l0b3J5LycpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgRUNSIHJlcG9zaXRvcnkgQVJOIGZvcm1hdDogJHtlY3JBcm59YCk7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IHJlZ2lvbiA9IGFyblBhcnRzWzNdO1xuICAgIGNvbnN0IGFjY291bnQgPSBhcm5QYXJ0c1s0XTtcbiAgICBjb25zdCByZXBvc2l0b3J5TmFtZSA9IGFyblBhcnRzWzVdLnJlcGxhY2UoJ3JlcG9zaXRvcnkvJywgJycpO1xuICAgIFxuICAgIHJldHVybiBgJHthY2NvdW50fS5ka3IuZWNyLiR7cmVnaW9ufS5hbWF6b25hd3MuY29tLyR7cmVwb3NpdG9yeU5hbWV9YDtcbiAgfVxuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBBdXRoZW50aWtXb3JrZXJQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIGxvZyBncm91cCBmb3Igd29ya2Vyc1xuICAgIGNvbnN0IGxvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1dvcmtlckxvZ3MnLCB7XG4gICAgICBsb2dHcm91cE5hbWU6IGAke2lkfS13b3JrZXJgLFxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICByZW1vdmFsUG9saWN5OiBSZW1vdmFsUG9saWN5LkRFU1RST1lcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSB0YXNrIGV4ZWN1dGlvbiByb2xlXG4gICAgY29uc3QgZXhlY3V0aW9uUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnV29ya2VyVGFza0V4ZWN1dGlvblJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnZWNzLXRhc2tzLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BbWF6b25FQ1NUYXNrRXhlY3V0aW9uUm9sZVBvbGljeScpXG4gICAgICBdXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgcGVybWlzc2lvbnMgdG8gYWNjZXNzIHNlY3JldHNcbiAgICBwcm9wcy5kYlNlY3JldC5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG4gICAgcHJvcHMucmVkaXNBdXRoVG9rZW4uZ3JhbnRSZWFkKGV4ZWN1dGlvblJvbGUpO1xuICAgIHByb3BzLnNlY3JldEtleS5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG4gICAgcHJvcHMubGRhcFNlcnZpY2VVc2VyLmdyYW50UmVhZChleGVjdXRpb25Sb2xlKTtcbiAgICBwcm9wcy5hZG1pblVzZXJQYXNzd29yZC5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG4gICAgcHJvcHMuYWRtaW5Vc2VyVG9rZW4uZ3JhbnRSZWFkKGV4ZWN1dGlvblJvbGUpO1xuXG4gICAgLy8gR3JhbnQgZXhwbGljaXQgS01TIHBlcm1pc3Npb25zIGZvciBzZWNyZXRzIGRlY3J5cHRpb25cbiAgICBwcm9wcy5rbXNLZXkuZ3JhbnREZWNyeXB0KGV4ZWN1dGlvblJvbGUpO1xuXG4gICAgLy8gQ3JlYXRlIHRhc2sgcm9sZVxuICAgIGNvbnN0IHRhc2tSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdXb3JrZXJUYXNrUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlY3MtdGFza3MuYW1hem9uYXdzLmNvbScpLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIEVGUyBwZXJtaXNzaW9ucyBmb3IgdGFzayByb2xlXG4gICAgdGFza1JvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZWxhc3RpY2ZpbGVzeXN0ZW06Q2xpZW50TW91bnQnLFxuICAgICAgICAnZWxhc3RpY2ZpbGVzeXN0ZW06Q2xpZW50V3JpdGUnLFxuICAgICAgICAnZWxhc3RpY2ZpbGVzeXN0ZW06Q2xpZW50Um9vdEFjY2VzcycsXG4gICAgICAgICdlbGFzdGljZmlsZXN5c3RlbTpEZXNjcmliZU1vdW50VGFyZ2V0cycsXG4gICAgICAgICdlbGFzdGljZmlsZXN5c3RlbTpEZXNjcmliZUZpbGVTeXN0ZW1zJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czplbGFzdGljZmlsZXN5c3RlbToke1N0YWNrLm9mKHRoaXMpLnJlZ2lvbn06JHtTdGFjay5vZih0aGlzKS5hY2NvdW50fTpmaWxlLXN5c3RlbS8ke3Byb3BzLmVmc0lkfWAsXG4gICAgICAgIGBhcm46YXdzOmVsYXN0aWNmaWxlc3lzdGVtOiR7U3RhY2sub2YodGhpcykucmVnaW9ufToke1N0YWNrLm9mKHRoaXMpLmFjY291bnR9OmFjY2Vzcy1wb2ludC8ke3Byb3BzLmVmc01lZGlhQWNjZXNzUG9pbnRJZH1gLFxuICAgICAgICBgYXJuOmF3czplbGFzdGljZmlsZXN5c3RlbToke1N0YWNrLm9mKHRoaXMpLnJlZ2lvbn06JHtTdGFjay5vZih0aGlzKS5hY2NvdW50fTphY2Nlc3MtcG9pbnQvJHtwcm9wcy5lZnNDdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludElkfWBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBHcmFudCByZWFkIGFjY2VzcyB0byBTMyBjb25maWd1cmF0aW9uIGJ1Y2tldCBmb3IgZW52aXJvbm1lbnQgZmlsZXNcbiAgICBpZiAocHJvcHMuZW52RmlsZVMzS2V5KSB7XG4gICAgICBwcm9wcy5zM0NvbmZCdWNrZXQuZ3JhbnRSZWFkKHRhc2tSb2xlKTtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgdGFzayBkZWZpbml0aW9uXG4gICAgdGhpcy50YXNrRGVmaW5pdGlvbiA9IG5ldyBlY3MuRmFyZ2F0ZVRhc2tEZWZpbml0aW9uKHRoaXMsICdXb3JrZXJUYXNrRGVmJywge1xuICAgICAgY3B1OiBwcm9wcy5jb25maWcuZWNzLnRhc2tDcHUsXG4gICAgICBtZW1vcnlMaW1pdE1pQjogcHJvcHMuY29uZmlnLmVjcy50YXNrTWVtb3J5LFxuICAgICAgZXhlY3V0aW9uUm9sZSxcbiAgICAgIHRhc2tSb2xlXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgdm9sdW1lcyBmb3IgRUZTXG4gICAgdGhpcy50YXNrRGVmaW5pdGlvbi5hZGRWb2x1bWUoe1xuICAgICAgbmFtZTogJ21lZGlhJyxcbiAgICAgIGVmc1ZvbHVtZUNvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgZmlsZVN5c3RlbUlkOiBwcm9wcy5lZnNJZCxcbiAgICAgICAgdHJhbnNpdEVuY3J5cHRpb246ICdFTkFCTEVEJyxcbiAgICAgICAgYXV0aG9yaXphdGlvbkNvbmZpZzoge1xuICAgICAgICAgIGFjY2Vzc1BvaW50SWQ6IHByb3BzLmVmc01lZGlhQWNjZXNzUG9pbnRJZCxcbiAgICAgICAgICBpYW06ICdFTkFCTEVEJ1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICB0aGlzLnRhc2tEZWZpbml0aW9uLmFkZFZvbHVtZSh7XG4gICAgICBuYW1lOiAnY3VzdG9tLXRlbXBsYXRlcycsXG4gICAgICBlZnNWb2x1bWVDb25maWd1cmF0aW9uOiB7XG4gICAgICAgIGZpbGVTeXN0ZW1JZDogcHJvcHMuZWZzSWQsXG4gICAgICAgIHRyYW5zaXRFbmNyeXB0aW9uOiAnRU5BQkxFRCcsXG4gICAgICAgIGF1dGhvcml6YXRpb25Db25maWc6IHtcbiAgICAgICAgICBhY2Nlc3NQb2ludElkOiBwcm9wcy5lZnNDdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludElkLFxuICAgICAgICAgIGlhbTogJ0VOQUJMRUQnXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIERldGVybWluZSBEb2NrZXIgaW1hZ2UgLSBBbHdheXMgdXNlIEVDUiAod29ya2VycyB1c2UgdGhlIHNhbWUgaW1hZ2UgYXMgc2VydmVyKVxuICAgIGlmICghcHJvcHMuZWNyUmVwb3NpdG9yeUFybikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdFQ1IgcmVwb3NpdG9yeSBBUk4gaXMgcmVxdWlyZWQgZm9yIEF1dGhlbnRpayBXb3JrZXIgZGVwbG95bWVudCcpO1xuICAgIH1cbiAgICBcbiAgICAvLyBDb252ZXJ0IEVDUiBBUk4gdG8gcHJvcGVyIHJlcG9zaXRvcnkgVVJJXG4gICAgY29uc3QgZWNyUmVwb3NpdG9yeVVyaSA9IHRoaXMuY29udmVydEVjckFyblRvUmVwb3NpdG9yeVVyaShwcm9wcy5lY3JSZXBvc2l0b3J5QXJuKTtcbiAgICBjb25zdCBkb2NrZXJJbWFnZSA9IGAke2VjclJlcG9zaXRvcnlVcml9OmF1dGgtaW5mcmEtc2VydmVyLSR7cHJvcHMuZ2l0U2hhfWA7XG5cbiAgICAvLyBQcmVwYXJlIGNvbnRhaW5lciBkZWZpbml0aW9uIG9wdGlvbnMgZm9yIHdvcmtlclxuICAgIGxldCBjb250YWluZXJEZWZpbml0aW9uT3B0aW9uczogZWNzLkNvbnRhaW5lckRlZmluaXRpb25PcHRpb25zID0ge1xuICAgICAgaW1hZ2U6IGVjcy5Db250YWluZXJJbWFnZS5mcm9tUmVnaXN0cnkoZG9ja2VySW1hZ2UpLFxuICAgICAgbG9nZ2luZzogZWNzLkxvZ0RyaXZlcnMuYXdzTG9ncyh7XG4gICAgICAgIHN0cmVhbVByZWZpeDogJ2F1dGhlbnRpay13b3JrZXInLFxuICAgICAgICBsb2dHcm91cFxuICAgICAgfSksXG4gICAgICBjb21tYW5kOiBbJ3dvcmtlciddLCAvLyBXb3JrZXIgY29tbWFuZFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgQVVUSEVOVElLX1BPU1RHUkVTUUxfX0hPU1Q6IHByb3BzLmRiSG9zdG5hbWUsXG4gICAgICAgIEFVVEhFTlRJS19QT1NUR1JFU1FMX19VU0VSOiAnYXV0aGVudGlrJyxcbiAgICAgICAgQVVUSEVOVElLX1JFRElTX19IT1NUOiBwcm9wcy5yZWRpc0hvc3RuYW1lLFxuICAgICAgICBBVVRIRU5USUtfUkVESVNfX1RMUzogJ1RydWUnLFxuICAgICAgICBBVVRIRU5USUtfUkVESVNfX1RMU19SRVFTOiAncmVxdWlyZWQnLFxuICAgICAgICAvLyBBZGQgZXNzZW50aWFsIGJvb3RzdHJhcCBjb25maWd1cmF0aW9uIGZvciB3b3JrZXJcbiAgICAgICAgQVVUSEVOVElLX0JPT1RTVFJBUF9FTUFJTDogcHJvcHMuYWRtaW5Vc2VyRW1haWwsXG4gICAgICAgIEFVVEhFTlRJS19CT09UU1RSQVBfTERBUF9CQVNFRE46IHByb3BzLmxkYXBCYXNlRG4sXG4gICAgICAgIC8vIEF1dGhlbnRpayBzZXJ2aWNlIGhvc3QgVVJMIGZvciBBUEkgY29tbXVuaWNhdGlvbnNcbiAgICAgICAgQVVUSEVOVElLX0hPU1Q6IHByb3BzLmF1dGhlbnRpa0hvc3QsXG4gICAgICB9LFxuICAgICAgc2VjcmV0czoge1xuICAgICAgICBBVVRIRU5USUtfUE9TVEdSRVNRTF9fUEFTU1dPUkQ6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHByb3BzLmRiU2VjcmV0LCAncGFzc3dvcmQnKSxcbiAgICAgICAgQVVUSEVOVElLX1JFRElTX19QQVNTV09SRDogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIocHJvcHMucmVkaXNBdXRoVG9rZW4pLFxuICAgICAgICBBVVRIRU5USUtfU0VDUkVUX0tFWTogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIocHJvcHMuc2VjcmV0S2V5KSxcbiAgICAgICAgQVVUSEVOVElLX0JPT1RTVFJBUF9MREFQU0VSVklDRV9VU0VSTkFNRTogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIocHJvcHMubGRhcFNlcnZpY2VVc2VyLCAndXNlcm5hbWUnKSxcbiAgICAgICAgQVVUSEVOVElLX0JPT1RTVFJBUF9MREFQU0VSVklDRV9QQVNTV09SRDogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIocHJvcHMubGRhcFNlcnZpY2VVc2VyLCAncGFzc3dvcmQnKSxcbiAgICAgICAgQVVUSEVOVElLX0JPT1RTVFJBUF9QQVNTV09SRDogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIocHJvcHMuYWRtaW5Vc2VyUGFzc3dvcmQsICdwYXNzd29yZCcpLFxuICAgICAgICBBVVRIRU5USUtfQk9PVFNUUkFQX1RPS0VOOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihwcm9wcy5hZG1pblVzZXJUb2tlbilcbiAgICAgIH0sXG4gICAgICAvLyBBZGQgYmFzaWMgaGVhbHRoIGNoZWNrIGZvciB3b3JrZXIgKHdvcmtlcnMgZG9uJ3QgZXhwb3NlIEhUVFAgZW5kcG9pbnRzKVxuICAgICAgaGVhbHRoQ2hlY2s6IHtcbiAgICAgICAgY29tbWFuZDogWydDTUQnLCAnYWsnLCAnaGVhbHRoY2hlY2snXSxcbiAgICAgICAgaW50ZXJ2YWw6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgcmV0cmllczogMyxcbiAgICAgICAgc3RhcnRQZXJpb2Q6IER1cmF0aW9uLnNlY29uZHMoNjApXG4gICAgICB9LFxuICAgICAgZXNzZW50aWFsOiB0cnVlXG4gICAgfTtcblxuICAgIC8vIEFkZCBlbnZpcm9ubWVudCBmaWxlcyBpZiBTMyBrZXkgaXMgcHJvdmlkZWQgYW5kIHVzZUF1dGhlbnRpa0NvbmZpZ0ZpbGUgaXMgZW5hYmxlZFxuICAgIGlmIChwcm9wcy5lbnZGaWxlUzNLZXkgJiYgcHJvcHMudXNlQXV0aGVudGlrQ29uZmlnRmlsZSkge1xuICAgICAgY29udGFpbmVyRGVmaW5pdGlvbk9wdGlvbnMgPSB7XG4gICAgICAgIC4uLmNvbnRhaW5lckRlZmluaXRpb25PcHRpb25zLFxuICAgICAgICBlbnZpcm9ubWVudEZpbGVzOiBbXG4gICAgICAgICAgZWNzLkVudmlyb25tZW50RmlsZS5mcm9tQnVja2V0KHByb3BzLnMzQ29uZkJ1Y2tldCwgcHJvcHMuZW52RmlsZVMzS2V5KVxuICAgICAgICBdXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IGNvbnRhaW5lciA9IHRoaXMudGFza0RlZmluaXRpb24uYWRkQ29udGFpbmVyKCdBdXRoZW50aWtXb3JrZXInLCBjb250YWluZXJEZWZpbml0aW9uT3B0aW9ucyk7XG5cbiAgICAvLyBBZGQgbW91bnQgcG9pbnRzIGZvciBFRlMgdm9sdW1lc1xuICAgIGNvbnRhaW5lci5hZGRNb3VudFBvaW50cyh7XG4gICAgICBjb250YWluZXJQYXRoOiAnL21lZGlhJyxcbiAgICAgIHNvdXJjZVZvbHVtZTogJ21lZGlhJyxcbiAgICAgIHJlYWRPbmx5OiBmYWxzZVxuICAgIH0pO1xuXG4gICAgY29udGFpbmVyLmFkZE1vdW50UG9pbnRzKHtcbiAgICAgIGNvbnRhaW5lclBhdGg6ICcvdGVtcGxhdGVzJyxcbiAgICAgIHNvdXJjZVZvbHVtZTogJ2N1c3RvbS10ZW1wbGF0ZXMnLFxuICAgICAgcmVhZE9ubHk6IGZhbHNlXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgRUNTIHNlcnZpY2UgZm9yIHdvcmtlclxuICAgIHRoaXMuZWNzU2VydmljZSA9IG5ldyBlY3MuRmFyZ2F0ZVNlcnZpY2UodGhpcywgJ1dvcmtlclNlcnZpY2UnLCB7XG4gICAgICBjbHVzdGVyOiBwcm9wcy5lY3NDbHVzdGVyLFxuICAgICAgdGFza0RlZmluaXRpb246IHRoaXMudGFza0RlZmluaXRpb24sXG4gICAgICBkZXNpcmVkQ291bnQ6IHByb3BzLmNvbmZpZy5lY3Mud29ya2VyRGVzaXJlZENvdW50IHx8IDEsIC8vIERlZmF1bHQgdG8gMSB3b3JrZXJcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbcHJvcHMuZWNzU2VjdXJpdHlHcm91cF0sXG4gICAgICBlbmFibGVFeGVjdXRlQ29tbWFuZDogcHJvcHMuZW5hYmxlRXhlY3V0ZSxcbiAgICAgIGFzc2lnblB1YmxpY0lwOiBmYWxzZSxcbiAgICAgIC8vIERpc2FibGUgY2lyY3VpdCBicmVha2VyIHRlbXBvcmFyaWx5IHRvIGdldCBiZXR0ZXIgZXJyb3IgaW5mb3JtYXRpb25cbiAgICAgIC8vIGNpcmN1aXRCcmVha2VyOiB7IHJvbGxiYWNrOiB0cnVlIH1cbiAgICB9KTtcblxuICAgIC8vIEFkZCBhdXRvIHNjYWxpbmcgZm9yIHdvcmtlcnNcbiAgICBjb25zdCBzY2FsaW5nID0gdGhpcy5lY3NTZXJ2aWNlLmF1dG9TY2FsZVRhc2tDb3VudCh7XG4gICAgICBtaW5DYXBhY2l0eTogcHJvcHMuY29uZmlnLmVjcy53b3JrZXJNaW5DYXBhY2l0eSB8fCAxLFxuICAgICAgbWF4Q2FwYWNpdHk6IHByb3BzLmNvbmZpZy5lY3Mud29ya2VyTWF4Q2FwYWNpdHkgfHwgM1xuICAgIH0pO1xuXG4gICAgLy8gU2NhbGUgYmFzZWQgb24gQ1BVIHV0aWxpemF0aW9uICh3b3JrZXJzIG1heSBoYXZlIGRpZmZlcmVudCBzY2FsaW5nIHBhdHRlcm5zKVxuICAgIHNjYWxpbmcuc2NhbGVPbkNwdVV0aWxpemF0aW9uKCdXb3JrZXJDcHVTY2FsaW5nJywge1xuICAgICAgdGFyZ2V0VXRpbGl6YXRpb25QZXJjZW50OiA4MCwgLy8gSGlnaGVyIHRocmVzaG9sZCBmb3Igd29ya2Vyc1xuICAgICAgc2NhbGVJbkNvb2xkb3duOiBEdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgc2NhbGVPdXRDb29sZG93bjogRHVyYXRpb24ubWludXRlcygyKVxuICAgIH0pO1xuICB9XG59XG4iXX0=