"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Efs = void 0;
/**
 * EFS Construct - CDK implementation of the Elastic File System
 */
const constructs_1 = require("constructs");
const aws_cdk_lib_1 = require("aws-cdk-lib");
/**
 * CDK construct for the EFS file system
 */
class Efs extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        // Create security group for EFS
        const efsSecurityGroup = new aws_cdk_lib_1.aws_ec2.SecurityGroup(this, 'EFSMountTargetSecurityGroup', {
            vpc: props.infrastructure.vpc,
            description: 'EFS to Auth ECS Service',
            allowAllOutbound: false
        });
        // Allow NFS access from specified security groups
        props.allowAccessFrom.forEach(sg => {
            efsSecurityGroup.addIngressRule(aws_cdk_lib_1.aws_ec2.Peer.securityGroupId(sg.securityGroupId), aws_cdk_lib_1.aws_ec2.Port.tcp(2049), 'Allow NFS access from ECS tasks');
        });
        // Also allow access from VPC CIDR for broader compatibility
        efsSecurityGroup.addIngressRule(aws_cdk_lib_1.aws_ec2.Peer.ipv4(props.vpcCidrBlock), // Reverted to use props.vpcCidrBlock directly
        aws_cdk_lib_1.aws_ec2.Port.tcp(2049), 'Allow NFS access from VPC');
        // Determine removal policy and throughput mode from environment configuration
        // Production: RETAIN policy to preserve data, Dev/Test: DESTROY to avoid costs
        const efsRemovalPolicy = props.config.efs.removalPolicy;
        const throughputMode = props.config.efs.throughputMode === 'provisioned'
            ? aws_cdk_lib_1.aws_efs.ThroughputMode.PROVISIONED
            : aws_cdk_lib_1.aws_efs.ThroughputMode.BURSTING;
        // Build EFS configuration object with file system policy
        const efsConfig = {
            vpc: props.infrastructure.vpc,
            encrypted: true,
            kmsKey: props.infrastructure.kmsKey,
            performanceMode: aws_cdk_lib_1.aws_efs.PerformanceMode.GENERAL_PURPOSE,
            throughputMode: throughputMode,
            securityGroup: efsSecurityGroup,
            removalPolicy: efsRemovalPolicy,
            fileSystemPolicy: aws_cdk_lib_1.aws_iam.PolicyDocument.fromJson({
                Version: '2012-10-17',
                Statement: [
                    {
                        Effect: 'Allow',
                        Principal: {
                            AWS: '*'
                        },
                        Action: [
                            'elasticfilesystem:ClientMount',
                            'elasticfilesystem:ClientWrite',
                            'elasticfilesystem:ClientRootAccess'
                        ],
                        Condition: {
                            Bool: {
                                'elasticfilesystem:AccessedViaMountTarget': 'true'
                            }
                        }
                    }
                ]
            })
        };
        // Add provisioned throughput if specified
        if (props.config.efs.throughputMode === 'provisioned' && props.config.efs.provisionedThroughput) {
            efsConfig.provisionedThroughputPerSecond = props.config.efs.provisionedThroughput;
        }
        // Create the EFS file system
        this.fileSystem = new aws_cdk_lib_1.aws_efs.FileSystem(this, 'EFS', efsConfig);
        // Create access point for media files
        this.mediaAccessPoint = new aws_cdk_lib_1.aws_efs.AccessPoint(this, 'EFSAccessPointMedia', {
            fileSystem: this.fileSystem,
            posixUser: {
                uid: '1000',
                gid: '1000'
            },
            path: '/media',
            createAcl: {
                ownerUid: '1000',
                ownerGid: '1000',
                permissions: '755'
            }
        });
        // Create access point for custom templates
        this.customTemplatesAccessPoint = new aws_cdk_lib_1.aws_efs.AccessPoint(this, 'EFSAccessPointCustomTemplates', {
            fileSystem: this.fileSystem,
            posixUser: {
                uid: '1000',
                gid: '1000'
            },
            path: '/custom-templates',
            createAcl: {
                ownerUid: '1000',
                ownerGid: '1000',
                permissions: '755'
            }
        });
        // Create outputs
        new aws_cdk_lib_1.CfnOutput(this, 'EFSFileSystemId', {
            value: this.fileSystem.fileSystemId,
            description: 'EFS file system ID'
        });
        new aws_cdk_lib_1.CfnOutput(this, 'EFSMediaAccessPointId', {
            value: this.mediaAccessPoint.accessPointId,
            description: 'EFS media access point ID'
        });
        new aws_cdk_lib_1.CfnOutput(this, 'EFSCustomTemplatesAccessPointId', {
            value: this.customTemplatesAccessPoint.accessPointId,
            description: 'EFS custom templates access point ID'
        });
    }
}
exports.Efs = Efs;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWZzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZWZzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOztHQUVHO0FBQ0gsMkNBQXVDO0FBQ3ZDLDZDQU9xQjtBQWtDckI7O0dBRUc7QUFDSCxNQUFhLEdBQUksU0FBUSxzQkFBUztJQWdCaEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFlO1FBQ3ZELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsZ0NBQWdDO1FBQ2hDLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxxQkFBRyxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsNkJBQTZCLEVBQUU7WUFDbEYsR0FBRyxFQUFFLEtBQUssQ0FBQyxjQUFjLENBQUMsR0FBRztZQUM3QixXQUFXLEVBQUUseUJBQXlCO1lBQ3RDLGdCQUFnQixFQUFFLEtBQUs7U0FDeEIsQ0FBQyxDQUFDO1FBRUgsa0RBQWtEO1FBQ2xELEtBQUssQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxFQUFFO1lBQ2pDLGdCQUFnQixDQUFDLGNBQWMsQ0FDN0IscUJBQUcsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQyxlQUFlLENBQUMsRUFDNUMscUJBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUNsQixpQ0FBaUMsQ0FDbEMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsNERBQTREO1FBQzVELGdCQUFnQixDQUFDLGNBQWMsQ0FDN0IscUJBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsRUFBRSw4Q0FBOEM7UUFDakYscUJBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUNsQiwyQkFBMkIsQ0FDNUIsQ0FBQztRQUVGLDhFQUE4RTtRQUM5RSwrRUFBK0U7UUFDL0UsTUFBTSxnQkFBZ0IsR0FBRyxLQUFLLENBQUMs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RUgsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSx1QkFBdUIsRUFBRTtZQUMzQyxLQUFLLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGFBQWE7WUFDMUMsV0FBVyxFQUFFLDJCQUEyQjtTQUN6QyxDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLGlDQUFpQyxFQUFFO1lBQ3JELEtBQUssRUFBRSxJQUFJLENBQUMsMEJBQTBCLENBQUMsYUFBYTtZQUNwRCxXQUFXLEVBQUUsc0NBQXNDO1NBQ3BELENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXZJRCxrQkF1SUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEVGUyBDb25zdHJ1Y3QgLSBDREsgaW1wbGVtZW50YXRpb24gb2YgdGhlIEVsYXN0aWMgRmlsZSBTeXN0ZW1cbiAqL1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQge1xuICBhd3NfZWZzIGFzIGVmcyxcbiAgYXdzX2VjMiBhcyBlYzIsXG4gIGF3c19rbXMgYXMga21zLFxuICBhd3NfaWFtIGFzIGlhbSxcbiAgQ2ZuT3V0cHV0LFxuICBSZW1vdmFsUG9saWN5XG59IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB0eXBlIHsgQXV0aEluZnJhRW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuLi9lbnZpcm9ubWVudC1jb25maWcnO1xuaW1wb3J0IHR5cGUgeyBJbmZyYXN0cnVjdHVyZUNvbmZpZyB9IGZyb20gJy4uL2NvbnN0cnVjdC1jb25maWdzJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciB0aGUgRUZTIGNvbnN0cnVjdFxuICovXG5leHBvcnQgaW50ZXJmYWNlIEVmc1Byb3BzIHtcbiAgLyoqXG4gICAqIEVudmlyb25tZW50IG5hbWUgKGUuZy4gJ3Byb2QnLCAnZGV2JywgZXRjLilcbiAgICovXG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEVudmlyb25tZW50IGNvbmZpZ3VyYXRpb25cbiAgICovXG4gIGNvbmZpZzogQXV0aEluZnJhRW52aXJvbm1lbnRDb25maWc7XG5cbiAgLyoqXG4gICAqIEluZnJhc3RydWN0dXJlIGNvbmZpZ3VyYXRpb24gKFZQQywgS01TKVxuICAgKi9cbiAgaW5mcmFzdHJ1Y3R1cmU6IEluZnJhc3RydWN0dXJlQ29uZmlnO1xuXG4gIC8qKlxuICAgKiBWUEMgQ0lEUiBibG9jayBmb3Igc2VjdXJpdHkgZ3JvdXAgcnVsZXNcbiAgICovXG4gIHZwY0NpZHJCbG9jazogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBTZWN1cml0eSBncm91cHMgZm9yIEVGUyBhY2Nlc3NcbiAgICovXG4gIGFsbG93QWNjZXNzRnJvbTogZWMyLlNlY3VyaXR5R3JvdXBbXTtcbn1cblxuLyoqXG4gKiBDREsgY29uc3RydWN0IGZvciB0aGUgRUZTIGZpbGUgc3lzdGVtXG4gKi9cbmV4cG9ydCBjbGFzcyBFZnMgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICAvKipcbiAgICogVGhlIEVGUyBmaWxlIHN5c3RlbVxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGZpbGVTeXN0ZW06IGVmcy5GaWxlU3lzdGVtO1xuXG4gIC8qKlxuICAgKiBUaGUgRUZTIGFjY2VzcyBwb2ludCBmb3IgbWVkaWFcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBtZWRpYUFjY2Vzc1BvaW50OiBlZnMuQWNjZXNzUG9pbnQ7XG5cbiAgLyoqXG4gICAqIFRoZSBFRlMgYWNjZXNzIHBvaW50IGZvciBjdXN0b20gdGVtcGxhdGVzXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgY3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnQ6IGVmcy5BY2Nlc3NQb2ludDtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogRWZzUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gQ3JlYXRlIHNlY3VyaXR5IGdyb3VwIGZvciBFRlNcbiAgICBjb25zdCBlZnNTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdFRlNNb3VudFRhcmdldFNlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGM6IHByb3BzLmluZnJhc3RydWN0dXJlLnZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRUZTIHRvIEF1dGggRUNTIFNlcnZpY2UnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogZmFsc2VcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IE5GUyBhY2Nlc3MgZnJvbSBzcGVjaWZpZWQgc2VjdXJpdHkgZ3JvdXBzXG4gICAgcHJvcHMuYWxsb3dBY2Nlc3NGcm9tLmZvckVhY2goc2cgPT4ge1xuICAgICAgZWZzU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgICAgZWMyLlBlZXIuc2VjdXJpdHlHcm91cElkKHNnLnNlY3VyaXR5R3JvdXBJZCksXG4gICAgICAgIGVjMi5Qb3J0LnRjcCgyMDQ5KSxcbiAgICAgICAgJ0FsbG93IE5GUyBhY2Nlc3MgZnJvbSBFQ1MgdGFza3MnXG4gICAgICApO1xuICAgIH0pO1xuXG4gICAgLy8gQWxzbyBhbGxvdyBhY2Nlc3MgZnJvbSBWUEMgQ0lEUiBmb3IgYnJvYWRlciBjb21wYXRpYmlsaXR5XG4gICAgZWZzU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmlwdjQocHJvcHMudnBjQ2lkckJsb2NrKSwgLy8gUmV2ZXJ0ZWQgdG8gdXNlIHByb3BzLnZwY0NpZHJCbG9jayBkaXJlY3RseVxuICAgICAgZWMyLlBvcnQudGNwKDIwNDkpLFxuICAgICAgJ0FsbG93IE5GUyBhY2Nlc3MgZnJvbSBWUEMnXG4gICAgKTtcblxuICAgIC8vIERldGVybWluZSByZW1vdmFsIHBvbGljeSBhbmQgdGhyb3VnaHB1dCBtb2RlIGZyb20gZW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxuICAgIC8vIFByb2R1Y3Rpb246IFJFVEFJTiBwb2xpY3kgdG8gcHJlc2VydmUgZGF0YSwgRGV2L1Rlc3Q6IERFU1RST1kgdG8gYXZvaWQgY29zdHNcbiAgICBjb25zdCBlZnNSZW1vdmFsUG9saWN5ID0gcHJvcHMuY29uZmlnLmVmcy5yZW1vdmFsUG9saWN5O1xuICAgIGNvbnN0IHRocm91Z2hwdXRNb2RlID0gcHJvcHMuY29uZmlnLmVmcy50aHJvdWdocHV0TW9kZSA9PT0gJ3Byb3Zpc2lvbmVkJyBcbiAgICAgID8gZWZzLlRocm91Z2hwdXRNb2RlLlBST1ZJU0lPTkVEIFxuICAgICAgOiBlZnMuVGhyb3VnaHB1dE1vZGUuQlVSU1RJTkc7XG5cbiAgICAvLyBCdWlsZCBFRlMgY29uZmlndXJhdGlvbiBvYmplY3Qgd2l0aCBmaWxlIHN5c3RlbSBwb2xpY3lcbiAgICBjb25zdCBlZnNDb25maWc6IGFueSA9IHtcbiAgICAgIHZwYzogcHJvcHMuaW5mcmFzdHJ1Y3R1cmUudnBjLFxuICAgICAgZW5jcnlwdGVkOiB0cnVlLFxuICAgICAga21zS2V5OiBwcm9wcy5pbmZyYXN0cnVjdHVyZS5rbXNLZXksXG4gICAgICBwZXJmb3JtYW5jZU1vZGU6IGVmcy5QZXJmb3JtYW5jZU1vZGUuR0VORVJBTF9QVVJQT1NFLFxuICAgICAgdGhyb3VnaHB1dE1vZGU6IHRocm91Z2hwdXRNb2RlLFxuICAgICAgc2VjdXJpdHlHcm91cDogZWZzU2VjdXJpdHlHcm91cCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGVmc1JlbW92YWxQb2xpY3ksXG4gICAgICBmaWxlU3lzdGVtUG9saWN5OiBpYW0uUG9saWN5RG9jdW1lbnQuZnJvbUpzb24oe1xuICAgICAgICBWZXJzaW9uOiAnMjAxMi0xMC0xNycsXG4gICAgICAgIFN0YXRlbWVudDogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIEVmZmVjdDogJ0FsbG93JyxcbiAgICAgICAgICAgIFByaW5jaXBhbDoge1xuICAgICAgICAgICAgICBBV1M6ICcqJ1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIEFjdGlvbjogW1xuICAgICAgICAgICAgICAnZWxhc3RpY2ZpbGVzeXN0ZW06Q2xpZW50TW91bnQnLFxuICAgICAgICAgICAgICAnZWxhc3RpY2ZpbGVzeXN0ZW06Q2xpZW50V3JpdGUnLFxuICAgICAgICAgICAgICAnZWxhc3RpY2ZpbGVzeXN0ZW06Q2xpZW50Um9vdEFjY2VzcydcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBDb25kaXRpb246IHtcbiAgICAgICAgICAgICAgQm9vbDoge1xuICAgICAgICAgICAgICAgICdlbGFzdGljZmlsZXN5c3RlbTpBY2Nlc3NlZFZpYU1vdW50VGFyZ2V0JzogJ3RydWUnXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIF1cbiAgICAgIH0pXG4gICAgfTtcblxuICAgIC8vIEFkZCBwcm92aXNpb25lZCB0aHJvdWdocHV0IGlmIHNwZWNpZmllZFxuICAgIGlmIChwcm9wcy5jb25maWcuZWZzLnRocm91Z2hwdXRNb2RlID09PSAncHJvdmlzaW9uZWQnICYmIHByb3BzLmNvbmZpZy5lZnMucHJvdmlzaW9uZWRUaHJvdWdocHV0KSB7XG4gICAgICBlZnNDb25maWcucHJvdmlzaW9uZWRUaHJvdWdocHV0UGVyU2Vjb25kID0gcHJvcHMuY29uZmlnLmVmcy5wcm92aXNpb25lZFRocm91Z2hwdXQ7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIHRoZSBFRlMgZmlsZSBzeXN0ZW1cbiAgICB0aGlzLmZpbGVTeXN0ZW0gPSBuZXcgZWZzLkZpbGVTeXN0ZW0odGhpcywgJ0VGUycsIGVmc0NvbmZpZyk7XG5cbiAgICAvLyBDcmVhdGUgYWNjZXNzIHBvaW50IGZvciBtZWRpYSBmaWxlc1xuICAgIHRoaXMubWVkaWFBY2Nlc3NQb2ludCA9IG5ldyBlZnMuQWNjZXNzUG9pbnQodGhpcywgJ0VGU0FjY2Vzc1BvaW50TWVkaWEnLCB7XG4gICAgICBmaWxlU3lzdGVtOiB0aGlzLmZpbGVTeXN0ZW0sXG4gICAgICBwb3NpeFVzZXI6IHtcbiAgICAgICAgdWlkOiAnMTAwMCcsXG4gICAgICAgIGdpZDogJzEwMDAnXG4gICAgICB9LFxuICAgICAgcGF0aDogJy9tZWRpYScsXG4gICAgICBjcmVhdGVBY2w6IHtcbiAgICAgICAgb3duZXJVaWQ6ICcxMDAwJyxcbiAgICAgICAgb3duZXJHaWQ6ICcxMDAwJyxcbiAgICAgICAgcGVybWlzc2lvbnM6ICc3NTUnXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgYWNjZXNzIHBvaW50IGZvciBjdXN0b20gdGVtcGxhdGVzXG4gICAgdGhpcy5jdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludCA9IG5ldyBlZnMuQWNjZXNzUG9pbnQodGhpcywgJ0VGU0FjY2Vzc1BvaW50Q3VzdG9tVGVtcGxhdGVzJywge1xuICAgICAgZmlsZVN5c3RlbTogdGhpcy5maWxlU3lzdGVtLFxuICAgICAgcG9zaXhVc2VyOiB7XG4gICAgICAgIHVpZDogJzEwMDAnLFxuICAgICAgICBnaWQ6ICcxMDAwJ1xuICAgICAgfSxcbiAgICAgIHBhdGg6ICcvY3VzdG9tLXRlbXBsYXRlcycsXG4gICAgICBjcmVhdGVBY2w6IHtcbiAgICAgICAgb3duZXJVaWQ6ICcxMDAwJyxcbiAgICAgICAgb3duZXJHaWQ6ICcxMDAwJyxcbiAgICAgICAgcGVybWlzc2lvbnM6ICc3NTUnXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgb3V0cHV0c1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0VGU0ZpbGVTeXN0ZW1JZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmZpbGVTeXN0ZW0uZmlsZVN5c3RlbUlkLFxuICAgICAgZGVzY3JpcHRpb246ICdFRlMgZmlsZSBzeXN0ZW0gSUQnXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdFRlNNZWRpYUFjY2Vzc1BvaW50SWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5tZWRpYUFjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0VGUyBtZWRpYSBhY2Nlc3MgcG9pbnQgSUQnXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdFRlNDdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludElkJywge1xuICAgICAgdmFsdWU6IHRoaXMuY3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnQuYWNjZXNzUG9pbnRJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRUZTIGN1c3RvbSB0ZW1wbGF0ZXMgYWNjZXNzIHBvaW50IElEJ1xuICAgIH0pO1xuICB9XG59XG4iXX0=