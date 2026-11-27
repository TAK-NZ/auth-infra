import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AuthInfraStack } from '../../lib/auth-infra-stack';
import { MOCK_CONFIGS } from '../__fixtures__/mock-configs';

// authentik/blueprints/tak-flows.yaml builds the enrollment redirect from TAK_TEAM_MANAGER_URL.
// Blueprints are applied by the worker, and also by the server when applied through the API, so both
// containers need it. Without it the blueprint skips the request-access stage rather than guessing a URL.
function synth(authentik: Record<string, unknown> = {}): Template {
  const app = new App();
  const stack = new AuthInfraStack(app, `BlueprintEnv${Math.random().toString(36).slice(2, 8)}`, {
    environment: 'dev-test',
    envConfig: { ...MOCK_CONFIGS.DEV_TEST, authentik: { ...MOCK_CONFIGS.DEV_TEST.authentik, ...authentik } },
    env: { account: '123456789012', region: 'ap-southeast-6' }
  });
  return Template.fromStack(stack);
}

// The Authentik server and worker tasks (not the LDAP outpost)
function authentikContainerEnvironments(template: Template): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];
  for (const def of Object.values(template.findResources('AWS::ECS::TaskDefinition'))) {
    for (const container of (def as any).Properties.ContainerDefinitions ?? []) {
      const env = Object.fromEntries((container.Environment ?? []).map((e: any) => [e.Name, e.Value]));
      if ('AUTHENTIK_POSTGRESQL__HOST' in env) result.push(env);
    }
  }
  return result;
}

describe('TAK_TEAM_MANAGER_URL for blueprints', () => {
  test('server and worker both get https://team.<zone> by default', () => {
    const envs = authentikContainerEnvironments(synth());
    expect(envs).toHaveLength(2);
    for (const env of envs) {
      expect(JSON.stringify(env.TAK_TEAM_MANAGER_URL)).toContain("https://team.");
    }
  });

  test('authentik.teamManagerHostname overrides the hostname', () => {
    const envs = authentikContainerEnvironments(synth({ teamManagerHostname: 'crew' }));
    for (const env of envs) {
      expect(JSON.stringify(env.TAK_TEAM_MANAGER_URL)).toContain("https://crew.");
    }
  });
});

// The IP lock in tak-flows.yaml reads TAK_IP_LOCK_THRESHOLD, and Authentik reads AUTHENTIK_REPUTATION__EXPIRY.
describe('IP lock environment', () => {
  const ipLockEnvs = (authentik: Record<string, unknown>) =>
    authentikContainerEnvironments(synth(authentik)).map((env) => ({
      threshold: env.TAK_IP_LOCK_THRESHOLD,
      expiry: env.AUTHENTIK_REPUTATION__EXPIRY
    }));

  test('without an ipLock block neither variable is set, so the lock stays off', () => {
    expect(ipLockEnvs({})).toEqual([
      { threshold: undefined, expiry: undefined },
      { threshold: undefined, expiry: undefined }
    ]);
  });

  test('a disabled lock still shortens how long a failure counts, but sets no threshold', () => {
    expect(ipLockEnvs({ ipLock: { enabled: false } })).toEqual([
      { threshold: undefined, expiry: '900' },
      { threshold: undefined, expiry: '900' }
    ]);
  });

  test('an enabled lock sets the default threshold -5 and window 900 s on the server and the worker', () => {
    expect(ipLockEnvs({ ipLock: { enabled: true } })).toEqual([
      { threshold: '-5', expiry: '900' },
      { threshold: '-5', expiry: '900' }
    ]);
  });

  test('threshold and window come from the configuration', () => {
    expect(ipLockEnvs({ ipLock: { enabled: true, threshold: -20, windowSeconds: 1800 } })).toEqual([
      { threshold: '-20', expiry: '1800' },
      { threshold: '-20', expiry: '1800' }
    ]);
  });
});

