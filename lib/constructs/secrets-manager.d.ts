/**
 * SecretsManager Construct - CDK implementation of secrets for Authentik
 */
import { Construct } from 'constructs';
import { aws_secretsmanager as secretsmanager, aws_kms as kms } from 'aws-cdk-lib';
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
export declare class SecretsManager extends Construct {
    /**
     * The Authentik secret key
     */
    readonly secretKey: secretsmanager.Secret;
    /**
     * The admin user password secret
     */
    readonly adminUserPassword: secretsmanager.Secret;
    /**
     * The admin user token secret
     */
    readonly adminUserToken: secretsmanager.Secret;
    /**
     * The LDAP token secret
     */
    readonly ldapToken: secretsmanager.Secret;
    constructor(scope: Construct, id: string, props: SecretsManagerProps);
}
