/**
 * SecretsManager Construct - CDK implementation of secrets for Authentik
 */
import { Construct } from 'constructs';
import { aws_secretsmanager as secretsmanager } from 'aws-cdk-lib';
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
export declare class SecretsManager extends Construct {
    /**
     * The Authentik secret key
     */
    readonly secretKey: secretsmanager.Secret;
    /**
     * The admin password secret
     */
    readonly adminUserPassword: secretsmanager.Secret;
    /**
     * The admin API token secret
     */
    readonly adminUserToken: secretsmanager.Secret;
    /**
     * The LDAP service user secret
     */
    readonly ldapServiceUser: secretsmanager.Secret;
    /**
     * The LDAP token secret
     */
    readonly ldapToken: secretsmanager.Secret;
    constructor(scope: Construct, id: string, props: SecretsManagerProps);
}
