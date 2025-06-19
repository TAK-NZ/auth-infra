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
 * Transform context-based configuration to legacy environment config format
 * This allows us to use the new context system while maintaining compatibility with existing constructs
 */
function transformContextToEnvironmentConfig(contextConfig, isHighAvailability) {
    const removalPolicy = contextConfig.general.removalPolicy === 'RETAIN' ?
        cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;
    return {
        database: {
            instanceClass: contextConfig.database.instanceClass,
            instanceCount: contextConfig.database.instanceCount,
            backupRetentionDays: contextConfig.database.backupRetentionDays,
            deletionProtection: contextConfig.database.deleteProtection,
            enablePerformanceInsights: contextConfig.database.enablePerformanceInsights,
            enableMonitoring: contextConfig.database.monitoringInterval > 0,
        },
        redis: {
            nodeType: contextConfig.redis.nodeType,
            numCacheClusters: contextConfig.redis.numCacheNodes,
            automaticFailoverEnabled: contextConfig.redis.numCacheNodes > 1,
        },
        ecs: {
            taskCpu: contextConfig.ecs.taskCpu,
            taskMemory: contextConfig.ecs.taskMemory,
            desiredCount: contextConfig.ecs.desiredCount,
            minCapacity: 1,
            maxCapacity: isHighAvailability ? 10 : 3,
            workerDesiredCount: contextConfig.ecs.desiredCount,
            workerMinCapacity: 1,
            workerMaxCapacity: isHighAvailability ? 10 : 3,
        },
        efs: {
            throughputMode: 'bursting',
            removalPolicy: removalPolicy,
        },
        general: {
            removalPolicy: removalPolicy,
            enableDetailedLogging: contextConfig.general.enableDetailedLogging,
        },
        monitoring: {
            enableCloudWatchAlarms: isHighAvailability,
            logRetentionDays: isHighAvailability ? 30 : 7,
        },
    };
}
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
        // Transform context config to environment config for constructs
        const environmentConfig = transformContextToEnvironmentConfig(envConfig, isHighAvailability);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGgtaW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFFbkMsNkNBQXVFO0FBQ3ZFLHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLHVEQUF5QztBQUV6QyxvQkFBb0I7QUFDcEIsb0RBQWlEO0FBQ2pELDhDQUEyQztBQUMzQywwQ0FBdUM7QUFDdkMsa0VBQThEO0FBQzlELDBDQUF1QztBQUN2QyxvRUFBZ0U7QUFDaEUsb0VBQWdFO0FBQ2hFLDRDQUF5QztBQUN6Qyw0RUFBdUU7QUFDdkUsa0RBQStDO0FBQy9DLHNFQUFrRTtBQWNsRSxrQkFBa0I7QUFDbEIsdUNBQTRDO0FBQzVDLHFFQUFvRjtBQVNwRjs7O0dBR0c7QUFDSCxTQUFTLG1DQUFtQyxDQUMxQyxhQUF1QyxFQUN2QyxrQkFBMkI7SUFFM0IsTUFBTSxhQUFhLEdBQUcsYUFBYSxDQUFDLE9BQU8sQ0FBQyxhQUFhLEtBQUssUUFBUSxDQUFDLENBQUM7UUFDdEUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDO0lBRXZELE9BQU87UUFDTCxRQUFRLEVBQUU7WUFDUixhQUFhLEVBQUUsYUFBYSxDQUFDLFFBQVEsQ0FBQyxhQUFhO1lBQ25ELGFBQWEsRUFBRSxhQUFhLENBQUMsUUFBUSxDQUFDLGFBQWE7WUFDbkQsbUJBQW1CLEVBQUUsYUFBYSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUI7WUFDL0Qsa0JBQWtCLEVBQUUsYUFBYSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0I7WUFDM0QseUJBQXlCLEVBQUUsYUFBYSxDQUFDLFFBQVEsQ0FBQyx5QkFBeUI7WUFDM0UsZ0JBQWdCLEVBQUUsYUFBYSxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsR0FB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QUFJLENBQUMsZUFBZSxDQUFDLGdCQUFnQixDQUFDLGVBQWUsQ0FBQyxFQUMxRCxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFDbEIsd0NBQXdDLENBQ3pDLENBQUM7UUFFRixPQUFPLGVBQWUsQ0FBQztJQUN6QixDQUFDO0NBQ0Y7QUFuZkQsd0NBbWZDO0FBRUQ7Ozs7R0FJRztBQUNILFNBQVMsNEJBQTRCLENBQUMsTUFBYztJQUNsRCw2REFBNkQ7SUFDN0QsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNuQyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO1FBQ3BFLE1BQU0sSUFBSSxLQUFLLENBQUMsc0NBQXNDLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDbEUsQ0FBQztJQUVELE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMzQixNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDNUIsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFFOUQsT0FBTyxHQUFHLE9BQU8sWUFBWSxNQUFNLGtCQUFrQixjQUFjLEVBQUUsQ0FBQztBQUN4RSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHsgUmVtb3ZhbFBvbGljeSwgU3RhY2tQcm9wcywgRm4sIENmbk91dHB1dCB9IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIGVjcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWNzJztcbmltcG9ydCAqIGFzIGttcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mta21zJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5cbi8vIENvbnN0cnVjdCBpbXBvcnRzXG5pbXBvcnQgeyBEYXRhYmFzZSB9IGZyb20gJy4vY29uc3RydWN0cy9kYXRhYmFzZSc7XG5pbXBvcnQgeyBSZWRpcyB9IGZyb20gJy4vY29uc3RydWN0cy9yZWRpcyc7XG5pbXBvcnQgeyBFZnMgfSBmcm9tICcuL2NvbnN0cnVjdHMvZWZzJztcbmltcG9ydCB7IFNlY3JldHNNYW5hZ2VyIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL3NlY3JldHMtbWFuYWdlcic7XG5pbXBvcnQgeyBFbGIgfSBmcm9tICcuL2NvbnN0cnVjdHMvZWxiJztcbmltcG9ydCB7IEF1dGhlbnRpa1NlcnZlciB9IGZyb20gJy4vY29uc3RydWN0cy9hdXRoZW50aWstc2VydmVyJztcbmltcG9ydCB7IEF1dGhlbnRpa1dvcmtlciB9IGZyb20gJy4vY29uc3RydWN0cy9hdXRoZW50aWstd29ya2VyJztcbmltcG9ydCB7IExkYXAgfSBmcm9tICcuL2NvbnN0cnVjdHMvbGRhcCc7XG5pbXBvcnQgeyBMZGFwVG9rZW5SZXRyaWV2ZXIgfSBmcm9tICcuL2NvbnN0cnVjdHMvbGRhcC10b2tlbi1yZXRyaWV2ZXInO1xuaW1wb3J0IHsgUm91dGU1MyB9IGZyb20gJy4vY29uc3RydWN0cy9yb3V0ZTUzJztcbmltcG9ydCB7IFJvdXRlNTNBdXRoZW50aWsgfSBmcm9tICcuL2NvbnN0cnVjdHMvcm91dGU1My1hdXRoZW50aWsnO1xuXG4vLyBDb25maWd1cmF0aW9uIGltcG9ydHNcbmltcG9ydCB0eXBlIHtcbiAgSW5mcmFzdHJ1Y3R1cmVDb25maWcsXG4gIFNlY3JldHNDb25maWcsXG4gIFN0b3JhZ2VDb25maWcsXG4gIERlcGxveW1lbnRDb25maWcsXG4gIEF1dGhlbnRpa0FwcGxpY2F0aW9uQ29uZmlnLFxuICBOZXR3b3JrQ29uZmlnLFxuICBUb2tlbkNvbmZpZ1xufSBmcm9tICcuL2NvbnN0cnVjdC1jb25maWdzJztcbmltcG9ydCB7IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi9lbnZpcm9ubWVudC1jb25maWcnO1xuXG4vLyBVdGlsaXR5IGltcG9ydHNcbmltcG9ydCB7IHJlZ2lzdGVyT3V0cHV0cyB9IGZyb20gJy4vb3V0cHV0cyc7XG5pbXBvcnQgeyBjcmVhdGVCYXNlSW1wb3J0VmFsdWUsIEJBU0VfRVhQT1JUX05BTUVTIH0gZnJvbSAnLi9jbG91ZGZvcm1hdGlvbi1pbXBvcnRzJztcbmltcG9ydCB7IENvbnRleHRFbnZpcm9ubWVudENvbmZpZyB9IGZyb20gJy4vc3RhY2stY29uZmlnJztcbmltcG9ydCB7IERFRkFVTFRfVlBDX0NJRFIgfSBmcm9tICcuL3V0aWxzL2NvbnN0YW50cyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aEluZnJhU3RhY2tQcm9wcyBleHRlbmRzIFN0YWNrUHJvcHMge1xuICBlbnZpcm9ubWVudDogJ3Byb2QnIHwgJ2Rldi10ZXN0JztcbiAgZW52Q29uZmlnOiBDb250ZXh0RW52aXJvbm1lbnRDb25maWc7IC8vIEVudmlyb25tZW50IGNvbmZpZ3VyYXRpb24gZnJvbSBjb250ZXh0XG59XG5cbi8qKlxuICogVHJhbnNmb3JtIGNvbnRleHQtYmFzZWQgY29uZmlndXJhdGlvbiB0byBsZWdhY3kgZW52aXJvbm1lbnQgY29uZmlnIGZvcm1hdFxuICogVGhpcyBhbGxvd3MgdXMgdG8gdXNlIHRoZSBuZXcgY29udGV4dCBzeXN0ZW0gd2hpbGUgbWFpbnRhaW5pbmcgY29tcGF0aWJpbGl0eSB3aXRoIGV4aXN0aW5nIGNvbnN0cnVjdHNcbiAqL1xuZnVuY3Rpb24gdHJhbnNmb3JtQ29udGV4dFRvRW52aXJvbm1lbnRDb25maWcoXG4gIGNvbnRleHRDb25maWc6IENvbnRleHRFbnZpcm9ubWVudENvbmZpZyxcbiAgaXNIaWdoQXZhaWxhYmlsaXR5OiBib29sZWFuXG4pOiBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZyB7XG4gIGNvbnN0IHJlbW92YWxQb2xpY3kgPSBjb250ZXh0Q29uZmlnLmdlbmVyYWwucmVtb3ZhbFBvbGljeSA9PT0gJ1JFVEFJTicgPyBcbiAgICBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZO1xuICBcbiAgcmV0dXJuIHtcbiAgICBkYXRhYmFzZToge1xuICAgICAgaW5zdGFuY2VDbGFzczogY29udGV4dENvbmZpZy5kYXRhYmFzZS5pbnN0YW5jZUNsYXNzLFxuICAgICAgaW5zdGFuY2VDb3VudDogY29udGV4dENvbmZpZy5kYXRhYmFzZS5pbnN0YW5jZUNvdW50LFxuICAgICAgYmFja3VwUmV0ZW50aW9uRGF5czogY29udGV4dENvbmZpZy5kYXRhYmFzZS5iYWNrdXBSZXRlbnRpb25EYXlzLFxuICAgICAgZGVsZXRpb25Qcm90ZWN0aW9uOiBjb250ZXh0Q29uZmlnLmRhdGFiYXNlLmRlbGV0ZVByb3RlY3Rpb24sXG4gICAgICBlbmFibGVQZXJmb3JtYW5jZUluc2lnaHRzOiBjb250ZXh0Q29uZmlnLmRhdGFiYXNlLmVuYWJsZVBlcmZvcm1hbmNlSW5zaWdodHMsXG4gICAgICBlbmFibGVNb25pdG9yaW5nOiBjb250ZXh0Q29uZmlnLmRhdGFiYXNlLm1vbml0b3JpbmdJbnRlcnZhbCA+IDAsXG4gICAgfSxcbiAgICByZWRpczoge1xuICAgICAgbm9kZVR5cGU6IGNvbnRleHRDb25maWcucmVkaXMubm9kZVR5cGUsXG4gICAgICBudW1DYWNoZUNsdXN0ZXJzOiBjb250ZXh0Q29uZmlnLnJlZGlzLm51bUNhY2hlTm9kZXMsXG4gICAgICBhdXRvbWF0aWNGYWlsb3ZlckVuYWJsZWQ6IGNvbnRleHRDb25maWcucmVkaXMubnVtQ2FjaGVOb2RlcyA+IDEsXG4gICAgfSxcbiAgICBlY3M6IHtcbiAgICAgIHRhc2tDcHU6IGNvbnRleHRDb25maWcuZWNzLnRhc2tDcHUsXG4gICAgICB0YXNrTWVtb3J5OiBjb250ZXh0Q29uZmlnLmVjcy50YXNrTWVtb3J5LFxuICAgICAgZGVzaXJlZENvdW50OiBjb250ZXh0Q29uZmlnLmVjcy5kZXNpcmVkQ291bnQsXG4gICAgICBtaW5DYXBhY2l0eTogMSxcbiAgICAgIG1heENhcGFjaXR5OiBpc0hpZ2hBdmFpbGFiaWxpdHkgPyAxMCA6IDMsXG4gICAgICB3b3JrZXJEZXNpcmVkQ291bnQ6IGNvbnRleHRDb25maWcuZWNzLmRlc2lyZWRDb3VudCxcbiAgICAgIHdvcmtlck1pbkNhcGFjaXR5OiAxLFxuICAgICAgd29ya2VyTWF4Q2FwYWNpdHk6IGlzSGlnaEF2YWlsYWJpbGl0eSA/IDEwIDogMyxcbiAgICB9LFxuICAgIGVmczoge1xuICAgICAgdGhyb3VnaHB1dE1vZGU6ICdidXJzdGluZycgYXMgY29uc3QsXG4gICAgICByZW1vdmFsUG9saWN5OiByZW1vdmFsUG9saWN5LFxuICAgIH0sXG4gICAgZ2VuZXJhbDoge1xuICAgICAgcmVtb3ZhbFBvbGljeTogcmVtb3ZhbFBvbGljeSxcbiAgICAgIGVuYWJsZURldGFpbGVkTG9nZ2luZzogY29udGV4dENvbmZpZy5nZW5lcmFsLmVuYWJsZURldGFpbGVkTG9nZ2luZyxcbiAgICB9LFxuICAgIG1vbml0b3Jpbmc6IHtcbiAgICAgIGVuYWJsZUNsb3VkV2F0Y2hBbGFybXM6IGlzSGlnaEF2YWlsYWJpbGl0eSxcbiAgICAgIGxvZ1JldGVudGlvbkRheXM6IGlzSGlnaEF2YWlsYWJpbGl0eSA/IDMwIDogNyxcbiAgICB9LFxuICB9O1xufVxuXG4vKipcbiAqIE1haW4gQ0RLIHN0YWNrIGZvciB0aGUgVEFLIEF1dGggSW5mcmFzdHJ1Y3R1cmVcbiAqL1xuZXhwb3J0IGNsYXNzIEF1dGhJbmZyYVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEF1dGhJbmZyYVN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHtcbiAgICAgIC4uLnByb3BzLFxuICAgICAgZGVzY3JpcHRpb246ICdUQUsgQXV0aGVudGljYXRpb24gTGF5ZXIgLSBBdXRoZW50aWssIExEQVAgT3V0cG9zdCcsXG4gICAgfSk7XG5cbiAgICAvLyBVc2UgZW52aXJvbm1lbnQgY29uZmlndXJhdGlvbiBkaXJlY3RseSAobm8gY29tcGxleCB0cmFuc2Zvcm1hdGlvbnMgbmVlZGVkKVxuICAgIGNvbnN0IHsgZW52Q29uZmlnIH0gPSBwcm9wcztcbiAgICBcbiAgICAvLyBFeHRyYWN0IGNvbmZpZ3VyYXRpb24gdmFsdWVzIGRpcmVjdGx5IGZyb20gZW52Q29uZmlnXG4gICAgY29uc3Qgc3RhY2tOYW1lQ29tcG9uZW50ID0gZW52Q29uZmlnLnN0YWNrTmFtZTsgLy8gVGhpcyBpcyB0aGUgU1RBQ0tfTkFNRSBwYXJ0IChlLmcuLCBcIkRldlRlc3RcIilcbiAgICBcbiAgICAvLyBJbXBvcnQgdmFsdWVzIGZyb20gQmFzZUluZnJhIHN0YWNrIGV4cG9ydHMgaW5zdGVhZCBvZiB1c2luZyBjb25maWcgcGFyYW1ldGVyc1xuICAgIGNvbnN0IHZwY0NpZHIgPSBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5WUENfQ0lEUl9JUFY0KSk7XG4gICAgY29uc3QgcjUzWm9uZU5hbWUgPSBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5IT1NURURfWk9ORV9OQU1FKSk7XG4gICAgXG4gICAgY29uc3QgaXNIaWdoQXZhaWxhYmlsaXR5ID0gcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJztcbiAgICBjb25zdCBlbnZpcm9ubWVudExhYmVsID0gcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/ICdQcm9kJyA6ICdEZXYtVGVzdCc7XG4gICAgY29uc3QgcmVzb2x2ZWRTdGFja05hbWUgPSBpZDtcbiAgICBcbiAgICAvLyBVc2UgY29tcHV0ZWQgdmFsdWVzIGZyb20gY29uZmlndXJhdGlvblxuICAgIGNvbnN0IGVuYWJsZUhpZ2hBdmFpbGFiaWxpdHkgPSBpc0hpZ2hBdmFpbGFiaWxpdHk7XG4gICAgY29uc3QgZW5hYmxlRGV0YWlsZWRNb25pdG9yaW5nID0gZW52Q29uZmlnLmdlbmVyYWwuZW5hYmxlRGV0YWlsZWRMb2dnaW5nO1xuXG4gICAgLy8gQWRkIEVudmlyb25tZW50IFR5cGUgdGFnIHRvIHRoZSBzdGFja1xuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnRW52aXJvbm1lbnQgVHlwZScsIGVudmlyb25tZW50TGFiZWwpO1xuXG4gICAgLy8gVHJhbnNmb3JtIGNvbnRleHQgY29uZmlnIHRvIGVudmlyb25tZW50IGNvbmZpZyBmb3IgY29uc3RydWN0c1xuICAgIGNvbnN0IGVudmlyb25tZW50Q29uZmlnID0gdHJhbnNmb3JtQ29udGV4dFRvRW52aXJvbm1lbnRDb25maWcoZW52Q29uZmlnLCBpc0hpZ2hBdmFpbGFiaWxpdHkpO1xuXG4gICAgY29uc3Qgc3RhY2tOYW1lID0gRm4ucmVmKCdBV1M6OlN0YWNrTmFtZScpO1xuICAgIGNvbnN0IHJlZ2lvbiA9IGNkay5TdGFjay5vZih0aGlzKS5yZWdpb247XG5cbiAgICAvLyBDb25maWd1cmF0aW9uLWJhc2VkIHBhcmFtZXRlciByZXNvbHV0aW9uXG4gICAgY29uc3QgYXV0aGVudGlrQWRtaW5Vc2VyRW1haWwgPSBlbnZDb25maWcuYXV0aGVudGlrLmFkbWluVXNlckVtYWlsO1xuICAgIGNvbnN0IGxkYXBCYXNlRG4gPSBgZGM9JHtyNTNab25lTmFtZS5zcGxpdCgnLicpLmpvaW4oJyxkYz0nKX1gO1xuICAgIGNvbnN0IGhvc3RuYW1lQXV0aGVudGlrID0gZW52Q29uZmlnLmF1dGhlbnRpay5kb21haW4uc3BsaXQoJy4nKVswXTsgLy8gRXh0cmFjdCBzdWJkb21haW5cbiAgICBjb25zdCBob3N0bmFtZUxkYXAgPSBlbnZDb25maWcubGRhcC5kb21haW4uc3BsaXQoJy4nKVswXTsgLy8gRXh0cmFjdCBzdWJkb21haW5cbiAgICBjb25zdCBnaXRTaGEgPSAnbGF0ZXN0JzsgLy8gVXNlIGZpeGVkIHRhZyBmb3IgY29udGV4dC1kcml2ZW4gYXBwcm9hY2hcbiAgICBjb25zdCBlbmFibGVFeGVjdXRlID0gZmFsc2U7IC8vIERpc2FibGUgYnkgZGVmYXVsdCBmb3Igc2VjdXJpdHlcbiAgICBjb25zdCB1c2VBdXRoZW50aWtDb25maWdGaWxlID0gZmFsc2U7IC8vIFVzZSBlbnZpcm9ubWVudCB2YXJpYWJsZXNcblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gSU1QT1JUIEJBU0UgSU5GUkFTVFJVQ1RVUkUgUkVTT1VSQ0VTXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIEltcG9ydCBWUEMgYW5kIG5ldHdvcmtpbmcgZnJvbSBiYXNlIGluZnJhc3RydWN0dXJlXG4gICAgLy8gTm90ZTogQmFzZSBpbmZyYXN0cnVjdHVyZSBwcm92aWRlcyAyIHN1Ym5ldHMgKEEgYW5kIEIpLCBzbyB3ZSBsaW1pdCB0byAyIEFac1xuICAgIGNvbnN0IHZwY0F2YWlsYWJpbGl0eVpvbmVzID0gdGhpcy5hdmFpbGFiaWxpdHlab25lcy5zbGljZSgwLCAyKTtcbiAgICBcbiAgICBjb25zdCB2cGMgPSBlYzIuVnBjLmZyb21WcGNBdHRyaWJ1dGVzKHRoaXMsICdWUEMnLCB7XG4gICAgICB2cGNJZDogRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuVlBDX0lEKSksXG4gICAgICBhdmFpbGFiaWxpdHlab25lczogdnBjQXZhaWxhYmlsaXR5Wm9uZXMsXG4gICAgICAvLyBJbXBvcnQgc3VibmV0IElEcyBmcm9tIGJhc2UgaW5mcmFzdHJ1Y3R1cmVcbiAgICAgIHB1YmxpY1N1Ym5ldElkczogW1xuICAgICAgICBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5TVUJORVRfUFVCTElDX0EpKSxcbiAgICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuU1VCTkVUX1BVQkxJQ19CKSlcbiAgICAgIF0sXG4gICAgICBwcml2YXRlU3VibmV0SWRzOiBbXG4gICAgICAgIEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlNVQk5FVF9QUklWQVRFX0EpKSxcbiAgICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuU1VCTkVUX1BSSVZBVEVfQikpXG4gICAgICBdLFxuICAgICAgdnBjQ2lkckJsb2NrOiBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5WUENfQ0lEUl9JUFY0KSlcbiAgICB9KTtcblxuICAgIC8vIEtNU1xuICAgIGNvbnN0IGttc0tleSA9IGttcy5LZXkuZnJvbUtleUFybih0aGlzLCAnS01TS2V5JywgXG4gICAgICBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5LTVNfS0VZKSlcbiAgICApO1xuXG4gICAgLy8gRUNTXG4gICAgY29uc3QgZWNzQ2x1c3RlckFybiA9IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLkVDU19DTFVTVEVSKSk7XG4gICAgLy8gRXh0cmFjdCBjbHVzdGVyIG5hbWUgZnJvbSBBUk46IGFybjphd3M6ZWNzOnJlZ2lvbjphY2NvdW50OmNsdXN0ZXIvY2x1c3Rlci1uYW1lXG4gICAgY29uc3QgZWNzQ2x1c3Rlck5hbWUgPSBGbi5zZWxlY3QoMSwgRm4uc3BsaXQoJy8nLCBlY3NDbHVzdGVyQXJuKSk7XG4gICAgY29uc3QgZWNzQ2x1c3RlciA9IGVjcy5DbHVzdGVyLmZyb21DbHVzdGVyQXR0cmlidXRlcyh0aGlzLCAnRUNTQ2x1c3RlcicsIHtcbiAgICAgIGNsdXN0ZXJBcm46IGVjc0NsdXN0ZXJBcm4sXG4gICAgICBjbHVzdGVyTmFtZTogZWNzQ2x1c3Rlck5hbWUsXG4gICAgICB2cGM6IHZwY1xuICAgIH0pO1xuXG4gICAgLy8gUzNcbiAgICBjb25zdCBzM0NvbmZCdWNrZXQgPSBzMy5CdWNrZXQuZnJvbUJ1Y2tldEFybih0aGlzLCAnUzNDb25mQnVja2V0JyxcbiAgICAgIEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlMzX0JVQ0tFVCkpXG4gICAgKTtcblxuICAgIC8vIEVDUlxuICAgIGNvbnN0IGVjclJlcG9zaXRvcnkgPSBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5FQ1JfUkVQTykpO1xuXG4gICAgLy8gUm91dGU1M1xuICAgIGNvbnN0IGhvc3RlZFpvbmVJZCA9IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLkhPU1RFRF9aT05FX0lEKSk7XG4gICAgY29uc3QgaG9zdGVkWm9uZU5hbWUgPSBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5IT1NURURfWk9ORV9OQU1FKSk7XG5cbiAgICAvLyBTU0wgQ2VydGlmaWNhdGVcbiAgICBjb25zdCBzc2xDZXJ0aWZpY2F0ZUFybiA9IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLkNFUlRJRklDQVRFX0FSTikpO1xuXG4gICAgLy8gUzMgRW52aXJvbm1lbnQgRmlsZSBwYXRocyAtIGFzc3VtZXMgYXV0aGVudGlrLWNvbmZpZy5lbnYgYWxyZWFkeSBleGlzdHMgaW4gUzNcbiAgICBjb25zdCBlbnZGaWxlUzNLZXkgPSBgYXV0aGVudGlrLWNvbmZpZy5lbnZgO1xuICAgIGNvbnN0IGVudkZpbGVTM1VyaSA9IGBhcm46YXdzOnMzOjo6JHtzM0NvbmZCdWNrZXQuYnVja2V0TmFtZX0vJHtlbnZGaWxlUzNLZXl9YDtcblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gU0VDVVJJVFkgR1JPVVBTXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIFNlY3VyaXR5IEdyb3Vwc1xuICAgIGNvbnN0IGF1dGhlbnRpa1NlY3VyaXR5R3JvdXAgPSB0aGlzLmNyZWF0ZUF1dGhlbnRpa1NlY3VyaXR5R3JvdXAodnBjLCBzdGFja05hbWVDb21wb25lbnQpO1xuICAgIGNvbnN0IGxkYXBTZWN1cml0eUdyb3VwID0gdGhpcy5jcmVhdGVMZGFwU2VjdXJpdHlHcm91cCh2cGMsIHN0YWNrTmFtZUNvbXBvbmVudCk7XG4gICAgY29uc3QgZGJTZWN1cml0eUdyb3VwID0gdGhpcy5jcmVhdGVEYlNlY3VyaXR5R3JvdXAodnBjLCBhdXRoZW50aWtTZWN1cml0eUdyb3VwKTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gQlVJTEQgQ09ORklHVVJBVElPTiBPQkpFQ1RTXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIEJ1aWxkIHNoYXJlZCBpbmZyYXN0cnVjdHVyZSBjb25maWcgZm9yIEF1dGhlbnRpayBzZXJ2aWNlc1xuICAgIGNvbnN0IGF1dGhlbnRpa0luZnJhc3RydWN0dXJlQ29uZmlnOiBJbmZyYXN0cnVjdHVyZUNvbmZpZyA9IHtcbiAgICAgIHZwYyxcbiAgICAgIGVjc1NlY3VyaXR5R3JvdXA6IGF1dGhlbnRpa1NlY3VyaXR5R3JvdXAsXG4gICAgICBlY3NDbHVzdGVyLFxuICAgICAga21zS2V5XG4gICAgfTtcblxuICAgIC8vIEJ1aWxkIHNoYXJlZCBpbmZyYXN0cnVjdHVyZSBjb25maWcgZm9yIExEQVAgc2VydmljZXNcbiAgICBjb25zdCBsZGFwSW5mcmFzdHJ1Y3R1cmVDb25maWc6IEluZnJhc3RydWN0dXJlQ29uZmlnID0ge1xuICAgICAgdnBjLFxuICAgICAgZWNzU2VjdXJpdHlHcm91cDogbGRhcFNlY3VyaXR5R3JvdXAsXG4gICAgICBlY3NDbHVzdGVyLFxuICAgICAga21zS2V5XG4gICAgfTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gQ09SRSBJTkZSQVNUUlVDVFVSRVxuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBTZWNyZXRzTWFuYWdlclxuICAgIGNvbnN0IHNlY3JldHNNYW5hZ2VyID0gbmV3IFNlY3JldHNNYW5hZ2VyKHRoaXMsICdTZWNyZXRzTWFuYWdlcicsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBzdGFja05hbWU6IHJlc29sdmVkU3RhY2tOYW1lLFxuICAgICAgaW5mcmFzdHJ1Y3R1cmU6IGF1dGhlbnRpa0luZnJhc3RydWN0dXJlQ29uZmlnXG4gICAgfSk7XG5cbiAgICAvLyBEYXRhYmFzZVxuICAgIGNvbnN0IGRhdGFiYXNlID0gbmV3IERhdGFiYXNlKHRoaXMsICdEYXRhYmFzZScsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBzdGFja05hbWU6IHJlc29sdmVkU3RhY2tOYW1lLFxuICAgICAgY29uZmlnOiBlbnZpcm9ubWVudENvbmZpZyxcbiAgICAgIGluZnJhc3RydWN0dXJlOiBhdXRoZW50aWtJbmZyYXN0cnVjdHVyZUNvbmZpZyxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbZGJTZWN1cml0eUdyb3VwXVxuICAgIH0pO1xuXG4gICAgLy8gUmVkaXNcbiAgICBjb25zdCByZWRpcyA9IG5ldyBSZWRpcyh0aGlzLCAnUmVkaXMnLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgc3RhY2tOYW1lOiByZXNvbHZlZFN0YWNrTmFtZSxcbiAgICAgIGNvbmZpZzogZW52aXJvbm1lbnRDb25maWcsXG4gICAgICBpbmZyYXN0cnVjdHVyZTogYXV0aGVudGlrSW5mcmFzdHJ1Y3R1cmVDb25maWcsXG4gICAgICBzZWN1cml0eUdyb3VwczogW2F1dGhlbnRpa1NlY3VyaXR5R3JvdXBdXG4gICAgfSk7XG5cbiAgICAvLyBFRlNcbiAgICBjb25zdCBlZnMgPSBuZXcgRWZzKHRoaXMsICdFRlMnLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBlbnZpcm9ubWVudENvbmZpZyxcbiAgICAgIGluZnJhc3RydWN0dXJlOiBhdXRoZW50aWtJbmZyYXN0cnVjdHVyZUNvbmZpZyxcbiAgICAgIHZwY0NpZHJCbG9jazogRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuVlBDX0NJRFJfSVBWNCkpLFxuICAgICAgYWxsb3dBY2Nlc3NGcm9tOiBbYXV0aGVudGlrU2VjdXJpdHlHcm91cF1cbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gQlVJTEQgQ09ORklHVVJBVElPTiBPQkpFQ1RTXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIEJ1aWxkIHNoYXJlZCBjb25maWcgb2JqZWN0c1xuICAgIGNvbnN0IHNlY3JldHNDb25maWc6IFNlY3JldHNDb25maWcgPSB7XG4gICAgICBkYXRhYmFzZTogZGF0YWJhc2UubWFzdGVyU2VjcmV0LFxuICAgICAgcmVkaXNBdXRoVG9rZW46IHJlZGlzLmF1dGhUb2tlbixcbiAgICAgIGF1dGhlbnRpazoge1xuICAgICAgICBzZWNyZXRLZXk6IHNlY3JldHNNYW5hZ2VyLnNlY3JldEtleSxcbiAgICAgICAgYWRtaW5Vc2VyUGFzc3dvcmQ6IHNlY3JldHNNYW5hZ2VyLmFkbWluVXNlclBhc3N3b3JkLFxuICAgICAgICBhZG1pblVzZXJUb2tlbjogc2VjcmV0c01hbmFnZXIuYWRtaW5Vc2VyVG9rZW4sXG4gICAgICAgIGxkYXBUb2tlbjogc2VjcmV0c01hbmFnZXIubGRhcFRva2VuLFxuICAgICAgICBsZGFwU2VydmljZVVzZXI6IHNlY3JldHNNYW5hZ2VyLmxkYXBTZXJ2aWNlVXNlclxuICAgICAgfVxuICAgIH07XG5cbiAgICBjb25zdCBzdG9yYWdlQ29uZmlnOiBTdG9yYWdlQ29uZmlnID0ge1xuICAgICAgczM6IHtcbiAgICAgICAgY29uZmlnQnVja2V0OiBzM0NvbmZCdWNrZXQsXG4gICAgICAgIGVudkZpbGVVcmk6IGVudkZpbGVTM1VyaSxcbiAgICAgICAgZW52RmlsZUtleTogZW52RmlsZVMzS2V5XG4gICAgICB9LFxuICAgICAgZWZzOiB7XG4gICAgICAgIGZpbGVTeXN0ZW1JZDogZWZzLmZpbGVTeXN0ZW0uZmlsZVN5c3RlbUlkLFxuICAgICAgICBtZWRpYUFjY2Vzc1BvaW50SWQ6IGVmcy5tZWRpYUFjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWQsXG4gICAgICAgIGN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50SWQ6IGVmcy5jdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkXG4gICAgICB9XG4gICAgfTtcblxuICAgIGNvbnN0IGRlcGxveW1lbnRDb25maWc6IERlcGxveW1lbnRDb25maWcgPSB7XG4gICAgICBnaXRTaGE6IGdpdFNoYSxcbiAgICAgIGVjclJlcG9zaXRvcnlBcm46IGVjclJlcG9zaXRvcnksXG4gICAgICBlbmFibGVFeGVjdXRlOiBlbmFibGVFeGVjdXRlLFxuICAgICAgdXNlQ29uZmlnRmlsZTogdXNlQXV0aGVudGlrQ29uZmlnRmlsZVxuICAgIH07XG5cbiAgICBjb25zdCBhcHBsaWNhdGlvbkNvbmZpZzogQXV0aGVudGlrQXBwbGljYXRpb25Db25maWcgPSB7XG4gICAgICBhZG1pblVzZXJFbWFpbDogYXV0aGVudGlrQWRtaW5Vc2VyRW1haWwsXG4gICAgICBsZGFwQmFzZURuOiBsZGFwQmFzZURuLFxuICAgICAgZGF0YWJhc2U6IHtcbiAgICAgICAgaG9zdG5hbWU6IGRhdGFiYXNlLmhvc3RuYW1lXG4gICAgICB9LFxuICAgICAgcmVkaXM6IHtcbiAgICAgICAgaG9zdG5hbWU6IHJlZGlzLmhvc3RuYW1lXG4gICAgICB9LFxuICAgICAgYXV0aGVudGlrSG9zdDogYGh0dHBzOi8vJHtob3N0bmFtZUF1dGhlbnRpa30uJHtob3N0ZWRab25lTmFtZX1gXG4gICAgfTtcblxuICAgIC8vIEJ1aWxkIG5ldHdvcmsgY29uZmlnIGZvciBETlMgYW5kIGxvYWQgYmFsYW5jZXJzXG4gICAgY29uc3QgYXV0aGVudGlrTmV0d29ya0NvbmZpZzogTmV0d29ya0NvbmZpZyA9IHtcbiAgICAgIGhvc3RlZFpvbmVJZDogaG9zdGVkWm9uZUlkLFxuICAgICAgaG9zdGVkWm9uZU5hbWU6IGhvc3RlZFpvbmVOYW1lLFxuICAgICAgc3NsQ2VydGlmaWNhdGVBcm46IHNzbENlcnRpZmljYXRlQXJuLFxuICAgICAgaG9zdG5hbWU6IGhvc3RuYW1lQXV0aGVudGlrXG4gICAgfTtcblxuICAgIGNvbnN0IGxkYXBOZXR3b3JrQ29uZmlnOiBOZXR3b3JrQ29uZmlnID0ge1xuICAgICAgaG9zdGVkWm9uZUlkOiBob3N0ZWRab25lSWQsXG4gICAgICBob3N0ZWRab25lTmFtZTogaG9zdGVkWm9uZU5hbWUsXG4gICAgICBzc2xDZXJ0aWZpY2F0ZUFybjogc3NsQ2VydGlmaWNhdGVBcm4sXG4gICAgICBob3N0bmFtZTogaG9zdG5hbWVMZGFwXG4gICAgfTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gQVBQTElDQVRJT04gU0VSVklDRVNcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gQXV0aGVudGlrIExvYWQgQmFsYW5jZXJcbiAgICBjb25zdCBhdXRoZW50aWtFTEIgPSBuZXcgRWxiKHRoaXMsICdBdXRoZW50aWtFTEInLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBlbnZpcm9ubWVudENvbmZpZyxcbiAgICAgIGluZnJhc3RydWN0dXJlOiBhdXRoZW50aWtJbmZyYXN0cnVjdHVyZUNvbmZpZyxcbiAgICAgIG5ldHdvcms6IGF1dGhlbnRpa05ldHdvcmtDb25maWdcbiAgICB9KTtcblxuICAgIC8vIEF1dGhlbnRpayBTZXJ2ZXJcbiAgICBjb25zdCBhdXRoZW50aWtTZXJ2ZXIgPSBuZXcgQXV0aGVudGlrU2VydmVyKHRoaXMsICdBdXRoZW50aWtTZXJ2ZXInLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBlbnZpcm9ubWVudENvbmZpZyxcbiAgICAgIGluZnJhc3RydWN0dXJlOiBhdXRoZW50aWtJbmZyYXN0cnVjdHVyZUNvbmZpZyxcbiAgICAgIHNlY3JldHM6IHNlY3JldHNDb25maWcsXG4gICAgICBzdG9yYWdlOiBzdG9yYWdlQ29uZmlnLFxuICAgICAgZGVwbG95bWVudDogZGVwbG95bWVudENvbmZpZyxcbiAgICAgIGFwcGxpY2F0aW9uOiBhcHBsaWNhdGlvbkNvbmZpZ1xuICAgIH0pO1xuXG4gICAgLy8gQXV0aGVudGlrIFdvcmtlciAgXG4gICAgLy8gVXBkYXRlIGF1dGhlbnRpY2F0aW9uIGhvc3QgZm9yIHdvcmtlciBhZnRlciBSb3V0ZTUzIHNldHVwXG4gICAgY29uc3QgYXV0aGVudGlrV29ya2VyQ29uZmlnID0geyAuLi5hcHBsaWNhdGlvbkNvbmZpZyB9O1xuICAgIGNvbnN0IGF1dGhlbnRpa1dvcmtlciA9IG5ldyBBdXRoZW50aWtXb3JrZXIodGhpcywgJ0F1dGhlbnRpa1dvcmtlcicsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAgaW5mcmFzdHJ1Y3R1cmU6IGF1dGhlbnRpa0luZnJhc3RydWN0dXJlQ29uZmlnLFxuICAgICAgc2VjcmV0czogc2VjcmV0c0NvbmZpZyxcbiAgICAgIHN0b3JhZ2U6IHN0b3JhZ2VDb25maWcsXG4gICAgICBkZXBsb3ltZW50OiBkZXBsb3ltZW50Q29uZmlnLFxuICAgICAgYXBwbGljYXRpb246IGF1dGhlbnRpa1dvcmtlckNvbmZpZ1xuICAgIH0pO1xuXG4gICAgLy8gQ29ubmVjdCBBdXRoZW50aWsgU2VydmVyIHRvIExvYWQgQmFsYW5jZXJcbiAgICBhdXRoZW50aWtTZXJ2ZXIuY3JlYXRlVGFyZ2V0R3JvdXAodnBjLCBhdXRoZW50aWtFTEIuaHR0cHNMaXN0ZW5lcik7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIEROUyBTRVRVUCAoQVVUSEVOVElLKVxuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBSb3V0ZTUzIEF1dGhlbnRpayBETlMgUmVjb3JkcyAobmVlZGVkIGJlZm9yZSBMREFQIHRva2VuIHJldHJpZXZlcilcbiAgICBjb25zdCByb3V0ZTUzQXV0aGVudGlrID0gbmV3IFJvdXRlNTNBdXRoZW50aWsodGhpcywgJ1JvdXRlNTNBdXRoZW50aWsnLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBlbnZpcm9ubWVudENvbmZpZyxcbiAgICAgIG5ldHdvcms6IGF1dGhlbnRpa05ldHdvcmtDb25maWcsXG4gICAgICBhdXRoZW50aWtMb2FkQmFsYW5jZXI6IGF1dGhlbnRpa0VMQi5sb2FkQmFsYW5jZXJcbiAgICB9KTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gTERBUCBDT05GSUdVUkFUSU9OXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIEJ1aWxkIHRva2VuIGNvbmZpZyBmb3IgTERBUCB0b2tlbiByZXRyaWV2YWxcbiAgICBjb25zdCB0b2tlbkNvbmZpZzogVG9rZW5Db25maWcgPSB7XG4gICAgICBvdXRwb3N0TmFtZTogJ0xEQVAnLFxuICAgICAgYWRtaW5Ub2tlblNlY3JldDogc2VjcmV0c01hbmFnZXIuYWRtaW5Vc2VyVG9rZW4sXG4gICAgICBsZGFwVG9rZW5TZWNyZXQ6IHNlY3JldHNNYW5hZ2VyLmxkYXBUb2tlbixcbiAgICAgIGF1dGhlbnRpa1NlcnZlclNlcnZpY2U6IGF1dGhlbnRpa1NlcnZlci5lY3NTZXJ2aWNlLFxuICAgICAgYXV0aGVudGlrV29ya2VyU2VydmljZTogYXV0aGVudGlrV29ya2VyLmVjc1NlcnZpY2VcbiAgICB9O1xuXG4gICAgLy8gVXBkYXRlIGFwcGxpY2F0aW9uIGNvbmZpZyB3aXRoIHByb3BlciBBdXRoZW50aWsgVVJMXG4gICAgY29uc3QgbGRhcEFwcGxpY2F0aW9uQ29uZmlnOiBBdXRoZW50aWtBcHBsaWNhdGlvbkNvbmZpZyA9IHtcbiAgICAgIC4uLmFwcGxpY2F0aW9uQ29uZmlnLFxuICAgICAgYXV0aGVudGlrSG9zdDogcm91dGU1M0F1dGhlbnRpay5nZXRBdXRoZW50aWtVcmwoKVxuICAgIH07XG5cbiAgICAvLyBMREFQIFRva2VuIFJldHJpZXZlclxuICAgIGNvbnN0IGxkYXBUb2tlblJldHJpZXZlciA9IG5ldyBMZGFwVG9rZW5SZXRyaWV2ZXIodGhpcywgJ0xkYXBUb2tlblJldHJpZXZlcicsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAgaW5mcmFzdHJ1Y3R1cmU6IGF1dGhlbnRpa0luZnJhc3RydWN0dXJlQ29uZmlnLFxuICAgICAgZGVwbG95bWVudDogZGVwbG95bWVudENvbmZpZyxcbiAgICAgIHRva2VuOiB0b2tlbkNvbmZpZyxcbiAgICAgIGFwcGxpY2F0aW9uOiBsZGFwQXBwbGljYXRpb25Db25maWdcbiAgICB9KTtcblxuICAgIC8vIExEQVBcbiAgICBjb25zdCBsZGFwID0gbmV3IExkYXAodGhpcywgJ0xEQVAnLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnOiBlbnZpcm9ubWVudENvbmZpZyxcbiAgICAgIGluZnJhc3RydWN0dXJlOiBsZGFwSW5mcmFzdHJ1Y3R1cmVDb25maWcsXG4gICAgICBzdG9yYWdlOiBzdG9yYWdlQ29uZmlnLFxuICAgICAgZGVwbG95bWVudDogZGVwbG95bWVudENvbmZpZyxcbiAgICAgIG5ldHdvcms6IGxkYXBOZXR3b3JrQ29uZmlnLFxuICAgICAgYXBwbGljYXRpb246IGxkYXBBcHBsaWNhdGlvbkNvbmZpZyxcbiAgICAgIGxkYXBUb2tlbjogc2VjcmV0c01hbmFnZXIubGRhcFRva2VuXG4gICAgfSk7XG5cbiAgICAvLyBFbnN1cmUgTERBUCB3YWl0cyBmb3IgdGhlIHRva2VuIHRvIGJlIHJldHJpZXZlZFxuICAgIGxkYXAubm9kZS5hZGREZXBlbmRlbmN5KGxkYXBUb2tlblJldHJpZXZlcik7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIEROUyBBTkQgUk9VVElOR1xuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIEROUyBTRVRVUCAoTERBUClcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gUm91dGU1MyBMREFQIEROUyBSZWNvcmRzIChhZnRlciBMREFQIGNvbnN0cnVjdCBpcyBjcmVhdGVkKVxuICAgIGNvbnN0IHJvdXRlNTMgPSBuZXcgUm91dGU1Myh0aGlzLCAnUm91dGU1MycsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAgbmV0d29yazogbGRhcE5ldHdvcmtDb25maWcsXG4gICAgICBsZGFwTG9hZEJhbGFuY2VyOiBsZGFwLmxvYWRCYWxhbmNlclxuICAgIH0pO1xuXG4gICAgLy8gQWRkIGRlcGVuZGVuY3kgZm9yIExEQVAgdG9rZW4gcmV0cmlldmVyIHRvIHdhaXQgZm9yIEF1dGhlbnRpayBETlMgcmVjb3Jkc1xuICAgIGxkYXBUb2tlblJldHJpZXZlci5jdXN0b21SZXNvdXJjZS5ub2RlLmFkZERlcGVuZGVuY3kocm91dGU1M0F1dGhlbnRpay5hdXRoZW50aWtBUmVjb3JkKTtcbiAgICBsZGFwVG9rZW5SZXRyaWV2ZXIuY3VzdG9tUmVzb3VyY2Uubm9kZS5hZGREZXBlbmRlbmN5KHJvdXRlNTNBdXRoZW50aWsuYXV0aGVudGlrQUFBQVJlY29yZCk7XG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuICAgIC8vIFNUQUNLIE9VVFBVVFNcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gT3V0cHV0c1xuICAgIHJlZ2lzdGVyT3V0cHV0cyh7XG4gICAgICBzdGFjazogdGhpcyxcbiAgICAgIHN0YWNrTmFtZTogc3RhY2tOYW1lLFxuICAgICAgZGF0YWJhc2VFbmRwb2ludDogZGF0YWJhc2UuaG9zdG5hbWUsXG4gICAgICBkYXRhYmFzZVNlY3JldEFybjogZGF0YWJhc2UubWFzdGVyU2VjcmV0LnNlY3JldEFybixcbiAgICAgIHJlZGlzRW5kcG9pbnQ6IHJlZGlzLmhvc3RuYW1lLFxuICAgICAgcmVkaXNBdXRoVG9rZW5Bcm46IHJlZGlzLmF1dGhUb2tlbi5zZWNyZXRBcm4sXG4gICAgICBlZnNJZDogZWZzLmZpbGVTeXN0ZW0uZmlsZVN5c3RlbUlkLFxuICAgICAgZWZzTWVkaWFBY2Nlc3NQb2ludElkOiBlZnMubWVkaWFBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkLFxuICAgICAgZWZzVGVtcGxhdGVzQWNjZXNzUG9pbnRJZDogZWZzLmN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWQsXG4gICAgICBhdXRoZW50aWtTZWNyZXRLZXlBcm46IHNlY3JldHNNYW5hZ2VyLnNlY3JldEtleS5zZWNyZXRBcm4sXG4gICAgICBhdXRoZW50aWtBZG1pblRva2VuQXJuOiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJUb2tlbi5zZWNyZXRBcm4sXG4gICAgICBhdXRoZW50aWtMZGFwVG9rZW5Bcm46IHNlY3JldHNNYW5hZ2VyLmxkYXBUb2tlbi5zZWNyZXRBcm4sXG4gICAgICBhdXRoZW50aWtBbGJEbnM6IGF1dGhlbnRpa0VMQi5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZSxcbiAgICAgIGF1dGhlbnRpa1VybDogYGh0dHBzOi8vJHthdXRoZW50aWtFTEIuZG5zTmFtZX1gLFxuICAgICAgbGRhcE5sYkRuczogbGRhcC5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZSxcbiAgICAgIGxkYXBFbmRwb2ludDogYGxkYXA6Ly8ke2xkYXAuZG5zTmFtZX06Mzg5YCxcbiAgICAgIGxkYXBzRW5kcG9pbnQ6IGBsZGFwczovLyR7bGRhcC5kbnNOYW1lfTo2MzZgLFxuICAgICAgbGRhcFRva2VuUmV0cmlldmVyTGFtYmRhQXJuOiBsZGFwVG9rZW5SZXRyaWV2ZXIubGFtYmRhRnVuY3Rpb24uZnVuY3Rpb25Bcm5cbiAgICB9KTtcbiAgfVxuXG4gIC8vID09PT09PT09PT09PT09PT09XG4gIC8vIEhFTFBFUiBNRVRIT0RTXG4gIC8vID09PT09PT09PT09PT09PT09XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBzZWN1cml0eSBncm91cCBmb3IgQXV0aGVudGlrIEVDUyB0YXNrcyAoU2VydmVyL1dvcmtlcilcbiAgICogQHBhcmFtIHZwYyBUaGUgVlBDIHRvIGNyZWF0ZSB0aGUgc2VjdXJpdHkgZ3JvdXAgaW5cbiAgICogQHBhcmFtIHN0YWNrTmFtZUNvbXBvbmVudCBUaGUgc3RhY2sgbmFtZSBjb21wb25lbnQgZm9yIGltcG9ydHNcbiAgICogQHJldHVybnMgVGhlIGNyZWF0ZWQgc2VjdXJpdHkgZ3JvdXBcbiAgICovXG4gIHByaXZhdGUgY3JlYXRlQXV0aGVudGlrU2VjdXJpdHlHcm91cCh2cGM6IGVjMi5JVnBjLCBzdGFja05hbWVDb21wb25lbnQ6IHN0cmluZyk6IGVjMi5TZWN1cml0eUdyb3VwIHtcbiAgICBjb25zdCBhdXRoZW50aWtTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdBdXRoZW50aWtTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgQXV0aGVudGlrIEVDUyB0YXNrcyAoU2VydmVyL1dvcmtlciknLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogdHJ1ZVxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgSFRUUC9IVFRQUyB0cmFmZmljIHRvIEF1dGhlbnRpayB0YXNrc1xuICAgIGF1dGhlbnRpa1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5hbnlJcHY0KCksXG4gICAgICBlYzIuUG9ydC50Y3AoODApLFxuICAgICAgJ0FsbG93IEhUVFAgdHJhZmZpYydcbiAgICApO1xuXG4gICAgYXV0aGVudGlrU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg0NDMpLFxuICAgICAgJ0FsbG93IEhUVFBTIHRyYWZmaWMnXG4gICAgKTtcblxuICAgIC8vIEFsbG93IEF1dGhlbnRpayBhcHBsaWNhdGlvbiB0cmFmZmljIChwb3J0IDkwMDApIGZyb20gVlBDIENJRFJcbiAgICBhdXRoZW50aWtTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuaXB2NChGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5WUENfQ0lEUl9JUFY0KSkpLFxuICAgICAgZWMyLlBvcnQudGNwKDkwMDApLFxuICAgICAgJ0FsbG93IEF1dGhlbnRpayB0cmFmZmljIGZyb20gVlBDJ1xuICAgICk7XG5cbiAgICByZXR1cm4gYXV0aGVudGlrU2VjdXJpdHlHcm91cDtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgc2VjdXJpdHkgZ3JvdXAgZm9yIExEQVAgRUNTIHRhc2tzXG4gICAqIEBwYXJhbSB2cGMgVGhlIFZQQyB0byBjcmVhdGUgdGhlIHNlY3VyaXR5IGdyb3VwIGluXG4gICAqIEBwYXJhbSBzdGFja05hbWVDb21wb25lbnQgVGhlIHN0YWNrIG5hbWUgY29tcG9uZW50IGZvciBpbXBvcnRzXG4gICAqIEByZXR1cm5zIFRoZSBjcmVhdGVkIHNlY3VyaXR5IGdyb3VwXG4gICAqL1xuICBwcml2YXRlIGNyZWF0ZUxkYXBTZWN1cml0eUdyb3VwKHZwYzogZWMyLklWcGMsIHN0YWNrTmFtZUNvbXBvbmVudDogc3RyaW5nKTogZWMyLlNlY3VyaXR5R3JvdXAge1xuICAgIGNvbnN0IGxkYXBTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdMZGFwU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIExEQVAgRUNTIHRhc2tzJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IHRydWVcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IExEQVAgdHJhZmZpYyAocG9ydCAzMzg5KSBmcm9tIFZQQyBDSURSXG4gICAgbGRhcFNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5pcHY0KEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlZQQ19DSURSX0lQVjQpKSksXG4gICAgICBlYzIuUG9ydC50Y3AoMzM4OSksXG4gICAgICAnQWxsb3cgTERBUCB0cmFmZmljIGZyb20gVlBDJ1xuICAgICk7XG5cbiAgICAvLyBBbGxvdyBMREFQUyB0cmFmZmljIChwb3J0IDY2MzYpIGZyb20gVlBDIENJRFJcbiAgICBsZGFwU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmlwdjQoRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuVlBDX0NJRFJfSVBWNCkpKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg2NjM2KSxcbiAgICAgICdBbGxvdyBMREFQUyB0cmFmZmljIGZyb20gVlBDJ1xuICAgICk7XG5cbiAgICByZXR1cm4gbGRhcFNlY3VyaXR5R3JvdXA7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIHNlY3VyaXR5IGdyb3VwIGZvciBFQ1MgdGFza3MgKExlZ2FjeSAtIGtlZXBpbmcgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkpXG4gICAqIEBwYXJhbSB2cGMgVGhlIFZQQyB0byBjcmVhdGUgdGhlIHNlY3VyaXR5IGdyb3VwIGluXG4gICAqIEByZXR1cm5zIFRoZSBjcmVhdGVkIHNlY3VyaXR5IGdyb3VwXG4gICAqL1xuICBwcml2YXRlIGNyZWF0ZUVjc1NlY3VyaXR5R3JvdXAodnBjOiBlYzIuSVZwYyk6IGVjMi5TZWN1cml0eUdyb3VwIHtcbiAgICBjb25zdCBlY3NTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdFQ1NTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgRUNTIHRhc2tzJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IHRydWVcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IEhUVFAvSFRUUFMgdHJhZmZpYyB0byBFQ1MgdGFza3NcbiAgICBlY3NTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuYW55SXB2NCgpLFxuICAgICAgZWMyLlBvcnQudGNwKDgwKSxcbiAgICAgICdBbGxvdyBIVFRQIHRyYWZmaWMnXG4gICAgKTtcblxuICAgIGVjc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5hbnlJcHY0KCksXG4gICAgICBlYzIuUG9ydC50Y3AoNDQzKSxcbiAgICAgICdBbGxvdyBIVFRQUyB0cmFmZmljJ1xuICAgICk7XG5cbiAgICBlY3NTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuYW55SXB2NCgpLFxuICAgICAgZWMyLlBvcnQudGNwKDkwMDApLFxuICAgICAgJ0FsbG93IEF1dGhlbnRpayB0cmFmZmljJ1xuICAgICk7XG5cbiAgICByZXR1cm4gZWNzU2VjdXJpdHlHcm91cDtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgc2VjdXJpdHkgZ3JvdXAgZm9yIGRhdGFiYXNlIGFjY2Vzc1xuICAgKiBAcGFyYW0gdnBjIFRoZSBWUEMgdG8gY3JlYXRlIHRoZSBzZWN1cml0eSBncm91cCBpblxuICAgKiBAcGFyYW0gZWNzU2VjdXJpdHlHcm91cCBUaGUgRUNTIHNlY3VyaXR5IGdyb3VwIHRvIGFsbG93IGFjY2VzcyBmcm9tXG4gICAqIEByZXR1cm5zIFRoZSBjcmVhdGVkIHNlY3VyaXR5IGdyb3VwXG4gICAqL1xuICBwcml2YXRlIGNyZWF0ZURiU2VjdXJpdHlHcm91cCh2cGM6IGVjMi5JVnBjLCBlY3NTZWN1cml0eUdyb3VwOiBlYzIuU2VjdXJpdHlHcm91cCk6IGVjMi5TZWN1cml0eUdyb3VwIHtcbiAgICBjb25zdCBkYlNlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0RCU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIGRhdGFiYXNlJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IGZhbHNlXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBQb3N0Z3JlU1FMIGFjY2VzcyBmcm9tIEVDUyB0YXNrc1xuICAgIGRiU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLnNlY3VyaXR5R3JvdXBJZChlY3NTZWN1cml0eUdyb3VwLnNlY3VyaXR5R3JvdXBJZCksXG4gICAgICBlYzIuUG9ydC50Y3AoNTQzMiksXG4gICAgICAnQWxsb3cgUG9zdGdyZVNRTCBhY2Nlc3MgZnJvbSBFQ1MgdGFza3MnXG4gICAgKTtcblxuICAgIHJldHVybiBkYlNlY3VyaXR5R3JvdXA7XG4gIH1cbn1cblxuLyoqXG4gKiBDb252ZXJ0cyBhbiBFQ1IgcmVwb3NpdG9yeSBBUk4gdG8gYSBwcm9wZXIgRUNSIHJlcG9zaXRvcnkgVVJJIGZvciBEb2NrZXIgaW1hZ2VzXG4gKiBAcGFyYW0gZWNyQXJuIC0gRUNSIHJlcG9zaXRvcnkgQVJOIChlLmcuLCBcImFybjphd3M6ZWNyOnJlZ2lvbjphY2NvdW50OnJlcG9zaXRvcnkvcmVwby1uYW1lXCIpXG4gKiBAcmV0dXJucyBFQ1IgcmVwb3NpdG9yeSBVUkkgKGUuZy4sIFwiYWNjb3VudC5ka3IuZWNyLnJlZ2lvbi5hbWF6b25hd3MuY29tL3JlcG8tbmFtZVwiKVxuICovXG5mdW5jdGlvbiBjb252ZXJ0RWNyQXJuVG9SZXBvc2l0b3J5VXJpKGVjckFybjogc3RyaW5nKTogc3RyaW5nIHtcbiAgLy8gUGFyc2UgQVJOOiBhcm46YXdzOmVjcjpyZWdpb246YWNjb3VudDpyZXBvc2l0b3J5L3JlcG8tbmFtZVxuICBjb25zdCBhcm5QYXJ0cyA9IGVjckFybi5zcGxpdCgnOicpO1xuICBpZiAoYXJuUGFydHMubGVuZ3RoICE9PSA2IHx8ICFhcm5QYXJ0c1s1XS5zdGFydHNXaXRoKCdyZXBvc2l0b3J5LycpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIEVDUiByZXBvc2l0b3J5IEFSTiBmb3JtYXQ6ICR7ZWNyQXJufWApO1xuICB9XG4gIFxuICBjb25zdCByZWdpb24gPSBhcm5QYXJ0c1szXTtcbiAgY29uc3QgYWNjb3VudCA9IGFyblBhcnRzWzRdO1xuICBjb25zdCByZXBvc2l0b3J5TmFtZSA9IGFyblBhcnRzWzVdLnJlcGxhY2UoJ3JlcG9zaXRvcnkvJywgJycpO1xuICBcbiAgcmV0dXJuIGAke2FjY291bnR9LmRrci5lY3IuJHtyZWdpb259LmFtYXpvbmF3cy5jb20vJHtyZXBvc2l0b3J5TmFtZX1gO1xufVxuIl19