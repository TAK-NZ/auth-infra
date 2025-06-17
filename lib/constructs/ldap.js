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
        // Grant explicit KMS permissions for secrets decryption
        props.kmsKey.grantDecrypt(executionRole);
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
        // Determine Docker image - ECR repository is required
        if (!props.ecrRepositoryArn) {
            throw new Error('ecrRepositoryArn is required for Authentik LDAP deployment');
        }
        // Convert ECR ARN to proper repository URI  
        const ecrRepositoryUri = this.convertEcrArnToRepositoryUri(props.ecrRepositoryArn);
        const dockerImage = `${ecrRepositoryUri}:auth-infra-ldap-${props.gitSha}`;
        // Create container definition
        const container = this.taskDefinition.addContainer('AuthentikLdap', {
            image: aws_cdk_lib_1.aws_ecs.ContainerImage.fromRegistry(dockerImage),
            logging: aws_cdk_lib_1.aws_ecs.LogDrivers.awsLogs({
                streamPrefix: 'authentik-ldap',
                logGroup
            }),
            environment: {
                AUTHENTIK_HOST: `https://${props.authentikHost}/`,
                AUTHENTIK_INSECURE: 'false'
            },
            secrets: {
                AUTHENTIK_TOKEN: aws_cdk_lib_1.aws_ecs.Secret.fromSecretsManager(props.ldapToken)
            },
            essential: true
        });
        // Add port mappings
        container.addPortMappings({
            containerPort: 3389,
            hostPort: 3389,
            protocol: aws_cdk_lib_1.aws_ecs.Protocol.TCP
        }, {
            containerPort: 6636,
            hostPort: 6636,
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
            port: 3389,
            protocol: aws_cdk_lib_1.aws_elasticloadbalancingv2.Protocol.TCP,
            healthCheck: {
                port: '3389',
                protocol: aws_cdk_lib_1.aws_elasticloadbalancingv2.Protocol.TCP,
                interval: aws_cdk_lib_1.Duration.seconds(30)
            }
        });
        const ldapsTargetGroup = new aws_cdk_lib_1.aws_elasticloadbalancingv2.NetworkTargetGroup(this, 'LdapsTargetGroup', {
            vpc: props.vpc,
            targetType: aws_cdk_lib_1.aws_elasticloadbalancingv2.TargetType.IP,
            port: 6636,
            protocol: aws_cdk_lib_1.aws_elasticloadbalancingv2.Protocol.TCP,
            healthCheck: {
                port: '6636',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGRhcC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImxkYXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUE7O0dBRUc7QUFDSCwyQ0FBdUM7QUFDdkMsNkNBY3FCO0FBMEVyQjs7R0FFRztBQUNILE1BQWEsSUFBSyxTQUFRLHNCQUFTO0lBcUJqQzs7OztPQUlHO0lBQ0ssNEJBQTRCLENBQUMsTUFBYztRQUNqRCw0Q0FBNEM7UUFDNUMsSUFBSSxtQkFBSyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQy9CLG1GQUFtRjtZQUNuRixPQUFPLGdCQUFFLENBQUMsR0FBRyxDQUFDLHdEQUF3RCxFQUFFO2dCQUN0RSxPQUFPLEVBQUUsZ0JBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLGdCQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDNUMsTUFBTSxFQUFFLGdCQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxnQkFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQzNDLFFBQVEsRUFBRSxnQkFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsZ0JBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLGdCQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxnQkFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQzNFLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCw2REFBNkQ7UUFDN0QsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNuQyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO1lBQ3BFLE1BQU0sSUFBSSxLQUFLLENBQUMsc0NBQXNDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDbEUsQ0FBQztRQUVELE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMzQixNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDNUIsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFOUQsT0FBTyxHQUFHLE9BQU8sWUFBWSxNQUFNLGtCQUFrQixjQUFjLEVBQUUsQ0FBQztJQUN4RSxDQUFDO0lBRUQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFnQjtRQUN4RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLHVCQUF1QjtRQUN2QixNQUFNLFFBQVEsR0FBRyxJQUFJLHNCQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxNQUFNLEVBQUU7WUFDL0MsWUFBWSxFQUFFLEVBQUU7WUFDaEIsU0FBUyxFQUFFLHNCQUFJLENBQUMsYUFBYSxDQUFDLFFBQVE7WUFDdEMsYUFBYSxFQUFFLDJCQUFhLENBQUMsT0FBTztTQUNyQyxDQUFDLENBQUM7UUFFSCxnQ0FBZ0M7UUFDaEMsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLHFCQUFHLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUN2RSxHQUFHLEVBQUUsS0FBSyxDQUFDLEdBQUc7WUFDZCxXQUFXLEVBQUUsaUNBQWlDO1lBQzlDLGdCQUFnQixFQUFFLEtBQUs7U0FDeEIsQ0FBQyxDQUFDO1FBRUgscUJBQXFCO1FBQ3JCLGdCQUFnQixDQUFDLGNBQWMsQ0FDN0IscUJBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxFQUMzQixxQkFBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQ2pCLG1CQUFtQixDQUNwQixDQUFDO1FBRUYsZ0JBQWdCLENBQUMsY0FBYyxDQUM3QixxQkFBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEVBQzNCLHFCQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFDakIsb0JBQW9CLENBQ3JCLENBQUM7UUFFRiwrQkFBK0I7UUFDL0IsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLHdDQUFLLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRTtZQUM3RCxHQUFHLEVBQUUsS0FBSyxDQUFDLEdBQUc7WUFDZCxjQUFjLEVBQUUsS0FBSztZQUNyQixVQUFVLEVBQUU7Z0JBQ1YsVUFBVSxFQUFFLHFCQUFHLENBQUMsVUFBVSxDQUFDLG1CQUFtQjthQUMvQztTQUNGLENBQUMsQ0FBQztRQUVILHNDQUFzQztRQUN0QyxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxjQUFjLEVBQUU7WUFDakUsSUFBSSxFQUFFLEdBQUc7WUFDVCxRQUFRLEVBQUUsd0NBQUssQ0FBQyxRQUFRLENBQUMsR0FBRztTQUM3QixDQUFDLENBQUM7UUFFSCxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxlQUFlLEVBQUU7WUFDbkUsSUFBSSxFQUFFLEdBQUc7WUFDVCxRQUFRLEVBQUUsd0NBQUssQ0FBQyxRQUFRLENBQUMsR0FBRztZQUM1QixZQUFZLEVBQUUsQ0FBQyxFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztTQUM1RCxDQUFDLENBQUM7UUFFSCw2QkFBNkI7UUFDN0IsTUFBTSxhQUFhLEdBQUcsSUFBSSxxQkFBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDNUQsU0FBUyxFQUFFLElBQUkscUJBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyx5QkFBeUIsQ0FBQztZQUM5RCxlQUFlLEVBQUU7Z0JBQ2YscUJBQUcsQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQUMsK0NBQStDLENBQUM7YUFDNUY7U0FDRixDQUFDLENBQUM7UUFFSCxvQ0FBb0M7UUFDcEMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLENBQUM7UUFFekMsd0RBQXdEO1FBQ3hELEtBQUssQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBRXpDLG1CQUFtQjtRQUNuQixNQUFNLFFBQVEsR0FBRyxJQUFJLHFCQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUU7WUFDOUMsU0FBUyxFQUFFLElBQUkscUJBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyx5QkFBeUIsQ0FBQztTQUMvRCxDQUFDLENBQUM7UUFFSCx5QkFBeUI7UUFDekIsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLHFCQUFHLENBQUMscUJBQXFCLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRTtZQUNuRSxHQUFHLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsT0FBTztZQUM3QixjQUFjLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsVUFBVTtZQUMzQyxhQUFhO1lBQ2IsUUFBUTtTQUNULENBQUMsQ0FBQztRQUVILHNEQUFzRDtRQUN0RCxJQUFJLENBQUMsS0FBSyxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDNUIsTUFBTSxJQUFJLEtBQUssQ0FBQyw0REFBNEQsQ0FBQyxDQUFDO1FBQ2hGLENBQUM7UUFFRCw2Q0FBNkM7UUFDN0MsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsNEJBQTRCLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDbkYsTUFBTSxXQUFXLEdBQUcsR0FBRyxnQkFBZ0Isb0JBQW9CLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUUxRSw4QkFBOEI7UUFDOUIsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxZQUFZLENBQUMsZUFBZSxFQUFFO1lBQ2xFLEtBQUssRUFBRSxxQkFBRyxDQUFDLGNBQWMsQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDO1lBQ25ELE9BQU8sRUFBRSxxQkFBRyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUM7Z0JBQzlCLFlBQVksRUFBRSxnQkFBZ0I7Z0JBQzlCLFFBQVE7YUFDVCxDQUFDO1lBQ0YsV0FBVyxFQUFFO2dCQUNYLGNBQWMsRUFBRSxXQUFXLEtBQUssQ0FBQyxhQUFhLEdBQUc7Z0JBQ2pELGtCQUFrQixFQUFFLE9BQU87YUFDNUI7WUFDRCxPQUFPLEVBQUU7Z0JBQ1AsZUFBZSxFQUFFLHFCQUFHLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUM7YUFDaEU7WUFDRCxTQUFTLEVBQUUsSUFBSTtTQUNoQixDQUFDLENBQUM7UUFFSCxvQkFBb0I7UUFDcEIsU0FBUyxDQUFDLGVBQWUsQ0FDdkI7WUFDRSxhQUFhLEVBQUUsSUFBSTtZQUNuQixRQUFRLEVBQUUsSUFBSTtZQUNkLFFBQVEsRUFBRSxxQkFBRyxDQUFDLFFBQVEsQ0FBQyxHQUFHO1NBQzNCLEVBQ0Q7WUFDRSxhQUFhLEVBQUUsSUFBSTtZQUNuQixRQUFRLEVBQUUsSUFBSTtZQUNkLFFBQVEsRUFBRSxxQkFBRyxDQUFDLFFBQVEsQ0FBQyxHQUFHO1NBQzNCLENBQ0YsQ0FBQztRQUVGLHFCQUFxQjtRQUNyQixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUkscUJBQUcsQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRTtZQUN4RCxPQUFPLEVBQUUsS0FBSyxDQUFDLFVBQVU7WUFDekIsY0FBYyxFQUFFLElBQUksQ0FBQyxjQUFjO1lBQ25DLFlBQVksRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxZQUFZO1lBQzNDLGNBQWMsRUFBRSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQztZQUN4QyxvQkFBb0IsRUFBRSxLQUFLLENBQUMsYUFBYTtZQUN6QyxjQUFjLEVBQUUsS0FBSztZQUNyQixjQUFjLEVBQUUsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFO1NBQ25DLENBQUMsQ0FBQztRQUVILDBDQUEwQztRQUMxQyxNQUFNLGVBQWUsR0FBRyxJQUFJLHdDQUFLLENBQUMsa0JBQWtCLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFO1lBQzVFLEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRztZQUNkLFVBQVUsRUFBRSx3Q0FBSyxDQUFDLFVBQVUsQ0FBQyxFQUFFO1lBQy9CLElBQUksRUFBRSxJQUFJO1lBQ1YsUUFBUSxFQUFFLHdDQUFLLENBQUMsUUFBUSxDQUFDLEdBQUc7WUFDNUIsV0FBVyxFQUFFO2dCQUNYLElBQUksRUFBRSxNQUFNO2dCQUNaLFFBQVEsRUFBRSx3Q0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHO2dCQUM1QixRQUFRLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2FBQy9CO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLHdDQUFLLENBQUMsa0JBQWtCLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQzlFLEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRztZQUNkLFVBQVUsRUFBRSx3Q0FBSyxDQUFDLFVBQVUsQ0FBQyxFQUFFO1lBQy9CLElBQUksRUFBRSxJQUFJO1lBQ1YsUUFBUSxFQUFFLHdDQUFLLENBQUMsUUFBUSxDQUFDLEdBQUc7WUFDNUIsV0FBVyxFQUFFO2dCQUNYLElBQUksRUFBRSxNQUFNO2dCQUNaLFFBQVEsRUFBRSx3Q0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHO2dCQUM1QixRQUFRLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2FBQy9CO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsbUJBQW1CO1FBQ25CLGVBQWUsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzNDLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFFNUMsbUNBQW1DO1FBQ25DLFlBQVksQ0FBQyxTQUFTLENBQUMsWUFBWSxFQUFFO1lBQ25DLE1BQU0sRUFBRSx3Q0FBSyxDQUFDLHFCQUFxQixDQUFDLE9BQU8sQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1NBQy9ELENBQUMsQ0FBQztRQUVILGFBQWEsQ0FBQyxTQUFTLENBQUMsYUFBYSxFQUFFO1lBQ3JDLE1BQU0sRUFBRSx3Q0FBSyxDQUFDLHFCQUFxQixDQUFDLE9BQU8sQ0FBQyxDQUFDLGdCQUFnQixDQUFDLENBQUM7U0FDaEUsQ0FBQyxDQUFDO1FBRUgsZ0NBQWdDO1FBQ2hDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxtQkFBbUIsQ0FBQztRQUVyRCxpQkFBaUI7UUFDakIsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxxQkFBcUIsRUFBRTtZQUN6QyxLQUFLLEVBQUUsSUFBSSxDQUFDLE9BQU87WUFDbkIsV0FBVyxFQUFFLHdDQUF3QztTQUN0RCxDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtZQUNsQyxLQUFLLEVBQUUsVUFBVSxJQUFJLENBQUMsT0FBTyxNQUFNO1lBQ25DLFdBQVcsRUFBRSx1QkFBdUI7U0FDckMsQ0FBQyxDQUFDO1FBRUgsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDbkMsS0FBSyxFQUFFLFdBQVcsSUFBSSxDQUFDLE9BQU8sTUFBTTtZQUNwQyxXQUFXLEVBQUUsd0JBQXdCO1NBQ3RDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQTVPRCxvQkE0T0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIExEQVAgQ29uc3RydWN0IC0gQ0RLIGltcGxlbWVudGF0aW9uIG9mIHRoZSBBdXRoZW50aWsgTERBUCBvdXRwb3N0XG4gKi9cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHtcbiAgYXdzX2VjMiBhcyBlYzIsXG4gIGF3c19lY3MgYXMgZWNzLFxuICBhd3NfZWxhc3RpY2xvYWRiYWxhbmNpbmd2MiBhcyBlbGJ2MixcbiAgYXdzX2xvZ3MgYXMgbG9ncyxcbiAgYXdzX3NlY3JldHNtYW5hZ2VyIGFzIHNlY3JldHNtYW5hZ2VyLFxuICBhd3NfczMgYXMgczMsXG4gIGF3c19pYW0gYXMgaWFtLFxuICBhd3Nfa21zIGFzIGttcyxcbiAgRHVyYXRpb24sXG4gIFJlbW92YWxQb2xpY3ksXG4gIENmbk91dHB1dCxcbiAgRm4sXG4gIFRva2VuXG59IGZyb20gJ2F3cy1jZGstbGliJztcblxuaW1wb3J0IHR5cGUgeyBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZyB9IGZyb20gJy4uL2Vudmlyb25tZW50LWNvbmZpZyc7XG5cbi8qKlxuICogUHJvcGVydGllcyBmb3IgdGhlIExEQVAgY29uc3RydWN0XG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgTGRhcFByb3BzIHtcbiAgLyoqXG4gICAqIEVudmlyb25tZW50IG5hbWUgKGUuZy4gJ3Byb2QnLCAnZGV2JywgZXRjLilcbiAgICovXG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEVudmlyb25tZW50IGNvbmZpZ3VyYXRpb25cbiAgICovXG4gIGNvbmZpZzogQXV0aEluZnJhRW52aXJvbm1lbnRDb25maWc7XG5cbiAgLyoqXG4gICAqIFZQQyBmb3IgZGVwbG95bWVudFxuICAgKi9cbiAgdnBjOiBlYzIuSVZwYztcblxuICAvKipcbiAgICogU2VjdXJpdHkgZ3JvdXAgZm9yIEVDUyB0YXNrc1xuICAgKi9cbiAgZWNzU2VjdXJpdHlHcm91cDogZWMyLlNlY3VyaXR5R3JvdXA7XG5cbiAgLyoqXG4gICAqIEVDUyBjbHVzdGVyXG4gICAqL1xuICBlY3NDbHVzdGVyOiBlY3MuSUNsdXN0ZXI7XG5cbiAgLyoqXG4gICAqIFMzIGNvbmZpZ3VyYXRpb24gYnVja2V0IGZvciBlbnZpcm9ubWVudCBmaWxlc1xuICAgKi9cbiAgczNDb25mQnVja2V0OiBzMy5JQnVja2V0O1xuXG4gIC8qKlxuICAgKiBTU0wgY2VydGlmaWNhdGUgQVJOIGZvciBMREFQU1xuICAgKi9cbiAgc3NsQ2VydGlmaWNhdGVBcm46IHN0cmluZztcblxuICAvKipcbiAgICogQXV0aGVudGlrIGhvc3QgVVJMXG4gICAqL1xuICBhdXRoZW50aWtIb3N0OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEVDUiByZXBvc2l0b3J5IEFSTiBmb3IgRUNSIGltYWdlc1xuICAgKi9cbiAgZWNyUmVwb3NpdG9yeUFybj86IHN0cmluZztcblxuICAvKipcbiAgICogR2l0IFNIQSBmb3IgRG9ja2VyIGltYWdlIHRhZ2dpbmdcbiAgICovXG4gIGdpdFNoYTogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBBbGxvdyBTU0ggZXhlYyBpbnRvIGNvbnRhaW5lclxuICAgKi9cbiAgZW5hYmxlRXhlY3V0ZTogYm9vbGVhbjtcblxuICAvKipcbiAgICogTERBUCB0b2tlbiBzZWNyZXQgZnJvbSBBdXRoZW50aWtcbiAgICovXG4gIGxkYXBUb2tlbjogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcblxuICAvKipcbiAgICogS01TIGtleSBmb3Igc2VjcmV0cyBlbmNyeXB0aW9uXG4gICAqL1xuICBrbXNLZXk6IGttcy5JS2V5O1xufVxuXG4vKipcbiAqIENESyBjb25zdHJ1Y3QgZm9yIHRoZSBMREFQIG91dHBvc3Qgc2VydmljZVxuICovXG5leHBvcnQgY2xhc3MgTGRhcCBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBUaGUgbmV0d29yayBsb2FkIGJhbGFuY2VyIGZvciB0aGUgTERBUCBzZXJ2aWNlXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgbG9hZEJhbGFuY2VyOiBlbGJ2Mi5OZXR3b3JrTG9hZEJhbGFuY2VyO1xuXG4gIC8qKlxuICAgKiBUaGUgRUNTIHRhc2sgZGVmaW5pdGlvbiBmb3IgdGhlIExEQVAgc2VydmljZVxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IHRhc2tEZWZpbml0aW9uOiBlY3MuVGFza0RlZmluaXRpb247XG5cbiAgLyoqXG4gICAqIFRoZSBFQ1Mgc2VydmljZSBmb3IgTERBUFxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGVjc1NlcnZpY2U6IGVjcy5GYXJnYXRlU2VydmljZTtcblxuICAvKipcbiAgICogRE5TIG5hbWUgb2YgdGhlIGxvYWQgYmFsYW5jZXJcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBkbnNOYW1lOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIENvbnZlcnRzIGFuIEVDUiByZXBvc2l0b3J5IEFSTiB0byBhIHByb3BlciBFQ1IgcmVwb3NpdG9yeSBVUkkgZm9yIERvY2tlciBpbWFnZXNcbiAgICogQHBhcmFtIGVjckFybiAtIEVDUiByZXBvc2l0b3J5IEFSTiAoZS5nLiwgXCJhcm46YXdzOmVjcjpyZWdpb246YWNjb3VudDpyZXBvc2l0b3J5L3JlcG8tbmFtZVwiKVxuICAgKiBAcmV0dXJucyBFQ1IgcmVwb3NpdG9yeSBVUkkgKGUuZy4sIFwiYWNjb3VudC5ka3IuZWNyLnJlZ2lvbi5hbWF6b25hd3MuY29tL3JlcG8tbmFtZVwiKVxuICAgKi9cbiAgcHJpdmF0ZSBjb252ZXJ0RWNyQXJuVG9SZXBvc2l0b3J5VXJpKGVjckFybjogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAvLyBIYW5kbGUgQ0RLIHRva2VucyAodW5yZXNvbHZlZCByZWZlcmVuY2VzKVxuICAgIGlmIChUb2tlbi5pc1VucmVzb2x2ZWQoZWNyQXJuKSkge1xuICAgICAgLy8gRm9yIHRva2Vucywgd2UgbmVlZCB0byB1c2UgQ0RLJ3MgRm4uc3ViIHRvIHBlcmZvcm0gdGhlIGNvbnZlcnNpb24gYXQgZGVwbG95IHRpbWVcbiAgICAgIHJldHVybiBGbi5zdWIoJyR7QWNjb3VudH0uZGtyLmVjci4ke1JlZ2lvbn0uYW1hem9uYXdzLmNvbS8ke1JlcG9OYW1lfScsIHtcbiAgICAgICAgQWNjb3VudDogRm4uc2VsZWN0KDQsIEZuLnNwbGl0KCc6JywgZWNyQXJuKSksXG4gICAgICAgIFJlZ2lvbjogRm4uc2VsZWN0KDMsIEZuLnNwbGl0KCc6JywgZWNyQXJuKSksXG4gICAgICAgIFJlcG9OYW1lOiBGbi5zZWxlY3QoMSwgRm4uc3BsaXQoJy8nLCBGbi5zZWxlY3QoNSwgRm4uc3BsaXQoJzonLCBlY3JBcm4pKSkpXG4gICAgICB9KTtcbiAgICB9XG4gICAgXG4gICAgLy8gUGFyc2UgQVJOOiBhcm46YXdzOmVjcjpyZWdpb246YWNjb3VudDpyZXBvc2l0b3J5L3JlcG8tbmFtZVxuICAgIGNvbnN0IGFyblBhcnRzID0gZWNyQXJuLnNwbGl0KCc6Jyk7XG4gICAgaWYgKGFyblBhcnRzLmxlbmd0aCAhPT0gNiB8fCAhYXJuUGFydHNbNV0uc3RhcnRzV2l0aCgncmVwb3NpdG9yeS8nKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIEVDUiByZXBvc2l0b3J5IEFSTiBmb3JtYXQ6ICR7ZWNyQXJufWApO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCByZWdpb24gPSBhcm5QYXJ0c1szXTtcbiAgICBjb25zdCBhY2NvdW50ID0gYXJuUGFydHNbNF07XG4gICAgY29uc3QgcmVwb3NpdG9yeU5hbWUgPSBhcm5QYXJ0c1s1XS5yZXBsYWNlKCdyZXBvc2l0b3J5LycsICcnKTtcbiAgICBcbiAgICByZXR1cm4gYCR7YWNjb3VudH0uZGtyLmVjci4ke3JlZ2lvbn0uYW1hem9uYXdzLmNvbS8ke3JlcG9zaXRvcnlOYW1lfWA7XG4gIH1cblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogTGRhcFByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIC8vIENyZWF0ZSB0aGUgbG9nIGdyb3VwXG4gICAgY29uc3QgbG9nR3JvdXAgPSBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnTG9ncycsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogaWQsXG4gICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuREVTVFJPWVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHNlY3VyaXR5IGdyb3VwIGZvciBOTEJcbiAgICBjb25zdCBubGJTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdOTEJTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IDM4OSBhbmQgNjM2IEFjY2VzcyB0byBOTEInLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogZmFsc2VcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IExEQVAgdHJhZmZpY1xuICAgIG5sYlNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5pcHY0KCcxMC4wLjAuMC84JyksXG4gICAgICBlYzIuUG9ydC50Y3AoMzg5KSxcbiAgICAgICdBbGxvdyBMREFQIGFjY2VzcydcbiAgICApO1xuXG4gICAgbmxiU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmlwdjQoJzEwLjAuMC4wLzgnKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg2MzYpLFxuICAgICAgJ0FsbG93IExEQVBTIGFjY2VzcydcbiAgICApO1xuXG4gICAgLy8gQ3JlYXRlIG5ldHdvcmsgbG9hZCBiYWxhbmNlclxuICAgIHRoaXMubG9hZEJhbGFuY2VyID0gbmV3IGVsYnYyLk5ldHdvcmtMb2FkQmFsYW5jZXIodGhpcywgJ05MQicsIHtcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgaW50ZXJuZXRGYWNpbmc6IGZhbHNlLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgbGlzdGVuZXJzIGZvciBMREFQIGFuZCBMREFQU1xuICAgIGNvbnN0IGxkYXBMaXN0ZW5lciA9IHRoaXMubG9hZEJhbGFuY2VyLmFkZExpc3RlbmVyKCdMZGFwTGlzdGVuZXInLCB7XG4gICAgICBwb3J0OiAzODksXG4gICAgICBwcm90b2NvbDogZWxidjIuUHJvdG9jb2wuVENQXG4gICAgfSk7XG5cbiAgICBjb25zdCBsZGFwc0xpc3RlbmVyID0gdGhpcy5sb2FkQmFsYW5jZXIuYWRkTGlzdGVuZXIoJ0xkYXBzTGlzdGVuZXInLCB7XG4gICAgICBwb3J0OiA2MzYsXG4gICAgICBwcm90b2NvbDogZWxidjIuUHJvdG9jb2wuVExTLFxuICAgICAgY2VydGlmaWNhdGVzOiBbeyBjZXJ0aWZpY2F0ZUFybjogcHJvcHMuc3NsQ2VydGlmaWNhdGVBcm4gfV1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSB0YXNrIGV4ZWN1dGlvbiByb2xlXG4gICAgY29uc3QgZXhlY3V0aW9uUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnVGFza0V4ZWN1dGlvblJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnZWNzLXRhc2tzLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BbWF6b25FQ1NUYXNrRXhlY3V0aW9uUm9sZVBvbGljeScpXG4gICAgICBdXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgcGVybWlzc2lvbnMgdG8gYWNjZXNzIHNlY3JldHNcbiAgICBwcm9wcy5sZGFwVG9rZW4uZ3JhbnRSZWFkKGV4ZWN1dGlvblJvbGUpO1xuXG4gICAgLy8gR3JhbnQgZXhwbGljaXQgS01TIHBlcm1pc3Npb25zIGZvciBzZWNyZXRzIGRlY3J5cHRpb25cbiAgICBwcm9wcy5rbXNLZXkuZ3JhbnREZWNyeXB0KGV4ZWN1dGlvblJvbGUpO1xuXG4gICAgLy8gQ3JlYXRlIHRhc2sgcm9sZVxuICAgIGNvbnN0IHRhc2tSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdUYXNrUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlY3MtdGFza3MuYW1hem9uYXdzLmNvbScpLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHRhc2sgZGVmaW5pdGlvblxuICAgIHRoaXMudGFza0RlZmluaXRpb24gPSBuZXcgZWNzLkZhcmdhdGVUYXNrRGVmaW5pdGlvbih0aGlzLCAnVGFza0RlZicsIHtcbiAgICAgIGNwdTogcHJvcHMuY29uZmlnLmVjcy50YXNrQ3B1LFxuICAgICAgbWVtb3J5TGltaXRNaUI6IHByb3BzLmNvbmZpZy5lY3MudGFza01lbW9yeSxcbiAgICAgIGV4ZWN1dGlvblJvbGUsXG4gICAgICB0YXNrUm9sZVxuICAgIH0pO1xuXG4gICAgLy8gRGV0ZXJtaW5lIERvY2tlciBpbWFnZSAtIEVDUiByZXBvc2l0b3J5IGlzIHJlcXVpcmVkXG4gICAgaWYgKCFwcm9wcy5lY3JSZXBvc2l0b3J5QXJuKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2VjclJlcG9zaXRvcnlBcm4gaXMgcmVxdWlyZWQgZm9yIEF1dGhlbnRpayBMREFQIGRlcGxveW1lbnQnKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQ29udmVydCBFQ1IgQVJOIHRvIHByb3BlciByZXBvc2l0b3J5IFVSSSAgXG4gICAgY29uc3QgZWNyUmVwb3NpdG9yeVVyaSA9IHRoaXMuY29udmVydEVjckFyblRvUmVwb3NpdG9yeVVyaShwcm9wcy5lY3JSZXBvc2l0b3J5QXJuKTtcbiAgICBjb25zdCBkb2NrZXJJbWFnZSA9IGAke2VjclJlcG9zaXRvcnlVcml9OmF1dGgtaW5mcmEtbGRhcC0ke3Byb3BzLmdpdFNoYX1gO1xuXG4gICAgLy8gQ3JlYXRlIGNvbnRhaW5lciBkZWZpbml0aW9uXG4gICAgY29uc3QgY29udGFpbmVyID0gdGhpcy50YXNrRGVmaW5pdGlvbi5hZGRDb250YWluZXIoJ0F1dGhlbnRpa0xkYXAnLCB7XG4gICAgICBpbWFnZTogZWNzLkNvbnRhaW5lckltYWdlLmZyb21SZWdpc3RyeShkb2NrZXJJbWFnZSksXG4gICAgICBsb2dnaW5nOiBlY3MuTG9nRHJpdmVycy5hd3NMb2dzKHtcbiAgICAgICAgc3RyZWFtUHJlZml4OiAnYXV0aGVudGlrLWxkYXAnLFxuICAgICAgICBsb2dHcm91cFxuICAgICAgfSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBBVVRIRU5USUtfSE9TVDogYGh0dHBzOi8vJHtwcm9wcy5hdXRoZW50aWtIb3N0fS9gLFxuICAgICAgICBBVVRIRU5USUtfSU5TRUNVUkU6ICdmYWxzZSdcbiAgICAgIH0sXG4gICAgICBzZWNyZXRzOiB7XG4gICAgICAgIEFVVEhFTlRJS19UT0tFTjogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIocHJvcHMubGRhcFRva2VuKVxuICAgICAgfSxcbiAgICAgIGVzc2VudGlhbDogdHJ1ZVxuICAgIH0pO1xuXG4gICAgLy8gQWRkIHBvcnQgbWFwcGluZ3NcbiAgICBjb250YWluZXIuYWRkUG9ydE1hcHBpbmdzKFxuICAgICAge1xuICAgICAgICBjb250YWluZXJQb3J0OiAzMzg5LFxuICAgICAgICBob3N0UG9ydDogMzM4OSxcbiAgICAgICAgcHJvdG9jb2w6IGVjcy5Qcm90b2NvbC5UQ1BcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIGNvbnRhaW5lclBvcnQ6IDY2MzYsXG4gICAgICAgIGhvc3RQb3J0OiA2NjM2LFxuICAgICAgICBwcm90b2NvbDogZWNzLlByb3RvY29sLlRDUFxuICAgICAgfVxuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgRUNTIHNlcnZpY2VcbiAgICB0aGlzLmVjc1NlcnZpY2UgPSBuZXcgZWNzLkZhcmdhdGVTZXJ2aWNlKHRoaXMsICdTZXJ2aWNlJywge1xuICAgICAgY2x1c3RlcjogcHJvcHMuZWNzQ2x1c3RlcixcbiAgICAgIHRhc2tEZWZpbml0aW9uOiB0aGlzLnRhc2tEZWZpbml0aW9uLFxuICAgICAgZGVzaXJlZENvdW50OiBwcm9wcy5jb25maWcuZWNzLmRlc2lyZWRDb3VudCxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbcHJvcHMuZWNzU2VjdXJpdHlHcm91cF0sXG4gICAgICBlbmFibGVFeGVjdXRlQ29tbWFuZDogcHJvcHMuZW5hYmxlRXhlY3V0ZSxcbiAgICAgIGFzc2lnblB1YmxpY0lwOiBmYWxzZSxcbiAgICAgIGNpcmN1aXRCcmVha2VyOiB7IHJvbGxiYWNrOiB0cnVlIH1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSB0YXJnZXQgZ3JvdXBzIGZvciBMREFQIGFuZCBMREFQU1xuICAgIGNvbnN0IGxkYXBUYXJnZXRHcm91cCA9IG5ldyBlbGJ2Mi5OZXR3b3JrVGFyZ2V0R3JvdXAodGhpcywgJ0xkYXBUYXJnZXRHcm91cCcsIHtcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgdGFyZ2V0VHlwZTogZWxidjIuVGFyZ2V0VHlwZS5JUCxcbiAgICAgIHBvcnQ6IDMzODksXG4gICAgICBwcm90b2NvbDogZWxidjIuUHJvdG9jb2wuVENQLFxuICAgICAgaGVhbHRoQ2hlY2s6IHtcbiAgICAgICAgcG9ydDogJzMzODknLFxuICAgICAgICBwcm90b2NvbDogZWxidjIuUHJvdG9jb2wuVENQLFxuICAgICAgICBpbnRlcnZhbDogRHVyYXRpb24uc2Vjb25kcygzMClcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IGxkYXBzVGFyZ2V0R3JvdXAgPSBuZXcgZWxidjIuTmV0d29ya1RhcmdldEdyb3VwKHRoaXMsICdMZGFwc1RhcmdldEdyb3VwJywge1xuICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICB0YXJnZXRUeXBlOiBlbGJ2Mi5UYXJnZXRUeXBlLklQLFxuICAgICAgcG9ydDogNjYzNixcbiAgICAgIHByb3RvY29sOiBlbGJ2Mi5Qcm90b2NvbC5UQ1AsXG4gICAgICBoZWFsdGhDaGVjazoge1xuICAgICAgICBwb3J0OiAnNjYzNicsXG4gICAgICAgIHByb3RvY29sOiBlbGJ2Mi5Qcm90b2NvbC5UQ1AsXG4gICAgICAgIGludGVydmFsOiBEdXJhdGlvbi5zZWNvbmRzKDMwKVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gUmVnaXN0ZXIgdGFyZ2V0c1xuICAgIGxkYXBUYXJnZXRHcm91cC5hZGRUYXJnZXQodGhpcy5lY3NTZXJ2aWNlKTtcbiAgICBsZGFwc1RhcmdldEdyb3VwLmFkZFRhcmdldCh0aGlzLmVjc1NlcnZpY2UpO1xuXG4gICAgLy8gQWRkIGRlZmF1bHQgYWN0aW9ucyB0byBsaXN0ZW5lcnNcbiAgICBsZGFwTGlzdGVuZXIuYWRkQWN0aW9uKCdMZGFwQWN0aW9uJywge1xuICAgICAgYWN0aW9uOiBlbGJ2Mi5OZXR3b3JrTGlzdGVuZXJBY3Rpb24uZm9yd2FyZChbbGRhcFRhcmdldEdyb3VwXSlcbiAgICB9KTtcblxuICAgIGxkYXBzTGlzdGVuZXIuYWRkQWN0aW9uKCdMZGFwc0FjdGlvbicsIHtcbiAgICAgIGFjdGlvbjogZWxidjIuTmV0d29ya0xpc3RlbmVyQWN0aW9uLmZvcndhcmQoW2xkYXBzVGFyZ2V0R3JvdXBdKVxuICAgIH0pO1xuXG4gICAgLy8gU3RvcmUgdGhlIEROUyBuYW1lIGZvciBvdXRwdXRcbiAgICB0aGlzLmRuc05hbWUgPSB0aGlzLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lO1xuXG4gICAgLy8gRXhwb3J0IG91dHB1dHNcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdMb2FkQmFsYW5jZXJEbnNOYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMuZG5zTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIEROUyBuYW1lIG9mIHRoZSBMREFQIGxvYWQgYmFsYW5jZXInXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdMZGFwRW5kcG9pbnQnLCB7XG4gICAgICB2YWx1ZTogYGxkYXA6Ly8ke3RoaXMuZG5zTmFtZX06Mzg5YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIExEQVAgZW5kcG9pbnQgVVJMJ1xuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnTGRhcHNFbmRwb2ludCcsIHtcbiAgICAgIHZhbHVlOiBgbGRhcHM6Ly8ke3RoaXMuZG5zTmFtZX06NjM2YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIExEQVBTIGVuZHBvaW50IFVSTCcgIFxuICAgIH0pO1xuICB9XG59XG4iXX0=