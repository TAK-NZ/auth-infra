/**
 * Test suite for CloudFormation import utilities
 */
import { BASE_EXPORT_NAMES, createBaseImportValue, createAuthImportValue } from '../../../lib/cloudformation-imports';

describe('CloudFormation Import Utilities', () => {
  describe('BASE_EXPORT_NAMES constants', () => {
    test('should have all required export names', () => {
      expect(BASE_EXPORT_NAMES.VPC_ID).toBe('VpcId');
      expect(BASE_EXPORT_NAMES.ECS_CLUSTER).toBe('EcsClusterArn');
      expect(BASE_EXPORT_NAMES.KMS_KEY).toBe('KmsKeyArn');
      expect(BASE_EXPORT_NAMES.CERTIFICATE_ARN).toBe('CertificateArn');
    });
  });

  describe('createBaseImportValue', () => {
    test('should create correct import value for prod environment', () => {
      const result = createBaseImportValue('prod', BASE_EXPORT_NAMES.VPC_ID);
      expect(result).toBe('TAK-prod-BaseInfra-VpcId');
    });

    test('should create correct import value for dev-test environment', () => {
      const result = createBaseImportValue('dev-test', BASE_EXPORT_NAMES.ECS_CLUSTER);
      expect(result).toBe('TAK-dev-test-BaseInfra-EcsClusterArn');
    });

    test('should handle custom environment names', () => {
      const result = createBaseImportValue('staging', 'CustomExport');
      expect(result).toBe('TAK-staging-BaseInfra-CustomExport');
    });
  });

  describe('createAuthImportValue', () => {
    test('should create correct auth import value', () => {
      const result = createAuthImportValue('prod', 'Database-Endpoint');
      expect(result).toBe('TAK-prod-AuthInfra-Database-Endpoint');
    });

    test('should handle different export names', () => {
      const result = createAuthImportValue('dev-test', 'Redis-Endpoint');
      expect(result).toBe('TAK-dev-test-AuthInfra-Redis-Endpoint');
    });
  });
});