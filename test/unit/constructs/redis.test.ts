import { App, Stack } from 'aws-cdk-lib';
import { Redis } from '../../../lib/constructs/redis';
import { CDKTestHelper } from '../../__helpers__/cdk-test-utils';
import { MOCK_CONFIGS } from '../../__fixtures__/mock-configs';

describe('Redis Construct', () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    ({ app, stack } = CDKTestHelper.createTestStack());
  });

  test('creates Redis cluster', () => {
    const infrastructure = CDKTestHelper.createMockInfrastructure(stack);
    const securityGroups = [infrastructure.ecsSecurityGroup];
    
    const redis = new Redis(stack, 'TestRedis', {
      environment: 'dev-test',
      stackName: 'TestStack',
      contextConfig: MOCK_CONFIGS.DEV_TEST,
      infrastructure,
      securityGroups
    });

    expect(redis.replicationGroup).toBeDefined();
    expect(redis.authToken).toBeDefined();
  });
});