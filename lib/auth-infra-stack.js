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
const route53_authentik_1 = require("./constructs/route53-authentik");
const ecr_image_validator_1 = require("./constructs/ecr-image-validator");
// Utility imports
const outputs_1 = require("./outputs");
const cloudformation_imports_1 = require("./cloudformation-imports");
/**
 * Main CDK stack for the TAK Auth Infrastructure
 */
class AuthInfraStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, {
            ...props,
            description: 'TAK Authentication Layer - Authentik, LDAP Outpost',
        });
        const { stackConfig, environmentConfig, computedValues } = props.configResult;
        // Extract configuration values
        const envType = stackConfig.envType;
        const stackNameComponent = stackConfig.stackName; // This is the STACK_NAME part (e.g., "MyFirstStack")
        const resolvedStackName = id;
        // Use computed values from configuration
        const enableHighAvailability = computedValues.enableHighAvailability;
        const enableDetailedMonitoring = computedValues.enableDetailedMonitoring;
        // Add Environment Type tag to the stack
        cdk.Tags.of(this).add('Environment Type', computedValues.environmentLabel);
        const stackName = aws_cdk_lib_1.Fn.ref('AWS::StackName');
        const region = cdk.Stack.of(this).region;
        // Context-based parameter resolution
        const gitSha = this.node.tryGetContext('calculatedGitSha') || 'development';
        const enableExecute = Boolean(this.node.tryGetContext('enableExecute') || false);
        const authentikAdminUserEmail = this.node.tryGetContext('validatedAuthentikAdminUserEmail') || '';
        const useAuthentikConfigFile = Boolean(this.node.tryGetContext('useAuthentikConfigFile') || false);
        const ldapBaseDn = this.node.tryGetContext('ldapBaseDn') || 'dc=example,dc=com';
        const hostnameAuthentik = this.node.tryGetContext('hostnameAuthentik') || 'account';
        const hostnameLdap = this.node.tryGetContext('hostnameLdap') || 'ldap';
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
        // Extract cluster name from ARN: arn:aws:ecs:region:account:cluster/cluster-name
        const ecsClusterName = aws_cdk_lib_1.Fn.select(1, aws_cdk_lib_1.Fn.split('/', ecsClusterArn));
        const ecsCluster = ecs.Cluster.fromClusterAttributes(this, 'ECSCluster', {
            clusterArn: ecsClusterArn,
            clusterName: ecsClusterName,
            vpc: vpc
        });
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
        const envFileS3Key = `authentik-config.env`;
        const envFileS3Uri = `arn:aws:s3:::${s3ConfBucket.bucketName}/${envFileS3Key}`;
        // =================
        // SECURITY GROUPS
        // =================
        // Security Groups
        const ecsSecurityGroup = this.createEcsSecurityGroup(vpc);
        const dbSecurityGroup = this.createDbSecurityGroup(vpc, ecsSecurityGroup);
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
            config: environmentConfig,
            vpc,
            kmsKey,
            securityGroups: [dbSecurityGroup]
        });
        // Redis
        const redis = new redis_1.Redis(this, 'Redis', {
            environment: stackNameComponent,
            stackName: resolvedStackName,
            config: environmentConfig,
            vpc,
            kmsKey,
            securityGroups: [ecsSecurityGroup]
        });
        // EFS
        const efs = new efs_1.Efs(this, 'EFS', {
            environment: stackNameComponent,
            config: environmentConfig,
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
            environment: stackNameComponent,
            config: environmentConfig
        });
        // =================
        // APPLICATION SERVICES
        // =================
        // Authentik Load Balancer
        const authentikELB = new elb_1.Elb(this, 'AuthentikELB', {
            environment: stackNameComponent,
            config: environmentConfig,
            vpc,
            sslCertificateArn: sslCertificateArn
        });
        // Authentik Server
        const authentikServer = new authentik_server_1.AuthentikServer(this, 'AuthentikServer', {
            environment: stackNameComponent,
            config: environmentConfig,
            vpc,
            ecsSecurityGroup,
            ecsCluster,
            s3ConfBucket,
            envFileS3Uri: envFileS3Uri,
            envFileS3Key: envFileS3Key,
            adminUserEmail: authentikAdminUserEmail,
            ldapBaseDn: ldapBaseDn,
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
            kmsKey,
            efsId: efs.fileSystem.fileSystemId,
            efsMediaAccessPointId: efs.mediaAccessPoint.accessPointId,
            efsCustomTemplatesAccessPointId: efs.customTemplatesAccessPoint.accessPointId
        });
        // Ensure Authentik Server waits for ECR image validation
        authentikServer.node.addDependency(ecrValidator);
        // Authentik Worker
        const authentikWorker = new authentik_worker_1.AuthentikWorker(this, 'AuthentikWorker', {
            environment: stackNameComponent,
            config: environmentConfig,
            vpc,
            ecsSecurityGroup,
            ecsCluster,
            s3ConfBucket,
            envFileS3Key: envFileS3Key,
            useAuthentikConfigFile: useAuthentikConfigFile,
            adminUserEmail: authentikAdminUserEmail,
            ldapBaseDn: ldapBaseDn,
            ldapServiceUser: secretsManager.ldapServiceUser,
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
            kmsKey,
            efsId: efs.fileSystem.fileSystemId,
            efsMediaAccessPointId: efs.mediaAccessPoint.accessPointId,
            efsCustomTemplatesAccessPointId: efs.customTemplatesAccessPoint.accessPointId,
            authentikHost: `https://${hostnameAuthentik}.${hostedZoneName}`
        });
        // Ensure Authentik Worker waits for ECR image validation
        authentikWorker.node.addDependency(ecrValidator);
        // Connect Authentik Server to Load Balancer
        authentikServer.createTargetGroup(vpc, authentikELB.httpsListener);
        // =================
        // DNS SETUP (AUTHENTIK)
        // =================
        // Route53 Authentik DNS Records (needed before LDAP token retriever)
        const route53Authentik = new route53_authentik_1.Route53Authentik(this, 'Route53Authentik', {
            environment: stackNameComponent,
            config: environmentConfig,
            hostedZoneId: hostedZoneId,
            hostedZoneName: hostedZoneName,
            hostnameAuthentik: hostnameAuthentik,
            authentikLoadBalancer: authentikELB.loadBalancer
        });
        // =================
        // LDAP CONFIGURATION
        // =================
        // LDAP Token Retriever
        const ldapTokenRetriever = new ldap_token_retriever_1.LdapTokenRetriever(this, 'LdapTokenRetriever', {
            environment: stackNameComponent,
            config: environmentConfig,
            kmsKey,
            // Use proper FQDN that matches TLS certificate, not ELB DNS name
            authentikHost: route53Authentik.getAuthentikUrl(),
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
            config: environmentConfig,
            vpc,
            ecsSecurityGroup,
            ecsCluster,
            s3ConfBucket,
            sslCertificateArn: sslCertificateArn,
            authentikHost: route53Authentik.authentikFqdn,
            ecrRepositoryArn: ecrRepository,
            gitSha: gitSha,
            enableExecute: enableExecute,
            kmsKey,
            ldapToken: secretsManager.ldapToken
        });
        // Ensure LDAP waits for ECR image validation
        ldap.node.addDependency(ecrValidator);
        // Ensure LDAP waits for the token to be retrieved
        ldap.node.addDependency(ldapTokenRetriever);
        // =================
        // DNS AND ROUTING
        // =================
        // =================
        // DNS SETUP (LDAP)
        // =================
        // Route53 LDAP DNS Records (after LDAP construct is created)
        const route53 = new route53_1.Route53(this, 'Route53', {
            environment: stackNameComponent,
            config: environmentConfig,
            hostedZoneId: hostedZoneId,
            hostedZoneName: hostedZoneName,
            hostnameLdap: hostnameLdap,
            ldapLoadBalancer: ldap.loadBalancer
        });
        // Add dependency for LDAP token retriever to wait for Authentik DNS records
        ldapTokenRetriever.customResource.node.addDependency(route53Authentik.authentikARecord);
        ldapTokenRetriever.customResource.node.addDependency(route53Authentik.authentikAAAARecord);
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
}
exports.AuthInfraStack = AuthInfraStack;
/**
 * Converts an ECR repository ARN to a proper ECR repository URI for Docker images
 * @param ecrArn - ECR repository ARN (e.g., "arn:aws:ecr:region:account:repository/repo-name")
 * @returns ECR repository URI (e.g., "account.dkr.ecr.region.amazonaws.com/repo-name")
 */
function convertEcrArnToRepositoryUri(ecrArn) {
    // Parse ARN: arn:aws:ecr:region:account:repository/repo-name
    const arnParts = ecrArn.split(':');
    if (arnParts.length !== 6 || !arnParts[5].startsWith('repository/')) {
        throw new Error(`Invalid ECR repository ARN format: ${ecrArn}`);
    }
    const region = arnParts[3];
    const account = arnParts[4];
    const repositoryName = arnParts[5].replace('repository/', '');
    return `${account}.dkr.ecr.${region}.amazonaws.com/${repositoryName}`;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGgtaW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFFbkMsNkNBQXVFO0FBQ3ZFLHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLHVEQUF5QztBQUV6QyxvQkFBb0I7QUFDcEIsb0RBQWlEO0FBQ2pELDhDQUEyQztBQUMzQywwQ0FBdUM7QUFDdkMsa0VBQThEO0FBQzlELDBDQUF1QztBQUN2QyxvRUFBZ0U7QUFDaEUsb0VBQWdFO0FBQ2hFLDRDQUF5QztBQUN6Qyw0RUFBdUU7QUFDdkUsa0RBQStDO0FBQy9DLHNFQUFrRTtBQUNsRSwwRUFBcUU7QUFFckUsa0JBQWtCO0FBQ2xCLHVDQUE0QztBQUM1QyxxRUFBb0Y7QUFPcEY7O0dBRUc7QUFDSCxNQUFhLGNBQWUsU0FBUSxHQUFHLENBQUMsS0FBSztJQUMzQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTBCO1FBQ2xFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFO1lBQ2YsR0FBRyxLQUFLO1lBQ1IsV0FBVyxFQUFFLG9EQUFvRDtTQUNsRSxDQUFDLENBQUM7UUFFSCxNQUFNLEVBQ0osV0FBVyxFQUNYLGlCQUFpQixFQUNqQixjQUFjLEVBQ2YsR0FBRyxLQUFLLENBQUMsWUFBWSxDQUFDO1FBRXZCLCtCQUErQjtRQUMvQixNQUFNLE9BQU8sR0FBRyxXQUFXLENBQUMsT0FBTyxDQUFDO1FBQ3BDLE1BQU0sa0JBQWtCLEdBQUcsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDLHFEQUFxRDtRQUN2RyxNQUFNLGlCQUFpQixHQUFHLEVBQUUsQ0FBQztRQUU3Qix5Q0FBeUM7UUFDekMsTUFBTSxzQkFBc0IsR0FBRyxjQUFjLENBQUMsc0JBQXNCLENBQUM7UUFDckUsTUFBTSx3QkFBd0IsR0FBRyxjQUFj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QUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztRQUNwRSxNQUFNLElBQUksS0FBSyxDQUFDLHNDQUFzQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQ2xFLENBQUM7SUFFRCxNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDM0IsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzVCLE1BQU0sY0FBYyxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBRTlELE9BQU8sR0FBRyxPQUFPLFlBQVksTUFBTSxrQkFBa0IsY0FBYyxFQUFFLENBQUM7QUFDeEUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7IFJlbW92YWxQb2xpY3ksIFN0YWNrUHJvcHMsIEZuLCBDZm5PdXRwdXQgfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBlYzIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjMic7XG5pbXBvcnQgKiBhcyBlY3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjcyc7XG5pbXBvcnQgKiBhcyBrbXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWttcyc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuXG4vLyBDb25zdHJ1Y3QgaW1wb3J0c1xuaW1wb3J0IHsgRGF0YWJhc2UgfSBmcm9tICcuL2NvbnN0cnVjdHMvZGF0YWJhc2UnO1xuaW1wb3J0IHsgUmVkaXMgfSBmcm9tICcuL2NvbnN0cnVjdHMvcmVkaXMnO1xuaW1wb3J0IHsgRWZzIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2Vmcyc7XG5pbXBvcnQgeyBTZWNyZXRzTWFuYWdlciB9IGZyb20gJy4vY29uc3RydWN0cy9zZWNyZXRzLW1hbmFnZXInO1xuaW1wb3J0IHsgRWxiIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2VsYic7XG5pbXBvcnQgeyBBdXRoZW50aWtTZXJ2ZXIgfSBmcm9tICcuL2NvbnN0cnVjdHMvYXV0aGVudGlrLXNlcnZlcic7XG5pbXBvcnQgeyBBdXRoZW50aWtXb3JrZXIgfSBmcm9tICcuL2NvbnN0cnVjdHMvYXV0aGVudGlrLXdvcmtlcic7XG5pbXBvcnQgeyBMZGFwIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2xkYXAnO1xuaW1wb3J0IHsgTGRhcFRva2VuUmV0cmlldmVyIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2xkYXAtdG9rZW4tcmV0cmlldmVyJztcbmltcG9ydCB7IFJvdXRlNTMgfSBmcm9tICcuL2NvbnN0cnVjdHMvcm91dGU1Myc7XG5pbXBvcnQgeyBSb3V0ZTUzQXV0aGVudGlrIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL3JvdXRlNTMtYXV0aGVudGlrJztcbmltcG9ydCB7IEVjckltYWdlVmFsaWRhdG9yIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2Vjci1pbWFnZS12YWxpZGF0b3InO1xuXG4vLyBVdGlsaXR5IGltcG9ydHNcbmltcG9ydCB7IHJlZ2lzdGVyT3V0cHV0cyB9IGZyb20gJy4vb3V0cHV0cyc7XG5pbXBvcnQgeyBjcmVhdGVCYXNlSW1wb3J0VmFsdWUsIEJBU0VfRVhQT1JUX05BTUVTIH0gZnJvbSAnLi9jbG91ZGZvcm1hdGlvbi1pbXBvcnRzJztcbmltcG9ydCB7IEF1dGhJbmZyYUNvbmZpZ1Jlc3VsdCB9IGZyb20gJy4vc3RhY2stY29uZmlnJztcblxuZXhwb3J0IGludGVyZmFjZSBBdXRoSW5mcmFTdGFja1Byb3BzIGV4dGVuZHMgU3RhY2tQcm9wcyB7XG4gIGNvbmZpZ1Jlc3VsdDogQXV0aEluZnJhQ29uZmlnUmVzdWx0O1xufVxuXG4vKipcbiAqIE1haW4gQ0RLIHN0YWNrIGZvciB0aGUgVEFLIEF1dGggSW5mcmFzdHJ1Y3R1cmVcbiAqL1xuZXhwb3J0IGNsYXNzIEF1dGhJbmZyYVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEF1dGhJbmZyYVN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHtcbiAgICAgIC4uLnByb3BzLFxuICAgICAgZGVzY3JpcHRpb246ICdUQUsgQXV0aGVudGljYXRpb24gTGF5ZXIgLSBBdXRoZW50aWssIExEQVAgT3V0cG9zdCcsXG4gICAgfSk7XG5cbiAgICBjb25zdCB7IFxuICAgICAgc3RhY2tDb25maWcsIFxuICAgICAgZW52aXJvbm1lbnRDb25maWcsIFxuICAgICAgY29tcHV0ZWRWYWx1ZXMgXG4gICAgfSA9IHByb3BzLmNvbmZpZ1Jlc3VsdDtcbiAgICBcbiAgICAvLyBFeHRyYWN0IGNvbmZpZ3VyYXRpb24gdmFsdWVzXG4gICAgY29uc3QgZW52VHlwZSA9IHN0YWNrQ29uZmlnLmVudlR5cGU7XG4gICAgY29uc3Qgc3RhY2tOYW1lQ29tcG9uZW50ID0gc3RhY2tDb25maWcuc3RhY2tOYW1lOyAvLyBUaGlzIGlzIHRoZSBTVEFDS19OQU1FIHBhcnQgKGUuZy4sIFwiTXlGaXJzdFN0YWNrXCIpXG4gICAgY29uc3QgcmVzb2x2ZWRTdGFja05hbWUgPSBpZDtcbiAgICBcbiAgICAvLyBVc2UgY29tcHV0ZWQgdmFsdWVzIGZyb20gY29uZmlndXJhdGlvblxuICAgIGNvbnN0IGVuYWJsZUhpZ2hBdmFpbGFiaWxpdHkgPSBjb21wdXRlZFZhbHVlcy5lbmFibGVIaWdoQXZhaWxhYmlsaXR5O1xuICAgIGNvbnN0IGVuYWJsZURldGFpbGVkTW9uaXRvcmluZyA9IGNvbXB1dGVkVmFsdWVzLmVuYWJsZURldGFpbGVkTW9uaXRvcmluZztcblxuICAgIC8vIEFkZCBFbnZpcm9ubWVudCBUeXBlIHRhZyB0byB0aGUgc3RhY2tcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ0Vudmlyb25tZW50IFR5cGUnLCBjb21wdXRlZFZhbHVlcy5lbnZpcm9ubWVudExhYmVsKTtcblxuICAgIGNvbnN0IHN0YWNrTmFtZSA9IEZuLnJlZignQVdTOjpTdGFja05hbWUnKTtcbiAgICBjb25zdCByZWdpb24gPSBjZGsuU3RhY2sub2YodGhpcykucmVnaW9uO1xuXG4gICAgLy8gQ29udGV4dC1iYXNlZCBwYXJhbWV0ZXIgcmVzb2x1dGlvblxuICAgIGNvbnN0IGdpdFNoYSA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdjYWxjdWxhdGVkR2l0U2hhJykgfHwgJ2RldmVsb3BtZW50JztcbiAgICBjb25zdCBlbmFibGVFeGVjdXRlID0gQm9vbGVhbih0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnZW5hYmxlRXhlY3V0ZScpIHx8IGZhbHNlKTtcbiAgICBjb25zdCBhdXRoZW50aWtBZG1pblVzZXJFbWFpbCA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCd2YWxpZGF0ZWRBdXRoZW50aWtBZG1pblVzZXJFbWFpbCcpIHx8ICcnO1xuICAgIGNvbnN0IHVzZUF1dGhlbnRpa0NvbmZpZ0ZpbGUgPSBCb29sZWFuKHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCd1c2VBdXRoZW50aWtDb25maWdGaWxlJykgfHwgZmFsc2UpO1xuICAgIGNvbnN0IGxkYXBCYXNlRG4gPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnbGRhcEJhc2VEbicpIHx8ICdkYz1leGFtcGxlLGRjPWNvbSc7XG4gICAgY29uc3QgaG9zdG5hbWVBdXRoZW50aWsgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnaG9zdG5hbWVBdXRoZW50aWsnKSB8fCAnYWNjb3VudCc7XG4gICAgY29uc3QgaG9zdG5hbWVMZGFwID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2hvc3RuYW1lTGRhcCcpIHx8ICdsZGFwJztcblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gSU1QT1JUIEJBU0UgSU5GUkFTVFJVQ1RVUkUgUkVTT1VSQ0VTXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIEltcG9ydCBWUEMgYW5kIG5ldHdvcmtpbmcgZnJvbSBiYXNlIGluZnJhc3RydWN0dXJlXG4gICAgLy8gTm90ZTogQmFzZSBpbmZyYXN0cnVjdHVyZSBwcm92aWRlcyAyIHN1Ym5ldHMgKEEgYW5kIEIpLCBzbyB3ZSBsaW1pdCB0byAyIEFac1xuICAgIGNvbnN0IHZwY0F2YWlsYWJpbGl0eVpvbmVzID0gdGhpcy5hdmFpbGFiaWxpdHlab25lcy5zbGljZSgwLCAyKTtcbiAgICBcbiAgICBjb25zdCB2cGMgPSBlYzIuVnBjLmZyb21WcGNBdHRyaWJ1dGVzKHRoaXMsICdWUEMnLCB7XG4gICAgICB2cGNJZDogRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuVlBDX0lEKSksXG4gICAgICBhdmFpbGFiaWxpdHlab25lczogdnBjQXZhaWxhYmlsaXR5Wm9uZXMsXG4gICAgICAvLyBJbXBvcnQgc3VibmV0IElEcyBmcm9tIGJhc2UgaW5mcmFzdHJ1Y3R1cmVcbiAgICAgIHB1YmxpY1N1Ym5ldElkczogW1xuICAgICAgICBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5TVUJORVRfUFVCTElDX0EpKSxcbiAgICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuU1VCTkVUX1BVQkxJQ19CKSlcbiAgICAgIF0sXG4gICAgICBwcml2YXRlU3VibmV0SWRzOiBbXG4gICAgICAgIEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlNVQk5FVF9QUklWQVRFX0EpKSxcbiAgICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuU1VCTkVUX1BSSVZBVEVfQikpXG4gICAgICBdLFxuICAgICAgdnBjQ2lkckJsb2NrOiBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5WUENfQ0lEUl9JUFY0KSlcbiAgICB9KTtcblxuICAgIC8vIEtNU1xuICAgIGNvbnN0IGttc0tleSA9IGttcy5LZXkuZnJvbUtleUFybih0aGlzLCAnS01TS2V5JywgXG4gICAgICBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5LTVNfS0VZKSlcbiAgICApO1xuXG4gICAgLy8gRUNTXG4gICAgY29uc3QgZWNzQ2x1c3RlckFybiA9IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLkVDU19DTFVTVEVSKSk7XG4gICAgLy8gRXh0cmFjdCBjbHVzdGVyIG5hbWUgZnJvbSBBUk46IGFybjphd3M6ZWNzOnJlZ2lvbjphY2NvdW50OmNsdXN0ZXIvY2x1c3Rlci1uYW1lXG4gICAgY29uc3QgZWNzQ2x1c3Rlck5hbWUgPSBGbi5zZWxlY3QoMSwgRm4uc3BsaXQoJy8nLCBlY3NDbHVzdGVyQXJuKSk7XG4gICAgY29uc3QgZWNzQ2x1c3RlciA9IGVjcy5DbHVzdGVyLmZyb21DbHVzdGVyQXR0cmlidXRlcyh0aGlzLCAnRUNTQ2x1c3RlcicsIHtcbiAgICAgIGNsdXN0ZXJBcm46IGVjc0NsdXN0ZXJBcm4sXG4gICAgICBjbHVzdGVyTmFtZTogZWNzQ2x1c3Rlck5hbWUsXG4gICAgICB2cGM6IHZwY1xuICAgIH0pO1xuXG4gICAgLy8gUzNcbiAgICBjb25zdCBzM0NvbmZCdWNrZXQgPSBzMy5CdWNrZXQuZnJvbUJ1Y2tldEFybih0aGlzLCAnUzNDb25mQnVja2V0JyxcbiAgICAgIEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlMzX0JVQ0tFVCkpXG4gICAgKTtcblxuICAgIC8vIEVDUlxuICAgIGNvbnN0IGVjclJlcG9zaXRvcnkgPSBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5FQ1JfUkVQTykpO1xuXG4gICAgLy8gUm91dGU1M1xuICAgIGNvbnN0IGhvc3RlZFpvbmVJZCA9IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLkhPU1RFRF9aT05FX0lEKSk7XG4gICAgY29uc3QgaG9zdGVkWm9uZU5hbWUgPSBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5IT1NURURfWk9ORV9OQU1FKSk7XG5cbiAgICAvLyBTU0wgQ2VydGlmaWNhdGVcbiAgICBjb25zdCBzc2xDZXJ0aWZpY2F0ZUFybiA9IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLkNFUlRJRklDQVRFX0FSTikpO1xuXG4gICAgLy8gQWRkIEROUyBkb21haW4gbmFtZSB0YWdcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ0ROUyBab25lJywgaG9zdGVkWm9uZU5hbWUpO1xuXG4gICAgLy8gUzMgRW52aXJvbm1lbnQgRmlsZSBwYXRocyAtIGFzc3VtZXMgYXV0aGVudGlrLWNvbmZpZy5lbnYgYWxyZWFkeSBleGlzdHMgaW4gUzNcbiAgICBjb25zdCBlbnZGaWxlUzNLZXkgPSBgYXV0aGVudGlrLWNvbmZpZy5lbnZgO1xuICAgIGNvbnN0IGVudkZpbGVTM1VyaSA9IGBhcm46YXdzOnMzOjo6JHtzM0NvbmZCdWNrZXQuYnVja2V0TmFtZX0vJHtlbnZGaWxlUzNLZXl9YDtcblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gU0VDVVJJVFkgR1JPVVBTXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIFNlY3VyaXR5IEdyb3Vwc1xuICAgIGNvbnN0IGVjc1NlY3VyaXR5R3JvdXAgPSB0aGlzLmNyZWF0ZUVjc1NlY3VyaXR5R3JvdXAodnBjKTtcbiAgICBjb25zdCBkYlNlY3VyaXR5R3JvdXAgPSB0aGlzLmNyZWF0ZURiU2VjdXJpdHlHcm91cCh2cGMsIGVjc1NlY3VyaXR5R3JvdXApO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBDT1JFIElORlJBU1RSVUNUVVJFXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIFNlY3JldHNNYW5hZ2VyXG4gICAgY29uc3Qgc2VjcmV0c01hbmFnZXIgPSBuZXcgU2VjcmV0c01hbmFnZXIodGhpcywgJ1NlY3JldHNNYW5hZ2VyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIHN0YWNrTmFtZTogcmVzb2x2ZWRTdGFja05hbWUsXG4gICAgICBrbXNLZXlcbiAgICB9KTtcblxuICAgIC8vIERhdGFiYXNlXG4gICAgY29uc3QgZGF0YWJhc2UgPSBuZXcgRGF0YWJhc2UodGhpcywgJ0RhdGFiYXNlJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIHN0YWNrTmFtZTogcmVzb2x2ZWRTdGFja05hbWUsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAgdnBjLFxuICAgICAga21zS2V5LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtkYlNlY3VyaXR5R3JvdXBdXG4gICAgfSk7XG5cbiAgICAvLyBSZWRpc1xuICAgIGNvbnN0IHJlZGlzID0gbmV3IFJlZGlzKHRoaXMsICdSZWRpcycsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBzdGFja05hbWU6IHJlc29sdmVkU3RhY2tOYW1lLFxuICAgICAgY29uZmlnOiBlbnZpcm9ubWVudENvbmZpZyxcbiAgICAgIHZwYyxcbiAgICAgIGttc0tleSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbZWNzU2VjdXJpdHlHcm91cF1cbiAgICB9KTtcblxuICAgIC8vIEVGU1xuICAgIGNvbnN0IGVmcyA9IG5ldyBFZnModGhpcywgJ0VGUycsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAgdnBjLFxuICAgICAgdnBjQ2lkckJsb2NrOiBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5WUENfQ0lEUl9JUFY0KSksXG4gICAgICBrbXNLZXksXG4gICAgICBhbGxvd0FjY2Vzc0Zyb206IFtlY3NTZWN1cml0eUdyb3VwXVxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBJTUFHRSBWQUxJREFUSU9OXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIFZhbGlkYXRlIHJlcXVpcmVkIEVDUiBpbWFnZXMgZXhpc3QgYmVmb3JlIGRlcGxveW1lbnRcbiAgICBjb25zdCByZXF1aXJlZEltYWdlVGFncyA9IFtcbiAgICAgIGBhdXRoLWluZnJhLXNlcnZlci0ke2dpdFNoYX1gLFxuICAgICAgYGF1dGgtaW5mcmEtbGRhcC0ke2dpdFNoYX1gXG4gICAgXTtcbiAgICBcbiAgICBjb25zdCBlY3JWYWxpZGF0b3IgPSBuZXcgRWNySW1hZ2VWYWxpZGF0b3IodGhpcywgJ0VjckltYWdlVmFsaWRhdG9yJywge1xuICAgICAgZWNyUmVwb3NpdG9yeUFybjogZWNyUmVwb3NpdG9yeSxcbiAgICAgIHJlcXVpcmVkSW1hZ2VUYWdzOiByZXF1aXJlZEltYWdlVGFncyxcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIEFQUExJQ0FUSU9OIFNFUlZJQ0VTXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIEF1dGhlbnRpayBMb2FkIEJhbGFuY2VyXG4gICAgY29uc3QgYXV0aGVudGlrRUxCID0gbmV3IEVsYih0aGlzLCAnQXV0aGVudGlrRUxCJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogZW52aXJvbm1lbnRDb25maWcsXG4gICAgICB2cGMsXG4gICAgICBzc2xDZXJ0aWZpY2F0ZUFybjogc3NsQ2VydGlmaWNhdGVBcm5cbiAgICB9KTtcblxuICAgIC8vIEF1dGhlbnRpayBTZXJ2ZXJcbiAgICBjb25zdCBhdXRoZW50aWtTZXJ2ZXIgPSBuZXcgQXV0aGVudGlrU2VydmVyKHRoaXMsICdBdXRoZW50aWtTZXJ2ZXInLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBlbnZpcm9ubWVudENvbmZpZyxcbiAgICAgIHZwYyxcbiAgICAgIGVjc1NlY3VyaXR5R3JvdXAsXG4gICAgICBlY3NDbHVzdGVyLFxuICAgICAgczNDb25mQnVja2V0LFxuICAgICAgZW52RmlsZVMzVXJpOiBlbnZGaWxlUzNVcmksXG4gICAgICBlbnZGaWxlUzNLZXk6IGVudkZpbGVTM0tleSxcbiAgICAgIGFkbWluVXNlckVtYWlsOiBhdXRoZW50aWtBZG1pblVzZXJFbWFpbCxcbiAgICAgIGxkYXBCYXNlRG46IGxkYXBCYXNlRG4sXG4gICAgICB1c2VBdXRoZW50aWtDb25maWdGaWxlOiB1c2VBdXRoZW50aWtDb25maWdGaWxlLFxuICAgICAgZWNyUmVwb3NpdG9yeUFybjogZWNyUmVwb3NpdG9yeSxcbiAgICAgIGdpdFNoYTogZ2l0U2hhLFxuICAgICAgZW5hYmxlRXhlY3V0ZTogZW5hYmxlRXhlY3V0ZSxcbiAgICAgIGRiU2VjcmV0OiBkYXRhYmFzZS5tYXN0ZXJTZWNyZXQsXG4gICAgICBkYkhvc3RuYW1lOiBkYXRhYmFzZS5ob3N0bmFtZSxcbiAgICAgIHJlZGlzQXV0aFRva2VuOiByZWRpcy5hdXRoVG9rZW4sXG4gICAgICByZWRpc0hvc3RuYW1lOiByZWRpcy5ob3N0bmFtZSxcbiAgICAgIHNlY3JldEtleTogc2VjcmV0c01hbmFnZXIuc2VjcmV0S2V5LFxuICAgICAgYWRtaW5Vc2VyUGFzc3dvcmQ6IHNlY3JldHNNYW5hZ2VyLmFkbWluVXNlclBhc3N3b3JkLFxuICAgICAgYWRtaW5Vc2VyVG9rZW46IHNlY3JldHNNYW5hZ2VyLmFkbWluVXNlclRva2VuLFxuICAgICAgbGRhcFRva2VuOiBzZWNyZXRzTWFuYWdlci5sZGFwVG9rZW4sXG4gICAgICBrbXNLZXksXG4gICAgICBlZnNJZDogZWZzLmZpbGVTeXN0ZW0uZmlsZVN5c3RlbUlkLFxuICAgICAgZWZzTWVkaWFBY2Nlc3NQb2ludElkOiBlZnMubWVkaWFBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkLFxuICAgICAgZWZzQ3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnRJZDogZWZzLmN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWRcbiAgICB9KTtcblxuICAgIC8vIEVuc3VyZSBBdXRoZW50aWsgU2VydmVyIHdhaXRzIGZvciBFQ1IgaW1hZ2UgdmFsaWRhdGlvblxuICAgIGF1dGhlbnRpa1NlcnZlci5ub2RlLmFkZERlcGVuZGVuY3koZWNyVmFsaWRhdG9yKTtcblxuICAgIC8vIEF1dGhlbnRpayBXb3JrZXJcbiAgICBjb25zdCBhdXRoZW50aWtXb3JrZXIgPSBuZXcgQXV0aGVudGlrV29ya2VyKHRoaXMsICdBdXRoZW50aWtXb3JrZXInLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBlbnZpcm9ubWVudENvbmZpZyxcbiAgICAgIHZwYyxcbiAgICAgIGVjc1NlY3VyaXR5R3JvdXAsXG4gICAgICBlY3NDbHVzdGVyLFxuICAgICAgczNDb25mQnVja2V0LFxuICAgICAgZW52RmlsZVMzS2V5OiBlbnZGaWxlUzNLZXksXG4gICAgICB1c2VBdXRoZW50aWtDb25maWdGaWxlOiB1c2VBdXRoZW50aWtDb25maWdGaWxlLFxuICAgICAgYWRtaW5Vc2VyRW1haWw6IGF1dGhlbnRpa0FkbWluVXNlckVtYWlsLFxuICAgICAgbGRhcEJhc2VEbjogbGRhcEJhc2VEbixcbiAgICAgIGxkYXBTZXJ2aWNlVXNlcjogc2VjcmV0c01hbmFnZXIubGRhcFNlcnZpY2VVc2VyLFxuICAgICAgZWNyUmVwb3NpdG9yeUFybjogZWNyUmVwb3NpdG9yeSxcbiAgICAgIGdpdFNoYTogZ2l0U2hhLFxuICAgICAgZW5hYmxlRXhlY3V0ZTogZW5hYmxlRXhlY3V0ZSxcbiAgICAgIGRiU2VjcmV0OiBkYXRhYmFzZS5tYXN0ZXJTZWNyZXQsXG4gICAgICBkYkhvc3RuYW1lOiBkYXRhYmFzZS5ob3N0bmFtZSxcbiAgICAgIHJlZGlzQXV0aFRva2VuOiByZWRpcy5hdXRoVG9rZW4sXG4gICAgICByZWRpc0hvc3RuYW1lOiByZWRpcy5ob3N0bmFtZSxcbiAgICAgIHNlY3JldEtleTogc2VjcmV0c01hbmFnZXIuc2VjcmV0S2V5LFxuICAgICAgYWRtaW5Vc2VyUGFzc3dvcmQ6IHNlY3JldHNNYW5hZ2VyLmFkbWluVXNlclBhc3N3b3JkLFxuICAgICAgYWRtaW5Vc2VyVG9rZW46IHNlY3JldHNNYW5hZ2VyLmFkbWluVXNlclRva2VuLFxuICAgICAga21zS2V5LFxuICAgICAgZWZzSWQ6IGVmcy5maWxlU3lzdGVtLmZpbGVTeXN0ZW1JZCxcbiAgICAgIGVmc01lZGlhQWNjZXNzUG9pbnRJZDogZWZzLm1lZGlhQWNjZXNzUG9pbnQuYWNjZXNzUG9pbnRJZCxcbiAgICAgIGVmc0N1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50SWQ6IGVmcy5jdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkLFxuICAgICAgYXV0aGVudGlrSG9zdDogYGh0dHBzOi8vJHtob3N0bmFtZUF1dGhlbnRpa30uJHtob3N0ZWRab25lTmFtZX1gXG4gICAgfSk7XG5cbiAgICAvLyBFbnN1cmUgQXV0aGVudGlrIFdvcmtlciB3YWl0cyBmb3IgRUNSIGltYWdlIHZhbGlkYXRpb25cbiAgICBhdXRoZW50aWtXb3JrZXIubm9kZS5hZGREZXBlbmRlbmN5KGVjclZhbGlkYXRvcik7XG5cbiAgICAvLyBDb25uZWN0IEF1dGhlbnRpayBTZXJ2ZXIgdG8gTG9hZCBCYWxhbmNlclxuICAgIGF1dGhlbnRpa1NlcnZlci5jcmVhdGVUYXJnZXRHcm91cCh2cGMsIGF1dGhlbnRpa0VMQi5odHRwc0xpc3RlbmVyKTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gRE5TIFNFVFVQIChBVVRIRU5USUspXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIFJvdXRlNTMgQXV0aGVudGlrIEROUyBSZWNvcmRzIChuZWVkZWQgYmVmb3JlIExEQVAgdG9rZW4gcmV0cmlldmVyKVxuICAgIGNvbnN0IHJvdXRlNTNBdXRoZW50aWsgPSBuZXcgUm91dGU1M0F1dGhlbnRpayh0aGlzLCAnUm91dGU1M0F1dGhlbnRpaycsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAgaG9zdGVkWm9uZUlkOiBob3N0ZWRab25lSWQsXG4gICAgICBob3N0ZWRab25lTmFtZTogaG9zdGVkWm9uZU5hbWUsXG4gICAgICBob3N0bmFtZUF1dGhlbnRpazogaG9zdG5hbWVBdXRoZW50aWssXG4gICAgICBhdXRoZW50aWtMb2FkQmFsYW5jZXI6IGF1dGhlbnRpa0VMQi5sb2FkQmFsYW5jZXJcbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gTERBUCBDT05GSUdVUkFUSU9OXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIExEQVAgVG9rZW4gUmV0cmlldmVyXG4gICAgY29uc3QgbGRhcFRva2VuUmV0cmlldmVyID0gbmV3IExkYXBUb2tlblJldHJpZXZlcih0aGlzLCAnTGRhcFRva2VuUmV0cmlldmVyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogZW52aXJvbm1lbnRDb25maWcsXG4gICAgICBrbXNLZXksXG4gICAgICAvLyBVc2UgcHJvcGVyIEZRRE4gdGhhdCBtYXRjaGVzIFRMUyBjZXJ0aWZpY2F0ZSwgbm90IEVMQiBETlMgbmFtZVxuICAgICAgYXV0aGVudGlrSG9zdDogcm91dGU1M0F1dGhlbnRpay5nZXRBdXRoZW50aWtVcmwoKSxcbiAgICAgIG91dHBvc3ROYW1lOiAnTERBUCcsXG4gICAgICBhZG1pblRva2VuU2VjcmV0OiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJUb2tlbixcbiAgICAgIGxkYXBUb2tlblNlY3JldDogc2VjcmV0c01hbmFnZXIubGRhcFRva2VuLFxuICAgICAgZ2l0U2hhOiBnaXRTaGEsXG4gICAgICBhdXRoZW50aWtTZXJ2ZXJTZXJ2aWNlOiBhdXRoZW50aWtTZXJ2ZXIuZWNzU2VydmljZSxcbiAgICAgIGF1dGhlbnRpa1dvcmtlclNlcnZpY2U6IGF1dGhlbnRpa1dvcmtlci5lY3NTZXJ2aWNlXG4gICAgfSk7XG5cbiAgICAvLyBMREFQXG4gICAgY29uc3QgbGRhcCA9IG5ldyBMZGFwKHRoaXMsICdMREFQJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogZW52aXJvbm1lbnRDb25maWcsXG4gICAgICB2cGMsXG4gICAgICBlY3NTZWN1cml0eUdyb3VwLFxuICAgICAgZWNzQ2x1c3RlcixcbiAgICAgIHMzQ29uZkJ1Y2tldCxcbiAgICAgIHNzbENlcnRpZmljYXRlQXJuOiBzc2xDZXJ0aWZpY2F0ZUFybixcbiAgICAgIGF1dGhlbnRpa0hvc3Q6IHJvdXRlNTNBdXRoZW50aWsuYXV0aGVudGlrRnFkbixcbiAgICAgIGVjclJlcG9zaXRvcnlBcm46IGVjclJlcG9zaXRvcnksXG4gICAgICBnaXRTaGE6IGdpdFNoYSxcbiAgICAgIGVuYWJsZUV4ZWN1dGU6IGVuYWJsZUV4ZWN1dGUsXG4gICAgICBrbXNLZXksXG4gICAgICBsZGFwVG9rZW46IHNlY3JldHNNYW5hZ2VyLmxkYXBUb2tlblxuICAgIH0pO1xuXG4gICAgLy8gRW5zdXJlIExEQVAgd2FpdHMgZm9yIEVDUiBpbWFnZSB2YWxpZGF0aW9uXG4gICAgbGRhcC5ub2RlLmFkZERlcGVuZGVuY3koZWNyVmFsaWRhdG9yKTtcbiAgICAvLyBFbnN1cmUgTERBUCB3YWl0cyBmb3IgdGhlIHRva2VuIHRvIGJlIHJldHJpZXZlZFxuICAgIGxkYXAubm9kZS5hZGREZXBlbmRlbmN5KGxkYXBUb2tlblJldHJpZXZlcik7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIEROUyBBTkQgUk9VVElOR1xuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIEROUyBTRVRVUCAoTERBUClcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gUm91dGU1MyBMREFQIEROUyBSZWNvcmRzIChhZnRlciBMREFQIGNvbnN0cnVjdCBpcyBjcmVhdGVkKVxuICAgIGNvbnN0IHJvdXRlNTMgPSBuZXcgUm91dGU1Myh0aGlzLCAnUm91dGU1MycsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAgaG9zdGVkWm9uZUlkOiBob3N0ZWRab25lSWQsXG4gICAgICBob3N0ZWRab25lTmFtZTogaG9zdGVkWm9uZU5hbWUsXG4gICAgICBob3N0bmFtZUxkYXA6IGhvc3RuYW1lTGRhcCxcbiAgICAgIGxkYXBMb2FkQmFsYW5jZXI6IGxkYXAubG9hZEJhbGFuY2VyXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgZGVwZW5kZW5jeSBmb3IgTERBUCB0b2tlbiByZXRyaWV2ZXIgdG8gd2FpdCBmb3IgQXV0aGVudGlrIEROUyByZWNvcmRzXG4gICAgbGRhcFRva2VuUmV0cmlldmVyLmN1c3RvbVJlc291cmNlLm5vZGUuYWRkRGVwZW5kZW5jeShyb3V0ZTUzQXV0aGVudGlrLmF1dGhlbnRpa0FSZWNvcmQpO1xuICAgIGxkYXBUb2tlblJldHJpZXZlci5jdXN0b21SZXNvdXJjZS5ub2RlLmFkZERlcGVuZGVuY3kocm91dGU1M0F1dGhlbnRpay5hdXRoZW50aWtBQUFBUmVjb3JkKTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gU1RBQ0sgT1VUUFVUU1xuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgcmVnaXN0ZXJPdXRwdXRzKHtcbiAgICAgIHN0YWNrOiB0aGlzLFxuICAgICAgc3RhY2tOYW1lOiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBkYXRhYmFzZUVuZHBvaW50OiBkYXRhYmFzZS5ob3N0bmFtZSxcbiAgICAgIGRhdGFiYXNlU2VjcmV0QXJuOiBkYXRhYmFzZS5tYXN0ZXJTZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgcmVkaXNFbmRwb2ludDogcmVkaXMuaG9zdG5hbWUsXG4gICAgICByZWRpc0F1dGhUb2tlbkFybjogcmVkaXMuYXV0aFRva2VuLnNlY3JldEFybixcbiAgICAgIGVmc0lkOiBlZnMuZmlsZVN5c3RlbS5maWxlU3lzdGVtSWQsXG4gICAgICBlZnNNZWRpYUFjY2Vzc1BvaW50SWQ6IGVmcy5tZWRpYUFjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWQsXG4gICAgICBlZnNUZW1wbGF0ZXNBY2Nlc3NQb2ludElkOiBlZnMuY3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnQuYWNjZXNzUG9pbnRJZCxcbiAgICAgIGF1dGhlbnRpa1NlY3JldEtleUFybjogc2VjcmV0c01hbmFnZXIuc2VjcmV0S2V5LnNlY3JldEFybixcbiAgICAgIGF1dGhlbnRpa0FkbWluVG9rZW5Bcm46IHNlY3JldHNNYW5hZ2VyLmFkbWluVXNlclRva2VuLnNlY3JldEFybixcbiAgICAgIGF1dGhlbnRpa0xkYXBUb2tlbkFybjogc2VjcmV0c01hbmFnZXIubGRhcFRva2VuLnNlY3JldEFybixcbiAgICAgIGF1dGhlbnRpa0FsYkRuczogYXV0aGVudGlrRUxCLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lLFxuICAgICAgYXV0aGVudGlrVXJsOiBgaHR0cHM6Ly8ke2F1dGhlbnRpa0VMQi5kbnNOYW1lfWAsXG4gICAgICBsZGFwTmxiRG5zOiBsZGFwLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lLFxuICAgICAgbGRhcFRva2VuUmV0cmlldmVyTGFtYmRhQXJuOiBsZGFwVG9rZW5SZXRyaWV2ZXIubGFtYmRhRnVuY3Rpb24uZnVuY3Rpb25Bcm5cbiAgICB9KTtcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09XG4gIC8vIEhFTFBFUiBNRVRIT0RTXG4gIC8vID09PT09PT09PT09PT09PT09XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBzZWN1cml0eSBncm91cCBmb3IgRUNTIHRhc2tzXG4gICAqIEBwYXJhbSB2cGMgVGhlIFZQQyB0byBjcmVhdGUgdGhlIHNlY3VyaXR5IGdyb3VwIGluXG4gICAqIEByZXR1cm5zIFRoZSBjcmVhdGVkIHNlY3VyaXR5IGdyb3VwXG4gICAqL1xuICBwcml2YXRlIGNyZWF0ZUVjc1NlY3VyaXR5R3JvdXAodnBjOiBlYzIuSVZwYyk6IGVjMi5TZWN1cml0eUdyb3VwIHtcbiAgICBjb25zdCBlY3NTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdFQ1NTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgRUNTIHRhc2tzJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IHRydWVcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IEhUVFAvSFRUUFMgdHJhZmZpYyB0byBFQ1MgdGFza3NcbiAgICBlY3NTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuYW55SXB2NCgpLFxuICAgICAgZWMyLlBvcnQudGNwKDgwKSxcbiAgICAgICdBbGxvdyBIVFRQIHRyYWZmaWMnXG4gICAgKTtcblxuICAgIGVjc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5hbnlJcHY0KCksXG4gICAgICBlYzIuUG9ydC50Y3AoNDQzKSxcbiAgICAgICdBbGxvdyBIVFRQUyB0cmFmZmljJ1xuICAgICk7XG5cbiAgICBlY3NTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuYW55SXB2NCgpLFxuICAgICAgZWMyLlBvcnQudGNwKDkwMDApLFxuICAgICAgJ0FsbG93IEF1dGhlbnRpayB0cmFmZmljJ1xuICAgICk7XG5cbiAgICByZXR1cm4gZWNzU2VjdXJpdHlHcm91cDtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgc2VjdXJpdHkgZ3JvdXAgZm9yIGRhdGFiYXNlIGFjY2Vzc1xuICAgKiBAcGFyYW0gdnBjIFRoZSBWUEMgdG8gY3JlYXRlIHRoZSBzZWN1cml0eSBncm91cCBpblxuICAgKiBAcGFyYW0gZWNzU2VjdXJpdHlHcm91cCBUaGUgRUNTIHNlY3VyaXR5IGdyb3VwIHRvIGFsbG93IGFjY2VzcyBmcm9tXG4gICAqIEByZXR1cm5zIFRoZSBjcmVhdGVkIHNlY3VyaXR5IGdyb3VwXG4gICAqL1xuICBwcml2YXRlIGNyZWF0ZURiU2VjdXJpdHlHcm91cCh2cGM6IGVjMi5JVnBjLCBlY3NTZWN1cml0eUdyb3VwOiBlYzIuU2VjdXJpdHlHcm91cCk6IGVjMi5TZWN1cml0eUdyb3VwIHtcbiAgICBjb25zdCBkYlNlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0RCU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIGRhdGFiYXNlJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IGZhbHNlXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBQb3N0Z3JlU1FMIGFjY2VzcyBmcm9tIEVDUyB0YXNrc1xuICAgIGRiU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLnNlY3VyaXR5R3JvdXBJZChlY3NTZWN1cml0eUdyb3VwLnNlY3VyaXR5R3JvdXBJZCksXG4gICAgICBlYzIuUG9ydC50Y3AoNTQzMiksXG4gICAgICAnQWxsb3cgUG9zdGdyZVNRTCBhY2Nlc3MgZnJvbSBFQ1MgdGFza3MnXG4gICAgKTtcblxuICAgIHJldHVybiBkYlNlY3VyaXR5R3JvdXA7XG4gIH1cbn1cblxuLyoqXG4gKiBDb252ZXJ0cyBhbiBFQ1IgcmVwb3NpdG9yeSBBUk4gdG8gYSBwcm9wZXIgRUNSIHJlcG9zaXRvcnkgVVJJIGZvciBEb2NrZXIgaW1hZ2VzXG4gKiBAcGFyYW0gZWNyQXJuIC0gRUNSIHJlcG9zaXRvcnkgQVJOIChlLmcuLCBcImFybjphd3M6ZWNyOnJlZ2lvbjphY2NvdW50OnJlcG9zaXRvcnkvcmVwby1uYW1lXCIpXG4gKiBAcmV0dXJucyBFQ1IgcmVwb3NpdG9yeSBVUkkgKGUuZy4sIFwiYWNjb3VudC5ka3IuZWNyLnJlZ2lvbi5hbWF6b25hd3MuY29tL3JlcG8tbmFtZVwiKVxuICovXG5mdW5jdGlvbiBjb252ZXJ0RWNyQXJuVG9SZXBvc2l0b3J5VXJpKGVjckFybjogc3RyaW5nKTogc3RyaW5nIHtcbiAgLy8gUGFyc2UgQVJOOiBhcm46YXdzOmVjcjpyZWdpb246YWNjb3VudDpyZXBvc2l0b3J5L3JlcG8tbmFtZVxuICBjb25zdCBhcm5QYXJ0cyA9IGVjckFybi5zcGxpdCgnOicpO1xuICBpZiAoYXJuUGFydHMubGVuZ3RoICE9PSA2IHx8ICFhcm5QYXJ0c1s1XS5zdGFydHNXaXRoKCdyZXBvc2l0b3J5LycpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIEVDUiByZXBvc2l0b3J5IEFSTiBmb3JtYXQ6ICR7ZWNyQXJufWApO1xuICB9XG4gIFxuICBjb25zdCByZWdpb24gPSBhcm5QYXJ0c1szXTtcbiAgY29uc3QgYWNjb3VudCA9IGFyblBhcnRzWzRdO1xuICBjb25zdCByZXBvc2l0b3J5TmFtZSA9IGFyblBhcnRzWzVdLnJlcGxhY2UoJ3JlcG9zaXRvcnkvJywgJycpO1xuICBcbiAgcmV0dXJuIGAke2FjY291bnR9LmRrci5lY3IuJHtyZWdpb259LmFtYXpvbmF3cy5jb20vJHtyZXBvc2l0b3J5TmFtZX1gO1xufVxuIl19