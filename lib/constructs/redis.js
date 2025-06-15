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
            automaticFailoverEnabled: props.config.isProd,
            atRestEncryptionEnabled: true,
            transitEncryptionEnabled: true,
            transitEncryptionMode: 'required',
            authToken: this.authToken.secretValue.unsafeUnwrap(),
            kmsKeyId: props.kmsKey.keyArn,
            cacheNodeType: props.config.redisCacheNodeType,
            cacheSubnetGroupName: subnetGroup.ref,
            engine: 'valkey',
            engineVersion: '7.2',
            autoMinorVersionUpgrade: true,
            numCacheClusters: props.config.redisNumCacheClusters,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVkaXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJyZWRpcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQTs7R0FFRztBQUNILDJDQUF1QztBQUN2Qyw2Q0FNcUI7QUFrQ3JCOztHQUVHO0FBQ0gsTUFBYSxLQUFNLFNBQVEsc0JBQVM7SUFnQmxDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBaUI7UUFDekQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQiwrQkFBK0I7UUFDL0IsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLGdDQUFjLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUNqRSxXQUFXLEVBQUUsR0FBRyxFQUFFLG1CQUFtQjtZQUNyQyxVQUFVLEVBQUUsR0FBRyxFQUFFLG1CQUFtQjtZQUNwQyxhQUFhLEVBQUUsS0FBSyxDQUFDLE1BQU07WUFDM0Isb0JBQW9CLEVBQUU7Z0JBQ3BCLGtCQUFrQixFQUFFLElBQUk7Z0JBQ3hCLGNBQWMsRUFBRSxFQUFFO2FBQ25CO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsc0JBQXNCO1FBQ3RCLE1BQU0sV0FBVyxHQUFHLElBQUksNkJBQVcsQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQzNFLFdBQVcsRUFBRSxHQUFHLEVBQUUsZ0JBQWdCO1lBQ2xDLFNBQVMsRUFBRSxLQUFLLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDO1NBQ25FLENBQUMsQ0FBQztRQUVILHdCQUF3QjtRQUN4QixNQUFNLGFBQWEsR0FBRyxJQUFJLHFCQUFHLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUN0RSxHQUFHLEVBQUUsS0FBSyxDQUFDLEdBQUc7WUFDZCxXQUFXLEVBQUUsR0FBRyxFQUFFLHVCQUF1QjtZQUN6QyxnQkFBZ0IsRUFBRSxLQUFLO1NBQ3hCLENBQUMsQ0FBQztRQUVILDhDQUE4QztRQUM5QyxLQUFLLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsRUFBRTtZQUNoQyxhQUFhLENBQUMsY0FBYyxDQUMxQixxQkFBRyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDLGVBQWUsQ0FBQyxFQUM1QyxxQkFBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQ2xCLG1DQUFtQyxDQUNwQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCxxQ0FBcUM7UUFDckMsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksNkJBQVcsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFO1lBQ3pFLDJCQUEyQixFQUFFLHNDQUFzQztZQUNuRSx3QkFBd0IsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLE1BQU07WUFDN0MsdUJBQXVCLEVBQUUsSUFBSTtZQUM3Qix3QkFBd0IsRUFBRSxJQUFJO1lBQzlCLHFCQUFxQixFQUFFLFVBQVU7WUFDakMsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLFlBQVksRUFBRTtZQUNwRCxRQUFRLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNO1lBQzdCLGFBQWEsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLGtCQUFrQjtZQUM5QyxvQkFBb0IsRUFBRSxXQUFXLENBQUMsR0FBRztZQUNyQyxNQUFNLEVBQUUsUUFBUTtZQUNoQixhQUFhLEVBQUUsS0FBSztZQUNwQix1QkFBdUIsRUFBRSxJQUFJO1lBQzdCLGdCQUFnQixFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMscUJBQXFCO1lBQ3BELGdCQUFnQixFQUFFLENBQUMsYUFBYSxDQUFDLGVBQWUsQ0FBQztTQUNsRCxDQUFDLENBQUM7UUFFSCxtQkFBbUI7UUFDbkIsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUVqRCxxQkFBcUI7UUFDckIsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsMEJBQTBCLENBQUM7UUFFakUsaUJBQWlCO1FBQ2pCLElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQ25DLEtBQUssRUFBRSxJQUFJLENBQUMsUUFBUTtZQUNwQixXQUFXLEVBQUUsd0JBQXdCO1NBQ3RDLENBQUMsQ0FBQztRQUVILElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDdkMsS0FBSyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUztZQUMvQixXQUFXLEVBQUUsNkJBQTZCO1NBQzNDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXZGRCxzQkF1RkMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFJlZGlzIENvbnN0cnVjdCAtIENESyBpbXBsZW1lbnRhdGlvbiBvZiB0aGUgUmVkaXMvVmFsa2V5IGNhY2hlXG4gKi9cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHtcbiAgYXdzX2VsYXN0aWNhY2hlIGFzIGVsYXN0aWNhY2hlLFxuICBhd3NfZWMyIGFzIGVjMixcbiAgYXdzX3NlY3JldHNtYW5hZ2VyIGFzIHNlY3JldHNtYW5hZ2VyLFxuICBhd3Nfa21zIGFzIGttcyxcbiAgQ2ZuT3V0cHV0XG59IGZyb20gJ2F3cy1jZGstbGliJztcblxuaW1wb3J0IHR5cGUgeyBCYXNlQ29uZmlnIH0gZnJvbSAnLi4vZW52aXJvbm1lbnQtY29uZmlnJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciB0aGUgUmVkaXMgY29uc3RydWN0XG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgUmVkaXNQcm9wcyB7XG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBuYW1lIChlLmcuICdwcm9kJywgJ2RldicsIGV0Yy4pXG4gICAqL1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBjb25maWd1cmF0aW9uXG4gICAqL1xuICBjb25maWc6IEJhc2VDb25maWc7XG5cbiAgLyoqXG4gICAqIFZQQyBmb3IgZGVwbG95bWVudFxuICAgKi9cbiAgdnBjOiBlYzIuSVZwYztcblxuICAvKipcbiAgICogS01TIGtleSBmb3IgZW5jcnlwdGlvblxuICAgKi9cbiAga21zS2V5OiBrbXMuSUtleTtcblxuICAvKipcbiAgICogU2VjdXJpdHkgZ3JvdXBzIGZvciBSZWRpcyBhY2Nlc3NcbiAgICovXG4gIHNlY3VyaXR5R3JvdXBzOiBlYzIuU2VjdXJpdHlHcm91cFtdO1xufVxuXG4vKipcbiAqIENESyBjb25zdHJ1Y3QgZm9yIHRoZSBSZWRpcy9WYWxrZXkgY2FjaGUgY2x1c3RlclxuICovXG5leHBvcnQgY2xhc3MgUmVkaXMgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICAvKipcbiAgICogVGhlIGF1dGggdG9rZW4gc2VjcmV0IGZvciBSZWRpc1xuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGF1dGhUb2tlbjogc2VjcmV0c21hbmFnZXIuU2VjcmV0O1xuXG4gIC8qKlxuICAgKiBUaGUgUmVkaXMgcmVwbGljYXRpb24gZ3JvdXBcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSByZXBsaWNhdGlvbkdyb3VwOiBlbGFzdGljYWNoZS5DZm5SZXBsaWNhdGlvbkdyb3VwO1xuXG4gIC8qKlxuICAgKiBUaGUgUmVkaXMgaG9zdG5hbWVcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBob3N0bmFtZTogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBSZWRpc1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIC8vIENyZWF0ZSB0aGUgYXV0aCB0b2tlbiBzZWNyZXRcbiAgICB0aGlzLmF1dGhUb2tlbiA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ1JlZGlzQXV0aFRva2VuJywge1xuICAgICAgZGVzY3JpcHRpb246IGAke2lkfSBSZWRpcyBBdXRoIFRva2VuYCxcbiAgICAgIHNlY3JldE5hbWU6IGAke2lkfS9yZWRpcy9hdXRoLXRva2VuYCxcbiAgICAgIGVuY3J5cHRpb25LZXk6IHByb3BzLmttc0tleSxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIGV4Y2x1ZGVQdW5jdHVhdGlvbjogdHJ1ZSxcbiAgICAgICAgcGFzc3dvcmRMZW5ndGg6IDY0XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgc3VibmV0IGdyb3VwXG4gICAgY29uc3Qgc3VibmV0R3JvdXAgPSBuZXcgZWxhc3RpY2FjaGUuQ2ZuU3VibmV0R3JvdXAodGhpcywgJ1JlZGlzU3VibmV0R3JvdXAnLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYCR7aWR9LXJlZGlzLXN1Ym5ldHNgLFxuICAgICAgc3VibmV0SWRzOiBwcm9wcy52cGMucHJpdmF0ZVN1Ym5ldHMubWFwKHN1Ym5ldCA9PiBzdWJuZXQuc3VibmV0SWQpXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgc2VjdXJpdHkgZ3JvdXBcbiAgICBjb25zdCBzZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdSZWRpc1NlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiBgJHtpZH0gUmVkaXMgU2VjdXJpdHkgR3JvdXBgLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogZmFsc2VcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IFJlZGlzIHBvcnQgZnJvbSBvdGhlciBzZWN1cml0eSBncm91cHNcbiAgICBwcm9wcy5zZWN1cml0eUdyb3Vwcy5mb3JFYWNoKHNnID0+IHtcbiAgICAgIHNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICAgIGVjMi5QZWVyLnNlY3VyaXR5R3JvdXBJZChzZy5zZWN1cml0eUdyb3VwSWQpLFxuICAgICAgICBlYzIuUG9ydC50Y3AoNjM3OSksXG4gICAgICAgICdBbGxvdyBSZWRpcyBhY2Nlc3MgZnJvbSBFQ1MgdGFza3MnXG4gICAgICApO1xuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBSZWRpcyByZXBsaWNhdGlvbiBncm91cFxuICAgIHRoaXMucmVwbGljYXRpb25Hcm91cCA9IG5ldyBlbGFzdGljYWNoZS5DZm5SZXBsaWNhdGlvbkdyb3VwKHRoaXMsICdSZWRpcycsIHtcbiAgICAgIHJlcGxpY2F0aW9uR3JvdXBEZXNjcmlwdGlvbjogJ1ZhbGtleSAoUmVkaXMpIGNsdXN0ZXIgZm9yIEF1dGhlbnRpaycsXG4gICAgICBhdXRvbWF0aWNGYWlsb3ZlckVuYWJsZWQ6IHByb3BzLmNvbmZpZy5pc1Byb2QsXG4gICAgICBhdFJlc3RFbmNyeXB0aW9uRW5hYmxlZDogdHJ1ZSxcbiAgICAgIHRyYW5zaXRFbmNyeXB0aW9uRW5hYmxlZDogdHJ1ZSxcbiAgICAgIHRyYW5zaXRFbmNyeXB0aW9uTW9kZTogJ3JlcXVpcmVkJyxcbiAgICAgIGF1dGhUb2tlbjogdGhpcy5hdXRoVG9rZW4uc2VjcmV0VmFsdWUudW5zYWZlVW53cmFwKCksXG4gICAgICBrbXNLZXlJZDogcHJvcHMua21zS2V5LmtleUFybixcbiAgICAgIGNhY2hlTm9kZVR5cGU6IHByb3BzLmNvbmZpZy5yZWRpc0NhY2hlTm9kZVR5cGUsXG4gICAgICBjYWNoZVN1Ym5ldEdyb3VwTmFtZTogc3VibmV0R3JvdXAucmVmLFxuICAgICAgZW5naW5lOiAndmFsa2V5JyxcbiAgICAgIGVuZ2luZVZlcnNpb246ICc3LjInLFxuICAgICAgYXV0b01pbm9yVmVyc2lvblVwZ3JhZGU6IHRydWUsXG4gICAgICBudW1DYWNoZUNsdXN0ZXJzOiBwcm9wcy5jb25maWcucmVkaXNOdW1DYWNoZUNsdXN0ZXJzLFxuICAgICAgc2VjdXJpdHlHcm91cElkczogW3NlY3VyaXR5R3JvdXAuc2VjdXJpdHlHcm91cElkXVxuICAgIH0pO1xuXG4gICAgLy8gU2V0IGRlcGVuZGVuY2llc1xuICAgIHRoaXMucmVwbGljYXRpb25Hcm91cC5hZGREZXBlbmRlbmN5KHN1Ym5ldEdyb3VwKTtcblxuICAgIC8vIFN0b3JlIHRoZSBob3N0bmFtZVxuICAgIHRoaXMuaG9zdG5hbWUgPSB0aGlzLnJlcGxpY2F0aW9uR3JvdXAuYXR0clByaW1hcnlFbmRQb2ludEFkZHJlc3M7XG5cbiAgICAvLyBDcmVhdGUgb3V0cHV0c1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ1JlZGlzRW5kcG9pbnQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5ob3N0bmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUmVkaXMgY2x1c3RlciBlbmRwb2ludCdcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ1JlZGlzQXV0aFRva2VuQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuYXV0aFRva2VuLnNlY3JldEFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnUmVkaXMgYXV0aCB0b2tlbiBzZWNyZXQgQVJOJ1xuICAgIH0pO1xuICB9XG59XG4iXX0=