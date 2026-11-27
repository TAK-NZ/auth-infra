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

  test('the brand CSS hides the Connected services tab of the user settings', () => {
    const brand = entry(branding, 'authentik_brands.brand', { domain: 'authentik-default' });
    const css = String(brand.attrs?.branding_custom_css).replace(/\s+/g, ' ');
    expect(css).toContain('li.pf-c-tabs__item:has(> #page-sources-tab) { display: none !important; }');
  });
  test('the user settings flow is the TAK one, in English, and has no Save button', () => {
    const brand = entry(branding, 'authentik_brands.brand', { domain: 'authentik-default' });
    expect(brand.attrs?.flow_user_settings).toEqual(['authentik_flows.flow', ['slug', 'tak-user-settings']]);
    expect(brand.attrs?.attributes).toEqual({ settings: { locale: 'en' } });
    const css = String(brand.attrs?.branding_custom_css).replace(/\s+/g, ' ');
    // :host(...) limits the rule to the user settings stage, so the login and recovery flows keep their buttons
    expect(css).toContain(':host(ak-user-stage-prompt) .pf-c-form__group.pf-m-action { display: none !important; }');
  });
  test('User details shows username, name and email, all read-only, and no locale', () => {
    const stage = entry(flows, 'authentik_stages_prompt.promptstage', { name: 'tak-user-settings' });
    const fields = (stage.attrs?.fields as unknown[][]).map((f) => (f[1] as string[])[1]);
    expect(fields).toEqual([
      'tak-readonly-user-settings-field-username',
      'tak-readonly-user-settings-field-name',
      'tak-readonly-user-settings-field-email'
    ]);
    for (const name of fields) {
      const prompt = entry(flows, 'authentik_stages_prompt.prompt', { name });
      expect(prompt.attrs?.type).toBe('text_read_only');
    }
    expect(fields.map((f) => entry(flows, 'authentik_stages_prompt.prompt', { name: f }).attrs?.field_key)).toEqual([
      'username',
      'name',
      'email'
    ]);
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

// --- MFA rules ------------------------------------------------------------------------------------------------
type Binding = { id?: string; order: number; stage: string; policies: { name: string; negate: boolean }[]; entry: Entry };
const stageName = (e: Entry): string => ((e.identifiers?.stage as unknown[])[1] as string[])[1];
const flowSlug = (e: Entry): string => ((e.identifiers?.target as unknown[])[1] as string[])[1];
function bindingsOf(entries: Entry[], slug: string): Binding[] {
  return entries
    .filter((e) => e.model === 'authentik_flows.flowstagebinding' && e.state !== 'absent' && flowSlug(e) === slug)
    .map((e) => ({
      id: e.id,
      order: e.identifiers?.order as number,
      stage: stageName(e),
      entry: e,
      policies: entries
        .filter((p) => p.model === 'authentik_policies.policybinding' && e.id !== undefined && p.identifiers?.target === e.id)
        .map((p) => ({
          name: ((p.identifiers?.policy as unknown[])[1] as string[])[1],
          negate: p.attrs?.negate as boolean
        }))
    }))
    .sort((a, b) => a.order - b.order);
}
const summary = (b: Binding) => [b.order, b.stage, b.policies.map((p) => `${p.negate ? 'not ' : ''}${p.name}`)];
describe('MFA rules (tak-flows.yaml)', () => {
  const flows = loadBlueprint('tak-flows.yaml').entries;
  test('tak-auth: break-glass is refused, then every human ends with two authenticators before the login', () => {
    const bindings = bindingsOf(flows, 'tak-auth').filter((b) => b.order >= 15);
    expect(bindings.map(summary)).toEqual([
      [15, 'tak-authentication-break-glass-deny', ['tak-mfa-is-break-glass']],
      [20, 'tak-authentication-mfa-validation-user', ['not tak-mfa-is-admin', 'tak-mfa-has-authenticator']],
      [22, 'tak-authentication-mfa-validation-admin', ['tak-mfa-is-admin']],
      [24, 'tak-admin-passkey-intro', ['tak-mfa-is-admin', 'tak-mfa-fewer-than-two-passkeys']],
      [25, 'default-authenticator-webauthn-setup', ['tak-mfa-is-admin', 'tak-mfa-fewer-than-two-passkeys']],
      [30, 'tak-authentication-mfa-enrol', ['not tak-mfa-is-admin', 'not tak-mfa-has-passkey-or-app']],
      [40, 'default-authenticator-static-setup', ['not tak-mfa-is-admin', 'tak-mfa-fewer-than-two-authenticators']],
      [100, 'tak-authentication-login', []]
    ]);
  });
  test('tak-passkey (passkey autofill) applies the same rules before its login stage', () => {
    const bindings = bindingsOf(flows, 'tak-passkey');
    expect(bindings.map(summary)).toEqual([
      [10, 'tak-authentication-webauthn', []],
      [12, 'tak-authentication-break-glass-deny', ['tak-mfa-is-break-glass']],
      [13, 'tak-admin-passkey-intro', ['tak-mfa-is-admin', 'tak-mfa-fewer-than-two-passkeys']],
      [14, 'default-authenticator-webauthn-setup', ['tak-mfa-is-admin', 'tak-mfa-fewer-than-two-passkeys']],
      [16, 'default-authenticator-static-setup', ['not tak-mfa-is-admin', 'tak-mfa-fewer-than-two-authenticators']],
      [20, 'tak-authentication-login', []]
    ]);
  });
  test.each(['tak-auth', 'tak-passkey'])('%s: the MFA bindings need all of their policies and run when reached', (slug) => {
    for (const b of bindingsOf(flows, slug).filter((x) => x.policies.length > 0 && x.stage !== 'tak-ip-lock-deny')) {
      // `all`: the policies are conditions that must hold together. With `any` the stage would run for anybody.
      expect(b.entry.attrs?.policy_engine_mode).toBe('all');
      // evaluated when the stage is reached, for the user who has just been identified
      expect(b.entry.attrs?.evaluate_on_plan).toBe(false);
      expect(b.entry.attrs?.re_evaluate_policies).toBe(true);
      for (const p of b.policies) {
        const policy = entry(flows, 'authentik_policies_expression.expressionpolicy', { name: p.name });
        expect(policy).toBeDefined();
      }
    }
  });
  test('only the MFA stages that ordinary users meet offer recovery codes; administrators never do', () => {
    const validate = flows.filter((e) => e.model === 'authentik_stages_authenticator_validate.authenticatorvalidatestage');
    const offersCodes = validate.filter((e) => (e.attrs?.device_classes as string[]).includes('static'));
    expect(offersCodes.map((e) => e.identifiers?.name).sort()).toEqual([
      'tak-authentication-mfa-validation-user',
      'tak-reauth-validate',
      'tak-recovery-validate-user'
    ]);
    // ...and each of their bindings (and the recovery code setup stage) is closed to administrators
    const closedToAdmins = (b: Binding) => b.policies.some((p) => p.name === 'tak-mfa-is-admin' && p.negate);
    const slugs = [...new Set(flows.filter((e) => e.model === 'authentik_flows.flowstagebinding').map(flowSlug))];
    const codeBindings = slugs
      .flatMap((slug) => bindingsOf(flows, slug))
      .filter((b) =>
        ['tak-authentication-mfa-validation-user', 'tak-reauth-validate', 'tak-recovery-validate-user', 'default-authenticator-static-setup'].includes(
          b.stage
        )
      );
    // tak-auth (validate, setup), tak-passkey (setup), the recovery flow (validate, setup) and the three setup flows (reauth)
    expect(codeBindings).toHaveLength(8);
    for (const b of codeBindings) {
      expect(closedToAdmins(b)).toBe(true);
    }
  });
  test('no validate stage offers SMS, email or Duo, and the enrolment stages send a user without authenticators to a setup stage', () => {
    const validate = flows.filter((e) => e.model === 'authentik_stages_authenticator_validate.authenticatorvalidatestage');
    for (const v of validate) {
      for (const c of ['sms', 'email', 'duo']) {
        expect(v.attrs?.device_classes).not.toContain(c);
      }
      expect(v.attrs?.webauthn_user_verification).toBe('required');
    }
    const byName = (n: string) => validate.find((v) => v.identifiers?.name === n)!;
    expect(byName('tak-authentication-mfa-validation-admin').attrs?.device_classes).toEqual(['webauthn']);
    expect(byName('tak-authentication-mfa-validation-admin').attrs?.not_configured_action).toBe('configure');
    expect(byName('tak-authentication-mfa-enrol').attrs?.device_classes).toEqual(['webauthn', 'totp']);
    expect(byName('tak-authentication-mfa-enrol').attrs?.not_configured_action).toBe('configure');
    expect(byName('tak-authentication-mfa-enrol').attrs?.configuration_stages).toHaveLength(2);
  });
  test('the setup stages are named for users and set the strength of what they create', () => {
    const passkey = entry(flows, 'authentik_stages_authenticator_webauthn.authenticatorwebauthnstage', {
      name: 'default-authenticator-webauthn-setup'
    });
    expect(passkey.attrs?.friendly_name).toBe('Passkey');
    expect(passkey.attrs?.user_verification).toBe('required');
    expect(passkey.attrs?.resident_key_requirement).toBe('required');
    const app = entry(flows, 'authentik_stages_authenticator_totp.authenticatortotpstage', {
      name: 'default-authenticator-totp-setup'
    });
    expect(app.attrs?.friendly_name).toBe('Authenticator app');
    const codes = entry(flows, 'authentik_stages_authenticator_static.authenticatorstaticstage', {
      name: 'default-authenticator-static-setup'
    });
    expect(codes.attrs?.friendly_name).toBe('Recovery codes');
    expect(codes.attrs?.token_count).toBe(10);
  });
  test.each(['webauthn', 'totp', 'static'])(
    'changing authenticators in the user settings (%s) asks for an authenticator first, and remembers the check for 5 minutes',
    (kind) => {
      const bindings = bindingsOf(flows, `default-authenticator-${kind}-setup`);
      expect(bindings.map((b) => b.stage).sort()).toEqual(['tak-reauth-intro', 'tak-reauth-validate', 'tak-reauth-validate-admin']);
      for (const b of bindings) {
        // the setup stage of the default blueprint is at order 0
        expect(b.order).toBeLessThan(0);
      }
      for (const name of ['tak-reauth-validate', 'tak-reauth-validate-admin']) {
        const stage = entry(flows, 'authentik_stages_authenticator_validate.authenticatorvalidatestage', { name });
        expect(stage.attrs?.last_auth_threshold).toBe('minutes=5');
      }
    }
  );
  test.each([
    ['webauthn', 'Add a passkey'],
    ['totp', 'Add an authenticator app'],
    ['static', 'Get recovery codes']
  ])('the %s setup flow is titled for what it adds and explains the check before it', (kind, title) => {
    const flow = entry(flows, 'authentik_flows.flow', { slug: `default-authenticator-${kind}-setup` });
    expect(flow.attrs?.title).toBe(title);
    const intro = bindingsOf(flows, `default-authenticator-${kind}-setup`).find((b) => b.stage === 'tak-reauth-intro');
    // in front of both variants of the check (-20 and -10), and only when the user has something to check and the check will run
    expect(intro?.order).toBeLessThan(-20);
    expect(intro?.policies.map((p) => p.name)).toEqual(['tak-mfa-has-authenticator', 'tak-mfa-reauth-needed']);
    expect(intro?.entry.attrs?.policy_engine_mode).toBe('all');
  });
  test('the explanation shows only while the check runs: the check leaves a cookie for 5 minutes', () => {
    const expression = String(
      entry(flows, 'authentik_policies_expression.expressionpolicy', { name: 'tak-mfa-reauth-needed' }).attrs?.expression
    );
    expect(expression).toContain("return 'authentik_mfa' not in http_request.COOKIES");
    // only the two check stages have a threshold, so only they set the cookie
    const validate = flows.filter((e) => e.model === 'authentik_stages_authenticator_validate.authenticatorvalidatestage');
    const withThreshold = validate.filter((e) => e.attrs?.last_auth_threshold !== 'seconds=0').map((e) => e.identifiers?.name);
    expect(withThreshold.sort()).toEqual(['tak-reauth-validate', 'tak-reauth-validate-admin']);
  });
  test('every second-passkey registration is preceded by the screen that says to use another device', () => {
    // Authentik registers without listing the existing passkeys, so a passkey made again on the same device replaces
    // the first. The screen is the only protection against two records and one working passkey.
    for (const slug of ['tak-auth', 'tak-passkey', 'tak-recovery-flow']) {
      const list = bindingsOf(flows, slug);
      const registrations = list.filter((b) => b.stage === 'default-authenticator-webauthn-setup');
      expect(registrations.length).toBeGreaterThan(0);
      for (const r of registrations) {
        const before = list.filter((b) => b.order < r.order).pop();
        expect(before?.stage).toBe('tak-admin-passkey-intro');
        expect(before?.policies.map((p) => p.name)).toEqual(r.policies.map((p) => p.name));
      }
    }
    const text = String(entry(flows, 'authentik_stages_prompt.prompt', { name: 'tak-admin-passkey-text' }).attrs?.initial_value);
    expect(text).toContain('different device');
    expect(text).toContain('replaces');
  });
  test('the policies read the user who signs in and count what the rules name', () => {
    const expr = (name: string) =>
      String(entry(flows, 'authentik_policies_expression.expressionpolicy', { name }).attrs?.expression);
    expect(expr('tak-mfa-is-admin')).toContain('request.user.is_superuser');
    expect(expr('tak-mfa-is-break-glass')).toContain("name='tak-break-glass'");
    expect(expr('tak-mfa-fewer-than-two-passkeys')).toContain('passkeys < 2');
    // recovery codes are one authenticator, and only while codes are left
    expect(expr('tak-mfa-fewer-than-two-authenticators')).toContain('passkeys + apps + (1 if codes else 0) < 2');
    expect(expr('tak-mfa-fewer-than-two-authenticators')).toContain('StaticToken.objects.filter');
    expect(expr('tak-mfa-has-passkey-or-app')).toContain('passkeys + apps > 0');
  });
  test('the default login flow and the default password change flow are shut', () => {
    const deny = entry(flows, 'authentik_stages_deny.denystage', { name: 'tak-flow-disabled-deny' });
    expect(deny).toBeDefined();
    for (const slug of ['default-authentication-flow', 'default-password-change']) {
      const binding = flows.find(
        (e) =>
          e.model === 'authentik_flows.flowstagebinding' &&
          JSON.stringify(e.identifiers?.target) === JSON.stringify(['authentik_flows.flow', ['slug', slug]])
      );
      expect(binding).toBeDefined();
      expect(stageName(binding!)).toBe('tak-flow-disabled-deny');
      // before every stage of the flow, whatever their order, and with no policy that could skip it
      expect(binding?.identifiers?.order).toBeLessThan(0);
      expect(binding?.attrs?.evaluate_on_plan).toBe(true);
      expect(flows.filter((p) => p.model === 'authentik_policies.policybinding' && p.identifiers?.target === binding?.id)).toEqual([]);
    }
  });
});
describe('passwords (tak-flows.yaml, tak-ldap-setup.yaml)', () => {
  const flows = loadBlueprint('tak-flows.yaml').entries;
  const ldap = loadBlueprint('tak-ldap-setup.yaml').entries;
  const policyRef = ['authentik_policies_password.passwordpolicy', ['name', 'tak-password-policy']];
  test('the policy asks for 16 characters, no composition rules, and a local strength estimate', () => {
    const policy = entry(flows, 'authentik_policies_password.passwordpolicy', { name: 'tak-password-policy' });
    expect(policy.attrs?.length_min).toBe(16);
    expect(policy.attrs?.password_field).toBe('password');
    for (const k of ['amount_digits', 'amount_lowercase', 'amount_symbols', 'amount_uppercase']) {
      expect(policy.attrs?.[k]).toBe(0);
    }
    expect(policy.attrs?.check_zxcvbn).toBe(true);
    // the breached password list is an outside service: see the comment above the policy
    expect(policy.attrs?.check_have_i_been_pwned).toBe(false);
  });
  test.each(['tak-password-change-prompt', 'Change your password'])('the policy is on the new password prompt %s', (name) => {
    const stage = entry(flows, 'authentik_stages_prompt.promptstage', { name });
    expect(stage.attrs?.validation_policies).toEqual([policyRef]);
  });
  test('the change password flow asks for the current password first, and the settings page links to it', () => {
    const bindings = bindingsOf(flows, 'tak-change-password');
    expect(bindings.map(summary)).toEqual([
      [10, 'tak-password-change-current', ['tak-password-has-usable-password']],
      [20, 'tak-password-change-prompt', []],
      [30, 'tak-password-change-write', []]
    ]);
    // counted attempts: the flow ends after 3 wrong passwords and each one lowers the IP reputation
    const current = entry(flows, 'authentik_stages_password.passwordstage', { name: 'tak-password-change-current' });
    expect(current.attrs?.failed_attempts_before_cancel).toBe(3);
    expect(current.attrs?.configure_flow).toBeNull();
    const login = entry(flows, 'authentik_stages_password.passwordstage', { name: 'tak-authentication-password' });
    expect(login.attrs?.configure_flow).toEqual(['authentik_flows.flow', ['slug', 'tak-change-password']]);
  });
  test('exactly one password stage is listed on the user settings page', () => {
    // A password stage with a configure flow is listed as "Change password"; the others must have none.
    const stages = [...flows, ...ldap].filter((e) => e.model === 'authentik_stages_password.passwordstage');
    const listed = stages.filter((e) => e.attrs?.configure_flow !== null).map((e) => e.identifiers?.name);
    expect(listed).toEqual(['tak-authentication-password']);
  });
});
describe('cleanup of the MFA and password changes (tak-cleanup.yaml)', () => {
  const cleanup = loadBlueprint('tak-cleanup.yaml').entries;
  const key = (e: Entry) => `${e.model}:${JSON.stringify(e.identifiers)}`;
  test('deletes the administrator-only MFA stage, the second passkey flow and the old password change flow', () => {
    for (const [model, identifiers] of [
      ['authentik_stages_authenticator_validate.authenticatorvalidatestage', { name: 'tak-authentication-mfa-validation' }],
      ['authentik_flows.flow', { slug: 'tak-passwordless-flow' }],
      ['authentik_flows.flow', { slug: 'tak-password-change' }]
    ] as const) {
      expect(cleanup.map(key)).toContain(key({ model, identifiers } as Entry));
    }
  });
  test('never deletes a stage binding: Authentik fails on the second apply, when the binding is already gone', () => {
    expect(cleanup.filter((e) => e.model === 'authentik_flows.flowstagebinding')).toEqual([]);
  });
});
// --- Activation and recovery ------------------------------------------------------------------------------------
describe('activation and recovery flow (tak-flows.yaml)', () => {
  const flows = loadBlueprint('tak-flows.yaml').entries;
  const cleanup = loadBlueprint('tak-cleanup.yaml').entries;
  const bindings = bindingsOf(flows, 'tak-recovery-flow');
  test('the flow refuses unusable accounts, checks an authenticator before the new password, then enrols the rest', () => {
    expect(bindings.map(summary)).toEqual([
      [5, 'tak-ip-lock-deny', ['tak-brute-force-protection']],
      [10, 'tak-recovery-identification', ['default-recovery-skip-if-restored']],
      [20, 'tak-recovery-email', []],
      [22, 'tak-recovery-deny', ['tak-recovery-refuse']],
      [25, 'tak-recovery-verify-intro', ['tak-mfa-has-authenticator']],
      [26, 'tak-recovery-validate-user', ['not tak-mfa-is-admin', 'tak-mfa-has-authenticator']],
      [27, 'tak-recovery-validate-admin', ['tak-mfa-is-admin', 'tak-mfa-has-authenticator']],
      [30, 'Change your password', []],
      [40, 'tak-recovery-user-write', []],
      [45, 'tak-recovery-enrol-intro', ['tak-mfa-needs-enrolment']],
      [50, 'tak-authentication-mfa-enrol', ['not tak-mfa-is-admin', 'not tak-mfa-has-passkey-or-app']],
      [51, 'tak-admin-passkey-intro', ['tak-mfa-is-admin', 'tak-mfa-fewer-than-two-passkeys']],
      [52, 'default-authenticator-webauthn-setup', ['tak-mfa-is-admin', 'tak-mfa-fewer-than-two-passkeys']],
      [53, 'tak-admin-passkey-intro', ['tak-mfa-is-admin', 'tak-mfa-fewer-than-two-passkeys']],
      [54, 'default-authenticator-webauthn-setup', ['tak-mfa-is-admin', 'tak-mfa-fewer-than-two-passkeys']],
      [60, 'default-authenticator-static-setup', ['not tak-mfa-is-admin', 'tak-mfa-fewer-than-two-authenticators']],
      [90, 'tak-recovery-finished', []],
      [100, 'tak-recovery-done', []]
    ]);
  });
  test('every screen of the flow says what it is for', () => {
    // The flow title is the same for activation and recovery, so it must fit both.
    const flow = entry(flows, 'authentik_flows.flow', { slug: 'tak-recovery-flow' });
    expect(flow.attrs?.title).toBe('Your TAK.NZ account');
    // Authentik's own stages (authenticator choice, passkey registration, recovery codes) have no text of their own.
    // Prompt stages with static text stand in front of them, and the password prompt has a heading and a description.
    const fieldsOf = (stageName: string) =>
      (entry(flows, 'authentik_stages_prompt.promptstage', { name: stageName }).attrs?.fields as unknown[][]).map(
        (f) => (f[1] as string[])[1]
      );
    const screens: Record<string, string[]> = {
      'tak-recovery-verify-intro': ['tak-recovery-verify-heading', 'tak-recovery-verify-text'],
      'Change your password': [
        'tak-recovery-password-heading',
        'tak-recovery-password-text',
        'default-recovery-field-password',
        'default-recovery-field-password-repeat'
      ],
      'tak-recovery-enrol-intro': ['tak-recovery-enrol-heading', 'tak-recovery-enrol-text'],
      'tak-recovery-finished': ['tak-recovery-finished-heading', 'tak-recovery-finished-text']
    };
    for (const [stage, fields] of Object.entries(screens)) {
      expect(fieldsOf(stage)).toEqual(fields);
      for (const f of fields.filter((x) => x.startsWith('tak-recovery-'))) {
        const prompt = entry(flows, 'authentik_stages_prompt.prompt', { name: f });
        expect(prompt.attrs?.type).toBe('static');
        expect(String(prompt.attrs?.initial_value).length).toBeGreaterThan(10);
      }
    }
    // the text that depends on the user is an expression, the rest is fixed
    for (const f of ['tak-recovery-password-heading', 'tak-recovery-password-text', 'tak-recovery-verify-text', 'tak-recovery-enrol-text']) {
      expect(entry(flows, 'authentik_stages_prompt.prompt', { name: f }).attrs?.initial_value_expression).toBe(true);
    }
    // a heading never ends up under a field that is defined later in the file than the stage that uses it
    const position = (model: string, name: string) => flows.findIndex((e) => e.model === model && e.identifiers?.name === name);
    for (const stage of Object.keys(screens)) {
      for (const f of fieldsOf(stage)) {
        expect(position('authentik_stages_prompt.prompt', f)).toBeLessThan(position('authentik_stages_prompt.promptstage', stage));
      }
    }
  });
  test('the MFA bindings of the flow need ALL of their policies', () => {
    const modes = Object.fromEntries(bindings.map((b) => [b.stage + b.order, b.entry.attrs?.policy_engine_mode]));
    for (const key of ['tak-recovery-deny22', 'tak-recovery-validate-user26', 'tak-recovery-validate-admin27', 'tak-authentication-mfa-enrol50']) {
      expect(modes[key]).toBe('all');
    }
  });
  test('the flow never logs the user in', () => {
    // The user ends at the login page, where the rules of tak-auth apply. A login stage here would hand out a
    // session after an email link or a one-time link alone.
    expect(bindings.filter((b) => b.stage.includes('login'))).toEqual([]);
    expect(flows.filter((e) => e.model === 'authentik_stages_user_login.userloginstage').map((e) => e.identifiers?.name)).toEqual([
      'tak-authentication-login'
    ]);
    const done = entry(flows, 'authentik_stages_redirect.redirectstage', { name: 'tak-recovery-done' });
    // a plain address, not the login flow: the flow token in the URL must not be carried along
    expect(done.attrs?.mode).toBe('static');
    expect(done.attrs?.target_static).toBe('/');
  });
  test('a recovery check cannot be passed by an account that has nothing to check', () => {
    // An account without an authenticator reaches no validate stage; the refusal at 22 catches it unless the
    // activation window is open. Both validate stages deny, never configure, when nothing is enrolled.
    for (const name of ['tak-recovery-validate-user', 'tak-recovery-validate-admin']) {
      const stage = entry(flows, 'authentik_stages_authenticator_validate.authenticatorvalidatestage', { name });
      expect(stage.attrs?.not_configured_action).toBe('deny');
    }
    // an administrator proves a passkey; recovery codes are never accepted for one
    const admin = entry(flows, 'authentik_stages_authenticator_validate.authenticatorvalidatestage', {
      name: 'tak-recovery-validate-admin'
    });
    expect(admin.attrs?.device_classes).toEqual(['webauthn']);
    // the email stage must not switch a suspended user back on
    expect(entry(flows, 'authentik_stages_email.emailstage', { name: 'tak-recovery-email' }).attrs?.activate_user_on_success).toBe(false);
  });
  test('the refusal reads the user again, so a suspended account or newer attributes are not overwritten by an old copy', () => {
    // A flow keeps a copy of the identified user from the moment its link was made. Without the refresh the
    // password write saved that copy over the current row: it switched a suspended account back on.
    const expression = String(
      entry(flows, 'authentik_policies_expression.expressionpolicy', { name: 'tak-recovery-refuse' }).attrs?.expression
    );
    expect(expression).toContain('user = User.objects.get(pk=request.user.pk)');
    expect(expression).toContain("plan.context['pending_user'] = user");
    // the refresh comes before every decision
    const refresh = expression.indexOf("plan.context['pending_user'] = user");
    for (const decision of ['user.is_active', "name='tak-break-glass'", 'ak_user_has_authenticator(user)', "user.attributes.get('tak_activation_expires')"]) {
      expect(expression.indexOf(decision)).toBeGreaterThan(refresh);
    }
    // an unknown user (no primary key) is refused
    expect(expression).toContain('if not request.user.pk:\n    return True');
  });
  test('the activation window is closed when missing, unreadable or past, and has no say over a user with an authenticator', () => {
    const expression = String(
      entry(flows, 'authentik_policies_expression.expressionpolicy', { name: 'tak-recovery-refuse' }).attrs?.expression
    );
    expect(expression).toContain('if ak_user_has_authenticator(user):\n    return False');
    expect(expression).toContain('if not value:\n    return True');
    expect(expression).toContain('except ValueError:\n    return True');
    expect(expression).toContain('return expires <= datetime.now(timezone.utc)');
    expect(expression).toContain('if not user.is_active:\n    return True');
  });
  test('deletes the login stage the recovery flow used to have', () => {
    const deleted = cleanup.map((e) => `${e.model}:${JSON.stringify(e.identifiers)}`);
    expect(deleted).toContain('authentik_stages_user_login.userloginstage:{"name":"tak-recovery-user-login"}');
    // and the refusal policies that tak-recovery-refuse replaced
    expect(deleted).toContain('authentik_policies_expression.expressionpolicy:{"name":"tak-recovery-user-inactive"}');
    expect(deleted).toContain('authentik_policies_expression.expressionpolicy:{"name":"tak-recovery-not-activatable"}');
  });
});
