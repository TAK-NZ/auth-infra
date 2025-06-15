/**
 * LDAP Stack - CDK implementation for Authentik LDAP outpost
 */
import { Construct } from 'constructs';
import { Stack, StackProps } from 'aws-cdk-lib';
import { LdapParameters } from './parameters';
import { Ldap } from './constructs/ldap';
/**
 * Properties for the LDAP Stack
 */
export interface LdapStackProps extends StackProps {
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
    parameters?: Partial<LdapParameters>;
}
/**
 * CDK stack for the LDAP outpost service
 */
export declare class LdapStack extends Stack {
    /**
     * The LDAP construct
     */
    readonly ldap: Ldap;
    constructor(scope: Construct, id: string, props: LdapStackProps);
}
