/**
 * SecretsManager Construct - CDK implementation of secrets for Authentik
 */
import { Construct } from 'constructs';
import { aws_secretsmanager as secretsmanager, CfnOutput } from 'aws-cdk-lib';
/**
 * CDK construct for managing Authentik secrets
 */
export class SecretsManager extends Construct {
    constructor(scope, id, props) {
        super(scope, id);
        // Create Authentik secret key
        this.secretKey = new secretsmanager.Secret(this, 'AuthentikSecretKey', {
            description: `${id} Authentik Secret Key`,
            secretName: `${id}/authentik-secret-key`,
            encryptionKey: props.kmsKey,
            generateSecretString: {
                excludePunctuation: true,
                passwordLength: 64
            }
        });
        // Create admin user password
        this.adminUserPassword = new secretsmanager.Secret(this, 'AuthentikAdminUserPassword', {
            description: `${id} Authentik Admin User Password`,
            secretName: `${id}/authentik-admin-user-password`,
            encryptionKey: props.kmsKey,
            generateSecretString: {
                secretStringTemplate: JSON.stringify({ username: 'akadmin' }),
                generateStringKey: 'password',
                excludePunctuation: true,
                passwordLength: 32
            }
        });
        // Create admin user token
        this.adminUserToken = new secretsmanager.Secret(this, 'AuthentikAdminUserToken', {
            description: `${id} Authentik Admin User Token`,
            secretName: `${id}/authentik-admin-token`,
            encryptionKey: props.kmsKey,
            generateSecretString: {
                excludePunctuation: true,
                passwordLength: 64
            }
        });
        // Create LDAP token (initially with placeholder value)
        this.ldapToken = new secretsmanager.Secret(this, 'AuthentikLDAPToken', {
            description: `${id} Authentik LDAP Outpost Token`,
            secretName: `${id}/authentik-ldap-token`,
            encryptionKey: props.kmsKey,
            secretStringValue: 'replace-me' // Will be updated manually later
        });
        // Create bootstrap secrets for Authentik default system objects
        new secretsmanager.Secret(this, 'AuthentikBootstrapCrypto', {
            description: `${id} Authentik Bootstrap Crypto Certificate`,
            secretName: `${id}/authentik-bootstrap-crypto`,
            encryptionKey: props.kmsKey,
            secretStringValue: 'replace-me' // Will be populated by bootstrap
        });
        new secretsmanager.Secret(this, 'AuthentikBootstrapSigning', {
            description: `${id} Authentik Bootstrap Signing Certificate`,
            secretName: `${id}/authentik-bootstrap-signing`,
            encryptionKey: props.kmsKey,
            secretStringValue: 'replace-me' // Will be populated by bootstrap
        });
        // Create outputs
        new CfnOutput(this, 'AuthentikSecretKeyArn', {
            value: this.secretKey.secretArn,
            description: 'Authentik secret key ARN'
        });
        new CfnOutput(this, 'AuthentikAdminUserPasswordArn', {
            value: this.adminUserPassword.secretArn,
            description: 'Authentik admin user password ARN'
        });
        new CfnOutput(this, 'AuthentikAdminUserTokenArn', {
            value: this.adminUserToken.secretArn,
            description: 'Authentik admin user token ARN'
        });
        new CfnOutput(this, 'AuthentikLDAPTokenArn', {
            value: this.ldapToken.secretArn,
            description: 'Authentik LDAP token ARN'
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjcmV0cy1tYW5hZ2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic2VjcmV0cy1tYW5hZ2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOztHQUVHO0FBQ0gsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUN2QyxPQUFPLEVBQ0wsa0JBQWtCLElBQUksY0FBYyxFQUVwQyxTQUFTLEVBQ1YsTUFBTSxhQUFhLENBQUM7QUFpQnJCOztHQUVHO0FBQ0gsTUFBTSxPQUFPLGNBQWUsU0FBUSxTQUFTO0lBcUIzQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTBCO1FBQ2xFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsOEJBQThCO1FBQzlCLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxjQUFjLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUNyRSxXQUFXLEVBQUUsR0FBRyxFQUFFLHVCQUF1QjtZQUN6QyxVQUFVLEVBQUUsR0FBRyxFQUFFLHVCQUF1QjtZQUN4QyxhQUFhLEVBQUUsS0FBSyxDQUFDLE1BQU07WUFDM0Isb0JBQW9CLEVBQUU7Z0JBQ3BCLGtCQUFrQixFQUFFLElBQUk7Z0JBQ3hCLGNBQWMsRUFBRSxFQUFFO2FBQ25CO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsNkJBQTZCO1FBQzdCLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLGNBQWMsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLDRCQUE0QixFQUFFO1lBQ3JGLFdBQVcsRUFBRSxHQUFHLEVBQUUsZ0NBQWdDO1lBQ2xELFVBQVUsRUFBRSxHQUFHLEVBQUUsZ0NBQWdDO1lBQ2pELGFBQWEsRUFBRSxLQUFLLENBQUMsTUFBTTtZQUMzQixvQkFBb0IsRUFBRTtnQkFDcEIsb0JBQW9CLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsQ0FBQztnQkFDN0QsaUJBQWlCLEVBQUUsVUFBVTtnQkFDN0Isa0JBQWtCLEVBQUUsSUFBSTtnQkFDeEIsY0FBYyxFQUFFLEVBQUU7YUFDbkI7U0FDRixDQUFDLENBQUM7UUFFSCwwQkFBMEI7UUFDMUIsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLGNBQWMsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLHlCQUF5QixFQUFFO1lBQy9FLFdBQVcsRUFBRSxHQUFHLEVBQUUsNkJBQTZCO1lBQy9DLFVBQVUsRUFBRSxHQUFHLEVBQUUsd0JBQXdCO1lBQ3pDLGFBQWEsRUFBRSxLQUFLLENBQUMsTUFBTTtZQUMzQixvQkFBb0IsRUFBRTtnQkFDcEIsa0JBQWtCLEVBQUUsSUFBSTtnQkFDeEIsY0FBYyxFQUFFLEVBQUU7YUFDbkI7U0FDRixDQUFDLENBQUM7UUFFSCx1REFBdUQ7UUFDdkQsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLGNBQWMsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQ3JFLFdBQVcsRUFBRSxHQUFHLEVBQUUsK0JBQStCO1lBQ2pELFVBQVUsRUFBRSxHQUFHLEVBQUUsdUJBQXVCO1lBQ3hDLGFBQWEsRUFBRSxLQUFLLENBQUMsTUFBTTtZQUMzQixpQkFBaUIsRUFBRSxZQUFtQixDQUFDLGlDQUFpQztTQUN6RSxDQUFDLENBQUM7UUFFSCxnRUFBZ0U7UUFDaEUsSUFBSSxjQUFjLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSwwQkFBMEIsRUFBRTtZQUMxRCxXQUFXLEVBQUUsR0FBRyxFQUFFLHlDQUF5QztZQUMzRCxVQUFVLEVBQUUsR0FBRyxFQUFFLDZCQUE2QjtZQUM5QyxhQUFhLEVBQUUsS0FBSyxDQUFDLE1BQU07WUFDM0IsaUJBQWlCLEVBQUUsWUFBbUIsQ0FBQyxpQ0FBaUM7U0FDekUsQ0FBQyxDQUFDO1FBRUgsSUFBSSxjQUFjLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSwyQkFBMkIsRUFBRTtZQUMzRCxXQUFXLEVBQUUsR0FBRyxFQUFFLDBDQUEwQztZQUM1RCxVQUFVLEVBQUUsR0FBRyxFQUFFLDhCQUE4QjtZQUMvQyxhQUFhLEVBQUUsS0FBSyxDQUFDLE1BQU07WUFDM0IsaUJBQWlCLEVBQUUsWUFBbUIsQ0FBQyxpQ0FBaUM7U0FDekUsQ0FBQyxDQUFDO1FBRUgsaUJBQWlCO1FBQ2pCLElBQUksU0FBUyxDQUFDLElBQUksRUFBRSx1QkFBdUIsRUFBRTtZQUMzQyxLQUFLLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTO1lBQy9CLFdBQVcsRUFBRSwwQkFBMEI7U0FDeEMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxTQUFTLENBQUMsSUFBSSxFQUFFLCtCQUErQixFQUFFO1lBQ25ELEtBQUssRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsU0FBUztZQUN2QyxXQUFXLEVBQUUsbUNBQW1DO1NBQ2pELENBQUMsQ0FBQztRQUVILElBQUksU0FBUyxDQUFDLElBQUksRUFBRSw0QkFBNEIsRUFBRTtZQUNoRCxLQUFLLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTO1lBQ3BDLFdBQVcsRUFBRSxnQ0FBZ0M7U0FDOUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxTQUFTLENBQUMsSUFBSSxFQUFFLHVCQUF1QixFQUFFO1lBQzNDLEtBQUssRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVM7WUFDL0IsV0FBVyxFQUFFLDBCQUEwQjtTQUN4QyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0YiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFNlY3JldHNNYW5hZ2VyIENvbnN0cnVjdCAtIENESyBpbXBsZW1lbnRhdGlvbiBvZiBzZWNyZXRzIGZvciBBdXRoZW50aWtcbiAqL1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQge1xuICBhd3Nfc2VjcmV0c21hbmFnZXIgYXMgc2VjcmV0c21hbmFnZXIsXG4gIGF3c19rbXMgYXMga21zLFxuICBDZm5PdXRwdXRcbn0gZnJvbSAnYXdzLWNkay1saWInO1xuXG4vKipcbiAqIFByb3BlcnRpZXMgZm9yIHRoZSBTZWNyZXRzTWFuYWdlciBjb25zdHJ1Y3RcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBTZWNyZXRzTWFuYWdlclByb3BzIHtcbiAgLyoqXG4gICAqIEVudmlyb25tZW50IG5hbWUgKGUuZy4gJ3Byb2QnLCAnZGV2JywgZXRjLilcbiAgICovXG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEtNUyBrZXkgZm9yIGVuY3J5cHRpb25cbiAgICovXG4gIGttc0tleToga21zLklLZXk7XG59XG5cbi8qKlxuICogQ0RLIGNvbnN0cnVjdCBmb3IgbWFuYWdpbmcgQXV0aGVudGlrIHNlY3JldHNcbiAqL1xuZXhwb3J0IGNsYXNzIFNlY3JldHNNYW5hZ2VyIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgLyoqXG4gICAqIFRoZSBBdXRoZW50aWsgc2VjcmV0IGtleVxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IHNlY3JldEtleTogc2VjcmV0c21hbmFnZXIuU2VjcmV0O1xuXG4gIC8qKlxuICAgKiBUaGUgYWRtaW4gdXNlciBwYXNzd29yZCBzZWNyZXRcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBhZG1pblVzZXJQYXNzd29yZDogc2VjcmV0c21hbmFnZXIuU2VjcmV0O1xuXG4gIC8qKlxuICAgKiBUaGUgYWRtaW4gdXNlciB0b2tlbiBzZWNyZXRcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBhZG1pblVzZXJUb2tlbjogc2VjcmV0c21hbmFnZXIuU2VjcmV0O1xuXG4gIC8qKlxuICAgKiBUaGUgTERBUCB0b2tlbiBzZWNyZXRcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBsZGFwVG9rZW46IHNlY3JldHNtYW5hZ2VyLlNlY3JldDtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU2VjcmV0c01hbmFnZXJQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICAvLyBDcmVhdGUgQXV0aGVudGlrIHNlY3JldCBrZXlcbiAgICB0aGlzLnNlY3JldEtleSA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ0F1dGhlbnRpa1NlY3JldEtleScsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgJHtpZH0gQXV0aGVudGlrIFNlY3JldCBLZXlgLFxuICAgICAgc2VjcmV0TmFtZTogYCR7aWR9L2F1dGhlbnRpay1zZWNyZXQta2V5YCxcbiAgICAgIGVuY3J5cHRpb25LZXk6IHByb3BzLmttc0tleSxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIGV4Y2x1ZGVQdW5jdHVhdGlvbjogdHJ1ZSxcbiAgICAgICAgcGFzc3dvcmRMZW5ndGg6IDY0XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgYWRtaW4gdXNlciBwYXNzd29yZFxuICAgIHRoaXMuYWRtaW5Vc2VyUGFzc3dvcmQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdBdXRoZW50aWtBZG1pblVzZXJQYXNzd29yZCcsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgJHtpZH0gQXV0aGVudGlrIEFkbWluIFVzZXIgUGFzc3dvcmRgLFxuICAgICAgc2VjcmV0TmFtZTogYCR7aWR9L2F1dGhlbnRpay1hZG1pbi11c2VyLXBhc3N3b3JkYCxcbiAgICAgIGVuY3J5cHRpb25LZXk6IHByb3BzLmttc0tleSxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIHNlY3JldFN0cmluZ1RlbXBsYXRlOiBKU09OLnN0cmluZ2lmeSh7IHVzZXJuYW1lOiAnYWthZG1pbicgfSksXG4gICAgICAgIGdlbmVyYXRlU3RyaW5nS2V5OiAncGFzc3dvcmQnLFxuICAgICAgICBleGNsdWRlUHVuY3R1YXRpb246IHRydWUsXG4gICAgICAgIHBhc3N3b3JkTGVuZ3RoOiAzMlxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIGFkbWluIHVzZXIgdG9rZW5cbiAgICB0aGlzLmFkbWluVXNlclRva2VuID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnQXV0aGVudGlrQWRtaW5Vc2VyVG9rZW4nLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYCR7aWR9IEF1dGhlbnRpayBBZG1pbiBVc2VyIFRva2VuYCxcbiAgICAgIHNlY3JldE5hbWU6IGAke2lkfS9hdXRoZW50aWstYWRtaW4tdG9rZW5gLFxuICAgICAgZW5jcnlwdGlvbktleTogcHJvcHMua21zS2V5LFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgZXhjbHVkZVB1bmN0dWF0aW9uOiB0cnVlLFxuICAgICAgICBwYXNzd29yZExlbmd0aDogNjRcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBMREFQIHRva2VuIChpbml0aWFsbHkgd2l0aCBwbGFjZWhvbGRlciB2YWx1ZSlcbiAgICB0aGlzLmxkYXBUb2tlbiA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ0F1dGhlbnRpa0xEQVBUb2tlbicsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgJHtpZH0gQXV0aGVudGlrIExEQVAgT3V0cG9zdCBUb2tlbmAsXG4gICAgICBzZWNyZXROYW1lOiBgJHtpZH0vYXV0aGVudGlrLWxkYXAtdG9rZW5gLFxuICAgICAgZW5jcnlwdGlvbktleTogcHJvcHMua21zS2V5LFxuICAgICAgc2VjcmV0U3RyaW5nVmFsdWU6ICdyZXBsYWNlLW1lJyBhcyBhbnkgLy8gV2lsbCBiZSB1cGRhdGVkIG1hbnVhbGx5IGxhdGVyXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgYm9vdHN0cmFwIHNlY3JldHMgZm9yIEF1dGhlbnRpayBkZWZhdWx0IHN5c3RlbSBvYmplY3RzXG4gICAgbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnQXV0aGVudGlrQm9vdHN0cmFwQ3J5cHRvJywge1xuICAgICAgZGVzY3JpcHRpb246IGAke2lkfSBBdXRoZW50aWsgQm9vdHN0cmFwIENyeXB0byBDZXJ0aWZpY2F0ZWAsXG4gICAgICBzZWNyZXROYW1lOiBgJHtpZH0vYXV0aGVudGlrLWJvb3RzdHJhcC1jcnlwdG9gLFxuICAgICAgZW5jcnlwdGlvbktleTogcHJvcHMua21zS2V5LFxuICAgICAgc2VjcmV0U3RyaW5nVmFsdWU6ICdyZXBsYWNlLW1lJyBhcyBhbnkgLy8gV2lsbCBiZSBwb3B1bGF0ZWQgYnkgYm9vdHN0cmFwXG4gICAgfSk7XG5cbiAgICBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdBdXRoZW50aWtCb290c3RyYXBTaWduaW5nJywge1xuICAgICAgZGVzY3JpcHRpb246IGAke2lkfSBBdXRoZW50aWsgQm9vdHN0cmFwIFNpZ25pbmcgQ2VydGlmaWNhdGVgLFxuICAgICAgc2VjcmV0TmFtZTogYCR7aWR9L2F1dGhlbnRpay1ib290c3RyYXAtc2lnbmluZ2AsXG4gICAgICBlbmNyeXB0aW9uS2V5OiBwcm9wcy5rbXNLZXksXG4gICAgICBzZWNyZXRTdHJpbmdWYWx1ZTogJ3JlcGxhY2UtbWUnIGFzIGFueSAvLyBXaWxsIGJlIHBvcHVsYXRlZCBieSBib290c3RyYXBcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBvdXRwdXRzXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnQXV0aGVudGlrU2VjcmV0S2V5QXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuc2VjcmV0S2V5LnNlY3JldEFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQXV0aGVudGlrIHNlY3JldCBrZXkgQVJOJ1xuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnQXV0aGVudGlrQWRtaW5Vc2VyUGFzc3dvcmRBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5hZG1pblVzZXJQYXNzd29yZC5zZWNyZXRBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0F1dGhlbnRpayBhZG1pbiB1c2VyIHBhc3N3b3JkIEFSTidcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0F1dGhlbnRpa0FkbWluVXNlclRva2VuQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuYWRtaW5Vc2VyVG9rZW4uc2VjcmV0QXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdBdXRoZW50aWsgYWRtaW4gdXNlciB0b2tlbiBBUk4nXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdBdXRoZW50aWtMREFQVG9rZW5Bcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5sZGFwVG9rZW4uc2VjcmV0QXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdBdXRoZW50aWsgTERBUCB0b2tlbiBBUk4nXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==