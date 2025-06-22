export declare const DATABASE_CONSTANTS: {
    readonly PORT: 5432;
    readonly PASSWORD_LENGTH: 64;
    readonly DEFAULT_DATABASE_NAME: "authentik";
    readonly USERNAME: "authentik";
};
export declare const REDIS_CONSTANTS: {
    readonly PORT: 6379;
    readonly PASSWORD_LENGTH: 64;
    readonly ENGINE: "valkey";
    readonly ENGINE_VERSION: "7.2";
};
export declare const AUTHENTIK_CONSTANTS: {
    readonly SERVER_PORT: 9443;
    readonly LDAP_PORT: 389;
    readonly LDAPS_PORT: 636;
    readonly NLB_LDAP_PORT: 3389;
    readonly NLB_LDAPS_PORT: 6636;
};
export declare const EFS_CONSTANTS: {
    readonly PORT: 2049;
};
