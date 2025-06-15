/**
 * Main Auth Infrastructure Stack - CDK implementation
 */
import { Construct } from 'constructs';
import { Stack, StackProps } from 'aws-cdk-lib';
import { AuthInfraParameters } from './parameters';
import { Database } from './constructs/database';
import { Redis } from './constructs/redis';
import { Efs } from './constructs/efs';
import { SecretsManager } from './constructs/secrets-manager';
import { Authentik } from './constructs/authentik';
/**
 * Properties for the Auth Infrastructure Stack
 */
export interface AuthInfraStackProps extends StackProps {
    /**
     * Stack name/environment
     */
    stackName: string;
    /**
     * Environment type
     */
    envType: 'prod' | 'dev-test';
    /**
     * Optional parameters override
     */
    parameters?: Partial<AuthInfraParameters>;
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
    constructor(scope: Construct, id: string, props: AuthInfraStackProps);
}
