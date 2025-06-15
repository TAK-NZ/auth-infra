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
        // Determine Docker image - Always use ECR
        const dockerImage = props.ecrRepositoryArn
            ? `${props.ecrRepositoryArn}:latest`
            : 'placeholder-for-local-ecr'; // Fallback for backwards compatibility
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGRhcC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImxkYXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUE7O0dBRUc7QUFDSCwyQ0FBdUM7QUFDdkMsNkNBV3FCO0FBZ0VyQjs7R0FFRztBQUNILE1BQWEsSUFBSyxTQUFRLHNCQUFTO0lBcUJqQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQWdCO1FBQ3hELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsdUJBQXVCO1FBQ3ZCLE1BQU0sUUFBUSxHQUFHLElBQUksc0JBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRTtZQUMvQyxZQUFZLEVBQUUsRUFBRTtZQUNoQixTQUFTLEVBQUUsc0JBQUksQ0FBQyxhQUFhLENBQUMsUUFBUTtZQUN0QyxhQUFhLEVBQUUsMkJBQWEsQ0FBQyxPQUFPO1NBQ3JDLENBQUMsQ0FBQztRQUVILGdDQUFnQztRQUNoQyxNQUFNLGdCQUFnQixHQUFHLElBQUkscUJBQUcsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQ3ZFLEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRztZQUNkLFdBQVcsRUFBRSxpQ0FBaUM7WUFDOUMsZ0JBQWdCLEVBQUUsS0FBSztTQUN4QixDQUFDLENBQUM7UUFFSCxxQkFBcUI7UUFDckIsZ0JBQWdCLENBQUMsY0FBYyxDQUM3QixxQkFBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEVBQzNCLHFCQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFDakIsbUJBQW1CLENBQ3BCLENBQUM7UUFFRixnQkFBZ0IsQ0FBQyxjQUFjLENBQzdCLHFCQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsRUFDM0IscUJBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUNqQixvQkFBb0IsQ0FDckIsQ0FBQztRQUVGLCtCQUErQjtRQUMvQixJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksd0NBQUssQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFO1lBQzdELEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRztZQUNkLGNBQWMsRUFBRSxLQUFLO1lBQ3JCLFVBQVUsRUFBRTtnQkFDVixVQUFVLEVBQUUscUJBQUcsQ0FBQyxVQUFVLENBQUMsbUJBQW1CO2FBQy9DO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsc0NBQXNDO1FBQ3RDLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLGNBQWMsRUFBRTtZQUNqRSxJQUFJLEVBQUUsR0FBRztZQUNULFFBQVEsRUFBRSx3Q0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHO1NBQzdCLENBQUMsQ0FBQztRQUVILE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLGVBQWUsRUFBRTtZQUNuRSxJQUFJLEVBQUUsR0FBRztZQUNULFFBQVEsRUFBRSx3Q0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHO1lBQzVCLFlBQVksRUFBRSxDQUFDLEVBQUUsY0FBYyxFQUFFLEtBQUssQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1NBQzVELENBQUMsQ0FBQztRQUVILDZCQUE2QjtRQUM3QixNQUFNLGFBQWEsR0FBRyxJQUFJLHFCQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUM1RCxTQUFTLEVBQUUsSUFBSSxxQkFBRyxDQUFDLGdCQUFnQixDQUFDLHlCQUF5QixDQUFDO1lBQzlELGVBQWUsRUFBRTtnQkFDZixxQkFBRyxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQywrQ0FBK0MsQ0FBQzthQUM1RjtTQUNGLENBQUMsQ0FBQztRQUVILG9DQUFvQztRQUNwQyxLQUFLLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUV6QyxtQkFBbUI7UUFDbkIsTUFBTSxRQUFRLEdBQUcsSUFBSSxxQkFBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFO1lBQzlDLFNBQVMsRUFBRSxJQUFJLHFCQUFHLENBQUMsZ0JBQWdCLENBQUMseUJBQXlCLENBQUM7U0FDL0QsQ0FBQyxDQUFDO1FBRUgseUJBQXlCO1FBQ3pCLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxxQkFBRyxDQUFDLHFCQUFxQixDQUFDLElBQUksRUFBRSxTQUFTLEVBQUU7WUFDbkUsR0FBRyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLE9BQU87WUFDN0IsY0FBYyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFVBQVU7WUFDM0MsYUFBYTtZQUNiLFFBQVE7U0FDVCxDQUFDLENBQUM7UUFFSCwwQ0FBMEM7UUFDMUMsTUFBTSxXQUFXLEdBQUcsS0FBSyxDQUFDLGdCQUFnQjtZQUN4QyxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUMsZ0JBQWdCLFNBQVM7WUFDcEMsQ0FBQyxDQUFDLDJCQUEyQixDQUFDLENBQUMsdUNBQXVDO1FBRXhFLDhCQUE4QjtRQUM5QixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLFlBQVksQ0FBQyxlQUFlLEVBQUU7WUFDbEUsS0FBSyxFQUFFLHFCQUFHLENBQUMsY0FBYyxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUM7WUFDbkQsT0FBTyxFQUFFLHFCQUFHLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQztnQkFDOUIsWUFBWSxFQUFFLGdCQUFnQjtnQkFDOUIsUUFBUTthQUNULENBQUM7WUFDRixXQUFXLEVBQUU7Z0JBQ1gsY0FBYyxFQUFFLEtBQUssQ0FBQyxhQUFhO2dCQUNuQyxrQkFBa0IsRUFBRSxPQUFPO2FBQzVCO1lBQ0QsT0FBTyxFQUFFO2dCQUNQLGVBQWUsRUFBRSxxQkFBRyxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDO2FBQ2hFO1lBQ0QsV0FBVyxFQUFFO2dCQUNYLE9BQU8sRUFBRSxDQUFDLFdBQVcsRUFBRSxzQ0FBc0MsQ0FBQztnQkFDOUQsUUFBUSxFQUFFLHNCQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztnQkFDOUIsT0FBTyxFQUFFLHNCQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztnQkFDNUIsT0FBTyxFQUFFLENBQUM7Z0JBQ1YsV0FBVyxFQUFFLHNCQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQzthQUNsQztZQUNELFNBQVMsRUFBRSxJQUFJO1NBQ2hCLENBQUMsQ0FBQztRQUVILG9CQUFvQjtRQUNwQixTQUFTLENBQUMsZUFBZSxDQUN2QjtZQUNFLGFBQWEsRUFBRSxHQUFHO1lBQ2xCLFFBQVEsRUFBRSxHQUFHO1lBQ2IsUUFBUSxFQUFFLHFCQUFHLENBQUMsUUFBUSxDQUFDLEdBQUc7U0FDM0IsRUFDRDtZQUNFLGFBQWEsRUFBRSxHQUFHO1lBQ2xCLFFBQVEsRUFBRSxHQUFHO1lBQ2IsUUFBUSxFQUFFLHFCQUFHLENBQUMsUUFBUSxDQUFDLEdBQUc7U0FDM0IsQ0FDRixDQUFDO1FBRUYscUJBQXFCO1FBQ3JCLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxxQkFBRyxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFO1lBQ3hELE9BQU8sRUFBRSxLQUFLLENBQUMsVUFBVTtZQUN6QixjQUFjLEVBQUUsSUFBSSxDQUFDLGNBQWM7WUFDbkMsWUFBWSxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFlBQVk7WUFDM0MsY0FBYyxFQUFFLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDO1lBQ3hDLG9CQUFvQixFQUFFLEtBQUssQ0FBQyxhQUFhO1lBQ3pDLGNBQWMsRUFBRSxLQUFLO1lBQ3JCLGNBQWMsRUFBRSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUU7U0FDbkMsQ0FBQyxDQUFDO1FBRUgsMENBQTBDO1FBQzFDLE1BQU0sZUFBZSxHQUFHLElBQUksd0NBQUssQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7WUFDNUUsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHO1lBQ2QsVUFBVSxFQUFFLHdDQUFLLENBQUMsVUFBVSxDQUFDLEVBQUU7WUFDL0IsSUFBSSxFQUFFLEdBQUc7WUFDVCxRQUFRLEVBQUUsd0NBQUssQ0FBQyxRQUFRLENBQUMsR0FBRztZQUM1QixXQUFXLEVBQUU7Z0JBQ1gsSUFBSSxFQUFFLEtBQUs7Z0JBQ1gsUUFBUSxFQUFFLHdDQUFLLENBQUMsUUFBUSxDQUFDLEdBQUc7Z0JBQzVCLFFBQVEsRUFBRSxzQkFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7YUFDL0I7U0FDRixDQUFDLENBQUM7UUFFSCxNQUFNLGdCQUFnQixHQUFHLElBQUksd0NBQUssQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDOUUsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHO1lBQ2QsVUFBVSxFQUFFLHdDQUFLLENBQUMsVUFBVSxDQUFDLEVBQUU7WUFDL0IsSUFBSSxFQUFFLEdBQUc7WUFDVCxRQUFRLEVBQUUsd0NBQUssQ0FBQyxRQUFRLENBQUMsR0FBRztZQUM1QixXQUFXLEVBQUU7Z0JBQ1gsSUFBSSxFQUFFLEtBQUs7Z0JBQ1gsUUFBUSxFQUFFLHdDQUFLLENBQUMsUUFBUSxDQUFDLEdBQUc7Z0JBQzVCLFFBQVEsRUFBRSxzQkFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7YUFDL0I7U0FDRixDQUFDLENBQUM7UUFFSCxtQkFBbUI7UUFDbkIsZUFBZSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDM0MsZ0JBQWdCLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUU1QyxtQ0FBbUM7UUFDbkMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxZQUFZLEVBQUU7WUFDbkMsTUFBTSxFQUFFLHdDQUFLLENBQUMscUJBQXFCLENBQUMsT0FBTyxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUM7U0FDL0QsQ0FBQyxDQUFDO1FBRUgsYUFBYSxDQUFDLFNBQVMsQ0FBQyxhQUFhLEVBQUU7WUFDckMsTUFBTSxFQUFFLHdDQUFLLENBQUMscUJBQXFCLENBQUMsT0FBTyxDQUFDLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztTQUNoRSxDQUFDLENBQUM7UUFFSCxnQ0FBZ0M7UUFDaEMsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLG1CQUFtQixDQUFDO1FBRXJELGlCQUFpQjtRQUNqQixJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLHFCQUFxQixFQUFFO1lBQ3pDLEtBQUssRUFBRSxJQUFJLENBQUMsT0FBTztZQUNuQixXQUFXLEVBQUUsd0NBQXdDO1NBQ3RELENBQUMsQ0FBQztRQUVILElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQ2xDLEtBQUssRUFBRSxVQUFVLElBQUksQ0FBQyxPQUFPLE1BQU07WUFDbkMsV0FBVyxFQUFFLHVCQUF1QjtTQUNyQyxDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUNuQyxLQUFLLEVBQUUsV0FBVyxJQUFJLENBQUMsT0FBTyxNQUFNO1lBQ3BDLFdBQVcsRUFBRSx3QkFBd0I7U0FDdEMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBL01ELG9CQStNQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogTERBUCBDb25zdHJ1Y3QgLSBDREsgaW1wbGVtZW50YXRpb24gb2YgdGhlIEF1dGhlbnRpayBMREFQIG91dHBvc3RcbiAqL1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQge1xuICBhd3NfZWMyIGFzIGVjMixcbiAgYXdzX2VjcyBhcyBlY3MsXG4gIGF3c19lbGFzdGljbG9hZGJhbGFuY2luZ3YyIGFzIGVsYnYyLFxuICBhd3NfbG9ncyBhcyBsb2dzLFxuICBhd3Nfc2VjcmV0c21hbmFnZXIgYXMgc2VjcmV0c21hbmFnZXIsXG4gIGF3c19zMyBhcyBzMyxcbiAgYXdzX2lhbSBhcyBpYW0sXG4gIER1cmF0aW9uLFxuICBSZW1vdmFsUG9saWN5LFxuICBDZm5PdXRwdXRcbn0gZnJvbSAnYXdzLWNkay1saWInO1xuXG5pbXBvcnQgdHlwZSB7IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi4vZW52aXJvbm1lbnQtY29uZmlnJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciB0aGUgTERBUCBjb25zdHJ1Y3RcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBMZGFwUHJvcHMge1xuICAvKipcbiAgICogRW52aXJvbm1lbnQgbmFtZSAoZS5nLiAncHJvZCcsICdkZXYnLCBldGMuKVxuICAgKi9cbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcblxuICAvKipcbiAgICogRW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxuICAgKi9cbiAgY29uZmlnOiBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZztcblxuICAvKipcbiAgICogVlBDIGZvciBkZXBsb3ltZW50XG4gICAqL1xuICB2cGM6IGVjMi5JVnBjO1xuXG4gIC8qKlxuICAgKiBTZWN1cml0eSBncm91cCBmb3IgRUNTIHRhc2tzXG4gICAqL1xuICBlY3NTZWN1cml0eUdyb3VwOiBlYzIuU2VjdXJpdHlHcm91cDtcblxuICAvKipcbiAgICogRUNTIGNsdXN0ZXJcbiAgICovXG4gIGVjc0NsdXN0ZXI6IGVjcy5JQ2x1c3RlcjtcblxuICAvKipcbiAgICogUzMgY29uZmlndXJhdGlvbiBidWNrZXQgZm9yIGVudmlyb25tZW50IGZpbGVzXG4gICAqL1xuICBzM0NvbmZCdWNrZXQ6IHMzLklCdWNrZXQ7XG5cbiAgLyoqXG4gICAqIFNTTCBjZXJ0aWZpY2F0ZSBBUk4gZm9yIExEQVBTXG4gICAqL1xuICBzc2xDZXJ0aWZpY2F0ZUFybjogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBBdXRoZW50aWsgaG9zdCBVUkxcbiAgICovXG4gIGF1dGhlbnRpa0hvc3Q6IHN0cmluZztcblxuICAvKipcbiAgICogRUNSIHJlcG9zaXRvcnkgQVJOIGZvciBFQ1IgaW1hZ2VzXG4gICAqL1xuICBlY3JSZXBvc2l0b3J5QXJuPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBBbGxvdyBTU0ggZXhlYyBpbnRvIGNvbnRhaW5lclxuICAgKi9cbiAgZW5hYmxlRXhlY3V0ZTogYm9vbGVhbjtcblxuICAvKipcbiAgICogTERBUCB0b2tlbiBzZWNyZXQgZnJvbSBBdXRoZW50aWtcbiAgICovXG4gIGxkYXBUb2tlbjogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcbn1cblxuLyoqXG4gKiBDREsgY29uc3RydWN0IGZvciB0aGUgTERBUCBvdXRwb3N0IHNlcnZpY2VcbiAqL1xuZXhwb3J0IGNsYXNzIExkYXAgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICAvKipcbiAgICogVGhlIG5ldHdvcmsgbG9hZCBiYWxhbmNlciBmb3IgdGhlIExEQVAgc2VydmljZVxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGxvYWRCYWxhbmNlcjogZWxidjIuTmV0d29ya0xvYWRCYWxhbmNlcjtcblxuICAvKipcbiAgICogVGhlIEVDUyB0YXNrIGRlZmluaXRpb24gZm9yIHRoZSBMREFQIHNlcnZpY2VcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSB0YXNrRGVmaW5pdGlvbjogZWNzLlRhc2tEZWZpbml0aW9uO1xuXG4gIC8qKlxuICAgKiBUaGUgRUNTIHNlcnZpY2UgZm9yIExEQVBcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBlY3NTZXJ2aWNlOiBlY3MuRmFyZ2F0ZVNlcnZpY2U7XG5cbiAgLyoqXG4gICAqIEROUyBuYW1lIG9mIHRoZSBsb2FkIGJhbGFuY2VyXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgZG5zTmFtZTogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBMZGFwUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBsb2cgZ3JvdXBcbiAgICBjb25zdCBsb2dHcm91cCA9IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdMb2dzJywge1xuICAgICAgbG9nR3JvdXBOYW1lOiBpZCxcbiAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgcmVtb3ZhbFBvbGljeTogUmVtb3ZhbFBvbGljeS5ERVNUUk9ZXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgc2VjdXJpdHkgZ3JvdXAgZm9yIE5MQlxuICAgIGNvbnN0IG5sYlNlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ05MQlNlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgMzg5IGFuZCA2MzYgQWNjZXNzIHRvIE5MQicsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiBmYWxzZVxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgTERBUCB0cmFmZmljXG4gICAgbmxiU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmlwdjQoJzEwLjAuMC4wLzgnKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCgzODkpLFxuICAgICAgJ0FsbG93IExEQVAgYWNjZXNzJ1xuICAgICk7XG5cbiAgICBubGJTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuaXB2NCgnMTAuMC4wLjAvOCcpLFxuICAgICAgZWMyLlBvcnQudGNwKDYzNiksXG4gICAgICAnQWxsb3cgTERBUFMgYWNjZXNzJ1xuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgbmV0d29yayBsb2FkIGJhbGFuY2VyXG4gICAgdGhpcy5sb2FkQmFsYW5jZXIgPSBuZXcgZWxidjIuTmV0d29ya0xvYWRCYWxhbmNlcih0aGlzLCAnTkxCJywge1xuICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICBpbnRlcm5ldEZhY2luZzogZmFsc2UsXG4gICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1NcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBsaXN0ZW5lcnMgZm9yIExEQVAgYW5kIExEQVBTXG4gICAgY29uc3QgbGRhcExpc3RlbmVyID0gdGhpcy5sb2FkQmFsYW5jZXIuYWRkTGlzdGVuZXIoJ0xkYXBMaXN0ZW5lcicsIHtcbiAgICAgIHBvcnQ6IDM4OSxcbiAgICAgIHByb3RvY29sOiBlbGJ2Mi5Qcm90b2NvbC5UQ1BcbiAgICB9KTtcblxuICAgIGNvbnN0IGxkYXBzTGlzdGVuZXIgPSB0aGlzLmxvYWRCYWxhbmNlci5hZGRMaXN0ZW5lcignTGRhcHNMaXN0ZW5lcicsIHtcbiAgICAgIHBvcnQ6IDYzNixcbiAgICAgIHByb3RvY29sOiBlbGJ2Mi5Qcm90b2NvbC5UTFMsXG4gICAgICBjZXJ0aWZpY2F0ZXM6IFt7IGNlcnRpZmljYXRlQXJuOiBwcm9wcy5zc2xDZXJ0aWZpY2F0ZUFybiB9XVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHRhc2sgZXhlY3V0aW9uIHJvbGVcbiAgICBjb25zdCBleGVjdXRpb25Sb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdUYXNrRXhlY3V0aW9uUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlY3MtdGFza3MuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FtYXpvbkVDU1Rhc2tFeGVjdXRpb25Sb2xlUG9saWN5JylcbiAgICAgIF1cbiAgICB9KTtcblxuICAgIC8vIEFkZCBwZXJtaXNzaW9ucyB0byBhY2Nlc3Mgc2VjcmV0c1xuICAgIHByb3BzLmxkYXBUb2tlbi5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG5cbiAgICAvLyBDcmVhdGUgdGFzayByb2xlXG4gICAgY29uc3QgdGFza1JvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1Rhc2tSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2Vjcy10YXNrcy5hbWF6b25hd3MuY29tJyksXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgdGFzayBkZWZpbml0aW9uXG4gICAgdGhpcy50YXNrRGVmaW5pdGlvbiA9IG5ldyBlY3MuRmFyZ2F0ZVRhc2tEZWZpbml0aW9uKHRoaXMsICdUYXNrRGVmJywge1xuICAgICAgY3B1OiBwcm9wcy5jb25maWcuZWNzLnRhc2tDcHUsXG4gICAgICBtZW1vcnlMaW1pdE1pQjogcHJvcHMuY29uZmlnLmVjcy50YXNrTWVtb3J5LFxuICAgICAgZXhlY3V0aW9uUm9sZSxcbiAgICAgIHRhc2tSb2xlXG4gICAgfSk7XG5cbiAgICAvLyBEZXRlcm1pbmUgRG9ja2VyIGltYWdlIC0gQWx3YXlzIHVzZSBFQ1JcbiAgICBjb25zdCBkb2NrZXJJbWFnZSA9IHByb3BzLmVjclJlcG9zaXRvcnlBcm4gXG4gICAgICA/IGAke3Byb3BzLmVjclJlcG9zaXRvcnlBcm59OmxhdGVzdGBcbiAgICAgIDogJ3BsYWNlaG9sZGVyLWZvci1sb2NhbC1lY3InOyAvLyBGYWxsYmFjayBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHlcblxuICAgIC8vIENyZWF0ZSBjb250YWluZXIgZGVmaW5pdGlvblxuICAgIGNvbnN0IGNvbnRhaW5lciA9IHRoaXMudGFza0RlZmluaXRpb24uYWRkQ29udGFpbmVyKCdBdXRoZW50aWtMZGFwJywge1xuICAgICAgaW1hZ2U6IGVjcy5Db250YWluZXJJbWFnZS5mcm9tUmVnaXN0cnkoZG9ja2VySW1hZ2UpLFxuICAgICAgbG9nZ2luZzogZWNzLkxvZ0RyaXZlcnMuYXdzTG9ncyh7XG4gICAgICAgIHN0cmVhbVByZWZpeDogJ2F1dGhlbnRpay1sZGFwJyxcbiAgICAgICAgbG9nR3JvdXBcbiAgICAgIH0pLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgQVVUSEVOVElLX0hPU1Q6IHByb3BzLmF1dGhlbnRpa0hvc3QsXG4gICAgICAgIEFVVEhFTlRJS19JTlNFQ1VSRTogJ2ZhbHNlJ1xuICAgICAgfSxcbiAgICAgIHNlY3JldHM6IHtcbiAgICAgICAgQVVUSEVOVElLX1RPS0VOOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihwcm9wcy5sZGFwVG9rZW4pXG4gICAgICB9LFxuICAgICAgaGVhbHRoQ2hlY2s6IHtcbiAgICAgICAgY29tbWFuZDogWydDTUQtU0hFTEwnLCAnbmV0c3RhdCAtYW4gfCBncmVwIFwiOjM4OSBcIiB8fCBleGl0IDEnXSxcbiAgICAgICAgaW50ZXJ2YWw6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDUpLFxuICAgICAgICByZXRyaWVzOiAzLFxuICAgICAgICBzdGFydFBlcmlvZDogRHVyYXRpb24uc2Vjb25kcyg2MClcbiAgICAgIH0sXG4gICAgICBlc3NlbnRpYWw6IHRydWVcbiAgICB9KTtcblxuICAgIC8vIEFkZCBwb3J0IG1hcHBpbmdzXG4gICAgY29udGFpbmVyLmFkZFBvcnRNYXBwaW5ncyhcbiAgICAgIHtcbiAgICAgICAgY29udGFpbmVyUG9ydDogMzg5LFxuICAgICAgICBob3N0UG9ydDogMzg5LFxuICAgICAgICBwcm90b2NvbDogZWNzLlByb3RvY29sLlRDUFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgY29udGFpbmVyUG9ydDogNjM2LFxuICAgICAgICBob3N0UG9ydDogNjM2LFxuICAgICAgICBwcm90b2NvbDogZWNzLlByb3RvY29sLlRDUFxuICAgICAgfVxuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgRUNTIHNlcnZpY2VcbiAgICB0aGlzLmVjc1NlcnZpY2UgPSBuZXcgZWNzLkZhcmdhdGVTZXJ2aWNlKHRoaXMsICdTZXJ2aWNlJywge1xuICAgICAgY2x1c3RlcjogcHJvcHMuZWNzQ2x1c3RlcixcbiAgICAgIHRhc2tEZWZpbml0aW9uOiB0aGlzLnRhc2tEZWZpbml0aW9uLFxuICAgICAgZGVzaXJlZENvdW50OiBwcm9wcy5jb25maWcuZWNzLmRlc2lyZWRDb3VudCxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbcHJvcHMuZWNzU2VjdXJpdHlHcm91cF0sXG4gICAgICBlbmFibGVFeGVjdXRlQ29tbWFuZDogcHJvcHMuZW5hYmxlRXhlY3V0ZSxcbiAgICAgIGFzc2lnblB1YmxpY0lwOiBmYWxzZSxcbiAgICAgIGNpcmN1aXRCcmVha2VyOiB7IHJvbGxiYWNrOiB0cnVlIH1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSB0YXJnZXQgZ3JvdXBzIGZvciBMREFQIGFuZCBMREFQU1xuICAgIGNvbnN0IGxkYXBUYXJnZXRHcm91cCA9IG5ldyBlbGJ2Mi5OZXR3b3JrVGFyZ2V0R3JvdXAodGhpcywgJ0xkYXBUYXJnZXRHcm91cCcsIHtcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgdGFyZ2V0VHlwZTogZWxidjIuVGFyZ2V0VHlwZS5JUCxcbiAgICAgIHBvcnQ6IDM4OSxcbiAgICAgIHByb3RvY29sOiBlbGJ2Mi5Qcm90b2NvbC5UQ1AsXG4gICAgICBoZWFsdGhDaGVjazoge1xuICAgICAgICBwb3J0OiAnMzg5JyxcbiAgICAgICAgcHJvdG9jb2w6IGVsYnYyLlByb3RvY29sLlRDUCxcbiAgICAgICAgaW50ZXJ2YWw6IER1cmF0aW9uLnNlY29uZHMoMzApXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb25zdCBsZGFwc1RhcmdldEdyb3VwID0gbmV3IGVsYnYyLk5ldHdvcmtUYXJnZXRHcm91cCh0aGlzLCAnTGRhcHNUYXJnZXRHcm91cCcsIHtcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgdGFyZ2V0VHlwZTogZWxidjIuVGFyZ2V0VHlwZS5JUCxcbiAgICAgIHBvcnQ6IDYzNixcbiAgICAgIHByb3RvY29sOiBlbGJ2Mi5Qcm90b2NvbC5UQ1AsXG4gICAgICBoZWFsdGhDaGVjazoge1xuICAgICAgICBwb3J0OiAnNjM2JyxcbiAgICAgICAgcHJvdG9jb2w6IGVsYnYyLlByb3RvY29sLlRDUCxcbiAgICAgICAgaW50ZXJ2YWw6IER1cmF0aW9uLnNlY29uZHMoMzApXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBSZWdpc3RlciB0YXJnZXRzXG4gICAgbGRhcFRhcmdldEdyb3VwLmFkZFRhcmdldCh0aGlzLmVjc1NlcnZpY2UpO1xuICAgIGxkYXBzVGFyZ2V0R3JvdXAuYWRkVGFyZ2V0KHRoaXMuZWNzU2VydmljZSk7XG5cbiAgICAvLyBBZGQgZGVmYXVsdCBhY3Rpb25zIHRvIGxpc3RlbmVyc1xuICAgIGxkYXBMaXN0ZW5lci5hZGRBY3Rpb24oJ0xkYXBBY3Rpb24nLCB7XG4gICAgICBhY3Rpb246IGVsYnYyLk5ldHdvcmtMaXN0ZW5lckFjdGlvbi5mb3J3YXJkKFtsZGFwVGFyZ2V0R3JvdXBdKVxuICAgIH0pO1xuXG4gICAgbGRhcHNMaXN0ZW5lci5hZGRBY3Rpb24oJ0xkYXBzQWN0aW9uJywge1xuICAgICAgYWN0aW9uOiBlbGJ2Mi5OZXR3b3JrTGlzdGVuZXJBY3Rpb24uZm9yd2FyZChbbGRhcHNUYXJnZXRHcm91cF0pXG4gICAgfSk7XG5cbiAgICAvLyBTdG9yZSB0aGUgRE5TIG5hbWUgZm9yIG91dHB1dFxuICAgIHRoaXMuZG5zTmFtZSA9IHRoaXMubG9hZEJhbGFuY2VyLmxvYWRCYWxhbmNlckRuc05hbWU7XG5cbiAgICAvLyBFeHBvcnQgb3V0cHV0c1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0xvYWRCYWxhbmNlckRuc05hbWUnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5kbnNOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdUaGUgRE5TIG5hbWUgb2YgdGhlIExEQVAgbG9hZCBiYWxhbmNlcidcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0xkYXBFbmRwb2ludCcsIHtcbiAgICAgIHZhbHVlOiBgbGRhcDovLyR7dGhpcy5kbnNOYW1lfTozODlgLFxuICAgICAgZGVzY3JpcHRpb246ICdUaGUgTERBUCBlbmRwb2ludCBVUkwnXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdMZGFwc0VuZHBvaW50Jywge1xuICAgICAgdmFsdWU6IGBsZGFwczovLyR7dGhpcy5kbnNOYW1lfTo2MzZgLFxuICAgICAgZGVzY3JpcHRpb246ICdUaGUgTERBUFMgZW5kcG9pbnQgVVJMJyAgXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==