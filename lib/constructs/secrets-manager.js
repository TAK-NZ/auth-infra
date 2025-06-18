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
            encryptionKey: props.infrastructure.kmsKey,
            generateSecretString: {
                excludePunctuation: true,
                passwordLength: 64
            }
        });
        // Create admin user password
        this.adminUserPassword = new aws_cdk_lib_1.aws_secretsmanager.Secret(this, 'AuthentikAdminUserPassword', {
            description: `Authentik: Admin Password`,
            secretName: `${props.stackName}/Authentik/Admin-Password`,
            encryptionKey: props.infrastructure.kmsKey,
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
            encryptionKey: props.infrastructure.kmsKey,
            generateSecretString: {
                excludePunctuation: true,
                passwordLength: 64
            }
        });
        // Create LDAP service user
        this.ldapServiceUser = new aws_cdk_lib_1.aws_secretsmanager.Secret(this, 'AuthentikLDAPServiceUser', {
            description: `Authentik: LDAP Service User`,
            secretName: `${props.stackName}/Authentik/LDAP-Service-User`,
            encryptionKey: props.infrastructure.kmsKey,
            generateSecretString: {
                secretStringTemplate: JSON.stringify({ username: 'ldapservice' }),
                generateStringKey: 'password',
                excludePunctuation: true,
                passwordLength: 32
            }
        });
        // Create LDAP token (initially with placeholder value)
        this.ldapToken = new aws_cdk_lib_1.aws_secretsmanager.Secret(this, 'AuthentikLDAPToken', {
            description: `Authentik: LDAP Outpost Token`,
            secretName: `${props.stackName}/Authentik/LDAP-Token`,
            encryptionKey: props.infrastructure.kmsKey,
            secretStringValue: aws_cdk_lib_1.SecretValue.unsafePlainText('replace-me') // Will be updated manually later
        });
    }
}
exports.SecretsManager = SecretsManager;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjcmV0cy1tYW5hZ2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic2VjcmV0cy1tYW5hZ2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOztHQUVHO0FBQ0gsMkNBQXVDO0FBQ3ZDLDZDQUlxQjtBQXdCckI7O0dBRUc7QUFDSCxNQUFhLGNBQWUsU0FBUSxzQkFBUztJQTBCM0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEwQjtRQUNsRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLDhCQUE4QjtRQUM5QixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksZ0NBQWMsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQ3JFLFdBQVcsRUFBRSx1QkFBdUI7WUFDcEMsVUFBVSxFQUFFLEdBQUcsS0FBSyxDQUFDLFNBQVMsdUJBQXVCO1lBQ3JELGFBQWEsRUFBRSxLQUFLLENBQUMsY0FBYyxDQUFDLE1BQU07WUFDMUMsb0JBQW9CLEVBQUU7Z0JBQ3BCLGtCQUFrQixFQUFFLElBQUk7Z0JBQ3hCLGNBQWMsRUFBRSxFQUFFO2FBQ25CO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsNkJBQTZCO1FBQzdCLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLGdDQUFjLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSw0QkFBNEIsRUFBRTtZQUNyRixXQUFXLEVBQUUsMkJBQTJCO1lBQ3hDLFVBQVUsRUFBRSxHQUFHLEtBQUssQ0FBQyxTQUFTLDJCQUEyQjtZQUN6RCxhQUFhLEVBQUUsS0FBSyxDQUFDLGNBQWMsQ0FBQyxNQUFNO1lBQzFDLG9CQUFvQixFQUFFO2dCQUNwQixvQkFBb0IsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxDQUFDO2dCQUM3RCxpQkFBaUIsRUFBRSxVQUFVO2dCQUM3QixrQkFBa0IsRUFBRSxJQUFJO2dCQUN4QixjQUFjLEVBQUUsRUFBRTthQUNuQjtTQUNGLENBQUMsQ0FBQztRQUVILDBCQUEwQjtRQUMxQixJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksZ0NBQWMsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLHlCQUF5QixFQUFFO1lBQy9FLFdBQVcsRUFBRSw0QkFBNEI7WUFDekMsVUFBVSxFQUFFLEdBQUcsS0FBSyxDQUFDLFNBQVMsNEJBQTRCO1lBQzFELGFBQWEsRUFBRSxLQUFLLENBQUMsY0FBYyxDQUFDLE1BQU07WUFDMUMsb0JBQW9CLEVBQUU7Z0JBQ3BCLGtCQUFrQixFQUFFLElBQUk7Z0JBQ3hCLGNBQWMsRUFBRSxFQUFFO2FBQ25CO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsMkJBQTJCO1FBQzNCLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsMEJBQTBCLEVBQUU7WUFDakYsV0FBVyxFQUFFLDhCQUE4QjtZQUMzQyxVQUFVLEVBQUUsR0FBRyxLQUFLLENBQUMsU0FBUyw4QkFBOEI7WUFDNUQsYUFBYSxFQUFFLEtBQUssQ0FBQyxjQUFjLENBQUMsTUFBTTtZQUMxQyxvQkFBb0IsRUFBRTtnQkFDcEIsb0JBQW9CLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxhQUFhLEVBQUUsQ0FBQztnQkFDakUsaUJBQWlCLEVBQUUsVUFBVTtnQkFDN0Isa0JBQWtCLEVBQUUsSUFBSTtnQkFDeEIsY0FBYyxFQUFFLEVBQUU7YUFDbkI7U0FDRixDQUFDLENBQUM7UUFFSCx1REFBdUQ7UUFDdkQsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLGdDQUFjLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUNyRSxXQUFXLEVBQUUsK0JBQStCO1lBQzVDLFVBQVUsRUFBRSxHQUFHLEtBQUssQ0FBQyxTQUFTLHVCQUF1QjtZQUNyRCxhQUFhLEVBQUUsS0FBSyxDQUFDLGNBQWMsQ0FBQyxNQUFNO1lBQzFDLGlCQUFpQixFQUFFLHlCQUFXLENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQyxDQUFDLGlDQUFpQztTQUMvRixDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFyRkQsd0NBcUZDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBTZWNyZXRzTWFuYWdlciBDb25zdHJ1Y3QgLSBDREsgaW1wbGVtZW50YXRpb24gb2Ygc2VjcmV0cyBmb3IgQXV0aGVudGlrXG4gKi9cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHtcbiAgYXdzX3NlY3JldHNtYW5hZ2VyIGFzIHNlY3JldHNtYW5hZ2VyLFxuICBhd3Nfa21zIGFzIGttcyxcbiAgU2VjcmV0VmFsdWVcbn0gZnJvbSAnYXdzLWNkay1saWInO1xuXG5pbXBvcnQgdHlwZSB7IEluZnJhc3RydWN0dXJlQ29uZmlnIH0gZnJvbSAnLi4vY29uc3RydWN0LWNvbmZpZ3MnO1xuXG4vKipcbiAqIFByb3BlcnRpZXMgZm9yIHRoZSBTZWNyZXRzTWFuYWdlciBjb25zdHJ1Y3RcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBTZWNyZXRzTWFuYWdlclByb3BzIHtcbiAgLyoqXG4gICAqIEVudmlyb25tZW50IG5hbWUgKGUuZy4gJ3Byb2QnLCAnZGV2JywgZXRjLilcbiAgICovXG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEZ1bGwgc3RhY2sgbmFtZSAoZS5nLiwgJ1RBSy1EZW1vLUF1dGhJbmZyYScpXG4gICAqL1xuICBzdGFja05hbWU6IHN0cmluZztcblxuICAvKipcbiAgICogSW5mcmFzdHJ1Y3R1cmUgY29uZmlndXJhdGlvbiAoS01TIGtleSlcbiAgICovXG4gIGluZnJhc3RydWN0dXJlOiBJbmZyYXN0cnVjdHVyZUNvbmZpZztcbn1cblxuLyoqXG4gKiBDREsgY29uc3RydWN0IGZvciBtYW5hZ2luZyBBdXRoZW50aWsgc2VjcmV0c1xuICovXG5leHBvcnQgY2xhc3MgU2VjcmV0c01hbmFnZXIgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICAvKipcbiAgICogVGhlIEF1dGhlbnRpayBzZWNyZXQga2V5XG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgc2VjcmV0S2V5OiBzZWNyZXRzbWFuYWdlci5TZWNyZXQ7XG5cbiAgLyoqXG4gICAqIFRoZSBhZG1pbiBwYXNzd29yZCBzZWNyZXRcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBhZG1pblVzZXJQYXNzd29yZDogc2VjcmV0c21hbmFnZXIuU2VjcmV0O1xuXG4gIC8qKlxuICAgKiBUaGUgYWRtaW4gQVBJIHRva2VuIHNlY3JldFxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGFkbWluVXNlclRva2VuOiBzZWNyZXRzbWFuYWdlci5TZWNyZXQ7XG5cbiAgLyoqXG4gICAqIFRoZSBMREFQIHNlcnZpY2UgdXNlciBzZWNyZXRcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBsZGFwU2VydmljZVVzZXI6IHNlY3JldHNtYW5hZ2VyLlNlY3JldDtcblxuICAvKipcbiAgICogVGhlIExEQVAgdG9rZW4gc2VjcmV0XG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgbGRhcFRva2VuOiBzZWNyZXRzbWFuYWdlci5TZWNyZXQ7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFNlY3JldHNNYW5hZ2VyUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gQ3JlYXRlIEF1dGhlbnRpayBzZWNyZXQga2V5XG4gICAgdGhpcy5zZWNyZXRLZXkgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdBdXRoZW50aWtTZWNyZXRLZXknLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYEF1dGhlbnRpazogU2VjcmV0IEtleWAsXG4gICAgICBzZWNyZXROYW1lOiBgJHtwcm9wcy5zdGFja05hbWV9L0F1dGhlbnRpay9TZWNyZXQtS2V5YCxcbiAgICAgIGVuY3J5cHRpb25LZXk6IHByb3BzLmluZnJhc3RydWN0dXJlLmttc0tleSxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIGV4Y2x1ZGVQdW5jdHVhdGlvbjogdHJ1ZSxcbiAgICAgICAgcGFzc3dvcmRMZW5ndGg6IDY0XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgYWRtaW4gdXNlciBwYXNzd29yZFxuICAgIHRoaXMuYWRtaW5Vc2VyUGFzc3dvcmQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdBdXRoZW50aWtBZG1pblVzZXJQYXNzd29yZCcsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgQXV0aGVudGlrOiBBZG1pbiBQYXNzd29yZGAsXG4gICAgICBzZWNyZXROYW1lOiBgJHtwcm9wcy5zdGFja05hbWV9L0F1dGhlbnRpay9BZG1pbi1QYXNzd29yZGAsXG4gICAgICBlbmNyeXB0aW9uS2V5OiBwcm9wcy5pbmZyYXN0cnVjdHVyZS5rbXNLZXksXG4gICAgICBnZW5lcmF0ZVNlY3JldFN0cmluZzoge1xuICAgICAgICBzZWNyZXRTdHJpbmdUZW1wbGF0ZTogSlNPTi5zdHJpbmdpZnkoeyB1c2VybmFtZTogJ2FrYWRtaW4nIH0pLFxuICAgICAgICBnZW5lcmF0ZVN0cmluZ0tleTogJ3Bhc3N3b3JkJyxcbiAgICAgICAgZXhjbHVkZVB1bmN0dWF0aW9uOiB0cnVlLFxuICAgICAgICBwYXNzd29yZExlbmd0aDogMzJcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBhZG1pbiB1c2VyIHRva2VuXG4gICAgdGhpcy5hZG1pblVzZXJUb2tlbiA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ0F1dGhlbnRpa0FkbWluVXNlclRva2VuJywge1xuICAgICAgZGVzY3JpcHRpb246IGBBdXRoZW50aWs6IEFkbWluIEFQSSBUb2tlbmAsXG4gICAgICBzZWNyZXROYW1lOiBgJHtwcm9wcy5zdGFja05hbWV9L0F1dGhlbnRpay9BZG1pbi1BUEktVG9rZW5gLFxuICAgICAgZW5jcnlwdGlvbktleTogcHJvcHMuaW5mcmFzdHJ1Y3R1cmUua21zS2V5LFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgZXhjbHVkZVB1bmN0dWF0aW9uOiB0cnVlLFxuICAgICAgICBwYXNzd29yZExlbmd0aDogNjRcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBMREFQIHNlcnZpY2UgdXNlclxuICAgIHRoaXMubGRhcFNlcnZpY2VVc2VyID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnQXV0aGVudGlrTERBUFNlcnZpY2VVc2VyJywge1xuICAgICAgZGVzY3JpcHRpb246IGBBdXRoZW50aWs6IExEQVAgU2VydmljZSBVc2VyYCxcbiAgICAgIHNlY3JldE5hbWU6IGAke3Byb3BzLnN0YWNrTmFtZX0vQXV0aGVudGlrL0xEQVAtU2VydmljZS1Vc2VyYCxcbiAgICAgIGVuY3J5cHRpb25LZXk6IHByb3BzLmluZnJhc3RydWN0dXJlLmttc0tleSxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIHNlY3JldFN0cmluZ1RlbXBsYXRlOiBKU09OLnN0cmluZ2lmeSh7IHVzZXJuYW1lOiAnbGRhcHNlcnZpY2UnIH0pLFxuICAgICAgICBnZW5lcmF0ZVN0cmluZ0tleTogJ3Bhc3N3b3JkJyxcbiAgICAgICAgZXhjbHVkZVB1bmN0dWF0aW9uOiB0cnVlLFxuICAgICAgICBwYXNzd29yZExlbmd0aDogMzJcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBMREFQIHRva2VuIChpbml0aWFsbHkgd2l0aCBwbGFjZWhvbGRlciB2YWx1ZSlcbiAgICB0aGlzLmxkYXBUb2tlbiA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ0F1dGhlbnRpa0xEQVBUb2tlbicsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgQXV0aGVudGlrOiBMREFQIE91dHBvc3QgVG9rZW5gLFxuICAgICAgc2VjcmV0TmFtZTogYCR7cHJvcHMuc3RhY2tOYW1lfS9BdXRoZW50aWsvTERBUC1Ub2tlbmAsXG4gICAgICBlbmNyeXB0aW9uS2V5OiBwcm9wcy5pbmZyYXN0cnVjdHVyZS5rbXNLZXksXG4gICAgICBzZWNyZXRTdHJpbmdWYWx1ZTogU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KCdyZXBsYWNlLW1lJykgLy8gV2lsbCBiZSB1cGRhdGVkIG1hbnVhbGx5IGxhdGVyXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==