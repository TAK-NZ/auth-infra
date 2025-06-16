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
            ? `${props.ecrRepositoryArn}:auth-infra-server-${props.gitSha}`
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aGVudGlrLXdvcmtlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGhlbnRpay13b3JrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUE7O0dBRUc7QUFDSCwyQ0FBdUM7QUFDdkMsNkNBU3FCO0FBdUdyQjs7R0FFRztBQUNILE1BQWEsZUFBZ0IsU0FBUSxzQkFBUztJQVc1QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTJCO1FBQ25FLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsbUNBQW1DO1FBQ25DLE1BQU0sUUFBUSxHQUFHLElBQUksc0JBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNyRCxZQUFZLEVBQUUsR0FBRyxFQUFFLFNBQVM7WUFDNUIsU0FBUyxFQUFFLHNCQUFJLENBQUMsYUFBYSxDQUFDLFFBQVE7WUFDdEMsYUFBYSxFQUFFLDJCQUFhLENBQUMsT0FBTztTQUNyQyxDQUFDLENBQUM7UUFFSCw2QkFBNkI7UUFDN0IsTUFBTSxhQUFhLEdBQUcsSUFBSSxxQkFBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUseUJBQXlCLEVBQUU7WUFDbEUsU0FBUyxFQUFFLElBQUkscUJBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyx5QkFBeUIsQ0FBQztZQUM5RCxlQUFlLEVBQUU7Z0JBQ2YscUJBQUcsQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQUMsK0NBQStDLENBQUM7YUFDNUY7U0FDRixDQUFDLENBQUM7UUFFSCxvQ0FBb0M7UUFDcEMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDeEMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDOUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLENBQUM7UUFFekMsbUJBQW1CO1FBQ25CLE1BQU0sUUFBUSxHQUFHLElB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QUFrQixDQUFDO1lBQ2pELFdBQVcsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsSUFBSSxDQUFDO1lBQ3BELFdBQVcsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsSUFBSSxDQUFDO1NBQ3JELENBQUMsQ0FBQztRQUVILCtFQUErRTtRQUMvRSxPQUFPLENBQUMscUJBQXFCLENBQUMsa0JBQWtCLEVBQUU7WUFDaEQsd0JBQXdCLEVBQUUsRUFBRSxFQUFFLCtCQUErQjtZQUM3RCxlQUFlLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ3BDLGdCQUFnQixFQUFFLHNCQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztTQUN0QyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF6SkQsMENBeUpDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBBdXRoZW50aWsgV29ya2VyIENvbnN0cnVjdCAtIFdvcmtlciBjb250YWluZXIgY29uZmlndXJhdGlvbiBmb3IgYmFja2dyb3VuZCB0YXNrc1xuICovXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7XG4gIGF3c19lYzIgYXMgZWMyLFxuICBhd3NfZWNzIGFzIGVjcyxcbiAgYXdzX2xvZ3MgYXMgbG9ncyxcbiAgYXdzX3NlY3JldHNtYW5hZ2VyIGFzIHNlY3JldHNtYW5hZ2VyLFxuICBhd3NfczMgYXMgczMsXG4gIGF3c19pYW0gYXMgaWFtLFxuICBEdXJhdGlvbixcbiAgUmVtb3ZhbFBvbGljeVxufSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgdHlwZSB7IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi4vZW52aXJvbm1lbnQtY29uZmlnJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciB0aGUgQXV0aGVudGlrIFdvcmtlciBjb25zdHJ1Y3RcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBBdXRoZW50aWtXb3JrZXJQcm9wcyB7XG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBuYW1lIChlLmcuICdwcm9kJywgJ2RldicsIGV0Yy4pXG4gICAqL1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBjb25maWd1cmF0aW9uXG4gICAqL1xuICBjb25maWc6IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnO1xuXG4gIC8qKlxuICAgKiBWUEMgZm9yIGRlcGxveW1lbnRcbiAgICovXG4gIHZwYzogZWMyLklWcGM7XG5cbiAgLyoqXG4gICAqIFNlY3VyaXR5IGdyb3VwIGZvciBFQ1MgdGFza3NcbiAgICovXG4gIGVjc1NlY3VyaXR5R3JvdXA6IGVjMi5TZWN1cml0eUdyb3VwO1xuXG4gIC8qKlxuICAgKiBFQ1MgY2x1c3RlclxuICAgKi9cbiAgZWNzQ2x1c3RlcjogZWNzLklDbHVzdGVyO1xuXG4gIC8qKlxuICAgKiBTMyBjb25maWd1cmF0aW9uIGJ1Y2tldCBmb3IgZW52aXJvbm1lbnQgZmlsZXNcbiAgICovXG4gIHMzQ29uZkJ1Y2tldDogczMuSUJ1Y2tldDtcblxuICAvKipcbiAgICogUzMga2V5IGZvciB0aGUgZW52aXJvbm1lbnQgZmlsZSAob3B0aW9uYWwpXG4gICAqL1xuICBlbnZGaWxlUzNLZXk/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFVzZSBhdXRoZW50aWsgY29uZmlnIGZpbGUgZnJvbSBTMyAoZGVmYXVsdDogZmFsc2UpXG4gICAqL1xuICB1c2VBdXRoZW50aWtDb25maWdGaWxlOiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBFQ1IgcmVwb3NpdG9yeSBBUk4gZm9yIEVDUiBpbWFnZXNcbiAgICovXG4gIGVjclJlcG9zaXRvcnlBcm4/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEdpdCBTSEEgZm9yIERvY2tlciBpbWFnZSB0YWdnaW5nXG4gICAqL1xuICBnaXRTaGE6IHN0cmluZztcblxuICAvKipcbiAgICogQWxsb3cgU1NIIGV4ZWMgaW50byBjb250YWluZXJcbiAgICovXG4gIGVuYWJsZUV4ZWN1dGU6IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIERhdGFiYXNlIHNlY3JldFxuICAgKi9cbiAgZGJTZWNyZXQ6IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG5cbiAgLyoqXG4gICAqIERhdGFiYXNlIGhvc3RuYW1lXG4gICAqL1xuICBkYkhvc3RuYW1lOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFJlZGlzIGF1dGggdG9rZW5cbiAgICovXG4gIHJlZGlzQXV0aFRva2VuOiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xuXG4gIC8qKlxuICAgKiBSZWRpcyBob3N0bmFtZVxuICAgKi9cbiAgcmVkaXNIb3N0bmFtZTogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBBdXRoZW50aWsgc2VjcmV0IGtleVxuICAgKi9cbiAgc2VjcmV0S2V5OiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xuXG4gIC8qKlxuICAgKiBFRlMgZmlsZSBzeXN0ZW0gSURcbiAgICovXG4gIGVmc0lkOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEVGUyBtZWRpYSBhY2Nlc3MgcG9pbnQgSURcbiAgICovXG4gIGVmc01lZGlhQWNjZXNzUG9pbnRJZDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBFRlMgY3VzdG9tIHRlbXBsYXRlcyBhY2Nlc3MgcG9pbnQgSURcbiAgICovXG4gIGVmc0N1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50SWQ6IHN0cmluZztcbn1cblxuLyoqXG4gKiBDREsgY29uc3RydWN0IGZvciB0aGUgQXV0aGVudGlrIHdvcmtlciBjb250YWluZXJcbiAqL1xuZXhwb3J0IGNsYXNzIEF1dGhlbnRpa1dvcmtlciBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBUaGUgRUNTIHRhc2sgZGVmaW5pdGlvbiBmb3IgdGhlIEF1dGhlbnRpayB3b3JrZXJcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSB0YXNrRGVmaW5pdGlvbjogZWNzLlRhc2tEZWZpbml0aW9uO1xuXG4gIC8qKlxuICAgKiBUaGUgRUNTIHNlcnZpY2UgZm9yIEF1dGhlbnRpayB3b3JrZXJcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBlY3NTZXJ2aWNlOiBlY3MuRmFyZ2F0ZVNlcnZpY2U7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEF1dGhlbnRpa1dvcmtlclByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIC8vIENyZWF0ZSB0aGUgbG9nIGdyb3VwIGZvciB3b3JrZXJzXG4gICAgY29uc3QgbG9nR3JvdXAgPSBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnV29ya2VyTG9ncycsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogYCR7aWR9LXdvcmtlcmAsXG4gICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuREVTVFJPWVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHRhc2sgZXhlY3V0aW9uIHJvbGVcbiAgICBjb25zdCBleGVjdXRpb25Sb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdXb3JrZXJUYXNrRXhlY3V0aW9uUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlY3MtdGFza3MuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FtYXpvbkVDU1Rhc2tFeGVjdXRpb25Sb2xlUG9saWN5JylcbiAgICAgIF1cbiAgICB9KTtcblxuICAgIC8vIEFkZCBwZXJtaXNzaW9ucyB0byBhY2Nlc3Mgc2VjcmV0c1xuICAgIHByb3BzLmRiU2VjcmV0LmdyYW50UmVhZChleGVjdXRpb25Sb2xlKTtcbiAgICBwcm9wcy5yZWRpc0F1dGhUb2tlbi5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG4gICAgcHJvcHMuc2VjcmV0S2V5LmdyYW50UmVhZChleGVjdXRpb25Sb2xlKTtcblxuICAgIC8vIENyZWF0ZSB0YXNrIHJvbGVcbiAgICBjb25zdCB0YXNrUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnV29ya2VyVGFza1JvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnZWNzLXRhc2tzLmFtYXpvbmF3cy5jb20nKSxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IHJlYWQgYWNjZXNzIHRvIFMzIGNvbmZpZ3VyYXRpb24gYnVja2V0IGZvciBlbnZpcm9ubWVudCBmaWxlc1xuICAgIGlmIChwcm9wcy5lbnZGaWxlUzNLZXkpIHtcbiAgICAgIHByb3BzLnMzQ29uZkJ1Y2tldC5ncmFudFJlYWQodGFza1JvbGUpO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSB0YXNrIGRlZmluaXRpb25cbiAgICB0aGlzLnRhc2tEZWZpbml0aW9uID0gbmV3IGVjcy5GYXJnYXRlVGFza0RlZmluaXRpb24odGhpcywgJ1dvcmtlclRhc2tEZWYnLCB7XG4gICAgICBjcHU6IHByb3BzLmNvbmZpZy5lY3MudGFza0NwdSxcbiAgICAgIG1lbW9yeUxpbWl0TWlCOiBwcm9wcy5jb25maWcuZWNzLnRhc2tNZW1vcnksXG4gICAgICBleGVjdXRpb25Sb2xlLFxuICAgICAgdGFza1JvbGVcbiAgICB9KTtcblxuICAgIC8vIEFkZCB2b2x1bWVzIGZvciBFRlNcbiAgICB0aGlzLnRhc2tEZWZpbml0aW9uLmFkZFZvbHVtZSh7XG4gICAgICBuYW1lOiAnbWVkaWEnLFxuICAgICAgZWZzVm9sdW1lQ29uZmlndXJhdGlvbjoge1xuICAgICAgICBmaWxlU3lzdGVtSWQ6IHByb3BzLmVmc0lkLFxuICAgICAgICB0cmFuc2l0RW5jcnlwdGlvbjogJ0VOQUJMRUQnLFxuICAgICAgICBhdXRob3JpemF0aW9uQ29uZmlnOiB7XG4gICAgICAgICAgYWNjZXNzUG9pbnRJZDogcHJvcHMuZWZzTWVkaWFBY2Nlc3NQb2ludElkLFxuICAgICAgICAgIGlhbTogJ0VOQUJMRUQnXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHRoaXMudGFza0RlZmluaXRpb24uYWRkVm9sdW1lKHtcbiAgICAgIG5hbWU6ICdjdXN0b20tdGVtcGxhdGVzJyxcbiAgICAgIGVmc1ZvbHVtZUNvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgZmlsZVN5c3RlbUlkOiBwcm9wcy5lZnNJZCxcbiAgICAgICAgdHJhbnNpdEVuY3J5cHRpb246ICdFTkFCTEVEJyxcbiAgICAgICAgYXV0aG9yaXphdGlvbkNvbmZpZzoge1xuICAgICAgICAgIGFjY2Vzc1BvaW50SWQ6IHByb3BzLmVmc0N1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50SWQsXG4gICAgICAgICAgaWFtOiAnRU5BQkxFRCdcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gRGV0ZXJtaW5lIERvY2tlciBpbWFnZSAtIEFsd2F5cyB1c2UgRUNSICh3b3JrZXJzIHVzZSB0aGUgc2FtZSBpbWFnZSBhcyBzZXJ2ZXIpXG4gICAgY29uc3QgZG9ja2VySW1hZ2UgPSBwcm9wcy5lY3JSZXBvc2l0b3J5QXJuIFxuICAgICAgPyBgJHtwcm9wcy5lY3JSZXBvc2l0b3J5QXJufTphdXRoLWluZnJhLXNlcnZlci0ke3Byb3BzLmdpdFNoYX1gXG4gICAgICA6ICdwbGFjZWhvbGRlci1mb3ItbG9jYWwtZWNyJzsgLy8gRmFsbGJhY2sgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG5cbiAgICAvLyBQcmVwYXJlIGNvbnRhaW5lciBkZWZpbml0aW9uIG9wdGlvbnMgZm9yIHdvcmtlclxuICAgIGxldCBjb250YWluZXJEZWZpbml0aW9uT3B0aW9uczogZWNzLkNvbnRhaW5lckRlZmluaXRpb25PcHRpb25zID0ge1xuICAgICAgaW1hZ2U6IGVjcy5Db250YWluZXJJbWFnZS5mcm9tUmVnaXN0cnkoZG9ja2VySW1hZ2UpLFxuICAgICAgbG9nZ2luZzogZWNzLkxvZ0RyaXZlcnMuYXdzTG9ncyh7XG4gICAgICAgIHN0cmVhbVByZWZpeDogJ2F1dGhlbnRpay13b3JrZXInLFxuICAgICAgICBsb2dHcm91cFxuICAgICAgfSksXG4gICAgICBjb21tYW5kOiBbJ2FrJywgJ3dvcmtlciddLCAvLyBXb3JrZXIgY29tbWFuZFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgQVVUSEVOVElLX1JFRElTX19IT1NUOiBwcm9wcy5yZWRpc0hvc3RuYW1lLFxuICAgICAgICBBVVRIRU5USUtfUE9TVEdSRVNRTF9fSE9TVDogcHJvcHMuZGJIb3N0bmFtZSxcbiAgICAgICAgQVVUSEVOVElLX1BPU1RHUkVTUUxfX05BTUU6ICdhdXRoZW50aWsnLFxuICAgICAgICBBVVRIRU5USUtfUE9TVEdSRVNRTF9fVVNFUjogJ2F1dGhlbnRpaycsXG4gICAgICB9LFxuICAgICAgc2VjcmV0czoge1xuICAgICAgICBBVVRIRU5USUtfUE9TVEdSRVNRTF9fUEFTU1dPUkQ6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHByb3BzLmRiU2VjcmV0LCAncGFzc3dvcmQnKSxcbiAgICAgICAgQVVUSEVOVElLX1JFRElTX19QQVNTV09SRDogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIocHJvcHMucmVkaXNBdXRoVG9rZW4pLFxuICAgICAgICBBVVRIRU5USUtfU0VDUkVUX0tFWTogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIocHJvcHMuc2VjcmV0S2V5KSxcbiAgICAgIH0sXG4gICAgICBlc3NlbnRpYWw6IHRydWVcbiAgICB9O1xuXG4gICAgLy8gQWRkIGVudmlyb25tZW50IGZpbGVzIGlmIFMzIGtleSBpcyBwcm92aWRlZCBhbmQgdXNlQXV0aGVudGlrQ29uZmlnRmlsZSBpcyBlbmFibGVkXG4gICAgaWYgKHByb3BzLmVudkZpbGVTM0tleSAmJiBwcm9wcy51c2VBdXRoZW50aWtDb25maWdGaWxlKSB7XG4gICAgICBjb250YWluZXJEZWZpbml0aW9uT3B0aW9ucyA9IHtcbiAgICAgICAgLi4uY29udGFpbmVyRGVmaW5pdGlvbk9wdGlvbnMsXG4gICAgICAgIGVudmlyb25tZW50RmlsZXM6IFtcbiAgICAgICAgICBlY3MuRW52aXJvbm1lbnRGaWxlLmZyb21CdWNrZXQocHJvcHMuczNDb25mQnVja2V0LCBwcm9wcy5lbnZGaWxlUzNLZXkpXG4gICAgICAgIF1cbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgY29udGFpbmVyID0gdGhpcy50YXNrRGVmaW5pdGlvbi5hZGRDb250YWluZXIoJ0F1dGhlbnRpa1dvcmtlcicsIGNvbnRhaW5lckRlZmluaXRpb25PcHRpb25zKTtcblxuICAgIC8vIEFkZCBtb3VudCBwb2ludHMgZm9yIEVGUyB2b2x1bWVzXG4gICAgY29udGFpbmVyLmFkZE1vdW50UG9pbnRzKHtcbiAgICAgIGNvbnRhaW5lclBhdGg6ICcvbWVkaWEnLFxuICAgICAgc291cmNlVm9sdW1lOiAnbWVkaWEnLFxuICAgICAgcmVhZE9ubHk6IGZhbHNlXG4gICAgfSk7XG5cbiAgICBjb250YWluZXIuYWRkTW91bnRQb2ludHMoe1xuICAgICAgY29udGFpbmVyUGF0aDogJy90ZW1wbGF0ZXMnLFxuICAgICAgc291cmNlVm9sdW1lOiAnY3VzdG9tLXRlbXBsYXRlcycsXG4gICAgICByZWFkT25seTogZmFsc2VcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBFQ1Mgc2VydmljZSBmb3Igd29ya2VyXG4gICAgdGhpcy5lY3NTZXJ2aWNlID0gbmV3IGVjcy5GYXJnYXRlU2VydmljZSh0aGlzLCAnV29ya2VyU2VydmljZScsIHtcbiAgICAgIGNsdXN0ZXI6IHByb3BzLmVjc0NsdXN0ZXIsXG4gICAgICB0YXNrRGVmaW5pdGlvbjogdGhpcy50YXNrRGVmaW5pdGlvbixcbiAgICAgIGRlc2lyZWRDb3VudDogcHJvcHMuY29uZmlnLmVjcy53b3JrZXJEZXNpcmVkQ291bnQgfHwgMSwgLy8gRGVmYXVsdCB0byAxIHdvcmtlclxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtwcm9wcy5lY3NTZWN1cml0eUdyb3VwXSxcbiAgICAgIGVuYWJsZUV4ZWN1dGVDb21tYW5kOiBwcm9wcy5lbmFibGVFeGVjdXRlLFxuICAgICAgYXNzaWduUHVibGljSXA6IGZhbHNlLFxuICAgICAgY2lyY3VpdEJyZWFrZXI6IHsgcm9sbGJhY2s6IHRydWUgfVxuICAgIH0pO1xuXG4gICAgLy8gQWRkIGF1dG8gc2NhbGluZyBmb3Igd29ya2Vyc1xuICAgIGNvbnN0IHNjYWxpbmcgPSB0aGlzLmVjc1NlcnZpY2UuYXV0b1NjYWxlVGFza0NvdW50KHtcbiAgICAgIG1pbkNhcGFjaXR5OiBwcm9wcy5jb25maWcuZWNzLndvcmtlck1pbkNhcGFjaXR5IHx8IDEsXG4gICAgICBtYXhDYXBhY2l0eTogcHJvcHMuY29uZmlnLmVjcy53b3JrZXJNYXhDYXBhY2l0eSB8fCAzXG4gICAgfSk7XG5cbiAgICAvLyBTY2FsZSBiYXNlZCBvbiBDUFUgdXRpbGl6YXRpb24gKHdvcmtlcnMgbWF5IGhhdmUgZGlmZmVyZW50IHNjYWxpbmcgcGF0dGVybnMpXG4gICAgc2NhbGluZy5zY2FsZU9uQ3B1VXRpbGl6YXRpb24oJ1dvcmtlckNwdVNjYWxpbmcnLCB7XG4gICAgICB0YXJnZXRVdGlsaXphdGlvblBlcmNlbnQ6IDgwLCAvLyBIaWdoZXIgdGhyZXNob2xkIGZvciB3b3JrZXJzXG4gICAgICBzY2FsZUluQ29vbGRvd246IER1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICBzY2FsZU91dENvb2xkb3duOiBEdXJhdGlvbi5taW51dGVzKDIpXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==