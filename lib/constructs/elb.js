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
        // Create load balancer
        this.loadBalancer = new aws_cdk_lib_1.aws_elasticloadbalancingv2.ApplicationLoadBalancer(this, 'ALB', {
            vpc: props.vpc,
            internetFacing: true,
            ipAddressType: props.ipAddressType === 'ipv4' ?
                aws_cdk_lib_1.aws_elasticloadbalancingv2.IpAddressType.IPV4 :
                aws_cdk_lib_1.aws_elasticloadbalancingv2.IpAddressType.DUAL_STACK
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWxiLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZWxiLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOztHQUVHO0FBQ0gsMkNBQXVDO0FBQ3ZDLDZDQUtxQjtBQWlDckI7O0dBRUc7QUFDSCxNQUFhLEdBQUksU0FBUSxzQkFBUztJQWdCaEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFlO1FBQ3ZELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsdUJBQXVCO1FBQ3ZCLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSx3Q0FBSyxDQUFDLHVCQUF1QixDQUFDLElBQUksRUFBRSxLQUFLLEVBQUU7WUFDakUsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHO1lBQ2QsY0FBYyxFQUFFLElBQUk7WUFDcEIsYUFBYSxFQUFFLEtBQUssQ0FBQyxhQUFhLEtBQUssTUFBTSxDQUFDLENBQUM7Z0JBQzdDLHdDQUFLLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUMxQix3Q0FBSyxDQUFDLGFBQWEsQ0FBQyxVQUFVO1NBQ2pDLENBQUMsQ0FBQztRQUVILDZDQUE2QztRQUM3QyxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxjQUFjLEVBQUU7WUFDakUsSUFBSSxFQUFFLEVBQUU7WUFDUixJQUFJLEVBQUUsSUFBSTtTQUNYLENBQUMsQ0FBQztRQUNILFlBQVksQ0FBQyxTQUFTLENBQUMsY0FBYyxFQUFFO1lBQ3JDLE1BQU0sRUFBRSx3Q0FBSyxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUM7Z0JBQ3BDLElBQUksRUFBRSxLQUFLO2dCQUNYLFFBQVEsRUFBRSxPQUFPO2FBQ2xCLENBQUM7U0FDSCxDQUFDLENBQUM7UUFFSCx3QkFBd0I7UUFDeEIsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxlQUFlLEVBQUU7WUFDbEUsSUFBSSxFQUFFLEdBQUc7WUFDVCxZQUFZLEVBQUUsQ0FBQyxFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUMzRCxJQUFJLEVBQUUsSUFBSTtTQUNYLENBQUMsQ0FBQztRQUVILHFCQUFxQjtRQUNyQixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsbUJBQW1CLENBQUM7UUFFckQsaUJBQWlCO1FBQ2pCLElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUscUJBQXFCLEVBQUU7WUFDekMsS0FBSyxFQUFFLElBQUksQ0FBQyxPQUFPO1lBQ25CLFdBQVcsRUFBRSxtQ0FBbUM7U0FDakQsQ0FBQyxDQUFDO1FBRUgsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxjQUFjLEVBQUU7WUFDbEMsS0FBSyxFQUFFLFdBQVcsSUFBSSxDQUFDLE9BQU8sR0FBRztZQUNqQyxXQUFXLEVBQUUsa0NBQWtDO1NBQ2hELENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRDs7T0FFRztJQUNJLGlCQUFpQixDQUFDLEVBQVUsRUFBRSxJQUFZLEVBQUUsR0FBYSxFQUFFLGtCQUEwQixXQUFXO1FBQ3JHLE9BQU8sSUFBSSx3Q0FBSyxDQUFDLHNCQUFzQixDQUFDLElBQUksRUFBRSxFQUFFLEVBQUU7WUFDaEQsR0FBRyxFQUFFLEdBQUc7WUFDUixVQUFVLEVBQUUsd0NBQUssQ0FBQyxVQUFVLENBQUMsRUFBRTtZQUMvQixJQUFJLEVBQUUsSUFBSTtZQUNWLFFBQVEsRUFBRSx3Q0FBSyxDQUFDLG1CQUFtQixDQUFDLElBQUk7WUFDeEMsV0FBVyxFQUFFO2dCQUNYLElBQUksRUFBRSxlQUFlO2dCQUNyQixRQUFRLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUM5QixnQkFBZ0IsRUFBRSxTQUFTO2FBQzVCO1NBQ0YsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOztPQUVHO0lBQ0ksY0FBYyxDQUFDLEVBQVUsRUFBRSxXQUF5QyxFQUFFLFFBQWlCO1FBQzVGLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLEVBQUUsRUFBRTtZQUMvQixNQUFNLEVBQUUsd0NBQUssQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDbkQsUUFBUSxFQUFFLFFBQVE7U0FDbkIsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBeEZELGtCQXdGQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogRUxCIENvbnN0cnVjdCAtIExvYWQgYmFsYW5jZXIgYW5kIG5ldHdvcmtpbmcgZm9yIEF1dGhlbnRpa1xuICovXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7XG4gIGF3c19lYzIgYXMgZWMyLFxuICBhd3NfZWxhc3RpY2xvYWRiYWxhbmNpbmd2MiBhcyBlbGJ2MixcbiAgRHVyYXRpb24sXG4gIENmbk91dHB1dFxufSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgdHlwZSB7IEF1dGhJbmZyYUVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi4vZW52aXJvbm1lbnQtY29uZmlnJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciB0aGUgRUxCIGNvbnN0cnVjdFxuICovXG5leHBvcnQgaW50ZXJmYWNlIEVsYlByb3BzIHtcbiAgLyoqXG4gICAqIEVudmlyb25tZW50IG5hbWUgKGUuZy4gJ3Byb2QnLCAnZGV2JywgZXRjLilcbiAgICovXG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEVudmlyb25tZW50IGNvbmZpZ3VyYXRpb25cbiAgICovXG4gIGNvbmZpZzogQXV0aEluZnJhRW52aXJvbm1lbnRDb25maWc7XG5cbiAgLyoqXG4gICAqIFZQQyBmb3IgZGVwbG95bWVudFxuICAgKi9cbiAgdnBjOiBlYzIuSVZwYztcblxuICAvKipcbiAgICogU1NMIGNlcnRpZmljYXRlIEFSTiBmb3IgSFRUUFNcbiAgICovXG4gIHNzbENlcnRpZmljYXRlQXJuOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIElQIGFkZHJlc3MgdHlwZSAoaXB2NCBvciBkdWFsc3RhY2spXG4gICAqL1xuICBpcEFkZHJlc3NUeXBlPzogJ2lwdjQnIHwgJ2R1YWxzdGFjayc7XG59XG5cbi8qKlxuICogQ0RLIGNvbnN0cnVjdCBmb3IgdGhlIEFwcGxpY2F0aW9uIExvYWQgQmFsYW5jZXJcbiAqL1xuZXhwb3J0IGNsYXNzIEVsYiBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBUaGUgYXBwbGljYXRpb24gbG9hZCBiYWxhbmNlclxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGxvYWRCYWxhbmNlcjogZWxidjIuQXBwbGljYXRpb25Mb2FkQmFsYW5jZXI7XG5cbiAgLyoqXG4gICAqIFRoZSBIVFRQUyBsaXN0ZW5lclxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGh0dHBzTGlzdGVuZXI6IGVsYnYyLkFwcGxpY2F0aW9uTGlzdGVuZXI7XG5cbiAgLyoqXG4gICAqIEROUyBuYW1lIG9mIHRoZSBsb2FkIGJhbGFuY2VyXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgZG5zTmFtZTogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBFbGJQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICAvLyBDcmVhdGUgbG9hZCBiYWxhbmNlclxuICAgIHRoaXMubG9hZEJhbGFuY2VyID0gbmV3IGVsYnYyLkFwcGxpY2F0aW9uTG9hZEJhbGFuY2VyKHRoaXMsICdBTEInLCB7XG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgIGludGVybmV0RmFjaW5nOiB0cnVlLFxuICAgICAgaXBBZGRyZXNzVHlwZTogcHJvcHMuaXBBZGRyZXNzVHlwZSA9PT0gJ2lwdjQnID8gXG4gICAgICAgIGVsYnYyLklwQWRkcmVzc1R5cGUuSVBWNCA6IFxuICAgICAgICBlbGJ2Mi5JcEFkZHJlc3NUeXBlLkRVQUxfU1RBQ0tcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBIVFRQIGxpc3RlbmVyIGFuZCByZWRpcmVjdCB0byBIVFRQU1xuICAgIGNvbnN0IGh0dHBMaXN0ZW5lciA9IHRoaXMubG9hZEJhbGFuY2VyLmFkZExpc3RlbmVyKCdIdHRwTGlzdGVuZXInLCB7XG4gICAgICBwb3J0OiA4MCxcbiAgICAgIG9wZW46IHRydWVcbiAgICB9KTtcbiAgICBodHRwTGlzdGVuZXIuYWRkQWN0aW9uKCdIdHRwUmVkaXJlY3QnLCB7XG4gICAgICBhY3Rpb246IGVsYnYyLkxpc3RlbmVyQWN0aW9uLnJlZGlyZWN0KHtcbiAgICAgICAgcG9ydDogJzQ0MycsXG4gICAgICAgIHByb3RvY29sOiAnSFRUUFMnXG4gICAgICB9KVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIEhUVFBTIGxpc3RlbmVyXG4gICAgdGhpcy5odHRwc0xpc3RlbmVyID0gdGhpcy5sb2FkQmFsYW5jZXIuYWRkTGlzdGVuZXIoJ0h0dHBzTGlzdGVuZXInLCB7XG4gICAgICBwb3J0OiA0NDMsXG4gICAgICBjZXJ0aWZpY2F0ZXM6IFt7IGNlcnRpZmljYXRlQXJuOiBwcm9wcy5zc2xDZXJ0aWZpY2F0ZUFybiB9XSxcbiAgICAgIG9wZW46IHRydWVcbiAgICB9KTtcblxuICAgIC8vIFN0b3JlIHRoZSBETlMgbmFtZVxuICAgIHRoaXMuZG5zTmFtZSA9IHRoaXMubG9hZEJhbGFuY2VyLmxvYWRCYWxhbmNlckRuc05hbWU7XG5cbiAgICAvLyBFeHBvcnQgb3V0cHV0c1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0xvYWRCYWxhbmNlckRuc05hbWUnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5kbnNOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdUaGUgRE5TIG5hbWUgb2YgdGhlIGxvYWQgYmFsYW5jZXInXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdBdXRoZW50aWtVUkwnLCB7XG4gICAgICB2YWx1ZTogYGh0dHBzOi8vJHt0aGlzLmRuc05hbWV9L2AsXG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSBVUkwgb2YgdGhlIEF1dGhlbnRpayBzZXJ2aWNlJ1xuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhIHRhcmdldCBncm91cCBmb3IgQXV0aGVudGlrIHNlcnZpY2VzXG4gICAqL1xuICBwdWJsaWMgY3JlYXRlVGFyZ2V0R3JvdXAoaWQ6IHN0cmluZywgcG9ydDogbnVtYmVyLCB2cGM6IGVjMi5JVnBjLCBoZWFsdGhDaGVja1BhdGg6IHN0cmluZyA9ICcvaGVhbHRoei8nKTogZWxidjIuQXBwbGljYXRpb25UYXJnZXRHcm91cCB7XG4gICAgcmV0dXJuIG5ldyBlbGJ2Mi5BcHBsaWNhdGlvblRhcmdldEdyb3VwKHRoaXMsIGlkLCB7XG4gICAgICB2cGM6IHZwYyxcbiAgICAgIHRhcmdldFR5cGU6IGVsYnYyLlRhcmdldFR5cGUuSVAsXG4gICAgICBwb3J0OiBwb3J0LFxuICAgICAgcHJvdG9jb2w6IGVsYnYyLkFwcGxpY2F0aW9uUHJvdG9jb2wuSFRUUCxcbiAgICAgIGhlYWx0aENoZWNrOiB7XG4gICAgICAgIHBhdGg6IGhlYWx0aENoZWNrUGF0aCxcbiAgICAgICAgaW50ZXJ2YWw6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICBoZWFsdGh5SHR0cENvZGVzOiAnMjAwLTI5OSdcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBZGQgYSB0YXJnZXQgZ3JvdXAgdG8gdGhlIEhUVFBTIGxpc3RlbmVyXG4gICAqL1xuICBwdWJsaWMgYWRkVGFyZ2V0R3JvdXAoaWQ6IHN0cmluZywgdGFyZ2V0R3JvdXA6IGVsYnYyLkFwcGxpY2F0aW9uVGFyZ2V0R3JvdXAsIHByaW9yaXR5PzogbnVtYmVyKTogdm9pZCB7XG4gICAgdGhpcy5odHRwc0xpc3RlbmVyLmFkZEFjdGlvbihpZCwge1xuICAgICAgYWN0aW9uOiBlbGJ2Mi5MaXN0ZW5lckFjdGlvbi5mb3J3YXJkKFt0YXJnZXRHcm91cF0pLFxuICAgICAgcHJpb3JpdHk6IHByaW9yaXR5XG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==