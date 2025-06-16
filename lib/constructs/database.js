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
            secretName: `${props.stackName}/Database/secret`,
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
                vpc: props.vpc,
                vpcSubnets: {
                    subnetType: aws_cdk_lib_1.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS
                },
                securityGroups: props.securityGroups,
                storageEncrypted: true,
                storageEncryptionKey: props.kmsKey,
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
                vpc: props.vpc,
                vpcSubnets: {
                    subnetType: aws_cdk_lib_1.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS
                },
                securityGroups: props.securityGroups,
                storageEncrypted: true,
                storageEncryptionKey: props.kmsKey,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGF0YWJhc2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJkYXRhYmFzZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQTs7R0FFRztBQUNILDJDQUF1QztBQUN2Qyw2Q0FVcUI7QUFzQ3JCOztHQUVHO0FBQ0gsTUFBYSxRQUFTLFNBQVEsc0JBQVM7SUFnQnJDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBb0I7UUFDNUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQiwyQkFBMkI7UUFDM0IsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUNwRSxXQUFXLEVBQUUsR0FBRyxFQUFFLDhCQUE4QjtZQUNoRCxVQUFVLEVBQUUsR0FBRyxLQUFLLENBQUMsU0FBUyxrQkFBa0I7WUFDaEQsYUFBYSxFQUFFLEtBQUssQ0FBQyxNQUFNO1lBQzNCLG9CQUFvQixFQUFFO2dCQUNwQixvQkFBb0IsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxDQUFDO2dCQUMvRCxpQkFBaUIsRUFBRSxVQUFVO2dCQUM3QixrQkFBa0IsRUFBRSxJQUFJO2dCQUN4QixjQUFjLEVBQUUsRUFBRTthQUNuQjtTQUNGLENBQUMsQ0FBQztRQUVILDZCQUE2QjtRQUM3QixNQUFNLGNBQWMsR0FBRyxJQUFJLHFCQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUM1RCxTQUFTLEVBQUUsSUFBSSxxQkFBRyxDQUFDLGdCQUFnQixDQUFDLDhCQUE4QixDQUFDO1lBQ25FLGVBQWUsRUFBRTtnQkFDZixxQkFBRyxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQyw4Q0FBOEMsQ0FBQzthQUMzRjtZQUNELElBQUksRUFBRSxHQUFHO1NBQ1YsQ0FBQyxDQUFDO1FBRUgsc0JBQXNCO1FBQ3RCLE1BQU0sV0FBVyxHQUFHLElBQUkscUJBQUcsQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUM3RCxXQUFXLEVBQUUsR0FBRyxFQUFFLHdCQUF3QjtZQUMxQyxHQUFHLEVBQUUsS0FBSyxDQUFDLEdBQUc7WUFDZCxVQUFVLEVBQUU7Z0JBQ1YsVUFBVSxFQUFFLHFCQUFHLENBQUMsVUFBVSxDQUFDLG1CQUFtQjthQUMvQztTQUNGLENBQUMsQ0FBQztRQUVILHdDQUF3QztRQUN4QyxNQUFNLGNBQWMsR0FBRyxJQUFJLHFCQUFHLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUN0RSxNQUFNLEVBQUUscUJBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQUM7Z0JBQy9DLE9BQU8sRUFBRSxxQkFBRyxDQUFDLDJCQUEyQixDQUFDLFFBQVE7YUFDbEQsQ0FBQztZQUNGLFdBQVcsRUFBRSxHQUFHLEVBQUUsMEJBQTBCO1lBQzVDLFVBQVUsRUFBRTtnQkFDViwwQkFBMEIsRUFBRSxvQkFBb0I7Z0JBQ2hELGVBQWUsRUFBRSxLQUFLO2dCQUN0Qiw0QkFBNEIsRUFBRSxNQUFNO2dCQUNwQyxpQkFBaUIsRUFBRSxHQUFHO2dCQUN0QixvQkFBb0IsRUFBRSxHQUFHO2FBQzFCO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsMkZBQTJGO1FBQzNGLE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGFBQWEsS0FBSyxlQUFlLENBQUM7UUFFN0UsSUFBSSxZQUFZLEVBQUUsQ0FBQztZQUNqQixxQ0FBcUM7WUFDckMsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLHFCQUFHLENBQUMsZUFBZSxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUU7Z0JBQ3hELE1BQU0sRUFBRSxxQkFBRyxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQztvQkFDL0MsT0FBTyxFQUFFLHFCQUFHLENBQUMsMkJBQTJCLENBQUMsUUFBUTtpQkFDbEQsQ0FBQztnQkFDRixXQUFXLEVBQUUscUJBQUcsQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUM7Z0JBQzFELG1CQUFtQixFQUFFLFdBQVc7Z0JBQ2hDLElBQUksRUFBRSxJQUFJO2dCQUNWLHVCQUF1QixFQUFFLEdBQUc7Z0JBQzVCLHVCQUF1QixFQUFFLENBQUM7Z0JBQzFCLE1BQU0sRUFBRSxxQkFBRyxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDO2dCQUNsRCxPQUFPLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsYUFBYSxHQUFHLENBQUMsQ0FBQyxDQUFDO29CQUNoRCxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGFBQWEsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUN2RSxxQkFBRyxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FDbkQsQ0FBQyxDQUFDLENBQUMsRUFBRTtnQkFDUixjQUFjO2dCQUNkLFdBQVc7Z0JBQ1gsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHO2dCQUNkLFVBQVUsRUFBRTtvQkFDVixVQUFVLEVBQUUscUJBQUcsQ0FBQyxVQUFVLENBQUMsbUJBQW1CO2lCQUMvQztnQkFDRCxjQUFjLEVBQUUsS0FBSyxDQUFDLGNBQWM7Z0JBQ3BDLGdCQUFnQixFQUFFLElBQUk7Z0JBQ3RCLG9CQUFvQixFQUFFLEtBQUssQ0FBQyxNQUFNO2dCQUNsQyxNQUFNLEVBQUU7b0JBQ04sU0FBUyxFQUFFLHNCQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLG1CQUFtQixDQUFDO2lCQUNwRTtnQkFDRCxrQkFBa0IsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxrQkFBa0I7Z0JBQzVELGFBQWEsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhO2dCQUNqRCxxQkFBcUIsRUFBRSxDQUFDLFlBQVksQ0FBQztnQkFDckMsdUJBQXVCLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMscUJBQXFCLENBQUMsQ0FBQztvQkFDbkUsc0JBQUksQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLENBQUM7b0JBQzlCLHNCQUFJLENBQUMsYUFBYSxDQUFDLFFBQVE7YUFDOUIsQ0FBQyxDQUFDO1FBQ0wsQ0FBQzthQUFNLENBQUM7WUFDTixzQ0FBc0M7WUFDdEMsTUFBTSxZQUFZLEdBQUcscUJBQUcsQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUN0QyxxQkFBRyxDQUFDLGFBQWEsQ0FBQyxHQUFHLEVBQ3JCLEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLHFCQUFHLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNoRixxQkFBRyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQ3hCLENBQUM7WUFFRixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUkscUJBQUcsQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRTtnQkFDeEQsTUFBTSxFQUFFLHFCQUFHLENBQUMscUJBQXFCLENBQUMsY0FBYyxDQUFDO29CQUMvQyxPQUFPLEVBQUUscUJBQUcsQ0FBQywyQkFBMkIsQ0FBQyxRQUFRO2lCQUNsRCxDQUFDO2dCQUNGLFdBQVcsRUFBRSxxQkFBRyxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQztnQkFDMUQsbUJBQW1CLEVBQUUsV0FBVztnQkFDaEMsSUFBSSxFQUFFLElBQUk7Z0JBQ1YsTUFBTSxFQUFFLHFCQUFHLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxRQUFRLEVBQUU7b0JBQ2hELFlBQVk7b0JBQ1oseUJBQXlCLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMseUJBQXlCO29CQUMxRSwyQkFBMkIsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO3dCQUM1RSxxQkFBRyxDQUFDLDJCQUEyQixDQUFDLFFBQVEsQ0FBQyxDQUFDO3dCQUMxQyxTQUFTO2lCQUNaLENBQUM7Z0JBQ0YsT0FBTyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGFBQWEsR0FBRyxDQUFDLENBQUMsQ0FBQztvQkFDaEQsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxhQUFhLEdBQUcsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FDdkUscUJBQUcsQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsRUFBRSxFQUFFO3dCQUNoRCxZQUFZO3dCQUNaLHlCQUF5QixFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLHlCQUF5Qjt3QkFDMUUsMkJBQTJCLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMseUJBQXlCLENBQUMsQ0FBQzs0QkFDNUUscUJBQUcsQ0FBQywyQkFBMkIsQ0FBQyxRQUFRLENBQUMsQ0FBQzs0QkFDMUMsU0FBUztxQkFDWixDQUFDLENBQ0gsQ0FBQyxDQUFDLENBQUMsRUFBRTtnQkFDUixjQUFjO2dCQUNkLFdBQVc7Z0JBQ1gsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHO2dCQUNkLFVBQVUsRUFBRTtvQkFDVixVQUFVLEVBQUUscUJBQUcsQ0FBQyxVQUFVLENBQUMsbUJBQW1CO2lCQUMvQztnQkFDRCxjQUFjLEVBQUUsS0FBSyxDQUFDLGNBQWM7Z0JBQ3BDLGdCQUFnQixFQUFFLElBQUk7Z0JBQ3RCLG9CQUFvQixFQUFFLEtBQUssQ0FBQyxNQUFNO2dCQUNsQyxNQUFNLEVBQUU7b0JBQ04sU0FBUyxFQUFFLHNCQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLG1CQUFtQixDQUFDO2lCQUNwRTtnQkFDRCxrQkFBa0IsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxrQkFBa0I7Z0JBQzVELGFBQWEsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhO2dCQUNqRCxxQkFBcUIsRUFBRSxDQUFDLFlBQVksQ0FBQztnQkFDckMsdUJBQXVCLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMscUJBQXFCLENBQUMsQ0FBQztvQkFDbkUsc0JBQUksQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLENBQUM7b0JBQzlCLHNCQUFJLENBQUMsYUFBYSxDQUFDLFFBQVE7YUFDOUIsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUVELHFCQUFxQjtRQUNyQixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQztRQUV0RCxpQkFBaUI7UUFDakIsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUN0QyxLQUFLLEVBQUUsSUFBSSxDQUFDLFFBQVE7WUFDcEIsV0FBVyxFQUFFLDJCQUEyQjtTQUN6QyxDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQ3ZDLEtBQUssRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLFNBQVM7WUFDbEMsV0FBVyxFQUFFLDRCQUE0QjtTQUMxQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUExS0QsNEJBMEtDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBEYXRhYmFzZSBDb25zdHJ1Y3QgLSBDREsgaW1wbGVtZW50YXRpb24gb2YgdGhlIFBvc3RncmVTUUwgZGF0YWJhc2VcbiAqL1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQge1xuICBhd3NfcmRzIGFzIHJkcyxcbiAgYXdzX2VjMiBhcyBlYzIsXG4gIGF3c19zZWNyZXRzbWFuYWdlciBhcyBzZWNyZXRzbWFuYWdlcixcbiAgYXdzX2lhbSBhcyBpYW0sXG4gIGF3c19rbXMgYXMga21zLFxuICBhd3NfbG9ncyBhcyBsb2dzLFxuICBEdXJhdGlvbixcbiAgUmVtb3ZhbFBvbGljeSxcbiAgQ2ZuT3V0cHV0XG59IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB0eXBlIHsgQXV0aEluZnJhRW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuLi9lbnZpcm9ubWVudC1jb25maWcnO1xuXG4vKipcbiAqIFByb3BlcnRpZXMgZm9yIHRoZSBEYXRhYmFzZSBjb25zdHJ1Y3RcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBEYXRhYmFzZVByb3BzIHtcbiAgLyoqXG4gICAqIEVudmlyb25tZW50IG5hbWUgKGUuZy4gJ3Byb2QnLCAnZGV2JywgZXRjLilcbiAgICovXG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEZ1bGwgc3RhY2sgbmFtZSAoZS5nLiwgJ1RBSy1EZW1vLUF1dGhJbmZyYScpXG4gICAqL1xuICBzdGFja05hbWU6IHN0cmluZztcblxuICAvKipcbiAgICogRW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxuICAgKi9cbiAgY29uZmlnOiBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZztcblxuICAvKipcbiAgICogVlBDIGZvciBkZXBsb3ltZW50XG4gICAqL1xuICB2cGM6IGVjMi5JVnBjO1xuXG4gIC8qKlxuICAgKiBLTVMga2V5IGZvciBlbmNyeXB0aW9uXG4gICAqL1xuICBrbXNLZXk6IGttcy5JS2V5O1xuXG4gIC8qKlxuICAgKiBTZWN1cml0eSBncm91cHMgZm9yIGRhdGFiYXNlIGFjY2Vzc1xuICAgKi9cbiAgc2VjdXJpdHlHcm91cHM6IGVjMi5TZWN1cml0eUdyb3VwW107XG59XG5cbi8qKlxuICogQ0RLIGNvbnN0cnVjdCBmb3IgdGhlIFBvc3RncmVTUUwgZGF0YWJhc2UgY2x1c3RlclxuICovXG5leHBvcnQgY2xhc3MgRGF0YWJhc2UgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICAvKipcbiAgICogVGhlIG1hc3RlciBzZWNyZXQgZm9yIGRhdGFiYXNlIGFjY2Vzc1xuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IG1hc3RlclNlY3JldDogc2VjcmV0c21hbmFnZXIuU2VjcmV0O1xuXG4gIC8qKlxuICAgKiBUaGUgUkRTIGRhdGFiYXNlIGNsdXN0ZXJcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBjbHVzdGVyOiByZHMuRGF0YWJhc2VDbHVzdGVyO1xuXG4gIC8qKlxuICAgKiBUaGUgZGF0YWJhc2UgaG9zdG5hbWVcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBob3N0bmFtZTogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBEYXRhYmFzZVByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIC8vIENyZWF0ZSB0aGUgbWFzdGVyIHNlY3JldFxuICAgIHRoaXMubWFzdGVyU2VjcmV0ID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnREJNYXN0ZXJTZWNyZXQnLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYCR7aWR9OiBQb3N0Z3JlU1FMIE1hc3RlciBQYXNzd29yZGAsXG4gICAgICBzZWNyZXROYW1lOiBgJHtwcm9wcy5zdGFja05hbWV9L0RhdGFiYXNlL3NlY3JldGAsXG4gICAgICBlbmNyeXB0aW9uS2V5OiBwcm9wcy5rbXNLZXksXG4gICAgICBnZW5lcmF0ZVNlY3JldFN0cmluZzoge1xuICAgICAgICBzZWNyZXRTdHJpbmdUZW1wbGF0ZTogSlNPTi5zdHJpbmdpZnkoeyB1c2VybmFtZTogJ2F1dGhlbnRpaycgfSksXG4gICAgICAgIGdlbmVyYXRlU3RyaW5nS2V5OiAncGFzc3dvcmQnLFxuICAgICAgICBleGNsdWRlUHVuY3R1YXRpb246IHRydWUsXG4gICAgICAgIHBhc3N3b3JkTGVuZ3RoOiA2NFxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBtb25pdG9yaW5nIHJvbGVcbiAgICBjb25zdCBtb25pdG9yaW5nUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnREJNb25pdG9yaW5nUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdtb25pdG9yaW5nLnJkcy5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQW1hem9uUkRTRW5oYW5jZWRNb25pdG9yaW5nUm9sZScpXG4gICAgICBdLFxuICAgICAgcGF0aDogJy8nXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgc3VibmV0IGdyb3VwXG4gICAgY29uc3Qgc3VibmV0R3JvdXAgPSBuZXcgcmRzLlN1Ym5ldEdyb3VwKHRoaXMsICdEQlN1Ym5ldEdyb3VwJywge1xuICAgICAgZGVzY3JpcHRpb246IGAke2lkfSBkYXRhYmFzZSBzdWJuZXQgZ3JvdXBgLFxuICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1NcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBwYXJhbWV0ZXIgZ3JvdXAgZm9yIFBvc3RncmVTUUxcbiAgICBjb25zdCBwYXJhbWV0ZXJHcm91cCA9IG5ldyByZHMuUGFyYW1ldGVyR3JvdXAodGhpcywgJ0RCUGFyYW1ldGVyR3JvdXAnLCB7XG4gICAgICBlbmdpbmU6IHJkcy5EYXRhYmFzZUNsdXN0ZXJFbmdpbmUuYXVyb3JhUG9zdGdyZXMoe1xuICAgICAgICB2ZXJzaW9uOiByZHMuQXVyb3JhUG9zdGdyZXNFbmdpbmVWZXJzaW9uLlZFUl8xN180XG4gICAgICB9KSxcbiAgICAgIGRlc2NyaXB0aW9uOiBgJHtpZH0gY2x1c3RlciBwYXJhbWV0ZXIgZ3JvdXBgLFxuICAgICAgcGFyYW1ldGVyczoge1xuICAgICAgICAnc2hhcmVkX3ByZWxvYWRfbGlicmFyaWVzJzogJ3BnX3N0YXRfc3RhdGVtZW50cycsXG4gICAgICAgICdsb2dfc3RhdGVtZW50JzogJ2FsbCcsXG4gICAgICAgICdsb2dfbWluX2R1cmF0aW9uX3N0YXRlbWVudCc6ICcxMDAwJyxcbiAgICAgICAgJ2xvZ19jb25uZWN0aW9ucyc6ICcxJyxcbiAgICAgICAgJ2xvZ19kaXNjb25uZWN0aW9ucyc6ICcxJ1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBkYXRhYmFzZSBjbHVzdGVyIHdpdGggY29uZGl0aW9uYWwgY29uZmlndXJhdGlvbiBmb3Igc2VydmVybGVzcyB2cyBwcm92aXNpb25lZFxuICAgIGNvbnN0IGlzU2VydmVybGVzcyA9IHByb3BzLmNvbmZpZy5kYXRhYmFzZS5pbnN0YW5jZUNsYXNzID09PSAnZGIuc2VydmVybGVzcyc7XG4gICAgXG4gICAgaWYgKGlzU2VydmVybGVzcykge1xuICAgICAgLy8gQXVyb3JhIFNlcnZlcmxlc3MgdjIgY29uZmlndXJhdGlvblxuICAgICAgdGhpcy5jbHVzdGVyID0gbmV3IHJkcy5EYXRhYmFzZUNsdXN0ZXIodGhpcywgJ0RCQ2x1c3RlcicsIHtcbiAgICAgICAgZW5naW5lOiByZHMuRGF0YWJhc2VDbHVzdGVyRW5naW5lLmF1cm9yYVBvc3RncmVzKHtcbiAgICAgICAgICB2ZXJzaW9uOiByZHMuQXVyb3JhUG9zdGdyZXNFbmdpbmVWZXJzaW9uLlZFUl8xN180XG4gICAgICAgIH0pLFxuICAgICAgICBjcmVkZW50aWFsczogcmRzLkNyZWRlbnRpYWxzLmZyb21TZWNyZXQodGhpcy5tYXN0ZXJTZWNyZXQpLFxuICAgICAgICBkZWZhdWx0RGF0YWJhc2VOYW1lOiAnYXV0aGVudGlrJyxcbiAgICAgICAgcG9ydDogNTQzMixcbiAgICAgICAgc2VydmVybGVzc1YyTWluQ2FwYWNpdHk6IDAuNSxcbiAgICAgICAgc2VydmVybGVzc1YyTWF4Q2FwYWNpdHk6IDQsXG4gICAgICAgIHdyaXRlcjogcmRzLkNsdXN0ZXJJbnN0YW5jZS5zZXJ2ZXJsZXNzVjIoJ3dyaXRlcicpLFxuICAgICAgICByZWFkZXJzOiBwcm9wcy5jb25maWcuZGF0YWJhc2UuaW5zdGFuY2VDb3VudCA+IDEgPyBcbiAgICAgICAgICBBcnJheS5mcm9tKHsgbGVuZ3RoOiBwcm9wcy5jb25maWcuZGF0YWJhc2UuaW5zdGFuY2VDb3VudCAtIDEgfSwgKF8sIGkpID0+IFxuICAgICAgICAgICAgcmRzLkNsdXN0ZXJJbnN0YW5jZS5zZXJ2ZXJsZXNzVjIoYHJlYWRlciR7aSArIDF9YClcbiAgICAgICAgICApIDogW10sXG4gICAgICAgIHBhcmFtZXRlckdyb3VwLFxuICAgICAgICBzdWJuZXRHcm91cCxcbiAgICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTXG4gICAgICAgIH0sXG4gICAgICAgIHNlY3VyaXR5R3JvdXBzOiBwcm9wcy5zZWN1cml0eUdyb3VwcyxcbiAgICAgICAgc3RvcmFnZUVuY3J5cHRlZDogdHJ1ZSxcbiAgICAgICAgc3RvcmFnZUVuY3J5cHRpb25LZXk6IHByb3BzLmttc0tleSxcbiAgICAgICAgYmFja3VwOiB7XG4gICAgICAgICAgcmV0ZW50aW9uOiBEdXJhdGlvbi5kYXlzKHByb3BzLmNvbmZpZy5kYXRhYmFzZS5iYWNrdXBSZXRlbnRpb25EYXlzKVxuICAgICAgICB9LFxuICAgICAgICBkZWxldGlvblByb3RlY3Rpb246IHByb3BzLmNvbmZpZy5kYXRhYmFzZS5kZWxldGlvblByb3RlY3Rpb24sXG4gICAgICAgIHJlbW92YWxQb2xpY3k6IHByb3BzLmNvbmZpZy5nZW5lcmFsLnJlbW92YWxQb2xpY3ksXG4gICAgICAgIGNsb3Vkd2F0Y2hMb2dzRXhwb3J0czogWydwb3N0Z3Jlc3FsJ10sXG4gICAgICAgIGNsb3Vkd2F0Y2hMb2dzUmV0ZW50aW9uOiBwcm9wcy5jb25maWcuZ2VuZXJhbC5lbmFibGVEZXRhaWxlZExvZ2dpbmcgPyBcbiAgICAgICAgICBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRIIDogXG4gICAgICAgICAgbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gUHJvdmlzaW9uZWQgaW5zdGFuY2VzIGNvbmZpZ3VyYXRpb25cbiAgICAgIGNvbnN0IGluc3RhbmNlVHlwZSA9IGVjMi5JbnN0YW5jZVR5cGUub2YoXG4gICAgICAgIGVjMi5JbnN0YW5jZUNsYXNzLlQ0RyxcbiAgICAgICAgcHJvcHMuY29uZmlnLmRhdGFiYXNlLmluc3RhbmNlQ2xhc3MuaW5jbHVkZXMoJ2xhcmdlJykgPyBlYzIuSW5zdGFuY2VTaXplLkxBUkdFIDpcbiAgICAgICAgZWMyLkluc3RhbmNlU2l6ZS5NRURJVU1cbiAgICAgICk7XG5cbiAgICAgIHRoaXMuY2x1c3RlciA9IG5ldyByZHMuRGF0YWJhc2VDbHVzdGVyKHRoaXMsICdEQkNsdXN0ZXInLCB7XG4gICAgICAgIGVuZ2luZTogcmRzLkRhdGFiYXNlQ2x1c3RlckVuZ2luZS5hdXJvcmFQb3N0Z3Jlcyh7XG4gICAgICAgICAgdmVyc2lvbjogcmRzLkF1cm9yYVBvc3RncmVzRW5naW5lVmVyc2lvbi5WRVJfMTdfNFxuICAgICAgICB9KSxcbiAgICAgICAgY3JlZGVudGlhbHM6IHJkcy5DcmVkZW50aWFscy5mcm9tU2VjcmV0KHRoaXMubWFzdGVyU2VjcmV0KSxcbiAgICAgICAgZGVmYXVsdERhdGFiYXNlTmFtZTogJ2F1dGhlbnRpaycsXG4gICAgICAgIHBvcnQ6IDU0MzIsXG4gICAgICAgIHdyaXRlcjogcmRzLkNsdXN0ZXJJbnN0YW5jZS5wcm92aXNpb25lZCgnd3JpdGVyJywge1xuICAgICAgICAgIGluc3RhbmNlVHlwZSxcbiAgICAgICAgICBlbmFibGVQZXJmb3JtYW5jZUluc2lnaHRzOiBwcm9wcy5jb25maWcuZGF0YWJhc2UuZW5hYmxlUGVyZm9ybWFuY2VJbnNpZ2h0cyxcbiAgICAgICAgICBwZXJmb3JtYW5jZUluc2lnaHRSZXRlbnRpb246IHByb3BzLmNvbmZpZy5kYXRhYmFzZS5lbmFibGVQZXJmb3JtYW5jZUluc2lnaHRzID8gXG4gICAgICAgICAgICByZHMuUGVyZm9ybWFuY2VJbnNpZ2h0UmV0ZW50aW9uLk1PTlRIU182IDogXG4gICAgICAgICAgICB1bmRlZmluZWRcbiAgICAgICAgfSksXG4gICAgICAgIHJlYWRlcnM6IHByb3BzLmNvbmZpZy5kYXRhYmFzZS5pbnN0YW5jZUNvdW50ID4gMSA/IFxuICAgICAgICAgIEFycmF5LmZyb20oeyBsZW5ndGg6IHByb3BzLmNvbmZpZy5kYXRhYmFzZS5pbnN0YW5jZUNvdW50IC0gMSB9LCAoXywgaSkgPT4gXG4gICAgICAgICAgICByZHMuQ2x1c3Rlckluc3RhbmNlLnByb3Zpc2lvbmVkKGByZWFkZXIke2kgKyAxfWAsIHtcbiAgICAgICAgICAgICAgaW5zdGFuY2VUeXBlLFxuICAgICAgICAgICAgICBlbmFibGVQZXJmb3JtYW5jZUluc2lnaHRzOiBwcm9wcy5jb25maWcuZGF0YWJhc2UuZW5hYmxlUGVyZm9ybWFuY2VJbnNpZ2h0cyxcbiAgICAgICAgICAgICAgcGVyZm9ybWFuY2VJbnNpZ2h0UmV0ZW50aW9uOiBwcm9wcy5jb25maWcuZGF0YWJhc2UuZW5hYmxlUGVyZm9ybWFuY2VJbnNpZ2h0cyA/IFxuICAgICAgICAgICAgICAgIHJkcy5QZXJmb3JtYW5jZUluc2lnaHRSZXRlbnRpb24uTU9OVEhTXzYgOiBcbiAgICAgICAgICAgICAgICB1bmRlZmluZWRcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgKSA6IFtdLFxuICAgICAgICBwYXJhbWV0ZXJHcm91cCxcbiAgICAgICAgc3VibmV0R3JvdXAsXG4gICAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTU1xuICAgICAgICB9LFxuICAgICAgICBzZWN1cml0eUdyb3VwczogcHJvcHMuc2VjdXJpdHlHcm91cHMsXG4gICAgICAgIHN0b3JhZ2VFbmNyeXB0ZWQ6IHRydWUsXG4gICAgICAgIHN0b3JhZ2VFbmNyeXB0aW9uS2V5OiBwcm9wcy5rbXNLZXksXG4gICAgICAgIGJhY2t1cDoge1xuICAgICAgICAgIHJldGVudGlvbjogRHVyYXRpb24uZGF5cyhwcm9wcy5jb25maWcuZGF0YWJhc2UuYmFja3VwUmV0ZW50aW9uRGF5cylcbiAgICAgICAgfSxcbiAgICAgICAgZGVsZXRpb25Qcm90ZWN0aW9uOiBwcm9wcy5jb25maWcuZGF0YWJhc2UuZGVsZXRpb25Qcm90ZWN0aW9uLFxuICAgICAgICByZW1vdmFsUG9saWN5OiBwcm9wcy5jb25maWcuZ2VuZXJhbC5yZW1vdmFsUG9saWN5LFxuICAgICAgICBjbG91ZHdhdGNoTG9nc0V4cG9ydHM6IFsncG9zdGdyZXNxbCddLFxuICAgICAgICBjbG91ZHdhdGNoTG9nc1JldGVudGlvbjogcHJvcHMuY29uZmlnLmdlbmVyYWwuZW5hYmxlRGV0YWlsZWRMb2dnaW5nID8gXG4gICAgICAgICAgbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCA6IFxuICAgICAgICAgIGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFS1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gU3RvcmUgdGhlIGhvc3RuYW1lXG4gICAgdGhpcy5ob3N0bmFtZSA9IHRoaXMuY2x1c3Rlci5jbHVzdGVyRW5kcG9pbnQuaG9zdG5hbWU7XG5cbiAgICAvLyBDcmVhdGUgb3V0cHV0c1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0RhdGFiYXNlRW5kcG9pbnQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5ob3N0bmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRGF0YWJhc2UgY2x1c3RlciBlbmRwb2ludCdcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0RhdGFiYXNlU2VjcmV0QXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMubWFzdGVyU2VjcmV0LnNlY3JldEFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnRGF0YWJhc2UgbWFzdGVyIHNlY3JldCBBUk4nXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==