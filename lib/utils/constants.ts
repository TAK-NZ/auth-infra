export const DATABASE_CONSTANTS = {
  PORT: 5432,
  PASSWORD_LENGTH: 64,
  DEFAULT_DATABASE_NAME: 'authentik',
  USERNAME: 'authentik'
} as const;

export const REDIS_CONSTANTS = {
  PORT: 6379,
  PASSWORD_LENGTH: 64,
  ENGINE: 'valkey',
  ENGINE_VERSION: '7.2'
} as const;

export const AUTHENTIK_CONSTANTS = {
  SERVER_PORT: 9443,
  LDAP_PORT: 389,
  LDAPS_PORT: 636,
  NLB_LDAP_PORT: 3389,
  NLB_LDAPS_PORT: 6636
} as const;

export const EFS_CONSTANTS = {
  PORT: 2049
} as const;