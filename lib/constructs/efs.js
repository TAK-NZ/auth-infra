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
        // Create the EFS file system
        this.fileSystem = new aws_cdk_lib_1.aws_efs.FileSystem(this, 'EFS', {
            vpc: props.vpc,
            encrypted: true,
            kmsKey: props.kmsKey,
            performanceMode: aws_cdk_lib_1.aws_efs.PerformanceMode.GENERAL_PURPOSE,
            throughputMode: aws_cdk_lib_1.aws_efs.ThroughputMode.BURSTING,
            securityGroup: efsSecurityGroup,
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.RETAIN
        });
        // Create access point for media files
        this.mediaAccessPoint = new aws_cdk_lib_1.aws_efs.AccessPoint(this, 'EFSAccessPointMedia', {
            fileSystem: this.fileSystem,
            posixUser: {
                uid: '1000',
                gid: '1000'
            },
            path: '/media'
        });
        // Create access point for custom templates
        this.customTemplatesAccessPoint = new aws_cdk_lib_1.aws_efs.AccessPoint(this, 'EFSAccessPointCustomTemplates', {
            fileSystem: this.fileSystem,
            posixUser: {
                uid: '1000',
                gid: '1000'
            },
            path: '/custom-templates'
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWZzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZWZzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOztHQUVHO0FBQ0gsMkNBQXVDO0FBQ3ZDLDZDQU1xQjtBQWdDckI7O0dBRUc7QUFDSCxNQUFhLEdBQUksU0FBUSxzQkFBUztJQWdCaEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFlO1FBQ3ZELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsZ0NBQWdDO1FBQ2hDLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxxQkFBRyxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsNkJBQTZCLEVBQUU7WUFDbEYsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHO1lBQ2QsV0FBVyxFQUFFLHlCQUF5QjtZQUN0QyxnQkFBZ0IsRUFBRSxLQUFLO1NBQ3hCLENBQUMsQ0FBQztRQUVILGtEQUFrRDtRQUNsRCxLQUFLLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsRUFBRTtZQUNqQyxnQkFBZ0IsQ0FBQyxjQUFjLENBQzdCLHFCQUFHLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUMsZUFBZSxDQUFDLEVBQzVDLHFCQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFDbEIsaUNBQWlDLENBQ2xDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILDREQUE0RDtRQUM1RCxnQkFBZ0IsQ0FBQyxjQUFjLENBQzdCLHFCQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLEVBQUUsOENBQThDO1FBQ2pGLHFCQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFDbEIsMkJBQTJCLENBQzVCLENBQUM7UUFFRiw2QkFBNkI7UUFDN0IsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLHFCQUFHLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUU7WUFDaEQsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHO1lBQ2QsU0FBUyxFQUFFLElBQUk7WUFDZixNQUFNLEVBQUUsS0FBSyxDQUFDLE1BQU07WUFDcEIsZUFBZSxFQUFFLHFCQUFHLENBQUMsZUFBZSxDQUFDLGVBQWU7WUFDcEQsY0FBYyxFQUFFLHFCQUFHLENBQUMsY0FBYyxDQUFDLFFBQVE7WUFDM0MsYUFBYSxFQUFFLGdCQUFnQjtZQUMvQixhQUFhLEVBQUUsMkJBQWEsQ0FBQyxNQUFNO1NBQ3BDLENBQUMsQ0FBQztRQUVILHNDQUFzQztRQUN0QyxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxxQkFBRyxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUscUJBQXFCLEVBQUU7WUFDdkUsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFVO1lBQzNCLFNBQVMsRUFBRTtnQkFDVCxHQUFHLEVBQUUsTUFBTTtnQkFDWCxHQUFHLEVBQUUsTUFBTTthQUNaO1lBQ0QsSUFBSSxFQUFFLFFBQVE7U0FDZixDQUFDLENBQUM7UUFFSCwyQ0FBMkM7UUFDM0MsSUFBSSxDQUFDLDBCQUEwQixHQUFHLElBQUkscUJBQUcsQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLCtCQUErQixFQUFFO1lBQzNGLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVTtZQUMzQixTQUFTLEVBQUU7Z0JBQ1QsR0FBRyxFQUFFLE1BQU07Z0JBQ1gsR0FBRyxFQUFFLE1BQU07YUFDWjtZQUNELElBQUksRUFBRSxtQkFBbUI7U0FDMUIsQ0FBQyxDQUFDO1FBRUgsaUJBQWlCO1FBQ2pCLElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7WUFDckMsS0FBSyxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsWUFBWTtZQUNuQyxXQUFXLEVBQUUsb0JBQW9CO1NBQ2xDLENBQUMsQ0FBQztRQUVILElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsdUJBQXVCLEVBQUU7WUFDM0MsS0FBSyxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhO1lBQzFDLFdBQVcsRUFBRSwyQkFBMkI7U0FDekMsQ0FBQyxDQUFDO1FBRUgsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxpQ0FBaUMsRUFBRTtZQUNyRCxLQUFLLEVBQUUsSUFBSSxDQUFDLDBCQUEwQixDQUFDLGFBQWE7WUFDcEQsV0FBVyxFQUFFLHNDQUFzQztTQUNwRCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF6RkQsa0JBeUZDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBFRlMgQ29uc3RydWN0IC0gQ0RLIGltcGxlbWVudGF0aW9uIG9mIHRoZSBFbGFzdGljIEZpbGUgU3lzdGVtXG4gKi9cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHtcbiAgYXdzX2VmcyBhcyBlZnMsXG4gIGF3c19lYzIgYXMgZWMyLFxuICBhd3Nfa21zIGFzIGttcyxcbiAgQ2ZuT3V0cHV0LFxuICBSZW1vdmFsUG9saWN5XG59IGZyb20gJ2F3cy1jZGstbGliJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciB0aGUgRUZTIGNvbnN0cnVjdFxuICovXG5leHBvcnQgaW50ZXJmYWNlIEVmc1Byb3BzIHtcbiAgLyoqXG4gICAqIEVudmlyb25tZW50IG5hbWUgKGUuZy4gJ3Byb2QnLCAnZGV2JywgZXRjLilcbiAgICovXG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFZQQyBmb3IgZGVwbG95bWVudFxuICAgKi9cbiAgdnBjOiBlYzIuSVZwYztcblxuICAvKipcbiAgICogVlBDIENJRFIgYmxvY2sgZm9yIHNlY3VyaXR5IGdyb3VwIHJ1bGVzXG4gICAqL1xuICB2cGNDaWRyQmxvY2s6IHN0cmluZztcblxuICAvKipcbiAgICogS01TIGtleSBmb3IgZW5jcnlwdGlvblxuICAgKi9cbiAga21zS2V5OiBrbXMuSUtleTtcblxuICAvKipcbiAgICogU2VjdXJpdHkgZ3JvdXBzIGZvciBFRlMgYWNjZXNzXG4gICAqL1xuICBhbGxvd0FjY2Vzc0Zyb206IGVjMi5TZWN1cml0eUdyb3VwW107XG59XG5cbi8qKlxuICogQ0RLIGNvbnN0cnVjdCBmb3IgdGhlIEVGUyBmaWxlIHN5c3RlbVxuICovXG5leHBvcnQgY2xhc3MgRWZzIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgLyoqXG4gICAqIFRoZSBFRlMgZmlsZSBzeXN0ZW1cbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBmaWxlU3lzdGVtOiBlZnMuRmlsZVN5c3RlbTtcblxuICAvKipcbiAgICogVGhlIEVGUyBhY2Nlc3MgcG9pbnQgZm9yIG1lZGlhXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgbWVkaWFBY2Nlc3NQb2ludDogZWZzLkFjY2Vzc1BvaW50O1xuXG4gIC8qKlxuICAgKiBUaGUgRUZTIGFjY2VzcyBwb2ludCBmb3IgY3VzdG9tIHRlbXBsYXRlc1xuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50OiBlZnMuQWNjZXNzUG9pbnQ7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEVmc1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIC8vIENyZWF0ZSBzZWN1cml0eSBncm91cCBmb3IgRUZTXG4gICAgY29uc3QgZWZzU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnRUZTTW91bnRUYXJnZXRTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ0VGUyB0byBBdXRoIEVDUyBTZXJ2aWNlJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IGZhbHNlXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBORlMgYWNjZXNzIGZyb20gc3BlY2lmaWVkIHNlY3VyaXR5IGdyb3Vwc1xuICAgIHByb3BzLmFsbG93QWNjZXNzRnJvbS5mb3JFYWNoKHNnID0+IHtcbiAgICAgIGVmc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICAgIGVjMi5QZWVyLnNlY3VyaXR5R3JvdXBJZChzZy5zZWN1cml0eUdyb3VwSWQpLFxuICAgICAgICBlYzIuUG9ydC50Y3AoMjA0OSksXG4gICAgICAgICdBbGxvdyBORlMgYWNjZXNzIGZyb20gRUNTIHRhc2tzJ1xuICAgICAgKTtcbiAgICB9KTtcblxuICAgIC8vIEFsc28gYWxsb3cgYWNjZXNzIGZyb20gVlBDIENJRFIgZm9yIGJyb2FkZXIgY29tcGF0aWJpbGl0eVxuICAgIGVmc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5pcHY0KHByb3BzLnZwY0NpZHJCbG9jayksIC8vIFJldmVydGVkIHRvIHVzZSBwcm9wcy52cGNDaWRyQmxvY2sgZGlyZWN0bHlcbiAgICAgIGVjMi5Qb3J0LnRjcCgyMDQ5KSxcbiAgICAgICdBbGxvdyBORlMgYWNjZXNzIGZyb20gVlBDJ1xuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIEVGUyBmaWxlIHN5c3RlbVxuICAgIHRoaXMuZmlsZVN5c3RlbSA9IG5ldyBlZnMuRmlsZVN5c3RlbSh0aGlzLCAnRUZTJywge1xuICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICBlbmNyeXB0ZWQ6IHRydWUsXG4gICAgICBrbXNLZXk6IHByb3BzLmttc0tleSxcbiAgICAgIHBlcmZvcm1hbmNlTW9kZTogZWZzLlBlcmZvcm1hbmNlTW9kZS5HRU5FUkFMX1BVUlBPU0UsXG4gICAgICB0aHJvdWdocHV0TW9kZTogZWZzLlRocm91Z2hwdXRNb2RlLkJVUlNUSU5HLFxuICAgICAgc2VjdXJpdHlHcm91cDogZWZzU2VjdXJpdHlHcm91cCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuUkVUQUlOXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgYWNjZXNzIHBvaW50IGZvciBtZWRpYSBmaWxlc1xuICAgIHRoaXMubWVkaWFBY2Nlc3NQb2ludCA9IG5ldyBlZnMuQWNjZXNzUG9pbnQodGhpcywgJ0VGU0FjY2Vzc1BvaW50TWVkaWEnLCB7XG4gICAgICBmaWxlU3lzdGVtOiB0aGlzLmZpbGVTeXN0ZW0sXG4gICAgICBwb3NpeFVzZXI6IHtcbiAgICAgICAgdWlkOiAnMTAwMCcsXG4gICAgICAgIGdpZDogJzEwMDAnXG4gICAgICB9LFxuICAgICAgcGF0aDogJy9tZWRpYSdcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBhY2Nlc3MgcG9pbnQgZm9yIGN1c3RvbSB0ZW1wbGF0ZXNcbiAgICB0aGlzLmN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50ID0gbmV3IGVmcy5BY2Nlc3NQb2ludCh0aGlzLCAnRUZTQWNjZXNzUG9pbnRDdXN0b21UZW1wbGF0ZXMnLCB7XG4gICAgICBmaWxlU3lzdGVtOiB0aGlzLmZpbGVTeXN0ZW0sXG4gICAgICBwb3NpeFVzZXI6IHtcbiAgICAgICAgdWlkOiAnMTAwMCcsXG4gICAgICAgIGdpZDogJzEwMDAnXG4gICAgICB9LFxuICAgICAgcGF0aDogJy9jdXN0b20tdGVtcGxhdGVzJ1xuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIG91dHB1dHNcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdFRlNGaWxlU3lzdGVtSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5maWxlU3lzdGVtLmZpbGVTeXN0ZW1JZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRUZTIGZpbGUgc3lzdGVtIElEJ1xuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRUZTTWVkaWFBY2Nlc3NQb2ludElkJywge1xuICAgICAgdmFsdWU6IHRoaXMubWVkaWFBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkLFxuICAgICAgZGVzY3JpcHRpb246ICdFRlMgbWVkaWEgYWNjZXNzIHBvaW50IElEJ1xuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRUZTQ3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnRJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0VGUyBjdXN0b20gdGVtcGxhdGVzIGFjY2VzcyBwb2ludCBJRCdcbiAgICB9KTtcbiAgfVxufVxuIl19