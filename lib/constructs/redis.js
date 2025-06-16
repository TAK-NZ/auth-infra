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
            description: `${id}: Auth Token`,
            secretName: `${props.stackName}/Redis/Auth-Token`,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVkaXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJyZWRpcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQTs7R0FFRztBQUNILDJDQUF1QztBQUN2Qyw2Q0FNcUI7QUF1Q3JCOztHQUVHO0FBQ0gsTUFBYSxLQUFNLFNBQVEsc0JBQVM7SUFnQmxDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBaUI7UUFDekQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQiwrQkFBK0I7UUFDL0IsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLGdDQUFjLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUNqRSxXQUFXLEVBQUUsR0FBRyxFQUFFLGNBQWM7WUFDaEMsVUFBVSxFQUFFLEdBQUcsS0FBSyxDQUFDLFNBQVMsbUJBQW1CO1lBQ2pELGFBQWEsRUFBRSxLQUFLLENBQUMsTUFBTTtZQUMzQixvQkFBb0IsRUFBRTtnQkFDcEIsa0JBQWtCLEVBQUUsSUFBSTtnQkFDeEIsY0FBYyxFQUFFLEVBQUU7YUFDbkI7U0FDRixDQUFDLENBQUM7UUFFSCxzQkFBc0I7UUFDdEIsTUFBTSxXQUFXLEdBQUcsSUFBSSw2QkFBVyxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDM0UsV0FBVyxFQUFFLEdBQUcsRUFBRSxnQkFBZ0I7WUFDbEMsU0FBUyxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7U0FDbkUsQ0FBQyxDQUFDO1FBRUgsd0JBQXdCO1FBQ3hCLE1BQU0sYUFBYSxHQUFHLElBQUkscUJBQUcsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQ3RFLEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRztZQUNkLFdBQVcsRUFBRSxHQUFHLEVBQUUsdUJBQXVCO1lBQ3pDLGdCQUFnQixFQUFFLEtBQUs7U0FDeEIsQ0FBQyxDQUFDO1FBRUgsOENBQThDO1FBQzlDLEtBQUssQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxFQUFFO1lBQ2hDLGFBQWEsQ0FBQyxjQUFjLENBQzFCLHFCQUFHLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUMsZUFBZSxDQUFDLEVBQzVDLHFCQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFDbEIsbUNBQW1DLENBQ3BDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILHFDQUFxQztRQUNyQyxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSw2QkFBVyxDQUFDLG1CQUFtQixDQUFDLElBQUksRUFBRSxPQUFPLEVBQUU7WUFDekUsMkJBQTJCLEVBQUUsc0NBQXNDO1lBQ25FLHdCQUF3QixFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLHdCQUF3QjtZQUNyRSx1QkFBdUIsRUFBRSxJQUFJO1lBQzdCLHdCQUF3QixFQUFFLElBQUk7WUFDOUIscUJBQXFCLEVBQUUsVUFBVTtZQUNqQyxTQUFTLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsWUFBWSxFQUFFO1lBQ3BELFFBQVEsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLE1BQU07WUFDN0IsYUFBYSxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLFFBQVE7WUFDMUMsb0JBQW9CLEVBQUUsV0FBVyxDQUFDLEdBQUc7WUFDckMsTUFBTSxFQUFFLFFBQVE7WUFDaEIsYUFBYSxFQUFFLEtBQUs7WUFDcEIsdUJBQXVCLEVBQUUsSUFBSTtZQUM3QixnQkFBZ0IsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0I7WUFDckQsZ0JBQWdCLEVBQUUsQ0FBQyxhQUFhLENBQUMsZUFBZSxDQUFDO1NBQ2xELENBQUMsQ0FBQztRQUVILG1CQUFtQjtRQUNuQixJQUFJLENBQUMsZ0JBQWdCLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBRWpELHFCQUFxQjtRQUNyQixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQywwQkFBMEIsQ0FBQztRQUVqRSxpQkFBaUI7UUFDakIsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDbkMsS0FBSyxFQUFFLElBQUksQ0FBQyxRQUFRO1lBQ3BCLFdBQVcsRUFBRSx3QkFBd0I7U0FDdEMsQ0FBQyxDQUFDO1FBRUgsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUN2QyxLQUFLLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTO1lBQy9CLFdBQVcsRUFBRSw2QkFBNkI7U0FDM0MsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBdkZELHNCQXVGQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogUmVkaXMgQ29uc3RydWN0IC0gQ0RLIGltcGxlbWVudGF0aW9uIG9mIHRoZSBSZWRpcy9WYWxrZXkgY2FjaGVcbiAqL1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQge1xuICBhd3NfZWxhc3RpY2FjaGUgYXMgZWxhc3RpY2FjaGUsXG4gIGF3c19lYzIgYXMgZWMyLFxuICBhd3Nfc2VjcmV0c21hbmFnZXIgYXMgc2VjcmV0c21hbmFnZXIsXG4gIGF3c19rbXMgYXMga21zLFxuICBDZm5PdXRwdXRcbn0gZnJvbSAnYXdzLWNkay1saWInO1xuXG5pbXBvcnQgdHlwZSB7IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi4vZW52aXJvbm1lbnQtY29uZmlnJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciB0aGUgUmVkaXMgY29uc3RydWN0XG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgUmVkaXNQcm9wcyB7XG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBuYW1lIChlLmcuICdwcm9kJywgJ2RldicsIGV0Yy4pXG4gICAqL1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBGdWxsIHN0YWNrIG5hbWUgKGUuZy4sICdUQUstRGVtby1BdXRoSW5mcmEnKVxuICAgKi9cbiAgc3RhY2tOYW1lOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEVudmlyb25tZW50IGNvbmZpZ3VyYXRpb25cbiAgICovXG4gIGNvbmZpZzogQXV0aEluZnJhRW52aXJvbm1lbnRDb25maWc7XG5cbiAgLyoqXG4gICAqIFZQQyBmb3IgZGVwbG95bWVudFxuICAgKi9cbiAgdnBjOiBlYzIuSVZwYztcblxuICAvKipcbiAgICogS01TIGtleSBmb3IgZW5jcnlwdGlvblxuICAgKi9cbiAga21zS2V5OiBrbXMuSUtleTtcblxuICAvKipcbiAgICogU2VjdXJpdHkgZ3JvdXBzIGZvciBSZWRpcyBhY2Nlc3NcbiAgICovXG4gIHNlY3VyaXR5R3JvdXBzOiBlYzIuU2VjdXJpdHlHcm91cFtdO1xufVxuXG4vKipcbiAqIENESyBjb25zdHJ1Y3QgZm9yIHRoZSBSZWRpcy9WYWxrZXkgY2FjaGUgY2x1c3RlclxuICovXG5leHBvcnQgY2xhc3MgUmVkaXMgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICAvKipcbiAgICogVGhlIGF1dGggdG9rZW4gc2VjcmV0IGZvciBSZWRpc1xuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGF1dGhUb2tlbjogc2VjcmV0c21hbmFnZXIuU2VjcmV0O1xuXG4gIC8qKlxuICAgKiBUaGUgUmVkaXMgcmVwbGljYXRpb24gZ3JvdXBcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSByZXBsaWNhdGlvbkdyb3VwOiBlbGFzdGljYWNoZS5DZm5SZXBsaWNhdGlvbkdyb3VwO1xuXG4gIC8qKlxuICAgKiBUaGUgUmVkaXMgaG9zdG5hbWVcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBob3N0bmFtZTogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBSZWRpc1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIC8vIENyZWF0ZSB0aGUgYXV0aCB0b2tlbiBzZWNyZXRcbiAgICB0aGlzLmF1dGhUb2tlbiA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ1JlZGlzQXV0aFRva2VuJywge1xuICAgICAgZGVzY3JpcHRpb246IGAke2lkfTogQXV0aCBUb2tlbmAsXG4gICAgICBzZWNyZXROYW1lOiBgJHtwcm9wcy5zdGFja05hbWV9L1JlZGlzL0F1dGgtVG9rZW5gLFxuICAgICAgZW5jcnlwdGlvbktleTogcHJvcHMua21zS2V5LFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgZXhjbHVkZVB1bmN0dWF0aW9uOiB0cnVlLFxuICAgICAgICBwYXNzd29yZExlbmd0aDogNjRcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBzdWJuZXQgZ3JvdXBcbiAgICBjb25zdCBzdWJuZXRHcm91cCA9IG5ldyBlbGFzdGljYWNoZS5DZm5TdWJuZXRHcm91cCh0aGlzLCAnUmVkaXNTdWJuZXRHcm91cCcsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgJHtpZH0tcmVkaXMtc3VibmV0c2AsXG4gICAgICBzdWJuZXRJZHM6IHByb3BzLnZwYy5wcml2YXRlU3VibmV0cy5tYXAoc3VibmV0ID0+IHN1Ym5ldC5zdWJuZXRJZClcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBzZWN1cml0eSBncm91cFxuICAgIGNvbnN0IHNlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ1JlZGlzU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgZGVzY3JpcHRpb246IGAke2lkfSBSZWRpcyBTZWN1cml0eSBHcm91cGAsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiBmYWxzZVxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgUmVkaXMgcG9ydCBmcm9tIG90aGVyIHNlY3VyaXR5IGdyb3Vwc1xuICAgIHByb3BzLnNlY3VyaXR5R3JvdXBzLmZvckVhY2goc2cgPT4ge1xuICAgICAgc2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgICAgZWMyLlBlZXIuc2VjdXJpdHlHcm91cElkKHNnLnNlY3VyaXR5R3JvdXBJZCksXG4gICAgICAgIGVjMi5Qb3J0LnRjcCg2Mzc5KSxcbiAgICAgICAgJ0FsbG93IFJlZGlzIGFjY2VzcyBmcm9tIEVDUyB0YXNrcydcbiAgICAgICk7XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIFJlZGlzIHJlcGxpY2F0aW9uIGdyb3VwXG4gICAgdGhpcy5yZXBsaWNhdGlvbkdyb3VwID0gbmV3IGVsYXN0aWNhY2hlLkNmblJlcGxpY2F0aW9uR3JvdXAodGhpcywgJ1JlZGlzJywge1xuICAgICAgcmVwbGljYXRpb25Hcm91cERlc2NyaXB0aW9uOiAnVmFsa2V5IChSZWRpcykgY2x1c3RlciBmb3IgQXV0aGVudGlrJyxcbiAgICAgIGF1dG9tYXRpY0ZhaWxvdmVyRW5hYmxlZDogcHJvcHMuY29uZmlnLnJlZGlzLmF1dG9tYXRpY0ZhaWxvdmVyRW5hYmxlZCxcbiAgICAgIGF0UmVzdEVuY3J5cHRpb25FbmFibGVkOiB0cnVlLFxuICAgICAgdHJhbnNpdEVuY3J5cHRpb25FbmFibGVkOiB0cnVlLFxuICAgICAgdHJhbnNpdEVuY3J5cHRpb25Nb2RlOiAncmVxdWlyZWQnLFxuICAgICAgYXV0aFRva2VuOiB0aGlzLmF1dGhUb2tlbi5zZWNyZXRWYWx1ZS51bnNhZmVVbndyYXAoKSxcbiAgICAgIGttc0tleUlkOiBwcm9wcy5rbXNLZXkua2V5QXJuLFxuICAgICAgY2FjaGVOb2RlVHlwZTogcHJvcHMuY29uZmlnLnJlZGlzLm5vZGVUeXBlLFxuICAgICAgY2FjaGVTdWJuZXRHcm91cE5hbWU6IHN1Ym5ldEdyb3VwLnJlZixcbiAgICAgIGVuZ2luZTogJ3ZhbGtleScsXG4gICAgICBlbmdpbmVWZXJzaW9uOiAnNy4yJyxcbiAgICAgIGF1dG9NaW5vclZlcnNpb25VcGdyYWRlOiB0cnVlLFxuICAgICAgbnVtQ2FjaGVDbHVzdGVyczogcHJvcHMuY29uZmlnLnJlZGlzLm51bUNhY2hlQ2x1c3RlcnMsXG4gICAgICBzZWN1cml0eUdyb3VwSWRzOiBbc2VjdXJpdHlHcm91cC5zZWN1cml0eUdyb3VwSWRdXG4gICAgfSk7XG5cbiAgICAvLyBTZXQgZGVwZW5kZW5jaWVzXG4gICAgdGhpcy5yZXBsaWNhdGlvbkdyb3VwLmFkZERlcGVuZGVuY3koc3VibmV0R3JvdXApO1xuXG4gICAgLy8gU3RvcmUgdGhlIGhvc3RuYW1lXG4gICAgdGhpcy5ob3N0bmFtZSA9IHRoaXMucmVwbGljYXRpb25Hcm91cC5hdHRyUHJpbWFyeUVuZFBvaW50QWRkcmVzcztcblxuICAgIC8vIENyZWF0ZSBvdXRwdXRzXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnUmVkaXNFbmRwb2ludCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmhvc3RuYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdSZWRpcyBjbHVzdGVyIGVuZHBvaW50J1xuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnUmVkaXNBdXRoVG9rZW5Bcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5hdXRoVG9rZW4uc2VjcmV0QXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdSZWRpcyBhdXRoIHRva2VuIHNlY3JldCBBUk4nXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==