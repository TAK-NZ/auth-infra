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
    }
}
exports.Efs = Efs;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWZzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZWZzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOztHQUVHO0FBQ0gsMkNBQXVDO0FBQ3ZDLDZDQU1xQjtBQWtDckI7O0dBRUc7QUFDSCxNQUFhLEdBQUksU0FBUSxzQkFBUztJQWdCaEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFlO1FBQ3ZELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsZ0NBQWdDO1FBQ2hDLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxxQkFBRyxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsNkJBQTZCLEVBQUU7WUFDbEYsR0FBRyxFQUFFLEtBQUssQ0FBQyxjQUFjLENBQUMsR0FBRztZQUM3QixXQUFXLEVBQUUseUJBQXlCO1lBQ3RDLGdCQUFnQixFQUFFLEtBQUs7U0FDeEIsQ0FBQyxDQUFDO1FBRUgsa0RBQWtEO1FBQ2xELEtBQUssQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxFQUFFO1lBQ2pDLGdCQUFnQixDQUFDLGNBQWMsQ0FDN0IscUJBQUcsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQyxlQUFlLENBQUMsRUFDNUMscUJBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUNsQixpQ0FBaUMsQ0FDbEMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsNERBQTREO1FBQzVELGdCQUFnQixDQUFDLGNBQWMsQ0FDN0IscUJBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsRUFBRSw4Q0FBOEM7UUFDakYscUJBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUNsQiwyQkFBMkIsQ0FDNUIsQ0FBQztRQUVGLDhFQUE4RTtRQUM5RSwrRUFBK0U7UUFDL0UsTUFBTSxnQkFBZ0IsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUM7UUFDeEQsTUFBTSxjQUFjLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsY0FBYyxLQUFLLGFBQWE7WUFDdEUsQ0FBQyxDQUFDLHFCQUFHLENBQUMsY0FBYyxDQUFDLFdBQVc7WUFDaEMsQ0FBQyxDQUFDLHFCQUFHLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQztRQUVoQyx5REFBeUQ7UUFDekQsTUFBTSxTQUFTLEdBQVE7WUFDckIsR0FBRyxFQUFFLEtBQUssQ0FBQyxjQUFjLENBQUMsR0FBRztZQUM3QixTQUFTLEVBQUUsSUFBSTtZQUNmLE1BQU0sRUFBRSxLQUFLLENBQUMsY0FBYyxDQUFDLE1BQU07WUFDbkMsZUFBZSxFQUFFLHFCQUFHLENBQUMsZUFBZSxDQUFDLGVBQWU7WUFDcEQsY0FBYyxFQUFFLGNBQWM7WUFDOUIsYUFBYSxFQUFFLGdCQUFnQjtZQUMvQixhQUFhLEVBQUUsZ0JBQWdCO1lBQy9CLGdCQUFnQixFQUFFLHFCQUFHLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQztnQkFDNUMsT0FBTyxFQUFFLFlBQVk7Z0JBQ3JCLFNBQVMsRUFBRTtvQkFDVDt3QkFDRSxNQUFNLEVBQUUsT0FBTzt3QkFDZixTQUFTLEVBQUU7NEJBQ1QsR0FBRyxFQUFFLEdBQUc7eUJBQ1Q7d0JBQ0QsTUFBTSxFQUFFOzRCQUNOLCtCQUErQjs0QkFDL0IsK0JBQStCOzRCQUMvQixvQ0FBb0M7eUJBQ3JDO3dCQUNELFNBQVMsRUFBRTs0QkFDVCxJQUFJLEVBQUU7Z0NBQ0osMENBQTBDLEVBQUUsTUFBTTs2QkFDbkQ7eUJBQ0Y7cUJBQ0Y7aUJBQ0Y7YUFDRixDQUFDO1NBQ0gsQ0FBQztRQUVGLDBDQUEwQztRQUMxQyxJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLGNBQWMsS0FBSyxhQUFhLElBQUksS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUNoRyxTQUFTLENBQUMsOEJBQThCLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUM7UUFDcEYsQ0FBQztRQUVELDZCQUE2QjtRQUM3QixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUkscUJBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxTQUFTLENBQUMsQ0FBQztRQUU3RCxzQ0FBc0M7UUFDdEMsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUkscUJBQUcsQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLHFCQUFxQixFQUFFO1lBQ3ZFLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVTtZQUMzQixTQUFTLEVBQUU7Z0JBQ1QsR0FBRyxFQUFFLE1BQU07Z0JBQ1gsR0FBRyxFQUFFLE1BQU07YUFDWjtZQUNELElBQUksRUFBRSxRQUFRO1lBQ2QsU0FBUyxFQUFFO2dCQUNULFFBQVEsRUFBRSxNQUFNO2dCQUNoQixRQUFRLEVBQUUsTUFBTTtnQkFDaEIsV0FBVyxFQUFFLEtBQUs7YUFDbkI7U0FDRixDQUFDLENBQUM7UUFFSCwyQ0FBMkM7UUFDM0MsSUFBSSxDQUFDLDBCQUEwQixHQUFHLElBQUkscUJBQUcsQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLCtCQUErQixFQUFFO1lBQzNGLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVTtZQUMzQixTQUFTLEVBQUU7Z0JBQ1QsR0FBRyxFQUFFLE1BQU07Z0JBQ1gsR0FBRyxFQUFFLE1BQU07YUFDWjtZQUNELElBQUksRUFBRSxtQkFBbUI7WUFDekIsU0FBUyxFQUFFO2dCQUNULFFBQVEsRUFBRSxNQUFNO2dCQUNoQixRQUFRLEVBQUUsTUFBTTtnQkFDaEIsV0FBVyxFQUFFLEtBQUs7YUFDbkI7U0FDRixDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF2SEQsa0JBdUhDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBFRlMgQ29uc3RydWN0IC0gQ0RLIGltcGxlbWVudGF0aW9uIG9mIHRoZSBFbGFzdGljIEZpbGUgU3lzdGVtXG4gKi9cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHtcbiAgYXdzX2VmcyBhcyBlZnMsXG4gIGF3c19lYzIgYXMgZWMyLFxuICBhd3Nfa21zIGFzIGttcyxcbiAgYXdzX2lhbSBhcyBpYW0sXG4gIFJlbW92YWxQb2xpY3lcbn0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHR5cGUgeyBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZyB9IGZyb20gJy4uL2Vudmlyb25tZW50LWNvbmZpZyc7XG5pbXBvcnQgdHlwZSB7IEluZnJhc3RydWN0dXJlQ29uZmlnIH0gZnJvbSAnLi4vY29uc3RydWN0LWNvbmZpZ3MnO1xuXG4vKipcbiAqIFByb3BlcnRpZXMgZm9yIHRoZSBFRlMgY29uc3RydWN0XG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgRWZzUHJvcHMge1xuICAvKipcbiAgICogRW52aXJvbm1lbnQgbmFtZSAoZS5nLiAncHJvZCcsICdkZXYnLCBldGMuKVxuICAgKi9cbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcblxuICAvKipcbiAgICogRW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxuICAgKi9cbiAgY29uZmlnOiBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZztcblxuICAvKipcbiAgICogSW5mcmFzdHJ1Y3R1cmUgY29uZmlndXJhdGlvbiAoVlBDLCBLTVMpXG4gICAqL1xuICBpbmZyYXN0cnVjdHVyZTogSW5mcmFzdHJ1Y3R1cmVDb25maWc7XG5cbiAgLyoqXG4gICAqIFZQQyBDSURSIGJsb2NrIGZvciBzZWN1cml0eSBncm91cCBydWxlc1xuICAgKi9cbiAgdnBjQ2lkckJsb2NrOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFNlY3VyaXR5IGdyb3VwcyBmb3IgRUZTIGFjY2Vzc1xuICAgKi9cbiAgYWxsb3dBY2Nlc3NGcm9tOiBlYzIuU2VjdXJpdHlHcm91cFtdO1xufVxuXG4vKipcbiAqIENESyBjb25zdHJ1Y3QgZm9yIHRoZSBFRlMgZmlsZSBzeXN0ZW1cbiAqL1xuZXhwb3J0IGNsYXNzIEVmcyBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBUaGUgRUZTIGZpbGUgc3lzdGVtXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgZmlsZVN5c3RlbTogZWZzLkZpbGVTeXN0ZW07XG5cbiAgLyoqXG4gICAqIFRoZSBFRlMgYWNjZXNzIHBvaW50IGZvciBtZWRpYVxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IG1lZGlhQWNjZXNzUG9pbnQ6IGVmcy5BY2Nlc3NQb2ludDtcblxuICAvKipcbiAgICogVGhlIEVGUyBhY2Nlc3MgcG9pbnQgZm9yIGN1c3RvbSB0ZW1wbGF0ZXNcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBjdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludDogZWZzLkFjY2Vzc1BvaW50O1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBFZnNQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICAvLyBDcmVhdGUgc2VjdXJpdHkgZ3JvdXAgZm9yIEVGU1xuICAgIGNvbnN0IGVmc1NlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0VGU01vdW50VGFyZ2V0U2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYzogcHJvcHMuaW5mcmFzdHJ1Y3R1cmUudnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdFRlMgdG8gQXV0aCBFQ1MgU2VydmljZScsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiBmYWxzZVxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgTkZTIGFjY2VzcyBmcm9tIHNwZWNpZmllZCBzZWN1cml0eSBncm91cHNcbiAgICBwcm9wcy5hbGxvd0FjY2Vzc0Zyb20uZm9yRWFjaChzZyA9PiB7XG4gICAgICBlZnNTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgICBlYzIuUGVlci5zZWN1cml0eUdyb3VwSWQoc2cuc2VjdXJpdHlHcm91cElkKSxcbiAgICAgICAgZWMyLlBvcnQudGNwKDIwNDkpLFxuICAgICAgICAnQWxsb3cgTkZTIGFjY2VzcyBmcm9tIEVDUyB0YXNrcydcbiAgICAgICk7XG4gICAgfSk7XG5cbiAgICAvLyBBbHNvIGFsbG93IGFjY2VzcyBmcm9tIFZQQyBDSURSIGZvciBicm9hZGVyIGNvbXBhdGliaWxpdHlcbiAgICBlZnNTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuaXB2NChwcm9wcy52cGNDaWRyQmxvY2spLCAvLyBSZXZlcnRlZCB0byB1c2UgcHJvcHMudnBjQ2lkckJsb2NrIGRpcmVjdGx5XG4gICAgICBlYzIuUG9ydC50Y3AoMjA0OSksXG4gICAgICAnQWxsb3cgTkZTIGFjY2VzcyBmcm9tIFZQQydcbiAgICApO1xuXG4gICAgLy8gRGV0ZXJtaW5lIHJlbW92YWwgcG9saWN5IGFuZCB0aHJvdWdocHV0IG1vZGUgZnJvbSBlbnZpcm9ubWVudCBjb25maWd1cmF0aW9uXG4gICAgLy8gUHJvZHVjdGlvbjogUkVUQUlOIHBvbGljeSB0byBwcmVzZXJ2ZSBkYXRhLCBEZXYvVGVzdDogREVTVFJPWSB0byBhdm9pZCBjb3N0c1xuICAgIGNvbnN0IGVmc1JlbW92YWxQb2xpY3kgPSBwcm9wcy5jb25maWcuZWZzLnJlbW92YWxQb2xpY3k7XG4gICAgY29uc3QgdGhyb3VnaHB1dE1vZGUgPSBwcm9wcy5jb25maWcuZWZzLnRocm91Z2hwdXRNb2RlID09PSAncHJvdmlzaW9uZWQnIFxuICAgICAgPyBlZnMuVGhyb3VnaHB1dE1vZGUuUFJPVklTSU9ORUQgXG4gICAgICA6IGVmcy5UaHJvdWdocHV0TW9kZS5CVVJTVElORztcblxuICAgIC8vIEJ1aWxkIEVGUyBjb25maWd1cmF0aW9uIG9iamVjdCB3aXRoIGZpbGUgc3lzdGVtIHBvbGljeVxuICAgIGNvbnN0IGVmc0NvbmZpZzogYW55ID0ge1xuICAgICAgdnBjOiBwcm9wcy5pbmZyYXN0cnVjdHVyZS52cGMsXG4gICAgICBlbmNyeXB0ZWQ6IHRydWUsXG4gICAgICBrbXNLZXk6IHByb3BzLmluZnJhc3RydWN0dXJlLmttc0tleSxcbiAgICAgIHBlcmZvcm1hbmNlTW9kZTogZWZzLlBlcmZvcm1hbmNlTW9kZS5HRU5FUkFMX1BVUlBPU0UsXG4gICAgICB0aHJvdWdocHV0TW9kZTogdGhyb3VnaHB1dE1vZGUsXG4gICAgICBzZWN1cml0eUdyb3VwOiBlZnNTZWN1cml0eUdyb3VwLFxuICAgICAgcmVtb3ZhbFBvbGljeTogZWZzUmVtb3ZhbFBvbGljeSxcbiAgICAgIGZpbGVTeXN0ZW1Qb2xpY3k6IGlhbS5Qb2xpY3lEb2N1bWVudC5mcm9tSnNvbih7XG4gICAgICAgIFZlcnNpb246ICcyMDEyLTEwLTE3JyxcbiAgICAgICAgU3RhdGVtZW50OiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgRWZmZWN0OiAnQWxsb3cnLFxuICAgICAgICAgICAgUHJpbmNpcGFsOiB7XG4gICAgICAgICAgICAgIEFXUzogJyonXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgQWN0aW9uOiBbXG4gICAgICAgICAgICAgICdlbGFzdGljZmlsZXN5c3RlbTpDbGllbnRNb3VudCcsXG4gICAgICAgICAgICAgICdlbGFzdGljZmlsZXN5c3RlbTpDbGllbnRXcml0ZScsXG4gICAgICAgICAgICAgICdlbGFzdGljZmlsZXN5c3RlbTpDbGllbnRSb290QWNjZXNzJ1xuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIENvbmRpdGlvbjoge1xuICAgICAgICAgICAgICBCb29sOiB7XG4gICAgICAgICAgICAgICAgJ2VsYXN0aWNmaWxlc3lzdGVtOkFjY2Vzc2VkVmlhTW91bnRUYXJnZXQnOiAndHJ1ZSdcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgICAgfSlcbiAgICB9O1xuXG4gICAgLy8gQWRkIHByb3Zpc2lvbmVkIHRocm91Z2hwdXQgaWYgc3BlY2lmaWVkXG4gICAgaWYgKHByb3BzLmNvbmZpZy5lZnMudGhyb3VnaHB1dE1vZGUgPT09ICdwcm92aXNpb25lZCcgJiYgcHJvcHMuY29uZmlnLmVmcy5wcm92aXNpb25lZFRocm91Z2hwdXQpIHtcbiAgICAgIGVmc0NvbmZpZy5wcm92aXNpb25lZFRocm91Z2hwdXRQZXJTZWNvbmQgPSBwcm9wcy5jb25maWcuZWZzLnByb3Zpc2lvbmVkVGhyb3VnaHB1dDtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgdGhlIEVGUyBmaWxlIHN5c3RlbVxuICAgIHRoaXMuZmlsZVN5c3RlbSA9IG5ldyBlZnMuRmlsZVN5c3RlbSh0aGlzLCAnRUZTJywgZWZzQ29uZmlnKTtcblxuICAgIC8vIENyZWF0ZSBhY2Nlc3MgcG9pbnQgZm9yIG1lZGlhIGZpbGVzXG4gICAgdGhpcy5tZWRpYUFjY2Vzc1BvaW50ID0gbmV3IGVmcy5BY2Nlc3NQb2ludCh0aGlzLCAnRUZTQWNjZXNzUG9pbnRNZWRpYScsIHtcbiAgICAgIGZpbGVTeXN0ZW06IHRoaXMuZmlsZVN5c3RlbSxcbiAgICAgIHBvc2l4VXNlcjoge1xuICAgICAgICB1aWQ6ICcxMDAwJyxcbiAgICAgICAgZ2lkOiAnMTAwMCdcbiAgICAgIH0sXG4gICAgICBwYXRoOiAnL21lZGlhJyxcbiAgICAgIGNyZWF0ZUFjbDoge1xuICAgICAgICBvd25lclVpZDogJzEwMDAnLFxuICAgICAgICBvd25lckdpZDogJzEwMDAnLFxuICAgICAgICBwZXJtaXNzaW9uczogJzc1NSdcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBhY2Nlc3MgcG9pbnQgZm9yIGN1c3RvbSB0ZW1wbGF0ZXNcbiAgICB0aGlzLmN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50ID0gbmV3IGVmcy5BY2Nlc3NQb2ludCh0aGlzLCAnRUZTQWNjZXNzUG9pbnRDdXN0b21UZW1wbGF0ZXMnLCB7XG4gICAgICBmaWxlU3lzdGVtOiB0aGlzLmZpbGVTeXN0ZW0sXG4gICAgICBwb3NpeFVzZXI6IHtcbiAgICAgICAgdWlkOiAnMTAwMCcsXG4gICAgICAgIGdpZDogJzEwMDAnXG4gICAgICB9LFxuICAgICAgcGF0aDogJy9jdXN0b20tdGVtcGxhdGVzJyxcbiAgICAgIGNyZWF0ZUFjbDoge1xuICAgICAgICBvd25lclVpZDogJzEwMDAnLFxuICAgICAgICBvd25lckdpZDogJzEwMDAnLFxuICAgICAgICBwZXJtaXNzaW9uczogJzc1NSdcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufVxuIl19