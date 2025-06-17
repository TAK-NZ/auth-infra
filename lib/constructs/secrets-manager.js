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
        new aws_cdk_lib_1.CfnOutput(this, 'AuthentikLDAPServiceUserArn', {
            value: this.ldapServiceUser.secretArn,
            description: 'Authentik LDAP service user ARN'
        });
        new aws_cdk_lib_1.CfnOutput(this, 'AuthentikLDAPTokenArn', {
            value: this.ldapToken.secretArn,
            description: 'Authentik LDAP token ARN'
        });
    }
}
exports.SecretsManager = SecretsManager;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjcmV0cy1tYW5hZ2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic2VjcmV0cy1tYW5hZ2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOztHQUVHO0FBQ0gsMkNBQXVDO0FBQ3ZDLDZDQUtxQjtBQXdCckI7O0dBRUc7QUFDSCxNQUFhLGNBQWUsU0FBUSxzQkFBUztJQTBCM0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEwQjtRQUNsRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLDhCQUE4QjtRQUM5QixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksZ0NBQWMsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQ3JFLFdBQVcsRUFBRSx1QkFBdUI7WUFDcEMsVUFBVSxFQUFFLEdBQUcsS0FBSyxDQUFDLFNBQVMsdUJBQXVCO1lBQ3JELGFBQWEsRUFBRSxLQUFLLENBQUMsY0FBYyxDQUFDLE1BQU07WUFDMUMsb0JBQW9CLEVBQUU7Z0JBQ3BCLGtCQUFrQixFQUFFLElBQUk7Z0JBQ3hCLGNBQWMsRUFBRSxFQUFFO2FBQ25CO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsNkJBQTZCO1FBQzdCLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLGdDQUFjLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSw0QkFBNEIsRUFBRTtZQUNyRixXQUFXLEVBQUUsMkJBQTJCO1lBQ3hDLFVBQVUsRUFBRSxHQUFHLEtBQUssQ0FBQyxTQUFTLDJCQUEyQjtZQUN6RCxhQUFhLEVBQUUsS0FBSyxDQUFDLGNBQWMsQ0FBQyxNQUFNO1lBQzFDLG9CQUFvQixFQUFFO2dCQUNwQixvQkFBb0IsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxDQUFDO2dCQUM3RCxpQkFBaUIsRUFBRSxVQUFVO2dCQUM3QixrQkFBa0IsRUFBRSxJQUFJO2dCQUN4QixjQUFjLEVBQUUsRUFBRTthQUNuQjtTQUNGLENBQUMsQ0FBQztRQUVILDBCQUEwQjtRQUMxQixJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksZ0NBQWMsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLHlCQUF5QixFQUFFO1lBQy9FLFdBQVcsRUFBRSw0QkFBNEI7WUFDekMsVUFBVSxFQUFFLEdBQUcsS0FBSyxDQUFDLFNBQVMsNEJBQTRCO1lBQzFELGFBQWEsRUFBRSxLQUFLLENBQUMsY0FBYyxDQUFDLE1BQU07WUFDMUMsb0JBQW9CLEVBQUU7Z0JBQ3BCLGtCQUFrQixFQUFFLElBQUk7Z0JBQ3hCLGNBQWMsRUFBRSxFQUFFO2FBQ25CO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsMkJBQTJCO1FBQzNCLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsMEJBQTBCLEVBQUU7WUFDakYsV0FBVyxFQUFFLDhCQUE4QjtZQUMzQyxVQUFVLEVBQUUsR0FBRyxLQUFLLENBQUMsU0FBUyw4QkFBOEI7WUFDNUQsYUFBYSxFQUFFLEtBQUssQ0FBQyxjQUFjLENBQUMsTUFBTTtZQUMxQyxvQkFBb0IsRUFBRTtnQkFDcEIsb0JBQW9CLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxhQUFhLEVBQUUsQ0FBQztnQkFDakUsaUJBQWlCLEVBQUUsVUFBVTtnQkFDN0Isa0JBQWtCLEVBQUUsSUFBSTtnQkFDeEIsY0FBYyxFQUFFLEVBQUU7YUFDbkI7U0FDRixDQUFDLENBQUM7UUFFSCx1REFBdUQ7UUFDdkQsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLGdDQUFjLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUNyRSxXQUFXLEVBQUUsK0JBQStCO1lBQzVDLFVBQVUsRUFBRSxHQUFHLEtBQUssQ0FBQyxTQUFTLHVCQUF1QjtZQUNyRCxhQUFhLEVBQUUsS0FBSyxDQUFDLGNBQWMsQ0FBQyxNQUFNO1lBQzFDLGlCQUFpQixFQUFFLHlCQUFXLENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQyxDQUFDLGlDQUFpQztTQUMvRixDQUFDLENBQUM7UUFFSCxpQkFBaUI7UUFDakIsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSx1QkFBdUIsRUFBRTtZQUMzQyxLQUFLLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTO1lBQy9CLFdBQVcsRUFBRSwwQkFBMEI7U0FDeEMsQ0FBQyxDQUFDO1FBRUgsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSwrQkFBK0IsRUFBRTtZQUNuRCxLQUFLLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFNBQVM7WUFDdkMsV0FBVyxFQUFFLG1DQUFtQztTQUNqRCxDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLDRCQUE0QixFQUFFO1lBQ2hELEtBQUssRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLFNBQVM7WUFDcEMsV0FBVyxFQUFFLGdDQUFnQztTQUM5QyxDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLDZCQUE2QixFQUFFO1lBQ2pELEtBQUssRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLFNBQVM7WUFDckMsV0FBVyxFQUFFLGlDQUFpQztTQUMvQyxDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLHVCQUF1QixFQUFFO1lBQzNDLEtBQUssRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVM7WUFDL0IsV0FBVyxFQUFFLDBCQUEwQjtTQUN4QyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUEvR0Qsd0NBK0dDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBTZWNyZXRzTWFuYWdlciBDb25zdHJ1Y3QgLSBDREsgaW1wbGVtZW50YXRpb24gb2Ygc2VjcmV0cyBmb3IgQXV0aGVudGlrXG4gKi9cbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHtcbiAgYXdzX3NlY3JldHNtYW5hZ2VyIGFzIHNlY3JldHNtYW5hZ2VyLFxuICBhd3Nfa21zIGFzIGttcyxcbiAgQ2ZuT3V0cHV0LFxuICBTZWNyZXRWYWx1ZVxufSBmcm9tICdhd3MtY2RrLWxpYic7XG5cbmltcG9ydCB0eXBlIHsgSW5mcmFzdHJ1Y3R1cmVDb25maWcgfSBmcm9tICcuLi9jb25zdHJ1Y3QtY29uZmlncyc7XG5cbi8qKlxuICogUHJvcGVydGllcyBmb3IgdGhlIFNlY3JldHNNYW5hZ2VyIGNvbnN0cnVjdFxuICovXG5leHBvcnQgaW50ZXJmYWNlIFNlY3JldHNNYW5hZ2VyUHJvcHMge1xuICAvKipcbiAgICogRW52aXJvbm1lbnQgbmFtZSAoZS5nLiAncHJvZCcsICdkZXYnLCBldGMuKVxuICAgKi9cbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcblxuICAvKipcbiAgICogRnVsbCBzdGFjayBuYW1lIChlLmcuLCAnVEFLLURlbW8tQXV0aEluZnJhJylcbiAgICovXG4gIHN0YWNrTmFtZTogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBJbmZyYXN0cnVjdHVyZSBjb25maWd1cmF0aW9uIChLTVMga2V5KVxuICAgKi9cbiAgaW5mcmFzdHJ1Y3R1cmU6IEluZnJhc3RydWN0dXJlQ29uZmlnO1xufVxuXG4vKipcbiAqIENESyBjb25zdHJ1Y3QgZm9yIG1hbmFnaW5nIEF1dGhlbnRpayBzZWNyZXRzXG4gKi9cbmV4cG9ydCBjbGFzcyBTZWNyZXRzTWFuYWdlciBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBUaGUgQXV0aGVudGlrIHNlY3JldCBrZXlcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBzZWNyZXRLZXk6IHNlY3JldHNtYW5hZ2VyLlNlY3JldDtcblxuICAvKipcbiAgICogVGhlIGFkbWluIHBhc3N3b3JkIHNlY3JldFxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGFkbWluVXNlclBhc3N3b3JkOiBzZWNyZXRzbWFuYWdlci5TZWNyZXQ7XG5cbiAgLyoqXG4gICAqIFRoZSBhZG1pbiBBUEkgdG9rZW4gc2VjcmV0XG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgYWRtaW5Vc2VyVG9rZW46IHNlY3JldHNtYW5hZ2VyLlNlY3JldDtcblxuICAvKipcbiAgICogVGhlIExEQVAgc2VydmljZSB1c2VyIHNlY3JldFxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGxkYXBTZXJ2aWNlVXNlcjogc2VjcmV0c21hbmFnZXIuU2VjcmV0O1xuXG4gIC8qKlxuICAgKiBUaGUgTERBUCB0b2tlbiBzZWNyZXRcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBsZGFwVG9rZW46IHNlY3JldHNtYW5hZ2VyLlNlY3JldDtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU2VjcmV0c01hbmFnZXJQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICAvLyBDcmVhdGUgQXV0aGVudGlrIHNlY3JldCBrZXlcbiAgICB0aGlzLnNlY3JldEtleSA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ0F1dGhlbnRpa1NlY3JldEtleScsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgQXV0aGVudGlrOiBTZWNyZXQgS2V5YCxcbiAgICAgIHNlY3JldE5hbWU6IGAke3Byb3BzLnN0YWNrTmFtZX0vQXV0aGVudGlrL1NlY3JldC1LZXlgLFxuICAgICAgZW5jcnlwdGlvbktleTogcHJvcHMuaW5mcmFzdHJ1Y3R1cmUua21zS2V5LFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgZXhjbHVkZVB1bmN0dWF0aW9uOiB0cnVlLFxuICAgICAgICBwYXNzd29yZExlbmd0aDogNjRcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBhZG1pbiB1c2VyIHBhc3N3b3JkXG4gICAgdGhpcy5hZG1pblVzZXJQYXNzd29yZCA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ0F1dGhlbnRpa0FkbWluVXNlclBhc3N3b3JkJywge1xuICAgICAgZGVzY3JpcHRpb246IGBBdXRoZW50aWs6IEFkbWluIFBhc3N3b3JkYCxcbiAgICAgIHNlY3JldE5hbWU6IGAke3Byb3BzLnN0YWNrTmFtZX0vQXV0aGVudGlrL0FkbWluLVBhc3N3b3JkYCxcbiAgICAgIGVuY3J5cHRpb25LZXk6IHByb3BzLmluZnJhc3RydWN0dXJlLmttc0tleSxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIHNlY3JldFN0cmluZ1RlbXBsYXRlOiBKU09OLnN0cmluZ2lmeSh7IHVzZXJuYW1lOiAnYWthZG1pbicgfSksXG4gICAgICAgIGdlbmVyYXRlU3RyaW5nS2V5OiAncGFzc3dvcmQnLFxuICAgICAgICBleGNsdWRlUHVuY3R1YXRpb246IHRydWUsXG4gICAgICAgIHBhc3N3b3JkTGVuZ3RoOiAzMlxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIGFkbWluIHVzZXIgdG9rZW5cbiAgICB0aGlzLmFkbWluVXNlclRva2VuID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnQXV0aGVudGlrQWRtaW5Vc2VyVG9rZW4nLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYEF1dGhlbnRpazogQWRtaW4gQVBJIFRva2VuYCxcbiAgICAgIHNlY3JldE5hbWU6IGAke3Byb3BzLnN0YWNrTmFtZX0vQXV0aGVudGlrL0FkbWluLUFQSS1Ub2tlbmAsXG4gICAgICBlbmNyeXB0aW9uS2V5OiBwcm9wcy5pbmZyYXN0cnVjdHVyZS5rbXNLZXksXG4gICAgICBnZW5lcmF0ZVNlY3JldFN0cmluZzoge1xuICAgICAgICBleGNsdWRlUHVuY3R1YXRpb246IHRydWUsXG4gICAgICAgIHBhc3N3b3JkTGVuZ3RoOiA2NFxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIExEQVAgc2VydmljZSB1c2VyXG4gICAgdGhpcy5sZGFwU2VydmljZVVzZXIgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdBdXRoZW50aWtMREFQU2VydmljZVVzZXInLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYEF1dGhlbnRpazogTERBUCBTZXJ2aWNlIFVzZXJgLFxuICAgICAgc2VjcmV0TmFtZTogYCR7cHJvcHMuc3RhY2tOYW1lfS9BdXRoZW50aWsvTERBUC1TZXJ2aWNlLVVzZXJgLFxuICAgICAgZW5jcnlwdGlvbktleTogcHJvcHMuaW5mcmFzdHJ1Y3R1cmUua21zS2V5LFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgc2VjcmV0U3RyaW5nVGVtcGxhdGU6IEpTT04uc3RyaW5naWZ5KHsgdXNlcm5hbWU6ICdsZGFwc2VydmljZScgfSksXG4gICAgICAgIGdlbmVyYXRlU3RyaW5nS2V5OiAncGFzc3dvcmQnLFxuICAgICAgICBleGNsdWRlUHVuY3R1YXRpb246IHRydWUsXG4gICAgICAgIHBhc3N3b3JkTGVuZ3RoOiAzMlxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIExEQVAgdG9rZW4gKGluaXRpYWxseSB3aXRoIHBsYWNlaG9sZGVyIHZhbHVlKVxuICAgIHRoaXMubGRhcFRva2VuID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnQXV0aGVudGlrTERBUFRva2VuJywge1xuICAgICAgZGVzY3JpcHRpb246IGBBdXRoZW50aWs6IExEQVAgT3V0cG9zdCBUb2tlbmAsXG4gICAgICBzZWNyZXROYW1lOiBgJHtwcm9wcy5zdGFja05hbWV9L0F1dGhlbnRpay9MREFQLVRva2VuYCxcbiAgICAgIGVuY3J5cHRpb25LZXk6IHByb3BzLmluZnJhc3RydWN0dXJlLmttc0tleSxcbiAgICAgIHNlY3JldFN0cmluZ1ZhbHVlOiBTZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoJ3JlcGxhY2UtbWUnKSAvLyBXaWxsIGJlIHVwZGF0ZWQgbWFudWFsbHkgbGF0ZXJcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBvdXRwdXRzXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnQXV0aGVudGlrU2VjcmV0S2V5QXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuc2VjcmV0S2V5LnNlY3JldEFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQXV0aGVudGlrIHNlY3JldCBrZXkgQVJOJ1xuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnQXV0aGVudGlrQWRtaW5Vc2VyUGFzc3dvcmRBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5hZG1pblVzZXJQYXNzd29yZC5zZWNyZXRBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0F1dGhlbnRpayBhZG1pbiB1c2VyIHBhc3N3b3JkIEFSTidcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0F1dGhlbnRpa0FkbWluVXNlclRva2VuQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuYWRtaW5Vc2VyVG9rZW4uc2VjcmV0QXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdBdXRoZW50aWsgYWRtaW4gdXNlciB0b2tlbiBBUk4nXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdBdXRoZW50aWtMREFQU2VydmljZVVzZXJBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5sZGFwU2VydmljZVVzZXIuc2VjcmV0QXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdBdXRoZW50aWsgTERBUCBzZXJ2aWNlIHVzZXIgQVJOJ1xuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnQXV0aGVudGlrTERBUFRva2VuQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMubGRhcFRva2VuLnNlY3JldEFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQXV0aGVudGlrIExEQVAgdG9rZW4gQVJOJ1xuICAgIH0pO1xuICB9XG59XG4iXX0=