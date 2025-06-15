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
const ecr_image_validator_1 = require("./constructs/ecr-image-validator");
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
        // Validate required ECR images exist before deployment
        const requiredImageTags = [
            `auth-infra-server-${gitSha}`,
            `auth-infra-ldap-${gitSha}`
        ];
        const ecrValidator = new ecr_image_validator_1.EcrImageValidator(this, 'EcrImageValidator', {
            ecrRepositoryArn: ecrRepository,
            requiredImageTags: requiredImageTags,
            environment: stackNameComponent
        });
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
            gitSha: gitSha,
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
        // Ensure Authentik Server waits for ECR image validation
        authentikServer.node.addDependency(ecrValidator);
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
            gitSha: gitSha,
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
        // Ensure Authentik Worker waits for ECR image validation
        authentikWorker.node.addDependency(ecrValidator);
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
            gitSha: gitSha,
            enableExecute: enableExecute,
            ldapToken: secretsManager.ldapToken
        });
        // Ensure LDAP waits for ECR image validation
        ldap.node.addDependency(ecrValidator);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGgtaW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFFbkMsb0RBQWlEO0FBQ2pELDhDQUEyQztBQUMzQywwQ0FBdUM7QUFDdkMsa0VBQThEO0FBQzlELDBDQUF1QztBQUN2QyxvRUFBZ0U7QUFDaEUsb0VBQWdFO0FBQ2hFLDRDQUF5QztBQUN6Qyw0RUFBdUU7QUFDdkUsMEVBQW9FO0FBQ3BFLGtEQUErQztBQUMvQywwRUFBcUU7QUFDckUsNkNBQTZDO0FBQzdDLHVDQUE0QztBQUM1Qyx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLHlEQUEyQztBQUMzQyx1REFBeUM7QUFDekMscUVBQW9GO0FBQ3BGLDZEQUFvRjtBQU9wRjs7R0FFRztBQUNILE1BQWEsY0FBZSxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQzNDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBMEI7UUFDbEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUU7WUFDZixHQUFHLEtBQUs7WUFDUixXQUFXLEVBQUUsb0RBQW9EO1NBQ2xFLENBQUMsQ0FBQztRQUVILE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxXQUFXLENBQUM7UUFFakMsK0JBQStCO1FBQy9CLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUM7UUFDL0IsTUFBTSxrQkFBa0IsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMscURBQXFEO1FBQ2xHLE1BQU0saUJBQWlCLEdBQUcsRUFBRSxDQUFDO1FBRTdCLDJFQUEyRTtRQUMzRSxNQUFNLFNBQVMsR0FBRyxNQUFNLENBQUMsT0FBTyxLQUFLLE1BQU0sQ0FBQyxDQUFDO1lBQzNDLEVBQUUsc0JBQXNCLEVBQUUsSUFBSSxFQUFFLHdCQUF3QixFQUFFLElBQUksRUFBRSxDQUFDLENB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SUFFTyx3QkFBd0IsQ0FBQyxHQUFhLEVBQUUsZ0JBQW1DO1FBQ2pGLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxHQUFHLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUMzRSxHQUFHO1lBQ0gsV0FBVyxFQUFFLDBCQUEwQjtZQUN2QyxnQkFBZ0IsRUFBRSxLQUFLO1NBQ3hCLENBQUMsQ0FBQztRQUVILG9DQUFvQztRQUNwQyxrQkFBa0IsQ0FBQyxjQUFjLENBQy9CLEdBQUcsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLGdCQUFnQixDQUFDLGVBQWUsQ0FBQyxFQUMxRCxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFDbEIsbUNBQW1DLENBQ3BDLENBQUM7UUFFRixPQUFPLGtCQUFrQixDQUFDO0lBQzVCLENBQUM7SUFFRDs7O09BR0c7SUFDSyxTQUFTO1FBQ2YsSUFBSSxDQUFDO1lBQ0gsMEJBQTBCO1lBQzFCLE1BQU0sRUFBRSxRQUFRLEVBQUUsR0FBRyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDOUMsT0FBTyxRQUFRLENBQUMsNEJBQTRCLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNsRSxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE9BQU8sQ0FBQyxJQUFJLENBQUMsNENBQTRDLENBQUMsQ0FBQztZQUMzRCxPQUFPLGFBQWEsQ0FBQztRQUN2QixDQUFDO0lBQ0gsQ0FBQztDQUNGO0FBalhELHdDQWlYQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7IERhdGFiYXNlIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2RhdGFiYXNlJztcbmltcG9ydCB7IFJlZGlzIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL3JlZGlzJztcbmltcG9ydCB7IEVmcyB9IGZyb20gJy4vY29uc3RydWN0cy9lZnMnO1xuaW1wb3J0IHsgU2VjcmV0c01hbmFnZXIgfSBmcm9tICcuL2NvbnN0cnVjdHMvc2VjcmV0cy1tYW5hZ2VyJztcbmltcG9ydCB7IEVsYiB9IGZyb20gJy4vY29uc3RydWN0cy9lbGInO1xuaW1wb3J0IHsgQXV0aGVudGlrU2VydmVyIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2F1dGhlbnRpay1zZXJ2ZXInO1xuaW1wb3J0IHsgQXV0aGVudGlrV29ya2VyIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2F1dGhlbnRpay13b3JrZXInO1xuaW1wb3J0IHsgTGRhcCB9IGZyb20gJy4vY29uc3RydWN0cy9sZGFwJztcbmltcG9ydCB7IExkYXBUb2tlblJldHJpZXZlciB9IGZyb20gJy4vY29uc3RydWN0cy9sZGFwLXRva2VuLXJldHJpZXZlcic7XG5pbXBvcnQgeyBTM0VudkZpbGVNYW5hZ2VyIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL3MzLWVudi1maWxlLW1hbmFnZXInO1xuaW1wb3J0IHsgUm91dGU1MyB9IGZyb20gJy4vY29uc3RydWN0cy9yb3V0ZTUzJztcbmltcG9ydCB7IEVjckltYWdlVmFsaWRhdG9yIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2Vjci1pbWFnZS12YWxpZGF0b3InO1xuaW1wb3J0IHsgU3RhY2tQcm9wcywgRm4gfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyByZWdpc3Rlck91dHB1dHMgfSBmcm9tICcuL291dHB1dHMnO1xuaW1wb3J0ICogYXMgZWMyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xuaW1wb3J0ICogYXMgZWNzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3MnO1xuaW1wb3J0ICogYXMga21zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1rbXMnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCB7IGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZSwgQkFTRV9FWFBPUlRfTkFNRVMgfSBmcm9tICcuL2Nsb3VkZm9ybWF0aW9uLWltcG9ydHMnO1xuaW1wb3J0IHsgZ2V0RW52aXJvbm1lbnRDb25maWcsIG1lcmdlRW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuL2Vudmlyb25tZW50LWNvbmZpZyc7XG5pbXBvcnQgeyBBdXRoSW5mcmFDb25maWcgfSBmcm9tICcuL3N0YWNrLWNvbmZpZyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aEluZnJhU3RhY2tQcm9wcyBleHRlbmRzIFN0YWNrUHJvcHMge1xuICBzdGFja0NvbmZpZzogQXV0aEluZnJhQ29uZmlnO1xufVxuXG4vKipcbiAqIE1haW4gQ0RLIHN0YWNrIGZvciB0aGUgVEFLIEF1dGggSW5mcmFzdHJ1Y3R1cmVcbiAqL1xuZXhwb3J0IGNsYXNzIEF1dGhJbmZyYVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEF1dGhJbmZyYVN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHtcbiAgICAgIC4uLnByb3BzLFxuICAgICAgZGVzY3JpcHRpb246ICdUQUsgQXV0aGVudGljYXRpb24gTGF5ZXIgLSBBdXRoZW50aWssIExEQVAgT3V0cG9zdCcsXG4gICAgfSk7XG5cbiAgICBjb25zdCBjb25maWcgPSBwcm9wcy5zdGFja0NvbmZpZztcbiAgICBcbiAgICAvLyBFeHRyYWN0IGNvbmZpZ3VyYXRpb24gdmFsdWVzXG4gICAgY29uc3QgZW52VHlwZSA9IGNvbmZpZy5lbnZUeXBlO1xuICAgIGNvbnN0IHN0YWNrTmFtZUNvbXBvbmVudCA9IGNvbmZpZy5zdGFja05hbWU7IC8vIFRoaXMgaXMgdGhlIFNUQUNLX05BTUUgcGFydCAoZS5nLiwgXCJNeUZpcnN0U3RhY2tcIilcbiAgICBjb25zdCByZXNvbHZlZFN0YWNrTmFtZSA9IGlkO1xuICAgIFxuICAgIC8vIEdldCBlbnZpcm9ubWVudC1zcGVjaWZpYyBkZWZhdWx0cyAoZm9sbG93aW5nIHJlZmVyZW5jZSB0ZW1wbGF0ZSBwYXR0ZXJuKVxuICAgIGNvbnN0IGVudkNvbmZpZyA9IGNvbmZpZy5lbnZUeXBlID09PSAncHJvZCcgPyBcbiAgICAgIHsgZW5hYmxlSGlnaEF2YWlsYWJpbGl0eTogdHJ1ZSwgZW5hYmxlRGV0YWlsZWRNb25pdG9yaW5nOiB0cnVlIH0gOlxuICAgICAgeyBlbmFibGVIaWdoQXZhaWxhYmlsaXR5OiBmYWxzZSwgZW5hYmxlRGV0YWlsZWRNb25pdG9yaW5nOiBmYWxzZSB9O1xuICAgIFxuICAgIGNvbnN0IGVuYWJsZUhpZ2hBdmFpbGFiaWxpdHkgPSBlbnZDb25maWcuZW5hYmxlSGlnaEF2YWlsYWJpbGl0eTtcbiAgICBcbiAgICAvLyBHZXQgYmFzZSBjb25maWd1cmF0aW9uIGFuZCBtZXJnZSB3aXRoIG92ZXJyaWRlc1xuICAgIGNvbnN0IGJhc2VDb25maWcgPSBnZXRFbnZpcm9ubWVudENvbmZpZyhlbnZUeXBlKTtcbiAgICBjb25zdCBtZXJnZWRDb25maWcgPSBjb25maWcub3ZlcnJpZGVzID8gXG4gICAgICBtZXJnZUVudmlyb25tZW50Q29uZmlnKGJhc2VDb25maWcsIGNvbmZpZy5vdmVycmlkZXMpIDogXG4gICAgICBiYXNlQ29uZmlnO1xuICAgIFxuICAgIC8vIFNldCBjb250YWluZXIgY291bnRzIGJhc2VkIG9uIGhpZ2ggYXZhaWxhYmlsaXR5IHNldHRpbmdcbiAgICAvLyBlbmFibGVIaWdoQXZhaWxhYmlsaXR5PXRydWU6IDIgY29udGFpbmVycyAoU2VydmVyLCBXb3JrZXIsIExEQVApXG4gICAgLy8gZW5hYmxlSGlnaEF2YWlsYWJpbGl0eT1mYWxzZTogMSBjb250YWluZXIgZWFjaFxuICAgIGNvbnN0IGRlc2lyZWRDb250YWluZXJDb3VudCA9IGVuYWJsZUhpZ2hBdmFpbGFiaWxpdHkgPyAyIDogMTtcbiAgICBcbiAgICAvLyBPdmVycmlkZSBjb250YWluZXIgY291bnRzIGluIG1lcmdlZCBjb25maWcgdW5sZXNzIGV4cGxpY2l0bHkgc2V0IHZpYSBjb250ZXh0XG4gICAgaWYgKCFjb25maWcub3ZlcnJpZGVzPy5lY3M/LmRlc2lyZWRDb3VudCkge1xuICAgICAgbWVyZ2VkQ29uZmlnLmVjcy5kZXNpcmVkQ291bnQgPSBkZXNpcmVkQ29udGFpbmVyQ291bnQ7XG4gICAgfVxuICAgIGlmICghY29uZmlnLm92ZXJyaWRlcz8uZWNzPy53b3JrZXJEZXNpcmVkQ291bnQpIHtcbiAgICAgIG1lcmdlZENvbmZpZy5lY3Mud29ya2VyRGVzaXJlZENvdW50ID0gZGVzaXJlZENvbnRhaW5lckNvdW50O1xuICAgIH1cblxuICAgIC8vIEFkZCBFbnZpcm9ubWVudCBUeXBlIHRhZyB0byB0aGUgc3RhY2tcbiAgICBjb25zdCBlbnZpcm9ubWVudExhYmVsID0gZW52VHlwZSA9PT0gJ3Byb2QnID8gJ1Byb2QnIDogJ0Rldi1UZXN0JztcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ0Vudmlyb25tZW50IFR5cGUnLCBlbnZpcm9ubWVudExhYmVsKTtcblxuICAgIGNvbnN0IGF3c1N0YWNrTmFtZSA9IEZuLnJlZignQVdTOjpTdGFja05hbWUnKTtcbiAgICBjb25zdCBhd3NSZWdpb24gPSBjZGsuU3RhY2sub2YodGhpcykucmVnaW9uO1xuXG4gICAgLy8gQ29udGV4dC1iYXNlZCBwYXJhbWV0ZXIgcmVzb2x1dGlvbiAoQ0RLIGNvbnRleHQgb25seSlcbiAgICBjb25zdCBnaXRTaGEgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZ2l0U2hhJykgfHwgdGhpcy5nZXRHaXRTaGEoKTtcbiAgICBjb25zdCBlbmFibGVFeGVjdXRlID0gQm9vbGVhbih0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZW5hYmxlRXhlY3V0ZScpIHx8IGZhbHNlKTtcbiAgICBjb25zdCBhdXRoZW50aWtBZG1pblVzZXJFbWFpbCA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdhdXRoZW50aWtBZG1pblVzZXJFbWFpbCcpIHx8ICcnO1xuICAgIGNvbnN0IGF1dGhlbnRpa0xkYXBCYXNlRG4gPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnYXV0aGVudGlrTGRhcEJhc2VEbicpIHx8ICdEQz1leGFtcGxlLERDPWNvbSc7XG4gICAgY29uc3Qgc3NsQ2VydGlmaWNhdGVBcm4gPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnc3NsQ2VydGlmaWNhdGVBcm4nKSB8fCAnJztcbiAgICBjb25zdCB1c2VBdXRoZW50aWtDb25maWdGaWxlID0gQm9vbGVhbih0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgndXNlQXV0aGVudGlrQ29uZmlnRmlsZScpIHx8IGZhbHNlKTtcbiAgICBjb25zdCBob3N0bmFtZUF1dGhlbnRpayA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdob3N0bmFtZUF1dGhlbnRpaycpIHx8ICdhY2NvdW50JztcbiAgICBjb25zdCBob3N0bmFtZUxkYXAgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnaG9zdG5hbWVMZGFwJykgfHwgJ2xkYXAnO1xuXG4gICAgLy8gVmFsaWRhdGUgcmVxdWlyZWQgcGFyYW1ldGVyc1xuICAgIGlmICghYXV0aGVudGlrQWRtaW5Vc2VyRW1haWwgfHwgYXV0aGVudGlrQWRtaW5Vc2VyRW1haWwudHJpbSgpID09PSAnJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdhdXRoZW50aWtBZG1pblVzZXJFbWFpbCBpcyByZXF1aXJlZC4gU2V0IGl0IHZpYSAtLWNvbnRleHQgYXV0aGVudGlrQWRtaW5Vc2VyRW1haWw9dXNlckBleGFtcGxlLmNvbScpO1xuICAgIH1cblxuICAgIGNvbnN0IHN0YWNrTmFtZSA9IEZuLnJlZignQVdTOjpTdGFja05hbWUnKTtcbiAgICBjb25zdCByZWdpb24gPSBjZGsuU3RhY2sub2YodGhpcykucmVnaW9uO1xuXG4gICAgLy8gSW1wb3J0IFZQQyBhbmQgbmV0d29ya2luZyBmcm9tIGJhc2UgaW5mcmFzdHJ1Y3R1cmVcbiAgICBjb25zdCB2cGMgPSBlYzIuVnBjLmZyb21WcGNBdHRyaWJ1dGVzKHRoaXMsICdWUEMnLCB7XG4gICAgICB2cGNJZDogRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuVlBDX0lEKSksXG4gICAgICBhdmFpbGFiaWxpdHlab25lczogdGhpcy5hdmFpbGFiaWxpdHlab25lcyxcbiAgICAgIC8vIEltcG9ydCBzdWJuZXQgSURzIGZyb20gYmFzZSBpbmZyYXN0cnVjdHVyZVxuICAgICAgcHVibGljU3VibmV0SWRzOiBbXG4gICAgICAgIEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlNVQk5FVF9QVUJMSUNfQSkpLFxuICAgICAgICBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5TVUJORVRfUFVCTElDX0IpKVxuICAgICAgXSxcbiAgICAgIHByaXZhdGVTdWJuZXRJZHM6IFtcbiAgICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuU1VCTkVUX1BSSVZBVEVfQSkpLFxuICAgICAgICBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5TVUJORVRfUFJJVkFURV9CKSlcbiAgICAgIF1cbiAgICB9KTtcblxuICAgIC8vIEltcG9ydCBLTVMga2V5IGZyb20gYmFzZSBpbmZyYXN0cnVjdHVyZVxuICAgIGNvbnN0IGttc0tleSA9IGttcy5LZXkuZnJvbUtleUFybih0aGlzLCAnS01TS2V5JywgXG4gICAgICBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5LTVNfS0VZKSlcbiAgICApO1xuXG4gICAgLy8gSW1wb3J0IEVDUyBDbHVzdGVyIGZyb20gYmFzZSBpbmZyYXN0cnVjdHVyZVxuICAgIGNvbnN0IGVjc0NsdXN0ZXIgPSBlY3MuQ2x1c3Rlci5mcm9tQ2x1c3RlckFybih0aGlzLCAnRUNTQ2x1c3RlcicsXG4gICAgICBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5FQ1NfQ0xVU1RFUikpXG4gICAgKTtcblxuICAgIC8vIEltcG9ydCBTMyBjb25maWd1cmF0aW9uIGJ1Y2tldCBmcm9tIGJhc2UgaW5mcmFzdHJ1Y3R1cmVcbiAgICBjb25zdCBzM0NvbmZCdWNrZXQgPSBzMy5CdWNrZXQuZnJvbUJ1Y2tldEFybih0aGlzLCAnUzNDb25mQnVja2V0JyxcbiAgICAgIEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlMzX0JVQ0tFVCkpXG4gICAgKTtcblxuICAgIC8vIEltcG9ydCBFQ1IgcmVwb3NpdG9yeSBmcm9tIGJhc2UgaW5mcmFzdHJ1Y3R1cmUgKGZvciBsb2NhbCBFQ1Igb3B0aW9uKVxuICAgIGNvbnN0IGVjclJlcG9zaXRvcnkgPSBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5FQ1JfUkVQTykpO1xuXG4gICAgLy8gVmFsaWRhdGUgcmVxdWlyZWQgRUNSIGltYWdlcyBleGlzdCBiZWZvcmUgZGVwbG95bWVudFxuICAgIGNvbnN0IHJlcXVpcmVkSW1hZ2VUYWdzID0gW1xuICAgICAgYGF1dGgtaW5mcmEtc2VydmVyLSR7Z2l0U2hhfWAsXG4gICAgICBgYXV0aC1pbmZyYS1sZGFwLSR7Z2l0U2hhfWBcbiAgICBdO1xuICAgIFxuICAgIGNvbnN0IGVjclZhbGlkYXRvciA9IG5ldyBFY3JJbWFnZVZhbGlkYXRvcih0aGlzLCAnRWNySW1hZ2VWYWxpZGF0b3InLCB7XG4gICAgICBlY3JSZXBvc2l0b3J5QXJuOiBlY3JSZXBvc2l0b3J5LFxuICAgICAgcmVxdWlyZWRJbWFnZVRhZ3M6IHJlcXVpcmVkSW1hZ2VUYWdzLFxuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudFxuICAgIH0pO1xuXG4gICAgLy8gSW1wb3J0IFJvdXRlNTMgaG9zdGVkIHpvbmUgZnJvbSBiYXNlIGluZnJhc3RydWN0dXJlXG4gICAgY29uc3QgaG9zdGVkWm9uZUlkID0gRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuSE9TVEVEX1pPTkVfSUQpKTtcbiAgICBjb25zdCBob3N0ZWRab25lTmFtZSA9IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLkhPU1RFRF9aT05FX05BTUUpKTtcblxuICAgIC8vIFMzIEVudmlyb25tZW50IEZpbGUgTWFuYWdlciAtIG1hbmFnZXMgYXV0aGVudGlrLWNvbmZpZy5lbnYgZmlsZVxuICAgIGNvbnN0IHMzRW52RmlsZU1hbmFnZXIgPSBuZXcgUzNFbnZGaWxlTWFuYWdlcih0aGlzLCAnUzNFbnZGaWxlTWFuYWdlcicsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBzM0NvbmZCdWNrZXQsXG4gICAgICBlbnZGaWxlTmFtZTogJ2F1dGhlbnRpay1jb25maWcuZW52J1xuICAgIH0pO1xuXG4gICAgLy8gU2VjdXJpdHkgR3JvdXBzXG4gICAgY29uc3QgZWNzU2VjdXJpdHlHcm91cCA9IHRoaXMuY3JlYXRlRWNzU2VjdXJpdHlHcm91cCh2cGMpO1xuICAgIGNvbnN0IGRiU2VjdXJpdHlHcm91cCA9IHRoaXMuY3JlYXRlRGJTZWN1cml0eUdyb3VwKHZwYywgZWNzU2VjdXJpdHlHcm91cCk7XG4gICAgY29uc3QgcmVkaXNTZWN1cml0eUdyb3VwID0gdGhpcy5jcmVhdGVSZWRpc1NlY3VyaXR5R3JvdXAodnBjLCBlY3NTZWN1cml0eUdyb3VwKTtcblxuICAgIC8vIFNlY3JldHNNYW5hZ2VyXG4gICAgY29uc3Qgc2VjcmV0c01hbmFnZXIgPSBuZXcgU2VjcmV0c01hbmFnZXIodGhpcywgJ1NlY3JldHNNYW5hZ2VyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGttc0tleVxuICAgIH0pO1xuXG4gICAgLy8gRGF0YWJhc2VcbiAgICBjb25zdCBkYXRhYmFzZSA9IG5ldyBEYXRhYmFzZSh0aGlzLCAnRGF0YWJhc2UnLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBtZXJnZWRDb25maWcsXG4gICAgICB2cGMsXG4gICAgICBrbXNLZXksXG4gICAgICBzZWN1cml0eUdyb3VwczogW2RiU2VjdXJpdHlHcm91cF1cbiAgICB9KTtcblxuICAgIC8vIFJlZGlzXG4gICAgY29uc3QgcmVkaXMgPSBuZXcgUmVkaXModGhpcywgJ1JlZGlzJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogbWVyZ2VkQ29uZmlnLFxuICAgICAgdnBjLFxuICAgICAga21zS2V5LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtyZWRpc1NlY3VyaXR5R3JvdXBdXG4gICAgfSk7XG5cbiAgICAvLyBFRlNcbiAgICBjb25zdCBlZnMgPSBuZXcgRWZzKHRoaXMsICdFRlMnLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgdnBjLFxuICAgICAga21zS2V5LFxuICAgICAgYWxsb3dBY2Nlc3NGcm9tOiBbZWNzU2VjdXJpdHlHcm91cF1cbiAgICB9KTtcblxuICAgIC8vIEF1dGhlbnRpayBMb2FkIEJhbGFuY2VyXG4gICAgY29uc3QgYXV0aGVudGlrRUxCID0gbmV3IEVsYih0aGlzLCAnQXV0aGVudGlrRUxCJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogbWVyZ2VkQ29uZmlnLFxuICAgICAgdnBjLFxuICAgICAgc3NsQ2VydGlmaWNhdGVBcm46IHNzbENlcnRpZmljYXRlQXJuXG4gICAgfSk7XG5cbiAgICAvLyBBdXRoZW50aWsgU2VydmVyXG4gICAgY29uc3QgYXV0aGVudGlrU2VydmVyID0gbmV3IEF1dGhlbnRpa1NlcnZlcih0aGlzLCAnQXV0aGVudGlrU2VydmVyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogbWVyZ2VkQ29uZmlnLFxuICAgICAgdnBjLFxuICAgICAgZWNzU2VjdXJpdHlHcm91cCxcbiAgICAgIGVjc0NsdXN0ZXIsXG4gICAgICBzM0NvbmZCdWNrZXQsXG4gICAgICBlbnZGaWxlUzNVcmk6IHMzRW52RmlsZU1hbmFnZXIuZW52RmlsZVMzVXJpLFxuICAgICAgZW52RmlsZVMzS2V5OiBzM0VudkZpbGVNYW5hZ2VyLmVudkZpbGVTM0tleSxcbiAgICAgIGFkbWluVXNlckVtYWlsOiBhdXRoZW50aWtBZG1pblVzZXJFbWFpbCxcbiAgICAgIGxkYXBCYXNlRG46IGF1dGhlbnRpa0xkYXBCYXNlRG4sXG4gICAgICB1c2VDb25maWdGaWxlOiB1c2VBdXRoZW50aWtDb25maWdGaWxlLFxuICAgICAgZWNyUmVwb3NpdG9yeUFybjogZWNyUmVwb3NpdG9yeSxcbiAgICAgIGdpdFNoYTogZ2l0U2hhLFxuICAgICAgZW5hYmxlRXhlY3V0ZTogZW5hYmxlRXhlY3V0ZSxcbiAgICAgIGRiU2VjcmV0OiBkYXRhYmFzZS5tYXN0ZXJTZWNyZXQsXG4gICAgICBkYkhvc3RuYW1lOiBkYXRhYmFzZS5ob3N0bmFtZSxcbiAgICAgIHJlZGlzQXV0aFRva2VuOiByZWRpcy5hdXRoVG9rZW4sXG4gICAgICByZWRpc0hvc3RuYW1lOiByZWRpcy5ob3N0bmFtZSxcbiAgICAgIHNlY3JldEtleTogc2VjcmV0c01hbmFnZXIuc2VjcmV0S2V5LFxuICAgICAgYWRtaW5Vc2VyUGFzc3dvcmQ6IHNlY3JldHNNYW5hZ2VyLmFkbWluVXNlclBhc3N3b3JkLFxuICAgICAgYWRtaW5Vc2VyVG9rZW46IHNlY3JldHNNYW5hZ2VyLmFkbWluVXNlclRva2VuLFxuICAgICAgbGRhcFRva2VuOiBzZWNyZXRzTWFuYWdlci5sZGFwVG9rZW4sXG4gICAgICBlZnNJZDogZWZzLmZpbGVTeXN0ZW0uZmlsZVN5c3RlbUlkLFxuICAgICAgZWZzTWVkaWFBY2Nlc3NQb2ludElkOiBlZnMubWVkaWFBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkLFxuICAgICAgZWZzQ3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnRJZDogZWZzLmN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWRcbiAgICB9KTtcblxuICAgIC8vIEVuc3VyZSBBdXRoZW50aWsgU2VydmVyIHdhaXRzIGZvciBFQ1IgaW1hZ2UgdmFsaWRhdGlvblxuICAgIGF1dGhlbnRpa1NlcnZlci5ub2RlLmFkZERlcGVuZGVuY3koZWNyVmFsaWRhdG9yKTtcblxuICAgIC8vIEF1dGhlbnRpayBXb3JrZXJcbiAgICBjb25zdCBhdXRoZW50aWtXb3JrZXIgPSBuZXcgQXV0aGVudGlrV29ya2VyKHRoaXMsICdBdXRoZW50aWtXb3JrZXInLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBtZXJnZWRDb25maWcsXG4gICAgICB2cGMsXG4gICAgICBlY3NTZWN1cml0eUdyb3VwLFxuICAgICAgZWNzQ2x1c3RlcixcbiAgICAgIHMzQ29uZkJ1Y2tldCxcbiAgICAgIGVudkZpbGVTM0tleTogczNFbnZGaWxlTWFuYWdlci5lbnZGaWxlUzNLZXksXG4gICAgICBlY3JSZXBvc2l0b3J5QXJuOiBlY3JSZXBvc2l0b3J5LFxuICAgICAgZ2l0U2hhOiBnaXRTaGEsXG4gICAgICBlbmFibGVFeGVjdXRlOiBlbmFibGVFeGVjdXRlLFxuICAgICAgZGJTZWNyZXQ6IGRhdGFiYXNlLm1hc3RlclNlY3JldCxcbiAgICAgIGRiSG9zdG5hbWU6IGRhdGFiYXNlLmhvc3RuYW1lLFxuICAgICAgcmVkaXNBdXRoVG9rZW46IHJlZGlzLmF1dGhUb2tlbixcbiAgICAgIHJlZGlzSG9zdG5hbWU6IHJlZGlzLmhvc3RuYW1lLFxuICAgICAgc2VjcmV0S2V5OiBzZWNyZXRzTWFuYWdlci5zZWNyZXRLZXksXG4gICAgICBlZnNJZDogZWZzLmZpbGVTeXN0ZW0uZmlsZVN5c3RlbUlkLFxuICAgICAgZWZzTWVkaWFBY2Nlc3NQb2ludElkOiBlZnMubWVkaWFBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkLFxuICAgICAgZWZzQ3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnRJZDogZWZzLmN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWRcbiAgICB9KTtcblxuICAgIC8vIEVuc3VyZSBBdXRoZW50aWsgV29ya2VyIHdhaXRzIGZvciBFQ1IgaW1hZ2UgdmFsaWRhdGlvblxuICAgIGF1dGhlbnRpa1dvcmtlci5ub2RlLmFkZERlcGVuZGVuY3koZWNyVmFsaWRhdG9yKTtcblxuICAgIC8vIENvbm5lY3QgQXV0aGVudGlrIFNlcnZlciB0byBMb2FkIEJhbGFuY2VyXG4gICAgYXV0aGVudGlrU2VydmVyLmNyZWF0ZVRhcmdldEdyb3VwKHZwYywgYXV0aGVudGlrRUxCLmh0dHBzTGlzdGVuZXIpO1xuXG4gICAgLy8gTERBUCBUb2tlbiBSZXRyaWV2ZXJcbiAgICBjb25zdCBsZGFwVG9rZW5SZXRyaWV2ZXIgPSBuZXcgTGRhcFRva2VuUmV0cmlldmVyKHRoaXMsICdMZGFwVG9rZW5SZXRyaWV2ZXInLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBtZXJnZWRDb25maWcsXG4gICAgICBrbXNLZXksXG4gICAgICBhdXRoZW50aWtIb3N0OiBgaHR0cHM6Ly8ke2F1dGhlbnRpa0VMQi5kbnNOYW1lfWAsXG4gICAgICBvdXRwb3N0TmFtZTogJ0xEQVAnLFxuICAgICAgYWRtaW5Ub2tlblNlY3JldDogc2VjcmV0c01hbmFnZXIuYWRtaW5Vc2VyVG9rZW4sXG4gICAgICBsZGFwVG9rZW5TZWNyZXQ6IHNlY3JldHNNYW5hZ2VyLmxkYXBUb2tlbixcbiAgICAgIGdpdFNoYTogZ2l0U2hhXG4gICAgfSk7XG5cbiAgICAvLyBMREFQXG4gICAgY29uc3QgbGRhcCA9IG5ldyBMZGFwKHRoaXMsICdMREFQJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogbWVyZ2VkQ29uZmlnLFxuICAgICAgdnBjLFxuICAgICAgZWNzU2VjdXJpdHlHcm91cCxcbiAgICAgIGVjc0NsdXN0ZXIsXG4gICAgICBzM0NvbmZCdWNrZXQsXG4gICAgICBzc2xDZXJ0aWZpY2F0ZUFybjogc3NsQ2VydGlmaWNhdGVBcm4sXG4gICAgICBhdXRoZW50aWtIb3N0OiBhdXRoZW50aWtFTEIuZG5zTmFtZSxcbiAgICAgIGVjclJlcG9zaXRvcnlBcm46IGVjclJlcG9zaXRvcnksXG4gICAgICBnaXRTaGE6IGdpdFNoYSxcbiAgICAgIGVuYWJsZUV4ZWN1dGU6IGVuYWJsZUV4ZWN1dGUsXG4gICAgICBsZGFwVG9rZW46IHNlY3JldHNNYW5hZ2VyLmxkYXBUb2tlblxuICAgIH0pO1xuXG4gICAgLy8gRW5zdXJlIExEQVAgd2FpdHMgZm9yIEVDUiBpbWFnZSB2YWxpZGF0aW9uXG4gICAgbGRhcC5ub2RlLmFkZERlcGVuZGVuY3koZWNyVmFsaWRhdG9yKTtcbiAgICAvLyBFbnN1cmUgTERBUCB3YWl0cyBmb3IgdGhlIHRva2VuIHRvIGJlIHJldHJpZXZlZFxuICAgIGxkYXAubm9kZS5hZGREZXBlbmRlbmN5KGxkYXBUb2tlblJldHJpZXZlcik7XG5cbiAgICAvLyBSb3V0ZTUzIEROUyBSZWNvcmRzXG4gICAgY29uc3Qgcm91dGU1MyA9IG5ldyBSb3V0ZTUzKHRoaXMsICdSb3V0ZTUzJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogbWVyZ2VkQ29uZmlnLFxuICAgICAgaG9zdGVkWm9uZUlkOiBob3N0ZWRab25lSWQsXG4gICAgICBob3N0ZWRab25lTmFtZTogaG9zdGVkWm9uZU5hbWUsXG4gICAgICBob3N0bmFtZUF1dGhlbnRpazogaG9zdG5hbWVBdXRoZW50aWssXG4gICAgICBob3N0bmFtZUxkYXA6IGhvc3RuYW1lTGRhcCxcbiAgICAgIGF1dGhlbnRpa0xvYWRCYWxhbmNlcjogYXV0aGVudGlrRUxCLmxvYWRCYWxhbmNlcixcbiAgICAgIGxkYXBMb2FkQmFsYW5jZXI6IGxkYXAubG9hZEJhbGFuY2VyXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgcmVnaXN0ZXJPdXRwdXRzKHtcbiAgICAgIHN0YWNrOiB0aGlzLFxuICAgICAgc3RhY2tOYW1lOiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBkYXRhYmFzZUVuZHBvaW50OiBkYXRhYmFzZS5ob3N0bmFtZSxcbiAgICAgIGRhdGFiYXNlU2VjcmV0QXJuOiBkYXRhYmFzZS5tYXN0ZXJTZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgcmVkaXNFbmRwb2ludDogcmVkaXMuaG9zdG5hbWUsXG4gICAgICByZWRpc0F1dGhUb2tlbkFybjogcmVkaXMuYXV0aFRva2VuLnNlY3JldEFybixcbiAgICAgIGVmc0lkOiBlZnMuZmlsZVN5c3RlbS5maWxlU3lzdGVtSWQsXG4gICAgICBlZnNNZWRpYUFjY2Vzc1BvaW50SWQ6IGVmcy5tZWRpYUFjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWQsXG4gICAgICBlZnNUZW1wbGF0ZXNBY2Nlc3NQb2ludElkOiBlZnMuY3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnQuYWNjZXNzUG9pbnRJZCxcbiAgICAgIGF1dGhlbnRpa1NlY3JldEtleUFybjogc2VjcmV0c01hbmFnZXIuc2VjcmV0S2V5LnNlY3JldEFybixcbiAgICAgIGF1dGhlbnRpa0FkbWluVG9rZW5Bcm46IHNlY3JldHNNYW5hZ2VyLmFkbWluVXNlclRva2VuLnNlY3JldEFybixcbiAgICAgIGF1dGhlbnRpa0xkYXBUb2tlbkFybjogc2VjcmV0c01hbmFnZXIubGRhcFRva2VuLnNlY3JldEFybixcbiAgICAgIGF1dGhlbnRpa0FsYkRuczogYXV0aGVudGlrRUxCLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lLFxuICAgICAgYXV0aGVudGlrVXJsOiBgaHR0cHM6Ly8ke2F1dGhlbnRpa0VMQi5kbnNOYW1lfWAsXG4gICAgICBsZGFwTmxiRG5zOiBsZGFwLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lLFxuICAgICAgbGRhcFRva2VuUmV0cmlldmVyTGFtYmRhQXJuOiBsZGFwVG9rZW5SZXRyaWV2ZXIubGFtYmRhRnVuY3Rpb24uZnVuY3Rpb25Bcm5cbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlRWNzU2VjdXJpdHlHcm91cCh2cGM6IGVjMi5JVnBjKTogZWMyLlNlY3VyaXR5R3JvdXAge1xuICAgIGNvbnN0IGVjc1NlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0VDU1NlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBFQ1MgdGFza3MnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogdHJ1ZVxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgSFRUUC9IVFRQUyB0cmFmZmljIHRvIEVDUyB0YXNrc1xuICAgIGVjc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5hbnlJcHY0KCksXG4gICAgICBlYzIuUG9ydC50Y3AoODApLFxuICAgICAgJ0FsbG93IEhUVFAgdHJhZmZpYydcbiAgICApO1xuXG4gICAgZWNzU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg0NDMpLFxuICAgICAgJ0FsbG93IEhUVFBTIHRyYWZmaWMnXG4gICAgKTtcblxuICAgIGVjc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5hbnlJcHY0KCksXG4gICAgICBlYzIuUG9ydC50Y3AoOTAwMCksXG4gICAgICAnQWxsb3cgQXV0aGVudGlrIHRyYWZmaWMnXG4gICAgKTtcblxuICAgIHJldHVybiBlY3NTZWN1cml0eUdyb3VwO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVEYlNlY3VyaXR5R3JvdXAodnBjOiBlYzIuSVZwYywgZWNzU2VjdXJpdHlHcm91cDogZWMyLlNlY3VyaXR5R3JvdXApOiBlYzIuU2VjdXJpdHlHcm91cCB7XG4gICAgY29uc3QgZGJTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdEQlNlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBkYXRhYmFzZScsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiBmYWxzZVxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgUG9zdGdyZVNRTCBhY2Nlc3MgZnJvbSBFQ1MgdGFza3NcbiAgICBkYlNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5zZWN1cml0eUdyb3VwSWQoZWNzU2VjdXJpdHlHcm91cC5zZWN1cml0eUdyb3VwSWQpLFxuICAgICAgZWMyLlBvcnQudGNwKDU0MzIpLFxuICAgICAgJ0FsbG93IFBvc3RncmVTUUwgYWNjZXNzIGZyb20gRUNTIHRhc2tzJ1xuICAgICk7XG5cbiAgICByZXR1cm4gZGJTZWN1cml0eUdyb3VwO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVSZWRpc1NlY3VyaXR5R3JvdXAodnBjOiBlYzIuSVZwYywgZWNzU2VjdXJpdHlHcm91cDogZWMyLlNlY3VyaXR5R3JvdXApOiBlYzIuU2VjdXJpdHlHcm91cCB7XG4gICAgY29uc3QgcmVkaXNTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdSZWRpc1NlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBSZWRpcycsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiBmYWxzZVxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgUmVkaXMgYWNjZXNzIGZyb20gRUNTIHRhc2tzXG4gICAgcmVkaXNTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuc2VjdXJpdHlHcm91cElkKGVjc1NlY3VyaXR5R3JvdXAuc2VjdXJpdHlHcm91cElkKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg2Mzc5KSxcbiAgICAgICdBbGxvdyBSZWRpcyBhY2Nlc3MgZnJvbSBFQ1MgdGFza3MnXG4gICAgKTtcblxuICAgIHJldHVybiByZWRpc1NlY3VyaXR5R3JvdXA7XG4gIH1cblxuICAvKipcbiAgICogR2V0IHRoZSBjdXJyZW50IGdpdCBTSEEgZm9yIHRhZ2dpbmcgcmVzb3VyY2VzXG4gICAqIEByZXR1cm5zIEN1cnJlbnQgZ2l0IFNIQVxuICAgKi9cbiAgcHJpdmF0ZSBnZXRHaXRTaGEoKTogc3RyaW5nIHtcbiAgICB0cnkge1xuICAgICAgLy8gR2V0IHRoZSBjdXJyZW50IGdpdCBTSEFcbiAgICAgIGNvbnN0IHsgZXhlY1N5bmMgfSA9IHJlcXVpcmUoJ2NoaWxkX3Byb2Nlc3MnKTtcbiAgICAgIHJldHVybiBleGVjU3luYygnZ2l0IHJldi1wYXJzZSAtLXNob3J0IEhFQUQnKS50b1N0cmluZygpLnRyaW0oKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS53YXJuKCdVbmFibGUgdG8gZ2V0IGdpdCBTSEEsIHVzaW5nIFwiZGV2ZWxvcG1lbnRcIicpO1xuICAgICAgcmV0dXJuICdkZXZlbG9wbWVudCc7XG4gICAgfVxuICB9XG59XG4iXX0=