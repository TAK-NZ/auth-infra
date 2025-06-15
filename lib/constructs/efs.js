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
        efsSecurityGroup.addIngressRule(aws_cdk_lib_1.aws_ec2.Peer.ipv4(props.vpc.vpcCidrBlock), aws_cdk_lib_1.aws_ec2.Port.tcp(2049), 'Allow NFS access from VPC');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWZzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZWZzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOztHQUVHO0FBQ0gsMkNBQXVDO0FBQ3ZDLDZDQU1xQjtBQTJCckI7O0dBRUc7QUFDSCxNQUFhLEdBQUksU0FBUSxzQkFBUztJQWdCaEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFlO1FBQ3ZELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsZ0NBQWdDO1FBQ2hDLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxxQkFBRyxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsNkJBQTZCLEVBQUU7WUFDbEYsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHO1lBQ2QsV0FBVyxFQUFFLHlCQUF5QjtZQUN0QyxnQkFBZ0IsRUFBRSxLQUFLO1NBQ3hCLENBQUMsQ0FBQztRQUVILGtEQUFrRDtRQUNsRCxLQUFLLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsRUFBRTtZQUNqQyxnQkFBZ0IsQ0FBQyxjQUFjLENBQzdCLHFCQUFHLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUMsZUFBZSxDQUFDLEVBQzVDLHFCQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFDbEIsaUNBQWlDLENBQ2xDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILDREQUE0RDtRQUM1RCxnQkFBZ0IsQ0FBQyxjQUFjLENBQzdCLHFCQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxFQUNyQyxxQkFBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQ2xCLDJCQUEyQixDQUM1QixDQUFDO1FBRUYsNkJBQTZCO1FBQzdCLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxxQkFBRyxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFO1lBQ2hELEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRztZQUNkLFNBQVMsRUFBRSxJQUFJO1lBQ2YsTUFBTSxFQUFFLEtBQUssQ0FBQyxNQUFNO1lBQ3BCLGVBQWUsRUFBRSxxQkFBRyxDQUFDLGVBQWUsQ0FBQyxlQUFlO1lBQ3BELGNBQWMsRUFBRSxxQkFBRyxDQUFDLGNBQWMsQ0FBQyxRQUFRO1lBQzNDLGFBQWEsRUFBRSxnQkFBZ0I7WUFDL0IsYUFBYSxFQUFFLDJCQUFhLENBQUMsTUFBTTtTQUNwQyxDQUFDLENBQUM7UUFFSCxzQ0FBc0M7UUFDdEMsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUkscUJBQUcsQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLHFCQUFxQixFQUFFO1lBQ3ZFLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVTtZQUMzQixTQUFTLEVBQUU7Z0JBQ1QsR0FBRyxFQUFFLE1BQU07Z0JBQ1gsR0FBRyxFQUFFLE1BQU07YUFDWjtZQUNELElBQUksRUFBRSxRQUFRO1NBQ2YsQ0FBQyxDQUFDO1FBRUgsMkNBQTJDO1FBQzNDLElBQUksQ0FBQywwQkFBMEIsR0FBRyxJQUFJLHFCQUFHLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSwrQkFBK0IsRUFBRTtZQUMzRixVQUFVLEVBQUUsSUFBSSxDQUFDLFVBQVU7WUFDM0IsU0FBUyxFQUFFO2dCQUNULEdBQUcsRUFBRSxNQUFNO2dCQUNYLEdBQUcsRUFBRSxNQUFNO2FBQ1o7WUFDRCxJQUFJLEVBQUUsbUJBQW1CO1NBQzFCLENBQUMsQ0FBQztRQUVILGlCQUFpQjtRQUNqQixJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFO1lBQ3JDLEtBQUssRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLFlBQVk7WUFDbkMsV0FBVyxFQUFFLG9CQUFvQjtTQUNsQyxDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLHVCQUF1QixFQUFFO1lBQzNDLEtBQUssRUFBRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsYUFBYTtZQUMxQyxXQUFXLEVBQUUsMkJBQTJCO1NBQ3pDLENBQUMsQ0FBQztRQUVILElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsaUNBQWlDLEVBQUU7WUFDckQsS0FBSyxFQUFFLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxhQUFhO1lBQ3BELFdBQVcsRUFBRSxzQ0FBc0M7U0FDcEQsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBekZELGtCQXlGQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogRUZTIENvbnN0cnVjdCAtIENESyBpbXBsZW1lbnRhdGlvbiBvZiB0aGUgRWxhc3RpYyBGaWxlIFN5c3RlbVxuICovXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7XG4gIGF3c19lZnMgYXMgZWZzLFxuICBhd3NfZWMyIGFzIGVjMixcbiAgYXdzX2ttcyBhcyBrbXMsXG4gIENmbk91dHB1dCxcbiAgUmVtb3ZhbFBvbGljeVxufSBmcm9tICdhd3MtY2RrLWxpYic7XG5cbi8qKlxuICogUHJvcGVydGllcyBmb3IgdGhlIEVGUyBjb25zdHJ1Y3RcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBFZnNQcm9wcyB7XG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBuYW1lIChlLmcuICdwcm9kJywgJ2RldicsIGV0Yy4pXG4gICAqL1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBWUEMgZm9yIGRlcGxveW1lbnRcbiAgICovXG4gIHZwYzogZWMyLklWcGM7XG5cbiAgLyoqXG4gICAqIEtNUyBrZXkgZm9yIGVuY3J5cHRpb25cbiAgICovXG4gIGttc0tleToga21zLklLZXk7XG5cbiAgLyoqXG4gICAqIFNlY3VyaXR5IGdyb3VwcyBmb3IgRUZTIGFjY2Vzc1xuICAgKi9cbiAgYWxsb3dBY2Nlc3NGcm9tOiBlYzIuU2VjdXJpdHlHcm91cFtdO1xufVxuXG4vKipcbiAqIENESyBjb25zdHJ1Y3QgZm9yIHRoZSBFRlMgZmlsZSBzeXN0ZW1cbiAqL1xuZXhwb3J0IGNsYXNzIEVmcyBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBUaGUgRUZTIGZpbGUgc3lzdGVtXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgZmlsZVN5c3RlbTogZWZzLkZpbGVTeXN0ZW07XG5cbiAgLyoqXG4gICAqIFRoZSBFRlMgYWNjZXNzIHBvaW50IGZvciBtZWRpYVxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IG1lZGlhQWNjZXNzUG9pbnQ6IGVmcy5BY2Nlc3NQb2ludDtcblxuICAvKipcbiAgICogVGhlIEVGUyBhY2Nlc3MgcG9pbnQgZm9yIGN1c3RvbSB0ZW1wbGF0ZXNcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBjdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludDogZWZzLkFjY2Vzc1BvaW50O1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBFZnNQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICAvLyBDcmVhdGUgc2VjdXJpdHkgZ3JvdXAgZm9yIEVGU1xuICAgIGNvbnN0IGVmc1NlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0VGU01vdW50VGFyZ2V0U2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdFRlMgdG8gQXV0aCBFQ1MgU2VydmljZScsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiBmYWxzZVxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgTkZTIGFjY2VzcyBmcm9tIHNwZWNpZmllZCBzZWN1cml0eSBncm91cHNcbiAgICBwcm9wcy5hbGxvd0FjY2Vzc0Zyb20uZm9yRWFjaChzZyA9PiB7XG4gICAgICBlZnNTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgICBlYzIuUGVlci5zZWN1cml0eUdyb3VwSWQoc2cuc2VjdXJpdHlHcm91cElkKSxcbiAgICAgICAgZWMyLlBvcnQudGNwKDIwNDkpLFxuICAgICAgICAnQWxsb3cgTkZTIGFjY2VzcyBmcm9tIEVDUyB0YXNrcydcbiAgICAgICk7XG4gICAgfSk7XG5cbiAgICAvLyBBbHNvIGFsbG93IGFjY2VzcyBmcm9tIFZQQyBDSURSIGZvciBicm9hZGVyIGNvbXBhdGliaWxpdHlcbiAgICBlZnNTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuaXB2NChwcm9wcy52cGMudnBjQ2lkckJsb2NrKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCgyMDQ5KSxcbiAgICAgICdBbGxvdyBORlMgYWNjZXNzIGZyb20gVlBDJ1xuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIEVGUyBmaWxlIHN5c3RlbVxuICAgIHRoaXMuZmlsZVN5c3RlbSA9IG5ldyBlZnMuRmlsZVN5c3RlbSh0aGlzLCAnRUZTJywge1xuICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICBlbmNyeXB0ZWQ6IHRydWUsXG4gICAgICBrbXNLZXk6IHByb3BzLmttc0tleSxcbiAgICAgIHBlcmZvcm1hbmNlTW9kZTogZWZzLlBlcmZvcm1hbmNlTW9kZS5HRU5FUkFMX1BVUlBPU0UsXG4gICAgICB0aHJvdWdocHV0TW9kZTogZWZzLlRocm91Z2hwdXRNb2RlLkJVUlNUSU5HLFxuICAgICAgc2VjdXJpdHlHcm91cDogZWZzU2VjdXJpdHlHcm91cCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuUkVUQUlOXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgYWNjZXNzIHBvaW50IGZvciBtZWRpYSBmaWxlc1xuICAgIHRoaXMubWVkaWFBY2Nlc3NQb2ludCA9IG5ldyBlZnMuQWNjZXNzUG9pbnQodGhpcywgJ0VGU0FjY2Vzc1BvaW50TWVkaWEnLCB7XG4gICAgICBmaWxlU3lzdGVtOiB0aGlzLmZpbGVTeXN0ZW0sXG4gICAgICBwb3NpeFVzZXI6IHtcbiAgICAgICAgdWlkOiAnMTAwMCcsXG4gICAgICAgIGdpZDogJzEwMDAnXG4gICAgICB9LFxuICAgICAgcGF0aDogJy9tZWRpYSdcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBhY2Nlc3MgcG9pbnQgZm9yIGN1c3RvbSB0ZW1wbGF0ZXNcbiAgICB0aGlzLmN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50ID0gbmV3IGVmcy5BY2Nlc3NQb2ludCh0aGlzLCAnRUZTQWNjZXNzUG9pbnRDdXN0b21UZW1wbGF0ZXMnLCB7XG4gICAgICBmaWxlU3lzdGVtOiB0aGlzLmZpbGVTeXN0ZW0sXG4gICAgICBwb3NpeFVzZXI6IHtcbiAgICAgICAgdWlkOiAnMTAwMCcsXG4gICAgICAgIGdpZDogJzEwMDAnXG4gICAgICB9LFxuICAgICAgcGF0aDogJy9jdXN0b20tdGVtcGxhdGVzJ1xuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIG91dHB1dHNcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdFRlNGaWxlU3lzdGVtSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5maWxlU3lzdGVtLmZpbGVTeXN0ZW1JZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRUZTIGZpbGUgc3lzdGVtIElEJ1xuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRUZTTWVkaWFBY2Nlc3NQb2ludElkJywge1xuICAgICAgdmFsdWU6IHRoaXMubWVkaWFBY2Nlc3NQb2ludC5hY2Nlc3NQb2ludElkLFxuICAgICAgZGVzY3JpcHRpb246ICdFRlMgbWVkaWEgYWNjZXNzIHBvaW50IElEJ1xuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnRUZTQ3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnRJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmN1c3RvbVRlbXBsYXRlc0FjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0VGUyBjdXN0b20gdGVtcGxhdGVzIGFjY2VzcyBwb2ludCBJRCdcbiAgICB9KTtcbiAgfVxufVxuIl19