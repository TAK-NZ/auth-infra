import { App, Stack } from 'aws-cdk-lib';
import { AuthInfraStack } from '../../lib/auth-infra-stack';
import { MOCK_CONFIGS } from '../__fixtures__/mock-configs';

describe('AuthInfraStack Unit', () => {
  test('creates stack with minimal config', () => {
    const app = new App();
    
    const stack = new AuthInfraStack(app, 'TestStack', {
      environment: 'dev-test',
      envConfig: MOCK_CONFIGS.DEV_TEST,
      env: { account: '123456789012', region: 'us-west-2' }
    });

    expect(stack.stackName).toBe('TestStack');
  });
});