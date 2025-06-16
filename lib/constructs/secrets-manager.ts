/**
 * SecretsManager Construct - CDK implementation of secrets for Authentik
 */
import { Construct } from 'constructs';
import {
  aws_secretsmanager as secretsmanager,
  aws_kms as kms,
  CfnOutput,
  SecretValue
} from 'aws-cdk-lib';

/**
 * Properties for the SecretsManager construct
 */
export interface SecretsManagerProps {
  /**
   * Environment name (e.g. 'prod', 'dev', etc.)
   */
  environment: string;

  /**
   * KMS key for encryption
   */
  kmsKey: kms.IKey;
}

/**
 * CDK construct for managing Authentik secrets
 */
export class SecretsManager extends Construct {
  /**
   * The Authentik secret key
   */
  public readonly secretKey: secretsmanager.Secret;

  /**
   * The admin user password secret
   */
  public readonly adminUserPassword: secretsmanager.Secret;

  /**
   * The admin user token secret
   */
  public readonly adminUserToken: secretsmanager.Secret;

  /**
   * The LDAP token secret
   */
  public readonly ldapToken: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: SecretsManagerProps) {
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
      secretStringValue: SecretValue.unsafePlainText('replace-me') // Will be updated manually later
    });

    // Create bootstrap secrets for Authentik default system objects
    new secretsmanager.Secret(this, 'AuthentikBootstrapCrypto', {
      description: `${id} Authentik Bootstrap Crypto Certificate`,
      secretName: `${id}/authentik-bootstrap-crypto`,
      encryptionKey: props.kmsKey,
      secretStringValue: SecretValue.unsafePlainText('replace-me') // Will be populated by bootstrap
    });

    new secretsmanager.Secret(this, 'AuthentikBootstrapSigning', {
      description: `${id} Authentik Bootstrap Signing Certificate`,
      secretName: `${id}/authentik-bootstrap-signing`,
      encryptionKey: props.kmsKey,
      secretStringValue: SecretValue.unsafePlainText('replace-me') // Will be populated by bootstrap
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
