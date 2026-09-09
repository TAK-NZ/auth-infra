/**
 * Synth-smoke + behavioral/safety-property tests for AuthInfraStack.
 *
 * The single highest-value CDK test: prove the whole stack synthesizes for
 * every environment and every container-image path, and pin the few template
 * properties whose regression would be a real, dangerous defect (prod DB
 * deletion protection, the image-source switch, cross-stack export names).
 */
import { synthStack } from '../__helpers__/cdk-test-utils';
import { MOCK_CONFIGS } from '../__fixtures__/mock-configs';

describe('AuthInfraStack synth-smoke', () => {
  // env x image-path matrix: a stack that no longer synthesizes is the failure
  // that actually happens in practice (bad ref, missing context, CDK bump).
  const cases: Array<{
    name: string;
    environment: 'prod' | 'dev-test';
    config: typeof MOCK_CONFIGS.DEV_TEST;
    context: Record<string, unknown>;
  }> = [
    { name: 'dev-test, local Docker image asset', environment: 'dev-test', config: MOCK_CONFIGS.DEV_TEST, context: {} },
    { name: 'dev-test, prebuilt ECR image', environment: 'dev-test', config: MOCK_CONFIGS.DEV_TEST, context: { usePreBuiltImages: true } },
    { name: 'prod, local Docker image asset', environment: 'prod', config: MOCK_CONFIGS.PROD, context: {} },
    { name: 'prod, prebuilt ECR image', environment: 'prod', config: MOCK_CONFIGS.PROD, context: { usePreBuiltImages: true } },
  ];

  test.each(cases)('synthesizes for $name', ({ environment, config, context }) => {
    expect(() => synthStack(environment, config, context)).not.toThrow();
  });
});

describe('AuthInfraStack safety + wiring properties', () => {
  test('prod database has deletion protection enabled', () => {
    const { template } = synthStack('prod', MOCK_CONFIGS.PROD);
    // Shipping prod without deletion protection is a real, dangerous regression.
    template.hasResourceProperties('AWS::RDS::DBCluster', {
      DeletionProtection: true,
    });
  });

  test('dev-test database is destroyable (no deletion protection)', () => {
    const { template } = synthStack('dev-test', MOCK_CONFIGS.DEV_TEST);
    const clusters = template.findResources('AWS::RDS::DBCluster');
    const props = Object.values(clusters)[0].Properties ?? {};
    // dev-test must not carry prod's deletion protection.
    expect(props.DeletionProtection).not.toBe(true);
  });

  // The usePreBuiltImages flag flips the image source. Assert both branches wire
  // a *different* source, so a regression in the switch is caught:
  //  - local  -> CDK-managed container-assets repo (a locally built asset)
  //  - prebuilt -> base-infra ECR repo imported by export name, tagged from config
  const taskImages = (context: Record<string, unknown>): string[] => {
    const { template } = synthStack('dev-test', MOCK_CONFIGS.DEV_TEST, context);
    const taskDefs = template.findResources('AWS::ECS::TaskDefinition');
    return Object.values(taskDefs).flatMap((t: any) =>
      (t.Properties?.ContainerDefinitions ?? []).map((c: any) => JSON.stringify(c.Image))
    );
  };

  test('local image path builds a CDK Docker asset, not the base-infra ECR repo', () => {
    const images = taskImages({});
    expect(images.length).toBeGreaterThan(0);
    // Every image comes from the CDK-managed container-assets repo.
    expect(images.every((img) => img.includes('container-assets'))).toBe(true);
    // And none reference the base-infra ECR repo export used by prebuilt mode.
    expect(images.some((img) => img.includes('EcrArtifactsRepoArn'))).toBe(false);
  });

  test('prebuilt image path imports the base-infra ECR repo and tags from config', () => {
    const images = taskImages({ usePreBuiltImages: true });
    expect(images.length).toBeGreaterThan(0);
    // Images resolve against the base-infra ECR repo imported by export name...
    expect(images.some((img) => img.includes('EcrArtifactsRepoArn'))).toBe(true);
    // ...tagged with the authentik version/branding/revision derived from config.
    expect(images.some((img) => img.includes('authentik:2025.6.2-tak-nz-r1'))).toBe(true);
    // Prebuilt mode must not fall back to the CDK asset repo.
    expect(images.some((img) => img.includes('container-assets'))).toBe(false);
  });
});
