/**
 * Database Construct - CDK implementation of the PostgreSQL database
 */
import { Construct } from 'constructs';
import {
  aws_rds as rds,
  aws_ec2 as ec2,
  aws_secretsmanager as secretsmanager,
  aws_iam as iam,
  aws_kms as kms,
  aws_logs as logs,
  Duration,
  RemovalPolicy,
  CfnOutput
} from 'aws-cdk-lib';
import type { AuthInfraEnvironmentConfig } from '../environment-config';

/**
 * Properties for the Database construct
 */
export interface DatabaseProps {
  /**
   * Environment name (e.g. 'prod', 'dev', etc.)
   */
  environment: string;

  /**
   * Full stack name (e.g., 'TAK-Demo-AuthInfra')
   */
  stackName: string;

  /**
   * Environment configuration
   */
  config: AuthInfraEnvironmentConfig;

  /**
   * VPC for deployment
   */
  vpc: ec2.IVpc;

  /**
   * KMS key for encryption
   */
  kmsKey: kms.IKey;

  /**
   * Security groups for database access
   */
  securityGroups: ec2.SecurityGroup[];
}

/**
 * CDK construct for the PostgreSQL database cluster
 */
export class Database extends Construct {
  /**
   * The master secret for database access
   */
  public readonly masterSecret: secretsmanager.Secret;

  /**
   * The RDS database cluster
   */
  public readonly cluster: rds.DatabaseCluster;

  /**
   * The database hostname
   */
  public readonly hostname: string;

  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id);

    // Create the master secret
    this.masterSecret = new secretsmanager.Secret(this, 'DBMasterSecret', {
      description: `${id}: PostgreSQL Master Password`,
      secretName: `${props.stackName}/Database/Master-Password`,
      encryptionKey: props.kmsKey,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'authentik' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 64
      }
    });

    // Create the monitoring role
    const monitoringRole = new iam.Role(this, 'DBMonitoringRole', {
      assumedBy: new iam.ServicePrincipal('monitoring.rds.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonRDSEnhancedMonitoringRole')
      ],
      path: '/'
    });

    // Create subnet group
    const subnetGroup = new rds.SubnetGroup(this, 'DBSubnetGroup', {
      description: `${id} database subnet group`,
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      }
    });

    // Create parameter group for PostgreSQL
    const parameterGroup = new rds.ParameterGroup(this, 'DBParameterGroup', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_17_4
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
      this.cluster = new rds.DatabaseCluster(this, 'DBCluster', {
        engine: rds.DatabaseClusterEngine.auroraPostgres({
          version: rds.AuroraPostgresEngineVersion.VER_17_4
        }),
        credentials: rds.Credentials.fromSecret(this.masterSecret),
        defaultDatabaseName: 'authentik',
        port: 5432,
        serverlessV2MinCapacity: 0.5,
        serverlessV2MaxCapacity: 4,
        writer: rds.ClusterInstance.serverlessV2('writer'),
        readers: props.config.database.instanceCount > 1 ? 
          Array.from({ length: props.config.database.instanceCount - 1 }, (_, i) => 
            rds.ClusterInstance.serverlessV2(`reader${i + 1}`)
          ) : [],
        parameterGroup,
        subnetGroup,
        vpc: props.vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
        },
        securityGroups: props.securityGroups,
        storageEncrypted: true,
        storageEncryptionKey: props.kmsKey,
        backup: {
          retention: Duration.days(props.config.database.backupRetentionDays)
        },
        deletionProtection: props.config.database.deletionProtection,
        removalPolicy: props.config.general.removalPolicy,
        cloudwatchLogsExports: ['postgresql'],
        cloudwatchLogsRetention: props.config.general.enableDetailedLogging ? 
          logs.RetentionDays.ONE_MONTH : 
          logs.RetentionDays.ONE_WEEK
      });
    } else {
      // Provisioned instances configuration
      const instanceType = ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        props.config.database.instanceClass.includes('large') ? ec2.InstanceSize.LARGE :
        ec2.InstanceSize.MEDIUM
      );

      this.cluster = new rds.DatabaseCluster(this, 'DBCluster', {
        engine: rds.DatabaseClusterEngine.auroraPostgres({
          version: rds.AuroraPostgresEngineVersion.VER_17_4
        }),
        credentials: rds.Credentials.fromSecret(this.masterSecret),
        defaultDatabaseName: 'authentik',
        port: 5432,
        writer: rds.ClusterInstance.provisioned('writer', {
          instanceType,
          enablePerformanceInsights: props.config.database.enablePerformanceInsights,
          performanceInsightRetention: props.config.database.enablePerformanceInsights ? 
            rds.PerformanceInsightRetention.MONTHS_6 : 
            undefined
        }),
        readers: props.config.database.instanceCount > 1 ? 
          Array.from({ length: props.config.database.instanceCount - 1 }, (_, i) => 
            rds.ClusterInstance.provisioned(`reader${i + 1}`, {
              instanceType,
              enablePerformanceInsights: props.config.database.enablePerformanceInsights,
              performanceInsightRetention: props.config.database.enablePerformanceInsights ? 
                rds.PerformanceInsightRetention.MONTHS_6 : 
                undefined
            })
          ) : [],
        parameterGroup,
        subnetGroup,
        vpc: props.vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
        },
        securityGroups: props.securityGroups,
        storageEncrypted: true,
        storageEncryptionKey: props.kmsKey,
        backup: {
          retention: Duration.days(props.config.database.backupRetentionDays)
        },
        deletionProtection: props.config.database.deletionProtection,
        removalPolicy: props.config.general.removalPolicy,
        cloudwatchLogsExports: ['postgresql'],
        cloudwatchLogsRetention: props.config.general.enableDetailedLogging ? 
          logs.RetentionDays.ONE_MONTH : 
          logs.RetentionDays.ONE_WEEK
      });
    }

    // Store the hostname
    this.hostname = this.cluster.clusterEndpoint.hostname;

    // Create outputs
    new CfnOutput(this, 'DatabaseEndpoint', {
      value: this.hostname,
      description: 'Database cluster endpoint'
    });

    new CfnOutput(this, 'DatabaseSecretArn', {
      value: this.masterSecret.secretArn,
      description: 'Database master secret ARN'
    });
  }
}
