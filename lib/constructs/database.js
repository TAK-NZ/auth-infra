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
            description: `${id}: PostgreSQL Master Password`,
            secretName: `${props.stackName}/Database/Master-Password`,
            encryptionKey: props.infrastructure.kmsKey,
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
            vpc: props.infrastructure.vpc,
            vpcSubnets: {
                subnetType: aws_cdk_lib_1.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS
            }
        });
        // Create parameter group for PostgreSQL
        const parameterGroup = new aws_cdk_lib_1.aws_rds.ParameterGroup(this, 'DBParameterGroup', {
            engine: aws_cdk_lib_1.aws_rds.DatabaseClusterEngine.auroraPostgres({
                version: aws_cdk_lib_1.aws_rds.AuroraPostgresEngineVersion.VER_17_4
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
        // Create the database cluster with conditional configuration for serverless vs provisioned
        const isServerless = props.config.database.instanceClass === 'db.serverless';
        if (isServerless) {
            // Aurora Serverless v2 configuration
            this.cluster = new aws_cdk_lib_1.aws_rds.DatabaseCluster(this, 'DBCluster', {
                engine: aws_cdk_lib_1.aws_rds.DatabaseClusterEngine.auroraPostgres({
                    version: aws_cdk_lib_1.aws_rds.AuroraPostgresEngineVersion.VER_17_4
                }),
                credentials: aws_cdk_lib_1.aws_rds.Credentials.fromSecret(this.masterSecret),
                defaultDatabaseName: 'authentik',
                port: 5432,
                serverlessV2MinCapacity: 0.5,
                serverlessV2MaxCapacity: 4,
                writer: aws_cdk_lib_1.aws_rds.ClusterInstance.serverlessV2('writer'),
                readers: props.config.database.instanceCount > 1 ?
                    Array.from({ length: props.config.database.instanceCount - 1 }, (_, i) => aws_cdk_lib_1.aws_rds.ClusterInstance.serverlessV2(`reader${i + 1}`)) : [],
                parameterGroup,
                subnetGroup,
                vpc: props.infrastructure.vpc,
                vpcSubnets: {
                    subnetType: aws_cdk_lib_1.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS
                },
                securityGroups: props.securityGroups,
                storageEncrypted: true,
                storageEncryptionKey: props.infrastructure.kmsKey,
                backup: {
                    retention: aws_cdk_lib_1.Duration.days(props.config.database.backupRetentionDays)
                },
                deletionProtection: props.config.database.deletionProtection,
                removalPolicy: props.config.general.removalPolicy,
                cloudwatchLogsExports: ['postgresql'],
                cloudwatchLogsRetention: props.config.general.enableDetailedLogging ?
                    aws_cdk_lib_1.aws_logs.RetentionDays.ONE_MONTH :
                    aws_cdk_lib_1.aws_logs.RetentionDays.ONE_WEEK
            });
        }
        else {
            // Provisioned instances configuration
            const instanceType = aws_cdk_lib_1.aws_ec2.InstanceType.of(aws_cdk_lib_1.aws_ec2.InstanceClass.T4G, props.config.database.instanceClass.includes('large') ? aws_cdk_lib_1.aws_ec2.InstanceSize.LARGE :
                aws_cdk_lib_1.aws_ec2.InstanceSize.MEDIUM);
            this.cluster = new aws_cdk_lib_1.aws_rds.DatabaseCluster(this, 'DBCluster', {
                engine: aws_cdk_lib_1.aws_rds.DatabaseClusterEngine.auroraPostgres({
                    version: aws_cdk_lib_1.aws_rds.AuroraPostgresEngineVersion.VER_17_4
                }),
                credentials: aws_cdk_lib_1.aws_rds.Credentials.fromSecret(this.masterSecret),
                defaultDatabaseName: 'authentik',
                port: 5432,
                writer: aws_cdk_lib_1.aws_rds.ClusterInstance.provisioned('writer', {
                    instanceType,
                    enablePerformanceInsights: props.config.database.enablePerformanceInsights,
                    performanceInsightRetention: props.config.database.enablePerformanceInsights ?
                        aws_cdk_lib_1.aws_rds.PerformanceInsightRetention.MONTHS_6 :
                        undefined
                }),
                readers: props.config.database.instanceCount > 1 ?
                    Array.from({ length: props.config.database.instanceCount - 1 }, (_, i) => aws_cdk_lib_1.aws_rds.ClusterInstance.provisioned(`reader${i + 1}`, {
                        instanceType,
                        enablePerformanceInsights: props.config.database.enablePerformanceInsights,
                        performanceInsightRetention: props.config.database.enablePerformanceInsights ?
                            aws_cdk_lib_1.aws_rds.PerformanceInsightRetention.MONTHS_6 :
                            undefined
                    })) : [],
                parameterGroup,
                subnetGroup,
                vpc: props.infrastructure.vpc,
                vpcSubnets: {
                    subnetType: aws_cdk_lib_1.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS
                },
                securityGroups: props.securityGroups,
                storageEncrypted: true,
                storageEncryptionKey: props.infrastructure.kmsKey,
                backup: {
                    retention: aws_cdk_lib_1.Duration.days(props.config.database.backupRetentionDays)
                },
                deletionProtection: props.config.database.deletionProtection,
                removalPolicy: props.config.general.removalPolicy,
                cloudwatchLogsExports: ['postgresql'],
                cloudwatchLogsRetention: props.config.general.enableDetailedLogging ?
                    aws_cdk_lib_1.aws_logs.RetentionDays.ONE_MONTH :
                    aws_cdk_lib_1.aws_logs.RetentionDays.ONE_WEEK
            });
        }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGF0YWJhc2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJkYXRhYmFzZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQTs7R0FFRztBQUNILDJDQUF1QztBQUN2Qyw2Q0FVcUI7QUFrQ3JCOztHQUVHO0FBQ0gsTUFBYSxRQUFTLFNBQVEsc0JBQVM7SUFnQnJDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBb0I7UUFDNUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQiwyQkFBMkI7UUFDM0IsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUNwRSxXQUFXLEVBQUUsR0FBRyxFQUFFLDhCQUE4QjtZQUNoRCxVQUFVLEVBQUUsR0FBRyxLQUFLLENBQUMsU0FBUywyQkFBMkI7WUFDekQsYUFBYSxFQUFFLEtBQUssQ0FBQyxjQUFjLENBQUMsTUFBTTtZQUMxQyxvQkFBb0IsRUFBRTtnQkFDcEIsb0JBQW9CLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsQ0FBQztnQkFDL0QsaUJBQWlCLEVBQUUsVUFBVTtnQkFDN0Isa0JBQWtCLEVBQUUsSUFBSTtnQkFDeEIsY0FBYyxFQUFFLEVBQUU7YUFDbkI7U0FDRixDQUFDLENBQUM7UUFFSCw2QkFBNkI7UUFDN0IsTUFBTSxjQUFjLEdBQUcsSUFBSSxxQkFBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDNUQsU0FBUyxFQUFFLElBQUkscUJBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyw4QkFBOEIsQ0FBQztZQUNuRSxlQUFlLEVBQUU7Z0JBQ2YscUJBQUcsQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQUMsOENBQThDLENBQUM7YUFDM0Y7WUFDRCxJQUFJLEVBQUUsR0FBRztTQUNWLENBQUMsQ0FBQztRQUVILHNCQUFzQjtRQUN0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U0FBUyxFQUFFLHNCQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLG1CQUFtQixDQUFDO2lCQUNwRTtnQkFDRCxrQkFBa0IsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxrQkFBa0I7Z0JBQzVELGFBQWEsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhO2dCQUNqRCxxQkFBcUIsRUFBRSxDQUFDLFlBQVksQ0FBQztnQkFDckMsdUJBQXVCLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMscUJBQXFCLENBQUMsQ0FBQztvQkFDbkUsc0JBQUksQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLENBQUM7b0JBQzlCLHNCQUFJLENBQUMsYUFBYSxDQUFDLFFBQVE7YUFDOUIsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUVELHFCQUFxQjtRQUNyQixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQztRQUV0RCxpQkFBaUI7UUFDakIsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUN0QyxLQUFLLEVBQUUsSUFBSSxDQUFDLFFBQVE7WUFDcEIsV0FBVyxFQUFFLDJCQUEyQjtTQUN6QyxDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQ3ZDLEtBQUssRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLFNBQVM7WUFDbEMsV0FBVyxFQUFFLDRCQUE0QjtTQUMxQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUExS0QsNEJBMEtDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBEYXRhYmFzZSBDb25zdHJ1Y3QgLSBDREsgaW1wbGVtZW50YXRpb24gb2YgdGhlIFBvc3RncmVTUUwgZGF0YWJhc2VcbiAqL1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQge1xuICBhd3NfcmRzIGFzIHJkcyxcbiAgYXdzX2VjMiBhcyBlYzIsXG4gIGF3c19zZWNyZXRzbWFuYWdlciBhcyBzZWNyZXRzbWFuYWdlcixcbiAgYXdzX2lhbSBhcyBpYW0sXG4gIGF3c19rbXMgYXMga21zLFxuICBhd3NfbG9ncyBhcyBsb2dzLFxuICBEdXJhdGlvbixcbiAgUmVtb3ZhbFBvbGljeSxcbiAgQ2ZuT3V0cHV0XG59IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB0eXBlIHsgQXV0aEluZnJhRW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuLi9lbnZpcm9ubWVudC1jb25maWcnO1xuaW1wb3J0IHR5cGUgeyBJbmZyYXN0cnVjdHVyZUNvbmZpZyB9IGZyb20gJy4uL2NvbnN0cnVjdC1jb25maWdzJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciB0aGUgRGF0YWJhc2UgY29uc3RydWN0XG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgRGF0YWJhc2VQcm9wcyB7XG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBuYW1lIChlLmcuICdwcm9kJywgJ2RldicsIGV0Yy4pXG4gICAqL1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBGdWxsIHN0YWNrIG5hbWUgKGUuZy4sICdUQUstRGVtby1BdXRoSW5mcmEnKVxuICAgKi9cbiAgc3RhY2tOYW1lOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEVudmlyb25tZW50IGNvbmZpZ3VyYXRpb25cbiAgICovXG4gIGNvbmZpZzogQXV0aEluZnJhRW52aXJvbm1lbnRDb25maWc7XG5cbiAgLyoqXG4gICAqIEluZnJhc3RydWN0dXJlIGNvbmZpZ3VyYXRpb24gKFZQQywgS01TLCBzZWN1cml0eSBncm91cHMpXG4gICAqL1xuICBpbmZyYXN0cnVjdHVyZTogSW5mcmFzdHJ1Y3R1cmVDb25maWc7XG5cbiAgLyoqXG4gICAqIFNlY3VyaXR5IGdyb3VwcyBmb3IgZGF0YWJhc2UgYWNjZXNzXG4gICAqL1xuICBzZWN1cml0eUdyb3VwczogZWMyLlNlY3VyaXR5R3JvdXBbXTtcbn1cblxuLyoqXG4gKiBDREsgY29uc3RydWN0IGZvciB0aGUgUG9zdGdyZVNRTCBkYXRhYmFzZSBjbHVzdGVyXG4gKi9cbmV4cG9ydCBjbGFzcyBEYXRhYmFzZSBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBUaGUgbWFzdGVyIHNlY3JldCBmb3IgZGF0YWJhc2UgYWNjZXNzXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgbWFzdGVyU2VjcmV0OiBzZWNyZXRzbWFuYWdlci5TZWNyZXQ7XG5cbiAgLyoqXG4gICAqIFRoZSBSRFMgZGF0YWJhc2UgY2x1c3RlclxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGNsdXN0ZXI6IHJkcy5EYXRhYmFzZUNsdXN0ZXI7XG5cbiAgLyoqXG4gICAqIFRoZSBkYXRhYmFzZSBob3N0bmFtZVxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGhvc3RuYW1lOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IERhdGFiYXNlUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBtYXN0ZXIgc2VjcmV0XG4gICAgdGhpcy5tYXN0ZXJTZWNyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdEQk1hc3RlclNlY3JldCcsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgJHtpZH06IFBvc3RncmVTUUwgTWFzdGVyIFBhc3N3b3JkYCxcbiAgICAgIHNlY3JldE5hbWU6IGAke3Byb3BzLnN0YWNrTmFtZX0vRGF0YWJhc2UvTWFzdGVyLVBhc3N3b3JkYCxcbiAgICAgIGVuY3J5cHRpb25LZXk6IHByb3BzLmluZnJhc3RydWN0dXJlLmttc0tleSxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIHNlY3JldFN0cmluZ1RlbXBsYXRlOiBKU09OLnN0cmluZ2lmeSh7IHVzZXJuYW1lOiAnYXV0aGVudGlrJyB9KSxcbiAgICAgICAgZ2VuZXJhdGVTdHJpbmdLZXk6ICdwYXNzd29yZCcsXG4gICAgICAgIGV4Y2x1ZGVQdW5jdHVhdGlvbjogdHJ1ZSxcbiAgICAgICAgcGFzc3dvcmRMZW5ndGg6IDY0XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIG1vbml0b3Jpbmcgcm9sZVxuICAgIGNvbnN0IG1vbml0b3JpbmdSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdEQk1vbml0b3JpbmdSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ21vbml0b3JpbmcucmRzLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BbWF6b25SRFNFbmhhbmNlZE1vbml0b3JpbmdSb2xlJylcbiAgICAgIF0sXG4gICAgICBwYXRoOiAnLydcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBzdWJuZXQgZ3JvdXBcbiAgICBjb25zdCBzdWJuZXRHcm91cCA9IG5ldyByZHMuU3VibmV0R3JvdXAodGhpcywgJ0RCU3VibmV0R3JvdXAnLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYCR7aWR9IGRhdGFiYXNlIHN1Ym5ldCBncm91cGAsXG4gICAgICB2cGM6IHByb3BzLmluZnJhc3RydWN0dXJlLnZwYyxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTU1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHBhcmFtZXRlciBncm91cCBmb3IgUG9zdGdyZVNRTFxuICAgIGNvbnN0IHBhcmFtZXRlckdyb3VwID0gbmV3IHJkcy5QYXJhbWV0ZXJHcm91cCh0aGlzLCAnREJQYXJhbWV0ZXJHcm91cCcsIHtcbiAgICAgIGVuZ2luZTogcmRzLkRhdGFiYXNlQ2x1c3RlckVuZ2luZS5hdXJvcmFQb3N0Z3Jlcyh7XG4gICAgICAgIHZlcnNpb246IHJkcy5BdXJvcmFQb3N0Z3Jlc0VuZ2luZVZlcnNpb24uVkVSXzE3XzRcbiAgICAgIH0pLFxuICAgICAgZGVzY3JpcHRpb246IGAke2lkfSBjbHVzdGVyIHBhcmFtZXRlciBncm91cGAsXG4gICAgICBwYXJhbWV0ZXJzOiB7XG4gICAgICAgICdzaGFyZWRfcHJlbG9hZF9saWJyYXJpZXMnOiAncGdfc3RhdF9zdGF0ZW1lbnRzJyxcbiAgICAgICAgJ2xvZ19zdGF0ZW1lbnQnOiAnYWxsJyxcbiAgICAgICAgJ2xvZ19taW5fZHVyYXRpb25fc3RhdGVtZW50JzogJzEwMDAnLFxuICAgICAgICAnbG9nX2Nvbm5lY3Rpb25zJzogJzEnLFxuICAgICAgICAnbG9nX2Rpc2Nvbm5lY3Rpb25zJzogJzEnXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIGRhdGFiYXNlIGNsdXN0ZXIgd2l0aCBjb25kaXRpb25hbCBjb25maWd1cmF0aW9uIGZvciBzZXJ2ZXJsZXNzIHZzIHByb3Zpc2lvbmVkXG4gICAgY29uc3QgaXNTZXJ2ZXJsZXNzID0gcHJvcHMuY29uZmlnLmRhdGFiYXNlLmluc3RhbmNlQ2xhc3MgPT09ICdkYi5zZXJ2ZXJsZXNzJztcbiAgICBcbiAgICBpZiAoaXNTZXJ2ZXJsZXNzKSB7XG4gICAgICAvLyBBdXJvcmEgU2VydmVybGVzcyB2MiBjb25maWd1cmF0aW9uXG4gICAgICB0aGlzLmNsdXN0ZXIgPSBuZXcgcmRzLkRhdGFiYXNlQ2x1c3Rlcih0aGlzLCAnREJDbHVzdGVyJywge1xuICAgICAgICBlbmdpbmU6IHJkcy5EYXRhYmFzZUNsdXN0ZXJFbmdpbmUuYXVyb3JhUG9zdGdyZXMoe1xuICAgICAgICAgIHZlcnNpb246IHJkcy5BdXJvcmFQb3N0Z3Jlc0VuZ2luZVZlcnNpb24uVkVSXzE3XzRcbiAgICAgICAgfSksXG4gICAgICAgIGNyZWRlbnRpYWxzOiByZHMuQ3JlZGVudGlhbHMuZnJvbVNlY3JldCh0aGlzLm1hc3RlclNlY3JldCksXG4gICAgICAgIGRlZmF1bHREYXRhYmFzZU5hbWU6ICdhdXRoZW50aWsnLFxuICAgICAgICBwb3J0OiA1NDMyLFxuICAgICAgICBzZXJ2ZXJsZXNzVjJNaW5DYXBhY2l0eTogMC41LFxuICAgICAgICBzZXJ2ZXJsZXNzVjJNYXhDYXBhY2l0eTogNCxcbiAgICAgICAgd3JpdGVyOiByZHMuQ2x1c3Rlckluc3RhbmNlLnNlcnZlcmxlc3NWMignd3JpdGVyJyksXG4gICAgICAgIHJlYWRlcnM6IHByb3BzLmNvbmZpZy5kYXRhYmFzZS5pbnN0YW5jZUNvdW50ID4gMSA/IFxuICAgICAgICAgIEFycmF5LmZyb20oeyBsZW5ndGg6IHByb3BzLmNvbmZpZy5kYXRhYmFzZS5pbnN0YW5jZUNvdW50IC0gMSB9LCAoXywgaSkgPT4gXG4gICAgICAgICAgICByZHMuQ2x1c3Rlckluc3RhbmNlLnNlcnZlcmxlc3NWMihgcmVhZGVyJHtpICsgMX1gKVxuICAgICAgICAgICkgOiBbXSxcbiAgICAgICAgcGFyYW1ldGVyR3JvdXAsXG4gICAgICAgIHN1Ym5ldEdyb3VwLFxuICAgICAgICB2cGM6IHByb3BzLmluZnJhc3RydWN0dXJlLnZwYyxcbiAgICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1NcbiAgICAgICAgfSxcbiAgICAgICAgc2VjdXJpdHlHcm91cHM6IHByb3BzLnNlY3VyaXR5R3JvdXBzLFxuICAgICAgICBzdG9yYWdlRW5jcnlwdGVkOiB0cnVlLFxuICAgICAgICBzdG9yYWdlRW5jcnlwdGlvbktleTogcHJvcHMuaW5mcmFzdHJ1Y3R1cmUua21zS2V5LFxuICAgICAgICBiYWNrdXA6IHtcbiAgICAgICAgICByZXRlbnRpb246IER1cmF0aW9uLmRheXMocHJvcHMuY29uZmlnLmRhdGFiYXNlLmJhY2t1cFJldGVudGlvbkRheXMpXG4gICAgICAgIH0sXG4gICAgICAgIGRlbGV0aW9uUHJvdGVjdGlvbjogcHJvcHMuY29uZmlnLmRhdGFiYXNlLmRlbGV0aW9uUHJvdGVjdGlvbixcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogcHJvcHMuY29uZmlnLmdlbmVyYWwucmVtb3ZhbFBvbGljeSxcbiAgICAgICAgY2xvdWR3YXRjaExvZ3NFeHBvcnRzOiBbJ3Bvc3RncmVzcWwnXSxcbiAgICAgICAgY2xvdWR3YXRjaExvZ3NSZXRlbnRpb246IHByb3BzLmNvbmZpZy5nZW5lcmFsLmVuYWJsZURldGFpbGVkTG9nZ2luZyA/IFxuICAgICAgICAgIGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEggOiBcbiAgICAgICAgICBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBQcm92aXNpb25lZCBpbnN0YW5jZXMgY29uZmlndXJhdGlvblxuICAgICAgY29uc3QgaW5zdGFuY2VUeXBlID0gZWMyLkluc3RhbmNlVHlwZS5vZihcbiAgICAgICAgZWMyLkluc3RhbmNlQ2xhc3MuVDRHLFxuICAgICAgICBwcm9wcy5jb25maWcuZGF0YWJhc2UuaW5zdGFuY2VDbGFzcy5pbmNsdWRlcygnbGFyZ2UnKSA/IGVjMi5JbnN0YW5jZVNpemUuTEFSR0UgOlxuICAgICAgICBlYzIuSW5zdGFuY2VTaXplLk1FRElVTVxuICAgICAgKTtcblxuICAgICAgdGhpcy5jbHVzdGVyID0gbmV3IHJkcy5EYXRhYmFzZUNsdXN0ZXIodGhpcywgJ0RCQ2x1c3RlcicsIHtcbiAgICAgICAgZW5naW5lOiByZHMuRGF0YWJhc2VDbHVzdGVyRW5naW5lLmF1cm9yYVBvc3RncmVzKHtcbiAgICAgICAgICB2ZXJzaW9uOiByZHMuQXVyb3JhUG9zdGdyZXNFbmdpbmVWZXJzaW9uLlZFUl8xN180XG4gICAgICAgIH0pLFxuICAgICAgICBjcmVkZW50aWFsczogcmRzLkNyZWRlbnRpYWxzLmZyb21TZWNyZXQodGhpcy5tYXN0ZXJTZWNyZXQpLFxuICAgICAgICBkZWZhdWx0RGF0YWJhc2VOYW1lOiAnYXV0aGVudGlrJyxcbiAgICAgICAgcG9ydDogNTQzMixcbiAgICAgICAgd3JpdGVyOiByZHMuQ2x1c3Rlckluc3RhbmNlLnByb3Zpc2lvbmVkKCd3cml0ZXInLCB7XG4gICAgICAgICAgaW5zdGFuY2VUeXBlLFxuICAgICAgICAgIGVuYWJsZVBlcmZvcm1hbmNlSW5zaWdodHM6IHByb3BzLmNvbmZpZy5kYXRhYmFzZS5lbmFibGVQZXJmb3JtYW5jZUluc2lnaHRzLFxuICAgICAgICAgIHBlcmZvcm1hbmNlSW5zaWdodFJldGVudGlvbjogcHJvcHMuY29uZmlnLmRhdGFiYXNlLmVuYWJsZVBlcmZvcm1hbmNlSW5zaWdodHMgPyBcbiAgICAgICAgICAgIHJkcy5QZXJmb3JtYW5jZUluc2lnaHRSZXRlbnRpb24uTU9OVEhTXzYgOiBcbiAgICAgICAgICAgIHVuZGVmaW5lZFxuICAgICAgICB9KSxcbiAgICAgICAgcmVhZGVyczogcHJvcHMuY29uZmlnLmRhdGFiYXNlLmluc3RhbmNlQ291bnQgPiAxID8gXG4gICAgICAgICAgQXJyYXkuZnJvbSh7IGxlbmd0aDogcHJvcHMuY29uZmlnLmRhdGFiYXNlLmluc3RhbmNlQ291bnQgLSAxIH0sIChfLCBpKSA9PiBcbiAgICAgICAgICAgIHJkcy5DbHVzdGVySW5zdGFuY2UucHJvdmlzaW9uZWQoYHJlYWRlciR7aSArIDF9YCwge1xuICAgICAgICAgICAgICBpbnN0YW5jZVR5cGUsXG4gICAgICAgICAgICAgIGVuYWJsZVBlcmZvcm1hbmNlSW5zaWdodHM6IHByb3BzLmNvbmZpZy5kYXRhYmFzZS5lbmFibGVQZXJmb3JtYW5jZUluc2lnaHRzLFxuICAgICAgICAgICAgICBwZXJmb3JtYW5jZUluc2lnaHRSZXRlbnRpb246IHByb3BzLmNvbmZpZy5kYXRhYmFzZS5lbmFibGVQZXJmb3JtYW5jZUluc2lnaHRzID8gXG4gICAgICAgICAgICAgICAgcmRzLlBlcmZvcm1hbmNlSW5zaWdodFJldGVudGlvbi5NT05USFNfNiA6IFxuICAgICAgICAgICAgICAgIHVuZGVmaW5lZFxuICAgICAgICAgICAgfSlcbiAgICAgICAgICApIDogW10sXG4gICAgICAgIHBhcmFtZXRlckdyb3VwLFxuICAgICAgICBzdWJuZXRHcm91cCxcbiAgICAgICAgdnBjOiBwcm9wcy5pbmZyYXN0cnVjdHVyZS52cGMsXG4gICAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTXG4gICAgICAgIH0sXG4gICAgICAgIHNlY3VyaXR5R3JvdXBzOiBwcm9wcy5zZWN1cml0eUdyb3VwcyxcbiAgICAgICAgc3RvcmFnZUVuY3J5cHRlZDogdHJ1ZSxcbiAgICAgICAgc3RvcmFnZUVuY3J5cHRpb25LZXk6IHByb3BzLmluZnJhc3RydWN0dXJlLmttc0tleSxcbiAgICAgICAgYmFja3VwOiB7XG4gICAgICAgICAgcmV0ZW50aW9uOiBEdXJhdGlvbi5kYXlzKHByb3BzLmNvbmZpZy5kYXRhYmFzZS5iYWNrdXBSZXRlbnRpb25EYXlzKVxuICAgICAgICB9LFxuICAgICAgICBkZWxldGlvblByb3RlY3Rpb246IHByb3BzLmNvbmZpZy5kYXRhYmFzZS5kZWxldGlvblByb3RlY3Rpb24sXG4gICAgICAgIHJlbW92YWxQb2xpY3k6IHByb3BzLmNvbmZpZy5nZW5lcmFsLnJlbW92YWxQb2xpY3ksXG4gICAgICAgIGNsb3Vkd2F0Y2hMb2dzRXhwb3J0czogWydwb3N0Z3Jlc3FsJ10sXG4gICAgICAgIGNsb3Vkd2F0Y2hMb2dzUmV0ZW50aW9uOiBwcm9wcy5jb25maWcuZ2VuZXJhbC5lbmFibGVEZXRhaWxlZExvZ2dpbmcgPyBcbiAgICAgICAgICBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRIIDogXG4gICAgICAgICAgbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBTdG9yZSB0aGUgaG9zdG5hbWVcbiAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5jbHVzdGVyLmNsdXN0ZXJFbmRwb2ludC5ob3N0bmFtZTtcblxuICAgIC8vIENyZWF0ZSBvdXRwdXRzXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRGF0YWJhc2VFbmRwb2ludCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmhvc3RuYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdEYXRhYmFzZSBjbHVzdGVyIGVuZHBvaW50J1xuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRGF0YWJhc2VTZWNyZXRBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5tYXN0ZXJTZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdEYXRhYmFzZSBtYXN0ZXIgc2VjcmV0IEFSTidcbiAgICB9KTtcbiAgfVxufVxuIl19