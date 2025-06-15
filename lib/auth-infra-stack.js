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
const route53_1 = require("./constructs/route53");
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
        const hostnameAuthentik = this.node.tryGetContext('hostnameAuthentik') || 'account';
        const hostnameLdap = this.node.tryGetContext('hostnameLdap') || 'ldap';
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
        // Import Route53 hosted zone from base infrastructure
        const hostedZoneId = aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.HOSTED_ZONE_ID));
        const hostedZoneName = aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.HOSTED_ZONE_NAME));
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
        // Route53 DNS Records
        const route53 = new route53_1.Route53(this, 'Route53', {
            environment: stackNameComponent,
            config: mergedConfig,
            hostedZoneId: hostedZoneId,
            hostedZoneName: hostedZoneName,
            hostnameAuthentik: hostnameAuthentik,
            hostnameLdap: hostnameLdap,
            authentikLoadBalancer: authentikELB.loadBalancer,
            ldapLoadBalancer: ldap.loadBalancer
        });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGgtaW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFFbkMsb0RBQWlEO0FBQ2pELDhDQUEyQztBQUMzQywwQ0FBdUM7QUFDdkMsa0VBQThEO0FBQzlELDBDQUF1QztBQUN2QyxvRUFBZ0U7QUFDaEUsb0VBQWdFO0FBQ2hFLDRDQUF5QztBQUN6Qyw0RUFBdUU7QUFDdkUsMEVBQW9FO0FBQ3BFLGtEQUErQztBQUMvQyw2Q0FBNkM7QUFDN0MsdUNBQTRDO0FBQzVDLHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLHVEQUF5QztBQUN6QyxxRUFBb0Y7QUFDcEYsNkRBQW9GO0FBT3BGOztHQUVHO0FBQ0gsTUFBYSxjQUFlLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDM0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEwQjtRQUNsRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRTtZQUNmLEdBQUcsS0FBSztZQUNSLFdBQVcsRUFBRSxvREFBb0Q7U0FDbEUsQ0FBQyxDQUFDO1FBRUgsTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLFdBQVcsQ0FBQztRQUVqQywrQkFBK0I7UUFDL0IsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQztRQUMvQixNQUFNLGtCQUFrQixHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxxREFBcUQ7UUFDbEcsTUFBTSxpQkFBaUIsR0FBRyxFQUFFLENBQUM7UUFFN0IsMkVBQTJFO1FBQzNFLE1BQU0sU0FBUyxHQUFHLE1BQU0sQ0FBQyxPQUFPLEtBQUssTUFBTSxDQUFDLENBQUM7WUFDM0MsRUFBRSxzQkFBc0IsRUFBRSxJQUFJLEVBQUUsd0JBQXdCLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUNsRSxFQUFF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QixDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDbEUsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixPQUFPLENBQUMsSUFBSSxDQUFDLDRDQUE0QyxDQUFDLENBQUM7WUFDM0QsT0FBTyxhQUFhLENBQUM7UUFDdkIsQ0FBQztJQUNILENBQUM7Q0FDRjtBQTFWRCx3Q0EwVkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgeyBEYXRhYmFzZSB9IGZyb20gJy4vY29uc3RydWN0cy9kYXRhYmFzZSc7XG5pbXBvcnQgeyBSZWRpcyB9IGZyb20gJy4vY29uc3RydWN0cy9yZWRpcyc7XG5pbXBvcnQgeyBFZnMgfSBmcm9tICcuL2NvbnN0cnVjdHMvZWZzJztcbmltcG9ydCB7IFNlY3JldHNNYW5hZ2VyIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL3NlY3JldHMtbWFuYWdlcic7XG5pbXBvcnQgeyBFbGIgfSBmcm9tICcuL2NvbnN0cnVjdHMvZWxiJztcbmltcG9ydCB7IEF1dGhlbnRpa1NlcnZlciB9IGZyb20gJy4vY29uc3RydWN0cy9hdXRoZW50aWstc2VydmVyJztcbmltcG9ydCB7IEF1dGhlbnRpa1dvcmtlciB9IGZyb20gJy4vY29uc3RydWN0cy9hdXRoZW50aWstd29ya2VyJztcbmltcG9ydCB7IExkYXAgfSBmcm9tICcuL2NvbnN0cnVjdHMvbGRhcCc7XG5pbXBvcnQgeyBMZGFwVG9rZW5SZXRyaWV2ZXIgfSBmcm9tICcuL2NvbnN0cnVjdHMvbGRhcC10b2tlbi1yZXRyaWV2ZXInO1xuaW1wb3J0IHsgUzNFbnZGaWxlTWFuYWdlciB9IGZyb20gJy4vY29uc3RydWN0cy9zMy1lbnYtZmlsZS1tYW5hZ2VyJztcbmltcG9ydCB7IFJvdXRlNTMgfSBmcm9tICcuL2NvbnN0cnVjdHMvcm91dGU1Myc7XG5pbXBvcnQgeyBTdGFja1Byb3BzLCBGbiB9IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IHJlZ2lzdGVyT3V0cHV0cyB9IGZyb20gJy4vb3V0cHV0cyc7XG5pbXBvcnQgKiBhcyBlYzIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjMic7XG5pbXBvcnQgKiBhcyBlY3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjcyc7XG5pbXBvcnQgKiBhcyBrbXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWttcyc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0IHsgY3JlYXRlQmFzZUltcG9ydFZhbHVlLCBCQVNFX0VYUE9SVF9OQU1FUyB9IGZyb20gJy4vY2xvdWRmb3JtYXRpb24taW1wb3J0cyc7XG5pbXBvcnQgeyBnZXRFbnZpcm9ubWVudENvbmZpZywgbWVyZ2VFbnZpcm9ubWVudENvbmZpZyB9IGZyb20gJy4vZW52aXJvbm1lbnQtY29uZmlnJztcbmltcG9ydCB7IEF1dGhJbmZyYUNvbmZpZyB9IGZyb20gJy4vc3RhY2stY29uZmlnJztcblxuZXhwb3J0IGludGVyZmFjZSBBdXRoSW5mcmFTdGFja1Byb3BzIGV4dGVuZHMgU3RhY2tQcm9wcyB7XG4gIHN0YWNrQ29uZmlnOiBBdXRoSW5mcmFDb25maWc7XG59XG5cbi8qKlxuICogTWFpbiBDREsgc3RhY2sgZm9yIHRoZSBUQUsgQXV0aCBJbmZyYXN0cnVjdHVyZVxuICovXG5leHBvcnQgY2xhc3MgQXV0aEluZnJhU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQXV0aEluZnJhU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwge1xuICAgICAgLi4ucHJvcHMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1RBSyBBdXRoZW50aWNhdGlvbiBMYXllciAtIEF1dGhlbnRpaywgTERBUCBPdXRwb3N0JyxcbiAgICB9KTtcblxuICAgIGNvbnN0IGNvbmZpZyA9IHByb3BzLnN0YWNrQ29uZmlnO1xuICAgIFxuICAgIC8vIEV4dHJhY3QgY29uZmlndXJhdGlvbiB2YWx1ZXNcbiAgICBjb25zdCBlbnZUeXBlID0gY29uZmlnLmVudlR5cGU7XG4gICAgY29uc3Qgc3RhY2tOYW1lQ29tcG9uZW50ID0gY29uZmlnLnN0YWNrTmFtZTsgLy8gVGhpcyBpcyB0aGUgU1RBQ0tfTkFNRSBwYXJ0IChlLmcuLCBcIk15Rmlyc3RTdGFja1wiKVxuICAgIGNvbnN0IHJlc29sdmVkU3RhY2tOYW1lID0gaWQ7XG4gICAgXG4gICAgLy8gR2V0IGVudmlyb25tZW50LXNwZWNpZmljIGRlZmF1bHRzIChmb2xsb3dpbmcgcmVmZXJlbmNlIHRlbXBsYXRlIHBhdHRlcm4pXG4gICAgY29uc3QgZW52Q29uZmlnID0gY29uZmlnLmVudlR5cGUgPT09ICdwcm9kJyA/IFxuICAgICAgeyBlbmFibGVIaWdoQXZhaWxhYmlsaXR5OiB0cnVlLCBlbmFibGVEZXRhaWxlZE1vbml0b3Jpbmc6IHRydWUgfSA6XG4gICAgICB7IGVuYWJsZUhpZ2hBdmFpbGFiaWxpdHk6IGZhbHNlLCBlbmFibGVEZXRhaWxlZE1vbml0b3Jpbmc6IGZhbHNlIH07XG4gICAgXG4gICAgY29uc3QgZW5hYmxlSGlnaEF2YWlsYWJpbGl0eSA9IGVudkNvbmZpZy5lbmFibGVIaWdoQXZhaWxhYmlsaXR5O1xuICAgIFxuICAgIC8vIEdldCBiYXNlIGNvbmZpZ3VyYXRpb24gYW5kIG1lcmdlIHdpdGggb3ZlcnJpZGVzXG4gICAgY29uc3QgYmFzZUNvbmZpZyA9IGdldEVudmlyb25tZW50Q29uZmlnKGVudlR5cGUpO1xuICAgIGNvbnN0IG1lcmdlZENvbmZpZyA9IGNvbmZpZy5vdmVycmlkZXMgPyBcbiAgICAgIG1lcmdlRW52aXJvbm1lbnRDb25maWcoYmFzZUNvbmZpZywgY29uZmlnLm92ZXJyaWRlcykgOiBcbiAgICAgIGJhc2VDb25maWc7XG4gICAgXG4gICAgLy8gU2V0IGNvbnRhaW5lciBjb3VudHMgYmFzZWQgb24gaGlnaCBhdmFpbGFiaWxpdHkgc2V0dGluZ1xuICAgIC8vIGVuYWJsZUhpZ2hBdmFpbGFiaWxpdHk9dHJ1ZTogMiBjb250YWluZXJzIChTZXJ2ZXIsIFdvcmtlciwgTERBUClcbiAgICAvLyBlbmFibGVIaWdoQXZhaWxhYmlsaXR5PWZhbHNlOiAxIGNvbnRhaW5lciBlYWNoXG4gICAgY29uc3QgZGVzaXJlZENvbnRhaW5lckNvdW50ID0gZW5hYmxlSGlnaEF2YWlsYWJpbGl0eSA/IDIgOiAxO1xuICAgIFxuICAgIC8vIE92ZXJyaWRlIGNvbnRhaW5lciBjb3VudHMgaW4gbWVyZ2VkIGNvbmZpZyB1bmxlc3MgZXhwbGljaXRseSBzZXQgdmlhIGNvbnRleHRcbiAgICBpZiAoIWNvbmZpZy5vdmVycmlkZXM/LmVjcz8uZGVzaXJlZENvdW50KSB7XG4gICAgICBtZXJnZWRDb25maWcuZWNzLmRlc2lyZWRDb3VudCA9IGRlc2lyZWRDb250YWluZXJDb3VudDtcbiAgICB9XG4gICAgaWYgKCFjb25maWcub3ZlcnJpZGVzPy5lY3M/LndvcmtlckRlc2lyZWRDb3VudCkge1xuICAgICAgbWVyZ2VkQ29uZmlnLmVjcy53b3JrZXJEZXNpcmVkQ291bnQgPSBkZXNpcmVkQ29udGFpbmVyQ291bnQ7XG4gICAgfVxuXG4gICAgLy8gQWRkIEVudmlyb25tZW50IFR5cGUgdGFnIHRvIHRoZSBzdGFja1xuICAgIGNvbnN0IGVudmlyb25tZW50TGFiZWwgPSBlbnZUeXBlID09PSAncHJvZCcgPyAnUHJvZCcgOiAnRGV2LVRlc3QnO1xuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnRW52aXJvbm1lbnQgVHlwZScsIGVudmlyb25tZW50TGFiZWwpO1xuXG4gICAgY29uc3QgYXdzU3RhY2tOYW1lID0gRm4ucmVmKCdBV1M6OlN0YWNrTmFtZScpO1xuICAgIGNvbnN0IGF3c1JlZ2lvbiA9IGNkay5TdGFjay5vZih0aGlzKS5yZWdpb247XG5cbiAgICAvLyBDb250ZXh0LWJhc2VkIHBhcmFtZXRlciByZXNvbHV0aW9uIChDREsgY29udGV4dCBvbmx5KVxuICAgIGNvbnN0IGdpdFNoYSA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdnaXRTaGEnKSB8fCB0aGlzLmdldEdpdFNoYSgpO1xuICAgIGNvbnN0IGVuYWJsZUV4ZWN1dGUgPSBCb29sZWFuKHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdlbmFibGVFeGVjdXRlJykgfHwgZmFsc2UpO1xuICAgIGNvbnN0IGF1dGhlbnRpa0FkbWluVXNlckVtYWlsID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2F1dGhlbnRpa0FkbWluVXNlckVtYWlsJykgfHwgJyc7XG4gICAgY29uc3QgYXV0aGVudGlrTGRhcEJhc2VEbiA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdhdXRoZW50aWtMZGFwQmFzZURuJykgfHwgJ0RDPWV4YW1wbGUsREM9Y29tJztcbiAgICBjb25zdCBzc2xDZXJ0aWZpY2F0ZUFybiA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdzc2xDZXJ0aWZpY2F0ZUFybicpIHx8ICcnO1xuICAgIGNvbnN0IHVzZUF1dGhlbnRpa0NvbmZpZ0ZpbGUgPSBCb29sZWFuKHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCd1c2VBdXRoZW50aWtDb25maWdGaWxlJykgfHwgZmFsc2UpO1xuICAgIGNvbnN0IGhvc3RuYW1lQXV0aGVudGlrID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2hvc3RuYW1lQXV0aGVudGlrJykgfHwgJ2FjY291bnQnO1xuICAgIGNvbnN0IGhvc3RuYW1lTGRhcCA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdob3N0bmFtZUxkYXAnKSB8fCAnbGRhcCc7XG5cbiAgICAvLyBWYWxpZGF0ZSByZXF1aXJlZCBwYXJhbWV0ZXJzXG4gICAgaWYgKCFhdXRoZW50aWtBZG1pblVzZXJFbWFpbCB8fCBhdXRoZW50aWtBZG1pblVzZXJFbWFpbC50cmltKCkgPT09ICcnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2F1dGhlbnRpa0FkbWluVXNlckVtYWlsIGlzIHJlcXVpcmVkLiBTZXQgaXQgdmlhIC0tY29udGV4dCBhdXRoZW50aWtBZG1pblVzZXJFbWFpbD11c2VyQGV4YW1wbGUuY29tJyk7XG4gICAgfVxuXG4gICAgY29uc3Qgc3RhY2tOYW1lID0gRm4ucmVmKCdBV1M6OlN0YWNrTmFtZScpO1xuICAgIGNvbnN0IHJlZ2lvbiA9IGNkay5TdGFjay5vZih0aGlzKS5yZWdpb247XG5cbiAgICAvLyBJbXBvcnQgVlBDIGFuZCBuZXR3b3JraW5nIGZyb20gYmFzZSBpbmZyYXN0cnVjdHVyZVxuICAgIGNvbnN0IHZwYyA9IGVjMi5WcGMuZnJvbVZwY0F0dHJpYnV0ZXModGhpcywgJ1ZQQycsIHtcbiAgICAgIHZwY0lkOiBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5WUENfSUQpKSxcbiAgICAgIGF2YWlsYWJpbGl0eVpvbmVzOiB0aGlzLmF2YWlsYWJpbGl0eVpvbmVzLFxuICAgICAgLy8gSW1wb3J0IHN1Ym5ldCBJRHMgZnJvbSBiYXNlIGluZnJhc3RydWN0dXJlXG4gICAgICBwdWJsaWNTdWJuZXRJZHM6IFtcbiAgICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuU1VCTkVUX1BVQkxJQ19BKSksXG4gICAgICAgIEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlNVQk5FVF9QVUJMSUNfQikpXG4gICAgICBdLFxuICAgICAgcHJpdmF0ZVN1Ym5ldElkczogW1xuICAgICAgICBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5TVUJORVRfUFJJVkFURV9BKSksXG4gICAgICAgIEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlNVQk5FVF9QUklWQVRFX0IpKVxuICAgICAgXVxuICAgIH0pO1xuXG4gICAgLy8gSW1wb3J0IEtNUyBrZXkgZnJvbSBiYXNlIGluZnJhc3RydWN0dXJlXG4gICAgY29uc3Qga21zS2V5ID0ga21zLktleS5mcm9tS2V5QXJuKHRoaXMsICdLTVNLZXknLCBcbiAgICAgIEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLktNU19LRVkpKVxuICAgICk7XG5cbiAgICAvLyBJbXBvcnQgRUNTIENsdXN0ZXIgZnJvbSBiYXNlIGluZnJhc3RydWN0dXJlXG4gICAgY29uc3QgZWNzQ2x1c3RlciA9IGVjcy5DbHVzdGVyLmZyb21DbHVzdGVyQXJuKHRoaXMsICdFQ1NDbHVzdGVyJyxcbiAgICAgIEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLkVDU19DTFVTVEVSKSlcbiAgICApO1xuXG4gICAgLy8gSW1wb3J0IFMzIGNvbmZpZ3VyYXRpb24gYnVja2V0IGZyb20gYmFzZSBpbmZyYXN0cnVjdHVyZVxuICAgIGNvbnN0IHMzQ29uZkJ1Y2tldCA9IHMzLkJ1Y2tldC5mcm9tQnVja2V0QXJuKHRoaXMsICdTM0NvbmZCdWNrZXQnLFxuICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuUzNfQlVDS0VUKSlcbiAgICApO1xuXG4gICAgLy8gSW1wb3J0IEVDUiByZXBvc2l0b3J5IGZyb20gYmFzZSBpbmZyYXN0cnVjdHVyZSAoZm9yIGxvY2FsIEVDUiBvcHRpb24pXG4gICAgY29uc3QgZWNyUmVwb3NpdG9yeSA9IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLkVDUl9SRVBPKSk7XG5cbiAgICAvLyBJbXBvcnQgUm91dGU1MyBob3N0ZWQgem9uZSBmcm9tIGJhc2UgaW5mcmFzdHJ1Y3R1cmVcbiAgICBjb25zdCBob3N0ZWRab25lSWQgPSBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5IT1NURURfWk9ORV9JRCkpO1xuICAgIGNvbnN0IGhvc3RlZFpvbmVOYW1lID0gRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuSE9TVEVEX1pPTkVfTkFNRSkpO1xuXG4gICAgLy8gUzMgRW52aXJvbm1lbnQgRmlsZSBNYW5hZ2VyIC0gbWFuYWdlcyBhdXRoZW50aWstY29uZmlnLmVudiBmaWxlXG4gICAgY29uc3QgczNFbnZGaWxlTWFuYWdlciA9IG5ldyBTM0VudkZpbGVNYW5hZ2VyKHRoaXMsICdTM0VudkZpbGVNYW5hZ2VyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIHMzQ29uZkJ1Y2tldCxcbiAgICAgIGVudkZpbGVOYW1lOiAnYXV0aGVudGlrLWNvbmZpZy5lbnYnXG4gICAgfSk7XG5cbiAgICAvLyBTZWN1cml0eSBHcm91cHNcbiAgICBjb25zdCBlY3NTZWN1cml0eUdyb3VwID0gdGhpcy5jcmVhdGVFY3NTZWN1cml0eUdyb3VwKHZwYyk7XG4gICAgY29uc3QgZGJTZWN1cml0eUdyb3VwID0gdGhpcy5jcmVhdGVEYlNlY3VyaXR5R3JvdXAodnBjLCBlY3NTZWN1cml0eUdyb3VwKTtcbiAgICBjb25zdCByZWRpc1NlY3VyaXR5R3JvdXAgPSB0aGlzLmNyZWF0ZVJlZGlzU2VjdXJpdHlHcm91cCh2cGMsIGVjc1NlY3VyaXR5R3JvdXApO1xuXG4gICAgLy8gU2VjcmV0c01hbmFnZXJcbiAgICBjb25zdCBzZWNyZXRzTWFuYWdlciA9IG5ldyBTZWNyZXRzTWFuYWdlcih0aGlzLCAnU2VjcmV0c01hbmFnZXInLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAga21zS2V5XG4gICAgfSk7XG5cbiAgICAvLyBEYXRhYmFzZVxuICAgIGNvbnN0IGRhdGFiYXNlID0gbmV3IERhdGFiYXNlKHRoaXMsICdEYXRhYmFzZScsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IG1lcmdlZENvbmZpZyxcbiAgICAgIHZwYyxcbiAgICAgIGttc0tleSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbZGJTZWN1cml0eUdyb3VwXVxuICAgIH0pO1xuXG4gICAgLy8gUmVkaXNcbiAgICBjb25zdCByZWRpcyA9IG5ldyBSZWRpcyh0aGlzLCAnUmVkaXMnLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBtZXJnZWRDb25maWcsXG4gICAgICB2cGMsXG4gICAgICBrbXNLZXksXG4gICAgICBzZWN1cml0eUdyb3VwczogW3JlZGlzU2VjdXJpdHlHcm91cF1cbiAgICB9KTtcblxuICAgIC8vIEVGU1xuICAgIGNvbnN0IGVmcyA9IG5ldyBFZnModGhpcywgJ0VGUycsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICB2cGMsXG4gICAgICBrbXNLZXksXG4gICAgICBhbGxvd0FjY2Vzc0Zyb206IFtlY3NTZWN1cml0eUdyb3VwXVxuICAgIH0pO1xuXG4gICAgLy8gQXV0aGVudGlrIExvYWQgQmFsYW5jZXJcbiAgICBjb25zdCBhdXRoZW50aWtFTEIgPSBuZXcgRWxiKHRoaXMsICdBdXRoZW50aWtFTEInLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBtZXJnZWRDb25maWcsXG4gICAgICB2cGMsXG4gICAgICBzc2xDZXJ0aWZpY2F0ZUFybjogc3NsQ2VydGlmaWNhdGVBcm5cbiAgICB9KTtcblxuICAgIC8vIEF1dGhlbnRpayBTZXJ2ZXJcbiAgICBjb25zdCBhdXRoZW50aWtTZXJ2ZXIgPSBuZXcgQXV0aGVudGlrU2VydmVyKHRoaXMsICdBdXRoZW50aWtTZXJ2ZXInLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBtZXJnZWRDb25maWcsXG4gICAgICB2cGMsXG4gICAgICBlY3NTZWN1cml0eUdyb3VwLFxuICAgICAgZWNzQ2x1c3RlcixcbiAgICAgIHMzQ29uZkJ1Y2tldCxcbiAgICAgIGVudkZpbGVTM1VyaTogczNFbnZGaWxlTWFuYWdlci5lbnZGaWxlUzNVcmksXG4gICAgICBlbnZGaWxlUzNLZXk6IHMzRW52RmlsZU1hbmFnZXIuZW52RmlsZVMzS2V5LFxuICAgICAgYWRtaW5Vc2VyRW1haWw6IGF1dGhlbnRpa0FkbWluVXNlckVtYWlsLFxuICAgICAgbGRhcEJhc2VEbjogYXV0aGVudGlrTGRhcEJhc2VEbixcbiAgICAgIHVzZUNvbmZpZ0ZpbGU6IHVzZUF1dGhlbnRpa0NvbmZpZ0ZpbGUsXG4gICAgICBlY3JSZXBvc2l0b3J5QXJuOiBlY3JSZXBvc2l0b3J5LFxuICAgICAgZW5hYmxlRXhlY3V0ZTogZW5hYmxlRXhlY3V0ZSxcbiAgICAgIGRiU2VjcmV0OiBkYXRhYmFzZS5tYXN0ZXJTZWNyZXQsXG4gICAgICBkYkhvc3RuYW1lOiBkYXRhYmFzZS5ob3N0bmFtZSxcbiAgICAgIHJlZGlzQXV0aFRva2VuOiByZWRpcy5hdXRoVG9rZW4sXG4gICAgICByZWRpc0hvc3RuYW1lOiByZWRpcy5ob3N0bmFtZSxcbiAgICAgIHNlY3JldEtleTogc2VjcmV0c01hbmFnZXIuc2VjcmV0S2V5LFxuICAgICAgYWRtaW5Vc2VyUGFzc3dvcmQ6IHNlY3JldHNNYW5hZ2VyLmFkbWluVXNlclBhc3N3b3JkLFxuICAgICAgYWRtaW5Vc2VyVG9rZW46IHNlY3JldHNNYW5hZ2VyLmFkbWluVXNlclRva2VuLFxuICAgICAgbGRhcFRva2VuOiBzZWNyZXRzTWFuYWdlci5sZGFwVG9rZW4sXG4gICAgICBlZnNJZDogZWZzLmZpbGVTeXN0ZW0uZmlsZVN5c3RlbUlkLFxuICAgICAgZWZzTWVkaWFBY2Nlc3NQb2ludElkOiBlZnMubWVkaWFBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkLFxuICAgICAgZWZzQ3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnRJZDogZWZzLmN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWRcbiAgICB9KTtcblxuICAgIC8vIEF1dGhlbnRpayBXb3JrZXJcbiAgICBjb25zdCBhdXRoZW50aWtXb3JrZXIgPSBuZXcgQXV0aGVudGlrV29ya2VyKHRoaXMsICdBdXRoZW50aWtXb3JrZXInLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBtZXJnZWRDb25maWcsXG4gICAgICB2cGMsXG4gICAgICBlY3NTZWN1cml0eUdyb3VwLFxuICAgICAgZWNzQ2x1c3RlcixcbiAgICAgIHMzQ29uZkJ1Y2tldCxcbiAgICAgIGVudkZpbGVTM0tleTogczNFbnZGaWxlTWFuYWdlci5lbnZGaWxlUzNLZXksXG4gICAgICBlY3JSZXBvc2l0b3J5QXJuOiBlY3JSZXBvc2l0b3J5LFxuICAgICAgZW5hYmxlRXhlY3V0ZTogZW5hYmxlRXhlY3V0ZSxcbiAgICAgIGRiU2VjcmV0OiBkYXRhYmFzZS5tYXN0ZXJTZWNyZXQsXG4gICAgICBkYkhvc3RuYW1lOiBkYXRhYmFzZS5ob3N0bmFtZSxcbiAgICAgIHJlZGlzQXV0aFRva2VuOiByZWRpcy5hdXRoVG9rZW4sXG4gICAgICByZWRpc0hvc3RuYW1lOiByZWRpcy5ob3N0bmFtZSxcbiAgICAgIHNlY3JldEtleTogc2VjcmV0c01hbmFnZXIuc2VjcmV0S2V5LFxuICAgICAgZWZzSWQ6IGVmcy5maWxlU3lzdGVtLmZpbGVTeXN0ZW1JZCxcbiAgICAgIGVmc01lZGlhQWNjZXNzUG9pbnRJZDogZWZzLm1lZGlhQWNjZXNzUG9pbnQuYWNjZXNzUG9pbnRJZCxcbiAgICAgIGVmc0N1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50SWQ6IGVmcy5jdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkXG4gICAgfSk7XG5cbiAgICAvLyBDb25uZWN0IEF1dGhlbnRpayBTZXJ2ZXIgdG8gTG9hZCBCYWxhbmNlclxuICAgIGF1dGhlbnRpa1NlcnZlci5jcmVhdGVUYXJnZXRHcm91cCh2cGMsIGF1dGhlbnRpa0VMQi5odHRwc0xpc3RlbmVyKTtcblxuICAgIC8vIExEQVAgVG9rZW4gUmV0cmlldmVyXG4gICAgY29uc3QgbGRhcFRva2VuUmV0cmlldmVyID0gbmV3IExkYXBUb2tlblJldHJpZXZlcih0aGlzLCAnTGRhcFRva2VuUmV0cmlldmVyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogbWVyZ2VkQ29uZmlnLFxuICAgICAga21zS2V5LFxuICAgICAgYXV0aGVudGlrSG9zdDogYGh0dHBzOi8vJHthdXRoZW50aWtFTEIuZG5zTmFtZX1gLFxuICAgICAgb3V0cG9zdE5hbWU6ICdMREFQJyxcbiAgICAgIGFkbWluVG9rZW5TZWNyZXQ6IHNlY3JldHNNYW5hZ2VyLmFkbWluVXNlclRva2VuLFxuICAgICAgbGRhcFRva2VuU2VjcmV0OiBzZWNyZXRzTWFuYWdlci5sZGFwVG9rZW4sXG4gICAgICBnaXRTaGE6IGdpdFNoYVxuICAgIH0pO1xuXG4gICAgLy8gTERBUFxuICAgIGNvbnN0IGxkYXAgPSBuZXcgTGRhcCh0aGlzLCAnTERBUCcsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IG1lcmdlZENvbmZpZyxcbiAgICAgIHZwYyxcbiAgICAgIGVjc1NlY3VyaXR5R3JvdXAsXG4gICAgICBlY3NDbHVzdGVyLFxuICAgICAgczNDb25mQnVja2V0LFxuICAgICAgc3NsQ2VydGlmaWNhdGVBcm46IHNzbENlcnRpZmljYXRlQXJuLFxuICAgICAgYXV0aGVudGlrSG9zdDogYXV0aGVudGlrRUxCLmRuc05hbWUsXG4gICAgICBlY3JSZXBvc2l0b3J5QXJuOiBlY3JSZXBvc2l0b3J5LFxuICAgICAgZW5hYmxlRXhlY3V0ZTogZW5hYmxlRXhlY3V0ZSxcbiAgICAgIGxkYXBUb2tlbjogc2VjcmV0c01hbmFnZXIubGRhcFRva2VuXG4gICAgfSk7XG5cbiAgICAvLyBFbnN1cmUgTERBUCB3YWl0cyBmb3IgdGhlIHRva2VuIHRvIGJlIHJldHJpZXZlZFxuICAgIGxkYXAubm9kZS5hZGREZXBlbmRlbmN5KGxkYXBUb2tlblJldHJpZXZlcik7XG5cbiAgICAvLyBSb3V0ZTUzIEROUyBSZWNvcmRzXG4gICAgY29uc3Qgcm91dGU1MyA9IG5ldyBSb3V0ZTUzKHRoaXMsICdSb3V0ZTUzJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogbWVyZ2VkQ29uZmlnLFxuICAgICAgaG9zdGVkWm9uZUlkOiBob3N0ZWRab25lSWQsXG4gICAgICBob3N0ZWRab25lTmFtZTogaG9zdGVkWm9uZU5hbWUsXG4gICAgICBob3N0bmFtZUF1dGhlbnRpazogaG9zdG5hbWVBdXRoZW50aWssXG4gICAgICBob3N0bmFtZUxkYXA6IGhvc3RuYW1lTGRhcCxcbiAgICAgIGF1dGhlbnRpa0xvYWRCYWxhbmNlcjogYXV0aGVudGlrRUxCLmxvYWRCYWxhbmNlcixcbiAgICAgIGxkYXBMb2FkQmFsYW5jZXI6IGxkYXAubG9hZEJhbGFuY2VyXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgcmVnaXN0ZXJPdXRwdXRzKHtcbiAgICAgIHN0YWNrOiB0aGlzLFxuICAgICAgc3RhY2tOYW1lOiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBkYXRhYmFzZUVuZHBvaW50OiBkYXRhYmFzZS5ob3N0bmFtZSxcbiAgICAgIGRhdGFiYXNlU2VjcmV0QXJuOiBkYXRhYmFzZS5tYXN0ZXJTZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgcmVkaXNFbmRwb2ludDogcmVkaXMuaG9zdG5hbWUsXG4gICAgICByZWRpc0F1dGhUb2tlbkFybjogcmVkaXMuYXV0aFRva2VuLnNlY3JldEFybixcbiAgICAgIGVmc0lkOiBlZnMuZmlsZVN5c3RlbS5maWxlU3lzdGVtSWQsXG4gICAgICBlZnNNZWRpYUFjY2Vzc1BvaW50SWQ6IGVmcy5tZWRpYUFjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWQsXG4gICAgICBlZnNUZW1wbGF0ZXNBY2Nlc3NQb2ludElkOiBlZnMuY3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnQuYWNjZXNzUG9pbnRJZCxcbiAgICAgIGF1dGhlbnRpa1NlY3JldEtleUFybjogc2VjcmV0c01hbmFnZXIuc2VjcmV0S2V5LnNlY3JldEFybixcbiAgICAgIGF1dGhlbnRpa0FkbWluVG9rZW5Bcm46IHNlY3JldHNNYW5hZ2VyLmFkbWluVXNlclRva2VuLnNlY3JldEFybixcbiAgICAgIGF1dGhlbnRpa0xkYXBUb2tlbkFybjogc2VjcmV0c01hbmFnZXIubGRhcFRva2VuLnNlY3JldEFybixcbiAgICAgIGF1dGhlbnRpa0FsYkRuczogYXV0aGVudGlrRUxCLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lLFxuICAgICAgYXV0aGVudGlrVXJsOiBgaHR0cHM6Ly8ke2F1dGhlbnRpa0VMQi5kbnNOYW1lfWAsXG4gICAgICBsZGFwTmxiRG5zOiBsZGFwLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lLFxuICAgICAgbGRhcFRva2VuUmV0cmlldmVyTGFtYmRhQXJuOiBsZGFwVG9rZW5SZXRyaWV2ZXIubGFtYmRhRnVuY3Rpb24uZnVuY3Rpb25Bcm5cbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlRWNzU2VjdXJpdHlHcm91cCh2cGM6IGVjMi5JVnBjKTogZWMyLlNlY3VyaXR5R3JvdXAge1xuICAgIGNvbnN0IGVjc1NlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0VDU1NlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBFQ1MgdGFza3MnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogdHJ1ZVxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgSFRUUC9IVFRQUyB0cmFmZmljIHRvIEVDUyB0YXNrc1xuICAgIGVjc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5hbnlJcHY0KCksXG4gICAgICBlYzIuUG9ydC50Y3AoODApLFxuICAgICAgJ0FsbG93IEhUVFAgdHJhZmZpYydcbiAgICApO1xuXG4gICAgZWNzU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg0NDMpLFxuICAgICAgJ0FsbG93IEhUVFBTIHRyYWZmaWMnXG4gICAgKTtcblxuICAgIGVjc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5hbnlJcHY0KCksXG4gICAgICBlYzIuUG9ydC50Y3AoOTAwMCksXG4gICAgICAnQWxsb3cgQXV0aGVudGlrIHRyYWZmaWMnXG4gICAgKTtcblxuICAgIHJldHVybiBlY3NTZWN1cml0eUdyb3VwO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVEYlNlY3VyaXR5R3JvdXAodnBjOiBlYzIuSVZwYywgZWNzU2VjdXJpdHlHcm91cDogZWMyLlNlY3VyaXR5R3JvdXApOiBlYzIuU2VjdXJpdHlHcm91cCB7XG4gICAgY29uc3QgZGJTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdEQlNlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBkYXRhYmFzZScsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiBmYWxzZVxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgUG9zdGdyZVNRTCBhY2Nlc3MgZnJvbSBFQ1MgdGFza3NcbiAgICBkYlNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5zZWN1cml0eUdyb3VwSWQoZWNzU2VjdXJpdHlHcm91cC5zZWN1cml0eUdyb3VwSWQpLFxuICAgICAgZWMyLlBvcnQudGNwKDU0MzIpLFxuICAgICAgJ0FsbG93IFBvc3RncmVTUUwgYWNjZXNzIGZyb20gRUNTIHRhc2tzJ1xuICAgICk7XG5cbiAgICByZXR1cm4gZGJTZWN1cml0eUdyb3VwO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVSZWRpc1NlY3VyaXR5R3JvdXAodnBjOiBlYzIuSVZwYywgZWNzU2VjdXJpdHlHcm91cDogZWMyLlNlY3VyaXR5R3JvdXApOiBlYzIuU2VjdXJpdHlHcm91cCB7XG4gICAgY29uc3QgcmVkaXNTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdSZWRpc1NlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBSZWRpcycsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiBmYWxzZVxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgUmVkaXMgYWNjZXNzIGZyb20gRUNTIHRhc2tzXG4gICAgcmVkaXNTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuc2VjdXJpdHlHcm91cElkKGVjc1NlY3VyaXR5R3JvdXAuc2VjdXJpdHlHcm91cElkKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg2Mzc5KSxcbiAgICAgICdBbGxvdyBSZWRpcyBhY2Nlc3MgZnJvbSBFQ1MgdGFza3MnXG4gICAgKTtcblxuICAgIHJldHVybiByZWRpc1NlY3VyaXR5R3JvdXA7XG4gIH1cblxuICAvKipcbiAgICogR2V0IHRoZSBjdXJyZW50IGdpdCBTSEEgZm9yIHRhZ2dpbmcgcmVzb3VyY2VzXG4gICAqIEByZXR1cm5zIEN1cnJlbnQgZ2l0IFNIQVxuICAgKi9cbiAgcHJpdmF0ZSBnZXRHaXRTaGEoKTogc3RyaW5nIHtcbiAgICB0cnkge1xuICAgICAgLy8gR2V0IHRoZSBjdXJyZW50IGdpdCBTSEFcbiAgICAgIGNvbnN0IHsgZXhlY1N5bmMgfSA9IHJlcXVpcmUoJ2NoaWxkX3Byb2Nlc3MnKTtcbiAgICAgIHJldHVybiBleGVjU3luYygnZ2l0IHJldi1wYXJzZSAtLXNob3J0IEhFQUQnKS50b1N0cmluZygpLnRyaW0oKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS53YXJuKCdVbmFibGUgdG8gZ2V0IGdpdCBTSEEsIHVzaW5nIFwiZGV2ZWxvcG1lbnRcIicpO1xuICAgICAgcmV0dXJuICdkZXZlbG9wbWVudCc7XG4gICAgfVxuICB9XG59XG4iXX0=