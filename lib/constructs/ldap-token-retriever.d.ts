/**
 * LDAP Token Retriever Custom Resource Construct
 *
 * This construct creates a Lambda function that automatically retrieves
 * the LDAP outpost token from Authentik and stores it in AWS Secrets Manager.
 * This is necessary because the LDAP outpost needs the token to connect to Authentik,
 * but the token can only be retrieved after Authentik is fully running.
 */
import { Construct } from 'constructs';
import { aws_lambda as lambda, aws_secretsmanager as secretsmanager, aws_kms as kms, CustomResource } from 'aws-cdk-lib';
import type { AuthInfraEnvironmentConfig } from '../environment-config';
/**
 * Properties for the LDAP Token Retriever construct
 */
export interface LdapTokenRetrieverProps {
    /**
     * Environment name (e.g. 'prod', 'dev', etc.)
     */
    environment: string;
    /**
     * Environment configuration
     */
    config: AuthInfraEnvironmentConfig;
    /**
     * KMS key for encryption
     */
    kmsKey: kms.IKey;
    /**
     * Authentik host URL
     */
    authentikHost: string;
    /**
     * Name of the LDAP outpost in Authentik
     */
    outpostName?: string;
    /**
     * Admin token secret for accessing Authentik API
     */
    adminTokenSecret: secretsmanager.ISecret;
    /**
     * LDAP token secret to update
     */
    ldapTokenSecret: secretsmanager.ISecret;
    /**
     * Git SHA for versioning
     */
    gitSha: string;
}
/**
 * LDAP Token Retriever construct
 */
export declare class LdapTokenRetriever extends Construct {
    /**
     * The Lambda function that retrieves LDAP tokens
     */
    readonly lambdaFunction: lambda.Function;
    /**
     * The custom resource that triggers the Lambda
     */
    readonly customResource: CustomResource;
    constructor(scope: Construct, id: string, props: LdapTokenRetrieverProps);
}
