"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecretsManager = void 0;
/**
 * SecretsManager Construct - CDK implementation of secrets for Authentik
 */
const constructs_1 = require("constructs");
const aws_cdk_lib_1 = require("aws-cdk-lib");
/**
 * CDK construct for managing Authentik secrets
 */
class SecretsManager extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        // Create Authentik secret key
        this.secretKey = new aws_cdk_lib_1.aws_secretsmanager.Secret(this, 'AuthentikSecretKey', {
            description: `Authentik: Secret Key`,
            secretName: `${props.stackName}/Authentik/Secret-Key`,
            encryptionKey: props.kmsKey,
            generateSecretString: {
                excludePunctuation: true,
                passwordLength: 64
            }
        });
        // Create admin user password
        this.adminUserPassword = new aws_cdk_lib_1.aws_secretsmanager.Secret(this, 'AuthentikAdminUserPassword', {
            description: `Authentik: Admin Password`,
            secretName: `${props.stackName}/Authentik/Admin-Password`,
            encryptionKey: props.kmsKey,
            generateSecretString: {
                secretStringTemplate: JSON.stringify({ username: 'akadmin' }),
                generateStringKey: 'password',
                excludePunctuation: true,
                passwordLength: 32
            }
        });
        // Create admin user token
        this.adminUserToken = new aws_cdk_lib_1.aws_secretsmanager.Secret(this, 'AuthentikAdminUserToken', {
            description: `Authentik: Admin API Token`,
            secretName: `${props.stackName}/Authentik/Admin-API-Token`,
            encryptionKey: props.kmsKey,
            generateSecretString: {
                excludePunctuation: true,
                passwordLength: 64
            }
        });
        // Create LDAP token (initially with placeholder value)
        this.ldapToken = new aws_cdk_lib_1.aws_secretsmanager.Secret(this, 'AuthentikLDAPToken', {
            description: `Authentik: LDAP Outpost Token`,
            secretName: `${props.stackName}/Authentik/LDAP-Token`,
            encryptionKey: props.kmsKey,
            secretStringValue: aws_cdk_lib_1.SecretValue.unsafePlainText('replace-me') // Will be updated manually later
        });
        // Create outputs
        new aws_cdk_lib_1.CfnOutput(this, 'AuthentikSecretKeyArn', {
            value: this.secretKey.secretArn,
            description: 'Authentik secret key ARN'
        });
        new aws_cdk_lib_1.CfnOutput(this, 'AuthentikAdminUserPasswordArn', {
            value: this.adminUserPassword.secretArn,
            description: 'Authentik admin user password ARN'
        });
        new aws_cdk_lib_1.CfnOutput(this, 'AuthentikAdminUserTokenArn', {
            value: this.adminUserToken.secretArn,
            description: 'Authentik admin user token ARN'
        });
        new aws_cdk_lib_1.CfnOutput(this, 'AuthentikLDAPTokenArn', {
            value: this.ldapToken.secretArn,
            description: 'Authentik LDAP token ARN'
        });
    }
}
exports.SecretsManager = SecretsManager;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjcmV0cy1tYW5hZ2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic2VjcmV0cy1tYW5hZ2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOztHQUVHO0FBQ0gsMkNBQXVDO0FBQ3ZDLDZDQUtxQjtBQXNCckI7O0dBRUc7QUFDSCxNQUFhLGNBQWUsU0FBUSxzQkFBUztJQXFCM0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEwQjtRQUNsRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLDhCQUE4QjtRQUM5QixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksZ0NBQWMsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQ3JFLFdBQVcsRUFBRSx1QkFBdUI7WUFDcEMsVUFBVSxFQUFFLEdBQUcsS0FBSyxDQUFDLFNBQVMsdUJBQXVCO1lBQ3JELGFBQWEsRUFBRSxLQUFLLENBQUMsTUFBTTtZQUMzQixvQkFBb0IsRUFBRTtnQkFDcEIsa0JBQWtCLEVBQUUsSUFBSTtnQkFDeEIsY0FBYyxFQUFFLEVBQUU7YUFDbkI7U0FDRixDQUFDLENBQUM7UUFFSCw2QkFBNkI7UUFDN0IsSUFBSSxDQUFDLGlCQUFpQixHQUFHLElBQUksZ0NBQWMsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLDRCQUE0QixFQUFFO1lBQ3JGLFdBQVcsRUFBRSwyQkFBMkI7WUFDeEMsVUFBVSxFQUFFLEdBQUcsS0FBSyxDQUFDLFNBQVMsMkJBQTJCO1lBQ3pELGFBQWEsRUFBRSxLQUFLLENBQUMsTUFBTTtZQUMzQixvQkFBb0IsRUFBRTtnQkFDcEIsb0JBQW9CLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsQ0FBQztnQkFDN0QsaUJBQWlCLEVBQUUsVUFBVTtnQkFDN0Isa0JBQWtCLEVBQUUsSUFBSTtnQkFDeEIsY0FBYyxFQUFFLEVBQUU7YUFDbkI7U0FDRixDQUFDLENBQUM7UUFFSCwwQkFBMEI7UUFDMUIsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLGdDQUFjLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSx5QkFBeUIsRUFBRTtZQUMvRSxXQUFXLEVBQUUsNEJBQTRCO1lBQ3pDLFVBQVUsRUFBRSxHQUFHLEtBQUssQ0FBQyxTQUFTLDRCQUE0QjtZQUMxRCxhQUFhLEVBQUUsS0FBSyxDQUFDLE1BQU07WUFDM0Isb0JBQW9CLEVBQUU7Z0JBQ3BCLGtCQUFrQixFQUFFLElBQUk7Z0JBQ3hCLGNBQWMsRUFBRSxFQUFFO2FBQ25CO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsdURBQXVEO1FBQ3ZELElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLEVBQUU7WUFDckUsV0FBVyxFQUFFLCtCQUErQjtZQUM1QyxVQUFVLEVBQUUsR0FBRyxLQUFLLENBQUMsU0FBUyx1QkFBdUI7WUFDckQsYUFBYSxFQUFFLEtBQUssQ0FBQyxNQUFNO1lBQzNCLGlCQUFpQixFQUFFLHlCQUFXLENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQyxDQUFDLGlDQUFpQztTQUMvRixDQUFDLENBQUM7UUFFSCxpQkFBaUI7UUFDakIsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSx1QkFBdUIsRUFBRTtZQUMzQyxLQUFLLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTO1lBQy9CLFdBQVcsRUFBRSwwQkFBMEI7U0FDeEMsQ0FBQyxDQUFDO1FBRUgsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSwrQkFBK0IsRUFBRTtZQUNuRCxLQUFLLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFNBQVM7WUFDdkMsV0FBVyxFQUFFLG1DQUFtQztTQUNqRCxDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLDRCQUE0QixFQUFFO1lBQ2hELEtBQUssRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLFNBQVM7WUFDcEMsV0FBVyxFQUFFLGdDQUFnQztTQUM5QyxDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLHVCQUF1QixFQUFFO1lBQzNDLEtBQUssRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVM7WUFDL0IsV0FBVyxFQUFFLDBCQUEwQjtTQUN4QyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF4RkQsd0NBd0ZDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBTZWNyZXRzTWFuYWdlciBDb25zdHJ1Y3QgLSBDREsgaW1wbGVtZW50YXRpb24gb2Ygc2VjcmV0cyBmb3IgQXV0aGVudGlrXG4gKi9cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHtcbiAgYXdzX3NlY3JldHNtYW5hZ2VyIGFzIHNlY3JldHNtYW5hZ2VyLFxuICBhd3Nfa21zIGFzIGttcyxcbiAgQ2ZuT3V0cHV0LFxuICBTZWNyZXRWYWx1ZVxufSBmcm9tICdhd3MtY2RrLWxpYic7XG5cbi8qKlxuICogUHJvcGVydGllcyBmb3IgdGhlIFNlY3JldHNNYW5hZ2VyIGNvbnN0cnVjdFxuICovXG5leHBvcnQgaW50ZXJmYWNlIFNlY3JldHNNYW5hZ2VyUHJvcHMge1xuICAvKipcbiAgICogRW52aXJvbm1lbnQgbmFtZSAoZS5nLiAncHJvZCcsICdkZXYnLCBldGMuKVxuICAgKi9cbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcblxuICAvKipcbiAgICogRnVsbCBzdGFjayBuYW1lIChlLmcuLCAnVEFLLURlbW8tQXV0aEluZnJhJylcbiAgICovXG4gIHN0YWNrTmFtZTogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBLTVMga2V5IGZvciBlbmNyeXB0aW9uXG4gICAqL1xuICBrbXNLZXk6IGttcy5JS2V5O1xufVxuXG4vKipcbiAqIENESyBjb25zdHJ1Y3QgZm9yIG1hbmFnaW5nIEF1dGhlbnRpayBzZWNyZXRzXG4gKi9cbmV4cG9ydCBjbGFzcyBTZWNyZXRzTWFuYWdlciBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBUaGUgQXV0aGVudGlrIHNlY3JldCBrZXlcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBzZWNyZXRLZXk6IHNlY3JldHNtYW5hZ2VyLlNlY3JldDtcblxuICAvKipcbiAgICogVGhlIGFkbWluIHBhc3N3b3JkIHNlY3JldFxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGFkbWluVXNlclBhc3N3b3JkOiBzZWNyZXRzbWFuYWdlci5TZWNyZXQ7XG5cbiAgLyoqXG4gICAqIFRoZSBhZG1pbiBBUEkgdG9rZW4gc2VjcmV0XG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgYWRtaW5Vc2VyVG9rZW46IHNlY3JldHNtYW5hZ2VyLlNlY3JldDtcblxuICAvKipcbiAgICogVGhlIExEQVAgdG9rZW4gc2VjcmV0XG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgbGRhcFRva2VuOiBzZWNyZXRzbWFuYWdlci5TZWNyZXQ7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFNlY3JldHNNYW5hZ2VyUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gQ3JlYXRlIEF1dGhlbnRpayBzZWNyZXQga2V5XG4gICAgdGhpcy5zZWNyZXRLZXkgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdBdXRoZW50aWtTZWNyZXRLZXknLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYEF1dGhlbnRpazogU2VjcmV0IEtleWAsXG4gICAgICBzZWNyZXROYW1lOiBgJHtwcm9wcy5zdGFja05hbWV9L0F1dGhlbnRpay9TZWNyZXQtS2V5YCxcbiAgICAgIGVuY3J5cHRpb25LZXk6IHByb3BzLmttc0tleSxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIGV4Y2x1ZGVQdW5jdHVhdGlvbjogdHJ1ZSxcbiAgICAgICAgcGFzc3dvcmRMZW5ndGg6IDY0XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgYWRtaW4gdXNlciBwYXNzd29yZFxuICAgIHRoaXMuYWRtaW5Vc2VyUGFzc3dvcmQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdBdXRoZW50aWtBZG1pblVzZXJQYXNzd29yZCcsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgQXV0aGVudGlrOiBBZG1pbiBQYXNzd29yZGAsXG4gICAgICBzZWNyZXROYW1lOiBgJHtwcm9wcy5zdGFja05hbWV9L0F1dGhlbnRpay9BZG1pbi1QYXNzd29yZGAsXG4gICAgICBlbmNyeXB0aW9uS2V5OiBwcm9wcy5rbXNLZXksXG4gICAgICBnZW5lcmF0ZVNlY3JldFN0cmluZzoge1xuICAgICAgICBzZWNyZXRTdHJpbmdUZW1wbGF0ZTogSlNPTi5zdHJpbmdpZnkoeyB1c2VybmFtZTogJ2FrYWRtaW4nIH0pLFxuICAgICAgICBnZW5lcmF0ZVN0cmluZ0tleTogJ3Bhc3N3b3JkJyxcbiAgICAgICAgZXhjbHVkZVB1bmN0dWF0aW9uOiB0cnVlLFxuICAgICAgICBwYXNzd29yZExlbmd0aDogMzJcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBhZG1pbiB1c2VyIHRva2VuXG4gICAgdGhpcy5hZG1pblVzZXJUb2tlbiA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ0F1dGhlbnRpa0FkbWluVXNlclRva2VuJywge1xuICAgICAgZGVzY3JpcHRpb246IGBBdXRoZW50aWs6IEFkbWluIEFQSSBUb2tlbmAsXG4gICAgICBzZWNyZXROYW1lOiBgJHtwcm9wcy5zdGFja05hbWV9L0F1dGhlbnRpay9BZG1pbi1BUEktVG9rZW5gLFxuICAgICAgZW5jcnlwdGlvbktleTogcHJvcHMua21zS2V5LFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgZXhjbHVkZVB1bmN0dWF0aW9uOiB0cnVlLFxuICAgICAgICBwYXNzd29yZExlbmd0aDogNjRcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBMREFQIHRva2VuIChpbml0aWFsbHkgd2l0aCBwbGFjZWhvbGRlciB2YWx1ZSlcbiAgICB0aGlzLmxkYXBUb2tlbiA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ0F1dGhlbnRpa0xEQVBUb2tlbicsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgQXV0aGVudGlrOiBMREFQIE91dHBvc3QgVG9rZW5gLFxuICAgICAgc2VjcmV0TmFtZTogYCR7cHJvcHMuc3RhY2tOYW1lfS9BdXRoZW50aWsvTERBUC1Ub2tlbmAsXG4gICAgICBlbmNyeXB0aW9uS2V5OiBwcm9wcy5rbXNLZXksXG4gICAgICBzZWNyZXRTdHJpbmdWYWx1ZTogU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KCdyZXBsYWNlLW1lJykgLy8gV2lsbCBiZSB1cGRhdGVkIG1hbnVhbGx5IGxhdGVyXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgb3V0cHV0c1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0F1dGhlbnRpa1NlY3JldEtleUFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnNlY3JldEtleS5zZWNyZXRBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0F1dGhlbnRpayBzZWNyZXQga2V5IEFSTidcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0F1dGhlbnRpa0FkbWluVXNlclBhc3N3b3JkQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuYWRtaW5Vc2VyUGFzc3dvcmQuc2VjcmV0QXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdBdXRoZW50aWsgYWRtaW4gdXNlciBwYXNzd29yZCBBUk4nXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdBdXRoZW50aWtBZG1pblVzZXJUb2tlbkFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmFkbWluVXNlclRva2VuLnNlY3JldEFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQXV0aGVudGlrIGFkbWluIHVzZXIgdG9rZW4gQVJOJ1xuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnQXV0aGVudGlrTERBUFRva2VuQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMubGRhcFRva2VuLnNlY3JldEFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQXV0aGVudGlrIExEQVAgdG9rZW4gQVJOJ1xuICAgIH0pO1xuICB9XG59XG4iXX0=