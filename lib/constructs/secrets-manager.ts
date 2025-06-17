/**
 * SecretsManager Construct - CDK implementation of secrets for Authentik
 */
import { Construct } from 'constructs';
import {
  aws_secretsmanager as secretsmanager,
  aws_kms as kms,
  SecretValue
} from 'aws-cdk-lib';

import type { InfrastructureConfig } from '../construct-configs';

/**
 * Properties for the SecretsManager construct
 */
export interface SecretsManagerProps {
  /**
   * Environment name (e.g. 'prod', 'dev', etc.)
   */
  environment: string;

  /**
   * Full stack name (e.g., 'TAK-Demo-AuthInfra')
   */
  stackName: string;

  /**
   * Infrastructure configuration (KMS key)
   */
  infrastructure: InfrastructureConfig;
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
   * The admin password secret
   */
  public readonly adminUserPassword: secretsmanager.Secret;

  /**
   * The admin API token secret
   */
  public readonly adminUserToken: secretsmanager.Secret;

  /**
   * The LDAP service user secret
   */
  public readonly ldapServiceUser: secretsmanager.Secret;

  /**
   * The LDAP token secret
   */
  public readonly ldapToken: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: SecretsManagerProps) {
    super(scope, id);

    // Create Authentik secret key
    this.secretKey = new secretsmanager.Secret(this, 'AuthentikSecretKey', {
      description: `Authentik: Secret Key`,
      secretName: `${props.stackName}/Authentik/Secret-Key`,
      encryptionKey: props.infrastructure.kmsKey,
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 64
      }
    });

    // Create admin user password
    this.adminUserPassword = new secretsmanager.Secret(this, 'AuthentikAdminUserPassword', {
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
    this.adminUserToken = new secretsmanager.Secret(this, 'AuthentikAdminUserToken', {
      description: `Authentik: Admin API Token`,
      secretName: `${props.stackName}/Authentik/Admin-API-Token`,
      encryptionKey: props.infrastructure.kmsKey,
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 64
      }
    });

    // Create LDAP service user
    this.ldapServiceUser = new secretsmanager.Secret(this, 'AuthentikLDAPServiceUser', {
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
    this.ldapToken = new secretsmanager.Secret(this, 'AuthentikLDAPToken', {
      description: `Authentik: LDAP Outpost Token`,
      secretName: `${props.stackName}/Authentik/LDAP-Token`,
      encryptionKey: props.infrastructure.kmsKey,
      secretStringValue: SecretValue.unsafePlainText('replace-me') // Will be updated manually later
    });
  }
}
