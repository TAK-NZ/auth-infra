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
        // BUILD CONFIGURATION OBJECTS
        // =================
        // Build shared infrastructure config
        const infrastructureConfig = {
            vpc,
            ecsSecurityGroup,
            ecsCluster,
            kmsKey
        };
        // =================
        // CORE INFRASTRUCTURE
        // =================
        // SecretsManager
        const secretsManager = new secrets_manager_1.SecretsManager(this, 'SecretsManager', {
            environment: stackNameComponent,
            stackName: resolvedStackName,
            infrastructure: infrastructureConfig
        });
        // Database
        const database = new database_1.Database(this, 'Database', {
            environment: stackNameComponent,
            stackName: resolvedStackName,
            config: environmentConfig,
            infrastructure: infrastructureConfig,
            securityGroups: [dbSecurityGroup]
        });
        // Redis
        const redis = new redis_1.Redis(this, 'Redis', {
            environment: stackNameComponent,
            stackName: resolvedStackName,
            config: environmentConfig,
            infrastructure: infrastructureConfig,
            securityGroups: [ecsSecurityGroup]
        });
        // EFS
        const efs = new efs_1.Efs(this, 'EFS', {
            environment: stackNameComponent,
            config: environmentConfig,
            infrastructure: infrastructureConfig,
            vpcCidrBlock: aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.VPC_CIDR_IPV4)),
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
        // BUILD CONFIGURATION OBJECTS
        // =================
        // Build shared config objects
        const secretsConfig = {
            database: database.masterSecret,
            redisAuthToken: redis.authToken,
            authentik: {
                secretKey: secretsManager.secretKey,
                adminUserPassword: secretsManager.adminUserPassword,
                adminUserToken: secretsManager.adminUserToken,
                ldapToken: secretsManager.ldapToken,
                ldapServiceUser: secretsManager.ldapServiceUser
            }
        };
        const storageConfig = {
            s3: {
                configBucket: s3ConfBucket,
                envFileUri: envFileS3Uri,
                envFileKey: envFileS3Key
            },
            efs: {
                fileSystemId: efs.fileSystem.fileSystemId,
                mediaAccessPointId: efs.mediaAccessPoint.accessPointId,
                customTemplatesAccessPointId: efs.customTemplatesAccessPoint.accessPointId
            }
        };
        const deploymentConfig = {
            gitSha: gitSha,
            ecrRepositoryArn: ecrRepository,
            enableExecute: enableExecute,
            useConfigFile: useAuthentikConfigFile
        };
        const applicationConfig = {
            adminUserEmail: authentikAdminUserEmail,
            ldapBaseDn: ldapBaseDn,
            database: {
                hostname: database.hostname
            },
            redis: {
                hostname: redis.hostname
            },
            authentikHost: `https://${hostnameAuthentik}.${hostedZoneName}`
        };
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
            infrastructure: infrastructureConfig,
            secrets: secretsConfig,
            storage: storageConfig,
            deployment: deploymentConfig,
            application: applicationConfig
        });
        // Ensure Authentik Server waits for ECR image validation
        authentikServer.node.addDependency(ecrValidator);
        // Authentik Worker  
        // Update authentication host for worker after Route53 setup
        const authentikWorkerConfig = { ...applicationConfig };
        const authentikWorker = new authentik_worker_1.AuthentikWorker(this, 'AuthentikWorker', {
            environment: stackNameComponent,
            config: environmentConfig,
            infrastructure: infrastructureConfig,
            secrets: secretsConfig,
            storage: storageConfig,
            deployment: deploymentConfig,
            application: authentikWorkerConfig
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGgtaW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFFbkMsNkNBQXVFO0FBQ3ZFLHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLHVEQUF5QztBQUV6QyxvQkFBb0I7QUFDcEIsb0RBQWlEO0FBQ2pELDhDQUEyQztBQUMzQywwQ0FBdUM7QUFDdkMsa0VBQThEO0FBQzlELDBDQUF1QztBQUN2QyxvRUFBZ0U7QUFDaEUsb0VBQWdFO0FBQ2hFLDRDQUF5QztBQUN6Qyw0RUFBdUU7QUFDdkUsa0RBQStDO0FBQy9DLHNFQUFrRTtBQUNsRSwwRUFBcUU7QUFXckUsa0JBQWtCO0FBQ2xCLHVDQUE0QztBQUM1QyxxRUFBb0Y7QUFPcEY7O0dBRUc7QUFDSCxNQUFhLGNBQWUsU0FBUSxHQUFHLENBQUMsS0FBSztJQUMzQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTBCO1FBQ2xFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFO1lBQ2YsR0FBRyxLQUFLO1lBQ1IsV0FBVyxFQUFFLG9EQUFvRDtTQUNsRSxDQUFDLENBQUM7UUFFSCxNQUFNLEVBQ0osV0FBVyxFQUNYLGlCQUFpQixFQUNqQixjQUFjLEVBQ2YsR0FBRyxLQUFLLENBQUMsWUFBWSxDQUFDO1FBRXZCLCtCQUErQjtRQUMvQixNQUFNLE9BQU8sR0FBRyxXQUFXLENBQUMsT0FBTyxDQUFDO1FBQ3BDLE1BQU0sa0JBQWtCLEdBQUcsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDLHFEQUFxRDtRQUN2RyxNQUFNLGlCQUFpQixHQUFHLEVBQUUsQ0FBQztRQUU3Qix5Q0FBeUM7UUFDekMsTUFBTSxzQkFBc0IsR0FBRyxjQUFjLENBQUMsc0JBQXNCLENBQUM7UUFDckUsTUFBTSx3QkFBd0IsR0FBRyxjQUFj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REFBNkQ7SUFDN0QsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNuQyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO1FBQ3BFLE1BQU0sSUFBSSxLQUFLLENBQUMsc0NBQXNDLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDbEUsQ0FBQztJQUVELE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMzQixNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDNUIsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFFOUQsT0FBTyxHQUFHLE9BQU8sWUFBWSxNQUFNLGtCQUFrQixjQUFjLEVBQUUsQ0FBQztBQUN4RSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHsgUmVtb3ZhbFBvbGljeSwgU3RhY2tQcm9wcywgRm4sIENmbk91dHB1dCB9IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIGVjcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWNzJztcbmltcG9ydCAqIGFzIGttcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mta21zJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5cbi8vIENvbnN0cnVjdCBpbXBvcnRzXG5pbXBvcnQgeyBEYXRhYmFzZSB9IGZyb20gJy4vY29uc3RydWN0cy9kYXRhYmFzZSc7XG5pbXBvcnQgeyBSZWRpcyB9IGZyb20gJy4vY29uc3RydWN0cy9yZWRpcyc7XG5pbXBvcnQgeyBFZnMgfSBmcm9tICcuL2NvbnN0cnVjdHMvZWZzJztcbmltcG9ydCB7IFNlY3JldHNNYW5hZ2VyIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL3NlY3JldHMtbWFuYWdlcic7XG5pbXBvcnQgeyBFbGIgfSBmcm9tICcuL2NvbnN0cnVjdHMvZWxiJztcbmltcG9ydCB7IEF1dGhlbnRpa1NlcnZlciB9IGZyb20gJy4vY29uc3RydWN0cy9hdXRoZW50aWstc2VydmVyJztcbmltcG9ydCB7IEF1dGhlbnRpa1dvcmtlciB9IGZyb20gJy4vY29uc3RydWN0cy9hdXRoZW50aWstd29ya2VyJztcbmltcG9ydCB7IExkYXAgfSBmcm9tICcuL2NvbnN0cnVjdHMvbGRhcCc7XG5pbXBvcnQgeyBMZGFwVG9rZW5SZXRyaWV2ZXIgfSBmcm9tICcuL2NvbnN0cnVjdHMvbGRhcC10b2tlbi1yZXRyaWV2ZXInO1xuaW1wb3J0IHsgUm91dGU1MyB9IGZyb20gJy4vY29uc3RydWN0cy9yb3V0ZTUzJztcbmltcG9ydCB7IFJvdXRlNTNBdXRoZW50aWsgfSBmcm9tICcuL2NvbnN0cnVjdHMvcm91dGU1My1hdXRoZW50aWsnO1xuaW1wb3J0IHsgRWNySW1hZ2VWYWxpZGF0b3IgfSBmcm9tICcuL2NvbnN0cnVjdHMvZWNyLWltYWdlLXZhbGlkYXRvcic7XG5cbi8vIENvbmZpZ3VyYXRpb24gaW1wb3J0c1xuaW1wb3J0IHR5cGUge1xuICBJbmZyYXN0cnVjdHVyZUNvbmZpZyxcbiAgU2VjcmV0c0NvbmZpZyxcbiAgU3RvcmFnZUNvbmZpZyxcbiAgRGVwbG95bWVudENvbmZpZyxcbiAgQXV0aGVudGlrQXBwbGljYXRpb25Db25maWdcbn0gZnJvbSAnLi9jb25zdHJ1Y3QtY29uZmlncyc7XG5cbi8vIFV0aWxpdHkgaW1wb3J0c1xuaW1wb3J0IHsgcmVnaXN0ZXJPdXRwdXRzIH0gZnJvbSAnLi9vdXRwdXRzJztcbmltcG9ydCB7IGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZSwgQkFTRV9FWFBPUlRfTkFNRVMgfSBmcm9tICcuL2Nsb3VkZm9ybWF0aW9uLWltcG9ydHMnO1xuaW1wb3J0IHsgQXV0aEluZnJhQ29uZmlnUmVzdWx0IH0gZnJvbSAnLi9zdGFjay1jb25maWcnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhJbmZyYVN0YWNrUHJvcHMgZXh0ZW5kcyBTdGFja1Byb3BzIHtcbiAgY29uZmlnUmVzdWx0OiBBdXRoSW5mcmFDb25maWdSZXN1bHQ7XG59XG5cbi8qKlxuICogTWFpbiBDREsgc3RhY2sgZm9yIHRoZSBUQUsgQXV0aCBJbmZyYXN0cnVjdHVyZVxuICovXG5leHBvcnQgY2xhc3MgQXV0aEluZnJhU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQXV0aEluZnJhU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwge1xuICAgICAgLi4ucHJvcHMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1RBSyBBdXRoZW50aWNhdGlvbiBMYXllciAtIEF1dGhlbnRpaywgTERBUCBPdXRwb3N0JyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHsgXG4gICAgICBzdGFja0NvbmZpZywgXG4gICAgICBlbnZpcm9ubWVudENvbmZpZywgXG4gICAgICBjb21wdXRlZFZhbHVlcyBcbiAgICB9ID0gcHJvcHMuY29uZmlnUmVzdWx0O1xuICAgIFxuICAgIC8vIEV4dHJhY3QgY29uZmlndXJhdGlvbiB2YWx1ZXNcbiAgICBjb25zdCBlbnZUeXBlID0gc3RhY2tDb25maWcuZW52VHlwZTtcbiAgICBjb25zdCBzdGFja05hbWVDb21wb25lbnQgPSBzdGFja0NvbmZpZy5zdGFja05hbWU7IC8vIFRoaXMgaXMgdGhlIFNUQUNLX05BTUUgcGFydCAoZS5nLiwgXCJNeUZpcnN0U3RhY2tcIilcbiAgICBjb25zdCByZXNvbHZlZFN0YWNrTmFtZSA9IGlkO1xuICAgIFxuICAgIC8vIFVzZSBjb21wdXRlZCB2YWx1ZXMgZnJvbSBjb25maWd1cmF0aW9uXG4gICAgY29uc3QgZW5hYmxlSGlnaEF2YWlsYWJpbGl0eSA9IGNvbXB1dGVkVmFsdWVzLmVuYWJsZUhpZ2hBdmFpbGFiaWxpdHk7XG4gICAgY29uc3QgZW5hYmxlRGV0YWlsZWRNb25pdG9yaW5nID0gY29tcHV0ZWRWYWx1ZXMuZW5hYmxlRGV0YWlsZWRNb25pdG9yaW5nO1xuXG4gICAgLy8gQWRkIEVudmlyb25tZW50IFR5cGUgdGFnIHRvIHRoZSBzdGFja1xuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnRW52aXJvbm1lbnQgVHlwZScsIGNvbXB1dGVkVmFsdWVzLmVudmlyb25tZW50TGFiZWwpO1xuXG4gICAgY29uc3Qgc3RhY2tOYW1lID0gRm4ucmVmKCdBV1M6OlN0YWNrTmFtZScpO1xuICAgIGNvbnN0IHJlZ2lvbiA9IGNkay5TdGFjay5vZih0aGlzKS5yZWdpb247XG5cbiAgICAvLyBDb250ZXh0LWJhc2VkIHBhcmFtZXRlciByZXNvbHV0aW9uXG4gICAgY29uc3QgZ2l0U2hhID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2NhbGN1bGF0ZWRHaXRTaGEnKSB8fCAnZGV2ZWxvcG1lbnQnO1xuICAgIGNvbnN0IGVuYWJsZUV4ZWN1dGUgPSBCb29sZWFuKHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdlbmFibGVFeGVjdXRlJykgfHwgZmFsc2UpO1xuICAgIGNvbnN0IGF1dGhlbnRpa0FkbWluVXNlckVtYWlsID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ3ZhbGlkYXRlZEF1dGhlbnRpa0FkbWluVXNlckVtYWlsJykgfHwgJyc7XG4gICAgY29uc3QgdXNlQXV0aGVudGlrQ29uZmlnRmlsZSA9IEJvb2xlYW4odGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ3VzZUF1dGhlbnRpa0NvbmZpZ0ZpbGUnKSB8fCBmYWxzZSk7XG4gICAgY29uc3QgbGRhcEJhc2VEbiA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdsZGFwQmFzZURuJykgfHwgJ2RjPWV4YW1wbGUsZGM9Y29tJztcbiAgICBjb25zdCBob3N0bmFtZUF1dGhlbnRpayA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdob3N0bmFtZUF1dGhlbnRpaycpIHx8ICdhY2NvdW50JztcbiAgICBjb25zdCBob3N0bmFtZUxkYXAgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnaG9zdG5hbWVMZGFwJykgfHwgJ2xkYXAnO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBJTVBPUlQgQkFTRSBJTkZSQVNUUlVDVFVSRSBSRVNPVVJDRVNcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gSW1wb3J0IFZQQyBhbmQgbmV0d29ya2luZyBmcm9tIGJhc2UgaW5mcmFzdHJ1Y3R1cmVcbiAgICAvLyBOb3RlOiBCYXNlIGluZnJhc3RydWN0dXJlIHByb3ZpZGVzIDIgc3VibmV0cyAoQSBhbmQgQiksIHNvIHdlIGxpbWl0IHRvIDIgQVpzXG4gICAgY29uc3QgdnBjQXZhaWxhYmlsaXR5Wm9uZXMgPSB0aGlzLmF2YWlsYWJpbGl0eVpvbmVzLnNsaWNlKDAsIDIpO1xuICAgIFxuICAgIGNvbnN0IHZwYyA9IGVjMi5WcGMuZnJvbVZwY0F0dHJpYnV0ZXModGhpcywgJ1ZQQycsIHtcbiAgICAgIHZwY0lkOiBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5WUENfSUQpKSxcbiAgICAgIGF2YWlsYWJpbGl0eVpvbmVzOiB2cGNBdmFpbGFiaWxpdHlab25lcyxcbiAgICAgIC8vIEltcG9ydCBzdWJuZXQgSURzIGZyb20gYmFzZSBpbmZyYXN0cnVjdHVyZVxuICAgICAgcHVibGljU3VibmV0SWRzOiBbXG4gICAgICAgIEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlNVQk5FVF9QVUJMSUNfQSkpLFxuICAgICAgICBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5TVUJORVRfUFVCTElDX0IpKVxuICAgICAgXSxcbiAgICAgIHByaXZhdGVTdWJuZXRJZHM6IFtcbiAgICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuU1VCTkVUX1BSSVZBVEVfQSkpLFxuICAgICAgICBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5TVUJORVRfUFJJVkFURV9CKSlcbiAgICAgIF0sXG4gICAgICB2cGNDaWRyQmxvY2s6IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlZQQ19DSURSX0lQVjQpKVxuICAgIH0pO1xuXG4gICAgLy8gS01TXG4gICAgY29uc3Qga21zS2V5ID0ga21zLktleS5mcm9tS2V5QXJuKHRoaXMsICdLTVNLZXknLCBcbiAgICAgIEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLktNU19LRVkpKVxuICAgICk7XG5cbiAgICAvLyBFQ1NcbiAgICBjb25zdCBlY3NDbHVzdGVyQXJuID0gRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuRUNTX0NMVVNURVIpKTtcbiAgICAvLyBFeHRyYWN0IGNsdXN0ZXIgbmFtZSBmcm9tIEFSTjogYXJuOmF3czplY3M6cmVnaW9uOmFjY291bnQ6Y2x1c3Rlci9jbHVzdGVyLW5hbWVcbiAgICBjb25zdCBlY3NDbHVzdGVyTmFtZSA9IEZuLnNlbGVjdCgxLCBGbi5zcGxpdCgnLycsIGVjc0NsdXN0ZXJBcm4pKTtcbiAgICBjb25zdCBlY3NDbHVzdGVyID0gZWNzLkNsdXN0ZXIuZnJvbUNsdXN0ZXJBdHRyaWJ1dGVzKHRoaXMsICdFQ1NDbHVzdGVyJywge1xuICAgICAgY2x1c3RlckFybjogZWNzQ2x1c3RlckFybixcbiAgICAgIGNsdXN0ZXJOYW1lOiBlY3NDbHVzdGVyTmFtZSxcbiAgICAgIHZwYzogdnBjXG4gICAgfSk7XG5cbiAgICAvLyBTM1xuICAgIGNvbnN0IHMzQ29uZkJ1Y2tldCA9IHMzLkJ1Y2tldC5mcm9tQnVja2V0QXJuKHRoaXMsICdTM0NvbmZCdWNrZXQnLFxuICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuUzNfQlVDS0VUKSlcbiAgICApO1xuXG4gICAgLy8gRUNSXG4gICAgY29uc3QgZWNyUmVwb3NpdG9yeSA9IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLkVDUl9SRVBPKSk7XG5cbiAgICAvLyBSb3V0ZTUzXG4gICAgY29uc3QgaG9zdGVkWm9uZUlkID0gRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuSE9TVEVEX1pPTkVfSUQpKTtcbiAgICBjb25zdCBob3N0ZWRab25lTmFtZSA9IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLkhPU1RFRF9aT05FX05BTUUpKTtcblxuICAgIC8vIFNTTCBDZXJ0aWZpY2F0ZVxuICAgIGNvbnN0IHNzbENlcnRpZmljYXRlQXJuID0gRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuQ0VSVElGSUNBVEVfQVJOKSk7XG5cbiAgICAvLyBBZGQgRE5TIGRvbWFpbiBuYW1lIHRhZ1xuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnRE5TIFpvbmUnLCBob3N0ZWRab25lTmFtZSk7XG5cbiAgICAvLyBTMyBFbnZpcm9ubWVudCBGaWxlIHBhdGhzIC0gYXNzdW1lcyBhdXRoZW50aWstY29uZmlnLmVudiBhbHJlYWR5IGV4aXN0cyBpbiBTM1xuICAgIGNvbnN0IGVudkZpbGVTM0tleSA9IGBhdXRoZW50aWstY29uZmlnLmVudmA7XG4gICAgY29uc3QgZW52RmlsZVMzVXJpID0gYGFybjphd3M6czM6Ojoke3MzQ29uZkJ1Y2tldC5idWNrZXROYW1lfS8ke2VudkZpbGVTM0tleX1gO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBTRUNVUklUWSBHUk9VUFNcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gU2VjdXJpdHkgR3JvdXBzXG4gICAgY29uc3QgZWNzU2VjdXJpdHlHcm91cCA9IHRoaXMuY3JlYXRlRWNzU2VjdXJpdHlHcm91cCh2cGMpO1xuICAgIGNvbnN0IGRiU2VjdXJpdHlHcm91cCA9IHRoaXMuY3JlYXRlRGJTZWN1cml0eUdyb3VwKHZwYywgZWNzU2VjdXJpdHlHcm91cCk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIEJVSUxEIENPTkZJR1VSQVRJT04gT0JKRUNUU1xuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBCdWlsZCBzaGFyZWQgaW5mcmFzdHJ1Y3R1cmUgY29uZmlnXG4gICAgY29uc3QgaW5mcmFzdHJ1Y3R1cmVDb25maWc6IEluZnJhc3RydWN0dXJlQ29uZmlnID0ge1xuICAgICAgdnBjLFxuICAgICAgZWNzU2VjdXJpdHlHcm91cCxcbiAgICAgIGVjc0NsdXN0ZXIsXG4gICAgICBrbXNLZXlcbiAgICB9O1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBDT1JFIElORlJBU1RSVUNUVVJFXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIFNlY3JldHNNYW5hZ2VyXG4gICAgY29uc3Qgc2VjcmV0c01hbmFnZXIgPSBuZXcgU2VjcmV0c01hbmFnZXIodGhpcywgJ1NlY3JldHNNYW5hZ2VyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIHN0YWNrTmFtZTogcmVzb2x2ZWRTdGFja05hbWUsXG4gICAgICBpbmZyYXN0cnVjdHVyZTogaW5mcmFzdHJ1Y3R1cmVDb25maWdcbiAgICB9KTtcblxuICAgIC8vIERhdGFiYXNlXG4gICAgY29uc3QgZGF0YWJhc2UgPSBuZXcgRGF0YWJhc2UodGhpcywgJ0RhdGFiYXNlJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIHN0YWNrTmFtZTogcmVzb2x2ZWRTdGFja05hbWUsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAgaW5mcmFzdHJ1Y3R1cmU6IGluZnJhc3RydWN0dXJlQ29uZmlnLFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtkYlNlY3VyaXR5R3JvdXBdXG4gICAgfSk7XG5cbiAgICAvLyBSZWRpc1xuICAgIGNvbnN0IHJlZGlzID0gbmV3IFJlZGlzKHRoaXMsICdSZWRpcycsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBzdGFja05hbWU6IHJlc29sdmVkU3RhY2tOYW1lLFxuICAgICAgY29uZmlnOiBlbnZpcm9ubWVudENvbmZpZyxcbiAgICAgIGluZnJhc3RydWN0dXJlOiBpbmZyYXN0cnVjdHVyZUNvbmZpZyxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbZWNzU2VjdXJpdHlHcm91cF1cbiAgICB9KTtcblxuICAgIC8vIEVGU1xuICAgIGNvbnN0IGVmcyA9IG5ldyBFZnModGhpcywgJ0VGUycsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAgaW5mcmFzdHJ1Y3R1cmU6IGluZnJhc3RydWN0dXJlQ29uZmlnLFxuICAgICAgdnBjQ2lkckJsb2NrOiBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5WUENfQ0lEUl9JUFY0KSksXG4gICAgICBhbGxvd0FjY2Vzc0Zyb206IFtlY3NTZWN1cml0eUdyb3VwXVxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBJTUFHRSBWQUxJREFUSU9OXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIFZhbGlkYXRlIHJlcXVpcmVkIEVDUiBpbWFnZXMgZXhpc3QgYmVmb3JlIGRlcGxveW1lbnRcbiAgICBjb25zdCByZXF1aXJlZEltYWdlVGFncyA9IFtcbiAgICAgIGBhdXRoLWluZnJhLXNlcnZlci0ke2dpdFNoYX1gLFxuICAgICAgYGF1dGgtaW5mcmEtbGRhcC0ke2dpdFNoYX1gXG4gICAgXTtcbiAgICBcbiAgICBjb25zdCBlY3JWYWxpZGF0b3IgPSBuZXcgRWNySW1hZ2VWYWxpZGF0b3IodGhpcywgJ0VjckltYWdlVmFsaWRhdG9yJywge1xuICAgICAgZWNyUmVwb3NpdG9yeUFybjogZWNyUmVwb3NpdG9yeSxcbiAgICAgIHJlcXVpcmVkSW1hZ2VUYWdzOiByZXF1aXJlZEltYWdlVGFncyxcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIEJVSUxEIENPTkZJR1VSQVRJT04gT0JKRUNUU1xuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBCdWlsZCBzaGFyZWQgY29uZmlnIG9iamVjdHNcbiAgICBjb25zdCBzZWNyZXRzQ29uZmlnOiBTZWNyZXRzQ29uZmlnID0ge1xuICAgICAgZGF0YWJhc2U6IGRhdGFiYXNlLm1hc3RlclNlY3JldCxcbiAgICAgIHJlZGlzQXV0aFRva2VuOiByZWRpcy5hdXRoVG9rZW4sXG4gICAgICBhdXRoZW50aWs6IHtcbiAgICAgICAgc2VjcmV0S2V5OiBzZWNyZXRzTWFuYWdlci5zZWNyZXRLZXksXG4gICAgICAgIGFkbWluVXNlclBhc3N3b3JkOiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJQYXNzd29yZCxcbiAgICAgICAgYWRtaW5Vc2VyVG9rZW46IHNlY3JldHNNYW5hZ2VyLmFkbWluVXNlclRva2VuLFxuICAgICAgICBsZGFwVG9rZW46IHNlY3JldHNNYW5hZ2VyLmxkYXBUb2tlbixcbiAgICAgICAgbGRhcFNlcnZpY2VVc2VyOiBzZWNyZXRzTWFuYWdlci5sZGFwU2VydmljZVVzZXJcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgY29uc3Qgc3RvcmFnZUNvbmZpZzogU3RvcmFnZUNvbmZpZyA9IHtcbiAgICAgIHMzOiB7XG4gICAgICAgIGNvbmZpZ0J1Y2tldDogczNDb25mQnVja2V0LFxuICAgICAgICBlbnZGaWxlVXJpOiBlbnZGaWxlUzNVcmksXG4gICAgICAgIGVudkZpbGVLZXk6IGVudkZpbGVTM0tleVxuICAgICAgfSxcbiAgICAgIGVmczoge1xuICAgICAgICBmaWxlU3lzdGVtSWQ6IGVmcy5maWxlU3lzdGVtLmZpbGVTeXN0ZW1JZCxcbiAgICAgICAgbWVkaWFBY2Nlc3NQb2ludElkOiBlZnMubWVkaWFBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkLFxuICAgICAgICBjdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludElkOiBlZnMuY3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnQuYWNjZXNzUG9pbnRJZFxuICAgICAgfVxuICAgIH07XG5cbiAgICBjb25zdCBkZXBsb3ltZW50Q29uZmlnOiBEZXBsb3ltZW50Q29uZmlnID0ge1xuICAgICAgZ2l0U2hhOiBnaXRTaGEsXG4gICAgICBlY3JSZXBvc2l0b3J5QXJuOiBlY3JSZXBvc2l0b3J5LFxuICAgICAgZW5hYmxlRXhlY3V0ZTogZW5hYmxlRXhlY3V0ZSxcbiAgICAgIHVzZUNvbmZpZ0ZpbGU6IHVzZUF1dGhlbnRpa0NvbmZpZ0ZpbGVcbiAgICB9O1xuXG4gICAgY29uc3QgYXBwbGljYXRpb25Db25maWc6IEF1dGhlbnRpa0FwcGxpY2F0aW9uQ29uZmlnID0ge1xuICAgICAgYWRtaW5Vc2VyRW1haWw6IGF1dGhlbnRpa0FkbWluVXNlckVtYWlsLFxuICAgICAgbGRhcEJhc2VEbjogbGRhcEJhc2VEbixcbiAgICAgIGRhdGFiYXNlOiB7XG4gICAgICAgIGhvc3RuYW1lOiBkYXRhYmFzZS5ob3N0bmFtZVxuICAgICAgfSxcbiAgICAgIHJlZGlzOiB7XG4gICAgICAgIGhvc3RuYW1lOiByZWRpcy5ob3N0bmFtZVxuICAgICAgfSxcbiAgICAgIGF1dGhlbnRpa0hvc3Q6IGBodHRwczovLyR7aG9zdG5hbWVBdXRoZW50aWt9LiR7aG9zdGVkWm9uZU5hbWV9YFxuICAgIH07XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIEFQUExJQ0FUSU9OIFNFUlZJQ0VTXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIEF1dGhlbnRpayBMb2FkIEJhbGFuY2VyXG4gICAgY29uc3QgYXV0aGVudGlrRUxCID0gbmV3IEVsYih0aGlzLCAnQXV0aGVudGlrRUxCJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogZW52aXJvbm1lbnRDb25maWcsXG4gICAgICB2cGMsXG4gICAgICBzc2xDZXJ0aWZpY2F0ZUFybjogc3NsQ2VydGlmaWNhdGVBcm5cbiAgICB9KTtcblxuICAgIC8vIEF1dGhlbnRpayBTZXJ2ZXJcbiAgICBjb25zdCBhdXRoZW50aWtTZXJ2ZXIgPSBuZXcgQXV0aGVudGlrU2VydmVyKHRoaXMsICdBdXRoZW50aWtTZXJ2ZXInLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBlbnZpcm9ubWVudENvbmZpZyxcbiAgICAgIGluZnJhc3RydWN0dXJlOiBpbmZyYXN0cnVjdHVyZUNvbmZpZyxcbiAgICAgIHNlY3JldHM6IHNlY3JldHNDb25maWcsXG4gICAgICBzdG9yYWdlOiBzdG9yYWdlQ29uZmlnLFxuICAgICAgZGVwbG95bWVudDogZGVwbG95bWVudENvbmZpZyxcbiAgICAgIGFwcGxpY2F0aW9uOiBhcHBsaWNhdGlvbkNvbmZpZ1xuICAgIH0pO1xuXG4gICAgLy8gRW5zdXJlIEF1dGhlbnRpayBTZXJ2ZXIgd2FpdHMgZm9yIEVDUiBpbWFnZSB2YWxpZGF0aW9uXG4gICAgYXV0aGVudGlrU2VydmVyLm5vZGUuYWRkRGVwZW5kZW5jeShlY3JWYWxpZGF0b3IpO1xuXG4gICAgLy8gQXV0aGVudGlrIFdvcmtlciAgXG4gICAgLy8gVXBkYXRlIGF1dGhlbnRpY2F0aW9uIGhvc3QgZm9yIHdvcmtlciBhZnRlciBSb3V0ZTUzIHNldHVwXG4gICAgY29uc3QgYXV0aGVudGlrV29ya2VyQ29uZmlnID0geyAuLi5hcHBsaWNhdGlvbkNvbmZpZyB9O1xuICAgIGNvbnN0IGF1dGhlbnRpa1dvcmtlciA9IG5ldyBBdXRoZW50aWtXb3JrZXIodGhpcywgJ0F1dGhlbnRpa1dvcmtlcicsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAgaW5mcmFzdHJ1Y3R1cmU6IGluZnJhc3RydWN0dXJlQ29uZmlnLFxuICAgICAgc2VjcmV0czogc2VjcmV0c0NvbmZpZyxcbiAgICAgIHN0b3JhZ2U6IHN0b3JhZ2VDb25maWcsXG4gICAgICBkZXBsb3ltZW50OiBkZXBsb3ltZW50Q29uZmlnLFxuICAgICAgYXBwbGljYXRpb246IGF1dGhlbnRpa1dvcmtlckNvbmZpZ1xuICAgIH0pO1xuXG4gICAgLy8gRW5zdXJlIEF1dGhlbnRpayBXb3JrZXIgd2FpdHMgZm9yIEVDUiBpbWFnZSB2YWxpZGF0aW9uXG4gICAgYXV0aGVudGlrV29ya2VyLm5vZGUuYWRkRGVwZW5kZW5jeShlY3JWYWxpZGF0b3IpO1xuXG4gICAgLy8gQ29ubmVjdCBBdXRoZW50aWsgU2VydmVyIHRvIExvYWQgQmFsYW5jZXJcbiAgICBhdXRoZW50aWtTZXJ2ZXIuY3JlYXRlVGFyZ2V0R3JvdXAodnBjLCBhdXRoZW50aWtFTEIuaHR0cHNMaXN0ZW5lcik7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIEROUyBTRVRVUCAoQVVUSEVOVElLKVxuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBSb3V0ZTUzIEF1dGhlbnRpayBETlMgUmVjb3JkcyAobmVlZGVkIGJlZm9yZSBMREFQIHRva2VuIHJldHJpZXZlcilcbiAgICBjb25zdCByb3V0ZTUzQXV0aGVudGlrID0gbmV3IFJvdXRlNTNBdXRoZW50aWsodGhpcywgJ1JvdXRlNTNBdXRoZW50aWsnLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBlbnZpcm9ubWVudENvbmZpZyxcbiAgICAgIGhvc3RlZFpvbmVJZDogaG9zdGVkWm9uZUlkLFxuICAgICAgaG9zdGVkWm9uZU5hbWU6IGhvc3RlZFpvbmVOYW1lLFxuICAgICAgaG9zdG5hbWVBdXRoZW50aWs6IGhvc3RuYW1lQXV0aGVudGlrLFxuICAgICAgYXV0aGVudGlrTG9hZEJhbGFuY2VyOiBhdXRoZW50aWtFTEIubG9hZEJhbGFuY2VyXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIExEQVAgQ09ORklHVVJBVElPTlxuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBMREFQIFRva2VuIFJldHJpZXZlclxuICAgIGNvbnN0IGxkYXBUb2tlblJldHJpZXZlciA9IG5ldyBMZGFwVG9rZW5SZXRyaWV2ZXIodGhpcywgJ0xkYXBUb2tlblJldHJpZXZlcicsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAga21zS2V5LFxuICAgICAgLy8gVXNlIHByb3BlciBGUUROIHRoYXQgbWF0Y2hlcyBUTFMgY2VydGlmaWNhdGUsIG5vdCBFTEIgRE5TIG5hbWVcbiAgICAgIGF1dGhlbnRpa0hvc3Q6IHJvdXRlNTNBdXRoZW50aWsuZ2V0QXV0aGVudGlrVXJsKCksXG4gICAgICBvdXRwb3N0TmFtZTogJ0xEQVAnLFxuICAgICAgYWRtaW5Ub2tlblNlY3JldDogc2VjcmV0c01hbmFnZXIuYWRtaW5Vc2VyVG9rZW4sXG4gICAgICBsZGFwVG9rZW5TZWNyZXQ6IHNlY3JldHNNYW5hZ2VyLmxkYXBUb2tlbixcbiAgICAgIGdpdFNoYTogZ2l0U2hhLFxuICAgICAgYXV0aGVudGlrU2VydmVyU2VydmljZTogYXV0aGVudGlrU2VydmVyLmVjc1NlcnZpY2UsXG4gICAgICBhdXRoZW50aWtXb3JrZXJTZXJ2aWNlOiBhdXRoZW50aWtXb3JrZXIuZWNzU2VydmljZVxuICAgIH0pO1xuXG4gICAgLy8gTERBUFxuICAgIGNvbnN0IGxkYXAgPSBuZXcgTGRhcCh0aGlzLCAnTERBUCcsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAgdnBjLFxuICAgICAgZWNzU2VjdXJpdHlHcm91cCxcbiAgICAgIGVjc0NsdXN0ZXIsXG4gICAgICBzM0NvbmZCdWNrZXQsXG4gICAgICBzc2xDZXJ0aWZpY2F0ZUFybjogc3NsQ2VydGlmaWNhdGVBcm4sXG4gICAgICBhdXRoZW50aWtIb3N0OiByb3V0ZTUzQXV0aGVudGlrLmF1dGhlbnRpa0ZxZG4sXG4gICAgICBlY3JSZXBvc2l0b3J5QXJuOiBlY3JSZXBvc2l0b3J5LFxuICAgICAgZ2l0U2hhOiBnaXRTaGEsXG4gICAgICBlbmFibGVFeGVjdXRlOiBlbmFibGVFeGVjdXRlLFxuICAgICAga21zS2V5LFxuICAgICAgbGRhcFRva2VuOiBzZWNyZXRzTWFuYWdlci5sZGFwVG9rZW5cbiAgICB9KTtcblxuICAgIC8vIEVuc3VyZSBMREFQIHdhaXRzIGZvciBFQ1IgaW1hZ2UgdmFsaWRhdGlvblxuICAgIGxkYXAubm9kZS5hZGREZXBlbmRlbmN5KGVjclZhbGlkYXRvcik7XG4gICAgLy8gRW5zdXJlIExEQVAgd2FpdHMgZm9yIHRoZSB0b2tlbiB0byBiZSByZXRyaWV2ZWRcbiAgICBsZGFwLm5vZGUuYWRkRGVwZW5kZW5jeShsZGFwVG9rZW5SZXRyaWV2ZXIpO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBETlMgQU5EIFJPVVRJTkdcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBETlMgU0VUVVAgKExEQVApXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIFJvdXRlNTMgTERBUCBETlMgUmVjb3JkcyAoYWZ0ZXIgTERBUCBjb25zdHJ1Y3QgaXMgY3JlYXRlZClcbiAgICBjb25zdCByb3V0ZTUzID0gbmV3IFJvdXRlNTModGhpcywgJ1JvdXRlNTMnLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBlbnZpcm9ubWVudENvbmZpZyxcbiAgICAgIGhvc3RlZFpvbmVJZDogaG9zdGVkWm9uZUlkLFxuICAgICAgaG9zdGVkWm9uZU5hbWU6IGhvc3RlZFpvbmVOYW1lLFxuICAgICAgaG9zdG5hbWVMZGFwOiBob3N0bmFtZUxkYXAsXG4gICAgICBsZGFwTG9hZEJhbGFuY2VyOiBsZGFwLmxvYWRCYWxhbmNlclxuICAgIH0pO1xuXG4gICAgLy8gQWRkIGRlcGVuZGVuY3kgZm9yIExEQVAgdG9rZW4gcmV0cmlldmVyIHRvIHdhaXQgZm9yIEF1dGhlbnRpayBETlMgcmVjb3Jkc1xuICAgIGxkYXBUb2tlblJldHJpZXZlci5jdXN0b21SZXNvdXJjZS5ub2RlLmFkZERlcGVuZGVuY3kocm91dGU1M0F1dGhlbnRpay5hdXRoZW50aWtBUmVjb3JkKTtcbiAgICBsZGFwVG9rZW5SZXRyaWV2ZXIuY3VzdG9tUmVzb3VyY2Uubm9kZS5hZGREZXBlbmRlbmN5KHJvdXRlNTNBdXRoZW50aWsuYXV0aGVudGlrQUFBQVJlY29yZCk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIFNUQUNLIE9VVFBVVFNcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gT3V0cHV0c1xuICAgIHJlZ2lzdGVyT3V0cHV0cyh7XG4gICAgICBzdGFjazogdGhpcyxcbiAgICAgIHN0YWNrTmFtZTogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgZGF0YWJhc2VFbmRwb2ludDogZGF0YWJhc2UuaG9zdG5hbWUsXG4gICAgICBkYXRhYmFzZVNlY3JldEFybjogZGF0YWJhc2UubWFzdGVyU2VjcmV0LnNlY3JldEFybixcbiAgICAgIHJlZGlzRW5kcG9pbnQ6IHJlZGlzLmhvc3RuYW1lLFxuICAgICAgcmVkaXNBdXRoVG9rZW5Bcm46IHJlZGlzLmF1dGhUb2tlbi5zZWNyZXRBcm4sXG4gICAgICBlZnNJZDogZWZzLmZpbGVTeXN0ZW0uZmlsZVN5c3RlbUlkLFxuICAgICAgZWZzTWVkaWFBY2Nlc3NQb2ludElkOiBlZnMubWVkaWFBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkLFxuICAgICAgZWZzVGVtcGxhdGVzQWNjZXNzUG9pbnRJZDogZWZzLmN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWQsXG4gICAgICBhdXRoZW50aWtTZWNyZXRLZXlBcm46IHNlY3JldHNNYW5hZ2VyLnNlY3JldEtleS5zZWNyZXRBcm4sXG4gICAgICBhdXRoZW50aWtBZG1pblRva2VuQXJuOiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJUb2tlbi5zZWNyZXRBcm4sXG4gICAgICBhdXRoZW50aWtMZGFwVG9rZW5Bcm46IHNlY3JldHNNYW5hZ2VyLmxkYXBUb2tlbi5zZWNyZXRBcm4sXG4gICAgICBhdXRoZW50aWtBbGJEbnM6IGF1dGhlbnRpa0VMQi5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZSxcbiAgICAgIGF1dGhlbnRpa1VybDogYGh0dHBzOi8vJHthdXRoZW50aWtFTEIuZG5zTmFtZX1gLFxuICAgICAgbGRhcE5sYkRuczogbGRhcC5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZSxcbiAgICAgIGxkYXBUb2tlblJldHJpZXZlckxhbWJkYUFybjogbGRhcFRva2VuUmV0cmlldmVyLmxhbWJkYUZ1bmN0aW9uLmZ1bmN0aW9uQXJuXG4gICAgfSk7XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PVxuICAvLyBIRUxQRVIgTUVUSE9EU1xuICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgc2VjdXJpdHkgZ3JvdXAgZm9yIEVDUyB0YXNrc1xuICAgKiBAcGFyYW0gdnBjIFRoZSBWUEMgdG8gY3JlYXRlIHRoZSBzZWN1cml0eSBncm91cCBpblxuICAgKiBAcmV0dXJucyBUaGUgY3JlYXRlZCBzZWN1cml0eSBncm91cFxuICAgKi9cbiAgcHJpdmF0ZSBjcmVhdGVFY3NTZWN1cml0eUdyb3VwKHZwYzogZWMyLklWcGMpOiBlYzIuU2VjdXJpdHlHcm91cCB7XG4gICAgY29uc3QgZWNzU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnRUNTU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIEVDUyB0YXNrcycsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBIVFRQL0hUVFBTIHRyYWZmaWMgdG8gRUNTIHRhc2tzXG4gICAgZWNzU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg4MCksXG4gICAgICAnQWxsb3cgSFRUUCB0cmFmZmljJ1xuICAgICk7XG5cbiAgICBlY3NTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuYW55SXB2NCgpLFxuICAgICAgZWMyLlBvcnQudGNwKDQ0MyksXG4gICAgICAnQWxsb3cgSFRUUFMgdHJhZmZpYydcbiAgICApO1xuXG4gICAgZWNzU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg5MDAwKSxcbiAgICAgICdBbGxvdyBBdXRoZW50aWsgdHJhZmZpYydcbiAgICApO1xuXG4gICAgcmV0dXJuIGVjc1NlY3VyaXR5R3JvdXA7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIHNlY3VyaXR5IGdyb3VwIGZvciBkYXRhYmFzZSBhY2Nlc3NcbiAgICogQHBhcmFtIHZwYyBUaGUgVlBDIHRvIGNyZWF0ZSB0aGUgc2VjdXJpdHkgZ3JvdXAgaW5cbiAgICogQHBhcmFtIGVjc1NlY3VyaXR5R3JvdXAgVGhlIEVDUyBzZWN1cml0eSBncm91cCB0byBhbGxvdyBhY2Nlc3MgZnJvbVxuICAgKiBAcmV0dXJucyBUaGUgY3JlYXRlZCBzZWN1cml0eSBncm91cFxuICAgKi9cbiAgcHJpdmF0ZSBjcmVhdGVEYlNlY3VyaXR5R3JvdXAodnBjOiBlYzIuSVZwYywgZWNzU2VjdXJpdHlHcm91cDogZWMyLlNlY3VyaXR5R3JvdXApOiBlYzIuU2VjdXJpdHlHcm91cCB7XG4gICAgY29uc3QgZGJTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdEQlNlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBkYXRhYmFzZScsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiBmYWxzZVxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgUG9zdGdyZVNRTCBhY2Nlc3MgZnJvbSBFQ1MgdGFza3NcbiAgICBkYlNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5zZWN1cml0eUdyb3VwSWQoZWNzU2VjdXJpdHlHcm91cC5zZWN1cml0eUdyb3VwSWQpLFxuICAgICAgZWMyLlBvcnQudGNwKDU0MzIpLFxuICAgICAgJ0FsbG93IFBvc3RncmVTUUwgYWNjZXNzIGZyb20gRUNTIHRhc2tzJ1xuICAgICk7XG5cbiAgICByZXR1cm4gZGJTZWN1cml0eUdyb3VwO1xuICB9XG59XG5cbi8qKlxuICogQ29udmVydHMgYW4gRUNSIHJlcG9zaXRvcnkgQVJOIHRvIGEgcHJvcGVyIEVDUiByZXBvc2l0b3J5IFVSSSBmb3IgRG9ja2VyIGltYWdlc1xuICogQHBhcmFtIGVjckFybiAtIEVDUiByZXBvc2l0b3J5IEFSTiAoZS5nLiwgXCJhcm46YXdzOmVjcjpyZWdpb246YWNjb3VudDpyZXBvc2l0b3J5L3JlcG8tbmFtZVwiKVxuICogQHJldHVybnMgRUNSIHJlcG9zaXRvcnkgVVJJIChlLmcuLCBcImFjY291bnQuZGtyLmVjci5yZWdpb24uYW1hem9uYXdzLmNvbS9yZXBvLW5hbWVcIilcbiAqL1xuZnVuY3Rpb24gY29udmVydEVjckFyblRvUmVwb3NpdG9yeVVyaShlY3JBcm46IHN0cmluZyk6IHN0cmluZyB7XG4gIC8vIFBhcnNlIEFSTjogYXJuOmF3czplY3I6cmVnaW9uOmFjY291bnQ6cmVwb3NpdG9yeS9yZXBvLW5hbWVcbiAgY29uc3QgYXJuUGFydHMgPSBlY3JBcm4uc3BsaXQoJzonKTtcbiAgaWYgKGFyblBhcnRzLmxlbmd0aCAhPT0gNiB8fCAhYXJuUGFydHNbNV0uc3RhcnRzV2l0aCgncmVwb3NpdG9yeS8nKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBFQ1IgcmVwb3NpdG9yeSBBUk4gZm9ybWF0OiAke2VjckFybn1gKTtcbiAgfVxuICBcbiAgY29uc3QgcmVnaW9uID0gYXJuUGFydHNbM107XG4gIGNvbnN0IGFjY291bnQgPSBhcm5QYXJ0c1s0XTtcbiAgY29uc3QgcmVwb3NpdG9yeU5hbWUgPSBhcm5QYXJ0c1s1XS5yZXBsYWNlKCdyZXBvc2l0b3J5LycsICcnKTtcbiAgXG4gIHJldHVybiBgJHthY2NvdW50fS5ka3IuZWNyLiR7cmVnaW9ufS5hbWF6b25hd3MuY29tLyR7cmVwb3NpdG9yeU5hbWV9YDtcbn1cbiJdfQ==