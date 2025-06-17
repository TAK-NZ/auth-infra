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
        const envFileS3Key = `${stackNameComponent}/authentik-config.env`;
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
            environment: stackNameComponent
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGgtaW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFFbkMsNkNBQXVFO0FBQ3ZFLHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLHVEQUF5QztBQUV6QyxvQkFBb0I7QUFDcEIsb0RBQWlEO0FBQ2pELDhDQUEyQztBQUMzQywwQ0FBdUM7QUFDdkMsa0VBQThEO0FBQzlELDBDQUF1QztBQUN2QyxvRUFBZ0U7QUFDaEUsb0VBQWdFO0FBQ2hFLDRDQUF5QztBQUN6Qyw0RUFBdUU7QUFDdkUsa0RBQStDO0FBQy9DLHNFQUFrRTtBQUNsRSwwRUFBcUU7QUFFckUsa0JBQWtCO0FBQ2xCLHVDQUE0QztBQUM1QyxxRUFBb0Y7QUFPcEY7O0dBRUc7QUFDSCxNQUFhLGNBQWUsU0FBUSxHQUFHLENBQUMsS0FBSztJQUMzQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTBCO1FBQ2xFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFO1lBQ2YsR0FBRyxLQUFLO1lBQ1IsV0FBVyxFQUFFLG9EQUFvRDtTQUNsRSxDQUFDLENBQUM7UUFFSCxNQUFNLEVBQ0osV0FBVyxFQUNYLGlCQUFpQixFQUNqQixjQUFjLEVBQ2YsR0FBRyxLQUFLLENBQUMsWUFBWSxDQUFDO1FBRXZCLCtCQUErQjtRQUMvQixNQUFNLE9BQU8sR0FBRyxXQUFXLENBQUMsT0FBTyxDQUFDO1FBQ3BDLE1BQU0sa0JBQWtCLEdBQUcsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDLHFEQUFxRDtRQUN2RyxNQUFNLGlCQUFpQixHQUFHLEVBQUUsQ0FBQztRQUU3Qix5Q0FBeUM7UUFDekMsTUFBTSxzQkFBc0IsR0FBRyxjQUFjLENBQUMsc0JBQXNCLENBQUM7UUFDckUsTUFBTSx3QkFBd0IsR0FBRyxjQUFj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QyxFQUFFLENBQUM7UUFDcEUsTUFBTSxJQUFJLEtBQUssQ0FBQyxzQ0FBc0MsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUNsRSxDQUFDO0lBRUQsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzNCLE1BQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM1QixNQUFNLGNBQWMsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLGFBQWEsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUU5RCxPQUFPLEdBQUcsT0FBTyxZQUFZLE1BQU0sa0JBQWtCLGNBQWMsRUFBRSxDQUFDO0FBQ3hFLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgeyBSZW1vdmFsUG9saWN5LCBTdGFja1Byb3BzLCBGbiwgQ2ZuT3V0cHV0IH0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgZWMyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xuaW1wb3J0ICogYXMgZWNzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3MnO1xuaW1wb3J0ICogYXMga21zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1rbXMnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcblxuLy8gQ29uc3RydWN0IGltcG9ydHNcbmltcG9ydCB7IERhdGFiYXNlIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2RhdGFiYXNlJztcbmltcG9ydCB7IFJlZGlzIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL3JlZGlzJztcbmltcG9ydCB7IEVmcyB9IGZyb20gJy4vY29uc3RydWN0cy9lZnMnO1xuaW1wb3J0IHsgU2VjcmV0c01hbmFnZXIgfSBmcm9tICcuL2NvbnN0cnVjdHMvc2VjcmV0cy1tYW5hZ2VyJztcbmltcG9ydCB7IEVsYiB9IGZyb20gJy4vY29uc3RydWN0cy9lbGInO1xuaW1wb3J0IHsgQXV0aGVudGlrU2VydmVyIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2F1dGhlbnRpay1zZXJ2ZXInO1xuaW1wb3J0IHsgQXV0aGVudGlrV29ya2VyIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2F1dGhlbnRpay13b3JrZXInO1xuaW1wb3J0IHsgTGRhcCB9IGZyb20gJy4vY29uc3RydWN0cy9sZGFwJztcbmltcG9ydCB7IExkYXBUb2tlblJldHJpZXZlciB9IGZyb20gJy4vY29uc3RydWN0cy9sZGFwLXRva2VuLXJldHJpZXZlcic7XG5pbXBvcnQgeyBSb3V0ZTUzIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL3JvdXRlNTMnO1xuaW1wb3J0IHsgUm91dGU1M0F1dGhlbnRpayB9IGZyb20gJy4vY29uc3RydWN0cy9yb3V0ZTUzLWF1dGhlbnRpayc7XG5pbXBvcnQgeyBFY3JJbWFnZVZhbGlkYXRvciB9IGZyb20gJy4vY29uc3RydWN0cy9lY3ItaW1hZ2UtdmFsaWRhdG9yJztcblxuLy8gVXRpbGl0eSBpbXBvcnRzXG5pbXBvcnQgeyByZWdpc3Rlck91dHB1dHMgfSBmcm9tICcuL291dHB1dHMnO1xuaW1wb3J0IHsgY3JlYXRlQmFzZUltcG9ydFZhbHVlLCBCQVNFX0VYUE9SVF9OQU1FUyB9IGZyb20gJy4vY2xvdWRmb3JtYXRpb24taW1wb3J0cyc7XG5pbXBvcnQgeyBBdXRoSW5mcmFDb25maWdSZXN1bHQgfSBmcm9tICcuL3N0YWNrLWNvbmZpZyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aEluZnJhU3RhY2tQcm9wcyBleHRlbmRzIFN0YWNrUHJvcHMge1xuICBjb25maWdSZXN1bHQ6IEF1dGhJbmZyYUNvbmZpZ1Jlc3VsdDtcbn1cblxuLyoqXG4gKiBNYWluIENESyBzdGFjayBmb3IgdGhlIFRBSyBBdXRoIEluZnJhc3RydWN0dXJlXG4gKi9cbmV4cG9ydCBjbGFzcyBBdXRoSW5mcmFTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBBdXRoSW5mcmFTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCB7XG4gICAgICAuLi5wcm9wcyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVEFLIEF1dGhlbnRpY2F0aW9uIExheWVyIC0gQXV0aGVudGlrLCBMREFQIE91dHBvc3QnLFxuICAgIH0pO1xuXG4gICAgY29uc3QgeyBcbiAgICAgIHN0YWNrQ29uZmlnLCBcbiAgICAgIGVudmlyb25tZW50Q29uZmlnLCBcbiAgICAgIGNvbXB1dGVkVmFsdWVzIFxuICAgIH0gPSBwcm9wcy5jb25maWdSZXN1bHQ7XG4gICAgXG4gICAgLy8gRXh0cmFjdCBjb25maWd1cmF0aW9uIHZhbHVlc1xuICAgIGNvbnN0IGVudlR5cGUgPSBzdGFja0NvbmZpZy5lbnZUeXBlO1xuICAgIGNvbnN0IHN0YWNrTmFtZUNvbXBvbmVudCA9IHN0YWNrQ29uZmlnLnN0YWNrTmFtZTsgLy8gVGhpcyBpcyB0aGUgU1RBQ0tfTkFNRSBwYXJ0IChlLmcuLCBcIk15Rmlyc3RTdGFja1wiKVxuICAgIGNvbnN0IHJlc29sdmVkU3RhY2tOYW1lID0gaWQ7XG4gICAgXG4gICAgLy8gVXNlIGNvbXB1dGVkIHZhbHVlcyBmcm9tIGNvbmZpZ3VyYXRpb25cbiAgICBjb25zdCBlbmFibGVIaWdoQXZhaWxhYmlsaXR5ID0gY29tcHV0ZWRWYWx1ZXMuZW5hYmxlSGlnaEF2YWlsYWJpbGl0eTtcbiAgICBjb25zdCBlbmFibGVEZXRhaWxlZE1vbml0b3JpbmcgPSBjb21wdXRlZFZhbHVlcy5lbmFibGVEZXRhaWxlZE1vbml0b3Jpbmc7XG5cbiAgICAvLyBBZGQgRW52aXJvbm1lbnQgVHlwZSB0YWcgdG8gdGhlIHN0YWNrXG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdFbnZpcm9ubWVudCBUeXBlJywgY29tcHV0ZWRWYWx1ZXMuZW52aXJvbm1lbnRMYWJlbCk7XG5cbiAgICBjb25zdCBzdGFja05hbWUgPSBGbi5yZWYoJ0FXUzo6U3RhY2tOYW1lJyk7XG4gICAgY29uc3QgcmVnaW9uID0gY2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbjtcblxuICAgIC8vIENvbnRleHQtYmFzZWQgcGFyYW1ldGVyIHJlc29sdXRpb25cbiAgICBjb25zdCBnaXRTaGEgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnY2FsY3VsYXRlZEdpdFNoYScpIHx8ICdkZXZlbG9wbWVudCc7XG4gICAgY29uc3QgZW5hYmxlRXhlY3V0ZSA9IEJvb2xlYW4odGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2VuYWJsZUV4ZWN1dGUnKSB8fCBmYWxzZSk7XG4gICAgY29uc3QgYXV0aGVudGlrQWRtaW5Vc2VyRW1haWwgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgndmFsaWRhdGVkQXV0aGVudGlrQWRtaW5Vc2VyRW1haWwnKSB8fCAnJztcbiAgICBjb25zdCB1c2VBdXRoZW50aWtDb25maWdGaWxlID0gQm9vbGVhbih0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgndXNlQXV0aGVudGlrQ29uZmlnRmlsZScpIHx8IGZhbHNlKTtcbiAgICBjb25zdCBsZGFwQmFzZURuID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2xkYXBCYXNlRG4nKSB8fCAnZGM9ZXhhbXBsZSxkYz1jb20nO1xuICAgIGNvbnN0IGhvc3RuYW1lQXV0aGVudGlrID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2hvc3RuYW1lQXV0aGVudGlrJykgfHwgJ2FjY291bnQnO1xuICAgIGNvbnN0IGhvc3RuYW1lTGRhcCA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdob3N0bmFtZUxkYXAnKSB8fCAnbGRhcCc7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIElNUE9SVCBCQVNFIElORlJBU1RSVUNUVVJFIFJFU09VUkNFU1xuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBJbXBvcnQgVlBDIGFuZCBuZXR3b3JraW5nIGZyb20gYmFzZSBpbmZyYXN0cnVjdHVyZVxuICAgIC8vIE5vdGU6IEJhc2UgaW5mcmFzdHJ1Y3R1cmUgcHJvdmlkZXMgMiBzdWJuZXRzIChBIGFuZCBCKSwgc28gd2UgbGltaXQgdG8gMiBBWnNcbiAgICBjb25zdCB2cGNBdmFpbGFiaWxpdHlab25lcyA9IHRoaXMuYXZhaWxhYmlsaXR5Wm9uZXMuc2xpY2UoMCwgMik7XG4gICAgXG4gICAgY29uc3QgdnBjID0gZWMyLlZwYy5mcm9tVnBjQXR0cmlidXRlcyh0aGlzLCAnVlBDJywge1xuICAgICAgdnBjSWQ6IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlZQQ19JRCkpLFxuICAgICAgYXZhaWxhYmlsaXR5Wm9uZXM6IHZwY0F2YWlsYWJpbGl0eVpvbmVzLFxuICAgICAgLy8gSW1wb3J0IHN1Ym5ldCBJRHMgZnJvbSBiYXNlIGluZnJhc3RydWN0dXJlXG4gICAgICBwdWJsaWNTdWJuZXRJZHM6IFtcbiAgICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuU1VCTkVUX1BVQkxJQ19BKSksXG4gICAgICAgIEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlNVQk5FVF9QVUJMSUNfQikpXG4gICAgICBdLFxuICAgICAgcHJpdmF0ZVN1Ym5ldElkczogW1xuICAgICAgICBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5TVUJORVRfUFJJVkFURV9BKSksXG4gICAgICAgIEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlNVQk5FVF9QUklWQVRFX0IpKVxuICAgICAgXSxcbiAgICAgIHZwY0NpZHJCbG9jazogRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuVlBDX0NJRFJfSVBWNCkpXG4gICAgfSk7XG5cbiAgICAvLyBLTVNcbiAgICBjb25zdCBrbXNLZXkgPSBrbXMuS2V5LmZyb21LZXlBcm4odGhpcywgJ0tNU0tleScsIFxuICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuS01TX0tFWSkpXG4gICAgKTtcblxuICAgIC8vIEVDU1xuICAgIGNvbnN0IGVjc0NsdXN0ZXJBcm4gPSBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5FQ1NfQ0xVU1RFUikpO1xuICAgIC8vIEV4dHJhY3QgY2x1c3RlciBuYW1lIGZyb20gQVJOOiBhcm46YXdzOmVjczpyZWdpb246YWNjb3VudDpjbHVzdGVyL2NsdXN0ZXItbmFtZVxuICAgIGNvbnN0IGVjc0NsdXN0ZXJOYW1lID0gRm4uc2VsZWN0KDEsIEZuLnNwbGl0KCcvJywgZWNzQ2x1c3RlckFybikpO1xuICAgIGNvbnN0IGVjc0NsdXN0ZXIgPSBlY3MuQ2x1c3Rlci5mcm9tQ2x1c3RlckF0dHJpYnV0ZXModGhpcywgJ0VDU0NsdXN0ZXInLCB7XG4gICAgICBjbHVzdGVyQXJuOiBlY3NDbHVzdGVyQXJuLFxuICAgICAgY2x1c3Rlck5hbWU6IGVjc0NsdXN0ZXJOYW1lLFxuICAgICAgdnBjOiB2cGNcbiAgICB9KTtcblxuICAgIC8vIFMzXG4gICAgY29uc3QgczNDb25mQnVja2V0ID0gczMuQnVja2V0LmZyb21CdWNrZXRBcm4odGhpcywgJ1MzQ29uZkJ1Y2tldCcsXG4gICAgICBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5TM19CVUNLRVQpKVxuICAgICk7XG5cbiAgICAvLyBFQ1JcbiAgICBjb25zdCBlY3JSZXBvc2l0b3J5ID0gRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuRUNSX1JFUE8pKTtcblxuICAgIC8vIFJvdXRlNTNcbiAgICBjb25zdCBob3N0ZWRab25lSWQgPSBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5IT1NURURfWk9ORV9JRCkpO1xuICAgIGNvbnN0IGhvc3RlZFpvbmVOYW1lID0gRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuSE9TVEVEX1pPTkVfTkFNRSkpO1xuXG4gICAgLy8gU1NMIENlcnRpZmljYXRlXG4gICAgY29uc3Qgc3NsQ2VydGlmaWNhdGVBcm4gPSBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5DRVJUSUZJQ0FURV9BUk4pKTtcblxuICAgIC8vIEFkZCBETlMgZG9tYWluIG5hbWUgdGFnXG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdETlMgWm9uZScsIGhvc3RlZFpvbmVOYW1lKTtcblxuICAgIC8vIFMzIEVudmlyb25tZW50IEZpbGUgcGF0aHMgLSBhc3N1bWVzIGF1dGhlbnRpay1jb25maWcuZW52IGFscmVhZHkgZXhpc3RzIGluIFMzXG4gICAgY29uc3QgZW52RmlsZVMzS2V5ID0gYCR7c3RhY2tOYW1lQ29tcG9uZW50fS9hdXRoZW50aWstY29uZmlnLmVudmA7XG4gICAgY29uc3QgZW52RmlsZVMzVXJpID0gYGFybjphd3M6czM6Ojoke3MzQ29uZkJ1Y2tldC5idWNrZXROYW1lfS8ke2VudkZpbGVTM0tleX1gO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBTRUNVUklUWSBHUk9VUFNcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gU2VjdXJpdHkgR3JvdXBzXG4gICAgY29uc3QgZWNzU2VjdXJpdHlHcm91cCA9IHRoaXMuY3JlYXRlRWNzU2VjdXJpdHlHcm91cCh2cGMpO1xuICAgIGNvbnN0IGRiU2VjdXJpdHlHcm91cCA9IHRoaXMuY3JlYXRlRGJTZWN1cml0eUdyb3VwKHZwYywgZWNzU2VjdXJpdHlHcm91cCk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIENPUkUgSU5GUkFTVFJVQ1RVUkVcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gU2VjcmV0c01hbmFnZXJcbiAgICBjb25zdCBzZWNyZXRzTWFuYWdlciA9IG5ldyBTZWNyZXRzTWFuYWdlcih0aGlzLCAnU2VjcmV0c01hbmFnZXInLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgc3RhY2tOYW1lOiByZXNvbHZlZFN0YWNrTmFtZSxcbiAgICAgIGttc0tleVxuICAgIH0pO1xuXG4gICAgLy8gRGF0YWJhc2VcbiAgICBjb25zdCBkYXRhYmFzZSA9IG5ldyBEYXRhYmFzZSh0aGlzLCAnRGF0YWJhc2UnLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgc3RhY2tOYW1lOiByZXNvbHZlZFN0YWNrTmFtZSxcbiAgICAgIGNvbmZpZzogZW52aXJvbm1lbnRDb25maWcsXG4gICAgICB2cGMsXG4gICAgICBrbXNLZXksXG4gICAgICBzZWN1cml0eUdyb3VwczogW2RiU2VjdXJpdHlHcm91cF1cbiAgICB9KTtcblxuICAgIC8vIFJlZGlzXG4gICAgY29uc3QgcmVkaXMgPSBuZXcgUmVkaXModGhpcywgJ1JlZGlzJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIHN0YWNrTmFtZTogcmVzb2x2ZWRTdGFja05hbWUsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAgdnBjLFxuICAgICAga21zS2V5LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtlY3NTZWN1cml0eUdyb3VwXVxuICAgIH0pO1xuXG4gICAgLy8gRUZTXG4gICAgY29uc3QgZWZzID0gbmV3IEVmcyh0aGlzLCAnRUZTJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogZW52aXJvbm1lbnRDb25maWcsXG4gICAgICB2cGMsXG4gICAgICB2cGNDaWRyQmxvY2s6IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlZQQ19DSURSX0lQVjQpKSxcbiAgICAgIGttc0tleSxcbiAgICAgIGFsbG93QWNjZXNzRnJvbTogW2Vjc1NlY3VyaXR5R3JvdXBdXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIElNQUdFIFZBTElEQVRJT05cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gVmFsaWRhdGUgcmVxdWlyZWQgRUNSIGltYWdlcyBleGlzdCBiZWZvcmUgZGVwbG95bWVudFxuICAgIGNvbnN0IHJlcXVpcmVkSW1hZ2VUYWdzID0gW1xuICAgICAgYGF1dGgtaW5mcmEtc2VydmVyLSR7Z2l0U2hhfWAsXG4gICAgICBgYXV0aC1pbmZyYS1sZGFwLSR7Z2l0U2hhfWBcbiAgICBdO1xuICAgIFxuICAgIGNvbnN0IGVjclZhbGlkYXRvciA9IG5ldyBFY3JJbWFnZVZhbGlkYXRvcih0aGlzLCAnRWNySW1hZ2VWYWxpZGF0b3InLCB7XG4gICAgICBlY3JSZXBvc2l0b3J5QXJuOiBlY3JSZXBvc2l0b3J5LFxuICAgICAgcmVxdWlyZWRJbWFnZVRhZ3M6IHJlcXVpcmVkSW1hZ2VUYWdzLFxuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBBUFBMSUNBVElPTiBTRVJWSUNFU1xuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBBdXRoZW50aWsgTG9hZCBCYWxhbmNlclxuICAgIGNvbnN0IGF1dGhlbnRpa0VMQiA9IG5ldyBFbGIodGhpcywgJ0F1dGhlbnRpa0VMQicsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAgdnBjLFxuICAgICAgc3NsQ2VydGlmaWNhdGVBcm46IHNzbENlcnRpZmljYXRlQXJuXG4gICAgfSk7XG5cbiAgICAvLyBBdXRoZW50aWsgU2VydmVyXG4gICAgY29uc3QgYXV0aGVudGlrU2VydmVyID0gbmV3IEF1dGhlbnRpa1NlcnZlcih0aGlzLCAnQXV0aGVudGlrU2VydmVyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogZW52aXJvbm1lbnRDb25maWcsXG4gICAgICB2cGMsXG4gICAgICBlY3NTZWN1cml0eUdyb3VwLFxuICAgICAgZWNzQ2x1c3RlcixcbiAgICAgIHMzQ29uZkJ1Y2tldCxcbiAgICAgIGVudkZpbGVTM1VyaTogZW52RmlsZVMzVXJpLFxuICAgICAgZW52RmlsZVMzS2V5OiBlbnZGaWxlUzNLZXksXG4gICAgICBhZG1pblVzZXJFbWFpbDogYXV0aGVudGlrQWRtaW5Vc2VyRW1haWwsXG4gICAgICBsZGFwQmFzZURuOiBsZGFwQmFzZURuLFxuICAgICAgdXNlQXV0aGVudGlrQ29uZmlnRmlsZTogdXNlQXV0aGVudGlrQ29uZmlnRmlsZSxcbiAgICAgIGVjclJlcG9zaXRvcnlBcm46IGVjclJlcG9zaXRvcnksXG4gICAgICBnaXRTaGE6IGdpdFNoYSxcbiAgICAgIGVuYWJsZUV4ZWN1dGU6IGVuYWJsZUV4ZWN1dGUsXG4gICAgICBkYlNlY3JldDogZGF0YWJhc2UubWFzdGVyU2VjcmV0LFxuICAgICAgZGJIb3N0bmFtZTogZGF0YWJhc2UuaG9zdG5hbWUsXG4gICAgICByZWRpc0F1dGhUb2tlbjogcmVkaXMuYXV0aFRva2VuLFxuICAgICAgcmVkaXNIb3N0bmFtZTogcmVkaXMuaG9zdG5hbWUsXG4gICAgICBzZWNyZXRLZXk6IHNlY3JldHNNYW5hZ2VyLnNlY3JldEtleSxcbiAgICAgIGFkbWluVXNlclBhc3N3b3JkOiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJQYXNzd29yZCxcbiAgICAgIGFkbWluVXNlclRva2VuOiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJUb2tlbixcbiAgICAgIGxkYXBUb2tlbjogc2VjcmV0c01hbmFnZXIubGRhcFRva2VuLFxuICAgICAga21zS2V5LFxuICAgICAgZWZzSWQ6IGVmcy5maWxlU3lzdGVtLmZpbGVTeXN0ZW1JZCxcbiAgICAgIGVmc01lZGlhQWNjZXNzUG9pbnRJZDogZWZzLm1lZGlhQWNjZXNzUG9pbnQuYWNjZXNzUG9pbnRJZCxcbiAgICAgIGVmc0N1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50SWQ6IGVmcy5jdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkXG4gICAgfSk7XG5cbiAgICAvLyBFbnN1cmUgQXV0aGVudGlrIFNlcnZlciB3YWl0cyBmb3IgRUNSIGltYWdlIHZhbGlkYXRpb25cbiAgICBhdXRoZW50aWtTZXJ2ZXIubm9kZS5hZGREZXBlbmRlbmN5KGVjclZhbGlkYXRvcik7XG5cbiAgICAvLyBBdXRoZW50aWsgV29ya2VyXG4gICAgY29uc3QgYXV0aGVudGlrV29ya2VyID0gbmV3IEF1dGhlbnRpa1dvcmtlcih0aGlzLCAnQXV0aGVudGlrV29ya2VyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogZW52aXJvbm1lbnRDb25maWcsXG4gICAgICB2cGMsXG4gICAgICBlY3NTZWN1cml0eUdyb3VwLFxuICAgICAgZWNzQ2x1c3RlcixcbiAgICAgIHMzQ29uZkJ1Y2tldCxcbiAgICAgIGVudkZpbGVTM0tleTogZW52RmlsZVMzS2V5LFxuICAgICAgdXNlQXV0aGVudGlrQ29uZmlnRmlsZTogdXNlQXV0aGVudGlrQ29uZmlnRmlsZSxcbiAgICAgIGFkbWluVXNlckVtYWlsOiBhdXRoZW50aWtBZG1pblVzZXJFbWFpbCxcbiAgICAgIGxkYXBCYXNlRG46IGxkYXBCYXNlRG4sXG4gICAgICBsZGFwU2VydmljZVVzZXI6IHNlY3JldHNNYW5hZ2VyLmxkYXBTZXJ2aWNlVXNlcixcbiAgICAgIGVjclJlcG9zaXRvcnlBcm46IGVjclJlcG9zaXRvcnksXG4gICAgICBnaXRTaGE6IGdpdFNoYSxcbiAgICAgIGVuYWJsZUV4ZWN1dGU6IGVuYWJsZUV4ZWN1dGUsXG4gICAgICBkYlNlY3JldDogZGF0YWJhc2UubWFzdGVyU2VjcmV0LFxuICAgICAgZGJIb3N0bmFtZTogZGF0YWJhc2UuaG9zdG5hbWUsXG4gICAgICByZWRpc0F1dGhUb2tlbjogcmVkaXMuYXV0aFRva2VuLFxuICAgICAgcmVkaXNIb3N0bmFtZTogcmVkaXMuaG9zdG5hbWUsXG4gICAgICBzZWNyZXRLZXk6IHNlY3JldHNNYW5hZ2VyLnNlY3JldEtleSxcbiAgICAgIGFkbWluVXNlclBhc3N3b3JkOiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJQYXNzd29yZCxcbiAgICAgIGFkbWluVXNlclRva2VuOiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJUb2tlbixcbiAgICAgIGttc0tleSxcbiAgICAgIGVmc0lkOiBlZnMuZmlsZVN5c3RlbS5maWxlU3lzdGVtSWQsXG4gICAgICBlZnNNZWRpYUFjY2Vzc1BvaW50SWQ6IGVmcy5tZWRpYUFjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWQsXG4gICAgICBlZnNDdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludElkOiBlZnMuY3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnQuYWNjZXNzUG9pbnRJZCxcbiAgICAgIGF1dGhlbnRpa0hvc3Q6IGBodHRwczovLyR7aG9zdG5hbWVBdXRoZW50aWt9LiR7aG9zdGVkWm9uZU5hbWV9YFxuICAgIH0pO1xuXG4gICAgLy8gRW5zdXJlIEF1dGhlbnRpayBXb3JrZXIgd2FpdHMgZm9yIEVDUiBpbWFnZSB2YWxpZGF0aW9uXG4gICAgYXV0aGVudGlrV29ya2VyLm5vZGUuYWRkRGVwZW5kZW5jeShlY3JWYWxpZGF0b3IpO1xuXG4gICAgLy8gQ29ubmVjdCBBdXRoZW50aWsgU2VydmVyIHRvIExvYWQgQmFsYW5jZXJcbiAgICBhdXRoZW50aWtTZXJ2ZXIuY3JlYXRlVGFyZ2V0R3JvdXAodnBjLCBhdXRoZW50aWtFTEIuaHR0cHNMaXN0ZW5lcik7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIEROUyBTRVRVUCAoQVVUSEVOVElLKVxuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBSb3V0ZTUzIEF1dGhlbnRpayBETlMgUmVjb3JkcyAobmVlZGVkIGJlZm9yZSBMREFQIHRva2VuIHJldHJpZXZlcilcbiAgICBjb25zdCByb3V0ZTUzQXV0aGVudGlrID0gbmV3IFJvdXRlNTNBdXRoZW50aWsodGhpcywgJ1JvdXRlNTNBdXRoZW50aWsnLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBlbnZpcm9ubWVudENvbmZpZyxcbiAgICAgIGhvc3RlZFpvbmVJZDogaG9zdGVkWm9uZUlkLFxuICAgICAgaG9zdGVkWm9uZU5hbWU6IGhvc3RlZFpvbmVOYW1lLFxuICAgICAgaG9zdG5hbWVBdXRoZW50aWs6IGhvc3RuYW1lQXV0aGVudGlrLFxuICAgICAgYXV0aGVudGlrTG9hZEJhbGFuY2VyOiBhdXRoZW50aWtFTEIubG9hZEJhbGFuY2VyXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIExEQVAgQ09ORklHVVJBVElPTlxuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBMREFQIFRva2VuIFJldHJpZXZlclxuICAgIGNvbnN0IGxkYXBUb2tlblJldHJpZXZlciA9IG5ldyBMZGFwVG9rZW5SZXRyaWV2ZXIodGhpcywgJ0xkYXBUb2tlblJldHJpZXZlcicsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAga21zS2V5LFxuICAgICAgLy8gVXNlIHByb3BlciBGUUROIHRoYXQgbWF0Y2hlcyBUTFMgY2VydGlmaWNhdGUsIG5vdCBFTEIgRE5TIG5hbWVcbiAgICAgIGF1dGhlbnRpa0hvc3Q6IHJvdXRlNTNBdXRoZW50aWsuZ2V0QXV0aGVudGlrVXJsKCksXG4gICAgICBvdXRwb3N0TmFtZTogJ0xEQVAnLFxuICAgICAgYWRtaW5Ub2tlblNlY3JldDogc2VjcmV0c01hbmFnZXIuYWRtaW5Vc2VyVG9rZW4sXG4gICAgICBsZGFwVG9rZW5TZWNyZXQ6IHNlY3JldHNNYW5hZ2VyLmxkYXBUb2tlbixcbiAgICAgIGdpdFNoYTogZ2l0U2hhLFxuICAgICAgYXV0aGVudGlrU2VydmVyU2VydmljZTogYXV0aGVudGlrU2VydmVyLmVjc1NlcnZpY2UsXG4gICAgICBhdXRoZW50aWtXb3JrZXJTZXJ2aWNlOiBhdXRoZW50aWtXb3JrZXIuZWNzU2VydmljZVxuICAgIH0pO1xuXG4gICAgLy8gTERBUFxuICAgIGNvbnN0IGxkYXAgPSBuZXcgTGRhcCh0aGlzLCAnTERBUCcsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAgdnBjLFxuICAgICAgZWNzU2VjdXJpdHlHcm91cCxcbiAgICAgIGVjc0NsdXN0ZXIsXG4gICAgICBzM0NvbmZCdWNrZXQsXG4gICAgICBzc2xDZXJ0aWZpY2F0ZUFybjogc3NsQ2VydGlmaWNhdGVBcm4sXG4gICAgICBhdXRoZW50aWtIb3N0OiByb3V0ZTUzQXV0aGVudGlrLmF1dGhlbnRpa0ZxZG4sXG4gICAgICBlY3JSZXBvc2l0b3J5QXJuOiBlY3JSZXBvc2l0b3J5LFxuICAgICAgZ2l0U2hhOiBnaXRTaGEsXG4gICAgICBlbmFibGVFeGVjdXRlOiBlbmFibGVFeGVjdXRlLFxuICAgICAga21zS2V5LFxuICAgICAgbGRhcFRva2VuOiBzZWNyZXRzTWFuYWdlci5sZGFwVG9rZW5cbiAgICB9KTtcblxuICAgIC8vIEVuc3VyZSBMREFQIHdhaXRzIGZvciBFQ1IgaW1hZ2UgdmFsaWRhdGlvblxuICAgIGxkYXAubm9kZS5hZGREZXBlbmRlbmN5KGVjclZhbGlkYXRvcik7XG4gICAgLy8gRW5zdXJlIExEQVAgd2FpdHMgZm9yIHRoZSB0b2tlbiB0byBiZSByZXRyaWV2ZWRcbiAgICBsZGFwLm5vZGUuYWRkRGVwZW5kZW5jeShsZGFwVG9rZW5SZXRyaWV2ZXIpO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBETlMgQU5EIFJPVVRJTkdcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBETlMgU0VUVVAgKExEQVApXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIFJvdXRlNTMgTERBUCBETlMgUmVjb3JkcyAoYWZ0ZXIgTERBUCBjb25zdHJ1Y3QgaXMgY3JlYXRlZClcbiAgICBjb25zdCByb3V0ZTUzID0gbmV3IFJvdXRlNTModGhpcywgJ1JvdXRlNTMnLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBlbnZpcm9ubWVudENvbmZpZyxcbiAgICAgIGhvc3RlZFpvbmVJZDogaG9zdGVkWm9uZUlkLFxuICAgICAgaG9zdGVkWm9uZU5hbWU6IGhvc3RlZFpvbmVOYW1lLFxuICAgICAgaG9zdG5hbWVMZGFwOiBob3N0bmFtZUxkYXAsXG4gICAgICBsZGFwTG9hZEJhbGFuY2VyOiBsZGFwLmxvYWRCYWxhbmNlclxuICAgIH0pO1xuXG4gICAgLy8gQWRkIGRlcGVuZGVuY3kgZm9yIExEQVAgdG9rZW4gcmV0cmlldmVyIHRvIHdhaXQgZm9yIEF1dGhlbnRpayBETlMgcmVjb3Jkc1xuICAgIGxkYXBUb2tlblJldHJpZXZlci5jdXN0b21SZXNvdXJjZS5ub2RlLmFkZERlcGVuZGVuY3kocm91dGU1M0F1dGhlbnRpay5hdXRoZW50aWtBUmVjb3JkKTtcbiAgICBsZGFwVG9rZW5SZXRyaWV2ZXIuY3VzdG9tUmVzb3VyY2Uubm9kZS5hZGREZXBlbmRlbmN5KHJvdXRlNTNBdXRoZW50aWsuYXV0aGVudGlrQUFBQVJlY29yZCk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIFNUQUNLIE9VVFBVVFNcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gT3V0cHV0c1xuICAgIHJlZ2lzdGVyT3V0cHV0cyh7XG4gICAgICBzdGFjazogdGhpcyxcbiAgICAgIHN0YWNrTmFtZTogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgZGF0YWJhc2VFbmRwb2ludDogZGF0YWJhc2UuaG9zdG5hbWUsXG4gICAgICBkYXRhYmFzZVNlY3JldEFybjogZGF0YWJhc2UubWFzdGVyU2VjcmV0LnNlY3JldEFybixcbiAgICAgIHJlZGlzRW5kcG9pbnQ6IHJlZGlzLmhvc3RuYW1lLFxuICAgICAgcmVkaXNBdXRoVG9rZW5Bcm46IHJlZGlzLmF1dGhUb2tlbi5zZWNyZXRBcm4sXG4gICAgICBlZnNJZDogZWZzLmZpbGVTeXN0ZW0uZmlsZVN5c3RlbUlkLFxuICAgICAgZWZzTWVkaWFBY2Nlc3NQb2ludElkOiBlZnMubWVkaWFBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkLFxuICAgICAgZWZzVGVtcGxhdGVzQWNjZXNzUG9pbnRJZDogZWZzLmN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWQsXG4gICAgICBhdXRoZW50aWtTZWNyZXRLZXlBcm46IHNlY3JldHNNYW5hZ2VyLnNlY3JldEtleS5zZWNyZXRBcm4sXG4gICAgICBhdXRoZW50aWtBZG1pblRva2VuQXJuOiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJUb2tlbi5zZWNyZXRBcm4sXG4gICAgICBhdXRoZW50aWtMZGFwVG9rZW5Bcm46IHNlY3JldHNNYW5hZ2VyLmxkYXBUb2tlbi5zZWNyZXRBcm4sXG4gICAgICBhdXRoZW50aWtBbGJEbnM6IGF1dGhlbnRpa0VMQi5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZSxcbiAgICAgIGF1dGhlbnRpa1VybDogYGh0dHBzOi8vJHthdXRoZW50aWtFTEIuZG5zTmFtZX1gLFxuICAgICAgbGRhcE5sYkRuczogbGRhcC5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZSxcbiAgICAgIGxkYXBUb2tlblJldHJpZXZlckxhbWJkYUFybjogbGRhcFRva2VuUmV0cmlldmVyLmxhbWJkYUZ1bmN0aW9uLmZ1bmN0aW9uQXJuXG4gICAgfSk7XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PVxuICAvLyBIRUxQRVIgTUVUSE9EU1xuICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgc2VjdXJpdHkgZ3JvdXAgZm9yIEVDUyB0YXNrc1xuICAgKiBAcGFyYW0gdnBjIFRoZSBWUEMgdG8gY3JlYXRlIHRoZSBzZWN1cml0eSBncm91cCBpblxuICAgKiBAcmV0dXJucyBUaGUgY3JlYXRlZCBzZWN1cml0eSBncm91cFxuICAgKi9cbiAgcHJpdmF0ZSBjcmVhdGVFY3NTZWN1cml0eUdyb3VwKHZwYzogZWMyLklWcGMpOiBlYzIuU2VjdXJpdHlHcm91cCB7XG4gICAgY29uc3QgZWNzU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnRUNTU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIEVDUyB0YXNrcycsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBIVFRQL0hUVFBTIHRyYWZmaWMgdG8gRUNTIHRhc2tzXG4gICAgZWNzU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg4MCksXG4gICAgICAnQWxsb3cgSFRUUCB0cmFmZmljJ1xuICAgICk7XG5cbiAgICBlY3NTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuYW55SXB2NCgpLFxuICAgICAgZWMyLlBvcnQudGNwKDQ0MyksXG4gICAgICAnQWxsb3cgSFRUUFMgdHJhZmZpYydcbiAgICApO1xuXG4gICAgZWNzU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg5MDAwKSxcbiAgICAgICdBbGxvdyBBdXRoZW50aWsgdHJhZmZpYydcbiAgICApO1xuXG4gICAgcmV0dXJuIGVjc1NlY3VyaXR5R3JvdXA7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIHNlY3VyaXR5IGdyb3VwIGZvciBkYXRhYmFzZSBhY2Nlc3NcbiAgICogQHBhcmFtIHZwYyBUaGUgVlBDIHRvIGNyZWF0ZSB0aGUgc2VjdXJpdHkgZ3JvdXAgaW5cbiAgICogQHBhcmFtIGVjc1NlY3VyaXR5R3JvdXAgVGhlIEVDUyBzZWN1cml0eSBncm91cCB0byBhbGxvdyBhY2Nlc3MgZnJvbVxuICAgKiBAcmV0dXJucyBUaGUgY3JlYXRlZCBzZWN1cml0eSBncm91cFxuICAgKi9cbiAgcHJpdmF0ZSBjcmVhdGVEYlNlY3VyaXR5R3JvdXAodnBjOiBlYzIuSVZwYywgZWNzU2VjdXJpdHlHcm91cDogZWMyLlNlY3VyaXR5R3JvdXApOiBlYzIuU2VjdXJpdHlHcm91cCB7XG4gICAgY29uc3QgZGJTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdEQlNlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBkYXRhYmFzZScsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiBmYWxzZVxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgUG9zdGdyZVNRTCBhY2Nlc3MgZnJvbSBFQ1MgdGFza3NcbiAgICBkYlNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5zZWN1cml0eUdyb3VwSWQoZWNzU2VjdXJpdHlHcm91cC5zZWN1cml0eUdyb3VwSWQpLFxuICAgICAgZWMyLlBvcnQudGNwKDU0MzIpLFxuICAgICAgJ0FsbG93IFBvc3RncmVTUUwgYWNjZXNzIGZyb20gRUNTIHRhc2tzJ1xuICAgICk7XG5cbiAgICByZXR1cm4gZGJTZWN1cml0eUdyb3VwO1xuICB9XG59XG5cbi8qKlxuICogQ29udmVydHMgYW4gRUNSIHJlcG9zaXRvcnkgQVJOIHRvIGEgcHJvcGVyIEVDUiByZXBvc2l0b3J5IFVSSSBmb3IgRG9ja2VyIGltYWdlc1xuICogQHBhcmFtIGVjckFybiAtIEVDUiByZXBvc2l0b3J5IEFSTiAoZS5nLiwgXCJhcm46YXdzOmVjcjpyZWdpb246YWNjb3VudDpyZXBvc2l0b3J5L3JlcG8tbmFtZVwiKVxuICogQHJldHVybnMgRUNSIHJlcG9zaXRvcnkgVVJJIChlLmcuLCBcImFjY291bnQuZGtyLmVjci5yZWdpb24uYW1hem9uYXdzLmNvbS9yZXBvLW5hbWVcIilcbiAqL1xuZnVuY3Rpb24gY29udmVydEVjckFyblRvUmVwb3NpdG9yeVVyaShlY3JBcm46IHN0cmluZyk6IHN0cmluZyB7XG4gIC8vIFBhcnNlIEFSTjogYXJuOmF3czplY3I6cmVnaW9uOmFjY291bnQ6cmVwb3NpdG9yeS9yZXBvLW5hbWVcbiAgY29uc3QgYXJuUGFydHMgPSBlY3JBcm4uc3BsaXQoJzonKTtcbiAgaWYgKGFyblBhcnRzLmxlbmd0aCAhPT0gNiB8fCAhYXJuUGFydHNbNV0uc3RhcnRzV2l0aCgncmVwb3NpdG9yeS8nKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBFQ1IgcmVwb3NpdG9yeSBBUk4gZm9ybWF0OiAke2VjckFybn1gKTtcbiAgfVxuICBcbiAgY29uc3QgcmVnaW9uID0gYXJuUGFydHNbM107XG4gIGNvbnN0IGFjY291bnQgPSBhcm5QYXJ0c1s0XTtcbiAgY29uc3QgcmVwb3NpdG9yeU5hbWUgPSBhcm5QYXJ0c1s1XS5yZXBsYWNlKCdyZXBvc2l0b3J5LycsICcnKTtcbiAgXG4gIHJldHVybiBgJHthY2NvdW50fS5ka3IuZWNyLiR7cmVnaW9ufS5hbWF6b25hd3MuY29tLyR7cmVwb3NpdG9yeU5hbWV9YDtcbn1cbiJdfQ==