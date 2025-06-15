/**
 * Fixed configuration values for stack naming
 */
export declare const FIXED_STACK_CONFIG: {
    readonly PROJECT: "tak";
    readonly AUTH_STACK_PREFIX: "auth-infra";
    readonly LDAP_STACK_PREFIX: "ldap";
};
/**
 * Generate consistent stack name for the Auth Infra stack
 * @param environment - Environment name (e.g. 'prod', 'dev', 'test', etc.)
 * @returns Full stack name for the auth infrastructure
 */
export declare function generateAuthInfraStackName(environment: string): string;
/**
 * Generate consistent stack name for the LDAP stack
 * @param environment - Environment name (e.g. 'prod', 'dev', 'test', etc.)
 * @returns Full stack name for the LDAP stack
 */
export declare function generateLdapStackName(environment: string): string;
/**
 * Helper to generate consistent import value names from the base infrastructure stack
 * @param environment - Environment name (e.g. 'prod', 'dev', 'test', etc.)
 * @param exportName - The specific export name suffix (e.g. 'vpc-id', 'subnet-private-a', etc.)
 * @returns Full import value reference string
 */
export declare function importBaseInfraValue(environment: string, exportName: string): string;
/**
 * Helper to generate consistent export value names for the auth infrastructure stack
 * @param environment - Environment name (e.g. 'prod', 'dev', 'test', etc.)
 * @param exportName - The specific export name suffix
 * @returns Full export value name
 */
export declare function generateAuthInfraExportName(environment: string, exportName: string): string;
/**
 * Helper to generate consistent export value names for the LDAP stack
 * @param environment - Environment name (e.g. 'prod', 'dev', 'test', etc.)
 * @param exportName - The specific export name suffix
 * @returns Full export value name
 */
export declare function generateLdapExportName(environment: string, exportName: string): string;
