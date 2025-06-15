/**
 * Redis Construct - CDK implementation of the Redis/Valkey cache
 */
import { Construct } from 'constructs';
import { aws_elasticache as elasticache, aws_ec2 as ec2, aws_secretsmanager as secretsmanager, CfnOutput } from 'aws-cdk-lib';
/**
 * CDK construct for the Redis/Valkey cache cluster
 */
export class Redis extends Construct {
    constructor(scope, id, props) {
        super(scope, id);
        // Create the auth token secret
        this.authToken = new secretsmanager.Secret(this, 'RedisAuthToken', {
            description: `${id} Redis Auth Token`,
            secretName: `${id}/redis/auth-token`,
            encryptionKey: props.kmsKey,
            generateSecretString: {
                excludePunctuation: true,
                passwordLength: 64
            }
        });
        // Create subnet group
        const subnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
            description: `${id}-redis-subnets`,
            subnetIds: props.vpc.privateSubnets.map(subnet => subnet.subnetId)
        });
        // Create security group
        const securityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
            vpc: props.vpc,
            description: `${id} Redis Security Group`,
            allowAllOutbound: false
        });
        // Allow Redis port from other security groups
        props.securityGroups.forEach(sg => {
            securityGroup.addIngressRule(ec2.Peer.securityGroupId(sg.securityGroupId), ec2.Port.tcp(6379), 'Allow Redis access from ECS tasks');
        });
        // Create the Redis replication group
        this.replicationGroup = new elasticache.CfnReplicationGroup(this, 'Redis', {
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
        new CfnOutput(this, 'RedisEndpoint', {
            value: this.hostname,
            description: 'Redis cluster endpoint'
        });
        new CfnOutput(this, 'RedisAuthTokenArn', {
            value: this.authToken.secretArn,
            description: 'Redis auth token secret ARN'
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVkaXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJyZWRpcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7R0FFRztBQUNILE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDdkMsT0FBTyxFQUNMLGVBQWUsSUFBSSxXQUFXLEVBQzlCLE9BQU8sSUFBSSxHQUFHLEVBQ2Qsa0JBQWtCLElBQUksY0FBYyxFQUVwQyxTQUFTLEVBQ1YsTUFBTSxhQUFhLENBQUM7QUFrQ3JCOztHQUVHO0FBQ0gsTUFBTSxPQUFPLEtBQU0sU0FBUSxTQUFTO0lBZ0JsQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQWlCO1FBQ3pELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsK0JBQStCO1FBQy9CLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxjQUFjLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUNqRSxXQUFXLEVBQUUsR0FBRyxFQUFFLG1CQUFtQjtZQUNyQyxVQUFVLEVBQUUsR0FBRyxFQUFFLG1CQUFtQjtZQUNwQyxhQUFhLEVBQUUsS0FBSyxDQUFDLE1BQU07WUFDM0Isb0JBQW9CLEVBQUU7Z0JBQ3BCLGtCQUFrQixFQUFFLElBQUk7Z0JBQ3hCLGNBQWMsRUFBRSxFQUFFO2FBQ25CO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsc0JBQXNCO1FBQ3RCLE1BQU0sV0FBVyxHQUFHLElBQUksV0FBVyxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDM0UsV0FBVyxFQUFFLEdBQUcsRUFBRSxnQkFBZ0I7WUFDbEMsU0FBUyxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7U0FDbkUsQ0FBQyxDQUFDO1FBRUgsd0JBQXdCO1FBQ3hCLE1BQU0sYUFBYSxHQUFHLElBQUksR0FBRyxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLEVBQUU7WUFDdEUsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHO1lBQ2QsV0FBVyxFQUFFLEdBQUcsRUFBRSx1QkFBdUI7WUFDekMsZ0JBQWdCLEVBQUUsS0FBSztTQUN4QixDQUFDLENBQUM7UUFFSCw4Q0FBOEM7UUFDOUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEVBQUU7WUFDaEMsYUFBYSxDQUFDLGNBQWMsQ0FDMUIsR0FBRyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDLGVBQWUsQ0FBQyxFQUM1QyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFDbEIsbUNBQW1DLENBQ3BDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILHFDQUFxQztRQUNyQyxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxXQUFXLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRTtZQUN6RSwyQkFBMkIsRUFBRSxzQ0FBc0M7WUFDbkUsd0JBQXdCLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNO1lBQzdDLHVCQUF1QixFQUFFLElBQUk7WUFDN0Isd0JBQXdCLEVBQUUsSUFBSTtZQUM5QixxQkFBcUIsRUFBRSxVQUFVO1lBQ2pDLFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxZQUFZLEVBQUU7WUFDcEQsUUFBUSxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTTtZQUM3QixhQUFhLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxrQkFBa0I7WUFDOUMsb0JBQW9CLEVBQUUsV0FBVyxDQUFDLEdBQUc7WUFDckMsTUFBTSxFQUFFLFFBQVE7WUFDaEIsYUFBYSxFQUFFLEtBQUs7WUFDcEIsdUJBQXVCLEVBQUUsSUFBSTtZQUM3QixnQkFBZ0IsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLHFCQUFxQjtZQUNwRCxnQkFBZ0IsRUFBRSxDQUFDLGFBQWEsQ0FBQyxlQUFlLENBQUM7U0FDbEQsQ0FBQyxDQUFDO1FBRUgsbUJBQW1CO1FBQ25CLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLENBQUM7UUFFakQscUJBQXFCO1FBQ3JCLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLDBCQUEwQixDQUFDO1FBRWpFLGlCQUFpQjtRQUNqQixJQUFJLFNBQVMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQ25DLEtBQUssRUFBRSxJQUFJLENBQUMsUUFBUTtZQUNwQixXQUFXLEVBQUUsd0JBQXdCO1NBQ3RDLENBQUMsQ0FBQztRQUVILElBQUksU0FBUyxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUN2QyxLQUFLLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTO1lBQy9CLFdBQVcsRUFBRSw2QkFBNkI7U0FDM0MsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBSZWRpcyBDb25zdHJ1Y3QgLSBDREsgaW1wbGVtZW50YXRpb24gb2YgdGhlIFJlZGlzL1ZhbGtleSBjYWNoZVxuICovXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7XG4gIGF3c19lbGFzdGljYWNoZSBhcyBlbGFzdGljYWNoZSxcbiAgYXdzX2VjMiBhcyBlYzIsXG4gIGF3c19zZWNyZXRzbWFuYWdlciBhcyBzZWNyZXRzbWFuYWdlcixcbiAgYXdzX2ttcyBhcyBrbXMsXG4gIENmbk91dHB1dFxufSBmcm9tICdhd3MtY2RrLWxpYic7XG5cbmltcG9ydCB0eXBlIHsgQmFzZUNvbmZpZyB9IGZyb20gJy4uL2Vudmlyb25tZW50LWNvbmZpZyc7XG5cbi8qKlxuICogUHJvcGVydGllcyBmb3IgdGhlIFJlZGlzIGNvbnN0cnVjdFxuICovXG5leHBvcnQgaW50ZXJmYWNlIFJlZGlzUHJvcHMge1xuICAvKipcbiAgICogRW52aXJvbm1lbnQgbmFtZSAoZS5nLiAncHJvZCcsICdkZXYnLCBldGMuKVxuICAgKi9cbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcblxuICAvKipcbiAgICogRW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxuICAgKi9cbiAgY29uZmlnOiBCYXNlQ29uZmlnO1xuXG4gIC8qKlxuICAgKiBWUEMgZm9yIGRlcGxveW1lbnRcbiAgICovXG4gIHZwYzogZWMyLklWcGM7XG5cbiAgLyoqXG4gICAqIEtNUyBrZXkgZm9yIGVuY3J5cHRpb25cbiAgICovXG4gIGttc0tleToga21zLklLZXk7XG5cbiAgLyoqXG4gICAqIFNlY3VyaXR5IGdyb3VwcyBmb3IgUmVkaXMgYWNjZXNzXG4gICAqL1xuICBzZWN1cml0eUdyb3VwczogZWMyLlNlY3VyaXR5R3JvdXBbXTtcbn1cblxuLyoqXG4gKiBDREsgY29uc3RydWN0IGZvciB0aGUgUmVkaXMvVmFsa2V5IGNhY2hlIGNsdXN0ZXJcbiAqL1xuZXhwb3J0IGNsYXNzIFJlZGlzIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgLyoqXG4gICAqIFRoZSBhdXRoIHRva2VuIHNlY3JldCBmb3IgUmVkaXNcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBhdXRoVG9rZW46IHNlY3JldHNtYW5hZ2VyLlNlY3JldDtcblxuICAvKipcbiAgICogVGhlIFJlZGlzIHJlcGxpY2F0aW9uIGdyb3VwXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgcmVwbGljYXRpb25Hcm91cDogZWxhc3RpY2FjaGUuQ2ZuUmVwbGljYXRpb25Hcm91cDtcblxuICAvKipcbiAgICogVGhlIFJlZGlzIGhvc3RuYW1lXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgaG9zdG5hbWU6IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogUmVkaXNQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIGF1dGggdG9rZW4gc2VjcmV0XG4gICAgdGhpcy5hdXRoVG9rZW4gPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdSZWRpc0F1dGhUb2tlbicsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgJHtpZH0gUmVkaXMgQXV0aCBUb2tlbmAsXG4gICAgICBzZWNyZXROYW1lOiBgJHtpZH0vcmVkaXMvYXV0aC10b2tlbmAsXG4gICAgICBlbmNyeXB0aW9uS2V5OiBwcm9wcy5rbXNLZXksXG4gICAgICBnZW5lcmF0ZVNlY3JldFN0cmluZzoge1xuICAgICAgICBleGNsdWRlUHVuY3R1YXRpb246IHRydWUsXG4gICAgICAgIHBhc3N3b3JkTGVuZ3RoOiA2NFxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHN1Ym5ldCBncm91cFxuICAgIGNvbnN0IHN1Ym5ldEdyb3VwID0gbmV3IGVsYXN0aWNhY2hlLkNmblN1Ym5ldEdyb3VwKHRoaXMsICdSZWRpc1N1Ym5ldEdyb3VwJywge1xuICAgICAgZGVzY3JpcHRpb246IGAke2lkfS1yZWRpcy1zdWJuZXRzYCxcbiAgICAgIHN1Ym5ldElkczogcHJvcHMudnBjLnByaXZhdGVTdWJuZXRzLm1hcChzdWJuZXQgPT4gc3VibmV0LnN1Ym5ldElkKVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHNlY3VyaXR5IGdyb3VwXG4gICAgY29uc3Qgc2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnUmVkaXNTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICBkZXNjcmlwdGlvbjogYCR7aWR9IFJlZGlzIFNlY3VyaXR5IEdyb3VwYCxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IGZhbHNlXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBSZWRpcyBwb3J0IGZyb20gb3RoZXIgc2VjdXJpdHkgZ3JvdXBzXG4gICAgcHJvcHMuc2VjdXJpdHlHcm91cHMuZm9yRWFjaChzZyA9PiB7XG4gICAgICBzZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgICBlYzIuUGVlci5zZWN1cml0eUdyb3VwSWQoc2cuc2VjdXJpdHlHcm91cElkKSxcbiAgICAgICAgZWMyLlBvcnQudGNwKDYzNzkpLFxuICAgICAgICAnQWxsb3cgUmVkaXMgYWNjZXNzIGZyb20gRUNTIHRhc2tzJ1xuICAgICAgKTtcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSB0aGUgUmVkaXMgcmVwbGljYXRpb24gZ3JvdXBcbiAgICB0aGlzLnJlcGxpY2F0aW9uR3JvdXAgPSBuZXcgZWxhc3RpY2FjaGUuQ2ZuUmVwbGljYXRpb25Hcm91cCh0aGlzLCAnUmVkaXMnLCB7XG4gICAgICByZXBsaWNhdGlvbkdyb3VwRGVzY3JpcHRpb246ICdWYWxrZXkgKFJlZGlzKSBjbHVzdGVyIGZvciBBdXRoZW50aWsnLFxuICAgICAgYXV0b21hdGljRmFpbG92ZXJFbmFibGVkOiBwcm9wcy5jb25maWcuaXNQcm9kLFxuICAgICAgYXRSZXN0RW5jcnlwdGlvbkVuYWJsZWQ6IHRydWUsXG4gICAgICB0cmFuc2l0RW5jcnlwdGlvbkVuYWJsZWQ6IHRydWUsXG4gICAgICB0cmFuc2l0RW5jcnlwdGlvbk1vZGU6ICdyZXF1aXJlZCcsXG4gICAgICBhdXRoVG9rZW46IHRoaXMuYXV0aFRva2VuLnNlY3JldFZhbHVlLnVuc2FmZVVud3JhcCgpLFxuICAgICAga21zS2V5SWQ6IHByb3BzLmttc0tleS5rZXlBcm4sXG4gICAgICBjYWNoZU5vZGVUeXBlOiBwcm9wcy5jb25maWcucmVkaXNDYWNoZU5vZGVUeXBlLFxuICAgICAgY2FjaGVTdWJuZXRHcm91cE5hbWU6IHN1Ym5ldEdyb3VwLnJlZixcbiAgICAgIGVuZ2luZTogJ3ZhbGtleScsXG4gICAgICBlbmdpbmVWZXJzaW9uOiAnNy4yJyxcbiAgICAgIGF1dG9NaW5vclZlcnNpb25VcGdyYWRlOiB0cnVlLFxuICAgICAgbnVtQ2FjaGVDbHVzdGVyczogcHJvcHMuY29uZmlnLnJlZGlzTnVtQ2FjaGVDbHVzdGVycyxcbiAgICAgIHNlY3VyaXR5R3JvdXBJZHM6IFtzZWN1cml0eUdyb3VwLnNlY3VyaXR5R3JvdXBJZF1cbiAgICB9KTtcblxuICAgIC8vIFNldCBkZXBlbmRlbmNpZXNcbiAgICB0aGlzLnJlcGxpY2F0aW9uR3JvdXAuYWRkRGVwZW5kZW5jeShzdWJuZXRHcm91cCk7XG5cbiAgICAvLyBTdG9yZSB0aGUgaG9zdG5hbWVcbiAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5yZXBsaWNhdGlvbkdyb3VwLmF0dHJQcmltYXJ5RW5kUG9pbnRBZGRyZXNzO1xuXG4gICAgLy8gQ3JlYXRlIG91dHB1dHNcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdSZWRpc0VuZHBvaW50Jywge1xuICAgICAgdmFsdWU6IHRoaXMuaG9zdG5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1JlZGlzIGNsdXN0ZXIgZW5kcG9pbnQnXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdSZWRpc0F1dGhUb2tlbkFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmF1dGhUb2tlbi5zZWNyZXRBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ1JlZGlzIGF1dGggdG9rZW4gc2VjcmV0IEFSTidcbiAgICB9KTtcbiAgfVxufVxuIl19