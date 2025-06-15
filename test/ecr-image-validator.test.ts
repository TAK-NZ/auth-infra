/**
 * Test for ECR Image Validator
 */
import { EcrImageValidator } from '../lib/constructs/ecr-image-validator';
import { App, Stack } from 'aws-cdk-lib';

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
      environment
    });

    // Assert
    expect(validator).toBeDefined();
  });

  test('throws error for invalid ECR repository ARN', () => {
    // Arrange
    const invalidEcrRepositoryArn = 'invalid-arn';
    const requiredImageTags = ['auth-infra-server-abc123'];
    const environment = 'test';

    // Act & Assert
    expect(() => {
      new EcrImageValidator(stack, 'TestValidator', {
        ecrRepositoryArn: invalidEcrRepositoryArn,
        requiredImageTags,
        environment
      });
    }).toThrow('Invalid ECR repository ARN: invalid-arn');
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
      environment
    });

    // Assert
    const customResourceNode = validator.node.findChild('ImageValidation');
    expect(customResourceNode).toBeDefined();
    
    const metadata = customResourceNode.node.metadata;
    expect(metadata.find(m => m.type === 'Description')).toBeDefined();
    expect(metadata.find(m => m.type === 'RequiredTags')).toBeDefined();
  });
});
