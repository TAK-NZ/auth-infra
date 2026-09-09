/**
 * Test suite for context override utilities
 */
import { App } from 'aws-cdk-lib';
import { applyContextOverrides } from '../../../lib/utils/context-overrides';
import { MOCK_CONFIGS } from '../../__fixtures__/mock-configs';

describe('Context Overrides', () => {
  describe('applyContextOverrides', () => {
    test('coerces string-valued numeric context overrides to numbers', () => {
      const app = new App({ context: { instanceCount: '3', serverTaskCpu: '2048' } });
      const result = applyContextOverrides(app, MOCK_CONFIGS.DEV_TEST);
      // String context values must land as real numbers, not strings.
      expect(result.database.instanceCount).toBe(3);
      expect(typeof result.database.instanceCount).toBe('number');
      expect(result.ecs.server.taskCpu).toBe(2048);
      expect(typeof result.ecs.server.taskCpu).toBe('number');
    });

    test('falls back to base config when a numeric override is non-numeric', () => {
      const app = new App({ context: { instanceCount: 'invalid' } });
      const result = applyContextOverrides(app, MOCK_CONFIGS.DEV_TEST);
      // Number('invalid') is NaN (falsy) -> must fall back to the base value.
      expect(result.database.instanceCount).toBe(MOCK_CONFIGS.DEV_TEST.database.instanceCount);
      expect(Number.isNaN(result.database.instanceCount as number)).toBe(false);
    });

    test('preserves base config values when no context override is provided', () => {
      const app = new App();
      const result = applyContextOverrides(app, MOCK_CONFIGS.DEV_TEST);
      expect(result.database.instanceClass).toBe(MOCK_CONFIGS.DEV_TEST.database.instanceClass);
      expect(result.database.instanceCount).toBe(MOCK_CONFIGS.DEV_TEST.database.instanceCount);
      expect(result.authentik.hostname).toBe(MOCK_CONFIGS.DEV_TEST.authentik.hostname);
      expect(result.general.removalPolicy).toBe(MOCK_CONFIGS.DEV_TEST.general.removalPolicy);
    });

    test('should override docker image tags', () => {
      const app = new App({ 
        context: { 
          authentikImageTag: 'authentik:custom',
          ldapImageTag: 'ldap:custom'
        } 
      });
      const result = applyContextOverrides(app, MOCK_CONFIGS.DEV_TEST);
      expect(result.docker?.authentikImageTag).toBe('authentik:custom');
      expect(result.docker?.ldapImageTag).toBe('ldap:custom');
    });

    test('should handle missing docker config in base', () => {
      const configWithoutDocker = { ...MOCK_CONFIGS.DEV_TEST };
      delete (configWithoutDocker as any).docker;
      
      const app = new App({ 
        context: { 
          authentikImageTag: 'authentik:override'
        } 
      });
      const result = applyContextOverrides(app, configWithoutDocker);
      expect(result.docker?.authentikImageTag).toBe('authentik:override');
    });
  });
});