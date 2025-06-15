/**
 * Main Auth Infrastructure Stack - CDK implementation
 */
import { Construct } from 'constructs';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Database } from './constructs/database';
import { Redis } from './constructs/redis';
import { Efs } from './constructs/efs';
import { SecretsManager } from './constructs/secrets-manager';
import { Authentik } from './constructs/authentik';
import { Ldap } from './constructs/ldap';
import { LdapTokenRetriever } from './constructs/ldap-token-retriever';
/**
 * Properties for the Auth Infrastructure Stack
 */
export interface AuthInfraStackProps extends StackProps {
    /**
     * Environment type
     */
    envType?: 'prod' | 'dev-test';
}
/**
 * Main CDK stack for the Auth Infrastructure
 */
export declare class AuthInfraStack extends Stack {
    /**
     * The database construct
     */
    readonly database: Database;
    /**
     * The Redis construct
     */
    readonly redis: Redis;
    /**
     * The EFS construct
     */
    readonly efs: Efs;
    /**
     * The secrets manager construct
     */
    readonly secretsManager: SecretsManager;
    /**
     * The Authentik construct
     */
    readonly authentik: Authentik;
    /**
     * The LDAP construct
     */
    readonly ldap: Ldap;
    /**
     * The LDAP token retriever construct
     */
    readonly ldapTokenRetriever: LdapTokenRetriever;
    constructor(scope: Construct, id: string, props: AuthInfraStackProps);
}
