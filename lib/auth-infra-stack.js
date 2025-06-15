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
const stack_naming_1 = require("./stack-naming");
const environment_config_1 = require("./environment-config");
const parameters_1 = require("./parameters");
const outputs_1 = require("./outputs");
const database_1 = require("./constructs/database");
const redis_1 = require("./constructs/redis");
const efs_1 = require("./constructs/efs");
const secrets_manager_1 = require("./constructs/secrets-manager");
const authentik_1 = require("./constructs/authentik");
const ldap_1 = require("./constructs/ldap");
const ldap_token_retriever_1 = require("./constructs/ldap-token-retriever");
/**
 * Main CDK stack for the Auth Infrastructure
 */
class AuthInfraStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, {
            ...props,
            description: props.description || 'TAK Authentication Layer - Authentik',
        });
        // Resolve parameters from context, env vars, or defaults
        const params = (0, parameters_1.resolveStackParameters)(this);
        const envType = (props.envType || params.envType);
        const resolvedStackName = id;
        // Get environment configuration
        const config = (0, environment_config_1.getEnvironmentConfig)(envType);
        // Add Environment Type tag to the stack
        const environmentLabel = envType === 'prod' ? 'Prod' : 'Dev-Test';
        cdk.Tags.of(this).add('Environment Type', environmentLabel);
        const stackName = aws_cdk_lib_1.Fn.ref('AWS::StackName');
        const region = cdk.Stack.of(this).region;
        // Import VPC and networking from base infrastructure
        const vpc = aws_cdk_lib_1.aws_ec2.Vpc.fromLookup(this, 'VPC', {
            vpcId: (0, stack_naming_1.createBaseImportValue)(resolvedStackName, 'vpc-id')
        });
        // Import KMS key from base infrastructure
        const kmsKey = aws_cdk_lib_1.aws_kms.Key.fromKeyArn(this, 'KMSKey', (0, stack_naming_1.createBaseImportValue)(resolvedStackName, 'kms'));
        // Create ECS cluster
        const ecsCluster = new aws_cdk_lib_1.aws_ecs.Cluster(this, 'ECSCluster', {
            vpc,
            clusterName: `${id}-cluster`,
            enableFargateCapacityProviders: true
        });
        // Create security group for ECS tasks
        const ecsSecurityGroup = new aws_cdk_lib_1.aws_ec2.SecurityGroup(this, 'ECSSecurityGroup', {
            vpc,
            description: 'Security group for ECS tasks',
            allowAllOutbound: true
        });
        // Allow HTTP/HTTPS traffic to ECS tasks
        ecsSecurityGroup.addIngressRule(aws_cdk_lib_1.aws_ec2.Peer.anyIpv4(), aws_cdk_lib_1.aws_ec2.Port.tcp(80), 'Allow HTTP traffic');
        ecsSecurityGroup.addIngressRule(aws_cdk_lib_1.aws_ec2.Peer.anyIpv4(), aws_cdk_lib_1.aws_ec2.Port.tcp(443), 'Allow HTTPS traffic');
        ecsSecurityGroup.addIngressRule(aws_cdk_lib_1.aws_ec2.Peer.anyIpv4(), aws_cdk_lib_1.aws_ec2.Port.tcp(9000), 'Allow Authentik traffic');
        // Create security group for database
        const dbSecurityGroup = new aws_cdk_lib_1.aws_ec2.SecurityGroup(this, 'DBSecurityGroup', {
            vpc,
            description: 'Security group for database',
            allowAllOutbound: false
        });
        // Allow PostgreSQL access from ECS tasks
        dbSecurityGroup.addIngressRule(aws_cdk_lib_1.aws_ec2.Peer.securityGroupId(ecsSecurityGroup.securityGroupId), aws_cdk_lib_1.aws_ec2.Port.tcp(5432), 'Allow PostgreSQL access from ECS tasks');
        // Create security group for Redis
        const redisSecurityGroup = new aws_cdk_lib_1.aws_ec2.SecurityGroup(this, 'RedisSecurityGroup', {
            vpc,
            description: 'Security group for Redis',
            allowAllOutbound: false
        });
        // Allow Redis access from ECS tasks
        redisSecurityGroup.addIngressRule(aws_cdk_lib_1.aws_ec2.Peer.securityGroupId(ecsSecurityGroup.securityGroupId), aws_cdk_lib_1.aws_ec2.Port.tcp(6379), 'Allow Redis access from ECS tasks');
        // Create SecretsManager construct
        this.secretsManager = new secrets_manager_1.SecretsManager(this, 'SecretsManager', {
            environment: resolvedStackName,
            kmsKey
        });
        // Create Database construct
        this.database = new database_1.Database(this, 'Database', {
            environment: resolvedStackName,
            config,
            vpc,
            kmsKey,
            securityGroups: [dbSecurityGroup]
        });
        // Create Redis construct
        this.redis = new redis_1.Redis(this, 'Redis', {
            environment: resolvedStackName,
            config,
            vpc,
            kmsKey,
            securityGroups: [redisSecurityGroup]
        });
        // Create EFS construct
        this.efs = new efs_1.Efs(this, 'EFS', {
            environment: resolvedStackName,
            vpc,
            kmsKey,
            allowAccessFrom: [ecsSecurityGroup]
        });
        // Create Authentik construct
        this.authentik = new authentik_1.Authentik(this, 'Authentik', {
            environment: resolvedStackName,
            config,
            vpc,
            ecsSecurityGroup,
            ecsCluster,
            sslCertificateArn: params.sslCertificateArn || '',
            adminUserEmail: params.authentikAdminUserEmail,
            ldapBaseDn: params.authentikLdapBaseDn,
            useConfigFile: params.useAuthentikConfigFile || false,
            ipAddressType: params.ipAddressType,
            dockerImageLocation: params.dockerImageLocation || 'Github',
            enableExecute: params.enableExecute,
            dbSecret: this.database.masterSecret,
            dbHostname: this.database.hostname,
            redisAuthToken: this.redis.authToken,
            redisHostname: this.redis.hostname,
            secretKey: this.secretsManager.secretKey,
            adminUserPassword: this.secretsManager.adminUserPassword,
            adminUserToken: this.secretsManager.adminUserToken,
            ldapToken: this.secretsManager.ldapToken,
            efsId: this.efs.fileSystem.fileSystemId,
            efsMediaAccessPointId: this.efs.mediaAccessPoint.accessPointId,
            efsCustomTemplatesAccessPointId: this.efs.customTemplatesAccessPoint.accessPointId
        });
        // Create LDAP token retriever to get the token from Authentik
        this.ldapTokenRetriever = new ldap_token_retriever_1.LdapTokenRetriever(this, 'LdapTokenRetriever', {
            environment: resolvedStackName,
            config,
            kmsKey,
            authentikHost: `https://${this.authentik.dnsName}`,
            outpostName: 'LDAP',
            adminTokenSecret: this.secretsManager.adminUserToken,
            ldapTokenSecret: this.secretsManager.ldapToken,
            gitSha: params.gitSha
        });
        // Create LDAP outpost construct
        this.ldap = new ldap_1.Ldap(this, 'LDAP', {
            environment: resolvedStackName,
            config,
            vpc,
            ecsSecurityGroup,
            ecsCluster,
            sslCertificateArn: params.sslCertificateArn || '',
            authentikHost: this.authentik.dnsName,
            dockerImageLocation: params.dockerImageLocation || 'Github',
            enableExecute: params.enableExecute,
            ldapToken: this.secretsManager.ldapToken
        });
        // Ensure LDAP waits for the token to be retrieved
        this.ldap.node.addDependency(this.ldapTokenRetriever);
        // Register outputs using the centralized outputs system
        (0, outputs_1.registerAuthInfraOutputs)({
            stack: this,
            stackName: resolvedStackName,
            databaseEndpoint: this.database.hostname,
            databaseSecretArn: this.database.masterSecret.secretArn,
            redisEndpoint: this.redis.hostname,
            redisAuthTokenArn: this.redis.authToken.secretArn,
            efsId: this.efs.fileSystem.fileSystemId,
            efsMediaAccessPointId: this.efs.mediaAccessPoint.accessPointId,
            efsTemplatesAccessPointId: this.efs.customTemplatesAccessPoint.accessPointId,
            authentikSecretKeyArn: this.secretsManager.secretKey.secretArn,
            authentikAdminTokenArn: this.secretsManager.adminUserToken.secretArn,
            authentikLdapTokenArn: this.secretsManager.ldapToken.secretArn,
            authentikAlbDns: this.authentik.loadBalancer.loadBalancerDnsName,
            authentikUrl: `https://${this.authentik.dnsName}`,
            ldapAlbDns: this.ldap.loadBalancer.loadBalancerDnsName,
            ldapEndpoint: `${this.ldap.loadBalancer.loadBalancerDnsName}:389`,
            ldapsEndpoint: `${this.ldap.loadBalancer.loadBalancerDnsName}:636`,
            ldapTokenRetrieverLambdaArn: this.ldapTokenRetriever.lambdaFunction.functionArn
        });
    }
}
exports.AuthInfraStack = AuthInfraStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGgtaW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFJQSxpREFBbUM7QUFDbkMsNkNBUXFCO0FBQ3JCLGlEQUF1RDtBQUN2RCw2REFBNEQ7QUFDNUQsNkNBQXNEO0FBQ3RELHVDQUFxRDtBQUNyRCxvREFBaUQ7QUFDakQsOENBQTJDO0FBQzNDLDBDQUF1QztBQUN2QyxrRUFBOEQ7QUFDOUQsc0RBQW1EO0FBQ25ELDRDQUF5QztBQUN6Qyw0RUFBdUU7QUFZdkU7O0dBRUc7QUFDSCxNQUFhLGNBQWUsU0FBUSxtQkFBSztJQW9DdkMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEwQjtRQUNsRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRTtZQUNmLEdBQUcsS0FBSztZQUNSLFdBQVcsRUFBRSxLQUFLLENBQUMsV0FBVyxJQUFJLHNDQUFzQztTQUN6RSxDQUFDLENBQUM7UUFFSCx5REFBeUQ7UUFDekQsTUFBTSxNQUFNLEdBQUcsSUFBQSxtQ0FBc0IsRUFBQyxJQUFJLENBQUMsQ0FBQztRQUU1QyxNQUFNLE9BQU8sR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBd0IsQ0FBQztRQUN6RSxNQUFNLGlCQUFpQixHQUFHLEVBQUUsQ0FBQztRQUU3QixnQ0FBZ0M7UUFDaEMsTUFBTSxNQUFNLEdBQUcsSUFBQSx5Q0FBb0IsRUFBQyxPQUFPLENBQUMsQ0FBQztRQUU3Qyx3Q0FBd0M7UUFDeEMsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQztRQUNsRSxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLEVBQUUs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LEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsQ0FBQyxhQUFhO1lBQzVFLHFCQUFxQixFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLFNBQVM7WUFDOUQsc0JBQXNCLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxjQUFjLENBQUMsU0FBUztZQUNwRSxxQkFBcUIsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxTQUFTO1lBQzlELGVBQWUsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxtQkFBbUI7WUFDaEUsWUFBWSxFQUFFLFdBQVcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUU7WUFDakQsVUFBVSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLG1CQUFtQjtZQUN0RCxZQUFZLEVBQUUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxtQkFBbUIsTUFBTTtZQUNqRSxhQUFhLEVBQUUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxtQkFBbUIsTUFBTTtZQUNsRSwyQkFBMkIsRUFBRSxJQUFJLENBQUMsa0JBQWtCLENBQUMsY0FBYyxDQUFDLFdBQVc7U0FDaEYsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBL09ELHdDQStPQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogTWFpbiBBdXRoIEluZnJhc3RydWN0dXJlIFN0YWNrIC0gQ0RLIGltcGxlbWVudGF0aW9uXG4gKi9cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7XG4gIFN0YWNrLFxuICBTdGFja1Byb3BzLFxuICBhd3NfZWMyIGFzIGVjMixcbiAgYXdzX2VjcyBhcyBlY3MsXG4gIGF3c19rbXMgYXMga21zLFxuICBDZm5PdXRwdXQsXG4gIEZuXG59IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZSB9IGZyb20gJy4vc3RhY2stbmFtaW5nJztcbmltcG9ydCB7IGdldEVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi9lbnZpcm9ubWVudC1jb25maWcnO1xuaW1wb3J0IHsgcmVzb2x2ZVN0YWNrUGFyYW1ldGVycyB9IGZyb20gJy4vcGFyYW1ldGVycyc7XG5pbXBvcnQgeyByZWdpc3RlckF1dGhJbmZyYU91dHB1dHMgfSBmcm9tICcuL291dHB1dHMnO1xuaW1wb3J0IHsgRGF0YWJhc2UgfSBmcm9tICcuL2NvbnN0cnVjdHMvZGF0YWJhc2UnO1xuaW1wb3J0IHsgUmVkaXMgfSBmcm9tICcuL2NvbnN0cnVjdHMvcmVkaXMnO1xuaW1wb3J0IHsgRWZzIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2Vmcyc7XG5pbXBvcnQgeyBTZWNyZXRzTWFuYWdlciB9IGZyb20gJy4vY29uc3RydWN0cy9zZWNyZXRzLW1hbmFnZXInO1xuaW1wb3J0IHsgQXV0aGVudGlrIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2F1dGhlbnRpayc7XG5pbXBvcnQgeyBMZGFwIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2xkYXAnO1xuaW1wb3J0IHsgTGRhcFRva2VuUmV0cmlldmVyIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2xkYXAtdG9rZW4tcmV0cmlldmVyJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciB0aGUgQXV0aCBJbmZyYXN0cnVjdHVyZSBTdGFja1xuICovXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhJbmZyYVN0YWNrUHJvcHMgZXh0ZW5kcyBTdGFja1Byb3BzIHtcbiAgLyoqXG4gICAqIEVudmlyb25tZW50IHR5cGVcbiAgICovXG4gIGVudlR5cGU/OiAncHJvZCcgfCAnZGV2LXRlc3QnO1xufVxuXG4vKipcbiAqIE1haW4gQ0RLIHN0YWNrIGZvciB0aGUgQXV0aCBJbmZyYXN0cnVjdHVyZVxuICovXG5leHBvcnQgY2xhc3MgQXV0aEluZnJhU3RhY2sgZXh0ZW5kcyBTdGFjayB7XG4gIC8qKlxuICAgKiBUaGUgZGF0YWJhc2UgY29uc3RydWN0XG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgZGF0YWJhc2U6IERhdGFiYXNlO1xuXG4gIC8qKlxuICAgKiBUaGUgUmVkaXMgY29uc3RydWN0XG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgcmVkaXM6IFJlZGlzO1xuXG4gIC8qKlxuICAgKiBUaGUgRUZTIGNvbnN0cnVjdFxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGVmczogRWZzO1xuXG4gIC8qKlxuICAgKiBUaGUgc2VjcmV0cyBtYW5hZ2VyIGNvbnN0cnVjdFxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IHNlY3JldHNNYW5hZ2VyOiBTZWNyZXRzTWFuYWdlcjtcblxuICAvKipcbiAgICogVGhlIEF1dGhlbnRpayBjb25zdHJ1Y3RcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBhdXRoZW50aWs6IEF1dGhlbnRpaztcblxuICAvKipcbiAgICogVGhlIExEQVAgY29uc3RydWN0XG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgbGRhcDogTGRhcDtcblxuICAvKipcbiAgICogVGhlIExEQVAgdG9rZW4gcmV0cmlldmVyIGNvbnN0cnVjdFxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGxkYXBUb2tlblJldHJpZXZlcjogTGRhcFRva2VuUmV0cmlldmVyO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBBdXRoSW5mcmFTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCB7XG4gICAgICAuLi5wcm9wcyxcbiAgICAgIGRlc2NyaXB0aW9uOiBwcm9wcy5kZXNjcmlwdGlvbiB8fCAnVEFLIEF1dGhlbnRpY2F0aW9uIExheWVyIC0gQXV0aGVudGlrJyxcbiAgICB9KTtcblxuICAgIC8vIFJlc29sdmUgcGFyYW1ldGVycyBmcm9tIGNvbnRleHQsIGVudiB2YXJzLCBvciBkZWZhdWx0c1xuICAgIGNvbnN0IHBhcmFtcyA9IHJlc29sdmVTdGFja1BhcmFtZXRlcnModGhpcyk7XG4gICAgXG4gICAgY29uc3QgZW52VHlwZSA9IChwcm9wcy5lbnZUeXBlIHx8IHBhcmFtcy5lbnZUeXBlKSBhcyAncHJvZCcgfCAnZGV2LXRlc3QnO1xuICAgIGNvbnN0IHJlc29sdmVkU3RhY2tOYW1lID0gaWQ7XG5cbiAgICAvLyBHZXQgZW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxuICAgIGNvbnN0IGNvbmZpZyA9IGdldEVudmlyb25tZW50Q29uZmlnKGVudlR5cGUpO1xuXG4gICAgLy8gQWRkIEVudmlyb25tZW50IFR5cGUgdGFnIHRvIHRoZSBzdGFja1xuICAgIGNvbnN0IGVudmlyb25tZW50TGFiZWwgPSBlbnZUeXBlID09PSAncHJvZCcgPyAnUHJvZCcgOiAnRGV2LVRlc3QnO1xuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnRW52aXJvbm1lbnQgVHlwZScsIGVudmlyb25tZW50TGFiZWwpO1xuXG4gICAgY29uc3Qgc3RhY2tOYW1lID0gRm4ucmVmKCdBV1M6OlN0YWNrTmFtZScpO1xuICAgIGNvbnN0IHJlZ2lvbiA9IGNkay5TdGFjay5vZih0aGlzKS5yZWdpb247XG5cbiAgICAvLyBJbXBvcnQgVlBDIGFuZCBuZXR3b3JraW5nIGZyb20gYmFzZSBpbmZyYXN0cnVjdHVyZVxuICAgIGNvbnN0IHZwYyA9IGVjMi5WcGMuZnJvbUxvb2t1cCh0aGlzLCAnVlBDJywge1xuICAgICAgdnBjSWQ6IGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShyZXNvbHZlZFN0YWNrTmFtZSwgJ3ZwYy1pZCcpXG4gICAgfSk7XG5cbiAgICAvLyBJbXBvcnQgS01TIGtleSBmcm9tIGJhc2UgaW5mcmFzdHJ1Y3R1cmVcbiAgICBjb25zdCBrbXNLZXkgPSBrbXMuS2V5LmZyb21LZXlBcm4odGhpcywgJ0tNU0tleScsIFxuICAgICAgY3JlYXRlQmFzZUltcG9ydFZhbHVlKHJlc29sdmVkU3RhY2tOYW1lLCAna21zJylcbiAgICApO1xuXG4gICAgLy8gQ3JlYXRlIEVDUyBjbHVzdGVyXG4gICAgY29uc3QgZWNzQ2x1c3RlciA9IG5ldyBlY3MuQ2x1c3Rlcih0aGlzLCAnRUNTQ2x1c3RlcicsIHtcbiAgICAgIHZwYyxcbiAgICAgIGNsdXN0ZXJOYW1lOiBgJHtpZH0tY2x1c3RlcmAsXG4gICAgICBlbmFibGVGYXJnYXRlQ2FwYWNpdHlQcm92aWRlcnM6IHRydWVcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBzZWN1cml0eSBncm91cCBmb3IgRUNTIHRhc2tzXG4gICAgY29uc3QgZWNzU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnRUNTU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIEVDUyB0YXNrcycsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBIVFRQL0hUVFBTIHRyYWZmaWMgdG8gRUNTIHRhc2tzXG4gICAgZWNzU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg4MCksXG4gICAgICAnQWxsb3cgSFRUUCB0cmFmZmljJ1xuICAgICk7XG5cbiAgICBlY3NTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuYW55SXB2NCgpLFxuICAgICAgZWMyLlBvcnQudGNwKDQ0MyksXG4gICAgICAnQWxsb3cgSFRUUFMgdHJhZmZpYydcbiAgICApO1xuXG4gICAgZWNzU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg5MDAwKSxcbiAgICAgICdBbGxvdyBBdXRoZW50aWsgdHJhZmZpYydcbiAgICApO1xuXG4gICAgLy8gQ3JlYXRlIHNlY3VyaXR5IGdyb3VwIGZvciBkYXRhYmFzZVxuICAgIGNvbnN0IGRiU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnREJTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgZGF0YWJhc2UnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogZmFsc2VcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IFBvc3RncmVTUUwgYWNjZXNzIGZyb20gRUNTIHRhc2tzXG4gICAgZGJTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuc2VjdXJpdHlHcm91cElkKGVjc1NlY3VyaXR5R3JvdXAuc2VjdXJpdHlHcm91cElkKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg1NDMyKSxcbiAgICAgICdBbGxvdyBQb3N0Z3JlU1FMIGFjY2VzcyBmcm9tIEVDUyB0YXNrcydcbiAgICApO1xuXG4gICAgLy8gQ3JlYXRlIHNlY3VyaXR5IGdyb3VwIGZvciBSZWRpc1xuICAgIGNvbnN0IHJlZGlzU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnUmVkaXNTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgUmVkaXMnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogZmFsc2VcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IFJlZGlzIGFjY2VzcyBmcm9tIEVDUyB0YXNrc1xuICAgIHJlZGlzU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLnNlY3VyaXR5R3JvdXBJZChlY3NTZWN1cml0eUdyb3VwLnNlY3VyaXR5R3JvdXBJZCksXG4gICAgICBlYzIuUG9ydC50Y3AoNjM3OSksXG4gICAgICAnQWxsb3cgUmVkaXMgYWNjZXNzIGZyb20gRUNTIHRhc2tzJ1xuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgU2VjcmV0c01hbmFnZXIgY29uc3RydWN0XG4gICAgdGhpcy5zZWNyZXRzTWFuYWdlciA9IG5ldyBTZWNyZXRzTWFuYWdlcih0aGlzLCAnU2VjcmV0c01hbmFnZXInLCB7XG4gICAgICBlbnZpcm9ubWVudDogcmVzb2x2ZWRTdGFja05hbWUsXG4gICAgICBrbXNLZXlcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBEYXRhYmFzZSBjb25zdHJ1Y3RcbiAgICB0aGlzLmRhdGFiYXNlID0gbmV3IERhdGFiYXNlKHRoaXMsICdEYXRhYmFzZScsIHtcbiAgICAgIGVudmlyb25tZW50OiByZXNvbHZlZFN0YWNrTmFtZSxcbiAgICAgIGNvbmZpZyxcbiAgICAgIHZwYyxcbiAgICAgIGttc0tleSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbZGJTZWN1cml0eUdyb3VwXVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFJlZGlzIGNvbnN0cnVjdFxuICAgIHRoaXMucmVkaXMgPSBuZXcgUmVkaXModGhpcywgJ1JlZGlzJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHJlc29sdmVkU3RhY2tOYW1lLFxuICAgICAgY29uZmlnLFxuICAgICAgdnBjLFxuICAgICAga21zS2V5LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtyZWRpc1NlY3VyaXR5R3JvdXBdXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgRUZTIGNvbnN0cnVjdFxuICAgIHRoaXMuZWZzID0gbmV3IEVmcyh0aGlzLCAnRUZTJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHJlc29sdmVkU3RhY2tOYW1lLFxuICAgICAgdnBjLFxuICAgICAga21zS2V5LFxuICAgICAgYWxsb3dBY2Nlc3NGcm9tOiBbZWNzU2VjdXJpdHlHcm91cF1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBBdXRoZW50aWsgY29uc3RydWN0XG4gICAgdGhpcy5hdXRoZW50aWsgPSBuZXcgQXV0aGVudGlrKHRoaXMsICdBdXRoZW50aWsnLCB7XG4gICAgICBlbnZpcm9ubWVudDogcmVzb2x2ZWRTdGFja05hbWUsXG4gICAgICBjb25maWcsXG4gICAgICB2cGMsXG4gICAgICBlY3NTZWN1cml0eUdyb3VwLFxuICAgICAgZWNzQ2x1c3RlcixcbiAgICAgIHNzbENlcnRpZmljYXRlQXJuOiBwYXJhbXMuc3NsQ2VydGlmaWNhdGVBcm4gfHwgJycsXG4gICAgICBhZG1pblVzZXJFbWFpbDogcGFyYW1zLmF1dGhlbnRpa0FkbWluVXNlckVtYWlsLFxuICAgICAgbGRhcEJhc2VEbjogcGFyYW1zLmF1dGhlbnRpa0xkYXBCYXNlRG4sXG4gICAgICB1c2VDb25maWdGaWxlOiBwYXJhbXMudXNlQXV0aGVudGlrQ29uZmlnRmlsZSB8fCBmYWxzZSxcbiAgICAgIGlwQWRkcmVzc1R5cGU6IHBhcmFtcy5pcEFkZHJlc3NUeXBlLFxuICAgICAgZG9ja2VySW1hZ2VMb2NhdGlvbjogcGFyYW1zLmRvY2tlckltYWdlTG9jYXRpb24gfHwgJ0dpdGh1YicsXG4gICAgICBlbmFibGVFeGVjdXRlOiBwYXJhbXMuZW5hYmxlRXhlY3V0ZSxcbiAgICAgIGRiU2VjcmV0OiB0aGlzLmRhdGFiYXNlLm1hc3RlclNlY3JldCxcbiAgICAgIGRiSG9zdG5hbWU6IHRoaXMuZGF0YWJhc2UuaG9zdG5hbWUsXG4gICAgICByZWRpc0F1dGhUb2tlbjogdGhpcy5yZWRpcy5hdXRoVG9rZW4sXG4gICAgICByZWRpc0hvc3RuYW1lOiB0aGlzLnJlZGlzLmhvc3RuYW1lLFxuICAgICAgc2VjcmV0S2V5OiB0aGlzLnNlY3JldHNNYW5hZ2VyLnNlY3JldEtleSxcbiAgICAgIGFkbWluVXNlclBhc3N3b3JkOiB0aGlzLnNlY3JldHNNYW5hZ2VyLmFkbWluVXNlclBhc3N3b3JkLFxuICAgICAgYWRtaW5Vc2VyVG9rZW46IHRoaXMuc2VjcmV0c01hbmFnZXIuYWRtaW5Vc2VyVG9rZW4sXG4gICAgICBsZGFwVG9rZW46IHRoaXMuc2VjcmV0c01hbmFnZXIubGRhcFRva2VuLFxuICAgICAgZWZzSWQ6IHRoaXMuZWZzLmZpbGVTeXN0ZW0uZmlsZVN5c3RlbUlkLFxuICAgICAgZWZzTWVkaWFBY2Nlc3NQb2ludElkOiB0aGlzLmVmcy5tZWRpYUFjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWQsXG4gICAgICBlZnNDdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludElkOiB0aGlzLmVmcy5jdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgTERBUCB0b2tlbiByZXRyaWV2ZXIgdG8gZ2V0IHRoZSB0b2tlbiBmcm9tIEF1dGhlbnRpa1xuICAgIHRoaXMubGRhcFRva2VuUmV0cmlldmVyID0gbmV3IExkYXBUb2tlblJldHJpZXZlcih0aGlzLCAnTGRhcFRva2VuUmV0cmlldmVyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHJlc29sdmVkU3RhY2tOYW1lLFxuICAgICAgY29uZmlnLFxuICAgICAga21zS2V5LFxuICAgICAgYXV0aGVudGlrSG9zdDogYGh0dHBzOi8vJHt0aGlzLmF1dGhlbnRpay5kbnNOYW1lfWAsXG4gICAgICBvdXRwb3N0TmFtZTogJ0xEQVAnLFxuICAgICAgYWRtaW5Ub2tlblNlY3JldDogdGhpcy5zZWNyZXRzTWFuYWdlci5hZG1pblVzZXJUb2tlbixcbiAgICAgIGxkYXBUb2tlblNlY3JldDogdGhpcy5zZWNyZXRzTWFuYWdlci5sZGFwVG9rZW4sXG4gICAgICBnaXRTaGE6IHBhcmFtcy5naXRTaGFcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBMREFQIG91dHBvc3QgY29uc3RydWN0XG4gICAgdGhpcy5sZGFwID0gbmV3IExkYXAodGhpcywgJ0xEQVAnLCB7XG4gICAgICBlbnZpcm9ubWVudDogcmVzb2x2ZWRTdGFja05hbWUsXG4gICAgICBjb25maWcsXG4gICAgICB2cGMsXG4gICAgICBlY3NTZWN1cml0eUdyb3VwLFxuICAgICAgZWNzQ2x1c3RlcixcbiAgICAgIHNzbENlcnRpZmljYXRlQXJuOiBwYXJhbXMuc3NsQ2VydGlmaWNhdGVBcm4gfHwgJycsXG4gICAgICBhdXRoZW50aWtIb3N0OiB0aGlzLmF1dGhlbnRpay5kbnNOYW1lLFxuICAgICAgZG9ja2VySW1hZ2VMb2NhdGlvbjogcGFyYW1zLmRvY2tlckltYWdlTG9jYXRpb24gfHwgJ0dpdGh1YicsXG4gICAgICBlbmFibGVFeGVjdXRlOiBwYXJhbXMuZW5hYmxlRXhlY3V0ZSxcbiAgICAgIGxkYXBUb2tlbjogdGhpcy5zZWNyZXRzTWFuYWdlci5sZGFwVG9rZW5cbiAgICB9KTtcblxuICAgIC8vIEVuc3VyZSBMREFQIHdhaXRzIGZvciB0aGUgdG9rZW4gdG8gYmUgcmV0cmlldmVkXG4gICAgdGhpcy5sZGFwLm5vZGUuYWRkRGVwZW5kZW5jeSh0aGlzLmxkYXBUb2tlblJldHJpZXZlcik7XG5cbiAgICAvLyBSZWdpc3RlciBvdXRwdXRzIHVzaW5nIHRoZSBjZW50cmFsaXplZCBvdXRwdXRzIHN5c3RlbVxuICAgIHJlZ2lzdGVyQXV0aEluZnJhT3V0cHV0cyh7XG4gICAgICBzdGFjazogdGhpcyxcbiAgICAgIHN0YWNrTmFtZTogcmVzb2x2ZWRTdGFja05hbWUsXG4gICAgICBkYXRhYmFzZUVuZHBvaW50OiB0aGlzLmRhdGFiYXNlLmhvc3RuYW1lLFxuICAgICAgZGF0YWJhc2VTZWNyZXRBcm46IHRoaXMuZGF0YWJhc2UubWFzdGVyU2VjcmV0LnNlY3JldEFybixcbiAgICAgIHJlZGlzRW5kcG9pbnQ6IHRoaXMucmVkaXMuaG9zdG5hbWUsXG4gICAgICByZWRpc0F1dGhUb2tlbkFybjogdGhpcy5yZWRpcy5hdXRoVG9rZW4uc2VjcmV0QXJuLFxuICAgICAgZWZzSWQ6IHRoaXMuZWZzLmZpbGVTeXN0ZW0uZmlsZVN5c3RlbUlkLFxuICAgICAgZWZzTWVkaWFBY2Nlc3NQb2ludElkOiB0aGlzLmVmcy5tZWRpYUFjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWQsXG4gICAgICBlZnNUZW1wbGF0ZXNBY2Nlc3NQb2ludElkOiB0aGlzLmVmcy5jdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkLFxuICAgICAgYXV0aGVudGlrU2VjcmV0S2V5QXJuOiB0aGlzLnNlY3JldHNNYW5hZ2VyLnNlY3JldEtleS5zZWNyZXRBcm4sXG4gICAgICBhdXRoZW50aWtBZG1pblRva2VuQXJuOiB0aGlzLnNlY3JldHNNYW5hZ2VyLmFkbWluVXNlclRva2VuLnNlY3JldEFybixcbiAgICAgIGF1dGhlbnRpa0xkYXBUb2tlbkFybjogdGhpcy5zZWNyZXRzTWFuYWdlci5sZGFwVG9rZW4uc2VjcmV0QXJuLFxuICAgICAgYXV0aGVudGlrQWxiRG5zOiB0aGlzLmF1dGhlbnRpay5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZSxcbiAgICAgIGF1dGhlbnRpa1VybDogYGh0dHBzOi8vJHt0aGlzLmF1dGhlbnRpay5kbnNOYW1lfWAsXG4gICAgICBsZGFwQWxiRG5zOiB0aGlzLmxkYXAubG9hZEJhbGFuY2VyLmxvYWRCYWxhbmNlckRuc05hbWUsXG4gICAgICBsZGFwRW5kcG9pbnQ6IGAke3RoaXMubGRhcC5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZX06Mzg5YCxcbiAgICAgIGxkYXBzRW5kcG9pbnQ6IGAke3RoaXMubGRhcC5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZX06NjM2YCxcbiAgICAgIGxkYXBUb2tlblJldHJpZXZlckxhbWJkYUFybjogdGhpcy5sZGFwVG9rZW5SZXRyaWV2ZXIubGFtYmRhRnVuY3Rpb24uZnVuY3Rpb25Bcm5cbiAgICB9KTtcbiAgfVxufVxuIl19