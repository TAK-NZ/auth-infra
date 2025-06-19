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
        // Derive environment-specific values from context (matches reference pattern)
        const isHighAvailability = props.environment === 'prod';
        const efsRemovalPolicy = props.contextConfig.general.removalPolicy === 'RETAIN' ?
            aws_cdk_lib_1.RemovalPolicy.RETAIN : aws_cdk_lib_1.RemovalPolicy.DESTROY;
        const throughputMode = aws_cdk_lib_1.aws_efs.ThroughputMode.BURSTING; // Use bursting mode for cost optimization
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
        // Since we're using bursting mode for cost optimization, skip provisioned throughput
        // (This simplifies the config to match reference architecture patterns)
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWZzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZWZzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOztHQUVHO0FBQ0gsMkNBQXVDO0FBQ3ZDLDZDQU1xQjtBQWtDckI7O0dBRUc7QUFDSCxNQUFhLEdBQUksU0FBUSxzQkFBUztJQWdCaEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFlO1FBQ3ZELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsOEVBQThFO1FBQzlFLE1BQU0sa0JBQWtCLEdBQUcsS0FBSyxDQUFDLFdBQVcsS0FBSyxNQUFNLENBQUM7UUFDeEQsTUFBTSxnQkFBZ0IsR0FBRyxLQUFLLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxhQUFhLEtBQUssUUFBUSxDQUFDLENBQUM7WUFDL0UsMkJBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLDJCQUFhLENBQUMsT0FBTyxDQUFDO1FBQy9DLE1BQU0sY0FBYyxHQUFHLHFCQUFHLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFDLDBDQUEwQztRQUU5RixnQ0FBZ0M7UUFDaEMsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLHFCQUFHLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSw2QkFBNkIsRUFBRTtZQUNsRixHQUFHLEVBQUUsS0FBSyxDQUFDLGNBQWMsQ0FBQyxHQUFHO1lBQzdCLFdBQVcsRUFBRSx5QkFBeUI7WUFDdEMsZ0JBQWdCLEVBQUUsS0FBSztTQUN4QixDQUFDLENBQUM7UUFFSCxrREFBa0Q7UUFDbEQsS0FBSyxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEVBQUU7WUFDakMsZ0JBQWdCLENBQUMsY0FBYyxDQUM3QixxQkFBRyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDLGVBQWUsQ0FBQyxFQUM1QyxxQkFBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQ2xCLGlDQUFpQyxDQUNsQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCw0REFBNEQ7UUFDNUQsZ0JBQWdCLENBQUMsY0FBYyxDQUM3QixxQkFBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxFQUFFLDhDQUE4QztRQUNqRixxQkFBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQ2xCLDJCQUEyQixDQUM1QixDQUFDO1FBRUYseURBQXlEO1FBQ3pELE1BQU0sU0FBUyxHQUFRO1lBQ3JCLEdBQUcsRUFBRSxLQUFLLENBQUMsY0FBYyxDQUFDLEdBQUc7WUFDN0IsU0FBUyxFQUFFLElBQUk7WUFDZixNQUFNLEVBQUUsS0FBSyxDQUFDLGNBQWMsQ0FBQyxNQUFNO1lBQ25DLGVBQWUsRUFBRSxxQkFBRyxDQUFDLGVBQWUsQ0FBQyxlQUFlO1lBQ3BELGNBQWMsRUFBRSxjQUFjO1lBQzlCLGFBQWEsRUFBRSxnQkFBZ0I7WUFDL0IsYUFBYSxFQUFFLGdCQUFnQjtZQUMvQixnQkFBZ0IsRUFBRSxxQkFBRyxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUM7Z0JBQzVDLE9BQU8sRUFBRSxZQUFZO2dCQUNyQixTQUFTLEVBQUU7b0JBQ1Q7d0JBQ0UsTUFBTSxFQUFFLE9BQU87d0JBQ2YsU0FBUyxFQUFFOzRCQUNULEdBQUcsRUFBRSxHQUFHO3lCQUNUO3dCQUNELE1BQU0sRUFBRTs0QkFDTiwrQkFBK0I7NEJBQy9CLCtCQUErQjs0QkFDL0Isb0NBQW9DO3lCQUNyQzt3QkFDRCxTQUFTLEVBQUU7NEJBQ1QsSUFBSSxFQUFFO2dDQUNKLDBDQUEwQyxFQUFFLE1BQU07NkJBQ25EO3lCQUNGO3FCQUNGO2lCQUNGO2FBQ0YsQ0FBQztTQUNILENBQUM7UUFFRixxRkFBcUY7UUFDckYsd0VBQXdFO1FBRXhFLDZCQUE2QjtRQUM3QixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUkscUJBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxTQUFTLENBQUMsQ0FBQztRQUU3RCxzQ0FBc0M7UUFDdEMsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUkscUJBQUcsQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLHFCQUFxQixFQUFFO1lBQ3ZFLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVTtZQUMzQixTQUFTLEVBQUU7Z0JBQ1QsR0FBRyxFQUFFLE1BQU07Z0JBQ1gsR0FBRyxFQUFFLE1BQU07YUFDWjtZQUNELElBQUksRUFBRSxRQUFRO1lBQ2QsU0FBUyxFQUFFO2dCQUNULFFBQVEsRUFBRSxNQUFNO2dCQUNoQixRQUFRLEVBQUUsTUFBTTtnQkFDaEIsV0FBVyxFQUFFLEtBQUs7YUFDbkI7U0FDRixDQUFDLENBQUM7UUFFSCwyQ0FBMkM7UUFDM0MsSUFBSSxDQUFDLDBCQUEwQixHQUFHLElBQUkscUJBQUcsQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLCtCQUErQixFQUFFO1lBQzNGLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVTtZQUMzQixTQUFTLEVBQUU7Z0JBQ1QsR0FBRyxFQUFFLE1BQU07Z0JBQ1gsR0FBRyxFQUFFLE1BQU07YUFDWjtZQUNELElBQUksRUFBRSxtQkFBbUI7WUFDekIsU0FBUyxFQUFFO2dCQUNULFFBQVEsRUFBRSxNQUFNO2dCQUNoQixRQUFRLEVBQUUsTUFBTTtnQkFDaEIsV0FBVyxFQUFFLEtBQUs7YUFDbkI7U0FDRixDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFwSEQsa0JBb0hDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBFRlMgQ29uc3RydWN0IC0gQ0RLIGltcGxlbWVudGF0aW9uIG9mIHRoZSBFbGFzdGljIEZpbGUgU3lzdGVtXG4gKi9cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHtcbiAgYXdzX2VmcyBhcyBlZnMsXG4gIGF3c19lYzIgYXMgZWMyLFxuICBhd3Nfa21zIGFzIGttcyxcbiAgYXdzX2lhbSBhcyBpYW0sXG4gIFJlbW92YWxQb2xpY3lcbn0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHR5cGUgeyBDb250ZXh0RW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuLi9zdGFjay1jb25maWcnO1xuaW1wb3J0IHR5cGUgeyBJbmZyYXN0cnVjdHVyZUNvbmZpZyB9IGZyb20gJy4uL2NvbnN0cnVjdC1jb25maWdzJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciB0aGUgRUZTIGNvbnN0cnVjdFxuICovXG5leHBvcnQgaW50ZXJmYWNlIEVmc1Byb3BzIHtcbiAgLyoqXG4gICAqIEVudmlyb25tZW50IHR5cGUgKCdwcm9kJyB8ICdkZXYtdGVzdCcpXG4gICAqL1xuICBlbnZpcm9ubWVudDogJ3Byb2QnIHwgJ2Rldi10ZXN0JztcblxuICAvKipcbiAgICogQ29udGV4dC1iYXNlZCBlbnZpcm9ubWVudCBjb25maWd1cmF0aW9uIChkaXJlY3QgZnJvbSBjZGsuanNvbilcbiAgICovXG4gIGNvbnRleHRDb25maWc6IENvbnRleHRFbnZpcm9ubWVudENvbmZpZztcblxuICAvKipcbiAgICogSW5mcmFzdHJ1Y3R1cmUgY29uZmlndXJhdGlvbiAoVlBDLCBLTVMpXG4gICAqL1xuICBpbmZyYXN0cnVjdHVyZTogSW5mcmFzdHJ1Y3R1cmVDb25maWc7XG5cbiAgLyoqXG4gICAqIFZQQyBDSURSIGJsb2NrIGZvciBzZWN1cml0eSBncm91cCBydWxlc1xuICAgKi9cbiAgdnBjQ2lkckJsb2NrOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFNlY3VyaXR5IGdyb3VwcyBmb3IgRUZTIGFjY2Vzc1xuICAgKi9cbiAgYWxsb3dBY2Nlc3NGcm9tOiBlYzIuU2VjdXJpdHlHcm91cFtdO1xufVxuXG4vKipcbiAqIENESyBjb25zdHJ1Y3QgZm9yIHRoZSBFRlMgZmlsZSBzeXN0ZW1cbiAqL1xuZXhwb3J0IGNsYXNzIEVmcyBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBUaGUgRUZTIGZpbGUgc3lzdGVtXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgZmlsZVN5c3RlbTogZWZzLkZpbGVTeXN0ZW07XG5cbiAgLyoqXG4gICAqIFRoZSBFRlMgYWNjZXNzIHBvaW50IGZvciBtZWRpYVxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IG1lZGlhQWNjZXNzUG9pbnQ6IGVmcy5BY2Nlc3NQb2ludDtcblxuICAvKipcbiAgICogVGhlIEVGUyBhY2Nlc3MgcG9pbnQgZm9yIGN1c3RvbSB0ZW1wbGF0ZXNcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBjdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludDogZWZzLkFjY2Vzc1BvaW50O1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBFZnNQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICAvLyBEZXJpdmUgZW52aXJvbm1lbnQtc3BlY2lmaWMgdmFsdWVzIGZyb20gY29udGV4dCAobWF0Y2hlcyByZWZlcmVuY2UgcGF0dGVybilcbiAgICBjb25zdCBpc0hpZ2hBdmFpbGFiaWxpdHkgPSBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2QnO1xuICAgIGNvbnN0IGVmc1JlbW92YWxQb2xpY3kgPSBwcm9wcy5jb250ZXh0Q29uZmlnLmdlbmVyYWwucmVtb3ZhbFBvbGljeSA9PT0gJ1JFVEFJTicgPyBcbiAgICAgIFJlbW92YWxQb2xpY3kuUkVUQUlOIDogUmVtb3ZhbFBvbGljeS5ERVNUUk9ZO1xuICAgIGNvbnN0IHRocm91Z2hwdXRNb2RlID0gZWZzLlRocm91Z2hwdXRNb2RlLkJVUlNUSU5HOyAvLyBVc2UgYnVyc3RpbmcgbW9kZSBmb3IgY29zdCBvcHRpbWl6YXRpb25cblxuICAgIC8vIENyZWF0ZSBzZWN1cml0eSBncm91cCBmb3IgRUZTXG4gICAgY29uc3QgZWZzU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnRUZTTW91bnRUYXJnZXRTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjOiBwcm9wcy5pbmZyYXN0cnVjdHVyZS52cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ0VGUyB0byBBdXRoIEVDUyBTZXJ2aWNlJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IGZhbHNlXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBORlMgYWNjZXNzIGZyb20gc3BlY2lmaWVkIHNlY3VyaXR5IGdyb3Vwc1xuICAgIHByb3BzLmFsbG93QWNjZXNzRnJvbS5mb3JFYWNoKHNnID0+IHtcbiAgICAgIGVmc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICAgIGVjMi5QZWVyLnNlY3VyaXR5R3JvdXBJZChzZy5zZWN1cml0eUdyb3VwSWQpLFxuICAgICAgICBlYzIuUG9ydC50Y3AoMjA0OSksXG4gICAgICAgICdBbGxvdyBORlMgYWNjZXNzIGZyb20gRUNTIHRhc2tzJ1xuICAgICAgKTtcbiAgICB9KTtcblxuICAgIC8vIEFsc28gYWxsb3cgYWNjZXNzIGZyb20gVlBDIENJRFIgZm9yIGJyb2FkZXIgY29tcGF0aWJpbGl0eVxuICAgIGVmc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5pcHY0KHByb3BzLnZwY0NpZHJCbG9jayksIC8vIFJldmVydGVkIHRvIHVzZSBwcm9wcy52cGNDaWRyQmxvY2sgZGlyZWN0bHlcbiAgICAgIGVjMi5Qb3J0LnRjcCgyMDQ5KSxcbiAgICAgICdBbGxvdyBORlMgYWNjZXNzIGZyb20gVlBDJ1xuICAgICk7XG5cbiAgICAvLyBCdWlsZCBFRlMgY29uZmlndXJhdGlvbiBvYmplY3Qgd2l0aCBmaWxlIHN5c3RlbSBwb2xpY3lcbiAgICBjb25zdCBlZnNDb25maWc6IGFueSA9IHtcbiAgICAgIHZwYzogcHJvcHMuaW5mcmFzdHJ1Y3R1cmUudnBjLFxuICAgICAgZW5jcnlwdGVkOiB0cnVlLFxuICAgICAga21zS2V5OiBwcm9wcy5pbmZyYXN0cnVjdHVyZS5rbXNLZXksXG4gICAgICBwZXJmb3JtYW5jZU1vZGU6IGVmcy5QZXJmb3JtYW5jZU1vZGUuR0VORVJBTF9QVVJQT1NFLFxuICAgICAgdGhyb3VnaHB1dE1vZGU6IHRocm91Z2hwdXRNb2RlLFxuICAgICAgc2VjdXJpdHlHcm91cDogZWZzU2VjdXJpdHlHcm91cCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGVmc1JlbW92YWxQb2xpY3ksXG4gICAgICBmaWxlU3lzdGVtUG9saWN5OiBpYW0uUG9saWN5RG9jdW1lbnQuZnJvbUpzb24oe1xuICAgICAgICBWZXJzaW9uOiAnMjAxMi0xMC0xNycsXG4gICAgICAgIFN0YXRlbWVudDogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIEVmZmVjdDogJ0FsbG93JyxcbiAgICAgICAgICAgIFByaW5jaXBhbDoge1xuICAgICAgICAgICAgICBBV1M6ICcqJ1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIEFjdGlvbjogW1xuICAgICAgICAgICAgICAnZWxhc3RpY2ZpbGVzeXN0ZW06Q2xpZW50TW91bnQnLFxuICAgICAgICAgICAgICAnZWxhc3RpY2ZpbGVzeXN0ZW06Q2xpZW50V3JpdGUnLFxuICAgICAgICAgICAgICAnZWxhc3RpY2ZpbGVzeXN0ZW06Q2xpZW50Um9vdEFjY2VzcydcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBDb25kaXRpb246IHtcbiAgICAgICAgICAgICAgQm9vbDoge1xuICAgICAgICAgICAgICAgICdlbGFzdGljZmlsZXN5c3RlbTpBY2Nlc3NlZFZpYU1vdW50VGFyZ2V0JzogJ3RydWUnXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIF1cbiAgICAgIH0pXG4gICAgfTtcblxuICAgIC8vIFNpbmNlIHdlJ3JlIHVzaW5nIGJ1cnN0aW5nIG1vZGUgZm9yIGNvc3Qgb3B0aW1pemF0aW9uLCBza2lwIHByb3Zpc2lvbmVkIHRocm91Z2hwdXRcbiAgICAvLyAoVGhpcyBzaW1wbGlmaWVzIHRoZSBjb25maWcgdG8gbWF0Y2ggcmVmZXJlbmNlIGFyY2hpdGVjdHVyZSBwYXR0ZXJucylcblxuICAgIC8vIENyZWF0ZSB0aGUgRUZTIGZpbGUgc3lzdGVtXG4gICAgdGhpcy5maWxlU3lzdGVtID0gbmV3IGVmcy5GaWxlU3lzdGVtKHRoaXMsICdFRlMnLCBlZnNDb25maWcpO1xuXG4gICAgLy8gQ3JlYXRlIGFjY2VzcyBwb2ludCBmb3IgbWVkaWEgZmlsZXNcbiAgICB0aGlzLm1lZGlhQWNjZXNzUG9pbnQgPSBuZXcgZWZzLkFjY2Vzc1BvaW50KHRoaXMsICdFRlNBY2Nlc3NQb2ludE1lZGlhJywge1xuICAgICAgZmlsZVN5c3RlbTogdGhpcy5maWxlU3lzdGVtLFxuICAgICAgcG9zaXhVc2VyOiB7XG4gICAgICAgIHVpZDogJzEwMDAnLFxuICAgICAgICBnaWQ6ICcxMDAwJ1xuICAgICAgfSxcbiAgICAgIHBhdGg6ICcvbWVkaWEnLFxuICAgICAgY3JlYXRlQWNsOiB7XG4gICAgICAgIG93bmVyVWlkOiAnMTAwMCcsXG4gICAgICAgIG93bmVyR2lkOiAnMTAwMCcsXG4gICAgICAgIHBlcm1pc3Npb25zOiAnNzU1J1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIGFjY2VzcyBwb2ludCBmb3IgY3VzdG9tIHRlbXBsYXRlc1xuICAgIHRoaXMuY3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnQgPSBuZXcgZWZzLkFjY2Vzc1BvaW50KHRoaXMsICdFRlNBY2Nlc3NQb2ludEN1c3RvbVRlbXBsYXRlcycsIHtcbiAgICAgIGZpbGVTeXN0ZW06IHRoaXMuZmlsZVN5c3RlbSxcbiAgICAgIHBvc2l4VXNlcjoge1xuICAgICAgICB1aWQ6ICcxMDAwJyxcbiAgICAgICAgZ2lkOiAnMTAwMCdcbiAgICAgIH0sXG4gICAgICBwYXRoOiAnL2N1c3RvbS10ZW1wbGF0ZXMnLFxuICAgICAgY3JlYXRlQWNsOiB7XG4gICAgICAgIG93bmVyVWlkOiAnMTAwMCcsXG4gICAgICAgIG93bmVyR2lkOiAnMTAwMCcsXG4gICAgICAgIHBlcm1pc3Npb25zOiAnNzU1J1xuICAgICAgfVxuICAgIH0pO1xuICB9XG59XG4iXX0=