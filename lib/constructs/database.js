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
                instanceType: aws_cdk_lib_1.aws_ec2.InstanceType.of(aws_cdk_lib_1.aws_ec2.InstanceClass.T4G, props.config.database.instanceClass.includes('micro') ? aws_cdk_lib_1.aws_ec2.InstanceSize.MICRO :
                    props.config.database.instanceClass.includes('small') ? aws_cdk_lib_1.aws_ec2.InstanceSize.SMALL :
                        aws_cdk_lib_1.aws_ec2.InstanceSize.MEDIUM),
                vpcSubnets: {
                    subnetType: aws_cdk_lib_1.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS
                },
                vpc: props.vpc,
                securityGroups: props.securityGroups,
                enablePerformanceInsights: props.config.database.enablePerformanceInsights,
                performanceInsightRetention: props.config.database.enablePerformanceInsights ?
                    aws_cdk_lib_1.aws_rds.PerformanceInsightRetention.MONTHS_6 :
                    aws_cdk_lib_1.aws_rds.PerformanceInsightRetention.DEFAULT
            },
            instances: props.config.database.instanceCount,
            parameterGroup,
            subnetGroup,
            storageEncrypted: true,
            storageEncryptionKey: props.kmsKey,
            backup: {
                retention: aws_cdk_lib_1.Duration.days(props.config.database.backupRetentionDays),
                preferredWindow: '03:00-04:00' // UTC time
            },
            preferredMaintenanceWindow: 'sun:04:00-sun:05:00', // UTC time
            deletionProtection: props.config.database.deletionProtection,
            removalPolicy: props.config.general.removalPolicy
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGF0YWJhc2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJkYXRhYmFzZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQTs7R0FFRztBQUNILDJDQUF1QztBQUN2Qyw2Q0FTcUI7QUFpQ3JCOztHQUVHO0FBQ0gsTUFBYSxRQUFTLFNBQVEsc0JBQVM7SUFnQnJDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBb0I7UUFDNUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQiwyQkFBMkI7UUFDM0IsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUNwRSxXQUFXLEVBQUUsR0FBRyxFQUFFLG9DQUFvQztZQUN0RCxVQUFVLEVBQUUsR0FBRyxFQUFFLGFBQWE7WUFDOUIsYUFBYSxFQUFFLEtBQUssQ0FBQyxNQUFNO1lBQzNCLG9CQUFvQixFQUFFO2dCQUNwQixvQkFBb0IsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxDQUFDO2dCQUMvRCxpQkFBaUIsRUFBRSxVQUFVO2dCQUM3QixrQkFBa0IsRUFBRSxJQUFJO2dCQUN4QixjQUFjLEVBQUUsRUFBRTthQUNuQjtTQUNGLENBQUMsQ0FBQztRQUVILDZCQUE2QjtRQUM3QixNQUFNLGNBQWMsR0FBRyxJQUFJLHFCQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUM1RCxTQUFTLEVBQUUsSUFBSSxxQkFBRyxDQUFDLGdCQUFnQixDQUFDLDhCQUE4QixDQUFDO1lBQ25FLGVBQWUsRUFBRTtnQkFDZixxQkFBRyxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQyw4Q0FBOEMsQ0FBQzthQUMzRjtZQUNELElBQUksRUFBRSxHQUFHO1NBQ1YsQ0FBQyxDQUFDO1FBRUgsc0JBQXNCO1FBQ3RCLE1BQU0sV0FBVyxHQUFHLElBQUks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RCwwQkFBMEIsRUFBRSxxQkFBcUIsRUFBRSxXQUFXO1lBQzlELGtCQUFrQixFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGtCQUFrQjtZQUM1RCxhQUFhLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsYUFBYTtTQUNsRCxDQUFDLENBQUM7UUFFSCxxQkFBcUI7UUFDckIsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUM7UUFFdEQsaUJBQWlCO1FBQ2pCLElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDdEMsS0FBSyxFQUFFLElBQUksQ0FBQyxRQUFRO1lBQ3BCLFdBQVcsRUFBRSwyQkFBMkI7U0FDekMsQ0FBQyxDQUFDO1FBRUgsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUN2QyxLQUFLLEVBQUUsSUFBSSxDQUFDLFlBQVksQ0FBQyxTQUFTO1lBQ2xDLFdBQVcsRUFBRSw0QkFBNEI7U0FDMUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBckhELDRCQXFIQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogRGF0YWJhc2UgQ29uc3RydWN0IC0gQ0RLIGltcGxlbWVudGF0aW9uIG9mIHRoZSBQb3N0Z3JlU1FMIGRhdGFiYXNlXG4gKi9cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHtcbiAgYXdzX3JkcyBhcyByZHMsXG4gIGF3c19lYzIgYXMgZWMyLFxuICBhd3Nfc2VjcmV0c21hbmFnZXIgYXMgc2VjcmV0c21hbmFnZXIsXG4gIGF3c19pYW0gYXMgaWFtLFxuICBhd3Nfa21zIGFzIGttcyxcbiAgRHVyYXRpb24sXG4gIFJlbW92YWxQb2xpY3ksXG4gIENmbk91dHB1dFxufSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgdHlwZSB7IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi4vZW52aXJvbm1lbnQtY29uZmlnJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciB0aGUgRGF0YWJhc2UgY29uc3RydWN0XG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgRGF0YWJhc2VQcm9wcyB7XG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBuYW1lIChlLmcuICdwcm9kJywgJ2RldicsIGV0Yy4pXG4gICAqL1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBjb25maWd1cmF0aW9uXG4gICAqL1xuICBjb25maWc6IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnO1xuXG4gIC8qKlxuICAgKiBWUEMgZm9yIGRlcGxveW1lbnRcbiAgICovXG4gIHZwYzogZWMyLklWcGM7XG5cbiAgLyoqXG4gICAqIEtNUyBrZXkgZm9yIGVuY3J5cHRpb25cbiAgICovXG4gIGttc0tleToga21zLklLZXk7XG5cbiAgLyoqXG4gICAqIFNlY3VyaXR5IGdyb3VwcyBmb3IgZGF0YWJhc2UgYWNjZXNzXG4gICAqL1xuICBzZWN1cml0eUdyb3VwczogZWMyLlNlY3VyaXR5R3JvdXBbXTtcbn1cblxuLyoqXG4gKiBDREsgY29uc3RydWN0IGZvciB0aGUgUG9zdGdyZVNRTCBkYXRhYmFzZSBjbHVzdGVyXG4gKi9cbmV4cG9ydCBjbGFzcyBEYXRhYmFzZSBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBUaGUgbWFzdGVyIHNlY3JldCBmb3IgZGF0YWJhc2UgYWNjZXNzXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgbWFzdGVyU2VjcmV0OiBzZWNyZXRzbWFuYWdlci5TZWNyZXQ7XG5cbiAgLyoqXG4gICAqIFRoZSBSRFMgZGF0YWJhc2UgY2x1c3RlclxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGNsdXN0ZXI6IHJkcy5EYXRhYmFzZUNsdXN0ZXI7XG5cbiAgLyoqXG4gICAqIFRoZSBkYXRhYmFzZSBob3N0bmFtZVxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGhvc3RuYW1lOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IERhdGFiYXNlUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBtYXN0ZXIgc2VjcmV0XG4gICAgdGhpcy5tYXN0ZXJTZWNyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdEQk1hc3RlclNlY3JldCcsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgJHtpZH0gQXVyb3JhIFBvc3RncmVTUUwgTWFzdGVyIFBhc3N3b3JkYCxcbiAgICAgIHNlY3JldE5hbWU6IGAke2lkfS9yZHMvc2VjcmV0YCxcbiAgICAgIGVuY3J5cHRpb25LZXk6IHByb3BzLmttc0tleSxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIHNlY3JldFN0cmluZ1RlbXBsYXRlOiBKU09OLnN0cmluZ2lmeSh7IHVzZXJuYW1lOiAnYXV0aGVudGlrJyB9KSxcbiAgICAgICAgZ2VuZXJhdGVTdHJpbmdLZXk6ICdwYXNzd29yZCcsXG4gICAgICAgIGV4Y2x1ZGVQdW5jdHVhdGlvbjogdHJ1ZSxcbiAgICAgICAgcGFzc3dvcmRMZW5ndGg6IDY0XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIG1vbml0b3Jpbmcgcm9sZVxuICAgIGNvbnN0IG1vbml0b3JpbmdSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdEQk1vbml0b3JpbmdSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ21vbml0b3JpbmcucmRzLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BbWF6b25SRFNFbmhhbmNlZE1vbml0b3JpbmdSb2xlJylcbiAgICAgIF0sXG4gICAgICBwYXRoOiAnLydcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBzdWJuZXQgZ3JvdXBcbiAgICBjb25zdCBzdWJuZXRHcm91cCA9IG5ldyByZHMuU3VibmV0R3JvdXAodGhpcywgJ0RCU3VibmV0R3JvdXAnLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYCR7aWR9IGRhdGFiYXNlIHN1Ym5ldCBncm91cGAsXG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTU1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHBhcmFtZXRlciBncm91cCBmb3IgUG9zdGdyZVNRTFxuICAgIGNvbnN0IHBhcmFtZXRlckdyb3VwID0gbmV3IHJkcy5QYXJhbWV0ZXJHcm91cCh0aGlzLCAnREJQYXJhbWV0ZXJHcm91cCcsIHtcbiAgICAgIGVuZ2luZTogcmRzLkRhdGFiYXNlQ2x1c3RlckVuZ2luZS5hdXJvcmFQb3N0Z3Jlcyh7XG4gICAgICAgIHZlcnNpb246IHJkcy5BdXJvcmFQb3N0Z3Jlc0VuZ2luZVZlcnNpb24uVkVSXzE1XzRcbiAgICAgIH0pLFxuICAgICAgZGVzY3JpcHRpb246IGAke2lkfSBjbHVzdGVyIHBhcmFtZXRlciBncm91cGAsXG4gICAgICBwYXJhbWV0ZXJzOiB7XG4gICAgICAgICdzaGFyZWRfcHJlbG9hZF9saWJyYXJpZXMnOiAncGdfc3RhdF9zdGF0ZW1lbnRzJyxcbiAgICAgICAgJ2xvZ19zdGF0ZW1lbnQnOiAnYWxsJyxcbiAgICAgICAgJ2xvZ19taW5fZHVyYXRpb25fc3RhdGVtZW50JzogJzEwMDAnLFxuICAgICAgICAnbG9nX2Nvbm5lY3Rpb25zJzogJzEnLFxuICAgICAgICAnbG9nX2Rpc2Nvbm5lY3Rpb25zJzogJzEnXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIGRhdGFiYXNlIGNsdXN0ZXJcbiAgICB0aGlzLmNsdXN0ZXIgPSBuZXcgcmRzLkRhdGFiYXNlQ2x1c3Rlcih0aGlzLCAnREJDbHVzdGVyJywge1xuICAgICAgZW5naW5lOiByZHMuRGF0YWJhc2VDbHVzdGVyRW5naW5lLmF1cm9yYVBvc3RncmVzKHtcbiAgICAgICAgdmVyc2lvbjogcmRzLkF1cm9yYVBvc3RncmVzRW5naW5lVmVyc2lvbi5WRVJfMTVfNFxuICAgICAgfSksXG4gICAgICBjcmVkZW50aWFsczogcmRzLkNyZWRlbnRpYWxzLmZyb21TZWNyZXQodGhpcy5tYXN0ZXJTZWNyZXQpLFxuICAgICAgZGVmYXVsdERhdGFiYXNlTmFtZTogJ2F1dGhlbnRpaycsXG4gICAgICBpbnN0YW5jZVByb3BzOiB7XG4gICAgICAgIGluc3RhbmNlVHlwZTogZWMyLkluc3RhbmNlVHlwZS5vZihcbiAgICAgICAgICBlYzIuSW5zdGFuY2VDbGFzcy5UNEcsXG4gICAgICAgICAgcHJvcHMuY29uZmlnLmRhdGFiYXNlLmluc3RhbmNlQ2xhc3MuaW5jbHVkZXMoJ21pY3JvJykgPyBlYzIuSW5zdGFuY2VTaXplLk1JQ1JPIDpcbiAgICAgICAgICBwcm9wcy5jb25maWcuZGF0YWJhc2UuaW5zdGFuY2VDbGFzcy5pbmNsdWRlcygnc21hbGwnKSA/IGVjMi5JbnN0YW5jZVNpemUuU01BTEwgOlxuICAgICAgICAgIGVjMi5JbnN0YW5jZVNpemUuTUVESVVNXG4gICAgICAgICksXG4gICAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTXG4gICAgICAgIH0sXG4gICAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgICBzZWN1cml0eUdyb3VwczogcHJvcHMuc2VjdXJpdHlHcm91cHMsXG4gICAgICAgIGVuYWJsZVBlcmZvcm1hbmNlSW5zaWdodHM6IHByb3BzLmNvbmZpZy5kYXRhYmFzZS5lbmFibGVQZXJmb3JtYW5jZUluc2lnaHRzLFxuICAgICAgICBwZXJmb3JtYW5jZUluc2lnaHRSZXRlbnRpb246IHByb3BzLmNvbmZpZy5kYXRhYmFzZS5lbmFibGVQZXJmb3JtYW5jZUluc2lnaHRzID8gXG4gICAgICAgICAgcmRzLlBlcmZvcm1hbmNlSW5zaWdodFJldGVudGlvbi5NT05USFNfNiA6IFxuICAgICAgICAgIHJkcy5QZXJmb3JtYW5jZUluc2lnaHRSZXRlbnRpb24uREVGQVVMVFxuICAgICAgfSxcbiAgICAgIGluc3RhbmNlczogcHJvcHMuY29uZmlnLmRhdGFiYXNlLmluc3RhbmNlQ291bnQsXG4gICAgICBwYXJhbWV0ZXJHcm91cCxcbiAgICAgIHN1Ym5ldEdyb3VwLFxuICAgICAgc3RvcmFnZUVuY3J5cHRlZDogdHJ1ZSxcbiAgICAgIHN0b3JhZ2VFbmNyeXB0aW9uS2V5OiBwcm9wcy5rbXNLZXksXG4gICAgICBiYWNrdXA6IHtcbiAgICAgICAgcmV0ZW50aW9uOiBEdXJhdGlvbi5kYXlzKHByb3BzLmNvbmZpZy5kYXRhYmFzZS5iYWNrdXBSZXRlbnRpb25EYXlzKSxcbiAgICAgICAgcHJlZmVycmVkV2luZG93OiAnMDM6MDAtMDQ6MDAnIC8vIFVUQyB0aW1lXG4gICAgICB9LFxuICAgICAgcHJlZmVycmVkTWFpbnRlbmFuY2VXaW5kb3c6ICdzdW46MDQ6MDAtc3VuOjA1OjAwJywgLy8gVVRDIHRpbWVcbiAgICAgIGRlbGV0aW9uUHJvdGVjdGlvbjogcHJvcHMuY29uZmlnLmRhdGFiYXNlLmRlbGV0aW9uUHJvdGVjdGlvbixcbiAgICAgIHJlbW92YWxQb2xpY3k6IHByb3BzLmNvbmZpZy5nZW5lcmFsLnJlbW92YWxQb2xpY3lcbiAgICB9KTtcblxuICAgIC8vIFN0b3JlIHRoZSBob3N0bmFtZVxuICAgIHRoaXMuaG9zdG5hbWUgPSB0aGlzLmNsdXN0ZXIuY2x1c3RlckVuZHBvaW50Lmhvc3RuYW1lO1xuXG4gICAgLy8gQ3JlYXRlIG91dHB1dHNcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdEYXRhYmFzZUVuZHBvaW50Jywge1xuICAgICAgdmFsdWU6IHRoaXMuaG9zdG5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0RhdGFiYXNlIGNsdXN0ZXIgZW5kcG9pbnQnXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdEYXRhYmFzZVNlY3JldEFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLm1hc3RlclNlY3JldC5zZWNyZXRBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0RhdGFiYXNlIG1hc3RlciBzZWNyZXQgQVJOJ1xuICAgIH0pO1xuICB9XG59XG4iXX0=