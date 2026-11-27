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
