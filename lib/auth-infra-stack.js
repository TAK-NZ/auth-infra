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
const aws_cdk_lib_1 = require("aws-cdk-lib");
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const ecs = __importStar(require("aws-cdk-lib/aws-ecs"));
const kms = __importStar(require("aws-cdk-lib/aws-kms"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
// Construct imports
const database_1 = require("./constructs/database");
const redis_1 = require("./constructs/redis");
const efs_1 = require("./constructs/efs");
const secrets_manager_1 = require("./constructs/secrets-manager");
const elb_1 = require("./constructs/elb");
const authentik_server_1 = require("./constructs/authentik-server");
const authentik_worker_1 = require("./constructs/authentik-worker");
const ldap_1 = require("./constructs/ldap");
const ldap_token_retriever_1 = require("./constructs/ldap-token-retriever");
const route53_1 = require("./constructs/route53");
const ecr_image_validator_1 = require("./constructs/ecr-image-validator");
// Utility imports
const outputs_1 = require("./outputs");
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
        // Get environment-specific defaults
        const envConfig = config.envType === 'prod' ?
            { enableHighAvailability: true, enableDetailedMonitoring: true } :
            { enableHighAvailability: false, enableDetailedMonitoring: false };
        const enableHighAvailability = envConfig.enableHighAvailability;
        const enableDetailedMonitoring = config.overrides?.general?.enableDetailedLogging ?? envConfig.enableDetailedMonitoring;
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
        const stackName = aws_cdk_lib_1.Fn.ref('AWS::StackName');
        const region = cdk.Stack.of(this).region;
        // Context-based parameter resolution (CDK context only)
        const gitSha = this.node.tryGetContext('gitSha') || this.getGitSha();
        const enableExecute = Boolean(this.node.tryGetContext('enableExecute') || false);
        const authentikAdminUserEmail = this.node.tryGetContext('authentikAdminUserEmail') || '';
        const authentikLdapBaseDn = this.node.tryGetContext('authentikLdapBaseDn') || 'DC=example,DC=com';
        const sslCertificateArn = this.node.tryGetContext('sslCertificateArn') || '';
        const useAuthentikConfigFile = Boolean(this.node.tryGetContext('useAuthentikConfigFile') || false);
        const useEnvironmentFile = Boolean(this.node.tryGetContext('useEnvironmentFile') || false);
        const hostnameAuthentik = this.node.tryGetContext('hostnameAuthentik') || 'account';
        const hostnameLdap = this.node.tryGetContext('hostnameLdap') || 'ldap';
        // Validate required parameters
        if (!authentikAdminUserEmail || authentikAdminUserEmail.trim() === '') {
            throw new Error('authentikAdminUserEmail is required. Set it via --context authentikAdminUserEmail=user@example.com');
        }
        // =================
        // IMPORT BASE INFRASTRUCTURE RESOURCES
        // =================
        // Import VPC and networking from base infrastructure
        // Note: Base infrastructure provides 2 subnets (A and B), so we limit to 2 AZs
        const vpcAvailabilityZones = this.availabilityZones.slice(0, 2);
        const vpc = ec2.Vpc.fromVpcAttributes(this, 'VPC', {
            vpcId: aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.VPC_ID)),
            availabilityZones: vpcAvailabilityZones,
            // Import subnet IDs from base infrastructure
            publicSubnetIds: [
                aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.SUBNET_PUBLIC_A)),
                aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.SUBNET_PUBLIC_B))
            ],
            privateSubnetIds: [
                aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.SUBNET_PRIVATE_A)),
                aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.SUBNET_PRIVATE_B))
            ],
            vpcCidrBlock: aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.VPC_CIDR_IPV4))
        });
        // KMS
        const kmsKey = kms.Key.fromKeyArn(this, 'KMSKey', aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.KMS_KEY)));
        // ECS
        const ecsClusterArn = aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.ECS_CLUSTER));
        const ecsCluster = ecs.Cluster.fromClusterAttributes(this, 'ECSCluster', {
            clusterArn: ecsClusterArn,
            clusterName: `TAK-${stackNameComponent}-EcsCluster`, // Standard cluster name from base infra
            vpc: vpc,
            securityGroups: []
        });
        // S3
        const s3ConfBucket = s3.Bucket.fromBucketArn(this, 'S3ConfBucket', aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.S3_BUCKET)));
        // ECR
        const ecrRepository = aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.ECR_REPO));
        // Route53
        const hostedZoneId = aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.HOSTED_ZONE_ID));
        const hostedZoneName = aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.HOSTED_ZONE_NAME));
        // S3 Environment File paths - assumes authentik-config.env already exists in S3
        const envFileS3Key = `${stackNameComponent}/authentik-config.env`;
        const envFileS3Uri = `arn:aws:s3:::${s3ConfBucket.bucketName}/${envFileS3Key}`;
        // =================
        // SECURITY GROUPS
        // =================
        // Security Groups
        const ecsSecurityGroup = this.createEcsSecurityGroup(vpc);
        const dbSecurityGroup = this.createDbSecurityGroup(vpc, ecsSecurityGroup);
        const redisSecurityGroup = this.createRedisSecurityGroup(vpc, ecsSecurityGroup);
        // =================
        // CORE INFRASTRUCTURE
        // =================
        // SecretsManager
        const secretsManager = new secrets_manager_1.SecretsManager(this, 'SecretsManager', {
            environment: stackNameComponent,
            stackName: resolvedStackName,
            kmsKey
        });
        // Database
        const database = new database_1.Database(this, 'Database', {
            environment: stackNameComponent,
            stackName: resolvedStackName,
            config: mergedConfig,
            vpc,
            kmsKey,
            securityGroups: [dbSecurityGroup]
        });
        // Redis
        const redis = new redis_1.Redis(this, 'Redis', {
            environment: stackNameComponent,
            stackName: resolvedStackName,
            config: mergedConfig,
            vpc,
            kmsKey,
            securityGroups: [redisSecurityGroup]
        });
        // EFS
        const efs = new efs_1.Efs(this, 'EFS', {
            environment: stackNameComponent,
            vpc,
            vpcCidrBlock: aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.VPC_CIDR_IPV4)),
            kmsKey,
            allowAccessFrom: [ecsSecurityGroup]
        });
        // =================
        // IMAGE VALIDATION
        // =================
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
        // =================
        // APPLICATION SERVICES
        // =================
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
            envFileS3Uri: envFileS3Uri,
            envFileS3Key: envFileS3Key,
            adminUserEmail: authentikAdminUserEmail,
            ldapBaseDn: authentikLdapBaseDn,
            useConfigFile: useAuthentikConfigFile,
            useEnvironmentFile: useEnvironmentFile,
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
            envFileS3Key: envFileS3Key,
            useEnvironmentFile: useEnvironmentFile,
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
        // =================
        // LDAP CONFIGURATION
        // =================
        // LDAP Token Retriever
        const ldapTokenRetriever = new ldap_token_retriever_1.LdapTokenRetriever(this, 'LdapTokenRetriever', {
            environment: stackNameComponent,
            config: mergedConfig,
            kmsKey,
            authentikHost: `https://${authentikELB.dnsName}`,
            outpostName: 'LDAP',
            adminTokenSecret: secretsManager.adminUserToken,
            ldapTokenSecret: secretsManager.ldapToken,
            gitSha: gitSha,
            authentikServerService: authentikServer.ecsService,
            authentikWorkerService: authentikWorker.ecsService
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
        // =================
        // DNS AND ROUTING
        // =================
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
        // =================
        // STACK OUTPUTS
        // =================
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
    // =================
    // HELPER METHODS
    // =================
    /**
     * Create security group for ECS tasks
     * @param vpc The VPC to create the security group in
     * @returns The created security group
     */
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
    /**
     * Create security group for database access
     * @param vpc The VPC to create the security group in
     * @param ecsSecurityGroup The ECS security group to allow access from
     * @returns The created security group
     */
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
    /**
     * Create security group for Redis access
     * @param vpc The VPC to create the security group in
     * @param ecsSecurityGroup The ECS security group to allow access from
     * @returns The created security group
     */
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
     * @returns Current git SHA or 'development' if unable to determine
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGgtaW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFFbkMsNkNBQXVFO0FBQ3ZFLHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLHVEQUF5QztBQUV6QyxvQkFBb0I7QUFDcEIsb0RBQWlEO0FBQ2pELDhDQUEyQztBQUMzQywwQ0FBdUM7QUFDdkMsa0VBQThEO0FBQzlELDBDQUF1QztBQUN2QyxvRUFBZ0U7QUFDaEUsb0VBQWdFO0FBQ2hFLDRDQUF5QztBQUN6Qyw0RUFBdUU7QUFDdkUsa0RBQStDO0FBQy9DLDBFQUFxRTtBQUVyRSxrQkFBa0I7QUFDbEIsdUNBQTRDO0FBQzVDLHFFQUFvRjtBQUNwRiw2REFBb0Y7QUFPcEY7O0dBRUc7QUFDSCxNQUFhLGNBQWUsU0FBUSxHQUFHLENBQUMsS0FBSztJQUMzQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTBCO1FBQ2xFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFO1lBQ2YsR0FBRyxLQUFLO1lBQ1IsV0FBVyxFQUFFLG9EQUFvRDtTQUNsRSxDQUFDLENBQUM7UUFFSCxNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsV0FBVyxDQUFDO1FBRWpDLCtCQUErQjtRQUMvQixNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDO1FBQy9CLE1BQU0sa0JBQWtCLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLHFEQUFxRDtRQUNsRyxNQUFNLGlCQUFpQixHQUFHLEVBQUUsQ0FBQztRQUU3QixvQ0FBb0M7UUFDcEMsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLE9BQU8sS0FBSyxNQUFNLENBQUMsQ0FBQztZQUMzQyxFQUFFLHNCQUFzQixFQUFFLElBQUksRUFBRSx3QkFBd0IsRUFBRSxJQUFJ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RUFDbEIsd0NBQXdDLENBQ3pDLENBQUM7UUFFRixPQUFPLGVBQWUsQ0FBQztJQUN6QixDQUFDO0lBRUQ7Ozs7O09BS0c7SUFDSyx3QkFBd0IsQ0FBQyxHQUFhLEVBQUUsZ0JBQW1DO1FBQ2pGLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxHQUFHLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUMzRSxHQUFHO1lBQ0gsV0FBVyxFQUFFLDBCQUEwQjtZQUN2QyxnQkFBZ0IsRUFBRSxLQUFLO1NBQ3hCLENBQUMsQ0FBQztRQUVILG9DQUFvQztRQUNwQyxrQkFBa0IsQ0FBQyxjQUFjLENBQy9CLEdBQUcsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLGdCQUFnQixDQUFDLGVBQWUsQ0FBQyxFQUMxRCxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFDbEIsbUNBQW1DLENBQ3BDLENBQUM7UUFFRixPQUFPLGtCQUFrQixDQUFDO0lBQzVCLENBQUM7SUFFRDs7O09BR0c7SUFDSyxTQUFTO1FBQ2YsSUFBSSxDQUFDO1lBQ0gsMEJBQTBCO1lBQzFCLE1BQU0sRUFBRSxRQUFRLEVBQUUsR0FBRyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDOUMsT0FBTyxRQUFRLENBQUMsNEJBQTRCLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNsRSxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE9BQU8sQ0FBQyxJQUFJLENBQUMsNENBQTRDLENBQUMsQ0FBQztZQUMzRCxPQUFPLGFBQWEsQ0FBQztRQUN2QixDQUFDO0lBQ0gsQ0FBQztDQUNGO0FBbGJELHdDQWtiQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7IFJlbW92YWxQb2xpY3ksIFN0YWNrUHJvcHMsIEZuLCBDZm5PdXRwdXQgfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBlYzIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjMic7XG5pbXBvcnQgKiBhcyBlY3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjcyc7XG5pbXBvcnQgKiBhcyBrbXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWttcyc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuXG4vLyBDb25zdHJ1Y3QgaW1wb3J0c1xuaW1wb3J0IHsgRGF0YWJhc2UgfSBmcm9tICcuL2NvbnN0cnVjdHMvZGF0YWJhc2UnO1xuaW1wb3J0IHsgUmVkaXMgfSBmcm9tICcuL2NvbnN0cnVjdHMvcmVkaXMnO1xuaW1wb3J0IHsgRWZzIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2Vmcyc7XG5pbXBvcnQgeyBTZWNyZXRzTWFuYWdlciB9IGZyb20gJy4vY29uc3RydWN0cy9zZWNyZXRzLW1hbmFnZXInO1xuaW1wb3J0IHsgRWxiIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2VsYic7XG5pbXBvcnQgeyBBdXRoZW50aWtTZXJ2ZXIgfSBmcm9tICcuL2NvbnN0cnVjdHMvYXV0aGVudGlrLXNlcnZlcic7XG5pbXBvcnQgeyBBdXRoZW50aWtXb3JrZXIgfSBmcm9tICcuL2NvbnN0cnVjdHMvYXV0aGVudGlrLXdvcmtlcic7XG5pbXBvcnQgeyBMZGFwIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2xkYXAnO1xuaW1wb3J0IHsgTGRhcFRva2VuUmV0cmlldmVyIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2xkYXAtdG9rZW4tcmV0cmlldmVyJztcbmltcG9ydCB7IFJvdXRlNTMgfSBmcm9tICcuL2NvbnN0cnVjdHMvcm91dGU1Myc7XG5pbXBvcnQgeyBFY3JJbWFnZVZhbGlkYXRvciB9IGZyb20gJy4vY29uc3RydWN0cy9lY3ItaW1hZ2UtdmFsaWRhdG9yJztcblxuLy8gVXRpbGl0eSBpbXBvcnRzXG5pbXBvcnQgeyByZWdpc3Rlck91dHB1dHMgfSBmcm9tICcuL291dHB1dHMnO1xuaW1wb3J0IHsgY3JlYXRlQmFzZUltcG9ydFZhbHVlLCBCQVNFX0VYUE9SVF9OQU1FUyB9IGZyb20gJy4vY2xvdWRmb3JtYXRpb24taW1wb3J0cyc7XG5pbXBvcnQgeyBnZXRFbnZpcm9ubWVudENvbmZpZywgbWVyZ2VFbnZpcm9ubWVudENvbmZpZyB9IGZyb20gJy4vZW52aXJvbm1lbnQtY29uZmlnJztcbmltcG9ydCB7IEF1dGhJbmZyYUNvbmZpZyB9IGZyb20gJy4vc3RhY2stY29uZmlnJztcblxuZXhwb3J0IGludGVyZmFjZSBBdXRoSW5mcmFTdGFja1Byb3BzIGV4dGVuZHMgU3RhY2tQcm9wcyB7XG4gIHN0YWNrQ29uZmlnOiBBdXRoSW5mcmFDb25maWc7XG59XG5cbi8qKlxuICogTWFpbiBDREsgc3RhY2sgZm9yIHRoZSBUQUsgQXV0aCBJbmZyYXN0cnVjdHVyZVxuICovXG5leHBvcnQgY2xhc3MgQXV0aEluZnJhU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQXV0aEluZnJhU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwge1xuICAgICAgLi4ucHJvcHMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1RBSyBBdXRoZW50aWNhdGlvbiBMYXllciAtIEF1dGhlbnRpaywgTERBUCBPdXRwb3N0JyxcbiAgICB9KTtcblxuICAgIGNvbnN0IGNvbmZpZyA9IHByb3BzLnN0YWNrQ29uZmlnO1xuICAgIFxuICAgIC8vIEV4dHJhY3QgY29uZmlndXJhdGlvbiB2YWx1ZXNcbiAgICBjb25zdCBlbnZUeXBlID0gY29uZmlnLmVudlR5cGU7XG4gICAgY29uc3Qgc3RhY2tOYW1lQ29tcG9uZW50ID0gY29uZmlnLnN0YWNrTmFtZTsgLy8gVGhpcyBpcyB0aGUgU1RBQ0tfTkFNRSBwYXJ0IChlLmcuLCBcIk15Rmlyc3RTdGFja1wiKVxuICAgIGNvbnN0IHJlc29sdmVkU3RhY2tOYW1lID0gaWQ7XG4gICAgXG4gICAgLy8gR2V0IGVudmlyb25tZW50LXNwZWNpZmljIGRlZmF1bHRzXG4gICAgY29uc3QgZW52Q29uZmlnID0gY29uZmlnLmVudlR5cGUgPT09ICdwcm9kJyA/IFxuICAgICAgeyBlbmFibGVIaWdoQXZhaWxhYmlsaXR5OiB0cnVlLCBlbmFibGVEZXRhaWxlZE1vbml0b3Jpbmc6IHRydWUgfSA6XG4gICAgICB7IGVuYWJsZUhpZ2hBdmFpbGFiaWxpdHk6IGZhbHNlLCBlbmFibGVEZXRhaWxlZE1vbml0b3Jpbmc6IGZhbHNlIH07XG4gICAgXG4gICAgY29uc3QgZW5hYmxlSGlnaEF2YWlsYWJpbGl0eSA9IGVudkNvbmZpZy5lbmFibGVIaWdoQXZhaWxhYmlsaXR5O1xuICAgIGNvbnN0IGVuYWJsZURldGFpbGVkTW9uaXRvcmluZyA9IGNvbmZpZy5vdmVycmlkZXM/LmdlbmVyYWw/LmVuYWJsZURldGFpbGVkTG9nZ2luZyA/PyBlbnZDb25maWcuZW5hYmxlRGV0YWlsZWRNb25pdG9yaW5nO1xuICAgIFxuICAgIC8vIEdldCBiYXNlIGNvbmZpZ3VyYXRpb24gYW5kIG1lcmdlIHdpdGggb3ZlcnJpZGVzXG4gICAgY29uc3QgYmFzZUNvbmZpZyA9IGdldEVudmlyb25tZW50Q29uZmlnKGVudlR5cGUpO1xuICAgIGNvbnN0IG1lcmdlZENvbmZpZyA9IGNvbmZpZy5vdmVycmlkZXMgPyBcbiAgICAgIG1lcmdlRW52aXJvbm1lbnRDb25maWcoYmFzZUNvbmZpZywgY29uZmlnLm92ZXJyaWRlcykgOiBcbiAgICAgIGJhc2VDb25maWc7XG4gICAgXG4gICAgLy8gU2V0IGNvbnRhaW5lciBjb3VudHMgYmFzZWQgb24gaGlnaCBhdmFpbGFiaWxpdHkgc2V0dGluZ1xuICAgIC8vIGVuYWJsZUhpZ2hBdmFpbGFiaWxpdHk9dHJ1ZTogMiBjb250YWluZXJzIChTZXJ2ZXIsIFdvcmtlciwgTERBUClcbiAgICAvLyBlbmFibGVIaWdoQXZhaWxhYmlsaXR5PWZhbHNlOiAxIGNvbnRhaW5lciBlYWNoXG4gICAgY29uc3QgZGVzaXJlZENvbnRhaW5lckNvdW50ID0gZW5hYmxlSGlnaEF2YWlsYWJpbGl0eSA/IDIgOiAxO1xuICAgIFxuICAgIC8vIE92ZXJyaWRlIGNvbnRhaW5lciBjb3VudHMgaW4gbWVyZ2VkIGNvbmZpZyB1bmxlc3MgZXhwbGljaXRseSBzZXQgdmlhIGNvbnRleHRcbiAgICBpZiAoIWNvbmZpZy5vdmVycmlkZXM/LmVjcz8uZGVzaXJlZENvdW50KSB7XG4gICAgICBtZXJnZWRDb25maWcuZWNzLmRlc2lyZWRDb3VudCA9IGRlc2lyZWRDb250YWluZXJDb3VudDtcbiAgICB9XG4gICAgaWYgKCFjb25maWcub3ZlcnJpZGVzPy5lY3M/LndvcmtlckRlc2lyZWRDb3VudCkge1xuICAgICAgbWVyZ2VkQ29uZmlnLmVjcy53b3JrZXJEZXNpcmVkQ291bnQgPSBkZXNpcmVkQ29udGFpbmVyQ291bnQ7XG4gICAgfVxuXG4gICAgLy8gQWRkIEVudmlyb25tZW50IFR5cGUgdGFnIHRvIHRoZSBzdGFja1xuICAgIGNvbnN0IGVudmlyb25tZW50TGFiZWwgPSBlbnZUeXBlID09PSAncHJvZCcgPyAnUHJvZCcgOiAnRGV2LVRlc3QnO1xuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnRW52aXJvbm1lbnQgVHlwZScsIGVudmlyb25tZW50TGFiZWwpO1xuXG4gICAgY29uc3Qgc3RhY2tOYW1lID0gRm4ucmVmKCdBV1M6OlN0YWNrTmFtZScpO1xuICAgIGNvbnN0IHJlZ2lvbiA9IGNkay5TdGFjay5vZih0aGlzKS5yZWdpb247XG5cbiAgICAvLyBDb250ZXh0LWJhc2VkIHBhcmFtZXRlciByZXNvbHV0aW9uIChDREsgY29udGV4dCBvbmx5KVxuICAgIGNvbnN0IGdpdFNoYSA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdnaXRTaGEnKSB8fCB0aGlzLmdldEdpdFNoYSgpO1xuICAgIGNvbnN0IGVuYWJsZUV4ZWN1dGUgPSBCb29sZWFuKHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdlbmFibGVFeGVjdXRlJykgfHwgZmFsc2UpO1xuICAgIGNvbnN0IGF1dGhlbnRpa0FkbWluVXNlckVtYWlsID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2F1dGhlbnRpa0FkbWluVXNlckVtYWlsJykgfHwgJyc7XG4gICAgY29uc3QgYXV0aGVudGlrTGRhcEJhc2VEbiA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdhdXRoZW50aWtMZGFwQmFzZURuJykgfHwgJ0RDPWV4YW1wbGUsREM9Y29tJztcbiAgICBjb25zdCBzc2xDZXJ0aWZpY2F0ZUFybiA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdzc2xDZXJ0aWZpY2F0ZUFybicpIHx8ICcnO1xuICAgIGNvbnN0IHVzZUF1dGhlbnRpa0NvbmZpZ0ZpbGUgPSBCb29sZWFuKHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCd1c2VBdXRoZW50aWtDb25maWdGaWxlJykgfHwgZmFsc2UpO1xuICAgIGNvbnN0IHVzZUVudmlyb25tZW50RmlsZSA9IEJvb2xlYW4odGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ3VzZUVudmlyb25tZW50RmlsZScpIHx8IGZhbHNlKTtcbiAgICBjb25zdCBob3N0bmFtZUF1dGhlbnRpayA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdob3N0bmFtZUF1dGhlbnRpaycpIHx8ICdhY2NvdW50JztcbiAgICBjb25zdCBob3N0bmFtZUxkYXAgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnaG9zdG5hbWVMZGFwJykgfHwgJ2xkYXAnO1xuXG4gICAgLy8gVmFsaWRhdGUgcmVxdWlyZWQgcGFyYW1ldGVyc1xuICAgIGlmICghYXV0aGVudGlrQWRtaW5Vc2VyRW1haWwgfHwgYXV0aGVudGlrQWRtaW5Vc2VyRW1haWwudHJpbSgpID09PSAnJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdhdXRoZW50aWtBZG1pblVzZXJFbWFpbCBpcyByZXF1aXJlZC4gU2V0IGl0IHZpYSAtLWNvbnRleHQgYXV0aGVudGlrQWRtaW5Vc2VyRW1haWw9dXNlckBleGFtcGxlLmNvbScpO1xuICAgIH1cblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gSU1QT1JUIEJBU0UgSU5GUkFTVFJVQ1RVUkUgUkVTT1VSQ0VTXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIEltcG9ydCBWUEMgYW5kIG5ldHdvcmtpbmcgZnJvbSBiYXNlIGluZnJhc3RydWN0dXJlXG4gICAgLy8gTm90ZTogQmFzZSBpbmZyYXN0cnVjdHVyZSBwcm92aWRlcyAyIHN1Ym5ldHMgKEEgYW5kIEIpLCBzbyB3ZSBsaW1pdCB0byAyIEFac1xuICAgIGNvbnN0IHZwY0F2YWlsYWJpbGl0eVpvbmVzID0gdGhpcy5hdmFpbGFiaWxpdHlab25lcy5zbGljZSgwLCAyKTtcbiAgICBcbiAgICBjb25zdCB2cGMgPSBlYzIuVnBjLmZyb21WcGNBdHRyaWJ1dGVzKHRoaXMsICdWUEMnLCB7XG4gICAgICB2cGNJZDogRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuVlBDX0lEKSksXG4gICAgICBhdmFpbGFiaWxpdHlab25lczogdnBjQXZhaWxhYmlsaXR5Wm9uZXMsXG4gICAgICAvLyBJbXBvcnQgc3VibmV0IElEcyBmcm9tIGJhc2UgaW5mcmFzdHJ1Y3R1cmVcbiAgICAgIHB1YmxpY1N1Ym5ldElkczogW1xuICAgICAgICBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5TVUJORVRfUFVCTElDX0EpKSxcbiAgICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuU1VCTkVUX1BVQkxJQ19CKSlcbiAgICAgIF0sXG4gICAgICBwcml2YXRlU3VibmV0SWRzOiBbXG4gICAgICAgIEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlNVQk5FVF9QUklWQVRFX0EpKSxcbiAgICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuU1VCTkVUX1BSSVZBVEVfQikpXG4gICAgICBdLFxuICAgICAgdnBjQ2lkckJsb2NrOiBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5WUENfQ0lEUl9JUFY0KSlcbiAgICB9KTtcblxuICAgIC8vIEtNU1xuICAgIGNvbnN0IGttc0tleSA9IGttcy5LZXkuZnJvbUtleUFybih0aGlzLCAnS01TS2V5JywgXG4gICAgICBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5LTVNfS0VZKSlcbiAgICApO1xuXG4gICAgLy8gRUNTXG4gICAgY29uc3QgZWNzQ2x1c3RlckFybiA9IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLkVDU19DTFVTVEVSKSk7XG4gICAgY29uc3QgZWNzQ2x1c3RlciA9IGVjcy5DbHVzdGVyLmZyb21DbHVzdGVyQXR0cmlidXRlcyh0aGlzLCAnRUNTQ2x1c3RlcicsIHtcbiAgICAgIGNsdXN0ZXJBcm46IGVjc0NsdXN0ZXJBcm4sXG4gICAgICBjbHVzdGVyTmFtZTogYFRBSy0ke3N0YWNrTmFtZUNvbXBvbmVudH0tRWNzQ2x1c3RlcmAsIC8vIFN0YW5kYXJkIGNsdXN0ZXIgbmFtZSBmcm9tIGJhc2UgaW5mcmFcbiAgICAgIHZwYzogdnBjLFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtdXG4gICAgfSk7XG5cbiAgICAvLyBTM1xuICAgIGNvbnN0IHMzQ29uZkJ1Y2tldCA9IHMzLkJ1Y2tldC5mcm9tQnVja2V0QXJuKHRoaXMsICdTM0NvbmZCdWNrZXQnLFxuICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuUzNfQlVDS0VUKSlcbiAgICApO1xuXG4gICAgLy8gRUNSXG4gICAgY29uc3QgZWNyUmVwb3NpdG9yeSA9IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLkVDUl9SRVBPKSk7XG5cbiAgICAvLyBSb3V0ZTUzXG4gICAgY29uc3QgaG9zdGVkWm9uZUlkID0gRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuSE9TVEVEX1pPTkVfSUQpKTtcbiAgICBjb25zdCBob3N0ZWRab25lTmFtZSA9IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLkhPU1RFRF9aT05FX05BTUUpKTtcblxuICAgIC8vIFMzIEVudmlyb25tZW50IEZpbGUgcGF0aHMgLSBhc3N1bWVzIGF1dGhlbnRpay1jb25maWcuZW52IGFscmVhZHkgZXhpc3RzIGluIFMzXG4gICAgY29uc3QgZW52RmlsZVMzS2V5ID0gYCR7c3RhY2tOYW1lQ29tcG9uZW50fS9hdXRoZW50aWstY29uZmlnLmVudmA7XG4gICAgY29uc3QgZW52RmlsZVMzVXJpID0gYGFybjphd3M6czM6Ojoke3MzQ29uZkJ1Y2tldC5idWNrZXROYW1lfS8ke2VudkZpbGVTM0tleX1gO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBTRUNVUklUWSBHUk9VUFNcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gU2VjdXJpdHkgR3JvdXBzXG4gICAgY29uc3QgZWNzU2VjdXJpdHlHcm91cCA9IHRoaXMuY3JlYXRlRWNzU2VjdXJpdHlHcm91cCh2cGMpO1xuICAgIGNvbnN0IGRiU2VjdXJpdHlHcm91cCA9IHRoaXMuY3JlYXRlRGJTZWN1cml0eUdyb3VwKHZwYywgZWNzU2VjdXJpdHlHcm91cCk7XG4gICAgY29uc3QgcmVkaXNTZWN1cml0eUdyb3VwID0gdGhpcy5jcmVhdGVSZWRpc1NlY3VyaXR5R3JvdXAodnBjLCBlY3NTZWN1cml0eUdyb3VwKTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gQ09SRSBJTkZSQVNUUlVDVFVSRVxuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBTZWNyZXRzTWFuYWdlclxuICAgIGNvbnN0IHNlY3JldHNNYW5hZ2VyID0gbmV3IFNlY3JldHNNYW5hZ2VyKHRoaXMsICdTZWNyZXRzTWFuYWdlcicsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBzdGFja05hbWU6IHJlc29sdmVkU3RhY2tOYW1lLFxuICAgICAga21zS2V5XG4gICAgfSk7XG5cbiAgICAvLyBEYXRhYmFzZVxuICAgIGNvbnN0IGRhdGFiYXNlID0gbmV3IERhdGFiYXNlKHRoaXMsICdEYXRhYmFzZScsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBzdGFja05hbWU6IHJlc29sdmVkU3RhY2tOYW1lLFxuICAgICAgY29uZmlnOiBtZXJnZWRDb25maWcsXG4gICAgICB2cGMsXG4gICAgICBrbXNLZXksXG4gICAgICBzZWN1cml0eUdyb3VwczogW2RiU2VjdXJpdHlHcm91cF1cbiAgICB9KTtcblxuICAgIC8vIFJlZGlzXG4gICAgY29uc3QgcmVkaXMgPSBuZXcgUmVkaXModGhpcywgJ1JlZGlzJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIHN0YWNrTmFtZTogcmVzb2x2ZWRTdGFja05hbWUsXG4gICAgICBjb25maWc6IG1lcmdlZENvbmZpZyxcbiAgICAgIHZwYyxcbiAgICAgIGttc0tleSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbcmVkaXNTZWN1cml0eUdyb3VwXVxuICAgIH0pO1xuXG4gICAgLy8gRUZTXG4gICAgY29uc3QgZWZzID0gbmV3IEVmcyh0aGlzLCAnRUZTJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIHZwYyxcbiAgICAgIHZwY0NpZHJCbG9jazogRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuVlBDX0NJRFJfSVBWNCkpLFxuICAgICAga21zS2V5LFxuICAgICAgYWxsb3dBY2Nlc3NGcm9tOiBbZWNzU2VjdXJpdHlHcm91cF1cbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gSU1BR0UgVkFMSURBVElPTlxuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBWYWxpZGF0ZSByZXF1aXJlZCBFQ1IgaW1hZ2VzIGV4aXN0IGJlZm9yZSBkZXBsb3ltZW50XG4gICAgY29uc3QgcmVxdWlyZWRJbWFnZVRhZ3MgPSBbXG4gICAgICBgYXV0aC1pbmZyYS1zZXJ2ZXItJHtnaXRTaGF9YCxcbiAgICAgIGBhdXRoLWluZnJhLWxkYXAtJHtnaXRTaGF9YFxuICAgIF07XG4gICAgXG4gICAgY29uc3QgZWNyVmFsaWRhdG9yID0gbmV3IEVjckltYWdlVmFsaWRhdG9yKHRoaXMsICdFY3JJbWFnZVZhbGlkYXRvcicsIHtcbiAgICAgIGVjclJlcG9zaXRvcnlBcm46IGVjclJlcG9zaXRvcnksXG4gICAgICByZXF1aXJlZEltYWdlVGFnczogcmVxdWlyZWRJbWFnZVRhZ3MsXG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50XG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIEFQUExJQ0FUSU9OIFNFUlZJQ0VTXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIEF1dGhlbnRpayBMb2FkIEJhbGFuY2VyXG4gICAgY29uc3QgYXV0aGVudGlrRUxCID0gbmV3IEVsYih0aGlzLCAnQXV0aGVudGlrRUxCJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogbWVyZ2VkQ29uZmlnLFxuICAgICAgdnBjLFxuICAgICAgc3NsQ2VydGlmaWNhdGVBcm46IHNzbENlcnRpZmljYXRlQXJuXG4gICAgfSk7XG5cbiAgICAvLyBBdXRoZW50aWsgU2VydmVyXG4gICAgY29uc3QgYXV0aGVudGlrU2VydmVyID0gbmV3IEF1dGhlbnRpa1NlcnZlcih0aGlzLCAnQXV0aGVudGlrU2VydmVyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogbWVyZ2VkQ29uZmlnLFxuICAgICAgdnBjLFxuICAgICAgZWNzU2VjdXJpdHlHcm91cCxcbiAgICAgIGVjc0NsdXN0ZXIsXG4gICAgICBzM0NvbmZCdWNrZXQsXG4gICAgICBlbnZGaWxlUzNVcmk6IGVudkZpbGVTM1VyaSxcbiAgICAgIGVudkZpbGVTM0tleTogZW52RmlsZVMzS2V5LFxuICAgICAgYWRtaW5Vc2VyRW1haWw6IGF1dGhlbnRpa0FkbWluVXNlckVtYWlsLFxuICAgICAgbGRhcEJhc2VEbjogYXV0aGVudGlrTGRhcEJhc2VEbixcbiAgICAgIHVzZUNvbmZpZ0ZpbGU6IHVzZUF1dGhlbnRpa0NvbmZpZ0ZpbGUsXG4gICAgICB1c2VFbnZpcm9ubWVudEZpbGU6IHVzZUVudmlyb25tZW50RmlsZSxcbiAgICAgIGVjclJlcG9zaXRvcnlBcm46IGVjclJlcG9zaXRvcnksXG4gICAgICBnaXRTaGE6IGdpdFNoYSxcbiAgICAgIGVuYWJsZUV4ZWN1dGU6IGVuYWJsZUV4ZWN1dGUsXG4gICAgICBkYlNlY3JldDogZGF0YWJhc2UubWFzdGVyU2VjcmV0LFxuICAgICAgZGJIb3N0bmFtZTogZGF0YWJhc2UuaG9zdG5hbWUsXG4gICAgICByZWRpc0F1dGhUb2tlbjogcmVkaXMuYXV0aFRva2VuLFxuICAgICAgcmVkaXNIb3N0bmFtZTogcmVkaXMuaG9zdG5hbWUsXG4gICAgICBzZWNyZXRLZXk6IHNlY3JldHNNYW5hZ2VyLnNlY3JldEtleSxcbiAgICAgIGFkbWluVXNlclBhc3N3b3JkOiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJQYXNzd29yZCxcbiAgICAgIGFkbWluVXNlclRva2VuOiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJUb2tlbixcbiAgICAgIGxkYXBUb2tlbjogc2VjcmV0c01hbmFnZXIubGRhcFRva2VuLFxuICAgICAgZWZzSWQ6IGVmcy5maWxlU3lzdGVtLmZpbGVTeXN0ZW1JZCxcbiAgICAgIGVmc01lZGlhQWNjZXNzUG9pbnRJZDogZWZzLm1lZGlhQWNjZXNzUG9pbnQuYWNjZXNzUG9pbnRJZCxcbiAgICAgIGVmc0N1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50SWQ6IGVmcy5jdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkXG4gICAgfSk7XG5cbiAgICAvLyBFbnN1cmUgQXV0aGVudGlrIFNlcnZlciB3YWl0cyBmb3IgRUNSIGltYWdlIHZhbGlkYXRpb25cbiAgICBhdXRoZW50aWtTZXJ2ZXIubm9kZS5hZGREZXBlbmRlbmN5KGVjclZhbGlkYXRvcik7XG5cbiAgICAvLyBBdXRoZW50aWsgV29ya2VyXG4gICAgY29uc3QgYXV0aGVudGlrV29ya2VyID0gbmV3IEF1dGhlbnRpa1dvcmtlcih0aGlzLCAnQXV0aGVudGlrV29ya2VyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogbWVyZ2VkQ29uZmlnLFxuICAgICAgdnBjLFxuICAgICAgZWNzU2VjdXJpdHlHcm91cCxcbiAgICAgIGVjc0NsdXN0ZXIsXG4gICAgICBzM0NvbmZCdWNrZXQsXG4gICAgICBlbnZGaWxlUzNLZXk6IGVudkZpbGVTM0tleSxcbiAgICAgIHVzZUVudmlyb25tZW50RmlsZTogdXNlRW52aXJvbm1lbnRGaWxlLFxuICAgICAgZWNyUmVwb3NpdG9yeUFybjogZWNyUmVwb3NpdG9yeSxcbiAgICAgIGdpdFNoYTogZ2l0U2hhLFxuICAgICAgZW5hYmxlRXhlY3V0ZTogZW5hYmxlRXhlY3V0ZSxcbiAgICAgIGRiU2VjcmV0OiBkYXRhYmFzZS5tYXN0ZXJTZWNyZXQsXG4gICAgICBkYkhvc3RuYW1lOiBkYXRhYmFzZS5ob3N0bmFtZSxcbiAgICAgIHJlZGlzQXV0aFRva2VuOiByZWRpcy5hdXRoVG9rZW4sXG4gICAgICByZWRpc0hvc3RuYW1lOiByZWRpcy5ob3N0bmFtZSxcbiAgICAgIHNlY3JldEtleTogc2VjcmV0c01hbmFnZXIuc2VjcmV0S2V5LFxuICAgICAgZWZzSWQ6IGVmcy5maWxlU3lzdGVtLmZpbGVTeXN0ZW1JZCxcbiAgICAgIGVmc01lZGlhQWNjZXNzUG9pbnRJZDogZWZzLm1lZGlhQWNjZXNzUG9pbnQuYWNjZXNzUG9pbnRJZCxcbiAgICAgIGVmc0N1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50SWQ6IGVmcy5jdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkXG4gICAgfSk7XG5cbiAgICAvLyBFbnN1cmUgQXV0aGVudGlrIFdvcmtlciB3YWl0cyBmb3IgRUNSIGltYWdlIHZhbGlkYXRpb25cbiAgICBhdXRoZW50aWtXb3JrZXIubm9kZS5hZGREZXBlbmRlbmN5KGVjclZhbGlkYXRvcik7XG5cbiAgICAvLyBDb25uZWN0IEF1dGhlbnRpayBTZXJ2ZXIgdG8gTG9hZCBCYWxhbmNlclxuICAgIGF1dGhlbnRpa1NlcnZlci5jcmVhdGVUYXJnZXRHcm91cCh2cGMsIGF1dGhlbnRpa0VMQi5odHRwc0xpc3RlbmVyKTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gTERBUCBDT05GSUdVUkFUSU9OXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIExEQVAgVG9rZW4gUmV0cmlldmVyXG4gICAgY29uc3QgbGRhcFRva2VuUmV0cmlldmVyID0gbmV3IExkYXBUb2tlblJldHJpZXZlcih0aGlzLCAnTGRhcFRva2VuUmV0cmlldmVyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogbWVyZ2VkQ29uZmlnLFxuICAgICAga21zS2V5LFxuICAgICAgYXV0aGVudGlrSG9zdDogYGh0dHBzOi8vJHthdXRoZW50aWtFTEIuZG5zTmFtZX1gLFxuICAgICAgb3V0cG9zdE5hbWU6ICdMREFQJyxcbiAgICAgIGFkbWluVG9rZW5TZWNyZXQ6IHNlY3JldHNNYW5hZ2VyLmFkbWluVXNlclRva2VuLFxuICAgICAgbGRhcFRva2VuU2VjcmV0OiBzZWNyZXRzTWFuYWdlci5sZGFwVG9rZW4sXG4gICAgICBnaXRTaGE6IGdpdFNoYSxcbiAgICAgIGF1dGhlbnRpa1NlcnZlclNlcnZpY2U6IGF1dGhlbnRpa1NlcnZlci5lY3NTZXJ2aWNlLFxuICAgICAgYXV0aGVudGlrV29ya2VyU2VydmljZTogYXV0aGVudGlrV29ya2VyLmVjc1NlcnZpY2VcbiAgICB9KTtcblxuICAgIC8vIExEQVBcbiAgICBjb25zdCBsZGFwID0gbmV3IExkYXAodGhpcywgJ0xEQVAnLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBtZXJnZWRDb25maWcsXG4gICAgICB2cGMsXG4gICAgICBlY3NTZWN1cml0eUdyb3VwLFxuICAgICAgZWNzQ2x1c3RlcixcbiAgICAgIHMzQ29uZkJ1Y2tldCxcbiAgICAgIHNzbENlcnRpZmljYXRlQXJuOiBzc2xDZXJ0aWZpY2F0ZUFybixcbiAgICAgIGF1dGhlbnRpa0hvc3Q6IGF1dGhlbnRpa0VMQi5kbnNOYW1lLFxuICAgICAgZWNyUmVwb3NpdG9yeUFybjogZWNyUmVwb3NpdG9yeSxcbiAgICAgIGdpdFNoYTogZ2l0U2hhLFxuICAgICAgZW5hYmxlRXhlY3V0ZTogZW5hYmxlRXhlY3V0ZSxcbiAgICAgIGxkYXBUb2tlbjogc2VjcmV0c01hbmFnZXIubGRhcFRva2VuXG4gICAgfSk7XG5cbiAgICAvLyBFbnN1cmUgTERBUCB3YWl0cyBmb3IgRUNSIGltYWdlIHZhbGlkYXRpb25cbiAgICBsZGFwLm5vZGUuYWRkRGVwZW5kZW5jeShlY3JWYWxpZGF0b3IpO1xuICAgIC8vIEVuc3VyZSBMREFQIHdhaXRzIGZvciB0aGUgdG9rZW4gdG8gYmUgcmV0cmlldmVkXG4gICAgbGRhcC5ub2RlLmFkZERlcGVuZGVuY3kobGRhcFRva2VuUmV0cmlldmVyKTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gRE5TIEFORCBST1VUSU5HXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIFJvdXRlNTMgRE5TIFJlY29yZHNcbiAgICBjb25zdCByb3V0ZTUzID0gbmV3IFJvdXRlNTModGhpcywgJ1JvdXRlNTMnLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBtZXJnZWRDb25maWcsXG4gICAgICBob3N0ZWRab25lSWQ6IGhvc3RlZFpvbmVJZCxcbiAgICAgIGhvc3RlZFpvbmVOYW1lOiBob3N0ZWRab25lTmFtZSxcbiAgICAgIGhvc3RuYW1lQXV0aGVudGlrOiBob3N0bmFtZUF1dGhlbnRpayxcbiAgICAgIGhvc3RuYW1lTGRhcDogaG9zdG5hbWVMZGFwLFxuICAgICAgYXV0aGVudGlrTG9hZEJhbGFuY2VyOiBhdXRoZW50aWtFTEIubG9hZEJhbGFuY2VyLFxuICAgICAgbGRhcExvYWRCYWxhbmNlcjogbGRhcC5sb2FkQmFsYW5jZXJcbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gU1RBQ0sgT1VUUFVUU1xuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgcmVnaXN0ZXJPdXRwdXRzKHtcbiAgICAgIHN0YWNrOiB0aGlzLFxuICAgICAgc3RhY2tOYW1lOiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBkYXRhYmFzZUVuZHBvaW50OiBkYXRhYmFzZS5ob3N0bmFtZSxcbiAgICAgIGRhdGFiYXNlU2VjcmV0QXJuOiBkYXRhYmFzZS5tYXN0ZXJTZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgcmVkaXNFbmRwb2ludDogcmVkaXMuaG9zdG5hbWUsXG4gICAgICByZWRpc0F1dGhUb2tlbkFybjogcmVkaXMuYXV0aFRva2VuLnNlY3JldEFybixcbiAgICAgIGVmc0lkOiBlZnMuZmlsZVN5c3RlbS5maWxlU3lzdGVtSWQsXG4gICAgICBlZnNNZWRpYUFjY2Vzc1BvaW50SWQ6IGVmcy5tZWRpYUFjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWQsXG4gICAgICBlZnNUZW1wbGF0ZXNBY2Nlc3NQb2ludElkOiBlZnMuY3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnQuYWNjZXNzUG9pbnRJZCxcbiAgICAgIGF1dGhlbnRpa1NlY3JldEtleUFybjogc2VjcmV0c01hbmFnZXIuc2VjcmV0S2V5LnNlY3JldEFybixcbiAgICAgIGF1dGhlbnRpa0FkbWluVG9rZW5Bcm46IHNlY3JldHNNYW5hZ2VyLmFkbWluVXNlclRva2VuLnNlY3JldEFybixcbiAgICAgIGF1dGhlbnRpa0xkYXBUb2tlbkFybjogc2VjcmV0c01hbmFnZXIubGRhcFRva2VuLnNlY3JldEFybixcbiAgICAgIGF1dGhlbnRpa0FsYkRuczogYXV0aGVudGlrRUxCLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lLFxuICAgICAgYXV0aGVudGlrVXJsOiBgaHR0cHM6Ly8ke2F1dGhlbnRpa0VMQi5kbnNOYW1lfWAsXG4gICAgICBsZGFwTmxiRG5zOiBsZGFwLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lLFxuICAgICAgbGRhcFRva2VuUmV0cmlldmVyTGFtYmRhQXJuOiBsZGFwVG9rZW5SZXRyaWV2ZXIubGFtYmRhRnVuY3Rpb24uZnVuY3Rpb25Bcm5cbiAgICB9KTtcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09XG4gIC8vIEhFTFBFUiBNRVRIT0RTXG4gIC8vID09PT09PT09PT09PT09PT09XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBzZWN1cml0eSBncm91cCBmb3IgRUNTIHRhc2tzXG4gICAqIEBwYXJhbSB2cGMgVGhlIFZQQyB0byBjcmVhdGUgdGhlIHNlY3VyaXR5IGdyb3VwIGluXG4gICAqIEByZXR1cm5zIFRoZSBjcmVhdGVkIHNlY3VyaXR5IGdyb3VwXG4gICAqL1xuICBwcml2YXRlIGNyZWF0ZUVjc1NlY3VyaXR5R3JvdXAodnBjOiBlYzIuSVZwYyk6IGVjMi5TZWN1cml0eUdyb3VwIHtcbiAgICBjb25zdCBlY3NTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdFQ1NTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgRUNTIHRhc2tzJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IHRydWVcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IEhUVFAvSFRUUFMgdHJhZmZpYyB0byBFQ1MgdGFza3NcbiAgICBlY3NTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuYW55SXB2NCgpLFxuICAgICAgZWMyLlBvcnQudGNwKDgwKSxcbiAgICAgICdBbGxvdyBIVFRQIHRyYWZmaWMnXG4gICAgKTtcblxuICAgIGVjc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5hbnlJcHY0KCksXG4gICAgICBlYzIuUG9ydC50Y3AoNDQzKSxcbiAgICAgICdBbGxvdyBIVFRQUyB0cmFmZmljJ1xuICAgICk7XG5cbiAgICBlY3NTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuYW55SXB2NCgpLFxuICAgICAgZWMyLlBvcnQudGNwKDkwMDApLFxuICAgICAgJ0FsbG93IEF1dGhlbnRpayB0cmFmZmljJ1xuICAgICk7XG5cbiAgICByZXR1cm4gZWNzU2VjdXJpdHlHcm91cDtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgc2VjdXJpdHkgZ3JvdXAgZm9yIGRhdGFiYXNlIGFjY2Vzc1xuICAgKiBAcGFyYW0gdnBjIFRoZSBWUEMgdG8gY3JlYXRlIHRoZSBzZWN1cml0eSBncm91cCBpblxuICAgKiBAcGFyYW0gZWNzU2VjdXJpdHlHcm91cCBUaGUgRUNTIHNlY3VyaXR5IGdyb3VwIHRvIGFsbG93IGFjY2VzcyBmcm9tXG4gICAqIEByZXR1cm5zIFRoZSBjcmVhdGVkIHNlY3VyaXR5IGdyb3VwXG4gICAqL1xuICBwcml2YXRlIGNyZWF0ZURiU2VjdXJpdHlHcm91cCh2cGM6IGVjMi5JVnBjLCBlY3NTZWN1cml0eUdyb3VwOiBlYzIuU2VjdXJpdHlHcm91cCk6IGVjMi5TZWN1cml0eUdyb3VwIHtcbiAgICBjb25zdCBkYlNlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0RCU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIGRhdGFiYXNlJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IGZhbHNlXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBQb3N0Z3JlU1FMIGFjY2VzcyBmcm9tIEVDUyB0YXNrc1xuICAgIGRiU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLnNlY3VyaXR5R3JvdXBJZChlY3NTZWN1cml0eUdyb3VwLnNlY3VyaXR5R3JvdXBJZCksXG4gICAgICBlYzIuUG9ydC50Y3AoNTQzMiksXG4gICAgICAnQWxsb3cgUG9zdGdyZVNRTCBhY2Nlc3MgZnJvbSBFQ1MgdGFza3MnXG4gICAgKTtcblxuICAgIHJldHVybiBkYlNlY3VyaXR5R3JvdXA7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIHNlY3VyaXR5IGdyb3VwIGZvciBSZWRpcyBhY2Nlc3NcbiAgICogQHBhcmFtIHZwYyBUaGUgVlBDIHRvIGNyZWF0ZSB0aGUgc2VjdXJpdHkgZ3JvdXAgaW5cbiAgICogQHBhcmFtIGVjc1NlY3VyaXR5R3JvdXAgVGhlIEVDUyBzZWN1cml0eSBncm91cCB0byBhbGxvdyBhY2Nlc3MgZnJvbVxuICAgKiBAcmV0dXJucyBUaGUgY3JlYXRlZCBzZWN1cml0eSBncm91cFxuICAgKi9cbiAgcHJpdmF0ZSBjcmVhdGVSZWRpc1NlY3VyaXR5R3JvdXAodnBjOiBlYzIuSVZwYywgZWNzU2VjdXJpdHlHcm91cDogZWMyLlNlY3VyaXR5R3JvdXApOiBlYzIuU2VjdXJpdHlHcm91cCB7XG4gICAgY29uc3QgcmVkaXNTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdSZWRpc1NlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBSZWRpcycsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiBmYWxzZVxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgUmVkaXMgYWNjZXNzIGZyb20gRUNTIHRhc2tzXG4gICAgcmVkaXNTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuc2VjdXJpdHlHcm91cElkKGVjc1NlY3VyaXR5R3JvdXAuc2VjdXJpdHlHcm91cElkKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg2Mzc5KSxcbiAgICAgICdBbGxvdyBSZWRpcyBhY2Nlc3MgZnJvbSBFQ1MgdGFza3MnXG4gICAgKTtcblxuICAgIHJldHVybiByZWRpc1NlY3VyaXR5R3JvdXA7XG4gIH1cblxuICAvKipcbiAgICogR2V0IHRoZSBjdXJyZW50IGdpdCBTSEEgZm9yIHRhZ2dpbmcgcmVzb3VyY2VzXG4gICAqIEByZXR1cm5zIEN1cnJlbnQgZ2l0IFNIQSBvciAnZGV2ZWxvcG1lbnQnIGlmIHVuYWJsZSB0byBkZXRlcm1pbmVcbiAgICovXG4gIHByaXZhdGUgZ2V0R2l0U2hhKCk6IHN0cmluZyB7XG4gICAgdHJ5IHtcbiAgICAgIC8vIEdldCB0aGUgY3VycmVudCBnaXQgU0hBXG4gICAgICBjb25zdCB7IGV4ZWNTeW5jIH0gPSByZXF1aXJlKCdjaGlsZF9wcm9jZXNzJyk7XG4gICAgICByZXR1cm4gZXhlY1N5bmMoJ2dpdCByZXYtcGFyc2UgLS1zaG9ydCBIRUFEJykudG9TdHJpbmcoKS50cmltKCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUud2FybignVW5hYmxlIHRvIGdldCBnaXQgU0hBLCB1c2luZyBcImRldmVsb3BtZW50XCInKTtcbiAgICAgIHJldHVybiAnZGV2ZWxvcG1lbnQnO1xuICAgIH1cbiAgfVxufVxuIl19