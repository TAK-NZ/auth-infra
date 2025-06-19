/**
 * LDAP Token Retriever Custom Resource Construct
 *
 * This construct creates a Lambda function that automatically retrieves
 * the LDAP outpost token from Authentik and stores it in AWS Secrets Manager.
 * This is necessary because the LDAP outpost needs the token to connect to Authentik,
 * but the token can only be retrieved after Authentik is fully running.
 */
import { Construct } from 'constructs';
import { aws_lambda as lambda, CustomResource } from 'aws-cdk-lib';
import type { ContextEnvironmentConfig } from '../stack-config';
import type { InfrastructureConfig, DeploymentConfig, TokenConfig, AuthentikApplicationConfig } from '../construct-configs';
/**
 * Properties for the LDAP Token Retriever construct
 */
export interface LdapTokenRetrieverProps {
    /**
     * Environment name (e.g. 'prod', 'dev', etc.)
     */
    environment: 'prod' | 'dev-test';
    /**
     * Environment configuration
     */
    contextConfig: ContextEnvironmentConfig;
    /**
     * Infrastructure configuration (KMS key)
     */
    infrastructure: InfrastructureConfig;
    /**
     * Deployment configuration (Git SHA)
     */
    deployment: DeploymentConfig;
    /**
     * Token configuration (secrets, services, outpost name)
     */
    token: TokenConfig;
    /**
     * Application configuration (Authentik host)
     */
    application: AuthentikApplicationConfig;
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
