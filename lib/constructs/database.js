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
        // Derive environment-specific values from context (matches reference pattern)
        const isHighAvailability = props.environment === 'prod';
        const removalPolicy = props.contextConfig.general.removalPolicy === 'RETAIN' ?
            aws_cdk_lib_1.RemovalPolicy.RETAIN : aws_cdk_lib_1.RemovalPolicy.DESTROY;
        const enableMonitoring = props.contextConfig.database.monitoringInterval > 0;
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
        const isServerless = props.contextConfig.database.instanceClass === 'db.serverless';
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
                readers: props.contextConfig.database.instanceCount > 1 ?
                    Array.from({ length: props.contextConfig.database.instanceCount - 1 }, (_, i) => aws_cdk_lib_1.aws_rds.ClusterInstance.serverlessV2(`reader${i + 1}`)) : [],
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
                    retention: aws_cdk_lib_1.Duration.days(props.contextConfig.database.backupRetentionDays)
                },
                deletionProtection: props.contextConfig.database.deleteProtection,
                removalPolicy: removalPolicy,
                cloudwatchLogsExports: ['postgresql'],
                cloudwatchLogsRetention: props.contextConfig.general.enableDetailedLogging ?
                    aws_cdk_lib_1.aws_logs.RetentionDays.ONE_MONTH :
                    aws_cdk_lib_1.aws_logs.RetentionDays.ONE_WEEK
            });
        }
        else {
            // Provisioned instances configuration
            const instanceType = aws_cdk_lib_1.aws_ec2.InstanceType.of(aws_cdk_lib_1.aws_ec2.InstanceClass.T4G, props.contextConfig.database.instanceClass.includes('large') ? aws_cdk_lib_1.aws_ec2.InstanceSize.LARGE :
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
                    enablePerformanceInsights: props.contextConfig.database.enablePerformanceInsights,
                    performanceInsightRetention: props.contextConfig.database.enablePerformanceInsights ?
                        aws_cdk_lib_1.aws_rds.PerformanceInsightRetention.MONTHS_6 :
                        undefined
                }),
                readers: props.contextConfig.database.instanceCount > 1 ?
                    Array.from({ length: props.contextConfig.database.instanceCount - 1 }, (_, i) => aws_cdk_lib_1.aws_rds.ClusterInstance.provisioned(`reader${i + 1}`, {
                        instanceType,
                        enablePerformanceInsights: props.contextConfig.database.enablePerformanceInsights,
                        performanceInsightRetention: props.contextConfig.database.enablePerformanceInsights ?
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
                    retention: aws_cdk_lib_1.Duration.days(props.contextConfig.database.backupRetentionDays)
                },
                deletionProtection: props.contextConfig.database.deleteProtection,
                removalPolicy: removalPolicy,
                cloudwatchLogsExports: ['postgresql'],
                cloudwatchLogsRetention: props.contextConfig.general.enableDetailedLogging ?
                    aws_cdk_lib_1.aws_logs.RetentionDays.ONE_MONTH :
                    aws_cdk_lib_1.aws_logs.RetentionDays.ONE_WEEK
            });
        }
        // Store the hostname
        this.hostname = this.cluster.clusterEndpoint.hostname;
    }
}
exports.Database = Database;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGF0YWJhc2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJkYXRhYmFzZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQTs7R0FFRztBQUNILDJDQUF1QztBQUN2Qyw2Q0FTcUI7QUFrQ3JCOztHQUVHO0FBQ0gsTUFBYSxRQUFTLFNBQVEsc0JBQVM7SUFnQnJDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBb0I7UUFDNUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQiw4RUFBOEU7UUFDOUUsTUFBTSxrQkFBa0IsR0FBRyxLQUFLLENBQUMsV0FBVyxLQUFLLE1BQU0sQ0FBQztRQUN4RCxNQUFNLGFBQWEsR0FBRyxLQUFLLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxhQUFhLEtBQUssUUFBUSxDQUFDLENBQUM7WUFDNUUsMkJBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLDJCQUFhLENBQUMsT0FBTyxDQUFDO1FBQy9DLE1BQU0sZ0JBQWdCLEdBQUcsS0FBSyxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsa0JBQWtCLEdBQUcsQ0FBQyxDQUFDO1FBRTdFLDJCQUEyQjtRQUMzQixJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksZ0NBQWMsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQ3BFLFdBQVcsRUFBRSxHQUFHLEVBQUUsOEJBQThCO1lBQ2hELFVBQVUsRUFBRSxHQUFHLEtBQUssQ0FBQyxTQUFTLDJCQUEyQjtZQUN6RCxhQUFhLEVBQUUsS0FBSyxDQUFDLGNBQWMsQ0FBQyxNQUFNO1lBQzFDLG9CQUFvQixFQUFFO2dCQUNwQixvQkFBb0IsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxDQUFDO2dCQUMvRCxpQkFBaUIsRUFBRSxVQUFVO2dCQUM3QixrQkFBa0IsRUFBRSxJQUFJO2dCQUN4QixjQUFjLEVBQUUsRUFBRTthQUNuQjtT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QWM7Z0JBQ2QsV0FBVztnQkFDWCxHQUFHLEVBQUUsS0FBSyxDQUFDLGNBQWMsQ0FBQyxHQUFHO2dCQUM3QixVQUFVLEVBQUU7b0JBQ1YsVUFBVSxFQUFFLHFCQUFHLENBQUMsVUFBVSxDQUFDLG1CQUFtQjtpQkFDL0M7Z0JBQ0QsY0FBYyxFQUFFLEtBQUssQ0FBQyxjQUFjO2dCQUNwQyxnQkFBZ0IsRUFBRSxJQUFJO2dCQUN0QixvQkFBb0IsRUFBRSxLQUFLLENBQUMsY0FBYyxDQUFDLE1BQU07Z0JBQ2pELE1BQU0sRUFBRTtvQkFDTixTQUFTLEVBQUUsc0JBQVEsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsbUJBQW1CLENBQUM7aUJBQzNFO2dCQUNELGtCQUFrQixFQUFFLEtBQUssQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLGdCQUFnQjtnQkFDakUsYUFBYSxFQUFFLGFBQWE7Z0JBQzVCLHFCQUFxQixFQUFFLENBQUMsWUFBWSxDQUFDO2dCQUNyQyx1QkFBdUIsRUFBRSxLQUFLLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO29CQUMxRSxzQkFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsQ0FBQztvQkFDOUIsc0JBQUksQ0FBQyxhQUFhLENBQUMsUUFBUTthQUM5QixDQUFDLENBQUM7UUFDTCxDQUFDO1FBRUQscUJBQXFCO1FBQ3JCLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDO0lBQ3hELENBQUM7Q0FDRjtBQXJLRCw0QkFxS0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIERhdGFiYXNlIENvbnN0cnVjdCAtIENESyBpbXBsZW1lbnRhdGlvbiBvZiB0aGUgUG9zdGdyZVNRTCBkYXRhYmFzZVxuICovXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7XG4gIGF3c19yZHMgYXMgcmRzLFxuICBhd3NfZWMyIGFzIGVjMixcbiAgYXdzX3NlY3JldHNtYW5hZ2VyIGFzIHNlY3JldHNtYW5hZ2VyLFxuICBhd3NfaWFtIGFzIGlhbSxcbiAgYXdzX2ttcyBhcyBrbXMsXG4gIGF3c19sb2dzIGFzIGxvZ3MsXG4gIER1cmF0aW9uLFxuICBSZW1vdmFsUG9saWN5XG59IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB0eXBlIHsgQ29udGV4dEVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi4vc3RhY2stY29uZmlnJztcbmltcG9ydCB0eXBlIHsgSW5mcmFzdHJ1Y3R1cmVDb25maWcgfSBmcm9tICcuLi9jb25zdHJ1Y3QtY29uZmlncyc7XG5cbi8qKlxuICogUHJvcGVydGllcyBmb3IgdGhlIERhdGFiYXNlIGNvbnN0cnVjdFxuICovXG5leHBvcnQgaW50ZXJmYWNlIERhdGFiYXNlUHJvcHMge1xuICAvKipcbiAgICogRW52aXJvbm1lbnQgdHlwZSAoJ3Byb2QnIHwgJ2Rldi10ZXN0JylcbiAgICovXG4gIGVudmlyb25tZW50OiAncHJvZCcgfCAnZGV2LXRlc3QnO1xuXG4gIC8qKlxuICAgKiBGdWxsIHN0YWNrIG5hbWUgKGUuZy4sICdUQUstRGVtby1BdXRoSW5mcmEnKVxuICAgKi9cbiAgc3RhY2tOYW1lOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIENvbnRleHQtYmFzZWQgZW52aXJvbm1lbnQgY29uZmlndXJhdGlvbiAoZGlyZWN0IGZyb20gY2RrLmpzb24pXG4gICAqL1xuICBjb250ZXh0Q29uZmlnOiBDb250ZXh0RW52aXJvbm1lbnRDb25maWc7XG5cbiAgLyoqXG4gICAqIEluZnJhc3RydWN0dXJlIGNvbmZpZ3VyYXRpb24gKFZQQywgS01TLCBzZWN1cml0eSBncm91cHMpXG4gICAqL1xuICBpbmZyYXN0cnVjdHVyZTogSW5mcmFzdHJ1Y3R1cmVDb25maWc7XG5cbiAgLyoqXG4gICAqIFNlY3VyaXR5IGdyb3VwcyBmb3IgZGF0YWJhc2UgYWNjZXNzXG4gICAqL1xuICBzZWN1cml0eUdyb3VwczogZWMyLlNlY3VyaXR5R3JvdXBbXTtcbn1cblxuLyoqXG4gKiBDREsgY29uc3RydWN0IGZvciB0aGUgUG9zdGdyZVNRTCBkYXRhYmFzZSBjbHVzdGVyXG4gKi9cbmV4cG9ydCBjbGFzcyBEYXRhYmFzZSBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBUaGUgbWFzdGVyIHNlY3JldCBmb3IgZGF0YWJhc2UgYWNjZXNzXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgbWFzdGVyU2VjcmV0OiBzZWNyZXRzbWFuYWdlci5TZWNyZXQ7XG5cbiAgLyoqXG4gICAqIFRoZSBSRFMgZGF0YWJhc2UgY2x1c3RlclxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGNsdXN0ZXI6IHJkcy5EYXRhYmFzZUNsdXN0ZXI7XG5cbiAgLyoqXG4gICAqIFRoZSBkYXRhYmFzZSBob3N0bmFtZVxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGhvc3RuYW1lOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IERhdGFiYXNlUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gRGVyaXZlIGVudmlyb25tZW50LXNwZWNpZmljIHZhbHVlcyBmcm9tIGNvbnRleHQgKG1hdGNoZXMgcmVmZXJlbmNlIHBhdHRlcm4pXG4gICAgY29uc3QgaXNIaWdoQXZhaWxhYmlsaXR5ID0gcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJztcbiAgICBjb25zdCByZW1vdmFsUG9saWN5ID0gcHJvcHMuY29udGV4dENvbmZpZy5nZW5lcmFsLnJlbW92YWxQb2xpY3kgPT09ICdSRVRBSU4nID8gXG4gICAgICBSZW1vdmFsUG9saWN5LlJFVEFJTiA6IFJlbW92YWxQb2xpY3kuREVTVFJPWTtcbiAgICBjb25zdCBlbmFibGVNb25pdG9yaW5nID0gcHJvcHMuY29udGV4dENvbmZpZy5kYXRhYmFzZS5tb25pdG9yaW5nSW50ZXJ2YWwgPiAwO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBtYXN0ZXIgc2VjcmV0XG4gICAgdGhpcy5tYXN0ZXJTZWNyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdEQk1hc3RlclNlY3JldCcsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgJHtpZH06IFBvc3RncmVTUUwgTWFzdGVyIFBhc3N3b3JkYCxcbiAgICAgIHNlY3JldE5hbWU6IGAke3Byb3BzLnN0YWNrTmFtZX0vRGF0YWJhc2UvTWFzdGVyLVBhc3N3b3JkYCxcbiAgICAgIGVuY3J5cHRpb25LZXk6IHByb3BzLmluZnJhc3RydWN0dXJlLmttc0tleSxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIHNlY3JldFN0cmluZ1RlbXBsYXRlOiBKU09OLnN0cmluZ2lmeSh7IHVzZXJuYW1lOiAnYXV0aGVudGlrJyB9KSxcbiAgICAgICAgZ2VuZXJhdGVTdHJpbmdLZXk6ICdwYXNzd29yZCcsXG4gICAgICAgIGV4Y2x1ZGVQdW5jdHVhdGlvbjogdHJ1ZSxcbiAgICAgICAgcGFzc3dvcmRMZW5ndGg6IDY0XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIG1vbml0b3Jpbmcgcm9sZVxuICAgIGNvbnN0IG1vbml0b3JpbmdSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdEQk1vbml0b3JpbmdSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ21vbml0b3JpbmcucmRzLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BbWF6b25SRFNFbmhhbmNlZE1vbml0b3JpbmdSb2xlJylcbiAgICAgIF0sXG4gICAgICBwYXRoOiAnLydcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBzdWJuZXQgZ3JvdXBcbiAgICBjb25zdCBzdWJuZXRHcm91cCA9IG5ldyByZHMuU3VibmV0R3JvdXAodGhpcywgJ0RCU3VibmV0R3JvdXAnLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYCR7aWR9IGRhdGFiYXNlIHN1Ym5ldCBncm91cGAsXG4gICAgICB2cGM6IHByb3BzLmluZnJhc3RydWN0dXJlLnZwYyxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTU1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHBhcmFtZXRlciBncm91cCBmb3IgUG9zdGdyZVNRTFxuICAgIGNvbnN0IHBhcmFtZXRlckdyb3VwID0gbmV3IHJkcy5QYXJhbWV0ZXJHcm91cCh0aGlzLCAnREJQYXJhbWV0ZXJHcm91cCcsIHtcbiAgICAgIGVuZ2luZTogcmRzLkRhdGFiYXNlQ2x1c3RlckVuZ2luZS5hdXJvcmFQb3N0Z3Jlcyh7XG4gICAgICAgIHZlcnNpb246IHJkcy5BdXJvcmFQb3N0Z3Jlc0VuZ2luZVZlcnNpb24uVkVSXzE3XzRcbiAgICAgIH0pLFxuICAgICAgZGVzY3JpcHRpb246IGAke2lkfSBjbHVzdGVyIHBhcmFtZXRlciBncm91cGAsXG4gICAgICBwYXJhbWV0ZXJzOiB7XG4gICAgICAgICdzaGFyZWRfcHJlbG9hZF9saWJyYXJpZXMnOiAncGdfc3RhdF9zdGF0ZW1lbnRzJyxcbiAgICAgICAgJ2xvZ19zdGF0ZW1lbnQnOiAnYWxsJyxcbiAgICAgICAgJ2xvZ19taW5fZHVyYXRpb25fc3RhdGVtZW50JzogJzEwMDAnLFxuICAgICAgICAnbG9nX2Nvbm5lY3Rpb25zJzogJzEnLFxuICAgICAgICAnbG9nX2Rpc2Nvbm5lY3Rpb25zJzogJzEnXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIGRhdGFiYXNlIGNsdXN0ZXIgd2l0aCBjb25kaXRpb25hbCBjb25maWd1cmF0aW9uIGZvciBzZXJ2ZXJsZXNzIHZzIHByb3Zpc2lvbmVkXG4gICAgY29uc3QgaXNTZXJ2ZXJsZXNzID0gcHJvcHMuY29udGV4dENvbmZpZy5kYXRhYmFzZS5pbnN0YW5jZUNsYXNzID09PSAnZGIuc2VydmVybGVzcyc7XG4gICAgXG4gICAgaWYgKGlzU2VydmVybGVzcykge1xuICAgICAgLy8gQXVyb3JhIFNlcnZlcmxlc3MgdjIgY29uZmlndXJhdGlvblxuICAgICAgdGhpcy5jbHVzdGVyID0gbmV3IHJkcy5EYXRhYmFzZUNsdXN0ZXIodGhpcywgJ0RCQ2x1c3RlcicsIHtcbiAgICAgICAgZW5naW5lOiByZHMuRGF0YWJhc2VDbHVzdGVyRW5naW5lLmF1cm9yYVBvc3RncmVzKHtcbiAgICAgICAgICB2ZXJzaW9uOiByZHMuQXVyb3JhUG9zdGdyZXNFbmdpbmVWZXJzaW9uLlZFUl8xN180XG4gICAgICAgIH0pLFxuICAgICAgICBjcmVkZW50aWFsczogcmRzLkNyZWRlbnRpYWxzLmZyb21TZWNyZXQodGhpcy5tYXN0ZXJTZWNyZXQpLFxuICAgICAgICBkZWZhdWx0RGF0YWJhc2VOYW1lOiAnYXV0aGVudGlrJyxcbiAgICAgICAgcG9ydDogNTQzMixcbiAgICAgICAgc2VydmVybGVzc1YyTWluQ2FwYWNpdHk6IDAuNSxcbiAgICAgICAgc2VydmVybGVzc1YyTWF4Q2FwYWNpdHk6IDQsXG4gICAgICAgIHdyaXRlcjogcmRzLkNsdXN0ZXJJbnN0YW5jZS5zZXJ2ZXJsZXNzVjIoJ3dyaXRlcicpLFxuICAgICAgICByZWFkZXJzOiBwcm9wcy5jb250ZXh0Q29uZmlnLmRhdGFiYXNlLmluc3RhbmNlQ291bnQgPiAxID8gXG4gICAgICAgICAgQXJyYXkuZnJvbSh7IGxlbmd0aDogcHJvcHMuY29udGV4dENvbmZpZy5kYXRhYmFzZS5pbnN0YW5jZUNvdW50IC0gMSB9LCAoXywgaSkgPT4gXG4gICAgICAgICAgICByZHMuQ2x1c3Rlckluc3RhbmNlLnNlcnZlcmxlc3NWMihgcmVhZGVyJHtpICsgMX1gKVxuICAgICAgICAgICkgOiBbXSxcbiAgICAgICAgcGFyYW1ldGVyR3JvdXAsXG4gICAgICAgIHN1Ym5ldEdyb3VwLFxuICAgICAgICB2cGM6IHByb3BzLmluZnJhc3RydWN0dXJlLnZwYyxcbiAgICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1NcbiAgICAgICAgfSxcbiAgICAgICAgc2VjdXJpdHlHcm91cHM6IHByb3BzLnNlY3VyaXR5R3JvdXBzLFxuICAgICAgICBzdG9yYWdlRW5jcnlwdGVkOiB0cnVlLFxuICAgICAgICBzdG9yYWdlRW5jcnlwdGlvbktleTogcHJvcHMuaW5mcmFzdHJ1Y3R1cmUua21zS2V5LFxuICAgICAgICBiYWNrdXA6IHtcbiAgICAgICAgICByZXRlbnRpb246IER1cmF0aW9uLmRheXMocHJvcHMuY29udGV4dENvbmZpZy5kYXRhYmFzZS5iYWNrdXBSZXRlbnRpb25EYXlzKVxuICAgICAgICB9LFxuICAgICAgICBkZWxldGlvblByb3RlY3Rpb246IHByb3BzLmNvbnRleHRDb25maWcuZGF0YWJhc2UuZGVsZXRlUHJvdGVjdGlvbixcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogcmVtb3ZhbFBvbGljeSxcbiAgICAgICAgY2xvdWR3YXRjaExvZ3NFeHBvcnRzOiBbJ3Bvc3RncmVzcWwnXSxcbiAgICAgICAgY2xvdWR3YXRjaExvZ3NSZXRlbnRpb246IHByb3BzLmNvbnRleHRDb25maWcuZ2VuZXJhbC5lbmFibGVEZXRhaWxlZExvZ2dpbmcgPyBcbiAgICAgICAgICBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRIIDogXG4gICAgICAgICAgbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gUHJvdmlzaW9uZWQgaW5zdGFuY2VzIGNvbmZpZ3VyYXRpb25cbiAgICAgIGNvbnN0IGluc3RhbmNlVHlwZSA9IGVjMi5JbnN0YW5jZVR5cGUub2YoXG4gICAgICAgIGVjMi5JbnN0YW5jZUNsYXNzLlQ0RyxcbiAgICAgICAgcHJvcHMuY29udGV4dENvbmZpZy5kYXRhYmFzZS5pbnN0YW5jZUNsYXNzLmluY2x1ZGVzKCdsYXJnZScpID8gZWMyLkluc3RhbmNlU2l6ZS5MQVJHRSA6XG4gICAgICAgIGVjMi5JbnN0YW5jZVNpemUuTUVESVVNXG4gICAgICApO1xuXG4gICAgICB0aGlzLmNsdXN0ZXIgPSBuZXcgcmRzLkRhdGFiYXNlQ2x1c3Rlcih0aGlzLCAnREJDbHVzdGVyJywge1xuICAgICAgICBlbmdpbmU6IHJkcy5EYXRhYmFzZUNsdXN0ZXJFbmdpbmUuYXVyb3JhUG9zdGdyZXMoe1xuICAgICAgICAgIHZlcnNpb246IHJkcy5BdXJvcmFQb3N0Z3Jlc0VuZ2luZVZlcnNpb24uVkVSXzE3XzRcbiAgICAgICAgfSksXG4gICAgICAgIGNyZWRlbnRpYWxzOiByZHMuQ3JlZGVudGlhbHMuZnJvbVNlY3JldCh0aGlzLm1hc3RlclNlY3JldCksXG4gICAgICAgIGRlZmF1bHREYXRhYmFzZU5hbWU6ICdhdXRoZW50aWsnLFxuICAgICAgICBwb3J0OiA1NDMyLFxuICAgICAgICB3cml0ZXI6IHJkcy5DbHVzdGVySW5zdGFuY2UucHJvdmlzaW9uZWQoJ3dyaXRlcicsIHtcbiAgICAgICAgICBpbnN0YW5jZVR5cGUsXG4gICAgICAgICAgZW5hYmxlUGVyZm9ybWFuY2VJbnNpZ2h0czogcHJvcHMuY29udGV4dENvbmZpZy5kYXRhYmFzZS5lbmFibGVQZXJmb3JtYW5jZUluc2lnaHRzLFxuICAgICAgICAgIHBlcmZvcm1hbmNlSW5zaWdodFJldGVudGlvbjogcHJvcHMuY29udGV4dENvbmZpZy5kYXRhYmFzZS5lbmFibGVQZXJmb3JtYW5jZUluc2lnaHRzID8gXG4gICAgICAgICAgICByZHMuUGVyZm9ybWFuY2VJbnNpZ2h0UmV0ZW50aW9uLk1PTlRIU182IDogXG4gICAgICAgICAgICB1bmRlZmluZWRcbiAgICAgICAgfSksXG4gICAgICAgIHJlYWRlcnM6IHByb3BzLmNvbnRleHRDb25maWcuZGF0YWJhc2UuaW5zdGFuY2VDb3VudCA+IDEgPyBcbiAgICAgICAgICBBcnJheS5mcm9tKHsgbGVuZ3RoOiBwcm9wcy5jb250ZXh0Q29uZmlnLmRhdGFiYXNlLmluc3RhbmNlQ291bnQgLSAxIH0sIChfLCBpKSA9PiBcbiAgICAgICAgICAgIHJkcy5DbHVzdGVySW5zdGFuY2UucHJvdmlzaW9uZWQoYHJlYWRlciR7aSArIDF9YCwge1xuICAgICAgICAgICAgICBpbnN0YW5jZVR5cGUsXG4gICAgICAgICAgICAgIGVuYWJsZVBlcmZvcm1hbmNlSW5zaWdodHM6IHByb3BzLmNvbnRleHRDb25maWcuZGF0YWJhc2UuZW5hYmxlUGVyZm9ybWFuY2VJbnNpZ2h0cyxcbiAgICAgICAgICAgICAgcGVyZm9ybWFuY2VJbnNpZ2h0UmV0ZW50aW9uOiBwcm9wcy5jb250ZXh0Q29uZmlnLmRhdGFiYXNlLmVuYWJsZVBlcmZvcm1hbmNlSW5zaWdodHMgPyBcbiAgICAgICAgICAgICAgICByZHMuUGVyZm9ybWFuY2VJbnNpZ2h0UmV0ZW50aW9uLk1PTlRIU182IDogXG4gICAgICAgICAgICAgICAgdW5kZWZpbmVkXG4gICAgICAgICAgICB9KVxuICAgICAgICAgICkgOiBbXSxcbiAgICAgICAgcGFyYW1ldGVyR3JvdXAsXG4gICAgICAgIHN1Ym5ldEdyb3VwLFxuICAgICAgICB2cGM6IHByb3BzLmluZnJhc3RydWN0dXJlLnZwYyxcbiAgICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1NcbiAgICAgICAgfSxcbiAgICAgICAgc2VjdXJpdHlHcm91cHM6IHByb3BzLnNlY3VyaXR5R3JvdXBzLFxuICAgICAgICBzdG9yYWdlRW5jcnlwdGVkOiB0cnVlLFxuICAgICAgICBzdG9yYWdlRW5jcnlwdGlvbktleTogcHJvcHMuaW5mcmFzdHJ1Y3R1cmUua21zS2V5LFxuICAgICAgICBiYWNrdXA6IHtcbiAgICAgICAgICByZXRlbnRpb246IER1cmF0aW9uLmRheXMocHJvcHMuY29udGV4dENvbmZpZy5kYXRhYmFzZS5iYWNrdXBSZXRlbnRpb25EYXlzKVxuICAgICAgICB9LFxuICAgICAgICBkZWxldGlvblByb3RlY3Rpb246IHByb3BzLmNvbnRleHRDb25maWcuZGF0YWJhc2UuZGVsZXRlUHJvdGVjdGlvbixcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogcmVtb3ZhbFBvbGljeSxcbiAgICAgICAgY2xvdWR3YXRjaExvZ3NFeHBvcnRzOiBbJ3Bvc3RncmVzcWwnXSxcbiAgICAgICAgY2xvdWR3YXRjaExvZ3NSZXRlbnRpb246IHByb3BzLmNvbnRleHRDb25maWcuZ2VuZXJhbC5lbmFibGVEZXRhaWxlZExvZ2dpbmcgPyBcbiAgICAgICAgICBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRIIDogXG4gICAgICAgICAgbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBTdG9yZSB0aGUgaG9zdG5hbWVcbiAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5jbHVzdGVyLmNsdXN0ZXJFbmRwb2ludC5ob3N0bmFtZTtcbiAgfVxufVxuIl19