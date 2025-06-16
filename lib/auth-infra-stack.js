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
        const useAuthentikConfigFile = Boolean(this.node.tryGetContext('useAuthentikConfigFile') || false);
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
        const ecsCluster = ecs.Cluster.fromClusterArn(this, 'ECSCluster', ecsClusterArn);
        // S3
        const s3ConfBucket = s3.Bucket.fromBucketArn(this, 'S3ConfBucket', aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.S3_BUCKET)));
        // ECR
        const ecrRepository = aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.ECR_REPO));
        // Route53
        const hostedZoneId = aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.HOSTED_ZONE_ID));
        const hostedZoneName = aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.HOSTED_ZONE_NAME));
        // SSL Certificate
        const sslCertificateArn = aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.CERTIFICATE_ARN));
        // Add DNS domain name tag
        cdk.Tags.of(this).add('DNS Zone', hostedZoneName);
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
            useAuthentikConfigFile: useAuthentikConfigFile,
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
            useAuthentikConfigFile: useAuthentikConfigFile,
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
        // Add dependency for LDAP token retriever to wait for Authentik DNS records
        ldapTokenRetriever.customResource.node.addDependency(route53.authentikARecord);
        ldapTokenRetriever.customResource.node.addDependency(route53.authentikAAAARecord);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGgtaW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFFbkMsNkNBQXVFO0FBQ3ZFLHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLHVEQUF5QztBQUV6QyxvQkFBb0I7QUFDcEIsb0RBQWlEO0FBQ2pELDhDQUEyQztBQUMzQywwQ0FBdUM7QUFDdkMsa0VBQThEO0FBQzlELDBDQUF1QztBQUN2QyxvRUFBZ0U7QUFDaEUsb0VBQWdFO0FBQ2hFLDRDQUF5QztBQUN6Qyw0RUFBdUU7QUFDdkUsa0RBQStDO0FBQy9DLDBFQUFxRTtBQUVyRSxrQkFBa0I7QUFDbEIsdUNBQTRDO0FBQzVDLHFFQUFvRjtBQUNwRiw2REFBb0Y7QUFPcEY7O0dBRUc7QUFDSCxNQUFhLGNBQWUsU0FBUSxHQUFHLENBQUMsS0FBSztJQUMzQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTBCO1FBQ2xFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFO1lBQ2YsR0FBRyxLQUFLO1lBQ1IsV0FBVyxFQUFFLG9EQUFvRDtTQUNsRSxDQUFDLENBQUM7UUFFSCxNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsV0FBVyxDQUFDO1FBRWpDLCtCQUErQjtRQUMvQixNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDO1FBQy9CLE1BQU0sa0JBQWtCLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLHFEQUFxRDtRQUNsRyxNQUFNLGlCQUFpQixHQUFHLEVBQUUsQ0FBQztRQUU3QixvQ0FBb0M7UUFDcEMsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLE9BQU8sS0FBSyxNQUFNLENBQUMsQ0FBQztZQUMzQyxFQUFFLHNCQUFzQixFQUFFLElBQUksRUFBRSx3QkFBd0IsRUFBRSxJQUFJ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Q0FBQyxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsRUFDMUQsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQ2xCLHdDQUF3QyxDQUN6QyxDQUFDO1FBRUYsT0FBTyxlQUFlLENBQUM7SUFDekIsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0ssd0JBQXdCLENBQUMsR0FBYSxFQUFFLGdCQUFtQztRQUNqRixNQUFNLGtCQUFrQixHQUFHLElBQUksR0FBRyxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLEVBQUU7WUFDM0UsR0FBRztZQUNILFdBQVcsRUFBRSwwQkFBMEI7WUFDdkMsZ0JBQWdCLEVBQUUsS0FBSztTQUN4QixDQUFDLENBQUM7UUFFSCxvQ0FBb0M7UUFDcEMsa0JBQWtCLENBQUMsY0FBYyxDQUMvQixHQUFHLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsRUFDMUQsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQ2xCLG1DQUFtQyxDQUNwQyxDQUFDO1FBRUYsT0FBTyxrQkFBa0IsQ0FBQztJQUM1QixDQUFDO0lBRUQ7OztPQUdHO0lBQ0ssU0FBUztRQUNmLElBQUksQ0FBQztZQUNILDBCQUEwQjtZQUMxQixNQUFNLEVBQUUsUUFBUSxFQUFFLEdBQUcsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQzlDLE9BQU8sUUFBUSxDQUFDLDRCQUE0QixDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDbEUsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixPQUFPLENBQUMsSUFBSSxDQUFDLDRDQUE0QyxDQUFDLENBQUM7WUFDM0QsT0FBTyxhQUFhLENBQUM7UUFDdkIsQ0FBQztJQUNILENBQUM7Q0FDRjtBQXBiRCx3Q0FvYkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgeyBSZW1vdmFsUG9saWN5LCBTdGFja1Byb3BzLCBGbiwgQ2ZuT3V0cHV0IH0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgZWMyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xuaW1wb3J0ICogYXMgZWNzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3MnO1xuaW1wb3J0ICogYXMga21zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1rbXMnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcblxuLy8gQ29uc3RydWN0IGltcG9ydHNcbmltcG9ydCB7IERhdGFiYXNlIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2RhdGFiYXNlJztcbmltcG9ydCB7IFJlZGlzIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL3JlZGlzJztcbmltcG9ydCB7IEVmcyB9IGZyb20gJy4vY29uc3RydWN0cy9lZnMnO1xuaW1wb3J0IHsgU2VjcmV0c01hbmFnZXIgfSBmcm9tICcuL2NvbnN0cnVjdHMvc2VjcmV0cy1tYW5hZ2VyJztcbmltcG9ydCB7IEVsYiB9IGZyb20gJy4vY29uc3RydWN0cy9lbGInO1xuaW1wb3J0IHsgQXV0aGVudGlrU2VydmVyIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2F1dGhlbnRpay1zZXJ2ZXInO1xuaW1wb3J0IHsgQXV0aGVudGlrV29ya2VyIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2F1dGhlbnRpay13b3JrZXInO1xuaW1wb3J0IHsgTGRhcCB9IGZyb20gJy4vY29uc3RydWN0cy9sZGFwJztcbmltcG9ydCB7IExkYXBUb2tlblJldHJpZXZlciB9IGZyb20gJy4vY29uc3RydWN0cy9sZGFwLXRva2VuLXJldHJpZXZlcic7XG5pbXBvcnQgeyBSb3V0ZTUzIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL3JvdXRlNTMnO1xuaW1wb3J0IHsgRWNySW1hZ2VWYWxpZGF0b3IgfSBmcm9tICcuL2NvbnN0cnVjdHMvZWNyLWltYWdlLXZhbGlkYXRvcic7XG5cbi8vIFV0aWxpdHkgaW1wb3J0c1xuaW1wb3J0IHsgcmVnaXN0ZXJPdXRwdXRzIH0gZnJvbSAnLi9vdXRwdXRzJztcbmltcG9ydCB7IGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZSwgQkFTRV9FWFBPUlRfTkFNRVMgfSBmcm9tICcuL2Nsb3VkZm9ybWF0aW9uLWltcG9ydHMnO1xuaW1wb3J0IHsgZ2V0RW52aXJvbm1lbnRDb25maWcsIG1lcmdlRW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuL2Vudmlyb25tZW50LWNvbmZpZyc7XG5pbXBvcnQgeyBBdXRoSW5mcmFDb25maWcgfSBmcm9tICcuL3N0YWNrLWNvbmZpZyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aEluZnJhU3RhY2tQcm9wcyBleHRlbmRzIFN0YWNrUHJvcHMge1xuICBzdGFja0NvbmZpZzogQXV0aEluZnJhQ29uZmlnO1xufVxuXG4vKipcbiAqIE1haW4gQ0RLIHN0YWNrIGZvciB0aGUgVEFLIEF1dGggSW5mcmFzdHJ1Y3R1cmVcbiAqL1xuZXhwb3J0IGNsYXNzIEF1dGhJbmZyYVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEF1dGhJbmZyYVN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHtcbiAgICAgIC4uLnByb3BzLFxuICAgICAgZGVzY3JpcHRpb246ICdUQUsgQXV0aGVudGljYXRpb24gTGF5ZXIgLSBBdXRoZW50aWssIExEQVAgT3V0cG9zdCcsXG4gICAgfSk7XG5cbiAgICBjb25zdCBjb25maWcgPSBwcm9wcy5zdGFja0NvbmZpZztcbiAgICBcbiAgICAvLyBFeHRyYWN0IGNvbmZpZ3VyYXRpb24gdmFsdWVzXG4gICAgY29uc3QgZW52VHlwZSA9IGNvbmZpZy5lbnZUeXBlO1xuICAgIGNvbnN0IHN0YWNrTmFtZUNvbXBvbmVudCA9IGNvbmZpZy5zdGFja05hbWU7IC8vIFRoaXMgaXMgdGhlIFNUQUNLX05BTUUgcGFydCAoZS5nLiwgXCJNeUZpcnN0U3RhY2tcIilcbiAgICBjb25zdCByZXNvbHZlZFN0YWNrTmFtZSA9IGlkO1xuICAgIFxuICAgIC8vIEdldCBlbnZpcm9ubWVudC1zcGVjaWZpYyBkZWZhdWx0c1xuICAgIGNvbnN0IGVudkNvbmZpZyA9IGNvbmZpZy5lbnZUeXBlID09PSAncHJvZCcgPyBcbiAgICAgIHsgZW5hYmxlSGlnaEF2YWlsYWJpbGl0eTogdHJ1ZSwgZW5hYmxlRGV0YWlsZWRNb25pdG9yaW5nOiB0cnVlIH0gOlxuICAgICAgeyBlbmFibGVIaWdoQXZhaWxhYmlsaXR5OiBmYWxzZSwgZW5hYmxlRGV0YWlsZWRNb25pdG9yaW5nOiBmYWxzZSB9O1xuICAgIFxuICAgIGNvbnN0IGVuYWJsZUhpZ2hBdmFpbGFiaWxpdHkgPSBlbnZDb25maWcuZW5hYmxlSGlnaEF2YWlsYWJpbGl0eTtcbiAgICBjb25zdCBlbmFibGVEZXRhaWxlZE1vbml0b3JpbmcgPSBjb25maWcub3ZlcnJpZGVzPy5nZW5lcmFsPy5lbmFibGVEZXRhaWxlZExvZ2dpbmcgPz8gZW52Q29uZmlnLmVuYWJsZURldGFpbGVkTW9uaXRvcmluZztcbiAgICBcbiAgICAvLyBHZXQgYmFzZSBjb25maWd1cmF0aW9uIGFuZCBtZXJnZSB3aXRoIG92ZXJyaWRlc1xuICAgIGNvbnN0IGJhc2VDb25maWcgPSBnZXRFbnZpcm9ubWVudENvbmZpZyhlbnZUeXBlKTtcbiAgICBjb25zdCBtZXJnZWRDb25maWcgPSBjb25maWcub3ZlcnJpZGVzID8gXG4gICAgICBtZXJnZUVudmlyb25tZW50Q29uZmlnKGJhc2VDb25maWcsIGNvbmZpZy5vdmVycmlkZXMpIDogXG4gICAgICBiYXNlQ29uZmlnO1xuICAgIFxuICAgIC8vIFNldCBjb250YWluZXIgY291bnRzIGJhc2VkIG9uIGhpZ2ggYXZhaWxhYmlsaXR5IHNldHRpbmdcbiAgICAvLyBlbmFibGVIaWdoQXZhaWxhYmlsaXR5PXRydWU6IDIgY29udGFpbmVycyAoU2VydmVyLCBXb3JrZXIsIExEQVApXG4gICAgLy8gZW5hYmxlSGlnaEF2YWlsYWJpbGl0eT1mYWxzZTogMSBjb250YWluZXIgZWFjaFxuICAgIGNvbnN0IGRlc2lyZWRDb250YWluZXJDb3VudCA9IGVuYWJsZUhpZ2hBdmFpbGFiaWxpdHkgPyAyIDogMTtcbiAgICBcbiAgICAvLyBPdmVycmlkZSBjb250YWluZXIgY291bnRzIGluIG1lcmdlZCBjb25maWcgdW5sZXNzIGV4cGxpY2l0bHkgc2V0IHZpYSBjb250ZXh0XG4gICAgaWYgKCFjb25maWcub3ZlcnJpZGVzPy5lY3M/LmRlc2lyZWRDb3VudCkge1xuICAgICAgbWVyZ2VkQ29uZmlnLmVjcy5kZXNpcmVkQ291bnQgPSBkZXNpcmVkQ29udGFpbmVyQ291bnQ7XG4gICAgfVxuICAgIGlmICghY29uZmlnLm92ZXJyaWRlcz8uZWNzPy53b3JrZXJEZXNpcmVkQ291bnQpIHtcbiAgICAgIG1lcmdlZENvbmZpZy5lY3Mud29ya2VyRGVzaXJlZENvdW50ID0gZGVzaXJlZENvbnRhaW5lckNvdW50O1xuICAgIH1cblxuICAgIC8vIEFkZCBFbnZpcm9ubWVudCBUeXBlIHRhZyB0byB0aGUgc3RhY2tcbiAgICBjb25zdCBlbnZpcm9ubWVudExhYmVsID0gZW52VHlwZSA9PT0gJ3Byb2QnID8gJ1Byb2QnIDogJ0Rldi1UZXN0JztcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ0Vudmlyb25tZW50IFR5cGUnLCBlbnZpcm9ubWVudExhYmVsKTtcblxuICAgIGNvbnN0IHN0YWNrTmFtZSA9IEZuLnJlZignQVdTOjpTdGFja05hbWUnKTtcbiAgICBjb25zdCByZWdpb24gPSBjZGsuU3RhY2sub2YodGhpcykucmVnaW9uO1xuXG4gICAgLy8gQ29udGV4dC1iYXNlZCBwYXJhbWV0ZXIgcmVzb2x1dGlvbiAoQ0RLIGNvbnRleHQgb25seSlcbiAgICBjb25zdCBnaXRTaGEgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZ2l0U2hhJykgfHwgdGhpcy5nZXRHaXRTaGEoKTtcbiAgICBjb25zdCBlbmFibGVFeGVjdXRlID0gQm9vbGVhbih0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZW5hYmxlRXhlY3V0ZScpIHx8IGZhbHNlKTtcbiAgICBjb25zdCBhdXRoZW50aWtBZG1pblVzZXJFbWFpbCA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdhdXRoZW50aWtBZG1pblVzZXJFbWFpbCcpIHx8ICcnO1xuICAgIGNvbnN0IGF1dGhlbnRpa0xkYXBCYXNlRG4gPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnYXV0aGVudGlrTGRhcEJhc2VEbicpIHx8ICdEQz1leGFtcGxlLERDPWNvbSc7XG4gICAgY29uc3QgdXNlQXV0aGVudGlrQ29uZmlnRmlsZSA9IEJvb2xlYW4odGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ3VzZUF1dGhlbnRpa0NvbmZpZ0ZpbGUnKSB8fCBmYWxzZSk7XG4gICAgY29uc3QgaG9zdG5hbWVBdXRoZW50aWsgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnaG9zdG5hbWVBdXRoZW50aWsnKSB8fCAnYWNjb3VudCc7XG4gICAgY29uc3QgaG9zdG5hbWVMZGFwID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2hvc3RuYW1lTGRhcCcpIHx8ICdsZGFwJztcblxuICAgIC8vIFZhbGlkYXRlIHJlcXVpcmVkIHBhcmFtZXRlcnNcbiAgICBpZiAoIWF1dGhlbnRpa0FkbWluVXNlckVtYWlsIHx8IGF1dGhlbnRpa0FkbWluVXNlckVtYWlsLnRyaW0oKSA9PT0gJycpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignYXV0aGVudGlrQWRtaW5Vc2VyRW1haWwgaXMgcmVxdWlyZWQuIFNldCBpdCB2aWEgLS1jb250ZXh0IGF1dGhlbnRpa0FkbWluVXNlckVtYWlsPXVzZXJAZXhhbXBsZS5jb20nKTtcbiAgICB9XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIElNUE9SVCBCQVNFIElORlJBU1RSVUNUVVJFIFJFU09VUkNFU1xuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBJbXBvcnQgVlBDIGFuZCBuZXR3b3JraW5nIGZyb20gYmFzZSBpbmZyYXN0cnVjdHVyZVxuICAgIC8vIE5vdGU6IEJhc2UgaW5mcmFzdHJ1Y3R1cmUgcHJvdmlkZXMgMiBzdWJuZXRzIChBIGFuZCBCKSwgc28gd2UgbGltaXQgdG8gMiBBWnNcbiAgICBjb25zdCB2cGNBdmFpbGFiaWxpdHlab25lcyA9IHRoaXMuYXZhaWxhYmlsaXR5Wm9uZXMuc2xpY2UoMCwgMik7XG4gICAgXG4gICAgY29uc3QgdnBjID0gZWMyLlZwYy5mcm9tVnBjQXR0cmlidXRlcyh0aGlzLCAnVlBDJywge1xuICAgICAgdnBjSWQ6IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlZQQ19JRCkpLFxuICAgICAgYXZhaWxhYmlsaXR5Wm9uZXM6IHZwY0F2YWlsYWJpbGl0eVpvbmVzLFxuICAgICAgLy8gSW1wb3J0IHN1Ym5ldCBJRHMgZnJvbSBiYXNlIGluZnJhc3RydWN0dXJlXG4gICAgICBwdWJsaWNTdWJuZXRJZHM6IFtcbiAgICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuU1VCTkVUX1BVQkxJQ19BKSksXG4gICAgICAgIEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlNVQk5FVF9QVUJMSUNfQikpXG4gICAgICBdLFxuICAgICAgcHJpdmF0ZVN1Ym5ldElkczogW1xuICAgICAgICBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5TVUJORVRfUFJJVkFURV9BKSksXG4gICAgICAgIEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlNVQk5FVF9QUklWQVRFX0IpKVxuICAgICAgXSxcbiAgICAgIHZwY0NpZHJCbG9jazogRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuVlBDX0NJRFJfSVBWNCkpXG4gICAgfSk7XG5cbiAgICAvLyBLTVNcbiAgICBjb25zdCBrbXNLZXkgPSBrbXMuS2V5LmZyb21LZXlBcm4odGhpcywgJ0tNU0tleScsIFxuICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuS01TX0tFWSkpXG4gICAgKTtcblxuICAgIC8vIEVDU1xuICAgIGNvbnN0IGVjc0NsdXN0ZXJBcm4gPSBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5FQ1NfQ0xVU1RFUikpO1xuICAgIGNvbnN0IGVjc0NsdXN0ZXIgPSBlY3MuQ2x1c3Rlci5mcm9tQ2x1c3RlckFybih0aGlzLCAnRUNTQ2x1c3RlcicsIGVjc0NsdXN0ZXJBcm4pO1xuXG4gICAgLy8gUzNcbiAgICBjb25zdCBzM0NvbmZCdWNrZXQgPSBzMy5CdWNrZXQuZnJvbUJ1Y2tldEFybih0aGlzLCAnUzNDb25mQnVja2V0JyxcbiAgICAgIEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlMzX0JVQ0tFVCkpXG4gICAgKTtcblxuICAgIC8vIEVDUlxuICAgIGNvbnN0IGVjclJlcG9zaXRvcnkgPSBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5FQ1JfUkVQTykpO1xuXG4gICAgLy8gUm91dGU1M1xuICAgIGNvbnN0IGhvc3RlZFpvbmVJZCA9IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLkhPU1RFRF9aT05FX0lEKSk7XG4gICAgY29uc3QgaG9zdGVkWm9uZU5hbWUgPSBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5IT1NURURfWk9ORV9OQU1FKSk7XG5cbiAgICAvLyBTU0wgQ2VydGlmaWNhdGVcbiAgICBjb25zdCBzc2xDZXJ0aWZpY2F0ZUFybiA9IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLkNFUlRJRklDQVRFX0FSTikpO1xuXG4gICAgLy8gQWRkIEROUyBkb21haW4gbmFtZSB0YWdcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ0ROUyBab25lJywgaG9zdGVkWm9uZU5hbWUpO1xuXG4gICAgLy8gUzMgRW52aXJvbm1lbnQgRmlsZSBwYXRocyAtIGFzc3VtZXMgYXV0aGVudGlrLWNvbmZpZy5lbnYgYWxyZWFkeSBleGlzdHMgaW4gUzNcbiAgICBjb25zdCBlbnZGaWxlUzNLZXkgPSBgJHtzdGFja05hbWVDb21wb25lbnR9L2F1dGhlbnRpay1jb25maWcuZW52YDtcbiAgICBjb25zdCBlbnZGaWxlUzNVcmkgPSBgYXJuOmF3czpzMzo6OiR7czNDb25mQnVja2V0LmJ1Y2tldE5hbWV9LyR7ZW52RmlsZVMzS2V5fWA7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIFNFQ1VSSVRZIEdST1VQU1xuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBTZWN1cml0eSBHcm91cHNcbiAgICBjb25zdCBlY3NTZWN1cml0eUdyb3VwID0gdGhpcy5jcmVhdGVFY3NTZWN1cml0eUdyb3VwKHZwYyk7XG4gICAgY29uc3QgZGJTZWN1cml0eUdyb3VwID0gdGhpcy5jcmVhdGVEYlNlY3VyaXR5R3JvdXAodnBjLCBlY3NTZWN1cml0eUdyb3VwKTtcbiAgICBjb25zdCByZWRpc1NlY3VyaXR5R3JvdXAgPSB0aGlzLmNyZWF0ZVJlZGlzU2VjdXJpdHlHcm91cCh2cGMsIGVjc1NlY3VyaXR5R3JvdXApO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBDT1JFIElORlJBU1RSVUNUVVJFXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIFNlY3JldHNNYW5hZ2VyXG4gICAgY29uc3Qgc2VjcmV0c01hbmFnZXIgPSBuZXcgU2VjcmV0c01hbmFnZXIodGhpcywgJ1NlY3JldHNNYW5hZ2VyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIHN0YWNrTmFtZTogcmVzb2x2ZWRTdGFja05hbWUsXG4gICAgICBrbXNLZXlcbiAgICB9KTtcblxuICAgIC8vIERhdGFiYXNlXG4gICAgY29uc3QgZGF0YWJhc2UgPSBuZXcgRGF0YWJhc2UodGhpcywgJ0RhdGFiYXNlJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIHN0YWNrTmFtZTogcmVzb2x2ZWRTdGFja05hbWUsXG4gICAgICBjb25maWc6IG1lcmdlZENvbmZpZyxcbiAgICAgIHZwYyxcbiAgICAgIGttc0tleSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbZGJTZWN1cml0eUdyb3VwXVxuICAgIH0pO1xuXG4gICAgLy8gUmVkaXNcbiAgICBjb25zdCByZWRpcyA9IG5ldyBSZWRpcyh0aGlzLCAnUmVkaXMnLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgc3RhY2tOYW1lOiByZXNvbHZlZFN0YWNrTmFtZSxcbiAgICAgIGNvbmZpZzogbWVyZ2VkQ29uZmlnLFxuICAgICAgdnBjLFxuICAgICAga21zS2V5LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtyZWRpc1NlY3VyaXR5R3JvdXBdXG4gICAgfSk7XG5cbiAgICAvLyBFRlNcbiAgICBjb25zdCBlZnMgPSBuZXcgRWZzKHRoaXMsICdFRlMnLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgdnBjLFxuICAgICAgdnBjQ2lkckJsb2NrOiBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5WUENfQ0lEUl9JUFY0KSksXG4gICAgICBrbXNLZXksXG4gICAgICBhbGxvd0FjY2Vzc0Zyb206IFtlY3NTZWN1cml0eUdyb3VwXVxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBJTUFHRSBWQUxJREFUSU9OXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIFZhbGlkYXRlIHJlcXVpcmVkIEVDUiBpbWFnZXMgZXhpc3QgYmVmb3JlIGRlcGxveW1lbnRcbiAgICBjb25zdCByZXF1aXJlZEltYWdlVGFncyA9IFtcbiAgICAgIGBhdXRoLWluZnJhLXNlcnZlci0ke2dpdFNoYX1gLFxuICAgICAgYGF1dGgtaW5mcmEtbGRhcC0ke2dpdFNoYX1gXG4gICAgXTtcbiAgICBcbiAgICBjb25zdCBlY3JWYWxpZGF0b3IgPSBuZXcgRWNySW1hZ2VWYWxpZGF0b3IodGhpcywgJ0VjckltYWdlVmFsaWRhdG9yJywge1xuICAgICAgZWNyUmVwb3NpdG9yeUFybjogZWNyUmVwb3NpdG9yeSxcbiAgICAgIHJlcXVpcmVkSW1hZ2VUYWdzOiByZXF1aXJlZEltYWdlVGFncyxcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnRcbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gQVBQTElDQVRJT04gU0VSVklDRVNcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gQXV0aGVudGlrIExvYWQgQmFsYW5jZXJcbiAgICBjb25zdCBhdXRoZW50aWtFTEIgPSBuZXcgRWxiKHRoaXMsICdBdXRoZW50aWtFTEInLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBtZXJnZWRDb25maWcsXG4gICAgICB2cGMsXG4gICAgICBzc2xDZXJ0aWZpY2F0ZUFybjogc3NsQ2VydGlmaWNhdGVBcm5cbiAgICB9KTtcblxuICAgIC8vIEF1dGhlbnRpayBTZXJ2ZXJcbiAgICBjb25zdCBhdXRoZW50aWtTZXJ2ZXIgPSBuZXcgQXV0aGVudGlrU2VydmVyKHRoaXMsICdBdXRoZW50aWtTZXJ2ZXInLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBtZXJnZWRDb25maWcsXG4gICAgICB2cGMsXG4gICAgICBlY3NTZWN1cml0eUdyb3VwLFxuICAgICAgZWNzQ2x1c3RlcixcbiAgICAgIHMzQ29uZkJ1Y2tldCxcbiAgICAgIGVudkZpbGVTM1VyaTogZW52RmlsZVMzVXJpLFxuICAgICAgZW52RmlsZVMzS2V5OiBlbnZGaWxlUzNLZXksXG4gICAgICBhZG1pblVzZXJFbWFpbDogYXV0aGVudGlrQWRtaW5Vc2VyRW1haWwsXG4gICAgICBsZGFwQmFzZURuOiBhdXRoZW50aWtMZGFwQmFzZURuLFxuICAgICAgdXNlQXV0aGVudGlrQ29uZmlnRmlsZTogdXNlQXV0aGVudGlrQ29uZmlnRmlsZSxcbiAgICAgIGVjclJlcG9zaXRvcnlBcm46IGVjclJlcG9zaXRvcnksXG4gICAgICBnaXRTaGE6IGdpdFNoYSxcbiAgICAgIGVuYWJsZUV4ZWN1dGU6IGVuYWJsZUV4ZWN1dGUsXG4gICAgICBkYlNlY3JldDogZGF0YWJhc2UubWFzdGVyU2VjcmV0LFxuICAgICAgZGJIb3N0bmFtZTogZGF0YWJhc2UuaG9zdG5hbWUsXG4gICAgICByZWRpc0F1dGhUb2tlbjogcmVkaXMuYXV0aFRva2VuLFxuICAgICAgcmVkaXNIb3N0bmFtZTogcmVkaXMuaG9zdG5hbWUsXG4gICAgICBzZWNyZXRLZXk6IHNlY3JldHNNYW5hZ2VyLnNlY3JldEtleSxcbiAgICAgIGFkbWluVXNlclBhc3N3b3JkOiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJQYXNzd29yZCxcbiAgICAgIGFkbWluVXNlclRva2VuOiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJUb2tlbixcbiAgICAgIGxkYXBUb2tlbjogc2VjcmV0c01hbmFnZXIubGRhcFRva2VuLFxuICAgICAgZWZzSWQ6IGVmcy5maWxlU3lzdGVtLmZpbGVTeXN0ZW1JZCxcbiAgICAgIGVmc01lZGlhQWNjZXNzUG9pbnRJZDogZWZzLm1lZGlhQWNjZXNzUG9pbnQuYWNjZXNzUG9pbnRJZCxcbiAgICAgIGVmc0N1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50SWQ6IGVmcy5jdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkXG4gICAgfSk7XG5cbiAgICAvLyBFbnN1cmUgQXV0aGVudGlrIFNlcnZlciB3YWl0cyBmb3IgRUNSIGltYWdlIHZhbGlkYXRpb25cbiAgICBhdXRoZW50aWtTZXJ2ZXIubm9kZS5hZGREZXBlbmRlbmN5KGVjclZhbGlkYXRvcik7XG5cbiAgICAvLyBBdXRoZW50aWsgV29ya2VyXG4gICAgY29uc3QgYXV0aGVudGlrV29ya2VyID0gbmV3IEF1dGhlbnRpa1dvcmtlcih0aGlzLCAnQXV0aGVudGlrV29ya2VyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogbWVyZ2VkQ29uZmlnLFxuICAgICAgdnBjLFxuICAgICAgZWNzU2VjdXJpdHlHcm91cCxcbiAgICAgIGVjc0NsdXN0ZXIsXG4gICAgICBzM0NvbmZCdWNrZXQsXG4gICAgICBlbnZGaWxlUzNLZXk6IGVudkZpbGVTM0tleSxcbiAgICAgIHVzZUF1dGhlbnRpa0NvbmZpZ0ZpbGU6IHVzZUF1dGhlbnRpa0NvbmZpZ0ZpbGUsXG4gICAgICBlY3JSZXBvc2l0b3J5QXJuOiBlY3JSZXBvc2l0b3J5LFxuICAgICAgZ2l0U2hhOiBnaXRTaGEsXG4gICAgICBlbmFibGVFeGVjdXRlOiBlbmFibGVFeGVjdXRlLFxuICAgICAgZGJTZWNyZXQ6IGRhdGFiYXNlLm1hc3RlclNlY3JldCxcbiAgICAgIGRiSG9zdG5hbWU6IGRhdGFiYXNlLmhvc3RuYW1lLFxuICAgICAgcmVkaXNBdXRoVG9rZW46IHJlZGlzLmF1dGhUb2tlbixcbiAgICAgIHJlZGlzSG9zdG5hbWU6IHJlZGlzLmhvc3RuYW1lLFxuICAgICAgc2VjcmV0S2V5OiBzZWNyZXRzTWFuYWdlci5zZWNyZXRLZXksXG4gICAgICBlZnNJZDogZWZzLmZpbGVTeXN0ZW0uZmlsZVN5c3RlbUlkLFxuICAgICAgZWZzTWVkaWFBY2Nlc3NQb2ludElkOiBlZnMubWVkaWFBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkLFxuICAgICAgZWZzQ3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnRJZDogZWZzLmN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWRcbiAgICB9KTtcblxuICAgIC8vIEVuc3VyZSBBdXRoZW50aWsgV29ya2VyIHdhaXRzIGZvciBFQ1IgaW1hZ2UgdmFsaWRhdGlvblxuICAgIGF1dGhlbnRpa1dvcmtlci5ub2RlLmFkZERlcGVuZGVuY3koZWNyVmFsaWRhdG9yKTtcblxuICAgIC8vIENvbm5lY3QgQXV0aGVudGlrIFNlcnZlciB0byBMb2FkIEJhbGFuY2VyXG4gICAgYXV0aGVudGlrU2VydmVyLmNyZWF0ZVRhcmdldEdyb3VwKHZwYywgYXV0aGVudGlrRUxCLmh0dHBzTGlzdGVuZXIpO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBMREFQIENPTkZJR1VSQVRJT05cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gTERBUCBUb2tlbiBSZXRyaWV2ZXJcbiAgICBjb25zdCBsZGFwVG9rZW5SZXRyaWV2ZXIgPSBuZXcgTGRhcFRva2VuUmV0cmlldmVyKHRoaXMsICdMZGFwVG9rZW5SZXRyaWV2ZXInLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBtZXJnZWRDb25maWcsXG4gICAgICBrbXNLZXksXG4gICAgICBhdXRoZW50aWtIb3N0OiBgaHR0cHM6Ly8ke2F1dGhlbnRpa0VMQi5kbnNOYW1lfWAsXG4gICAgICBvdXRwb3N0TmFtZTogJ0xEQVAnLFxuICAgICAgYWRtaW5Ub2tlblNlY3JldDogc2VjcmV0c01hbmFnZXIuYWRtaW5Vc2VyVG9rZW4sXG4gICAgICBsZGFwVG9rZW5TZWNyZXQ6IHNlY3JldHNNYW5hZ2VyLmxkYXBUb2tlbixcbiAgICAgIGdpdFNoYTogZ2l0U2hhLFxuICAgICAgYXV0aGVudGlrU2VydmVyU2VydmljZTogYXV0aGVudGlrU2VydmVyLmVjc1NlcnZpY2UsXG4gICAgICBhdXRoZW50aWtXb3JrZXJTZXJ2aWNlOiBhdXRoZW50aWtXb3JrZXIuZWNzU2VydmljZVxuICAgIH0pO1xuXG4gICAgLy8gTERBUFxuICAgIGNvbnN0IGxkYXAgPSBuZXcgTGRhcCh0aGlzLCAnTERBUCcsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IG1lcmdlZENvbmZpZyxcbiAgICAgIHZwYyxcbiAgICAgIGVjc1NlY3VyaXR5R3JvdXAsXG4gICAgICBlY3NDbHVzdGVyLFxuICAgICAgczNDb25mQnVja2V0LFxuICAgICAgc3NsQ2VydGlmaWNhdGVBcm46IHNzbENlcnRpZmljYXRlQXJuLFxuICAgICAgYXV0aGVudGlrSG9zdDogYXV0aGVudGlrRUxCLmRuc05hbWUsXG4gICAgICBlY3JSZXBvc2l0b3J5QXJuOiBlY3JSZXBvc2l0b3J5LFxuICAgICAgZ2l0U2hhOiBnaXRTaGEsXG4gICAgICBlbmFibGVFeGVjdXRlOiBlbmFibGVFeGVjdXRlLFxuICAgICAgbGRhcFRva2VuOiBzZWNyZXRzTWFuYWdlci5sZGFwVG9rZW5cbiAgICB9KTtcblxuICAgIC8vIEVuc3VyZSBMREFQIHdhaXRzIGZvciBFQ1IgaW1hZ2UgdmFsaWRhdGlvblxuICAgIGxkYXAubm9kZS5hZGREZXBlbmRlbmN5KGVjclZhbGlkYXRvcik7XG4gICAgLy8gRW5zdXJlIExEQVAgd2FpdHMgZm9yIHRoZSB0b2tlbiB0byBiZSByZXRyaWV2ZWRcbiAgICBsZGFwLm5vZGUuYWRkRGVwZW5kZW5jeShsZGFwVG9rZW5SZXRyaWV2ZXIpO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBETlMgQU5EIFJPVVRJTkdcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gUm91dGU1MyBETlMgUmVjb3Jkc1xuICAgIGNvbnN0IHJvdXRlNTMgPSBuZXcgUm91dGU1Myh0aGlzLCAnUm91dGU1MycsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IG1lcmdlZENvbmZpZyxcbiAgICAgIGhvc3RlZFpvbmVJZDogaG9zdGVkWm9uZUlkLFxuICAgICAgaG9zdGVkWm9uZU5hbWU6IGhvc3RlZFpvbmVOYW1lLFxuICAgICAgaG9zdG5hbWVBdXRoZW50aWs6IGhvc3RuYW1lQXV0aGVudGlrLFxuICAgICAgaG9zdG5hbWVMZGFwOiBob3N0bmFtZUxkYXAsXG4gICAgICBhdXRoZW50aWtMb2FkQmFsYW5jZXI6IGF1dGhlbnRpa0VMQi5sb2FkQmFsYW5jZXIsXG4gICAgICBsZGFwTG9hZEJhbGFuY2VyOiBsZGFwLmxvYWRCYWxhbmNlclxuICAgIH0pO1xuXG4gICAgLy8gQWRkIGRlcGVuZGVuY3kgZm9yIExEQVAgdG9rZW4gcmV0cmlldmVyIHRvIHdhaXQgZm9yIEF1dGhlbnRpayBETlMgcmVjb3Jkc1xuICAgIGxkYXBUb2tlblJldHJpZXZlci5jdXN0b21SZXNvdXJjZS5ub2RlLmFkZERlcGVuZGVuY3kocm91dGU1My5hdXRoZW50aWtBUmVjb3JkKTtcbiAgICBsZGFwVG9rZW5SZXRyaWV2ZXIuY3VzdG9tUmVzb3VyY2Uubm9kZS5hZGREZXBlbmRlbmN5KHJvdXRlNTMuYXV0aGVudGlrQUFBQVJlY29yZCk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIFNUQUNLIE9VVFBVVFNcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gT3V0cHV0c1xuICAgIHJlZ2lzdGVyT3V0cHV0cyh7XG4gICAgICBzdGFjazogdGhpcyxcbiAgICAgIHN0YWNrTmFtZTogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgZGF0YWJhc2VFbmRwb2ludDogZGF0YWJhc2UuaG9zdG5hbWUsXG4gICAgICBkYXRhYmFzZVNlY3JldEFybjogZGF0YWJhc2UubWFzdGVyU2VjcmV0LnNlY3JldEFybixcbiAgICAgIHJlZGlzRW5kcG9pbnQ6IHJlZGlzLmhvc3RuYW1lLFxuICAgICAgcmVkaXNBdXRoVG9rZW5Bcm46IHJlZGlzLmF1dGhUb2tlbi5zZWNyZXRBcm4sXG4gICAgICBlZnNJZDogZWZzLmZpbGVTeXN0ZW0uZmlsZVN5c3RlbUlkLFxuICAgICAgZWZzTWVkaWFBY2Nlc3NQb2ludElkOiBlZnMubWVkaWFBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkLFxuICAgICAgZWZzVGVtcGxhdGVzQWNjZXNzUG9pbnRJZDogZWZzLmN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWQsXG4gICAgICBhdXRoZW50aWtTZWNyZXRLZXlBcm46IHNlY3JldHNNYW5hZ2VyLnNlY3JldEtleS5zZWNyZXRBcm4sXG4gICAgICBhdXRoZW50aWtBZG1pblRva2VuQXJuOiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJUb2tlbi5zZWNyZXRBcm4sXG4gICAgICBhdXRoZW50aWtMZGFwVG9rZW5Bcm46IHNlY3JldHNNYW5hZ2VyLmxkYXBUb2tlbi5zZWNyZXRBcm4sXG4gICAgICBhdXRoZW50aWtBbGJEbnM6IGF1dGhlbnRpa0VMQi5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZSxcbiAgICAgIGF1dGhlbnRpa1VybDogYGh0dHBzOi8vJHthdXRoZW50aWtFTEIuZG5zTmFtZX1gLFxuICAgICAgbGRhcE5sYkRuczogbGRhcC5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZSxcbiAgICAgIGxkYXBUb2tlblJldHJpZXZlckxhbWJkYUFybjogbGRhcFRva2VuUmV0cmlldmVyLmxhbWJkYUZ1bmN0aW9uLmZ1bmN0aW9uQXJuXG4gICAgfSk7XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PVxuICAvLyBIRUxQRVIgTUVUSE9EU1xuICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgc2VjdXJpdHkgZ3JvdXAgZm9yIEVDUyB0YXNrc1xuICAgKiBAcGFyYW0gdnBjIFRoZSBWUEMgdG8gY3JlYXRlIHRoZSBzZWN1cml0eSBncm91cCBpblxuICAgKiBAcmV0dXJucyBUaGUgY3JlYXRlZCBzZWN1cml0eSBncm91cFxuICAgKi9cbiAgcHJpdmF0ZSBjcmVhdGVFY3NTZWN1cml0eUdyb3VwKHZwYzogZWMyLklWcGMpOiBlYzIuU2VjdXJpdHlHcm91cCB7XG4gICAgY29uc3QgZWNzU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnRUNTU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIEVDUyB0YXNrcycsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBIVFRQL0hUVFBTIHRyYWZmaWMgdG8gRUNTIHRhc2tzXG4gICAgZWNzU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg4MCksXG4gICAgICAnQWxsb3cgSFRUUCB0cmFmZmljJ1xuICAgICk7XG5cbiAgICBlY3NTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuYW55SXB2NCgpLFxuICAgICAgZWMyLlBvcnQudGNwKDQ0MyksXG4gICAgICAnQWxsb3cgSFRUUFMgdHJhZmZpYydcbiAgICApO1xuXG4gICAgZWNzU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg5MDAwKSxcbiAgICAgICdBbGxvdyBBdXRoZW50aWsgdHJhZmZpYydcbiAgICApO1xuXG4gICAgcmV0dXJuIGVjc1NlY3VyaXR5R3JvdXA7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIHNlY3VyaXR5IGdyb3VwIGZvciBkYXRhYmFzZSBhY2Nlc3NcbiAgICogQHBhcmFtIHZwYyBUaGUgVlBDIHRvIGNyZWF0ZSB0aGUgc2VjdXJpdHkgZ3JvdXAgaW5cbiAgICogQHBhcmFtIGVjc1NlY3VyaXR5R3JvdXAgVGhlIEVDUyBzZWN1cml0eSBncm91cCB0byBhbGxvdyBhY2Nlc3MgZnJvbVxuICAgKiBAcmV0dXJucyBUaGUgY3JlYXRlZCBzZWN1cml0eSBncm91cFxuICAgKi9cbiAgcHJpdmF0ZSBjcmVhdGVEYlNlY3VyaXR5R3JvdXAodnBjOiBlYzIuSVZwYywgZWNzU2VjdXJpdHlHcm91cDogZWMyLlNlY3VyaXR5R3JvdXApOiBlYzIuU2VjdXJpdHlHcm91cCB7XG4gICAgY29uc3QgZGJTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdEQlNlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBkYXRhYmFzZScsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiBmYWxzZVxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgUG9zdGdyZVNRTCBhY2Nlc3MgZnJvbSBFQ1MgdGFza3NcbiAgICBkYlNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5zZWN1cml0eUdyb3VwSWQoZWNzU2VjdXJpdHlHcm91cC5zZWN1cml0eUdyb3VwSWQpLFxuICAgICAgZWMyLlBvcnQudGNwKDU0MzIpLFxuICAgICAgJ0FsbG93IFBvc3RncmVTUUwgYWNjZXNzIGZyb20gRUNTIHRhc2tzJ1xuICAgICk7XG5cbiAgICByZXR1cm4gZGJTZWN1cml0eUdyb3VwO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBzZWN1cml0eSBncm91cCBmb3IgUmVkaXMgYWNjZXNzXG4gICAqIEBwYXJhbSB2cGMgVGhlIFZQQyB0byBjcmVhdGUgdGhlIHNlY3VyaXR5IGdyb3VwIGluXG4gICAqIEBwYXJhbSBlY3NTZWN1cml0eUdyb3VwIFRoZSBFQ1Mgc2VjdXJpdHkgZ3JvdXAgdG8gYWxsb3cgYWNjZXNzIGZyb21cbiAgICogQHJldHVybnMgVGhlIGNyZWF0ZWQgc2VjdXJpdHkgZ3JvdXBcbiAgICovXG4gIHByaXZhdGUgY3JlYXRlUmVkaXNTZWN1cml0eUdyb3VwKHZwYzogZWMyLklWcGMsIGVjc1NlY3VyaXR5R3JvdXA6IGVjMi5TZWN1cml0eUdyb3VwKTogZWMyLlNlY3VyaXR5R3JvdXAge1xuICAgIGNvbnN0IHJlZGlzU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnUmVkaXNTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgUmVkaXMnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogZmFsc2VcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IFJlZGlzIGFjY2VzcyBmcm9tIEVDUyB0YXNrc1xuICAgIHJlZGlzU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLnNlY3VyaXR5R3JvdXBJZChlY3NTZWN1cml0eUdyb3VwLnNlY3VyaXR5R3JvdXBJZCksXG4gICAgICBlYzIuUG9ydC50Y3AoNjM3OSksXG4gICAgICAnQWxsb3cgUmVkaXMgYWNjZXNzIGZyb20gRUNTIHRhc2tzJ1xuICAgICk7XG5cbiAgICByZXR1cm4gcmVkaXNTZWN1cml0eUdyb3VwO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCB0aGUgY3VycmVudCBnaXQgU0hBIGZvciB0YWdnaW5nIHJlc291cmNlc1xuICAgKiBAcmV0dXJucyBDdXJyZW50IGdpdCBTSEEgb3IgJ2RldmVsb3BtZW50JyBpZiB1bmFibGUgdG8gZGV0ZXJtaW5lXG4gICAqL1xuICBwcml2YXRlIGdldEdpdFNoYSgpOiBzdHJpbmcge1xuICAgIHRyeSB7XG4gICAgICAvLyBHZXQgdGhlIGN1cnJlbnQgZ2l0IFNIQVxuICAgICAgY29uc3QgeyBleGVjU3luYyB9ID0gcmVxdWlyZSgnY2hpbGRfcHJvY2VzcycpO1xuICAgICAgcmV0dXJuIGV4ZWNTeW5jKCdnaXQgcmV2LXBhcnNlIC0tc2hvcnQgSEVBRCcpLnRvU3RyaW5nKCkudHJpbSgpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLndhcm4oJ1VuYWJsZSB0byBnZXQgZ2l0IFNIQSwgdXNpbmcgXCJkZXZlbG9wbWVudFwiJyk7XG4gICAgICByZXR1cm4gJ2RldmVsb3BtZW50JztcbiAgICB9XG4gIH1cbn1cbiJdfQ==