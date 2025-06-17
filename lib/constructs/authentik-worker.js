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
        props.dbSecret.grantRead(executionRole);
        props.redisAuthToken.grantRead(executionRole);
        props.secretKey.grantRead(executionRole);
        props.ldapServiceUser.grantRead(executionRole);
        props.adminUserPassword.grantRead(executionRole);
        props.adminUserToken.grantRead(executionRole);
        // Grant explicit KMS permissions for secrets decryption
        props.kmsKey.grantDecrypt(executionRole);
        // Grant S3 access to execution role for environment files (needed during task initialization)
        if (props.envFileS3Key) {
            props.s3ConfBucket.grantRead(executionRole);
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
                `arn:aws:elasticfilesystem:${aws_cdk_lib_1.Stack.of(this).region}:${aws_cdk_lib_1.Stack.of(this).account}:file-system/${props.efsId}`,
                `arn:aws:elasticfilesystem:${aws_cdk_lib_1.Stack.of(this).region}:${aws_cdk_lib_1.Stack.of(this).account}:access-point/${props.efsMediaAccessPointId}`,
                `arn:aws:elasticfilesystem:${aws_cdk_lib_1.Stack.of(this).region}:${aws_cdk_lib_1.Stack.of(this).account}:access-point/${props.efsCustomTemplatesAccessPointId}`
            ]
        }));
        // Grant read access to S3 configuration bucket for task role (for runtime access)
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
                // Authentik service host URL for API communications from LDAP Outpost
                AUTHENTIK_BOOTSTRAP_LDAP_AUTHENTIK_HOST: props.authentikHost,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aGVudGlrLXdvcmtlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGhlbnRpay13b3JrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUE7O0dBRUc7QUFDSCwyQ0FBdUM7QUFDdkMsNkNBWXFCO0FBMElyQjs7R0FFRztBQUNILE1BQWEsZUFBZ0IsU0FBUSxzQkFBUztJQVc1Qzs7OztPQUlHO0lBQ0ssNEJBQTRCLENBQUMsTUFBYztRQUNqRCw0Q0FBNEM7UUFDNUMsSUFBSSxtQkFBSyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQy9CLG1GQUFtRjtZQUNuRixPQUFPLGdCQUFFLENBQUMsR0FBRyxDQUFDLHdEQUF3RCxFQUFFO2dCQUN0RSxPQUFPLEVBQUUsZ0JBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLGdCQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDNUMsTUFBTSxFQUFFLGdCQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxnQkFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQzNDLFFBQVEsRUFBRSxnQkFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsZ0JBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLGdCQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxnQkFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQzNFLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCw2REFBNkQ7UUFDN0QsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNuQyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFD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LHNFQUFzRTtZQUN0RSxxQ0FBcUM7U0FDdEMsQ0FBQyxDQUFDO1FBRUgsK0JBQStCO1FBQy9CLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUM7WUFDakQsV0FBVyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLGlCQUFpQixJQUFJLENBQUM7WUFDcEQsV0FBVyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLGlCQUFpQixJQUFJLENBQUM7U0FDckQsQ0FBQyxDQUFDO1FBRUgsK0VBQStFO1FBQy9FLE9BQU8sQ0FBQyxxQkFBcUIsQ0FBQyxrQkFBa0IsRUFBRTtZQUNoRCx3QkFBd0IsRUFBRSxFQUFFLEVBQUUsK0JBQStCO1lBQzdELGVBQWUsRUFBRSxzQkFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDcEMsZ0JBQWdCLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1NBQ3RDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXpPRCwwQ0F5T0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEF1dGhlbnRpayBXb3JrZXIgQ29uc3RydWN0IC0gV29ya2VyIGNvbnRhaW5lciBjb25maWd1cmF0aW9uIGZvciBiYWNrZ3JvdW5kIHRhc2tzXG4gKi9cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHtcbiAgYXdzX2VjMiBhcyBlYzIsXG4gIGF3c19lY3MgYXMgZWNzLFxuICBhd3NfbG9ncyBhcyBsb2dzLFxuICBhd3Nfc2VjcmV0c21hbmFnZXIgYXMgc2VjcmV0c21hbmFnZXIsXG4gIGF3c19zMyBhcyBzMyxcbiAgYXdzX2lhbSBhcyBpYW0sXG4gIGF3c19rbXMgYXMga21zLFxuICBEdXJhdGlvbixcbiAgRm4sXG4gIFRva2VuLFxuICBTdGFja1xufSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgdHlwZSB7IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi4vZW52aXJvbm1lbnQtY29uZmlnJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciB0aGUgQXV0aGVudGlrIFdvcmtlciBjb25zdHJ1Y3RcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBBdXRoZW50aWtXb3JrZXJQcm9wcyB7XG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBuYW1lIChlLmcuICdwcm9kJywgJ2RldicsIGV0Yy4pXG4gICAqL1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBjb25maWd1cmF0aW9uXG4gICAqL1xuICBjb25maWc6IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnO1xuXG4gIC8qKlxuICAgKiBWUEMgZm9yIGRlcGxveW1lbnRcbiAgICovXG4gIHZwYzogZWMyLklWcGM7XG5cbiAgLyoqXG4gICAqIFNlY3VyaXR5IGdyb3VwIGZvciBFQ1MgdGFza3NcbiAgICovXG4gIGVjc1NlY3VyaXR5R3JvdXA6IGVjMi5TZWN1cml0eUdyb3VwO1xuXG4gIC8qKlxuICAgKiBFQ1MgY2x1c3RlclxuICAgKi9cbiAgZWNzQ2x1c3RlcjogZWNzLklDbHVzdGVyO1xuXG4gIC8qKlxuICAgKiBTMyBjb25maWd1cmF0aW9uIGJ1Y2tldCBmb3IgZW52aXJvbm1lbnQgZmlsZXNcbiAgICovXG4gIHMzQ29uZkJ1Y2tldDogczMuSUJ1Y2tldDtcblxuICAvKipcbiAgICogUzMga2V5IGZvciB0aGUgZW52aXJvbm1lbnQgZmlsZSAob3B0aW9uYWwpXG4gICAqL1xuICBlbnZGaWxlUzNLZXk/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFVzZSBhdXRoZW50aWsgY29uZmlnIGZpbGUgZnJvbSBTMyAoZGVmYXVsdDogZmFsc2UpXG4gICAqL1xuICB1c2VBdXRoZW50aWtDb25maWdGaWxlOiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBFQ1IgcmVwb3NpdG9yeSBBUk4gZm9yIEVDUiBpbWFnZXNcbiAgICovXG4gIGVjclJlcG9zaXRvcnlBcm4/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEdpdCBTSEEgZm9yIERvY2tlciBpbWFnZSB0YWdnaW5nXG4gICAqL1xuICBnaXRTaGE6IHN0cmluZztcblxuICAvKipcbiAgICogQWxsb3cgU1NIIGV4ZWMgaW50byBjb250YWluZXJcbiAgICovXG4gIGVuYWJsZUV4ZWN1dGU6IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIEF1dGhlbnRpayBhZG1pbiB1c2VyIGVtYWlsXG4gICAqL1xuICBhZG1pblVzZXJFbWFpbDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBMREFQIGJhc2UgRE5cbiAgICovXG4gIGxkYXBCYXNlRG46IHN0cmluZztcblxuICAvKipcbiAgICogTERBUCBzZXJ2aWNlIHVzZXIgc2VjcmV0XG4gICAqL1xuICBsZGFwU2VydmljZVVzZXI6IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG5cbiAgLyoqXG4gICAqIERhdGFiYXNlIHNlY3JldFxuICAgKi9cbiAgZGJTZWNyZXQ6IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG5cbiAgLyoqXG4gICAqIERhdGFiYXNlIGhvc3RuYW1lXG4gICAqL1xuICBkYkhvc3RuYW1lOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFJlZGlzIGF1dGggdG9rZW5cbiAgICovXG4gIHJlZGlzQXV0aFRva2VuOiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xuXG4gIC8qKlxuICAgKiBSZWRpcyBob3N0bmFtZVxuICAgKi9cbiAgcmVkaXNIb3N0bmFtZTogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBBdXRoZW50aWsgc2VjcmV0IGtleVxuICAgKi9cbiAgc2VjcmV0S2V5OiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xuXG4gIC8qKlxuICAgKiBBZG1pbiB1c2VyIHBhc3N3b3JkIHNlY3JldFxuICAgKi9cbiAgYWRtaW5Vc2VyUGFzc3dvcmQ6IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG5cbiAgLyoqXG4gICAqIEFkbWluIHVzZXIgdG9rZW4gc2VjcmV0XG4gICAqL1xuICBhZG1pblVzZXJUb2tlbjogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcblxuICAvKipcbiAgICogRUZTIGZpbGUgc3lzdGVtIElEXG4gICAqL1xuICBlZnNJZDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBFRlMgbWVkaWEgYWNjZXNzIHBvaW50IElEXG4gICAqL1xuICBlZnNNZWRpYUFjY2Vzc1BvaW50SWQ6IHN0cmluZztcblxuICAvKipcbiAgICogRUZTIGN1c3RvbSB0ZW1wbGF0ZXMgYWNjZXNzIHBvaW50IElEXG4gICAqL1xuICBlZnNDdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludElkOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEtNUyBrZXkgZm9yIHNlY3JldHMgZW5jcnlwdGlvblxuICAgKi9cbiAga21zS2V5OiBrbXMuSUtleTtcblxuICAvKipcbiAgICogQXV0aGVudGlrIHNlcnZpY2UgaG9zdCBVUkwgKGUuZy4sIGh0dHBzOi8vYWNjb3VudC5kZW1vLnRhay5ueilcbiAgICovXG4gIGF1dGhlbnRpa0hvc3Q6IHN0cmluZztcbn1cblxuLyoqXG4gKiBDREsgY29uc3RydWN0IGZvciB0aGUgQXV0aGVudGlrIHdvcmtlciBjb250YWluZXJcbiAqL1xuZXhwb3J0IGNsYXNzIEF1dGhlbnRpa1dvcmtlciBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBUaGUgRUNTIHRhc2sgZGVmaW5pdGlvbiBmb3IgdGhlIEF1dGhlbnRpayB3b3JrZXJcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSB0YXNrRGVmaW5pdGlvbjogZWNzLlRhc2tEZWZpbml0aW9uO1xuXG4gIC8qKlxuICAgKiBUaGUgRUNTIHNlcnZpY2UgZm9yIEF1dGhlbnRpayB3b3JrZXJcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBlY3NTZXJ2aWNlOiBlY3MuRmFyZ2F0ZVNlcnZpY2U7XG5cbiAgLyoqXG4gICAqIENvbnZlcnRzIGFuIEVDUiByZXBvc2l0b3J5IEFSTiB0byBhIHByb3BlciBFQ1IgcmVwb3NpdG9yeSBVUkkgZm9yIERvY2tlciBpbWFnZXNcbiAgICogQHBhcmFtIGVjckFybiAtIEVDUiByZXBvc2l0b3J5IEFSTiAoZS5nLiwgXCJhcm46YXdzOmVjcjpyZWdpb246YWNjb3VudDpyZXBvc2l0b3J5L3JlcG8tbmFtZVwiKVxuICAgKiBAcmV0dXJucyBFQ1IgcmVwb3NpdG9yeSBVUkkgKGUuZy4sIFwiYWNjb3VudC5ka3IuZWNyLnJlZ2lvbi5hbWF6b25hd3MuY29tL3JlcG8tbmFtZVwiKVxuICAgKi9cbiAgcHJpdmF0ZSBjb252ZXJ0RWNyQXJuVG9SZXBvc2l0b3J5VXJpKGVjckFybjogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAvLyBIYW5kbGUgQ0RLIHRva2VucyAodW5yZXNvbHZlZCByZWZlcmVuY2VzKVxuICAgIGlmIChUb2tlbi5pc1VucmVzb2x2ZWQoZWNyQXJuKSkge1xuICAgICAgLy8gRm9yIHRva2Vucywgd2UgbmVlZCB0byB1c2UgQ0RLJ3MgRm4uc3ViIHRvIHBlcmZvcm0gdGhlIGNvbnZlcnNpb24gYXQgZGVwbG95IHRpbWVcbiAgICAgIHJldHVybiBGbi5zdWIoJyR7QWNjb3VudH0uZGtyLmVjci4ke1JlZ2lvbn0uYW1hem9uYXdzLmNvbS8ke1JlcG9OYW1lfScsIHtcbiAgICAgICAgQWNjb3VudDogRm4uc2VsZWN0KDQsIEZuLnNwbGl0KCc6JywgZWNyQXJuKSksXG4gICAgICAgIFJlZ2lvbjogRm4uc2VsZWN0KDMsIEZuLnNwbGl0KCc6JywgZWNyQXJuKSksXG4gICAgICAgIFJlcG9OYW1lOiBGbi5zZWxlY3QoMSwgRm4uc3BsaXQoJy8nLCBGbi5zZWxlY3QoNSwgRm4uc3BsaXQoJzonLCBlY3JBcm4pKSkpXG4gICAgICB9KTtcbiAgICB9XG4gICAgXG4gICAgLy8gUGFyc2UgQVJOOiBhcm46YXdzOmVjcjpyZWdpb246YWNjb3VudDpyZXBvc2l0b3J5L3JlcG8tbmFtZVxuICAgIGNvbnN0IGFyblBhcnRzID0gZWNyQXJuLnNwbGl0KCc6Jyk7XG4gICAgaWYgKGFyblBhcnRzLmxlbmd0aCAhPT0gNiB8fCAhYXJuUGFydHNbNV0uc3RhcnRzV2l0aCgncmVwb3NpdG9yeS8nKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIEVDUiByZXBvc2l0b3J5IEFSTiBmb3JtYXQ6ICR7ZWNyQXJufWApO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCByZWdpb24gPSBhcm5QYXJ0c1szXTtcbiAgICBjb25zdCBhY2NvdW50ID0gYXJuUGFydHNbNF07XG4gICAgY29uc3QgcmVwb3NpdG9yeU5hbWUgPSBhcm5QYXJ0c1s1XS5yZXBsYWNlKCdyZXBvc2l0b3J5LycsICcnKTtcbiAgICBcbiAgICByZXR1cm4gYCR7YWNjb3VudH0uZGtyLmVjci4ke3JlZ2lvbn0uYW1hem9uYXdzLmNvbS8ke3JlcG9zaXRvcnlOYW1lfWA7XG4gIH1cblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQXV0aGVudGlrV29ya2VyUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBsb2cgZ3JvdXAgZm9yIHdvcmtlcnNcbiAgICBjb25zdCBsb2dHcm91cCA9IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdXb3JrZXJMb2dzJywge1xuICAgICAgbG9nR3JvdXBOYW1lOiBgJHtpZH0td29ya2VyYCxcbiAgICAgIHJldGVudGlvbjogcHJvcHMuY29uZmlnLm1vbml0b3JpbmcubG9nUmV0ZW50aW9uRGF5cyxcbiAgICAgIHJlbW92YWxQb2xpY3k6IHByb3BzLmNvbmZpZy5nZW5lcmFsLnJlbW92YWxQb2xpY3lcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSB0YXNrIGV4ZWN1dGlvbiByb2xlXG4gICAgY29uc3QgZXhlY3V0aW9uUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnV29ya2VyVGFza0V4ZWN1dGlvblJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnZWNzLXRhc2tzLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BbWF6b25FQ1NUYXNrRXhlY3V0aW9uUm9sZVBvbGljeScpXG4gICAgICBdXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgcGVybWlzc2lvbnMgdG8gYWNjZXNzIHNlY3JldHNcbiAgICBwcm9wcy5kYlNlY3JldC5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG4gICAgcHJvcHMucmVkaXNBdXRoVG9rZW4uZ3JhbnRSZWFkKGV4ZWN1dGlvblJvbGUpO1xuICAgIHByb3BzLnNlY3JldEtleS5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG4gICAgcHJvcHMubGRhcFNlcnZpY2VVc2VyLmdyYW50UmVhZChleGVjdXRpb25Sb2xlKTtcbiAgICBwcm9wcy5hZG1pblVzZXJQYXNzd29yZC5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG4gICAgcHJvcHMuYWRtaW5Vc2VyVG9rZW4uZ3JhbnRSZWFkKGV4ZWN1dGlvblJvbGUpO1xuXG4gICAgLy8gR3JhbnQgZXhwbGljaXQgS01TIHBlcm1pc3Npb25zIGZvciBzZWNyZXRzIGRlY3J5cHRpb25cbiAgICBwcm9wcy5rbXNLZXkuZ3JhbnREZWNyeXB0KGV4ZWN1dGlvblJvbGUpO1xuXG4gICAgLy8gR3JhbnQgUzMgYWNjZXNzIHRvIGV4ZWN1dGlvbiByb2xlIGZvciBlbnZpcm9ubWVudCBmaWxlcyAobmVlZGVkIGR1cmluZyB0YXNrIGluaXRpYWxpemF0aW9uKVxuICAgIGlmIChwcm9wcy5lbnZGaWxlUzNLZXkpIHtcbiAgICAgIHByb3BzLnMzQ29uZkJ1Y2tldC5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIHRhc2sgcm9sZVxuICAgIGNvbnN0IHRhc2tSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdXb3JrZXJUYXNrUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlY3MtdGFza3MuYW1hem9uYXdzLmNvbScpLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIEVGUyBwZXJtaXNzaW9ucyBmb3IgdGFzayByb2xlXG4gICAgdGFza1JvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZWxhc3RpY2ZpbGVzeXN0ZW06Q2xpZW50TW91bnQnLFxuICAgICAgICAnZWxhc3RpY2ZpbGVzeXN0ZW06Q2xpZW50V3JpdGUnLFxuICAgICAgICAnZWxhc3RpY2ZpbGVzeXN0ZW06Q2xpZW50Um9vdEFjY2VzcycsXG4gICAgICAgICdlbGFzdGljZmlsZXN5c3RlbTpEZXNjcmliZU1vdW50VGFyZ2V0cycsXG4gICAgICAgICdlbGFzdGljZmlsZXN5c3RlbTpEZXNjcmliZUZpbGVTeXN0ZW1zJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czplbGFzdGljZmlsZXN5c3RlbToke1N0YWNrLm9mKHRoaXMpLnJlZ2lvbn06JHtTdGFjay5vZih0aGlzKS5hY2NvdW50fTpmaWxlLXN5c3RlbS8ke3Byb3BzLmVmc0lkfWAsXG4gICAgICAgIGBhcm46YXdzOmVsYXN0aWNmaWxlc3lzdGVtOiR7U3RhY2sub2YodGhpcykucmVnaW9ufToke1N0YWNrLm9mKHRoaXMpLmFjY291bnR9OmFjY2Vzcy1wb2ludC8ke3Byb3BzLmVmc01lZGlhQWNjZXNzUG9pbnRJZH1gLFxuICAgICAgICBgYXJuOmF3czplbGFzdGljZmlsZXN5c3RlbToke1N0YWNrLm9mKHRoaXMpLnJlZ2lvbn06JHtTdGFjay5vZih0aGlzKS5hY2NvdW50fTphY2Nlc3MtcG9pbnQvJHtwcm9wcy5lZnNDdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludElkfWBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBHcmFudCByZWFkIGFjY2VzcyB0byBTMyBjb25maWd1cmF0aW9uIGJ1Y2tldCBmb3IgdGFzayByb2xlIChmb3IgcnVudGltZSBhY2Nlc3MpXG4gICAgaWYgKHByb3BzLmVudkZpbGVTM0tleSkge1xuICAgICAgcHJvcHMuczNDb25mQnVja2V0LmdyYW50UmVhZCh0YXNrUm9sZSk7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIHRhc2sgZGVmaW5pdGlvblxuICAgIHRoaXMudGFza0RlZmluaXRpb24gPSBuZXcgZWNzLkZhcmdhdGVUYXNrRGVmaW5pdGlvbih0aGlzLCAnV29ya2VyVGFza0RlZicsIHtcbiAgICAgIGNwdTogcHJvcHMuY29uZmlnLmVjcy50YXNrQ3B1LFxuICAgICAgbWVtb3J5TGltaXRNaUI6IHByb3BzLmNvbmZpZy5lY3MudGFza01lbW9yeSxcbiAgICAgIGV4ZWN1dGlvblJvbGUsXG4gICAgICB0YXNrUm9sZVxuICAgIH0pO1xuXG4gICAgLy8gQWRkIHZvbHVtZXMgZm9yIEVGU1xuICAgIHRoaXMudGFza0RlZmluaXRpb24uYWRkVm9sdW1lKHtcbiAgICAgIG5hbWU6ICdtZWRpYScsXG4gICAgICBlZnNWb2x1bWVDb25maWd1cmF0aW9uOiB7XG4gICAgICAgIGZpbGVTeXN0ZW1JZDogcHJvcHMuZWZzSWQsXG4gICAgICAgIHRyYW5zaXRFbmNyeXB0aW9uOiAnRU5BQkxFRCcsXG4gICAgICAgIGF1dGhvcml6YXRpb25Db25maWc6IHtcbiAgICAgICAgICBhY2Nlc3NQb2ludElkOiBwcm9wcy5lZnNNZWRpYUFjY2Vzc1BvaW50SWQsXG4gICAgICAgICAgaWFtOiAnRU5BQkxFRCdcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgdGhpcy50YXNrRGVmaW5pdGlvbi5hZGRWb2x1bWUoe1xuICAgICAgbmFtZTogJ2N1c3RvbS10ZW1wbGF0ZXMnLFxuICAgICAgZWZzVm9sdW1lQ29uZmlndXJhdGlvbjoge1xuICAgICAgICBmaWxlU3lzdGVtSWQ6IHByb3BzLmVmc0lkLFxuICAgICAgICB0cmFuc2l0RW5jcnlwdGlvbjogJ0VOQUJMRUQnLFxuICAgICAgICBhdXRob3JpemF0aW9uQ29uZmlnOiB7XG4gICAgICAgICAgYWNjZXNzUG9pbnRJZDogcHJvcHMuZWZzQ3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnRJZCxcbiAgICAgICAgICBpYW06ICdFTkFCTEVEJ1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBEZXRlcm1pbmUgRG9ja2VyIGltYWdlIC0gQWx3YXlzIHVzZSBFQ1IgKHdvcmtlcnMgdXNlIHRoZSBzYW1lIGltYWdlIGFzIHNlcnZlcilcbiAgICBpZiAoIXByb3BzLmVjclJlcG9zaXRvcnlBcm4pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRUNSIHJlcG9zaXRvcnkgQVJOIGlzIHJlcXVpcmVkIGZvciBBdXRoZW50aWsgV29ya2VyIGRlcGxveW1lbnQnKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQ29udmVydCBFQ1IgQVJOIHRvIHByb3BlciByZXBvc2l0b3J5IFVSSVxuICAgIGNvbnN0IGVjclJlcG9zaXRvcnlVcmkgPSB0aGlzLmNvbnZlcnRFY3JBcm5Ub1JlcG9zaXRvcnlVcmkocHJvcHMuZWNyUmVwb3NpdG9yeUFybik7XG4gICAgY29uc3QgZG9ja2VySW1hZ2UgPSBgJHtlY3JSZXBvc2l0b3J5VXJpfTphdXRoLWluZnJhLXNlcnZlci0ke3Byb3BzLmdpdFNoYX1gO1xuXG4gICAgLy8gUHJlcGFyZSBjb250YWluZXIgZGVmaW5pdGlvbiBvcHRpb25zIGZvciB3b3JrZXJcbiAgICBsZXQgY29udGFpbmVyRGVmaW5pdGlvbk9wdGlvbnM6IGVjcy5Db250YWluZXJEZWZpbml0aW9uT3B0aW9ucyA9IHtcbiAgICAgIGltYWdlOiBlY3MuQ29udGFpbmVySW1hZ2UuZnJvbVJlZ2lzdHJ5KGRvY2tlckltYWdlKSxcbiAgICAgIGxvZ2dpbmc6IGVjcy5Mb2dEcml2ZXJzLmF3c0xvZ3Moe1xuICAgICAgICBzdHJlYW1QcmVmaXg6ICdhdXRoZW50aWstd29ya2VyJyxcbiAgICAgICAgbG9nR3JvdXBcbiAgICAgIH0pLFxuICAgICAgY29tbWFuZDogWyd3b3JrZXInXSwgLy8gV29ya2VyIGNvbW1hbmRcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEFVVEhFTlRJS19QT1NUR1JFU1FMX19IT1NUOiBwcm9wcy5kYkhvc3RuYW1lLFxuICAgICAgICBBVVRIRU5USUtfUE9TVEdSRVNRTF9fVVNFUjogJ2F1dGhlbnRpaycsXG4gICAgICAgIEFVVEhFTlRJS19SRURJU19fSE9TVDogcHJvcHMucmVkaXNIb3N0bmFtZSxcbiAgICAgICAgQVVUSEVOVElLX1JFRElTX19UTFM6ICdUcnVlJyxcbiAgICAgICAgQVVUSEVOVElLX1JFRElTX19UTFNfUkVRUzogJ3JlcXVpcmVkJyxcbiAgICAgICAgLy8gQWRkIGVzc2VudGlhbCBib290c3RyYXAgY29uZmlndXJhdGlvbiBmb3Igd29ya2VyXG4gICAgICAgIEFVVEhFTlRJS19CT09UU1RSQVBfRU1BSUw6IHByb3BzLmFkbWluVXNlckVtYWlsLFxuICAgICAgICBBVVRIRU5USUtfQk9PVFNUUkFQX0xEQVBfQkFTRUROOiBwcm9wcy5sZGFwQmFzZURuLFxuICAgICAgICAvLyBBdXRoZW50aWsgc2VydmljZSBob3N0IFVSTCBmb3IgQVBJIGNvbW11bmljYXRpb25zIGZyb20gTERBUCBPdXRwb3N0XG4gICAgICAgIEFVVEhFTlRJS19CT09UU1RSQVBfTERBUF9BVVRIRU5USUtfSE9TVDogcHJvcHMuYXV0aGVudGlrSG9zdCxcbiAgICAgIH0sXG4gICAgICBzZWNyZXRzOiB7XG4gICAgICAgIEFVVEhFTlRJS19QT1NUR1JFU1FMX19QQVNTV09SRDogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIocHJvcHMuZGJTZWNyZXQsICdwYXNzd29yZCcpLFxuICAgICAgICBBVVRIRU5USUtfUkVESVNfX1BBU1NXT1JEOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihwcm9wcy5yZWRpc0F1dGhUb2tlbiksXG4gICAgICAgIEFVVEhFTlRJS19TRUNSRVRfS0VZOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihwcm9wcy5zZWNyZXRLZXkpLFxuICAgICAgICBBVVRIRU5USUtfQk9PVFNUUkFQX0xEQVBTRVJWSUNFX1VTRVJOQU1FOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihwcm9wcy5sZGFwU2VydmljZVVzZXIsICd1c2VybmFtZScpLFxuICAgICAgICBBVVRIRU5USUtfQk9PVFNUUkFQX0xEQVBTRVJWSUNFX1BBU1NXT1JEOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihwcm9wcy5sZGFwU2VydmljZVVzZXIsICdwYXNzd29yZCcpLFxuICAgICAgICBBVVRIRU5USUtfQk9PVFNUUkFQX1BBU1NXT1JEOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihwcm9wcy5hZG1pblVzZXJQYXNzd29yZCwgJ3Bhc3N3b3JkJyksXG4gICAgICAgIEFVVEhFTlRJS19CT09UU1RSQVBfVE9LRU46IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHByb3BzLmFkbWluVXNlclRva2VuKVxuICAgICAgfSxcbiAgICAgIC8vIEFkZCBiYXNpYyBoZWFsdGggY2hlY2sgZm9yIHdvcmtlciAod29ya2VycyBkb24ndCBleHBvc2UgSFRUUCBlbmRwb2ludHMpXG4gICAgICBoZWFsdGhDaGVjazoge1xuICAgICAgICBjb21tYW5kOiBbJ0NNRCcsICdhaycsICdoZWFsdGhjaGVjayddLFxuICAgICAgICBpbnRlcnZhbDogRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICByZXRyaWVzOiAzLFxuICAgICAgICBzdGFydFBlcmlvZDogRHVyYXRpb24uc2Vjb25kcyg2MClcbiAgICAgIH0sXG4gICAgICBlc3NlbnRpYWw6IHRydWVcbiAgICB9O1xuXG4gICAgLy8gQWRkIGVudmlyb25tZW50IGZpbGVzIGlmIFMzIGtleSBpcyBwcm92aWRlZCBhbmQgdXNlQXV0aGVudGlrQ29uZmlnRmlsZSBpcyBlbmFibGVkXG4gICAgaWYgKHByb3BzLmVudkZpbGVTM0tleSAmJiBwcm9wcy51c2VBdXRoZW50aWtDb25maWdGaWxlKSB7XG4gICAgICBjb250YWluZXJEZWZpbml0aW9uT3B0aW9ucyA9IHtcbiAgICAgICAgLi4uY29udGFpbmVyRGVmaW5pdGlvbk9wdGlvbnMsXG4gICAgICAgIGVudmlyb25tZW50RmlsZXM6IFtcbiAgICAgICAgICBlY3MuRW52aXJvbm1lbnRGaWxlLmZyb21CdWNrZXQocHJvcHMuczNDb25mQnVja2V0LCBwcm9wcy5lbnZGaWxlUzNLZXkpXG4gICAgICAgIF1cbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgY29udGFpbmVyID0gdGhpcy50YXNrRGVmaW5pdGlvbi5hZGRDb250YWluZXIoJ0F1dGhlbnRpa1dvcmtlcicsIGNvbnRhaW5lckRlZmluaXRpb25PcHRpb25zKTtcblxuICAgIC8vIEFkZCBtb3VudCBwb2ludHMgZm9yIEVGUyB2b2x1bWVzXG4gICAgY29udGFpbmVyLmFkZE1vdW50UG9pbnRzKHtcbiAgICAgIGNvbnRhaW5lclBhdGg6ICcvbWVkaWEnLFxuICAgICAgc291cmNlVm9sdW1lOiAnbWVkaWEnLFxuICAgICAgcmVhZE9ubHk6IGZhbHNlXG4gICAgfSk7XG5cbiAgICBjb250YWluZXIuYWRkTW91bnRQb2ludHMoe1xuICAgICAgY29udGFpbmVyUGF0aDogJy90ZW1wbGF0ZXMnLFxuICAgICAgc291cmNlVm9sdW1lOiAnY3VzdG9tLXRlbXBsYXRlcycsXG4gICAgICByZWFkT25seTogZmFsc2VcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBFQ1Mgc2VydmljZSBmb3Igd29ya2VyXG4gICAgdGhpcy5lY3NTZXJ2aWNlID0gbmV3IGVjcy5GYXJnYXRlU2VydmljZSh0aGlzLCAnV29ya2VyU2VydmljZScsIHtcbiAgICAgIGNsdXN0ZXI6IHByb3BzLmVjc0NsdXN0ZXIsXG4gICAgICB0YXNrRGVmaW5pdGlvbjogdGhpcy50YXNrRGVmaW5pdGlvbixcbiAgICAgIGRlc2lyZWRDb3VudDogcHJvcHMuY29uZmlnLmVjcy53b3JrZXJEZXNpcmVkQ291bnQgfHwgMSwgLy8gRGVmYXVsdCB0byAxIHdvcmtlclxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtwcm9wcy5lY3NTZWN1cml0eUdyb3VwXSxcbiAgICAgIGVuYWJsZUV4ZWN1dGVDb21tYW5kOiBwcm9wcy5lbmFibGVFeGVjdXRlLFxuICAgICAgYXNzaWduUHVibGljSXA6IGZhbHNlLFxuICAgICAgLy8gRGlzYWJsZSBjaXJjdWl0IGJyZWFrZXIgdGVtcG9yYXJpbHkgdG8gZ2V0IGJldHRlciBlcnJvciBpbmZvcm1hdGlvblxuICAgICAgLy8gY2lyY3VpdEJyZWFrZXI6IHsgcm9sbGJhY2s6IHRydWUgfVxuICAgIH0pO1xuXG4gICAgLy8gQWRkIGF1dG8gc2NhbGluZyBmb3Igd29ya2Vyc1xuICAgIGNvbnN0IHNjYWxpbmcgPSB0aGlzLmVjc1NlcnZpY2UuYXV0b1NjYWxlVGFza0NvdW50KHtcbiAgICAgIG1pbkNhcGFjaXR5OiBwcm9wcy5jb25maWcuZWNzLndvcmtlck1pbkNhcGFjaXR5IHx8IDEsXG4gICAgICBtYXhDYXBhY2l0eTogcHJvcHMuY29uZmlnLmVjcy53b3JrZXJNYXhDYXBhY2l0eSB8fCAzXG4gICAgfSk7XG5cbiAgICAvLyBTY2FsZSBiYXNlZCBvbiBDUFUgdXRpbGl6YXRpb24gKHdvcmtlcnMgbWF5IGhhdmUgZGlmZmVyZW50IHNjYWxpbmcgcGF0dGVybnMpXG4gICAgc2NhbGluZy5zY2FsZU9uQ3B1VXRpbGl6YXRpb24oJ1dvcmtlckNwdVNjYWxpbmcnLCB7XG4gICAgICB0YXJnZXRVdGlsaXphdGlvblBlcmNlbnQ6IDgwLCAvLyBIaWdoZXIgdGhyZXNob2xkIGZvciB3b3JrZXJzXG4gICAgICBzY2FsZUluQ29vbGRvd246IER1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICBzY2FsZU91dENvb2xkb3duOiBEdXJhdGlvbi5taW51dGVzKDIpXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==