import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AuthInfraStack } from '../../lib/auth-infra-stack';
import { MOCK_CONFIGS } from '../__fixtures__/mock-configs';

// The Authentik services reference the EFS file system by ID only. Without an explicit dependency
// CloudFormation creates them before the mount targets exist, and the first tasks cannot resolve
// the file system DNS name.
describe('AuthInfraStack EFS mount target dependency', () => {
  const app = new App();
  const stack = new AuthInfraStack(app, 'EfsDependencyStack', {
    environment: 'dev-test',
    envConfig: MOCK_CONFIGS.DEV_TEST,
    env: { account: '123456789012', region: 'ap-southeast-6' }
  });
  const template = Template.fromStack(stack);

  const mountTargetIds = Object.keys(template.findResources('AWS::EFS::MountTarget'));
  const services = template.findResources('AWS::ECS::Service');

  // Services whose task definition mounts the EFS volumes
  const efsServices = Object.entries(services).filter(([logicalId]) =>
    /^(AuthentikServerService|AuthentikWorkerWorkerService)/.test(logicalId)
  );

  test('the file system has a mount target in each private subnet', () => {
    expect(mountTargetIds.length).toBeGreaterThanOrEqual(2);
  });

  test('both Authentik services are found', () => {
    expect(efsServices).toHaveLength(2);
  });

  test.each(efsServices)('%s depends on every EFS mount target', (_logicalId, resource) => {
    const dependsOn: string[] = (resource as { DependsOn?: string[] }).DependsOn ?? [];
    for (const mountTargetId of mountTargetIds) {
      expect(dependsOn).toContain(mountTargetId);
    }
  });
});
