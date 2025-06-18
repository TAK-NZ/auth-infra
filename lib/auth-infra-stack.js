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
            environment: stackNameComponent,
            stackName: resolvedStackName,
            config: environmentConfig,
            infrastructure: authentikInfrastructureConfig,
            securityGroups: [dbSecurityGroup]
        });
        // Redis
        const redis = new redis_1.Redis(this, 'Redis', {
            environment: stackNameComponent,
            stackName: resolvedStackName,
            config: environmentConfig,
            infrastructure: authentikInfrastructureConfig,
            securityGroups: [authentikSecurityGroup]
        });
        // EFS
        const efs = new efs_1.Efs(this, 'EFS', {
            environment: stackNameComponent,
            config: environmentConfig,
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
            environment: stackNameComponent,
            config: environmentConfig,
            infrastructure: authentikInfrastructureConfig,
            network: authentikNetworkConfig
        });
        // Authentik Server
        const authentikServer = new authentik_server_1.AuthentikServer(this, 'AuthentikServer', {
            environment: stackNameComponent,
            config: environmentConfig,
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
            environment: stackNameComponent,
            config: environmentConfig,
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
            environment: stackNameComponent,
            config: environmentConfig,
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
            environment: stackNameComponent,
            config: environmentConfig,
            infrastructure: authentikInfrastructureConfig,
            deployment: deploymentConfig,
            token: tokenConfig,
            application: ldapApplicationConfig
        });
        // LDAP
        const ldap = new ldap_1.Ldap(this, 'LDAP', {
            environment: stackNameComponent,
            config: environmentConfig,
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
            environment: stackNameComponent,
            config: environmentConfig,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGgtaW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFFbkMsNkNBQXVFO0FBQ3ZFLHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLHVEQUF5QztBQUV6QyxvQkFBb0I7QUFDcEIsb0RBQWlEO0FBQ2pELDhDQUEyQztBQUMzQywwQ0FBdUM7QUFDdkMsa0VBQThEO0FBQzlELDBDQUF1QztBQUN2QyxvRUFBZ0U7QUFDaEUsb0VBQWdFO0FBQ2hFLDRDQUF5QztBQUN6Qyw0RUFBdUU7QUFDdkUsa0RBQStDO0FBQy9DLHNFQUFrRTtBQWFsRSxrQkFBa0I7QUFDbEIsdUNBQTRDO0FBQzVDLHFFQUFvRjtBQU9wRjs7R0FFRztBQUNILE1BQWEsY0FBZSxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQzNDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBMEI7UUFDbEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUU7WUFDZixHQUFHLEtBQUs7WUFDUixXQUFXLEVBQUUsb0RBQW9EO1NBQ2xFLENBQUMsQ0FBQztRQUVILE1BQU0sRUFDSixXQUFXLEVBQ1gsaUJBQWlCLEVBQ2pCLGNBQWMsRUFDZixHQUFHLEtBQUssQ0FBQyxZQUFZLENBQUM7UUFFdkIsK0JBQStCO1FBQy9CLE1BQU0sT0FBTyxHQUFHLFdBQVcsQ0FBQyxPQUFPLENBQUM7UUFDcEMsTUFBTSxrQkFBa0IsR0FBRyxXQUFXLENBQUMsU0FBUyxDQUFDLENBQUMscURBQXFEO1FBQ3ZHLE1BQU0saUJBQWlCLEdBQUcsRUFBRSxDQUFDO1FBRTdCLHlDQUF5QztRQUN6QyxNQUFNLHNCQUFzQixHQUFHLGNBQWMsQ0FBQyxzQkFBc0IsQ0FBQztRQUNyRSxNQUFNLHdCQUF3QixHQUFHLGNBQWMsQ0FBQyx3QkFBd0IsQ0FBQztRQUV6RSx3Q0FBd0M7UUFDeEMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLGtCQUFrQixFQUFFLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBRTNFLE1BQU0sU0FBUyxHQUFHLGdCQUFFLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDM0MsTUFBTSxNQUFNLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDO1FBRXpDLHFDQUFxQztRQUNyQyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLGFBQWEsQ0FBQztRQUM1RSxNQUFNLGFBQWEsR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsZUFBZSxDQUFDLElBQUksS0FBSyxDQUFDLENBQUM7UUFDakYsTUFBTSx1QkFBdUIsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxrQ0FBa0MsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNsRyxNQUFNLHNCQUFzQixHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDO1FBQ25HLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxJQUFJLG1CQUFtQixDQUFDO1FBQ2hGLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsbUJBQW1CLENBQUMsSUFBSSxTQUFTLENBQUM7UUFDcEYsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUFDLElBQUksTUFBTSxDQUFDO1FBRXZFLG9CQUFvQjtRQUNwQix1Q0FBdUM7UUFDdkMsb0JBQW9CO1FBRXBCLHFEQUFxRDtRQUNyRCwrRUFBK0U7UUFDL0UsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVoRSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxLQUFLLEVBQUU7WUFDakQsS0FBSyxFQUFFLGdCQUFFLENBQUMsV0FBVyxDQUFDLElBQUEsOENBQXFCLEVBQUMsa0JBQWtCLEVBQUUsMENBQWlCLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDMUYsaUJBQWlCLEVBQUUsb0JBQW9CO1lBQ3ZDLDZDQUE2QztZQUM3QyxlQUFlLEVBQUU7Z0JBQ2YsZ0JBQUUsQ0FBQyxXQUFXLENBQUMsSUFBQSw4Q0FBcUIsRUFBQyxrQkFBa0IsRUFBRSwwQ0FBaUIsQ0FBQyxlQUFlLENBQUMsQ0FBQztnQkFDNUYsZ0JBQUUsQ0FBQyxXQUFXLENBQUMsSUFBQSw4Q0FBcUIsRUFBQyxrQkFBa0IsRUFBRSwwQ0FBaUIsQ0FBQyxlQUFlLENBQUMsQ0FBQzthQUM3RjtZQUNELGdCQUFnQixFQUFFO2dCQUNoQixnQkFBRSxDQUFDLFdBQVcsQ0FBQyxJQUFBLDhDQUFxQixFQUFDLGtCQUFrQixFQUFFLDBDQUFpQixDQUFDLGdCQUFnQixDQUFDLENBQUM7Z0JBQzdGLGdCQUFFLENBQUMsV0FBVyxDQUFDLElBQUEsOENBQXFCLEVBQUMsa0JBQWtCLEVBQUUsMENBQWlCLENBQUMsZ0JBQWdCLENBQUMsQ0FBQzthQUM5RjtZQUNELFlBQVksRUFBRSxnQkFBRSxDQUFDLFdBQVcsQ0FBQyxJQUFBLDhDQUFxQixFQUFDLGtCQUFrQixFQUFFLDBDQUFpQixDQUFDLGFBQWEsQ0FBQyxDQUFDO1NBQ3pHLENBQUMsQ0FBQztRQUVILE1BQU07UUFDTixNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUM5QyxnQkFBRSxDQUFDLFdBQVcsQ0FBQyxJQUFBLDhDQUFxQixFQUFDLGtCQUFrQixFQUFFLDBDQUFpQixDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQ3JGLENBQUM7UUFFRixNQUFNO1FBQ04sTUFBTSxhQUFhLEdBQUcsZ0JBQUUsQ0FBQyxXQUFXLENBQUMsSUFBQSw4Q0FBcUIsRUFBQyxrQkFBa0IsRUFBRSwwQ0FBaUIsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO1FBQy9HLGlGQUFpRjtRQUNqRixNQUFNLGNBQWMsR0FBRyxnQkFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsZ0JBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUM7UUFDbEUsTUFBTSxVQUFVLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFO1lBQ3ZFLFVBQVUsRUFBRSxhQUFhO1lBQ3pCLFdBQVcsRUFBRSxjQUFjO1lBQzNCLEdBQUcsRUFBRSxHQUFHO1NBQ1QsQ0FBQyxDQUFDO1FBRUgsS0FBSztRQUNMLE1BQU0sWUFBWSxHQUFHLEVBQUUsQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxjQUFjLEVBQy9ELGdCQUFFLENBQUMsV0FBVyxDQUFDLElBQUEsOENBQXFCLEVBQUMsa0JBQWtCLEVBQUUsMENBQWlCLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FDdkYsQ0FBQztRQUVGLE1BQU07UUFDTixNQUFNLGFBQWEsR0FBRyxnQkFBRSxDQUFDLFdBQVcsQ0FBQyxJQUFBLDhDQUFxQixFQUFDLGtCQUFrQixFQUFFLDBDQUFpQixDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFFNUcsVUFBVTtRQUNWLE1BQU0sWUFBWSxHQUFHLGdCQUFFLENBQUMsV0FBVyxDQUFDLElBQUEsOENBQXFCLEVBQUMsa0JBQWtCLEVBQUUsMENBQWlCLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztRQUNqSCxNQUFNLGNBQWMsR0FBRyxnQkFBRSxDQUFDLFdBQVcsQ0FBQyxJQUFBLDhDQUFxQixFQUFDLGtCQUFrQixFQUFFLDBDQUFpQixDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQztRQUVySCxrQkFBa0I7UUFDbEIsTUFBTSxpQkFBaUIsR0FBRyxnQkFBRSxDQUFDLFdBQVcsQ0FBQyxJQUFBLDhDQUFxQixFQUFDLGtCQUFrQixFQUFFLDBDQUFpQixDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7UUFFdkgsZ0ZBQWdGO1FBQ2hGLE1BQU0sWUFBWSxHQUFHLHNCQUFzQixDQUFDO1FBQzVDLE1BQU0sWUFBWSxHQUFHLGdCQUFnQixZQUFZLENBQUMsVUFBVSxJQUFJLFlBQVksRUFBRSxDQUFDO1FBRS9FLG9CQUFvQjtRQUNwQixrQkFBa0I7UUFDbEIsb0JBQW9CO1FBRXBCLGtCQUFrQjtRQUNsQixNQUFNLHNCQUFzQixHQUFHLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxHQUFHLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztRQUMxRixNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxHQUFHLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztRQUNoRixNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsR0FBRyxFQUFFLHNCQUFzQixDQUFDLENBQUM7UUFFaEYsb0JBQW9CO1FBQ3BCLDhCQUE4QjtRQUM5QixvQkFBb0I7UUFFcEIsNERBQTREO1FBQzVELE1BQU0sNkJBQTZCLEdBQXlCO1lBQzFELEdBQUc7WUFDSCxnQkFBZ0IsRUFBRSxzQkFBc0I7WUFDeEMsVUFBVTtZQUNWLE1BQU07U0FDUCxDQUFDO1FBRUYsdURBQXVEO1FBQ3ZELE1BQU0sd0JBQXdCLEdBQXlCO1lBQ3JELEdBQUc7WUFDSCxnQkFBZ0IsRUFBRSxpQkFBaUI7WUFDbkMsVUFBVTtZQUNWLE1BQU07U0FDUCxDQUFDO1FBRUYsb0JBQW9CO1FBQ3BCLHNCQUFzQjtRQUN0QixvQkFBb0I7UUFFcEIsaUJBQWlCO1FBQ2pCLE1BQU0sY0FBYyxHQUFHLElBQUksZ0NBQWMsQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDaEUsV0FBVyxFQUFFLGtCQUFrQjtZQUMvQixTQUFTLEVBQUUsaUJBQWlCO1lBQzVCLGNBQWMsRUFBRSw2QkFBNkI7U0FDOUMsQ0FBQyxDQUFDO1FBRUgsV0FBVztRQUNYLE1BQU0sUUFBUSxHQUFHLElBQUksbUJBQVEsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFO1lBQzlDLFdBQVcsRUFBRSxrQkFBa0I7WUFDL0IsU0FBUyxFQUFFLGlCQUFpQjtZQUM1QixNQUFNLEVBQUUsaUJBQWlCO1lBQ3pCLGNBQWMsRUFBRSw2QkFBNkI7WUFDN0MsY0FBYyxFQUFFLENBQUMsZUFBZSxDQUFDO1NBQ2xDLENBQUMsQ0FBQztRQUVILFFBQVE7UUFDUixNQUFNLEtBQUssR0FBRyxJQUFJLGFBQUssQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFO1lBQ3JDLFdBQVcsRUFBRSxrQkFBa0I7WUFDL0IsU0FBUyxFQUFFLGlCQUFpQjtZQUM1QixNQUFNLEVBQUUsaUJBQWlCO1lBQ3pCLGNBQWMsRUFBRSw2QkFBNkI7WUFDN0MsY0FBYyxFQUFFLENBQUMsc0JBQXNCLENBQUM7U0FDekMsQ0FBQyxDQUFDO1FBRUgsTUFBTTtRQUNOLE1BQU0sR0FBRyxHQUFHLElBQUksU0FBRyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUU7WUFDL0IsV0FBVyxFQUFFLGtCQUFrQjtZQUMvQixNQUFNLEVBQUUsaUJBQWlCO1lBQ3pCLGNBQWMsRUFBRSw2QkFBNkI7WUFDN0MsWUFBWSxFQUFFLGdCQUFFLENBQUMsV0FBVyxDQUFDLElBQUEsOENBQXFCLEVBQUMsa0JBQWtCLEVBQUUsMENBQWlCLENBQUMsYUFBYSxDQUFDLENBQUM7WUFDeEcsZUFBZSxFQUFFLENBQUMsc0JBQXNCLENBQUM7U0FDMUMsQ0FBQyxDQUFDO1FBRUgsb0JBQW9CO1FBQ3BCLDhCQUE4QjtRQUM5QixvQkFBb0I7UUFFcEIsOEJBQThCO1FBQzlCLE1BQU0sYUFBYSxHQUFrQjtZQUNuQyxRQUFRLEVBQUUsUUFBUSxDQUFDLFlBQVk7WUFDL0IsY0FBYyxFQUFFLEtBQUssQ0FBQyxTQUFTO1lBQy9CLFNBQVMsRUFBRTtnQkFDVCxTQUFTLEVBQUUsY0FBYyxDQUFDLFNBQVM7Z0JBQ25DLGlCQUFpQixFQUFFLGNBQWMsQ0FBQyxpQkFBaUI7Z0JBQ25ELGNBQWMsRUFBRSxjQUFjLENBQUMsY0FBYztnQkFDN0MsU0FBUyxFQUFFLGNBQWMsQ0FBQyxTQUFTO2dCQUNuQyxlQUFlLEVBQUUsY0FBYyxDQUFDLGVBQWU7YUFDaEQ7U0FDRixDQUFDO1FBRUYsTUFBTSxhQUFhLEdBQWtCO1lBQ25DLEVBQUUsRUFBRTtnQkFDRixZQUFZLEVBQUUsWUFBWTtnQkFDMUIsVUFBVSxFQUFFLFlBQVk7Z0JBQ3hCLFVBQVUsRUFBRSxZQUFZO2FBQ3pCO1lBQ0QsR0FBRyxFQUFFO2dCQUNILFlBQVksRUFBRSxHQUFHLENBQUMsVUFBVSxDQUFDLFlBQVk7Z0JBQ3pDLGtCQUFrQixFQUFFLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhO2dCQUN0RCw0QkFBNEIsRUFBRSxHQUFHLENBQUMsMEJBQTBCLENBQUMsYUFBYTthQUMzRTtTQUNGLENBQUM7UUFFRixNQUFNLGdCQUFnQixHQUFxQjtZQUN6QyxNQUFNLEVBQUUsTUFBTTtZQUNkLGdCQUFnQixFQUFFLGFBQWE7WUFDL0IsYUFBYSxFQUFFLGFBQWE7WUFDNUIsYUFBYSxFQUFFLHNCQUFzQjtTQUN0QyxDQUFDO1FBRUYsTUFBTSxpQkFBaUIsR0FBK0I7WUFDcEQsY0FBYyxFQUFFLHVCQUF1QjtZQUN2QyxVQUFVLEVBQUUsVUFBVTtZQUN0QixRQUFRLEVBQUU7Z0JBQ1IsUUFBUSxFQUFFLFFBQVEsQ0FBQyxRQUFRO2FBQzVCO1lBQ0QsS0FBSyxFQUFFO2dCQUNMLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUTthQUN6QjtZQUNELGFBQWEsRUFBRSxXQUFXLGlCQUFpQixJQUFJLGNBQWMsRUFBRTtTQUNoRSxDQUFDO1FBRUYsa0RBQWtEO1FBQ2xELE1BQU0sc0JBQXNCLEdBQWtCO1lBQzVDLFlBQVksRUFBRSxZQUFZO1lBQzFCLGNBQWMsRUFBRSxjQUFjO1lBQzlCLGlCQUFpQixFQUFFLGlCQUFpQjtZQUNwQyxRQUFRLEVBQUUsaUJBQWlCO1NBQzVCLENBQUM7UUFFRixNQUFNLGlCQUFpQixHQUFrQjtZQUN2QyxZQUFZLEVBQUUsWUFBWTtZQUMxQixjQUFjLEVBQUUsY0FBYztZQUM5QixpQkFBaUIsRUFBRSxpQkFBaUI7WUFDcEMsUUFBUSxFQUFFLFlBQVk7U0FDdkIsQ0FBQztRQUVGLG9CQUFvQjtRQUNwQix1QkFBdUI7UUFDdkIsb0JBQW9CO1FBRXBCLDBCQUEwQjtRQUMxQixNQUFNLFlBQVksR0FBRyxJQUFJLFNBQUcsQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQ2pELFdBQVcsRUFBRSxrQkFBa0I7WUFDL0IsTUFBTSxFQUFFLGlCQUFpQjtZQUN6QixjQUFjLEVBQUUsNkJBQTZCO1lBQzdDLE9BQU8sRUFBRSxzQkFBc0I7U0FDaEMsQ0FBQyxDQUFDO1FBRUgsbUJBQW1CO1FBQ25CLE1BQU0sZUFBZSxHQUFHLElBQUksa0NBQWUsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7WUFDbkUsV0FBVyxFQUFFLGtCQUFrQjtZQUMvQixNQUFNLEVBQUUsaUJBQWlCO1lBQ3pCLGNBQWMsRUFBRSw2QkFBNkI7WUFDN0MsT0FBTyxFQUFFLGFBQWE7WUFDdEIsT0FBTyxFQUFFLGFBQWE7WUFDdEIsVUFBVSxFQUFFLGdCQUFnQjtZQUM1QixXQUFXLEVBQUUsaUJBQWlCO1NBQy9CLENBQUMsQ0FBQztRQUVILHFCQUFxQjtRQUNyQiw0REFBNEQ7UUFDNUQsTUFBTSxxQkFBcUIsR0FBRyxFQUFFLEdBQUcsaUJBQWlCLEVBQUUsQ0FBQztRQUN2RCxNQUFNLGVBQWUsR0FBRyxJQUFJLGtDQUFlLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFO1lBQ25FLFdBQVcsRUFBRSxrQkFBa0I7WUFDL0IsTUFBTSxFQUFFLGlCQUFpQjtZQUN6QixjQUFjLEVBQUUsNkJBQTZCO1lBQzdDLE9BQU8sRUFBRSxhQUFhO1lBQ3RCLE9BQU8sRUFBRSxhQUFhO1lBQ3RCLFVBQVUsRUFBRSxnQkFBZ0I7WUFDNUIsV0FBVyxFQUFFLHFCQUFxQjtTQUNuQyxDQUFDLENBQUM7UUFFSCw0Q0FBNEM7UUFDNUMsZUFBZSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsRUFBRSxZQUFZLENBQUMsYUFBYSxDQUFDLENBQUM7UUFFbkUsb0JBQW9CO1FBQ3BCLHdCQUF3QjtRQUN4QixvQkFBb0I7UUFFcEIscUVBQXFFO1FBQ3JFLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxvQ0FBZ0IsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDdEUsV0FBVyxFQUFFLGtCQUFrQjtZQUMvQixNQUFNLEVBQUUsaUJBQWlCO1lBQ3pCLE9BQU8sRUFBRSxzQkFBc0I7WUFDL0IscUJBQXFCLEVBQUUsWUFBWSxDQUFDLFlBQVk7U0FDakQsQ0FBQyxDQUFDO1FBRUgsb0JBQW9CO1FBQ3BCLHFCQUFxQjtRQUNyQixvQkFBb0I7UUFFcEIsOENBQThDO1FBQzlDLE1BQU0sV0FBVyxHQUFnQjtZQUMvQixXQUFXLEVBQUUsTUFBTTtZQUNuQixnQkFBZ0IsRUFBRSxjQUFjLENBQUMsY0FBYztZQUMvQyxlQUFlLEVBQUUsY0FBYyxDQUFDLFNBQVM7WUFDekMsc0JBQXNCLEVBQUUsZUFBZSxDQUFDLFVBQVU7WUFDbEQsc0JBQXNCLEVBQUUsZUFBZSxDQUFDLFVBQVU7U0FDbkQsQ0FBQztRQUVGLHNEQUFzRDtRQUN0RCxNQUFNLHFCQUFxQixHQUErQjtZQUN4RCxHQUFHLGlCQUFpQjtZQUNwQixhQUFhLEVBQUUsZ0JBQWdCLENBQUMsZUFBZSxFQUFFO1NBQ2xELENBQUM7UUFFRix1QkFBdUI7UUFDdkIsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLHlDQUFrQixDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUM1RSxXQUFXLEVBQUUsa0JBQWtCO1lBQy9CLE1BQU0sRUFBRSxpQkFBaUI7WUFDekIsY0FBYyxFQUFFLDZCQUE2QjtZQUM3QyxVQUFVLEVBQUUsZ0JBQWdCO1lBQzVCLEtBQUssRUFBRSxXQUFXO1lBQ2xCLFdBQVcsRUFBRSxxQkFBcUI7U0FDbkMsQ0FBQyxDQUFDO1FBRUgsT0FBTztRQUNQLE1BQU0sSUFBSSxHQUFHLElBQUksV0FBSSxDQUFDLElBQUksRUFBRSxNQUFNLEVBQUU7WUFDbEMsV0FBVyxFQUFFLGtCQUFrQjtZQUMvQixNQUFNLEVBQUUsaUJBQWlCO1lBQ3pCLGNBQWMsRUFBRSx3QkFBd0I7WUFDeEMsT0FBTyxFQUFFLGFBQWE7WUFDdEIsVUFBVSxFQUFFLGdCQUFnQjtZQUM1QixPQUFPLEVBQUUsaUJBQWlCO1lBQzFCLFdBQVcsRUFBRSxxQkFBcUI7WUFDbEMsU0FBUyxFQUFFLGNBQWMsQ0FBQyxTQUFTO1NBQ3BDLENBQUMsQ0FBQztRQUVILGtEQUFrRDtRQUNsRCxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBRTVDLG9CQUFvQjtRQUNwQixrQkFBa0I7UUFDbEIsb0JBQW9CO1FBRXBCLG9CQUFvQjtRQUNwQixtQkFBbUI7UUFDbkIsb0JBQW9CO1FBRXBCLDZEQUE2RDtRQUM3RCxNQUFNLE9BQU8sR0FBRyxJQUFJLGlCQUFPLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRTtZQUMzQyxXQUFXLEVBQUUsa0JBQWtCO1lBQy9CLE1BQU0sRUFBRSxpQkFBaUI7WUFDekIsT0FBTyxFQUFFLGlCQUFpQjtZQUMxQixnQkFBZ0IsRUFBRSxJQUFJLENBQUMsWUFBWTtTQUNwQyxDQUFDLENBQUM7UUFFSCw0RUFBNEU7UUFDNUUsa0JBQWtCLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsZ0JBQWdCLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUN4RixrQkFBa0IsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxnQkFBZ0IsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBRTNGLG9CQUFvQjtRQUNwQixnQkFBZ0I7UUFDaEIsb0JBQW9CO1FBRXBCLFVBQVU7UUFDVixJQUFBLHlCQUFlLEVBQUM7WUFDZCxLQUFLLEVBQUUsSUFBSTtZQUNYLFNBQVMsRUFBRSxTQUFTO1lBQ3BCLGdCQUFnQixFQUFFLFFBQVEsQ0FBQyxRQUFRO1lBQ25DLGlCQUFpQixFQUFFLFFBQVEsQ0FBQyxZQUFZLENBQUMsU0FBUztZQUNsRCxhQUFhLEVBQUUsS0FBSyxDQUFDLFFBQVE7WUFDN0IsaUJBQWlCLEVBQUUsS0FBSyxDQUFDLFNBQVMsQ0FBQyxTQUFTO1lBQzVDLEtBQUssRUFBRSxHQUFHLENBQUMsVUFBVSxDQUFDLFlBQVk7WUFDbEMscUJBQXFCLEVBQUUsR0FBRyxDQUFDLGdCQUFnQixDQUFDLGFBQWE7WUFDekQseUJBQXlCLEVBQUUsR0FBRyxDQUFDLDBCQUEwQixDQUFDLGFBQWE7WUFDdkUscUJBQXFCLEVBQUUsY0FBYyxDQUFDLFNBQVMsQ0FBQyxTQUFTO1lBQ3pELHNCQUFzQixFQUFFLGNBQWMsQ0FBQyxjQUFjLENBQUMsU0FBUztZQUMvRCxxQkFBcUIsRUFBRSxjQUFjLENBQUMsU0FBUyxDQUFDLFNBQVM7WUFDekQsZUFBZSxFQUFFLFlBQVksQ0FBQyxZQUFZLENBQUMsbUJBQW1CO1lBQzlELFlBQVksRUFBRSxXQUFXLFlBQVksQ0FBQyxPQUFPLEVBQUU7WUFDL0MsVUFBVSxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsbUJBQW1CO1lBQ2pELFlBQVksRUFBRSxVQUFVLElBQUksQ0FBQyxPQUFPLE1BQU07WUFDMUMsYUFBYSxFQUFFLFdBQVcsSUFBSSxDQUFDLE9BQU8sTUFBTTtZQUM1QywyQkFBMkIsRUFBRSxrQkFBa0IsQ0FBQyxjQUFjLENBQUMsV0FBVztTQUMzRSxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsb0JBQW9CO0lBQ3BCLGlCQUFpQjtJQUNqQixvQkFBb0I7SUFFcEI7Ozs7O09BS0c7SUFDSyw0QkFBNEIsQ0FBQyxHQUFhLEVBQUUsa0JBQTBCO1FBQzVFLE1BQU0sc0JBQXNCLEdBQUcsSUFBSSxHQUFHLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSx3QkFBd0IsRUFBRTtZQUNuRixHQUFHO1lBQ0gsV0FBVyxFQUFFLHdEQUF3RDtZQUNyRSxnQkFBZ0IsRUFBRSxJQUFJO1NBQ3ZCLENBQUMsQ0FBQztRQUVILDhDQUE4QztRQUM5QyxzQkFBc0IsQ0FBQyxjQUFjLENBQ25DLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEVBQ2xCLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUNoQixvQkFBb0IsQ0FDckIsQ0FBQztRQUVGLHNCQUFzQixDQUFDLGNBQWMsQ0FDbkMsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsRUFDbEIsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQ2pCLHFCQUFxQixDQUN0QixDQUFDO1FBRUYsZ0VBQWdFO1FBQ2hFLHNCQUFzQixDQUFDLGNBQWMsQ0FDbkMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQUUsQ0FBQyxXQUFXLENBQUMsSUFBQSw4Q0FBcUIsRUFBQyxrQkFBa0IsRUFBRSwwQ0FBaUIsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLEVBQ3pHLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUNsQixrQ0FBa0MsQ0FDbkMsQ0FBQztRQUVGLE9BQU8sc0JBQXNCLENBQUM7SUFDaEMsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0ssdUJBQXVCLENBQUMsR0FBYSxFQUFFLGtCQUEwQjtRQUN2RSxNQUFNLGlCQUFpQixHQUFHLElBQUksR0FBRyxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDekUsR0FBRztZQUNILFdBQVcsRUFBRSxtQ0FBbUM7WUFDaEQsZ0JBQWdCLEVBQUUsSUFBSTtTQUN2QixDQUFDLENBQUM7UUFFSCwrQ0FBK0M7UUFDL0MsaUJBQWlCLENBQUMsY0FBYyxDQUM5QixHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBRSxDQUFDLFdBQVcsQ0FBQyxJQUFBLDhDQUFxQixFQUFDLGtCQUFrQixFQUFFLDBDQUFpQixDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsRUFDekcsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQ2xCLDZCQUE2QixDQUM5QixDQUFDO1FBRUYsZ0RBQWdEO1FBQ2hELGlCQUFpQixDQUFDLGNBQWMsQ0FDOUIsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQUUsQ0FBQyxXQUFXLENBQUMsSUFBQSw4Q0FBcUIsRUFBQyxrQkFBa0IsRUFBRSwwQ0FBaUIsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLEVBQ3pHLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUNsQiw4QkFBOEIsQ0FDL0IsQ0FBQztRQUVGLE9BQU8saUJBQWlCLENBQUM7SUFDM0IsQ0FBQztJQUVEOzs7O09BSUc7SUFDSyxzQkFBc0IsQ0FBQyxHQUFhO1FBQzFDLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxHQUFHLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUN2RSxHQUFHO1lBQ0gsV0FBVyxFQUFFLDhCQUE4QjtZQUMzQyxnQkFBZ0IsRUFBRSxJQUFJO1NBQ3ZCLENBQUMsQ0FBQztRQUVILHdDQUF3QztRQUN4QyxnQkFBZ0IsQ0FBQyxjQUFjLENBQzdCLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEVBQ2xCLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUNoQixvQkFBb0IsQ0FDckIsQ0FBQztRQUVGLGdCQUFnQixDQUFDLGNBQWMsQ0FDN0IsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsRUFDbEIsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQ2pCLHFCQUFxQixDQUN0QixDQUFDO1FBRUYsZ0JBQWdCLENBQUMsY0FBYyxDQUM3QixHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxFQUNsQixHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFDbEIseUJBQXlCLENBQzFCLENBQUM7UUFFRixPQUFPLGdCQUFnQixDQUFDO0lBQzFCLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNLLHFCQUFxQixDQUFDLEdBQWEsRUFBRSxnQkFBbUM7UUFDOUUsTUFBTSxlQUFlLEdBQUcsSUFBSSxHQUFHLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxpQkFBaUIsRUFBRTtZQUNyRSxHQUFHO1lBQ0gsV0FBVyxFQUFFLDZCQUE2QjtZQUMxQyxnQkFBZ0IsRUFBRSxLQUFLO1NBQ3hCLENBQUMsQ0FBQztRQUVILHlDQUF5QztRQUN6QyxlQUFlLENBQUMsY0FBYyxDQUM1QixHQUFHLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsRUFDMUQsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQ2xCLHdDQUF3QyxDQUN6QyxDQUFDO1FBRUYsT0FBTyxlQUFlLENBQUM7SUFDekIsQ0FBQztDQUNGO0FBN2VELHdDQTZlQztBQUVEOzs7O0dBSUc7QUFDSCxTQUFTLDRCQUE0QixDQUFDLE1BQWM7SUFDbEQsNkRBQTZEO0lBQzdELE1BQU0sUUFBUSxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDbkMsSUFBSSxRQUFRLENBQUMsTUFBTSxLQUFLLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztRQUNwRSxNQUFNLElBQUksS0FBSyxDQUFDLHNDQUFzQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQ2xFLENBQUM7SUFFRCxNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDM0IsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzVCLE1BQU0sY0FBYyxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBRTlELE9BQU8sR0FBRyxPQUFPLFlBQVksTUFBTSxrQkFBa0IsY0FBYyxFQUFFLENBQUM7QUFDeEUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7IFJlbW92YWxQb2xpY3ksIFN0YWNrUHJvcHMsIEZuLCBDZm5PdXRwdXQgfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBlYzIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjMic7XG5pbXBvcnQgKiBhcyBlY3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjcyc7XG5pbXBvcnQgKiBhcyBrbXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWttcyc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuXG4vLyBDb25zdHJ1Y3QgaW1wb3J0c1xuaW1wb3J0IHsgRGF0YWJhc2UgfSBmcm9tICcuL2NvbnN0cnVjdHMvZGF0YWJhc2UnO1xuaW1wb3J0IHsgUmVkaXMgfSBmcm9tICcuL2NvbnN0cnVjdHMvcmVkaXMnO1xuaW1wb3J0IHsgRWZzIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2Vmcyc7XG5pbXBvcnQgeyBTZWNyZXRzTWFuYWdlciB9IGZyb20gJy4vY29uc3RydWN0cy9zZWNyZXRzLW1hbmFnZXInO1xuaW1wb3J0IHsgRWxiIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2VsYic7XG5pbXBvcnQgeyBBdXRoZW50aWtTZXJ2ZXIgfSBmcm9tICcuL2NvbnN0cnVjdHMvYXV0aGVudGlrLXNlcnZlcic7XG5pbXBvcnQgeyBBdXRoZW50aWtXb3JrZXIgfSBmcm9tICcuL2NvbnN0cnVjdHMvYXV0aGVudGlrLXdvcmtlcic7XG5pbXBvcnQgeyBMZGFwIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2xkYXAnO1xuaW1wb3J0IHsgTGRhcFRva2VuUmV0cmlldmVyIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2xkYXAtdG9rZW4tcmV0cmlldmVyJztcbmltcG9ydCB7IFJvdXRlNTMgfSBmcm9tICcuL2NvbnN0cnVjdHMvcm91dGU1Myc7XG5pbXBvcnQgeyBSb3V0ZTUzQXV0aGVudGlrIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL3JvdXRlNTMtYXV0aGVudGlrJztcblxuLy8gQ29uZmlndXJhdGlvbiBpbXBvcnRzXG5pbXBvcnQgdHlwZSB7XG4gIEluZnJhc3RydWN0dXJlQ29uZmlnLFxuICBTZWNyZXRzQ29uZmlnLFxuICBTdG9yYWdlQ29uZmlnLFxuICBEZXBsb3ltZW50Q29uZmlnLFxuICBBdXRoZW50aWtBcHBsaWNhdGlvbkNvbmZpZyxcbiAgTmV0d29ya0NvbmZpZyxcbiAgVG9rZW5Db25maWdcbn0gZnJvbSAnLi9jb25zdHJ1Y3QtY29uZmlncyc7XG5cbi8vIFV0aWxpdHkgaW1wb3J0c1xuaW1wb3J0IHsgcmVnaXN0ZXJPdXRwdXRzIH0gZnJvbSAnLi9vdXRwdXRzJztcbmltcG9ydCB7IGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZSwgQkFTRV9FWFBPUlRfTkFNRVMgfSBmcm9tICcuL2Nsb3VkZm9ybWF0aW9uLWltcG9ydHMnO1xuaW1wb3J0IHsgQXV0aEluZnJhQ29uZmlnUmVzdWx0IH0gZnJvbSAnLi9zdGFjay1jb25maWcnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhJbmZyYVN0YWNrUHJvcHMgZXh0ZW5kcyBTdGFja1Byb3BzIHtcbiAgY29uZmlnUmVzdWx0OiBBdXRoSW5mcmFDb25maWdSZXN1bHQ7XG59XG5cbi8qKlxuICogTWFpbiBDREsgc3RhY2sgZm9yIHRoZSBUQUsgQXV0aCBJbmZyYXN0cnVjdHVyZVxuICovXG5leHBvcnQgY2xhc3MgQXV0aEluZnJhU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQXV0aEluZnJhU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwge1xuICAgICAgLi4ucHJvcHMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1RBSyBBdXRoZW50aWNhdGlvbiBMYXllciAtIEF1dGhlbnRpaywgTERBUCBPdXRwb3N0JyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHsgXG4gICAgICBzdGFja0NvbmZpZywgXG4gICAgICBlbnZpcm9ubWVudENvbmZpZywgXG4gICAgICBjb21wdXRlZFZhbHVlcyBcbiAgICB9ID0gcHJvcHMuY29uZmlnUmVzdWx0O1xuICAgIFxuICAgIC8vIEV4dHJhY3QgY29uZmlndXJhdGlvbiB2YWx1ZXNcbiAgICBjb25zdCBlbnZUeXBlID0gc3RhY2tDb25maWcuZW52VHlwZTtcbiAgICBjb25zdCBzdGFja05hbWVDb21wb25lbnQgPSBzdGFja0NvbmZpZy5zdGFja05hbWU7IC8vIFRoaXMgaXMgdGhlIFNUQUNLX05BTUUgcGFydCAoZS5nLiwgXCJNeUZpcnN0U3RhY2tcIilcbiAgICBjb25zdCByZXNvbHZlZFN0YWNrTmFtZSA9IGlkO1xuICAgIFxuICAgIC8vIFVzZSBjb21wdXRlZCB2YWx1ZXMgZnJvbSBjb25maWd1cmF0aW9uXG4gICAgY29uc3QgZW5hYmxlSGlnaEF2YWlsYWJpbGl0eSA9IGNvbXB1dGVkVmFsdWVzLmVuYWJsZUhpZ2hBdmFpbGFiaWxpdHk7XG4gICAgY29uc3QgZW5hYmxlRGV0YWlsZWRNb25pdG9yaW5nID0gY29tcHV0ZWRWYWx1ZXMuZW5hYmxlRGV0YWlsZWRNb25pdG9yaW5nO1xuXG4gICAgLy8gQWRkIEVudmlyb25tZW50IFR5cGUgdGFnIHRvIHRoZSBzdGFja1xuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnRW52aXJvbm1lbnQgVHlwZScsIGNvbXB1dGVkVmFsdWVzLmVudmlyb25tZW50TGFiZWwpO1xuXG4gICAgY29uc3Qgc3RhY2tOYW1lID0gRm4ucmVmKCdBV1M6OlN0YWNrTmFtZScpO1xuICAgIGNvbnN0IHJlZ2lvbiA9IGNkay5TdGFjay5vZih0aGlzKS5yZWdpb247XG5cbiAgICAvLyBDb250ZXh0LWJhc2VkIHBhcmFtZXRlciByZXNvbHV0aW9uXG4gICAgY29uc3QgZ2l0U2hhID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ2NhbGN1bGF0ZWRHaXRTaGEnKSB8fCAnZGV2ZWxvcG1lbnQnO1xuICAgIGNvbnN0IGVuYWJsZUV4ZWN1dGUgPSBCb29sZWFuKHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdlbmFibGVFeGVjdXRlJykgfHwgZmFsc2UpO1xuICAgIGNvbnN0IGF1dGhlbnRpa0FkbWluVXNlckVtYWlsID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ3ZhbGlkYXRlZEF1dGhlbnRpa0FkbWluVXNlckVtYWlsJykgfHwgJyc7XG4gICAgY29uc3QgdXNlQXV0aGVudGlrQ29uZmlnRmlsZSA9IEJvb2xlYW4odGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ3VzZUF1dGhlbnRpa0NvbmZpZ0ZpbGUnKSB8fCBmYWxzZSk7XG4gICAgY29uc3QgbGRhcEJhc2VEbiA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdsZGFwQmFzZURuJykgfHwgJ2RjPWV4YW1wbGUsZGM9Y29tJztcbiAgICBjb25zdCBob3N0bmFtZUF1dGhlbnRpayA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdob3N0bmFtZUF1dGhlbnRpaycpIHx8ICdhY2NvdW50JztcbiAgICBjb25zdCBob3N0bmFtZUxkYXAgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnaG9zdG5hbWVMZGFwJykgfHwgJ2xkYXAnO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBJTVBPUlQgQkFTRSBJTkZSQVNUUlVDVFVSRSBSRVNPVVJDRVNcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gSW1wb3J0IFZQQyBhbmQgbmV0d29ya2luZyBmcm9tIGJhc2UgaW5mcmFzdHJ1Y3R1cmVcbiAgICAvLyBOb3RlOiBCYXNlIGluZnJhc3RydWN0dXJlIHByb3ZpZGVzIDIgc3VibmV0cyAoQSBhbmQgQiksIHNvIHdlIGxpbWl0IHRvIDIgQVpzXG4gICAgY29uc3QgdnBjQXZhaWxhYmlsaXR5Wm9uZXMgPSB0aGlzLmF2YWlsYWJpbGl0eVpvbmVzLnNsaWNlKDAsIDIpO1xuICAgIFxuICAgIGNvbnN0IHZwYyA9IGVjMi5WcGMuZnJvbVZwY0F0dHJpYnV0ZXModGhpcywgJ1ZQQycsIHtcbiAgICAgIHZwY0lkOiBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5WUENfSUQpKSxcbiAgICAgIGF2YWlsYWJpbGl0eVpvbmVzOiB2cGNBdmFpbGFiaWxpdHlab25lcyxcbiAgICAgIC8vIEltcG9ydCBzdWJuZXQgSURzIGZyb20gYmFzZSBpbmZyYXN0cnVjdHVyZVxuICAgICAgcHVibGljU3VibmV0SWRzOiBbXG4gICAgICAgIEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlNVQk5FVF9QVUJMSUNfQSkpLFxuICAgICAgICBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5TVUJORVRfUFVCTElDX0IpKVxuICAgICAgXSxcbiAgICAgIHByaXZhdGVTdWJuZXRJZHM6IFtcbiAgICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuU1VCTkVUX1BSSVZBVEVfQSkpLFxuICAgICAgICBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5TVUJORVRfUFJJVkFURV9CKSlcbiAgICAgIF0sXG4gICAgICB2cGNDaWRyQmxvY2s6IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlZQQ19DSURSX0lQVjQpKVxuICAgIH0pO1xuXG4gICAgLy8gS01TXG4gICAgY29uc3Qga21zS2V5ID0ga21zLktleS5mcm9tS2V5QXJuKHRoaXMsICdLTVNLZXknLCBcbiAgICAgIEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLktNU19LRVkpKVxuICAgICk7XG5cbiAgICAvLyBFQ1NcbiAgICBjb25zdCBlY3NDbHVzdGVyQXJuID0gRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuRUNTX0NMVVNURVIpKTtcbiAgICAvLyBFeHRyYWN0IGNsdXN0ZXIgbmFtZSBmcm9tIEFSTjogYXJuOmF3czplY3M6cmVnaW9uOmFjY291bnQ6Y2x1c3Rlci9jbHVzdGVyLW5hbWVcbiAgICBjb25zdCBlY3NDbHVzdGVyTmFtZSA9IEZuLnNlbGVjdCgxLCBGbi5zcGxpdCgnLycsIGVjc0NsdXN0ZXJBcm4pKTtcbiAgICBjb25zdCBlY3NDbHVzdGVyID0gZWNzLkNsdXN0ZXIuZnJvbUNsdXN0ZXJBdHRyaWJ1dGVzKHRoaXMsICdFQ1NDbHVzdGVyJywge1xuICAgICAgY2x1c3RlckFybjogZWNzQ2x1c3RlckFybixcbiAgICAgIGNsdXN0ZXJOYW1lOiBlY3NDbHVzdGVyTmFtZSxcbiAgICAgIHZwYzogdnBjXG4gICAgfSk7XG5cbiAgICAvLyBTM1xuICAgIGNvbnN0IHMzQ29uZkJ1Y2tldCA9IHMzLkJ1Y2tldC5mcm9tQnVja2V0QXJuKHRoaXMsICdTM0NvbmZCdWNrZXQnLFxuICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuUzNfQlVDS0VUKSlcbiAgICApO1xuXG4gICAgLy8gRUNSXG4gICAgY29uc3QgZWNyUmVwb3NpdG9yeSA9IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLkVDUl9SRVBPKSk7XG5cbiAgICAvLyBSb3V0ZTUzXG4gICAgY29uc3QgaG9zdGVkWm9uZUlkID0gRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuSE9TVEVEX1pPTkVfSUQpKTtcbiAgICBjb25zdCBob3N0ZWRab25lTmFtZSA9IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLkhPU1RFRF9aT05FX05BTUUpKTtcblxuICAgIC8vIFNTTCBDZXJ0aWZpY2F0ZVxuICAgIGNvbnN0IHNzbENlcnRpZmljYXRlQXJuID0gRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuQ0VSVElGSUNBVEVfQVJOKSk7XG5cbiAgICAvLyBTMyBFbnZpcm9ubWVudCBGaWxlIHBhdGhzIC0gYXNzdW1lcyBhdXRoZW50aWstY29uZmlnLmVudiBhbHJlYWR5IGV4aXN0cyBpbiBTM1xuICAgIGNvbnN0IGVudkZpbGVTM0tleSA9IGBhdXRoZW50aWstY29uZmlnLmVudmA7XG4gICAgY29uc3QgZW52RmlsZVMzVXJpID0gYGFybjphd3M6czM6Ojoke3MzQ29uZkJ1Y2tldC5idWNrZXROYW1lfS8ke2VudkZpbGVTM0tleX1gO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBTRUNVUklUWSBHUk9VUFNcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gU2VjdXJpdHkgR3JvdXBzXG4gICAgY29uc3QgYXV0aGVudGlrU2VjdXJpdHlHcm91cCA9IHRoaXMuY3JlYXRlQXV0aGVudGlrU2VjdXJpdHlHcm91cCh2cGMsIHN0YWNrTmFtZUNvbXBvbmVudCk7XG4gICAgY29uc3QgbGRhcFNlY3VyaXR5R3JvdXAgPSB0aGlzLmNyZWF0ZUxkYXBTZWN1cml0eUdyb3VwKHZwYywgc3RhY2tOYW1lQ29tcG9uZW50KTtcbiAgICBjb25zdCBkYlNlY3VyaXR5R3JvdXAgPSB0aGlzLmNyZWF0ZURiU2VjdXJpdHlHcm91cCh2cGMsIGF1dGhlbnRpa1NlY3VyaXR5R3JvdXApO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBCVUlMRCBDT05GSUdVUkFUSU9OIE9CSkVDVFNcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gQnVpbGQgc2hhcmVkIGluZnJhc3RydWN0dXJlIGNvbmZpZyBmb3IgQXV0aGVudGlrIHNlcnZpY2VzXG4gICAgY29uc3QgYXV0aGVudGlrSW5mcmFzdHJ1Y3R1cmVDb25maWc6IEluZnJhc3RydWN0dXJlQ29uZmlnID0ge1xuICAgICAgdnBjLFxuICAgICAgZWNzU2VjdXJpdHlHcm91cDogYXV0aGVudGlrU2VjdXJpdHlHcm91cCxcbiAgICAgIGVjc0NsdXN0ZXIsXG4gICAgICBrbXNLZXlcbiAgICB9O1xuXG4gICAgLy8gQnVpbGQgc2hhcmVkIGluZnJhc3RydWN0dXJlIGNvbmZpZyBmb3IgTERBUCBzZXJ2aWNlc1xuICAgIGNvbnN0IGxkYXBJbmZyYXN0cnVjdHVyZUNvbmZpZzogSW5mcmFzdHJ1Y3R1cmVDb25maWcgPSB7XG4gICAgICB2cGMsXG4gICAgICBlY3NTZWN1cml0eUdyb3VwOiBsZGFwU2VjdXJpdHlHcm91cCxcbiAgICAgIGVjc0NsdXN0ZXIsXG4gICAgICBrbXNLZXlcbiAgICB9O1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBDT1JFIElORlJBU1RSVUNUVVJFXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIFNlY3JldHNNYW5hZ2VyXG4gICAgY29uc3Qgc2VjcmV0c01hbmFnZXIgPSBuZXcgU2VjcmV0c01hbmFnZXIodGhpcywgJ1NlY3JldHNNYW5hZ2VyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIHN0YWNrTmFtZTogcmVzb2x2ZWRTdGFja05hbWUsXG4gICAgICBpbmZyYXN0cnVjdHVyZTogYXV0aGVudGlrSW5mcmFzdHJ1Y3R1cmVDb25maWdcbiAgICB9KTtcblxuICAgIC8vIERhdGFiYXNlXG4gICAgY29uc3QgZGF0YWJhc2UgPSBuZXcgRGF0YWJhc2UodGhpcywgJ0RhdGFiYXNlJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIHN0YWNrTmFtZTogcmVzb2x2ZWRTdGFja05hbWUsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAgaW5mcmFzdHJ1Y3R1cmU6IGF1dGhlbnRpa0luZnJhc3RydWN0dXJlQ29uZmlnLFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtkYlNlY3VyaXR5R3JvdXBdXG4gICAgfSk7XG5cbiAgICAvLyBSZWRpc1xuICAgIGNvbnN0IHJlZGlzID0gbmV3IFJlZGlzKHRoaXMsICdSZWRpcycsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBzdGFja05hbWU6IHJlc29sdmVkU3RhY2tOYW1lLFxuICAgICAgY29uZmlnOiBlbnZpcm9ubWVudENvbmZpZyxcbiAgICAgIGluZnJhc3RydWN0dXJlOiBhdXRoZW50aWtJbmZyYXN0cnVjdHVyZUNvbmZpZyxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbYXV0aGVudGlrU2VjdXJpdHlHcm91cF1cbiAgICB9KTtcblxuICAgIC8vIEVGU1xuICAgIGNvbnN0IGVmcyA9IG5ldyBFZnModGhpcywgJ0VGUycsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAgaW5mcmFzdHJ1Y3R1cmU6IGF1dGhlbnRpa0luZnJhc3RydWN0dXJlQ29uZmlnLFxuICAgICAgdnBjQ2lkckJsb2NrOiBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5WUENfQ0lEUl9JUFY0KSksXG4gICAgICBhbGxvd0FjY2Vzc0Zyb206IFthdXRoZW50aWtTZWN1cml0eUdyb3VwXVxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBCVUlMRCBDT05GSUdVUkFUSU9OIE9CSkVDVFNcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gQnVpbGQgc2hhcmVkIGNvbmZpZyBvYmplY3RzXG4gICAgY29uc3Qgc2VjcmV0c0NvbmZpZzogU2VjcmV0c0NvbmZpZyA9IHtcbiAgICAgIGRhdGFiYXNlOiBkYXRhYmFzZS5tYXN0ZXJTZWNyZXQsXG4gICAgICByZWRpc0F1dGhUb2tlbjogcmVkaXMuYXV0aFRva2VuLFxuICAgICAgYXV0aGVudGlrOiB7XG4gICAgICAgIHNlY3JldEtleTogc2VjcmV0c01hbmFnZXIuc2VjcmV0S2V5LFxuICAgICAgICBhZG1pblVzZXJQYXNzd29yZDogc2VjcmV0c01hbmFnZXIuYWRtaW5Vc2VyUGFzc3dvcmQsXG4gICAgICAgIGFkbWluVXNlclRva2VuOiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJUb2tlbixcbiAgICAgICAgbGRhcFRva2VuOiBzZWNyZXRzTWFuYWdlci5sZGFwVG9rZW4sXG4gICAgICAgIGxkYXBTZXJ2aWNlVXNlcjogc2VjcmV0c01hbmFnZXIubGRhcFNlcnZpY2VVc2VyXG4gICAgICB9XG4gICAgfTtcblxuICAgIGNvbnN0IHN0b3JhZ2VDb25maWc6IFN0b3JhZ2VDb25maWcgPSB7XG4gICAgICBzMzoge1xuICAgICAgICBjb25maWdCdWNrZXQ6IHMzQ29uZkJ1Y2tldCxcbiAgICAgICAgZW52RmlsZVVyaTogZW52RmlsZVMzVXJpLFxuICAgICAgICBlbnZGaWxlS2V5OiBlbnZGaWxlUzNLZXlcbiAgICAgIH0sXG4gICAgICBlZnM6IHtcbiAgICAgICAgZmlsZVN5c3RlbUlkOiBlZnMuZmlsZVN5c3RlbS5maWxlU3lzdGVtSWQsXG4gICAgICAgIG1lZGlhQWNjZXNzUG9pbnRJZDogZWZzLm1lZGlhQWNjZXNzUG9pbnQuYWNjZXNzUG9pbnRJZCxcbiAgICAgICAgY3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnRJZDogZWZzLmN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWRcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgY29uc3QgZGVwbG95bWVudENvbmZpZzogRGVwbG95bWVudENvbmZpZyA9IHtcbiAgICAgIGdpdFNoYTogZ2l0U2hhLFxuICAgICAgZWNyUmVwb3NpdG9yeUFybjogZWNyUmVwb3NpdG9yeSxcbiAgICAgIGVuYWJsZUV4ZWN1dGU6IGVuYWJsZUV4ZWN1dGUsXG4gICAgICB1c2VDb25maWdGaWxlOiB1c2VBdXRoZW50aWtDb25maWdGaWxlXG4gICAgfTtcblxuICAgIGNvbnN0IGFwcGxpY2F0aW9uQ29uZmlnOiBBdXRoZW50aWtBcHBsaWNhdGlvbkNvbmZpZyA9IHtcbiAgICAgIGFkbWluVXNlckVtYWlsOiBhdXRoZW50aWtBZG1pblVzZXJFbWFpbCxcbiAgICAgIGxkYXBCYXNlRG46IGxkYXBCYXNlRG4sXG4gICAgICBkYXRhYmFzZToge1xuICAgICAgICBob3N0bmFtZTogZGF0YWJhc2UuaG9zdG5hbWVcbiAgICAgIH0sXG4gICAgICByZWRpczoge1xuICAgICAgICBob3N0bmFtZTogcmVkaXMuaG9zdG5hbWVcbiAgICAgIH0sXG4gICAgICBhdXRoZW50aWtIb3N0OiBgaHR0cHM6Ly8ke2hvc3RuYW1lQXV0aGVudGlrfS4ke2hvc3RlZFpvbmVOYW1lfWBcbiAgICB9O1xuXG4gICAgLy8gQnVpbGQgbmV0d29yayBjb25maWcgZm9yIEROUyBhbmQgbG9hZCBiYWxhbmNlcnNcbiAgICBjb25zdCBhdXRoZW50aWtOZXR3b3JrQ29uZmlnOiBOZXR3b3JrQ29uZmlnID0ge1xuICAgICAgaG9zdGVkWm9uZUlkOiBob3N0ZWRab25lSWQsXG4gICAgICBob3N0ZWRab25lTmFtZTogaG9zdGVkWm9uZU5hbWUsXG4gICAgICBzc2xDZXJ0aWZpY2F0ZUFybjogc3NsQ2VydGlmaWNhdGVBcm4sXG4gICAgICBob3N0bmFtZTogaG9zdG5hbWVBdXRoZW50aWtcbiAgICB9O1xuXG4gICAgY29uc3QgbGRhcE5ldHdvcmtDb25maWc6IE5ldHdvcmtDb25maWcgPSB7XG4gICAgICBob3N0ZWRab25lSWQ6IGhvc3RlZFpvbmVJZCxcbiAgICAgIGhvc3RlZFpvbmVOYW1lOiBob3N0ZWRab25lTmFtZSxcbiAgICAgIHNzbENlcnRpZmljYXRlQXJuOiBzc2xDZXJ0aWZpY2F0ZUFybixcbiAgICAgIGhvc3RuYW1lOiBob3N0bmFtZUxkYXBcbiAgICB9O1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBBUFBMSUNBVElPTiBTRVJWSUNFU1xuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBBdXRoZW50aWsgTG9hZCBCYWxhbmNlclxuICAgIGNvbnN0IGF1dGhlbnRpa0VMQiA9IG5ldyBFbGIodGhpcywgJ0F1dGhlbnRpa0VMQicsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAgaW5mcmFzdHJ1Y3R1cmU6IGF1dGhlbnRpa0luZnJhc3RydWN0dXJlQ29uZmlnLFxuICAgICAgbmV0d29yazogYXV0aGVudGlrTmV0d29ya0NvbmZpZ1xuICAgIH0pO1xuXG4gICAgLy8gQXV0aGVudGlrIFNlcnZlclxuICAgIGNvbnN0IGF1dGhlbnRpa1NlcnZlciA9IG5ldyBBdXRoZW50aWtTZXJ2ZXIodGhpcywgJ0F1dGhlbnRpa1NlcnZlcicsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAgaW5mcmFzdHJ1Y3R1cmU6IGF1dGhlbnRpa0luZnJhc3RydWN0dXJlQ29uZmlnLFxuICAgICAgc2VjcmV0czogc2VjcmV0c0NvbmZpZyxcbiAgICAgIHN0b3JhZ2U6IHN0b3JhZ2VDb25maWcsXG4gICAgICBkZXBsb3ltZW50OiBkZXBsb3ltZW50Q29uZmlnLFxuICAgICAgYXBwbGljYXRpb246IGFwcGxpY2F0aW9uQ29uZmlnXG4gICAgfSk7XG5cbiAgICAvLyBBdXRoZW50aWsgV29ya2VyICBcbiAgICAvLyBVcGRhdGUgYXV0aGVudGljYXRpb24gaG9zdCBmb3Igd29ya2VyIGFmdGVyIFJvdXRlNTMgc2V0dXBcbiAgICBjb25zdCBhdXRoZW50aWtXb3JrZXJDb25maWcgPSB7IC4uLmFwcGxpY2F0aW9uQ29uZmlnIH07XG4gICAgY29uc3QgYXV0aGVudGlrV29ya2VyID0gbmV3IEF1dGhlbnRpa1dvcmtlcih0aGlzLCAnQXV0aGVudGlrV29ya2VyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogZW52aXJvbm1lbnRDb25maWcsXG4gICAgICBpbmZyYXN0cnVjdHVyZTogYXV0aGVudGlrSW5mcmFzdHJ1Y3R1cmVDb25maWcsXG4gICAgICBzZWNyZXRzOiBzZWNyZXRzQ29uZmlnLFxuICAgICAgc3RvcmFnZTogc3RvcmFnZUNvbmZpZyxcbiAgICAgIGRlcGxveW1lbnQ6IGRlcGxveW1lbnRDb25maWcsXG4gICAgICBhcHBsaWNhdGlvbjogYXV0aGVudGlrV29ya2VyQ29uZmlnXG4gICAgfSk7XG5cbiAgICAvLyBDb25uZWN0IEF1dGhlbnRpayBTZXJ2ZXIgdG8gTG9hZCBCYWxhbmNlclxuICAgIGF1dGhlbnRpa1NlcnZlci5jcmVhdGVUYXJnZXRHcm91cCh2cGMsIGF1dGhlbnRpa0VMQi5odHRwc0xpc3RlbmVyKTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gRE5TIFNFVFVQIChBVVRIRU5USUspXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIFJvdXRlNTMgQXV0aGVudGlrIEROUyBSZWNvcmRzIChuZWVkZWQgYmVmb3JlIExEQVAgdG9rZW4gcmV0cmlldmVyKVxuICAgIGNvbnN0IHJvdXRlNTNBdXRoZW50aWsgPSBuZXcgUm91dGU1M0F1dGhlbnRpayh0aGlzLCAnUm91dGU1M0F1dGhlbnRpaycsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAgbmV0d29yazogYXV0aGVudGlrTmV0d29ya0NvbmZpZyxcbiAgICAgIGF1dGhlbnRpa0xvYWRCYWxhbmNlcjogYXV0aGVudGlrRUxCLmxvYWRCYWxhbmNlclxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBMREFQIENPTkZJR1VSQVRJT05cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gQnVpbGQgdG9rZW4gY29uZmlnIGZvciBMREFQIHRva2VuIHJldHJpZXZhbFxuICAgIGNvbnN0IHRva2VuQ29uZmlnOiBUb2tlbkNvbmZpZyA9IHtcbiAgICAgIG91dHBvc3ROYW1lOiAnTERBUCcsXG4gICAgICBhZG1pblRva2VuU2VjcmV0OiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJUb2tlbixcbiAgICAgIGxkYXBUb2tlblNlY3JldDogc2VjcmV0c01hbmFnZXIubGRhcFRva2VuLFxuICAgICAgYXV0aGVudGlrU2VydmVyU2VydmljZTogYXV0aGVudGlrU2VydmVyLmVjc1NlcnZpY2UsXG4gICAgICBhdXRoZW50aWtXb3JrZXJTZXJ2aWNlOiBhdXRoZW50aWtXb3JrZXIuZWNzU2VydmljZVxuICAgIH07XG5cbiAgICAvLyBVcGRhdGUgYXBwbGljYXRpb24gY29uZmlnIHdpdGggcHJvcGVyIEF1dGhlbnRpayBVUkxcbiAgICBjb25zdCBsZGFwQXBwbGljYXRpb25Db25maWc6IEF1dGhlbnRpa0FwcGxpY2F0aW9uQ29uZmlnID0ge1xuICAgICAgLi4uYXBwbGljYXRpb25Db25maWcsXG4gICAgICBhdXRoZW50aWtIb3N0OiByb3V0ZTUzQXV0aGVudGlrLmdldEF1dGhlbnRpa1VybCgpXG4gICAgfTtcblxuICAgIC8vIExEQVAgVG9rZW4gUmV0cmlldmVyXG4gICAgY29uc3QgbGRhcFRva2VuUmV0cmlldmVyID0gbmV3IExkYXBUb2tlblJldHJpZXZlcih0aGlzLCAnTGRhcFRva2VuUmV0cmlldmVyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogZW52aXJvbm1lbnRDb25maWcsXG4gICAgICBpbmZyYXN0cnVjdHVyZTogYXV0aGVudGlrSW5mcmFzdHJ1Y3R1cmVDb25maWcsXG4gICAgICBkZXBsb3ltZW50OiBkZXBsb3ltZW50Q29uZmlnLFxuICAgICAgdG9rZW46IHRva2VuQ29uZmlnLFxuICAgICAgYXBwbGljYXRpb246IGxkYXBBcHBsaWNhdGlvbkNvbmZpZ1xuICAgIH0pO1xuXG4gICAgLy8gTERBUFxuICAgIGNvbnN0IGxkYXAgPSBuZXcgTGRhcCh0aGlzLCAnTERBUCcsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAgaW5mcmFzdHJ1Y3R1cmU6IGxkYXBJbmZyYXN0cnVjdHVyZUNvbmZpZyxcbiAgICAgIHN0b3JhZ2U6IHN0b3JhZ2VDb25maWcsXG4gICAgICBkZXBsb3ltZW50OiBkZXBsb3ltZW50Q29uZmlnLFxuICAgICAgbmV0d29yazogbGRhcE5ldHdvcmtDb25maWcsXG4gICAgICBhcHBsaWNhdGlvbjogbGRhcEFwcGxpY2F0aW9uQ29uZmlnLFxuICAgICAgbGRhcFRva2VuOiBzZWNyZXRzTWFuYWdlci5sZGFwVG9rZW5cbiAgICB9KTtcblxuICAgIC8vIEVuc3VyZSBMREFQIHdhaXRzIGZvciB0aGUgdG9rZW4gdG8gYmUgcmV0cmlldmVkXG4gICAgbGRhcC5ub2RlLmFkZERlcGVuZGVuY3kobGRhcFRva2VuUmV0cmlldmVyKTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gRE5TIEFORCBST1VUSU5HXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gRE5TIFNFVFVQIChMREFQKVxuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBSb3V0ZTUzIExEQVAgRE5TIFJlY29yZHMgKGFmdGVyIExEQVAgY29uc3RydWN0IGlzIGNyZWF0ZWQpXG4gICAgY29uc3Qgcm91dGU1MyA9IG5ldyBSb3V0ZTUzKHRoaXMsICdSb3V0ZTUzJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogZW52aXJvbm1lbnRDb25maWcsXG4gICAgICBuZXR3b3JrOiBsZGFwTmV0d29ya0NvbmZpZyxcbiAgICAgIGxkYXBMb2FkQmFsYW5jZXI6IGxkYXAubG9hZEJhbGFuY2VyXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgZGVwZW5kZW5jeSBmb3IgTERBUCB0b2tlbiByZXRyaWV2ZXIgdG8gd2FpdCBmb3IgQXV0aGVudGlrIEROUyByZWNvcmRzXG4gICAgbGRhcFRva2VuUmV0cmlldmVyLmN1c3RvbVJlc291cmNlLm5vZGUuYWRkRGVwZW5kZW5jeShyb3V0ZTUzQXV0aGVudGlrLmF1dGhlbnRpa0FSZWNvcmQpO1xuICAgIGxkYXBUb2tlblJldHJpZXZlci5jdXN0b21SZXNvdXJjZS5ub2RlLmFkZERlcGVuZGVuY3kocm91dGU1M0F1dGhlbnRpay5hdXRoZW50aWtBQUFBUmVjb3JkKTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gU1RBQ0sgT1VUUFVUU1xuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgcmVnaXN0ZXJPdXRwdXRzKHtcbiAgICAgIHN0YWNrOiB0aGlzLFxuICAgICAgc3RhY2tOYW1lOiBzdGFja05hbWUsXG4gICAgICBkYXRhYmFzZUVuZHBvaW50OiBkYXRhYmFzZS5ob3N0bmFtZSxcbiAgICAgIGRhdGFiYXNlU2VjcmV0QXJuOiBkYXRhYmFzZS5tYXN0ZXJTZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgcmVkaXNFbmRwb2ludDogcmVkaXMuaG9zdG5hbWUsXG4gICAgICByZWRpc0F1dGhUb2tlbkFybjogcmVkaXMuYXV0aFRva2VuLnNlY3JldEFybixcbiAgICAgIGVmc0lkOiBlZnMuZmlsZVN5c3RlbS5maWxlU3lzdGVtSWQsXG4gICAgICBlZnNNZWRpYUFjY2Vzc1BvaW50SWQ6IGVmcy5tZWRpYUFjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWQsXG4gICAgICBlZnNUZW1wbGF0ZXNBY2Nlc3NQb2ludElkOiBlZnMuY3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnQuYWNjZXNzUG9pbnRJZCxcbiAgICAgIGF1dGhlbnRpa1NlY3JldEtleUFybjogc2VjcmV0c01hbmFnZXIuc2VjcmV0S2V5LnNlY3JldEFybixcbiAgICAgIGF1dGhlbnRpa0FkbWluVG9rZW5Bcm46IHNlY3JldHNNYW5hZ2VyLmFkbWluVXNlclRva2VuLnNlY3JldEFybixcbiAgICAgIGF1dGhlbnRpa0xkYXBUb2tlbkFybjogc2VjcmV0c01hbmFnZXIubGRhcFRva2VuLnNlY3JldEFybixcbiAgICAgIGF1dGhlbnRpa0FsYkRuczogYXV0aGVudGlrRUxCLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lLFxuICAgICAgYXV0aGVudGlrVXJsOiBgaHR0cHM6Ly8ke2F1dGhlbnRpa0VMQi5kbnNOYW1lfWAsXG4gICAgICBsZGFwTmxiRG5zOiBsZGFwLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lLFxuICAgICAgbGRhcEVuZHBvaW50OiBgbGRhcDovLyR7bGRhcC5kbnNOYW1lfTozODlgLFxuICAgICAgbGRhcHNFbmRwb2ludDogYGxkYXBzOi8vJHtsZGFwLmRuc05hbWV9OjYzNmAsXG4gICAgICBsZGFwVG9rZW5SZXRyaWV2ZXJMYW1iZGFBcm46IGxkYXBUb2tlblJldHJpZXZlci5sYW1iZGFGdW5jdGlvbi5mdW5jdGlvbkFyblxuICAgIH0pO1xuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT1cbiAgLy8gSEVMUEVSIE1FVEhPRFNcbiAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAvKipcbiAgICogQ3JlYXRlIHNlY3VyaXR5IGdyb3VwIGZvciBBdXRoZW50aWsgRUNTIHRhc2tzIChTZXJ2ZXIvV29ya2VyKVxuICAgKiBAcGFyYW0gdnBjIFRoZSBWUEMgdG8gY3JlYXRlIHRoZSBzZWN1cml0eSBncm91cCBpblxuICAgKiBAcGFyYW0gc3RhY2tOYW1lQ29tcG9uZW50IFRoZSBzdGFjayBuYW1lIGNvbXBvbmVudCBmb3IgaW1wb3J0c1xuICAgKiBAcmV0dXJucyBUaGUgY3JlYXRlZCBzZWN1cml0eSBncm91cFxuICAgKi9cbiAgcHJpdmF0ZSBjcmVhdGVBdXRoZW50aWtTZWN1cml0eUdyb3VwKHZwYzogZWMyLklWcGMsIHN0YWNrTmFtZUNvbXBvbmVudDogc3RyaW5nKTogZWMyLlNlY3VyaXR5R3JvdXAge1xuICAgIGNvbnN0IGF1dGhlbnRpa1NlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0F1dGhlbnRpa1NlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBBdXRoZW50aWsgRUNTIHRhc2tzIChTZXJ2ZXIvV29ya2VyKScsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBIVFRQL0hUVFBTIHRyYWZmaWMgdG8gQXV0aGVudGlrIHRhc2tzXG4gICAgYXV0aGVudGlrU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg4MCksXG4gICAgICAnQWxsb3cgSFRUUCB0cmFmZmljJ1xuICAgICk7XG5cbiAgICBhdXRoZW50aWtTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuYW55SXB2NCgpLFxuICAgICAgZWMyLlBvcnQudGNwKDQ0MyksXG4gICAgICAnQWxsb3cgSFRUUFMgdHJhZmZpYydcbiAgICApO1xuXG4gICAgLy8gQWxsb3cgQXV0aGVudGlrIGFwcGxpY2F0aW9uIHRyYWZmaWMgKHBvcnQgOTAwMCkgZnJvbSBWUEMgQ0lEUlxuICAgIGF1dGhlbnRpa1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5pcHY0KEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlZQQ19DSURSX0lQVjQpKSksXG4gICAgICBlYzIuUG9ydC50Y3AoOTAwMCksXG4gICAgICAnQWxsb3cgQXV0aGVudGlrIHRyYWZmaWMgZnJvbSBWUEMnXG4gICAgKTtcblxuICAgIHJldHVybiBhdXRoZW50aWtTZWN1cml0eUdyb3VwO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBzZWN1cml0eSBncm91cCBmb3IgTERBUCBFQ1MgdGFza3NcbiAgICogQHBhcmFtIHZwYyBUaGUgVlBDIHRvIGNyZWF0ZSB0aGUgc2VjdXJpdHkgZ3JvdXAgaW5cbiAgICogQHBhcmFtIHN0YWNrTmFtZUNvbXBvbmVudCBUaGUgc3RhY2sgbmFtZSBjb21wb25lbnQgZm9yIGltcG9ydHNcbiAgICogQHJldHVybnMgVGhlIGNyZWF0ZWQgc2VjdXJpdHkgZ3JvdXBcbiAgICovXG4gIHByaXZhdGUgY3JlYXRlTGRhcFNlY3VyaXR5R3JvdXAodnBjOiBlYzIuSVZwYywgc3RhY2tOYW1lQ29tcG9uZW50OiBzdHJpbmcpOiBlYzIuU2VjdXJpdHlHcm91cCB7XG4gICAgY29uc3QgbGRhcFNlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0xkYXBTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgTERBUCBFQ1MgdGFza3MnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogdHJ1ZVxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgTERBUCB0cmFmZmljIChwb3J0IDMzODkpIGZyb20gVlBDIENJRFJcbiAgICBsZGFwU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmlwdjQoRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuVlBDX0NJRFJfSVBWNCkpKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCgzMzg5KSxcbiAgICAgICdBbGxvdyBMREFQIHRyYWZmaWMgZnJvbSBWUEMnXG4gICAgKTtcblxuICAgIC8vIEFsbG93IExEQVBTIHRyYWZmaWMgKHBvcnQgNjYzNikgZnJvbSBWUEMgQ0lEUlxuICAgIGxkYXBTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuaXB2NChGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5WUENfQ0lEUl9JUFY0KSkpLFxuICAgICAgZWMyLlBvcnQudGNwKDY2MzYpLFxuICAgICAgJ0FsbG93IExEQVBTIHRyYWZmaWMgZnJvbSBWUEMnXG4gICAgKTtcblxuICAgIHJldHVybiBsZGFwU2VjdXJpdHlHcm91cDtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgc2VjdXJpdHkgZ3JvdXAgZm9yIEVDUyB0YXNrcyAoTGVnYWN5IC0ga2VlcGluZyBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eSlcbiAgICogQHBhcmFtIHZwYyBUaGUgVlBDIHRvIGNyZWF0ZSB0aGUgc2VjdXJpdHkgZ3JvdXAgaW5cbiAgICogQHJldHVybnMgVGhlIGNyZWF0ZWQgc2VjdXJpdHkgZ3JvdXBcbiAgICovXG4gIHByaXZhdGUgY3JlYXRlRWNzU2VjdXJpdHlHcm91cCh2cGM6IGVjMi5JVnBjKTogZWMyLlNlY3VyaXR5R3JvdXAge1xuICAgIGNvbnN0IGVjc1NlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0VDU1NlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBFQ1MgdGFza3MnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogdHJ1ZVxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgSFRUUC9IVFRQUyB0cmFmZmljIHRvIEVDUyB0YXNrc1xuICAgIGVjc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5hbnlJcHY0KCksXG4gICAgICBlYzIuUG9ydC50Y3AoODApLFxuICAgICAgJ0FsbG93IEhUVFAgdHJhZmZpYydcbiAgICApO1xuXG4gICAgZWNzU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg0NDMpLFxuICAgICAgJ0FsbG93IEhUVFBTIHRyYWZmaWMnXG4gICAgKTtcblxuICAgIGVjc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5hbnlJcHY0KCksXG4gICAgICBlYzIuUG9ydC50Y3AoOTAwMCksXG4gICAgICAnQWxsb3cgQXV0aGVudGlrIHRyYWZmaWMnXG4gICAgKTtcblxuICAgIHJldHVybiBlY3NTZWN1cml0eUdyb3VwO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBzZWN1cml0eSBncm91cCBmb3IgZGF0YWJhc2UgYWNjZXNzXG4gICAqIEBwYXJhbSB2cGMgVGhlIFZQQyB0byBjcmVhdGUgdGhlIHNlY3VyaXR5IGdyb3VwIGluXG4gICAqIEBwYXJhbSBlY3NTZWN1cml0eUdyb3VwIFRoZSBFQ1Mgc2VjdXJpdHkgZ3JvdXAgdG8gYWxsb3cgYWNjZXNzIGZyb21cbiAgICogQHJldHVybnMgVGhlIGNyZWF0ZWQgc2VjdXJpdHkgZ3JvdXBcbiAgICovXG4gIHByaXZhdGUgY3JlYXRlRGJTZWN1cml0eUdyb3VwKHZwYzogZWMyLklWcGMsIGVjc1NlY3VyaXR5R3JvdXA6IGVjMi5TZWN1cml0eUdyb3VwKTogZWMyLlNlY3VyaXR5R3JvdXAge1xuICAgIGNvbnN0IGRiU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnREJTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgZGF0YWJhc2UnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogZmFsc2VcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IFBvc3RncmVTUUwgYWNjZXNzIGZyb20gRUNTIHRhc2tzXG4gICAgZGJTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuc2VjdXJpdHlHcm91cElkKGVjc1NlY3VyaXR5R3JvdXAuc2VjdXJpdHlHcm91cElkKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg1NDMyKSxcbiAgICAgICdBbGxvdyBQb3N0Z3JlU1FMIGFjY2VzcyBmcm9tIEVDUyB0YXNrcydcbiAgICApO1xuXG4gICAgcmV0dXJuIGRiU2VjdXJpdHlHcm91cDtcbiAgfVxufVxuXG4vKipcbiAqIENvbnZlcnRzIGFuIEVDUiByZXBvc2l0b3J5IEFSTiB0byBhIHByb3BlciBFQ1IgcmVwb3NpdG9yeSBVUkkgZm9yIERvY2tlciBpbWFnZXNcbiAqIEBwYXJhbSBlY3JBcm4gLSBFQ1IgcmVwb3NpdG9yeSBBUk4gKGUuZy4sIFwiYXJuOmF3czplY3I6cmVnaW9uOmFjY291bnQ6cmVwb3NpdG9yeS9yZXBvLW5hbWVcIilcbiAqIEByZXR1cm5zIEVDUiByZXBvc2l0b3J5IFVSSSAoZS5nLiwgXCJhY2NvdW50LmRrci5lY3IucmVnaW9uLmFtYXpvbmF3cy5jb20vcmVwby1uYW1lXCIpXG4gKi9cbmZ1bmN0aW9uIGNvbnZlcnRFY3JBcm5Ub1JlcG9zaXRvcnlVcmkoZWNyQXJuOiBzdHJpbmcpOiBzdHJpbmcge1xuICAvLyBQYXJzZSBBUk46IGFybjphd3M6ZWNyOnJlZ2lvbjphY2NvdW50OnJlcG9zaXRvcnkvcmVwby1uYW1lXG4gIGNvbnN0IGFyblBhcnRzID0gZWNyQXJuLnNwbGl0KCc6Jyk7XG4gIGlmIChhcm5QYXJ0cy5sZW5ndGggIT09IDYgfHwgIWFyblBhcnRzWzVdLnN0YXJ0c1dpdGgoJ3JlcG9zaXRvcnkvJykpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgRUNSIHJlcG9zaXRvcnkgQVJOIGZvcm1hdDogJHtlY3JBcm59YCk7XG4gIH1cbiAgXG4gIGNvbnN0IHJlZ2lvbiA9IGFyblBhcnRzWzNdO1xuICBjb25zdCBhY2NvdW50ID0gYXJuUGFydHNbNF07XG4gIGNvbnN0IHJlcG9zaXRvcnlOYW1lID0gYXJuUGFydHNbNV0ucmVwbGFjZSgncmVwb3NpdG9yeS8nLCAnJyk7XG4gIFxuICByZXR1cm4gYCR7YWNjb3VudH0uZGtyLmVjci4ke3JlZ2lvbn0uYW1hem9uYXdzLmNvbS8ke3JlcG9zaXRvcnlOYW1lfWA7XG59XG4iXX0=