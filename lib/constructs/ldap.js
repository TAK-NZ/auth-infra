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
            // Configure deployment to maintain availability
            minHealthyPercent: isHighAvailability ? 100 : 50,
            maxHealthyPercent: 200,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGRhcC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImxkYXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUE7O0dBRUc7QUFDSCwyQ0FBdUM7QUFDdkMsNkNBWXFCO0FBd0RyQjs7R0FFRztBQUNILE1BQWEsSUFBSyxTQUFRLHNCQUFTO0lBcUJqQzs7OztPQUlHO0lBQ0ssNEJBQTRCLENBQUMsTUFBYztRQUNqRCw0Q0FBNEM7UUFDNUMsSUFBSSxtQkFBSyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQy9CLG1GQUFtRjtZQUNuRixPQUFPLGdCQUFFLENBQUMsR0FBRyxDQUFDLHdEQUF3RCxFQUFFO2dCQUN0RSxPQUFPLEVBQUUsZ0JBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLGdCQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDNUMsTUFBTSxFQUFFLGdCQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxnQkFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQzNDLFFBQVEsRUFBRSxnQkFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsZ0JBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLGdCQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxnQkFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQzNFLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCw2REFBNkQ7UUFDN0QsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNuQyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO1lBQ3BFLE1BQU0sSUFBSSxLQUFLLENB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LEdBQUcsSUFBSSx3Q0FBSyxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUM5RSxHQUFHLEVBQUUsS0FBSyxDQUFDLGNBQWMsQ0FBQyxHQUFHO1lBQzdCLFVBQVUsRUFBRSx3Q0FBSyxDQUFDLFVBQVUsQ0FBQyxFQUFFO1lBQy9CLElBQUksRUFBRSxJQUFJO1lBQ1YsUUFBUSxFQUFFLHdDQUFLLENBQUMsUUFBUSxDQUFDLEdBQUc7WUFDNUIsV0FBVyxFQUFFO2dCQUNYLElBQUksRUFBRSxNQUFNO2dCQUNaLFFBQVEsRUFBRSx3Q0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHO2dCQUM1QixRQUFRLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2FBQy9CO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsbUJBQW1CO1FBQ25CLGVBQWUsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzNDLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFFNUMsbUNBQW1DO1FBQ25DLFlBQVksQ0FBQyxTQUFTLENBQUMsWUFBWSxFQUFFO1lBQ25DLE1BQU0sRUFBRSx3Q0FBSyxDQUFDLHFCQUFxQixDQUFDLE9BQU8sQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1NBQy9ELENBQUMsQ0FBQztRQUVILGFBQWEsQ0FBQyxTQUFTLENBQUMsYUFBYSxFQUFFO1lBQ3JDLE1BQU0sRUFBRSx3Q0FBSyxDQUFDLHFCQUFxQixDQUFDLE9BQU8sQ0FBQyxDQUFDLGdCQUFnQixDQUFDLENBQUM7U0FDaEUsQ0FBQyxDQUFDO1FBRUgsZ0NBQWdDO1FBQ2hDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxtQkFBbUIsQ0FBQztJQUN2RCxDQUFDO0NBQ0Y7QUF4T0Qsb0JBd09DIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBMREFQIENvbnN0cnVjdCAtIENESyBpbXBsZW1lbnRhdGlvbiBvZiB0aGUgQXV0aGVudGlrIExEQVAgb3V0cG9zdFxuICovXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7XG4gIGF3c19lYzIgYXMgZWMyLFxuICBhd3NfZWNzIGFzIGVjcyxcbiAgYXdzX2VsYXN0aWNsb2FkYmFsYW5jaW5ndjIgYXMgZWxidjIsXG4gIGF3c19sb2dzIGFzIGxvZ3MsXG4gIGF3c19zZWNyZXRzbWFuYWdlciBhcyBzZWNyZXRzbWFuYWdlcixcbiAgYXdzX3MzIGFzIHMzLFxuICBhd3NfaWFtIGFzIGlhbSxcbiAgRHVyYXRpb24sXG4gIEZuLFxuICBUb2tlbixcbiAgUmVtb3ZhbFBvbGljeVxufSBmcm9tICdhd3MtY2RrLWxpYic7XG5cbmltcG9ydCB0eXBlIHsgQ29udGV4dEVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi4vc3RhY2stY29uZmlnJztcbmltcG9ydCB0eXBlIHsgXG4gIEluZnJhc3RydWN0dXJlQ29uZmlnLCBcbiAgU3RvcmFnZUNvbmZpZywgXG4gIERlcGxveW1lbnRDb25maWcsIFxuICBOZXR3b3JrQ29uZmlnLFxuICBBdXRoZW50aWtBcHBsaWNhdGlvbkNvbmZpZ1xufSBmcm9tICcuLi9jb25zdHJ1Y3QtY29uZmlncyc7XG5cbi8qKlxuICogUHJvcGVydGllcyBmb3IgdGhlIExEQVAgY29uc3RydWN0XG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgTGRhcFByb3BzIHtcbiAgLyoqXG4gICAqIEVudmlyb25tZW50IG5hbWUgKGUuZy4gJ3Byb2QnLCAnZGV2JywgZXRjLilcbiAgICovXG4gIGVudmlyb25tZW50OiAncHJvZCcgfCAnZGV2LXRlc3QnO1xuXG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBjb25maWd1cmF0aW9uXG4gICAqL1xuICBjb250ZXh0Q29uZmlnOiBDb250ZXh0RW52aXJvbm1lbnRDb25maWc7XG5cbiAgLyoqXG4gICAqIEluZnJhc3RydWN0dXJlIGNvbmZpZ3VyYXRpb24gKFZQQywgc2VjdXJpdHkgZ3JvdXBzLCBFQ1MgY2x1c3RlciwgS01TKVxuICAgKi9cbiAgaW5mcmFzdHJ1Y3R1cmU6IEluZnJhc3RydWN0dXJlQ29uZmlnO1xuXG4gIC8qKlxuICAgKiBTdG9yYWdlIGNvbmZpZ3VyYXRpb24gKFMzIGJ1Y2tldClcbiAgICovXG4gIHN0b3JhZ2U6IFN0b3JhZ2VDb25maWc7XG5cbiAgLyoqXG4gICAqIERlcGxveW1lbnQgY29uZmlndXJhdGlvbiAoRUNSIHJlcG9zaXRvcnksIEdpdCBTSEEsIGVuYWJsZSBleGVjdXRlKVxuICAgKi9cbiAgZGVwbG95bWVudDogRGVwbG95bWVudENvbmZpZztcblxuICAvKipcbiAgICogTmV0d29yayBjb25maWd1cmF0aW9uIChTU0wgY2VydGlmaWNhdGUpXG4gICAqL1xuICBuZXR3b3JrOiBOZXR3b3JrQ29uZmlnO1xuXG4gIC8qKlxuICAgKiBBcHBsaWNhdGlvbiBjb25maWd1cmF0aW9uIChBdXRoZW50aWsgaG9zdClcbiAgICovXG4gIGFwcGxpY2F0aW9uOiBBdXRoZW50aWtBcHBsaWNhdGlvbkNvbmZpZztcblxuICAvKipcbiAgICogTERBUCB0b2tlbiBzZWNyZXQgZnJvbSBBdXRoZW50aWtcbiAgICovXG4gIGxkYXBUb2tlbjogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcbn1cblxuLyoqXG4gKiBDREsgY29uc3RydWN0IGZvciB0aGUgTERBUCBvdXRwb3N0IHNlcnZpY2VcbiAqL1xuZXhwb3J0IGNsYXNzIExkYXAgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICAvKipcbiAgICogVGhlIG5ldHdvcmsgbG9hZCBiYWxhbmNlciBmb3IgdGhlIExEQVAgc2VydmljZVxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGxvYWRCYWxhbmNlcjogZWxidjIuTmV0d29ya0xvYWRCYWxhbmNlcjtcblxuICAvKipcbiAgICogVGhlIEVDUyB0YXNrIGRlZmluaXRpb24gZm9yIHRoZSBMREFQIHNlcnZpY2VcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSB0YXNrRGVmaW5pdGlvbjogZWNzLlRhc2tEZWZpbml0aW9uO1xuXG4gIC8qKlxuICAgKiBUaGUgRUNTIHNlcnZpY2UgZm9yIExEQVBcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBlY3NTZXJ2aWNlOiBlY3MuRmFyZ2F0ZVNlcnZpY2U7XG5cbiAgLyoqXG4gICAqIEROUyBuYW1lIG9mIHRoZSBsb2FkIGJhbGFuY2VyXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgZG5zTmFtZTogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBDb252ZXJ0cyBhbiBFQ1IgcmVwb3NpdG9yeSBBUk4gdG8gYSBwcm9wZXIgRUNSIHJlcG9zaXRvcnkgVVJJIGZvciBEb2NrZXIgaW1hZ2VzXG4gICAqIEBwYXJhbSBlY3JBcm4gLSBFQ1IgcmVwb3NpdG9yeSBBUk4gKGUuZy4sIFwiYXJuOmF3czplY3I6cmVnaW9uOmFjY291bnQ6cmVwb3NpdG9yeS9yZXBvLW5hbWVcIilcbiAgICogQHJldHVybnMgRUNSIHJlcG9zaXRvcnkgVVJJIChlLmcuLCBcImFjY291bnQuZGtyLmVjci5yZWdpb24uYW1hem9uYXdzLmNvbS9yZXBvLW5hbWVcIilcbiAgICovXG4gIHByaXZhdGUgY29udmVydEVjckFyblRvUmVwb3NpdG9yeVVyaShlY3JBcm46IHN0cmluZyk6IHN0cmluZyB7XG4gICAgLy8gSGFuZGxlIENESyB0b2tlbnMgKHVucmVzb2x2ZWQgcmVmZXJlbmNlcylcbiAgICBpZiAoVG9rZW4uaXNVbnJlc29sdmVkKGVjckFybikpIHtcbiAgICAgIC8vIEZvciB0b2tlbnMsIHdlIG5lZWQgdG8gdXNlIENESydzIEZuLnN1YiB0byBwZXJmb3JtIHRoZSBjb252ZXJzaW9uIGF0IGRlcGxveSB0aW1lXG4gICAgICByZXR1cm4gRm4uc3ViKCcke0FjY291bnR9LmRrci5lY3IuJHtSZWdpb259LmFtYXpvbmF3cy5jb20vJHtSZXBvTmFtZX0nLCB7XG4gICAgICAgIEFjY291bnQ6IEZuLnNlbGVjdCg0LCBGbi5zcGxpdCgnOicsIGVjckFybikpLFxuICAgICAgICBSZWdpb246IEZuLnNlbGVjdCgzLCBGbi5zcGxpdCgnOicsIGVjckFybikpLFxuICAgICAgICBSZXBvTmFtZTogRm4uc2VsZWN0KDEsIEZuLnNwbGl0KCcvJywgRm4uc2VsZWN0KDUsIEZuLnNwbGl0KCc6JywgZWNyQXJuKSkpKVxuICAgICAgfSk7XG4gICAgfVxuICAgIFxuICAgIC8vIFBhcnNlIEFSTjogYXJuOmF3czplY3I6cmVnaW9uOmFjY291bnQ6cmVwb3NpdG9yeS9yZXBvLW5hbWVcbiAgICBjb25zdCBhcm5QYXJ0cyA9IGVjckFybi5zcGxpdCgnOicpO1xuICAgIGlmIChhcm5QYXJ0cy5sZW5ndGggIT09IDYgfHwgIWFyblBhcnRzWzVdLnN0YXJ0c1dpdGgoJ3JlcG9zaXRvcnkvJykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBFQ1IgcmVwb3NpdG9yeSBBUk4gZm9ybWF0OiAke2VjckFybn1gKTtcbiAgICB9XG4gICAgXG4gICAgY29uc3QgcmVnaW9uID0gYXJuUGFydHNbM107XG4gICAgY29uc3QgYWNjb3VudCA9IGFyblBhcnRzWzRdO1xuICAgIGNvbnN0IHJlcG9zaXRvcnlOYW1lID0gYXJuUGFydHNbNV0ucmVwbGFjZSgncmVwb3NpdG9yeS8nLCAnJyk7XG4gICAgXG4gICAgcmV0dXJuIGAke2FjY291bnR9LmRrci5lY3IuJHtyZWdpb259LmFtYXpvbmF3cy5jb20vJHtyZXBvc2l0b3J5TmFtZX1gO1xuICB9XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IExkYXBQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICAvLyBEZXJpdmUgZW52aXJvbm1lbnQtc3BlY2lmaWMgdmFsdWVzIGZyb20gY29udGV4dCAobWF0Y2hlcyByZWZlcmVuY2UgcGF0dGVybilcbiAgICBjb25zdCBpc0hpZ2hBdmFpbGFiaWxpdHkgPSBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2QnO1xuICAgIGNvbnN0IHJlbW92YWxQb2xpY3kgPSBwcm9wcy5jb250ZXh0Q29uZmlnLmdlbmVyYWwucmVtb3ZhbFBvbGljeSA9PT0gJ1JFVEFJTicgPyBcbiAgICAgIFJlbW92YWxQb2xpY3kuUkVUQUlOIDogUmVtb3ZhbFBvbGljeS5ERVNUUk9ZO1xuICAgIGNvbnN0IGxvZ1JldGVudGlvbiA9IGlzSGlnaEF2YWlsYWJpbGl0eSA/IFxuICAgICAgbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCA6IFxuICAgICAgbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBsb2cgZ3JvdXBcbiAgICBjb25zdCBsb2dHcm91cCA9IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdMb2dzJywge1xuICAgICAgbG9nR3JvdXBOYW1lOiBpZCxcbiAgICAgIHJldGVudGlvbjogbG9nUmV0ZW50aW9uLFxuICAgICAgcmVtb3ZhbFBvbGljeTogcmVtb3ZhbFBvbGljeVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHNlY3VyaXR5IGdyb3VwIGZvciBOTEJcbiAgICBjb25zdCBubGJTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdOTEJTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjOiBwcm9wcy5pbmZyYXN0cnVjdHVyZS52cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IDM4OSBhbmQgNjM2IEFjY2VzcyB0byBOTEInLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogZmFsc2VcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IExEQVAgdHJhZmZpY1xuICAgIG5sYlNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5pcHY0KCcxMC4wLjAuMC84JyksXG4gICAgICBlYzIuUG9ydC50Y3AoMzg5KSxcbiAgICAgICdBbGxvdyBMREFQIGFjY2VzcydcbiAgICApO1xuXG4gICAgbmxiU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmlwdjQoJzEwLjAuMC4wLzgnKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg2MzYpLFxuICAgICAgJ0FsbG93IExEQVBTIGFjY2VzcydcbiAgICApO1xuXG4gICAgLy8gQ3JlYXRlIG5ldHdvcmsgbG9hZCBiYWxhbmNlclxuICAgIHRoaXMubG9hZEJhbGFuY2VyID0gbmV3IGVsYnYyLk5ldHdvcmtMb2FkQmFsYW5jZXIodGhpcywgJ05MQicsIHtcbiAgICAgIGxvYWRCYWxhbmNlck5hbWU6ICdsZGFwJyxcbiAgICAgIHZwYzogcHJvcHMuaW5mcmFzdHJ1Y3R1cmUudnBjLFxuICAgICAgaW50ZXJuZXRGYWNpbmc6IGZhbHNlLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgbGlzdGVuZXJzIGZvciBMREFQIGFuZCBMREFQU1xuICAgIGNvbnN0IGxkYXBMaXN0ZW5lciA9IHRoaXMubG9hZEJhbGFuY2VyLmFkZExpc3RlbmVyKCdMZGFwTGlzdGVuZXInLCB7XG4gICAgICBwb3J0OiAzODksXG4gICAgICBwcm90b2NvbDogZWxidjIuUHJvdG9jb2wuVENQXG4gICAgfSk7XG5cbiAgICBjb25zdCBsZGFwc0xpc3RlbmVyID0gdGhpcy5sb2FkQmFsYW5jZXIuYWRkTGlzdGVuZXIoJ0xkYXBzTGlzdGVuZXInLCB7XG4gICAgICBwb3J0OiA2MzYsXG4gICAgICBwcm90b2NvbDogZWxidjIuUHJvdG9jb2wuVExTLFxuICAgICAgY2VydGlmaWNhdGVzOiBbeyBjZXJ0aWZpY2F0ZUFybjogcHJvcHMubmV0d29yay5zc2xDZXJ0aWZpY2F0ZUFybiB9XVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHRhc2sgZXhlY3V0aW9uIHJvbGVcbiAgICBjb25zdCBleGVjdXRpb25Sb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdUYXNrRXhlY3V0aW9uUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlY3MtdGFza3MuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FtYXpvbkVDU1Rhc2tFeGVjdXRpb25Sb2xlUG9saWN5JylcbiAgICAgIF1cbiAgICB9KTtcblxuICAgIC8vIEFkZCBwZXJtaXNzaW9ucyB0byBhY2Nlc3Mgc2VjcmV0c1xuICAgIHByb3BzLmxkYXBUb2tlbi5ncmFudFJlYWQoZXhlY3V0aW9uUm9sZSk7XG5cbiAgICAvLyBHcmFudCBleHBsaWNpdCBLTVMgcGVybWlzc2lvbnMgZm9yIHNlY3JldHMgZGVjcnlwdGlvblxuICAgIHByb3BzLmluZnJhc3RydWN0dXJlLmttc0tleS5ncmFudERlY3J5cHQoZXhlY3V0aW9uUm9sZSk7XG5cbiAgICAvLyBDcmVhdGUgdGFzayByb2xlXG4gICAgY29uc3QgdGFza1JvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1Rhc2tSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2Vjcy10YXNrcy5hbWF6b25hd3MuY29tJyksXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgdGFzayBkZWZpbml0aW9uXG4gICAgdGhpcy50YXNrRGVmaW5pdGlvbiA9IG5ldyBlY3MuRmFyZ2F0ZVRhc2tEZWZpbml0aW9uKHRoaXMsICdUYXNrRGVmJywge1xuICAgICAgY3B1OiBwcm9wcy5jb250ZXh0Q29uZmlnLmVjcy50YXNrQ3B1LFxuICAgICAgbWVtb3J5TGltaXRNaUI6IHByb3BzLmNvbnRleHRDb25maWcuZWNzLnRhc2tNZW1vcnksXG4gICAgICBleGVjdXRpb25Sb2xlLFxuICAgICAgdGFza1JvbGVcbiAgICB9KTtcblxuICAgIC8vIERldGVybWluZSBEb2NrZXIgaW1hZ2UgLSBFQ1IgcmVwb3NpdG9yeSBpcyByZXF1aXJlZFxuICAgIGlmICghcHJvcHMuZGVwbG95bWVudC5lY3JSZXBvc2l0b3J5QXJuKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2VjclJlcG9zaXRvcnlBcm4gaXMgcmVxdWlyZWQgZm9yIEF1dGhlbnRpayBMREFQIGRlcGxveW1lbnQnKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQ29udmVydCBFQ1IgQVJOIHRvIHByb3BlciByZXBvc2l0b3J5IFVSSSAgXG4gICAgY29uc3QgZWNyUmVwb3NpdG9yeVVyaSA9IHRoaXMuY29udmVydEVjckFyblRvUmVwb3NpdG9yeVVyaShwcm9wcy5kZXBsb3ltZW50LmVjclJlcG9zaXRvcnlBcm4pO1xuICAgIGNvbnN0IGRvY2tlckltYWdlID0gYCR7ZWNyUmVwb3NpdG9yeVVyaX06YXV0aC1pbmZyYS1sZGFwLSR7cHJvcHMuZGVwbG95bWVudC5naXRTaGF9YDtcblxuICAgIC8vIENyZWF0ZSBjb250YWluZXIgZGVmaW5pdGlvblxuICAgIGNvbnN0IGNvbnRhaW5lciA9IHRoaXMudGFza0RlZmluaXRpb24uYWRkQ29udGFpbmVyKCdBdXRoZW50aWtMZGFwJywge1xuICAgICAgaW1hZ2U6IGVjcy5Db250YWluZXJJbWFnZS5mcm9tUmVnaXN0cnkoZG9ja2VySW1hZ2UpLFxuICAgICAgbG9nZ2luZzogZWNzLkxvZ0RyaXZlcnMuYXdzTG9ncyh7XG4gICAgICAgIHN0cmVhbVByZWZpeDogJ2F1dGhlbnRpay1sZGFwJyxcbiAgICAgICAgbG9nR3JvdXBcbiAgICAgIH0pLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgQVVUSEVOVElLX0hPU1Q6IHByb3BzLmFwcGxpY2F0aW9uLmF1dGhlbnRpa0hvc3QgfHwgJycsXG4gICAgICAgIEFVVEhFTlRJS19JTlNFQ1VSRTogJ2ZhbHNlJ1xuICAgICAgfSxcbiAgICAgIHNlY3JldHM6IHtcbiAgICAgICAgQVVUSEVOVElLX1RPS0VOOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihwcm9wcy5sZGFwVG9rZW4pXG4gICAgICB9LFxuICAgICAgZXNzZW50aWFsOiB0cnVlXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgcG9ydCBtYXBwaW5nc1xuICAgIGNvbnRhaW5lci5hZGRQb3J0TWFwcGluZ3MoXG4gICAgICB7XG4gICAgICAgIGNvbnRhaW5lclBvcnQ6IDMzODksXG4gICAgICAgIGhvc3RQb3J0OiAzMzg5LFxuICAgICAgICBwcm90b2NvbDogZWNzLlByb3RvY29sLlRDUFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgY29udGFpbmVyUG9ydDogNjYzNixcbiAgICAgICAgaG9zdFBvcnQ6IDY2MzYsXG4gICAgICAgIHByb3RvY29sOiBlY3MuUHJvdG9jb2wuVENQXG4gICAgICB9XG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBFQ1Mgc2VydmljZVxuICAgIHRoaXMuZWNzU2VydmljZSA9IG5ldyBlY3MuRmFyZ2F0ZVNlcnZpY2UodGhpcywgJ1NlcnZpY2UnLCB7XG4gICAgICBjbHVzdGVyOiBwcm9wcy5pbmZyYXN0cnVjdHVyZS5lY3NDbHVzdGVyLFxuICAgICAgdGFza0RlZmluaXRpb246IHRoaXMudGFza0RlZmluaXRpb24sXG4gICAgICBkZXNpcmVkQ291bnQ6IHByb3BzLmNvbnRleHRDb25maWcuZWNzLmRlc2lyZWRDb3VudCxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbcHJvcHMuaW5mcmFzdHJ1Y3R1cmUuZWNzU2VjdXJpdHlHcm91cF0sXG4gICAgICBlbmFibGVFeGVjdXRlQ29tbWFuZDogcHJvcHMuZGVwbG95bWVudC5lbmFibGVFeGVjdXRlLFxuICAgICAgYXNzaWduUHVibGljSXA6IGZhbHNlLFxuICAgICAgLy8gQ29uZmlndXJlIGRlcGxveW1lbnQgdG8gbWFpbnRhaW4gYXZhaWxhYmlsaXR5XG4gICAgICBtaW5IZWFsdGh5UGVyY2VudDogaXNIaWdoQXZhaWxhYmlsaXR5ID8gMTAwIDogNTAsXG4gICAgICBtYXhIZWFsdGh5UGVyY2VudDogMjAwLFxuICAgICAgY2lyY3VpdEJyZWFrZXI6IHsgcm9sbGJhY2s6IHRydWUgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHRhcmdldCBncm91cHMgZm9yIExEQVAgYW5kIExEQVBTXG4gICAgY29uc3QgbGRhcFRhcmdldEdyb3VwID0gbmV3IGVsYnYyLk5ldHdvcmtUYXJnZXRHcm91cCh0aGlzLCAnTGRhcFRhcmdldEdyb3VwJywge1xuICAgICAgdnBjOiBwcm9wcy5pbmZyYXN0cnVjdHVyZS52cGMsXG4gICAgICB0YXJnZXRUeXBlOiBlbGJ2Mi5UYXJnZXRUeXBlLklQLFxuICAgICAgcG9ydDogMzM4OSxcbiAgICAgIHByb3RvY29sOiBlbGJ2Mi5Qcm90b2NvbC5UQ1AsXG4gICAgICBoZWFsdGhDaGVjazoge1xuICAgICAgICBwb3J0OiAnMzM4OScsXG4gICAgICAgIHByb3RvY29sOiBlbGJ2Mi5Qcm90b2NvbC5UQ1AsXG4gICAgICAgIGludGVydmFsOiBEdXJhdGlvbi5zZWNvbmRzKDMwKVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29uc3QgbGRhcHNUYXJnZXRHcm91cCA9IG5ldyBlbGJ2Mi5OZXR3b3JrVGFyZ2V0R3JvdXAodGhpcywgJ0xkYXBzVGFyZ2V0R3JvdXAnLCB7XG4gICAgICB2cGM6IHByb3BzLmluZnJhc3RydWN0dXJlLnZwYyxcbiAgICAgIHRhcmdldFR5cGU6IGVsYnYyLlRhcmdldFR5cGUuSVAsXG4gICAgICBwb3J0OiA2NjM2LFxuICAgICAgcHJvdG9jb2w6IGVsYnYyLlByb3RvY29sLlRDUCxcbiAgICAgIGhlYWx0aENoZWNrOiB7XG4gICAgICAgIHBvcnQ6ICc2NjM2JyxcbiAgICAgICAgcHJvdG9jb2w6IGVsYnYyLlByb3RvY29sLlRDUCxcbiAgICAgICAgaW50ZXJ2YWw6IER1cmF0aW9uLnNlY29uZHMoMzApXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBSZWdpc3RlciB0YXJnZXRzXG4gICAgbGRhcFRhcmdldEdyb3VwLmFkZFRhcmdldCh0aGlzLmVjc1NlcnZpY2UpO1xuICAgIGxkYXBzVGFyZ2V0R3JvdXAuYWRkVGFyZ2V0KHRoaXMuZWNzU2VydmljZSk7XG5cbiAgICAvLyBBZGQgZGVmYXVsdCBhY3Rpb25zIHRvIGxpc3RlbmVyc1xuICAgIGxkYXBMaXN0ZW5lci5hZGRBY3Rpb24oJ0xkYXBBY3Rpb24nLCB7XG4gICAgICBhY3Rpb246IGVsYnYyLk5ldHdvcmtMaXN0ZW5lckFjdGlvbi5mb3J3YXJkKFtsZGFwVGFyZ2V0R3JvdXBdKVxuICAgIH0pO1xuXG4gICAgbGRhcHNMaXN0ZW5lci5hZGRBY3Rpb24oJ0xkYXBzQWN0aW9uJywge1xuICAgICAgYWN0aW9uOiBlbGJ2Mi5OZXR3b3JrTGlzdGVuZXJBY3Rpb24uZm9yd2FyZChbbGRhcHNUYXJnZXRHcm91cF0pXG4gICAgfSk7XG5cbiAgICAvLyBTdG9yZSB0aGUgRE5TIG5hbWUgZm9yIG91dHB1dFxuICAgIHRoaXMuZG5zTmFtZSA9IHRoaXMubG9hZEJhbGFuY2VyLmxvYWRCYWxhbmNlckRuc05hbWU7XG4gIH1cbn1cbiJdfQ==