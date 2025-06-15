"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Redis = void 0;
/**
 * Redis Construct - CDK implementation of the Redis/Valkey cache
 */
const constructs_1 = require("constructs");
const aws_cdk_lib_1 = require("aws-cdk-lib");
/**
 * CDK construct for the Redis/Valkey cache cluster
 */
class Redis extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        // Create the auth token secret
        this.authToken = new aws_cdk_lib_1.aws_secretsmanager.Secret(this, 'RedisAuthToken', {
            description: `${id} Redis Auth Token`,
            secretName: `${id}/redis/auth-token`,
            encryptionKey: props.kmsKey,
            generateSecretString: {
                excludePunctuation: true,
                passwordLength: 64
            }
        });
        // Create subnet group
        const subnetGroup = new aws_cdk_lib_1.aws_elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
            description: `${id}-redis-subnets`,
            subnetIds: props.vpc.privateSubnets.map(subnet => subnet.subnetId)
        });
        // Create security group
        const securityGroup = new aws_cdk_lib_1.aws_ec2.SecurityGroup(this, 'RedisSecurityGroup', {
            vpc: props.vpc,
            description: `${id} Redis Security Group`,
            allowAllOutbound: false
        });
        // Allow Redis port from other security groups
        props.securityGroups.forEach(sg => {
            securityGroup.addIngressRule(aws_cdk_lib_1.aws_ec2.Peer.securityGroupId(sg.securityGroupId), aws_cdk_lib_1.aws_ec2.Port.tcp(6379), 'Allow Redis access from ECS tasks');
        });
        // Create the Redis replication group
        this.replicationGroup = new aws_cdk_lib_1.aws_elasticache.CfnReplicationGroup(this, 'Redis', {
            replicationGroupDescription: 'Valkey (Redis) cluster for Authentik',
            automaticFailoverEnabled: props.config.redis.automaticFailoverEnabled,
            atRestEncryptionEnabled: true,
            transitEncryptionEnabled: true,
            transitEncryptionMode: 'required',
            authToken: this.authToken.secretValue.unsafeUnwrap(),
            kmsKeyId: props.kmsKey.keyArn,
            cacheNodeType: props.config.redis.nodeType,
            cacheSubnetGroupName: subnetGroup.ref,
            engine: 'valkey',
            engineVersion: '7.2',
            autoMinorVersionUpgrade: true,
            numCacheClusters: props.config.redis.numCacheClusters,
            securityGroupIds: [securityGroup.securityGroupId]
        });
        // Set dependencies
        this.replicationGroup.addDependency(subnetGroup);
        // Store the hostname
        this.hostname = this.replicationGroup.attrPrimaryEndPointAddress;
        // Create outputs
        new aws_cdk_lib_1.CfnOutput(this, 'RedisEndpoint', {
            value: this.hostname,
            description: 'Redis cluster endpoint'
        });
        new aws_cdk_lib_1.CfnOutput(this, 'RedisAuthTokenArn', {
            value: this.authToken.secretArn,
            description: 'Redis auth token secret ARN'
        });
    }
}
exports.Redis = Redis;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVkaXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJyZWRpcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQTs7R0FFRztBQUNILDJDQUF1QztBQUN2Qyw2Q0FNcUI7QUFrQ3JCOztHQUVHO0FBQ0gsTUFBYSxLQUFNLFNBQVEsc0JBQVM7SUFnQmxDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBaUI7UUFDekQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQiwrQkFBK0I7UUFDL0IsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLGdDQUFjLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUNqRSxXQUFXLEVBQUUsR0FBRyxFQUFFLG1CQUFtQjtZQUNyQyxVQUFVLEVBQUUsR0FBRyxFQUFFLG1CQUFtQjtZQUNwQyxhQUFhLEVBQUUsS0FBSyxDQUFDLE1BQU07WUFDM0Isb0JBQW9CLEVBQUU7Z0JBQ3BCLGtCQUFrQixFQUFFLElBQUk7Z0JBQ3hCLGNBQWMsRUFBRSxFQUFFO2FBQ25CO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsc0JBQXNCO1FBQ3RCLE1BQU0sV0FBVyxHQUFHLElBQUksNkJBQVcsQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQzNFLFdBQVcsRUFBRSxHQUFHLEVBQUUsZ0JBQWdCO1lBQ2xDLFNBQVMsRUFBRSxLQUFLLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDO1NBQ25FLENBQUMsQ0FBQztRQUVILHdCQUF3QjtRQUN4QixNQUFNLGFBQWEsR0FBRyxJQUFJLHFCQUFHLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUN0RSxHQUFHLEVBQUUsS0FBSyxDQUFDLEdBQUc7WUFDZCxXQUFXLEVBQUUsR0FBRyxFQUFFLHVCQUF1QjtZQUN6QyxnQkFBZ0IsRUFBRSxLQUFLO1NBQ3hCLENBQUMsQ0FBQztRQUVILDhDQUE4QztRQUM5QyxLQUFLLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsRUFBRTtZQUNoQyxhQUFhLENBQUMsY0FBYyxDQUMxQixxQkFBRyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDLGVBQWUsQ0FBQyxFQUM1QyxxQkFBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQ2xCLG1DQUFtQyxDQUNwQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCxxQ0FBcUM7UUFDckMsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksNkJBQVcsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFO1lBQ3pFLDJCQUEyQixFQUFFLHNDQUFzQztZQUNuRSx3QkFBd0IsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyx3QkFBd0I7WUFDckUsdUJBQXVCLEVBQUUsSUFBSTtZQUM3Qix3QkFBd0IsRUFBRSxJQUFJO1lBQzlCLHFCQUFxQixFQUFFLFVBQVU7WUFDakMsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLFlBQVksRUFBRTtZQUNwRCxRQUFRLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNO1lBQzdCLGFBQWEsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxRQUFRO1lBQzFDLG9CQUFvQixFQUFFLFdBQVcsQ0FBQyxHQUFHO1lBQ3JDLE1BQU0sRUFBRSxRQUFRO1lBQ2hCLGFBQWEsRUFBRSxLQUFLO1lBQ3BCLHVCQUF1QixFQUFFLElBQUk7WUFDN0IsZ0JBQWdCLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsZ0JBQWdCO1lBQ3JELGdCQUFnQixFQUFFLENBQUMsYUFBYSxDQUFDLGVBQWUsQ0FBQztTQUNsRCxDQUFDLENBQUM7UUFFSCxtQkFBbUI7UUFDbkIsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUVqRCxxQkFBcUI7UUFDckIsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsMEJBQTBCLENBQUM7UUFFakUsaUJBQWlCO1FBQ2pCLElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQ25DLEtBQUssRUFBRSxJQUFJLENBQUMsUUFBUTtZQUNwQixXQUFXLEVBQUUsd0JBQXdCO1NBQ3RDLENBQUMsQ0FBQztRQUVILElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDdkMsS0FBSyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUztZQUMvQixXQUFXLEVBQUUsNkJBQTZCO1NBQzNDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXZGRCxzQkF1RkMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFJlZGlzIENvbnN0cnVjdCAtIENESyBpbXBsZW1lbnRhdGlvbiBvZiB0aGUgUmVkaXMvVmFsa2V5IGNhY2hlXG4gKi9cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHtcbiAgYXdzX2VsYXN0aWNhY2hlIGFzIGVsYXN0aWNhY2hlLFxuICBhd3NfZWMyIGFzIGVjMixcbiAgYXdzX3NlY3JldHNtYW5hZ2VyIGFzIHNlY3JldHNtYW5hZ2VyLFxuICBhd3Nfa21zIGFzIGttcyxcbiAgQ2ZuT3V0cHV0XG59IGZyb20gJ2F3cy1jZGstbGliJztcblxuaW1wb3J0IHR5cGUgeyBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZyB9IGZyb20gJy4uL2Vudmlyb25tZW50LWNvbmZpZyc7XG5cbi8qKlxuICogUHJvcGVydGllcyBmb3IgdGhlIFJlZGlzIGNvbnN0cnVjdFxuICovXG5leHBvcnQgaW50ZXJmYWNlIFJlZGlzUHJvcHMge1xuICAvKipcbiAgICogRW52aXJvbm1lbnQgbmFtZSAoZS5nLiAncHJvZCcsICdkZXYnLCBldGMuKVxuICAgKi9cbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcblxuICAvKipcbiAgICogRW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxuICAgKi9cbiAgY29uZmlnOiBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZztcblxuICAvKipcbiAgICogVlBDIGZvciBkZXBsb3ltZW50XG4gICAqL1xuICB2cGM6IGVjMi5JVnBjO1xuXG4gIC8qKlxuICAgKiBLTVMga2V5IGZvciBlbmNyeXB0aW9uXG4gICAqL1xuICBrbXNLZXk6IGttcy5JS2V5O1xuXG4gIC8qKlxuICAgKiBTZWN1cml0eSBncm91cHMgZm9yIFJlZGlzIGFjY2Vzc1xuICAgKi9cbiAgc2VjdXJpdHlHcm91cHM6IGVjMi5TZWN1cml0eUdyb3VwW107XG59XG5cbi8qKlxuICogQ0RLIGNvbnN0cnVjdCBmb3IgdGhlIFJlZGlzL1ZhbGtleSBjYWNoZSBjbHVzdGVyXG4gKi9cbmV4cG9ydCBjbGFzcyBSZWRpcyBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBUaGUgYXV0aCB0b2tlbiBzZWNyZXQgZm9yIFJlZGlzXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgYXV0aFRva2VuOiBzZWNyZXRzbWFuYWdlci5TZWNyZXQ7XG5cbiAgLyoqXG4gICAqIFRoZSBSZWRpcyByZXBsaWNhdGlvbiBncm91cFxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IHJlcGxpY2F0aW9uR3JvdXA6IGVsYXN0aWNhY2hlLkNmblJlcGxpY2F0aW9uR3JvdXA7XG5cbiAgLyoqXG4gICAqIFRoZSBSZWRpcyBob3N0bmFtZVxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGhvc3RuYW1lOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFJlZGlzUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBhdXRoIHRva2VuIHNlY3JldFxuICAgIHRoaXMuYXV0aFRva2VuID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnUmVkaXNBdXRoVG9rZW4nLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYCR7aWR9IFJlZGlzIEF1dGggVG9rZW5gLFxuICAgICAgc2VjcmV0TmFtZTogYCR7aWR9L3JlZGlzL2F1dGgtdG9rZW5gLFxuICAgICAgZW5jcnlwdGlvbktleTogcHJvcHMua21zS2V5LFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgZXhjbHVkZVB1bmN0dWF0aW9uOiB0cnVlLFxuICAgICAgICBwYXNzd29yZExlbmd0aDogNjRcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBzdWJuZXQgZ3JvdXBcbiAgICBjb25zdCBzdWJuZXRHcm91cCA9IG5ldyBlbGFzdGljYWNoZS5DZm5TdWJuZXRHcm91cCh0aGlzLCAnUmVkaXNTdWJuZXRHcm91cCcsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgJHtpZH0tcmVkaXMtc3VibmV0c2AsXG4gICAgICBzdWJuZXRJZHM6IHByb3BzLnZwYy5wcml2YXRlU3VibmV0cy5tYXAoc3VibmV0ID0+IHN1Ym5ldC5zdWJuZXRJZClcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBzZWN1cml0eSBncm91cFxuICAgIGNvbnN0IHNlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ1JlZGlzU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgZGVzY3JpcHRpb246IGAke2lkfSBSZWRpcyBTZWN1cml0eSBHcm91cGAsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiBmYWxzZVxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgUmVkaXMgcG9ydCBmcm9tIG90aGVyIHNlY3VyaXR5IGdyb3Vwc1xuICAgIHByb3BzLnNlY3VyaXR5R3JvdXBzLmZvckVhY2goc2cgPT4ge1xuICAgICAgc2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgICAgZWMyLlBlZXIuc2VjdXJpdHlHcm91cElkKHNnLnNlY3VyaXR5R3JvdXBJZCksXG4gICAgICAgIGVjMi5Qb3J0LnRjcCg2Mzc5KSxcbiAgICAgICAgJ0FsbG93IFJlZGlzIGFjY2VzcyBmcm9tIEVDUyB0YXNrcydcbiAgICAgICk7XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIFJlZGlzIHJlcGxpY2F0aW9uIGdyb3VwXG4gICAgdGhpcy5yZXBsaWNhdGlvbkdyb3VwID0gbmV3IGVsYXN0aWNhY2hlLkNmblJlcGxpY2F0aW9uR3JvdXAodGhpcywgJ1JlZGlzJywge1xuICAgICAgcmVwbGljYXRpb25Hcm91cERlc2NyaXB0aW9uOiAnVmFsa2V5IChSZWRpcykgY2x1c3RlciBmb3IgQXV0aGVudGlrJyxcbiAgICAgIGF1dG9tYXRpY0ZhaWxvdmVyRW5hYmxlZDogcHJvcHMuY29uZmlnLnJlZGlzLmF1dG9tYXRpY0ZhaWxvdmVyRW5hYmxlZCxcbiAgICAgIGF0UmVzdEVuY3J5cHRpb25FbmFibGVkOiB0cnVlLFxuICAgICAgdHJhbnNpdEVuY3J5cHRpb25FbmFibGVkOiB0cnVlLFxuICAgICAgdHJhbnNpdEVuY3J5cHRpb25Nb2RlOiAncmVxdWlyZWQnLFxuICAgICAgYXV0aFRva2VuOiB0aGlzLmF1dGhUb2tlbi5zZWNyZXRWYWx1ZS51bnNhZmVVbndyYXAoKSxcbiAgICAgIGttc0tleUlkOiBwcm9wcy5rbXNLZXkua2V5QXJuLFxuICAgICAgY2FjaGVOb2RlVHlwZTogcHJvcHMuY29uZmlnLnJlZGlzLm5vZGVUeXBlLFxuICAgICAgY2FjaGVTdWJuZXRHcm91cE5hbWU6IHN1Ym5ldEdyb3VwLnJlZixcbiAgICAgIGVuZ2luZTogJ3ZhbGtleScsXG4gICAgICBlbmdpbmVWZXJzaW9uOiAnNy4yJyxcbiAgICAgIGF1dG9NaW5vclZlcnNpb25VcGdyYWRlOiB0cnVlLFxuICAgICAgbnVtQ2FjaGVDbHVzdGVyczogcHJvcHMuY29uZmlnLnJlZGlzLm51bUNhY2hlQ2x1c3RlcnMsXG4gICAgICBzZWN1cml0eUdyb3VwSWRzOiBbc2VjdXJpdHlHcm91cC5zZWN1cml0eUdyb3VwSWRdXG4gICAgfSk7XG5cbiAgICAvLyBTZXQgZGVwZW5kZW5jaWVzXG4gICAgdGhpcy5yZXBsaWNhdGlvbkdyb3VwLmFkZERlcGVuZGVuY3koc3VibmV0R3JvdXApO1xuXG4gICAgLy8gU3RvcmUgdGhlIGhvc3RuYW1lXG4gICAgdGhpcy5ob3N0bmFtZSA9IHRoaXMucmVwbGljYXRpb25Hcm91cC5hdHRyUHJpbWFyeUVuZFBvaW50QWRkcmVzcztcblxuICAgIC8vIENyZWF0ZSBvdXRwdXRzXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnUmVkaXNFbmRwb2ludCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmhvc3RuYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdSZWRpcyBjbHVzdGVyIGVuZHBvaW50J1xuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnUmVkaXNBdXRoVG9rZW5Bcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5hdXRoVG9rZW4uc2VjcmV0QXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdSZWRpcyBhdXRoIHRva2VuIHNlY3JldCBBUk4nXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==