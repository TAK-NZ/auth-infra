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
const s3_env_file_manager_1 = require("./constructs/s3-env-file-manager");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const outputs_1 = require("./outputs");
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const ecs = __importStar(require("aws-cdk-lib/aws-ecs"));
const kms = __importStar(require("aws-cdk-lib/aws-kms"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
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
        const stackNameComponent = params.stackName; // This is the STACK_NAME part (e.g., "MyFirstStack")
        // Get environment configuration
        const config = (0, environment_config_1.getEnvironmentConfig)(envType);
        // Add Environment Type tag to the stack
        const environmentLabel = envType === 'prod' ? 'Prod' : 'Dev-Test';
        cdk.Tags.of(this).add('Environment Type', environmentLabel);
        const stackName = aws_cdk_lib_1.Fn.ref('AWS::StackName');
        const region = cdk.Stack.of(this).region;
        // Import VPC and networking from base infrastructure
        const vpc = ec2.Vpc.fromLookup(this, 'VPC', {
            vpcId: (0, stack_naming_1.createBaseImportValue)(stackNameComponent, stack_naming_1.BASE_EXPORT_NAMES.VPC_ID)
        });
        // Import KMS key from base infrastructure
        const kmsKey = kms.Key.fromKeyArn(this, 'KMSKey', (0, stack_naming_1.createBaseImportValue)(stackNameComponent, stack_naming_1.BASE_EXPORT_NAMES.KMS_KEY));
        // Import ECS Cluster from base infrastructure
        const ecsCluster = ecs.Cluster.fromClusterArn(this, 'ECSCluster', (0, stack_naming_1.createBaseImportValue)(stackNameComponent, stack_naming_1.BASE_EXPORT_NAMES.ECS_CLUSTER));
        // Import S3 configuration bucket from base infrastructure
        const s3ConfBucket = s3.Bucket.fromBucketArn(this, 'S3ConfBucket', (0, stack_naming_1.createBaseImportValue)(stackNameComponent, stack_naming_1.BASE_EXPORT_NAMES.S3_BUCKET));
        // Import ECR repository from base infrastructure (for local ECR option)
        const ecrRepository = (0, stack_naming_1.createBaseImportValue)(stackNameComponent, stack_naming_1.BASE_EXPORT_NAMES.ECR_REPO);
        // S3 Environment File Manager - manages authentik-config.env file
        const s3EnvFileManager = new s3_env_file_manager_1.S3EnvFileManager(this, 'S3EnvFileManager', {
            environment: stackNameComponent,
            s3ConfBucket,
            envFileName: 'authentik-config.env'
        });
        // Security Groups
        const ecsSecurityGroup = this.createEcsSecurityGroup(vpc);
        const dbSecurityGroup = this.createDbSecurityGroup(vpc, ecsSecurityGroup);
        const redisSecurityGroup = this.createRedisSecurityGroup(vpc, ecsSecurityGroup);
        // SecretsManager
        const secretsManager = new secrets_manager_1.SecretsManager(this, 'SecretsManager', {
            environment: stackNameComponent,
            kmsKey
        });
        // Database
        const database = new database_1.Database(this, 'Database', {
            environment: stackNameComponent,
            config,
            vpc,
            kmsKey,
            securityGroups: [dbSecurityGroup]
        });
        // Redis
        const redis = new redis_1.Redis(this, 'Redis', {
            environment: stackNameComponent,
            config,
            vpc,
            kmsKey,
            securityGroups: [redisSecurityGroup]
        });
        // EFS
        const efs = new efs_1.Efs(this, 'EFS', {
            environment: stackNameComponent,
            vpc,
            kmsKey,
            allowAccessFrom: [ecsSecurityGroup]
        });
        // Authentik
        const authentik = new authentik_1.Authentik(this, 'Authentik', {
            environment: stackNameComponent,
            config,
            vpc,
            ecsSecurityGroup,
            ecsCluster,
            s3ConfBucket,
            envFileS3Uri: s3EnvFileManager.envFileS3Uri,
            envFileS3Key: s3EnvFileManager.envFileS3Key,
            sslCertificateArn: params.sslCertificateArn || '',
            adminUserEmail: params.authentikAdminUserEmail,
            ldapBaseDn: params.authentikLdapBaseDn,
            useConfigFile: params.useAuthentikConfigFile || false,
            ipAddressType: params.ipAddressType,
            dockerImageLocation: params.dockerImageLocation || 'Github',
            ecrRepositoryArn: ecrRepository,
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
            environment: stackNameComponent,
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
            environment: stackNameComponent,
            config,
            vpc,
            ecsSecurityGroup,
            ecsCluster,
            s3ConfBucket,
            sslCertificateArn: params.sslCertificateArn || '',
            authentikHost: authentik.dnsName,
            dockerImageLocation: params.dockerImageLocation || 'Github',
            ecrRepositoryArn: ecrRepository,
            enableExecute: params.enableExecute,
            ldapToken: secretsManager.ldapToken
        });
        // Ensure LDAP waits for the token to be retrieved
        ldap.node.addDependency(ldapTokenRetriever);
        // Outputs
        (0, outputs_1.registerAuthInfraOutputs)({
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC1pbmZyYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGgtaW5mcmEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFFbkMsb0RBQWlEO0FBQ2pELDhDQUEyQztBQUMzQywwQ0FBdUM7QUFDdkMsa0VBQThEO0FBQzlELHNEQUFtRDtBQUNuRCw0Q0FBeUM7QUFDekMsNEVBQXVFO0FBQ3ZFLDBFQUFvRTtBQUNwRSw2Q0FBNkM7QUFDN0MsdUNBQXFEO0FBQ3JELHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLHVEQUF5QztBQUN6QyxpREFBMEU7QUFDMUUsNkRBQTREO0FBQzVELDZDQUFzRDtBQU10RDs7R0FFRztBQUNILE1BQWEsY0FBZSxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQzNDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBMEI7UUFDbEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUU7WUFDZixHQUFHLEtBQUs7WUFDUixXQUFXLEVBQUUsNkRBQTZEO1NBQzNFLENBQUMsQ0FBQztRQUVILHlEQUF5RDtRQUN6RCxNQUFNLE1BQU0sR0FBRyxJQUFBLG1DQUFzQixFQUFDLElBQUksQ0FBQyxDQUFDO1FBRTVDLE1BQU0sT0FBTyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sSUFBSSxNQUFNLENBQUMsT0FBTyxDQUF3QixDQUFDO1FBQ3pFLE1BQU0sa0JBQWtCLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLHFEQUFxRDtRQUVsRyxnQ0FBZ0M7UUFDaEMsTUFBTSxNQUFNLEdBQUcsSUFBQSx5Q0FBb0IsRUFBQyxPQUFPLENBQUMsQ0FBQztRQUU3Qyx3Q0FBd0M7UUFDeEMsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FB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QixFQUFFLEtBQUs7U0FDeEIsQ0FBQyxDQUFDO1FBRUgsb0NBQW9DO1FBQ3BDLGtCQUFrQixDQUFDLGNBQWMsQ0FDL0IsR0FBRyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsZ0JBQWdCLENBQUMsZUFBZSxDQUFDLEVBQzFELEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUNsQixtQ0FBbUMsQ0FDcEMsQ0FBQztRQUVGLE9BQU8sa0JBQWtCLENBQUM7SUFDNUIsQ0FBQztDQUNGO0FBN09ELHdDQTZPQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7IERhdGFiYXNlIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2RhdGFiYXNlJztcbmltcG9ydCB7IFJlZGlzIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL3JlZGlzJztcbmltcG9ydCB7IEVmcyB9IGZyb20gJy4vY29uc3RydWN0cy9lZnMnO1xuaW1wb3J0IHsgU2VjcmV0c01hbmFnZXIgfSBmcm9tICcuL2NvbnN0cnVjdHMvc2VjcmV0cy1tYW5hZ2VyJztcbmltcG9ydCB7IEF1dGhlbnRpayB9IGZyb20gJy4vY29uc3RydWN0cy9hdXRoZW50aWsnO1xuaW1wb3J0IHsgTGRhcCB9IGZyb20gJy4vY29uc3RydWN0cy9sZGFwJztcbmltcG9ydCB7IExkYXBUb2tlblJldHJpZXZlciB9IGZyb20gJy4vY29uc3RydWN0cy9sZGFwLXRva2VuLXJldHJpZXZlcic7XG5pbXBvcnQgeyBTM0VudkZpbGVNYW5hZ2VyIH0gZnJvbSAnLi9jb25zdHJ1Y3RzL3MzLWVudi1maWxlLW1hbmFnZXInO1xuaW1wb3J0IHsgU3RhY2tQcm9wcywgRm4gfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyByZWdpc3RlckF1dGhJbmZyYU91dHB1dHMgfSBmcm9tICcuL291dHB1dHMnO1xuaW1wb3J0ICogYXMgZWMyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xuaW1wb3J0ICogYXMgZWNzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3MnO1xuaW1wb3J0ICogYXMga21zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1rbXMnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCB7IGNyZWF0ZUJhc2VJbXBvcnRWYWx1ZSwgQkFTRV9FWFBPUlRfTkFNRVMgfSBmcm9tICcuL3N0YWNrLW5hbWluZyc7XG5pbXBvcnQgeyBnZXRFbnZpcm9ubWVudENvbmZpZyB9IGZyb20gJy4vZW52aXJvbm1lbnQtY29uZmlnJztcbmltcG9ydCB7IHJlc29sdmVTdGFja1BhcmFtZXRlcnMgfSBmcm9tICcuL3BhcmFtZXRlcnMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhJbmZyYVN0YWNrUHJvcHMgZXh0ZW5kcyBTdGFja1Byb3BzIHtcbiAgZW52VHlwZT86ICdwcm9kJyB8ICdkZXYtdGVzdCc7XG59XG5cbi8qKlxuICogTWFpbiBDREsgc3RhY2sgZm9yIHRoZSBBdXRoIEluZnJhc3RydWN0dXJlXG4gKi9cbmV4cG9ydCBjbGFzcyBBdXRoSW5mcmFTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBBdXRoSW5mcmFTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCB7XG4gICAgICAuLi5wcm9wcyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVEFLIEF1dGhlbnRpY2F0aW9uIExheWVyIC0gQXV0aGVudGlrLCBMREFQLCBEYXRhYmFzZSwgQ2FjaGUnLFxuICAgIH0pO1xuXG4gICAgLy8gUmVzb2x2ZSBwYXJhbWV0ZXJzIGZyb20gY29udGV4dCwgZW52IHZhcnMsIG9yIGRlZmF1bHRzXG4gICAgY29uc3QgcGFyYW1zID0gcmVzb2x2ZVN0YWNrUGFyYW1ldGVycyh0aGlzKTtcbiAgICBcbiAgICBjb25zdCBlbnZUeXBlID0gKHByb3BzLmVudlR5cGUgfHwgcGFyYW1zLmVudlR5cGUpIGFzICdwcm9kJyB8ICdkZXYtdGVzdCc7XG4gICAgY29uc3Qgc3RhY2tOYW1lQ29tcG9uZW50ID0gcGFyYW1zLnN0YWNrTmFtZTsgLy8gVGhpcyBpcyB0aGUgU1RBQ0tfTkFNRSBwYXJ0IChlLmcuLCBcIk15Rmlyc3RTdGFja1wiKVxuXG4gICAgLy8gR2V0IGVudmlyb25tZW50IGNvbmZpZ3VyYXRpb25cbiAgICBjb25zdCBjb25maWcgPSBnZXRFbnZpcm9ubWVudENvbmZpZyhlbnZUeXBlKTtcblxuICAgIC8vIEFkZCBFbnZpcm9ubWVudCBUeXBlIHRhZyB0byB0aGUgc3RhY2tcbiAgICBjb25zdCBlbnZpcm9ubWVudExhYmVsID0gZW52VHlwZSA9PT0gJ3Byb2QnID8gJ1Byb2QnIDogJ0Rldi1UZXN0JztcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ0Vudmlyb25tZW50IFR5cGUnLCBlbnZpcm9ubWVudExhYmVsKTtcblxuICAgIGNvbnN0IHN0YWNrTmFtZSA9IEZuLnJlZignQVdTOjpTdGFja05hbWUnKTtcbiAgICBjb25zdCByZWdpb24gPSBjZGsuU3RhY2sub2YodGhpcykucmVnaW9uO1xuXG4gICAgLy8gSW1wb3J0IFZQQyBhbmQgbmV0d29ya2luZyBmcm9tIGJhc2UgaW5mcmFzdHJ1Y3R1cmVcbiAgICBjb25zdCB2cGMgPSBlYzIuVnBjLmZyb21Mb29rdXAodGhpcywgJ1ZQQycsIHtcbiAgICAgIHZwY0lkOiBjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5WUENfSUQpXG4gICAgfSk7XG5cbiAgICAvLyBJbXBvcnQgS01TIGtleSBmcm9tIGJhc2UgaW5mcmFzdHJ1Y3R1cmVcbiAgICBjb25zdCBrbXNLZXkgPSBrbXMuS2V5LmZyb21LZXlBcm4odGhpcywgJ0tNU0tleScsIFxuICAgICAgY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuS01TX0tFWSlcbiAgICApO1xuXG4gICAgLy8gSW1wb3J0IEVDUyBDbHVzdGVyIGZyb20gYmFzZSBpbmZyYXN0cnVjdHVyZVxuICAgIGNvbnN0IGVjc0NsdXN0ZXIgPSBlY3MuQ2x1c3Rlci5mcm9tQ2x1c3RlckFybih0aGlzLCAnRUNTQ2x1c3RlcicsXG4gICAgICBjcmVhdGVCYXNlSW1wb3J0VmFsdWUoc3RhY2tOYW1lQ29tcG9uZW50LCBCQVNFX0VYUE9SVF9OQU1FUy5FQ1NfQ0xVU1RFUilcbiAgICApO1xuXG4gICAgLy8gSW1wb3J0IFMzIGNvbmZpZ3VyYXRpb24gYnVja2V0IGZyb20gYmFzZSBpbmZyYXN0cnVjdHVyZVxuICAgIGNvbnN0IHMzQ29uZkJ1Y2tldCA9IHMzLkJ1Y2tldC5mcm9tQnVja2V0QXJuKHRoaXMsICdTM0NvbmZCdWNrZXQnLFxuICAgICAgY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuUzNfQlVDS0VUKVxuICAgICk7XG5cbiAgICAvLyBJbXBvcnQgRUNSIHJlcG9zaXRvcnkgZnJvbSBiYXNlIGluZnJhc3RydWN0dXJlIChmb3IgbG9jYWwgRUNSIG9wdGlvbilcbiAgICBjb25zdCBlY3JSZXBvc2l0b3J5ID0gY3JlYXRlQmFzZUltcG9ydFZhbHVlKHN0YWNrTmFtZUNvbXBvbmVudCwgQkFTRV9FWFBPUlRfTkFNRVMuRUNSX1JFUE8pO1xuXG4gICAgLy8gUzMgRW52aXJvbm1lbnQgRmlsZSBNYW5hZ2VyIC0gbWFuYWdlcyBhdXRoZW50aWstY29uZmlnLmVudiBmaWxlXG4gICAgY29uc3QgczNFbnZGaWxlTWFuYWdlciA9IG5ldyBTM0VudkZpbGVNYW5hZ2VyKHRoaXMsICdTM0VudkZpbGVNYW5hZ2VyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIHMzQ29uZkJ1Y2tldCxcbiAgICAgIGVudkZpbGVOYW1lOiAnYXV0aGVudGlrLWNvbmZpZy5lbnYnXG4gICAgfSk7XG5cbiAgICAvLyBTZWN1cml0eSBHcm91cHNcbiAgICBjb25zdCBlY3NTZWN1cml0eUdyb3VwID0gdGhpcy5jcmVhdGVFY3NTZWN1cml0eUdyb3VwKHZwYyk7XG4gICAgY29uc3QgZGJTZWN1cml0eUdyb3VwID0gdGhpcy5jcmVhdGVEYlNlY3VyaXR5R3JvdXAodnBjLCBlY3NTZWN1cml0eUdyb3VwKTtcbiAgICBjb25zdCByZWRpc1NlY3VyaXR5R3JvdXAgPSB0aGlzLmNyZWF0ZVJlZGlzU2VjdXJpdHlHcm91cCh2cGMsIGVjc1NlY3VyaXR5R3JvdXApO1xuXG4gICAgLy8gU2VjcmV0c01hbmFnZXJcbiAgICBjb25zdCBzZWNyZXRzTWFuYWdlciA9IG5ldyBTZWNyZXRzTWFuYWdlcih0aGlzLCAnU2VjcmV0c01hbmFnZXInLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAga21zS2V5XG4gICAgfSk7XG5cbiAgICAvLyBEYXRhYmFzZVxuICAgIGNvbnN0IGRhdGFiYXNlID0gbmV3IERhdGFiYXNlKHRoaXMsICdEYXRhYmFzZScsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWcsXG4gICAgICB2cGMsXG4gICAgICBrbXNLZXksXG4gICAgICBzZWN1cml0eUdyb3VwczogW2RiU2VjdXJpdHlHcm91cF1cbiAgICB9KTtcblxuICAgIC8vIFJlZGlzXG4gICAgY29uc3QgcmVkaXMgPSBuZXcgUmVkaXModGhpcywgJ1JlZGlzJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGNvbmZpZyxcbiAgICAgIHZwYyxcbiAgICAgIGttc0tleSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbcmVkaXNTZWN1cml0eUdyb3VwXVxuICAgIH0pO1xuXG4gICAgLy8gRUZTXG4gICAgY29uc3QgZWZzID0gbmV3IEVmcyh0aGlzLCAnRUZTJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIHZwYyxcbiAgICAgIGttc0tleSxcbiAgICAgIGFsbG93QWNjZXNzRnJvbTogW2Vjc1NlY3VyaXR5R3JvdXBdXG4gICAgfSk7XG5cbiAgICAvLyBBdXRoZW50aWtcbiAgICBjb25zdCBhdXRoZW50aWsgPSBuZXcgQXV0aGVudGlrKHRoaXMsICdBdXRoZW50aWsnLCB7XG4gICAgICBlbnZpcm9ubWVudDogc3RhY2tOYW1lQ29tcG9uZW50LFxuICAgICAgY29uZmlnLFxuICAgICAgdnBjLFxuICAgICAgZWNzU2VjdXJpdHlHcm91cCxcbiAgICAgIGVjc0NsdXN0ZXIsXG4gICAgICBzM0NvbmZCdWNrZXQsXG4gICAgICBlbnZGaWxlUzNVcmk6IHMzRW52RmlsZU1hbmFnZXIuZW52RmlsZVMzVXJpLFxuICAgICAgZW52RmlsZVMzS2V5OiBzM0VudkZpbGVNYW5hZ2VyLmVudkZpbGVTM0tleSxcbiAgICAgIHNzbENlcnRpZmljYXRlQXJuOiBwYXJhbXMuc3NsQ2VydGlmaWNhdGVBcm4gfHwgJycsXG4gICAgICBhZG1pblVzZXJFbWFpbDogcGFyYW1zLmF1dGhlbnRpa0FkbWluVXNlckVtYWlsLFxuICAgICAgbGRhcEJhc2VEbjogcGFyYW1zLmF1dGhlbnRpa0xkYXBCYXNlRG4sXG4gICAgICB1c2VDb25maWdGaWxlOiBwYXJhbXMudXNlQXV0aGVudGlrQ29uZmlnRmlsZSB8fCBmYWxzZSxcbiAgICAgIGlwQWRkcmVzc1R5cGU6IHBhcmFtcy5pcEFkZHJlc3NUeXBlLFxuICAgICAgZG9ja2VySW1hZ2VMb2NhdGlvbjogcGFyYW1zLmRvY2tlckltYWdlTG9jYXRpb24gfHwgJ0dpdGh1YicsXG4gICAgICBlY3JSZXBvc2l0b3J5QXJuOiBlY3JSZXBvc2l0b3J5LFxuICAgICAgZW5hYmxlRXhlY3V0ZTogcGFyYW1zLmVuYWJsZUV4ZWN1dGUsXG4gICAgICBkYlNlY3JldDogZGF0YWJhc2UubWFzdGVyU2VjcmV0LFxuICAgICAgZGJIb3N0bmFtZTogZGF0YWJhc2UuaG9zdG5hbWUsXG4gICAgICByZWRpc0F1dGhUb2tlbjogcmVkaXMuYXV0aFRva2VuLFxuICAgICAgcmVkaXNIb3N0bmFtZTogcmVkaXMuaG9zdG5hbWUsXG4gICAgICBzZWNyZXRLZXk6IHNlY3JldHNNYW5hZ2VyLnNlY3JldEtleSxcbiAgICAgIGFkbWluVXNlclBhc3N3b3JkOiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJQYXNzd29yZCxcbiAgICAgIGFkbWluVXNlclRva2VuOiBzZWNyZXRzTWFuYWdlci5hZG1pblVzZXJUb2tlbixcbiAgICAgIGxkYXBUb2tlbjogc2VjcmV0c01hbmFnZXIubGRhcFRva2VuLFxuICAgICAgZWZzSWQ6IGVmcy5maWxlU3lzdGVtLmZpbGVTeXN0ZW1JZCxcbiAgICAgIGVmc01lZGlhQWNjZXNzUG9pbnRJZDogZWZzLm1lZGlhQWNjZXNzUG9pbnQuYWNjZXNzUG9pbnRJZCxcbiAgICAgIGVmc0N1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50SWQ6IGVmcy5jdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkXG4gICAgfSk7XG5cbiAgICAvLyBMREFQIFRva2VuIFJldHJpZXZlclxuICAgIGNvbnN0IGxkYXBUb2tlblJldHJpZXZlciA9IG5ldyBMZGFwVG9rZW5SZXRyaWV2ZXIodGhpcywgJ0xkYXBUb2tlblJldHJpZXZlcicsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWcsXG4gICAgICBrbXNLZXksXG4gICAgICBhdXRoZW50aWtIb3N0OiBgaHR0cHM6Ly8ke2F1dGhlbnRpay5kbnNOYW1lfWAsXG4gICAgICBvdXRwb3N0TmFtZTogJ0xEQVAnLFxuICAgICAgYWRtaW5Ub2tlblNlY3JldDogc2VjcmV0c01hbmFnZXIuYWRtaW5Vc2VyVG9rZW4sXG4gICAgICBsZGFwVG9rZW5TZWNyZXQ6IHNlY3JldHNNYW5hZ2VyLmxkYXBUb2tlbixcbiAgICAgIGdpdFNoYTogcGFyYW1zLmdpdFNoYVxuICAgIH0pO1xuXG4gICAgLy8gTERBUFxuICAgIGNvbnN0IGxkYXAgPSBuZXcgTGRhcCh0aGlzLCAnTERBUCcsIHtcbiAgICAgIGVudmlyb25tZW50OiBzdGFja05hbWVDb21wb25lbnQsXG4gICAgICBjb25maWcsXG4gICAgICB2cGMsXG4gICAgICBlY3NTZWN1cml0eUdyb3VwLFxuICAgICAgZWNzQ2x1c3RlcixcbiAgICAgIHMzQ29uZkJ1Y2tldCxcbiAgICAgIHNzbENlcnRpZmljYXRlQXJuOiBwYXJhbXMuc3NsQ2VydGlmaWNhdGVBcm4gfHwgJycsXG4gICAgICBhdXRoZW50aWtIb3N0OiBhdXRoZW50aWsuZG5zTmFtZSxcbiAgICAgIGRvY2tlckltYWdlTG9jYXRpb246IHBhcmFtcy5kb2NrZXJJbWFnZUxvY2F0aW9uIHx8ICdHaXRodWInLFxuICAgICAgZWNyUmVwb3NpdG9yeUFybjogZWNyUmVwb3NpdG9yeSxcbiAgICAgIGVuYWJsZUV4ZWN1dGU6IHBhcmFtcy5lbmFibGVFeGVjdXRlLFxuICAgICAgbGRhcFRva2VuOiBzZWNyZXRzTWFuYWdlci5sZGFwVG9rZW5cbiAgICB9KTtcblxuICAgIC8vIEVuc3VyZSBMREFQIHdhaXRzIGZvciB0aGUgdG9rZW4gdG8gYmUgcmV0cmlldmVkXG4gICAgbGRhcC5ub2RlLmFkZERlcGVuZGVuY3kobGRhcFRva2VuUmV0cmlldmVyKTtcblxuICAgIC8vIE91dHB1dHNcbiAgICByZWdpc3RlckF1dGhJbmZyYU91dHB1dHMoe1xuICAgICAgc3RhY2s6IHRoaXMsXG4gICAgICBzdGFja05hbWU6IHN0YWNrTmFtZUNvbXBvbmVudCxcbiAgICAgIGRhdGFiYXNlRW5kcG9pbnQ6IGRhdGFiYXNlLmhvc3RuYW1lLFxuICAgICAgZGF0YWJhc2VTZWNyZXRBcm46IGRhdGFiYXNlLm1hc3RlclNlY3JldC5zZWNyZXRBcm4sXG4gICAgICByZWRpc0VuZHBvaW50OiByZWRpcy5ob3N0bmFtZSxcbiAgICAgIHJlZGlzQXV0aFRva2VuQXJuOiByZWRpcy5hdXRoVG9rZW4uc2VjcmV0QXJuLFxuICAgICAgZWZzSWQ6IGVmcy5maWxlU3lzdGVtLmZpbGVTeXN0ZW1JZCxcbiAgICAgIGVmc01lZGlhQWNjZXNzUG9pbnRJZDogZWZzLm1lZGlhQWNjZXNzUG9pbnQuYWNjZXNzUG9pbnRJZCxcbiAgICAgIGVmc1RlbXBsYXRlc0FjY2Vzc1BvaW50SWQ6IGVmcy5jdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkLFxuICAgICAgYXV0aGVudGlrU2VjcmV0S2V5QXJuOiBzZWNyZXRzTWFuYWdlci5zZWNyZXRLZXkuc2VjcmV0QXJuLFxuICAgICAgYXV0aGVudGlrQWRtaW5Ub2tlbkFybjogc2VjcmV0c01hbmFnZXIuYWRtaW5Vc2VyVG9rZW4uc2VjcmV0QXJuLFxuICAgICAgYXV0aGVudGlrTGRhcFRva2VuQXJuOiBzZWNyZXRzTWFuYWdlci5sZGFwVG9rZW4uc2VjcmV0QXJuLFxuICAgICAgYXV0aGVudGlrQWxiRG5zOiBhdXRoZW50aWsubG9hZEJhbGFuY2VyLmxvYWRCYWxhbmNlckRuc05hbWUsXG4gICAgICBhdXRoZW50aWtVcmw6IGBodHRwczovLyR7YXV0aGVudGlrLmRuc05hbWV9YCxcbiAgICAgIGxkYXBBbGJEbnM6IGxkYXAubG9hZEJhbGFuY2VyLmxvYWRCYWxhbmNlckRuc05hbWUsXG4gICAgICBsZGFwRW5kcG9pbnQ6IGAke2xkYXAubG9hZEJhbGFuY2VyLmxvYWRCYWxhbmNlckRuc05hbWV9OjM4OWAsXG4gICAgICBsZGFwc0VuZHBvaW50OiBgJHtsZGFwLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lfTo2MzZgLFxuICAgICAgbGRhcFRva2VuUmV0cmlldmVyTGFtYmRhQXJuOiBsZGFwVG9rZW5SZXRyaWV2ZXIubGFtYmRhRnVuY3Rpb24uZnVuY3Rpb25Bcm5cbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlRWNzU2VjdXJpdHlHcm91cCh2cGM6IGVjMi5JVnBjKTogZWMyLlNlY3VyaXR5R3JvdXAge1xuICAgIGNvbnN0IGVjc1NlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0VDU1NlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBFQ1MgdGFza3MnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogdHJ1ZVxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgSFRUUC9IVFRQUyB0cmFmZmljIHRvIEVDUyB0YXNrc1xuICAgIGVjc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5hbnlJcHY0KCksXG4gICAgICBlYzIuUG9ydC50Y3AoODApLFxuICAgICAgJ0FsbG93IEhUVFAgdHJhZmZpYydcbiAgICApO1xuXG4gICAgZWNzU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg0NDMpLFxuICAgICAgJ0FsbG93IEhUVFBTIHRyYWZmaWMnXG4gICAgKTtcblxuICAgIGVjc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5hbnlJcHY0KCksXG4gICAgICBlYzIuUG9ydC50Y3AoOTAwMCksXG4gICAgICAnQWxsb3cgQXV0aGVudGlrIHRyYWZmaWMnXG4gICAgKTtcblxuICAgIHJldHVybiBlY3NTZWN1cml0eUdyb3VwO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVEYlNlY3VyaXR5R3JvdXAodnBjOiBlYzIuSVZwYywgZWNzU2VjdXJpdHlHcm91cDogZWMyLlNlY3VyaXR5R3JvdXApOiBlYzIuU2VjdXJpdHlHcm91cCB7XG4gICAgY29uc3QgZGJTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdEQlNlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBkYXRhYmFzZScsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiBmYWxzZVxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgUG9zdGdyZVNRTCBhY2Nlc3MgZnJvbSBFQ1MgdGFza3NcbiAgICBkYlNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5zZWN1cml0eUdyb3VwSWQoZWNzU2VjdXJpdHlHcm91cC5zZWN1cml0eUdyb3VwSWQpLFxuICAgICAgZWMyLlBvcnQudGNwKDU0MzIpLFxuICAgICAgJ0FsbG93IFBvc3RncmVTUUwgYWNjZXNzIGZyb20gRUNTIHRhc2tzJ1xuICAgICk7XG5cbiAgICByZXR1cm4gZGJTZWN1cml0eUdyb3VwO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVSZWRpc1NlY3VyaXR5R3JvdXAodnBjOiBlYzIuSVZwYywgZWNzU2VjdXJpdHlHcm91cDogZWMyLlNlY3VyaXR5R3JvdXApOiBlYzIuU2VjdXJpdHlHcm91cCB7XG4gICAgY29uc3QgcmVkaXNTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdSZWRpc1NlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBSZWRpcycsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiBmYWxzZVxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgUmVkaXMgYWNjZXNzIGZyb20gRUNTIHRhc2tzXG4gICAgcmVkaXNTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuc2VjdXJpdHlHcm91cElkKGVjc1NlY3VyaXR5R3JvdXAuc2VjdXJpdHlHcm91cElkKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg2Mzc5KSxcbiAgICAgICdBbGxvdyBSZWRpcyBhY2Nlc3MgZnJvbSBFQ1MgdGFza3MnXG4gICAgKTtcblxuICAgIHJldHVybiByZWRpc1NlY3VyaXR5R3JvdXA7XG4gIH1cbn1cbiJdfQ==