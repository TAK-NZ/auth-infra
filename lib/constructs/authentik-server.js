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
        if (props.useConfigFile) {
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
        // Create task role
        const taskRole = new aws_cdk_lib_1.aws_iam.Role(this, 'TaskRole', {
            assumedBy: new aws_cdk_lib_1.aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        });
        // Add task permissions
        if (props.useConfigFile && configBucket) {
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
        // Determine Docker image - Always use ECR
        const dockerImage = props.ecrRepositoryArn
            ? `${props.ecrRepositoryArn}:auth-infra-server-${props.gitSha}`
            : 'placeholder-for-local-ecr'; // Fallback for backwards compatibility
        // Prepare container definition options
        let containerDefinitionOptions = {
            image: aws_cdk_lib_1.aws_ecs.ContainerImage.fromRegistry(dockerImage),
            logging: aws_cdk_lib_1.aws_ecs.LogDrivers.awsLogs({
                streamPrefix: 'authentik-server',
                logGroup
            }),
            environment: {
                AUTHENTIK_REDIS__HOST: props.redisHostname,
                AUTHENTIK_POSTGRESQL__HOST: props.dbHostname,
                AUTHENTIK_POSTGRESQL__NAME: 'authentik',
                AUTHENTIK_POSTGRESQL__USER: 'authentik',
                AUTHENTIK_BOOTSTRAP_EMAIL: props.adminUserEmail,
                AUTHENTIK_BOOTSTRAP_FLOW_AUTHENTICATION: 'default-authentication-flow',
                AUTHENTIK_BOOTSTRAP_FLOW_AUTHORIZATION: 'default-provider-authorization-explicit-consent',
                AUTHENTIK_BOOTSTRAP_FLOW_ENROLLMENT: 'default-enrollment-flow',
                AUTHENTIK_BOOTSTRAP_FLOW_INVALIDATION: 'default-invalidation-flow',
                AUTHENTIK_BOOTSTRAP_FLOW_RECOVERY: 'default-recovery-flow',
                AUTHENTIK_BOOTSTRAP_FLOW_UNENROLLMENT: 'default-unenrollment-flow',
                AUTHENTIK_BOOTSTRAP_TOKEN: props.adminUserToken.secretValueFromJson('SecretString').toString(),
                AUTHENTIK_LDAP__BIND_DN_TEMPLATE: props.ldapBaseDn
            },
            secrets: {
                AUTHENTIK_POSTGRESQL__PASSWORD: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.dbSecret, 'password'),
                AUTHENTIK_REDIS__PASSWORD: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.redisAuthToken),
                AUTHENTIK_SECRET_KEY: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.secretKey),
                AUTHENTIK_BOOTSTRAP_PASSWORD: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.adminUserPassword, 'password')
            },
            healthCheck: {
                command: ['CMD-SHELL', 'curl -f http://localhost:9000/healthz/ || exit 1'],
                interval: aws_cdk_lib_1.Duration.seconds(30),
                timeout: aws_cdk_lib_1.Duration.seconds(5),
                retries: 3,
                startPeriod: aws_cdk_lib_1.Duration.seconds(60)
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
            desiredCount: props.config.ecs.desiredCount,
            securityGroups: [props.ecsSecurityGroup],
            enableExecuteCommand: props.enableExecute,
            assignPublicIp: false,
            circuitBreaker: { rollback: true }
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
                path: '/healthz/',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aGVudGlrLXNlcnZlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGhlbnRpay1zZXJ2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUE7O0dBRUc7QUFDSCwyQ0FBdUM7QUFDdkMsNkNBVXFCO0FBcUlyQjs7R0FFRztBQUNILE1BQWEsZUFBZ0IsU0FBUSxzQkFBUztJQVc1QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTJCO1FBQ25FLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsdUJBQXVCO1FBQ3ZCLE1BQU0sUUFBUSxHQUFHLElBQUksc0JBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNyRCxZQUFZLEVBQUUsR0FBRyxFQUFFLFNBQVM7WUFDNUIsU0FBUyxFQUFFLHNCQUFJLENBQUMsYUFBYSxDQUFDLFFBQVE7WUFDdEMsYUFBYSxFQUFFLDJCQUFhLENBQUMsT0FBTztTQUNyQyxDQUFDLENBQUM7UUFFSCw0Q0FBNEM7UUFDNUMsSUFBSSxZQUFZLENBQUM7UUFDakIsSUFBSSxLQUFLLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDeEIsWUFBWSxHQUFHLElBQUksb0JBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtnQkFDakQsVUFBVSxFQUFFLEdBQUcsRUFBRSxTQUFTLENBQUMsV0FBVyxFQUFFO2dCQUN4QyxhQUFhLEVBQUUsMkJBQWEsQ0FBQyxNQUFNO2dCQUNuQyxVQUFVLEVBQUUsb0JBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVO2dCQUMxQyxpQkFBaUIsRUFBRSxvQkFBRSxDQUFDLGlCQUFpQixDQUFDLFNBQVM7YUFDbEQsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUVELDZCQUE2QjtRQUM3QixNQUFNLGFBQWEsR0FBRyxJQUFJLHFCQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUM1RCxTQUFTLEVBQUUsSUFBSSxxQkFBRyxDQUFDLGdCQUFnQixDQUFDLHlCQUF5QixDQUFDO1lBQzlELGVBQWUsRUFBRTtnQkFDZixxQkFBRyxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQywrQ0FBK0MsQ0FBQzthQUM1RjtTQUNGLENBQUMsQ0FBQztRQUVILG9DQUFvQztRQUNwQyxLQUFLLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUN4QyxLQUFLLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUM5QyxLQUFLLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUN6QyxLQUFLLENBQUMsaUJBQWlCLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ2pELEtBQUssQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBRTlDLG1CQUFtQjtRQUNuQixNQUFNLFFBQVEsR0FBRyxJQUFJLHFCQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUU7WUFDOUMsU0FBUyxFQUFFLElBQUkscUJBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyx5QkFBeUIsQ0FBQztTQUMvRCxDQUFDLENBQUM7UUFFSCx1QkFBdUI7UUFDdkIsSUFBSSxLQUFLLENBQUMsYUFBYSxJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ3hDLFlBQVksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDbkMsQ0FBQztRQUVELHFFQUFxRTtRQUNyRSxJQUFJLEtBQUssQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUN2QixLQUFLLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN6QyxDQUFDO1FBRUQseUJBQXlCO1FBQ3pCLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxxQkFBRyxDQUFDLHFCQUFxQixDQUFDLElBQUksRUFBRSxTQUFTLEVBQUU7WUFDbkUsR0FBRyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLE9BQU87WUFDN0IsY0FBYyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFVBQVU7WUFDM0MsYUFBYTtZQUNiLFFBQVE7U0FDVCxDQUFDLENBQUM7UUFFSCxzQkFBc0I7UUFDdEIsSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUM7WUFDNUIsSUFBSSxFQUFFLE9BQU87WUFDYixzQkFBc0IsRUFBRTtnQkFDdEIsWUFBWSxFQUFFLEtBQUssQ0FBQyxLQUFLO2dCQUN6QixpQkFBaUIsRUFBRSxTQUFTO2dCQUM1QixtQkFBbUIsRUFBRTtvQkFDbkIsYUFBYSxFQUFFLEtBQUssQ0FBQyxxQkFBcUI7b0JBQzFDLEdBQUcsRUFBRSxTQUFTO2lCQUNmO2FBQ0Y7U0FDRixDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQztZQUM1QixJQUFJLEVBQUUsa0JBQWtCO1lBQ3hCLHNCQUFzQixFQUFFO2dCQUN0QixZQUFZLEVBQUUsS0FBSyxDQUFDLEtBQUs7Z0JBQ3pCLGlCQUFpQixFQUFFLFNBQVM7Z0JBQzVCLG1CQUFtQixFQUFFO29CQUNuQixhQUFhLEVBQUUsS0FBSyxDQUFDLCtCQUErQjtvQkFDcEQsR0FBRyxFQUFFLFNBQVM7aUJBQ2Y7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUVILDBDQUEwQztRQUMxQyxNQUFNLFdBQVcsR0FBRyxLQUFLLENBQUMsZ0JBQWdCO1lBQ3hDLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQyxnQkFBZ0Isc0JBQXNCLEtBQUssQ0FBQyxNQUFNLEVBQUU7WUFDL0QsQ0FBQyxDQUFDLDJCQUEyQixDQUFDLENBQUMsdUNBQXVDO1FBRXhFLHVDQUF1QztRQUN2QyxJQUFJLDBCQUEwQixHQUFtQztZQUMvRCxLQUFLLEVBQUUscUJBQUcsQ0FBQyxjQUFjLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQztZQUNuRCxPQUFPLEVBQUUscUJBQUcsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDO2dCQUM5QixZQUFZLEVBQUUsa0JBQWtCO2dCQUNoQyxRQUFRO2FBQ1QsQ0FBQztZQUNGLFdBQVcsRUFBRTtnQkFDWCxxQkFBcUIsRUFBRSxLQUFLLENBQUMsYUFBYTtnQkFDMUMsMEJBQTBCLEVBQUUsS0FBSyxDQUFDLFVBQVU7Z0JBQzVDLDBCQUEwQixFQUFFLFdBQVc7Z0JBQ3ZDLDBCQUEwQixFQUFFLFdBQVc7Z0JBQ3ZDLHlCQUF5QixFQUFFLEtBQUssQ0FBQyxjQUFjO2dCQUMvQyx1Q0FBdUMsRUFBRSw2QkFBNkI7Z0JBQ3RFLHNDQUFzQyxFQUFFLGlEQUFpRDtnQkFDekYsbUNBQW1DLEVBQUUseUJBQXlCO2dCQUM5RCxxQ0FBcUMsRUFBRSwyQkFBMkI7Z0JBQ2xFLGlDQUFpQyxFQUFFLHVCQUF1QjtnQkFDMUQscUNBQXFDLEVBQUUsMkJBQTJCO2dCQUNsRSx5QkFBeUIsRUFBRSxLQUFLLENBQUMsY0FBYyxDQUFDLG1CQUFtQixDQUFDLGNBQWMsQ0FBQyxDQUFDLFFBQVEsRUFBRTtnQkFDOUYsZ0NBQWdDLEVBQUUsS0FBSyxDQUFDLFVBQVU7YUFDbkQ7WUFDRCxPQUFPLEVBQUU7Z0JBQ1AsOEJBQThCLEVBQUUscUJBQUcsQ0FBQyxNQUFNLENBQUMsa0JBQWtCLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxVQUFVLENBQUM7Z0JBQ3pGLHlCQUF5QixFQUFFLHFCQUFHLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUM7Z0JBQzlFLG9CQUFvQixFQUFFLHFCQUFHLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUM7Z0JBQ3BFLDRCQUE0QixFQUFFLHFCQUFHLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxpQkFBaUIsRUFBRSxVQUFVLENBQUM7YUFDakc7WUFDRCxXQUFXLEVBQUU7Z0JBQ1gsT0FBTyxFQUFFLENBQUMsV0FBVyxFQUFFLGtEQUFrRCxDQUFDO2dCQUMxRSxRQUFRLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUM5QixPQUFPLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO2dCQUM1QixPQUFPLEVBQUUsQ0FBQztnQkFDVixXQUFXLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2FBQ2xDO1lBQ0QsU0FBUyxFQUFFLElBQUk7U0FDaEIsQ0FBQztRQUVGLDhDQUE4QztRQUM5QyxJQUFJLEtBQUssQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUN2QiwwQkFBMEIsR0FBRztnQkFDM0IsR0FBRywwQkFBMEI7Z0JBQzdCLGdCQUFnQixFQUFFO29CQUNoQixxQkFBRyxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFlBQVksRUFBRSxLQUFLLENBQUMsWUFBWSxDQUFDO2lCQUN2RTthQUNGLENBQUM7UUFDSixDQUFDO1FBRUQsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxZQUFZLENBQUMsaUJBQWlCLEVBQUUsMEJBQTBCLENBQUMsQ0FBQztRQUVsRyxvQkFBb0I7UUFDcEIsU0FBUyxDQUFDLGVBQWUsQ0FBQztZQUN4QixhQUFhLEVBQUUsSUFBSTtZQUNuQixRQUFRLEVBQUUsSUFBSTtZQUNkLFFBQVEsRUFBRSxxQkFBRyxDQUFDLFFBQVEsQ0FBQyxHQUFHO1NBQzNCLENBQUMsQ0FBQztRQUVILG1DQUFtQztRQUNuQyxTQUFTLENBQUMsY0FBYyxDQUFDO1lBQ3ZCLGFBQWEsRUFBRSxRQUFRO1lBQ3ZCLFlBQVksRUFBRSxPQUFPO1lBQ3JCLFFBQVEsRUFBRSxLQUFLO1NBQ2hCLENBQUMsQ0FBQztRQUVILFNBQVMsQ0FBQyxjQUFjLENBQUM7WUFDdkIsYUFBYSxFQUFFLFlBQVk7WUFDM0IsWUFBWSxFQUFFLGtCQUFrQjtZQUNoQyxRQUFRLEVBQUUsS0FBSztTQUNoQixDQUFDLENBQUM7UUFFSCxxQkFBcUI7UUFDckIsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLHFCQUFHLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUU7WUFDeEQsT0FBTyxFQUFFLEtBQUssQ0FBQyxVQUFVO1lBQ3pCLGNBQWMsRUFBRSxJQUFJLENBQUMsY0FBYztZQUNuQyxZQUFZLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsWUFBWTtZQUMzQyxjQUFjLEVBQUUsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUM7WUFDeEMsb0JBQW9CLEVBQUUsS0FBSyxDQUFDLGFBQWE7WUFDekMsY0FBYyxFQUFFLEtBQUs7WUFDckIsY0FBYyxFQUFFLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRTtTQUNuQyxDQUFDLENBQUM7UUFFSCxtQkFBbUI7UUFDbkIsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQztZQUNqRCxXQUFXLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsV0FBVztZQUN6QyxXQUFXLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsV0FBVztTQUMxQyxDQUFDLENBQUM7UUFFSCxpQ0FBaUM7UUFDakMsT0FBTyxDQUFDLHFCQUFxQixDQUFDLFlBQVksRUFBRTtZQUMxQyx3QkFBd0IsRUFBRSxFQUFFO1lBQzVCLGVBQWUsRUFBRSxzQkFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDcEMsZ0JBQWdCLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1NBQ3RDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRDs7T0FFRztJQUNJLGlCQUFpQixDQUFDLEdBQWEsRUFBRSxRQUFtQztRQUN6RSxnREFBZ0Q7UUFDaEQsTUFBTSxXQUFXLEdBQUcsSUFBSSx3Q0FBSyxDQUFDLHNCQUFzQixDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDeEUsR0FBRyxFQUFFLEdBQUc7WUFDUixVQUFVLEVBQUUsd0NBQUssQ0FBQyxVQUFVLENBQUMsRUFBRTtZQUMvQixJQUFJLEVBQUUsSUFBSTtZQUNWLFFBQVEsRUFBRSx3Q0FBSyxDQUFDLG1CQUFtQixDQUFDLElBQUk7WUFDeEMsV0FBVyxFQUFFO2dCQUNYLElBQUksRUFBRSxXQUFXO2dCQUNqQixRQUFRLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUM5QixnQkFBZ0IsRUFBRSxTQUFTO2FBQzVCO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsbUJBQW1CO1FBQ25CLFdBQVcsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRXZDLDJDQUEyQztRQUMzQyxRQUFRLENBQUMsU0FBUyxDQUFDLGVBQWUsRUFBRTtZQUNsQyxNQUFNLEVBQUUsd0NBQUssQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUM7U0FDcEQsQ0FBQyxDQUFDO1FBRUgsT0FBTyxXQUFXLENBQUM7SUFDckIsQ0FBQztDQUNGO0FBOU5ELDBDQThOQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQXV0aGVudGlrIFNlcnZlciBDb25zdHJ1Y3QgLSBTZXJ2ZXIgY29udGFpbmVyIGFuZCBFQ1Mgc2VydmljZSBjb25maWd1cmF0aW9uXG4gKi9cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHtcbiAgYXdzX2VjMiBhcyBlYzIsXG4gIGF3c19lY3MgYXMgZWNzLFxuICBhd3NfZWxhc3RpY2xvYWRiYWxhbmNpbmd2MiBhcyBlbGJ2MixcbiAgYXdzX2xvZ3MgYXMgbG9ncyxcbiAgYXdzX3NlY3JldHNtYW5hZ2VyIGFzIHNlY3JldHNtYW5hZ2VyLFxuICBhd3NfczMgYXMgczMsXG4gIGF3c19pYW0gYXMgaWFtLFxuICBEdXJhdGlvbixcbiAgUmVtb3ZhbFBvbGljeVxufSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgdHlwZSB7IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi4vZW52aXJvbm1lbnQtY29uZmlnJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciB0aGUgQXV0aGVudGlrIFNlcnZlciBjb25zdHJ1Y3RcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBBdXRoZW50aWtTZXJ2ZXJQcm9wcyB7XG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBuYW1lIChlLmcuICdwcm9kJywgJ2RldicsIGV0Yy4pXG4gICAqL1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBjb25maWd1cmF0aW9uXG4gICAqL1xuICBjb25maWc6IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnO1xuXG4gIC8qKlxuICAgKiBWUEMgZm9yIGRlcGxveW1lbnRcbiAgICovXG4gIHZwYzogZWMyLklWcGM7XG5cbiAgLyoqXG4gICAqIFNlY3VyaXR5IGdyb3VwIGZvciBFQ1MgdGFza3NcbiAgICovXG4gIGVjc1NlY3VyaXR5R3JvdXA6IGVjMi5TZWN1cml0eUdyb3VwO1xuXG4gIC8qKlxuICAgKiBFQ1MgY2x1c3RlclxuICAgKi9cbiAgZWNzQ2x1c3RlcjogZWNzLklDbHVzdGVyO1xuXG4gIC8qKlxuICAgKiBTMyBjb25maWd1cmF0aW9uIGJ1Y2tldCBmb3IgZW52aXJvbm1lbnQgZmlsZXNcbiAgICovXG4gIHMzQ29uZkJ1Y2tldDogczMuSUJ1Y2tldDtcblxuICAvKipcbiAgICogUzMgVVJJIGZvciB0aGUgZW52aXJvbm1lbnQgZmlsZSAob3B0aW9uYWwpXG4gICAqL1xuICBlbnZGaWxlUzNVcmk/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFMzIGtleSBmb3IgdGhlIGVudmlyb25tZW50IGZpbGUgKG9wdGlvbmFsKVxuICAgKi9cbiAgZW52RmlsZVMzS2V5Pzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBBdXRoZW50aWsgYWRtaW4gdXNlciBlbWFpbFxuICAgKi9cbiAgYWRtaW5Vc2VyRW1haWw6IHN0cmluZztcblxuICAvKipcbiAgICogTERBUCBiYXNlIEROXG4gICAqL1xuICBsZGFwQmFzZURuOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFVzZSBjb25maWcgZmlsZSBmbGFnXG4gICAqL1xuICB1c2VDb25maWdGaWxlOiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBFQ1IgcmVwb3NpdG9yeSBBUk4gZm9yIEVDUiBpbWFnZXNcbiAgICovXG4gIGVjclJlcG9zaXRvcnlBcm4/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEdpdCBTSEEgZm9yIERvY2tlciBpbWFnZSB0YWdnaW5nXG4gICAqL1xuICBnaXRTaGE6IHN0cmluZztcblxuICAvKipcbiAgICogQWxsb3cgU1NIIGV4ZWMgaW50byBjb250YWluZXJcbiAgICovXG4gIGVuYWJsZUV4ZWN1dGU6IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIERhdGFiYXNlIHNlY3JldFxuICAgKi9cbiAgZGJTZWNyZXQ6IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG5cbiAgLyoqXG4gICAqIERhdGFiYXNlIGhvc3RuYW1lXG4gICAqL1xuICBkYkhvc3RuYW1lOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFJlZGlzIGF1dGggdG9rZW5cbiAgICovXG4gIHJlZGlzQXV0aFRva2VuOiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xuXG4gIC8qKlxuICAgKiBSZWRpcyBob3N0bmFtZVxuICAgKi9cbiAgcmVkaXNIb3N0bmFtZTogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBBdXRoZW50aWsgc2VjcmV0IGtleVxuICAgKi9cbiAgc2VjcmV0S2V5OiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xuXG4gIC8qKlxuICAgKiBBZG1pbiB1c2VyIHBhc3N3b3JkXG4gICAqL1xuICBhZG1pblVzZXJQYXNzd29yZDogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcblxuICAvKipcbiAgICogQWRtaW4gdXNlciB0b2tlblxuICAgKi9cbiAgYWRtaW5Vc2VyVG9rZW46IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG5cbiAgLyoqXG4gICAqIExEQVAgdG9rZW5cbiAgICovXG4gIGxkYXBUb2tlbjogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcblxuICAvKipcbiAgICogRUZTIGZpbGUgc3lzdGVtIElEXG4gICAqL1xuICBlZnNJZDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBFRlMgbWVkaWEgYWNjZXNzIHBvaW50IElEXG4gICAqL1xuICBlZnNNZWRpYUFjY2Vzc1BvaW50SWQ6IHN0cmluZztcblxuICAvKipcbiAgICogRUZTIGN1c3RvbSB0ZW1wbGF0ZXMgYWNjZXNzIHBvaW50IElEXG4gICAqL1xuICBlZnNDdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludElkOiBzdHJpbmc7XG59XG5cbi8qKlxuICogQ0RLIGNvbnN0cnVjdCBmb3IgdGhlIEF1dGhlbnRpayBzZXJ2ZXIgY29udGFpbmVyIGFuZCBFQ1Mgc2VydmljZVxuICovXG5leHBvcnQgY2xhc3MgQXV0aGVudGlrU2VydmVyIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgLyoqXG4gICAqIFRoZSBFQ1MgdGFzayBkZWZpbml0aW9uIGZvciB0aGUgQXV0aGVudGlrIHNlcnZlclxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IHRhc2tEZWZpbml0aW9uOiBlY3MuVGFza0RlZmluaXRpb247XG5cbiAgLyoqXG4gICAqIFRoZSBFQ1Mgc2VydmljZSBmb3IgQXV0aGVudGlrIHNlcnZlclxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGVjc1NlcnZpY2U6IGVjcy5GYXJnYXRlU2VydmljZTtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQXV0aGVudGlrU2VydmVyUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBsb2cgZ3JvdXBcbiAgICBjb25zdCBsb2dHcm91cCA9IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdTZXJ2ZXJMb2dzJywge1xuICAgICAgbG9nR3JvdXBOYW1lOiBgJHtpZH0tc2VydmVyYCxcbiAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgcmVtb3ZhbFBvbGljeTogUmVtb3ZhbFBvbGljeS5ERVNUUk9ZXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgY29uZmlnIGJ1Y2tldCBpZiB1c2luZyBjb25maWcgZmlsZVxuICAgIGxldCBjb25maWdCdWNrZXQ7XG4gICAgaWYgKHByb3BzLnVzZUNvbmZpZ0ZpbGUpIHtcbiAgICAgIGNvbmZpZ0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0NvbmZpZ0J1Y2tldCcsIHtcbiAgICAgICAgYnVja2V0TmFtZTogYCR7aWR9LWNvbmZpZ2AudG9Mb3dlckNhc2UoKSxcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIHRhc2sgZXhlY3V0aW9uIHJvbGVcbiAgICBjb25zdCBleGVjdXRpb25Sb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdUYXNrRXhlY3V0aW9uUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlY3MtdGFza3MuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FtYXpvbkVDU1Rhc2tFeGVjdXRpb25Sb2xlUG9saWN5JylcbiAgICAgIF1cbiAgICB9KTtcblxuICAgIC8vIEFkZCBwZXJtaXNzaW9ucyB0byBhY2Nlc3Mgc2VjcmV0c1xuICAgIHByb3BzLmRiU2VjcmV0LmdyYW50UmVhZChleGVjdXRpb25Sb2xlKTtcbiAgICBwcm9wcy5yZWRpc0F1dGhUb2tlbi5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG4gICAgcHJvcHMuc2VjcmV0S2V5LmdyYW50UmVhZChleGVjdXRpb25Sb2xlKTtcbiAgICBwcm9wcy5hZG1pblVzZXJQYXNzd29yZC5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG4gICAgcHJvcHMuYWRtaW5Vc2VyVG9rZW4uZ3JhbnRSZWFkKGV4ZWN1dGlvblJvbGUpO1xuXG4gICAgLy8gQ3JlYXRlIHRhc2sgcm9sZVxuICAgIGNvbnN0IHRhc2tSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdUYXNrUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlY3MtdGFza3MuYW1hem9uYXdzLmNvbScpLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIHRhc2sgcGVybWlzc2lvbnNcbiAgICBpZiAocHJvcHMudXNlQ29uZmlnRmlsZSAmJiBjb25maWdCdWNrZXQpIHtcbiAgICAgIGNvbmZpZ0J1Y2tldC5ncmFudFJlYWQodGFza1JvbGUpO1xuICAgIH1cblxuICAgIC8vIEdyYW50IHJlYWQgYWNjZXNzIHRvIFMzIGNvbmZpZ3VyYXRpb24gYnVja2V0IGZvciBlbnZpcm9ubWVudCBmaWxlc1xuICAgIGlmIChwcm9wcy5lbnZGaWxlUzNLZXkpIHtcbiAgICAgIHByb3BzLnMzQ29uZkJ1Y2tldC5ncmFudFJlYWQodGFza1JvbGUpO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSB0YXNrIGRlZmluaXRpb25cbiAgICB0aGlzLnRhc2tEZWZpbml0aW9uID0gbmV3IGVjcy5GYXJnYXRlVGFza0RlZmluaXRpb24odGhpcywgJ1Rhc2tEZWYnLCB7XG4gICAgICBjcHU6IHByb3BzLmNvbmZpZy5lY3MudGFza0NwdSxcbiAgICAgIG1lbW9yeUxpbWl0TWlCOiBwcm9wcy5jb25maWcuZWNzLnRhc2tNZW1vcnksXG4gICAgICBleGVjdXRpb25Sb2xlLFxuICAgICAgdGFza1JvbGVcbiAgICB9KTtcblxuICAgIC8vIEFkZCB2b2x1bWVzIGZvciBFRlNcbiAgICB0aGlzLnRhc2tEZWZpbml0aW9uLmFkZFZvbHVtZSh7XG4gICAgICBuYW1lOiAnbWVkaWEnLFxuICAgICAgZWZzVm9sdW1lQ29uZmlndXJhdGlvbjoge1xuICAgICAgICBmaWxlU3lzdGVtSWQ6IHByb3BzLmVmc0lkLFxuICAgICAgICB0cmFuc2l0RW5jcnlwdGlvbjogJ0VOQUJMRUQnLFxuICAgICAgICBhdXRob3JpemF0aW9uQ29uZmlnOiB7XG4gICAgICAgICAgYWNjZXNzUG9pbnRJZDogcHJvcHMuZWZzTWVkaWFBY2Nlc3NQb2ludElkLFxuICAgICAgICAgIGlhbTogJ0VOQUJMRUQnXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHRoaXMudGFza0RlZmluaXRpb24uYWRkVm9sdW1lKHtcbiAgICAgIG5hbWU6ICdjdXN0b20tdGVtcGxhdGVzJyxcbiAgICAgIGVmc1ZvbHVtZUNvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgZmlsZVN5c3RlbUlkOiBwcm9wcy5lZnNJZCxcbiAgICAgICAgdHJhbnNpdEVuY3J5cHRpb246ICdFTkFCTEVEJyxcbiAgICAgICAgYXV0aG9yaXphdGlvbkNvbmZpZzoge1xuICAgICAgICAgIGFjY2Vzc1BvaW50SWQ6IHByb3BzLmVmc0N1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50SWQsXG4gICAgICAgICAgaWFtOiAnRU5BQkxFRCdcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gRGV0ZXJtaW5lIERvY2tlciBpbWFnZSAtIEFsd2F5cyB1c2UgRUNSXG4gICAgY29uc3QgZG9ja2VySW1hZ2UgPSBwcm9wcy5lY3JSZXBvc2l0b3J5QXJuIFxuICAgICAgPyBgJHtwcm9wcy5lY3JSZXBvc2l0b3J5QXJufTphdXRoLWluZnJhLXNlcnZlci0ke3Byb3BzLmdpdFNoYX1gXG4gICAgICA6ICdwbGFjZWhvbGRlci1mb3ItbG9jYWwtZWNyJzsgLy8gRmFsbGJhY2sgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG5cbiAgICAvLyBQcmVwYXJlIGNvbnRhaW5lciBkZWZpbml0aW9uIG9wdGlvbnNcbiAgICBsZXQgY29udGFpbmVyRGVmaW5pdGlvbk9wdGlvbnM6IGVjcy5Db250YWluZXJEZWZpbml0aW9uT3B0aW9ucyA9IHtcbiAgICAgIGltYWdlOiBlY3MuQ29udGFpbmVySW1hZ2UuZnJvbVJlZ2lzdHJ5KGRvY2tlckltYWdlKSxcbiAgICAgIGxvZ2dpbmc6IGVjcy5Mb2dEcml2ZXJzLmF3c0xvZ3Moe1xuICAgICAgICBzdHJlYW1QcmVmaXg6ICdhdXRoZW50aWstc2VydmVyJyxcbiAgICAgICAgbG9nR3JvdXBcbiAgICAgIH0pLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgQVVUSEVOVElLX1JFRElTX19IT1NUOiBwcm9wcy5yZWRpc0hvc3RuYW1lLFxuICAgICAgICBBVVRIRU5USUtfUE9TVEdSRVNRTF9fSE9TVDogcHJvcHMuZGJIb3N0bmFtZSxcbiAgICAgICAgQVVUSEVOVElLX1BPU1RHUkVTUUxfX05BTUU6ICdhdXRoZW50aWsnLFxuICAgICAgICBBVVRIRU5USUtfUE9TVEdSRVNRTF9fVVNFUjogJ2F1dGhlbnRpaycsXG4gICAgICAgIEFVVEhFTlRJS19CT09UU1RSQVBfRU1BSUw6IHByb3BzLmFkbWluVXNlckVtYWlsLFxuICAgICAgICBBVVRIRU5USUtfQk9PVFNUUkFQX0ZMT1dfQVVUSEVOVElDQVRJT046ICdkZWZhdWx0LWF1dGhlbnRpY2F0aW9uLWZsb3cnLFxuICAgICAgICBBVVRIRU5USUtfQk9PVFNUUkFQX0ZMT1dfQVVUSE9SSVpBVElPTjogJ2RlZmF1bHQtcHJvdmlkZXItYXV0aG9yaXphdGlvbi1leHBsaWNpdC1jb25zZW50JyxcbiAgICAgICAgQVVUSEVOVElLX0JPT1RTVFJBUF9GTE9XX0VOUk9MTE1FTlQ6ICdkZWZhdWx0LWVucm9sbG1lbnQtZmxvdycsXG4gICAgICAgIEFVVEhFTlRJS19CT09UU1RSQVBfRkxPV19JTlZBTElEQVRJT046ICdkZWZhdWx0LWludmFsaWRhdGlvbi1mbG93JyxcbiAgICAgICAgQVVUSEVOVElLX0JPT1RTVFJBUF9GTE9XX1JFQ09WRVJZOiAnZGVmYXVsdC1yZWNvdmVyeS1mbG93JyxcbiAgICAgICAgQVVUSEVOVElLX0JPT1RTVFJBUF9GTE9XX1VORU5ST0xMTUVOVDogJ2RlZmF1bHQtdW5lbnJvbGxtZW50LWZsb3cnLFxuICAgICAgICBBVVRIRU5USUtfQk9PVFNUUkFQX1RPS0VOOiBwcm9wcy5hZG1pblVzZXJUb2tlbi5zZWNyZXRWYWx1ZUZyb21Kc29uKCdTZWNyZXRTdHJpbmcnKS50b1N0cmluZygpLFxuICAgICAgICBBVVRIRU5USUtfTERBUF9fQklORF9ETl9URU1QTEFURTogcHJvcHMubGRhcEJhc2VEblxuICAgICAgfSxcbiAgICAgIHNlY3JldHM6IHtcbiAgICAgICAgQVVUSEVOVElLX1BPU1RHUkVTUUxfX1BBU1NXT1JEOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihwcm9wcy5kYlNlY3JldCwgJ3Bhc3N3b3JkJyksXG4gICAgICAgIEFVVEhFTlRJS19SRURJU19fUEFTU1dPUkQ6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHByb3BzLnJlZGlzQXV0aFRva2VuKSxcbiAgICAgICAgQVVUSEVOVElLX1NFQ1JFVF9LRVk6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHByb3BzLnNlY3JldEtleSksXG4gICAgICAgIEFVVEhFTlRJS19CT09UU1RSQVBfUEFTU1dPUkQ6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHByb3BzLmFkbWluVXNlclBhc3N3b3JkLCAncGFzc3dvcmQnKVxuICAgICAgfSxcbiAgICAgIGhlYWx0aENoZWNrOiB7XG4gICAgICAgIGNvbW1hbmQ6IFsnQ01ELVNIRUxMJywgJ2N1cmwgLWYgaHR0cDovL2xvY2FsaG9zdDo5MDAwL2hlYWx0aHovIHx8IGV4aXQgMSddLFxuICAgICAgICBpbnRlcnZhbDogRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoNSksXG4gICAgICAgIHJldHJpZXM6IDMsXG4gICAgICAgIHN0YXJ0UGVyaW9kOiBEdXJhdGlvbi5zZWNvbmRzKDYwKVxuICAgICAgfSxcbiAgICAgIGVzc2VudGlhbDogdHJ1ZVxuICAgIH07XG5cbiAgICAvLyBBZGQgZW52aXJvbm1lbnQgZmlsZXMgaWYgUzMga2V5IGlzIHByb3ZpZGVkXG4gICAgaWYgKHByb3BzLmVudkZpbGVTM0tleSkge1xuICAgICAgY29udGFpbmVyRGVmaW5pdGlvbk9wdGlvbnMgPSB7XG4gICAgICAgIC4uLmNvbnRhaW5lckRlZmluaXRpb25PcHRpb25zLFxuICAgICAgICBlbnZpcm9ubWVudEZpbGVzOiBbXG4gICAgICAgICAgZWNzLkVudmlyb25tZW50RmlsZS5mcm9tQnVja2V0KHByb3BzLnMzQ29uZkJ1Y2tldCwgcHJvcHMuZW52RmlsZVMzS2V5KVxuICAgICAgICBdXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IGNvbnRhaW5lciA9IHRoaXMudGFza0RlZmluaXRpb24uYWRkQ29udGFpbmVyKCdBdXRoZW50aWtTZXJ2ZXInLCBjb250YWluZXJEZWZpbml0aW9uT3B0aW9ucyk7XG5cbiAgICAvLyBBZGQgcG9ydCBtYXBwaW5nc1xuICAgIGNvbnRhaW5lci5hZGRQb3J0TWFwcGluZ3Moe1xuICAgICAgY29udGFpbmVyUG9ydDogOTAwMCxcbiAgICAgIGhvc3RQb3J0OiA5MDAwLFxuICAgICAgcHJvdG9jb2w6IGVjcy5Qcm90b2NvbC5UQ1BcbiAgICB9KTtcblxuICAgIC8vIEFkZCBtb3VudCBwb2ludHMgZm9yIEVGUyB2b2x1bWVzXG4gICAgY29udGFpbmVyLmFkZE1vdW50UG9pbnRzKHtcbiAgICAgIGNvbnRhaW5lclBhdGg6ICcvbWVkaWEnLFxuICAgICAgc291cmNlVm9sdW1lOiAnbWVkaWEnLFxuICAgICAgcmVhZE9ubHk6IGZhbHNlXG4gICAgfSk7XG5cbiAgICBjb250YWluZXIuYWRkTW91bnRQb2ludHMoe1xuICAgICAgY29udGFpbmVyUGF0aDogJy90ZW1wbGF0ZXMnLFxuICAgICAgc291cmNlVm9sdW1lOiAnY3VzdG9tLXRlbXBsYXRlcycsXG4gICAgICByZWFkT25seTogZmFsc2VcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBFQ1Mgc2VydmljZVxuICAgIHRoaXMuZWNzU2VydmljZSA9IG5ldyBlY3MuRmFyZ2F0ZVNlcnZpY2UodGhpcywgJ1NlcnZpY2UnLCB7XG4gICAgICBjbHVzdGVyOiBwcm9wcy5lY3NDbHVzdGVyLFxuICAgICAgdGFza0RlZmluaXRpb246IHRoaXMudGFza0RlZmluaXRpb24sXG4gICAgICBkZXNpcmVkQ291bnQ6IHByb3BzLmNvbmZpZy5lY3MuZGVzaXJlZENvdW50LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtwcm9wcy5lY3NTZWN1cml0eUdyb3VwXSxcbiAgICAgIGVuYWJsZUV4ZWN1dGVDb21tYW5kOiBwcm9wcy5lbmFibGVFeGVjdXRlLFxuICAgICAgYXNzaWduUHVibGljSXA6IGZhbHNlLFxuICAgICAgY2lyY3VpdEJyZWFrZXI6IHsgcm9sbGJhY2s6IHRydWUgfVxuICAgIH0pO1xuXG4gICAgLy8gQWRkIGF1dG8gc2NhbGluZ1xuICAgIGNvbnN0IHNjYWxpbmcgPSB0aGlzLmVjc1NlcnZpY2UuYXV0b1NjYWxlVGFza0NvdW50KHtcbiAgICAgIG1pbkNhcGFjaXR5OiBwcm9wcy5jb25maWcuZWNzLm1pbkNhcGFjaXR5LFxuICAgICAgbWF4Q2FwYWNpdHk6IHByb3BzLmNvbmZpZy5lY3MubWF4Q2FwYWNpdHlcbiAgICB9KTtcblxuICAgIC8vIFNjYWxlIGJhc2VkIG9uIENQVSB1dGlsaXphdGlvblxuICAgIHNjYWxpbmcuc2NhbGVPbkNwdVV0aWxpemF0aW9uKCdDcHVTY2FsaW5nJywge1xuICAgICAgdGFyZ2V0VXRpbGl6YXRpb25QZXJjZW50OiA3MCxcbiAgICAgIHNjYWxlSW5Db29sZG93bjogRHVyYXRpb24ubWludXRlcygzKSxcbiAgICAgIHNjYWxlT3V0Q29vbGRvd246IER1cmF0aW9uLm1pbnV0ZXMoMSlcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgYW5kIHJlZ2lzdGVyIGEgdGFyZ2V0IGdyb3VwIGZvciB0aGlzIHNlcnZpY2VcbiAgICovXG4gIHB1YmxpYyBjcmVhdGVUYXJnZXRHcm91cCh2cGM6IGVjMi5JVnBjLCBsaXN0ZW5lcjogZWxidjIuQXBwbGljYXRpb25MaXN0ZW5lcik6IGVsYnYyLkFwcGxpY2F0aW9uVGFyZ2V0R3JvdXAge1xuICAgIC8vIENyZWF0ZSB0YXJnZXQgZ3JvdXAgZm9yIHRoZSBBdXRoZW50aWsgc2VydmljZVxuICAgIGNvbnN0IHRhcmdldEdyb3VwID0gbmV3IGVsYnYyLkFwcGxpY2F0aW9uVGFyZ2V0R3JvdXAodGhpcywgJ1RhcmdldEdyb3VwJywge1xuICAgICAgdnBjOiB2cGMsXG4gICAgICB0YXJnZXRUeXBlOiBlbGJ2Mi5UYXJnZXRUeXBlLklQLFxuICAgICAgcG9ydDogOTAwMCxcbiAgICAgIHByb3RvY29sOiBlbGJ2Mi5BcHBsaWNhdGlvblByb3RvY29sLkhUVFAsXG4gICAgICBoZWFsdGhDaGVjazoge1xuICAgICAgICBwYXRoOiAnL2hlYWx0aHovJyxcbiAgICAgICAgaW50ZXJ2YWw6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICBoZWFsdGh5SHR0cENvZGVzOiAnMjAwLTI5OSdcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIFJlZ2lzdGVyIHRhcmdldHNcbiAgICB0YXJnZXRHcm91cC5hZGRUYXJnZXQodGhpcy5lY3NTZXJ2aWNlKTtcblxuICAgIC8vIEFkZCBkZWZhdWx0IGFjdGlvbiB0byB0aGUgSFRUUFMgbGlzdGVuZXJcbiAgICBsaXN0ZW5lci5hZGRBY3Rpb24oJ0RlZmF1bHRBY3Rpb24nLCB7XG4gICAgICBhY3Rpb246IGVsYnYyLkxpc3RlbmVyQWN0aW9uLmZvcndhcmQoW3RhcmdldEdyb3VwXSlcbiAgICB9KTtcblxuICAgIHJldHVybiB0YXJnZXRHcm91cDtcbiAgfVxufVxuIl19