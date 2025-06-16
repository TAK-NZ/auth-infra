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
                instances: props.config.database.instanceCount,
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
            this.cluster = new aws_cdk_lib_1.aws_rds.DatabaseCluster(this, 'DBCluster', {
                engine: aws_cdk_lib_1.aws_rds.DatabaseClusterEngine.auroraPostgres({
                    version: aws_cdk_lib_1.aws_rds.AuroraPostgresEngineVersion.VER_17_4
                }),
                credentials: aws_cdk_lib_1.aws_rds.Credentials.fromSecret(this.masterSecret),
                defaultDatabaseName: 'authentik',
                port: 5432,
                instanceProps: {
                    instanceType: aws_cdk_lib_1.aws_ec2.InstanceType.of(aws_cdk_lib_1.aws_ec2.InstanceClass.T4G, props.config.database.instanceClass.includes('large') ? aws_cdk_lib_1.aws_ec2.InstanceSize.LARGE :
                        aws_cdk_lib_1.aws_ec2.InstanceSize.MEDIUM),
                    vpcSubnets: {
                        subnetType: aws_cdk_lib_1.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS
                    },
                    vpc: props.vpc,
                    securityGroups: props.securityGroups,
                    enablePerformanceInsights: props.config.database.enablePerformanceInsights,
                    performanceInsightRetention: props.config.database.enablePerformanceInsights ?
                        aws_cdk_lib_1.aws_rds.PerformanceInsightRetention.MONTHS_6 :
                        undefined
                },
                instances: props.config.database.instanceCount,
                parameterGroup,
                subnetGroup,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGF0YWJhc2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJkYXRhYmFzZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQTs7R0FFRztBQUNILDJDQUF1QztBQUN2Qyw2Q0FVcUI7QUFzQ3JCOztHQUVHO0FBQ0gsTUFBYSxRQUFTLFNBQVEsc0JBQVM7SUFnQnJDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBb0I7UUFDNUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQiwyQkFBMkI7UUFDM0IsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUNwRSxXQUFXLEVBQUUsR0FBRyxFQUFFLDhCQUE4QjtZQUNoRCxVQUFVLEVBQUUsR0FBRyxLQUFLLENBQUMsU0FBUyxrQkFBa0I7WUFDaEQsYUFBYSxFQUFFLEtBQUssQ0FBQyxNQUFNO1lBQzNCLG9CQUFvQixFQUFFO2dCQUNwQixvQkFBb0IsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxDQUFDO2dCQUMvRCxpQkFBaUIsRUFBRSxVQUFVO2dCQUM3QixrQkFBa0IsRUFBRSxJQUFJO2dCQUN4QixjQUFjLEVBQUUsRUFBRTthQUNuQjtTQUNGLENBQUMsQ0FBQztRQUVILDZCQUE2QjtRQUM3QixNQUFNLGNBQWMsR0FBRyxJQUFJLHFCQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUM1RCxTQUFTLEVBQUUsSUFBSSxxQkFBRyxDQUFDLGdCQUFnQixDQUFDLDhCQUE4QixDQUFDO1lBQ25FLGVBQWUsRUFBRTtnQkFDZixxQkFBRyxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQyw4Q0FBOEMsQ0FBQzthQUMzRjtZQUNELElBQUksRUFBRSxHQUFHO1NBQ1YsQ0FBQyxDQUFDO1FBRUgsc0JBQXNCO1FBQ3RCLE1BQU0sV0FB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LENBQUMsTUFBTTtnQkFDbEMsTUFBTSxFQUFFO29CQUNOLFNBQVMsRUFBRSxzQkFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQztpQkFDcEU7Z0JBQ0Qsa0JBQWtCLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsa0JBQWtCO2dCQUM1RCxhQUFhLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsYUFBYTtnQkFDakQscUJBQXFCLEVBQUUsQ0FBQyxZQUFZLENBQUM7Z0JBQ3JDLHVCQUF1QixFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLHFCQUFxQixDQUFDLENBQUM7b0JBQ25FLHNCQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxDQUFDO29CQUM5QixzQkFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRO2FBQzlCLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCxxQkFBcUI7UUFDckIsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUM7UUFFdEQsaUJBQWlCO1FBQ2pCLElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDdEMsS0FBSyxFQUFFLElBQUksQ0FBQyxRQUFRO1lBQ3BCLFdBQVcsRUFBRSwyQkFBMkI7U0FDekMsQ0FBQyxDQUFDO1FBRUgsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUN2QyxLQUFLLEVBQUUsSUFBSSxDQUFDLFlBQVksQ0FBQyxTQUFTO1lBQ2xDLFdBQVcsRUFBRSw0QkFBNEI7U0FDMUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBM0pELDRCQTJKQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogRGF0YWJhc2UgQ29uc3RydWN0IC0gQ0RLIGltcGxlbWVudGF0aW9uIG9mIHRoZSBQb3N0Z3JlU1FMIGRhdGFiYXNlXG4gKi9cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHtcbiAgYXdzX3JkcyBhcyByZHMsXG4gIGF3c19lYzIgYXMgZWMyLFxuICBhd3Nfc2VjcmV0c21hbmFnZXIgYXMgc2VjcmV0c21hbmFnZXIsXG4gIGF3c19pYW0gYXMgaWFtLFxuICBhd3Nfa21zIGFzIGttcyxcbiAgYXdzX2xvZ3MgYXMgbG9ncyxcbiAgRHVyYXRpb24sXG4gIFJlbW92YWxQb2xpY3ksXG4gIENmbk91dHB1dFxufSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgdHlwZSB7IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi4vZW52aXJvbm1lbnQtY29uZmlnJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciB0aGUgRGF0YWJhc2UgY29uc3RydWN0XG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgRGF0YWJhc2VQcm9wcyB7XG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBuYW1lIChlLmcuICdwcm9kJywgJ2RldicsIGV0Yy4pXG4gICAqL1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBGdWxsIHN0YWNrIG5hbWUgKGUuZy4sICdUQUstRGVtby1BdXRoSW5mcmEnKVxuICAgKi9cbiAgc3RhY2tOYW1lOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEVudmlyb25tZW50IGNvbmZpZ3VyYXRpb25cbiAgICovXG4gIGNvbmZpZzogQXV0aEluZnJhRW52aXJvbm1lbnRDb25maWc7XG5cbiAgLyoqXG4gICAqIFZQQyBmb3IgZGVwbG95bWVudFxuICAgKi9cbiAgdnBjOiBlYzIuSVZwYztcblxuICAvKipcbiAgICogS01TIGtleSBmb3IgZW5jcnlwdGlvblxuICAgKi9cbiAga21zS2V5OiBrbXMuSUtleTtcblxuICAvKipcbiAgICogU2VjdXJpdHkgZ3JvdXBzIGZvciBkYXRhYmFzZSBhY2Nlc3NcbiAgICovXG4gIHNlY3VyaXR5R3JvdXBzOiBlYzIuU2VjdXJpdHlHcm91cFtdO1xufVxuXG4vKipcbiAqIENESyBjb25zdHJ1Y3QgZm9yIHRoZSBQb3N0Z3JlU1FMIGRhdGFiYXNlIGNsdXN0ZXJcbiAqL1xuZXhwb3J0IGNsYXNzIERhdGFiYXNlIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgLyoqXG4gICAqIFRoZSBtYXN0ZXIgc2VjcmV0IGZvciBkYXRhYmFzZSBhY2Nlc3NcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBtYXN0ZXJTZWNyZXQ6IHNlY3JldHNtYW5hZ2VyLlNlY3JldDtcblxuICAvKipcbiAgICogVGhlIFJEUyBkYXRhYmFzZSBjbHVzdGVyXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgY2x1c3RlcjogcmRzLkRhdGFiYXNlQ2x1c3RlcjtcblxuICAvKipcbiAgICogVGhlIGRhdGFiYXNlIGhvc3RuYW1lXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgaG9zdG5hbWU6IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogRGF0YWJhc2VQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIG1hc3RlciBzZWNyZXRcbiAgICB0aGlzLm1hc3RlclNlY3JldCA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ0RCTWFzdGVyU2VjcmV0Jywge1xuICAgICAgZGVzY3JpcHRpb246IGAke2lkfTogUG9zdGdyZVNRTCBNYXN0ZXIgUGFzc3dvcmRgLFxuICAgICAgc2VjcmV0TmFtZTogYCR7cHJvcHMuc3RhY2tOYW1lfS9EYXRhYmFzZS9zZWNyZXRgLFxuICAgICAgZW5jcnlwdGlvbktleTogcHJvcHMua21zS2V5LFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgc2VjcmV0U3RyaW5nVGVtcGxhdGU6IEpTT04uc3RyaW5naWZ5KHsgdXNlcm5hbWU6ICdhdXRoZW50aWsnIH0pLFxuICAgICAgICBnZW5lcmF0ZVN0cmluZ0tleTogJ3Bhc3N3b3JkJyxcbiAgICAgICAgZXhjbHVkZVB1bmN0dWF0aW9uOiB0cnVlLFxuICAgICAgICBwYXNzd29yZExlbmd0aDogNjRcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSB0aGUgbW9uaXRvcmluZyByb2xlXG4gICAgY29uc3QgbW9uaXRvcmluZ1JvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0RCTW9uaXRvcmluZ1JvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbW9uaXRvcmluZy5yZHMuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FtYXpvblJEU0VuaGFuY2VkTW9uaXRvcmluZ1JvbGUnKVxuICAgICAgXSxcbiAgICAgIHBhdGg6ICcvJ1xuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHN1Ym5ldCBncm91cFxuICAgIGNvbnN0IHN1Ym5ldEdyb3VwID0gbmV3IHJkcy5TdWJuZXRHcm91cCh0aGlzLCAnREJTdWJuZXRHcm91cCcsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgJHtpZH0gZGF0YWJhc2Ugc3VibmV0IGdyb3VwYCxcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgcGFyYW1ldGVyIGdyb3VwIGZvciBQb3N0Z3JlU1FMXG4gICAgY29uc3QgcGFyYW1ldGVyR3JvdXAgPSBuZXcgcmRzLlBhcmFtZXRlckdyb3VwKHRoaXMsICdEQlBhcmFtZXRlckdyb3VwJywge1xuICAgICAgZW5naW5lOiByZHMuRGF0YWJhc2VDbHVzdGVyRW5naW5lLmF1cm9yYVBvc3RncmVzKHtcbiAgICAgICAgdmVyc2lvbjogcmRzLkF1cm9yYVBvc3RncmVzRW5naW5lVmVyc2lvbi5WRVJfMTdfNFxuICAgICAgfSksXG4gICAgICBkZXNjcmlwdGlvbjogYCR7aWR9IGNsdXN0ZXIgcGFyYW1ldGVyIGdyb3VwYCxcbiAgICAgIHBhcmFtZXRlcnM6IHtcbiAgICAgICAgJ3NoYXJlZF9wcmVsb2FkX2xpYnJhcmllcyc6ICdwZ19zdGF0X3N0YXRlbWVudHMnLFxuICAgICAgICAnbG9nX3N0YXRlbWVudCc6ICdhbGwnLFxuICAgICAgICAnbG9nX21pbl9kdXJhdGlvbl9zdGF0ZW1lbnQnOiAnMTAwMCcsXG4gICAgICAgICdsb2dfY29ubmVjdGlvbnMnOiAnMScsXG4gICAgICAgICdsb2dfZGlzY29ubmVjdGlvbnMnOiAnMSdcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSB0aGUgZGF0YWJhc2UgY2x1c3RlciB3aXRoIGNvbmRpdGlvbmFsIGNvbmZpZ3VyYXRpb24gZm9yIHNlcnZlcmxlc3MgdnMgcHJvdmlzaW9uZWRcbiAgICBjb25zdCBpc1NlcnZlcmxlc3MgPSBwcm9wcy5jb25maWcuZGF0YWJhc2UuaW5zdGFuY2VDbGFzcyA9PT0gJ2RiLnNlcnZlcmxlc3MnO1xuICAgIFxuICAgIGlmIChpc1NlcnZlcmxlc3MpIHtcbiAgICAgIC8vIEF1cm9yYSBTZXJ2ZXJsZXNzIHYyIGNvbmZpZ3VyYXRpb25cbiAgICAgIHRoaXMuY2x1c3RlciA9IG5ldyByZHMuRGF0YWJhc2VDbHVzdGVyKHRoaXMsICdEQkNsdXN0ZXInLCB7XG4gICAgICAgIGVuZ2luZTogcmRzLkRhdGFiYXNlQ2x1c3RlckVuZ2luZS5hdXJvcmFQb3N0Z3Jlcyh7XG4gICAgICAgICAgdmVyc2lvbjogcmRzLkF1cm9yYVBvc3RncmVzRW5naW5lVmVyc2lvbi5WRVJfMTdfNFxuICAgICAgICB9KSxcbiAgICAgICAgY3JlZGVudGlhbHM6IHJkcy5DcmVkZW50aWFscy5mcm9tU2VjcmV0KHRoaXMubWFzdGVyU2VjcmV0KSxcbiAgICAgICAgZGVmYXVsdERhdGFiYXNlTmFtZTogJ2F1dGhlbnRpaycsXG4gICAgICAgIHBvcnQ6IDU0MzIsXG4gICAgICAgIHNlcnZlcmxlc3NWMk1pbkNhcGFjaXR5OiAwLjUsXG4gICAgICAgIHNlcnZlcmxlc3NWMk1heENhcGFjaXR5OiA0LFxuICAgICAgICBpbnN0YW5jZXM6IHByb3BzLmNvbmZpZy5kYXRhYmFzZS5pbnN0YW5jZUNvdW50LFxuICAgICAgICBwYXJhbWV0ZXJHcm91cCxcbiAgICAgICAgc3VibmV0R3JvdXAsXG4gICAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTU1xuICAgICAgICB9LFxuICAgICAgICBzZWN1cml0eUdyb3VwczogcHJvcHMuc2VjdXJpdHlHcm91cHMsXG4gICAgICAgIHN0b3JhZ2VFbmNyeXB0ZWQ6IHRydWUsXG4gICAgICAgIHN0b3JhZ2VFbmNyeXB0aW9uS2V5OiBwcm9wcy5rbXNLZXksXG4gICAgICAgIGJhY2t1cDoge1xuICAgICAgICAgIHJldGVudGlvbjogRHVyYXRpb24uZGF5cyhwcm9wcy5jb25maWcuZGF0YWJhc2UuYmFja3VwUmV0ZW50aW9uRGF5cylcbiAgICAgICAgfSxcbiAgICAgICAgZGVsZXRpb25Qcm90ZWN0aW9uOiBwcm9wcy5jb25maWcuZGF0YWJhc2UuZGVsZXRpb25Qcm90ZWN0aW9uLFxuICAgICAgICByZW1vdmFsUG9saWN5OiBwcm9wcy5jb25maWcuZ2VuZXJhbC5yZW1vdmFsUG9saWN5LFxuICAgICAgICBjbG91ZHdhdGNoTG9nc0V4cG9ydHM6IFsncG9zdGdyZXNxbCddLFxuICAgICAgICBjbG91ZHdhdGNoTG9nc1JldGVudGlvbjogcHJvcHMuY29uZmlnLmdlbmVyYWwuZW5hYmxlRGV0YWlsZWRMb2dnaW5nID8gXG4gICAgICAgICAgbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCA6IFxuICAgICAgICAgIGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFS1xuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFByb3Zpc2lvbmVkIGluc3RhbmNlcyBjb25maWd1cmF0aW9uXG4gICAgICB0aGlzLmNsdXN0ZXIgPSBuZXcgcmRzLkRhdGFiYXNlQ2x1c3Rlcih0aGlzLCAnREJDbHVzdGVyJywge1xuICAgICAgICBlbmdpbmU6IHJkcy5EYXRhYmFzZUNsdXN0ZXJFbmdpbmUuYXVyb3JhUG9zdGdyZXMoe1xuICAgICAgICAgIHZlcnNpb246IHJkcy5BdXJvcmFQb3N0Z3Jlc0VuZ2luZVZlcnNpb24uVkVSXzE3XzRcbiAgICAgICAgfSksXG4gICAgICAgIGNyZWRlbnRpYWxzOiByZHMuQ3JlZGVudGlhbHMuZnJvbVNlY3JldCh0aGlzLm1hc3RlclNlY3JldCksXG4gICAgICAgIGRlZmF1bHREYXRhYmFzZU5hbWU6ICdhdXRoZW50aWsnLFxuICAgICAgICBwb3J0OiA1NDMyLFxuICAgICAgICBpbnN0YW5jZVByb3BzOiB7XG4gICAgICAgICAgaW5zdGFuY2VUeXBlOiBlYzIuSW5zdGFuY2VUeXBlLm9mKFxuICAgICAgICAgICAgZWMyLkluc3RhbmNlQ2xhc3MuVDRHLFxuICAgICAgICAgICAgcHJvcHMuY29uZmlnLmRhdGFiYXNlLmluc3RhbmNlQ2xhc3MuaW5jbHVkZXMoJ2xhcmdlJykgPyBlYzIuSW5zdGFuY2VTaXplLkxBUkdFIDpcbiAgICAgICAgICAgIGVjMi5JbnN0YW5jZVNpemUuTUVESVVNXG4gICAgICAgICAgKSxcbiAgICAgICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTXG4gICAgICAgICAgfSxcbiAgICAgICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgICAgICBzZWN1cml0eUdyb3VwczogcHJvcHMuc2VjdXJpdHlHcm91cHMsXG4gICAgICAgICAgZW5hYmxlUGVyZm9ybWFuY2VJbnNpZ2h0czogcHJvcHMuY29uZmlnLmRhdGFiYXNlLmVuYWJsZVBlcmZvcm1hbmNlSW5zaWdodHMsXG4gICAgICAgICAgcGVyZm9ybWFuY2VJbnNpZ2h0UmV0ZW50aW9uOiBwcm9wcy5jb25maWcuZGF0YWJhc2UuZW5hYmxlUGVyZm9ybWFuY2VJbnNpZ2h0cyA/IFxuICAgICAgICAgICAgcmRzLlBlcmZvcm1hbmNlSW5zaWdodFJldGVudGlvbi5NT05USFNfNiA6IFxuICAgICAgICAgICAgdW5kZWZpbmVkXG4gICAgICAgIH0sXG4gICAgICAgIGluc3RhbmNlczogcHJvcHMuY29uZmlnLmRhdGFiYXNlLmluc3RhbmNlQ291bnQsXG4gICAgICAgIHBhcmFtZXRlckdyb3VwLFxuICAgICAgICBzdWJuZXRHcm91cCxcbiAgICAgICAgc3RvcmFnZUVuY3J5cHRlZDogdHJ1ZSxcbiAgICAgICAgc3RvcmFnZUVuY3J5cHRpb25LZXk6IHByb3BzLmttc0tleSxcbiAgICAgICAgYmFja3VwOiB7XG4gICAgICAgICAgcmV0ZW50aW9uOiBEdXJhdGlvbi5kYXlzKHByb3BzLmNvbmZpZy5kYXRhYmFzZS5iYWNrdXBSZXRlbnRpb25EYXlzKVxuICAgICAgICB9LFxuICAgICAgICBkZWxldGlvblByb3RlY3Rpb246IHByb3BzLmNvbmZpZy5kYXRhYmFzZS5kZWxldGlvblByb3RlY3Rpb24sXG4gICAgICAgIHJlbW92YWxQb2xpY3k6IHByb3BzLmNvbmZpZy5nZW5lcmFsLnJlbW92YWxQb2xpY3ksXG4gICAgICAgIGNsb3Vkd2F0Y2hMb2dzRXhwb3J0czogWydwb3N0Z3Jlc3FsJ10sXG4gICAgICAgIGNsb3Vkd2F0Y2hMb2dzUmV0ZW50aW9uOiBwcm9wcy5jb25maWcuZ2VuZXJhbC5lbmFibGVEZXRhaWxlZExvZ2dpbmcgPyBcbiAgICAgICAgICBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRIIDogXG4gICAgICAgICAgbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBTdG9yZSB0aGUgaG9zdG5hbWVcbiAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5jbHVzdGVyLmNsdXN0ZXJFbmRwb2ludC5ob3N0bmFtZTtcblxuICAgIC8vIENyZWF0ZSBvdXRwdXRzXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRGF0YWJhc2VFbmRwb2ludCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmhvc3RuYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdEYXRhYmFzZSBjbHVzdGVyIGVuZHBvaW50J1xuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRGF0YWJhc2VTZWNyZXRBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5tYXN0ZXJTZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdEYXRhYmFzZSBtYXN0ZXIgc2VjcmV0IEFSTidcbiAgICB9KTtcbiAgfVxufVxuIl19