"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Elb = void 0;
/**
 * ELB Construct - Application load balancer and networking for Authentik
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
            loadBalancerName: 'auth',
            vpc: props.infrastructure.vpc,
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
            certificates: [{ certificateArn: props.network.sslCertificateArn }],
            open: true
        });
        // Store the DNS name
        this.dnsName = this.loadBalancer.loadBalancerDnsName;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWxiLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZWxiLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOztHQUVHO0FBQ0gsMkNBQXVDO0FBQ3ZDLDZDQUlxQjtBQTZCckI7O0dBRUc7QUFDSCxNQUFhLEdBQUksU0FBUSxzQkFBUztJQWdCaEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFlO1FBQ3ZELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsb0RBQW9EO1FBQ3BELElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSx3Q0FBSyxDQUFDLHVCQUF1QixDQUFDLElBQUksRUFBRSxLQUFLLEVBQUU7WUFDakUsZ0JBQWdCLEVBQUUsTUFBTTtZQUN4QixHQUFHLEVBQUUsS0FBSyxDQUFDLGNBQWMsQ0FBQyxHQUFHO1lBQzdCLGNBQWMsRUFBRSxJQUFJO1lBQ3BCLGFBQWEsRUFBRSx3Q0FBSyxDQUFDLGFBQWEsQ0FBQyxVQUFVO1NBQzlDLENBQUMsQ0FBQztRQUVILDZDQUE2QztRQUM3QyxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxjQUFjLEVBQUU7WUFDakUsSUFBSSxFQUFFLEVBQUU7WUFDUixJQUFJLEVBQUUsSUFBSTtTQUNYLENBQUMsQ0FBQztRQUNILFlBQVksQ0FBQyxTQUFTLENBQUMsY0FBYyxFQUFFO1lBQ3JDLE1BQU0sRUFBRSx3Q0FBSyxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUM7Z0JBQ3BDLElBQUksRUFBRSxLQUFLO2dCQUNYLFFBQVEsRUFBRSxPQUFPO2FBQ2xCLENBQUM7U0FDSCxDQUFDLENBQUM7UUFFSCx3QkFBd0I7UUFDeEIsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxlQUFlLEVBQUU7WUFDbEUsSUFBSSxFQUFFLEdBQUc7WUFDVCxZQUFZLEVBQUUsQ0FBQyxFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsT0FBTyxDQUFDLGlCQUFpQixFQUFFLENBQUM7WUFDbkUsSUFBSSxFQUFFLElBQUk7U0FDWCxDQUFDLENBQUM7UUFFSCxxQkFBcUI7UUFDckIsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLG1CQUFtQixDQUFDO0lBQ3ZELENBQUM7SUFFRDs7T0FFRztJQUNJLGlCQUFpQixDQUFDLEVBQVUsRUFBRSxJQUFZLEVBQUUsR0FBYSxFQUFFLGtCQUEwQixXQUFXO1FBQ3JHLE9BQU8sSUFBSSx3Q0FBSyxDQUFDLHNCQUFzQixDQUFDLElBQUksRUFBRSxFQUFFLEVBQUU7WUFDaEQsR0FBRyxFQUFFLEdBQUc7WUFDUixVQUFVLEVBQUUsd0NBQUssQ0FBQyxVQUFVLENBQUMsRUFBRTtZQUMvQixJQUFJLEVBQUUsSUFBSTtZQUNWLFFBQVEsRUFBRSx3Q0FBSyxDQUFDLG1CQUFtQixDQUFDLElBQUk7WUFDeEMsV0FBVyxFQUFFO2dCQUNYLElBQUksRUFBRSxlQUFlO2dCQUNyQixRQUFRLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUM5QixnQkFBZ0IsRUFBRSxTQUFTO2FBQzVCO1NBQ0YsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOztPQUVHO0lBQ0ksY0FBYyxDQUFDLEVBQVUsRUFBRSxXQUF5QyxFQUFFLFFBQWlCO1FBQzVGLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLEVBQUUsRUFBRTtZQUMvQixNQUFNLEVBQUUsd0NBQUssQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDbkQsUUFBUSxFQUFFLFFBQVE7U0FDbkIsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBNUVELGtCQTRFQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogRUxCIENvbnN0cnVjdCAtIEFwcGxpY2F0aW9uIGxvYWQgYmFsYW5jZXIgYW5kIG5ldHdvcmtpbmcgZm9yIEF1dGhlbnRpa1xuICovXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7XG4gIGF3c19lYzIgYXMgZWMyLFxuICBhd3NfZWxhc3RpY2xvYWRiYWxhbmNpbmd2MiBhcyBlbGJ2MixcbiAgRHVyYXRpb25cbn0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHR5cGUgeyBDb250ZXh0RW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuLi9zdGFjay1jb25maWcnO1xuaW1wb3J0IHR5cGUgeyBJbmZyYXN0cnVjdHVyZUNvbmZpZywgTmV0d29ya0NvbmZpZyB9IGZyb20gJy4uL2NvbnN0cnVjdC1jb25maWdzJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciB0aGUgRUxCIGNvbnN0cnVjdFxuICovXG5leHBvcnQgaW50ZXJmYWNlIEVMQlByb3BzIHtcbiAgLyoqXG4gICAqIEVudmlyb25tZW50IHR5cGUgKCdwcm9kJyB8ICdkZXYtdGVzdCcpXG4gICAqL1xuICBlbnZpcm9ubWVudDogJ3Byb2QnIHwgJ2Rldi10ZXN0JztcblxuICAvKipcbiAgICogQ29udGV4dC1iYXNlZCBlbnZpcm9ubWVudCBjb25maWd1cmF0aW9uIChkaXJlY3QgZnJvbSBjZGsuanNvbilcbiAgICovXG4gIGNvbnRleHRDb25maWc6IENvbnRleHRFbnZpcm9ubWVudENvbmZpZztcblxuICAvKipcbiAgICogSW5mcmFzdHJ1Y3R1cmUgY29uZmlndXJhdGlvbiAoVlBDLCBzZWN1cml0eSBncm91cHMsIGV0Yy4pXG4gICAqL1xuICBpbmZyYXN0cnVjdHVyZTogSW5mcmFzdHJ1Y3R1cmVDb25maWc7XG5cbiAgLyoqXG4gICAqIE5ldHdvcmsgY29uZmlndXJhdGlvbiAoU1NMIGNlcnRzLCBob3N0bmFtZXMsIGV0Yy4pXG4gICAqL1xuICBuZXR3b3JrOiBOZXR3b3JrQ29uZmlnO1xufVxuXG4vKipcbiAqIENESyBjb25zdHJ1Y3QgZm9yIHRoZSBBcHBsaWNhdGlvbiBMb2FkIEJhbGFuY2VyXG4gKi9cbmV4cG9ydCBjbGFzcyBFbGIgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICAvKipcbiAgICogVGhlIGFwcGxpY2F0aW9uIGxvYWQgYmFsYW5jZXJcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBsb2FkQmFsYW5jZXI6IGVsYnYyLkFwcGxpY2F0aW9uTG9hZEJhbGFuY2VyO1xuXG4gIC8qKlxuICAgKiBUaGUgSFRUUFMgbGlzdGVuZXJcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBodHRwc0xpc3RlbmVyOiBlbGJ2Mi5BcHBsaWNhdGlvbkxpc3RlbmVyO1xuXG4gIC8qKlxuICAgKiBETlMgbmFtZSBvZiB0aGUgbG9hZCBiYWxhbmNlclxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGRuc05hbWU6IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogRUxCUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gQ3JlYXRlIGxvYWQgYmFsYW5jZXIgd2l0aCBkdWFsc3RhY2sgSVAgYWRkcmVzc2luZ1xuICAgIHRoaXMubG9hZEJhbGFuY2VyID0gbmV3IGVsYnYyLkFwcGxpY2F0aW9uTG9hZEJhbGFuY2VyKHRoaXMsICdBTEInLCB7XG4gICAgICBsb2FkQmFsYW5jZXJOYW1lOiAnYXV0aCcsXG4gICAgICB2cGM6IHByb3BzLmluZnJhc3RydWN0dXJlLnZwYyxcbiAgICAgIGludGVybmV0RmFjaW5nOiB0cnVlLFxuICAgICAgaXBBZGRyZXNzVHlwZTogZWxidjIuSXBBZGRyZXNzVHlwZS5EVUFMX1NUQUNLXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgSFRUUCBsaXN0ZW5lciBhbmQgcmVkaXJlY3QgdG8gSFRUUFNcbiAgICBjb25zdCBodHRwTGlzdGVuZXIgPSB0aGlzLmxvYWRCYWxhbmNlci5hZGRMaXN0ZW5lcignSHR0cExpc3RlbmVyJywge1xuICAgICAgcG9ydDogODAsXG4gICAgICBvcGVuOiB0cnVlXG4gICAgfSk7XG4gICAgaHR0cExpc3RlbmVyLmFkZEFjdGlvbignSHR0cFJlZGlyZWN0Jywge1xuICAgICAgYWN0aW9uOiBlbGJ2Mi5MaXN0ZW5lckFjdGlvbi5yZWRpcmVjdCh7XG4gICAgICAgIHBvcnQ6ICc0NDMnLFxuICAgICAgICBwcm90b2NvbDogJ0hUVFBTJ1xuICAgICAgfSlcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBIVFRQUyBsaXN0ZW5lclxuICAgIHRoaXMuaHR0cHNMaXN0ZW5lciA9IHRoaXMubG9hZEJhbGFuY2VyLmFkZExpc3RlbmVyKCdIdHRwc0xpc3RlbmVyJywge1xuICAgICAgcG9ydDogNDQzLFxuICAgICAgY2VydGlmaWNhdGVzOiBbeyBjZXJ0aWZpY2F0ZUFybjogcHJvcHMubmV0d29yay5zc2xDZXJ0aWZpY2F0ZUFybiB9XSxcbiAgICAgIG9wZW46IHRydWVcbiAgICB9KTtcblxuICAgIC8vIFN0b3JlIHRoZSBETlMgbmFtZVxuICAgIHRoaXMuZG5zTmFtZSA9IHRoaXMubG9hZEJhbGFuY2VyLmxvYWRCYWxhbmNlckRuc05hbWU7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGEgdGFyZ2V0IGdyb3VwIGZvciBBdXRoZW50aWsgc2VydmljZXNcbiAgICovXG4gIHB1YmxpYyBjcmVhdGVUYXJnZXRHcm91cChpZDogc3RyaW5nLCBwb3J0OiBudW1iZXIsIHZwYzogZWMyLklWcGMsIGhlYWx0aENoZWNrUGF0aDogc3RyaW5nID0gJy9oZWFsdGh6LycpOiBlbGJ2Mi5BcHBsaWNhdGlvblRhcmdldEdyb3VwIHtcbiAgICByZXR1cm4gbmV3IGVsYnYyLkFwcGxpY2F0aW9uVGFyZ2V0R3JvdXAodGhpcywgaWQsIHtcbiAgICAgIHZwYzogdnBjLFxuICAgICAgdGFyZ2V0VHlwZTogZWxidjIuVGFyZ2V0VHlwZS5JUCxcbiAgICAgIHBvcnQ6IHBvcnQsXG4gICAgICBwcm90b2NvbDogZWxidjIuQXBwbGljYXRpb25Qcm90b2NvbC5IVFRQLFxuICAgICAgaGVhbHRoQ2hlY2s6IHtcbiAgICAgICAgcGF0aDogaGVhbHRoQ2hlY2tQYXRoLFxuICAgICAgICBpbnRlcnZhbDogRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIGhlYWx0aHlIdHRwQ29kZXM6ICcyMDAtMjk5J1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEFkZCBhIHRhcmdldCBncm91cCB0byB0aGUgSFRUUFMgbGlzdGVuZXJcbiAgICovXG4gIHB1YmxpYyBhZGRUYXJnZXRHcm91cChpZDogc3RyaW5nLCB0YXJnZXRHcm91cDogZWxidjIuQXBwbGljYXRpb25UYXJnZXRHcm91cCwgcHJpb3JpdHk/OiBudW1iZXIpOiB2b2lkIHtcbiAgICB0aGlzLmh0dHBzTGlzdGVuZXIuYWRkQWN0aW9uKGlkLCB7XG4gICAgICBhY3Rpb246IGVsYnYyLkxpc3RlbmVyQWN0aW9uLmZvcndhcmQoW3RhcmdldEdyb3VwXSksXG4gICAgICBwcmlvcml0eTogcHJpb3JpdHlcbiAgICB9KTtcbiAgfVxufVxuIl19