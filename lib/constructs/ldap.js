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
            cpu: props.config.ecs.taskCpu,
            memoryLimitMiB: props.config.ecs.taskMemory,
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
            desiredCount: props.config.ecs.desiredCount,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGRhcC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImxkYXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUE7O0dBRUc7QUFDSCwyQ0FBdUM7QUFDdkMsNkNBVXFCO0FBMkRyQjs7R0FFRztBQUNILE1BQWEsSUFBSyxTQUFRLHNCQUFTO0lBcUJqQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQWdCO1FBQ3hELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsdUJBQXVCO1FBQ3ZCLE1BQU0sUUFBUSxHQUFHLElBQUksc0JBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRTtZQUMvQyxZQUFZLEVBQUUsRUFBRTtZQUNoQixTQUFTLEVBQUUsc0JBQUksQ0FBQyxhQUFhLENBQUMsUUFBUTtZQUN0QyxhQUFhLEVBQUUsMkJBQWEsQ0FBQyxPQUFPO1NBQ3JDLENBQUMsQ0FBQztRQUVILGdDQUFnQztRQUNoQyxNQUFNLGdCQUFnQixHQUFHLElBQUkscUJBQUcsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQ3ZFLEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRztZQUNkLFdBQVcsRUFBRSxpQ0FBaUM7WUFDOUMsZ0JBQWdCLEVBQUUsS0FBSztTQUN4QixDQUFDLENBQUM7UUFFSCxxQkFBcUI7UUFDckIsZ0JBQWdCLENBQUMsY0FBYyxDQUM3QixxQkFBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEVBQzNCLHFCQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFDakIsbUJBQW1CLENBQ3BCLENBQUM7UUFFRixnQkFBZ0IsQ0FBQyxjQUFjLENBQzdCLHFCQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsRUFDM0IscUJBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUNqQixvQkFBb0IsQ0FD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RUFBRTtZQUNyQyxNQUFNLEVBQUUsd0NBQUssQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1NBQ2hFLENBQUMsQ0FBQztRQUVILGdDQUFnQztRQUNoQyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsbUJBQW1CLENBQUM7UUFFckQsaUJBQWlCO1FBQ2pCLElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUscUJBQXFCLEVBQUU7WUFDekMsS0FBSyxFQUFFLElBQUksQ0FBQyxPQUFPO1lBQ25CLFdBQVcsRUFBRSx3Q0FBd0M7U0FDdEQsQ0FBQyxDQUFDO1FBRUgsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxjQUFjLEVBQUU7WUFDbEMsS0FBSyxFQUFFLFVBQVUsSUFBSSxDQUFDLE9BQU8sTUFBTTtZQUNuQyxXQUFXLEVBQUUsdUJBQXVCO1NBQ3JDLENBQUMsQ0FBQztRQUVILElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQ25DLEtBQUssRUFBRSxXQUFXLElBQUksQ0FBQyxPQUFPLE1BQU07WUFDcEMsV0FBVyxFQUFFLHdCQUF3QjtTQUN0QyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUEvTUQsb0JBK01DIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBMREFQIENvbnN0cnVjdCAtIENESyBpbXBsZW1lbnRhdGlvbiBvZiB0aGUgQXV0aGVudGlrIExEQVAgb3V0cG9zdFxuICovXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7XG4gIGF3c19lYzIgYXMgZWMyLFxuICBhd3NfZWNzIGFzIGVjcyxcbiAgYXdzX2VsYXN0aWNsb2FkYmFsYW5jaW5ndjIgYXMgZWxidjIsXG4gIGF3c19sb2dzIGFzIGxvZ3MsXG4gIGF3c19zZWNyZXRzbWFuYWdlciBhcyBzZWNyZXRzbWFuYWdlcixcbiAgYXdzX2lhbSBhcyBpYW0sXG4gIER1cmF0aW9uLFxuICBSZW1vdmFsUG9saWN5LFxuICBDZm5PdXRwdXRcbn0gZnJvbSAnYXdzLWNkay1saWInO1xuXG5pbXBvcnQgdHlwZSB7IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi4vZW52aXJvbm1lbnQtY29uZmlnJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciB0aGUgTERBUCBjb25zdHJ1Y3RcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBMZGFwUHJvcHMge1xuICAvKipcbiAgICogRW52aXJvbm1lbnQgbmFtZSAoZS5nLiAncHJvZCcsICdkZXYnLCBldGMuKVxuICAgKi9cbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcblxuICAvKipcbiAgICogRW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxuICAgKi9cbiAgY29uZmlnOiBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZztcblxuICAvKipcbiAgICogVlBDIGZvciBkZXBsb3ltZW50XG4gICAqL1xuICB2cGM6IGVjMi5JVnBjO1xuXG4gIC8qKlxuICAgKiBTZWN1cml0eSBncm91cCBmb3IgRUNTIHRhc2tzXG4gICAqL1xuICBlY3NTZWN1cml0eUdyb3VwOiBlYzIuU2VjdXJpdHlHcm91cDtcblxuICAvKipcbiAgICogRUNTIGNsdXN0ZXJcbiAgICovXG4gIGVjc0NsdXN0ZXI6IGVjcy5DbHVzdGVyO1xuXG4gIC8qKlxuICAgKiBTU0wgY2VydGlmaWNhdGUgQVJOIGZvciBMREFQU1xuICAgKi9cbiAgc3NsQ2VydGlmaWNhdGVBcm46IHN0cmluZztcblxuICAvKipcbiAgICogQXV0aGVudGlrIGhvc3QgVVJMXG4gICAqL1xuICBhdXRoZW50aWtIb3N0OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIERvY2tlciBpbWFnZSBsb2NhdGlvbiAoR2l0aHViIG9yIExvY2FsIEVDUilcbiAgICovXG4gIGRvY2tlckltYWdlTG9jYXRpb246ICdHaXRodWInIHwgJ0xvY2FsIEVDUic7XG5cbiAgLyoqXG4gICAqIEFsbG93IFNTSCBleGVjIGludG8gY29udGFpbmVyXG4gICAqL1xuICBlbmFibGVFeGVjdXRlOiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBMREFQIHRva2VuIHNlY3JldCBmcm9tIEF1dGhlbnRpa1xuICAgKi9cbiAgbGRhcFRva2VuOiBzZWNyZXRzbWFuYWdlci5JU2VjcmV0O1xufVxuXG4vKipcbiAqIENESyBjb25zdHJ1Y3QgZm9yIHRoZSBMREFQIG91dHBvc3Qgc2VydmljZVxuICovXG5leHBvcnQgY2xhc3MgTGRhcCBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBUaGUgbmV0d29yayBsb2FkIGJhbGFuY2VyIGZvciB0aGUgTERBUCBzZXJ2aWNlXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgbG9hZEJhbGFuY2VyOiBlbGJ2Mi5OZXR3b3JrTG9hZEJhbGFuY2VyO1xuXG4gIC8qKlxuICAgKiBUaGUgRUNTIHRhc2sgZGVmaW5pdGlvbiBmb3IgdGhlIExEQVAgc2VydmljZVxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IHRhc2tEZWZpbml0aW9uOiBlY3MuVGFza0RlZmluaXRpb247XG5cbiAgLyoqXG4gICAqIFRoZSBFQ1Mgc2VydmljZSBmb3IgTERBUFxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGVjc1NlcnZpY2U6IGVjcy5GYXJnYXRlU2VydmljZTtcblxuICAvKipcbiAgICogRE5TIG5hbWUgb2YgdGhlIGxvYWQgYmFsYW5jZXJcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBkbnNOYW1lOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IExkYXBQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIGxvZyBncm91cFxuICAgIGNvbnN0IGxvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0xvZ3MnLCB7XG4gICAgICBsb2dHcm91cE5hbWU6IGlkLFxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICByZW1vdmFsUG9saWN5OiBSZW1vdmFsUG9saWN5LkRFU1RST1lcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBzZWN1cml0eSBncm91cCBmb3IgTkxCXG4gICAgY29uc3QgbmxiU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnTkxCU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyAzODkgYW5kIDYzNiBBY2Nlc3MgdG8gTkxCJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IGZhbHNlXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBMREFQIHRyYWZmaWNcbiAgICBubGJTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuaXB2NCgnMTAuMC4wLjAvOCcpLFxuICAgICAgZWMyLlBvcnQudGNwKDM4OSksXG4gICAgICAnQWxsb3cgTERBUCBhY2Nlc3MnXG4gICAgKTtcblxuICAgIG5sYlNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5pcHY0KCcxMC4wLjAuMC84JyksXG4gICAgICBlYzIuUG9ydC50Y3AoNjM2KSxcbiAgICAgICdBbGxvdyBMREFQUyBhY2Nlc3MnXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBuZXR3b3JrIGxvYWQgYmFsYW5jZXJcbiAgICB0aGlzLmxvYWRCYWxhbmNlciA9IG5ldyBlbGJ2Mi5OZXR3b3JrTG9hZEJhbGFuY2VyKHRoaXMsICdOTEInLCB7XG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgIGludGVybmV0RmFjaW5nOiBmYWxzZSxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTU1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIGxpc3RlbmVycyBmb3IgTERBUCBhbmQgTERBUFNcbiAgICBjb25zdCBsZGFwTGlzdGVuZXIgPSB0aGlzLmxvYWRCYWxhbmNlci5hZGRMaXN0ZW5lcignTGRhcExpc3RlbmVyJywge1xuICAgICAgcG9ydDogMzg5LFxuICAgICAgcHJvdG9jb2w6IGVsYnYyLlByb3RvY29sLlRDUFxuICAgIH0pO1xuXG4gICAgY29uc3QgbGRhcHNMaXN0ZW5lciA9IHRoaXMubG9hZEJhbGFuY2VyLmFkZExpc3RlbmVyKCdMZGFwc0xpc3RlbmVyJywge1xuICAgICAgcG9ydDogNjM2LFxuICAgICAgcHJvdG9jb2w6IGVsYnYyLlByb3RvY29sLlRMUyxcbiAgICAgIGNlcnRpZmljYXRlczogW3sgY2VydGlmaWNhdGVBcm46IHByb3BzLnNzbENlcnRpZmljYXRlQXJuIH1dXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgdGFzayBleGVjdXRpb24gcm9sZVxuICAgIGNvbnN0IGV4ZWN1dGlvblJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1Rhc2tFeGVjdXRpb25Sb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2Vjcy10YXNrcy5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQW1hem9uRUNTVGFza0V4ZWN1dGlvblJvbGVQb2xpY3knKVxuICAgICAgXVxuICAgIH0pO1xuXG4gICAgLy8gQWRkIHBlcm1pc3Npb25zIHRvIGFjY2VzcyBzZWNyZXRzXG4gICAgcHJvcHMubGRhcFRva2VuLmdyYW50UmVhZChleGVjdXRpb25Sb2xlKTtcblxuICAgIC8vIENyZWF0ZSB0YXNrIHJvbGVcbiAgICBjb25zdCB0YXNrUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnVGFza1JvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnZWNzLXRhc2tzLmFtYXpvbmF3cy5jb20nKSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSB0YXNrIGRlZmluaXRpb25cbiAgICB0aGlzLnRhc2tEZWZpbml0aW9uID0gbmV3IGVjcy5GYXJnYXRlVGFza0RlZmluaXRpb24odGhpcywgJ1Rhc2tEZWYnLCB7XG4gICAgICBjcHU6IHByb3BzLmNvbmZpZy5lY3MudGFza0NwdSxcbiAgICAgIG1lbW9yeUxpbWl0TWlCOiBwcm9wcy5jb25maWcuZWNzLnRhc2tNZW1vcnksXG4gICAgICBleGVjdXRpb25Sb2xlLFxuICAgICAgdGFza1JvbGVcbiAgICB9KTtcblxuICAgIC8vIERldGVybWluZSBEb2NrZXIgaW1hZ2VcbiAgICBjb25zdCBkb2NrZXJJbWFnZSA9IHByb3BzLmRvY2tlckltYWdlTG9jYXRpb24gPT09ICdHaXRodWInIFxuICAgICAgPyAnZ2hjci5pby90YWstbnovYXV0aGVudGlrLWxkYXA6bGF0ZXN0J1xuICAgICAgOiAncGxhY2Vob2xkZXItZm9yLWxvY2FsLWVjcic7IC8vIFJlcGxhY2Ugd2l0aCBhY3R1YWwgRUNSIFVSTCBpbiBwcm9kdWN0aW9uXG5cbiAgICAvLyBDcmVhdGUgY29udGFpbmVyIGRlZmluaXRpb25cbiAgICBjb25zdCBjb250YWluZXIgPSB0aGlzLnRhc2tEZWZpbml0aW9uLmFkZENvbnRhaW5lcignQXV0aGVudGlrTGRhcCcsIHtcbiAgICAgIGltYWdlOiBlY3MuQ29udGFpbmVySW1hZ2UuZnJvbVJlZ2lzdHJ5KGRvY2tlckltYWdlKSxcbiAgICAgIGxvZ2dpbmc6IGVjcy5Mb2dEcml2ZXJzLmF3c0xvZ3Moe1xuICAgICAgICBzdHJlYW1QcmVmaXg6ICdhdXRoZW50aWstbGRhcCcsXG4gICAgICAgIGxvZ0dyb3VwXG4gICAgICB9KSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEFVVEhFTlRJS19IT1NUOiBwcm9wcy5hdXRoZW50aWtIb3N0LFxuICAgICAgICBBVVRIRU5USUtfSU5TRUNVUkU6ICdmYWxzZSdcbiAgICAgIH0sXG4gICAgICBzZWNyZXRzOiB7XG4gICAgICAgIEFVVEhFTlRJS19UT0tFTjogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIocHJvcHMubGRhcFRva2VuKVxuICAgICAgfSxcbiAgICAgIGhlYWx0aENoZWNrOiB7XG4gICAgICAgIGNvbW1hbmQ6IFsnQ01ELVNIRUxMJywgJ25ldHN0YXQgLWFuIHwgZ3JlcCBcIjozODkgXCIgfHwgZXhpdCAxJ10sXG4gICAgICAgIGludGVydmFsOiBEdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcyg1KSxcbiAgICAgICAgcmV0cmllczogMyxcbiAgICAgICAgc3RhcnRQZXJpb2Q6IER1cmF0aW9uLnNlY29uZHMoNjApXG4gICAgICB9LFxuICAgICAgZXNzZW50aWFsOiB0cnVlXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgcG9ydCBtYXBwaW5nc1xuICAgIGNvbnRhaW5lci5hZGRQb3J0TWFwcGluZ3MoXG4gICAgICB7XG4gICAgICAgIGNvbnRhaW5lclBvcnQ6IDM4OSxcbiAgICAgICAgaG9zdFBvcnQ6IDM4OSxcbiAgICAgICAgcHJvdG9jb2w6IGVjcy5Qcm90b2NvbC5UQ1BcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIGNvbnRhaW5lclBvcnQ6IDYzNixcbiAgICAgICAgaG9zdFBvcnQ6IDYzNixcbiAgICAgICAgcHJvdG9jb2w6IGVjcy5Qcm90b2NvbC5UQ1BcbiAgICAgIH1cbiAgICApO1xuXG4gICAgLy8gQ3JlYXRlIEVDUyBzZXJ2aWNlXG4gICAgdGhpcy5lY3NTZXJ2aWNlID0gbmV3IGVjcy5GYXJnYXRlU2VydmljZSh0aGlzLCAnU2VydmljZScsIHtcbiAgICAgIGNsdXN0ZXI6IHByb3BzLmVjc0NsdXN0ZXIsXG4gICAgICB0YXNrRGVmaW5pdGlvbjogdGhpcy50YXNrRGVmaW5pdGlvbixcbiAgICAgIGRlc2lyZWRDb3VudDogcHJvcHMuY29uZmlnLmVjcy5kZXNpcmVkQ291bnQsXG4gICAgICBzZWN1cml0eUdyb3VwczogW3Byb3BzLmVjc1NlY3VyaXR5R3JvdXBdLFxuICAgICAgZW5hYmxlRXhlY3V0ZUNvbW1hbmQ6IHByb3BzLmVuYWJsZUV4ZWN1dGUsXG4gICAgICBhc3NpZ25QdWJsaWNJcDogZmFsc2UsXG4gICAgICBjaXJjdWl0QnJlYWtlcjogeyByb2xsYmFjazogdHJ1ZSB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgdGFyZ2V0IGdyb3VwcyBmb3IgTERBUCBhbmQgTERBUFNcbiAgICBjb25zdCBsZGFwVGFyZ2V0R3JvdXAgPSBuZXcgZWxidjIuTmV0d29ya1RhcmdldEdyb3VwKHRoaXMsICdMZGFwVGFyZ2V0R3JvdXAnLCB7XG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgIHRhcmdldFR5cGU6IGVsYnYyLlRhcmdldFR5cGUuSVAsXG4gICAgICBwb3J0OiAzODksXG4gICAgICBwcm90b2NvbDogZWxidjIuUHJvdG9jb2wuVENQLFxuICAgICAgaGVhbHRoQ2hlY2s6IHtcbiAgICAgICAgcG9ydDogJzM4OScsXG4gICAgICAgIHByb3RvY29sOiBlbGJ2Mi5Qcm90b2NvbC5UQ1AsXG4gICAgICAgIGludGVydmFsOiBEdXJhdGlvbi5zZWNvbmRzKDMwKVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29uc3QgbGRhcHNUYXJnZXRHcm91cCA9IG5ldyBlbGJ2Mi5OZXR3b3JrVGFyZ2V0R3JvdXAodGhpcywgJ0xkYXBzVGFyZ2V0R3JvdXAnLCB7XG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgIHRhcmdldFR5cGU6IGVsYnYyLlRhcmdldFR5cGUuSVAsXG4gICAgICBwb3J0OiA2MzYsXG4gICAgICBwcm90b2NvbDogZWxidjIuUHJvdG9jb2wuVENQLFxuICAgICAgaGVhbHRoQ2hlY2s6IHtcbiAgICAgICAgcG9ydDogJzYzNicsXG4gICAgICAgIHByb3RvY29sOiBlbGJ2Mi5Qcm90b2NvbC5UQ1AsXG4gICAgICAgIGludGVydmFsOiBEdXJhdGlvbi5zZWNvbmRzKDMwKVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gUmVnaXN0ZXIgdGFyZ2V0c1xuICAgIGxkYXBUYXJnZXRHcm91cC5hZGRUYXJnZXQodGhpcy5lY3NTZXJ2aWNlKTtcbiAgICBsZGFwc1RhcmdldEdyb3VwLmFkZFRhcmdldCh0aGlzLmVjc1NlcnZpY2UpO1xuXG4gICAgLy8gQWRkIGRlZmF1bHQgYWN0aW9ucyB0byBsaXN0ZW5lcnNcbiAgICBsZGFwTGlzdGVuZXIuYWRkQWN0aW9uKCdMZGFwQWN0aW9uJywge1xuICAgICAgYWN0aW9uOiBlbGJ2Mi5OZXR3b3JrTGlzdGVuZXJBY3Rpb24uZm9yd2FyZChbbGRhcFRhcmdldEdyb3VwXSlcbiAgICB9KTtcblxuICAgIGxkYXBzTGlzdGVuZXIuYWRkQWN0aW9uKCdMZGFwc0FjdGlvbicsIHtcbiAgICAgIGFjdGlvbjogZWxidjIuTmV0d29ya0xpc3RlbmVyQWN0aW9uLmZvcndhcmQoW2xkYXBzVGFyZ2V0R3JvdXBdKVxuICAgIH0pO1xuXG4gICAgLy8gU3RvcmUgdGhlIEROUyBuYW1lIGZvciBvdXRwdXRcbiAgICB0aGlzLmRuc05hbWUgPSB0aGlzLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lO1xuXG4gICAgLy8gRXhwb3J0IG91dHB1dHNcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdMb2FkQmFsYW5jZXJEbnNOYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMuZG5zTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIEROUyBuYW1lIG9mIHRoZSBMREFQIGxvYWQgYmFsYW5jZXInXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdMZGFwRW5kcG9pbnQnLCB7XG4gICAgICB2YWx1ZTogYGxkYXA6Ly8ke3RoaXMuZG5zTmFtZX06Mzg5YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIExEQVAgZW5kcG9pbnQgVVJMJ1xuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnTGRhcHNFbmRwb2ludCcsIHtcbiAgICAgIHZhbHVlOiBgbGRhcHM6Ly8ke3RoaXMuZG5zTmFtZX06NjM2YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIExEQVBTIGVuZHBvaW50IFVSTCcgIFxuICAgIH0pO1xuICB9XG59XG4iXX0=