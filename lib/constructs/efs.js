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
        // Build EFS configuration object
        const efsConfig = {
            vpc: props.vpc,
            encrypted: true,
            kmsKey: props.kmsKey,
            performanceMode: aws_cdk_lib_1.aws_efs.PerformanceMode.GENERAL_PURPOSE,
            throughputMode: throughputMode,
            securityGroup: efsSecurityGroup,
            removalPolicy: efsRemovalPolicy
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWZzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZWZzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOztHQUVHO0FBQ0gsMkNBQXVDO0FBQ3ZDLDZDQU1xQjtBQXNDckI7O0dBRUc7QUFDSCxNQUFhLEdBQUksU0FBUSxzQkFBUztJQWdCaEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFlO1FBQ3ZELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsZ0NBQWdDO1FBQ2hDLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxxQkFBRyxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsNkJBQTZCLEVBQUU7WUFDbEYsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHO1lBQ2QsV0FBVyxFQUFFLHlCQUF5QjtZQUN0QyxnQkFBZ0IsRUFBRSxLQUFLO1NBQ3hCLENBQUMsQ0FBQztRQUVILGtEQUFrRDtRQUNsRCxLQUFLLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsRUFBRTtZQUNqQyxnQkFBZ0IsQ0FBQyxjQUFjLENBQzdCLHFCQUFHLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUMsZUFBZSxDQUFDLEVBQzVDLHFCQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFDbEIsaUNBQWlDLENBQ2xDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILDREQUE0RDtRQUM1RCxnQkFBZ0IsQ0FBQyxjQUFjLENBQzdCLHFCQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLEVBQUUsOENBQThDO1FBQ2pGLHFCQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFDbEIsMkJBQTJCLENBQzVCLENBQUM7UUFFRiw4RUFBOEU7UUFDOUUsK0VBQStFO1FBQy9FLE1BQU0sZ0JBQWdCLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDO1FBQ3hELE1BQU0sY0FBYyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLGNBQWMsS0FBSyxhQUFhO1lBQ3RFLENBQUMsQ0FBQyxxQkFBRyxDQUFDLGNBQWMsQ0FBQyxXQUFXO1lBQ2hDLENBQUMsQ0FBQyxxQkFBRyxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUM7UUFFaEMsaUNBQWlDO1FBQ2pDLE1BQU0sU0FBUyxHQUFRO1lBQ3JCLEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRztZQUNkLFNBQVMsRUFBRSxJQUFJO1lBQ2YsTUFBTSxFQUFFLEtBQUssQ0FBQyxNQUFNO1lBQ3BCLGVBQWUsRUFBRSxxQkFBRyxDQUFDLGVBQWUsQ0FBQyxlQUFlO1lBQ3BELGNBQWMsRUFBRSxjQUFjO1lBQzlCLGFBQWEsRUFBRSxnQkFBZ0I7WUFDL0IsYUFBYSxFQUFFLGdCQUFnQjtTQUNoQyxDQUFDO1FBRUYsMENBQTBDO1FBQzFDLElBQUksS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsY0FBYyxLQUFLLGFBQWEsSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1lBQ2hHLFNBQVMsQ0FBQyw4QkFBOEIsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQztRQUNwRixDQUFDO1FBRUQsNkJBQTZCO1FBQzdCLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxxQkFBRyxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBRTdELHNDQUFzQztRQUN0QyxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxxQkFBRyxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUscUJBQXFCLEVBQUU7WUFDdkUsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFVO1lBQzNCLFNBQVMsRUFBRTtnQkFDVCxHQUFHLEVBQUUsTUFBTTtnQkFDWCxHQUFHLEVBQUUsTUFBTTthQUNaO1lBQ0QsSUFBSSxFQUFFLFFBQVE7U0FDZixDQUFDLENBQUM7UUFFSCwyQ0FBMkM7UUFDM0MsSUFBSSxDQUFDLDBCQUEwQixHQUFHLElBQUkscUJBQUcsQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLCtCQUErQixFQUFFO1lBQzNGLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVTtZQUMzQixTQUFTLEVBQUU7Z0JBQ1QsR0FBRyxFQUFFLE1BQU07Z0JBQ1gsR0FBRyxFQUFFLE1BQU07YUFDWjtZQUNELElBQUksRUFBRSxtQkFBbUI7U0FDMUIsQ0FBQyxDQUFDO1FBRUgsaUJBQWlCO1FBQ2pCLElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7WUFDckMsS0FBSyxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsWUFBWTtZQUNuQyxXQUFXLEVBQUUsb0JBQW9CO1NBQ2xDLENBQUMsQ0FBQztRQUVILElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsdUJBQXVCLEVBQUU7WUFDM0MsS0FBSyxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhO1lBQzFDLFdBQVcsRUFBRSwyQkFBMkI7U0FDekMsQ0FBQyxDQUFDO1FBRUgsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxpQ0FBaUMsRUFBRTtZQUNyRCxLQUFLLEVBQUUsSUFBSSxDQUFDLDBCQUEwQixDQUFDLGFBQWE7WUFDcEQsV0FBVyxFQUFFLHNDQUFzQztTQUNwRCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF4R0Qsa0JBd0dDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBFRlMgQ29uc3RydWN0IC0gQ0RLIGltcGxlbWVudGF0aW9uIG9mIHRoZSBFbGFzdGljIEZpbGUgU3lzdGVtXG4gKi9cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHtcbiAgYXdzX2VmcyBhcyBlZnMsXG4gIGF3c19lYzIgYXMgZWMyLFxuICBhd3Nfa21zIGFzIGttcyxcbiAgQ2ZuT3V0cHV0LFxuICBSZW1vdmFsUG9saWN5XG59IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB0eXBlIHsgQXV0aEluZnJhRW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuLi9lbnZpcm9ubWVudC1jb25maWcnO1xuXG4vKipcbiAqIFByb3BlcnRpZXMgZm9yIHRoZSBFRlMgY29uc3RydWN0XG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgRWZzUHJvcHMge1xuICAvKipcbiAgICogRW52aXJvbm1lbnQgbmFtZSAoZS5nLiAncHJvZCcsICdkZXYnLCBldGMuKVxuICAgKi9cbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcblxuICAvKipcbiAgICogRW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxuICAgKi9cbiAgY29uZmlnOiBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZztcblxuICAvKipcbiAgICogVlBDIGZvciBkZXBsb3ltZW50XG4gICAqL1xuICB2cGM6IGVjMi5JVnBjO1xuXG4gIC8qKlxuICAgKiBWUEMgQ0lEUiBibG9jayBmb3Igc2VjdXJpdHkgZ3JvdXAgcnVsZXNcbiAgICovXG4gIHZwY0NpZHJCbG9jazogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBLTVMga2V5IGZvciBlbmNyeXB0aW9uXG4gICAqL1xuICBrbXNLZXk6IGttcy5JS2V5O1xuXG4gIC8qKlxuICAgKiBTZWN1cml0eSBncm91cHMgZm9yIEVGUyBhY2Nlc3NcbiAgICovXG4gIGFsbG93QWNjZXNzRnJvbTogZWMyLlNlY3VyaXR5R3JvdXBbXTtcbn1cblxuLyoqXG4gKiBDREsgY29uc3RydWN0IGZvciB0aGUgRUZTIGZpbGUgc3lzdGVtXG4gKi9cbmV4cG9ydCBjbGFzcyBFZnMgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICAvKipcbiAgICogVGhlIEVGUyBmaWxlIHN5c3RlbVxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGZpbGVTeXN0ZW06IGVmcy5GaWxlU3lzdGVtO1xuXG4gIC8qKlxuICAgKiBUaGUgRUZTIGFjY2VzcyBwb2ludCBmb3IgbWVkaWFcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBtZWRpYUFjY2Vzc1BvaW50OiBlZnMuQWNjZXNzUG9pbnQ7XG5cbiAgLyoqXG4gICAqIFRoZSBFRlMgYWNjZXNzIHBvaW50IGZvciBjdXN0b20gdGVtcGxhdGVzXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgY3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnQ6IGVmcy5BY2Nlc3NQb2ludDtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogRWZzUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gQ3JlYXRlIHNlY3VyaXR5IGdyb3VwIGZvciBFRlNcbiAgICBjb25zdCBlZnNTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdFRlNNb3VudFRhcmdldFNlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRUZTIHRvIEF1dGggRUNTIFNlcnZpY2UnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogZmFsc2VcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IE5GUyBhY2Nlc3MgZnJvbSBzcGVjaWZpZWQgc2VjdXJpdHkgZ3JvdXBzXG4gICAgcHJvcHMuYWxsb3dBY2Nlc3NGcm9tLmZvckVhY2goc2cgPT4ge1xuICAgICAgZWZzU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgICAgZWMyLlBlZXIuc2VjdXJpdHlHcm91cElkKHNnLnNlY3VyaXR5R3JvdXBJZCksXG4gICAgICAgIGVjMi5Qb3J0LnRjcCgyMDQ5KSxcbiAgICAgICAgJ0FsbG93IE5GUyBhY2Nlc3MgZnJvbSBFQ1MgdGFza3MnXG4gICAgICApO1xuICAgIH0pO1xuXG4gICAgLy8gQWxzbyBhbGxvdyBhY2Nlc3MgZnJvbSBWUEMgQ0lEUiBmb3IgYnJvYWRlciBjb21wYXRpYmlsaXR5XG4gICAgZWZzU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmlwdjQocHJvcHMudnBjQ2lkckJsb2NrKSwgLy8gUmV2ZXJ0ZWQgdG8gdXNlIHByb3BzLnZwY0NpZHJCbG9jayBkaXJlY3RseVxuICAgICAgZWMyLlBvcnQudGNwKDIwNDkpLFxuICAgICAgJ0FsbG93IE5GUyBhY2Nlc3MgZnJvbSBWUEMnXG4gICAgKTtcblxuICAgIC8vIERldGVybWluZSByZW1vdmFsIHBvbGljeSBhbmQgdGhyb3VnaHB1dCBtb2RlIGZyb20gZW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxuICAgIC8vIFByb2R1Y3Rpb246IFJFVEFJTiBwb2xpY3kgdG8gcHJlc2VydmUgZGF0YSwgRGV2L1Rlc3Q6IERFU1RST1kgdG8gYXZvaWQgY29zdHNcbiAgICBjb25zdCBlZnNSZW1vdmFsUG9saWN5ID0gcHJvcHMuY29uZmlnLmVmcy5yZW1vdmFsUG9saWN5O1xuICAgIGNvbnN0IHRocm91Z2hwdXRNb2RlID0gcHJvcHMuY29uZmlnLmVmcy50aHJvdWdocHV0TW9kZSA9PT0gJ3Byb3Zpc2lvbmVkJyBcbiAgICAgID8gZWZzLlRocm91Z2hwdXRNb2RlLlBST1ZJU0lPTkVEIFxuICAgICAgOiBlZnMuVGhyb3VnaHB1dE1vZGUuQlVSU1RJTkc7XG5cbiAgICAvLyBCdWlsZCBFRlMgY29uZmlndXJhdGlvbiBvYmplY3RcbiAgICBjb25zdCBlZnNDb25maWc6IGFueSA9IHtcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgZW5jcnlwdGVkOiB0cnVlLFxuICAgICAga21zS2V5OiBwcm9wcy5rbXNLZXksXG4gICAgICBwZXJmb3JtYW5jZU1vZGU6IGVmcy5QZXJmb3JtYW5jZU1vZGUuR0VORVJBTF9QVVJQT1NFLFxuICAgICAgdGhyb3VnaHB1dE1vZGU6IHRocm91Z2hwdXRNb2RlLFxuICAgICAgc2VjdXJpdHlHcm91cDogZWZzU2VjdXJpdHlHcm91cCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGVmc1JlbW92YWxQb2xpY3lcbiAgICB9O1xuXG4gICAgLy8gQWRkIHByb3Zpc2lvbmVkIHRocm91Z2hwdXQgaWYgc3BlY2lmaWVkXG4gICAgaWYgKHByb3BzLmNvbmZpZy5lZnMudGhyb3VnaHB1dE1vZGUgPT09ICdwcm92aXNpb25lZCcgJiYgcHJvcHMuY29uZmlnLmVmcy5wcm92aXNpb25lZFRocm91Z2hwdXQpIHtcbiAgICAgIGVmc0NvbmZpZy5wcm92aXNpb25lZFRocm91Z2hwdXRQZXJTZWNvbmQgPSBwcm9wcy5jb25maWcuZWZzLnByb3Zpc2lvbmVkVGhyb3VnaHB1dDtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgdGhlIEVGUyBmaWxlIHN5c3RlbVxuICAgIHRoaXMuZmlsZVN5c3RlbSA9IG5ldyBlZnMuRmlsZVN5c3RlbSh0aGlzLCAnRUZTJywgZWZzQ29uZmlnKTtcblxuICAgIC8vIENyZWF0ZSBhY2Nlc3MgcG9pbnQgZm9yIG1lZGlhIGZpbGVzXG4gICAgdGhpcy5tZWRpYUFjY2Vzc1BvaW50ID0gbmV3IGVmcy5BY2Nlc3NQb2ludCh0aGlzLCAnRUZTQWNjZXNzUG9pbnRNZWRpYScsIHtcbiAgICAgIGZpbGVTeXN0ZW06IHRoaXMuZmlsZVN5c3RlbSxcbiAgICAgIHBvc2l4VXNlcjoge1xuICAgICAgICB1aWQ6ICcxMDAwJyxcbiAgICAgICAgZ2lkOiAnMTAwMCdcbiAgICAgIH0sXG4gICAgICBwYXRoOiAnL21lZGlhJ1xuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIGFjY2VzcyBwb2ludCBmb3IgY3VzdG9tIHRlbXBsYXRlc1xuICAgIHRoaXMuY3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnQgPSBuZXcgZWZzLkFjY2Vzc1BvaW50KHRoaXMsICdFRlNBY2Nlc3NQb2ludEN1c3RvbVRlbXBsYXRlcycsIHtcbiAgICAgIGZpbGVTeXN0ZW06IHRoaXMuZmlsZVN5c3RlbSxcbiAgICAgIHBvc2l4VXNlcjoge1xuICAgICAgICB1aWQ6ICcxMDAwJyxcbiAgICAgICAgZ2lkOiAnMTAwMCdcbiAgICAgIH0sXG4gICAgICBwYXRoOiAnL2N1c3RvbS10ZW1wbGF0ZXMnXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgb3V0cHV0c1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0VGU0ZpbGVTeXN0ZW1JZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmZpbGVTeXN0ZW0uZmlsZVN5c3RlbUlkLFxuICAgICAgZGVzY3JpcHRpb246ICdFRlMgZmlsZSBzeXN0ZW0gSUQnXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdFRlNNZWRpYUFjY2Vzc1BvaW50SWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5tZWRpYUFjY2Vzc1BvaW50LmFjY2Vzc1BvaW50SWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0VGUyBtZWRpYSBhY2Nlc3MgcG9pbnQgSUQnXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdFRlNDdXN0b21UZW1wbGF0ZXNBY2Nlc3NQb2ludElkJywge1xuICAgICAgdmFsdWU6IHRoaXMuY3VzdG9tVGVtcGxhdGVzQWNjZXNzUG9pbnQuYWNjZXNzUG9pbnRJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRUZTIGN1c3RvbSB0ZW1wbGF0ZXMgYWNjZXNzIHBvaW50IElEJ1xuICAgIH0pO1xuICB9XG59XG4iXX0=