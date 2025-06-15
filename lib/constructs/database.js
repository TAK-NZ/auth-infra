"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Database = void 0;
/**
 * Database Construct - CDK implementation of the PostgreSQL database
 */
const constructs_1 = require("constructs");
const aws_cdk_lib_1 = require("aws-cdk-lib");
/**
 * CDK construct for the PostgreSQL database cluster
 */
class Database extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        // Create the master secret
        this.masterSecret = new aws_cdk_lib_1.aws_secretsmanager.Secret(this, 'DBMasterSecret', {
            description: `${id} Aurora PostgreSQL Master Password`,
            secretName: `${id}/rds/secret`,
            encryptionKey: props.kmsKey,
            generateSecretString: {
                secretStringTemplate: JSON.stringify({ username: 'authentik' }),
                generateStringKey: 'password',
                excludePunctuation: true,
                passwordLength: 64
            }
        });
        // Create the monitoring role
        const monitoringRole = new aws_cdk_lib_1.aws_iam.Role(this, 'DBMonitoringRole', {
            assumedBy: new aws_cdk_lib_1.aws_iam.ServicePrincipal('monitoring.rds.amazonaws.com'),
            managedPolicies: [
                aws_cdk_lib_1.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonRDSEnhancedMonitoringRole')
            ],
            path: '/'
        });
        // Create subnet group
        const subnetGroup = new aws_cdk_lib_1.aws_rds.SubnetGroup(this, 'DBSubnetGroup', {
            description: `${id} database subnet group`,
            vpc: props.vpc,
            vpcSubnets: {
                subnetType: aws_cdk_lib_1.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS
            }
        });
        // Create parameter group for PostgreSQL
        const parameterGroup = new aws_cdk_lib_1.aws_rds.ParameterGroup(this, 'DBParameterGroup', {
            engine: aws_cdk_lib_1.aws_rds.DatabaseClusterEngine.auroraPostgres({
                version: aws_cdk_lib_1.aws_rds.AuroraPostgresEngineVersion.VER_15_4
            }),
            description: `${id} cluster parameter group`,
            parameters: {
                'shared_preload_libraries': 'pg_stat_statements',
                'log_statement': 'all',
                'log_min_duration_statement': '1000',
                'log_connections': '1',
                'log_disconnections': '1'
            }
        });
        // Create the database cluster
        this.cluster = new aws_cdk_lib_1.aws_rds.DatabaseCluster(this, 'DBCluster', {
            engine: aws_cdk_lib_1.aws_rds.DatabaseClusterEngine.auroraPostgres({
                version: aws_cdk_lib_1.aws_rds.AuroraPostgresEngineVersion.VER_15_4
            }),
            credentials: aws_cdk_lib_1.aws_rds.Credentials.fromSecret(this.masterSecret),
            defaultDatabaseName: 'authentik',
            instanceProps: {
                instanceType: aws_cdk_lib_1.aws_ec2.InstanceType.of(aws_cdk_lib_1.aws_ec2.InstanceClass.T4G, props.config.dbInstanceClass.includes('micro') ? aws_cdk_lib_1.aws_ec2.InstanceSize.MICRO :
                    props.config.dbInstanceClass.includes('small') ? aws_cdk_lib_1.aws_ec2.InstanceSize.SMALL :
                        aws_cdk_lib_1.aws_ec2.InstanceSize.MEDIUM),
                vpcSubnets: {
                    subnetType: aws_cdk_lib_1.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS
                },
                vpc: props.vpc,
                securityGroups: props.securityGroups,
                enablePerformanceInsights: props.config.isProd,
                performanceInsightRetention: props.config.isProd ?
                    aws_cdk_lib_1.aws_rds.PerformanceInsightRetention.MONTHS_6 :
                    aws_cdk_lib_1.aws_rds.PerformanceInsightRetention.DEFAULT
            },
            instances: props.config.dbInstanceCount,
            parameterGroup,
            subnetGroup,
            storageEncrypted: true,
            storageEncryptionKey: props.kmsKey,
            backup: {
                retention: props.config.isProd ?
                    aws_cdk_lib_1.Duration.days(props.config.dbBackupRetentionDays) :
                    aws_cdk_lib_1.Duration.days(1),
                preferredWindow: '03:00-04:00' // UTC time
            },
            preferredMaintenanceWindow: 'sun:04:00-sun:05:00', // UTC time
            deletionProtection: props.config.isProd,
            removalPolicy: props.config.isProd ? aws_cdk_lib_1.RemovalPolicy.SNAPSHOT : aws_cdk_lib_1.RemovalPolicy.DESTROY
        });
        // Create secret attachment
        new aws_cdk_lib_1.aws_secretsmanager.CfnSecretTargetAttachment(this, 'DBMasterSecretAttachment', {
            secretId: this.masterSecret.secretArn,
            targetId: this.cluster.clusterIdentifier,
            targetType: 'AWS::RDS::DBCluster'
        });
        // Store the hostname
        this.hostname = this.cluster.clusterEndpoint.hostname;
        // Create outputs
        new aws_cdk_lib_1.CfnOutput(this, 'DatabaseEndpoint', {
            value: this.hostname,
            description: 'Database cluster endpoint'
        });
        new aws_cdk_lib_1.CfnOutput(this, 'DatabaseSecretArn', {
            value: this.masterSecret.secretArn,
            description: 'Database master secret ARN'
        });
    }
}
exports.Database = Database;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGF0YWJhc2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJkYXRhYmFzZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQTs7R0FFRztBQUNILDJDQUF1QztBQUN2Qyw2Q0FTcUI7QUFpQ3JCOztHQUVHO0FBQ0gsTUFBYSxRQUFTLFNBQVEsc0JBQVM7SUFnQnJDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBb0I7UUFDNUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQiwyQkFBMkI7UUFDM0IsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUNwRSxXQUFXLEVBQUUsR0FBRyxFQUFFLG9DQUFvQztZQUN0RCxVQUFVLEVBQUUsR0FBRyxFQUFFLGFBQWE7WUFDOUIsYUFBYSxFQUFFLEtBQUssQ0FBQyxNQUFNO1lBQzNCLG9CQUFvQixFQUFFO2dCQUNwQixvQkFBb0IsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxDQUFDO2dCQUMvRCxpQkFBaUIsRUFBRSxVQUFVO2dCQUM3QixrQkFBa0IsRUFBRSxJQUFJO2dCQUN4QixjQUFjLEVBQUUsRUFBRTthQUNuQjtTQUNGLENBQUMsQ0FBQztRQUVILDZCQUE2QjtRQUM3QixNQUFNLGNBQWMsR0FBRyxJQUFJLHFCQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUM1RCxTQUFTLEVBQUUsSUFBSSxxQkFBRyxDQUFDLGdCQUFnQixDQUFDLDhCQUE4QixDQUFDO1lBQ25FLGVBQWUsRUFBRTtnQkFDZixxQkFBRyxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQyw4Q0FBOEMsQ0FBQzthQUMzRjtZQUNELElBQUksRUFBRSxHQUFHO1NBQ1YsQ0FBQyxDQUFDO1FBRUgsc0JBQXNCO1FBQ3RCLE1BQU0sV0FBVyxHQUFHLElBQUks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RSxhQUFhLENBQUMsV0FBVzthQUMzQztZQUNELDBCQUEwQixFQUFFLHFCQUFxQixFQUFFLFdBQVc7WUFDOUQsa0JBQWtCLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNO1lBQ3ZDLGFBQWEsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsMkJBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLDJCQUFhLENBQUMsT0FBTztTQUNwRixDQUFDLENBQUM7UUFFSCwyQkFBMkI7UUFDM0IsSUFBSSxnQ0FBYyxDQUFDLHlCQUF5QixDQUFDLElBQUksRUFBRSwwQkFBMEIsRUFBRTtZQUM3RSxRQUFRLEVBQUUsSUFBSSxDQUFDLFlBQVksQ0FBQyxTQUFTO1lBQ3JDLFFBQVEsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLGlCQUFpQjtZQUN4QyxVQUFVLEVBQUUscUJBQXFCO1NBQ2xDLENBQUMsQ0FBQztRQUVILHFCQUFxQjtRQUNyQixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQztRQUV0RCxpQkFBaUI7UUFDakIsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUN0QyxLQUFLLEVBQUUsSUFBSSxDQUFDLFFBQVE7WUFDcEIsV0FBVyxFQUFFLDJCQUEyQjtTQUN6QyxDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQ3ZDLEtBQUssRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLFNBQVM7WUFDbEMsV0FBVyxFQUFFLDRCQUE0QjtTQUMxQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUE5SEQsNEJBOEhDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBEYXRhYmFzZSBDb25zdHJ1Y3QgLSBDREsgaW1wbGVtZW50YXRpb24gb2YgdGhlIFBvc3RncmVTUUwgZGF0YWJhc2VcbiAqL1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQge1xuICBhd3NfcmRzIGFzIHJkcyxcbiAgYXdzX2VjMiBhcyBlYzIsXG4gIGF3c19zZWNyZXRzbWFuYWdlciBhcyBzZWNyZXRzbWFuYWdlcixcbiAgYXdzX2lhbSBhcyBpYW0sXG4gIGF3c19rbXMgYXMga21zLFxuICBEdXJhdGlvbixcbiAgUmVtb3ZhbFBvbGljeSxcbiAgQ2ZuT3V0cHV0XG59IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB0eXBlIHsgQmFzZUNvbmZpZyB9IGZyb20gJy4uL2Vudmlyb25tZW50LWNvbmZpZyc7XG5cbi8qKlxuICogUHJvcGVydGllcyBmb3IgdGhlIERhdGFiYXNlIGNvbnN0cnVjdFxuICovXG5leHBvcnQgaW50ZXJmYWNlIERhdGFiYXNlUHJvcHMge1xuICAvKipcbiAgICogRW52aXJvbm1lbnQgbmFtZSAoZS5nLiAncHJvZCcsICdkZXYnLCBldGMuKVxuICAgKi9cbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcblxuICAvKipcbiAgICogRW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxuICAgKi9cbiAgY29uZmlnOiBCYXNlQ29uZmlnO1xuXG4gIC8qKlxuICAgKiBWUEMgZm9yIGRlcGxveW1lbnRcbiAgICovXG4gIHZwYzogZWMyLklWcGM7XG5cbiAgLyoqXG4gICAqIEtNUyBrZXkgZm9yIGVuY3J5cHRpb25cbiAgICovXG4gIGttc0tleToga21zLklLZXk7XG5cbiAgLyoqXG4gICAqIFNlY3VyaXR5IGdyb3VwcyBmb3IgZGF0YWJhc2UgYWNjZXNzXG4gICAqL1xuICBzZWN1cml0eUdyb3VwczogZWMyLlNlY3VyaXR5R3JvdXBbXTtcbn1cblxuLyoqXG4gKiBDREsgY29uc3RydWN0IGZvciB0aGUgUG9zdGdyZVNRTCBkYXRhYmFzZSBjbHVzdGVyXG4gKi9cbmV4cG9ydCBjbGFzcyBEYXRhYmFzZSBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBUaGUgbWFzdGVyIHNlY3JldCBmb3IgZGF0YWJhc2UgYWNjZXNzXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgbWFzdGVyU2VjcmV0OiBzZWNyZXRzbWFuYWdlci5TZWNyZXQ7XG5cbiAgLyoqXG4gICAqIFRoZSBSRFMgZGF0YWJhc2UgY2x1c3RlclxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGNsdXN0ZXI6IHJkcy5EYXRhYmFzZUNsdXN0ZXI7XG5cbiAgLyoqXG4gICAqIFRoZSBkYXRhYmFzZSBob3N0bmFtZVxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGhvc3RuYW1lOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IERhdGFiYXNlUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBtYXN0ZXIgc2VjcmV0XG4gICAgdGhpcy5tYXN0ZXJTZWNyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdEQk1hc3RlclNlY3JldCcsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgJHtpZH0gQXVyb3JhIFBvc3RncmVTUUwgTWFzdGVyIFBhc3N3b3JkYCxcbiAgICAgIHNlY3JldE5hbWU6IGAke2lkfS9yZHMvc2VjcmV0YCxcbiAgICAgIGVuY3J5cHRpb25LZXk6IHByb3BzLmttc0tleSxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIHNlY3JldFN0cmluZ1RlbXBsYXRlOiBKU09OLnN0cmluZ2lmeSh7IHVzZXJuYW1lOiAnYXV0aGVudGlrJyB9KSxcbiAgICAgICAgZ2VuZXJhdGVTdHJpbmdLZXk6ICdwYXNzd29yZCcsXG4gICAgICAgIGV4Y2x1ZGVQdW5jdHVhdGlvbjogdHJ1ZSxcbiAgICAgICAgcGFzc3dvcmRMZW5ndGg6IDY0XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIG1vbml0b3Jpbmcgcm9sZVxuICAgIGNvbnN0IG1vbml0b3JpbmdSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdEQk1vbml0b3JpbmdSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ21vbml0b3JpbmcucmRzLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BbWF6b25SRFNFbmhhbmNlZE1vbml0b3JpbmdSb2xlJylcbiAgICAgIF0sXG4gICAgICBwYXRoOiAnLydcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBzdWJuZXQgZ3JvdXBcbiAgICBjb25zdCBzdWJuZXRHcm91cCA9IG5ldyByZHMuU3VibmV0R3JvdXAodGhpcywgJ0RCU3VibmV0R3JvdXAnLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYCR7aWR9IGRhdGFiYXNlIHN1Ym5ldCBncm91cGAsXG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTU1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHBhcmFtZXRlciBncm91cCBmb3IgUG9zdGdyZVNRTFxuICAgIGNvbnN0IHBhcmFtZXRlckdyb3VwID0gbmV3IHJkcy5QYXJhbWV0ZXJHcm91cCh0aGlzLCAnREJQYXJhbWV0ZXJHcm91cCcsIHtcbiAgICAgIGVuZ2luZTogcmRzLkRhdGFiYXNlQ2x1c3RlckVuZ2luZS5hdXJvcmFQb3N0Z3Jlcyh7XG4gICAgICAgIHZlcnNpb246IHJkcy5BdXJvcmFQb3N0Z3Jlc0VuZ2luZVZlcnNpb24uVkVSXzE1XzRcbiAgICAgIH0pLFxuICAgICAgZGVzY3JpcHRpb246IGAke2lkfSBjbHVzdGVyIHBhcmFtZXRlciBncm91cGAsXG4gICAgICBwYXJhbWV0ZXJzOiB7XG4gICAgICAgICdzaGFyZWRfcHJlbG9hZF9saWJyYXJpZXMnOiAncGdfc3RhdF9zdGF0ZW1lbnRzJyxcbiAgICAgICAgJ2xvZ19zdGF0ZW1lbnQnOiAnYWxsJyxcbiAgICAgICAgJ2xvZ19taW5fZHVyYXRpb25fc3RhdGVtZW50JzogJzEwMDAnLFxuICAgICAgICAnbG9nX2Nvbm5lY3Rpb25zJzogJzEnLFxuICAgICAgICAnbG9nX2Rpc2Nvbm5lY3Rpb25zJzogJzEnXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIGRhdGFiYXNlIGNsdXN0ZXJcbiAgICB0aGlzLmNsdXN0ZXIgPSBuZXcgcmRzLkRhdGFiYXNlQ2x1c3Rlcih0aGlzLCAnREJDbHVzdGVyJywge1xuICAgICAgZW5naW5lOiByZHMuRGF0YWJhc2VDbHVzdGVyRW5naW5lLmF1cm9yYVBvc3RncmVzKHtcbiAgICAgICAgdmVyc2lvbjogcmRzLkF1cm9yYVBvc3RncmVzRW5naW5lVmVyc2lvbi5WRVJfMTVfNFxuICAgICAgfSksXG4gICAgICBjcmVkZW50aWFsczogcmRzLkNyZWRlbnRpYWxzLmZyb21TZWNyZXQodGhpcy5tYXN0ZXJTZWNyZXQpLFxuICAgICAgZGVmYXVsdERhdGFiYXNlTmFtZTogJ2F1dGhlbnRpaycsXG4gICAgICBpbnN0YW5jZVByb3BzOiB7XG4gICAgICAgIGluc3RhbmNlVHlwZTogZWMyLkluc3RhbmNlVHlwZS5vZihcbiAgICAgICAgICBlYzIuSW5zdGFuY2VDbGFzcy5UNEcsXG4gICAgICAgICAgcHJvcHMuY29uZmlnLmRiSW5zdGFuY2VDbGFzcy5pbmNsdWRlcygnbWljcm8nKSA/IGVjMi5JbnN0YW5jZVNpemUuTUlDUk8gOlxuICAgICAgICAgIHByb3BzLmNvbmZpZy5kYkluc3RhbmNlQ2xhc3MuaW5jbHVkZXMoJ3NtYWxsJykgPyBlYzIuSW5zdGFuY2VTaXplLlNNQUxMIDpcbiAgICAgICAgICBlYzIuSW5zdGFuY2VTaXplLk1FRElVTVxuICAgICAgICApLFxuICAgICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTU1xuICAgICAgICB9LFxuICAgICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgICAgc2VjdXJpdHlHcm91cHM6IHByb3BzLnNlY3VyaXR5R3JvdXBzLFxuICAgICAgICBlbmFibGVQZXJmb3JtYW5jZUluc2lnaHRzOiBwcm9wcy5jb25maWcuaXNQcm9kLFxuICAgICAgICBwZXJmb3JtYW5jZUluc2lnaHRSZXRlbnRpb246IHByb3BzLmNvbmZpZy5pc1Byb2QgPyBcbiAgICAgICAgICByZHMuUGVyZm9ybWFuY2VJbnNpZ2h0UmV0ZW50aW9uLk1PTlRIU182IDogXG4gICAgICAgICAgcmRzLlBlcmZvcm1hbmNlSW5zaWdodFJldGVudGlvbi5ERUZBVUxUXG4gICAgICB9LFxuICAgICAgaW5zdGFuY2VzOiBwcm9wcy5jb25maWcuZGJJbnN0YW5jZUNvdW50LFxuICAgICAgcGFyYW1ldGVyR3JvdXAsXG4gICAgICBzdWJuZXRHcm91cCxcbiAgICAgIHN0b3JhZ2VFbmNyeXB0ZWQ6IHRydWUsXG4gICAgICBzdG9yYWdlRW5jcnlwdGlvbktleTogcHJvcHMua21zS2V5LFxuICAgICAgYmFja3VwOiB7XG4gICAgICAgIHJldGVudGlvbjogcHJvcHMuY29uZmlnLmlzUHJvZCA/IFxuICAgICAgICAgIER1cmF0aW9uLmRheXMocHJvcHMuY29uZmlnLmRiQmFja3VwUmV0ZW50aW9uRGF5cykgOlxuICAgICAgICAgIER1cmF0aW9uLmRheXMoMSksXG4gICAgICAgIHByZWZlcnJlZFdpbmRvdzogJzAzOjAwLTA0OjAwJyAvLyBVVEMgdGltZVxuICAgICAgfSxcbiAgICAgIHByZWZlcnJlZE1haW50ZW5hbmNlV2luZG93OiAnc3VuOjA0OjAwLXN1bjowNTowMCcsIC8vIFVUQyB0aW1lXG4gICAgICBkZWxldGlvblByb3RlY3Rpb246IHByb3BzLmNvbmZpZy5pc1Byb2QsXG4gICAgICByZW1vdmFsUG9saWN5OiBwcm9wcy5jb25maWcuaXNQcm9kID8gUmVtb3ZhbFBvbGljeS5TTkFQU0hPVCA6IFJlbW92YWxQb2xpY3kuREVTVFJPWVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHNlY3JldCBhdHRhY2htZW50XG4gICAgbmV3IHNlY3JldHNtYW5hZ2VyLkNmblNlY3JldFRhcmdldEF0dGFjaG1lbnQodGhpcywgJ0RCTWFzdGVyU2VjcmV0QXR0YWNobWVudCcsIHtcbiAgICAgIHNlY3JldElkOiB0aGlzLm1hc3RlclNlY3JldC5zZWNyZXRBcm4sXG4gICAgICB0YXJnZXRJZDogdGhpcy5jbHVzdGVyLmNsdXN0ZXJJZGVudGlmaWVyLFxuICAgICAgdGFyZ2V0VHlwZTogJ0FXUzo6UkRTOjpEQkNsdXN0ZXInXG4gICAgfSk7XG5cbiAgICAvLyBTdG9yZSB0aGUgaG9zdG5hbWVcbiAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5jbHVzdGVyLmNsdXN0ZXJFbmRwb2ludC5ob3N0bmFtZTtcblxuICAgIC8vIENyZWF0ZSBvdXRwdXRzXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRGF0YWJhc2VFbmRwb2ludCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmhvc3RuYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdEYXRhYmFzZSBjbHVzdGVyIGVuZHBvaW50J1xuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRGF0YWJhc2VTZWNyZXRBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5tYXN0ZXJTZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdEYXRhYmFzZSBtYXN0ZXIgc2VjcmV0IEFSTidcbiAgICB9KTtcbiAgfVxufVxuIl19