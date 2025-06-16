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
        const useEnvironmentFile = Boolean(this.node.tryGetContext('useEnvironmentFile') || false);
        const hostnameAuthentik = this.node.tryGetContext('hostnameAuthentik') || 'account';
        const hostnameLdap = this.node.tryGetContext('hostnameLdap') || 'ldap';
        // Validate required parameters
        if (!authentikAdminUserEmail || authentikAdminUserEmail.trim() === '') {
            throw new Error('authentikAdminUserEmail is required. Set it via --context authentikAdminUserEmail=user@example.com');
        }
        const stackName = aws_cdk_lib_1.Fn.ref('AWS::StackName');
        const region = cdk.Stack.of(this).region;
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
        // Import KMS key from base infrastructure
        const kmsKey = kms.Key.fromKeyArn(this, 'KMSKey', aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.KMS_KEY)));
        // Import ECS Cluster from base infrastructure
        const ecsClusterArn = aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.ECS_CLUSTER));
        const ecsCluster = ecs.Cluster.fromClusterAttributes(this, 'ECSCluster', {
            clusterArn: ecsClusterArn,
            clusterName: `TAK-${stackNameComponent}-EcsCluster`, // Standard cluster name from base infra
            vpc: vpc,
            securityGroups: []
        });
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
        // S3 Environment File paths - assumes authentik-config.env already exists in S3
        const envFileS3Key = `${stackNameComponent}/authentik-config.env`;
        const envFileS3Uri = `arn:aws:s3:::${s3ConfBucket.bucketName}/${envFileS3Key}`;
        // Security Groups
        const ecsSecurityGroup = this.createEcsSecurityGroup(vpc);
        const dbSecurityGroup = this.createDbSecurityGroup(vpc, ecsSecurityGroup);
        const redisSecurityGroup = this.createRedisSecurityGroup(vpc, ecsSecurityGroup);
        // SecretsManager
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGgtaW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFFbkMsb0RBQWlEO0FBQ2pELDhDQUEyQztBQUMzQywwQ0FBdUM7QUFDdkMsa0VBQThEO0FBQzlELDBDQUF1QztBQUN2QyxvRUFBZ0U7QUFDaEUsb0VBQWdFO0FBQ2hFLDRDQUF5QztBQUN6Qyw0RUFBdUU7QUFDdkUsa0RBQStDO0FBQy9DLDBFQUFxRTtBQUNyRSw2Q0FBNkM7QUFDN0MsdUNBQTRDO0FBQzVDLHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLHVEQUF5QztBQUN6QyxxRUFBb0Y7QUFDcEYsNkRBQW9GO0FBT3BGOztHQUVHO0FBQ0gsTUFBYSxjQUFlLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDM0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEwQjtRQUNsRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRTtZQUNmLEdBQUcsS0FBSztZQUNSLFdBQVcsRUFBRSxvREFBb0Q7U0FDbEUsQ0FBQyxDQUFDO1FBRUgsTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLFdBQVcsQ0FBQztRQUVqQywrQkFBK0I7UUFDL0IsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQztRQUMvQixNQUFNLGtCQUFrQixHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxxREFBcUQ7UUFDbEcsTUFBTSxpQkFBaUIsR0FBRyxFQUFFLENBQUM7UUFFN0IsMkVBQTJFO1FBQzNFLE1BQU0sU0FBUyxHQUFHLE1BQU0sQ0FBQyxPQUFPLEtBQUssTUFBTSxDQUFDLENBQUM7WUFDM0MsRUFBRSxzQkFBc0IsRUFBRSxJQUFJLEVBQUUsd0JBQXdCLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUNsRSxFQUFF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LENBQUMsRUFDMUQsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQ2xCLG1DQUFtQyxDQUNwQyxDQUFDO1FBRUYsT0FBTyxrQkFBa0IsQ0FBQztJQUM1QixDQUFDO0lBRUQ7OztPQUdHO0lBQ0ssU0FBUztRQUNmLElBQUksQ0FBQztZQUNILDBCQUEwQjtZQUMxQixNQUFNLEVBQUUsUUFBUSxFQUFFLEdBQUcsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQzlDLE9BQU8sUUFBUSxDQUFDLDRCQUE0QixDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDbEUsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixPQUFPLENBQUMsSUFBSSxDQUFDLDRDQUE0QyxDQUFDLENBQUM7WUFDM0QsT0FBTyxhQUFhLENBQUM7UUFDdkIsQ0FBQztJQUNILENBQUM7Q0FDRjtBQWpZRCx3Q0FpWUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgeyBEYXRhYmFzZSB9IGZyb20gJy4vY29uc3RydWN0cy9kYXRhYmFzZSc7XG5pbXBvcnQgeyBSZWRpcyB9IGZyb20gJy4vY29uc3RydWN0cy9yZWRpcyc7XG5pbXBvcnQgeyBFZnMgfSBmcm9tICcuL2NvbnN0cnVjdHMvZWZzJztcbmltcG9ydCB7IFNlY3JldHNNYW5hZ2VyIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL3NlY3JldHMtbWFuYWdlcic7XG5pbXBvcnQgeyBFbGIgfSBmcm9tICcuL2NvbnN0cnVjdHMvZWxiJztcbmltcG9ydCB7IEF1dGhlbnRpa1NlcnZlciB9IGZyb20gJy4vY29uc3RydWN0cy9hdXRoZW50aWstc2VydmVyJztcbmltcG9ydCB7IEF1dGhlbnRpa1dvcmtlciB9IGZyb20gJy4vY29uc3RydWN0cy9hdXRoZW50aWstd29ya2VyJztcbmltcG9ydCB7IExkYXAgfSBmcm9tICcuL2NvbnN0cnVjdHMvbGRhcCc7XG5pbXBvcnQgeyBMZGFwVG9rZW5SZXRyaWV2ZXIgfSBmcm9tICcuL2NvbnN0cnVjdHMvbGRhcC10b2tlbi1yZXRyaWV2ZXInO1xuaW1wb3J0IHsgUm91dGU1MyB9IGZyb20gJy4vY29uc3RydWN0cy9yb3V0ZTUzJztcbmltcG9ydCB7IEVjckltYWdlVmFsaWRhdG9yIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2Vjci1pbWFnZS12YWxpZGF0b3InO1xuaW1wb3J0IHsgU3RhY2tQcm9wcywgRm4gfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyByZWdpc3Rlck91dHB1dHMgfSBmcm9tICcuL291dHB1dHMnO1xuaW1wb3J0ICogYXMgZWMyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xuaW1wb3J0ICogYXMgZWNzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3MnO1xuaW1wb3J0ICogYXMga21zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1rbXMnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCB7IGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZSwgQkFTRV9FWFBPUlRfTkFNRVMgfSBmcm9tICcuL2Nsb3VkZm9ybWF0aW9uLWltcG9ydHMnO1xuaW1wb3J0IHsgZ2V0RW52aXJvbm1lbnRDb25maWcsIG1lcmdlRW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuL2Vudmlyb25tZW50LWNvbmZpZyc7XG5pbXBvcnQgeyBBdXRoSW5mcmFDb25maWcgfSBmcm9tICcuL3N0YWNrLWNvbmZpZyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aEluZnJhU3RhY2tQcm9wcyBleHRlbmRzIFN0YWNrUHJvcHMge1xuICBzdGFja0NvbmZpZzogQXV0aEluZnJhQ29uZmlnO1xufVxuXG4vKipcbiAqIE1haW4gQ0RLIHN0YWNrIGZvciB0aGUgVEFLIEF1dGggSW5mcmFzdHJ1Y3R1cmVcbiAqL1xuZXhwb3J0IGNsYXNzIEF1dGhJbmZyYVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEF1dGhJbmZyYVN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHtcbiAgICAgIC4uLnByb3BzLFxuICAgICAgZGVzY3JpcHRpb246ICdUQUsgQXV0aGVudGljYXRpb24gTGF5ZXIgLSBBdXRoZW50aWssIExEQVAgT3V0cG9zdCcsXG4gICAgfSk7XG5cbiAgICBjb25zdCBjb25maWcgPSBwcm9wcy5zdGFja0NvbmZpZztcbiAgICBcbiAgICAvLyBFeHRyYWN0IGNvbmZpZ3VyYXRpb24gdmFsdWVzXG4gICAgY29uc3QgZW52VHlwZSA9IGNvbmZpZy5lbnZUeXBlO1xuICAgIGNvbnN0IHN0YWNrTmFtZUNvbXBvbmVudCA9IGNvbmZpZy5zdGFja05hbWU7IC8vIFRoaXMgaXMgdGhlIFNUQUNLX05BTUUgcGFydCAoZS5nLiwgXCJNeUZpcnN0U3RhY2tcIilcbiAgICBjb25zdCByZXNvbHZlZFN0YWNrTmFtZSA9IGlkO1xuICAgIFxuICAgIC8vIEdldCBlbnZpcm9ubWVudC1zcGVjaWZpYyBkZWZhdWx0cyAoZm9sbG93aW5nIHJlZmVyZW5jZSB0ZW1wbGF0ZSBwYXR0ZXJuKVxuICAgIGNvbnN0IGVudkNvbmZpZyA9IGNvbmZpZy5lbnZUeXBlID09PSAncHJvZCcgPyBcbiAgICAgIHsgZW5hYmxlSGlnaEF2YWlsYWJpbGl0eTogdHJ1ZSwgZW5hYmxlRGV0YWlsZWRNb25pdG9yaW5nOiB0cnVlIH0gOlxuICAgICAgeyBlbmFibGVIaWdoQXZhaWxhYmlsaXR5OiBmYWxzZSwgZW5hYmxlRGV0YWlsZWRNb25pdG9yaW5nOiBmYWxzZSB9O1xuICAgIFxuICAgIGNvbnN0IGVuYWJsZUhpZ2hBdmFpbGFiaWxpdHkgPSBlbnZDb25maWcuZW5hYmxlSGlnaEF2YWlsYWJpbGl0eTtcbiAgICBcbiAgICAvLyBHZXQgYmFzZSBjb25maWd1cmF0aW9uIGFuZCBtZXJnZSB3aXRoIG92ZXJyaWRlc1xuICAgIGNvbnN0IGJhc2VDb25maWcgPSBnZXRFbnZpcm9ubWVudENvbmZpZyhlbnZUeXBlKTtcbiAgICBjb25zdCBtZXJnZWRDb25maWcgPSBjb25maWcub3ZlcnJpZGVzID8gXG4gICAgICBtZXJnZUVudmlyb25tZW50Q29uZmlnKGJhc2VDb25maWcsIGNvbmZpZy5vdmVycmlkZXMpIDogXG4gICAgICBiYXNlQ29uZmlnO1xuICAgIFxuICAgIC8vIFNldCBjb250YWluZXIgY291bnRzIGJhc2VkIG9uIGhpZ2ggYXZhaWxhYmlsaXR5IHNldHRpbmdcbiAgICAvLyBlbmFibGVIaWdoQXZhaWxhYmlsaXR5PXRydWU6IDIgY29udGFpbmVycyAoU2VydmVyLCBXb3JrZXIsIExEQVApXG4gICAgLy8gZW5hYmxlSGlnaEF2YWlsYWJpbGl0eT1mYWxzZTogMSBjb250YWluZXIgZWFjaFxuICAgIGNvbnN0IGRlc2lyZWRDb250YWluZXJDb3VudCA9IGVuYWJsZUhpZ2hBdmFpbGFiaWxpdHkgPyAyIDogMTtcbiAgICBcbiAgICAvLyBPdmVycmlkZSBjb250YWluZXIgY291bnRzIGluIG1lcmdlZCBjb25maWcgdW5sZXNzIGV4cGxpY2l0bHkgc2V0IHZpYSBjb250ZXh0XG4gICAgaWYgKCFjb25maWcub3ZlcnJpZGVzPy5lY3M/LmRlc2lyZWRDb3VudCkge1xuICAgICAgbWVyZ2VkQ29uZmlnLmVjcy5kZXNpcmVkQ291bnQgPSBkZXNpcmVkQ29udGFpbmVyQ291bnQ7XG4gICAgfVxuICAgIGlmICghY29uZmlnLm92ZXJyaWRlcz8uZWNzPy53b3JrZXJEZXNpcmVkQ291bnQpIHtcbiAgICAgIG1lcmdlZENvbmZpZy5lY3Mud29ya2VyRGVzaXJlZENvdW50ID0gZGVzaXJlZENvbnRhaW5lckNvdW50O1xuICAgIH1cblxuICAgIC8vIEFkZCBFbnZpcm9ubWVudCBUeXBlIHRhZyB0byB0aGUgc3RhY2tcbiAgICBjb25zdCBlbnZpcm9ubWVudExhYmVsID0gZW52VHlwZSA9PT0gJ3Byb2QnID8gJ1Byb2QnIDogJ0Rldi1UZXN0JztcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ0Vudmlyb25tZW50IFR5cGUnLCBlbnZpcm9ubWVudExhYmVsKTtcblxuICAgIGNvbnN0IGF3c1N0YWNrTmFtZSA9IEZuLnJlZignQVdTOjpTdGFja05hbWUnKTtcbiAgICBjb25zdCBhd3NSZWdpb24gPSBjZGsuU3RhY2sub2YodGhpcykucmVnaW9uO1xuXG4gICAgLy8gQ29udGV4dC1iYXNlZCBwYXJhbWV0ZXIgcmVzb2x1dGlvbiAoQ0RLIGNvbnRleHQgb25seSlcbiAgICBjb25zdCBnaXRTaGEgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZ2l0U2hhJykgfHwgdGhpcy5nZXRHaXRTaGEoKTtcbiAgICBjb25zdCBlbmFibGVFeGVjdXRlID0gQm9vbGVhbih0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZW5hYmxlRXhlY3V0ZScpIHx8IGZhbHNlKTtcbiAgICBjb25zdCBhdXRoZW50aWtBZG1pblVzZXJFbWFpbCA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdhdXRoZW50aWtBZG1pblVzZXJFbWFpbCcpIHx8ICcnO1xuICAgIGNvbnN0IGF1dGhlbnRpa0xkYXBCYXNlRG4gPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnYXV0aGVudGlrTGRhcEJhc2VEbicpIHx8ICdEQz1leGFtcGxlLERDPWNvbSc7XG4gICAgY29uc3Qgc3NsQ2VydGlmaWNhdGVBcm4gPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnc3NsQ2VydGlmaWNhdGVBcm4nKSB8fCAnJztcbiAgICBjb25zdCB1c2VBdXRoZW50aWtDb25maWdGaWxlID0gQm9vbGVhbih0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgndXNlQXV0aGVudGlrQ29uZmlnRmlsZScpIHx8IGZhbHNlKTtcbiAgICBjb25zdCB1c2VFbnZpcm9ubWVudEZpbGUgPSBCb29sZWFuKHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCd1c2VFbnZpcm9ubWVudEZpbGUnKSB8fCBmYWxzZSk7XG4gICAgY29uc3QgaG9zdG5hbWVBdXRoZW50aWsgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnaG9zdG5hbWVBdXRoZW50aWsnKSB8fCAnYWNjb3VudCc7XG4gICAgY29uc3QgaG9zdG5hbWVMZGFwID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2hvc3RuYW1lTGRhcCcpIHx8ICdsZGFwJztcblxuICAgIC8vIFZhbGlkYXRlIHJlcXVpcmVkIHBhcmFtZXRlcnNcbiAgICBpZiAoIWF1dGhlbnRpa0FkbWluVXNlckVtYWlsIHx8IGF1dGhlbnRpa0FkbWluVXNlckVtYWlsLnRyaW0oKSA9PT0gJycpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignYXV0aGVudGlrQWRtaW5Vc2VyRW1haWwgaXMgcmVxdWlyZWQuIFNldCBpdCB2aWEgLS1jb250ZXh0IGF1dGhlbnRpa0FkbWluVXNlckVtYWlsPXVzZXJAZXhhbXBsZS5jb20nKTtcbiAgICB9XG5cbiAgICBjb25zdCBzdGFja05hbWUgPSBGbi5yZWYoJ0FXUzo6U3RhY2tOYW1lJyk7XG4gICAgY29uc3QgcmVnaW9uID0gY2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbjtcblxuICAgIC8vIEltcG9ydCBWUEMgYW5kIG5ldHdvcmtpbmcgZnJvbSBiYXNlIGluZnJhc3RydWN0dXJlXG4gICAgLy8gTm90ZTogQmFzZSBpbmZyYXN0cnVjdHVyZSBwcm92aWRlcyAyIHN1Ym5ldHMgKEEgYW5kIEIpLCBzbyB3ZSBsaW1pdCB0byAyIEFac1xuICAgIGNvbnN0IHZwY0F2YWlsYWJpbGl0eVpvbmVzID0gdGhpcy5hdmFpbGFiaWxpdHlab25lcy5zbGljZSgwLCAyKTtcbiAgICBcbiAgICBjb25zdCB2cGMgPSBlYzIuVnBjLmZyb21WcGNBdHRyaWJ1dGVzKHRoaXMsICdWUEMnLCB7XG4gICAgICB2cGNJZDogRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuVlBDX0lEKSksXG4gICAgICBhdmFpbGFiaWxpdHlab25lczogdnBjQXZhaWxhYmlsaXR5Wm9uZXMsXG4gICAgICAvLyBJbXBvcnQgc3VibmV0IElEcyBmcm9tIGJhc2UgaW5mcmFzdHJ1Y3R1cmVcbiAgICAgIHB1YmxpY1N1Ym5ldElkczogW1xuICAgICAgICBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5TVUJORVRfUFVCTElDX0EpKSxcbiAgICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuU1VCTkVUX1BVQkxJQ19CKSlcbiAgICAgIF0sXG4gICAgICBwcml2YXRlU3VibmV0SWRzOiBbXG4gICAgICAgIEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlNVQk5FVF9QUklWQVRFX0EpKSxcbiAgICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuU1VCTkVUX1BSSVZBVEVfQikpXG4gICAgICBdLFxuICAgICAgdnBjQ2lkckJsb2NrOiBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5WUENfQ0lEUl9JUFY0KSlcbiAgICB9KTtcblxuICAgIC8vIEltcG9ydCBLTVMga2V5IGZyb20gYmFzZSBpbmZyYXN0cnVjdHVyZVxuICAgIGNvbnN0IGttc0tleSA9IGttcy5LZXkuZnJvbUtleUFybih0aGlzLCAnS01TS2V5JywgXG4gICAgICBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5LTVNfS0VZKSlcbiAgICApO1xuXG4gICAgLy8gSW1wb3J0IEVDUyBDbHVzdGVyIGZyb20gYmFzZSBpbmZyYXN0cnVjdHVyZVxuICAgIGNvbnN0IGVjc0NsdXN0ZXJBcm4gPSBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5FQ1NfQ0xVU1RFUikpO1xuICAgIGNvbnN0IGVjc0NsdXN0ZXIgPSBlY3MuQ2x1c3Rlci5mcm9tQ2x1c3RlckF0dHJpYnV0ZXModGhpcywgJ0VDU0NsdXN0ZXInLCB7XG4gICAgICBjbHVzdGVyQXJuOiBlY3NDbHVzdGVyQXJuLFxuICAgICAgY2x1c3Rlck5hbWU6IGBUQUstJHtzdGFja05hbWVDb21wb25lbnR9LUVjc0NsdXN0ZXJgLCAvLyBTdGFuZGFyZCBjbHVzdGVyIG5hbWUgZnJvbSBiYXNlIGluZnJhXG4gICAgICB2cGM6IHZwYyxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbXVxuICAgIH0pO1xuXG4gICAgLy8gSW1wb3J0IFMzIGNvbmZpZ3VyYXRpb24gYnVja2V0IGZyb20gYmFzZSBpbmZyYXN0cnVjdHVyZVxuICAgIGNvbnN0IHMzQ29uZkJ1Y2tldCA9IHMzLkJ1Y2tldC5mcm9tQnVja2V0QXJuKHRoaXMsICdTM0NvbmZCdWNrZXQnLFxuICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuUzNfQlVDS0VUKSlcbiAgICApO1xuXG4gICAgLy8gSW1wb3J0IEVDUiByZXBvc2l0b3J5IGZyb20gYmFzZSBpbmZyYXN0cnVjdHVyZSAoZm9yIGxvY2FsIEVDUiBvcHRpb24pXG4gICAgY29uc3QgZWNyUmVwb3NpdG9yeSA9IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLkVDUl9SRVBPKSk7XG5cbiAgICAvLyBWYWxpZGF0ZSByZXF1aXJlZCBFQ1IgaW1hZ2VzIGV4aXN0IGJlZm9yZSBkZXBsb3ltZW50XG4gICAgY29uc3QgcmVxdWlyZWRJbWFnZVRhZ3MgPSBbXG4gICAgICBgYXV0aC1pbmZyYS1zZXJ2ZXItJHtnaXRTaGF9YCxcbiAgICAgIGBhdXRoLWluZnJhLWxkYXAtJHtnaXRTaGF9YFxuICAgIF07XG4gICAgXG4gICAgY29uc3QgZWNyVmFsaWRhdG9yID0gbmV3IEVjckltYWdlVmFsaWRhdG9yKHRoaXMsICdFY3JJbWFnZVZhbGlkYXRvcicsIHtcbiAgICAgIGVjclJlcG9zaXRvcnlBcm46IGVjclJlcG9zaXRvcnksXG4gICAgICByZXF1aXJlZEltYWdlVGFnczogcmVxdWlyZWRJbWFnZVRhZ3MsXG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50XG4gICAgfSk7XG5cbiAgICAvLyBJbXBvcnQgUm91dGU1MyBob3N0ZWQgem9uZSBmcm9tIGJhc2UgaW5mcmFzdHJ1Y3R1cmVcbiAgICBjb25zdCBob3N0ZWRab25lSWQgPSBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5IT1NURURfWk9ORV9JRCkpO1xuICAgIGNvbnN0IGhvc3RlZFpvbmVOYW1lID0gRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuSE9TVEVEX1pPTkVfTkFNRSkpO1xuXG4gICAgLy8gUzMgRW52aXJvbm1lbnQgRmlsZSBwYXRocyAtIGFzc3VtZXMgYXV0aGVudGlrLWNvbmZpZy5lbnYgYWxyZWFkeSBleGlzdHMgaW4gUzNcbiAgICBjb25zdCBlbnZGaWxlUzNLZXkgPSBgJHtzdGFja05hbWVDb21wb25lbnR9L2F1dGhlbnRpay1jb25maWcuZW52YDtcbiAgICBjb25zdCBlbnZGaWxlUzNVcmkgPSBgYXJuOmF3czpzMzo6OiR7czNDb25mQnVja2V0LmJ1Y2tldE5hbWV9LyR7ZW52RmlsZVMzS2V5fWA7XG5cbiAgICAvLyBTZWN1cml0eSBHcm91cHNcbiAgICBjb25zdCBlY3NTZWN1cml0eUdyb3VwID0gdGhpcy5jcmVhdGVFY3NTZWN1cml0eUdyb3VwKHZwYyk7XG4gICAgY29uc3QgZGJTZWN1cml0eUdyb3VwID0gdGhpcy5jcmVhdGVEYlNlY3VyaXR5R3JvdXAodnBjLCBlY3NTZWN1cml0eUdyb3VwKTtcbiAgICBjb25zdCByZWRpc1NlY3VyaXR5R3JvdXAgPSB0aGlzLmNyZWF0ZVJlZGlzU2VjdXJpdHlHcm91cCh2cGMsIGVjc1NlY3VyaXR5R3JvdXApO1xuXG4gICAgLy8gU2VjcmV0c01hbmFnZXJcbiAgICAvLyBTZWNyZXRzTWFuYWdlclxuICAgIGNvbnN0IHNlY3JldHNNYW5hZ2VyID0gbmV3IFNlY3JldHNNYW5hZ2VyKHRoaXMsICdTZWNyZXRzTWFuYWdlcicsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBzdGFja05hbWU6IHJlc29sdmVkU3RhY2tOYW1lLFxuICAgICAga21zS2V5XG4gICAgfSk7XG5cbiAgICAvLyBEYXRhYmFzZVxuICAgIGNvbnN0IGRhdGFiYXNlID0gbmV3IERhdGFiYXNlKHRoaXMsICdEYXRhYmFzZScsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBzdGFja05hbWU6IHJlc29sdmVkU3RhY2tOYW1lLFxuICAgICAgY29uZmlnOiBtZXJnZWRDb25maWcsXG4gICAgICB2cGMsXG4gICAgICBrbXNLZXksXG4gICAgICBzZWN1cml0eUdyb3VwczogW2RiU2VjdXJpdHlHcm91cF1cbiAgICB9KTtcblxuICAgIC8vIFJlZGlzXG4gICAgLy8gUmVkaXNcbiAgICBjb25zdCByZWRpcyA9IG5ldyBSZWRpcyh0aGlzLCAnUmVkaXMnLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgc3RhY2tOYW1lOiByZXNvbHZlZFN0YWNrTmFtZSxcbiAgICAgIGNvbmZpZzogbWVyZ2VkQ29uZmlnLFxuICAgICAgdnBjLFxuICAgICAga21zS2V5LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtyZWRpc1NlY3VyaXR5R3JvdXBdXG4gICAgfSk7XG5cbiAgICAvLyBFRlNcbiAgICBjb25zdCBlZnMgPSBuZXcgRWZzKHRoaXMsICdFRlMnLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgdnBjLFxuICAgICAgdnBjQ2lkckJsb2NrOiBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5WUENfQ0lEUl9JUFY0KSksXG4gICAgICBrbXNLZXksXG4gICAgICBhbGxvd0FjY2Vzc0Zyb206IFtlY3NTZWN1cml0eUdyb3VwXVxuICAgIH0pO1xuXG4gICAgLy8gQXV0aGVudGlrIExvYWQgQmFsYW5jZXJcbiAgICBjb25zdCBhdXRoZW50aWtFTEIgPSBuZXcgRWxiKHRoaXMsICdBdXRoZW50aWtFTEInLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBtZXJnZWRDb25maWcsXG4gICAgICB2cGMsXG4gICAgICBzc2xDZXJ0aWZpY2F0ZUFybjogc3NsQ2VydGlmaWNhdGVBcm5cbiAgICB9KTtcblxuICAgIC8vIEF1dGhlbnRpayBTZXJ2ZXJcbiAgICBjb25zdCBhdXRoZW50aWtTZXJ2ZXIgPSBuZXcgQXV0aGVudGlrU2VydmVyKHRoaXMsICdBdXRoZW50aWtTZXJ2ZXInLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBtZXJnZWRDb25maWcsXG4gICAgICB2cGMsXG4gICAgICBlY3NTZWN1cml0eUdyb3VwLFxuICAgICAgZWNzQ2x1c3RlcixcbiAgICAgIHMzQ29uZkJ1Y2tldCxcbiAgICAgIGVudkZpbGVTM1VyaTogZW52RmlsZVMzVXJpLFxuICAgICAgZW52RmlsZVMzS2V5OiBlbnZGaWxlUzNLZXksXG4gICAgICBhZG1pblVzZXJFbWFpbDogYXV0aGVudGlrQWRtaW5Vc2VyRW1haWwsXG4gICAgICBsZGFwQmFzZURuOiBhdXRoZW50aWtMZGFwQmFzZURuLFxuICAgICAgdXNlQ29uZmlnRmlsZTogdXNlQXV0aGVudGlrQ29uZmlnRmlsZSxcbiAgICAgIHVzZUVudmlyb25tZW50RmlsZTogdXNlRW52aXJvbm1lbnRGaWxlLFxuICAgICAgZWNyUmVwb3NpdG9yeUFybjogZWNyUmVwb3NpdG9yeSxcbiAgICAgIGdpdFNoYTogZ2l0U2hhLFxuICAgICAgZW5hYmxlRXhlY3V0ZTogZW5hYmxlRXhlY3V0ZSxcbiAgICAgIGRiU2VjcmV0OiBkYXRhYmFzZS5tYXN0ZXJTZWNyZXQsXG4gICAgICBkYkhvc3RuYW1lOiBkYXRhYmFzZS5ob3N0bmFtZSxcbiAgICAgIHJlZGlzQXV0aFRva2VuOiByZWRpcy5hdXRoVG9rZW4sXG4gICAgICByZWRpc0hvc3RuYW1lOiByZWRpcy5ob3N0bmFtZSxcbiAgICAgIHNlY3JldEtleTogc2VjcmV0c01hbmFnZXIuc2VjcmV0S2V5LFxuICAgICAgYWRtaW5Vc2VyUGFzc3dvcmQ6IHNlY3JldHNNYW5hZ2VyLmFkbWluVXNlclBhc3N3b3JkLFxuICAgICAgYWRtaW5Vc2VyVG9rZW46IHNlY3JldHNNYW5hZ2VyLmFkbWluVXNlclRva2VuLFxuICAgICAgbGRhcFRva2VuOiBzZWNyZXRzTWFuYWdlci5sZGFwVG9rZW4sXG4gICAgICBlZnNJZDogZWZzLmZpbGVTeXN0ZW0uZmlsZVN5c3RlbUlkLFxuICAgICAgZWZzTWVkaWFBY2Nlc3NQb2ludElkOiBlZnMubWVkaWFBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkLFxuICAgICAgZWZzQ3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnRJZDogZWZzLmN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWRcbiAgICB9KTtcblxuICAgIC8vIEVuc3VyZSBBdXRoZW50aWsgU2VydmVyIHdhaXRzIGZvciBFQ1IgaW1hZ2UgdmFsaWRhdGlvblxuICAgIGF1dGhlbnRpa1NlcnZlci5ub2RlLmFkZERlcGVuZGVuY3koZWNyVmFsaWRhdG9yKTtcblxuICAgIC8vIEF1dGhlbnRpayBXb3JrZXJcbiAgICBjb25zdCBhdXRoZW50aWtXb3JrZXIgPSBuZXcgQXV0aGVudGlrV29ya2VyKHRoaXMsICdBdXRoZW50aWtXb3JrZXInLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBtZXJnZWRDb25maWcsXG4gICAgICB2cGMsXG4gICAgICBlY3NTZWN1cml0eUdyb3VwLFxuICAgICAgZWNzQ2x1c3RlcixcbiAgICAgIHMzQ29uZkJ1Y2tldCxcbiAgICAgIGVudkZpbGVTM0tleTogZW52RmlsZVMzS2V5LFxuICAgICAgdXNlRW52aXJvbm1lbnRGaWxlOiB1c2VFbnZpcm9ubWVudEZpbGUsXG4gICAgICBlY3JSZXBvc2l0b3J5QXJuOiBlY3JSZXBvc2l0b3J5LFxuICAgICAgZ2l0U2hhOiBnaXRTaGEsXG4gICAgICBlbmFibGVFeGVjdXRlOiBlbmFibGVFeGVjdXRlLFxuICAgICAgZGJTZWNyZXQ6IGRhdGFiYXNlLm1hc3RlclNlY3JldCxcbiAgICAgIGRiSG9zdG5hbWU6IGRhdGFiYXNlLmhvc3RuYW1lLFxuICAgICAgcmVkaXNBdXRoVG9rZW46IHJlZGlzLmF1dGhUb2tlbixcbiAgICAgIHJlZGlzSG9zdG5hbWU6IHJlZGlzLmhvc3RuYW1lLFxuICAgICAgc2VjcmV0S2V5OiBzZWNyZXRzTWFuYWdlci5zZWNyZXRLZXksXG4gICAgICBlZnNJZDogZWZzLmZpbGVTeXN0ZW0uZmlsZVN5c3RlbUlkLFxuICAgICAgZWZzTWVkaWFBY2Nlc3NQb2ludElkOiBlZnMubWVkaWFBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkLFxuICAgICAgZWZzQ3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnRJZDogZWZzLmN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWRcbiAgICB9KTtcblxuICAgIC8vIEVuc3VyZSBBdXRoZW50aWsgV29ya2VyIHdhaXRzIGZvciBFQ1IgaW1hZ2UgdmFsaWRhdGlvblxuICAgIGF1dGhlbnRpa1dvcmtlci5ub2RlLmFkZERlcGVuZGVuY3koZWNyVmFsaWRhdG9yKTtcblxuICAgIC8vIENvbm5lY3QgQXV0aGVudGlrIFNlcnZlciB0byBMb2FkIEJhbGFuY2VyXG4gICAgYXV0aGVudGlrU2VydmVyLmNyZWF0ZVRhcmdldEdyb3VwKHZwYywgYXV0aGVudGlrRUxCLmh0dHBzTGlzdGVuZXIpO1xuXG4gICAgLy8gTERBUCBUb2tlbiBSZXRyaWV2ZXJcbiAgICBjb25zdCBsZGFwVG9rZW5SZXRyaWV2ZXIgPSBuZXcgTGRhcFRva2VuUmV0cmlldmVyKHRoaXMsICdMZGFwVG9rZW5SZXRyaWV2ZXInLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBtZXJnZWRDb25maWcsXG4gICAgICBrbXNLZXksXG4gICAgICBhdXRoZW50aWtIb3N0OiBgaHR0cHM6Ly8ke2F1dGhlbnRpa0VMQi5kbnNOYW1lfWAsXG4gICAgICBvdXRwb3N0TmFtZTogJ0xEQVAnLFxuICAgICAgYWRtaW5Ub2tlblNlY3JldDogc2VjcmV0c01hbmFnZXIuYWRtaW5Vc2VyVG9rZW4sXG4gICAgICBsZGFwVG9rZW5TZWNyZXQ6IHNlY3JldHNNYW5hZ2VyLmxkYXBUb2tlbixcbiAgICAgIGdpdFNoYTogZ2l0U2hhLFxuICAgICAgYXV0aGVudGlrU2VydmVyU2VydmljZTogYXV0aGVudGlrU2VydmVyLmVjc1NlcnZpY2UsXG4gICAgICBhdXRoZW50aWtXb3JrZXJTZXJ2aWNlOiBhdXRoZW50aWtXb3JrZXIuZWNzU2VydmljZVxuICAgIH0pO1xuXG4gICAgLy8gTERBUFxuICAgIGNvbnN0IGxkYXAgPSBuZXcgTGRhcCh0aGlzLCAnTERBUCcsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IG1lcmdlZENvbmZpZyxcbiAgICAgIHZwYyxcbiAgICAgIGVjc1NlY3VyaXR5R3JvdXAsXG4gICAgICBlY3NDbHVzdGVyLFxuICAgICAgczNDb25mQnVja2V0LFxuICAgICAgc3NsQ2VydGlmaWNhdGVBcm46IHNzbENlcnRpZmljYXRlQXJuLFxuICAgICAgYXV0aGVudGlrSG9zdDogYXV0aGVudGlrRUxCLmRuc05hbWUsXG4gICAgICBlY3JSZXBvc2l0b3J5QXJuOiBlY3JSZXBvc2l0b3J5LFxuICAgICAgZ2l0U2hhOiBnaXRTaGEsXG4gICAgICBlbmFibGVFeGVjdXRlOiBlbmFibGVFeGVjdXRlLFxuICAgICAgbGRhcFRva2VuOiBzZWNyZXRzTWFuYWdlci5sZGFwVG9rZW5cbiAgICB9KTtcblxuICAgIC8vIEVuc3VyZSBMREFQIHdhaXRzIGZvciBFQ1IgaW1hZ2UgdmFsaWRhdGlvblxuICAgIGxkYXAubm9kZS5hZGREZXBlbmRlbmN5KGVjclZhbGlkYXRvcik7XG4gICAgLy8gRW5zdXJlIExEQVAgd2FpdHMgZm9yIHRoZSB0b2tlbiB0byBiZSByZXRyaWV2ZWRcbiAgICBsZGFwLm5vZGUuYWRkRGVwZW5kZW5jeShsZGFwVG9rZW5SZXRyaWV2ZXIpO1xuXG4gICAgLy8gUm91dGU1MyBETlMgUmVjb3Jkc1xuICAgIGNvbnN0IHJvdXRlNTMgPSBuZXcgUm91dGU1Myh0aGlzLCAnUm91dGU1MycsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IG1lcmdlZENvbmZpZyxcbiAgICAgIGhvc3RlZFpvbmVJZDogaG9zdGVkWm9uZUlkLFxuICAgICAgaG9zdGVkWm9uZU5hbWU6IGhvc3RlZFpvbmVOYW1lLFxuICAgICAgaG9zdG5hbWVBdXRoZW50aWs6IGhvc3RuYW1lQXV0aGVudGlrLFxuICAgICAgaG9zdG5hbWVMZGFwOiBob3N0bmFtZUxkYXAsXG4gICAgICBhdXRoZW50aWtMb2FkQmFsYW5jZXI6IGF1dGhlbnRpa0VMQi5sb2FkQmFsYW5jZXIsXG4gICAgICBsZGFwTG9hZEJhbGFuY2VyOiBsZGFwLmxvYWRCYWxhbmNlclxuICAgIH0pO1xuXG4gICAgLy8gT3V0cHV0c1xuICAgIHJlZ2lzdGVyT3V0cHV0cyh7XG4gICAgICBzdGFjazogdGhpcyxcbiAgICAgIHN0YWNrTmFtZTogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgZGF0YWJhc2VFbmRwb2ludDogZGF0YWJhc2UuaG9zdG5hbWUsXG4gICAgICBkYXRhYmFzZVNlY3JldEFybjogZGF0YWJhc2UubWFzdGVyU2VjcmV0LnNlY3JldEFybixcbiAgICAgIHJlZGlzRW5kcG9pbnQ6IHJlZGlzLmhvc3RuYW1lLFxuICAgICAgcmVkaXNBdXRoVG9rZW5Bcm46IHJlZGlzLmF1dGhUb2tlbi5zZWNyZXRBcm4sXG4gICAgICBlZnNJZDogZWZzLmZpbGVTeXN0ZW0uZmlsZVN5c3RlbUlkLFxuICAgICAgZWZzTWVkaWFBY2Nlc3NQb2ludElkOiBlZnMubWVkaWFBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkLFxuICAgICAgZWZzVGVtcGxhdGVzQWNjZXNzUG9pbnRJZDogZWZzLmN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWQsXG4gICAgICBhdXRoZW50aWtTZWNyZXRLZXlBcm46IHNlY3JldHNNYW5hZ2VyLnNlY3JldEtleS5zZWNyZXRBcm4sXG4gICAgICBhdXRoZW50aWtBZG1pblRva2VuQXJuOiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJUb2tlbi5zZWNyZXRBcm4sXG4gICAgICBhdXRoZW50aWtMZGFwVG9rZW5Bcm46IHNlY3JldHNNYW5hZ2VyLmxkYXBUb2tlbi5zZWNyZXRBcm4sXG4gICAgICBhdXRoZW50aWtBbGJEbnM6IGF1dGhlbnRpa0VMQi5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZSxcbiAgICAgIGF1dGhlbnRpa1VybDogYGh0dHBzOi8vJHthdXRoZW50aWtFTEIuZG5zTmFtZX1gLFxuICAgICAgbGRhcE5sYkRuczogbGRhcC5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZSxcbiAgICAgIGxkYXBUb2tlblJldHJpZXZlckxhbWJkYUFybjogbGRhcFRva2VuUmV0cmlldmVyLmxhbWJkYUZ1bmN0aW9uLmZ1bmN0aW9uQXJuXG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZUVjc1NlY3VyaXR5R3JvdXAodnBjOiBlYzIuSVZwYyk6IGVjMi5TZWN1cml0eUdyb3VwIHtcbiAgICBjb25zdCBlY3NTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdFQ1NTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgRUNTIHRhc2tzJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IHRydWVcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IEhUVFAvSFRUUFMgdHJhZmZpYyB0byBFQ1MgdGFza3NcbiAgICBlY3NTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuYW55SXB2NCgpLFxuICAgICAgZWMyLlBvcnQudGNwKDgwKSxcbiAgICAgICdBbGxvdyBIVFRQIHRyYWZmaWMnXG4gICAgKTtcblxuICAgIGVjc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5hbnlJcHY0KCksXG4gICAgICBlYzIuUG9ydC50Y3AoNDQzKSxcbiAgICAgICdBbGxvdyBIVFRQUyB0cmFmZmljJ1xuICAgICk7XG5cbiAgICBlY3NTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuYW55SXB2NCgpLFxuICAgICAgZWMyLlBvcnQudGNwKDkwMDApLFxuICAgICAgJ0FsbG93IEF1dGhlbnRpayB0cmFmZmljJ1xuICAgICk7XG5cbiAgICByZXR1cm4gZWNzU2VjdXJpdHlHcm91cDtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlRGJTZWN1cml0eUdyb3VwKHZwYzogZWMyLklWcGMsIGVjc1NlY3VyaXR5R3JvdXA6IGVjMi5TZWN1cml0eUdyb3VwKTogZWMyLlNlY3VyaXR5R3JvdXAge1xuICAgIGNvbnN0IGRiU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnREJTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgZGF0YWJhc2UnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogZmFsc2VcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IFBvc3RncmVTUUwgYWNjZXNzIGZyb20gRUNTIHRhc2tzXG4gICAgZGJTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuc2VjdXJpdHlHcm91cElkKGVjc1NlY3VyaXR5R3JvdXAuc2VjdXJpdHlHcm91cElkKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg1NDMyKSxcbiAgICAgICdBbGxvdyBQb3N0Z3JlU1FMIGFjY2VzcyBmcm9tIEVDUyB0YXNrcydcbiAgICApO1xuXG4gICAgcmV0dXJuIGRiU2VjdXJpdHlHcm91cDtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlUmVkaXNTZWN1cml0eUdyb3VwKHZwYzogZWMyLklWcGMsIGVjc1NlY3VyaXR5R3JvdXA6IGVjMi5TZWN1cml0eUdyb3VwKTogZWMyLlNlY3VyaXR5R3JvdXAge1xuICAgIGNvbnN0IHJlZGlzU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnUmVkaXNTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgUmVkaXMnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogZmFsc2VcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IFJlZGlzIGFjY2VzcyBmcm9tIEVDUyB0YXNrc1xuICAgIHJlZGlzU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLnNlY3VyaXR5R3JvdXBJZChlY3NTZWN1cml0eUdyb3VwLnNlY3VyaXR5R3JvdXBJZCksXG4gICAgICBlYzIuUG9ydC50Y3AoNjM3OSksXG4gICAgICAnQWxsb3cgUmVkaXMgYWNjZXNzIGZyb20gRUNTIHRhc2tzJ1xuICAgICk7XG5cbiAgICByZXR1cm4gcmVkaXNTZWN1cml0eUdyb3VwO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCB0aGUgY3VycmVudCBnaXQgU0hBIGZvciB0YWdnaW5nIHJlc291cmNlc1xuICAgKiBAcmV0dXJucyBDdXJyZW50IGdpdCBTSEFcbiAgICovXG4gIHByaXZhdGUgZ2V0R2l0U2hhKCk6IHN0cmluZyB7XG4gICAgdHJ5IHtcbiAgICAgIC8vIEdldCB0aGUgY3VycmVudCBnaXQgU0hBXG4gICAgICBjb25zdCB7IGV4ZWNTeW5jIH0gPSByZXF1aXJlKCdjaGlsZF9wcm9jZXNzJyk7XG4gICAgICByZXR1cm4gZXhlY1N5bmMoJ2dpdCByZXYtcGFyc2UgLS1zaG9ydCBIRUFEJykudG9TdHJpbmcoKS50cmltKCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUud2FybignVW5hYmxlIHRvIGdldCBnaXQgU0hBLCB1c2luZyBcImRldmVsb3BtZW50XCInKTtcbiAgICAgIHJldHVybiAnZGV2ZWxvcG1lbnQnO1xuICAgIH1cbiAgfVxufVxuIl19