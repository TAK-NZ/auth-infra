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
        // Use environment configuration directly (no complex transformations needed)
        const { envConfig } = props;
        // Extract configuration values directly from envConfig
        const stackNameComponent = envConfig.stackName; // This is the STACK_NAME part (e.g., "DevTest")
        // Import values from BaseInfra stack exports instead of using config parameters
        const vpcCidr = aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.VPC_CIDR_IPV4));
        const r53ZoneName = aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.HOSTED_ZONE_NAME));
        const isHighAvailability = props.environment === 'prod';
        const environmentLabel = props.environment === 'prod' ? 'Prod' : 'Dev-Test';
        const resolvedStackName = id;
        // Use computed values from configuration
        const enableHighAvailability = isHighAvailability;
        const enableDetailedMonitoring = envConfig.general.enableDetailedLogging;
        // Add Environment Type tag to the stack
        cdk.Tags.of(this).add('Environment Type', environmentLabel);
        // TODO: Replace with direct context usage once constructs are updated
        // For now, we'll use envConfig directly but rename it for clarity
        const environmentConfig = envConfig; // Direct context usage (matches reference pattern)
        const stackName = aws_cdk_lib_1.Fn.ref('AWS::StackName');
        const region = cdk.Stack.of(this).region;
        // Configuration-based parameter resolution
        const authentikAdminUserEmail = envConfig.authentik.adminUserEmail;
        const ldapBaseDn = `dc=${r53ZoneName.split('.').join(',dc=')}`;
        const hostnameAuthentik = envConfig.authentik.domain.split('.')[0]; // Extract subdomain
        const hostnameLdap = envConfig.ldap.domain.split('.')[0]; // Extract subdomain
        const gitSha = 'latest'; // Use fixed tag for context-driven approach
        const enableExecute = false; // Disable by default for security
        const useAuthentikConfigFile = false; // Use environment variables
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
        // S3 Environment File paths - assumes authentik-config.env already exists in S3
        const envFileS3Key = `authentik-config.env`;
        const envFileS3Uri = `arn:aws:s3:::${s3ConfBucket.bucketName}/${envFileS3Key}`;
        // =================
        // SECURITY GROUPS
        // =================
        // Security Groups
        const authentikSecurityGroup = this.createAuthentikSecurityGroup(vpc, stackNameComponent);
        const ldapSecurityGroup = this.createLdapSecurityGroup(vpc, stackNameComponent);
        const dbSecurityGroup = this.createDbSecurityGroup(vpc, authentikSecurityGroup);
        // =================
        // BUILD CONFIGURATION OBJECTS
        // =================
        // Build shared infrastructure config for Authentik services
        const authentikInfrastructureConfig = {
            vpc,
            ecsSecurityGroup: authentikSecurityGroup,
            ecsCluster,
            kmsKey
        };
        // Build shared infrastructure config for LDAP services
        const ldapInfrastructureConfig = {
            vpc,
            ecsSecurityGroup: ldapSecurityGroup,
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
            infrastructure: authentikInfrastructureConfig
        });
        // Database
        const database = new database_1.Database(this, 'Database', {
            environment: props.environment,
            stackName: resolvedStackName,
            contextConfig: envConfig,
            infrastructure: authentikInfrastructureConfig,
            securityGroups: [dbSecurityGroup]
        });
        // Redis
        const redis = new redis_1.Redis(this, 'Redis', {
            environment: props.environment,
            stackName: resolvedStackName,
            contextConfig: envConfig,
            infrastructure: authentikInfrastructureConfig,
            securityGroups: [authentikSecurityGroup]
        });
        // EFS
        const efs = new efs_1.Efs(this, 'EFS', {
            environment: props.environment,
            contextConfig: envConfig,
            infrastructure: authentikInfrastructureConfig,
            vpcCidrBlock: aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.VPC_CIDR_IPV4)),
            allowAccessFrom: [authentikSecurityGroup]
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
        // Build network config for DNS and load balancers
        const authentikNetworkConfig = {
            hostedZoneId: hostedZoneId,
            hostedZoneName: hostedZoneName,
            sslCertificateArn: sslCertificateArn,
            hostname: hostnameAuthentik
        };
        const ldapNetworkConfig = {
            hostedZoneId: hostedZoneId,
            hostedZoneName: hostedZoneName,
            sslCertificateArn: sslCertificateArn,
            hostname: hostnameLdap
        };
        // =================
        // APPLICATION SERVICES
        // =================
        // Authentik Load Balancer
        const authentikELB = new elb_1.Elb(this, 'AuthentikELB', {
            environment: props.environment,
            contextConfig: envConfig,
            infrastructure: authentikInfrastructureConfig,
            network: authentikNetworkConfig
        });
        // Authentik Server
        const authentikServer = new authentik_server_1.AuthentikServer(this, 'AuthentikServer', {
            environment: props.environment,
            contextConfig: envConfig,
            infrastructure: authentikInfrastructureConfig,
            secrets: secretsConfig,
            storage: storageConfig,
            deployment: deploymentConfig,
            application: applicationConfig
        });
        // Authentik Worker  
        // Update authentication host for worker after Route53 setup
        const authentikWorkerConfig = { ...applicationConfig };
        const authentikWorker = new authentik_worker_1.AuthentikWorker(this, 'AuthentikWorker', {
            environment: props.environment,
            contextConfig: envConfig,
            infrastructure: authentikInfrastructureConfig,
            secrets: secretsConfig,
            storage: storageConfig,
            deployment: deploymentConfig,
            application: authentikWorkerConfig
        });
        // Connect Authentik Server to Load Balancer
        authentikServer.createTargetGroup(vpc, authentikELB.httpsListener);
        // =================
        // DNS SETUP (AUTHENTIK)
        // =================
        // Route53 Authentik DNS Records (needed before LDAP token retriever)
        const route53Authentik = new route53_authentik_1.Route53Authentik(this, 'Route53Authentik', {
            environment: props.environment,
            contextConfig: envConfig,
            network: authentikNetworkConfig,
            authentikLoadBalancer: authentikELB.loadBalancer
        });
        // =================
        // LDAP CONFIGURATION
        // =================
        // Build token config for LDAP token retrieval
        const tokenConfig = {
            outpostName: 'LDAP',
            adminTokenSecret: secretsManager.adminUserToken,
            ldapTokenSecret: secretsManager.ldapToken,
            authentikServerService: authentikServer.ecsService,
            authentikWorkerService: authentikWorker.ecsService
        };
        // Update application config with proper Authentik URL
        const ldapApplicationConfig = {
            ...applicationConfig,
            authentikHost: route53Authentik.getAuthentikUrl()
        };
        // LDAP Token Retriever
        const ldapTokenRetriever = new ldap_token_retriever_1.LdapTokenRetriever(this, 'LdapTokenRetriever', {
            environment: props.environment,
            contextConfig: envConfig,
            infrastructure: authentikInfrastructureConfig,
            deployment: deploymentConfig,
            token: tokenConfig,
            application: ldapApplicationConfig
        });
        // LDAP
        const ldap = new ldap_1.Ldap(this, 'LDAP', {
            environment: props.environment,
            contextConfig: envConfig,
            infrastructure: ldapInfrastructureConfig,
            storage: storageConfig,
            deployment: deploymentConfig,
            network: ldapNetworkConfig,
            application: ldapApplicationConfig,
            ldapToken: secretsManager.ldapToken
        });
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
            environment: props.environment,
            contextConfig: envConfig,
            network: ldapNetworkConfig,
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
            stackName: stackName,
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
            ldapEndpoint: `ldap://${ldap.dnsName}:389`,
            ldapsEndpoint: `ldaps://${ldap.dnsName}:636`,
            ldapTokenRetrieverLambdaArn: ldapTokenRetriever.lambdaFunction.functionArn
        });
    }
    // =================
    // HELPER METHODS
    // =================
    /**
     * Create security group for Authentik ECS tasks (Server/Worker)
     * @param vpc The VPC to create the security group in
     * @param stackNameComponent The stack name component for imports
     * @returns The created security group
     */
    createAuthentikSecurityGroup(vpc, stackNameComponent) {
        const authentikSecurityGroup = new ec2.SecurityGroup(this, 'AuthentikSecurityGroup', {
            vpc,
            description: 'Security group for Authentik ECS tasks (Server/Worker)',
            allowAllOutbound: true
        });
        // Allow HTTP/HTTPS traffic to Authentik tasks
        authentikSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP traffic');
        authentikSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Allow HTTPS traffic');
        // Allow Authentik application traffic (port 9000) from VPC CIDR
        authentikSecurityGroup.addIngressRule(ec2.Peer.ipv4(aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.VPC_CIDR_IPV4))), ec2.Port.tcp(9000), 'Allow Authentik traffic from VPC');
        return authentikSecurityGroup;
    }
    /**
     * Create security group for LDAP ECS tasks
     * @param vpc The VPC to create the security group in
     * @param stackNameComponent The stack name component for imports
     * @returns The created security group
     */
    createLdapSecurityGroup(vpc, stackNameComponent) {
        const ldapSecurityGroup = new ec2.SecurityGroup(this, 'LdapSecurityGroup', {
            vpc,
            description: 'Security group for LDAP ECS tasks',
            allowAllOutbound: true
        });
        // Allow LDAP traffic (port 3389) from VPC CIDR
        ldapSecurityGroup.addIngressRule(ec2.Peer.ipv4(aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.VPC_CIDR_IPV4))), ec2.Port.tcp(3389), 'Allow LDAP traffic from VPC');
        // Allow LDAPS traffic (port 6636) from VPC CIDR
        ldapSecurityGroup.addIngressRule(ec2.Peer.ipv4(aws_cdk_lib_1.Fn.importValue((0, cloudformation_imports_1.createBaseImportValue)(stackNameComponent, cloudformation_imports_1.BASE_EXPORT_NAMES.VPC_CIDR_IPV4))), ec2.Port.tcp(6636), 'Allow LDAPS traffic from VPC');
        return ldapSecurityGroup;
    }
    /**
     * Create security group for ECS tasks (Legacy - keeping for backward compatibility)
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGgtaW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFFbkMsNkNBQXVFO0FBQ3ZFLHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLHVEQUF5QztBQUV6QyxvQkFBb0I7QUFDcEIsb0RBQWlEO0FBQ2pELDhDQUEyQztBQUMzQywwQ0FBdUM7QUFDdkMsa0VBQThEO0FBQzlELDBDQUF1QztBQUN2QyxvRUFBZ0U7QUFDaEUsb0VBQWdFO0FBQ2hFLDRDQUF5QztBQUN6Qyw0RUFBdUU7QUFDdkUsa0RBQStDO0FBQy9DLHNFQUFrRTtBQWFsRSxrQkFBa0I7QUFDbEIsdUNBQTRDO0FBQzVDLHFFQUFvRjtBQVNwRjs7R0FFRztBQUNILE1BQWEsY0FBZSxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQzNDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBMEI7UUFDbEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUU7WUFDZixHQUFHLEtBQUs7WUFDUixXQUFXLEVBQUUsb0RBQW9EO1NBQ2xFLENBQUMsQ0FBQztRQUVILDZFQUE2RTtRQUM3RSxNQUFNLEVBQUUsU0FBUyxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRTVCLHVEQUF1RDtRQUN2RCxNQUFNLGtCQUFrQixHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxnREFBZ0Q7UUFFaEcsZ0ZBQWdGO1FBQ2hGLE1BQU0sT0FBTyxHQUFHLGdCQUFFLENBQUMsV0FBVyxDQUFDLElBQUEsOENBQXFCLEVBQUMsa0JBQWtCLEVBQUUsMENBQWlCLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztRQUMzRyxNQUFNLFdBQVcsR0FBRyxnQkFBRSxDQUFDLFdBQVcsQ0FBQyxJQUFBLDhDQUFxQixFQUFDLGtCQUFrQixFQUFFLDBDQUFp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QUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO1FBQ3BFLE1BQU0sSUFBSSxLQUFLLENBQUMsc0NBQXNDLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDbEUsQ0FBQztJQUVELE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMzQixNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDNUIsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFFOUQsT0FBTyxHQUFHLE9BQU8sWUFBWSxNQUFNLGtCQUFrQixjQUFjLEVBQUUsQ0FBQztBQUN4RSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHsgUmVtb3ZhbFBvbGljeSwgU3RhY2tQcm9wcywgRm4sIENmbk91dHB1dCB9IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIGVjcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWNzJztcbmltcG9ydCAqIGFzIGttcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mta21zJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5cbi8vIENvbnN0cnVjdCBpbXBvcnRzXG5pbXBvcnQgeyBEYXRhYmFzZSB9IGZyb20gJy4vY29uc3RydWN0cy9kYXRhYmFzZSc7XG5pbXBvcnQgeyBSZWRpcyB9IGZyb20gJy4vY29uc3RydWN0cy9yZWRpcyc7XG5pbXBvcnQgeyBFZnMgfSBmcm9tICcuL2NvbnN0cnVjdHMvZWZzJztcbmltcG9ydCB7IFNlY3JldHNNYW5hZ2VyIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL3NlY3JldHMtbWFuYWdlcic7XG5pbXBvcnQgeyBFbGIgfSBmcm9tICcuL2NvbnN0cnVjdHMvZWxiJztcbmltcG9ydCB7IEF1dGhlbnRpa1NlcnZlciB9IGZyb20gJy4vY29uc3RydWN0cy9hdXRoZW50aWstc2VydmVyJztcbmltcG9ydCB7IEF1dGhlbnRpa1dvcmtlciB9IGZyb20gJy4vY29uc3RydWN0cy9hdXRoZW50aWstd29ya2VyJztcbmltcG9ydCB7IExkYXAgfSBmcm9tICcuL2NvbnN0cnVjdHMvbGRhcCc7XG5pbXBvcnQgeyBMZGFwVG9rZW5SZXRyaWV2ZXIgfSBmcm9tICcuL2NvbnN0cnVjdHMvbGRhcC10b2tlbi1yZXRyaWV2ZXInO1xuaW1wb3J0IHsgUm91dGU1MyB9IGZyb20gJy4vY29uc3RydWN0cy9yb3V0ZTUzJztcbmltcG9ydCB7IFJvdXRlNTNBdXRoZW50aWsgfSBmcm9tICcuL2NvbnN0cnVjdHMvcm91dGU1My1hdXRoZW50aWsnO1xuXG4vLyBDb25maWd1cmF0aW9uIGltcG9ydHNcbmltcG9ydCB0eXBlIHtcbiAgSW5mcmFzdHJ1Y3R1cmVDb25maWcsXG4gIFNlY3JldHNDb25maWcsXG4gIFN0b3JhZ2VDb25maWcsXG4gIERlcGxveW1lbnRDb25maWcsXG4gIEF1dGhlbnRpa0FwcGxpY2F0aW9uQ29uZmlnLFxuICBOZXR3b3JrQ29uZmlnLFxuICBUb2tlbkNvbmZpZ1xufSBmcm9tICcuL2NvbnN0cnVjdC1jb25maWdzJztcblxuLy8gVXRpbGl0eSBpbXBvcnRzXG5pbXBvcnQgeyByZWdpc3Rlck91dHB1dHMgfSBmcm9tICcuL291dHB1dHMnO1xuaW1wb3J0IHsgY3JlYXRlQmFzZUltcG9ydFZhbHVlLCBCQVNFX0VYUE9SVF9OQU1FUyB9IGZyb20gJy4vY2xvdWRmb3JtYXRpb24taW1wb3J0cyc7XG5pbXBvcnQgeyBDb250ZXh0RW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuL3N0YWNrLWNvbmZpZyc7XG5pbXBvcnQgeyBERUZBVUxUX1ZQQ19DSURSIH0gZnJvbSAnLi91dGlscy9jb25zdGFudHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhJbmZyYVN0YWNrUHJvcHMgZXh0ZW5kcyBTdGFja1Byb3BzIHtcbiAgZW52aXJvbm1lbnQ6ICdwcm9kJyB8ICdkZXYtdGVzdCc7XG4gIGVudkNvbmZpZzogQ29udGV4dEVudmlyb25tZW50Q29uZmlnOyAvLyBFbnZpcm9ubWVudCBjb25maWd1cmF0aW9uIGZyb20gY29udGV4dFxufVxuXG4vKipcbiAqIE1haW4gQ0RLIHN0YWNrIGZvciB0aGUgVEFLIEF1dGggSW5mcmFzdHJ1Y3R1cmVcbiAqL1xuZXhwb3J0IGNsYXNzIEF1dGhJbmZyYVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEF1dGhJbmZyYVN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHtcbiAgICAgIC4uLnByb3BzLFxuICAgICAgZGVzY3JpcHRpb246ICdUQUsgQXV0aGVudGljYXRpb24gTGF5ZXIgLSBBdXRoZW50aWssIExEQVAgT3V0cG9zdCcsXG4gICAgfSk7XG5cbiAgICAvLyBVc2UgZW52aXJvbm1lbnQgY29uZmlndXJhdGlvbiBkaXJlY3RseSAobm8gY29tcGxleCB0cmFuc2Zvcm1hdGlvbnMgbmVlZGVkKVxuICAgIGNvbnN0IHsgZW52Q29uZmlnIH0gPSBwcm9wcztcbiAgICBcbiAgICAvLyBFeHRyYWN0IGNvbmZpZ3VyYXRpb24gdmFsdWVzIGRpcmVjdGx5IGZyb20gZW52Q29uZmlnXG4gICAgY29uc3Qgc3RhY2tOYW1lQ29tcG9uZW50ID0gZW52Q29uZmlnLnN0YWNrTmFtZTsgLy8gVGhpcyBpcyB0aGUgU1RBQ0tfTkFNRSBwYXJ0IChlLmcuLCBcIkRldlRlc3RcIilcbiAgICBcbiAgICAvLyBJbXBvcnQgdmFsdWVzIGZyb20gQmFzZUluZnJhIHN0YWNrIGV4cG9ydHMgaW5zdGVhZCBvZiB1c2luZyBjb25maWcgcGFyYW1ldGVyc1xuICAgIGNvbnN0IHZwY0NpZHIgPSBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5WUENfQ0lEUl9JUFY0KSk7XG4gICAgY29uc3QgcjUzWm9uZU5hbWUgPSBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5IT1NURURfWk9ORV9OQU1FKSk7XG4gICAgXG4gICAgY29uc3QgaXNIaWdoQXZhaWxhYmlsaXR5ID0gcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJztcbiAgICBjb25zdCBlbnZpcm9ubWVudExhYmVsID0gcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/ICdQcm9kJyA6ICdEZXYtVGVzdCc7XG4gICAgY29uc3QgcmVzb2x2ZWRTdGFja05hbWUgPSBpZDtcbiAgICBcbiAgICAvLyBVc2UgY29tcHV0ZWQgdmFsdWVzIGZyb20gY29uZmlndXJhdGlvblxuICAgIGNvbnN0IGVuYWJsZUhpZ2hBdmFpbGFiaWxpdHkgPSBpc0hpZ2hBdmFpbGFiaWxpdHk7XG4gICAgY29uc3QgZW5hYmxlRGV0YWlsZWRNb25pdG9yaW5nID0gZW52Q29uZmlnLmdlbmVyYWwuZW5hYmxlRGV0YWlsZWRMb2dnaW5nO1xuXG4gICAgLy8gQWRkIEVudmlyb25tZW50IFR5cGUgdGFnIHRvIHRoZSBzdGFja1xuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnRW52aXJvbm1lbnQgVHlwZScsIGVudmlyb25tZW50TGFiZWwpO1xuXG4gICAgLy8gVE9ETzogUmVwbGFjZSB3aXRoIGRpcmVjdCBjb250ZXh0IHVzYWdlIG9uY2UgY29uc3RydWN0cyBhcmUgdXBkYXRlZFxuICAgIC8vIEZvciBub3csIHdlJ2xsIHVzZSBlbnZDb25maWcgZGlyZWN0bHkgYnV0IHJlbmFtZSBpdCBmb3IgY2xhcml0eVxuICAgIGNvbnN0IGVudmlyb25tZW50Q29uZmlnID0gZW52Q29uZmlnOyAvLyBEaXJlY3QgY29udGV4dCB1c2FnZSAobWF0Y2hlcyByZWZlcmVuY2UgcGF0dGVybilcblxuICAgIGNvbnN0IHN0YWNrTmFtZSA9IEZuLnJlZignQVdTOjpTdGFja05hbWUnKTtcbiAgICBjb25zdCByZWdpb24gPSBjZGsuU3RhY2sub2YodGhpcykucmVnaW9uO1xuXG4gICAgLy8gQ29uZmlndXJhdGlvbi1iYXNlZCBwYXJhbWV0ZXIgcmVzb2x1dGlvblxuICAgIGNvbnN0IGF1dGhlbnRpa0FkbWluVXNlckVtYWlsID0gZW52Q29uZmlnLmF1dGhlbnRpay5hZG1pblVzZXJFbWFpbDtcbiAgICBjb25zdCBsZGFwQmFzZURuID0gYGRjPSR7cjUzWm9uZU5hbWUuc3BsaXQoJy4nKS5qb2luKCcsZGM9Jyl9YDtcbiAgICBjb25zdCBob3N0bmFtZUF1dGhlbnRpayA9IGVudkNvbmZpZy5hdXRoZW50aWsuZG9tYWluLnNwbGl0KCcuJylbMF07IC8vIEV4dHJhY3Qgc3ViZG9tYWluXG4gICAgY29uc3QgaG9zdG5hbWVMZGFwID0gZW52Q29uZmlnLmxkYXAuZG9tYWluLnNwbGl0KCcuJylbMF07IC8vIEV4dHJhY3Qgc3ViZG9tYWluXG4gICAgY29uc3QgZ2l0U2hhID0gJ2xhdGVzdCc7IC8vIFVzZSBmaXhlZCB0YWcgZm9yIGNvbnRleHQtZHJpdmVuIGFwcHJvYWNoXG4gICAgY29uc3QgZW5hYmxlRXhlY3V0ZSA9IGZhbHNlOyAvLyBEaXNhYmxlIGJ5IGRlZmF1bHQgZm9yIHNlY3VyaXR5XG4gICAgY29uc3QgdXNlQXV0aGVudGlrQ29uZmlnRmlsZSA9IGZhbHNlOyAvLyBVc2UgZW52aXJvbm1lbnQgdmFyaWFibGVzXG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIElNUE9SVCBCQVNFIElORlJBU1RSVUNUVVJFIFJFU09VUkNFU1xuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBJbXBvcnQgVlBDIGFuZCBuZXR3b3JraW5nIGZyb20gYmFzZSBpbmZyYXN0cnVjdHVyZVxuICAgIC8vIE5vdGU6IEJhc2UgaW5mcmFzdHJ1Y3R1cmUgcHJvdmlkZXMgMiBzdWJuZXRzIChBIGFuZCBCKSwgc28gd2UgbGltaXQgdG8gMiBBWnNcbiAgICBjb25zdCB2cGNBdmFpbGFiaWxpdHlab25lcyA9IHRoaXMuYXZhaWxhYmlsaXR5Wm9uZXMuc2xpY2UoMCwgMik7XG4gICAgXG4gICAgY29uc3QgdnBjID0gZWMyLlZwYy5mcm9tVnBjQXR0cmlidXRlcyh0aGlzLCAnVlBDJywge1xuICAgICAgdnBjSWQ6IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlZQQ19JRCkpLFxuICAgICAgYXZhaWxhYmlsaXR5Wm9uZXM6IHZwY0F2YWlsYWJpbGl0eVpvbmVzLFxuICAgICAgLy8gSW1wb3J0IHN1Ym5ldCBJRHMgZnJvbSBiYXNlIGluZnJhc3RydWN0dXJlXG4gICAgICBwdWJsaWNTdWJuZXRJZHM6IFtcbiAgICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuU1VCTkVUX1BVQkxJQ19BKSksXG4gICAgICAgIEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlNVQk5FVF9QVUJMSUNfQikpXG4gICAgICBdLFxuICAgICAgcHJpdmF0ZVN1Ym5ldElkczogW1xuICAgICAgICBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5TVUJORVRfUFJJVkFURV9BKSksXG4gICAgICAgIEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlNVQk5FVF9QUklWQVRFX0IpKVxuICAgICAgXSxcbiAgICAgIHZwY0NpZHJCbG9jazogRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuVlBDX0NJRFJfSVBWNCkpXG4gICAgfSk7XG5cbiAgICAvLyBLTVNcbiAgICBjb25zdCBrbXNLZXkgPSBrbXMuS2V5LmZyb21LZXlBcm4odGhpcywgJ0tNU0tleScsIFxuICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuS01TX0tFWSkpXG4gICAgKTtcblxuICAgIC8vIEVDU1xuICAgIGNvbnN0IGVjc0NsdXN0ZXJBcm4gPSBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5FQ1NfQ0xVU1RFUikpO1xuICAgIC8vIEV4dHJhY3QgY2x1c3RlciBuYW1lIGZyb20gQVJOOiBhcm46YXdzOmVjczpyZWdpb246YWNjb3VudDpjbHVzdGVyL2NsdXN0ZXItbmFtZVxuICAgIGNvbnN0IGVjc0NsdXN0ZXJOYW1lID0gRm4uc2VsZWN0KDEsIEZuLnNwbGl0KCcvJywgZWNzQ2x1c3RlckFybikpO1xuICAgIGNvbnN0IGVjc0NsdXN0ZXIgPSBlY3MuQ2x1c3Rlci5mcm9tQ2x1c3RlckF0dHJpYnV0ZXModGhpcywgJ0VDU0NsdXN0ZXInLCB7XG4gICAgICBjbHVzdGVyQXJuOiBlY3NDbHVzdGVyQXJuLFxuICAgICAgY2x1c3Rlck5hbWU6IGVjc0NsdXN0ZXJOYW1lLFxuICAgICAgdnBjOiB2cGNcbiAgICB9KTtcblxuICAgIC8vIFMzXG4gICAgY29uc3QgczNDb25mQnVja2V0ID0gczMuQnVja2V0LmZyb21CdWNrZXRBcm4odGhpcywgJ1MzQ29uZkJ1Y2tldCcsXG4gICAgICBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5TM19CVUNLRVQpKVxuICAgICk7XG5cbiAgICAvLyBFQ1JcbiAgICBjb25zdCBlY3JSZXBvc2l0b3J5ID0gRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuRUNSX1JFUE8pKTtcblxuICAgIC8vIFJvdXRlNTNcbiAgICBjb25zdCBob3N0ZWRab25lSWQgPSBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5IT1NURURfWk9ORV9JRCkpO1xuICAgIGNvbnN0IGhvc3RlZFpvbmVOYW1lID0gRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuSE9TVEVEX1pPTkVfTkFNRSkpO1xuXG4gICAgLy8gU1NMIENlcnRpZmljYXRlXG4gICAgY29uc3Qgc3NsQ2VydGlmaWNhdGVBcm4gPSBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5DRVJUSUZJQ0FURV9BUk4pKTtcblxuICAgIC8vIFMzIEVudmlyb25tZW50IEZpbGUgcGF0aHMgLSBhc3N1bWVzIGF1dGhlbnRpay1jb25maWcuZW52IGFscmVhZHkgZXhpc3RzIGluIFMzXG4gICAgY29uc3QgZW52RmlsZVMzS2V5ID0gYGF1dGhlbnRpay1jb25maWcuZW52YDtcbiAgICBjb25zdCBlbnZGaWxlUzNVcmkgPSBgYXJuOmF3czpzMzo6OiR7czNDb25mQnVja2V0LmJ1Y2tldE5hbWV9LyR7ZW52RmlsZVMzS2V5fWA7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIFNFQ1VSSVRZIEdST1VQU1xuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBTZWN1cml0eSBHcm91cHNcbiAgICBjb25zdCBhdXRoZW50aWtTZWN1cml0eUdyb3VwID0gdGhpcy5jcmVhdGVBdXRoZW50aWtTZWN1cml0eUdyb3VwKHZwYywgc3RhY2tOYW1lQ29tcG9uZW50KTtcbiAgICBjb25zdCBsZGFwU2VjdXJpdHlHcm91cCA9IHRoaXMuY3JlYXRlTGRhcFNlY3VyaXR5R3JvdXAodnBjLCBzdGFja05hbWVDb21wb25lbnQpO1xuICAgIGNvbnN0IGRiU2VjdXJpdHlHcm91cCA9IHRoaXMuY3JlYXRlRGJTZWN1cml0eUdyb3VwKHZwYywgYXV0aGVudGlrU2VjdXJpdHlHcm91cCk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIEJVSUxEIENPTkZJR1VSQVRJT04gT0JKRUNUU1xuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBCdWlsZCBzaGFyZWQgaW5mcmFzdHJ1Y3R1cmUgY29uZmlnIGZvciBBdXRoZW50aWsgc2VydmljZXNcbiAgICBjb25zdCBhdXRoZW50aWtJbmZyYXN0cnVjdHVyZUNvbmZpZzogSW5mcmFzdHJ1Y3R1cmVDb25maWcgPSB7XG4gICAgICB2cGMsXG4gICAgICBlY3NTZWN1cml0eUdyb3VwOiBhdXRoZW50aWtTZWN1cml0eUdyb3VwLFxuICAgICAgZWNzQ2x1c3RlcixcbiAgICAgIGttc0tleVxuICAgIH07XG5cbiAgICAvLyBCdWlsZCBzaGFyZWQgaW5mcmFzdHJ1Y3R1cmUgY29uZmlnIGZvciBMREFQIHNlcnZpY2VzXG4gICAgY29uc3QgbGRhcEluZnJhc3RydWN0dXJlQ29uZmlnOiBJbmZyYXN0cnVjdHVyZUNvbmZpZyA9IHtcbiAgICAgIHZwYyxcbiAgICAgIGVjc1NlY3VyaXR5R3JvdXA6IGxkYXBTZWN1cml0eUdyb3VwLFxuICAgICAgZWNzQ2x1c3RlcixcbiAgICAgIGttc0tleVxuICAgIH07XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIENPUkUgSU5GUkFTVFJVQ1RVUkVcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gU2VjcmV0c01hbmFnZXJcbiAgICBjb25zdCBzZWNyZXRzTWFuYWdlciA9IG5ldyBTZWNyZXRzTWFuYWdlcih0aGlzLCAnU2VjcmV0c01hbmFnZXInLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgc3RhY2tOYW1lOiByZXNvbHZlZFN0YWNrTmFtZSxcbiAgICAgIGluZnJhc3RydWN0dXJlOiBhdXRoZW50aWtJbmZyYXN0cnVjdHVyZUNvbmZpZ1xuICAgIH0pO1xuXG4gICAgLy8gRGF0YWJhc2VcbiAgICBjb25zdCBkYXRhYmFzZSA9IG5ldyBEYXRhYmFzZSh0aGlzLCAnRGF0YWJhc2UnLCB7XG4gICAgICBlbnZpcm9ubWVudDogcHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICBzdGFja05hbWU6IHJlc29sdmVkU3RhY2tOYW1lLFxuICAgICAgY29udGV4dENvbmZpZzogZW52Q29uZmlnLFxuICAgICAgaW5mcmFzdHJ1Y3R1cmU6IGF1dGhlbnRpa0luZnJhc3RydWN0dXJlQ29uZmlnLFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtkYlNlY3VyaXR5R3JvdXBdXG4gICAgfSk7XG5cbiAgICAvLyBSZWRpc1xuICAgIGNvbnN0IHJlZGlzID0gbmV3IFJlZGlzKHRoaXMsICdSZWRpcycsIHtcbiAgICAgIGVudmlyb25tZW50OiBwcm9wcy5lbnZpcm9ubWVudCxcbiAgICAgIHN0YWNrTmFtZTogcmVzb2x2ZWRTdGFja05hbWUsXG4gICAgICBjb250ZXh0Q29uZmlnOiBlbnZDb25maWcsXG4gICAgICBpbmZyYXN0cnVjdHVyZTogYXV0aGVudGlrSW5mcmFzdHJ1Y3R1cmVDb25maWcsXG4gICAgICBzZWN1cml0eUdyb3VwczogW2F1dGhlbnRpa1NlY3VyaXR5R3JvdXBdXG4gICAgfSk7XG5cbiAgICAvLyBFRlNcbiAgICBjb25zdCBlZnMgPSBuZXcgRWZzKHRoaXMsICdFRlMnLCB7XG4gICAgICBlbnZpcm9ubWVudDogcHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICBjb250ZXh0Q29uZmlnOiBlbnZDb25maWcsXG4gICAgICBpbmZyYXN0cnVjdHVyZTogYXV0aGVudGlrSW5mcmFzdHJ1Y3R1cmVDb25maWcsXG4gICAgICB2cGNDaWRyQmxvY2s6IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlZQQ19DSURSX0lQVjQpKSxcbiAgICAgIGFsbG93QWNjZXNzRnJvbTogW2F1dGhlbnRpa1NlY3VyaXR5R3JvdXBdXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIEJVSUxEIENPTkZJR1VSQVRJT04gT0JKRUNUU1xuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBCdWlsZCBzaGFyZWQgY29uZmlnIG9iamVjdHNcbiAgICBjb25zdCBzZWNyZXRzQ29uZmlnOiBTZWNyZXRzQ29uZmlnID0ge1xuICAgICAgZGF0YWJhc2U6IGRhdGFiYXNlLm1hc3RlclNlY3JldCxcbiAgICAgIHJlZGlzQXV0aFRva2VuOiByZWRpcy5hdXRoVG9rZW4sXG4gICAgICBhdXRoZW50aWs6IHtcbiAgICAgICAgc2VjcmV0S2V5OiBzZWNyZXRzTWFuYWdlci5zZWNyZXRLZXksXG4gICAgICAgIGFkbWluVXNlclBhc3N3b3JkOiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJQYXNzd29yZCxcbiAgICAgICAgYWRtaW5Vc2VyVG9rZW46IHNlY3JldHNNYW5hZ2VyLmFkbWluVXNlclRva2VuLFxuICAgICAgICBsZGFwVG9rZW46IHNlY3JldHNNYW5hZ2VyLmxkYXBUb2tlbixcbiAgICAgICAgbGRhcFNlcnZpY2VVc2VyOiBzZWNyZXRzTWFuYWdlci5sZGFwU2VydmljZVVzZXJcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgY29uc3Qgc3RvcmFnZUNvbmZpZzogU3RvcmFnZUNvbmZpZyA9IHtcbiAgICAgIHMzOiB7XG4gICAgICAgIGNvbmZpZ0J1Y2tldDogczNDb25mQnVja2V0LFxuICAgICAgICBlbnZGaWxlVXJpOiBlbnZGaWxlUzNVcmksXG4gICAgICAgIGVudkZpbGVLZXk6IGVudkZpbGVTM0tleVxuICAgICAgfSxcbiAgICAgIGVmczoge1xuICAgICAgICBmaWxlU3lzdGVtSWQ6IGVmcy5maWxlU3lzdGVtLmZpbGVTeXN0ZW1JZCxcbiAgICAgICAgbWVkaWFBY2Nlc3NQb2ludElkOiBlZnMubWVkaWFBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkLFxuICAgICAgICBjdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludElkOiBlZnMuY3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnQuYWNjZXNzUG9pbnRJZFxuICAgICAgfVxuICAgIH07XG5cbiAgICBjb25zdCBkZXBsb3ltZW50Q29uZmlnOiBEZXBsb3ltZW50Q29uZmlnID0ge1xuICAgICAgZ2l0U2hhOiBnaXRTaGEsXG4gICAgICBlY3JSZXBvc2l0b3J5QXJuOiBlY3JSZXBvc2l0b3J5LFxuICAgICAgZW5hYmxlRXhlY3V0ZTogZW5hYmxlRXhlY3V0ZSxcbiAgICAgIHVzZUNvbmZpZ0ZpbGU6IHVzZUF1dGhlbnRpa0NvbmZpZ0ZpbGVcbiAgICB9O1xuXG4gICAgY29uc3QgYXBwbGljYXRpb25Db25maWc6IEF1dGhlbnRpa0FwcGxpY2F0aW9uQ29uZmlnID0ge1xuICAgICAgYWRtaW5Vc2VyRW1haWw6IGF1dGhlbnRpa0FkbWluVXNlckVtYWlsLFxuICAgICAgbGRhcEJhc2VEbjogbGRhcEJhc2VEbixcbiAgICAgIGRhdGFiYXNlOiB7XG4gICAgICAgIGhvc3RuYW1lOiBkYXRhYmFzZS5ob3N0bmFtZVxuICAgICAgfSxcbiAgICAgIHJlZGlzOiB7XG4gICAgICAgIGhvc3RuYW1lOiByZWRpcy5ob3N0bmFtZVxuICAgICAgfSxcbiAgICAgIGF1dGhlbnRpa0hvc3Q6IGBodHRwczovLyR7aG9zdG5hbWVBdXRoZW50aWt9LiR7aG9zdGVkWm9uZU5hbWV9YFxuICAgIH07XG5cbiAgICAvLyBCdWlsZCBuZXR3b3JrIGNvbmZpZyBmb3IgRE5TIGFuZCBsb2FkIGJhbGFuY2Vyc1xuICAgIGNvbnN0IGF1dGhlbnRpa05ldHdvcmtDb25maWc6IE5ldHdvcmtDb25maWcgPSB7XG4gICAgICBob3N0ZWRab25lSWQ6IGhvc3RlZFpvbmVJZCxcbiAgICAgIGhvc3RlZFpvbmVOYW1lOiBob3N0ZWRab25lTmFtZSxcbiAgICAgIHNzbENlcnRpZmljYXRlQXJuOiBzc2xDZXJ0aWZpY2F0ZUFybixcbiAgICAgIGhvc3RuYW1lOiBob3N0bmFtZUF1dGhlbnRpa1xuICAgIH07XG5cbiAgICBjb25zdCBsZGFwTmV0d29ya0NvbmZpZzogTmV0d29ya0NvbmZpZyA9IHtcbiAgICAgIGhvc3RlZFpvbmVJZDogaG9zdGVkWm9uZUlkLFxuICAgICAgaG9zdGVkWm9uZU5hbWU6IGhvc3RlZFpvbmVOYW1lLFxuICAgICAgc3NsQ2VydGlmaWNhdGVBcm46IHNzbENlcnRpZmljYXRlQXJuLFxuICAgICAgaG9zdG5hbWU6IGhvc3RuYW1lTGRhcFxuICAgIH07XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIEFQUExJQ0FUSU9OIFNFUlZJQ0VTXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIEF1dGhlbnRpayBMb2FkIEJhbGFuY2VyXG4gICAgY29uc3QgYXV0aGVudGlrRUxCID0gbmV3IEVsYih0aGlzLCAnQXV0aGVudGlrRUxCJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHByb3BzLmVudmlyb25tZW50LFxuICAgICAgY29udGV4dENvbmZpZzogZW52Q29uZmlnLFxuICAgICAgaW5mcmFzdHJ1Y3R1cmU6IGF1dGhlbnRpa0luZnJhc3RydWN0dXJlQ29uZmlnLFxuICAgICAgbmV0d29yazogYXV0aGVudGlrTmV0d29ya0NvbmZpZ1xuICAgIH0pO1xuXG4gICAgLy8gQXV0aGVudGlrIFNlcnZlclxuICAgIGNvbnN0IGF1dGhlbnRpa1NlcnZlciA9IG5ldyBBdXRoZW50aWtTZXJ2ZXIodGhpcywgJ0F1dGhlbnRpa1NlcnZlcicsIHtcbiAgICAgIGVudmlyb25tZW50OiBwcm9wcy5lbnZpcm9ubWVudCxcbiAgICAgIGNvbnRleHRDb25maWc6IGVudkNvbmZpZyxcbiAgICAgIGluZnJhc3RydWN0dXJlOiBhdXRoZW50aWtJbmZyYXN0cnVjdHVyZUNvbmZpZyxcbiAgICAgIHNlY3JldHM6IHNlY3JldHNDb25maWcsXG4gICAgICBzdG9yYWdlOiBzdG9yYWdlQ29uZmlnLFxuICAgICAgZGVwbG95bWVudDogZGVwbG95bWVudENvbmZpZyxcbiAgICAgIGFwcGxpY2F0aW9uOiBhcHBsaWNhdGlvbkNvbmZpZ1xuICAgIH0pO1xuXG4gICAgLy8gQXV0aGVudGlrIFdvcmtlciAgXG4gICAgLy8gVXBkYXRlIGF1dGhlbnRpY2F0aW9uIGhvc3QgZm9yIHdvcmtlciBhZnRlciBSb3V0ZTUzIHNldHVwXG4gICAgY29uc3QgYXV0aGVudGlrV29ya2VyQ29uZmlnID0geyAuLi5hcHBsaWNhdGlvbkNvbmZpZyB9O1xuICAgIGNvbnN0IGF1dGhlbnRpa1dvcmtlciA9IG5ldyBBdXRoZW50aWtXb3JrZXIodGhpcywgJ0F1dGhlbnRpa1dvcmtlcicsIHtcbiAgICAgIGVudmlyb25tZW50OiBwcm9wcy5lbnZpcm9ubWVudCxcbiAgICAgIGNvbnRleHRDb25maWc6IGVudkNvbmZpZyxcbiAgICAgIGluZnJhc3RydWN0dXJlOiBhdXRoZW50aWtJbmZyYXN0cnVjdHVyZUNvbmZpZyxcbiAgICAgIHNlY3JldHM6IHNlY3JldHNDb25maWcsXG4gICAgICBzdG9yYWdlOiBzdG9yYWdlQ29uZmlnLFxuICAgICAgZGVwbG95bWVudDogZGVwbG95bWVudENvbmZpZyxcbiAgICAgIGFwcGxpY2F0aW9uOiBhdXRoZW50aWtXb3JrZXJDb25maWdcbiAgICB9KTtcblxuICAgIC8vIENvbm5lY3QgQXV0aGVudGlrIFNlcnZlciB0byBMb2FkIEJhbGFuY2VyXG4gICAgYXV0aGVudGlrU2VydmVyLmNyZWF0ZVRhcmdldEdyb3VwKHZwYywgYXV0aGVudGlrRUxCLmh0dHBzTGlzdGVuZXIpO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBETlMgU0VUVVAgKEFVVEhFTlRJSylcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gUm91dGU1MyBBdXRoZW50aWsgRE5TIFJlY29yZHMgKG5lZWRlZCBiZWZvcmUgTERBUCB0b2tlbiByZXRyaWV2ZXIpXG4gICAgY29uc3Qgcm91dGU1M0F1dGhlbnRpayA9IG5ldyBSb3V0ZTUzQXV0aGVudGlrKHRoaXMsICdSb3V0ZTUzQXV0aGVudGlrJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHByb3BzLmVudmlyb25tZW50LFxuICAgICAgY29udGV4dENvbmZpZzogZW52Q29uZmlnLFxuICAgICAgbmV0d29yazogYXV0aGVudGlrTmV0d29ya0NvbmZpZyxcbiAgICAgIGF1dGhlbnRpa0xvYWRCYWxhbmNlcjogYXV0aGVudGlrRUxCLmxvYWRCYWxhbmNlclxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBMREFQIENPTkZJR1VSQVRJT05cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gQnVpbGQgdG9rZW4gY29uZmlnIGZvciBMREFQIHRva2VuIHJldHJpZXZhbFxuICAgIGNvbnN0IHRva2VuQ29uZmlnOiBUb2tlbkNvbmZpZyA9IHtcbiAgICAgIG91dHBvc3ROYW1lOiAnTERBUCcsXG4gICAgICBhZG1pblRva2VuU2VjcmV0OiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJUb2tlbixcbiAgICAgIGxkYXBUb2tlblNlY3JldDogc2VjcmV0c01hbmFnZXIubGRhcFRva2VuLFxuICAgICAgYXV0aGVudGlrU2VydmVyU2VydmljZTogYXV0aGVudGlrU2VydmVyLmVjc1NlcnZpY2UsXG4gICAgICBhdXRoZW50aWtXb3JrZXJTZXJ2aWNlOiBhdXRoZW50aWtXb3JrZXIuZWNzU2VydmljZVxuICAgIH07XG5cbiAgICAvLyBVcGRhdGUgYXBwbGljYXRpb24gY29uZmlnIHdpdGggcHJvcGVyIEF1dGhlbnRpayBVUkxcbiAgICBjb25zdCBsZGFwQXBwbGljYXRpb25Db25maWc6IEF1dGhlbnRpa0FwcGxpY2F0aW9uQ29uZmlnID0ge1xuICAgICAgLi4uYXBwbGljYXRpb25Db25maWcsXG4gICAgICBhdXRoZW50aWtIb3N0OiByb3V0ZTUzQXV0aGVudGlrLmdldEF1dGhlbnRpa1VybCgpXG4gICAgfTtcblxuICAgIC8vIExEQVAgVG9rZW4gUmV0cmlldmVyXG4gICAgY29uc3QgbGRhcFRva2VuUmV0cmlldmVyID0gbmV3IExkYXBUb2tlblJldHJpZXZlcih0aGlzLCAnTGRhcFRva2VuUmV0cmlldmVyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHByb3BzLmVudmlyb25tZW50LFxuICAgICAgY29udGV4dENvbmZpZzogZW52Q29uZmlnLFxuICAgICAgaW5mcmFzdHJ1Y3R1cmU6IGF1dGhlbnRpa0luZnJhc3RydWN0dXJlQ29uZmlnLFxuICAgICAgZGVwbG95bWVudDogZGVwbG95bWVudENvbmZpZyxcbiAgICAgIHRva2VuOiB0b2tlbkNvbmZpZyxcbiAgICAgIGFwcGxpY2F0aW9uOiBsZGFwQXBwbGljYXRpb25Db25maWdcbiAgICB9KTtcblxuICAgIC8vIExEQVBcbiAgICBjb25zdCBsZGFwID0gbmV3IExkYXAodGhpcywgJ0xEQVAnLCB7XG4gICAgICBlbnZpcm9ubWVudDogcHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICBjb250ZXh0Q29uZmlnOiBlbnZDb25maWcsXG4gICAgICBpbmZyYXN0cnVjdHVyZTogbGRhcEluZnJhc3RydWN0dXJlQ29uZmlnLFxuICAgICAgc3RvcmFnZTogc3RvcmFnZUNvbmZpZyxcbiAgICAgIGRlcGxveW1lbnQ6IGRlcGxveW1lbnRDb25maWcsXG4gICAgICBuZXR3b3JrOiBsZGFwTmV0d29ya0NvbmZpZyxcbiAgICAgIGFwcGxpY2F0aW9uOiBsZGFwQXBwbGljYXRpb25Db25maWcsXG4gICAgICBsZGFwVG9rZW46IHNlY3JldHNNYW5hZ2VyLmxkYXBUb2tlblxuICAgIH0pO1xuXG4gICAgLy8gRW5zdXJlIExEQVAgd2FpdHMgZm9yIHRoZSB0b2tlbiB0byBiZSByZXRyaWV2ZWRcbiAgICBsZGFwLm5vZGUuYWRkRGVwZW5kZW5jeShsZGFwVG9rZW5SZXRyaWV2ZXIpO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBETlMgQU5EIFJPVVRJTkdcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBETlMgU0VUVVAgKExEQVApXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIFJvdXRlNTMgTERBUCBETlMgUmVjb3JkcyAoYWZ0ZXIgTERBUCBjb25zdHJ1Y3QgaXMgY3JlYXRlZClcbiAgICBjb25zdCByb3V0ZTUzID0gbmV3IFJvdXRlNTModGhpcywgJ1JvdXRlNTMnLCB7XG4gICAgICBlbnZpcm9ubWVudDogcHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICBjb250ZXh0Q29uZmlnOiBlbnZDb25maWcsXG4gICAgICBuZXR3b3JrOiBsZGFwTmV0d29ya0NvbmZpZyxcbiAgICAgIGxkYXBMb2FkQmFsYW5jZXI6IGxkYXAubG9hZEJhbGFuY2VyXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgZGVwZW5kZW5jeSBmb3IgTERBUCB0b2tlbiByZXRyaWV2ZXIgdG8gd2FpdCBmb3IgQXV0aGVudGlrIEROUyByZWNvcmRzXG4gICAgbGRhcFRva2VuUmV0cmlldmVyLmN1c3RvbVJlc291cmNlLm5vZGUuYWRkRGVwZW5kZW5jeShyb3V0ZTUzQXV0aGVudGlrLmF1dGhlbnRpa0FSZWNvcmQpO1xuICAgIGxkYXBUb2tlblJldHJpZXZlci5jdXN0b21SZXNvdXJjZS5ub2RlLmFkZERlcGVuZGVuY3kocm91dGU1M0F1dGhlbnRpay5hdXRoZW50aWtBQUFBUmVjb3JkKTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gU1RBQ0sgT1VUUFVUU1xuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgcmVnaXN0ZXJPdXRwdXRzKHtcbiAgICAgIHN0YWNrOiB0aGlzLFxuICAgICAgc3RhY2tOYW1lOiBzdGFja05hbWUsXG4gICAgICBkYXRhYmFzZUVuZHBvaW50OiBkYXRhYmFzZS5ob3N0bmFtZSxcbiAgICAgIGRhdGFiYXNlU2VjcmV0QXJuOiBkYXRhYmFzZS5tYXN0ZXJTZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgcmVkaXNFbmRwb2ludDogcmVkaXMuaG9zdG5hbWUsXG4gICAgICByZWRpc0F1dGhUb2tlbkFybjogcmVkaXMuYXV0aFRva2VuLnNlY3JldEFybixcbiAgICAgIGVmc0lkOiBlZnMuZmlsZVN5c3RlbS5maWxlU3lzdGVtSWQsXG4gICAgICBlZnNNZWRpYUFjY2Vzc1BvaW50SWQ6IGVmcy5tZWRpYUFjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWQsXG4gICAgICBlZnNUZW1wbGF0ZXNBY2Nlc3NQb2ludElkOiBlZnMuY3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnQuYWNjZXNzUG9pbnRJZCxcbiAgICAgIGF1dGhlbnRpa1NlY3JldEtleUFybjogc2VjcmV0c01hbmFnZXIuc2VjcmV0S2V5LnNlY3JldEFybixcbiAgICAgIGF1dGhlbnRpa0FkbWluVG9rZW5Bcm46IHNlY3JldHNNYW5hZ2VyLmFkbWluVXNlclRva2VuLnNlY3JldEFybixcbiAgICAgIGF1dGhlbnRpa0xkYXBUb2tlbkFybjogc2VjcmV0c01hbmFnZXIubGRhcFRva2VuLnNlY3JldEFybixcbiAgICAgIGF1dGhlbnRpa0FsYkRuczogYXV0aGVudGlrRUxCLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lLFxuICAgICAgYXV0aGVudGlrVXJsOiBgaHR0cHM6Ly8ke2F1dGhlbnRpa0VMQi5kbnNOYW1lfWAsXG4gICAgICBsZGFwTmxiRG5zOiBsZGFwLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lLFxuICAgICAgbGRhcEVuZHBvaW50OiBgbGRhcDovLyR7bGRhcC5kbnNOYW1lfTozODlgLFxuICAgICAgbGRhcHNFbmRwb2ludDogYGxkYXBzOi8vJHtsZGFwLmRuc05hbWV9OjYzNmAsXG4gICAgICBsZGFwVG9rZW5SZXRyaWV2ZXJMYW1iZGFBcm46IGxkYXBUb2tlblJldHJpZXZlci5sYW1iZGFGdW5jdGlvbi5mdW5jdGlvbkFyblxuICAgIH0pO1xuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT1cbiAgLy8gSEVMUEVSIE1FVEhPRFNcbiAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAvKipcbiAgICogQ3JlYXRlIHNlY3VyaXR5IGdyb3VwIGZvciBBdXRoZW50aWsgRUNTIHRhc2tzIChTZXJ2ZXIvV29ya2VyKVxuICAgKiBAcGFyYW0gdnBjIFRoZSBWUEMgdG8gY3JlYXRlIHRoZSBzZWN1cml0eSBncm91cCBpblxuICAgKiBAcGFyYW0gc3RhY2tOYW1lQ29tcG9uZW50IFRoZSBzdGFjayBuYW1lIGNvbXBvbmVudCBmb3IgaW1wb3J0c1xuICAgKiBAcmV0dXJucyBUaGUgY3JlYXRlZCBzZWN1cml0eSBncm91cFxuICAgKi9cbiAgcHJpdmF0ZSBjcmVhdGVBdXRoZW50aWtTZWN1cml0eUdyb3VwKHZwYzogZWMyLklWcGMsIHN0YWNrTmFtZUNvbXBvbmVudDogc3RyaW5nKTogZWMyLlNlY3VyaXR5R3JvdXAge1xuICAgIGNvbnN0IGF1dGhlbnRpa1NlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0F1dGhlbnRpa1NlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBBdXRoZW50aWsgRUNTIHRhc2tzIChTZXJ2ZXIvV29ya2VyKScsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBIVFRQL0hUVFBTIHRyYWZmaWMgdG8gQXV0aGVudGlrIHRhc2tzXG4gICAgYXV0aGVudGlrU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg4MCksXG4gICAgICAnQWxsb3cgSFRUUCB0cmFmZmljJ1xuICAgICk7XG5cbiAgICBhdXRoZW50aWtTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuYW55SXB2NCgpLFxuICAgICAgZWMyLlBvcnQudGNwKDQ0MyksXG4gICAgICAnQWxsb3cgSFRUUFMgdHJhZmZpYydcbiAgICApO1xuXG4gICAgLy8gQWxsb3cgQXV0aGVudGlrIGFwcGxpY2F0aW9uIHRyYWZmaWMgKHBvcnQgOTAwMCkgZnJvbSBWUEMgQ0lEUlxuICAgIGF1dGhlbnRpa1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5pcHY0KEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlZQQ19DSURSX0lQVjQpKSksXG4gICAgICBlYzIuUG9ydC50Y3AoOTAwMCksXG4gICAgICAnQWxsb3cgQXV0aGVudGlrIHRyYWZmaWMgZnJvbSBWUEMnXG4gICAgKTtcblxuICAgIHJldHVybiBhdXRoZW50aWtTZWN1cml0eUdyb3VwO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBzZWN1cml0eSBncm91cCBmb3IgTERBUCBFQ1MgdGFza3NcbiAgICogQHBhcmFtIHZwYyBUaGUgVlBDIHRvIGNyZWF0ZSB0aGUgc2VjdXJpdHkgZ3JvdXAgaW5cbiAgICogQHBhcmFtIHN0YWNrTmFtZUNvbXBvbmVudCBUaGUgc3RhY2sgbmFtZSBjb21wb25lbnQgZm9yIGltcG9ydHNcbiAgICogQHJldHVybnMgVGhlIGNyZWF0ZWQgc2VjdXJpdHkgZ3JvdXBcbiAgICovXG4gIHByaXZhdGUgY3JlYXRlTGRhcFNlY3VyaXR5R3JvdXAodnBjOiBlYzIuSVZwYywgc3RhY2tOYW1lQ29tcG9uZW50OiBzdHJpbmcpOiBlYzIuU2VjdXJpdHlHcm91cCB7XG4gICAgY29uc3QgbGRhcFNlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0xkYXBTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgTERBUCBFQ1MgdGFza3MnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogdHJ1ZVxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgTERBUCB0cmFmZmljIChwb3J0IDMzODkpIGZyb20gVlBDIENJRFJcbiAgICBsZGFwU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmlwdjQoRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuVlBDX0NJRFJfSVBWNCkpKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCgzMzg5KSxcbiAgICAgICdBbGxvdyBMREFQIHRyYWZmaWMgZnJvbSBWUEMnXG4gICAgKTtcblxuICAgIC8vIEFsbG93IExEQVBTIHRyYWZmaWMgKHBvcnQgNjYzNikgZnJvbSBWUEMgQ0lEUlxuICAgIGxkYXBTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuaXB2NChGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5WUENfQ0lEUl9JUFY0KSkpLFxuICAgICAgZWMyLlBvcnQudGNwKDY2MzYpLFxuICAgICAgJ0FsbG93IExEQVBTIHRyYWZmaWMgZnJvbSBWUEMnXG4gICAgKTtcblxuICAgIHJldHVybiBsZGFwU2VjdXJpdHlHcm91cDtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgc2VjdXJpdHkgZ3JvdXAgZm9yIEVDUyB0YXNrcyAoTGVnYWN5IC0ga2VlcGluZyBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eSlcbiAgICogQHBhcmFtIHZwYyBUaGUgVlBDIHRvIGNyZWF0ZSB0aGUgc2VjdXJpdHkgZ3JvdXAgaW5cbiAgICogQHJldHVybnMgVGhlIGNyZWF0ZWQgc2VjdXJpdHkgZ3JvdXBcbiAgICovXG4gIHByaXZhdGUgY3JlYXRlRWNzU2VjdXJpdHlHcm91cCh2cGM6IGVjMi5JVnBjKTogZWMyLlNlY3VyaXR5R3JvdXAge1xuICAgIGNvbnN0IGVjc1NlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0VDU1NlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBFQ1MgdGFza3MnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogdHJ1ZVxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgSFRUUC9IVFRQUyB0cmFmZmljIHRvIEVDUyB0YXNrc1xuICAgIGVjc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5hbnlJcHY0KCksXG4gICAgICBlYzIuUG9ydC50Y3AoODApLFxuICAgICAgJ0FsbG93IEhUVFAgdHJhZmZpYydcbiAgICApO1xuXG4gICAgZWNzU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg0NDMpLFxuICAgICAgJ0FsbG93IEhUVFBTIHRyYWZmaWMnXG4gICAgKTtcblxuICAgIGVjc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5hbnlJcHY0KCksXG4gICAgICBlYzIuUG9ydC50Y3AoOTAwMCksXG4gICAgICAnQWxsb3cgQXV0aGVudGlrIHRyYWZmaWMnXG4gICAgKTtcblxuICAgIHJldHVybiBlY3NTZWN1cml0eUdyb3VwO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBzZWN1cml0eSBncm91cCBmb3IgZGF0YWJhc2UgYWNjZXNzXG4gICAqIEBwYXJhbSB2cGMgVGhlIFZQQyB0byBjcmVhdGUgdGhlIHNlY3VyaXR5IGdyb3VwIGluXG4gICAqIEBwYXJhbSBlY3NTZWN1cml0eUdyb3VwIFRoZSBFQ1Mgc2VjdXJpdHkgZ3JvdXAgdG8gYWxsb3cgYWNjZXNzIGZyb21cbiAgICogQHJldHVybnMgVGhlIGNyZWF0ZWQgc2VjdXJpdHkgZ3JvdXBcbiAgICovXG4gIHByaXZhdGUgY3JlYXRlRGJTZWN1cml0eUdyb3VwKHZwYzogZWMyLklWcGMsIGVjc1NlY3VyaXR5R3JvdXA6IGVjMi5TZWN1cml0eUdyb3VwKTogZWMyLlNlY3VyaXR5R3JvdXAge1xuICAgIGNvbnN0IGRiU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnREJTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgZGF0YWJhc2UnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogZmFsc2VcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IFBvc3RncmVTUUwgYWNjZXNzIGZyb20gRUNTIHRhc2tzXG4gICAgZGJTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuc2VjdXJpdHlHcm91cElkKGVjc1NlY3VyaXR5R3JvdXAuc2VjdXJpdHlHcm91cElkKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg1NDMyKSxcbiAgICAgICdBbGxvdyBQb3N0Z3JlU1FMIGFjY2VzcyBmcm9tIEVDUyB0YXNrcydcbiAgICApO1xuXG4gICAgcmV0dXJuIGRiU2VjdXJpdHlHcm91cDtcbiAgfVxufVxuXG4vKipcbiAqIENvbnZlcnRzIGFuIEVDUiByZXBvc2l0b3J5IEFSTiB0byBhIHByb3BlciBFQ1IgcmVwb3NpdG9yeSBVUkkgZm9yIERvY2tlciBpbWFnZXNcbiAqIEBwYXJhbSBlY3JBcm4gLSBFQ1IgcmVwb3NpdG9yeSBBUk4gKGUuZy4sIFwiYXJuOmF3czplY3I6cmVnaW9uOmFjY291bnQ6cmVwb3NpdG9yeS9yZXBvLW5hbWVcIilcbiAqIEByZXR1cm5zIEVDUiByZXBvc2l0b3J5IFVSSSAoZS5nLiwgXCJhY2NvdW50LmRrci5lY3IucmVnaW9uLmFtYXpvbmF3cy5jb20vcmVwby1uYW1lXCIpXG4gKi9cbmZ1bmN0aW9uIGNvbnZlcnRFY3JBcm5Ub1JlcG9zaXRvcnlVcmkoZWNyQXJuOiBzdHJpbmcpOiBzdHJpbmcge1xuICAvLyBQYXJzZSBBUk46IGFybjphd3M6ZWNyOnJlZ2lvbjphY2NvdW50OnJlcG9zaXRvcnkvcmVwby1uYW1lXG4gIGNvbnN0IGFyblBhcnRzID0gZWNyQXJuLnNwbGl0KCc6Jyk7XG4gIGlmIChhcm5QYXJ0cy5sZW5ndGggIT09IDYgfHwgIWFyblBhcnRzWzVdLnN0YXJ0c1dpdGgoJ3JlcG9zaXRvcnkvJykpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgRUNSIHJlcG9zaXRvcnkgQVJOIGZvcm1hdDogJHtlY3JBcm59YCk7XG4gIH1cbiAgXG4gIGNvbnN0IHJlZ2lvbiA9IGFyblBhcnRzWzNdO1xuICBjb25zdCBhY2NvdW50ID0gYXJuUGFydHNbNF07XG4gIGNvbnN0IHJlcG9zaXRvcnlOYW1lID0gYXJuUGFydHNbNV0ucmVwbGFjZSgncmVwb3NpdG9yeS8nLCAnJyk7XG4gIFxuICByZXR1cm4gYCR7YWNjb3VudH0uZGtyLmVjci4ke3JlZ2lvbn0uYW1hem9uYXdzLmNvbS8ke3JlcG9zaXRvcnlOYW1lfWA7XG59XG4iXX0=