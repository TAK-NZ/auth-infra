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
        // Derive environment-specific values from context (matches reference pattern)
        const isHighAvailability = props.environment === 'prod';
        const removalPolicy = props.contextConfig.general.removalPolicy === 'RETAIN' ?
            aws_cdk_lib_1.RemovalPolicy.RETAIN : aws_cdk_lib_1.RemovalPolicy.DESTROY;
        const logRetention = isHighAvailability ?
            aws_cdk_lib_1.aws_logs.RetentionDays.ONE_MONTH :
            aws_cdk_lib_1.aws_logs.RetentionDays.ONE_WEEK;
        // Create the log group
        const logGroup = new aws_cdk_lib_1.aws_logs.LogGroup(this, 'Logs', {
            logGroupName: id,
            retention: logRetention,
            removalPolicy: removalPolicy
        });
        // Create security group for NLB
        const nlbSecurityGroup = new aws_cdk_lib_1.aws_ec2.SecurityGroup(this, 'NLBSecurityGroup', {
            vpc: props.infrastructure.vpc,
            description: 'Allow 389 and 636 Access to NLB',
            allowAllOutbound: false
        });
        // Allow LDAP traffic
        nlbSecurityGroup.addIngressRule(aws_cdk_lib_1.aws_ec2.Peer.ipv4('10.0.0.0/8'), aws_cdk_lib_1.aws_ec2.Port.tcp(389), 'Allow LDAP access');
        nlbSecurityGroup.addIngressRule(aws_cdk_lib_1.aws_ec2.Peer.ipv4('10.0.0.0/8'), aws_cdk_lib_1.aws_ec2.Port.tcp(636), 'Allow LDAPS access');
        // Create network load balancer
        this.loadBalancer = new aws_cdk_lib_1.aws_elasticloadbalancingv2.NetworkLoadBalancer(this, 'NLB', {
            loadBalancerName: 'ldap',
            vpc: props.infrastructure.vpc,
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
            certificates: [{ certificateArn: props.network.sslCertificateArn }]
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
        props.infrastructure.kmsKey.grantDecrypt(executionRole);
        // Create task role
        const taskRole = new aws_cdk_lib_1.aws_iam.Role(this, 'TaskRole', {
            assumedBy: new aws_cdk_lib_1.aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        });
        // Create task definition
        this.taskDefinition = new aws_cdk_lib_1.aws_ecs.FargateTaskDefinition(this, 'TaskDef', {
            cpu: props.contextConfig.ecs.taskCpu,
            memoryLimitMiB: props.contextConfig.ecs.taskMemory,
            executionRole,
            taskRole
        });
        // Determine Docker image - ECR repository is required
        if (!props.deployment.ecrRepositoryArn) {
            throw new Error('ecrRepositoryArn is required for Authentik LDAP deployment');
        }
        // Convert ECR ARN to proper repository URI  
        const ecrRepositoryUri = this.convertEcrArnToRepositoryUri(props.deployment.ecrRepositoryArn);
        const dockerImage = `${ecrRepositoryUri}:auth-infra-ldap-${props.deployment.gitSha}`;
        // Create container definition
        const container = this.taskDefinition.addContainer('AuthentikLdap', {
            image: aws_cdk_lib_1.aws_ecs.ContainerImage.fromRegistry(dockerImage),
            logging: aws_cdk_lib_1.aws_ecs.LogDrivers.awsLogs({
                streamPrefix: 'authentik-ldap',
                logGroup
            }),
            environment: {
                AUTHENTIK_HOST: props.application.authentikHost || '',
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
            cluster: props.infrastructure.ecsCluster,
            taskDefinition: this.taskDefinition,
            desiredCount: props.contextConfig.ecs.desiredCount,
            securityGroups: [props.infrastructure.ecsSecurityGroup],
            enableExecuteCommand: props.deployment.enableExecute,
            assignPublicIp: false,
            circuitBreaker: { rollback: true }
        });
        // Create target groups for LDAP and LDAPS
        const ldapTargetGroup = new aws_cdk_lib_1.aws_elasticloadbalancingv2.NetworkTargetGroup(this, 'LdapTargetGroup', {
            vpc: props.infrastructure.vpc,
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
            vpc: props.infrastructure.vpc,
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
    }
}
exports.Ldap = Ldap;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGRhcC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImxkYXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUE7O0dBRUc7QUFDSCwyQ0FBdUM7QUFDdkMsNkNBWXFCO0FBd0RyQjs7R0FFRztBQUNILE1BQWEsSUFBSyxTQUFRLHNCQUFTO0lBcUJqQzs7OztPQUlHO0lBQ0ssNEJBQTRCLENBQUMsTUFBYztRQUNqRCw0Q0FBNEM7UUFDNUMsSUFBSSxtQkFBSyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQy9CLG1GQUFtRjtZQUNuRixPQUFPLGdCQUFFLENBQUMsR0FBRyxDQUFDLHdEQUF3RCxFQUFFO2dCQUN0RSxPQUFPLEVBQUUsZ0JBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLGdCQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDNUMsTUFBTSxFQUFFLGdCQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxnQkFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQzNDLFFBQVEsRUFBRSxnQkFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsZ0JBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLGdCQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxnQkFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQzNFLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCw2REFBNkQ7UUFDN0QsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNuQyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO1lBQ3BFLE1BQU0sSUFBSSxLQUFLLENB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QixVQUFVLEVBQUUsd0NBQUssQ0FBQyxVQUFVLENBQUMsRUFBRTtZQUMvQixJQUFJLEVBQUUsSUFBSTtZQUNWLFFBQVEsRUFBRSx3Q0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHO1lBQzVCLFdBQVcsRUFBRTtnQkFDWCxJQUFJLEVBQUUsTUFBTTtnQkFDWixRQUFRLEVBQUUsd0NBQUssQ0FBQyxRQUFRLENBQUMsR0FBRztnQkFDNUIsUUFBUSxFQUFFLHNCQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQzthQUMvQjtTQUNGLENBQUMsQ0FBQztRQUVILG1CQUFtQjtRQUNuQixlQUFlLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMzQyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRTVDLG1DQUFtQztRQUNuQyxZQUFZLENBQUMsU0FBUyxDQUFDLFlBQVksRUFBRTtZQUNuQyxNQUFNLEVBQUUsd0NBQUssQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQztTQUMvRCxDQUFDLENBQUM7UUFFSCxhQUFhLENBQUMsU0FBUyxDQUFDLGFBQWEsRUFBRTtZQUNyQyxNQUFNLEVBQUUsd0NBQUssQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1NBQ2hFLENBQUMsQ0FBQztRQUVILGdDQUFnQztRQUNoQyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsbUJBQW1CLENBQUM7SUFDdkQsQ0FBQztDQUNGO0FBck9ELG9CQXFPQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogTERBUCBDb25zdHJ1Y3QgLSBDREsgaW1wbGVtZW50YXRpb24gb2YgdGhlIEF1dGhlbnRpayBMREFQIG91dHBvc3RcbiAqL1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQge1xuICBhd3NfZWMyIGFzIGVjMixcbiAgYXdzX2VjcyBhcyBlY3MsXG4gIGF3c19lbGFzdGljbG9hZGJhbGFuY2luZ3YyIGFzIGVsYnYyLFxuICBhd3NfbG9ncyBhcyBsb2dzLFxuICBhd3Nfc2VjcmV0c21hbmFnZXIgYXMgc2VjcmV0c21hbmFnZXIsXG4gIGF3c19zMyBhcyBzMyxcbiAgYXdzX2lhbSBhcyBpYW0sXG4gIER1cmF0aW9uLFxuICBGbixcbiAgVG9rZW4sXG4gIFJlbW92YWxQb2xpY3lcbn0gZnJvbSAnYXdzLWNkay1saWInO1xuXG5pbXBvcnQgdHlwZSB7IENvbnRleHRFbnZpcm9ubWVudENvbmZpZyB9IGZyb20gJy4uL3N0YWNrLWNvbmZpZyc7XG5pbXBvcnQgdHlwZSB7IFxuICBJbmZyYXN0cnVjdHVyZUNvbmZpZywgXG4gIFN0b3JhZ2VDb25maWcsIFxuICBEZXBsb3ltZW50Q29uZmlnLCBcbiAgTmV0d29ya0NvbmZpZyxcbiAgQXV0aGVudGlrQXBwbGljYXRpb25Db25maWdcbn0gZnJvbSAnLi4vY29uc3RydWN0LWNvbmZpZ3MnO1xuXG4vKipcbiAqIFByb3BlcnRpZXMgZm9yIHRoZSBMREFQIGNvbnN0cnVjdFxuICovXG5leHBvcnQgaW50ZXJmYWNlIExkYXBQcm9wcyB7XG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBuYW1lIChlLmcuICdwcm9kJywgJ2RldicsIGV0Yy4pXG4gICAqL1xuICBlbnZpcm9ubWVudDogJ3Byb2QnIHwgJ2Rldi10ZXN0JztcblxuICAvKipcbiAgICogRW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxuICAgKi9cbiAgY29udGV4dENvbmZpZzogQ29udGV4dEVudmlyb25tZW50Q29uZmlnO1xuXG4gIC8qKlxuICAgKiBJbmZyYXN0cnVjdHVyZSBjb25maWd1cmF0aW9uIChWUEMsIHNlY3VyaXR5IGdyb3VwcywgRUNTIGNsdXN0ZXIsIEtNUylcbiAgICovXG4gIGluZnJhc3RydWN0dXJlOiBJbmZyYXN0cnVjdHVyZUNvbmZpZztcblxuICAvKipcbiAgICogU3RvcmFnZSBjb25maWd1cmF0aW9uIChTMyBidWNrZXQpXG4gICAqL1xuICBzdG9yYWdlOiBTdG9yYWdlQ29uZmlnO1xuXG4gIC8qKlxuICAgKiBEZXBsb3ltZW50IGNvbmZpZ3VyYXRpb24gKEVDUiByZXBvc2l0b3J5LCBHaXQgU0hBLCBlbmFibGUgZXhlY3V0ZSlcbiAgICovXG4gIGRlcGxveW1lbnQ6IERlcGxveW1lbnRDb25maWc7XG5cbiAgLyoqXG4gICAqIE5ldHdvcmsgY29uZmlndXJhdGlvbiAoU1NMIGNlcnRpZmljYXRlKVxuICAgKi9cbiAgbmV0d29yazogTmV0d29ya0NvbmZpZztcblxuICAvKipcbiAgICogQXBwbGljYXRpb24gY29uZmlndXJhdGlvbiAoQXV0aGVudGlrIGhvc3QpXG4gICAqL1xuICBhcHBsaWNhdGlvbjogQXV0aGVudGlrQXBwbGljYXRpb25Db25maWc7XG5cbiAgLyoqXG4gICAqIExEQVAgdG9rZW4gc2VjcmV0IGZyb20gQXV0aGVudGlrXG4gICAqL1xuICBsZGFwVG9rZW46IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG59XG5cbi8qKlxuICogQ0RLIGNvbnN0cnVjdCBmb3IgdGhlIExEQVAgb3V0cG9zdCBzZXJ2aWNlXG4gKi9cbmV4cG9ydCBjbGFzcyBMZGFwIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgLyoqXG4gICAqIFRoZSBuZXR3b3JrIGxvYWQgYmFsYW5jZXIgZm9yIHRoZSBMREFQIHNlcnZpY2VcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBsb2FkQmFsYW5jZXI6IGVsYnYyLk5ldHdvcmtMb2FkQmFsYW5jZXI7XG5cbiAgLyoqXG4gICAqIFRoZSBFQ1MgdGFzayBkZWZpbml0aW9uIGZvciB0aGUgTERBUCBzZXJ2aWNlXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgdGFza0RlZmluaXRpb246IGVjcy5UYXNrRGVmaW5pdGlvbjtcblxuICAvKipcbiAgICogVGhlIEVDUyBzZXJ2aWNlIGZvciBMREFQXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgZWNzU2VydmljZTogZWNzLkZhcmdhdGVTZXJ2aWNlO1xuXG4gIC8qKlxuICAgKiBETlMgbmFtZSBvZiB0aGUgbG9hZCBiYWxhbmNlclxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGRuc05hbWU6IHN0cmluZztcblxuICAvKipcbiAgICogQ29udmVydHMgYW4gRUNSIHJlcG9zaXRvcnkgQVJOIHRvIGEgcHJvcGVyIEVDUiByZXBvc2l0b3J5IFVSSSBmb3IgRG9ja2VyIGltYWdlc1xuICAgKiBAcGFyYW0gZWNyQXJuIC0gRUNSIHJlcG9zaXRvcnkgQVJOIChlLmcuLCBcImFybjphd3M6ZWNyOnJlZ2lvbjphY2NvdW50OnJlcG9zaXRvcnkvcmVwby1uYW1lXCIpXG4gICAqIEByZXR1cm5zIEVDUiByZXBvc2l0b3J5IFVSSSAoZS5nLiwgXCJhY2NvdW50LmRrci5lY3IucmVnaW9uLmFtYXpvbmF3cy5jb20vcmVwby1uYW1lXCIpXG4gICAqL1xuICBwcml2YXRlIGNvbnZlcnRFY3JBcm5Ub1JlcG9zaXRvcnlVcmkoZWNyQXJuOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIC8vIEhhbmRsZSBDREsgdG9rZW5zICh1bnJlc29sdmVkIHJlZmVyZW5jZXMpXG4gICAgaWYgKFRva2VuLmlzVW5yZXNvbHZlZChlY3JBcm4pKSB7XG4gICAgICAvLyBGb3IgdG9rZW5zLCB3ZSBuZWVkIHRvIHVzZSBDREsncyBGbi5zdWIgdG8gcGVyZm9ybSB0aGUgY29udmVyc2lvbiBhdCBkZXBsb3kgdGltZVxuICAgICAgcmV0dXJuIEZuLnN1YignJHtBY2NvdW50fS5ka3IuZWNyLiR7UmVnaW9ufS5hbWF6b25hd3MuY29tLyR7UmVwb05hbWV9Jywge1xuICAgICAgICBBY2NvdW50OiBGbi5zZWxlY3QoNCwgRm4uc3BsaXQoJzonLCBlY3JBcm4pKSxcbiAgICAgICAgUmVnaW9uOiBGbi5zZWxlY3QoMywgRm4uc3BsaXQoJzonLCBlY3JBcm4pKSxcbiAgICAgICAgUmVwb05hbWU6IEZuLnNlbGVjdCgxLCBGbi5zcGxpdCgnLycsIEZuLnNlbGVjdCg1LCBGbi5zcGxpdCgnOicsIGVjckFybikpKSlcbiAgICAgIH0pO1xuICAgIH1cbiAgICBcbiAgICAvLyBQYXJzZSBBUk46IGFybjphd3M6ZWNyOnJlZ2lvbjphY2NvdW50OnJlcG9zaXRvcnkvcmVwby1uYW1lXG4gICAgY29uc3QgYXJuUGFydHMgPSBlY3JBcm4uc3BsaXQoJzonKTtcbiAgICBpZiAoYXJuUGFydHMubGVuZ3RoICE9PSA2IHx8ICFhcm5QYXJ0c1s1XS5zdGFydHNXaXRoKCdyZXBvc2l0b3J5LycpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgRUNSIHJlcG9zaXRvcnkgQVJOIGZvcm1hdDogJHtlY3JBcm59YCk7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IHJlZ2lvbiA9IGFyblBhcnRzWzNdO1xuICAgIGNvbnN0IGFjY291bnQgPSBhcm5QYXJ0c1s0XTtcbiAgICBjb25zdCByZXBvc2l0b3J5TmFtZSA9IGFyblBhcnRzWzVdLnJlcGxhY2UoJ3JlcG9zaXRvcnkvJywgJycpO1xuICAgIFxuICAgIHJldHVybiBgJHthY2NvdW50fS5ka3IuZWNyLiR7cmVnaW9ufS5hbWF6b25hd3MuY29tLyR7cmVwb3NpdG9yeU5hbWV9YDtcbiAgfVxuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBMZGFwUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gRGVyaXZlIGVudmlyb25tZW50LXNwZWNpZmljIHZhbHVlcyBmcm9tIGNvbnRleHQgKG1hdGNoZXMgcmVmZXJlbmNlIHBhdHRlcm4pXG4gICAgY29uc3QgaXNIaWdoQXZhaWxhYmlsaXR5ID0gcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJztcbiAgICBjb25zdCByZW1vdmFsUG9saWN5ID0gcHJvcHMuY29udGV4dENvbmZpZy5nZW5lcmFsLnJlbW92YWxQb2xpY3kgPT09ICdSRVRBSU4nID8gXG4gICAgICBSZW1vdmFsUG9saWN5LlJFVEFJTiA6IFJlbW92YWxQb2xpY3kuREVTVFJPWTtcbiAgICBjb25zdCBsb2dSZXRlbnRpb24gPSBpc0hpZ2hBdmFpbGFiaWxpdHkgPyBcbiAgICAgIGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEggOiBcbiAgICAgIGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSztcblxuICAgIC8vIENyZWF0ZSB0aGUgbG9nIGdyb3VwXG4gICAgY29uc3QgbG9nR3JvdXAgPSBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnTG9ncycsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogaWQsXG4gICAgICByZXRlbnRpb246IGxvZ1JldGVudGlvbixcbiAgICAgIHJlbW92YWxQb2xpY3k6IHJlbW92YWxQb2xpY3lcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBzZWN1cml0eSBncm91cCBmb3IgTkxCXG4gICAgY29uc3QgbmxiU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnTkxCU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYzogcHJvcHMuaW5mcmFzdHJ1Y3R1cmUudnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyAzODkgYW5kIDYzNiBBY2Nlc3MgdG8gTkxCJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IGZhbHNlXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBMREFQIHRyYWZmaWNcbiAgICBubGJTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuaXB2NCgnMTAuMC4wLjAvOCcpLFxuICAgICAgZWMyLlBvcnQudGNwKDM4OSksXG4gICAgICAnQWxsb3cgTERBUCBhY2Nlc3MnXG4gICAgKTtcblxuICAgIG5sYlNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5pcHY0KCcxMC4wLjAuMC84JyksXG4gICAgICBlYzIuUG9ydC50Y3AoNjM2KSxcbiAgICAgICdBbGxvdyBMREFQUyBhY2Nlc3MnXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBuZXR3b3JrIGxvYWQgYmFsYW5jZXJcbiAgICB0aGlzLmxvYWRCYWxhbmNlciA9IG5ldyBlbGJ2Mi5OZXR3b3JrTG9hZEJhbGFuY2VyKHRoaXMsICdOTEInLCB7XG4gICAgICBsb2FkQmFsYW5jZXJOYW1lOiAnbGRhcCcsXG4gICAgICB2cGM6IHByb3BzLmluZnJhc3RydWN0dXJlLnZwYyxcbiAgICAgIGludGVybmV0RmFjaW5nOiBmYWxzZSxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTU1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIGxpc3RlbmVycyBmb3IgTERBUCBhbmQgTERBUFNcbiAgICBjb25zdCBsZGFwTGlzdGVuZXIgPSB0aGlzLmxvYWRCYWxhbmNlci5hZGRMaXN0ZW5lcignTGRhcExpc3RlbmVyJywge1xuICAgICAgcG9ydDogMzg5LFxuICAgICAgcHJvdG9jb2w6IGVsYnYyLlByb3RvY29sLlRDUFxuICAgIH0pO1xuXG4gICAgY29uc3QgbGRhcHNMaXN0ZW5lciA9IHRoaXMubG9hZEJhbGFuY2VyLmFkZExpc3RlbmVyKCdMZGFwc0xpc3RlbmVyJywge1xuICAgICAgcG9ydDogNjM2LFxuICAgICAgcHJvdG9jb2w6IGVsYnYyLlByb3RvY29sLlRMUyxcbiAgICAgIGNlcnRpZmljYXRlczogW3sgY2VydGlmaWNhdGVBcm46IHByb3BzLm5ldHdvcmsuc3NsQ2VydGlmaWNhdGVBcm4gfV1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSB0YXNrIGV4ZWN1dGlvbiByb2xlXG4gICAgY29uc3QgZXhlY3V0aW9uUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnVGFza0V4ZWN1dGlvblJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnZWNzLXRhc2tzLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BbWF6b25FQ1NUYXNrRXhlY3V0aW9uUm9sZVBvbGljeScpXG4gICAgICBdXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgcGVybWlzc2lvbnMgdG8gYWNjZXNzIHNlY3JldHNcbiAgICBwcm9wcy5sZGFwVG9rZW4uZ3JhbnRSZWFkKGV4ZWN1dGlvblJvbGUpO1xuXG4gICAgLy8gR3JhbnQgZXhwbGljaXQgS01TIHBlcm1pc3Npb25zIGZvciBzZWNyZXRzIGRlY3J5cHRpb25cbiAgICBwcm9wcy5pbmZyYXN0cnVjdHVyZS5rbXNLZXkuZ3JhbnREZWNyeXB0KGV4ZWN1dGlvblJvbGUpO1xuXG4gICAgLy8gQ3JlYXRlIHRhc2sgcm9sZVxuICAgIGNvbnN0IHRhc2tSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdUYXNrUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlY3MtdGFza3MuYW1hem9uYXdzLmNvbScpLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHRhc2sgZGVmaW5pdGlvblxuICAgIHRoaXMudGFza0RlZmluaXRpb24gPSBuZXcgZWNzLkZhcmdhdGVUYXNrRGVmaW5pdGlvbih0aGlzLCAnVGFza0RlZicsIHtcbiAgICAgIGNwdTogcHJvcHMuY29udGV4dENvbmZpZy5lY3MudGFza0NwdSxcbiAgICAgIG1lbW9yeUxpbWl0TWlCOiBwcm9wcy5jb250ZXh0Q29uZmlnLmVjcy50YXNrTWVtb3J5LFxuICAgICAgZXhlY3V0aW9uUm9sZSxcbiAgICAgIHRhc2tSb2xlXG4gICAgfSk7XG5cbiAgICAvLyBEZXRlcm1pbmUgRG9ja2VyIGltYWdlIC0gRUNSIHJlcG9zaXRvcnkgaXMgcmVxdWlyZWRcbiAgICBpZiAoIXByb3BzLmRlcGxveW1lbnQuZWNyUmVwb3NpdG9yeUFybikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdlY3JSZXBvc2l0b3J5QXJuIGlzIHJlcXVpcmVkIGZvciBBdXRoZW50aWsgTERBUCBkZXBsb3ltZW50Jyk7XG4gICAgfVxuICAgIFxuICAgIC8vIENvbnZlcnQgRUNSIEFSTiB0byBwcm9wZXIgcmVwb3NpdG9yeSBVUkkgIFxuICAgIGNvbnN0IGVjclJlcG9zaXRvcnlVcmkgPSB0aGlzLmNvbnZlcnRFY3JBcm5Ub1JlcG9zaXRvcnlVcmkocHJvcHMuZGVwbG95bWVudC5lY3JSZXBvc2l0b3J5QXJuKTtcbiAgICBjb25zdCBkb2NrZXJJbWFnZSA9IGAke2VjclJlcG9zaXRvcnlVcml9OmF1dGgtaW5mcmEtbGRhcC0ke3Byb3BzLmRlcGxveW1lbnQuZ2l0U2hhfWA7XG5cbiAgICAvLyBDcmVhdGUgY29udGFpbmVyIGRlZmluaXRpb25cbiAgICBjb25zdCBjb250YWluZXIgPSB0aGlzLnRhc2tEZWZpbml0aW9uLmFkZENvbnRhaW5lcignQXV0aGVudGlrTGRhcCcsIHtcbiAgICAgIGltYWdlOiBlY3MuQ29udGFpbmVySW1hZ2UuZnJvbVJlZ2lzdHJ5KGRvY2tlckltYWdlKSxcbiAgICAgIGxvZ2dpbmc6IGVjcy5Mb2dEcml2ZXJzLmF3c0xvZ3Moe1xuICAgICAgICBzdHJlYW1QcmVmaXg6ICdhdXRoZW50aWstbGRhcCcsXG4gICAgICAgIGxvZ0dyb3VwXG4gICAgICB9KSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEFVVEhFTlRJS19IT1NUOiBwcm9wcy5hcHBsaWNhdGlvbi5hdXRoZW50aWtIb3N0IHx8ICcnLFxuICAgICAgICBBVVRIRU5USUtfSU5TRUNVUkU6ICdmYWxzZSdcbiAgICAgIH0sXG4gICAgICBzZWNyZXRzOiB7XG4gICAgICAgIEFVVEhFTlRJS19UT0tFTjogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIocHJvcHMubGRhcFRva2VuKVxuICAgICAgfSxcbiAgICAgIGVzc2VudGlhbDogdHJ1ZVxuICAgIH0pO1xuXG4gICAgLy8gQWRkIHBvcnQgbWFwcGluZ3NcbiAgICBjb250YWluZXIuYWRkUG9ydE1hcHBpbmdzKFxuICAgICAge1xuICAgICAgICBjb250YWluZXJQb3J0OiAzMzg5LFxuICAgICAgICBob3N0UG9ydDogMzM4OSxcbiAgICAgICAgcHJvdG9jb2w6IGVjcy5Qcm90b2NvbC5UQ1BcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIGNvbnRhaW5lclBvcnQ6IDY2MzYsXG4gICAgICAgIGhvc3RQb3J0OiA2NjM2LFxuICAgICAgICBwcm90b2NvbDogZWNzLlByb3RvY29sLlRDUFxuICAgICAgfVxuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgRUNTIHNlcnZpY2VcbiAgICB0aGlzLmVjc1NlcnZpY2UgPSBuZXcgZWNzLkZhcmdhdGVTZXJ2aWNlKHRoaXMsICdTZXJ2aWNlJywge1xuICAgICAgY2x1c3RlcjogcHJvcHMuaW5mcmFzdHJ1Y3R1cmUuZWNzQ2x1c3RlcixcbiAgICAgIHRhc2tEZWZpbml0aW9uOiB0aGlzLnRhc2tEZWZpbml0aW9uLFxuICAgICAgZGVzaXJlZENvdW50OiBwcm9wcy5jb250ZXh0Q29uZmlnLmVjcy5kZXNpcmVkQ291bnQsXG4gICAgICBzZWN1cml0eUdyb3VwczogW3Byb3BzLmluZnJhc3RydWN0dXJlLmVjc1NlY3VyaXR5R3JvdXBdLFxuICAgICAgZW5hYmxlRXhlY3V0ZUNvbW1hbmQ6IHByb3BzLmRlcGxveW1lbnQuZW5hYmxlRXhlY3V0ZSxcbiAgICAgIGFzc2lnblB1YmxpY0lwOiBmYWxzZSxcbiAgICAgIGNpcmN1aXRCcmVha2VyOiB7IHJvbGxiYWNrOiB0cnVlIH1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSB0YXJnZXQgZ3JvdXBzIGZvciBMREFQIGFuZCBMREFQU1xuICAgIGNvbnN0IGxkYXBUYXJnZXRHcm91cCA9IG5ldyBlbGJ2Mi5OZXR3b3JrVGFyZ2V0R3JvdXAodGhpcywgJ0xkYXBUYXJnZXRHcm91cCcsIHtcbiAgICAgIHZwYzogcHJvcHMuaW5mcmFzdHJ1Y3R1cmUudnBjLFxuICAgICAgdGFyZ2V0VHlwZTogZWxidjIuVGFyZ2V0VHlwZS5JUCxcbiAgICAgIHBvcnQ6IDMzODksXG4gICAgICBwcm90b2NvbDogZWxidjIuUHJvdG9jb2wuVENQLFxuICAgICAgaGVhbHRoQ2hlY2s6IHtcbiAgICAgICAgcG9ydDogJzMzODknLFxuICAgICAgICBwcm90b2NvbDogZWxidjIuUHJvdG9jb2wuVENQLFxuICAgICAgICBpbnRlcnZhbDogRHVyYXRpb24uc2Vjb25kcygzMClcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IGxkYXBzVGFyZ2V0R3JvdXAgPSBuZXcgZWxidjIuTmV0d29ya1RhcmdldEdyb3VwKHRoaXMsICdMZGFwc1RhcmdldEdyb3VwJywge1xuICAgICAgdnBjOiBwcm9wcy5pbmZyYXN0cnVjdHVyZS52cGMsXG4gICAgICB0YXJnZXRUeXBlOiBlbGJ2Mi5UYXJnZXRUeXBlLklQLFxuICAgICAgcG9ydDogNjYzNixcbiAgICAgIHByb3RvY29sOiBlbGJ2Mi5Qcm90b2NvbC5UQ1AsXG4gICAgICBoZWFsdGhDaGVjazoge1xuICAgICAgICBwb3J0OiAnNjYzNicsXG4gICAgICAgIHByb3RvY29sOiBlbGJ2Mi5Qcm90b2NvbC5UQ1AsXG4gICAgICAgIGludGVydmFsOiBEdXJhdGlvbi5zZWNvbmRzKDMwKVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gUmVnaXN0ZXIgdGFyZ2V0c1xuICAgIGxkYXBUYXJnZXRHcm91cC5hZGRUYXJnZXQodGhpcy5lY3NTZXJ2aWNlKTtcbiAgICBsZGFwc1RhcmdldEdyb3VwLmFkZFRhcmdldCh0aGlzLmVjc1NlcnZpY2UpO1xuXG4gICAgLy8gQWRkIGRlZmF1bHQgYWN0aW9ucyB0byBsaXN0ZW5lcnNcbiAgICBsZGFwTGlzdGVuZXIuYWRkQWN0aW9uKCdMZGFwQWN0aW9uJywge1xuICAgICAgYWN0aW9uOiBlbGJ2Mi5OZXR3b3JrTGlzdGVuZXJBY3Rpb24uZm9yd2FyZChbbGRhcFRhcmdldEdyb3VwXSlcbiAgICB9KTtcblxuICAgIGxkYXBzTGlzdGVuZXIuYWRkQWN0aW9uKCdMZGFwc0FjdGlvbicsIHtcbiAgICAgIGFjdGlvbjogZWxidjIuTmV0d29ya0xpc3RlbmVyQWN0aW9uLmZvcndhcmQoW2xkYXBzVGFyZ2V0R3JvdXBdKVxuICAgIH0pO1xuXG4gICAgLy8gU3RvcmUgdGhlIEROUyBuYW1lIGZvciBvdXRwdXRcbiAgICB0aGlzLmRuc05hbWUgPSB0aGlzLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lO1xuICB9XG59XG4iXX0=