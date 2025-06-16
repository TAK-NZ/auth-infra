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
            description: `${id} Authentik Secret Key`,
            secretName: `${id}/authentik-secret-key`,
            encryptionKey: props.kmsKey,
            generateSecretString: {
                excludePunctuation: true,
                passwordLength: 64
            }
        });
        // Create admin user password
        this.adminUserPassword = new aws_cdk_lib_1.aws_secretsmanager.Secret(this, 'AuthentikAdminUserPassword', {
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
        this.adminUserToken = new aws_cdk_lib_1.aws_secretsmanager.Secret(this, 'AuthentikAdminUserToken', {
            description: `${id} Authentik Admin User Token`,
            secretName: `${id}/authentik-admin-token`,
            encryptionKey: props.kmsKey,
            generateSecretString: {
                excludePunctuation: true,
                passwordLength: 64
            }
        });
        // Create LDAP token (initially with placeholder value)
        this.ldapToken = new aws_cdk_lib_1.aws_secretsmanager.Secret(this, 'AuthentikLDAPToken', {
            description: `${id} Authentik LDAP Outpost Token`,
            secretName: `${id}/authentik-ldap-token`,
            encryptionKey: props.kmsKey,
            secretStringValue: aws_cdk_lib_1.SecretValue.unsafePlainText('replace-me') // Will be updated manually later
        });
        // Create bootstrap secrets for Authentik default system objects
        new aws_cdk_lib_1.aws_secretsmanager.Secret(this, 'AuthentikBootstrapCrypto', {
            description: `${id} Authentik Bootstrap Crypto Certificate`,
            secretName: `${id}/authentik-bootstrap-crypto`,
            encryptionKey: props.kmsKey,
            secretStringValue: aws_cdk_lib_1.SecretValue.unsafePlainText('replace-me') // Will be populated by bootstrap
        });
        new aws_cdk_lib_1.aws_secretsmanager.Secret(this, 'AuthentikBootstrapSigning', {
            description: `${id} Authentik Bootstrap Signing Certificate`,
            secretName: `${id}/authentik-bootstrap-signing`,
            encryptionKey: props.kmsKey,
            secretStringValue: aws_cdk_lib_1.SecretValue.unsafePlainText('replace-me') // Will be populated by bootstrap
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjcmV0cy1tYW5hZ2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic2VjcmV0cy1tYW5hZ2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOztHQUVHO0FBQ0gsMkNBQXVDO0FBQ3ZDLDZDQUtxQjtBQWlCckI7O0dBRUc7QUFDSCxNQUFhLGNBQWUsU0FBUSxzQkFBUztJQXFCM0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEwQjtRQUNsRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLDhCQUE4QjtRQUM5QixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksZ0NBQWMsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQ3JFLFdBQVcsRUFBRSxHQUFHLEVBQUUsdUJBQXVCO1lBQ3pDLFVBQVUsRUFBRSxHQUFHLEVBQUUsdUJBQXVCO1lBQ3hDLGFBQWEsRUFBRSxLQUFLLENBQUMsTUFBTTtZQUMzQixvQkFBb0IsRUFBRTtnQkFDcEIsa0JBQWtCLEVBQUUsSUFBSTtnQkFDeEIsY0FBYyxFQUFFLEVBQUU7YUFDbkI7U0FDRixDQUFDLENBQUM7UUFFSCw2QkFBNkI7UUFDN0IsSUFBSSxDQUFDLGlCQUFpQixHQUFHLElBQUksZ0NBQWMsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLDRCQUE0QixFQUFFO1lBQ3JGLFdBQVcsRUFBRSxHQUFHLEVBQUUsZ0NBQWdDO1lBQ2xELFVBQVUsRUFBRSxHQUFHLEVBQUUsZ0NBQWdDO1lBQ2pELGFBQWEsRUFBRSxLQUFLLENBQUMsTUFBTTtZQUMzQixvQkFBb0IsRUFBRTtnQkFDcEIsb0JBQW9CLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsQ0FBQztnQkFDN0QsaUJBQWlCLEVBQUUsVUFBVTtnQkFDN0Isa0JBQWtCLEVBQUUsSUFBSTtnQkFDeEIsY0FBYyxFQUFFLEVBQUU7YUFDbkI7U0FDRixDQUFDLENBQUM7UUFFSCwwQkFBMEI7UUFDMUIsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLGdDQUFjLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSx5QkFBeUIsRUFBRTtZQUMvRSxXQUFXLEVBQUUsR0FBRyxFQUFFLDZCQUE2QjtZQUMvQyxVQUFVLEVBQUUsR0FBRyxFQUFFLHdCQUF3QjtZQUN6QyxhQUFhLEVBQUUsS0FBSyxDQUFDLE1BQU07WUFDM0Isb0JBQW9CLEVBQUU7Z0JBQ3BCLGtCQUFrQixFQUFFLElBQUk7Z0JBQ3hCLGNBQWMsRUFBRSxFQUFFO2FBQ25CO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsdURBQXVEO1FBQ3ZELElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLEVBQUU7WUFDckUsV0FBVyxFQUFFLEdBQUcsRUFBRSwrQkFBK0I7WUFDakQsVUFBVSxFQUFFLEdBQUcsRUFBRSx1QkFBdUI7WUFDeEMsYUFBYSxFQUFFLEtBQUssQ0FBQyxNQUFNO1lBQzNCLGlCQUFpQixFQUFFLHlCQUFXLENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQyxDQUFDLGlDQUFpQztTQUMvRixDQUFDLENBQUM7UUFFSCxnRUFBZ0U7UUFDaEUsSUFBSSxnQ0FBYyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsMEJBQTBCLEVBQUU7WUFDMUQsV0FBVyxFQUFFLEdBQUcsRUFBRSx5Q0FBeUM7WUFDM0QsVUFBVSxFQUFFLEdBQUcsRUFBRSw2QkFBNkI7WUFDOUMsYUFBYSxFQUFFLEtBQUssQ0FBQyxNQUFNO1lBQzNCLGlCQUFpQixFQUFFLHlCQUFXLENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQyxDQUFDLGlDQUFpQztTQUMvRixDQUFDLENBQUM7UUFFSCxJQUFJLGdDQUFjLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSwyQkFBMkIsRUFBRTtZQUMzRCxXQUFXLEVBQUUsR0FBRyxFQUFFLDBDQUEwQztZQUM1RCxVQUFVLEVBQUUsR0FBRyxFQUFFLDhCQUE4QjtZQUMvQyxhQUFhLEVBQUUsS0FBSyxDQUFDLE1BQU07WUFDM0IsaUJBQWlCLEVBQUUseUJBQVcsQ0FBQyxlQUFlLENBQUMsWUFBWSxDQUFDLENBQUMsaUNBQWlDO1NBQy9GLENBQUMsQ0FBQztRQUVILGlCQUFpQjtRQUNqQixJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLHVCQUF1QixFQUFFO1lBQzNDLEtBQUssRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVM7WUFDL0IsV0FBVyxFQUFFLDBCQUEwQjtTQUN4QyxDQUFDLENBQUM7UUFFSCxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLCtCQUErQixFQUFFO1lBQ25ELEtBQUssRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsU0FBUztZQUN2QyxXQUFXLEVBQUUsbUNBQW1DO1NBQ2pELENBQUMsQ0FBQztRQUVILElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsNEJBQTRCLEVBQUU7WUFDaEQsS0FBSyxFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsU0FBUztZQUNwQyxXQUFXLEVBQUUsZ0NBQWdDO1NBQzlDLENBQUMsQ0FBQztRQUVILElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsdUJBQXVCLEVBQUU7WUFDM0MsS0FBSyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUztZQUMvQixXQUFXLEVBQUUsMEJBQTBCO1NBQ3hDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXZHRCx3Q0F1R0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFNlY3JldHNNYW5hZ2VyIENvbnN0cnVjdCAtIENESyBpbXBsZW1lbnRhdGlvbiBvZiBzZWNyZXRzIGZvciBBdXRoZW50aWtcbiAqL1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQge1xuICBhd3Nfc2VjcmV0c21hbmFnZXIgYXMgc2VjcmV0c21hbmFnZXIsXG4gIGF3c19rbXMgYXMga21zLFxuICBDZm5PdXRwdXQsXG4gIFNlY3JldFZhbHVlXG59IGZyb20gJ2F3cy1jZGstbGliJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciB0aGUgU2VjcmV0c01hbmFnZXIgY29uc3RydWN0XG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2VjcmV0c01hbmFnZXJQcm9wcyB7XG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBuYW1lIChlLmcuICdwcm9kJywgJ2RldicsIGV0Yy4pXG4gICAqL1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBLTVMga2V5IGZvciBlbmNyeXB0aW9uXG4gICAqL1xuICBrbXNLZXk6IGttcy5JS2V5O1xufVxuXG4vKipcbiAqIENESyBjb25zdHJ1Y3QgZm9yIG1hbmFnaW5nIEF1dGhlbnRpayBzZWNyZXRzXG4gKi9cbmV4cG9ydCBjbGFzcyBTZWNyZXRzTWFuYWdlciBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBUaGUgQXV0aGVudGlrIHNlY3JldCBrZXlcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBzZWNyZXRLZXk6IHNlY3JldHNtYW5hZ2VyLlNlY3JldDtcblxuICAvKipcbiAgICogVGhlIGFkbWluIHVzZXIgcGFzc3dvcmQgc2VjcmV0XG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgYWRtaW5Vc2VyUGFzc3dvcmQ6IHNlY3JldHNtYW5hZ2VyLlNlY3JldDtcblxuICAvKipcbiAgICogVGhlIGFkbWluIHVzZXIgdG9rZW4gc2VjcmV0XG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgYWRtaW5Vc2VyVG9rZW46IHNlY3JldHNtYW5hZ2VyLlNlY3JldDtcblxuICAvKipcbiAgICogVGhlIExEQVAgdG9rZW4gc2VjcmV0XG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgbGRhcFRva2VuOiBzZWNyZXRzbWFuYWdlci5TZWNyZXQ7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFNlY3JldHNNYW5hZ2VyUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gQ3JlYXRlIEF1dGhlbnRpayBzZWNyZXQga2V5XG4gICAgdGhpcy5zZWNyZXRLZXkgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdBdXRoZW50aWtTZWNyZXRLZXknLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYCR7aWR9IEF1dGhlbnRpayBTZWNyZXQgS2V5YCxcbiAgICAgIHNlY3JldE5hbWU6IGAke2lkfS9hdXRoZW50aWstc2VjcmV0LWtleWAsXG4gICAgICBlbmNyeXB0aW9uS2V5OiBwcm9wcy5rbXNLZXksXG4gICAgICBnZW5lcmF0ZVNlY3JldFN0cmluZzoge1xuICAgICAgICBleGNsdWRlUHVuY3R1YXRpb246IHRydWUsXG4gICAgICAgIHBhc3N3b3JkTGVuZ3RoOiA2NFxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIGFkbWluIHVzZXIgcGFzc3dvcmRcbiAgICB0aGlzLmFkbWluVXNlclBhc3N3b3JkID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnQXV0aGVudGlrQWRtaW5Vc2VyUGFzc3dvcmQnLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYCR7aWR9IEF1dGhlbnRpayBBZG1pbiBVc2VyIFBhc3N3b3JkYCxcbiAgICAgIHNlY3JldE5hbWU6IGAke2lkfS9hdXRoZW50aWstYWRtaW4tdXNlci1wYXNzd29yZGAsXG4gICAgICBlbmNyeXB0aW9uS2V5OiBwcm9wcy5rbXNLZXksXG4gICAgICBnZW5lcmF0ZVNlY3JldFN0cmluZzoge1xuICAgICAgICBzZWNyZXRTdHJpbmdUZW1wbGF0ZTogSlNPTi5zdHJpbmdpZnkoeyB1c2VybmFtZTogJ2FrYWRtaW4nIH0pLFxuICAgICAgICBnZW5lcmF0ZVN0cmluZ0tleTogJ3Bhc3N3b3JkJyxcbiAgICAgICAgZXhjbHVkZVB1bmN0dWF0aW9uOiB0cnVlLFxuICAgICAgICBwYXNzd29yZExlbmd0aDogMzJcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBhZG1pbiB1c2VyIHRva2VuXG4gICAgdGhpcy5hZG1pblVzZXJUb2tlbiA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ0F1dGhlbnRpa0FkbWluVXNlclRva2VuJywge1xuICAgICAgZGVzY3JpcHRpb246IGAke2lkfSBBdXRoZW50aWsgQWRtaW4gVXNlciBUb2tlbmAsXG4gICAgICBzZWNyZXROYW1lOiBgJHtpZH0vYXV0aGVudGlrLWFkbWluLXRva2VuYCxcbiAgICAgIGVuY3J5cHRpb25LZXk6IHByb3BzLmttc0tleSxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIGV4Y2x1ZGVQdW5jdHVhdGlvbjogdHJ1ZSxcbiAgICAgICAgcGFzc3dvcmRMZW5ndGg6IDY0XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgTERBUCB0b2tlbiAoaW5pdGlhbGx5IHdpdGggcGxhY2Vob2xkZXIgdmFsdWUpXG4gICAgdGhpcy5sZGFwVG9rZW4gPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdBdXRoZW50aWtMREFQVG9rZW4nLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYCR7aWR9IEF1dGhlbnRpayBMREFQIE91dHBvc3QgVG9rZW5gLFxuICAgICAgc2VjcmV0TmFtZTogYCR7aWR9L2F1dGhlbnRpay1sZGFwLXRva2VuYCxcbiAgICAgIGVuY3J5cHRpb25LZXk6IHByb3BzLmttc0tleSxcbiAgICAgIHNlY3JldFN0cmluZ1ZhbHVlOiBTZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoJ3JlcGxhY2UtbWUnKSAvLyBXaWxsIGJlIHVwZGF0ZWQgbWFudWFsbHkgbGF0ZXJcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBib290c3RyYXAgc2VjcmV0cyBmb3IgQXV0aGVudGlrIGRlZmF1bHQgc3lzdGVtIG9iamVjdHNcbiAgICBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdBdXRoZW50aWtCb290c3RyYXBDcnlwdG8nLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYCR7aWR9IEF1dGhlbnRpayBCb290c3RyYXAgQ3J5cHRvIENlcnRpZmljYXRlYCxcbiAgICAgIHNlY3JldE5hbWU6IGAke2lkfS9hdXRoZW50aWstYm9vdHN0cmFwLWNyeXB0b2AsXG4gICAgICBlbmNyeXB0aW9uS2V5OiBwcm9wcy5rbXNLZXksXG4gICAgICBzZWNyZXRTdHJpbmdWYWx1ZTogU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KCdyZXBsYWNlLW1lJykgLy8gV2lsbCBiZSBwb3B1bGF0ZWQgYnkgYm9vdHN0cmFwXG4gICAgfSk7XG5cbiAgICBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdBdXRoZW50aWtCb290c3RyYXBTaWduaW5nJywge1xuICAgICAgZGVzY3JpcHRpb246IGAke2lkfSBBdXRoZW50aWsgQm9vdHN0cmFwIFNpZ25pbmcgQ2VydGlmaWNhdGVgLFxuICAgICAgc2VjcmV0TmFtZTogYCR7aWR9L2F1dGhlbnRpay1ib290c3RyYXAtc2lnbmluZ2AsXG4gICAgICBlbmNyeXB0aW9uS2V5OiBwcm9wcy5rbXNLZXksXG4gICAgICBzZWNyZXRTdHJpbmdWYWx1ZTogU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KCdyZXBsYWNlLW1lJykgLy8gV2lsbCBiZSBwb3B1bGF0ZWQgYnkgYm9vdHN0cmFwXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgb3V0cHV0c1xuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0F1dGhlbnRpa1NlY3JldEtleUFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnNlY3JldEtleS5zZWNyZXRBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0F1dGhlbnRpayBzZWNyZXQga2V5IEFSTidcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0F1dGhlbnRpa0FkbWluVXNlclBhc3N3b3JkQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuYWRtaW5Vc2VyUGFzc3dvcmQuc2VjcmV0QXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdBdXRoZW50aWsgYWRtaW4gdXNlciBwYXNzd29yZCBBUk4nXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdBdXRoZW50aWtBZG1pblVzZXJUb2tlbkFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmFkbWluVXNlclRva2VuLnNlY3JldEFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQXV0aGVudGlrIGFkbWluIHVzZXIgdG9rZW4gQVJOJ1xuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnQXV0aGVudGlrTERBUFRva2VuQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMubGRhcFRva2VuLnNlY3JldEFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQXV0aGVudGlrIExEQVAgdG9rZW4gQVJOJ1xuICAgIH0pO1xuICB9XG59XG4iXX0=