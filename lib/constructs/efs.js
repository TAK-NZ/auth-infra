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
            vpc: props.vpc,
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
            vpc: props.vpc,
            encrypted: true,
            kmsKey: props.kmsKey,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWZzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZWZzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOztHQUVHO0FBQ0gsMkNBQXVDO0FBQ3ZDLDZDQU9xQjtBQXNDckI7O0dBRUc7QUFDSCxNQUFhLEdBQUksU0FBUSxzQkFBUztJQWdCaEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFlO1FBQ3ZELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsZ0NBQWdDO1FBQ2hDLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxxQkFBRyxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsNkJBQTZCLEVBQUU7WUFDbEYsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHO1lBQ2QsV0FBVyxFQUFFLHlCQUF5QjtZQUN0QyxnQkFBZ0IsRUFBRSxLQUFLO1NBQ3hCLENBQUMsQ0FBQztRQUVILGtEQUFrRDtRQUNsRCxLQUFLLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsRUFBRTtZQUNqQyxnQkFBZ0IsQ0FBQyxjQUFjLENBQzdCLHFCQUFHLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUMsZUFBZSxDQUFDLEVBQzVDLHFCQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFDbEIsaUNBQWlDLENBQ2xDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILDREQUE0RDtRQUM1RCxnQkFBZ0IsQ0FBQyxjQUFjLENBQzdCLHFCQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLEVBQUUsOENBQThDO1FBQ2pGLHFCQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFDbEIsMkJBQTJCLENBQzVCLENBQUM7UUFFRiw4RUFBOEU7UUFDOUUsK0VBQStFO1FBQy9FLE1BQU0sZ0JBQWdCLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxH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QXVCLEVBQUU7WUFDM0MsS0FBSyxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhO1lBQzFDLFdBQVcsRUFBRSwyQkFBMkI7U0FDekMsQ0FBQyxDQUFDO1FBRUgsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxpQ0FBaUMsRUFBRTtZQUNyRCxLQUFLLEVBQUUsSUFBSSxDQUFDLDBCQUEwQixDQUFDLGFBQWE7WUFDcEQsV0FBVyxFQUFFLHNDQUFzQztTQUNwRCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF2SUQsa0JBdUlDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBFRlMgQ29uc3RydWN0IC0gQ0RLIGltcGxlbWVudGF0aW9uIG9mIHRoZSBFbGFzdGljIEZpbGUgU3lzdGVtXG4gKi9cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHtcbiAgYXdzX2VmcyBhcyBlZnMsXG4gIGF3c19lYzIgYXMgZWMyLFxuICBhd3Nfa21zIGFzIGttcyxcbiAgYXdzX2lhbSBhcyBpYW0sXG4gIENmbk91dHB1dCxcbiAgUmVtb3ZhbFBvbGljeVxufSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgdHlwZSB7IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi4vZW52aXJvbm1lbnQtY29uZmlnJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciB0aGUgRUZTIGNvbnN0cnVjdFxuICovXG5leHBvcnQgaW50ZXJmYWNlIEVmc1Byb3BzIHtcbiAgLyoqXG4gICAqIEVudmlyb25tZW50IG5hbWUgKGUuZy4gJ3Byb2QnLCAnZGV2JywgZXRjLilcbiAgICovXG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEVudmlyb25tZW50IGNvbmZpZ3VyYXRpb25cbiAgICovXG4gIGNvbmZpZzogQXV0aEluZnJhRW52aXJvbm1lbnRDb25maWc7XG5cbiAgLyoqXG4gICAqIFZQQyBmb3IgZGVwbG95bWVudFxuICAgKi9cbiAgdnBjOiBlYzIuSVZwYztcblxuICAvKipcbiAgICogVlBDIENJRFIgYmxvY2sgZm9yIHNlY3VyaXR5IGdyb3VwIHJ1bGVzXG4gICAqL1xuICB2cGNDaWRyQmxvY2s6IHN0cmluZztcblxuICAvKipcbiAgICogS01TIGtleSBmb3IgZW5jcnlwdGlvblxuICAgKi9cbiAga21zS2V5OiBrbXMuSUtleTtcblxuICAvKipcbiAgICogU2VjdXJpdHkgZ3JvdXBzIGZvciBFRlMgYWNjZXNzXG4gICAqL1xuICBhbGxvd0FjY2Vzc0Zyb206IGVjMi5TZWN1cml0eUdyb3VwW107XG59XG5cbi8qKlxuICogQ0RLIGNvbnN0cnVjdCBmb3IgdGhlIEVGUyBmaWxlIHN5c3RlbVxuICovXG5leHBvcnQgY2xhc3MgRWZzIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgLyoqXG4gICAqIFRoZSBFRlMgZmlsZSBzeXN0ZW1cbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBmaWxlU3lzdGVtOiBlZnMuRmlsZVN5c3RlbTtcblxuICAvKipcbiAgICogVGhlIEVGUyBhY2Nlc3MgcG9pbnQgZm9yIG1lZGlhXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgbWVkaWFBY2Nlc3NQb2ludDogZWZzLkFjY2Vzc1BvaW50O1xuXG4gIC8qKlxuICAgKiBUaGUgRUZTIGFjY2VzcyBwb2ludCBmb3IgY3VzdG9tIHRlbXBsYXRlc1xuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50OiBlZnMuQWNjZXNzUG9pbnQ7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEVmc1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIC8vIENyZWF0ZSBzZWN1cml0eSBncm91cCBmb3IgRUZTXG4gICAgY29uc3QgZWZzU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnRUZTTW91bnRUYXJnZXRTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ0VGUyB0byBBdXRoIEVDUyBTZXJ2aWNlJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IGZhbHNlXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBORlMgYWNjZXNzIGZyb20gc3BlY2lmaWVkIHNlY3VyaXR5IGdyb3Vwc1xuICAgIHByb3BzLmFsbG93QWNjZXNzRnJvbS5mb3JFYWNoKHNnID0+IHtcbiAgICAgIGVmc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICAgIGVjMi5QZWVyLnNlY3VyaXR5R3JvdXBJZChzZy5zZWN1cml0eUdyb3VwSWQpLFxuICAgICAgICBlYzIuUG9ydC50Y3AoMjA0OSksXG4gICAgICAgICdBbGxvdyBORlMgYWNjZXNzIGZyb20gRUNTIHRhc2tzJ1xuICAgICAgKTtcbiAgICB9KTtcblxuICAgIC8vIEFsc28gYWxsb3cgYWNjZXNzIGZyb20gVlBDIENJRFIgZm9yIGJyb2FkZXIgY29tcGF0aWJpbGl0eVxuICAgIGVmc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5pcHY0KHByb3BzLnZwY0NpZHJCbG9jayksIC8vIFJldmVydGVkIHRvIHVzZSBwcm9wcy52cGNDaWRyQmxvY2sgZGlyZWN0bHlcbiAgICAgIGVjMi5Qb3J0LnRjcCgyMDQ5KSxcbiAgICAgICdBbGxvdyBORlMgYWNjZXNzIGZyb20gVlBDJ1xuICAgICk7XG5cbiAgICAvLyBEZXRlcm1pbmUgcmVtb3ZhbCBwb2xpY3kgYW5kIHRocm91Z2hwdXQgbW9kZSBmcm9tIGVudmlyb25tZW50IGNvbmZpZ3VyYXRpb25cbiAgICAvLyBQcm9kdWN0aW9uOiBSRVRBSU4gcG9saWN5IHRvIHByZXNlcnZlIGRhdGEsIERldi9UZXN0OiBERVNUUk9ZIHRvIGF2b2lkIGNvc3RzXG4gICAgY29uc3QgZWZzUmVtb3ZhbFBvbGljeSA9IHByb3BzLmNvbmZpZy5lZnMucmVtb3ZhbFBvbGljeTtcbiAgICBjb25zdCB0aHJvdWdocHV0TW9kZSA9IHByb3BzLmNvbmZpZy5lZnMudGhyb3VnaHB1dE1vZGUgPT09ICdwcm92aXNpb25lZCcgXG4gICAgICA/IGVmcy5UaHJvdWdocHV0TW9kZS5QUk9WSVNJT05FRCBcbiAgICAgIDogZWZzLlRocm91Z2hwdXRNb2RlLkJVUlNUSU5HO1xuXG4gICAgLy8gQnVpbGQgRUZTIGNvbmZpZ3VyYXRpb24gb2JqZWN0IHdpdGggZmlsZSBzeXN0ZW0gcG9saWN5XG4gICAgY29uc3QgZWZzQ29uZmlnOiBhbnkgPSB7XG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgIGVuY3J5cHRlZDogdHJ1ZSxcbiAgICAgIGttc0tleTogcHJvcHMua21zS2V5LFxuICAgICAgcGVyZm9ybWFuY2VNb2RlOiBlZnMuUGVyZm9ybWFuY2VNb2RlLkdFTkVSQUxfUFVSUE9TRSxcbiAgICAgIHRocm91Z2hwdXRNb2RlOiB0aHJvdWdocHV0TW9kZSxcbiAgICAgIHNlY3VyaXR5R3JvdXA6IGVmc1NlY3VyaXR5R3JvdXAsXG4gICAgICByZW1vdmFsUG9saWN5OiBlZnNSZW1vdmFsUG9saWN5LFxuICAgICAgZmlsZVN5c3RlbVBvbGljeTogaWFtLlBvbGljeURvY3VtZW50LmZyb21Kc29uKHtcbiAgICAgICAgVmVyc2lvbjogJzIwMTItMTAtMTcnLFxuICAgICAgICBTdGF0ZW1lbnQ6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBFZmZlY3Q6ICdBbGxvdycsXG4gICAgICAgICAgICBQcmluY2lwYWw6IHtcbiAgICAgICAgICAgICAgQVdTOiAnKidcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBBY3Rpb246IFtcbiAgICAgICAgICAgICAgJ2VsYXN0aWNmaWxlc3lzdGVtOkNsaWVudE1vdW50JyxcbiAgICAgICAgICAgICAgJ2VsYXN0aWNmaWxlc3lzdGVtOkNsaWVudFdyaXRlJyxcbiAgICAgICAgICAgICAgJ2VsYXN0aWNmaWxlc3lzdGVtOkNsaWVudFJvb3RBY2Nlc3MnXG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgQ29uZGl0aW9uOiB7XG4gICAgICAgICAgICAgIEJvb2w6IHtcbiAgICAgICAgICAgICAgICAnZWxhc3RpY2ZpbGVzeXN0ZW06QWNjZXNzZWRWaWFNb3VudFRhcmdldCc6ICd0cnVlJ1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICBdXG4gICAgICB9KVxuICAgIH07XG5cbiAgICAvLyBBZGQgcHJvdmlzaW9uZWQgdGhyb3VnaHB1dCBpZiBzcGVjaWZpZWRcbiAgICBpZiAocHJvcHMuY29uZmlnLmVmcy50aHJvdWdocHV0TW9kZSA9PT0gJ3Byb3Zpc2lvbmVkJyAmJiBwcm9wcy5jb25maWcuZWZzLnByb3Zpc2lvbmVkVGhyb3VnaHB1dCkge1xuICAgICAgZWZzQ29uZmlnLnByb3Zpc2lvbmVkVGhyb3VnaHB1dFBlclNlY29uZCA9IHByb3BzLmNvbmZpZy5lZnMucHJvdmlzaW9uZWRUaHJvdWdocHV0O1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSB0aGUgRUZTIGZpbGUgc3lzdGVtXG4gICAgdGhpcy5maWxlU3lzdGVtID0gbmV3IGVmcy5GaWxlU3lzdGVtKHRoaXMsICdFRlMnLCBlZnNDb25maWcpO1xuXG4gICAgLy8gQ3JlYXRlIGFjY2VzcyBwb2ludCBmb3IgbWVkaWEgZmlsZXNcbiAgICB0aGlzLm1lZGlhQWNjZXNzUG9pbnQgPSBuZXcgZWZzLkFjY2Vzc1BvaW50KHRoaXMsICdFRlNBY2Nlc3NQb2ludE1lZGlhJywge1xuICAgICAgZmlsZVN5c3RlbTogdGhpcy5maWxlU3lzdGVtLFxuICAgICAgcG9zaXhVc2VyOiB7XG4gICAgICAgIHVpZDogJzEwMDAnLFxuICAgICAgICBnaWQ6ICcxMDAwJ1xuICAgICAgfSxcbiAgICAgIHBhdGg6ICcvbWVkaWEnLFxuICAgICAgY3JlYXRlQWNsOiB7XG4gICAgICAgIG93bmVyVWlkOiAnMTAwMCcsXG4gICAgICAgIG93bmVyR2lkOiAnMTAwMCcsXG4gICAgICAgIHBlcm1pc3Npb25zOiAnNzU1J1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIGFjY2VzcyBwb2ludCBmb3IgY3VzdG9tIHRlbXBsYXRlc1xuICAgIHRoaXMuY3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnQgPSBuZXcgZWZzLkFjY2Vzc1BvaW50KHRoaXMsICdFRlNBY2Nlc3NQb2ludEN1c3RvbVRlbXBsYXRlcycsIHtcbiAgICAgIGZpbGVTeXN0ZW06IHRoaXMuZmlsZVN5c3RlbSxcbiAgICAgIHBvc2l4VXNlcjoge1xuICAgICAgICB1aWQ6ICcxMDAwJyxcbiAgICAgICAgZ2lkOiAnMTAwMCdcbiAgICAgIH0sXG4gICAgICBwYXRoOiAnL2N1c3RvbS10ZW1wbGF0ZXMnLFxuICAgICAgY3JlYXRlQWNsOiB7XG4gICAgICAgIG93bmVyVWlkOiAnMTAwMCcsXG4gICAgICAgIG93bmVyR2lkOiAnMTAwMCcsXG4gICAgICAgIHBlcm1pc3Npb25zOiAnNzU1J1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIG91dHB1dHNcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdFRlNGaWxlU3lzdGVtSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5maWxlU3lzdGVtLmZpbGVTeXN0ZW1JZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRUZTIGZpbGUgc3lzdGVtIElEJ1xuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRUZTTWVkaWFBY2Nlc3NQb2ludElkJywge1xuICAgICAgdmFsdWU6IHRoaXMubWVkaWFBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkLFxuICAgICAgZGVzY3JpcHRpb246ICdFRlMgbWVkaWEgYWNjZXNzIHBvaW50IElEJ1xuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRUZTQ3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnRJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0VGUyBjdXN0b20gdGVtcGxhdGVzIGFjY2VzcyBwb2ludCBJRCdcbiAgICB9KTtcbiAgfVxufVxuIl19