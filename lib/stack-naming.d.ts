/**
 * Utility functions for consistent stack naming across the application
 */
export interface StackNamingConfig {
    project?: string;
    environment?: string;
    component?: string;
    suffix?: string;
}
/**
 * Fixed configuration for the organization
 */
export declare const FIXED_STACK_CONFIG: {
    readonly PROJECT: "TAK";
    readonly COMPONENT: "AuthInfra";
};
/**
 * Generate a consistent stack name based on configuration
 * @param config.environment - The environment/deployment identifier (from stackName in config)
 */
export declare function generateStackName(config: StackNamingConfig): string;
/**
 * Generate consistent stack name for the Auth Infra stack
 * @param environment - Environment name (e.g. 'prod', 'dev', 'test', etc.)
 * @returns Full stack name for the auth infrastructure
 */
export declare function generateAuthInfraStackName(environment: string): string;
/**
 * Common export names for auth infrastructure resources
 */
export declare const AUTH_EXPORT_NAMES: {
    readonly DATABASE_ENDPOINT: "Database-Endpoint";
    readonly DATABASE_SECRET_ARN: "Database-Secret-ARN";
    readonly REDIS_ENDPOINT: "Redis-Endpoint";
    readonly REDIS_AUTH_TOKEN_ARN: "Redis-AuthToken-ARN";
    readonly EFS_ID: "EFS-ID";
    readonly EFS_MEDIA_ACCESS_POINT: "EFS-Media-AccessPoint";
    readonly EFS_TEMPLATES_ACCESS_POINT: "EFS-Templates-AccessPoint";
    readonly AUTHENTIK_SECRET_KEY_ARN: "Authentik-SecretKey-ARN";
    readonly AUTHENTIK_ADMIN_TOKEN_ARN: "Authentik-AdminToken-ARN";
    readonly AUTHENTIK_LDAP_TOKEN_ARN: "Authentik-LdapToken-ARN";
    readonly AUTHENTIK_ALB_DNS: "Authentik-ALB-DNS";
    readonly AUTHENTIK_URL: "Authentik-URL";
    readonly LDAP_ALB_DNS: "LDAP-ALB-DNS";
    readonly LDAP_ENDPOINT: "LDAP-Endpoint";
    readonly LDAPS_ENDPOINT: "LDAPS-Endpoint";
    readonly LDAP_TOKEN_RETRIEVER_LAMBDA_ARN: "LDAP-TokenRetriever-Lambda-ARN";
};
/**
 * Common export names for base infrastructure resources (imported)
 */
export declare const BASE_EXPORT_NAMES: {
    readonly VPC_ID: "VPC-ID";
    readonly VPC_CIDR_IPV4: "VpcIPv4CIDR";
    readonly VPC_CIDR_IPV6: "VpcIPv6CIDR";
    readonly SUBNET_PRIVATE_A: "SubnetPrivateA";
    readonly SUBNET_PRIVATE_B: "SubnetPrivateB";
    readonly SUBNET_PUBLIC_A: "SubnetPublicA";
    readonly SUBNET_PUBLIC_B: "SubnetPublicB";
    readonly ECS_CLUSTER: "Ecs-ARN";
    readonly ECR_REPO: "Ecr-ARN";
    readonly KMS_KEY: "Kms-ARN";
    readonly KMS_ALIAS: "Kms-Alias";
    readonly S3_BUCKET: "S3ConfBucket-ARN";
    readonly S3_ID: "S3-ID";
    readonly CERTIFICATE_ARN: "AcmCert-ARN";
    readonly HOSTED_ZONE_ID: "R53Zone-ID";
};
/**
 * Helper to create CloudFormation Fn::Sub expression for dynamic export names
 * The StackName parameter contains the full stack name (e.g., "TAK-devtest-AuthInfra")
 * This function creates the export name: {StackName}-{resource}
 */
export declare function createDynamicExportName(resourceType: string): string;
/**
 * Helper to create base infrastructure import value names
 * @param environment - Environment name (e.g. 'prod', 'dev', 'test', etc.)
 * @param exportName - The specific export name suffix
 * @returns Full import value reference for base infrastructure
 */
export declare function createBaseImportValue(environment: string, exportName: string): string;
/**
 * Helper to create auth infrastructure import value names
 * @param environment - Environment name (e.g. 'prod', 'dev', 'test', etc.)
 * @param exportName - The specific export name suffix
 * @returns Full import value reference for auth infrastructure
 */
export declare function createAuthImportValue(environment: string, exportName: string): string;
