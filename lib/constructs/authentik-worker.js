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
        // Create task role
        const taskRole = new aws_cdk_lib_1.aws_iam.Role(this, 'WorkerTaskRole', {
            assumedBy: new aws_cdk_lib_1.aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        });
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
        const dockerImage = props.ecrRepositoryArn
            ? `${props.ecrRepositoryArn}:latest`
            : 'placeholder-for-local-ecr'; // Fallback for backwards compatibility
        // Prepare container definition options for worker
        let containerDefinitionOptions = {
            image: aws_cdk_lib_1.aws_ecs.ContainerImage.fromRegistry(dockerImage),
            logging: aws_cdk_lib_1.aws_ecs.LogDrivers.awsLogs({
                streamPrefix: 'authentik-worker',
                logGroup
            }),
            command: ['ak', 'worker'], // Worker command
            environment: {
                AUTHENTIK_REDIS__HOST: props.redisHostname,
                AUTHENTIK_POSTGRESQL__HOST: props.dbHostname,
                AUTHENTIK_POSTGRESQL__NAME: 'authentik',
                AUTHENTIK_POSTGRESQL__USER: 'authentik',
            },
            secrets: {
                AUTHENTIK_POSTGRESQL__PASSWORD: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.dbSecret, 'password'),
                AUTHENTIK_REDIS__PASSWORD: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.redisAuthToken),
                AUTHENTIK_SECRET_KEY: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.secretKey),
            },
            essential: true
        };
        // Add environment files if S3 key is provided
        if (props.envFileS3Key) {
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
            circuitBreaker: { rollback: true }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aGVudGlrLXdvcmtlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGhlbnRpay13b3JrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUE7O0dBRUc7QUFDSCwyQ0FBdUM7QUFDdkMsNkNBU3FCO0FBNkZyQjs7R0FFRztBQUNILE1BQWEsZUFBZ0IsU0FBUSxzQkFBUztJQVc1QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTJCO1FBQ25FLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsbUNBQW1DO1FBQ25DLE1BQU0sUUFBUSxHQUFHLElBQUksc0JBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNyRCxZQUFZLEVBQUUsR0FBRyxFQUFFLFNBQVM7WUFDNUIsU0FBUyxFQUFFLHNCQUFJLENBQUMsYUFBYSxDQUFDLFFBQVE7WUFDdEMsYUFBYSxFQUFFLDJCQUFhLENBQUMsT0FBTztTQUNyQyxDQUFDLENBQUM7UUFFSCw2QkFBNkI7UUFDN0IsTUFBTSxhQUFhLEdBQUcsSUFBSSxxQkFBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUseUJBQXlCLEVBQUU7WUFDbEUsU0FBUyxFQUFFLElBQUkscUJBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyx5QkFBeUIsQ0FBQztZQUM5RCxlQUFlLEVBQUU7Z0JBQ2YscUJBQUcsQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQUMsK0NBQStDLENBQUM7YUFDNUY7U0FDRixDQUFDLENBQUM7UUFFSCxvQ0FBb0M7UUFDcEMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDeEMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDOUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLENBQUM7UUFFekMsbUJBQW1CO1FBQ25CLE1BQU0sUUFBUSxHQUFHLElB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QyxHQUFHLENBQUMsaUJBQWlCLElBQUksQ0FBQztZQUNwRCxXQUFXLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLElBQUksQ0FBQztTQUNyRCxDQUFDLENBQUM7UUFFSCwrRUFBK0U7UUFDL0UsT0FBTyxDQUFDLHFCQUFxQixDQUFDLGtCQUFrQixFQUFFO1lBQ2hELHdCQUF3QixFQUFFLEVBQUUsRUFBRSwrQkFBK0I7WUFDN0QsZUFBZSxFQUFFLHNCQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUNwQyxnQkFBZ0IsRUFBRSxzQkFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7U0FDdEMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBekpELDBDQXlKQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQXV0aGVudGlrIFdvcmtlciBDb25zdHJ1Y3QgLSBXb3JrZXIgY29udGFpbmVyIGNvbmZpZ3VyYXRpb24gZm9yIGJhY2tncm91bmQgdGFza3NcbiAqL1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQge1xuICBhd3NfZWMyIGFzIGVjMixcbiAgYXdzX2VjcyBhcyBlY3MsXG4gIGF3c19sb2dzIGFzIGxvZ3MsXG4gIGF3c19zZWNyZXRzbWFuYWdlciBhcyBzZWNyZXRzbWFuYWdlcixcbiAgYXdzX3MzIGFzIHMzLFxuICBhd3NfaWFtIGFzIGlhbSxcbiAgRHVyYXRpb24sXG4gIFJlbW92YWxQb2xpY3lcbn0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHR5cGUgeyBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZyB9IGZyb20gJy4uL2Vudmlyb25tZW50LWNvbmZpZyc7XG5cbi8qKlxuICogUHJvcGVydGllcyBmb3IgdGhlIEF1dGhlbnRpayBXb3JrZXIgY29uc3RydWN0XG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aGVudGlrV29ya2VyUHJvcHMge1xuICAvKipcbiAgICogRW52aXJvbm1lbnQgbmFtZSAoZS5nLiAncHJvZCcsICdkZXYnLCBldGMuKVxuICAgKi9cbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcblxuICAvKipcbiAgICogRW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxuICAgKi9cbiAgY29uZmlnOiBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZztcblxuICAvKipcbiAgICogVlBDIGZvciBkZXBsb3ltZW50XG4gICAqL1xuICB2cGM6IGVjMi5JVnBjO1xuXG4gIC8qKlxuICAgKiBTZWN1cml0eSBncm91cCBmb3IgRUNTIHRhc2tzXG4gICAqL1xuICBlY3NTZWN1cml0eUdyb3VwOiBlYzIuU2VjdXJpdHlHcm91cDtcblxuICAvKipcbiAgICogRUNTIGNsdXN0ZXJcbiAgICovXG4gIGVjc0NsdXN0ZXI6IGVjcy5JQ2x1c3RlcjtcblxuICAvKipcbiAgICogUzMgY29uZmlndXJhdGlvbiBidWNrZXQgZm9yIGVudmlyb25tZW50IGZpbGVzXG4gICAqL1xuICBzM0NvbmZCdWNrZXQ6IHMzLklCdWNrZXQ7XG5cbiAgLyoqXG4gICAqIFMzIGtleSBmb3IgdGhlIGVudmlyb25tZW50IGZpbGUgKG9wdGlvbmFsKVxuICAgKi9cbiAgZW52RmlsZVMzS2V5Pzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBFQ1IgcmVwb3NpdG9yeSBBUk4gZm9yIEVDUiBpbWFnZXNcbiAgICovXG4gIGVjclJlcG9zaXRvcnlBcm4/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEFsbG93IFNTSCBleGVjIGludG8gY29udGFpbmVyXG4gICAqL1xuICBlbmFibGVFeGVjdXRlOiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBEYXRhYmFzZSBzZWNyZXRcbiAgICovXG4gIGRiU2VjcmV0OiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xuXG4gIC8qKlxuICAgKiBEYXRhYmFzZSBob3N0bmFtZVxuICAgKi9cbiAgZGJIb3N0bmFtZTogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBSZWRpcyBhdXRoIHRva2VuXG4gICAqL1xuICByZWRpc0F1dGhUb2tlbjogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcblxuICAvKipcbiAgICogUmVkaXMgaG9zdG5hbWVcbiAgICovXG4gIHJlZGlzSG9zdG5hbWU6IHN0cmluZztcblxuICAvKipcbiAgICogQXV0aGVudGlrIHNlY3JldCBrZXlcbiAgICovXG4gIHNlY3JldEtleTogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcblxuICAvKipcbiAgICogRUZTIGZpbGUgc3lzdGVtIElEXG4gICAqL1xuICBlZnNJZDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBFRlMgbWVkaWEgYWNjZXNzIHBvaW50IElEXG4gICAqL1xuICBlZnNNZWRpYUFjY2Vzc1BvaW50SWQ6IHN0cmluZztcblxuICAvKipcbiAgICogRUZTIGN1c3RvbSB0ZW1wbGF0ZXMgYWNjZXNzIHBvaW50IElEXG4gICAqL1xuICBlZnNDdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludElkOiBzdHJpbmc7XG59XG5cbi8qKlxuICogQ0RLIGNvbnN0cnVjdCBmb3IgdGhlIEF1dGhlbnRpayB3b3JrZXIgY29udGFpbmVyXG4gKi9cbmV4cG9ydCBjbGFzcyBBdXRoZW50aWtXb3JrZXIgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICAvKipcbiAgICogVGhlIEVDUyB0YXNrIGRlZmluaXRpb24gZm9yIHRoZSBBdXRoZW50aWsgd29ya2VyXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgdGFza0RlZmluaXRpb246IGVjcy5UYXNrRGVmaW5pdGlvbjtcblxuICAvKipcbiAgICogVGhlIEVDUyBzZXJ2aWNlIGZvciBBdXRoZW50aWsgd29ya2VyXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgZWNzU2VydmljZTogZWNzLkZhcmdhdGVTZXJ2aWNlO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBBdXRoZW50aWtXb3JrZXJQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIGxvZyBncm91cCBmb3Igd29ya2Vyc1xuICAgIGNvbnN0IGxvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1dvcmtlckxvZ3MnLCB7XG4gICAgICBsb2dHcm91cE5hbWU6IGAke2lkfS13b3JrZXJgLFxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICByZW1vdmFsUG9saWN5OiBSZW1vdmFsUG9saWN5LkRFU1RST1lcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSB0YXNrIGV4ZWN1dGlvbiByb2xlXG4gICAgY29uc3QgZXhlY3V0aW9uUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnV29ya2VyVGFza0V4ZWN1dGlvblJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnZWNzLXRhc2tzLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BbWF6b25FQ1NUYXNrRXhlY3V0aW9uUm9sZVBvbGljeScpXG4gICAgICBdXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgcGVybWlzc2lvbnMgdG8gYWNjZXNzIHNlY3JldHNcbiAgICBwcm9wcy5kYlNlY3JldC5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG4gICAgcHJvcHMucmVkaXNBdXRoVG9rZW4uZ3JhbnRSZWFkKGV4ZWN1dGlvblJvbGUpO1xuICAgIHByb3BzLnNlY3JldEtleS5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG5cbiAgICAvLyBDcmVhdGUgdGFzayByb2xlXG4gICAgY29uc3QgdGFza1JvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1dvcmtlclRhc2tSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2Vjcy10YXNrcy5hbWF6b25hd3MuY29tJyksXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCByZWFkIGFjY2VzcyB0byBTMyBjb25maWd1cmF0aW9uIGJ1Y2tldCBmb3IgZW52aXJvbm1lbnQgZmlsZXNcbiAgICBpZiAocHJvcHMuZW52RmlsZVMzS2V5KSB7XG4gICAgICBwcm9wcy5zM0NvbmZCdWNrZXQuZ3JhbnRSZWFkKHRhc2tSb2xlKTtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgdGFzayBkZWZpbml0aW9uXG4gICAgdGhpcy50YXNrRGVmaW5pdGlvbiA9IG5ldyBlY3MuRmFyZ2F0ZVRhc2tEZWZpbml0aW9uKHRoaXMsICdXb3JrZXJUYXNrRGVmJywge1xuICAgICAgY3B1OiBwcm9wcy5jb25maWcuZWNzLnRhc2tDcHUsXG4gICAgICBtZW1vcnlMaW1pdE1pQjogcHJvcHMuY29uZmlnLmVjcy50YXNrTWVtb3J5LFxuICAgICAgZXhlY3V0aW9uUm9sZSxcbiAgICAgIHRhc2tSb2xlXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgdm9sdW1lcyBmb3IgRUZTXG4gICAgdGhpcy50YXNrRGVmaW5pdGlvbi5hZGRWb2x1bWUoe1xuICAgICAgbmFtZTogJ21lZGlhJyxcbiAgICAgIGVmc1ZvbHVtZUNvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgZmlsZVN5c3RlbUlkOiBwcm9wcy5lZnNJZCxcbiAgICAgICAgdHJhbnNpdEVuY3J5cHRpb246ICdFTkFCTEVEJyxcbiAgICAgICAgYXV0aG9yaXphdGlvbkNvbmZpZzoge1xuICAgICAgICAgIGFjY2Vzc1BvaW50SWQ6IHByb3BzLmVmc01lZGlhQWNjZXNzUG9pbnRJZCxcbiAgICAgICAgICBpYW06ICdFTkFCTEVEJ1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICB0aGlzLnRhc2tEZWZpbml0aW9uLmFkZFZvbHVtZSh7XG4gICAgICBuYW1lOiAnY3VzdG9tLXRlbXBsYXRlcycsXG4gICAgICBlZnNWb2x1bWVDb25maWd1cmF0aW9uOiB7XG4gICAgICAgIGZpbGVTeXN0ZW1JZDogcHJvcHMuZWZzSWQsXG4gICAgICAgIHRyYW5zaXRFbmNyeXB0aW9uOiAnRU5BQkxFRCcsXG4gICAgICAgIGF1dGhvcml6YXRpb25Db25maWc6IHtcbiAgICAgICAgICBhY2Nlc3NQb2ludElkOiBwcm9wcy5lZnNDdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludElkLFxuICAgICAgICAgIGlhbTogJ0VOQUJMRUQnXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIERldGVybWluZSBEb2NrZXIgaW1hZ2UgLSBBbHdheXMgdXNlIEVDUiAod29ya2VycyB1c2UgdGhlIHNhbWUgaW1hZ2UgYXMgc2VydmVyKVxuICAgIGNvbnN0IGRvY2tlckltYWdlID0gcHJvcHMuZWNyUmVwb3NpdG9yeUFybiBcbiAgICAgID8gYCR7cHJvcHMuZWNyUmVwb3NpdG9yeUFybn06bGF0ZXN0YFxuICAgICAgOiAncGxhY2Vob2xkZXItZm9yLWxvY2FsLWVjcic7IC8vIEZhbGxiYWNrIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eVxuXG4gICAgLy8gUHJlcGFyZSBjb250YWluZXIgZGVmaW5pdGlvbiBvcHRpb25zIGZvciB3b3JrZXJcbiAgICBsZXQgY29udGFpbmVyRGVmaW5pdGlvbk9wdGlvbnM6IGVjcy5Db250YWluZXJEZWZpbml0aW9uT3B0aW9ucyA9IHtcbiAgICAgIGltYWdlOiBlY3MuQ29udGFpbmVySW1hZ2UuZnJvbVJlZ2lzdHJ5KGRvY2tlckltYWdlKSxcbiAgICAgIGxvZ2dpbmc6IGVjcy5Mb2dEcml2ZXJzLmF3c0xvZ3Moe1xuICAgICAgICBzdHJlYW1QcmVmaXg6ICdhdXRoZW50aWstd29ya2VyJyxcbiAgICAgICAgbG9nR3JvdXBcbiAgICAgIH0pLFxuICAgICAgY29tbWFuZDogWydhaycsICd3b3JrZXInXSwgLy8gV29ya2VyIGNvbW1hbmRcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEFVVEhFTlRJS19SRURJU19fSE9TVDogcHJvcHMucmVkaXNIb3N0bmFtZSxcbiAgICAgICAgQVVUSEVOVElLX1BPU1RHUkVTUUxfX0hPU1Q6IHByb3BzLmRiSG9zdG5hbWUsXG4gICAgICAgIEFVVEhFTlRJS19QT1NUR1JFU1FMX19OQU1FOiAnYXV0aGVudGlrJyxcbiAgICAgICAgQVVUSEVOVElLX1BPU1RHUkVTUUxfX1VTRVI6ICdhdXRoZW50aWsnLFxuICAgICAgfSxcbiAgICAgIHNlY3JldHM6IHtcbiAgICAgICAgQVVUSEVOVElLX1BPU1RHUkVTUUxfX1BBU1NXT1JEOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihwcm9wcy5kYlNlY3JldCwgJ3Bhc3N3b3JkJyksXG4gICAgICAgIEFVVEhFTlRJS19SRURJU19fUEFTU1dPUkQ6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHByb3BzLnJlZGlzQXV0aFRva2VuKSxcbiAgICAgICAgQVVUSEVOVElLX1NFQ1JFVF9LRVk6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHByb3BzLnNlY3JldEtleSksXG4gICAgICB9LFxuICAgICAgZXNzZW50aWFsOiB0cnVlXG4gICAgfTtcblxuICAgIC8vIEFkZCBlbnZpcm9ubWVudCBmaWxlcyBpZiBTMyBrZXkgaXMgcHJvdmlkZWRcbiAgICBpZiAocHJvcHMuZW52RmlsZVMzS2V5KSB7XG4gICAgICBjb250YWluZXJEZWZpbml0aW9uT3B0aW9ucyA9IHtcbiAgICAgICAgLi4uY29udGFpbmVyRGVmaW5pdGlvbk9wdGlvbnMsXG4gICAgICAgIGVudmlyb25tZW50RmlsZXM6IFtcbiAgICAgICAgICBlY3MuRW52aXJvbm1lbnRGaWxlLmZyb21CdWNrZXQocHJvcHMuczNDb25mQnVja2V0LCBwcm9wcy5lbnZGaWxlUzNLZXkpXG4gICAgICAgIF1cbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgY29udGFpbmVyID0gdGhpcy50YXNrRGVmaW5pdGlvbi5hZGRDb250YWluZXIoJ0F1dGhlbnRpa1dvcmtlcicsIGNvbnRhaW5lckRlZmluaXRpb25PcHRpb25zKTtcblxuICAgIC8vIEFkZCBtb3VudCBwb2ludHMgZm9yIEVGUyB2b2x1bWVzXG4gICAgY29udGFpbmVyLmFkZE1vdW50UG9pbnRzKHtcbiAgICAgIGNvbnRhaW5lclBhdGg6ICcvbWVkaWEnLFxuICAgICAgc291cmNlVm9sdW1lOiAnbWVkaWEnLFxuICAgICAgcmVhZE9ubHk6IGZhbHNlXG4gICAgfSk7XG5cbiAgICBjb250YWluZXIuYWRkTW91bnRQb2ludHMoe1xuICAgICAgY29udGFpbmVyUGF0aDogJy90ZW1wbGF0ZXMnLFxuICAgICAgc291cmNlVm9sdW1lOiAnY3VzdG9tLXRlbXBsYXRlcycsXG4gICAgICByZWFkT25seTogZmFsc2VcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBFQ1Mgc2VydmljZSBmb3Igd29ya2VyXG4gICAgdGhpcy5lY3NTZXJ2aWNlID0gbmV3IGVjcy5GYXJnYXRlU2VydmljZSh0aGlzLCAnV29ya2VyU2VydmljZScsIHtcbiAgICAgIGNsdXN0ZXI6IHByb3BzLmVjc0NsdXN0ZXIsXG4gICAgICB0YXNrRGVmaW5pdGlvbjogdGhpcy50YXNrRGVmaW5pdGlvbixcbiAgICAgIGRlc2lyZWRDb3VudDogcHJvcHMuY29uZmlnLmVjcy53b3JrZXJEZXNpcmVkQ291bnQgfHwgMSwgLy8gRGVmYXVsdCB0byAxIHdvcmtlclxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtwcm9wcy5lY3NTZWN1cml0eUdyb3VwXSxcbiAgICAgIGVuYWJsZUV4ZWN1dGVDb21tYW5kOiBwcm9wcy5lbmFibGVFeGVjdXRlLFxuICAgICAgYXNzaWduUHVibGljSXA6IGZhbHNlLFxuICAgICAgY2lyY3VpdEJyZWFrZXI6IHsgcm9sbGJhY2s6IHRydWUgfVxuICAgIH0pO1xuXG4gICAgLy8gQWRkIGF1dG8gc2NhbGluZyBmb3Igd29ya2Vyc1xuICAgIGNvbnN0IHNjYWxpbmcgPSB0aGlzLmVjc1NlcnZpY2UuYXV0b1NjYWxlVGFza0NvdW50KHtcbiAgICAgIG1pbkNhcGFjaXR5OiBwcm9wcy5jb25maWcuZWNzLndvcmtlck1pbkNhcGFjaXR5IHx8IDEsXG4gICAgICBtYXhDYXBhY2l0eTogcHJvcHMuY29uZmlnLmVjcy53b3JrZXJNYXhDYXBhY2l0eSB8fCAzXG4gICAgfSk7XG5cbiAgICAvLyBTY2FsZSBiYXNlZCBvbiBDUFUgdXRpbGl6YXRpb24gKHdvcmtlcnMgbWF5IGhhdmUgZGlmZmVyZW50IHNjYWxpbmcgcGF0dGVybnMpXG4gICAgc2NhbGluZy5zY2FsZU9uQ3B1VXRpbGl6YXRpb24oJ1dvcmtlckNwdVNjYWxpbmcnLCB7XG4gICAgICB0YXJnZXRVdGlsaXphdGlvblBlcmNlbnQ6IDgwLCAvLyBIaWdoZXIgdGhyZXNob2xkIGZvciB3b3JrZXJzXG4gICAgICBzY2FsZUluQ29vbGRvd246IER1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICBzY2FsZU91dENvb2xkb3duOiBEdXJhdGlvbi5taW51dGVzKDIpXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==