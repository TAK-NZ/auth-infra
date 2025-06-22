/**
 * Test suite for edge cases in utility functions
 */
import { getGitSha } from '../../../lib/utils';

describe('Utility Functions - Edge Cases', () => {
  describe('getGitSha edge cases', () => {
    test('should handle git command failure gracefully', () => {
      const originalExecSync = require('child_process').execSync;
      
      // Mock execSync to throw an error
      require('child_process').execSync = jest.fn(() => {
        throw new Error('Not a git repository');
      });

      const gitSha = getGitSha();
      expect(typeof gitSha).toBe('string');
      expect(gitSha.length).toBeGreaterThan(0);

      // Restore original function
      require('child_process').execSync = originalExecSync;
    });

    test('should return fallback when git output is empty', () => {
      const originalExecSync = require('child_process').execSync;
      
      // Mock execSync to return empty string
      require('child_process').execSync = jest.fn(() => Buffer.from(''));

      const gitSha = getGitSha();
      expect(typeof gitSha).toBe('string');
      expect(gitSha.length).toBeGreaterThan(0);

      // Restore original function
      require('child_process').execSync = originalExecSync;
    });
  });
});