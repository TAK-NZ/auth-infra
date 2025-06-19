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
        // Derive environment-specific values from context (matches reference pattern)
        const isHighAvailability = props.environment === 'prod';
        const removalPolicy = props.contextConfig.general.removalPolicy === 'RETAIN' ?
            aws_cdk_lib_1.RemovalPolicy.RETAIN : aws_cdk_lib_1.RemovalPolicy.DESTROY;
        const logRetentionDays = isHighAvailability ? 30 : 7;
        // Create the log group for workers
        const logGroup = new aws_cdk_lib_1.aws_logs.LogGroup(this, 'WorkerLogs', {
            logGroupName: `${id}-worker`,
            retention: logRetentionDays,
            removalPolicy: removalPolicy
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
            scaleInCooldown: aws_cdk_lib_1.Duration.minutes(5),
            scaleOutCooldown: aws_cdk_lib_1.Duration.minutes(2)
        });
    }
}
exports.AuthentikWorker = AuthentikWorker;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aGVudGlrLXdvcmtlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGhlbnRpay13b3JrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUE7O0dBRUc7QUFDSCwyQ0FBdUM7QUFDdkMsNkNBYXFCO0FBa0RyQjs7R0FFRztBQUNILE1BQWEsZUFBZ0IsU0FBUSxzQkFBUztJQVc1Qzs7OztPQUlHO0lBQ0ssNEJBQTRCLENBQUMsTUFBYztRQUNqRCw0Q0FBNEM7UUFDNUMsSUFBSSxtQkFBSyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQy9CLG1GQUFtRjtZQUNuRixPQUFPLGdCQUFFLENBQUMsR0FBRyxDQUFDLHdEQUF3RCxFQUFFO2dCQUN0RSxPQUFPLEVBQUUsZ0JBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLGdCQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDNUMsTUFBTSxFQUFFLGdCQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxnQkFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQzNDLFFBQVEsRUFBRSxnQkFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsZ0JBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLGdCQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxnQkFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQzNFLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCw2REFBNkQ7UUFDN0QsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNuQyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFD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cUI7WUFDekUsY0FBYyxFQUFFLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQztZQUN2RCxvQkFBb0IsRUFBRSxLQUFLLENBQUMsVUFBVSxDQUFDLGFBQWE7WUFDcEQsY0FBYyxFQUFFLEtBQUs7WUFDckIsc0VBQXNFO1lBQ3RFLHFDQUFxQztTQUN0QyxDQUFDLENBQUM7UUFFSCwrQkFBK0I7UUFDL0IsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQztZQUNqRCxXQUFXLEVBQUUsQ0FBQztZQUNkLFdBQVcsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1NBQ3pDLENBQUMsQ0FBQztRQUVILCtFQUErRTtRQUMvRSxPQUFPLENBQUMscUJBQXFCLENBQUMsa0JBQWtCLEVBQUU7WUFDaEQsd0JBQXdCLEVBQUUsRUFBRSxFQUFFLCtCQUErQjtZQUM3RCxlQUFlLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ3BDLGdCQUFnQixFQUFFLHNCQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztTQUN0QyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFuUEQsMENBbVBDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBBdXRoZW50aWsgV29ya2VyIENvbnN0cnVjdCAtIFdvcmtlciBjb250YWluZXIgY29uZmlndXJhdGlvbiBmb3IgYmFja2dyb3VuZCB0YXNrc1xuICovXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7XG4gIGF3c19lYzIgYXMgZWMyLFxuICBhd3NfZWNzIGFzIGVjcyxcbiAgYXdzX2xvZ3MgYXMgbG9ncyxcbiAgYXdzX3NlY3JldHNtYW5hZ2VyIGFzIHNlY3JldHNtYW5hZ2VyLFxuICBhd3NfczMgYXMgczMsXG4gIGF3c19pYW0gYXMgaWFtLFxuICBhd3Nfa21zIGFzIGttcyxcbiAgRHVyYXRpb24sXG4gIEZuLFxuICBUb2tlbixcbiAgU3RhY2ssXG4gIFJlbW92YWxQb2xpY3lcbn0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHR5cGUgeyBDb250ZXh0RW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuLi9zdGFjay1jb25maWcnO1xuaW1wb3J0IHR5cGUgeyBcbiAgSW5mcmFzdHJ1Y3R1cmVDb25maWcsIFxuICBTZWNyZXRzQ29uZmlnLCBcbiAgU3RvcmFnZUNvbmZpZywgXG4gIERlcGxveW1lbnRDb25maWcsIFxuICBBdXRoZW50aWtBcHBsaWNhdGlvbkNvbmZpZyBcbn0gZnJvbSAnLi4vY29uc3RydWN0LWNvbmZpZ3MnO1xuXG4vKipcbiAqIFByb3BlcnRpZXMgZm9yIHRoZSBBdXRoZW50aWsgV29ya2VyIGNvbnN0cnVjdFxuICovXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhlbnRpa1dvcmtlclByb3BzIHtcbiAgLyoqXG4gICAqIEVudmlyb25tZW50IHR5cGUgKCdwcm9kJyB8ICdkZXYtdGVzdCcpXG4gICAqL1xuICBlbnZpcm9ubWVudDogJ3Byb2QnIHwgJ2Rldi10ZXN0JztcblxuICAvKipcbiAgICogQ29udGV4dC1iYXNlZCBlbnZpcm9ubWVudCBjb25maWd1cmF0aW9uIChkaXJlY3QgZnJvbSBjZGsuanNvbilcbiAgICovXG4gIGNvbnRleHRDb25maWc6IENvbnRleHRFbnZpcm9ubWVudENvbmZpZztcblxuICAvKipcbiAgICogSW5mcmFzdHJ1Y3R1cmUgY29uZmlndXJhdGlvbiAoVlBDLCBFQ1MsIHNlY3VyaXR5IGdyb3VwcylcbiAgICovXG4gIGluZnJhc3RydWN0dXJlOiBJbmZyYXN0cnVjdHVyZUNvbmZpZztcblxuICAvKipcbiAgICogU2VjcmV0cyBjb25maWd1cmF0aW9uIChkYXRhYmFzZSwgUmVkaXMsIEF1dGhlbnRpayBzZWNyZXRzKVxuICAgKi9cbiAgc2VjcmV0czogU2VjcmV0c0NvbmZpZztcblxuICAvKipcbiAgICogU3RvcmFnZSBjb25maWd1cmF0aW9uIChTMywgRUZTKVxuICAgKi9cbiAgc3RvcmFnZTogU3RvcmFnZUNvbmZpZztcblxuICAvKipcbiAgICogRGVwbG95bWVudCBjb25maWd1cmF0aW9uIChFQ1IsIEdpdCBTSEEsIGV4ZWN1dGlvbiBzZXR0aW5ncylcbiAgICovXG4gIGRlcGxveW1lbnQ6IERlcGxveW1lbnRDb25maWc7XG5cbiAgLyoqXG4gICAqIEF1dGhlbnRpayBhcHBsaWNhdGlvbiBjb25maWd1cmF0aW9uIChhZG1pbiBzZXR0aW5ncywgTERBUCwgaG9zdCBVUkwpXG4gICAqL1xuICBhcHBsaWNhdGlvbjogQXV0aGVudGlrQXBwbGljYXRpb25Db25maWc7XG59XG5cbi8qKlxuICogQ0RLIGNvbnN0cnVjdCBmb3IgdGhlIEF1dGhlbnRpayB3b3JrZXIgY29udGFpbmVyXG4gKi9cbmV4cG9ydCBjbGFzcyBBdXRoZW50aWtXb3JrZXIgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICAvKipcbiAgICogVGhlIEVDUyB0YXNrIGRlZmluaXRpb24gZm9yIHRoZSBBdXRoZW50aWsgd29ya2VyXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgdGFza0RlZmluaXRpb246IGVjcy5UYXNrRGVmaW5pdGlvbjtcblxuICAvKipcbiAgICogVGhlIEVDUyBzZXJ2aWNlIGZvciBBdXRoZW50aWsgd29ya2VyXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgZWNzU2VydmljZTogZWNzLkZhcmdhdGVTZXJ2aWNlO1xuXG4gIC8qKlxuICAgKiBDb252ZXJ0cyBhbiBFQ1IgcmVwb3NpdG9yeSBBUk4gdG8gYSBwcm9wZXIgRUNSIHJlcG9zaXRvcnkgVVJJIGZvciBEb2NrZXIgaW1hZ2VzXG4gICAqIEBwYXJhbSBlY3JBcm4gLSBFQ1IgcmVwb3NpdG9yeSBBUk4gKGUuZy4sIFwiYXJuOmF3czplY3I6cmVnaW9uOmFjY291bnQ6cmVwb3NpdG9yeS9yZXBvLW5hbWVcIilcbiAgICogQHJldHVybnMgRUNSIHJlcG9zaXRvcnkgVVJJIChlLmcuLCBcImFjY291bnQuZGtyLmVjci5yZWdpb24uYW1hem9uYXdzLmNvbS9yZXBvLW5hbWVcIilcbiAgICovXG4gIHByaXZhdGUgY29udmVydEVjckFyblRvUmVwb3NpdG9yeVVyaShlY3JBcm46IHN0cmluZyk6IHN0cmluZyB7XG4gICAgLy8gSGFuZGxlIENESyB0b2tlbnMgKHVucmVzb2x2ZWQgcmVmZXJlbmNlcylcbiAgICBpZiAoVG9rZW4uaXNVbnJlc29sdmVkKGVjckFybikpIHtcbiAgICAgIC8vIEZvciB0b2tlbnMsIHdlIG5lZWQgdG8gdXNlIENESydzIEZuLnN1YiB0byBwZXJmb3JtIHRoZSBjb252ZXJzaW9uIGF0IGRlcGxveSB0aW1lXG4gICAgICByZXR1cm4gRm4uc3ViKCcke0FjY291bnR9LmRrci5lY3IuJHtSZWdpb259LmFtYXpvbmF3cy5jb20vJHtSZXBvTmFtZX0nLCB7XG4gICAgICAgIEFjY291bnQ6IEZuLnNlbGVjdCg0LCBGbi5zcGxpdCgnOicsIGVjckFybikpLFxuICAgICAgICBSZWdpb246IEZuLnNlbGVjdCgzLCBGbi5zcGxpdCgnOicsIGVjckFybikpLFxuICAgICAgICBSZXBvTmFtZTogRm4uc2VsZWN0KDEsIEZuLnNwbGl0KCcvJywgRm4uc2VsZWN0KDUsIEZuLnNwbGl0KCc6JywgZWNyQXJuKSkpKVxuICAgICAgfSk7XG4gICAgfVxuICAgIFxuICAgIC8vIFBhcnNlIEFSTjogYXJuOmF3czplY3I6cmVnaW9uOmFjY291bnQ6cmVwb3NpdG9yeS9yZXBvLW5hbWVcbiAgICBjb25zdCBhcm5QYXJ0cyA9IGVjckFybi5zcGxpdCgnOicpO1xuICAgIGlmIChhcm5QYXJ0cy5sZW5ndGggIT09IDYgfHwgIWFyblBhcnRzWzVdLnN0YXJ0c1dpdGgoJ3JlcG9zaXRvcnkvJykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBFQ1IgcmVwb3NpdG9yeSBBUk4gZm9ybWF0OiAke2VjckFybn1gKTtcbiAgICB9XG4gICAgXG4gICAgY29uc3QgcmVnaW9uID0gYXJuUGFydHNbM107XG4gICAgY29uc3QgYWNjb3VudCA9IGFyblBhcnRzWzRdO1xuICAgIGNvbnN0IHJlcG9zaXRvcnlOYW1lID0gYXJuUGFydHNbNV0ucmVwbGFjZSgncmVwb3NpdG9yeS8nLCAnJyk7XG4gICAgXG4gICAgcmV0dXJuIGAke2FjY291bnR9LmRrci5lY3IuJHtyZWdpb259LmFtYXpvbmF3cy5jb20vJHtyZXBvc2l0b3J5TmFtZX1gO1xuICB9XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEF1dGhlbnRpa1dvcmtlclByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIC8vIERlcml2ZSBlbnZpcm9ubWVudC1zcGVjaWZpYyB2YWx1ZXMgZnJvbSBjb250ZXh0IChtYXRjaGVzIHJlZmVyZW5jZSBwYXR0ZXJuKVxuICAgIGNvbnN0IGlzSGlnaEF2YWlsYWJpbGl0eSA9IHByb3BzLmVudmlyb25tZW50ID09PSAncHJvZCc7XG4gICAgY29uc3QgcmVtb3ZhbFBvbGljeSA9IHByb3BzLmNvbnRleHRDb25maWcuZ2VuZXJhbC5yZW1vdmFsUG9saWN5ID09PSAnUkVUQUlOJyA/IFxuICAgICAgUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBSZW1vdmFsUG9saWN5LkRFU1RST1k7XG4gICAgY29uc3QgbG9nUmV0ZW50aW9uRGF5cyA9IGlzSGlnaEF2YWlsYWJpbGl0eSA/IDMwIDogNztcblxuICAgIC8vIENyZWF0ZSB0aGUgbG9nIGdyb3VwIGZvciB3b3JrZXJzXG4gICAgY29uc3QgbG9nR3JvdXAgPSBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnV29ya2VyTG9ncycsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogYCR7aWR9LXdvcmtlcmAsXG4gICAgICByZXRlbnRpb246IGxvZ1JldGVudGlvbkRheXMsXG4gICAgICByZW1vdmFsUG9saWN5OiByZW1vdmFsUG9saWN5XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgdGFzayBleGVjdXRpb24gcm9sZVxuICAgIGNvbnN0IGV4ZWN1dGlvblJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1dvcmtlclRhc2tFeGVjdXRpb25Sb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2Vjcy10YXNrcy5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQW1hem9uRUNTVGFza0V4ZWN1dGlvblJvbGVQb2xpY3knKVxuICAgICAgXVxuICAgIH0pO1xuXG4gICAgLy8gQWRkIHBlcm1pc3Npb25zIHRvIGFjY2VzcyBzZWNyZXRzXG4gICAgcHJvcHMuc2VjcmV0cy5kYXRhYmFzZS5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG4gICAgcHJvcHMuc2VjcmV0cy5yZWRpc0F1dGhUb2tlbi5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG4gICAgcHJvcHMuc2VjcmV0cy5hdXRoZW50aWsuc2VjcmV0S2V5LmdyYW50UmVhZChleGVjdXRpb25Sb2xlKTtcbiAgICBpZiAocHJvcHMuc2VjcmV0cy5hdXRoZW50aWsubGRhcFNlcnZpY2VVc2VyKSB7XG4gICAgICBwcm9wcy5zZWNyZXRzLmF1dGhlbnRpay5sZGFwU2VydmljZVVzZXIuZ3JhbnRSZWFkKGV4ZWN1dGlvblJvbGUpO1xuICAgIH1cbiAgICBwcm9wcy5zZWNyZXRzLmF1dGhlbnRpay5hZG1pblVzZXJQYXNzd29yZC5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG4gICAgcHJvcHMuc2VjcmV0cy5hdXRoZW50aWsuYWRtaW5Vc2VyVG9rZW4uZ3JhbnRSZWFkKGV4ZWN1dGlvblJvbGUpO1xuXG4gICAgLy8gR3JhbnQgZXhwbGljaXQgS01TIHBlcm1pc3Npb25zIGZvciBzZWNyZXRzIGRlY3J5cHRpb25cbiAgICBwcm9wcy5pbmZyYXN0cnVjdHVyZS5rbXNLZXkuZ3JhbnREZWNyeXB0KGV4ZWN1dGlvblJvbGUpO1xuXG4gICAgLy8gR3JhbnQgUzMgYWNjZXNzIHRvIGV4ZWN1dGlvbiByb2xlIGZvciBlbnZpcm9ubWVudCBmaWxlcyAobmVlZGVkIGR1cmluZyB0YXNrIGluaXRpYWxpemF0aW9uKVxuICAgIGlmIChwcm9wcy5zdG9yYWdlLnMzLmVudkZpbGVLZXkpIHtcbiAgICAgIHByb3BzLnN0b3JhZ2UuczMuY29uZmlnQnVja2V0LmdyYW50UmVhZChleGVjdXRpb25Sb2xlKTtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgdGFzayByb2xlXG4gICAgY29uc3QgdGFza1JvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1dvcmtlclRhc2tSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2Vjcy10YXNrcy5hbWF6b25hd3MuY29tJyksXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgRUZTIHBlcm1pc3Npb25zIGZvciB0YXNrIHJvbGVcbiAgICB0YXNrUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdlbGFzdGljZmlsZXN5c3RlbTpDbGllbnRNb3VudCcsXG4gICAgICAgICdlbGFzdGljZmlsZXN5c3RlbTpDbGllbnRXcml0ZScsXG4gICAgICAgICdlbGFzdGljZmlsZXN5c3RlbTpDbGllbnRSb290QWNjZXNzJyxcbiAgICAgICAgJ2VsYXN0aWNmaWxlc3lzdGVtOkRlc2NyaWJlTW91bnRUYXJnZXRzJyxcbiAgICAgICAgJ2VsYXN0aWNmaWxlc3lzdGVtOkRlc2NyaWJlRmlsZVN5c3RlbXMnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOmVsYXN0aWNmaWxlc3lzdGVtOiR7U3RhY2sub2YodGhpcykucmVnaW9ufToke1N0YWNrLm9mKHRoaXMpLmFjY291bnR9OmZpbGUtc3lzdGVtLyR7cHJvcHMuc3RvcmFnZS5lZnMuZmlsZVN5c3RlbUlkfWAsXG4gICAgICAgIGBhcm46YXdzOmVsYXN0aWNmaWxlc3lzdGVtOiR7U3RhY2sub2YodGhpcykucmVnaW9ufToke1N0YWNrLm9mKHRoaXMpLmFjY291bnR9OmFjY2Vzcy1wb2ludC8ke3Byb3BzLnN0b3JhZ2UuZWZzLm1lZGlhQWNjZXNzUG9pbnRJZH1gLFxuICAgICAgICBgYXJuOmF3czplbGFzdGljZmlsZXN5c3RlbToke1N0YWNrLm9mKHRoaXMpLnJlZ2lvbn06JHtTdGFjay5vZih0aGlzKS5hY2NvdW50fTphY2Nlc3MtcG9pbnQvJHtwcm9wcy5zdG9yYWdlLmVmcy5jdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludElkfWBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBHcmFudCByZWFkIGFjY2VzcyB0byBTMyBjb25maWd1cmF0aW9uIGJ1Y2tldCBmb3IgdGFzayByb2xlIChmb3IgcnVudGltZSBhY2Nlc3MpXG4gICAgaWYgKHByb3BzLnN0b3JhZ2UuczMuZW52RmlsZUtleSkge1xuICAgICAgcHJvcHMuc3RvcmFnZS5zMy5jb25maWdCdWNrZXQuZ3JhbnRSZWFkKHRhc2tSb2xlKTtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgdGFzayBkZWZpbml0aW9uXG4gICAgdGhpcy50YXNrRGVmaW5pdGlvbiA9IG5ldyBlY3MuRmFyZ2F0ZVRhc2tEZWZpbml0aW9uKHRoaXMsICdXb3JrZXJUYXNrRGVmJywge1xuICAgICAgY3B1OiBwcm9wcy5jb250ZXh0Q29uZmlnLmVjcy50YXNrQ3B1LFxuICAgICAgbWVtb3J5TGltaXRNaUI6IHByb3BzLmNvbnRleHRDb25maWcuZWNzLnRhc2tNZW1vcnksXG4gICAgICBleGVjdXRpb25Sb2xlLFxuICAgICAgdGFza1JvbGVcbiAgICB9KTtcblxuICAgIC8vIEFkZCB2b2x1bWVzIGZvciBFRlNcbiAgICB0aGlzLnRhc2tEZWZpbml0aW9uLmFkZFZvbHVtZSh7XG4gICAgICBuYW1lOiAnbWVkaWEnLFxuICAgICAgZWZzVm9sdW1lQ29uZmlndXJhdGlvbjoge1xuICAgICAgICBmaWxlU3lzdGVtSWQ6IHByb3BzLnN0b3JhZ2UuZWZzLmZpbGVTeXN0ZW1JZCxcbiAgICAgICAgdHJhbnNpdEVuY3J5cHRpb246ICdFTkFCTEVEJyxcbiAgICAgICAgYXV0aG9yaXphdGlvbkNvbmZpZzoge1xuICAgICAgICAgIGFjY2Vzc1BvaW50SWQ6IHByb3BzLnN0b3JhZ2UuZWZzLm1lZGlhQWNjZXNzUG9pbnRJZCxcbiAgICAgICAgICBpYW06ICdFTkFCTEVEJ1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICB0aGlzLnRhc2tEZWZpbml0aW9uLmFkZFZvbHVtZSh7XG4gICAgICBuYW1lOiAnY3VzdG9tLXRlbXBsYXRlcycsXG4gICAgICBlZnNWb2x1bWVDb25maWd1cmF0aW9uOiB7XG4gICAgICAgIGZpbGVTeXN0ZW1JZDogcHJvcHMuc3RvcmFnZS5lZnMuZmlsZVN5c3RlbUlkLFxuICAgICAgICB0cmFuc2l0RW5jcnlwdGlvbjogJ0VOQUJMRUQnLFxuICAgICAgICBhdXRob3JpemF0aW9uQ29uZmlnOiB7XG4gICAgICAgICAgYWNjZXNzUG9pbnRJZDogcHJvcHMuc3RvcmFnZS5lZnMuY3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnRJZCxcbiAgICAgICAgICBpYW06ICdFTkFCTEVEJ1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBEZXRlcm1pbmUgRG9ja2VyIGltYWdlIC0gQWx3YXlzIHVzZSBFQ1IgKHdvcmtlcnMgdXNlIHRoZSBzYW1lIGltYWdlIGFzIHNlcnZlcilcbiAgICBpZiAoIXByb3BzLmRlcGxveW1lbnQuZWNyUmVwb3NpdG9yeUFybikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdFQ1IgcmVwb3NpdG9yeSBBUk4gaXMgcmVxdWlyZWQgZm9yIEF1dGhlbnRpayBXb3JrZXIgZGVwbG95bWVudCcpO1xuICAgIH1cbiAgICBcbiAgICAvLyBDb252ZXJ0IEVDUiBBUk4gdG8gcHJvcGVyIHJlcG9zaXRvcnkgVVJJXG4gICAgY29uc3QgZWNyUmVwb3NpdG9yeVVyaSA9IHRoaXMuY29udmVydEVjckFyblRvUmVwb3NpdG9yeVVyaShwcm9wcy5kZXBsb3ltZW50LmVjclJlcG9zaXRvcnlBcm4pO1xuICAgIGNvbnN0IGRvY2tlckltYWdlID0gYCR7ZWNyUmVwb3NpdG9yeVVyaX06YXV0aC1pbmZyYS1zZXJ2ZXItJHtwcm9wcy5kZXBsb3ltZW50LmdpdFNoYX1gO1xuXG4gICAgLy8gUHJlcGFyZSBjb250YWluZXIgZGVmaW5pdGlvbiBvcHRpb25zIGZvciB3b3JrZXJcbiAgICBsZXQgY29udGFpbmVyRGVmaW5pdGlvbk9wdGlvbnM6IGVjcy5Db250YWluZXJEZWZpbml0aW9uT3B0aW9ucyA9IHtcbiAgICAgIGltYWdlOiBlY3MuQ29udGFpbmVySW1hZ2UuZnJvbVJlZ2lzdHJ5KGRvY2tlckltYWdlKSxcbiAgICAgIGxvZ2dpbmc6IGVjcy5Mb2dEcml2ZXJzLmF3c0xvZ3Moe1xuICAgICAgICBzdHJlYW1QcmVmaXg6ICdhdXRoZW50aWstd29ya2VyJyxcbiAgICAgICAgbG9nR3JvdXBcbiAgICAgIH0pLFxuICAgICAgY29tbWFuZDogWyd3b3JrZXInXSwgLy8gV29ya2VyIGNvbW1hbmRcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEFVVEhFTlRJS19QT1NUR1JFU1FMX19IT1NUOiBwcm9wcy5hcHBsaWNhdGlvbi5kYXRhYmFzZS5ob3N0bmFtZSxcbiAgICAgICAgQVVUSEVOVElLX1BPU1RHUkVTUUxfX1VTRVI6ICdhdXRoZW50aWsnLFxuICAgICAgICBBVVRIRU5USUtfUkVESVNfX0hPU1Q6IHByb3BzLmFwcGxpY2F0aW9uLnJlZGlzLmhvc3RuYW1lLFxuICAgICAgICBBVVRIRU5USUtfUkVESVNfX1RMUzogJ1RydWUnLFxuICAgICAgICBBVVRIRU5USUtfUkVESVNfX1RMU19SRVFTOiAncmVxdWlyZWQnLFxuICAgICAgICAvLyBBZGQgZXNzZW50aWFsIGJvb3RzdHJhcCBjb25maWd1cmF0aW9uIGZvciB3b3JrZXJcbiAgICAgICAgQVVUSEVOVElLX0JPT1RTVFJBUF9FTUFJTDogcHJvcHMuYXBwbGljYXRpb24uYWRtaW5Vc2VyRW1haWwsXG4gICAgICAgIEFVVEhFTlRJS19CT09UU1RSQVBfTERBUF9CQVNFRE46IHByb3BzLmFwcGxpY2F0aW9uLmxkYXBCYXNlRG4sXG4gICAgICAgIC8vIEF1dGhlbnRpayBzZXJ2aWNlIGhvc3QgVVJMIGZvciBBUEkgY29tbXVuaWNhdGlvbnMgZnJvbSBMREFQIE91dHBvc3RcbiAgICAgICAgQVVUSEVOVElLX0JPT1RTVFJBUF9MREFQX0FVVEhFTlRJS19IT1NUOiBwcm9wcy5hcHBsaWNhdGlvbi5hdXRoZW50aWtIb3N0IHx8ICcnLFxuICAgICAgfSxcbiAgICAgIHNlY3JldHM6IHtcbiAgICAgICAgQVVUSEVOVElLX1BPU1RHUkVTUUxfX1BBU1NXT1JEOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihwcm9wcy5zZWNyZXRzLmRhdGFiYXNlLCAncGFzc3dvcmQnKSxcbiAgICAgICAgQVVUSEVOVElLX1JFRElTX19QQVNTV09SRDogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIocHJvcHMuc2VjcmV0cy5yZWRpc0F1dGhUb2tlbiksXG4gICAgICAgIEFVVEhFTlRJS19TRUNSRVRfS0VZOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihwcm9wcy5zZWNyZXRzLmF1dGhlbnRpay5zZWNyZXRLZXkpLFxuICAgICAgICAuLi4ocHJvcHMuc2VjcmV0cy5hdXRoZW50aWsubGRhcFNlcnZpY2VVc2VyID8ge1xuICAgICAgICAgIEFVVEhFTlRJS19CT09UU1RSQVBfTERBUFNFUlZJQ0VfVVNFUk5BTUU6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHByb3BzLnNlY3JldHMuYXV0aGVudGlrLmxkYXBTZXJ2aWNlVXNlciwgJ3VzZXJuYW1lJyksXG4gICAgICAgICAgQVVUSEVOVElLX0JPT1RTVFJBUF9MREFQU0VSVklDRV9QQVNTV09SRDogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIocHJvcHMuc2VjcmV0cy5hdXRoZW50aWsubGRhcFNlcnZpY2VVc2VyLCAncGFzc3dvcmQnKSxcbiAgICAgICAgfSA6IHt9KSxcbiAgICAgICAgQVVUSEVOVElLX0JPT1RTVFJBUF9QQVNTV09SRDogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIocHJvcHMuc2VjcmV0cy5hdXRoZW50aWsuYWRtaW5Vc2VyUGFzc3dvcmQsICdwYXNzd29yZCcpLFxuICAgICAgICBBVVRIRU5USUtfQk9PVFNUUkFQX1RPS0VOOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihwcm9wcy5zZWNyZXRzLmF1dGhlbnRpay5hZG1pblVzZXJUb2tlbilcbiAgICAgIH0sXG4gICAgICAvLyBBZGQgYmFzaWMgaGVhbHRoIGNoZWNrIGZvciB3b3JrZXIgKHdvcmtlcnMgZG9uJ3QgZXhwb3NlIEhUVFAgZW5kcG9pbnRzKVxuICAgICAgaGVhbHRoQ2hlY2s6IHtcbiAgICAgICAgY29tbWFuZDogWydDTUQnLCAnYWsnLCAnaGVhbHRoY2hlY2snXSxcbiAgICAgICAgaW50ZXJ2YWw6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgcmV0cmllczogMyxcbiAgICAgICAgc3RhcnRQZXJpb2Q6IER1cmF0aW9uLnNlY29uZHMoNjApXG4gICAgICB9LFxuICAgICAgZXNzZW50aWFsOiB0cnVlXG4gICAgfTtcblxuICAgIC8vIEFkZCBlbnZpcm9ubWVudCBmaWxlcyBpZiBTMyBrZXkgaXMgcHJvdmlkZWQgYW5kIHVzZUF1dGhlbnRpa0NvbmZpZ0ZpbGUgaXMgZW5hYmxlZFxuICAgIGlmIChwcm9wcy5zdG9yYWdlLnMzLmVudkZpbGVLZXkgJiYgcHJvcHMuZGVwbG95bWVudC51c2VDb25maWdGaWxlKSB7XG4gICAgICBjb250YWluZXJEZWZpbml0aW9uT3B0aW9ucyA9IHtcbiAgICAgICAgLi4uY29udGFpbmVyRGVmaW5pdGlvbk9wdGlvbnMsXG4gICAgICAgIGVudmlyb25tZW50RmlsZXM6IFtcbiAgICAgICAgICBlY3MuRW52aXJvbm1lbnRGaWxlLmZyb21CdWNrZXQocHJvcHMuc3RvcmFnZS5zMy5jb25maWdCdWNrZXQsIHByb3BzLnN0b3JhZ2UuczMuZW52RmlsZUtleSlcbiAgICAgICAgXVxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCBjb250YWluZXIgPSB0aGlzLnRhc2tEZWZpbml0aW9uLmFkZENvbnRhaW5lcignQXV0aGVudGlrV29ya2VyJywgY29udGFpbmVyRGVmaW5pdGlvbk9wdGlvbnMpO1xuXG4gICAgLy8gQWRkIG1vdW50IHBvaW50cyBmb3IgRUZTIHZvbHVtZXNcbiAgICBjb250YWluZXIuYWRkTW91bnRQb2ludHMoe1xuICAgICAgY29udGFpbmVyUGF0aDogJy9tZWRpYScsXG4gICAgICBzb3VyY2VWb2x1bWU6ICdtZWRpYScsXG4gICAgICByZWFkT25seTogZmFsc2VcbiAgICB9KTtcblxuICAgIGNvbnRhaW5lci5hZGRNb3VudFBvaW50cyh7XG4gICAgICBjb250YWluZXJQYXRoOiAnL3RlbXBsYXRlcycsXG4gICAgICBzb3VyY2VWb2x1bWU6ICdjdXN0b20tdGVtcGxhdGVzJyxcbiAgICAgIHJlYWRPbmx5OiBmYWxzZVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIEVDUyBzZXJ2aWNlIGZvciB3b3JrZXJcbiAgICB0aGlzLmVjc1NlcnZpY2UgPSBuZXcgZWNzLkZhcmdhdGVTZXJ2aWNlKHRoaXMsICdXb3JrZXJTZXJ2aWNlJywge1xuICAgICAgY2x1c3RlcjogcHJvcHMuaW5mcmFzdHJ1Y3R1cmUuZWNzQ2x1c3RlcixcbiAgICAgIHRhc2tEZWZpbml0aW9uOiB0aGlzLnRhc2tEZWZpbml0aW9uLFxuICAgICAgZGVzaXJlZENvdW50OiBwcm9wcy5jb250ZXh0Q29uZmlnLmVjcy5kZXNpcmVkQ291bnQsIC8vIFVzZSBzYW1lIGFzIHNlcnZlclxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtwcm9wcy5pbmZyYXN0cnVjdHVyZS5lY3NTZWN1cml0eUdyb3VwXSxcbiAgICAgIGVuYWJsZUV4ZWN1dGVDb21tYW5kOiBwcm9wcy5kZXBsb3ltZW50LmVuYWJsZUV4ZWN1dGUsXG4gICAgICBhc3NpZ25QdWJsaWNJcDogZmFsc2UsXG4gICAgICAvLyBEaXNhYmxlIGNpcmN1aXQgYnJlYWtlciB0ZW1wb3JhcmlseSB0byBnZXQgYmV0dGVyIGVycm9yIGluZm9ybWF0aW9uXG4gICAgICAvLyBjaXJjdWl0QnJlYWtlcjogeyByb2xsYmFjazogdHJ1ZSB9XG4gICAgfSk7XG5cbiAgICAvLyBBZGQgYXV0byBzY2FsaW5nIGZvciB3b3JrZXJzXG4gICAgY29uc3Qgc2NhbGluZyA9IHRoaXMuZWNzU2VydmljZS5hdXRvU2NhbGVUYXNrQ291bnQoe1xuICAgICAgbWluQ2FwYWNpdHk6IDEsXG4gICAgICBtYXhDYXBhY2l0eTogaXNIaWdoQXZhaWxhYmlsaXR5ID8gMTAgOiAzXG4gICAgfSk7XG5cbiAgICAvLyBTY2FsZSBiYXNlZCBvbiBDUFUgdXRpbGl6YXRpb24gKHdvcmtlcnMgbWF5IGhhdmUgZGlmZmVyZW50IHNjYWxpbmcgcGF0dGVybnMpXG4gICAgc2NhbGluZy5zY2FsZU9uQ3B1VXRpbGl6YXRpb24oJ1dvcmtlckNwdVNjYWxpbmcnLCB7XG4gICAgICB0YXJnZXRVdGlsaXphdGlvblBlcmNlbnQ6IDgwLCAvLyBIaWdoZXIgdGhyZXNob2xkIGZvciB3b3JrZXJzXG4gICAgICBzY2FsZUluQ29vbGRvd246IER1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICBzY2FsZU91dENvb2xkb3duOiBEdXJhdGlvbi5taW51dGVzKDIpXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==