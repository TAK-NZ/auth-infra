import cf from '@openaddresses/cloudfriend';

export default {
    Resources: {
        AuthentikSecretKey: {
            Type: 'AWS::SecretsManager::Secret',
            Properties: {
                Description: cf.join([cf.stackName, ' Authentik Secret Key']),
                GenerateSecretString: {
                    ExcludePunctuation: true,
                    PasswordLength: 64
                },
                Name: cf.join([cf.stackName, '/authentik-secret-key']),
                KmsKeyId: cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-kms']))
            }
        },
        AuthentikAdminUserPassword: {
            Type: 'AWS::SecretsManager::Secret',
            Properties: {
                Description: cf.join([cf.stackName, ' Authentik Admin User Password']),
                GenerateSecretString: {
                    SecretStringTemplate: '{"username": "akadmin"}',
                    GenerateStringKey: 'password',
                    ExcludePunctuation: true,
                    PasswordLength: 32
                },
                Name: cf.join([cf.stackName, '/authentik-admin-user-password']),
                KmsKeyId: cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-kms']))
            }
        },
        AuthentikAdminUserToken: {
            Type: 'AWS::SecretsManager::Secret',
            Properties: {
                Description: cf.join([cf.stackName, ' Authentik Admin User Token']),
                GenerateSecretString: {
                    ExcludePunctuation: true,
                    PasswordLength: 64
                },
                Name: cf.join([cf.stackName, '/authentik-admin-token']),
                KmsKeyId: cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-kms']))
            }
        },
        AuthentikLDAPToken: {
            Type: 'AWS::SecretsManager::Secret',
            Properties: {
                Description: cf.join([cf.stackName, ' Authentik LDAP Outpost Token']),
                'SecretString': 'replace-me',
                Name: cf.join([cf.stackName, '/authentik-ldap-token']),
                KmsKeyId: cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-kms']))
            }
        },
        LDAPServiceUserPassword: {
            Type: 'AWS::SecretsManager::Secret',
            Properties: {
                Description: cf.join([cf.stackName, ' LDAP Service Account Password']),
                GenerateSecretString: {
                    SecretStringTemplate: '{"username": "ldapservice"}',
                    GenerateStringKey: 'password',
                    ExcludePunctuation: true,
                    PasswordLength: 32
                },
                Name: cf.join([cf.stackName, '/ldapservice']),
                KmsKeyId: cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-kms']))
            }
        }
    },
    Outputs: {
        LdapServiceUserArn: {
            Description: 'LDAP Service User ARN',
            Export: {
                Name: cf.join([cf.stackName, '-ldapservice-user-arn'])
            },
            Value: cf.ref('LDAPServiceUserPassword')
        },
        LdapOutpostTokenArn: {
            Description: 'Authentik LDAP Outpost Token ARN',
            Export: {
                Name: cf.join([cf.stackName, '-authentik-ldap-token-arn'])
            },
            Value: cf.ref('AuthentikLDAPToken')
        },
        LDAPServiceUser: {
            Description: 'LDAP Service User',
            Export: {
                Name: cf.join([cf.stackName, '-ldapservice-user'])
            },
            Value: cf.ref('LDAPServiceUserPassword')
        }
    }
};
