import * as fs from 'fs';
import * as path from 'path';
import { load } from 'js-yaml';

// Structure tests for the Authentik blueprints. The blueprints are applied by Authentik at startup, so
// a wrong attribute only shows up on a running instance. These tests pin the settings that other parts
// of the design depend on (see docs/BLUEPRINTS.md).

const BLUEPRINT_DIR = path.join(__dirname, '..', '..', 'authentik', 'blueprints');

type Entry = {
  id?: string;
  model: string;
  state?: string;
  identifiers?: Record<string, unknown>;
  attrs?: Record<string, unknown>;
  conditions?: unknown[];
};

// Blueprint YAML uses custom tags (!Find, !KeyOf, !Env, !Context, !Format). Dropping the tag leaves
// plain YAML: `!Find [a, [b, c]]` becomes the nested list ['a', ['b', 'c']], `!KeyOf 'x'` becomes 'x'.
function loadBlueprint(file: string): { version: number; entries: Entry[] } {
  const text = fs
    .readFileSync(path.join(BLUEPRINT_DIR, file), 'utf8')
    .replace(/!(Find|KeyOf|Env|Context|Format)(?=[\s[])/g, '');
  return load(text) as { version: number; entries: Entry[] };
}

function entry(entries: Entry[], model: string, match: Record<string, unknown>): Entry {
  const found = entries.filter(
    (e) => e.model === model && Object.entries(match).every(([k, v]) => e.identifiers?.[k] === v)
  );
  expect(found).toHaveLength(1);
  return found[0];
}

describe('blueprint files', () => {
  const files = fs.readdirSync(BLUEPRINT_DIR).filter((f) => f.endsWith('.yaml'));

  test.each(files)('%s parses and has the expected top-level shape', (file) => {
    const bp = loadBlueprint(file);
    expect(bp.version).toBe(1);
    expect(Array.isArray(bp.entries)).toBe(true);
    expect(bp.entries.length).toBeGreaterThan(0);
    for (const e of bp.entries) {
      expect(typeof e.model).toBe('string');
    }
  });
});

describe('recovery flow prerequisites (tak-flows.yaml, tak-branding-change.yaml)', () => {
  const flows = loadBlueprint('tak-flows.yaml').entries;
  const branding = loadBlueprint('tak-branding-change.yaml').entries;

  test('the default brand points at the TAK recovery flow', () => {
    // Without it, POST /core/users/{id}/recovery/ fails with "No recovery flow set".
    const brand = entry(branding, 'authentik_brands.brand', { domain: 'authentik-default' });
    expect(brand.attrs?.flow_recovery).toEqual(['authentik_flows.flow', ['slug', 'tak-recovery-flow']]);
  });

  test('the skip-if-restored policy passes only when the flow was not restored', () => {
    // The upstream expression, bool(is_restored, True), is always true and never skips the stage.
    const policy = entry(flows, 'authentik_policies_expression.expressionpolicy', {
      name: 'default-recovery-skip-if-restored'
    });
    expect(policy.attrs?.expression).toBe("return not request.context.get('is_restored', False)");
  });

  test('the skip policy is bound to the identification stage of the recovery flow', () => {
    const binding = flows.find((e) => e.id === 'binding-5');
    expect(binding?.model).toBe('authentik_flows.flowstagebinding');
    expect(binding?.identifiers?.target).toEqual(['authentik_flows.flow', ['slug', 'tak-recovery-flow']]);
    expect(binding?.identifiers?.stage).toEqual([
      'authentik_stages_identification.identificationstage',
      ['name', 'tak-recovery-identification']
    ]);
    const policyBinding = flows.find(
      (e) =>
        e.model === 'authentik_policies.policybinding' &&
        e.identifiers?.target === 'binding-5' &&
        JSON.stringify(e.identifiers?.policy).includes('default-recovery-skip-if-restored')
    );
    expect(policyBinding).toBeDefined();
    expect(policyBinding?.attrs?.negate).toBe(false);
  });

  test('opening a recovery link does not activate a suspended user', () => {
    // activate_user_on_success runs when the link is opened, even if a later stage denies the flow.
    const stage = entry(flows, 'authentik_stages_email.emailstage', { name: 'tak-recovery-email' });
    expect(stage.attrs?.activate_user_on_success).toBe(false);
  });

  test('the break-glass group exists and carries no superuser rights', () => {
    const group = entry(flows, 'authentik_core.group', { name: 'tak-break-glass' });
    expect(group.attrs?.is_superuser).toBe(false);
  });
});

describe('no social login, no captcha (tak-flows.yaml)', () => {
  const text = fs.readFileSync(path.join(BLUEPRINT_DIR, 'tak-flows.yaml'), 'utf8');
  const flows = loadBlueprint('tak-flows.yaml').entries;

  test('creates no social login source, source flow or captcha stage', () => {
    expect(flows.filter((e) => e.model.startsWith('authentik_sources_'))).toEqual([]);
    expect(flows.filter((e) => e.model === 'authentik_stages_captcha.captchastage')).toEqual([]);
    for (const word of ['tak-source-', 'recaptcha', 'TAK_CAPTCHA', 'oauthsource', 'tak-captcha-stage']) {
      expect(text).not.toContain(word);
    }
  });

  test('the login identification stage has no sources and no captcha, and uses the TAK password stage', () => {
    const stage = entry(flows, 'authentik_stages_identification.identificationstage', {
      name: 'tak-authentication-identification'
    });
    expect(stage.attrs?.sources).toEqual([]);
    expect(stage.attrs?.captcha_stage).toBeNull();
    expect(stage.attrs?.password_stage).toEqual([
      'authentik_stages_password.passwordstage',
      ['name', 'tak-authentication-password']
    ]);
  });

  test('the password stage cancels the flow after 3 wrong passwords and takes passwords and app passwords only', () => {
    const stage = entry(flows, 'authentik_stages_password.passwordstage', { name: 'tak-authentication-password' });
    expect(stage.attrs?.failed_attempts_before_cancel).toBe(3);
    expect(stage.attrs?.backends).toEqual(['authentik.core.auth.InbuiltBackend', 'authentik.core.auth.TokenBackend']);
  });
});

describe('IP lock (tak-flows.yaml)', () => {
  const flows = loadBlueprint('tak-flows.yaml').entries;

  test('the reputation policy looks at the source IP only and is off by default', () => {
    const policy = entry(flows, 'authentik_policies_reputation.reputationpolicy', { name: 'tak-brute-force-protection' });
    expect(policy.attrs?.check_ip).toBe(true);
    expect(policy.attrs?.check_username).toBe(false);
    // far below any sum of scores that a real IP reaches, so the lock cannot match
    const [variable, fallback] = policy.attrs?.threshold as [string, string];
    expect(variable).toBe('TAK_IP_LOCK_THRESHOLD');
    expect(Number(fallback)).toBeLessThan(-100);
  });

  test.each(['tak-auth', 'tak-recovery-flow'])('%s starts with the deny stage, bound to the reputation policy', (slug) => {
    const target = ['authentik_flows.flow', ['slug', slug]];
    const bindings = flows.filter(
      (e) => e.model === 'authentik_flows.flowstagebinding' && JSON.stringify(e.identifiers?.target) === JSON.stringify(target)
    );
    const deny = bindings.find((b) => JSON.stringify(b.identifiers?.stage).includes('tak-ip-lock-deny'));
    expect(deny).toBeDefined();
    // it must run before any stage that handles a password or sends an email
    const lowest = Math.min(...bindings.map((b) => b.identifiers?.order as number));
    expect(deny?.identifiers?.order).toBe(lowest);
    // The policy binding must stay enabled: a stage binding without an enabled policy always runs, which
    // would deny everybody
    const policyBinding = flows.find(
      (e) => e.model === 'authentik_policies.policybinding' && e.identifiers?.target === deny?.id
    );
    expect(JSON.stringify(policyBinding?.identifiers?.policy)).toContain('tak-brute-force-protection');
    expect(policyBinding?.attrs?.enabled).toBe(true);
    expect(policyBinding?.attrs?.negate).toBe(false);
  });

  test('the deny stage exists', () => {
    const stage = entry(flows, 'authentik_stages_deny.denystage', { name: 'tak-ip-lock-deny' });
    expect(String(stage.attrs?.deny_message).length).toBeGreaterThan(10);
  });
});

describe('cleanup blueprint (tak-cleanup.yaml)', () => {
  const cleanup = loadBlueprint('tak-cleanup.yaml').entries;
  const flows = loadBlueprint('tak-flows.yaml').entries;
  const key = (e: Entry) => `${e.model}:${JSON.stringify(e.identifiers)}`;

  test('only deletes', () => {
    for (const e of cleanup) {
      expect(e.state).toBe('absent');
    }
  });

  test('deletes the removed social login and captcha objects', () => {
    const wanted = [
      ['authentik_sources_oauth.oauthsource', { slug: 'google' }],
      ['authentik_sources_oauth.oauthsource', { slug: 'apple' }],
      ['authentik_flows.flow', { slug: 'tak-source-authentication' }],
      ['authentik_flows.flow', { slug: 'tak-source-enrollment-email-verification' }],
      ['authentik_stages_identification.identificationstage', { name: 'tak-identify-by-email' }],
      ['authentik_stages_email.emailstage', { name: 'tak-email-verification-otp' }],
      ['authentik_stages_user_write.userwritestage', { name: 'tak-link-social-provider' }],
      ['authentik_stages_captcha.captchastage', { name: 'tak-captcha-stage' }],
      ['authentik_policies_expression.expressionpolicy', { name: 'tak-require-sso-context' }]
    ] as const;
    for (const [model, identifiers] of wanted) {
      expect(cleanup.map(key)).toContain(key({ model, identifiers } as Entry));
    }
  });

  test('never deletes something that tak-flows.yaml still defines', () => {
    const defined = new Set(flows.filter((e) => e.state !== 'absent').map(key));
    for (const e of cleanup) {
      expect(defined.has(key(e))).toBe(false);
    }
  });

  test('deletes the sources before the flows they use, and the flows before their stages', () => {
    const position = (model: string) => cleanup.findIndex((e) => e.model === model);
    expect(position('authentik_sources_oauth.oauthsource')).toBeLessThan(position('authentik_flows.flow'));
    expect(position('authentik_flows.flow')).toBeLessThan(position('authentik_stages_identification.identificationstage'));
  });
});

