"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Elb = void 0;
/**
 * ELB Construct - Load balancer and networking for Authentik
 */
const constructs_1 = require("constructs");
const aws_cdk_lib_1 = require("aws-cdk-lib");
/**
 * CDK construct for the Application Load Balancer
 */
class Elb extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        // Create load balancer with dualstack IP addressing
        this.loadBalancer = new aws_cdk_lib_1.aws_elasticloadbalancingv2.ApplicationLoadBalancer(this, 'ALB', {
            vpc: props.vpc,
            internetFacing: true,
            ipAddressType: aws_cdk_lib_1.aws_elasticloadbalancingv2.IpAddressType.DUAL_STACK
        });
        // Create HTTP listener and redirect to HTTPS
        const httpListener = this.loadBalancer.addListener('HttpListener', {
            port: 80,
            open: true
        });
        httpListener.addAction('HttpRedirect', {
            action: aws_cdk_lib_1.aws_elasticloadbalancingv2.ListenerAction.redirect({
                port: '443',
                protocol: 'HTTPS'
            })
        });
        // Create HTTPS listener
        this.httpsListener = this.loadBalancer.addListener('HttpsListener', {
            port: 443,
            certificates: [{ certificateArn: props.sslCertificateArn }],
            open: true
        });
        // Store the DNS name
        this.dnsName = this.loadBalancer.loadBalancerDnsName;
        // Export outputs
        new aws_cdk_lib_1.CfnOutput(this, 'LoadBalancerDnsName', {
            value: this.dnsName,
            description: 'The DNS name of the load balancer'
        });
        new aws_cdk_lib_1.CfnOutput(this, 'AuthentikURL', {
            value: `https://${this.dnsName}/`,
            description: 'The URL of the Authentik service'
        });
    }
    /**
     * Create a target group for Authentik services
     */
    createTargetGroup(id, port, vpc, healthCheckPath = '/healthz/') {
        return new aws_cdk_lib_1.aws_elasticloadbalancingv2.ApplicationTargetGroup(this, id, {
            vpc: vpc,
            targetType: aws_cdk_lib_1.aws_elasticloadbalancingv2.TargetType.IP,
            port: port,
            protocol: aws_cdk_lib_1.aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
            healthCheck: {
                path: healthCheckPath,
                interval: aws_cdk_lib_1.Duration.seconds(30),
                healthyHttpCodes: '200-299'
            }
        });
    }
    /**
     * Add a target group to the HTTPS listener
     */
    addTargetGroup(id, targetGroup, priority) {
        this.httpsListener.addAction(id, {
            action: aws_cdk_lib_1.aws_elasticloadbalancingv2.ListenerAction.forward([targetGroup]),
            priority: priority
        });
    }
}
exports.Elb = Elb;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWxiLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZWxiLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOztHQUVHO0FBQ0gsMkNBQXVDO0FBQ3ZDLDZDQUtxQjtBQTRCckI7O0dBRUc7QUFDSCxNQUFhLEdBQUksU0FBUSxzQkFBUztJQWdCaEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFlO1FBQ3ZELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsb0RBQW9EO1FBQ3BELElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSx3Q0FBSyxDQUFDLHVCQUF1QixDQUFDLElBQUksRUFBRSxLQUFLLEVBQUU7WUFDakUsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHO1lBQ2QsY0FBYyxFQUFFLElBQUk7WUFDcEIsYUFBYSxFQUFFLHdDQUFLLENBQUMsYUFBYSxDQUFDLFVBQVU7U0FDOUMsQ0FBQyxDQUFDO1FBRUgsNkNBQTZDO1FBQzdDLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLGNBQWMsRUFBRTtZQUNqRSxJQUFJLEVBQUUsRUFBRTtZQUNSLElBQUksRUFBRSxJQUFJO1NBQ1gsQ0FBQyxDQUFDO1FBQ0gsWUFBWSxDQUFDLFNBQVMsQ0FBQyxjQUFjLEVBQUU7WUFDckMsTUFBTSxFQUFFLHdDQUFLLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQztnQkFDcEMsSUFBSSxFQUFFLEtBQUs7Z0JBQ1gsUUFBUSxFQUFFLE9BQU87YUFDbEIsQ0FBQztTQUNILENBQUMsQ0FBQztRQUVILHdCQUF3QjtRQUN4QixJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLGVBQWUsRUFBRTtZQUNsRSxJQUFJLEVBQUUsR0FBRztZQUNULFlBQVksRUFBRSxDQUFDLEVBQUUsY0FBYyxFQUFFLEtBQUssQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQzNELElBQUksRUFBRSxJQUFJO1NBQ1gsQ0FBQyxDQUFDO1FBRUgscUJBQXFCO1FBQ3JCLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxtQkFBbUIsQ0FBQztRQUVyRCxpQkFBaUI7UUFDakIsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxxQkFBcUIsRUFBRTtZQUN6QyxLQUFLLEVBQUUsSUFBSSxDQUFDLE9BQU87WUFDbkIsV0FBVyxFQUFFLG1DQUFtQztTQUNqRCxDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtZQUNsQyxLQUFLLEVBQUUsV0FBVyxJQUFJLENBQUMsT0FBTyxHQUFHO1lBQ2pDLFdBQVcsRUFBRSxrQ0FBa0M7U0FDaEQsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOztPQUVHO0lBQ0ksaUJBQWlCLENBQUMsRUFBVSxFQUFFLElBQVksRUFBRSxHQUFhLEVBQUUsa0JBQTBCLFdBQVc7UUFDckcsT0FBTyxJQUFJLHdDQUFLLENBQUMsc0JBQXNCLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRTtZQUNoRCxHQUFHLEVBQUUsR0FBRztZQUNSLFVBQVUsRUFBRSx3Q0FBSyxDQUFDLFVBQVUsQ0FBQyxFQUFFO1lBQy9CLElBQUksRUFBRSxJQUFJO1lBQ1YsUUFBUSxFQUFFLHdDQUFLLENBQUMsbUJBQW1CLENBQUMsSUFBSTtZQUN4QyxXQUFXLEVBQUU7Z0JBQ1gsSUFBSSxFQUFFLGVBQWU7Z0JBQ3JCLFFBQVEsRUFBRSxzQkFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7Z0JBQzlCLGdCQUFnQixFQUFFLFNBQVM7YUFDNUI7U0FDRixDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQ7O09BRUc7SUFDSSxjQUFjLENBQUMsRUFBVSxFQUFFLFdBQXlDLEVBQUUsUUFBaUI7UUFDNUYsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsRUFBRSxFQUFFO1lBQy9CLE1BQU0sRUFBRSx3Q0FBSyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUNuRCxRQUFRLEVBQUUsUUFBUTtTQUNuQixDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF0RkQsa0JBc0ZDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBFTEIgQ29uc3RydWN0IC0gTG9hZCBiYWxhbmNlciBhbmQgbmV0d29ya2luZyBmb3IgQXV0aGVudGlrXG4gKi9cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHtcbiAgYXdzX2VjMiBhcyBlYzIsXG4gIGF3c19lbGFzdGljbG9hZGJhbGFuY2luZ3YyIGFzIGVsYnYyLFxuICBEdXJhdGlvbixcbiAgQ2ZuT3V0cHV0XG59IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB0eXBlIHsgQXV0aEluZnJhRW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuLi9lbnZpcm9ubWVudC1jb25maWcnO1xuXG4vKipcbiAqIFByb3BlcnRpZXMgZm9yIHRoZSBFTEIgY29uc3RydWN0XG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgRWxiUHJvcHMge1xuICAvKipcbiAgICogRW52aXJvbm1lbnQgbmFtZSAoZS5nLiAncHJvZCcsICdkZXYnLCBldGMuKVxuICAgKi9cbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcblxuICAvKipcbiAgICogRW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxuICAgKi9cbiAgY29uZmlnOiBBdXRoSW5mcmFFbnZpcm9ubWVudENvbmZpZztcblxuICAvKipcbiAgICogVlBDIGZvciBkZXBsb3ltZW50XG4gICAqL1xuICB2cGM6IGVjMi5JVnBjO1xuXG4gIC8qKlxuICAgKiBTU0wgY2VydGlmaWNhdGUgQVJOIGZvciBIVFRQU1xuICAgKi9cbiAgc3NsQ2VydGlmaWNhdGVBcm46IHN0cmluZztcbn1cblxuLyoqXG4gKiBDREsgY29uc3RydWN0IGZvciB0aGUgQXBwbGljYXRpb24gTG9hZCBCYWxhbmNlclxuICovXG5leHBvcnQgY2xhc3MgRWxiIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgLyoqXG4gICAqIFRoZSBhcHBsaWNhdGlvbiBsb2FkIGJhbGFuY2VyXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgbG9hZEJhbGFuY2VyOiBlbGJ2Mi5BcHBsaWNhdGlvbkxvYWRCYWxhbmNlcjtcblxuICAvKipcbiAgICogVGhlIEhUVFBTIGxpc3RlbmVyXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgaHR0cHNMaXN0ZW5lcjogZWxidjIuQXBwbGljYXRpb25MaXN0ZW5lcjtcblxuICAvKipcbiAgICogRE5TIG5hbWUgb2YgdGhlIGxvYWQgYmFsYW5jZXJcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBkbnNOYW1lOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEVsYlByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIC8vIENyZWF0ZSBsb2FkIGJhbGFuY2VyIHdpdGggZHVhbHN0YWNrIElQIGFkZHJlc3NpbmdcbiAgICB0aGlzLmxvYWRCYWxhbmNlciA9IG5ldyBlbGJ2Mi5BcHBsaWNhdGlvbkxvYWRCYWxhbmNlcih0aGlzLCAnQUxCJywge1xuICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICBpbnRlcm5ldEZhY2luZzogdHJ1ZSxcbiAgICAgIGlwQWRkcmVzc1R5cGU6IGVsYnYyLklwQWRkcmVzc1R5cGUuRFVBTF9TVEFDS1xuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIEhUVFAgbGlzdGVuZXIgYW5kIHJlZGlyZWN0IHRvIEhUVFBTXG4gICAgY29uc3QgaHR0cExpc3RlbmVyID0gdGhpcy5sb2FkQmFsYW5jZXIuYWRkTGlzdGVuZXIoJ0h0dHBMaXN0ZW5lcicsIHtcbiAgICAgIHBvcnQ6IDgwLFxuICAgICAgb3BlbjogdHJ1ZVxuICAgIH0pO1xuICAgIGh0dHBMaXN0ZW5lci5hZGRBY3Rpb24oJ0h0dHBSZWRpcmVjdCcsIHtcbiAgICAgIGFjdGlvbjogZWxidjIuTGlzdGVuZXJBY3Rpb24ucmVkaXJlY3Qoe1xuICAgICAgICBwb3J0OiAnNDQzJyxcbiAgICAgICAgcHJvdG9jb2w6ICdIVFRQUydcbiAgICAgIH0pXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgSFRUUFMgbGlzdGVuZXJcbiAgICB0aGlzLmh0dHBzTGlzdGVuZXIgPSB0aGlzLmxvYWRCYWxhbmNlci5hZGRMaXN0ZW5lcignSHR0cHNMaXN0ZW5lcicsIHtcbiAgICAgIHBvcnQ6IDQ0MyxcbiAgICAgIGNlcnRpZmljYXRlczogW3sgY2VydGlmaWNhdGVBcm46IHByb3BzLnNzbENlcnRpZmljYXRlQXJuIH1dLFxuICAgICAgb3BlbjogdHJ1ZVxuICAgIH0pO1xuXG4gICAgLy8gU3RvcmUgdGhlIEROUyBuYW1lXG4gICAgdGhpcy5kbnNOYW1lID0gdGhpcy5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZTtcblxuICAgIC8vIEV4cG9ydCBvdXRwdXRzXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnTG9hZEJhbGFuY2VyRG5zTmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmRuc05hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSBETlMgbmFtZSBvZiB0aGUgbG9hZCBiYWxhbmNlcidcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0F1dGhlbnRpa1VSTCcsIHtcbiAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke3RoaXMuZG5zTmFtZX0vYCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIFVSTCBvZiB0aGUgQXV0aGVudGlrIHNlcnZpY2UnXG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGEgdGFyZ2V0IGdyb3VwIGZvciBBdXRoZW50aWsgc2VydmljZXNcbiAgICovXG4gIHB1YmxpYyBjcmVhdGVUYXJnZXRHcm91cChpZDogc3RyaW5nLCBwb3J0OiBudW1iZXIsIHZwYzogZWMyLklWcGMsIGhlYWx0aENoZWNrUGF0aDogc3RyaW5nID0gJy9oZWFsdGh6LycpOiBlbGJ2Mi5BcHBsaWNhdGlvblRhcmdldEdyb3VwIHtcbiAgICByZXR1cm4gbmV3IGVsYnYyLkFwcGxpY2F0aW9uVGFyZ2V0R3JvdXAodGhpcywgaWQsIHtcbiAgICAgIHZwYzogdnBjLFxuICAgICAgdGFyZ2V0VHlwZTogZWxidjIuVGFyZ2V0VHlwZS5JUCxcbiAgICAgIHBvcnQ6IHBvcnQsXG4gICAgICBwcm90b2NvbDogZWxidjIuQXBwbGljYXRpb25Qcm90b2NvbC5IVFRQLFxuICAgICAgaGVhbHRoQ2hlY2s6IHtcbiAgICAgICAgcGF0aDogaGVhbHRoQ2hlY2tQYXRoLFxuICAgICAgICBpbnRlcnZhbDogRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIGhlYWx0aHlIdHRwQ29kZXM6ICcyMDAtMjk5J1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEFkZCBhIHRhcmdldCBncm91cCB0byB0aGUgSFRUUFMgbGlzdGVuZXJcbiAgICovXG4gIHB1YmxpYyBhZGRUYXJnZXRHcm91cChpZDogc3RyaW5nLCB0YXJnZXRHcm91cDogZWxidjIuQXBwbGljYXRpb25UYXJnZXRHcm91cCwgcHJpb3JpdHk/OiBudW1iZXIpOiB2b2lkIHtcbiAgICB0aGlzLmh0dHBzTGlzdGVuZXIuYWRkQWN0aW9uKGlkLCB7XG4gICAgICBhY3Rpb246IGVsYnYyLkxpc3RlbmVyQWN0aW9uLmZvcndhcmQoW3RhcmdldEdyb3VwXSksXG4gICAgICBwcmlvcml0eTogcHJpb3JpdHlcbiAgICB9KTtcbiAgfVxufVxuIl19