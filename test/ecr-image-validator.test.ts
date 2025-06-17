/**
 * Test for ECR Image Validator
 */
import { EcrImageValidator } from '../lib/constructs/ecr-image-validator';
import { App, Stack } from 'aws-cdk-lib';
import { DEV_TEST_CONFIG } from '../lib/environment-config';

describe('ECR Image Validator', () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'TestStack');
  });

  test('creates ECR image validator with required properties', () => {
    // Arrange
    const ecrRepositoryArn = 'arn:aws:ecr:us-east-1:123456789012:repository/test-repo';
    const requiredImageTags = ['auth-infra-server-abc123', 'auth-infra-ldap-abc123'];
    const environment = 'test';

    // Act
    const validator = new EcrImageValidator(stack, 'TestValidator', {
      ecrRepositoryArn,
      requiredImageTags,
      environment,
      config: DEV_TEST_CONFIG
    });

    // Assert
    expect(validator).toBeDefined();
  });

  test('throws error for invalid ECR repository ARN when not a token', () => {
    // Arrange
    const invalidEcrRepositoryArn = 'invalid-arn';
    const requiredImageTags = ['auth-infra-server-abc123'];
    const environment = 'test';

    // Act & Assert
    expect(() => {
      new EcrImageValidator(stack, 'TestValidator', {
        ecrRepositoryArn: invalidEcrRepositoryArn,
        requiredImageTags,
        environment,
        config: DEV_TEST_CONFIG
      });
    }).toThrow('Invalid ECR repository ARN: invalid-arn');
  });

  test('accepts CloudFormation tokens as ECR repository ARN', () => {
    // Arrange
    const tokenEcrRepositoryArn = '${Token[TOKEN.123]}'; // Simulated token
    const requiredImageTags = ['auth-infra-server-abc123'];
    const environment = 'test';

    // Act & Assert - should not throw for tokens
    expect(() => {
      new EcrImageValidator(stack, 'TestValidator', {
        ecrRepositoryArn: tokenEcrRepositoryArn,
        requiredImageTags,
        environment,
        config: DEV_TEST_CONFIG
      });
    }).not.toThrow();
  });

  test('validator has correct metadata', () => {
    // Arrange
    const ecrRepositoryArn = 'arn:aws:ecr:us-east-1:123456789012:repository/test-repo';
    const requiredImageTags = ['auth-infra-server-abc123', 'auth-infra-ldap-abc123'];
    const environment = 'test';

    // Act
    const validator = new EcrImageValidator(stack, 'TestValidator', {
      ecrRepositoryArn,
      requiredImageTags,
      environment,
      config: DEV_TEST_CONFIG
    });

    // Assert
    const customResourceNode = validator.node.findChild('ImageValidation');
    expect(customResourceNode).toBeDefined();
    
    const metadata = customResourceNode.node.metadata;
    expect(metadata.find(m => m.type === 'Description')).toBeDefined();
    expect(metadata.find(m => m.type === 'RequiredTags')).toBeDefined();
  });
});
