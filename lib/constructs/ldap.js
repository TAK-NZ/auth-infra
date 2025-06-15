"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ldap = void 0;
/**
 * LDAP Construct - CDK implementation of the Authentik LDAP outpost
 */
const constructs_1 = require("constructs");
const aws_cdk_lib_1 = require("aws-cdk-lib");
/**
 * CDK construct for the LDAP outpost service
 */
class Ldap extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        // Create the log group
        const logGroup = new aws_cdk_lib_1.aws_logs.LogGroup(this, 'Logs', {
            logGroupName: id,
            retention: aws_cdk_lib_1.aws_logs.RetentionDays.ONE_WEEK,
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY
        });
        // Create security group for NLB
        const nlbSecurityGroup = new aws_cdk_lib_1.aws_ec2.SecurityGroup(this, 'NLBSecurityGroup', {
            vpc: props.vpc,
            description: 'Allow 389 and 636 Access to NLB',
            allowAllOutbound: false
        });
        // Allow LDAP traffic
        nlbSecurityGroup.addIngressRule(aws_cdk_lib_1.aws_ec2.Peer.ipv4('10.0.0.0/8'), aws_cdk_lib_1.aws_ec2.Port.tcp(389), 'Allow LDAP access');
        nlbSecurityGroup.addIngressRule(aws_cdk_lib_1.aws_ec2.Peer.ipv4('10.0.0.0/8'), aws_cdk_lib_1.aws_ec2.Port.tcp(636), 'Allow LDAPS access');
        // Create network load balancer
        this.loadBalancer = new aws_cdk_lib_1.aws_elasticloadbalancingv2.NetworkLoadBalancer(this, 'NLB', {
            vpc: props.vpc,
            internetFacing: false,
            vpcSubnets: {
                subnetType: aws_cdk_lib_1.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS
            }
        });
        // Create listeners for LDAP and LDAPS
        const ldapListener = this.loadBalancer.addListener('LdapListener', {
            port: 389,
            protocol: aws_cdk_lib_1.aws_elasticloadbalancingv2.Protocol.TCP
        });
        const ldapsListener = this.loadBalancer.addListener('LdapsListener', {
            port: 636,
            protocol: aws_cdk_lib_1.aws_elasticloadbalancingv2.Protocol.TLS,
            certificates: [{ certificateArn: props.sslCertificateArn }]
        });
        // Create task execution role
        const executionRole = new aws_cdk_lib_1.aws_iam.Role(this, 'TaskExecutionRole', {
            assumedBy: new aws_cdk_lib_1.aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
            managedPolicies: [
                aws_cdk_lib_1.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
            ]
        });
        // Add permissions to access secrets
        props.ldapToken.grantRead(executionRole);
        // Create task role
        const taskRole = new aws_cdk_lib_1.aws_iam.Role(this, 'TaskRole', {
            assumedBy: new aws_cdk_lib_1.aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        });
        // Create task definition
        this.taskDefinition = new aws_cdk_lib_1.aws_ecs.FargateTaskDefinition(this, 'TaskDef', {
            cpu: props.config.ecsTaskCpu,
            memoryLimitMiB: props.config.ecsTaskMemory,
            executionRole,
            taskRole
        });
        // Determine Docker image
        const dockerImage = props.dockerImageLocation === 'Github'
            ? 'ghcr.io/tak-nz/authentik-ldap:latest'
            : 'placeholder-for-local-ecr'; // Replace with actual ECR URL in production
        // Create container definition
        const container = this.taskDefinition.addContainer('AuthentikLdap', {
            image: aws_cdk_lib_1.aws_ecs.ContainerImage.fromRegistry(dockerImage),
            logging: aws_cdk_lib_1.aws_ecs.LogDrivers.awsLogs({
                streamPrefix: 'authentik-ldap',
                logGroup
            }),
            environment: {
                AUTHENTIK_HOST: props.authentikHost,
                AUTHENTIK_INSECURE: 'false'
            },
            secrets: {
                AUTHENTIK_TOKEN: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.ldapToken)
            },
            healthCheck: {
                command: ['CMD-SHELL', 'netstat -an | grep ":389 " || exit 1'],
                interval: aws_cdk_lib_1.Duration.seconds(30),
                timeout: aws_cdk_lib_1.Duration.seconds(5),
                retries: 3,
                startPeriod: aws_cdk_lib_1.Duration.seconds(60)
            },
            essential: true
        });
        // Add port mappings
        container.addPortMappings({
            containerPort: 389,
            hostPort: 389,
            protocol: aws_cdk_lib_1.aws_ecs.Protocol.TCP
        }, {
            containerPort: 636,
            hostPort: 636,
            protocol: aws_cdk_lib_1.aws_ecs.Protocol.TCP
        });
        // Create ECS service
        this.ecsService = new aws_cdk_lib_1.aws_ecs.FargateService(this, 'Service', {
            cluster: props.ecsCluster,
            taskDefinition: this.taskDefinition,
            desiredCount: props.config.ecsTaskDesiredCount,
            securityGroups: [props.ecsSecurityGroup],
            enableExecuteCommand: props.enableExecute,
            assignPublicIp: false,
            circuitBreaker: { rollback: true }
        });
        // Create target groups for LDAP and LDAPS
        const ldapTargetGroup = new aws_cdk_lib_1.aws_elasticloadbalancingv2.NetworkTargetGroup(this, 'LdapTargetGroup', {
            vpc: props.vpc,
            targetType: aws_cdk_lib_1.aws_elasticloadbalancingv2.TargetType.IP,
            port: 389,
            protocol: aws_cdk_lib_1.aws_elasticloadbalancingv2.Protocol.TCP,
            healthCheck: {
                port: '389',
                protocol: aws_cdk_lib_1.aws_elasticloadbalancingv2.Protocol.TCP,
                interval: aws_cdk_lib_1.Duration.seconds(30)
            }
        });
        const ldapsTargetGroup = new aws_cdk_lib_1.aws_elasticloadbalancingv2.NetworkTargetGroup(this, 'LdapsTargetGroup', {
            vpc: props.vpc,
            targetType: aws_cdk_lib_1.aws_elasticloadbalancingv2.TargetType.IP,
            port: 636,
            protocol: aws_cdk_lib_1.aws_elasticloadbalancingv2.Protocol.TCP,
            healthCheck: {
                port: '636',
                protocol: aws_cdk_lib_1.aws_elasticloadbalancingv2.Protocol.TCP,
                interval: aws_cdk_lib_1.Duration.seconds(30)
            }
        });
        // Register targets
        ldapTargetGroup.addTarget(this.ecsService);
        ldapsTargetGroup.addTarget(this.ecsService);
        // Add default actions to listeners
        ldapListener.addAction('LdapAction', {
            action: aws_cdk_lib_1.aws_elasticloadbalancingv2.NetworkListenerAction.forward([ldapTargetGroup])
        });
        ldapsListener.addAction('LdapsAction', {
            action: aws_cdk_lib_1.aws_elasticloadbalancingv2.NetworkListenerAction.forward([ldapsTargetGroup])
        });
        // Store the DNS name for output
        this.dnsName = this.loadBalancer.loadBalancerDnsName;
        // Export outputs
        new aws_cdk_lib_1.CfnOutput(this, 'LoadBalancerDnsName', {
            value: this.dnsName,
            description: 'The DNS name of the LDAP load balancer'
        });
        new aws_cdk_lib_1.CfnOutput(this, 'LdapEndpoint', {
            value: `ldap://${this.dnsName}:389`,
            description: 'The LDAP endpoint URL'
        });
        new aws_cdk_lib_1.CfnOutput(this, 'LdapsEndpoint', {
            value: `ldaps://${this.dnsName}:636`,
            description: 'The LDAPS endpoint URL'
        });
    }
}
exports.Ldap = Ldap;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGRhcC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImxkYXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUE7O0dBRUc7QUFDSCwyQ0FBdUM7QUFDdkMsNkNBVXFCO0FBMkRyQjs7R0FFRztBQUNILE1BQWEsSUFBSyxTQUFRLHNCQUFTO0lBcUJqQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQWdCO1FBQ3hELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsdUJBQXVCO1FBQ3ZCLE1BQU0sUUFBUSxHQUFHLElBQUksc0JBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRTtZQUMvQyxZQUFZLEVBQUUsRUFBRTtZQUNoQixTQUFTLEVBQUUsc0JBQUksQ0FBQyxhQUFhLENBQUMsUUFBUTtZQUN0QyxhQUFhLEVBQUUsMkJBQWEsQ0FBQyxPQUFPO1NBQ3JDLENBQUMsQ0FBQztRQUVILGdDQUFnQztRQUNoQyxNQUFNLGdCQUFnQixHQUFHLElBQUkscUJBQUcsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQ3ZFLEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRztZQUNkLFdBQVcsRUFBRSxpQ0FBaUM7WUFDOUMsZ0JBQWdCLEVBQUUsS0FBSztTQUN4QixDQUFDLENBQUM7UUFFSCxxQkFBcUI7UUFDckIsZ0JBQWdCLENBQUMsY0FBYyxDQUM3QixxQkFBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEVBQzNCLHFCQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFDakIsbUJBQW1CLENBQ3BCLENBQUM7UUFFRixnQkFBZ0IsQ0FBQyxjQUFjLENBQzdCLHFCQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsRUFDM0IscUJBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUNqQixvQkFBb0IsQ0FD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QUFDLHFCQUFxQixDQUFDLE9BQU8sQ0FBQyxDQUFDLGdCQUFnQixDQUFDLENBQUM7U0FDaEUsQ0FBQyxDQUFDO1FBRUgsZ0NBQWdDO1FBQ2hDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxtQkFBbUIsQ0FBQztRQUVyRCxpQkFBaUI7UUFDakIsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxxQkFBcUIsRUFBRTtZQUN6QyxLQUFLLEVBQUUsSUFBSSxDQUFDLE9BQU87WUFDbkIsV0FBVyxFQUFFLHdDQUF3QztTQUN0RCxDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtZQUNsQyxLQUFLLEVBQUUsVUFBVSxJQUFJLENBQUMsT0FBTyxNQUFNO1lBQ25DLFdBQVcsRUFBRSx1QkFBdUI7U0FDckMsQ0FBQyxDQUFDO1FBRUgsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDbkMsS0FBSyxFQUFFLFdBQVcsSUFBSSxDQUFDLE9BQU8sTUFBTTtZQUNwQyxXQUFXLEVBQUUsd0JBQXdCO1NBQ3RDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQS9NRCxvQkErTUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIExEQVAgQ29uc3RydWN0IC0gQ0RLIGltcGxlbWVudGF0aW9uIG9mIHRoZSBBdXRoZW50aWsgTERBUCBvdXRwb3N0XG4gKi9cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHtcbiAgYXdzX2VjMiBhcyBlYzIsXG4gIGF3c19lY3MgYXMgZWNzLFxuICBhd3NfZWxhc3RpY2xvYWRiYWxhbmNpbmd2MiBhcyBlbGJ2MixcbiAgYXdzX2xvZ3MgYXMgbG9ncyxcbiAgYXdzX3NlY3JldHNtYW5hZ2VyIGFzIHNlY3JldHNtYW5hZ2VyLFxuICBhd3NfaWFtIGFzIGlhbSxcbiAgRHVyYXRpb24sXG4gIFJlbW92YWxQb2xpY3ksXG4gIENmbk91dHB1dFxufSBmcm9tICdhd3MtY2RrLWxpYic7XG5cbmltcG9ydCB0eXBlIHsgQmFzZUNvbmZpZyB9IGZyb20gJy4uL2Vudmlyb25tZW50LWNvbmZpZyc7XG5cbi8qKlxuICogUHJvcGVydGllcyBmb3IgdGhlIExEQVAgY29uc3RydWN0XG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgTGRhcFByb3BzIHtcbiAgLyoqXG4gICAqIEVudmlyb25tZW50IG5hbWUgKGUuZy4gJ3Byb2QnLCAnZGV2JywgZXRjLilcbiAgICovXG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEVudmlyb25tZW50IGNvbmZpZ3VyYXRpb25cbiAgICovXG4gIGNvbmZpZzogQmFzZUNvbmZpZztcblxuICAvKipcbiAgICogVlBDIGZvciBkZXBsb3ltZW50XG4gICAqL1xuICB2cGM6IGVjMi5JVnBjO1xuXG4gIC8qKlxuICAgKiBTZWN1cml0eSBncm91cCBmb3IgRUNTIHRhc2tzXG4gICAqL1xuICBlY3NTZWN1cml0eUdyb3VwOiBlYzIuU2VjdXJpdHlHcm91cDtcblxuICAvKipcbiAgICogRUNTIGNsdXN0ZXJcbiAgICovXG4gIGVjc0NsdXN0ZXI6IGVjcy5DbHVzdGVyO1xuXG4gIC8qKlxuICAgKiBTU0wgY2VydGlmaWNhdGUgQVJOIGZvciBMREFQU1xuICAgKi9cbiAgc3NsQ2VydGlmaWNhdGVBcm46IHN0cmluZztcblxuICAvKipcbiAgICogQXV0aGVudGlrIGhvc3QgVVJMXG4gICAqL1xuICBhdXRoZW50aWtIb3N0OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIERvY2tlciBpbWFnZSBsb2NhdGlvbiAoR2l0aHViIG9yIExvY2FsIEVDUilcbiAgICovXG4gIGRvY2tlckltYWdlTG9jYXRpb246ICdHaXRodWInIHwgJ0xvY2FsIEVDUic7XG5cbiAgLyoqXG4gICAqIEFsbG93IFNTSCBleGVjIGludG8gY29udGFpbmVyXG4gICAqL1xuICBlbmFibGVFeGVjdXRlOiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBMREFQIHRva2VuIHNlY3JldCBmcm9tIEF1dGhlbnRpa1xuICAgKi9cbiAgbGRhcFRva2VuOiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xufVxuXG4vKipcbiAqIENESyBjb25zdHJ1Y3QgZm9yIHRoZSBMREFQIG91dHBvc3Qgc2VydmljZVxuICovXG5leHBvcnQgY2xhc3MgTGRhcCBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBUaGUgbmV0d29yayBsb2FkIGJhbGFuY2VyIGZvciB0aGUgTERBUCBzZXJ2aWNlXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgbG9hZEJhbGFuY2VyOiBlbGJ2Mi5OZXR3b3JrTG9hZEJhbGFuY2VyO1xuXG4gIC8qKlxuICAgKiBUaGUgRUNTIHRhc2sgZGVmaW5pdGlvbiBmb3IgdGhlIExEQVAgc2VydmljZVxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IHRhc2tEZWZpbml0aW9uOiBlY3MuVGFza0RlZmluaXRpb247XG5cbiAgLyoqXG4gICAqIFRoZSBFQ1Mgc2VydmljZSBmb3IgTERBUFxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGVjc1NlcnZpY2U6IGVjcy5GYXJnYXRlU2VydmljZTtcblxuICAvKipcbiAgICogRE5TIG5hbWUgb2YgdGhlIGxvYWQgYmFsYW5jZXJcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBkbnNOYW1lOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IExkYXBQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIGxvZyBncm91cFxuICAgIGNvbnN0IGxvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0xvZ3MnLCB7XG4gICAgICBsb2dHcm91cE5hbWU6IGlkLFxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICByZW1vdmFsUG9saWN5OiBSZW1vdmFsUG9saWN5LkRFU1RST1lcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBzZWN1cml0eSBncm91cCBmb3IgTkxCXG4gICAgY29uc3QgbmxiU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnTkxCU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyAzODkgYW5kIDYzNiBBY2Nlc3MgdG8gTkxCJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IGZhbHNlXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBMREFQIHRyYWZmaWNcbiAgICBubGJTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuaXB2NCgnMTAuMC4wLjAvOCcpLFxuICAgICAgZWMyLlBvcnQudGNwKDM4OSksXG4gICAgICAnQWxsb3cgTERBUCBhY2Nlc3MnXG4gICAgKTtcblxuICAgIG5sYlNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5pcHY0KCcxMC4wLjAuMC84JyksXG4gICAgICBlYzIuUG9ydC50Y3AoNjM2KSxcbiAgICAgICdBbGxvdyBMREFQUyBhY2Nlc3MnXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBuZXR3b3JrIGxvYWQgYmFsYW5jZXJcbiAgICB0aGlzLmxvYWRCYWxhbmNlciA9IG5ldyBlbGJ2Mi5OZXR3b3JrTG9hZEJhbGFuY2VyKHRoaXMsICdOTEInLCB7XG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgIGludGVybmV0RmFjaW5nOiBmYWxzZSxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTU1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIGxpc3RlbmVycyBmb3IgTERBUCBhbmQgTERBUFNcbiAgICBjb25zdCBsZGFwTGlzdGVuZXIgPSB0aGlzLmxvYWRCYWxhbmNlci5hZGRMaXN0ZW5lcignTGRhcExpc3RlbmVyJywge1xuICAgICAgcG9ydDogMzg5LFxuICAgICAgcHJvdG9jb2w6IGVsYnYyLlByb3RvY29sLlRDUFxuICAgIH0pO1xuXG4gICAgY29uc3QgbGRhcHNMaXN0ZW5lciA9IHRoaXMubG9hZEJhbGFuY2VyLmFkZExpc3RlbmVyKCdMZGFwc0xpc3RlbmVyJywge1xuICAgICAgcG9ydDogNjM2LFxuICAgICAgcHJvdG9jb2w6IGVsYnYyLlByb3RvY29sLlRMUyxcbiAgICAgIGNlcnRpZmljYXRlczogW3sgY2VydGlmaWNhdGVBcm46IHByb3BzLnNzbENlcnRpZmljYXRlQXJuIH1dXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgdGFzayBleGVjdXRpb24gcm9sZVxuICAgIGNvbnN0IGV4ZWN1dGlvblJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1Rhc2tFeGVjdXRpb25Sb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2Vjcy10YXNrcy5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQW1hem9uRUNTVGFza0V4ZWN1dGlvblJvbGVQb2xpY3knKVxuICAgICAgXVxuICAgIH0pO1xuXG4gICAgLy8gQWRkIHBlcm1pc3Npb25zIHRvIGFjY2VzcyBzZWNyZXRzXG4gICAgcHJvcHMubGRhcFRva2VuLmdyYW50UmVhZChleGVjdXRpb25Sb2xlKTtcblxuICAgIC8vIENyZWF0ZSB0YXNrIHJvbGVcbiAgICBjb25zdCB0YXNrUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnVGFza1JvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnZWNzLXRhc2tzLmFtYXpvbmF3cy5jb20nKSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSB0YXNrIGRlZmluaXRpb25cbiAgICB0aGlzLnRhc2tEZWZpbml0aW9uID0gbmV3IGVjcy5GYXJnYXRlVGFza0RlZmluaXRpb24odGhpcywgJ1Rhc2tEZWYnLCB7XG4gICAgICBjcHU6IHByb3BzLmNvbmZpZy5lY3NUYXNrQ3B1LFxuICAgICAgbWVtb3J5TGltaXRNaUI6IHByb3BzLmNvbmZpZy5lY3NUYXNrTWVtb3J5LFxuICAgICAgZXhlY3V0aW9uUm9sZSxcbiAgICAgIHRhc2tSb2xlXG4gICAgfSk7XG5cbiAgICAvLyBEZXRlcm1pbmUgRG9ja2VyIGltYWdlXG4gICAgY29uc3QgZG9ja2VySW1hZ2UgPSBwcm9wcy5kb2NrZXJJbWFnZUxvY2F0aW9uID09PSAnR2l0aHViJyBcbiAgICAgID8gJ2doY3IuaW8vdGFrLW56L2F1dGhlbnRpay1sZGFwOmxhdGVzdCdcbiAgICAgIDogJ3BsYWNlaG9sZGVyLWZvci1sb2NhbC1lY3InOyAvLyBSZXBsYWNlIHdpdGggYWN0dWFsIEVDUiBVUkwgaW4gcHJvZHVjdGlvblxuXG4gICAgLy8gQ3JlYXRlIGNvbnRhaW5lciBkZWZpbml0aW9uXG4gICAgY29uc3QgY29udGFpbmVyID0gdGhpcy50YXNrRGVmaW5pdGlvbi5hZGRDb250YWluZXIoJ0F1dGhlbnRpa0xkYXAnLCB7XG4gICAgICBpbWFnZTogZWNzLkNvbnRhaW5lckltYWdlLmZyb21SZWdpc3RyeShkb2NrZXJJbWFnZSksXG4gICAgICBsb2dnaW5nOiBlY3MuTG9nRHJpdmVycy5hd3NMb2dzKHtcbiAgICAgICAgc3RyZWFtUHJlZml4OiAnYXV0aGVudGlrLWxkYXAnLFxuICAgICAgICBsb2dHcm91cFxuICAgICAgfSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBBVVRIRU5USUtfSE9TVDogcHJvcHMuYXV0aGVudGlrSG9zdCxcbiAgICAgICAgQVVUSEVOVElLX0lOU0VDVVJFOiAnZmFsc2UnXG4gICAgICB9LFxuICAgICAgc2VjcmV0czoge1xuICAgICAgICBBVVRIRU5USUtfVE9LRU46IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHByb3BzLmxkYXBUb2tlbilcbiAgICAgIH0sXG4gICAgICBoZWFsdGhDaGVjazoge1xuICAgICAgICBjb21tYW5kOiBbJ0NNRC1TSEVMTCcsICduZXRzdGF0IC1hbiB8IGdyZXAgXCI6Mzg5IFwiIHx8IGV4aXQgMSddLFxuICAgICAgICBpbnRlcnZhbDogRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoNSksXG4gICAgICAgIHJldHJpZXM6IDMsXG4gICAgICAgIHN0YXJ0UGVyaW9kOiBEdXJhdGlvbi5zZWNvbmRzKDYwKVxuICAgICAgfSxcbiAgICAgIGVzc2VudGlhbDogdHJ1ZVxuICAgIH0pO1xuXG4gICAgLy8gQWRkIHBvcnQgbWFwcGluZ3NcbiAgICBjb250YWluZXIuYWRkUG9ydE1hcHBpbmdzKFxuICAgICAge1xuICAgICAgICBjb250YWluZXJQb3J0OiAzODksXG4gICAgICAgIGhvc3RQb3J0OiAzODksXG4gICAgICAgIHByb3RvY29sOiBlY3MuUHJvdG9jb2wuVENQXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBjb250YWluZXJQb3J0OiA2MzYsXG4gICAgICAgIGhvc3RQb3J0OiA2MzYsXG4gICAgICAgIHByb3RvY29sOiBlY3MuUHJvdG9jb2wuVENQXG4gICAgICB9XG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBFQ1Mgc2VydmljZVxuICAgIHRoaXMuZWNzU2VydmljZSA9IG5ldyBlY3MuRmFyZ2F0ZVNlcnZpY2UodGhpcywgJ1NlcnZpY2UnLCB7XG4gICAgICBjbHVzdGVyOiBwcm9wcy5lY3NDbHVzdGVyLFxuICAgICAgdGFza0RlZmluaXRpb246IHRoaXMudGFza0RlZmluaXRpb24sXG4gICAgICBkZXNpcmVkQ291bnQ6IHByb3BzLmNvbmZpZy5lY3NUYXNrRGVzaXJlZENvdW50LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtwcm9wcy5lY3NTZWN1cml0eUdyb3VwXSxcbiAgICAgIGVuYWJsZUV4ZWN1dGVDb21tYW5kOiBwcm9wcy5lbmFibGVFeGVjdXRlLFxuICAgICAgYXNzaWduUHVibGljSXA6IGZhbHNlLFxuICAgICAgY2lyY3VpdEJyZWFrZXI6IHsgcm9sbGJhY2s6IHRydWUgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHRhcmdldCBncm91cHMgZm9yIExEQVAgYW5kIExEQVBTXG4gICAgY29uc3QgbGRhcFRhcmdldEdyb3VwID0gbmV3IGVsYnYyLk5ldHdvcmtUYXJnZXRHcm91cCh0aGlzLCAnTGRhcFRhcmdldEdyb3VwJywge1xuICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICB0YXJnZXRUeXBlOiBlbGJ2Mi5UYXJnZXRUeXBlLklQLFxuICAgICAgcG9ydDogMzg5LFxuICAgICAgcHJvdG9jb2w6IGVsYnYyLlByb3RvY29sLlRDUCxcbiAgICAgIGhlYWx0aENoZWNrOiB7XG4gICAgICAgIHBvcnQ6ICczODknLFxuICAgICAgICBwcm90b2NvbDogZWxidjIuUHJvdG9jb2wuVENQLFxuICAgICAgICBpbnRlcnZhbDogRHVyYXRpb24uc2Vjb25kcygzMClcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IGxkYXBzVGFyZ2V0R3JvdXAgPSBuZXcgZWxidjIuTmV0d29ya1RhcmdldEdyb3VwKHRoaXMsICdMZGFwc1RhcmdldEdyb3VwJywge1xuICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICB0YXJnZXRUeXBlOiBlbGJ2Mi5UYXJnZXRUeXBlLklQLFxuICAgICAgcG9ydDogNjM2LFxuICAgICAgcHJvdG9jb2w6IGVsYnYyLlByb3RvY29sLlRDUCxcbiAgICAgIGhlYWx0aENoZWNrOiB7XG4gICAgICAgIHBvcnQ6ICc2MzYnLFxuICAgICAgICBwcm90b2NvbDogZWxidjIuUHJvdG9jb2wuVENQLFxuICAgICAgICBpbnRlcnZhbDogRHVyYXRpb24uc2Vjb25kcygzMClcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIFJlZ2lzdGVyIHRhcmdldHNcbiAgICBsZGFwVGFyZ2V0R3JvdXAuYWRkVGFyZ2V0KHRoaXMuZWNzU2VydmljZSk7XG4gICAgbGRhcHNUYXJnZXRHcm91cC5hZGRUYXJnZXQodGhpcy5lY3NTZXJ2aWNlKTtcblxuICAgIC8vIEFkZCBkZWZhdWx0IGFjdGlvbnMgdG8gbGlzdGVuZXJzXG4gICAgbGRhcExpc3RlbmVyLmFkZEFjdGlvbignTGRhcEFjdGlvbicsIHtcbiAgICAgIGFjdGlvbjogZWxidjIuTmV0d29ya0xpc3RlbmVyQWN0aW9uLmZvcndhcmQoW2xkYXBUYXJnZXRHcm91cF0pXG4gICAgfSk7XG5cbiAgICBsZGFwc0xpc3RlbmVyLmFkZEFjdGlvbignTGRhcHNBY3Rpb24nLCB7XG4gICAgICBhY3Rpb246IGVsYnYyLk5ldHdvcmtMaXN0ZW5lckFjdGlvbi5mb3J3YXJkKFtsZGFwc1RhcmdldEdyb3VwXSlcbiAgICB9KTtcblxuICAgIC8vIFN0b3JlIHRoZSBETlMgbmFtZSBmb3Igb3V0cHV0XG4gICAgdGhpcy5kbnNOYW1lID0gdGhpcy5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZTtcblxuICAgIC8vIEV4cG9ydCBvdXRwdXRzXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnTG9hZEJhbGFuY2VyRG5zTmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmRuc05hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSBETlMgbmFtZSBvZiB0aGUgTERBUCBsb2FkIGJhbGFuY2VyJ1xuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnTGRhcEVuZHBvaW50Jywge1xuICAgICAgdmFsdWU6IGBsZGFwOi8vJHt0aGlzLmRuc05hbWV9OjM4OWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSBMREFQIGVuZHBvaW50IFVSTCdcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0xkYXBzRW5kcG9pbnQnLCB7XG4gICAgICB2YWx1ZTogYGxkYXBzOi8vJHt0aGlzLmRuc05hbWV9OjYzNmAsXG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSBMREFQUyBlbmRwb2ludCBVUkwnICBcbiAgICB9KTtcbiAgfVxufVxuIl19