import { App, Stack } from 'aws-cdk-lib';
import { SecretsManager } from '../../../lib/constructs/secrets-manager';
import { CDKTestHelper } from '../../__helpers__/cdk-test-utils';

describe('Secrets Manager Construct', () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    ({ app, stack } = CDKTestHelper.createTestStack());
  });

  test('creates secrets', () => {
    const infrastructure = CDKTestHelper.createMockInfrastructure(stack);
    
    const secrets = new SecretsManager(stack, 'TestSecrets', {
      environment: 'dev-test',
      stackName: 'TestStack',
      infrastructure
    });

    expect(secrets.secretKey).toBeDefined();
    expect(secrets.adminUserPassword).toBeDefined();
    expect(secrets.adminUserToken).toBeDefined();
    expect(secrets.ldapServiceUser).toBeDefined();
    expect(secrets.ldapToken).toBeDefined();
  });
});