describe('Configuration Files', () => {
  let cdkJson: any;

  beforeAll(() => {
    cdkJson = require('../../cdk.json');
  });

  describe('CDK Configuration Structure', () => {
    it('validates cdk.json syntax', () => {
      expect(() => require('../../cdk.json')).not.toThrow();
    });

    it('validates required context sections exist', () => {
      expect(cdkJson.context['dev-test']).toBeDefined();
      expect(cdkJson.context['prod']).toBeDefined();
      expect(cdkJson.context['tak-defaults']).toBeDefined();
    });

    it('validates tak-defaults structure', () => {
      const defaults = cdkJson.context['tak-defaults'];
      expect(defaults).toBeDefined();
      expect(typeof defaults).toBe('object');
    });
  });

  describe('Environment Configuration Validation', () => {
    it('validates required configuration properties', () => {
      // Validate dev-test environment
      const devTest = cdkJson.context['dev-test'];
      expect(devTest.stackName).toBeDefined();
      expect(devTest.database).toBeDefined();
      expect(devTest.redis).toBeDefined();
      expect(devTest.ecs).toBeDefined();
      expect(devTest.authentik).toBeDefined();
      expect(devTest.ecr).toBeDefined();
      expect(devTest.general).toBeDefined();

      // Validate prod environment
      const prod = cdkJson.context['prod'];
      expect(prod.stackName).toBeDefined();
      expect(prod.database).toBeDefined();
      expect(prod.redis).toBeDefined();
      expect(prod.ecs).toBeDefined();
      expect(prod.authentik).toBeDefined();
      expect(prod.ecr).toBeDefined();
      expect(prod.general).toBeDefined();
    });

    it('validates string properties are non-empty', () => {
      ['dev-test', 'prod'].forEach(env => {
        const config = cdkJson.context[env];
        expect(config.stackName.trim()).not.toBe('');
        expect(config.authentik.hostname.trim()).not.toBe('');
        expect(config.authentik.adminUserEmail.trim()).not.toBe('');
        expect(config.authentik.ldapHostname.trim()).not.toBe('');
        expect(config.authentik.branding.trim()).not.toBe('');
        expect(config.authentik.authentikVersion.trim()).not.toBe('');
      });
    });

    it('validates numeric properties are positive', () => {
      ['dev-test', 'prod'].forEach(env => {
        const config = cdkJson.context[env];
        expect(config.database.instanceCount).toBeGreaterThan(0);
        expect(config.database.allocatedStorage).toBeGreaterThan(0);
        expect(config.database.backupRetentionDays).toBeGreaterThanOrEqual(0);
        expect(config.redis.numCacheNodes).toBeGreaterThan(0);
        expect(config.ecs.taskCpu).toBeGreaterThan(0);
        expect(config.ecs.taskMemory).toBeGreaterThan(0);
        expect(config.ecs.desiredCount).toBeGreaterThan(0);
        expect(config.ecr.imageRetentionCount).toBeGreaterThan(0);
      });
    });
  });

  describe('ECR Configuration', () => {
    it('validates ECR configuration exists', () => {
      // Dev-test ECR config
      expect(cdkJson.context['dev-test'].ecr.imageRetentionCount).toBe(5);
      expect(cdkJson.context['dev-test'].ecr.scanOnPush).toBe(false);
      
      // Prod ECR config
      expect(cdkJson.context['prod'].ecr.imageRetentionCount).toBe(20);
      expect(cdkJson.context['prod'].ecr.scanOnPush).toBe(true);
    });

    it('validates prod has stricter settings than dev-test', () => {
      const devTest = cdkJson.context['dev-test'];
      const prod = cdkJson.context['prod'];
      
      expect(prod.ecr.imageRetentionCount).toBeGreaterThan(devTest.ecr.imageRetentionCount);
      expect(prod.ecr.scanOnPush).toBe(true);
      expect(prod.database.backupRetentionDays).toBeGreaterThan(devTest.database.backupRetentionDays);
    });
  });

  describe('Authentik Configuration', () => {
    it('validates authentik configuration', () => {
      ['dev-test', 'prod'].forEach(env => {
        const config = cdkJson.context[env];
        expect(config.authentik.hostname).toBeDefined();
        expect(config.authentik.adminUserEmail).toBeDefined();
        expect(config.authentik.ldapHostname).toBeDefined();
        expect(config.authentik.branding).toBeDefined();
        expect(config.authentik.authentikVersion).toBeDefined();
      });
    });

    it('validates email format', () => {
      ['dev-test', 'prod'].forEach(env => {
        const config = cdkJson.context[env];
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        expect(emailRegex.test(config.authentik.adminUserEmail)).toBe(true);
      });
    });

    it('validates LDAP base DN format', () => {
      ['dev-test', 'prod'].forEach(env => {
        const config = cdkJson.context[env];
        if (config.authentik.ldapBaseDn) {
          expect(config.authentik.ldapBaseDn).toMatch(/^(DC|dc)=/i);
        }
      });
    });
  });
});