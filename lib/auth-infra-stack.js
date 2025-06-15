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
const authentik_1 = require("./constructs/authentik");
const ldap_1 = require("./constructs/ldap");
const ldap_token_retriever_1 = require("./constructs/ldap-token-retriever");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const outputs_1 = require("./outputs");
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const ecs = __importStar(require("aws-cdk-lib/aws-ecs"));
const kms = __importStar(require("aws-cdk-lib/aws-kms"));
const stack_naming_1 = require("./stack-naming");
const environment_config_1 = require("./environment-config");
const parameters_1 = require("./parameters");
/**
 * Main CDK stack for the Auth Infrastructure
 */
class AuthInfraStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, {
            ...props,
            description: 'TAK Authentication Layer - Authentik, LDAP, Database, Cache',
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
        const vpc = ec2.Vpc.fromLookup(this, 'VPC', {
            vpcId: (0, stack_naming_1.createBaseImportValue)(resolvedStackName, 'vpc-id')
        });
        // Import KMS key from base infrastructure
        const kmsKey = kms.Key.fromKeyArn(this, 'KMSKey', (0, stack_naming_1.createBaseImportValue)(resolvedStackName, 'kms'));
        // ECS Cluster
        const ecsCluster = new ecs.Cluster(this, 'ECSCluster', {
            vpc,
            clusterName: `${id}-cluster`,
            enableFargateCapacityProviders: true
        });
        // Security Groups
        const ecsSecurityGroup = this.createEcsSecurityGroup(vpc);
        const dbSecurityGroup = this.createDbSecurityGroup(vpc, ecsSecurityGroup);
        const redisSecurityGroup = this.createRedisSecurityGroup(vpc, ecsSecurityGroup);
        // SecretsManager
        const secretsManager = new secrets_manager_1.SecretsManager(this, 'SecretsManager', {
            environment: resolvedStackName,
            kmsKey
        });
        // Database
        const database = new database_1.Database(this, 'Database', {
            environment: resolvedStackName,
            config,
            vpc,
            kmsKey,
            securityGroups: [dbSecurityGroup]
        });
        // Redis
        const redis = new redis_1.Redis(this, 'Redis', {
            environment: resolvedStackName,
            config,
            vpc,
            kmsKey,
            securityGroups: [redisSecurityGroup]
        });
        // EFS
        const efs = new efs_1.Efs(this, 'EFS', {
            environment: resolvedStackName,
            vpc,
            kmsKey,
            allowAccessFrom: [ecsSecurityGroup]
        });
        // Authentik
        const authentik = new authentik_1.Authentik(this, 'Authentik', {
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
        // LDAP Token Retriever
        const ldapTokenRetriever = new ldap_token_retriever_1.LdapTokenRetriever(this, 'LdapTokenRetriever', {
            environment: resolvedStackName,
            config,
            kmsKey,
            authentikHost: `https://${authentik.dnsName}`,
            outpostName: 'LDAP',
            adminTokenSecret: secretsManager.adminUserToken,
            ldapTokenSecret: secretsManager.ldapToken,
            gitSha: params.gitSha
        });
        // LDAP
        const ldap = new ldap_1.Ldap(this, 'LDAP', {
            environment: resolvedStackName,
            config,
            vpc,
            ecsSecurityGroup,
            ecsCluster,
            sslCertificateArn: params.sslCertificateArn || '',
            authentikHost: authentik.dnsName,
            dockerImageLocation: params.dockerImageLocation || 'Github',
            enableExecute: params.enableExecute,
            ldapToken: secretsManager.ldapToken
        });
        // Ensure LDAP waits for the token to be retrieved
        ldap.node.addDependency(ldapTokenRetriever);
        // Outputs
        (0, outputs_1.registerAuthInfraOutputs)({
            stack: this,
            stackName: resolvedStackName,
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
            authentikAlbDns: authentik.loadBalancer.loadBalancerDnsName,
            authentikUrl: `https://${authentik.dnsName}`,
            ldapAlbDns: ldap.loadBalancer.loadBalancerDnsName,
            ldapEndpoint: `${ldap.loadBalancer.loadBalancerDnsName}:389`,
            ldapsEndpoint: `${ldap.loadBalancer.loadBalancerDnsName}:636`,
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
}
exports.AuthInfraStack = AuthInfraStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGgtaW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFFbkMsb0RBQWlEO0FBQ2pELDhDQUEyQztBQUMzQywwQ0FBdUM7QUFDdkMsa0VBQThEO0FBQzlELHNEQUFtRDtBQUNuRCw0Q0FBeUM7QUFDekMsNEVBQXVFO0FBQ3ZFLDZDQUE2QztBQUM3Qyx1Q0FBcUQ7QUFDckQseURBQTJDO0FBQzNDLHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MsaURBQXVEO0FBQ3ZELDZEQUE0RDtBQUM1RCw2Q0FBc0Q7QUFNdEQ7O0dBRUc7QUFDSCxNQUFhLGNBQWUsU0FBUSxHQUFHLENBQUMsS0FBSztJQUMzQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTBCO1FBQ2xFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFO1lBQ2YsR0FBRyxLQUFLO1lBQ1IsV0FBVyxFQUFFLDZEQUE2RDtTQUMzRSxDQUFDLENBQUM7UUFFSCx5REFBeUQ7UUFDekQsTUFBTSxNQUFNLEdBQUcsSUFBQSxtQ0FBc0IsRUFBQyxJQUFJLENBQUMsQ0FBQztRQUU1QyxNQUFNLE9BQU8sR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBd0IsQ0FBQztRQUN6RSxNQUFNLGlCQUFpQixHQUFHLEVBQUUsQ0FBQztRQUU3QixnQ0FBZ0M7UUFDaEMsTUFBTSxNQUFNLEdBQUcsSUFBQSx5Q0FBb0IsRUFBQyxPQUFPLENBQUMsQ0FBQztRQUU3Qyx3Q0FBd0M7UUFDeEMsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQztRQUNsRSxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMs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LGVBQWUsQ0FBQyxjQUFjLENBQzVCLEdBQUcsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLGdCQUFnQixDQUFDLGVBQWUsQ0FBQyxFQUMxRCxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFDbEIsd0NBQXdDLENBQ3pDLENBQUM7UUFFRixPQUFPLGVBQWUsQ0FBQztJQUN6QixDQUFDO0lBRU8sd0JBQXdCLENBQUMsR0FBYSxFQUFFLGdCQUFtQztRQUNqRixNQUFNLGtCQUFrQixHQUFHLElBQUksR0FBRyxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLEVBQUU7WUFDM0UsR0FBRztZQUNILFdBQVcsRUFBRSwwQkFBMEI7WUFDdkMsZ0JBQWdCLEVBQUUsS0FBSztTQUN4QixDQUFDLENBQUM7UUFFSCxvQ0FBb0M7UUFDcEMsa0JBQWtCLENBQUMsY0FBYyxDQUMvQixHQUFHLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsRUFDMUQsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQ2xCLG1DQUFtQyxDQUNwQyxDQUFDO1FBRUYsT0FBTyxrQkFBa0IsQ0FBQztJQUM1QixDQUFDO0NBQ0Y7QUExTkQsd0NBME5DIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHsgRGF0YWJhc2UgfSBmcm9tICcuL2NvbnN0cnVjdHMvZGF0YWJhc2UnO1xuaW1wb3J0IHsgUmVkaXMgfSBmcm9tICcuL2NvbnN0cnVjdHMvcmVkaXMnO1xuaW1wb3J0IHsgRWZzIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2Vmcyc7XG5pbXBvcnQgeyBTZWNyZXRzTWFuYWdlciB9IGZyb20gJy4vY29uc3RydWN0cy9zZWNyZXRzLW1hbmFnZXInO1xuaW1wb3J0IHsgQXV0aGVudGlrIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2F1dGhlbnRpayc7XG5pbXBvcnQgeyBMZGFwIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2xkYXAnO1xuaW1wb3J0IHsgTGRhcFRva2VuUmV0cmlldmVyIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2xkYXAtdG9rZW4tcmV0cmlldmVyJztcbmltcG9ydCB7IFN0YWNrUHJvcHMsIEZuIH0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgcmVnaXN0ZXJBdXRoSW5mcmFPdXRwdXRzIH0gZnJvbSAnLi9vdXRwdXRzJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIGVjcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWNzJztcbmltcG9ydCAqIGFzIGttcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mta21zJztcbmltcG9ydCB7IGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZSB9IGZyb20gJy4vc3RhY2stbmFtaW5nJztcbmltcG9ydCB7IGdldEVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi9lbnZpcm9ubWVudC1jb25maWcnO1xuaW1wb3J0IHsgcmVzb2x2ZVN0YWNrUGFyYW1ldGVycyB9IGZyb20gJy4vcGFyYW1ldGVycyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aEluZnJhU3RhY2tQcm9wcyBleHRlbmRzIFN0YWNrUHJvcHMge1xuICBlbnZUeXBlPzogJ3Byb2QnIHwgJ2Rldi10ZXN0Jztcbn1cblxuLyoqXG4gKiBNYWluIENESyBzdGFjayBmb3IgdGhlIEF1dGggSW5mcmFzdHJ1Y3R1cmVcbiAqL1xuZXhwb3J0IGNsYXNzIEF1dGhJbmZyYVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEF1dGhJbmZyYVN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHtcbiAgICAgIC4uLnByb3BzLFxuICAgICAgZGVzY3JpcHRpb246ICdUQUsgQXV0aGVudGljYXRpb24gTGF5ZXIgLSBBdXRoZW50aWssIExEQVAsIERhdGFiYXNlLCBDYWNoZScsXG4gICAgfSk7XG5cbiAgICAvLyBSZXNvbHZlIHBhcmFtZXRlcnMgZnJvbSBjb250ZXh0LCBlbnYgdmFycywgb3IgZGVmYXVsdHNcbiAgICBjb25zdCBwYXJhbXMgPSByZXNvbHZlU3RhY2tQYXJhbWV0ZXJzKHRoaXMpO1xuICAgIFxuICAgIGNvbnN0IGVudlR5cGUgPSAocHJvcHMuZW52VHlwZSB8fCBwYXJhbXMuZW52VHlwZSkgYXMgJ3Byb2QnIHwgJ2Rldi10ZXN0JztcbiAgICBjb25zdCByZXNvbHZlZFN0YWNrTmFtZSA9IGlkO1xuXG4gICAgLy8gR2V0IGVudmlyb25tZW50IGNvbmZpZ3VyYXRpb25cbiAgICBjb25zdCBjb25maWcgPSBnZXRFbnZpcm9ubWVudENvbmZpZyhlbnZUeXBlKTtcblxuICAgIC8vIEFkZCBFbnZpcm9ubWVudCBUeXBlIHRhZyB0byB0aGUgc3RhY2tcbiAgICBjb25zdCBlbnZpcm9ubWVudExhYmVsID0gZW52VHlwZSA9PT0gJ3Byb2QnID8gJ1Byb2QnIDogJ0Rldi1UZXN0JztcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ0Vudmlyb25tZW50IFR5cGUnLCBlbnZpcm9ubWVudExhYmVsKTtcblxuICAgIGNvbnN0IHN0YWNrTmFtZSA9IEZuLnJlZignQVdTOjpTdGFja05hbWUnKTtcbiAgICBjb25zdCByZWdpb24gPSBjZGsuU3RhY2sub2YodGhpcykucmVnaW9uO1xuXG4gICAgLy8gSW1wb3J0IFZQQyBhbmQgbmV0d29ya2luZyBmcm9tIGJhc2UgaW5mcmFzdHJ1Y3R1cmVcbiAgICBjb25zdCB2cGMgPSBlYzIuVnBjLmZyb21Mb29rdXAodGhpcywgJ1ZQQycsIHtcbiAgICAgIHZwY0lkOiBjcmVhdGVCYXNlSW1wb3J0VmFsdWUocmVzb2x2ZWRTdGFja05hbWUsICd2cGMtaWQnKVxuICAgIH0pO1xuXG4gICAgLy8gSW1wb3J0IEtNUyBrZXkgZnJvbSBiYXNlIGluZnJhc3RydWN0dXJlXG4gICAgY29uc3Qga21zS2V5ID0ga21zLktleS5mcm9tS2V5QXJuKHRoaXMsICdLTVNLZXknLCBcbiAgICAgIGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZShyZXNvbHZlZFN0YWNrTmFtZSwgJ2ttcycpXG4gICAgKTtcblxuICAgIC8vIEVDUyBDbHVzdGVyXG4gICAgY29uc3QgZWNzQ2x1c3RlciA9IG5ldyBlY3MuQ2x1c3Rlcih0aGlzLCAnRUNTQ2x1c3RlcicsIHtcbiAgICAgIHZwYyxcbiAgICAgIGNsdXN0ZXJOYW1lOiBgJHtpZH0tY2x1c3RlcmAsXG4gICAgICBlbmFibGVGYXJnYXRlQ2FwYWNpdHlQcm92aWRlcnM6IHRydWVcbiAgICB9KTtcblxuICAgIC8vIFNlY3VyaXR5IEdyb3Vwc1xuICAgIGNvbnN0IGVjc1NlY3VyaXR5R3JvdXAgPSB0aGlzLmNyZWF0ZUVjc1NlY3VyaXR5R3JvdXAodnBjKTtcbiAgICBjb25zdCBkYlNlY3VyaXR5R3JvdXAgPSB0aGlzLmNyZWF0ZURiU2VjdXJpdHlHcm91cCh2cGMsIGVjc1NlY3VyaXR5R3JvdXApO1xuICAgIGNvbnN0IHJlZGlzU2VjdXJpdHlHcm91cCA9IHRoaXMuY3JlYXRlUmVkaXNTZWN1cml0eUdyb3VwKHZwYywgZWNzU2VjdXJpdHlHcm91cCk7XG5cbiAgICAvLyBTZWNyZXRzTWFuYWdlclxuICAgIGNvbnN0IHNlY3JldHNNYW5hZ2VyID0gbmV3IFNlY3JldHNNYW5hZ2VyKHRoaXMsICdTZWNyZXRzTWFuYWdlcicsIHtcbiAgICAgIGVudmlyb25tZW50OiByZXNvbHZlZFN0YWNrTmFtZSxcbiAgICAgIGttc0tleVxuICAgIH0pO1xuXG4gICAgLy8gRGF0YWJhc2VcbiAgICBjb25zdCBkYXRhYmFzZSA9IG5ldyBEYXRhYmFzZSh0aGlzLCAnRGF0YWJhc2UnLCB7XG4gICAgICBlbnZpcm9ubWVudDogcmVzb2x2ZWRTdGFja05hbWUsXG4gICAgICBjb25maWcsXG4gICAgICB2cGMsXG4gICAgICBrbXNLZXksXG4gICAgICBzZWN1cml0eUdyb3VwczogW2RiU2VjdXJpdHlHcm91cF1cbiAgICB9KTtcblxuICAgIC8vIFJlZGlzXG4gICAgY29uc3QgcmVkaXMgPSBuZXcgUmVkaXModGhpcywgJ1JlZGlzJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHJlc29sdmVkU3RhY2tOYW1lLFxuICAgICAgY29uZmlnLFxuICAgICAgdnBjLFxuICAgICAga21zS2V5LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtyZWRpc1NlY3VyaXR5R3JvdXBdXG4gICAgfSk7XG5cbiAgICAvLyBFRlNcbiAgICBjb25zdCBlZnMgPSBuZXcgRWZzKHRoaXMsICdFRlMnLCB7XG4gICAgICBlbnZpcm9ubWVudDogcmVzb2x2ZWRTdGFja05hbWUsXG4gICAgICB2cGMsXG4gICAgICBrbXNLZXksXG4gICAgICBhbGxvd0FjY2Vzc0Zyb206IFtlY3NTZWN1cml0eUdyb3VwXVxuICAgIH0pO1xuXG4gICAgLy8gQXV0aGVudGlrXG4gICAgY29uc3QgYXV0aGVudGlrID0gbmV3IEF1dGhlbnRpayh0aGlzLCAnQXV0aGVudGlrJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHJlc29sdmVkU3RhY2tOYW1lLFxuICAgICAgY29uZmlnLFxuICAgICAgdnBjLFxuICAgICAgZWNzU2VjdXJpdHlHcm91cCxcbiAgICAgIGVjc0NsdXN0ZXIsXG4gICAgICBzc2xDZXJ0aWZpY2F0ZUFybjogcGFyYW1zLnNzbENlcnRpZmljYXRlQXJuIHx8ICcnLFxuICAgICAgYWRtaW5Vc2VyRW1haWw6IHBhcmFtcy5hdXRoZW50aWtBZG1pblVzZXJFbWFpbCxcbiAgICAgIGxkYXBCYXNlRG46IHBhcmFtcy5hdXRoZW50aWtMZGFwQmFzZURuLFxuICAgICAgdXNlQ29uZmlnRmlsZTogcGFyYW1zLnVzZUF1dGhlbnRpa0NvbmZpZ0ZpbGUgfHwgZmFsc2UsXG4gICAgICBpcEFkZHJlc3NUeXBlOiBwYXJhbXMuaXBBZGRyZXNzVHlwZSxcbiAgICAgIGRvY2tlckltYWdlTG9jYXRpb246IHBhcmFtcy5kb2NrZXJJbWFnZUxvY2F0aW9uIHx8ICdHaXRodWInLFxuICAgICAgZW5hYmxlRXhlY3V0ZTogcGFyYW1zLmVuYWJsZUV4ZWN1dGUsXG4gICAgICBkYlNlY3JldDogZGF0YWJhc2UubWFzdGVyU2VjcmV0LFxuICAgICAgZGJIb3N0bmFtZTogZGF0YWJhc2UuaG9zdG5hbWUsXG4gICAgICByZWRpc0F1dGhUb2tlbjogcmVkaXMuYXV0aFRva2VuLFxuICAgICAgcmVkaXNIb3N0bmFtZTogcmVkaXMuaG9zdG5hbWUsXG4gICAgICBzZWNyZXRLZXk6IHNlY3JldHNNYW5hZ2VyLnNlY3JldEtleSxcbiAgICAgIGFkbWluVXNlclBhc3N3b3JkOiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJQYXNzd29yZCxcbiAgICAgIGFkbWluVXNlclRva2VuOiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJUb2tlbixcbiAgICAgIGxkYXBUb2tlbjogc2VjcmV0c01hbmFnZXIubGRhcFRva2VuLFxuICAgICAgZWZzSWQ6IGVmcy5maWxlU3lzdGVtLmZpbGVTeXN0ZW1JZCxcbiAgICAgIGVmc01lZGlhQWNjZXNzUG9pbnRJZDogZWZzLm1lZGlhQWNjZXNzUG9pbnQuYWNjZXNzUG9pbnRJZCxcbiAgICAgIGVmc0N1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50SWQ6IGVmcy5jdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkXG4gICAgfSk7XG5cbiAgICAvLyBMREFQIFRva2VuIFJldHJpZXZlclxuICAgIGNvbnN0IGxkYXBUb2tlblJldHJpZXZlciA9IG5ldyBMZGFwVG9rZW5SZXRyaWV2ZXIodGhpcywgJ0xkYXBUb2tlblJldHJpZXZlcicsIHtcbiAgICAgIGVudmlyb25tZW50OiByZXNvbHZlZFN0YWNrTmFtZSxcbiAgICAgIGNvbmZpZyxcbiAgICAgIGttc0tleSxcbiAgICAgIGF1dGhlbnRpa0hvc3Q6IGBodHRwczovLyR7YXV0aGVudGlrLmRuc05hbWV9YCxcbiAgICAgIG91dHBvc3ROYW1lOiAnTERBUCcsXG4gICAgICBhZG1pblRva2VuU2VjcmV0OiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJUb2tlbixcbiAgICAgIGxkYXBUb2tlblNlY3JldDogc2VjcmV0c01hbmFnZXIubGRhcFRva2VuLFxuICAgICAgZ2l0U2hhOiBwYXJhbXMuZ2l0U2hhXG4gICAgfSk7XG5cbiAgICAvLyBMREFQXG4gICAgY29uc3QgbGRhcCA9IG5ldyBMZGFwKHRoaXMsICdMREFQJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHJlc29sdmVkU3RhY2tOYW1lLFxuICAgICAgY29uZmlnLFxuICAgICAgdnBjLFxuICAgICAgZWNzU2VjdXJpdHlHcm91cCxcbiAgICAgIGVjc0NsdXN0ZXIsXG4gICAgICBzc2xDZXJ0aWZpY2F0ZUFybjogcGFyYW1zLnNzbENlcnRpZmljYXRlQXJuIHx8ICcnLFxuICAgICAgYXV0aGVudGlrSG9zdDogYXV0aGVudGlrLmRuc05hbWUsXG4gICAgICBkb2NrZXJJbWFnZUxvY2F0aW9uOiBwYXJhbXMuZG9ja2VySW1hZ2VMb2NhdGlvbiB8fCAnR2l0aHViJyxcbiAgICAgIGVuYWJsZUV4ZWN1dGU6IHBhcmFtcy5lbmFibGVFeGVjdXRlLFxuICAgICAgbGRhcFRva2VuOiBzZWNyZXRzTWFuYWdlci5sZGFwVG9rZW5cbiAgICB9KTtcblxuICAgIC8vIEVuc3VyZSBMREFQIHdhaXRzIGZvciB0aGUgdG9rZW4gdG8gYmUgcmV0cmlldmVkXG4gICAgbGRhcC5ub2RlLmFkZERlcGVuZGVuY3kobGRhcFRva2VuUmV0cmlldmVyKTtcblxuICAgIC8vIE91dHB1dHNcbiAgICByZWdpc3RlckF1dGhJbmZyYU91dHB1dHMoe1xuICAgICAgc3RhY2s6IHRoaXMsXG4gICAgICBzdGFja05hbWU6IHJlc29sdmVkU3RhY2tOYW1lLFxuICAgICAgZGF0YWJhc2VFbmRwb2ludDogZGF0YWJhc2UuaG9zdG5hbWUsXG4gICAgICBkYXRhYmFzZVNlY3JldEFybjogZGF0YWJhc2UubWFzdGVyU2VjcmV0LnNlY3JldEFybixcbiAgICAgIHJlZGlzRW5kcG9pbnQ6IHJlZGlzLmhvc3RuYW1lLFxuICAgICAgcmVkaXNBdXRoVG9rZW5Bcm46IHJlZGlzLmF1dGhUb2tlbi5zZWNyZXRBcm4sXG4gICAgICBlZnNJZDogZWZzLmZpbGVTeXN0ZW0uZmlsZVN5c3RlbUlkLFxuICAgICAgZWZzTWVkaWFBY2Nlc3NQb2ludElkOiBlZnMubWVkaWFBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkLFxuICAgICAgZWZzVGVtcGxhdGVzQWNjZXNzUG9pbnRJZDogZWZzLmN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWQsXG4gICAgICBhdXRoZW50aWtTZWNyZXRLZXlBcm46IHNlY3JldHNNYW5hZ2VyLnNlY3JldEtleS5zZWNyZXRBcm4sXG4gICAgICBhdXRoZW50aWtBZG1pblRva2VuQXJuOiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJUb2tlbi5zZWNyZXRBcm4sXG4gICAgICBhdXRoZW50aWtMZGFwVG9rZW5Bcm46IHNlY3JldHNNYW5hZ2VyLmxkYXBUb2tlbi5zZWNyZXRBcm4sXG4gICAgICBhdXRoZW50aWtBbGJEbnM6IGF1dGhlbnRpay5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZSxcbiAgICAgIGF1dGhlbnRpa1VybDogYGh0dHBzOi8vJHthdXRoZW50aWsuZG5zTmFtZX1gLFxuICAgICAgbGRhcEFsYkRuczogbGRhcC5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZSxcbiAgICAgIGxkYXBFbmRwb2ludDogYCR7bGRhcC5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZX06Mzg5YCxcbiAgICAgIGxkYXBzRW5kcG9pbnQ6IGAke2xkYXAubG9hZEJhbGFuY2VyLmxvYWRCYWxhbmNlckRuc05hbWV9OjYzNmAsXG4gICAgICBsZGFwVG9rZW5SZXRyaWV2ZXJMYW1iZGFBcm46IGxkYXBUb2tlblJldHJpZXZlci5sYW1iZGFGdW5jdGlvbi5mdW5jdGlvbkFyblxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVFY3NTZWN1cml0eUdyb3VwKHZwYzogZWMyLklWcGMpOiBlYzIuU2VjdXJpdHlHcm91cCB7XG4gICAgY29uc3QgZWNzU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnRUNTU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIEVDUyB0YXNrcycsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBIVFRQL0hUVFBTIHRyYWZmaWMgdG8gRUNTIHRhc2tzXG4gICAgZWNzU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg4MCksXG4gICAgICAnQWxsb3cgSFRUUCB0cmFmZmljJ1xuICAgICk7XG5cbiAgICBlY3NTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuYW55SXB2NCgpLFxuICAgICAgZWMyLlBvcnQudGNwKDQ0MyksXG4gICAgICAnQWxsb3cgSFRUUFMgdHJhZmZpYydcbiAgICApO1xuXG4gICAgZWNzU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg5MDAwKSxcbiAgICAgICdBbGxvdyBBdXRoZW50aWsgdHJhZmZpYydcbiAgICApO1xuXG4gICAgcmV0dXJuIGVjc1NlY3VyaXR5R3JvdXA7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZURiU2VjdXJpdHlHcm91cCh2cGM6IGVjMi5JVnBjLCBlY3NTZWN1cml0eUdyb3VwOiBlYzIuU2VjdXJpdHlHcm91cCk6IGVjMi5TZWN1cml0eUdyb3VwIHtcbiAgICBjb25zdCBkYlNlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0RCU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIGRhdGFiYXNlJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IGZhbHNlXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBQb3N0Z3JlU1FMIGFjY2VzcyBmcm9tIEVDUyB0YXNrc1xuICAgIGRiU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLnNlY3VyaXR5R3JvdXBJZChlY3NTZWN1cml0eUdyb3VwLnNlY3VyaXR5R3JvdXBJZCksXG4gICAgICBlYzIuUG9ydC50Y3AoNTQzMiksXG4gICAgICAnQWxsb3cgUG9zdGdyZVNRTCBhY2Nlc3MgZnJvbSBFQ1MgdGFza3MnXG4gICAgKTtcblxuICAgIHJldHVybiBkYlNlY3VyaXR5R3JvdXA7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZVJlZGlzU2VjdXJpdHlHcm91cCh2cGM6IGVjMi5JVnBjLCBlY3NTZWN1cml0eUdyb3VwOiBlYzIuU2VjdXJpdHlHcm91cCk6IGVjMi5TZWN1cml0eUdyb3VwIHtcbiAgICBjb25zdCByZWRpc1NlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ1JlZGlzU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIFJlZGlzJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IGZhbHNlXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBSZWRpcyBhY2Nlc3MgZnJvbSBFQ1MgdGFza3NcbiAgICByZWRpc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5zZWN1cml0eUdyb3VwSWQoZWNzU2VjdXJpdHlHcm91cC5zZWN1cml0eUdyb3VwSWQpLFxuICAgICAgZWMyLlBvcnQudGNwKDYzNzkpLFxuICAgICAgJ0FsbG93IFJlZGlzIGFjY2VzcyBmcm9tIEVDUyB0YXNrcydcbiAgICApO1xuXG4gICAgcmV0dXJuIHJlZGlzU2VjdXJpdHlHcm91cDtcbiAgfVxufVxuIl19