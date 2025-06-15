"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthInfraStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const database_1 = require("./constructs/database");
const redis_1 = require("./constructs/redis");
const efs_1 = require("./constructs/efs");
const secrets_manager_1 = require("./constructs/secrets-manager");
const elb_1 = require("./constructs/elb");
const authentik_server_1 = require("./constructs/authentik-server");
const authentik_worker_1 = require("./constructs/authentik-worker");
const ldap_1 = require("./constructs/ldap");
const ldap_token_retriever_1 = require("./constructs/ldap-token-retriever");
const s3_env_file_manager_1 = require("./constructs/s3-env-file-manager");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const outputs_1 = require("./outputs");
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const ecs = __importStar(require("aws-cdk-lib/aws-ecs"));
const kms = __importStar(require("aws-cdk-lib/aws-kms"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const cloudformation_imports_1 = require("./cloudformation-imports");
const environment_config_1 = require("./environment-config");
/**
 * Main CDK stack for the TAK Auth Infrastructure
 */
class AuthInfraStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, {
            ...props,
            description: 'TAK Authentication Layer - Authentik, LDAP Outpost',
        });
        const config = props.stackConfig;
        // Extract configuration values
        const envType = config.envType;
        const stackNameComponent = config.stackName; // This is the STACK_NAME part (e.g., "MyFirstStack")
        const resolvedStackName = id;
        // Get environment-specific defaults (following reference template pattern)
        const envConfig = config.envType === 'prod' ?
            { enableHighAvailability: true, enableDetailedMonitoring: true } :
            { enableHighAvailability: false, enableDetailedMonitoring: false };
        const enableHighAvailability = envConfig.enableHighAvailability;
        // Get base configuration and merge with overrides
        const baseConfig = (0, environment_config_1.getEnvironmentConfig)(envType);
        const mergedConfig = config.overrides ?
            (0, environment_config_1.mergeEnvironmentConfig)(baseConfig, config.overrides) :
            baseConfig;
        // Set container counts based on high availability setting
        // enableHighAvailability=true: 2 containers (Server, Worker, LDAP)
        // enableHighAvailability=false: 1 container each
        const desiredContainerCount = enableHighAvailability ? 2 : 1;
        // Override container counts in merged config unless explicitly set via context
        if (!config.overrides?.ecs?.desiredCount) {
            mergedConfig.ecs.desiredCount = desiredContainerCount;
        }
        if (!config.overrides?.ecs?.workerDesiredCount) {
            mergedConfig.ecs.workerDesiredCount = desiredContainerCount;
        }
        // Add Environment Type tag to the stack
        const environmentLabel = envType === 'prod' ? 'Prod' : 'Dev-Test';
        cdk.Tags.of(this).add('Environment Type', environmentLabel);
        const awsStackName = aws_cdk_lib_1.Fn.ref('AWS::StackName');
        const awsRegion = cdk.Stack.of(this).region;
        // Context-based parameter resolution (CDK context only)
        const gitSha = this.node.tryGetContext('gitSha') || this.getGitSha();
        const enableExecute = Boolean(this.node.tryGetContext('enableExecute') || false);
        const authentikAdminUserEmail = this.node.tryGetContext('authentikAdminUserEmail') || '';
        const authentikLdapBaseDn = this.node.tryGetContext('authentikLdapBaseDn') || 'DC=example,DC=com';
        const sslCertificateArn = this.node.tryGetContext('sslCertificateArn') || '';
        const useAuthentikConfigFile = Boolean(this.node.tryGetContext('useAuthentikConfigFile') || false);
        // Validate required parameters
        if (!authentikAdminUserEmail || authentikAdminUserEmail.trim() === '') {
            throw new Error('authentikAdminUserEmail is required. Set it via --context authentikAdminUserEmail=user@example.com');
        }
        const stackName = aws_cdk_lib_1.Fn.ref('AWS::StackName');
        const region = cdk.Stack.of(this).region;
        // Import VPC and networking from base infrastructure
        const vpc = ec2.Vpc.fromVpcAttributes(this, 'VPC', {
            vpcId: aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.VPC_ID)),
            availabilityZones: this.availabilityZones,
            // Import subnet IDs from base infrastructure
            publicSubnetIds: [
                aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.SUBNET_PUBLIC_A)),
                aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.SUBNET_PUBLIC_B))
            ],
            privateSubnetIds: [
                aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.SUBNET_PRIVATE_A)),
                aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.SUBNET_PRIVATE_B))
            ]
        });
        // Import KMS key from base infrastructure
        const kmsKey = kms.Key.fromKeyArn(this, 'KMSKey', aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.KMS_KEY)));
        // Import ECS Cluster from base infrastructure
        const ecsCluster = ecs.Cluster.fromClusterArn(this, 'ECSCluster', aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.ECS_CLUSTER)));
        // Import S3 configuration bucket from base infrastructure
        const s3ConfBucket = s3.Bucket.fromBucketArn(this, 'S3ConfBucket', aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.S3_BUCKET)));
        // Import ECR repository from base infrastructure (for local ECR option)
        const ecrRepository = aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.ECR_REPO));
        // S3 Environment File Manager - manages authentik-config.env file
        const s3EnvFileManager = new s3_env_file_manager_1.S3EnvFileManager(this, 'S3EnvFileManager', {
            environment: stackNameComponent,
            s3ConfBucket,
            envFileName: 'authentik-config.env'
        });
        // Security Groups
        const ecsSecurityGroup = this.createEcsSecurityGroup(vpc);
        const dbSecurityGroup = this.createDbSecurityGroup(vpc, ecsSecurityGroup);
        const redisSecurityGroup = this.createRedisSecurityGroup(vpc, ecsSecurityGroup);
        // SecretsManager
        const secretsManager = new secrets_manager_1.SecretsManager(this, 'SecretsManager', {
            environment: stackNameComponent,
            kmsKey
        });
        // Database
        const database = new database_1.Database(this, 'Database', {
            environment: stackNameComponent,
            config: mergedConfig,
            vpc,
            kmsKey,
            securityGroups: [dbSecurityGroup]
        });
        // Redis
        const redis = new redis_1.Redis(this, 'Redis', {
            environment: stackNameComponent,
            config: mergedConfig,
            vpc,
            kmsKey,
            securityGroups: [redisSecurityGroup]
        });
        // EFS
        const efs = new efs_1.Efs(this, 'EFS', {
            environment: stackNameComponent,
            vpc,
            kmsKey,
            allowAccessFrom: [ecsSecurityGroup]
        });
        // Authentik Load Balancer
        const authentikELB = new elb_1.Elb(this, 'AuthentikELB', {
            environment: stackNameComponent,
            config: mergedConfig,
            vpc,
            sslCertificateArn: sslCertificateArn
        });
        // Authentik Server
        const authentikServer = new authentik_server_1.AuthentikServer(this, 'AuthentikServer', {
            environment: stackNameComponent,
            config: mergedConfig,
            vpc,
            ecsSecurityGroup,
            ecsCluster,
            s3ConfBucket,
            envFileS3Uri: s3EnvFileManager.envFileS3Uri,
            envFileS3Key: s3EnvFileManager.envFileS3Key,
            adminUserEmail: authentikAdminUserEmail,
            ldapBaseDn: authentikLdapBaseDn,
            useConfigFile: useAuthentikConfigFile,
            ecrRepositoryArn: ecrRepository,
            enableExecute: enableExecute,
            dbSecret: database.masterSecret,
            dbHostname: database.hostname,
            redisAuthToken: redis.authToken,
            redisHostname: redis.hostname,
            secretKey: secretsManager.secretKey,
            adminUserPassword: secretsManager.adminUserPassword,
            adminUserToken: secretsManager.adminUserToken,
            ldapToken: secretsManager.ldapToken,
            efsId: efs.fileSystem.fileSystemId,
            efsMediaAccessPointId: efs.mediaAccessPoint.accessPointId,
            efsCustomTemplatesAccessPointId: efs.customTemplatesAccessPoint.accessPointId
        });
        // Authentik Worker
        const authentikWorker = new authentik_worker_1.AuthentikWorker(this, 'AuthentikWorker', {
            environment: stackNameComponent,
            config: mergedConfig,
            vpc,
            ecsSecurityGroup,
            ecsCluster,
            s3ConfBucket,
            envFileS3Key: s3EnvFileManager.envFileS3Key,
            ecrRepositoryArn: ecrRepository,
            enableExecute: enableExecute,
            dbSecret: database.masterSecret,
            dbHostname: database.hostname,
            redisAuthToken: redis.authToken,
            redisHostname: redis.hostname,
            secretKey: secretsManager.secretKey,
            efsId: efs.fileSystem.fileSystemId,
            efsMediaAccessPointId: efs.mediaAccessPoint.accessPointId,
            efsCustomTemplatesAccessPointId: efs.customTemplatesAccessPoint.accessPointId
        });
        // Connect Authentik Server to Load Balancer
        authentikServer.createTargetGroup(vpc, authentikELB.httpsListener);
        // LDAP Token Retriever
        const ldapTokenRetriever = new ldap_token_retriever_1.LdapTokenRetriever(this, 'LdapTokenRetriever', {
            environment: stackNameComponent,
            config: mergedConfig,
            kmsKey,
            authentikHost: `https://${authentikELB.dnsName}`,
            outpostName: 'LDAP',
            adminTokenSecret: secretsManager.adminUserToken,
            ldapTokenSecret: secretsManager.ldapToken,
            gitSha: gitSha
        });
        // LDAP
        const ldap = new ldap_1.Ldap(this, 'LDAP', {
            environment: stackNameComponent,
            config: mergedConfig,
            vpc,
            ecsSecurityGroup,
            ecsCluster,
            s3ConfBucket,
            sslCertificateArn: sslCertificateArn,
            authentikHost: authentikELB.dnsName,
            ecrRepositoryArn: ecrRepository,
            enableExecute: enableExecute,
            ldapToken: secretsManager.ldapToken
        });
        // Ensure LDAP waits for the token to be retrieved
        ldap.node.addDependency(ldapTokenRetriever);
        // Outputs
        (0, outputs_1.registerOutputs)({
            stack: this,
            stackName: stackNameComponent,
            databaseEndpoint: database.hostname,
            databaseSecretArn: database.masterSecret.secretArn,
            redisEndpoint: redis.hostname,
            redisAuthTokenArn: redis.authToken.secretArn,
            efsId: efs.fileSystem.fileSystemId,
            efsMediaAccessPointId: efs.mediaAccessPoint.accessPointId,
            efsTemplatesAccessPointId: efs.customTemplatesAccessPoint.accessPointId,
            authentikSecretKeyArn: secretsManager.secretKey.secretArn,
            authentikAdminTokenArn: secretsManager.adminUserToken.secretArn,
            authentikLdapTokenArn: secretsManager.ldapToken.secretArn,
            authentikAlbDns: authentikELB.loadBalancer.loadBalancerDnsName,
            authentikUrl: `https://${authentikELB.dnsName}`,
            ldapNlbDns: ldap.loadBalancer.loadBalancerDnsName,
            ldapTokenRetrieverLambdaArn: ldapTokenRetriever.lambdaFunction.functionArn
        });
    }
    createEcsSecurityGroup(vpc) {
        const ecsSecurityGroup = new ec2.SecurityGroup(this, 'ECSSecurityGroup', {
            vpc,
            description: 'Security group for ECS tasks',
            allowAllOutbound: true
        });
        // Allow HTTP/HTTPS traffic to ECS tasks
        ecsSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP traffic');
        ecsSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Allow HTTPS traffic');
        ecsSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(9000), 'Allow Authentik traffic');
        return ecsSecurityGroup;
    }
    createDbSecurityGroup(vpc, ecsSecurityGroup) {
        const dbSecurityGroup = new ec2.SecurityGroup(this, 'DBSecurityGroup', {
            vpc,
            description: 'Security group for database',
            allowAllOutbound: false
        });
        // Allow PostgreSQL access from ECS tasks
        dbSecurityGroup.addIngressRule(ec2.Peer.securityGroupId(ecsSecurityGroup.securityGroupId), ec2.Port.tcp(5432), 'Allow PostgreSQL access from ECS tasks');
        return dbSecurityGroup;
    }
    createRedisSecurityGroup(vpc, ecsSecurityGroup) {
        const redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
            vpc,
            description: 'Security group for Redis',
            allowAllOutbound: false
        });
        // Allow Redis access from ECS tasks
        redisSecurityGroup.addIngressRule(ec2.Peer.securityGroupId(ecsSecurityGroup.securityGroupId), ec2.Port.tcp(6379), 'Allow Redis access from ECS tasks');
        return redisSecurityGroup;
    }
    /**
     * Get the current git SHA for tagging resources
     * @returns Current git SHA
     */
    getGitSha() {
        try {
            // Get the current git SHA
            const { execSync } = require('child_process');
            return execSync('git rev-parse --short HEAD').toString().trim();
        }
        catch (error) {
            console.warn('Unable to get git SHA, using "development"');
            return 'development';
        }
    }
}
exports.AuthInfraStack = AuthInfraStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGgtaW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFFbkMsb0RBQWlEO0FBQ2pELDhDQUEyQztBQUMzQywwQ0FBdUM7QUFDdkMsa0VBQThEO0FBQzlELDBDQUF1QztBQUN2QyxvRUFBZ0U7QUFDaEUsb0VBQWdFO0FBQ2hFLDRDQUF5QztBQUN6Qyw0RUFBdUU7QUFDdkUsMEVBQW9FO0FBQ3BFLDZDQUE2QztBQUM3Qyx1Q0FBNEM7QUFDNUMseURBQTJDO0FBQzNDLHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MsdURBQXlDO0FBQ3pDLHFFQUFvRjtBQUNwRiw2REFBb0Y7QUFPcEY7O0dBRUc7QUFDSCxNQUFhLGNBQWUsU0FBUSxHQUFHLENBQUMsS0FBSztJQUMzQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTBCO1FBQ2xFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFO1lBQ2YsR0FBRyxLQUFLO1lBQ1IsV0FBVyxFQUFFLG9EQUFvRDtTQUNsRSxDQUFDLENBQUM7UUFFSCxNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsV0FBVyxDQUFDO1FBRWpDLCtCQUErQjtRQUMvQixNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDO1FBQy9CLE1BQU0sa0JBQWtCLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLHFEQUFxRDtRQUNsRyxNQUFNLGlCQUFpQixHQUFHLEVBQUUsQ0FBQztRQUU3QiwyRUFBMkU7UUFDM0UsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLE9BQU8sS0FBSyxNQUFNLENBQUMsQ0FBQztZQUMzQyxFQUFFLHNCQUFzQixFQUFFLElBQUksRUFBRSx3QkFBd0IsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQ2xFLEVBQUUsc0JBQXNCLEVBQUUs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QUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFDbEIsbUNBQW1DLENBQ3BDLENBQUM7UUFFRixPQUFPLGtCQUFrQixDQUFDO0lBQzVCLENBQUM7SUFFRDs7O09BR0c7SUFDSyxTQUFTO1FBQ2YsSUFBSSxDQUFDO1lBQ0gsMEJBQTBCO1lBQzFCLE1BQU0sRUFBRSxRQUFRLEVBQUUsR0FBRyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDOUMsT0FBTyxRQUFRLENBQUMsNEJBQTRCLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNsRSxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE9BQU8sQ0FBQyxJQUFJLENBQUMsNENBQTRDLENBQUMsQ0FBQztZQUMzRCxPQUFPLGFBQWEsQ0FBQztRQUN2QixDQUFDO0lBQ0gsQ0FBQztDQUNGO0FBeFVELHdDQXdVQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7IERhdGFiYXNlIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2RhdGFiYXNlJztcbmltcG9ydCB7IFJlZGlzIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL3JlZGlzJztcbmltcG9ydCB7IEVmcyB9IGZyb20gJy4vY29uc3RydWN0cy9lZnMnO1xuaW1wb3J0IHsgU2VjcmV0c01hbmFnZXIgfSBmcm9tICcuL2NvbnN0cnVjdHMvc2VjcmV0cy1tYW5hZ2VyJztcbmltcG9ydCB7IEVsYiB9IGZyb20gJy4vY29uc3RydWN0cy9lbGInO1xuaW1wb3J0IHsgQXV0aGVudGlrU2VydmVyIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2F1dGhlbnRpay1zZXJ2ZXInO1xuaW1wb3J0IHsgQXV0aGVudGlrV29ya2VyIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2F1dGhlbnRpay13b3JrZXInO1xuaW1wb3J0IHsgTGRhcCB9IGZyb20gJy4vY29uc3RydWN0cy9sZGFwJztcbmltcG9ydCB7IExkYXBUb2tlblJldHJpZXZlciB9IGZyb20gJy4vY29uc3RydWN0cy9sZGFwLXRva2VuLXJldHJpZXZlcic7XG5pbXBvcnQgeyBTM0VudkZpbGVNYW5hZ2VyIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL3MzLWVudi1maWxlLW1hbmFnZXInO1xuaW1wb3J0IHsgU3RhY2tQcm9wcywgRm4gfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyByZWdpc3Rlck91dHB1dHMgfSBmcm9tICcuL291dHB1dHMnO1xuaW1wb3J0ICogYXMgZWMyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xuaW1wb3J0ICogYXMgZWNzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3MnO1xuaW1wb3J0ICogYXMga21zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1rbXMnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCB7IGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZSwgQkFTRV9FWFBPUlRfTkFNRVMgfSBmcm9tICcuL2Nsb3VkZm9ybWF0aW9uLWltcG9ydHMnO1xuaW1wb3J0IHsgZ2V0RW52aXJvbm1lbnRDb25maWcsIG1lcmdlRW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuL2Vudmlyb25tZW50LWNvbmZpZyc7XG5pbXBvcnQgeyBBdXRoSW5mcmFDb25maWcgfSBmcm9tICcuL3N0YWNrLWNvbmZpZyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aEluZnJhU3RhY2tQcm9wcyBleHRlbmRzIFN0YWNrUHJvcHMge1xuICBzdGFja0NvbmZpZzogQXV0aEluZnJhQ29uZmlnO1xufVxuXG4vKipcbiAqIE1haW4gQ0RLIHN0YWNrIGZvciB0aGUgVEFLIEF1dGggSW5mcmFzdHJ1Y3R1cmVcbiAqL1xuZXhwb3J0IGNsYXNzIEF1dGhJbmZyYVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEF1dGhJbmZyYVN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHtcbiAgICAgIC4uLnByb3BzLFxuICAgICAgZGVzY3JpcHRpb246ICdUQUsgQXV0aGVudGljYXRpb24gTGF5ZXIgLSBBdXRoZW50aWssIExEQVAgT3V0cG9zdCcsXG4gICAgfSk7XG5cbiAgICBjb25zdCBjb25maWcgPSBwcm9wcy5zdGFja0NvbmZpZztcbiAgICBcbiAgICAvLyBFeHRyYWN0IGNvbmZpZ3VyYXRpb24gdmFsdWVzXG4gICAgY29uc3QgZW52VHlwZSA9IGNvbmZpZy5lbnZUeXBlO1xuICAgIGNvbnN0IHN0YWNrTmFtZUNvbXBvbmVudCA9IGNvbmZpZy5zdGFja05hbWU7IC8vIFRoaXMgaXMgdGhlIFNUQUNLX05BTUUgcGFydCAoZS5nLiwgXCJNeUZpcnN0U3RhY2tcIilcbiAgICBjb25zdCByZXNvbHZlZFN0YWNrTmFtZSA9IGlkO1xuICAgIFxuICAgIC8vIEdldCBlbnZpcm9ubWVudC1zcGVjaWZpYyBkZWZhdWx0cyAoZm9sbG93aW5nIHJlZmVyZW5jZSB0ZW1wbGF0ZSBwYXR0ZXJuKVxuICAgIGNvbnN0IGVudkNvbmZpZyA9IGNvbmZpZy5lbnZUeXBlID09PSAncHJvZCcgPyBcbiAgICAgIHsgZW5hYmxlSGlnaEF2YWlsYWJpbGl0eTogdHJ1ZSwgZW5hYmxlRGV0YWlsZWRNb25pdG9yaW5nOiB0cnVlIH0gOlxuICAgICAgeyBlbmFibGVIaWdoQXZhaWxhYmlsaXR5OiBmYWxzZSwgZW5hYmxlRGV0YWlsZWRNb25pdG9yaW5nOiBmYWxzZSB9O1xuICAgIFxuICAgIGNvbnN0IGVuYWJsZUhpZ2hBdmFpbGFiaWxpdHkgPSBlbnZDb25maWcuZW5hYmxlSGlnaEF2YWlsYWJpbGl0eTtcbiAgICBcbiAgICAvLyBHZXQgYmFzZSBjb25maWd1cmF0aW9uIGFuZCBtZXJnZSB3aXRoIG92ZXJyaWRlc1xuICAgIGNvbnN0IGJhc2VDb25maWcgPSBnZXRFbnZpcm9ubWVudENvbmZpZyhlbnZUeXBlKTtcbiAgICBjb25zdCBtZXJnZWRDb25maWcgPSBjb25maWcub3ZlcnJpZGVzID8gXG4gICAgICBtZXJnZUVudmlyb25tZW50Q29uZmlnKGJhc2VDb25maWcsIGNvbmZpZy5vdmVycmlkZXMpIDogXG4gICAgICBiYXNlQ29uZmlnO1xuICAgIFxuICAgIC8vIFNldCBjb250YWluZXIgY291bnRzIGJhc2VkIG9uIGhpZ2ggYXZhaWxhYmlsaXR5IHNldHRpbmdcbiAgICAvLyBlbmFibGVIaWdoQXZhaWxhYmlsaXR5PXRydWU6IDIgY29udGFpbmVycyAoU2VydmVyLCBXb3JrZXIsIExEQVApXG4gICAgLy8gZW5hYmxlSGlnaEF2YWlsYWJpbGl0eT1mYWxzZTogMSBjb250YWluZXIgZWFjaFxuICAgIGNvbnN0IGRlc2lyZWRDb250YWluZXJDb3VudCA9IGVuYWJsZUhpZ2hBdmFpbGFiaWxpdHkgPyAyIDogMTtcbiAgICBcbiAgICAvLyBPdmVycmlkZSBjb250YWluZXIgY291bnRzIGluIG1lcmdlZCBjb25maWcgdW5sZXNzIGV4cGxpY2l0bHkgc2V0IHZpYSBjb250ZXh0XG4gICAgaWYgKCFjb25maWcub3ZlcnJpZGVzPy5lY3M/LmRlc2lyZWRDb3VudCkge1xuICAgICAgbWVyZ2VkQ29uZmlnLmVjcy5kZXNpcmVkQ291bnQgPSBkZXNpcmVkQ29udGFpbmVyQ291bnQ7XG4gICAgfVxuICAgIGlmICghY29uZmlnLm92ZXJyaWRlcz8uZWNzPy53b3JrZXJEZXNpcmVkQ291bnQpIHtcbiAgICAgIG1lcmdlZENvbmZpZy5lY3Mud29ya2VyRGVzaXJlZENvdW50ID0gZGVzaXJlZENvbnRhaW5lckNvdW50O1xuICAgIH1cblxuICAgIC8vIEFkZCBFbnZpcm9ubWVudCBUeXBlIHRhZyB0byB0aGUgc3RhY2tcbiAgICBjb25zdCBlbnZpcm9ubWVudExhYmVsID0gZW52VHlwZSA9PT0gJ3Byb2QnID8gJ1Byb2QnIDogJ0Rldi1UZXN0JztcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ0Vudmlyb25tZW50IFR5cGUnLCBlbnZpcm9ubWVudExhYmVsKTtcblxuICAgIGNvbnN0IGF3c1N0YWNrTmFtZSA9IEZuLnJlZignQVdTOjpTdGFja05hbWUnKTtcbiAgICBjb25zdCBhd3NSZWdpb24gPSBjZGsuU3RhY2sub2YodGhpcykucmVnaW9uO1xuXG4gICAgLy8gQ29udGV4dC1iYXNlZCBwYXJhbWV0ZXIgcmVzb2x1dGlvbiAoQ0RLIGNvbnRleHQgb25seSlcbiAgICBjb25zdCBnaXRTaGEgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZ2l0U2hhJykgfHwgdGhpcy5nZXRHaXRTaGEoKTtcbiAgICBjb25zdCBlbmFibGVFeGVjdXRlID0gQm9vbGVhbih0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZW5hYmxlRXhlY3V0ZScpIHx8IGZhbHNlKTtcbiAgICBjb25zdCBhdXRoZW50aWtBZG1pblVzZXJFbWFpbCA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdhdXRoZW50aWtBZG1pblVzZXJFbWFpbCcpIHx8ICcnO1xuICAgIGNvbnN0IGF1dGhlbnRpa0xkYXBCYXNlRG4gPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnYXV0aGVudGlrTGRhcEJhc2VEbicpIHx8ICdEQz1leGFtcGxlLERDPWNvbSc7XG4gICAgY29uc3Qgc3NsQ2VydGlmaWNhdGVBcm4gPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnc3NsQ2VydGlmaWNhdGVBcm4nKSB8fCAnJztcbiAgICBjb25zdCB1c2VBdXRoZW50aWtDb25maWdGaWxlID0gQm9vbGVhbih0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgndXNlQXV0aGVudGlrQ29uZmlnRmlsZScpIHx8IGZhbHNlKTtcblxuICAgIC8vIFZhbGlkYXRlIHJlcXVpcmVkIHBhcmFtZXRlcnNcbiAgICBpZiAoIWF1dGhlbnRpa0FkbWluVXNlckVtYWlsIHx8IGF1dGhlbnRpa0FkbWluVXNlckVtYWlsLnRyaW0oKSA9PT0gJycpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignYXV0aGVudGlrQWRtaW5Vc2VyRW1haWwgaXMgcmVxdWlyZWQuIFNldCBpdCB2aWEgLS1jb250ZXh0IGF1dGhlbnRpa0FkbWluVXNlckVtYWlsPXVzZXJAZXhhbXBsZS5jb20nKTtcbiAgICB9XG5cbiAgICBjb25zdCBzdGFja05hbWUgPSBGbi5yZWYoJ0FXUzo6U3RhY2tOYW1lJyk7XG4gICAgY29uc3QgcmVnaW9uID0gY2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbjtcblxuICAgIC8vIEltcG9ydCBWUEMgYW5kIG5ldHdvcmtpbmcgZnJvbSBiYXNlIGluZnJhc3RydWN0dXJlXG4gICAgY29uc3QgdnBjID0gZWMyLlZwYy5mcm9tVnBjQXR0cmlidXRlcyh0aGlzLCAnVlBDJywge1xuICAgICAgdnBjSWQ6IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlZQQ19JRCkpLFxuICAgICAgYXZhaWxhYmlsaXR5Wm9uZXM6IHRoaXMuYXZhaWxhYmlsaXR5Wm9uZXMsXG4gICAgICAvLyBJbXBvcnQgc3VibmV0IElEcyBmcm9tIGJhc2UgaW5mcmFzdHJ1Y3R1cmVcbiAgICAgIHB1YmxpY1N1Ym5ldElkczogW1xuICAgICAgICBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5TVUJORVRfUFVCTElDX0EpKSxcbiAgICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuU1VCTkVUX1BVQkxJQ19CKSlcbiAgICAgIF0sXG4gICAgICBwcml2YXRlU3VibmV0SWRzOiBbXG4gICAgICAgIEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlNVQk5FVF9QUklWQVRFX0EpKSxcbiAgICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuU1VCTkVUX1BSSVZBVEVfQikpXG4gICAgICBdXG4gICAgfSk7XG5cbiAgICAvLyBJbXBvcnQgS01TIGtleSBmcm9tIGJhc2UgaW5mcmFzdHJ1Y3R1cmVcbiAgICBjb25zdCBrbXNLZXkgPSBrbXMuS2V5LmZyb21LZXlBcm4odGhpcywgJ0tNU0tleScsIFxuICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuS01TX0tFWSkpXG4gICAgKTtcblxuICAgIC8vIEltcG9ydCBFQ1MgQ2x1c3RlciBmcm9tIGJhc2UgaW5mcmFzdHJ1Y3R1cmVcbiAgICBjb25zdCBlY3NDbHVzdGVyID0gZWNzLkNsdXN0ZXIuZnJvbUNsdXN0ZXJBcm4odGhpcywgJ0VDU0NsdXN0ZXInLFxuICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuRUNTX0NMVVNURVIpKVxuICAgICk7XG5cbiAgICAvLyBJbXBvcnQgUzMgY29uZmlndXJhdGlvbiBidWNrZXQgZnJvbSBiYXNlIGluZnJhc3RydWN0dXJlXG4gICAgY29uc3QgczNDb25mQnVja2V0ID0gczMuQnVja2V0LmZyb21CdWNrZXRBcm4odGhpcywgJ1MzQ29uZkJ1Y2tldCcsXG4gICAgICBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5TM19CVUNLRVQpKVxuICAgICk7XG5cbiAgICAvLyBJbXBvcnQgRUNSIHJlcG9zaXRvcnkgZnJvbSBiYXNlIGluZnJhc3RydWN0dXJlIChmb3IgbG9jYWwgRUNSIG9wdGlvbilcbiAgICBjb25zdCBlY3JSZXBvc2l0b3J5ID0gRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuRUNSX1JFUE8pKTtcblxuICAgIC8vIFMzIEVudmlyb25tZW50IEZpbGUgTWFuYWdlciAtIG1hbmFnZXMgYXV0aGVudGlrLWNvbmZpZy5lbnYgZmlsZVxuICAgIGNvbnN0IHMzRW52RmlsZU1hbmFnZXIgPSBuZXcgUzNFbnZGaWxlTWFuYWdlcih0aGlzLCAnUzNFbnZGaWxlTWFuYWdlcicsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBzM0NvbmZCdWNrZXQsXG4gICAgICBlbnZGaWxlTmFtZTogJ2F1dGhlbnRpay1jb25maWcuZW52J1xuICAgIH0pO1xuXG4gICAgLy8gU2VjdXJpdHkgR3JvdXBzXG4gICAgY29uc3QgZWNzU2VjdXJpdHlHcm91cCA9IHRoaXMuY3JlYXRlRWNzU2VjdXJpdHlHcm91cCh2cGMpO1xuICAgIGNvbnN0IGRiU2VjdXJpdHlHcm91cCA9IHRoaXMuY3JlYXRlRGJTZWN1cml0eUdyb3VwKHZwYywgZWNzU2VjdXJpdHlHcm91cCk7XG4gICAgY29uc3QgcmVkaXNTZWN1cml0eUdyb3VwID0gdGhpcy5jcmVhdGVSZWRpc1NlY3VyaXR5R3JvdXAodnBjLCBlY3NTZWN1cml0eUdyb3VwKTtcblxuICAgIC8vIFNlY3JldHNNYW5hZ2VyXG4gICAgY29uc3Qgc2VjcmV0c01hbmFnZXIgPSBuZXcgU2VjcmV0c01hbmFnZXIodGhpcywgJ1NlY3JldHNNYW5hZ2VyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGttc0tleVxuICAgIH0pO1xuXG4gICAgLy8gRGF0YWJhc2VcbiAgICBjb25zdCBkYXRhYmFzZSA9IG5ldyBEYXRhYmFzZSh0aGlzLCAnRGF0YWJhc2UnLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBtZXJnZWRDb25maWcsXG4gICAgICB2cGMsXG4gICAgICBrbXNLZXksXG4gICAgICBzZWN1cml0eUdyb3VwczogW2RiU2VjdXJpdHlHcm91cF1cbiAgICB9KTtcblxuICAgIC8vIFJlZGlzXG4gICAgY29uc3QgcmVkaXMgPSBuZXcgUmVkaXModGhpcywgJ1JlZGlzJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogbWVyZ2VkQ29uZmlnLFxuICAgICAgdnBjLFxuICAgICAga21zS2V5LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtyZWRpc1NlY3VyaXR5R3JvdXBdXG4gICAgfSk7XG5cbiAgICAvLyBFRlNcbiAgICBjb25zdCBlZnMgPSBuZXcgRWZzKHRoaXMsICdFRlMnLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgdnBjLFxuICAgICAga21zS2V5LFxuICAgICAgYWxsb3dBY2Nlc3NGcm9tOiBbZWNzU2VjdXJpdHlHcm91cF1cbiAgICB9KTtcblxuICAgIC8vIEF1dGhlbnRpayBMb2FkIEJhbGFuY2VyXG4gICAgY29uc3QgYXV0aGVudGlrRUxCID0gbmV3IEVsYih0aGlzLCAnQXV0aGVudGlrRUxCJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogbWVyZ2VkQ29uZmlnLFxuICAgICAgdnBjLFxuICAgICAgc3NsQ2VydGlmaWNhdGVBcm46IHNzbENlcnRpZmljYXRlQXJuXG4gICAgfSk7XG5cbiAgICAvLyBBdXRoZW50aWsgU2VydmVyXG4gICAgY29uc3QgYXV0aGVudGlrU2VydmVyID0gbmV3IEF1dGhlbnRpa1NlcnZlcih0aGlzLCAnQXV0aGVudGlrU2VydmVyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogbWVyZ2VkQ29uZmlnLFxuICAgICAgdnBjLFxuICAgICAgZWNzU2VjdXJpdHlHcm91cCxcbiAgICAgIGVjc0NsdXN0ZXIsXG4gICAgICBzM0NvbmZCdWNrZXQsXG4gICAgICBlbnZGaWxlUzNVcmk6IHMzRW52RmlsZU1hbmFnZXIuZW52RmlsZVMzVXJpLFxuICAgICAgZW52RmlsZVMzS2V5OiBzM0VudkZpbGVNYW5hZ2VyLmVudkZpbGVTM0tleSxcbiAgICAgIGFkbWluVXNlckVtYWlsOiBhdXRoZW50aWtBZG1pblVzZXJFbWFpbCxcbiAgICAgIGxkYXBCYXNlRG46IGF1dGhlbnRpa0xkYXBCYXNlRG4sXG4gICAgICB1c2VDb25maWdGaWxlOiB1c2VBdXRoZW50aWtDb25maWdGaWxlLFxuICAgICAgZWNyUmVwb3NpdG9yeUFybjogZWNyUmVwb3NpdG9yeSxcbiAgICAgIGVuYWJsZUV4ZWN1dGU6IGVuYWJsZUV4ZWN1dGUsXG4gICAgICBkYlNlY3JldDogZGF0YWJhc2UubWFzdGVyU2VjcmV0LFxuICAgICAgZGJIb3N0bmFtZTogZGF0YWJhc2UuaG9zdG5hbWUsXG4gICAgICByZWRpc0F1dGhUb2tlbjogcmVkaXMuYXV0aFRva2VuLFxuICAgICAgcmVkaXNIb3N0bmFtZTogcmVkaXMuaG9zdG5hbWUsXG4gICAgICBzZWNyZXRLZXk6IHNlY3JldHNNYW5hZ2VyLnNlY3JldEtleSxcbiAgICAgIGFkbWluVXNlclBhc3N3b3JkOiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJQYXNzd29yZCxcbiAgICAgIGFkbWluVXNlclRva2VuOiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJUb2tlbixcbiAgICAgIGxkYXBUb2tlbjogc2VjcmV0c01hbmFnZXIubGRhcFRva2VuLFxuICAgICAgZWZzSWQ6IGVmcy5maWxlU3lzdGVtLmZpbGVTeXN0ZW1JZCxcbiAgICAgIGVmc01lZGlhQWNjZXNzUG9pbnRJZDogZWZzLm1lZGlhQWNjZXNzUG9pbnQuYWNjZXNzUG9pbnRJZCxcbiAgICAgIGVmc0N1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50SWQ6IGVmcy5jdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkXG4gICAgfSk7XG5cbiAgICAvLyBBdXRoZW50aWsgV29ya2VyXG4gICAgY29uc3QgYXV0aGVudGlrV29ya2VyID0gbmV3IEF1dGhlbnRpa1dvcmtlcih0aGlzLCAnQXV0aGVudGlrV29ya2VyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogbWVyZ2VkQ29uZmlnLFxuICAgICAgdnBjLFxuICAgICAgZWNzU2VjdXJpdHlHcm91cCxcbiAgICAgIGVjc0NsdXN0ZXIsXG4gICAgICBzM0NvbmZCdWNrZXQsXG4gICAgICBlbnZGaWxlUzNLZXk6IHMzRW52RmlsZU1hbmFnZXIuZW52RmlsZVMzS2V5LFxuICAgICAgZWNyUmVwb3NpdG9yeUFybjogZWNyUmVwb3NpdG9yeSxcbiAgICAgIGVuYWJsZUV4ZWN1dGU6IGVuYWJsZUV4ZWN1dGUsXG4gICAgICBkYlNlY3JldDogZGF0YWJhc2UubWFzdGVyU2VjcmV0LFxuICAgICAgZGJIb3N0bmFtZTogZGF0YWJhc2UuaG9zdG5hbWUsXG4gICAgICByZWRpc0F1dGhUb2tlbjogcmVkaXMuYXV0aFRva2VuLFxuICAgICAgcmVkaXNIb3N0bmFtZTogcmVkaXMuaG9zdG5hbWUsXG4gICAgICBzZWNyZXRLZXk6IHNlY3JldHNNYW5hZ2VyLnNlY3JldEtleSxcbiAgICAgIGVmc0lkOiBlZnMuZmlsZVN5c3RlbS5maWxlU3lzdGVtSWQsXG4gICAgICBlZnNNZWRpYUFjY2Vzc1BvaW50SWQ6IGVmcy5tZWRpYUFjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWQsXG4gICAgICBlZnNDdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludElkOiBlZnMuY3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnQuYWNjZXNzUG9pbnRJZFxuICAgIH0pO1xuXG4gICAgLy8gQ29ubmVjdCBBdXRoZW50aWsgU2VydmVyIHRvIExvYWQgQmFsYW5jZXJcbiAgICBhdXRoZW50aWtTZXJ2ZXIuY3JlYXRlVGFyZ2V0R3JvdXAodnBjLCBhdXRoZW50aWtFTEIuaHR0cHNMaXN0ZW5lcik7XG5cbiAgICAvLyBMREFQIFRva2VuIFJldHJpZXZlclxuICAgIGNvbnN0IGxkYXBUb2tlblJldHJpZXZlciA9IG5ldyBMZGFwVG9rZW5SZXRyaWV2ZXIodGhpcywgJ0xkYXBUb2tlblJldHJpZXZlcicsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IG1lcmdlZENvbmZpZyxcbiAgICAgIGttc0tleSxcbiAgICAgIGF1dGhlbnRpa0hvc3Q6IGBodHRwczovLyR7YXV0aGVudGlrRUxCLmRuc05hbWV9YCxcbiAgICAgIG91dHBvc3ROYW1lOiAnTERBUCcsXG4gICAgICBhZG1pblRva2VuU2VjcmV0OiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJUb2tlbixcbiAgICAgIGxkYXBUb2tlblNlY3JldDogc2VjcmV0c01hbmFnZXIubGRhcFRva2VuLFxuICAgICAgZ2l0U2hhOiBnaXRTaGFcbiAgICB9KTtcblxuICAgIC8vIExEQVBcbiAgICBjb25zdCBsZGFwID0gbmV3IExkYXAodGhpcywgJ0xEQVAnLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBtZXJnZWRDb25maWcsXG4gICAgICB2cGMsXG4gICAgICBlY3NTZWN1cml0eUdyb3VwLFxuICAgICAgZWNzQ2x1c3RlcixcbiAgICAgIHMzQ29uZkJ1Y2tldCxcbiAgICAgIHNzbENlcnRpZmljYXRlQXJuOiBzc2xDZXJ0aWZpY2F0ZUFybixcbiAgICAgIGF1dGhlbnRpa0hvc3Q6IGF1dGhlbnRpa0VMQi5kbnNOYW1lLFxuICAgICAgZWNyUmVwb3NpdG9yeUFybjogZWNyUmVwb3NpdG9yeSxcbiAgICAgIGVuYWJsZUV4ZWN1dGU6IGVuYWJsZUV4ZWN1dGUsXG4gICAgICBsZGFwVG9rZW46IHNlY3JldHNNYW5hZ2VyLmxkYXBUb2tlblxuICAgIH0pO1xuXG4gICAgLy8gRW5zdXJlIExEQVAgd2FpdHMgZm9yIHRoZSB0b2tlbiB0byBiZSByZXRyaWV2ZWRcbiAgICBsZGFwLm5vZGUuYWRkRGVwZW5kZW5jeShsZGFwVG9rZW5SZXRyaWV2ZXIpO1xuXG4gICAgLy8gT3V0cHV0c1xuICAgIHJlZ2lzdGVyT3V0cHV0cyh7XG4gICAgICBzdGFjazogdGhpcyxcbiAgICAgIHN0YWNrTmFtZTogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgZGF0YWJhc2VFbmRwb2ludDogZGF0YWJhc2UuaG9zdG5hbWUsXG4gICAgICBkYXRhYmFzZVNlY3JldEFybjogZGF0YWJhc2UubWFzdGVyU2VjcmV0LnNlY3JldEFybixcbiAgICAgIHJlZGlzRW5kcG9pbnQ6IHJlZGlzLmhvc3RuYW1lLFxuICAgICAgcmVkaXNBdXRoVG9rZW5Bcm46IHJlZGlzLmF1dGhUb2tlbi5zZWNyZXRBcm4sXG4gICAgICBlZnNJZDogZWZzLmZpbGVTeXN0ZW0uZmlsZVN5c3RlbUlkLFxuICAgICAgZWZzTWVkaWFBY2Nlc3NQb2ludElkOiBlZnMubWVkaWFBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkLFxuICAgICAgZWZzVGVtcGxhdGVzQWNjZXNzUG9pbnRJZDogZWZzLmN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWQsXG4gICAgICBhdXRoZW50aWtTZWNyZXRLZXlBcm46IHNlY3JldHNNYW5hZ2VyLnNlY3JldEtleS5zZWNyZXRBcm4sXG4gICAgICBhdXRoZW50aWtBZG1pblRva2VuQXJuOiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJUb2tlbi5zZWNyZXRBcm4sXG4gICAgICBhdXRoZW50aWtMZGFwVG9rZW5Bcm46IHNlY3JldHNNYW5hZ2VyLmxkYXBUb2tlbi5zZWNyZXRBcm4sXG4gICAgICBhdXRoZW50aWtBbGJEbnM6IGF1dGhlbnRpa0VMQi5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZSxcbiAgICAgIGF1dGhlbnRpa1VybDogYGh0dHBzOi8vJHthdXRoZW50aWtFTEIuZG5zTmFtZX1gLFxuICAgICAgbGRhcE5sYkRuczogbGRhcC5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZSxcbiAgICAgIGxkYXBUb2tlblJldHJpZXZlckxhbWJkYUFybjogbGRhcFRva2VuUmV0cmlldmVyLmxhbWJkYUZ1bmN0aW9uLmZ1bmN0aW9uQXJuXG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZUVjc1NlY3VyaXR5R3JvdXAodnBjOiBlYzIuSVZwYyk6IGVjMi5TZWN1cml0eUdyb3VwIHtcbiAgICBjb25zdCBlY3NTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdFQ1NTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgRUNTIHRhc2tzJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IHRydWVcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IEhUVFAvSFRUUFMgdHJhZmZpYyB0byBFQ1MgdGFza3NcbiAgICBlY3NTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuYW55SXB2NCgpLFxuICAgICAgZWMyLlBvcnQudGNwKDgwKSxcbiAgICAgICdBbGxvdyBIVFRQIHRyYWZmaWMnXG4gICAgKTtcblxuICAgIGVjc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5hbnlJcHY0KCksXG4gICAgICBlYzIuUG9ydC50Y3AoNDQzKSxcbiAgICAgICdBbGxvdyBIVFRQUyB0cmFmZmljJ1xuICAgICk7XG5cbiAgICBlY3NTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuYW55SXB2NCgpLFxuICAgICAgZWMyLlBvcnQudGNwKDkwMDApLFxuICAgICAgJ0FsbG93IEF1dGhlbnRpayB0cmFmZmljJ1xuICAgICk7XG5cbiAgICByZXR1cm4gZWNzU2VjdXJpdHlHcm91cDtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlRGJTZWN1cml0eUdyb3VwKHZwYzogZWMyLklWcGMsIGVjc1NlY3VyaXR5R3JvdXA6IGVjMi5TZWN1cml0eUdyb3VwKTogZWMyLlNlY3VyaXR5R3JvdXAge1xuICAgIGNvbnN0IGRiU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnREJTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgZGF0YWJhc2UnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogZmFsc2VcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IFBvc3RncmVTUUwgYWNjZXNzIGZyb20gRUNTIHRhc2tzXG4gICAgZGJTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuc2VjdXJpdHlHcm91cElkKGVjc1NlY3VyaXR5R3JvdXAuc2VjdXJpdHlHcm91cElkKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg1NDMyKSxcbiAgICAgICdBbGxvdyBQb3N0Z3JlU1FMIGFjY2VzcyBmcm9tIEVDUyB0YXNrcydcbiAgICApO1xuXG4gICAgcmV0dXJuIGRiU2VjdXJpdHlHcm91cDtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlUmVkaXNTZWN1cml0eUdyb3VwKHZwYzogZWMyLklWcGMsIGVjc1NlY3VyaXR5R3JvdXA6IGVjMi5TZWN1cml0eUdyb3VwKTogZWMyLlNlY3VyaXR5R3JvdXAge1xuICAgIGNvbnN0IHJlZGlzU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnUmVkaXNTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgUmVkaXMnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogZmFsc2VcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IFJlZGlzIGFjY2VzcyBmcm9tIEVDUyB0YXNrc1xuICAgIHJlZGlzU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLnNlY3VyaXR5R3JvdXBJZChlY3NTZWN1cml0eUdyb3VwLnNlY3VyaXR5R3JvdXBJZCksXG4gICAgICBlYzIuUG9ydC50Y3AoNjM3OSksXG4gICAgICAnQWxsb3cgUmVkaXMgYWNjZXNzIGZyb20gRUNTIHRhc2tzJ1xuICAgICk7XG5cbiAgICByZXR1cm4gcmVkaXNTZWN1cml0eUdyb3VwO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCB0aGUgY3VycmVudCBnaXQgU0hBIGZvciB0YWdnaW5nIHJlc291cmNlc1xuICAgKiBAcmV0dXJucyBDdXJyZW50IGdpdCBTSEFcbiAgICovXG4gIHByaXZhdGUgZ2V0R2l0U2hhKCk6IHN0cmluZyB7XG4gICAgdHJ5IHtcbiAgICAgIC8vIEdldCB0aGUgY3VycmVudCBnaXQgU0hBXG4gICAgICBjb25zdCB7IGV4ZWNTeW5jIH0gPSByZXF1aXJlKCdjaGlsZF9wcm9jZXNzJyk7XG4gICAgICByZXR1cm4gZXhlY1N5bmMoJ2dpdCByZXYtcGFyc2UgLS1zaG9ydCBIRUFEJykudG9TdHJpbmcoKS50cmltKCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUud2FybignVW5hYmxlIHRvIGdldCBnaXQgU0hBLCB1c2luZyBcImRldmVsb3BtZW50XCInKTtcbiAgICAgIHJldHVybiAnZGV2ZWxvcG1lbnQnO1xuICAgIH1cbiAgfVxufVxuIl19