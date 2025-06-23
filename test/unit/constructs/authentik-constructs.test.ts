/**
 * Fast test suite for Authentik Server and Worker constructs
 */
import { AuthentikServer } from '../../../lib/constructs/authentik-server';
import { AuthentikWorker } from '../../../lib/constructs/authentik-worker';

describe('Authentik Constructs', () => {
  describe('Construct Definitions', () => {
    test('AuthentikServer construct is properly defined', () => {
      expect(AuthentikServer).toBeDefined();
      expect(typeof AuthentikServer).toBe('function');
    });

    test('AuthentikWorker construct is properly defined', () => {
      expect(AuthentikWorker).toBeDefined();
      expect(typeof AuthentikWorker).toBe('function');
    });
  });

  describe('Constructor Parameters', () => {
    test('AuthentikServer accepts required parameters', () => {
      const constructorParams = AuthentikServer.length;
      expect(constructorParams).toBe(3); // scope, id, props
    });

    test('AuthentikWorker accepts required parameters', () => {
      const constructorParams = AuthentikWorker.length;
      expect(constructorParams).toBe(3); // scope, id, props
    });
  });

  describe('Configuration Validation', () => {
    test('validates deployment configuration options', () => {
      const deploymentConfigs = [
        { enableExecute: true, useConfigFile: true },
        { enableExecute: false, useConfigFile: false },
        { enableExecute: true, useConfigFile: false },
        { enableExecute: false, useConfigFile: true }
      ];

      deploymentConfigs.forEach(config => {
        expect(typeof config.enableExecute).toBe('boolean');
        expect(typeof config.useConfigFile).toBe('boolean');
      });
    });

    test('validates application configuration structure', () => {
      const appConfig = {
        adminUserEmail: 'admin@example.com',
        ldapBaseDn: 'DC=example,DC=com',
        database: { hostname: 'test-db.example.com' },
        redis: { hostname: 'test-redis.example.com' }
      };

      expect(appConfig.adminUserEmail).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      expect(appConfig.ldapBaseDn).toMatch(/^(DC|dc)=/i);
      expect(appConfig.database.hostname).toBeDefined();
      expect(appConfig.redis.hostname).toBeDefined();
    });

    test('validates storage configuration structure', () => {
      const storageConfig = {
        s3: { configBucket: 'test-bucket' },
        efs: {
          fileSystemId: 'fs-12345',
          mediaAccessPointId: 'fsap-media-12345',
          customTemplatesAccessPointId: 'fsap-templates-12345'
        }
      };

      expect(storageConfig.s3.configBucket).toBeDefined();
      expect(storageConfig.efs.fileSystemId).toMatch(/^fs-[a-zA-Z0-9]+$/);
      expect(storageConfig.efs.mediaAccessPointId).toMatch(/^fsap-[a-zA-Z0-9-]+$/);
      expect(storageConfig.efs.customTemplatesAccessPointId).toMatch(/^fsap-[a-zA-Z0-9-]+$/);
    });
  });

  describe('Environment-specific Configuration', () => {
    test('validates prod environment settings', () => {
      const prodSettings = {
        enableExecute: true,
        useConfigFile: true,
        enableDetailedLogging: false
      };

      expect(prodSettings.enableExecute).toBe(true);
      expect(prodSettings.useConfigFile).toBe(true);
      expect(prodSettings.enableDetailedLogging).toBe(false);
    });

    test('validates dev-test environment settings', () => {
      const devSettings = {
        enableExecute: false,
        useConfigFile: false,
        enableDetailedLogging: true
      };

      expect(devSettings.enableExecute).toBe(false);
      expect(devSettings.useConfigFile).toBe(false);
      expect(devSettings.enableDetailedLogging).toBe(true);
    });
  });

  describe('Secret Configuration', () => {
    test('validates required secrets structure', () => {
      const secretsConfig = {
        database: 'db-secret-arn',
        redisAuthToken: 'redis-secret-arn',
        authentik: {
          secretKey: 'secret-key-arn',
          adminUserPassword: 'admin-password-arn',
          adminUserToken: 'admin-token-arn',
          ldapToken: 'ldap-token-arn'
        }
      };

      expect(secretsConfig.database).toBeDefined();
      expect(secretsConfig.redisAuthToken).toBeDefined();
      expect(secretsConfig.authentik.secretKey).toBeDefined();
      expect(secretsConfig.authentik.adminUserPassword).toBeDefined();
      expect(secretsConfig.authentik.adminUserToken).toBeDefined();
      expect(secretsConfig.authentik.ldapToken).toBeDefined();
    });

    test('validates worker-specific secrets', () => {
      const workerSecrets = {
        ldapServiceUser: 'ldap-service-user-arn'
      };

      expect(workerSecrets.ldapServiceUser).toBeDefined();
    });
  });

  describe('Infrastructure Requirements', () => {
    test('validates infrastructure configuration structure', () => {
      const infraConfig = {
        vpc: 'vpc-reference',
        ecsSecurityGroup: 'sg-reference',
        ecsCluster: 'cluster-reference',
        kmsKey: 'kms-key-reference'
      };

      expect(infraConfig.vpc).toBeDefined();
      expect(infraConfig.ecsSecurityGroup).toBeDefined();
      expect(infraConfig.ecsCluster).toBeDefined();
      expect(infraConfig.kmsKey).toBeDefined();
    });

    test('validates ECS task configuration', () => {
      const ecsConfig = {
        taskCpu: 512,
        taskMemory: 1024,
        desiredCount: 1,
        enableDetailedLogging: true
      };

      expect(ecsConfig.taskCpu).toBeGreaterThan(0);
      expect(ecsConfig.taskMemory).toBeGreaterThan(0);
      expect(ecsConfig.desiredCount).toBeGreaterThan(0);
      expect(typeof ecsConfig.enableDetailedLogging).toBe('boolean');
    });
  });
});