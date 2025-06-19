import {
    generateAuthInfraStackName,
    generateLdapStackName,
    importBaseInfraValue,
    generateAuthInfraExportName,
    generateLdapExportName,
    FIXED_STACK_CONFIG
} from '../lib/stack-naming';

describe('Stack Naming', () => {
    describe('generateAuthInfraStackName', () => {
        it('should generate correct auth infra stack name', () => {
            expect(generateAuthInfraStackName('prod')).toBe('tak-auth-infra-prod');
            expect(generateAuthInfraStackName('dev')).toBe('tak-auth-infra-dev');
            expect(generateAuthInfraStackName('test')).toBe('tak-auth-infra-test');
        });
    });

    describe('generateLdapStackName', () => {
        it('should generate correct LDAP stack name', () => {
            expect(generateLdapStackName('prod')).toBe('tak-ldap-prod');
            expect(generateLdapStackName('dev')).toBe('tak-ldap-dev');
            expect(generateLdapStackName('test')).toBe('tak-ldap-test');
        });
    });

    describe('importBaseInfraValue', () => {
        it('should generate correct import value reference', () => {
            expect(importBaseInfraValue('prod', 'vpc-id')).toBe('{{resolve:ImportValue:coe-base-prod-vpc-id}}');
            expect(importBaseInfraValue('dev', 'subnet-private-a')).toBe('{{resolve:ImportValue:coe-base-dev-subnet-private-a}}');
        });
    });

    describe('generateAuthInfraExportName', () => {
        it('should generate correct auth infra export name', () => {
            expect(generateAuthInfraExportName('prod', 'database-endpoint')).toBe('tak-auth-infra-prod-database-endpoint');
            expect(generateAuthInfraExportName('dev', 'redis-endpoint')).toBe('tak-auth-infra-dev-redis-endpoint');
        });
    });

    describe('generateLdapExportName', () => {
        it('should generate correct LDAP export name', () => {
            expect(generateLdapExportName('prod', 'load-balancer-dns')).toBe('tak-ldap-prod-load-balancer-dns');
            expect(generateLdapExportName('dev', 'endpoint')).toBe('tak-ldap-dev-endpoint');
        });
    });

    describe('FIXED_STACK_CONFIG', () => {
        it('should have correct fixed configuration values', () => {
            expect(FIXED_STACK_CONFIG.PROJECT).toBe('tak');
            expect(FIXED_STACK_CONFIG.AUTH_STACK_PREFIX).toBe('auth-infra');
            expect(FIXED_STACK_CONFIG.LDAP_STACK_PREFIX).toBe('ldap');
        });
    });
});
