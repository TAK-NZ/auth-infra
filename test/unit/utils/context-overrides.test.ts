/**
 * Test suite for context override utilities
 */
import { App } from 'aws-cdk-lib';
import { applyContextOverrides } from '../../../lib/utils/context-overrides';
import { MOCK_CONFIGS } from '../../__fixtures__/mock-configs';

describe('Context Overrides', () => {
  describe('applyContextOverrides', () => {
    test('should convert string context values to numbers', () => {
      const app = new App({ context: { numCacheNodes: '1' } });
      const result = applyContextOverrides(app, MOCK_CONFIGS.DEV_TEST);
    });

    test('should handle NaN values by falling back to base config', () => {
      const app = new App({ context: { numCacheNodes: 'invalid' } });
      const result = applyContextOverrides(app, MOCK_CONFIGS.DEV_TEST);
    });

    test('should preserve base config when no context override provided', () => {
      const app = new App();
      const result = applyContextOverrides(app, MOCK_CONFIGS.DEV_TEST);
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