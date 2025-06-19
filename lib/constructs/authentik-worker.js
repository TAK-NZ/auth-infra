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
            // Configure deployment to maintain availability
            minHealthyPercent: isHighAvailability ? 100 : 50,
            maxHealthyPercent: 200,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aGVudGlrLXdvcmtlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGhlbnRpay13b3JrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUE7O0dBRUc7QUFDSCwyQ0FBdUM7QUFDdkMsNkNBYXFCO0FBa0RyQjs7R0FFRztBQUNILE1BQWEsZUFBZ0IsU0FBUSxzQkFBUztJQVc1Qzs7OztPQUlHO0lBQ0ssNEJBQTRCLENBQUMsTUFBYztRQUNqRCw0Q0FBNEM7UUFDNUMsSUFBSSxtQkFBSyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQy9CLG1GQUFtRjtZQUNuRixPQUFPLGdCQUFFLENBQUMsR0FBRyxDQUFDLHdEQUF3RCxFQUFFO2dCQUN0RSxPQUFPLEVBQUUsZ0JBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLGdCQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDNUMsTUFBTSxFQUFFLGdCQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxnQkFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQzNDLFFBQVEsRUFBRSxnQkFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsZ0JBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLGdCQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxnQkFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQzNFLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCw2REFBNkQ7UUFDN0QsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNuQyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFD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cUI7WUFDekUsY0FBYyxFQUFFLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQztZQUN2RCxvQkFBb0IsRUFBRSxLQUFLLENBQUMsVUFBVSxDQUFDLGFBQWE7WUFDcEQsY0FBYyxFQUFFLEtBQUs7WUFDckIsZ0RBQWdEO1lBQ2hELGlCQUFpQixFQUFFLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDaEQsaUJBQWlCLEVBQUUsR0FBRztZQUN0QixzRUFBc0U7WUFDdEUscUNBQXFDO1NBQ3RDLENBQUMsQ0FBQztRQUVILCtCQUErQjtRQUMvQixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDO1lBQ2pELFdBQVcsRUFBRSxDQUFDO1lBQ2QsV0FBVyxFQUFFLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDekMsQ0FBQyxDQUFDO1FBRUgsK0VBQStFO1FBQy9FLE9BQU8sQ0FBQyxxQkFBcUIsQ0FBQyxrQkFBa0IsRUFBRTtZQUNoRCx3QkFBd0IsRUFBRSxFQUFFLEVBQUUsK0JBQStCO1lBQzdELGVBQWUsRUFBRSxzQkFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDcEMsZ0JBQWdCLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1NBQ3RDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXRQRCwwQ0FzUEMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEF1dGhlbnRpayBXb3JrZXIgQ29uc3RydWN0IC0gV29ya2VyIGNvbnRhaW5lciBjb25maWd1cmF0aW9uIGZvciBiYWNrZ3JvdW5kIHRhc2tzXG4gKi9cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHtcbiAgYXdzX2VjMiBhcyBlYzIsXG4gIGF3c19lY3MgYXMgZWNzLFxuICBhd3NfbG9ncyBhcyBsb2dzLFxuICBhd3Nfc2VjcmV0c21hbmFnZXIgYXMgc2VjcmV0c21hbmFnZXIsXG4gIGF3c19zMyBhcyBzMyxcbiAgYXdzX2lhbSBhcyBpYW0sXG4gIGF3c19rbXMgYXMga21zLFxuICBEdXJhdGlvbixcbiAgRm4sXG4gIFRva2VuLFxuICBTdGFjayxcbiAgUmVtb3ZhbFBvbGljeVxufSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgdHlwZSB7IENvbnRleHRFbnZpcm9ubWVudENvbmZpZyB9IGZyb20gJy4uL3N0YWNrLWNvbmZpZyc7XG5pbXBvcnQgdHlwZSB7IFxuICBJbmZyYXN0cnVjdHVyZUNvbmZpZywgXG4gIFNlY3JldHNDb25maWcsIFxuICBTdG9yYWdlQ29uZmlnLCBcbiAgRGVwbG95bWVudENvbmZpZywgXG4gIEF1dGhlbnRpa0FwcGxpY2F0aW9uQ29uZmlnIFxufSBmcm9tICcuLi9jb25zdHJ1Y3QtY29uZmlncyc7XG5cbi8qKlxuICogUHJvcGVydGllcyBmb3IgdGhlIEF1dGhlbnRpayBXb3JrZXIgY29uc3RydWN0XG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aGVudGlrV29ya2VyUHJvcHMge1xuICAvKipcbiAgICogRW52aXJvbm1lbnQgdHlwZSAoJ3Byb2QnIHwgJ2Rldi10ZXN0JylcbiAgICovXG4gIGVudmlyb25tZW50OiAncHJvZCcgfCAnZGV2LXRlc3QnO1xuXG4gIC8qKlxuICAgKiBDb250ZXh0LWJhc2VkIGVudmlyb25tZW50IGNvbmZpZ3VyYXRpb24gKGRpcmVjdCBmcm9tIGNkay5qc29uKVxuICAgKi9cbiAgY29udGV4dENvbmZpZzogQ29udGV4dEVudmlyb25tZW50Q29uZmlnO1xuXG4gIC8qKlxuICAgKiBJbmZyYXN0cnVjdHVyZSBjb25maWd1cmF0aW9uIChWUEMsIEVDUywgc2VjdXJpdHkgZ3JvdXBzKVxuICAgKi9cbiAgaW5mcmFzdHJ1Y3R1cmU6IEluZnJhc3RydWN0dXJlQ29uZmlnO1xuXG4gIC8qKlxuICAgKiBTZWNyZXRzIGNvbmZpZ3VyYXRpb24gKGRhdGFiYXNlLCBSZWRpcywgQXV0aGVudGlrIHNlY3JldHMpXG4gICAqL1xuICBzZWNyZXRzOiBTZWNyZXRzQ29uZmlnO1xuXG4gIC8qKlxuICAgKiBTdG9yYWdlIGNvbmZpZ3VyYXRpb24gKFMzLCBFRlMpXG4gICAqL1xuICBzdG9yYWdlOiBTdG9yYWdlQ29uZmlnO1xuXG4gIC8qKlxuICAgKiBEZXBsb3ltZW50IGNvbmZpZ3VyYXRpb24gKEVDUiwgR2l0IFNIQSwgZXhlY3V0aW9uIHNldHRpbmdzKVxuICAgKi9cbiAgZGVwbG95bWVudDogRGVwbG95bWVudENvbmZpZztcblxuICAvKipcbiAgICogQXV0aGVudGlrIGFwcGxpY2F0aW9uIGNvbmZpZ3VyYXRpb24gKGFkbWluIHNldHRpbmdzLCBMREFQLCBob3N0IFVSTClcbiAgICovXG4gIGFwcGxpY2F0aW9uOiBBdXRoZW50aWtBcHBsaWNhdGlvbkNvbmZpZztcbn1cblxuLyoqXG4gKiBDREsgY29uc3RydWN0IGZvciB0aGUgQXV0aGVudGlrIHdvcmtlciBjb250YWluZXJcbiAqL1xuZXhwb3J0IGNsYXNzIEF1dGhlbnRpa1dvcmtlciBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBUaGUgRUNTIHRhc2sgZGVmaW5pdGlvbiBmb3IgdGhlIEF1dGhlbnRpayB3b3JrZXJcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSB0YXNrRGVmaW5pdGlvbjogZWNzLlRhc2tEZWZpbml0aW9uO1xuXG4gIC8qKlxuICAgKiBUaGUgRUNTIHNlcnZpY2UgZm9yIEF1dGhlbnRpayB3b3JrZXJcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBlY3NTZXJ2aWNlOiBlY3MuRmFyZ2F0ZVNlcnZpY2U7XG5cbiAgLyoqXG4gICAqIENvbnZlcnRzIGFuIEVDUiByZXBvc2l0b3J5IEFSTiB0byBhIHByb3BlciBFQ1IgcmVwb3NpdG9yeSBVUkkgZm9yIERvY2tlciBpbWFnZXNcbiAgICogQHBhcmFtIGVjckFybiAtIEVDUiByZXBvc2l0b3J5IEFSTiAoZS5nLiwgXCJhcm46YXdzOmVjcjpyZWdpb246YWNjb3VudDpyZXBvc2l0b3J5L3JlcG8tbmFtZVwiKVxuICAgKiBAcmV0dXJucyBFQ1IgcmVwb3NpdG9yeSBVUkkgKGUuZy4sIFwiYWNjb3VudC5ka3IuZWNyLnJlZ2lvbi5hbWF6b25hd3MuY29tL3JlcG8tbmFtZVwiKVxuICAgKi9cbiAgcHJpdmF0ZSBjb252ZXJ0RWNyQXJuVG9SZXBvc2l0b3J5VXJpKGVjckFybjogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAvLyBIYW5kbGUgQ0RLIHRva2VucyAodW5yZXNvbHZlZCByZWZlcmVuY2VzKVxuICAgIGlmIChUb2tlbi5pc1VucmVzb2x2ZWQoZWNyQXJuKSkge1xuICAgICAgLy8gRm9yIHRva2Vucywgd2UgbmVlZCB0byB1c2UgQ0RLJ3MgRm4uc3ViIHRvIHBlcmZvcm0gdGhlIGNvbnZlcnNpb24gYXQgZGVwbG95IHRpbWVcbiAgICAgIHJldHVybiBGbi5zdWIoJyR7QWNjb3VudH0uZGtyLmVjci4ke1JlZ2lvbn0uYW1hem9uYXdzLmNvbS8ke1JlcG9OYW1lfScsIHtcbiAgICAgICAgQWNjb3VudDogRm4uc2VsZWN0KDQsIEZuLnNwbGl0KCc6JywgZWNyQXJuKSksXG4gICAgICAgIFJlZ2lvbjogRm4uc2VsZWN0KDMsIEZuLnNwbGl0KCc6JywgZWNyQXJuKSksXG4gICAgICAgIFJlcG9OYW1lOiBGbi5zZWxlY3QoMSwgRm4uc3BsaXQoJy8nLCBGbi5zZWxlY3QoNSwgRm4uc3BsaXQoJzonLCBlY3JBcm4pKSkpXG4gICAgICB9KTtcbiAgICB9XG4gICAgXG4gICAgLy8gUGFyc2UgQVJOOiBhcm46YXdzOmVjcjpyZWdpb246YWNjb3VudDpyZXBvc2l0b3J5L3JlcG8tbmFtZVxuICAgIGNvbnN0IGFyblBhcnRzID0gZWNyQXJuLnNwbGl0KCc6Jyk7XG4gICAgaWYgKGFyblBhcnRzLmxlbmd0aCAhPT0gNiB8fCAhYXJuUGFydHNbNV0uc3RhcnRzV2l0aCgncmVwb3NpdG9yeS8nKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIEVDUiByZXBvc2l0b3J5IEFSTiBmb3JtYXQ6ICR7ZWNyQXJufWApO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCByZWdpb24gPSBhcm5QYXJ0c1szXTtcbiAgICBjb25zdCBhY2NvdW50ID0gYXJuUGFydHNbNF07XG4gICAgY29uc3QgcmVwb3NpdG9yeU5hbWUgPSBhcm5QYXJ0c1s1XS5yZXBsYWNlKCdyZXBvc2l0b3J5LycsICcnKTtcbiAgICBcbiAgICByZXR1cm4gYCR7YWNjb3VudH0uZGtyLmVjci4ke3JlZ2lvbn0uYW1hem9uYXdzLmNvbS8ke3JlcG9zaXRvcnlOYW1lfWA7XG4gIH1cblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQXV0aGVudGlrV29ya2VyUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gRGVyaXZlIGVudmlyb25tZW50LXNwZWNpZmljIHZhbHVlcyBmcm9tIGNvbnRleHQgKG1hdGNoZXMgcmVmZXJlbmNlIHBhdHRlcm4pXG4gICAgY29uc3QgaXNIaWdoQXZhaWxhYmlsaXR5ID0gcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJztcbiAgICBjb25zdCByZW1vdmFsUG9saWN5ID0gcHJvcHMuY29udGV4dENvbmZpZy5nZW5lcmFsLnJlbW92YWxQb2xpY3kgPT09ICdSRVRBSU4nID8gXG4gICAgICBSZW1vdmFsUG9saWN5LlJFVEFJTiA6IFJlbW92YWxQb2xpY3kuREVTVFJPWTtcbiAgICBjb25zdCBsb2dSZXRlbnRpb25EYXlzID0gaXNIaWdoQXZhaWxhYmlsaXR5ID8gMzAgOiA3O1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBsb2cgZ3JvdXAgZm9yIHdvcmtlcnNcbiAgICBjb25zdCBsb2dHcm91cCA9IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdXb3JrZXJMb2dzJywge1xuICAgICAgbG9nR3JvdXBOYW1lOiBgJHtpZH0td29ya2VyYCxcbiAgICAgIHJldGVudGlvbjogbG9nUmV0ZW50aW9uRGF5cyxcbiAgICAgIHJlbW92YWxQb2xpY3k6IHJlbW92YWxQb2xpY3lcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSB0YXNrIGV4ZWN1dGlvbiByb2xlXG4gICAgY29uc3QgZXhlY3V0aW9uUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnV29ya2VyVGFza0V4ZWN1dGlvblJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnZWNzLXRhc2tzLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BbWF6b25FQ1NUYXNrRXhlY3V0aW9uUm9sZVBvbGljeScpXG4gICAgICBdXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgcGVybWlzc2lvbnMgdG8gYWNjZXNzIHNlY3JldHNcbiAgICBwcm9wcy5zZWNyZXRzLmRhdGFiYXNlLmdyYW50UmVhZChleGVjdXRpb25Sb2xlKTtcbiAgICBwcm9wcy5zZWNyZXRzLnJlZGlzQXV0aFRva2VuLmdyYW50UmVhZChleGVjdXRpb25Sb2xlKTtcbiAgICBwcm9wcy5zZWNyZXRzLmF1dGhlbnRpay5zZWNyZXRLZXkuZ3JhbnRSZWFkKGV4ZWN1dGlvblJvbGUpO1xuICAgIGlmIChwcm9wcy5zZWNyZXRzLmF1dGhlbnRpay5sZGFwU2VydmljZVVzZXIpIHtcbiAgICAgIHByb3BzLnNlY3JldHMuYXV0aGVudGlrLmxkYXBTZXJ2aWNlVXNlci5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG4gICAgfVxuICAgIHByb3BzLnNlY3JldHMuYXV0aGVudGlrLmFkbWluVXNlclBhc3N3b3JkLmdyYW50UmVhZChleGVjdXRpb25Sb2xlKTtcbiAgICBwcm9wcy5zZWNyZXRzLmF1dGhlbnRpay5hZG1pblVzZXJUb2tlbi5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG5cbiAgICAvLyBHcmFudCBleHBsaWNpdCBLTVMgcGVybWlzc2lvbnMgZm9yIHNlY3JldHMgZGVjcnlwdGlvblxuICAgIHByb3BzLmluZnJhc3RydWN0dXJlLmttc0tleS5ncmFudERlY3J5cHQoZXhlY3V0aW9uUm9sZSk7XG5cbiAgICAvLyBHcmFudCBTMyBhY2Nlc3MgdG8gZXhlY3V0aW9uIHJvbGUgZm9yIGVudmlyb25tZW50IGZpbGVzIChuZWVkZWQgZHVyaW5nIHRhc2sgaW5pdGlhbGl6YXRpb24pXG4gICAgaWYgKHByb3BzLnN0b3JhZ2UuczMuZW52RmlsZUtleSkge1xuICAgICAgcHJvcHMuc3RvcmFnZS5zMy5jb25maWdCdWNrZXQuZ3JhbnRSZWFkKGV4ZWN1dGlvblJvbGUpO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSB0YXNrIHJvbGVcbiAgICBjb25zdCB0YXNrUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnV29ya2VyVGFza1JvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnZWNzLXRhc2tzLmFtYXpvbmF3cy5jb20nKSxcbiAgICB9KTtcblxuICAgIC8vIEFkZCBFRlMgcGVybWlzc2lvbnMgZm9yIHRhc2sgcm9sZVxuICAgIHRhc2tSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2VsYXN0aWNmaWxlc3lzdGVtOkNsaWVudE1vdW50JyxcbiAgICAgICAgJ2VsYXN0aWNmaWxlc3lzdGVtOkNsaWVudFdyaXRlJyxcbiAgICAgICAgJ2VsYXN0aWNmaWxlc3lzdGVtOkNsaWVudFJvb3RBY2Nlc3MnLFxuICAgICAgICAnZWxhc3RpY2ZpbGVzeXN0ZW06RGVzY3JpYmVNb3VudFRhcmdldHMnLFxuICAgICAgICAnZWxhc3RpY2ZpbGVzeXN0ZW06RGVzY3JpYmVGaWxlU3lzdGVtcydcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6ZWxhc3RpY2ZpbGVzeXN0ZW06JHtTdGFjay5vZih0aGlzKS5yZWdpb259OiR7U3RhY2sub2YodGhpcykuYWNjb3VudH06ZmlsZS1zeXN0ZW0vJHtwcm9wcy5zdG9yYWdlLmVmcy5maWxlU3lzdGVtSWR9YCxcbiAgICAgICAgYGFybjphd3M6ZWxhc3RpY2ZpbGVzeXN0ZW06JHtTdGFjay5vZih0aGlzKS5yZWdpb259OiR7U3RhY2sub2YodGhpcykuYWNjb3VudH06YWNjZXNzLXBvaW50LyR7cHJvcHMuc3RvcmFnZS5lZnMubWVkaWFBY2Nlc3NQb2ludElkfWAsXG4gICAgICAgIGBhcm46YXdzOmVsYXN0aWNmaWxlc3lzdGVtOiR7U3RhY2sub2YodGhpcykucmVnaW9ufToke1N0YWNrLm9mKHRoaXMpLmFjY291bnR9OmFjY2Vzcy1wb2ludC8ke3Byb3BzLnN0b3JhZ2UuZWZzLmN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50SWR9YFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIEdyYW50IHJlYWQgYWNjZXNzIHRvIFMzIGNvbmZpZ3VyYXRpb24gYnVja2V0IGZvciB0YXNrIHJvbGUgKGZvciBydW50aW1lIGFjY2VzcylcbiAgICBpZiAocHJvcHMuc3RvcmFnZS5zMy5lbnZGaWxlS2V5KSB7XG4gICAgICBwcm9wcy5zdG9yYWdlLnMzLmNvbmZpZ0J1Y2tldC5ncmFudFJlYWQodGFza1JvbGUpO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSB0YXNrIGRlZmluaXRpb25cbiAgICB0aGlzLnRhc2tEZWZpbml0aW9uID0gbmV3IGVjcy5GYXJnYXRlVGFza0RlZmluaXRpb24odGhpcywgJ1dvcmtlclRhc2tEZWYnLCB7XG4gICAgICBjcHU6IHByb3BzLmNvbnRleHRDb25maWcuZWNzLnRhc2tDcHUsXG4gICAgICBtZW1vcnlMaW1pdE1pQjogcHJvcHMuY29udGV4dENvbmZpZy5lY3MudGFza01lbW9yeSxcbiAgICAgIGV4ZWN1dGlvblJvbGUsXG4gICAgICB0YXNrUm9sZVxuICAgIH0pO1xuXG4gICAgLy8gQWRkIHZvbHVtZXMgZm9yIEVGU1xuICAgIHRoaXMudGFza0RlZmluaXRpb24uYWRkVm9sdW1lKHtcbiAgICAgIG5hbWU6ICdtZWRpYScsXG4gICAgICBlZnNWb2x1bWVDb25maWd1cmF0aW9uOiB7XG4gICAgICAgIGZpbGVTeXN0ZW1JZDogcHJvcHMuc3RvcmFnZS5lZnMuZmlsZVN5c3RlbUlkLFxuICAgICAgICB0cmFuc2l0RW5jcnlwdGlvbjogJ0VOQUJMRUQnLFxuICAgICAgICBhdXRob3JpemF0aW9uQ29uZmlnOiB7XG4gICAgICAgICAgYWNjZXNzUG9pbnRJZDogcHJvcHMuc3RvcmFnZS5lZnMubWVkaWFBY2Nlc3NQb2ludElkLFxuICAgICAgICAgIGlhbTogJ0VOQUJMRUQnXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHRoaXMudGFza0RlZmluaXRpb24uYWRkVm9sdW1lKHtcbiAgICAgIG5hbWU6ICdjdXN0b20tdGVtcGxhdGVzJyxcbiAgICAgIGVmc1ZvbHVtZUNvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgZmlsZVN5c3RlbUlkOiBwcm9wcy5zdG9yYWdlLmVmcy5maWxlU3lzdGVtSWQsXG4gICAgICAgIHRyYW5zaXRFbmNyeXB0aW9uOiAnRU5BQkxFRCcsXG4gICAgICAgIGF1dGhvcml6YXRpb25Db25maWc6IHtcbiAgICAgICAgICBhY2Nlc3NQb2ludElkOiBwcm9wcy5zdG9yYWdlLmVmcy5jdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludElkLFxuICAgICAgICAgIGlhbTogJ0VOQUJMRUQnXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIERldGVybWluZSBEb2NrZXIgaW1hZ2UgLSBBbHdheXMgdXNlIEVDUiAod29ya2VycyB1c2UgdGhlIHNhbWUgaW1hZ2UgYXMgc2VydmVyKVxuICAgIGlmICghcHJvcHMuZGVwbG95bWVudC5lY3JSZXBvc2l0b3J5QXJuKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0VDUiByZXBvc2l0b3J5IEFSTiBpcyByZXF1aXJlZCBmb3IgQXV0aGVudGlrIFdvcmtlciBkZXBsb3ltZW50Jyk7XG4gICAgfVxuICAgIFxuICAgIC8vIENvbnZlcnQgRUNSIEFSTiB0byBwcm9wZXIgcmVwb3NpdG9yeSBVUklcbiAgICBjb25zdCBlY3JSZXBvc2l0b3J5VXJpID0gdGhpcy5jb252ZXJ0RWNyQXJuVG9SZXBvc2l0b3J5VXJpKHByb3BzLmRlcGxveW1lbnQuZWNyUmVwb3NpdG9yeUFybik7XG4gICAgY29uc3QgZG9ja2VySW1hZ2UgPSBgJHtlY3JSZXBvc2l0b3J5VXJpfTphdXRoLWluZnJhLXNlcnZlci0ke3Byb3BzLmRlcGxveW1lbnQuZ2l0U2hhfWA7XG5cbiAgICAvLyBQcmVwYXJlIGNvbnRhaW5lciBkZWZpbml0aW9uIG9wdGlvbnMgZm9yIHdvcmtlclxuICAgIGxldCBjb250YWluZXJEZWZpbml0aW9uT3B0aW9uczogZWNzLkNvbnRhaW5lckRlZmluaXRpb25PcHRpb25zID0ge1xuICAgICAgaW1hZ2U6IGVjcy5Db250YWluZXJJbWFnZS5mcm9tUmVnaXN0cnkoZG9ja2VySW1hZ2UpLFxuICAgICAgbG9nZ2luZzogZWNzLkxvZ0RyaXZlcnMuYXdzTG9ncyh7XG4gICAgICAgIHN0cmVhbVByZWZpeDogJ2F1dGhlbnRpay13b3JrZXInLFxuICAgICAgICBsb2dHcm91cFxuICAgICAgfSksXG4gICAgICBjb21tYW5kOiBbJ3dvcmtlciddLCAvLyBXb3JrZXIgY29tbWFuZFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgQVVUSEVOVElLX1BPU1RHUkVTUUxfX0hPU1Q6IHByb3BzLmFwcGxpY2F0aW9uLmRhdGFiYXNlLmhvc3RuYW1lLFxuICAgICAgICBBVVRIRU5USUtfUE9TVEdSRVNRTF9fVVNFUjogJ2F1dGhlbnRpaycsXG4gICAgICAgIEFVVEhFTlRJS19SRURJU19fSE9TVDogcHJvcHMuYXBwbGljYXRpb24ucmVkaXMuaG9zdG5hbWUsXG4gICAgICAgIEFVVEhFTlRJS19SRURJU19fVExTOiAnVHJ1ZScsXG4gICAgICAgIEFVVEhFTlRJS19SRURJU19fVExTX1JFUVM6ICdyZXF1aXJlZCcsXG4gICAgICAgIC8vIEFkZCBlc3NlbnRpYWwgYm9vdHN0cmFwIGNvbmZpZ3VyYXRpb24gZm9yIHdvcmtlclxuICAgICAgICBBVVRIRU5USUtfQk9PVFNUUkFQX0VNQUlMOiBwcm9wcy5hcHBsaWNhdGlvbi5hZG1pblVzZXJFbWFpbCxcbiAgICAgICAgQVVUSEVOVElLX0JPT1RTVFJBUF9MREFQX0JBU0VETjogcHJvcHMuYXBwbGljYXRpb24ubGRhcEJhc2VEbixcbiAgICAgICAgLy8gQXV0aGVudGlrIHNlcnZpY2UgaG9zdCBVUkwgZm9yIEFQSSBjb21tdW5pY2F0aW9ucyBmcm9tIExEQVAgT3V0cG9zdFxuICAgICAgICBBVVRIRU5USUtfQk9PVFNUUkFQX0xEQVBfQVVUSEVOVElLX0hPU1Q6IHByb3BzLmFwcGxpY2F0aW9uLmF1dGhlbnRpa0hvc3QgfHwgJycsXG4gICAgICB9LFxuICAgICAgc2VjcmV0czoge1xuICAgICAgICBBVVRIRU5USUtfUE9TVEdSRVNRTF9fUEFTU1dPUkQ6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHByb3BzLnNlY3JldHMuZGF0YWJhc2UsICdwYXNzd29yZCcpLFxuICAgICAgICBBVVRIRU5USUtfUkVESVNfX1BBU1NXT1JEOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihwcm9wcy5zZWNyZXRzLnJlZGlzQXV0aFRva2VuKSxcbiAgICAgICAgQVVUSEVOVElLX1NFQ1JFVF9LRVk6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHByb3BzLnNlY3JldHMuYXV0aGVudGlrLnNlY3JldEtleSksXG4gICAgICAgIC4uLihwcm9wcy5zZWNyZXRzLmF1dGhlbnRpay5sZGFwU2VydmljZVVzZXIgPyB7XG4gICAgICAgICAgQVVUSEVOVElLX0JPT1RTVFJBUF9MREFQU0VSVklDRV9VU0VSTkFNRTogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIocHJvcHMuc2VjcmV0cy5hdXRoZW50aWsubGRhcFNlcnZpY2VVc2VyLCAndXNlcm5hbWUnKSxcbiAgICAgICAgICBBVVRIRU5USUtfQk9PVFNUUkFQX0xEQVBTRVJWSUNFX1BBU1NXT1JEOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihwcm9wcy5zZWNyZXRzLmF1dGhlbnRpay5sZGFwU2VydmljZVVzZXIsICdwYXNzd29yZCcpLFxuICAgICAgICB9IDoge30pLFxuICAgICAgICBBVVRIRU5USUtfQk9PVFNUUkFQX1BBU1NXT1JEOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihwcm9wcy5zZWNyZXRzLmF1dGhlbnRpay5hZG1pblVzZXJQYXNzd29yZCwgJ3Bhc3N3b3JkJyksXG4gICAgICAgIEFVVEhFTlRJS19CT09UU1RSQVBfVE9LRU46IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHByb3BzLnNlY3JldHMuYXV0aGVudGlrLmFkbWluVXNlclRva2VuKVxuICAgICAgfSxcbiAgICAgIC8vIEFkZCBiYXNpYyBoZWFsdGggY2hlY2sgZm9yIHdvcmtlciAod29ya2VycyBkb24ndCBleHBvc2UgSFRUUCBlbmRwb2ludHMpXG4gICAgICBoZWFsdGhDaGVjazoge1xuICAgICAgICBjb21tYW5kOiBbJ0NNRCcsICdhaycsICdoZWFsdGhjaGVjayddLFxuICAgICAgICBpbnRlcnZhbDogRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICByZXRyaWVzOiAzLFxuICAgICAgICBzdGFydFBlcmlvZDogRHVyYXRpb24uc2Vjb25kcyg2MClcbiAgICAgIH0sXG4gICAgICBlc3NlbnRpYWw6IHRydWVcbiAgICB9O1xuXG4gICAgLy8gQWRkIGVudmlyb25tZW50IGZpbGVzIGlmIFMzIGtleSBpcyBwcm92aWRlZCBhbmQgdXNlQXV0aGVudGlrQ29uZmlnRmlsZSBpcyBlbmFibGVkXG4gICAgaWYgKHByb3BzLnN0b3JhZ2UuczMuZW52RmlsZUtleSAmJiBwcm9wcy5kZXBsb3ltZW50LnVzZUNvbmZpZ0ZpbGUpIHtcbiAgICAgIGNvbnRhaW5lckRlZmluaXRpb25PcHRpb25zID0ge1xuICAgICAgICAuLi5jb250YWluZXJEZWZpbml0aW9uT3B0aW9ucyxcbiAgICAgICAgZW52aXJvbm1lbnRGaWxlczogW1xuICAgICAgICAgIGVjcy5FbnZpcm9ubWVudEZpbGUuZnJvbUJ1Y2tldChwcm9wcy5zdG9yYWdlLnMzLmNvbmZpZ0J1Y2tldCwgcHJvcHMuc3RvcmFnZS5zMy5lbnZGaWxlS2V5KVxuICAgICAgICBdXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IGNvbnRhaW5lciA9IHRoaXMudGFza0RlZmluaXRpb24uYWRkQ29udGFpbmVyKCdBdXRoZW50aWtXb3JrZXInLCBjb250YWluZXJEZWZpbml0aW9uT3B0aW9ucyk7XG5cbiAgICAvLyBBZGQgbW91bnQgcG9pbnRzIGZvciBFRlMgdm9sdW1lc1xuICAgIGNvbnRhaW5lci5hZGRNb3VudFBvaW50cyh7XG4gICAgICBjb250YWluZXJQYXRoOiAnL21lZGlhJyxcbiAgICAgIHNvdXJjZVZvbHVtZTogJ21lZGlhJyxcbiAgICAgIHJlYWRPbmx5OiBmYWxzZVxuICAgIH0pO1xuXG4gICAgY29udGFpbmVyLmFkZE1vdW50UG9pbnRzKHtcbiAgICAgIGNvbnRhaW5lclBhdGg6ICcvdGVtcGxhdGVzJyxcbiAgICAgIHNvdXJjZVZvbHVtZTogJ2N1c3RvbS10ZW1wbGF0ZXMnLFxuICAgICAgcmVhZE9ubHk6IGZhbHNlXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgRUNTIHNlcnZpY2UgZm9yIHdvcmtlclxuICAgIHRoaXMuZWNzU2VydmljZSA9IG5ldyBlY3MuRmFyZ2F0ZVNlcnZpY2UodGhpcywgJ1dvcmtlclNlcnZpY2UnLCB7XG4gICAgICBjbHVzdGVyOiBwcm9wcy5pbmZyYXN0cnVjdHVyZS5lY3NDbHVzdGVyLFxuICAgICAgdGFza0RlZmluaXRpb246IHRoaXMudGFza0RlZmluaXRpb24sXG4gICAgICBkZXNpcmVkQ291bnQ6IHByb3BzLmNvbnRleHRDb25maWcuZWNzLmRlc2lyZWRDb3VudCwgLy8gVXNlIHNhbWUgYXMgc2VydmVyXG4gICAgICBzZWN1cml0eUdyb3VwczogW3Byb3BzLmluZnJhc3RydWN0dXJlLmVjc1NlY3VyaXR5R3JvdXBdLFxuICAgICAgZW5hYmxlRXhlY3V0ZUNvbW1hbmQ6IHByb3BzLmRlcGxveW1lbnQuZW5hYmxlRXhlY3V0ZSxcbiAgICAgIGFzc2lnblB1YmxpY0lwOiBmYWxzZSxcbiAgICAgIC8vIENvbmZpZ3VyZSBkZXBsb3ltZW50IHRvIG1haW50YWluIGF2YWlsYWJpbGl0eVxuICAgICAgbWluSGVhbHRoeVBlcmNlbnQ6IGlzSGlnaEF2YWlsYWJpbGl0eSA/IDEwMCA6IDUwLFxuICAgICAgbWF4SGVhbHRoeVBlcmNlbnQ6IDIwMCxcbiAgICAgIC8vIERpc2FibGUgY2lyY3VpdCBicmVha2VyIHRlbXBvcmFyaWx5IHRvIGdldCBiZXR0ZXIgZXJyb3IgaW5mb3JtYXRpb25cbiAgICAgIC8vIGNpcmN1aXRCcmVha2VyOiB7IHJvbGxiYWNrOiB0cnVlIH1cbiAgICB9KTtcblxuICAgIC8vIEFkZCBhdXRvIHNjYWxpbmcgZm9yIHdvcmtlcnNcbiAgICBjb25zdCBzY2FsaW5nID0gdGhpcy5lY3NTZXJ2aWNlLmF1dG9TY2FsZVRhc2tDb3VudCh7XG4gICAgICBtaW5DYXBhY2l0eTogMSxcbiAgICAgIG1heENhcGFjaXR5OiBpc0hpZ2hBdmFpbGFiaWxpdHkgPyAxMCA6IDNcbiAgICB9KTtcblxuICAgIC8vIFNjYWxlIGJhc2VkIG9uIENQVSB1dGlsaXphdGlvbiAod29ya2VycyBtYXkgaGF2ZSBkaWZmZXJlbnQgc2NhbGluZyBwYXR0ZXJucylcbiAgICBzY2FsaW5nLnNjYWxlT25DcHVVdGlsaXphdGlvbignV29ya2VyQ3B1U2NhbGluZycsIHtcbiAgICAgIHRhcmdldFV0aWxpemF0aW9uUGVyY2VudDogODAsIC8vIEhpZ2hlciB0aHJlc2hvbGQgZm9yIHdvcmtlcnNcbiAgICAgIHNjYWxlSW5Db29sZG93bjogRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIHNjYWxlT3V0Q29vbGRvd246IER1cmF0aW9uLm1pbnV0ZXMoMilcbiAgICB9KTtcbiAgfVxufVxuIl19