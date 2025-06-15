"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Authentik = void 0;
/**
 * Authentik Construct - CDK implementation of the Authentik service
 */
const constructs_1 = require("constructs");
const aws_cdk_lib_1 = require("aws-cdk-lib");
/**
 * CDK construct for the Authentik service
 */
class Authentik extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        // Create the log group
        const logGroup = new aws_cdk_lib_1.aws_logs.LogGroup(this, 'Logs', {
            logGroupName: id,
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
        // Create load balancer
        this.loadBalancer = new aws_cdk_lib_1.aws_elasticloadbalancingv2.ApplicationLoadBalancer(this, 'ALB', {
            vpc: props.vpc,
            internetFacing: true,
            ipAddressType: props.ipAddressType === 'ipv4' ?
                aws_cdk_lib_1.aws_elasticloadbalancingv2.IpAddressType.IPV4 :
                aws_cdk_lib_1.aws_elasticloadbalancingv2.IpAddressType.DUAL_STACK
        });
        // Create HTTP listener and redirect to HTTPS
        const httpListener = this.loadBalancer.addListener('HttpListener', {
            port: 80,
            open: true
        });
        httpListener.addAction('HttpRedirect', {
            action: aws_cdk_lib_1.aws_elasticloadbalancingv2.ListenerAction.redirect({
                port: '443',
                protocol: 'HTTPS'
            })
        });
        // Create HTTPS listener
        const httpsListener = this.loadBalancer.addListener('HttpsListener', {
            port: 443,
            certificates: [{ certificateArn: props.sslCertificateArn }],
            open: true
        });
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
        // Determine Docker image
        const dockerImage = props.dockerImageLocation === 'Github'
            ? 'ghcr.io/tak-nz/authentik-server:latest'
            : props.ecrRepositoryArn
                ? `${props.ecrRepositoryArn}:latest`
                : 'placeholder-for-local-ecr'; // Fallback for backwards compatibility
        // Prepare container definition options
        let containerDefinitionOptions = {
            image: aws_cdk_lib_1.aws_ecs.ContainerImage.fromRegistry(dockerImage),
            logging: aws_cdk_lib_1.aws_ecs.LogDrivers.awsLogs({
                streamPrefix: 'authentik',
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
        // Create target group for the Authentik service
        const targetGroup = new aws_cdk_lib_1.aws_elasticloadbalancingv2.ApplicationTargetGroup(this, 'TargetGroup', {
            vpc: props.vpc,
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
        httpsListener.addAction('DefaultAction', {
            action: aws_cdk_lib_1.aws_elasticloadbalancingv2.ListenerAction.forward([targetGroup])
        });
        // Store the DNS name for output
        this.dnsName = this.loadBalancer.loadBalancerDnsName;
        // Export outputs
        new aws_cdk_lib_1.CfnOutput(this, 'LoadBalancerDnsName', {
            value: this.dnsName,
            description: 'The DNS name of the load balancer'
        });
        new aws_cdk_lib_1.CfnOutput(this, 'AuthentikURL', {
            value: `https://${this.dnsName}/`,
            description: 'The URL of the Authentik service'
        });
    }
}
exports.Authentik = Authentik;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aGVudGlrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYXV0aGVudGlrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOztHQUVHO0FBQ0gsMkNBQXVDO0FBQ3ZDLDZDQVdxQjtBQStJckI7O0dBRUc7QUFDSCxNQUFhLFNBQVUsU0FBUSxzQkFBUztJQXFCdEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFxQjtRQUM3RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLHVCQUF1QjtRQUN2QixNQUFNLFFBQVEsR0FBRyxJQUFJLHNCQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxNQUFNLEVBQUU7WUFDL0MsWUFBWSxFQUFFLEVBQUU7WUFDaEIsU0FBUyxFQUFFLHNCQUFJLENBQUMsYUFBYSxDQUFDLFFBQVE7WUFDdEMsYUFBYSxFQUFFLDJCQUFhLENBQUMsT0FBTztTQUNyQyxDQUFDLENBQUM7UUFFSCw0Q0FBNEM7UUFDNUMsSUFBSSxZQUFZLENBQUM7UUFDakIsSUFBSSxLQUFLLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDeEIsWUFBWSxHQUFHLElBQUksb0JBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtnQkFDakQsVUFBVSxFQUFFLEdBQUcsRUFBRSxTQUFTLENBQUMsV0FBVyxFQUFFO2dCQUN4QyxhQUFhLEVBQUUsMkJBQWEsQ0FBQyxNQUFNO2dCQUNuQyxVQUFVLEVBQUUsb0JBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVO2dCQUMxQyxpQkFBaUIsRUFBRSxvQkFBRSxDQUFDLGlCQUFpQixDQUFDLFNBQVM7YUFDbEQsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUVELHVCQUF1QjtRQUN2QixJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksd0NBQUssQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFO1lBQ2pFLEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRztZQUNk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UUFDM0MsYUFBYSxDQUFDLFNBQVMsQ0FBQyxlQUFlLEVBQUU7WUFDdkMsTUFBTSxFQUFFLHdDQUFLLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1NBQ3BELENBQUMsQ0FBQztRQUVILGdDQUFnQztRQUNoQyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsbUJBQW1CLENBQUM7UUFFckQsaUJBQWlCO1FBQ2pCLElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUscUJBQXFCLEVBQUU7WUFDekMsS0FBSyxFQUFFLElBQUksQ0FBQyxPQUFPO1lBQ25CLFdBQVcsRUFBRSxtQ0FBbUM7U0FDakQsQ0FBQyxDQUFDO1FBRUgsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxjQUFjLEVBQUU7WUFDbEMsS0FBSyxFQUFFLFdBQVcsSUFBSSxDQUFDLE9BQU8sR0FBRztZQUNqQyxXQUFXLEVBQUUsa0NBQWtDO1NBQ2hELENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQTdRRCw4QkE2UUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEF1dGhlbnRpayBDb25zdHJ1Y3QgLSBDREsgaW1wbGVtZW50YXRpb24gb2YgdGhlIEF1dGhlbnRpayBzZXJ2aWNlXG4gKi9cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHtcbiAgYXdzX2VjMiBhcyBlYzIsXG4gIGF3c19lY3MgYXMgZWNzLFxuICBhd3NfZWxhc3RpY2xvYWRiYWxhbmNpbmd2MiBhcyBlbGJ2MixcbiAgYXdzX2xvZ3MgYXMgbG9ncyxcbiAgYXdzX3NlY3JldHNtYW5hZ2VyIGFzIHNlY3JldHNtYW5hZ2VyLFxuICBhd3NfczMgYXMgczMsXG4gIGF3c19pYW0gYXMgaWFtLFxuICBEdXJhdGlvbixcbiAgUmVtb3ZhbFBvbGljeSxcbiAgQ2ZuT3V0cHV0XG59IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB0eXBlIHsgQXV0aEluZnJhRW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuLi9lbnZpcm9ubWVudC1jb25maWcnO1xuXG4vKipcbiAqIFByb3BlcnRpZXMgZm9yIHRoZSBBdXRoZW50aWsgY29uc3RydWN0XG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aGVudGlrUHJvcHMge1xuICAvKipcbiAgICogRW52aXJvbm1lbnQgbmFtZSAoZS5nLiAncHJvZCcsICdkZXYnLCBldGMuKVxuICAgKi9cbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcblxuICAvKipcbiAgICogRW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxuICAgKi9cbiAgY29uZmlnOiBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZztcblxuICAvKipcbiAgICogVlBDIGZvciBkZXBsb3ltZW50XG4gICAqL1xuICB2cGM6IGVjMi5JVnBjO1xuXG4gIC8qKlxuICAgKiBTZWN1cml0eSBncm91cCBmb3IgRUNTIHRhc2tzXG4gICAqL1xuICBlY3NTZWN1cml0eUdyb3VwOiBlYzIuU2VjdXJpdHlHcm91cDtcblxuICAvKipcbiAgICogRUNTIGNsdXN0ZXJcbiAgICovXG4gIGVjc0NsdXN0ZXI6IGVjcy5JQ2x1c3RlcjtcblxuICAvKipcbiAgICogUzMgY29uZmlndXJhdGlvbiBidWNrZXQgZm9yIGVudmlyb25tZW50IGZpbGVzXG4gICAqL1xuICBzM0NvbmZCdWNrZXQ6IHMzLklCdWNrZXQ7XG5cbiAgLyoqXG4gICAqIFMzIFVSSSBmb3IgdGhlIGVudmlyb25tZW50IGZpbGUgKG9wdGlvbmFsKVxuICAgKi9cbiAgZW52RmlsZVMzVXJpPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBTMyBrZXkgZm9yIHRoZSBlbnZpcm9ubWVudCBmaWxlIChvcHRpb25hbClcbiAgICovXG4gIGVudkZpbGVTM0tleT86IHN0cmluZztcblxuICAvKipcbiAgICogU1NMIGNlcnRpZmljYXRlIEFSTiBmb3IgSFRUUFNcbiAgICovXG4gIHNzbENlcnRpZmljYXRlQXJuOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEF1dGhlbnRpayBhZG1pbiB1c2VyIGVtYWlsXG4gICAqL1xuICBhZG1pblVzZXJFbWFpbDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBMREFQIGJhc2UgRE5cbiAgICovXG4gIGxkYXBCYXNlRG46IHN0cmluZztcblxuICAvKipcbiAgICogV2hldGhlciB0byB1c2UgYXV0aGVudGlrLWNvbmZpZy5lbnYgZmlsZVxuICAgKi9cbiAgdXNlQ29uZmlnRmlsZTogYm9vbGVhbjtcblxuICAvKipcbiAgICogSVAgYWRkcmVzcyB0eXBlIGZvciBsb2FkIGJhbGFuY2Vyc1xuICAgKi9cbiAgaXBBZGRyZXNzVHlwZTogJ2lwdjQnIHwgJ2R1YWxzdGFjayc7XG5cbiAgLyoqXG4gICAqIERvY2tlciBpbWFnZSBsb2NhdGlvbiAoR2l0aHViIG9yIExvY2FsIEVDUilcbiAgICovXG4gIGRvY2tlckltYWdlTG9jYXRpb246ICdHaXRodWInIHwgJ0xvY2FsIEVDUic7XG5cbiAgLyoqXG4gICAqIEVDUiByZXBvc2l0b3J5IEFSTiBmb3IgbG9jYWwgRUNSIGltYWdlc1xuICAgKi9cbiAgZWNyUmVwb3NpdG9yeUFybj86IHN0cmluZztcblxuICAvKipcbiAgICogQWxsb3cgU1NIIGV4ZWMgaW50byBjb250YWluZXJcbiAgICovXG4gIGVuYWJsZUV4ZWN1dGU6IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIERhdGFiYXNlIGNyZWRlbnRpYWxzIHNlY3JldFxuICAgKi9cbiAgZGJTZWNyZXQ6IHNlY3JldHNtYW5hZ2VyLlNlY3JldDtcblxuICAvKipcbiAgICogRGF0YWJhc2UgaG9zdG5hbWVcbiAgICovXG4gIGRiSG9zdG5hbWU6IHN0cmluZztcblxuICAvKipcbiAgICogUmVkaXMgYXV0aCB0b2tlbiBzZWNyZXRcbiAgICovXG4gIHJlZGlzQXV0aFRva2VuOiBzZWNyZXRzbWFuYWdlci5TZWNyZXQ7XG5cbiAgLyoqXG4gICAqIFJlZGlzIGhvc3RuYW1lXG4gICAqL1xuICByZWRpc0hvc3RuYW1lOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEF1dGhlbnRpayBzZWNyZXQga2V5XG4gICAqL1xuICBzZWNyZXRLZXk6IHNlY3JldHNtYW5hZ2VyLlNlY3JldDtcblxuICAvKipcbiAgICogQWRtaW4gdXNlciBwYXNzd29yZCBzZWNyZXRcbiAgICovXG4gIGFkbWluVXNlclBhc3N3b3JkOiBzZWNyZXRzbWFuYWdlci5TZWNyZXQ7XG5cbiAgLyoqXG4gICAqIEFkbWluIHVzZXIgdG9rZW4gc2VjcmV0XG4gICAqL1xuICBhZG1pblVzZXJUb2tlbjogc2VjcmV0c21hbmFnZXIuU2VjcmV0O1xuXG4gIC8qKlxuICAgKiBMREFQIHRva2VuIHNlY3JldFxuICAgKi9cbiAgbGRhcFRva2VuOiBzZWNyZXRzbWFuYWdlci5TZWNyZXQ7XG5cbiAgLyoqXG4gICAqIEVGUyBmaWxlc3lzdGVtIElEXG4gICAqL1xuICBlZnNJZDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBFRlMgYWNjZXNzIHBvaW50IElEIGZvciBtZWRpYVxuICAgKi9cbiAgZWZzTWVkaWFBY2Nlc3NQb2ludElkOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEVGUyBhY2Nlc3MgcG9pbnQgSUQgZm9yIGN1c3RvbSB0ZW1wbGF0ZXNcbiAgICovXG4gIGVmc0N1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50SWQ6IHN0cmluZztcbn1cblxuLyoqXG4gKiBDREsgY29uc3RydWN0IGZvciB0aGUgQXV0aGVudGlrIHNlcnZpY2VcbiAqL1xuZXhwb3J0IGNsYXNzIEF1dGhlbnRpayBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBUaGUgbG9hZCBiYWxhbmNlciBmb3IgdGhlIEF1dGhlbnRpayBzZXJ2aWNlXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgbG9hZEJhbGFuY2VyOiBlbGJ2Mi5BcHBsaWNhdGlvbkxvYWRCYWxhbmNlcjtcblxuICAvKipcbiAgICogVGhlIEVDUyB0YXNrIGRlZmluaXRpb24gZm9yIHRoZSBBdXRoZW50aWsgc2VydmljZVxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IHRhc2tEZWZpbml0aW9uOiBlY3MuVGFza0RlZmluaXRpb247XG5cbiAgLyoqXG4gICAqIFRoZSBFQ1Mgc2VydmljZSBmb3IgQXV0aGVudGlrXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgZWNzU2VydmljZTogZWNzLkZhcmdhdGVTZXJ2aWNlO1xuXG4gIC8qKlxuICAgKiBETlMgbmFtZSBvZiB0aGUgbG9hZCBiYWxhbmNlclxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGRuc05hbWU6IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQXV0aGVudGlrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBsb2cgZ3JvdXBcbiAgICBjb25zdCBsb2dHcm91cCA9IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdMb2dzJywge1xuICAgICAgbG9nR3JvdXBOYW1lOiBpZCxcbiAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgcmVtb3ZhbFBvbGljeTogUmVtb3ZhbFBvbGljeS5ERVNUUk9ZXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgY29uZmlnIGJ1Y2tldCBpZiB1c2luZyBjb25maWcgZmlsZVxuICAgIGxldCBjb25maWdCdWNrZXQ7XG4gICAgaWYgKHByb3BzLnVzZUNvbmZpZ0ZpbGUpIHtcbiAgICAgIGNvbmZpZ0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0NvbmZpZ0J1Y2tldCcsIHtcbiAgICAgICAgYnVja2V0TmFtZTogYCR7aWR9LWNvbmZpZ2AudG9Mb3dlckNhc2UoKSxcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIGxvYWQgYmFsYW5jZXJcbiAgICB0aGlzLmxvYWRCYWxhbmNlciA9IG5ldyBlbGJ2Mi5BcHBsaWNhdGlvbkxvYWRCYWxhbmNlcih0aGlzLCAnQUxCJywge1xuICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICBpbnRlcm5ldEZhY2luZzogdHJ1ZSxcbiAgICAgIGlwQWRkcmVzc1R5cGU6IHByb3BzLmlwQWRkcmVzc1R5cGUgPT09ICdpcHY0JyA/IFxuICAgICAgICBlbGJ2Mi5JcEFkZHJlc3NUeXBlLklQVjQgOiBcbiAgICAgICAgZWxidjIuSXBBZGRyZXNzVHlwZS5EVUFMX1NUQUNLXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgSFRUUCBsaXN0ZW5lciBhbmQgcmVkaXJlY3QgdG8gSFRUUFNcbiAgICBjb25zdCBodHRwTGlzdGVuZXIgPSB0aGlzLmxvYWRCYWxhbmNlci5hZGRMaXN0ZW5lcignSHR0cExpc3RlbmVyJywge1xuICAgICAgcG9ydDogODAsXG4gICAgICBvcGVuOiB0cnVlXG4gICAgfSk7XG4gICAgaHR0cExpc3RlbmVyLmFkZEFjdGlvbignSHR0cFJlZGlyZWN0Jywge1xuICAgICAgYWN0aW9uOiBlbGJ2Mi5MaXN0ZW5lckFjdGlvbi5yZWRpcmVjdCh7XG4gICAgICAgIHBvcnQ6ICc0NDMnLFxuICAgICAgICBwcm90b2NvbDogJ0hUVFBTJ1xuICAgICAgfSlcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBIVFRQUyBsaXN0ZW5lclxuICAgIGNvbnN0IGh0dHBzTGlzdGVuZXIgPSB0aGlzLmxvYWRCYWxhbmNlci5hZGRMaXN0ZW5lcignSHR0cHNMaXN0ZW5lcicsIHtcbiAgICAgIHBvcnQ6IDQ0MyxcbiAgICAgIGNlcnRpZmljYXRlczogW3sgY2VydGlmaWNhdGVBcm46IHByb3BzLnNzbENlcnRpZmljYXRlQXJuIH1dLFxuICAgICAgb3BlbjogdHJ1ZVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHRhc2sgZXhlY3V0aW9uIHJvbGVcbiAgICBjb25zdCBleGVjdXRpb25Sb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdUYXNrRXhlY3V0aW9uUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlY3MtdGFza3MuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FtYXpvbkVDU1Rhc2tFeGVjdXRpb25Sb2xlUG9saWN5JylcbiAgICAgIF1cbiAgICB9KTtcblxuICAgIC8vIEFkZCBwZXJtaXNzaW9ucyB0byBhY2Nlc3Mgc2VjcmV0c1xuICAgIHByb3BzLmRiU2VjcmV0LmdyYW50UmVhZChleGVjdXRpb25Sb2xlKTtcbiAgICBwcm9wcy5yZWRpc0F1dGhUb2tlbi5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG4gICAgcHJvcHMuc2VjcmV0S2V5LmdyYW50UmVhZChleGVjdXRpb25Sb2xlKTtcbiAgICBwcm9wcy5hZG1pblVzZXJQYXNzd29yZC5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG4gICAgcHJvcHMuYWRtaW5Vc2VyVG9rZW4uZ3JhbnRSZWFkKGV4ZWN1dGlvblJvbGUpO1xuXG4gICAgLy8gQ3JlYXRlIHRhc2sgcm9sZVxuICAgIGNvbnN0IHRhc2tSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdUYXNrUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlY3MtdGFza3MuYW1hem9uYXdzLmNvbScpLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIHRhc2sgcGVybWlzc2lvbnNcbiAgICBpZiAocHJvcHMudXNlQ29uZmlnRmlsZSAmJiBjb25maWdCdWNrZXQpIHtcbiAgICAgIGNvbmZpZ0J1Y2tldC5ncmFudFJlYWQodGFza1JvbGUpO1xuICAgIH1cblxuICAgIC8vIEdyYW50IHJlYWQgYWNjZXNzIHRvIFMzIGNvbmZpZ3VyYXRpb24gYnVja2V0IGZvciBlbnZpcm9ubWVudCBmaWxlc1xuICAgIGlmIChwcm9wcy5lbnZGaWxlUzNLZXkpIHtcbiAgICAgIHByb3BzLnMzQ29uZkJ1Y2tldC5ncmFudFJlYWQodGFza1JvbGUpO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSB0YXNrIGRlZmluaXRpb25cbiAgICB0aGlzLnRhc2tEZWZpbml0aW9uID0gbmV3IGVjcy5GYXJnYXRlVGFza0RlZmluaXRpb24odGhpcywgJ1Rhc2tEZWYnLCB7XG4gICAgICBjcHU6IHByb3BzLmNvbmZpZy5lY3MudGFza0NwdSxcbiAgICAgIG1lbW9yeUxpbWl0TWlCOiBwcm9wcy5jb25maWcuZWNzLnRhc2tNZW1vcnksXG4gICAgICBleGVjdXRpb25Sb2xlLFxuICAgICAgdGFza1JvbGVcbiAgICB9KTtcblxuICAgIC8vIEFkZCB2b2x1bWVzIGZvciBFRlNcbiAgICB0aGlzLnRhc2tEZWZpbml0aW9uLmFkZFZvbHVtZSh7XG4gICAgICBuYW1lOiAnbWVkaWEnLFxuICAgICAgZWZzVm9sdW1lQ29uZmlndXJhdGlvbjoge1xuICAgICAgICBmaWxlU3lzdGVtSWQ6IHByb3BzLmVmc0lkLFxuICAgICAgICB0cmFuc2l0RW5jcnlwdGlvbjogJ0VOQUJMRUQnLFxuICAgICAgICBhdXRob3JpemF0aW9uQ29uZmlnOiB7XG4gICAgICAgICAgYWNjZXNzUG9pbnRJZDogcHJvcHMuZWZzTWVkaWFBY2Nlc3NQb2ludElkLFxuICAgICAgICAgIGlhbTogJ0VOQUJMRUQnXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHRoaXMudGFza0RlZmluaXRpb24uYWRkVm9sdW1lKHtcbiAgICAgIG5hbWU6ICdjdXN0b20tdGVtcGxhdGVzJyxcbiAgICAgIGVmc1ZvbHVtZUNvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgZmlsZVN5c3RlbUlkOiBwcm9wcy5lZnNJZCxcbiAgICAgICAgdHJhbnNpdEVuY3J5cHRpb246ICdFTkFCTEVEJyxcbiAgICAgICAgYXV0aG9yaXphdGlvbkNvbmZpZzoge1xuICAgICAgICAgIGFjY2Vzc1BvaW50SWQ6IHByb3BzLmVmc0N1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50SWQsXG4gICAgICAgICAgaWFtOiAnRU5BQkxFRCdcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gRGV0ZXJtaW5lIERvY2tlciBpbWFnZVxuICAgIGNvbnN0IGRvY2tlckltYWdlID0gcHJvcHMuZG9ja2VySW1hZ2VMb2NhdGlvbiA9PT0gJ0dpdGh1YicgXG4gICAgICA/ICdnaGNyLmlvL3Rhay1uei9hdXRoZW50aWstc2VydmVyOmxhdGVzdCdcbiAgICAgIDogcHJvcHMuZWNyUmVwb3NpdG9yeUFybiBcbiAgICAgICAgPyBgJHtwcm9wcy5lY3JSZXBvc2l0b3J5QXJufTpsYXRlc3RgXG4gICAgICAgIDogJ3BsYWNlaG9sZGVyLWZvci1sb2NhbC1lY3InOyAvLyBGYWxsYmFjayBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHlcblxuICAgIC8vIFByZXBhcmUgY29udGFpbmVyIGRlZmluaXRpb24gb3B0aW9uc1xuICAgIGxldCBjb250YWluZXJEZWZpbml0aW9uT3B0aW9uczogZWNzLkNvbnRhaW5lckRlZmluaXRpb25PcHRpb25zID0ge1xuICAgICAgaW1hZ2U6IGVjcy5Db250YWluZXJJbWFnZS5mcm9tUmVnaXN0cnkoZG9ja2VySW1hZ2UpLFxuICAgICAgbG9nZ2luZzogZWNzLkxvZ0RyaXZlcnMuYXdzTG9ncyh7XG4gICAgICAgIHN0cmVhbVByZWZpeDogJ2F1dGhlbnRpaycsXG4gICAgICAgIGxvZ0dyb3VwXG4gICAgICB9KSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEFVVEhFTlRJS19SRURJU19fSE9TVDogcHJvcHMucmVkaXNIb3N0bmFtZSxcbiAgICAgICAgQVVUSEVOVElLX1BPU1RHUkVTUUxfX0hPU1Q6IHByb3BzLmRiSG9zdG5hbWUsXG4gICAgICAgIEFVVEhFTlRJS19QT1NUR1JFU1FMX19OQU1FOiAnYXV0aGVudGlrJyxcbiAgICAgICAgQVVUSEVOVElLX1BPU1RHUkVTUUxfX1VTRVI6ICdhdXRoZW50aWsnLFxuICAgICAgICBBVVRIRU5USUtfQk9PVFNUUkFQX0VNQUlMOiBwcm9wcy5hZG1pblVzZXJFbWFpbCxcbiAgICAgICAgQVVUSEVOVElLX0JPT1RTVFJBUF9GTE9XX0FVVEhFTlRJQ0FUSU9OOiAnZGVmYXVsdC1hdXRoZW50aWNhdGlvbi1mbG93JyxcbiAgICAgICAgQVVUSEVOVElLX0JPT1RTVFJBUF9GTE9XX0FVVEhPUklaQVRJT046ICdkZWZhdWx0LXByb3ZpZGVyLWF1dGhvcml6YXRpb24tZXhwbGljaXQtY29uc2VudCcsXG4gICAgICAgIEFVVEhFTlRJS19CT09UU1RSQVBfRkxPV19FTlJPTExNRU5UOiAnZGVmYXVsdC1lbnJvbGxtZW50LWZsb3cnLFxuICAgICAgICBBVVRIRU5USUtfQk9PVFNUUkFQX0ZMT1dfSU5WQUxJREFUSU9OOiAnZGVmYXVsdC1pbnZhbGlkYXRpb24tZmxvdycsXG4gICAgICAgIEFVVEhFTlRJS19CT09UU1RSQVBfRkxPV19SRUNPVkVSWTogJ2RlZmF1bHQtcmVjb3ZlcnktZmxvdycsXG4gICAgICAgIEFVVEhFTlRJS19CT09UU1RSQVBfRkxPV19VTkVOUk9MTE1FTlQ6ICdkZWZhdWx0LXVuZW5yb2xsbWVudC1mbG93JyxcbiAgICAgICAgQVVUSEVOVElLX0JPT1RTVFJBUF9UT0tFTjogcHJvcHMuYWRtaW5Vc2VyVG9rZW4uc2VjcmV0VmFsdWVGcm9tSnNvbignU2VjcmV0U3RyaW5nJykudG9TdHJpbmcoKSxcbiAgICAgICAgQVVUSEVOVElLX0xEQVBfX0JJTkRfRE5fVEVNUExBVEU6IHByb3BzLmxkYXBCYXNlRG5cbiAgICAgIH0sXG4gICAgICBzZWNyZXRzOiB7XG4gICAgICAgIEFVVEhFTlRJS19QT1NUR1JFU1FMX19QQVNTV09SRDogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIocHJvcHMuZGJTZWNyZXQsICdwYXNzd29yZCcpLFxuICAgICAgICBBVVRIRU5USUtfUkVESVNfX1BBU1NXT1JEOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihwcm9wcy5yZWRpc0F1dGhUb2tlbiksXG4gICAgICAgIEFVVEhFTlRJS19TRUNSRVRfS0VZOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihwcm9wcy5zZWNyZXRLZXkpLFxuICAgICAgICBBVVRIRU5USUtfQk9PVFNUUkFQX1BBU1NXT1JEOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihwcm9wcy5hZG1pblVzZXJQYXNzd29yZCwgJ3Bhc3N3b3JkJylcbiAgICAgIH0sXG4gICAgICBoZWFsdGhDaGVjazoge1xuICAgICAgICBjb21tYW5kOiBbJ0NNRC1TSEVMTCcsICdjdXJsIC1mIGh0dHA6Ly9sb2NhbGhvc3Q6OTAwMC9oZWFsdGh6LyB8fCBleGl0IDEnXSxcbiAgICAgICAgaW50ZXJ2YWw6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDUpLFxuICAgICAgICByZXRyaWVzOiAzLFxuICAgICAgICBzdGFydFBlcmlvZDogRHVyYXRpb24uc2Vjb25kcyg2MClcbiAgICAgIH0sXG4gICAgICBlc3NlbnRpYWw6IHRydWVcbiAgICB9O1xuXG4gICAgLy8gQWRkIGVudmlyb25tZW50IGZpbGVzIGlmIFMzIGtleSBpcyBwcm92aWRlZFxuICAgIGlmIChwcm9wcy5lbnZGaWxlUzNLZXkpIHtcbiAgICAgIGNvbnRhaW5lckRlZmluaXRpb25PcHRpb25zID0ge1xuICAgICAgICAuLi5jb250YWluZXJEZWZpbml0aW9uT3B0aW9ucyxcbiAgICAgICAgZW52aXJvbm1lbnRGaWxlczogW1xuICAgICAgICAgIGVjcy5FbnZpcm9ubWVudEZpbGUuZnJvbUJ1Y2tldChwcm9wcy5zM0NvbmZCdWNrZXQsIHByb3BzLmVudkZpbGVTM0tleSlcbiAgICAgICAgXVxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCBjb250YWluZXIgPSB0aGlzLnRhc2tEZWZpbml0aW9uLmFkZENvbnRhaW5lcignQXV0aGVudGlrU2VydmVyJywgY29udGFpbmVyRGVmaW5pdGlvbk9wdGlvbnMpO1xuXG4gICAgLy8gQWRkIHBvcnQgbWFwcGluZ3NcbiAgICBjb250YWluZXIuYWRkUG9ydE1hcHBpbmdzKHtcbiAgICAgIGNvbnRhaW5lclBvcnQ6IDkwMDAsXG4gICAgICBob3N0UG9ydDogOTAwMCxcbiAgICAgIHByb3RvY29sOiBlY3MuUHJvdG9jb2wuVENQXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgbW91bnQgcG9pbnRzIGZvciBFRlMgdm9sdW1lc1xuICAgIGNvbnRhaW5lci5hZGRNb3VudFBvaW50cyh7XG4gICAgICBjb250YWluZXJQYXRoOiAnL21lZGlhJyxcbiAgICAgIHNvdXJjZVZvbHVtZTogJ21lZGlhJyxcbiAgICAgIHJlYWRPbmx5OiBmYWxzZVxuICAgIH0pO1xuXG4gICAgY29udGFpbmVyLmFkZE1vdW50UG9pbnRzKHtcbiAgICAgIGNvbnRhaW5lclBhdGg6ICcvdGVtcGxhdGVzJyxcbiAgICAgIHNvdXJjZVZvbHVtZTogJ2N1c3RvbS10ZW1wbGF0ZXMnLFxuICAgICAgcmVhZE9ubHk6IGZhbHNlXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgRUNTIHNlcnZpY2VcbiAgICB0aGlzLmVjc1NlcnZpY2UgPSBuZXcgZWNzLkZhcmdhdGVTZXJ2aWNlKHRoaXMsICdTZXJ2aWNlJywge1xuICAgICAgY2x1c3RlcjogcHJvcHMuZWNzQ2x1c3RlcixcbiAgICAgIHRhc2tEZWZpbml0aW9uOiB0aGlzLnRhc2tEZWZpbml0aW9uLFxuICAgICAgZGVzaXJlZENvdW50OiBwcm9wcy5jb25maWcuZWNzLmRlc2lyZWRDb3VudCxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbcHJvcHMuZWNzU2VjdXJpdHlHcm91cF0sXG4gICAgICBlbmFibGVFeGVjdXRlQ29tbWFuZDogcHJvcHMuZW5hYmxlRXhlY3V0ZSxcbiAgICAgIGFzc2lnblB1YmxpY0lwOiBmYWxzZSxcbiAgICAgIGNpcmN1aXRCcmVha2VyOiB7IHJvbGxiYWNrOiB0cnVlIH1cbiAgICB9KTtcblxuICAgIC8vIEFkZCBhdXRvIHNjYWxpbmdcbiAgICBjb25zdCBzY2FsaW5nID0gdGhpcy5lY3NTZXJ2aWNlLmF1dG9TY2FsZVRhc2tDb3VudCh7XG4gICAgICBtaW5DYXBhY2l0eTogcHJvcHMuY29uZmlnLmVjcy5taW5DYXBhY2l0eSxcbiAgICAgIG1heENhcGFjaXR5OiBwcm9wcy5jb25maWcuZWNzLm1heENhcGFjaXR5XG4gICAgfSk7XG5cbiAgICAvLyBTY2FsZSBiYXNlZCBvbiBDUFUgdXRpbGl6YXRpb25cbiAgICBzY2FsaW5nLnNjYWxlT25DcHVVdGlsaXphdGlvbignQ3B1U2NhbGluZycsIHtcbiAgICAgIHRhcmdldFV0aWxpemF0aW9uUGVyY2VudDogNzAsXG4gICAgICBzY2FsZUluQ29vbGRvd246IER1cmF0aW9uLm1pbnV0ZXMoMyksXG4gICAgICBzY2FsZU91dENvb2xkb3duOiBEdXJhdGlvbi5taW51dGVzKDEpXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgdGFyZ2V0IGdyb3VwIGZvciB0aGUgQXV0aGVudGlrIHNlcnZpY2VcbiAgICBjb25zdCB0YXJnZXRHcm91cCA9IG5ldyBlbGJ2Mi5BcHBsaWNhdGlvblRhcmdldEdyb3VwKHRoaXMsICdUYXJnZXRHcm91cCcsIHtcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgdGFyZ2V0VHlwZTogZWxidjIuVGFyZ2V0VHlwZS5JUCxcbiAgICAgIHBvcnQ6IDkwMDAsXG4gICAgICBwcm90b2NvbDogZWxidjIuQXBwbGljYXRpb25Qcm90b2NvbC5IVFRQLFxuICAgICAgaGVhbHRoQ2hlY2s6IHtcbiAgICAgICAgcGF0aDogJy9oZWFsdGh6LycsXG4gICAgICAgIGludGVydmFsOiBEdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgaGVhbHRoeUh0dHBDb2RlczogJzIwMC0yOTknXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBSZWdpc3RlciB0YXJnZXRzXG4gICAgdGFyZ2V0R3JvdXAuYWRkVGFyZ2V0KHRoaXMuZWNzU2VydmljZSk7XG5cbiAgICAvLyBBZGQgZGVmYXVsdCBhY3Rpb24gdG8gdGhlIEhUVFBTIGxpc3RlbmVyXG4gICAgaHR0cHNMaXN0ZW5lci5hZGRBY3Rpb24oJ0RlZmF1bHRBY3Rpb24nLCB7XG4gICAgICBhY3Rpb246IGVsYnYyLkxpc3RlbmVyQWN0aW9uLmZvcndhcmQoW3RhcmdldEdyb3VwXSlcbiAgICB9KTtcblxuICAgIC8vIFN0b3JlIHRoZSBETlMgbmFtZSBmb3Igb3V0cHV0XG4gICAgdGhpcy5kbnNOYW1lID0gdGhpcy5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZTtcblxuICAgIC8vIEV4cG9ydCBvdXRwdXRzXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnTG9hZEJhbGFuY2VyRG5zTmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmRuc05hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSBETlMgbmFtZSBvZiB0aGUgbG9hZCBiYWxhbmNlcidcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0F1dGhlbnRpa1VSTCcsIHtcbiAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke3RoaXMuZG5zTmFtZX0vYCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIFVSTCBvZiB0aGUgQXV0aGVudGlrIHNlcnZpY2UnXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==