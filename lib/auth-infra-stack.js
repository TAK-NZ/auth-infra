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
const constants_1 = require("./utils/constants");
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
        const vpcCidr = envConfig.vpcCidr ?? constants_1.DEFAULT_VPC_CIDR;
        const r53ZoneName = envConfig.r53ZoneName;
        const stackNameComponent = envConfig.stackName; // This is the STACK_NAME part (e.g., "DevTest")
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGgtaW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFFbkMsNkNBQXVFO0FBQ3ZFLHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLHVEQUF5QztBQUV6QyxvQkFBb0I7QUFDcEIsb0RBQWlEO0FBQ2pELDhDQUEyQztBQUMzQywwQ0FBdUM7QUFDdkMsa0VBQThEO0FBQzlELDBDQUF1QztBQUN2QyxvRUFBZ0U7QUFDaEUsb0VBQWdFO0FBQ2hFLDRDQUF5QztBQUN6Qyw0RUFBdUU7QUFDdkUsa0RBQStDO0FBQy9DLHNFQUFrRTtBQWNsRSxrQkFBa0I7QUFDbEIsdUNBQTRDO0FBQzVDLHFFQUFvRjtBQUVwRixpREFBcUQ7QUFPckQ7OztHQUdHO0FBQ0gsU0FBUyxtQ0FBbUMsQ0FDMUMsYUFBdUMsRUFDdkMsa0JBQTJCO0lBRTNCLE1BQU0sYUFBYSxHQUFHLGFBQWEsQ0FBQyxPQUFPLENBQUMsYUFBYSxLQUFLLFFBQVEsQ0FBQyxDQUFDO1FBQ3RFLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQztJQUV2RCxPQUFPO1FBQ0wsUUFBUSxFQUFFO1lBQ1IsYUFBYSxFQUFFLGFBQWEsQ0FBQyxRQUFRLENBQUMsYUFBYTtZQUNuRCxhQUFhLEVBQUUsYUFBYSxDQUFDLFFBQVEsQ0FBQyxhQUFhO1lBQ25ELG1CQUFtQixFQUFFLGFBQWEsQ0FBQyxRQUFRLENBQUMsbUJBQW1CO1lBQy9ELGtCQUFrQixFQUFFLGFBQWEsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCO1lBQzNELHlCQUF5QixFQUFFLGFBQWEsQ0FBQyxRQUFRLENBQUMseUJBQXlCO1lBQzNFLGdCQUFnQixFQUFFLGFBQWEsQ0FBQyxRQUFRLENB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RixPQUFPLGVBQWUsQ0FBQztJQUN6QixDQUFDO0NBQ0Y7QUFoZkQsd0NBZ2ZDO0FBRUQ7Ozs7R0FJRztBQUNILFNBQVMsNEJBQTRCLENBQUMsTUFBYztJQUNsRCw2REFBNkQ7SUFDN0QsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNuQyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO1FBQ3BFLE1BQU0sSUFBSSxLQUFLLENBQUMsc0NBQXNDLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDbEUsQ0FBQztJQUVELE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMzQixNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDNUIsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFFOUQsT0FBTyxHQUFHLE9BQU8sWUFBWSxNQUFNLGtCQUFrQixjQUFjLEVBQUUsQ0FBQztBQUN4RSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHsgUmVtb3ZhbFBvbGljeSwgU3RhY2tQcm9wcywgRm4sIENmbk91dHB1dCB9IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIGVjcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWNzJztcbmltcG9ydCAqIGFzIGttcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mta21zJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5cbi8vIENvbnN0cnVjdCBpbXBvcnRzXG5pbXBvcnQgeyBEYXRhYmFzZSB9IGZyb20gJy4vY29uc3RydWN0cy9kYXRhYmFzZSc7XG5pbXBvcnQgeyBSZWRpcyB9IGZyb20gJy4vY29uc3RydWN0cy9yZWRpcyc7XG5pbXBvcnQgeyBFZnMgfSBmcm9tICcuL2NvbnN0cnVjdHMvZWZzJztcbmltcG9ydCB7IFNlY3JldHNNYW5hZ2VyIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL3NlY3JldHMtbWFuYWdlcic7XG5pbXBvcnQgeyBFbGIgfSBmcm9tICcuL2NvbnN0cnVjdHMvZWxiJztcbmltcG9ydCB7IEF1dGhlbnRpa1NlcnZlciB9IGZyb20gJy4vY29uc3RydWN0cy9hdXRoZW50aWstc2VydmVyJztcbmltcG9ydCB7IEF1dGhlbnRpa1dvcmtlciB9IGZyb20gJy4vY29uc3RydWN0cy9hdXRoZW50aWstd29ya2VyJztcbmltcG9ydCB7IExkYXAgfSBmcm9tICcuL2NvbnN0cnVjdHMvbGRhcCc7XG5pbXBvcnQgeyBMZGFwVG9rZW5SZXRyaWV2ZXIgfSBmcm9tICcuL2NvbnN0cnVjdHMvbGRhcC10b2tlbi1yZXRyaWV2ZXInO1xuaW1wb3J0IHsgUm91dGU1MyB9IGZyb20gJy4vY29uc3RydWN0cy9yb3V0ZTUzJztcbmltcG9ydCB7IFJvdXRlNTNBdXRoZW50aWsgfSBmcm9tICcuL2NvbnN0cnVjdHMvcm91dGU1My1hdXRoZW50aWsnO1xuXG4vLyBDb25maWd1cmF0aW9uIGltcG9ydHNcbmltcG9ydCB0eXBlIHtcbiAgSW5mcmFzdHJ1Y3R1cmVDb25maWcsXG4gIFNlY3JldHNDb25maWcsXG4gIFN0b3JhZ2VDb25maWcsXG4gIERlcGxveW1lbnRDb25maWcsXG4gIEF1dGhlbnRpa0FwcGxpY2F0aW9uQ29uZmlnLFxuICBOZXR3b3JrQ29uZmlnLFxuICBUb2tlbkNvbmZpZ1xufSBmcm9tICcuL2NvbnN0cnVjdC1jb25maWdzJztcbmltcG9ydCB7IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi9lbnZpcm9ubWVudC1jb25maWcnO1xuXG4vLyBVdGlsaXR5IGltcG9ydHNcbmltcG9ydCB7IHJlZ2lzdGVyT3V0cHV0cyB9IGZyb20gJy4vb3V0cHV0cyc7XG5pbXBvcnQgeyBjcmVhdGVCYXNlSW1wb3J0VmFsdWUsIEJBU0VfRVhQT1JUX05BTUVTIH0gZnJvbSAnLi9jbG91ZGZvcm1hdGlvbi1pbXBvcnRzJztcbmltcG9ydCB7IENvbnRleHRFbnZpcm9ubWVudENvbmZpZyB9IGZyb20gJy4vc3RhY2stY29uZmlnJztcbmltcG9ydCB7IERFRkFVTFRfVlBDX0NJRFIgfSBmcm9tICcuL3V0aWxzL2NvbnN0YW50cyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aEluZnJhU3RhY2tQcm9wcyBleHRlbmRzIFN0YWNrUHJvcHMge1xuICBlbnZpcm9ubWVudDogJ3Byb2QnIHwgJ2Rldi10ZXN0JztcbiAgZW52Q29uZmlnOiBDb250ZXh0RW52aXJvbm1lbnRDb25maWc7IC8vIEVudmlyb25tZW50IGNvbmZpZ3VyYXRpb24gZnJvbSBjb250ZXh0XG59XG5cbi8qKlxuICogVHJhbnNmb3JtIGNvbnRleHQtYmFzZWQgY29uZmlndXJhdGlvbiB0byBsZWdhY3kgZW52aXJvbm1lbnQgY29uZmlnIGZvcm1hdFxuICogVGhpcyBhbGxvd3MgdXMgdG8gdXNlIHRoZSBuZXcgY29udGV4dCBzeXN0ZW0gd2hpbGUgbWFpbnRhaW5pbmcgY29tcGF0aWJpbGl0eSB3aXRoIGV4aXN0aW5nIGNvbnN0cnVjdHNcbiAqL1xuZnVuY3Rpb24gdHJhbnNmb3JtQ29udGV4dFRvRW52aXJvbm1lbnRDb25maWcoXG4gIGNvbnRleHRDb25maWc6IENvbnRleHRFbnZpcm9ubWVudENvbmZpZyxcbiAgaXNIaWdoQXZhaWxhYmlsaXR5OiBib29sZWFuXG4pOiBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZyB7XG4gIGNvbnN0IHJlbW92YWxQb2xpY3kgPSBjb250ZXh0Q29uZmlnLmdlbmVyYWwucmVtb3ZhbFBvbGljeSA9PT0gJ1JFVEFJTicgPyBcbiAgICBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZO1xuICBcbiAgcmV0dXJuIHtcbiAgICBkYXRhYmFzZToge1xuICAgICAgaW5zdGFuY2VDbGFzczogY29udGV4dENvbmZpZy5kYXRhYmFzZS5pbnN0YW5jZUNsYXNzLFxuICAgICAgaW5zdGFuY2VDb3VudDogY29udGV4dENvbmZpZy5kYXRhYmFzZS5pbnN0YW5jZUNvdW50LFxuICAgICAgYmFja3VwUmV0ZW50aW9uRGF5czogY29udGV4dENvbmZpZy5kYXRhYmFzZS5iYWNrdXBSZXRlbnRpb25EYXlzLFxuICAgICAgZGVsZXRpb25Qcm90ZWN0aW9uOiBjb250ZXh0Q29uZmlnLmRhdGFiYXNlLmRlbGV0ZVByb3RlY3Rpb24sXG4gICAgICBlbmFibGVQZXJmb3JtYW5jZUluc2lnaHRzOiBjb250ZXh0Q29uZmlnLmRhdGFiYXNlLmVuYWJsZVBlcmZvcm1hbmNlSW5zaWdodHMsXG4gICAgICBlbmFibGVNb25pdG9yaW5nOiBjb250ZXh0Q29uZmlnLmRhdGFiYXNlLm1vbml0b3JpbmdJbnRlcnZhbCA+IDAsXG4gICAgfSxcbiAgICByZWRpczoge1xuICAgICAgbm9kZVR5cGU6IGNvbnRleHRDb25maWcucmVkaXMubm9kZVR5cGUsXG4gICAgICBudW1DYWNoZUNsdXN0ZXJzOiBjb250ZXh0Q29uZmlnLnJlZGlzLm51bUNhY2hlTm9kZXMsXG4gICAgICBhdXRvbWF0aWNGYWlsb3ZlckVuYWJsZWQ6IGNvbnRleHRDb25maWcucmVkaXMubnVtQ2FjaGVOb2RlcyA+IDEsXG4gICAgfSxcbiAgICBlY3M6IHtcbiAgICAgIHRhc2tDcHU6IGNvbnRleHRDb25maWcuZWNzLnRhc2tDcHUsXG4gICAgICB0YXNrTWVtb3J5OiBjb250ZXh0Q29uZmlnLmVjcy50YXNrTWVtb3J5LFxuICAgICAgZGVzaXJlZENvdW50OiBjb250ZXh0Q29uZmlnLmVjcy5kZXNpcmVkQ291bnQsXG4gICAgICBtaW5DYXBhY2l0eTogMSxcbiAgICAgIG1heENhcGFjaXR5OiBpc0hpZ2hBdmFpbGFiaWxpdHkgPyAxMCA6IDMsXG4gICAgICB3b3JrZXJEZXNpcmVkQ291bnQ6IGNvbnRleHRDb25maWcuZWNzLmRlc2lyZWRDb3VudCxcbiAgICAgIHdvcmtlck1pbkNhcGFjaXR5OiAxLFxuICAgICAgd29ya2VyTWF4Q2FwYWNpdHk6IGlzSGlnaEF2YWlsYWJpbGl0eSA/IDEwIDogMyxcbiAgICB9LFxuICAgIGVmczoge1xuICAgICAgdGhyb3VnaHB1dE1vZGU6ICdidXJzdGluZycgYXMgY29uc3QsXG4gICAgICByZW1vdmFsUG9saWN5OiByZW1vdmFsUG9saWN5LFxuICAgIH0sXG4gICAgZ2VuZXJhbDoge1xuICAgICAgcmVtb3ZhbFBvbGljeTogcmVtb3ZhbFBvbGljeSxcbiAgICAgIGVuYWJsZURldGFpbGVkTG9nZ2luZzogY29udGV4dENvbmZpZy5nZW5lcmFsLmVuYWJsZURldGFpbGVkTG9nZ2luZyxcbiAgICB9LFxuICAgIG1vbml0b3Jpbmc6IHtcbiAgICAgIGVuYWJsZUNsb3VkV2F0Y2hBbGFybXM6IGlzSGlnaEF2YWlsYWJpbGl0eSxcbiAgICAgIGxvZ1JldGVudGlvbkRheXM6IGlzSGlnaEF2YWlsYWJpbGl0eSA/IDMwIDogNyxcbiAgICB9LFxuICB9O1xufVxuXG4vKipcbiAqIE1haW4gQ0RLIHN0YWNrIGZvciB0aGUgVEFLIEF1dGggSW5mcmFzdHJ1Y3R1cmVcbiAqL1xuZXhwb3J0IGNsYXNzIEF1dGhJbmZyYVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEF1dGhJbmZyYVN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHtcbiAgICAgIC4uLnByb3BzLFxuICAgICAgZGVzY3JpcHRpb246ICdUQUsgQXV0aGVudGljYXRpb24gTGF5ZXIgLSBBdXRoZW50aWssIExEQVAgT3V0cG9zdCcsXG4gICAgfSk7XG5cbiAgICAvLyBVc2UgZW52aXJvbm1lbnQgY29uZmlndXJhdGlvbiBkaXJlY3RseSAobm8gY29tcGxleCB0cmFuc2Zvcm1hdGlvbnMgbmVlZGVkKVxuICAgIGNvbnN0IHsgZW52Q29uZmlnIH0gPSBwcm9wcztcbiAgICBcbiAgICAvLyBFeHRyYWN0IGNvbmZpZ3VyYXRpb24gdmFsdWVzIGRpcmVjdGx5IGZyb20gZW52Q29uZmlnXG4gICAgY29uc3QgdnBjQ2lkciA9IGVudkNvbmZpZy52cGNDaWRyID8/IERFRkFVTFRfVlBDX0NJRFI7XG4gICAgY29uc3QgcjUzWm9uZU5hbWUgPSBlbnZDb25maWcucjUzWm9uZU5hbWU7XG4gICAgY29uc3Qgc3RhY2tOYW1lQ29tcG9uZW50ID0gZW52Q29uZmlnLnN0YWNrTmFtZTsgLy8gVGhpcyBpcyB0aGUgU1RBQ0tfTkFNRSBwYXJ0IChlLmcuLCBcIkRldlRlc3RcIilcbiAgICBjb25zdCBpc0hpZ2hBdmFpbGFiaWxpdHkgPSBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2QnO1xuICAgIGNvbnN0IGVudmlyb25tZW50TGFiZWwgPSBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gJ1Byb2QnIDogJ0Rldi1UZXN0JztcbiAgICBjb25zdCByZXNvbHZlZFN0YWNrTmFtZSA9IGlkO1xuICAgIFxuICAgIC8vIFVzZSBjb21wdXRlZCB2YWx1ZXMgZnJvbSBjb25maWd1cmF0aW9uXG4gICAgY29uc3QgZW5hYmxlSGlnaEF2YWlsYWJpbGl0eSA9IGlzSGlnaEF2YWlsYWJpbGl0eTtcbiAgICBjb25zdCBlbmFibGVEZXRhaWxlZE1vbml0b3JpbmcgPSBlbnZDb25maWcuZ2VuZXJhbC5lbmFibGVEZXRhaWxlZExvZ2dpbmc7XG5cbiAgICAvLyBBZGQgRW52aXJvbm1lbnQgVHlwZSB0YWcgdG8gdGhlIHN0YWNrXG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdFbnZpcm9ubWVudCBUeXBlJywgZW52aXJvbm1lbnRMYWJlbCk7XG5cbiAgICAvLyBUcmFuc2Zvcm0gY29udGV4dCBjb25maWcgdG8gZW52aXJvbm1lbnQgY29uZmlnIGZvciBjb25zdHJ1Y3RzXG4gICAgY29uc3QgZW52aXJvbm1lbnRDb25maWcgPSB0cmFuc2Zvcm1Db250ZXh0VG9FbnZpcm9ubWVudENvbmZpZyhlbnZDb25maWcsIGlzSGlnaEF2YWlsYWJpbGl0eSk7XG5cbiAgICBjb25zdCBzdGFja05hbWUgPSBGbi5yZWYoJ0FXUzo6U3RhY2tOYW1lJyk7XG4gICAgY29uc3QgcmVnaW9uID0gY2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbjtcblxuICAgIC8vIENvbmZpZ3VyYXRpb24tYmFzZWQgcGFyYW1ldGVyIHJlc29sdXRpb25cbiAgICBjb25zdCBhdXRoZW50aWtBZG1pblVzZXJFbWFpbCA9IGVudkNvbmZpZy5hdXRoZW50aWsuYWRtaW5Vc2VyRW1haWw7XG4gICAgY29uc3QgbGRhcEJhc2VEbiA9IGBkYz0ke3I1M1pvbmVOYW1lLnNwbGl0KCcuJykuam9pbignLGRjPScpfWA7XG4gICAgY29uc3QgaG9zdG5hbWVBdXRoZW50aWsgPSBlbnZDb25maWcuYXV0aGVudGlrLmRvbWFpbi5zcGxpdCgnLicpWzBdOyAvLyBFeHRyYWN0IHN1YmRvbWFpblxuICAgIGNvbnN0IGhvc3RuYW1lTGRhcCA9IGVudkNvbmZpZy5sZGFwLmRvbWFpbi5zcGxpdCgnLicpWzBdOyAvLyBFeHRyYWN0IHN1YmRvbWFpblxuICAgIGNvbnN0IGdpdFNoYSA9ICdsYXRlc3QnOyAvLyBVc2UgZml4ZWQgdGFnIGZvciBjb250ZXh0LWRyaXZlbiBhcHByb2FjaFxuICAgIGNvbnN0IGVuYWJsZUV4ZWN1dGUgPSBmYWxzZTsgLy8gRGlzYWJsZSBieSBkZWZhdWx0IGZvciBzZWN1cml0eVxuICAgIGNvbnN0IHVzZUF1dGhlbnRpa0NvbmZpZ0ZpbGUgPSBmYWxzZTsgLy8gVXNlIGVudmlyb25tZW50IHZhcmlhYmxlc1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBJTVBPUlQgQkFTRSBJTkZSQVNUUlVDVFVSRSBSRVNPVVJDRVNcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gSW1wb3J0IFZQQyBhbmQgbmV0d29ya2luZyBmcm9tIGJhc2UgaW5mcmFzdHJ1Y3R1cmVcbiAgICAvLyBOb3RlOiBCYXNlIGluZnJhc3RydWN0dXJlIHByb3ZpZGVzIDIgc3VibmV0cyAoQSBhbmQgQiksIHNvIHdlIGxpbWl0IHRvIDIgQVpzXG4gICAgY29uc3QgdnBjQXZhaWxhYmlsaXR5Wm9uZXMgPSB0aGlzLmF2YWlsYWJpbGl0eVpvbmVzLnNsaWNlKDAsIDIpO1xuICAgIFxuICAgIGNvbnN0IHZwYyA9IGVjMi5WcGMuZnJvbVZwY0F0dHJpYnV0ZXModGhpcywgJ1ZQQycsIHtcbiAgICAgIHZwY0lkOiBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5WUENfSUQpKSxcbiAgICAgIGF2YWlsYWJpbGl0eVpvbmVzOiB2cGNBdmFpbGFiaWxpdHlab25lcyxcbiAgICAgIC8vIEltcG9ydCBzdWJuZXQgSURzIGZyb20gYmFzZSBpbmZyYXN0cnVjdHVyZVxuICAgICAgcHVibGljU3VibmV0SWRzOiBbXG4gICAgICAgIEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlNVQk5FVF9QVUJMSUNfQSkpLFxuICAgICAgICBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5TVUJORVRfUFVCTElDX0IpKVxuICAgICAgXSxcbiAgICAgIHByaXZhdGVTdWJuZXRJZHM6IFtcbiAgICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuU1VCTkVUX1BSSVZBVEVfQSkpLFxuICAgICAgICBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5TVUJORVRfUFJJVkFURV9CKSlcbiAgICAgIF0sXG4gICAgICB2cGNDaWRyQmxvY2s6IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlZQQ19DSURSX0lQVjQpKVxuICAgIH0pO1xuXG4gICAgLy8gS01TXG4gICAgY29uc3Qga21zS2V5ID0ga21zLktleS5mcm9tS2V5QXJuKHRoaXMsICdLTVNLZXknLCBcbiAgICAgIEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLktNU19LRVkpKVxuICAgICk7XG5cbiAgICAvLyBFQ1NcbiAgICBjb25zdCBlY3NDbHVzdGVyQXJuID0gRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuRUNTX0NMVVNURVIpKTtcbiAgICAvLyBFeHRyYWN0IGNsdXN0ZXIgbmFtZSBmcm9tIEFSTjogYXJuOmF3czplY3M6cmVnaW9uOmFjY291bnQ6Y2x1c3Rlci9jbHVzdGVyLW5hbWVcbiAgICBjb25zdCBlY3NDbHVzdGVyTmFtZSA9IEZuLnNlbGVjdCgxLCBGbi5zcGxpdCgnLycsIGVjc0NsdXN0ZXJBcm4pKTtcbiAgICBjb25zdCBlY3NDbHVzdGVyID0gZWNzLkNsdXN0ZXIuZnJvbUNsdXN0ZXJBdHRyaWJ1dGVzKHRoaXMsICdFQ1NDbHVzdGVyJywge1xuICAgICAgY2x1c3RlckFybjogZWNzQ2x1c3RlckFybixcbiAgICAgIGNsdXN0ZXJOYW1lOiBlY3NDbHVzdGVyTmFtZSxcbiAgICAgIHZwYzogdnBjXG4gICAgfSk7XG5cbiAgICAvLyBTM1xuICAgIGNvbnN0IHMzQ29uZkJ1Y2tldCA9IHMzLkJ1Y2tldC5mcm9tQnVja2V0QXJuKHRoaXMsICdTM0NvbmZCdWNrZXQnLFxuICAgICAgRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuUzNfQlVDS0VUKSlcbiAgICApO1xuXG4gICAgLy8gRUNSXG4gICAgY29uc3QgZWNyUmVwb3NpdG9yeSA9IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLkVDUl9SRVBPKSk7XG5cbiAgICAvLyBSb3V0ZTUzXG4gICAgY29uc3QgaG9zdGVkWm9uZUlkID0gRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuSE9TVEVEX1pPTkVfSUQpKTtcbiAgICBjb25zdCBob3N0ZWRab25lTmFtZSA9IEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLkhPU1RFRF9aT05FX05BTUUpKTtcblxuICAgIC8vIFNTTCBDZXJ0aWZpY2F0ZVxuICAgIGNvbnN0IHNzbENlcnRpZmljYXRlQXJuID0gRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuQ0VSVElGSUNBVEVfQVJOKSk7XG5cbiAgICAvLyBTMyBFbnZpcm9ubWVudCBGaWxlIHBhdGhzIC0gYXNzdW1lcyBhdXRoZW50aWstY29uZmlnLmVudiBhbHJlYWR5IGV4aXN0cyBpbiBTM1xuICAgIGNvbnN0IGVudkZpbGVTM0tleSA9IGBhdXRoZW50aWstY29uZmlnLmVudmA7XG4gICAgY29uc3QgZW52RmlsZVMzVXJpID0gYGFybjphd3M6czM6Ojoke3MzQ29uZkJ1Y2tldC5idWNrZXROYW1lfS8ke2VudkZpbGVTM0tleX1gO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBTRUNVUklUWSBHUk9VUFNcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gU2VjdXJpdHkgR3JvdXBzXG4gICAgY29uc3QgYXV0aGVudGlrU2VjdXJpdHlHcm91cCA9IHRoaXMuY3JlYXRlQXV0aGVudGlrU2VjdXJpdHlHcm91cCh2cGMsIHN0YWNrTmFtZUNvbXBvbmVudCk7XG4gICAgY29uc3QgbGRhcFNlY3VyaXR5R3JvdXAgPSB0aGlzLmNyZWF0ZUxkYXBTZWN1cml0eUdyb3VwKHZwYywgc3RhY2tOYW1lQ29tcG9uZW50KTtcbiAgICBjb25zdCBkYlNlY3VyaXR5R3JvdXAgPSB0aGlzLmNyZWF0ZURiU2VjdXJpdHlHcm91cCh2cGMsIGF1dGhlbnRpa1NlY3VyaXR5R3JvdXApO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBCVUlMRCBDT05GSUdVUkFUSU9OIE9CSkVDVFNcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gQnVpbGQgc2hhcmVkIGluZnJhc3RydWN0dXJlIGNvbmZpZyBmb3IgQXV0aGVudGlrIHNlcnZpY2VzXG4gICAgY29uc3QgYXV0aGVudGlrSW5mcmFzdHJ1Y3R1cmVDb25maWc6IEluZnJhc3RydWN0dXJlQ29uZmlnID0ge1xuICAgICAgdnBjLFxuICAgICAgZWNzU2VjdXJpdHlHcm91cDogYXV0aGVudGlrU2VjdXJpdHlHcm91cCxcbiAgICAgIGVjc0NsdXN0ZXIsXG4gICAgICBrbXNLZXlcbiAgICB9O1xuXG4gICAgLy8gQnVpbGQgc2hhcmVkIGluZnJhc3RydWN0dXJlIGNvbmZpZyBmb3IgTERBUCBzZXJ2aWNlc1xuICAgIGNvbnN0IGxkYXBJbmZyYXN0cnVjdHVyZUNvbmZpZzogSW5mcmFzdHJ1Y3R1cmVDb25maWcgPSB7XG4gICAgICB2cGMsXG4gICAgICBlY3NTZWN1cml0eUdyb3VwOiBsZGFwU2VjdXJpdHlHcm91cCxcbiAgICAgIGVjc0NsdXN0ZXIsXG4gICAgICBrbXNLZXlcbiAgICB9O1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBDT1JFIElORlJBU1RSVUNUVVJFXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIFNlY3JldHNNYW5hZ2VyXG4gICAgY29uc3Qgc2VjcmV0c01hbmFnZXIgPSBuZXcgU2VjcmV0c01hbmFnZXIodGhpcywgJ1NlY3JldHNNYW5hZ2VyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIHN0YWNrTmFtZTogcmVzb2x2ZWRTdGFja05hbWUsXG4gICAgICBpbmZyYXN0cnVjdHVyZTogYXV0aGVudGlrSW5mcmFzdHJ1Y3R1cmVDb25maWdcbiAgICB9KTtcblxuICAgIC8vIERhdGFiYXNlXG4gICAgY29uc3QgZGF0YWJhc2UgPSBuZXcgRGF0YWJhc2UodGhpcywgJ0RhdGFiYXNlJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIHN0YWNrTmFtZTogcmVzb2x2ZWRTdGFja05hbWUsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAgaW5mcmFzdHJ1Y3R1cmU6IGF1dGhlbnRpa0luZnJhc3RydWN0dXJlQ29uZmlnLFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtkYlNlY3VyaXR5R3JvdXBdXG4gICAgfSk7XG5cbiAgICAvLyBSZWRpc1xuICAgIGNvbnN0IHJlZGlzID0gbmV3IFJlZGlzKHRoaXMsICdSZWRpcycsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBzdGFja05hbWU6IHJlc29sdmVkU3RhY2tOYW1lLFxuICAgICAgY29uZmlnOiBlbnZpcm9ubWVudENvbmZpZyxcbiAgICAgIGluZnJhc3RydWN0dXJlOiBhdXRoZW50aWtJbmZyYXN0cnVjdHVyZUNvbmZpZyxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbYXV0aGVudGlrU2VjdXJpdHlHcm91cF1cbiAgICB9KTtcblxuICAgIC8vIEVGU1xuICAgIGNvbnN0IGVmcyA9IG5ldyBFZnModGhpcywgJ0VGUycsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAgaW5mcmFzdHJ1Y3R1cmU6IGF1dGhlbnRpa0luZnJhc3RydWN0dXJlQ29uZmlnLFxuICAgICAgdnBjQ2lkckJsb2NrOiBGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5WUENfQ0lEUl9JUFY0KSksXG4gICAgICBhbGxvd0FjY2Vzc0Zyb206IFthdXRoZW50aWtTZWN1cml0eUdyb3VwXVxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBCVUlMRCBDT05GSUdVUkFUSU9OIE9CSkVDVFNcbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gQnVpbGQgc2hhcmVkIGNvbmZpZyBvYmplY3RzXG4gICAgY29uc3Qgc2VjcmV0c0NvbmZpZzogU2VjcmV0c0NvbmZpZyA9IHtcbiAgICAgIGRhdGFiYXNlOiBkYXRhYmFzZS5tYXN0ZXJTZWNyZXQsXG4gICAgICByZWRpc0F1dGhUb2tlbjogcmVkaXMuYXV0aFRva2VuLFxuICAgICAgYXV0aGVudGlrOiB7XG4gICAgICAgIHNlY3JldEtleTogc2VjcmV0c01hbmFnZXIuc2VjcmV0S2V5LFxuICAgICAgICBhZG1pblVzZXJQYXNzd29yZDogc2VjcmV0c01hbmFnZXIuYWRtaW5Vc2VyUGFzc3dvcmQsXG4gICAgICAgIGFkbWluVXNlclRva2VuOiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJUb2tlbixcbiAgICAgICAgbGRhcFRva2VuOiBzZWNyZXRzTWFuYWdlci5sZGFwVG9rZW4sXG4gICAgICAgIGxkYXBTZXJ2aWNlVXNlcjogc2VjcmV0c01hbmFnZXIubGRhcFNlcnZpY2VVc2VyXG4gICAgICB9XG4gICAgfTtcblxuICAgIGNvbnN0IHN0b3JhZ2VDb25maWc6IFN0b3JhZ2VDb25maWcgPSB7XG4gICAgICBzMzoge1xuICAgICAgICBjb25maWdCdWNrZXQ6IHMzQ29uZkJ1Y2tldCxcbiAgICAgICAgZW52RmlsZVVyaTogZW52RmlsZVMzVXJpLFxuICAgICAgICBlbnZGaWxlS2V5OiBlbnZGaWxlUzNLZXlcbiAgICAgIH0sXG4gICAgICBlZnM6IHtcbiAgICAgICAgZmlsZVN5c3RlbUlkOiBlZnMuZmlsZVN5c3RlbS5maWxlU3lzdGVtSWQsXG4gICAgICAgIG1lZGlhQWNjZXNzUG9pbnRJZDogZWZzLm1lZGlhQWNjZXNzUG9pbnQuYWNjZXNzUG9pbnRJZCxcbiAgICAgICAgY3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnRJZDogZWZzLmN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWRcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgY29uc3QgZGVwbG95bWVudENvbmZpZzogRGVwbG95bWVudENvbmZpZyA9IHtcbiAgICAgIGdpdFNoYTogZ2l0U2hhLFxuICAgICAgZWNyUmVwb3NpdG9yeUFybjogZWNyUmVwb3NpdG9yeSxcbiAgICAgIGVuYWJsZUV4ZWN1dGU6IGVuYWJsZUV4ZWN1dGUsXG4gICAgICB1c2VDb25maWdGaWxlOiB1c2VBdXRoZW50aWtDb25maWdGaWxlXG4gICAgfTtcblxuICAgIGNvbnN0IGFwcGxpY2F0aW9uQ29uZmlnOiBBdXRoZW50aWtBcHBsaWNhdGlvbkNvbmZpZyA9IHtcbiAgICAgIGFkbWluVXNlckVtYWlsOiBhdXRoZW50aWtBZG1pblVzZXJFbWFpbCxcbiAgICAgIGxkYXBCYXNlRG46IGxkYXBCYXNlRG4sXG4gICAgICBkYXRhYmFzZToge1xuICAgICAgICBob3N0bmFtZTogZGF0YWJhc2UuaG9zdG5hbWVcbiAgICAgIH0sXG4gICAgICByZWRpczoge1xuICAgICAgICBob3N0bmFtZTogcmVkaXMuaG9zdG5hbWVcbiAgICAgIH0sXG4gICAgICBhdXRoZW50aWtIb3N0OiBgaHR0cHM6Ly8ke2hvc3RuYW1lQXV0aGVudGlrfS4ke2hvc3RlZFpvbmVOYW1lfWBcbiAgICB9O1xuXG4gICAgLy8gQnVpbGQgbmV0d29yayBjb25maWcgZm9yIEROUyBhbmQgbG9hZCBiYWxhbmNlcnNcbiAgICBjb25zdCBhdXRoZW50aWtOZXR3b3JrQ29uZmlnOiBOZXR3b3JrQ29uZmlnID0ge1xuICAgICAgaG9zdGVkWm9uZUlkOiBob3N0ZWRab25lSWQsXG4gICAgICBob3N0ZWRab25lTmFtZTogaG9zdGVkWm9uZU5hbWUsXG4gICAgICBzc2xDZXJ0aWZpY2F0ZUFybjogc3NsQ2VydGlmaWNhdGVBcm4sXG4gICAgICBob3N0bmFtZTogaG9zdG5hbWVBdXRoZW50aWtcbiAgICB9O1xuXG4gICAgY29uc3QgbGRhcE5ldHdvcmtDb25maWc6IE5ldHdvcmtDb25maWcgPSB7XG4gICAgICBob3N0ZWRab25lSWQ6IGhvc3RlZFpvbmVJZCxcbiAgICAgIGhvc3RlZFpvbmVOYW1lOiBob3N0ZWRab25lTmFtZSxcbiAgICAgIHNzbENlcnRpZmljYXRlQXJuOiBzc2xDZXJ0aWZpY2F0ZUFybixcbiAgICAgIGhvc3RuYW1lOiBob3N0bmFtZUxkYXBcbiAgICB9O1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBBUFBMSUNBVElPTiBTRVJWSUNFU1xuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBBdXRoZW50aWsgTG9hZCBCYWxhbmNlclxuICAgIGNvbnN0IGF1dGhlbnRpa0VMQiA9IG5ldyBFbGIodGhpcywgJ0F1dGhlbnRpa0VMQicsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAgaW5mcmFzdHJ1Y3R1cmU6IGF1dGhlbnRpa0luZnJhc3RydWN0dXJlQ29uZmlnLFxuICAgICAgbmV0d29yazogYXV0aGVudGlrTmV0d29ya0NvbmZpZ1xuICAgIH0pO1xuXG4gICAgLy8gQXV0aGVudGlrIFNlcnZlclxuICAgIGNvbnN0IGF1dGhlbnRpa1NlcnZlciA9IG5ldyBBdXRoZW50aWtTZXJ2ZXIodGhpcywgJ0F1dGhlbnRpa1NlcnZlcicsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAgaW5mcmFzdHJ1Y3R1cmU6IGF1dGhlbnRpa0luZnJhc3RydWN0dXJlQ29uZmlnLFxuICAgICAgc2VjcmV0czogc2VjcmV0c0NvbmZpZyxcbiAgICAgIHN0b3JhZ2U6IHN0b3JhZ2VDb25maWcsXG4gICAgICBkZXBsb3ltZW50OiBkZXBsb3ltZW50Q29uZmlnLFxuICAgICAgYXBwbGljYXRpb246IGFwcGxpY2F0aW9uQ29uZmlnXG4gICAgfSk7XG5cbiAgICAvLyBBdXRoZW50aWsgV29ya2VyICBcbiAgICAvLyBVcGRhdGUgYXV0aGVudGljYXRpb24gaG9zdCBmb3Igd29ya2VyIGFmdGVyIFJvdXRlNTMgc2V0dXBcbiAgICBjb25zdCBhdXRoZW50aWtXb3JrZXJDb25maWcgPSB7IC4uLmFwcGxpY2F0aW9uQ29uZmlnIH07XG4gICAgY29uc3QgYXV0aGVudGlrV29ya2VyID0gbmV3IEF1dGhlbnRpa1dvcmtlcih0aGlzLCAnQXV0aGVudGlrV29ya2VyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogZW52aXJvbm1lbnRDb25maWcsXG4gICAgICBpbmZyYXN0cnVjdHVyZTogYXV0aGVudGlrSW5mcmFzdHJ1Y3R1cmVDb25maWcsXG4gICAgICBzZWNyZXRzOiBzZWNyZXRzQ29uZmlnLFxuICAgICAgc3RvcmFnZTogc3RvcmFnZUNvbmZpZyxcbiAgICAgIGRlcGxveW1lbnQ6IGRlcGxveW1lbnRDb25maWcsXG4gICAgICBhcHBsaWNhdGlvbjogYXV0aGVudGlrV29ya2VyQ29uZmlnXG4gICAgfSk7XG5cbiAgICAvLyBDb25uZWN0IEF1dGhlbnRpayBTZXJ2ZXIgdG8gTG9hZCBCYWxhbmNlclxuICAgIGF1dGhlbnRpa1NlcnZlci5jcmVhdGVUYXJnZXRHcm91cCh2cGMsIGF1dGhlbnRpa0VMQi5odHRwc0xpc3RlbmVyKTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gRE5TIFNFVFVQIChBVVRIRU5USUspXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vIFJvdXRlNTMgQXV0aGVudGlrIEROUyBSZWNvcmRzIChuZWVkZWQgYmVmb3JlIExEQVAgdG9rZW4gcmV0cmlldmVyKVxuICAgIGNvbnN0IHJvdXRlNTNBdXRoZW50aWsgPSBuZXcgUm91dGU1M0F1dGhlbnRpayh0aGlzLCAnUm91dGU1M0F1dGhlbnRpaycsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAgbmV0d29yazogYXV0aGVudGlrTmV0d29ya0NvbmZpZyxcbiAgICAgIGF1dGhlbnRpa0xvYWRCYWxhbmNlcjogYXV0aGVudGlrRUxCLmxvYWRCYWxhbmNlclxuICAgIH0pO1xuXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cbiAgICAvLyBMREFQIENPTkZJR1VSQVRJT05cbiAgICAvLyA9PT09PT09PT09PT09PT09PVxuXG4gICAgLy8gQnVpbGQgdG9rZW4gY29uZmlnIGZvciBMREFQIHRva2VuIHJldHJpZXZhbFxuICAgIGNvbnN0IHRva2VuQ29uZmlnOiBUb2tlbkNvbmZpZyA9IHtcbiAgICAgIG91dHBvc3ROYW1lOiAnTERBUCcsXG4gICAgICBhZG1pblRva2VuU2VjcmV0OiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJUb2tlbixcbiAgICAgIGxkYXBUb2tlblNlY3JldDogc2VjcmV0c01hbmFnZXIubGRhcFRva2VuLFxuICAgICAgYXV0aGVudGlrU2VydmVyU2VydmljZTogYXV0aGVudGlrU2VydmVyLmVjc1NlcnZpY2UsXG4gICAgICBhdXRoZW50aWtXb3JrZXJTZXJ2aWNlOiBhdXRoZW50aWtXb3JrZXIuZWNzU2VydmljZVxuICAgIH07XG5cbiAgICAvLyBVcGRhdGUgYXBwbGljYXRpb24gY29uZmlnIHdpdGggcHJvcGVyIEF1dGhlbnRpayBVUkxcbiAgICBjb25zdCBsZGFwQXBwbGljYXRpb25Db25maWc6IEF1dGhlbnRpa0FwcGxpY2F0aW9uQ29uZmlnID0ge1xuICAgICAgLi4uYXBwbGljYXRpb25Db25maWcsXG4gICAgICBhdXRoZW50aWtIb3N0OiByb3V0ZTUzQXV0aGVudGlrLmdldEF1dGhlbnRpa1VybCgpXG4gICAgfTtcblxuICAgIC8vIExEQVAgVG9rZW4gUmV0cmlldmVyXG4gICAgY29uc3QgbGRhcFRva2VuUmV0cmlldmVyID0gbmV3IExkYXBUb2tlblJldHJpZXZlcih0aGlzLCAnTGRhcFRva2VuUmV0cmlldmVyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogZW52aXJvbm1lbnRDb25maWcsXG4gICAgICBpbmZyYXN0cnVjdHVyZTogYXV0aGVudGlrSW5mcmFzdHJ1Y3R1cmVDb25maWcsXG4gICAgICBkZXBsb3ltZW50OiBkZXBsb3ltZW50Q29uZmlnLFxuICAgICAgdG9rZW46IHRva2VuQ29uZmlnLFxuICAgICAgYXBwbGljYXRpb246IGxkYXBBcHBsaWNhdGlvbkNvbmZpZ1xuICAgIH0pO1xuXG4gICAgLy8gTERBUFxuICAgIGNvbnN0IGxkYXAgPSBuZXcgTGRhcCh0aGlzLCAnTERBUCcsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWc6IGVudmlyb25tZW50Q29uZmlnLFxuICAgICAgaW5mcmFzdHJ1Y3R1cmU6IGxkYXBJbmZyYXN0cnVjdHVyZUNvbmZpZyxcbiAgICAgIHN0b3JhZ2U6IHN0b3JhZ2VDb25maWcsXG4gICAgICBkZXBsb3ltZW50OiBkZXBsb3ltZW50Q29uZmlnLFxuICAgICAgbmV0d29yazogbGRhcE5ldHdvcmtDb25maWcsXG4gICAgICBhcHBsaWNhdGlvbjogbGRhcEFwcGxpY2F0aW9uQ29uZmlnLFxuICAgICAgbGRhcFRva2VuOiBzZWNyZXRzTWFuYWdlci5sZGFwVG9rZW5cbiAgICB9KTtcblxuICAgIC8vIEVuc3VyZSBMREFQIHdhaXRzIGZvciB0aGUgdG9rZW4gdG8gYmUgcmV0cmlldmVkXG4gICAgbGRhcC5ub2RlLmFkZERlcGVuZGVuY3kobGRhcFRva2VuUmV0cmlldmVyKTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gRE5TIEFORCBST1VUSU5HXG4gICAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gRE5TIFNFVFVQIChMREFQKVxuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBSb3V0ZTUzIExEQVAgRE5TIFJlY29yZHMgKGFmdGVyIExEQVAgY29uc3RydWN0IGlzIGNyZWF0ZWQpXG4gICAgY29uc3Qgcm91dGU1MyA9IG5ldyBSb3V0ZTUzKHRoaXMsICdSb3V0ZTUzJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZzogZW52aXJvbm1lbnRDb25maWcsXG4gICAgICBuZXR3b3JrOiBsZGFwTmV0d29ya0NvbmZpZyxcbiAgICAgIGxkYXBMb2FkQmFsYW5jZXI6IGxkYXAubG9hZEJhbGFuY2VyXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgZGVwZW5kZW5jeSBmb3IgTERBUCB0b2tlbiByZXRyaWV2ZXIgdG8gd2FpdCBmb3IgQXV0aGVudGlrIEROUyByZWNvcmRzXG4gICAgbGRhcFRva2VuUmV0cmlldmVyLmN1c3RvbVJlc291cmNlLm5vZGUuYWRkRGVwZW5kZW5jeShyb3V0ZTUzQXV0aGVudGlrLmF1dGhlbnRpa0FSZWNvcmQpO1xuICAgIGxkYXBUb2tlblJldHJpZXZlci5jdXN0b21SZXNvdXJjZS5ub2RlLmFkZERlcGVuZGVuY3kocm91dGU1M0F1dGhlbnRpay5hdXRoZW50aWtBQUFBUmVjb3JkKTtcblxuICAgIC8vID09PT09PT09PT09PT09PT09XG4gICAgLy8gU1RBQ0sgT1VUUFVUU1xuICAgIC8vID09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgcmVnaXN0ZXJPdXRwdXRzKHtcbiAgICAgIHN0YWNrOiB0aGlzLFxuICAgICAgc3RhY2tOYW1lOiBzdGFja05hbWUsXG4gICAgICBkYXRhYmFzZUVuZHBvaW50OiBkYXRhYmFzZS5ob3N0bmFtZSxcbiAgICAgIGRhdGFiYXNlU2VjcmV0QXJuOiBkYXRhYmFzZS5tYXN0ZXJTZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgcmVkaXNFbmRwb2ludDogcmVkaXMuaG9zdG5hbWUsXG4gICAgICByZWRpc0F1dGhUb2tlbkFybjogcmVkaXMuYXV0aFRva2VuLnNlY3JldEFybixcbiAgICAgIGVmc0lkOiBlZnMuZmlsZVN5c3RlbS5maWxlU3lzdGVtSWQsXG4gICAgICBlZnNNZWRpYUFjY2Vzc1BvaW50SWQ6IGVmcy5tZWRpYUFjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWQsXG4gICAgICBlZnNUZW1wbGF0ZXNBY2Nlc3NQb2ludElkOiBlZnMuY3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnQuYWNjZXNzUG9pbnRJZCxcbiAgICAgIGF1dGhlbnRpa1NlY3JldEtleUFybjogc2VjcmV0c01hbmFnZXIuc2VjcmV0S2V5LnNlY3JldEFybixcbiAgICAgIGF1dGhlbnRpa0FkbWluVG9rZW5Bcm46IHNlY3JldHNNYW5hZ2VyLmFkbWluVXNlclRva2VuLnNlY3JldEFybixcbiAgICAgIGF1dGhlbnRpa0xkYXBUb2tlbkFybjogc2VjcmV0c01hbmFnZXIubGRhcFRva2VuLnNlY3JldEFybixcbiAgICAgIGF1dGhlbnRpa0FsYkRuczogYXV0aGVudGlrRUxCLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lLFxuICAgICAgYXV0aGVudGlrVXJsOiBgaHR0cHM6Ly8ke2F1dGhlbnRpa0VMQi5kbnNOYW1lfWAsXG4gICAgICBsZGFwTmxiRG5zOiBsZGFwLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lLFxuICAgICAgbGRhcEVuZHBvaW50OiBgbGRhcDovLyR7bGRhcC5kbnNOYW1lfTozODlgLFxuICAgICAgbGRhcHNFbmRwb2ludDogYGxkYXBzOi8vJHtsZGFwLmRuc05hbWV9OjYzNmAsXG4gICAgICBsZGFwVG9rZW5SZXRyaWV2ZXJMYW1iZGFBcm46IGxkYXBUb2tlblJldHJpZXZlci5sYW1iZGFGdW5jdGlvbi5mdW5jdGlvbkFyblxuICAgIH0pO1xuICB9XG5cbiAgLy8gPT09PT09PT09PT09PT09PT1cbiAgLy8gSEVMUEVSIE1FVEhPRFNcbiAgLy8gPT09PT09PT09PT09PT09PT1cblxuICAvKipcbiAgICogQ3JlYXRlIHNlY3VyaXR5IGdyb3VwIGZvciBBdXRoZW50aWsgRUNTIHRhc2tzIChTZXJ2ZXIvV29ya2VyKVxuICAgKiBAcGFyYW0gdnBjIFRoZSBWUEMgdG8gY3JlYXRlIHRoZSBzZWN1cml0eSBncm91cCBpblxuICAgKiBAcGFyYW0gc3RhY2tOYW1lQ29tcG9uZW50IFRoZSBzdGFjayBuYW1lIGNvbXBvbmVudCBmb3IgaW1wb3J0c1xuICAgKiBAcmV0dXJucyBUaGUgY3JlYXRlZCBzZWN1cml0eSBncm91cFxuICAgKi9cbiAgcHJpdmF0ZSBjcmVhdGVBdXRoZW50aWtTZWN1cml0eUdyb3VwKHZwYzogZWMyLklWcGMsIHN0YWNrTmFtZUNvbXBvbmVudDogc3RyaW5nKTogZWMyLlNlY3VyaXR5R3JvdXAge1xuICAgIGNvbnN0IGF1dGhlbnRpa1NlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0F1dGhlbnRpa1NlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBBdXRoZW50aWsgRUNTIHRhc2tzIChTZXJ2ZXIvV29ya2VyKScsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBIVFRQL0hUVFBTIHRyYWZmaWMgdG8gQXV0aGVudGlrIHRhc2tzXG4gICAgYXV0aGVudGlrU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg4MCksXG4gICAgICAnQWxsb3cgSFRUUCB0cmFmZmljJ1xuICAgICk7XG5cbiAgICBhdXRoZW50aWtTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuYW55SXB2NCgpLFxuICAgICAgZWMyLlBvcnQudGNwKDQ0MyksXG4gICAgICAnQWxsb3cgSFRUUFMgdHJhZmZpYydcbiAgICApO1xuXG4gICAgLy8gQWxsb3cgQXV0aGVudGlrIGFwcGxpY2F0aW9uIHRyYWZmaWMgKHBvcnQgOTAwMCkgZnJvbSBWUEMgQ0lEUlxuICAgIGF1dGhlbnRpa1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5pcHY0KEZuLmltcG9ydFZhbHVlKGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShzdGFja05hbWVDb21wb25lbnQsIEJBU0VfRVhQT1JUX05BTUVTLlZQQ19DSURSX0lQVjQpKSksXG4gICAgICBlYzIuUG9ydC50Y3AoOTAwMCksXG4gICAgICAnQWxsb3cgQXV0aGVudGlrIHRyYWZmaWMgZnJvbSBWUEMnXG4gICAgKTtcblxuICAgIHJldHVybiBhdXRoZW50aWtTZWN1cml0eUdyb3VwO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBzZWN1cml0eSBncm91cCBmb3IgTERBUCBFQ1MgdGFza3NcbiAgICogQHBhcmFtIHZwYyBUaGUgVlBDIHRvIGNyZWF0ZSB0aGUgc2VjdXJpdHkgZ3JvdXAgaW5cbiAgICogQHBhcmFtIHN0YWNrTmFtZUNvbXBvbmVudCBUaGUgc3RhY2sgbmFtZSBjb21wb25lbnQgZm9yIGltcG9ydHNcbiAgICogQHJldHVybnMgVGhlIGNyZWF0ZWQgc2VjdXJpdHkgZ3JvdXBcbiAgICovXG4gIHByaXZhdGUgY3JlYXRlTGRhcFNlY3VyaXR5R3JvdXAodnBjOiBlYzIuSVZwYywgc3RhY2tOYW1lQ29tcG9uZW50OiBzdHJpbmcpOiBlYzIuU2VjdXJpdHlHcm91cCB7XG4gICAgY29uc3QgbGRhcFNlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0xkYXBTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgTERBUCBFQ1MgdGFza3MnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogdHJ1ZVxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgTERBUCB0cmFmZmljIChwb3J0IDMzODkpIGZyb20gVlBDIENJRFJcbiAgICBsZGFwU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmlwdjQoRm4uaW1wb3J0VmFsdWUoY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuVlBDX0NJRFJfSVBWNCkpKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCgzMzg5KSxcbiAgICAgICdBbGxvdyBMREFQIHRyYWZmaWMgZnJvbSBWUEMnXG4gICAgKTtcblxuICAgIC8vIEFsbG93IExEQVBTIHRyYWZmaWMgKHBvcnQgNjYzNikgZnJvbSBWUEMgQ0lEUlxuICAgIGxkYXBTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuaXB2NChGbi5pbXBvcnRWYWx1ZShjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5WUENfQ0lEUl9JUFY0KSkpLFxuICAgICAgZWMyLlBvcnQudGNwKDY2MzYpLFxuICAgICAgJ0FsbG93IExEQVBTIHRyYWZmaWMgZnJvbSBWUEMnXG4gICAgKTtcblxuICAgIHJldHVybiBsZGFwU2VjdXJpdHlHcm91cDtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgc2VjdXJpdHkgZ3JvdXAgZm9yIEVDUyB0YXNrcyAoTGVnYWN5IC0ga2VlcGluZyBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eSlcbiAgICogQHBhcmFtIHZwYyBUaGUgVlBDIHRvIGNyZWF0ZSB0aGUgc2VjdXJpdHkgZ3JvdXAgaW5cbiAgICogQHJldHVybnMgVGhlIGNyZWF0ZWQgc2VjdXJpdHkgZ3JvdXBcbiAgICovXG4gIHByaXZhdGUgY3JlYXRlRWNzU2VjdXJpdHlHcm91cCh2cGM6IGVjMi5JVnBjKTogZWMyLlNlY3VyaXR5R3JvdXAge1xuICAgIGNvbnN0IGVjc1NlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0VDU1NlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBFQ1MgdGFza3MnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogdHJ1ZVxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgSFRUUC9IVFRQUyB0cmFmZmljIHRvIEVDUyB0YXNrc1xuICAgIGVjc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5hbnlJcHY0KCksXG4gICAgICBlYzIuUG9ydC50Y3AoODApLFxuICAgICAgJ0FsbG93IEhUVFAgdHJhZmZpYydcbiAgICApO1xuXG4gICAgZWNzU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg0NDMpLFxuICAgICAgJ0FsbG93IEhUVFBTIHRyYWZmaWMnXG4gICAgKTtcblxuICAgIGVjc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5hbnlJcHY0KCksXG4gICAgICBlYzIuUG9ydC50Y3AoOTAwMCksXG4gICAgICAnQWxsb3cgQXV0aGVudGlrIHRyYWZmaWMnXG4gICAgKTtcblxuICAgIHJldHVybiBlY3NTZWN1cml0eUdyb3VwO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBzZWN1cml0eSBncm91cCBmb3IgZGF0YWJhc2UgYWNjZXNzXG4gICAqIEBwYXJhbSB2cGMgVGhlIFZQQyB0byBjcmVhdGUgdGhlIHNlY3VyaXR5IGdyb3VwIGluXG4gICAqIEBwYXJhbSBlY3NTZWN1cml0eUdyb3VwIFRoZSBFQ1Mgc2VjdXJpdHkgZ3JvdXAgdG8gYWxsb3cgYWNjZXNzIGZyb21cbiAgICogQHJldHVybnMgVGhlIGNyZWF0ZWQgc2VjdXJpdHkgZ3JvdXBcbiAgICovXG4gIHByaXZhdGUgY3JlYXRlRGJTZWN1cml0eUdyb3VwKHZwYzogZWMyLklWcGMsIGVjc1NlY3VyaXR5R3JvdXA6IGVjMi5TZWN1cml0eUdyb3VwKTogZWMyLlNlY3VyaXR5R3JvdXAge1xuICAgIGNvbnN0IGRiU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnREJTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgZGF0YWJhc2UnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogZmFsc2VcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IFBvc3RncmVTUUwgYWNjZXNzIGZyb20gRUNTIHRhc2tzXG4gICAgZGJTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuc2VjdXJpdHlHcm91cElkKGVjc1NlY3VyaXR5R3JvdXAuc2VjdXJpdHlHcm91cElkKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg1NDMyKSxcbiAgICAgICdBbGxvdyBQb3N0Z3JlU1FMIGFjY2VzcyBmcm9tIEVDUyB0YXNrcydcbiAgICApO1xuXG4gICAgcmV0dXJuIGRiU2VjdXJpdHlHcm91cDtcbiAgfVxufVxuXG4vKipcbiAqIENvbnZlcnRzIGFuIEVDUiByZXBvc2l0b3J5IEFSTiB0byBhIHByb3BlciBFQ1IgcmVwb3NpdG9yeSBVUkkgZm9yIERvY2tlciBpbWFnZXNcbiAqIEBwYXJhbSBlY3JBcm4gLSBFQ1IgcmVwb3NpdG9yeSBBUk4gKGUuZy4sIFwiYXJuOmF3czplY3I6cmVnaW9uOmFjY291bnQ6cmVwb3NpdG9yeS9yZXBvLW5hbWVcIilcbiAqIEByZXR1cm5zIEVDUiByZXBvc2l0b3J5IFVSSSAoZS5nLiwgXCJhY2NvdW50LmRrci5lY3IucmVnaW9uLmFtYXpvbmF3cy5jb20vcmVwby1uYW1lXCIpXG4gKi9cbmZ1bmN0aW9uIGNvbnZlcnRFY3JBcm5Ub1JlcG9zaXRvcnlVcmkoZWNyQXJuOiBzdHJpbmcpOiBzdHJpbmcge1xuICAvLyBQYXJzZSBBUk46IGFybjphd3M6ZWNyOnJlZ2lvbjphY2NvdW50OnJlcG9zaXRvcnkvcmVwby1uYW1lXG4gIGNvbnN0IGFyblBhcnRzID0gZWNyQXJuLnNwbGl0KCc6Jyk7XG4gIGlmIChhcm5QYXJ0cy5sZW5ndGggIT09IDYgfHwgIWFyblBhcnRzWzVdLnN0YXJ0c1dpdGgoJ3JlcG9zaXRvcnkvJykpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgRUNSIHJlcG9zaXRvcnkgQVJOIGZvcm1hdDogJHtlY3JBcm59YCk7XG4gIH1cbiAgXG4gIGNvbnN0IHJlZ2lvbiA9IGFyblBhcnRzWzNdO1xuICBjb25zdCBhY2NvdW50ID0gYXJuUGFydHNbNF07XG4gIGNvbnN0IHJlcG9zaXRvcnlOYW1lID0gYXJuUGFydHNbNV0ucmVwbGFjZSgncmVwb3NpdG9yeS8nLCAnJyk7XG4gIFxuICByZXR1cm4gYCR7YWNjb3VudH0uZGtyLmVjci4ke3JlZ2lvbn0uYW1hem9uYXdzLmNvbS8ke3JlcG9zaXRvcnlOYW1lfWA7XG59XG4iXX0=