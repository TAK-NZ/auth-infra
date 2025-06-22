/**
 * Test suite for utilities functions
 */
import {
    validateEnvType,
    validateStackName,
    validateAuthentikAdminUserEmail,
    validateCdkContextParams,
    getGitSha
} from '../../../lib/utils';

describe('Utility Functions', () => {
    describe('validateEnvType', () => {
        test('should accept valid environment types', () => {
            expect(() => validateEnvType('prod')).not.toThrow();
            expect(() => validateEnvType('dev-test')).not.toThrow();
        });

        test('should reject invalid environment types', () => {
            expect(() => validateEnvType('staging')).toThrow('Invalid envType: staging. Must be \'prod\' or \'dev-test\'');
            expect(() => validateEnvType('')).toThrow();
        });
    });

    describe('validateStackName', () => {
        test('should accept valid stack names', () => {
            expect(() => validateStackName('Demo')).not.toThrow();
            expect(() => validateStackName('Production')).not.toThrow();
        });

        test('should reject invalid stack names', () => {
            expect(() => validateStackName(undefined)).toThrow('stackName is required. Use --context stackName=YourStackName');
            expect(() => validateStackName('')).toThrow('stackName is required. Use --context stackName=YourStackName');
        });
    });

    describe('validateAuthentikAdminUserEmail', () => {
        test('should accept valid email addresses', () => {
            expect(() => validateAuthentikAdminUserEmail('admin@example.com')).not.toThrow();
            expect(() => validateAuthentikAdminUserEmail('user@domain.org')).not.toThrow();
        });

        test('should reject invalid email addresses', () => {
            expect(() => validateAuthentikAdminUserEmail(undefined)).toThrow('authentikAdminUserEmail is required. Use --context authentikAdminUserEmail=user@example.com');
            expect(() => validateAuthentikAdminUserEmail('')).toThrow();
            expect(() => validateAuthentikAdminUserEmail('   ')).toThrow();
        });
    });

    describe('validateCdkContextParams', () => {
        test('should accept valid parameters', () => {
            expect(() => validateCdkContextParams({
                envType: 'dev-test',
                stackName: 'Demo',
                authentikAdminUserEmail: 'admin@example.com'
            })).not.toThrow();
        });

        test('should reject invalid parameters', () => {
            expect(() => validateCdkContextParams({
                envType: 'invalid',
                stackName: 'Demo',
                authentikAdminUserEmail: 'admin@example.com'
            })).toThrow('Invalid envType');

            expect(() => validateCdkContextParams({
                envType: 'dev-test',
                stackName: undefined,
                authentikAdminUserEmail: 'admin@example.com'
            })).toThrow('stackName is required');
        });
    });

    describe('getGitSha', () => {
        test('should return a string', () => {
            const gitSha = getGitSha();
            expect(typeof gitSha).toBe('string');
            expect(gitSha.length).toBeGreaterThan(0);
        });
    });
});
