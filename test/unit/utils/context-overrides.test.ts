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
      expect(typeof result.redis.numCacheNodes).toBe('number');
      expect(result.redis.numCacheNodes).toBe(1);
    });

    test('should handle NaN values by falling back to base config', () => {
      const app = new App({ context: { numCacheNodes: 'invalid' } });
      const result = applyContextOverrides(app, MOCK_CONFIGS.DEV_TEST);
      expect(result.redis.numCacheNodes).toBe(MOCK_CONFIGS.DEV_TEST.redis.numCacheNodes);
    });

    test('should preserve base config when no context override provided', () => {
      const app = new App();
      const result = applyContextOverrides(app, MOCK_CONFIGS.DEV_TEST);
      expect(result.redis.numCacheNodes).toBe(MOCK_CONFIGS.DEV_TEST.redis.numCacheNodes);
    });
  });
});