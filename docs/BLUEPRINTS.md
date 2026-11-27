# Authentik blueprints

The Authentik server and worker images carry every file in `authentik/blueprints/` (copied to
`/blueprints/tak/` by `docker/authentik-server/Dockerfile.*`). Authentik applies a blueprint when it is
discovered at startup and again whenever the file changes, so a change here needs a new image and a
redeploy. See [Scoped service accounts](SCOPED_SERVICE_ACCOUNTS.md) for the service account blueprints.

| File | Blueprint name | What it manages |
|---|---|---|
| `tak-ldap-setup.yaml` | TAK - LDAP Setup | LDAP service account, LDAP flow, provider, application and outpost |
| `tak-cloudtak-setup.yaml` | TAK - CloudTAK Service Account Setup | Scoped service account for CloudTAK |
| `tak-teammanager-setup.yaml` | TAK - TAKTeamManager Service Account Setup | Scoped service account for Team Manager |
| `tak-flows.yaml` | TAK - Flows and sources | Login, passkey login, password change, user settings, enrollment and recovery flows, with their stages, prompts and policies, and the IP lock on the login and recovery flows. The name predates the removal of the social login sources and stays, because other blueprints refer to it |
| `tak-cleanup.yaml` | TAK - Cleanup of removed objects | Deletes objects that earlier versions created (the Google and Apple sources and their flows, the captcha stage). Can be deleted once every instance has applied it |
| `tak-branding-change.yaml` | TAK - Branding change | Default brand: custom CSS, `tak-auth` as the login flow and `tak-recovery-flow` as the recovery flow. Applies `tak-flows.yaml` first |

## What is not here

The OAuth2 providers and applications are created by the stack that owns each integration, through its
own setup Lambda on every deploy: CloudTAK (`TAK-CloudTAK`, plus the SCIM provider when
`cloudtak.scimEnabled` is on), TAK Team Manager (`TAK-TeamManager` and the TAK Device Enrollment link tile)
and WebTAK in tak-infra (`TAK-WebTAK`). Do not add them as blueprints: two writers on one object overwrite
each other.

Users, tokens and passwords are data, not configuration. They are not in any blueprint. The one group in a
blueprint is the empty `tak-break-glass` group that flow rules refer to; the stack that creates a break-glass
account adds it to the group. Moving a
live instance needs a database restore, see [below](#moving-or-recreating-an-instance).

## tak-flows.yaml

One file, because the objects reference each other in a circle (the identification stage links the recovery
and enrollment flows, and the IP lock policy is bound to two flows). It was generated from a full export of
the Demo instance, with every database ID replaced by the object's slug or name so it applies to any
instance.

Every object is identified by slug or name. On an instance where the flows were first built in the admin UI,
the blueprint adopts them in place. **The first deploy overwrites the settings of those objects with the
file's.** Anything changed in the UI afterwards on objects listed in the file is reset the next time the
blueprint applies; change them in the file instead.

Applying takes around 35 seconds, most of it Authentik's own bookkeeping, and the worker does it in the
background.

### Settings that come from the environment

Entries with `conditions` are skipped while their variables are empty, and objects that already exist are
left as they are (a blueprint never deletes).

| Variable | Set by | Used for | If empty |
|---|---|---|---|
| `TAK_TEAM_MANAGER_URL` | The stack: `https://<authentik.teamManagerHostname, default team>.<zone>` | The request-access redirect stage of the `tak-enrollment` flow | The stage and its binding are skipped, so the enrollment flow has no steps |
| `TAK_IP_LOCK_THRESHOLD` | The stack, when `authentik.ipLock.enabled` is true (`authentik.ipLock.threshold`, default -5) | The reputation score at or below which the IP lock denies the login and recovery flows | `-1000000`, far below any score a real IP reaches, so the lock is off |

This is a plain variable read by an attribute, not a `conditions` entry: the policy exists either way and
the value decides whether it can ever match. **Authentik applies a blueprint only when its file changes**, so
after changing `authentik.ipLock` (or any variable in this table) and deploying, apply *TAK - Flows and
sources* yourself: **System > Blueprints**, or `POST /api/v3/managed/blueprints/<id>/apply/`. The new value
is not picked up before that. Do not switch the lock off by disabling the policy binding. A
stage binding with no enabled policy always runs, and the deny stage would then deny everybody.

### IP lock

`tak-ip-lock-deny` is a deny stage at order 5 of `tak-auth` and `tak-recovery-flow`, bound to the reputation
policy `tak-brute-force-protection`. The policy passes when the source IP's score is at or below the
threshold, so only an IP that has failed too often reaches the deny stage. Authentik subtracts one point for
each failed login or failed identification, and keeps it for `AUTHENTIK_REPUTATION__EXPIRY` seconds (the stack
sets `authentik.ipLock.windowSeconds`, default 900).

Scores are kept per IP and username, and Authentik limits each one to -5 (tenant settings *Reputation lower
limit*, default -5). The policy adds up the scores of every username seen from the IP. So the default
threshold of -5 locks an IP after five failures against one username, or five failures spread over several.
A threshold below -5 is reached only by failures against at least two usernames, so guessing one account from
one IP is never locked by it. Behind a shared address (an agency NAT) the sum covers everybody, so a lock can
stop the people sharing that address for up to the window. Raise the limits under **System > Settings** if you
need the threshold to count more failures. The login password stage `tak-authentication-password` also
cancels the flow after 3 wrong passwords.

There is no per-account lock on purpose: it would let anyone lock out a known user, and a lock decided after
the password check shows whether the password was right. The IP lock only protects if the client IP is
trustworthy, so enable it after the WAF rule for client-supplied forwarding headers is on `block`, see
[WAF.md](WAF.md). The LDAP flow has no IP lock: every LDAP bind comes from the VPC's NAT address.

### Removed objects

The Google and Apple login sources, their flows (`tak-source-authentication`,
`tak-source-enrollment-email-verification`) and the reCAPTCHA stage are gone. A blueprint never deletes, so
`tak-cleanup.yaml` deletes them on instances that still have them. Deleting a source also deletes the links
that users have to it, so check for users who only sign in through a source before the first deploy.

### Recovery links
`POST /api/v3/core/users/{id}/recovery/` (used by TAK Team Manager to issue a one-time link) only works when the
default brand has a recovery flow, so `tak-branding-change.yaml` sets `flow_recovery` to `tak-recovery-flow`.
- `default-recovery-skip-if-restored` passes only when the flow was not restored from a link, so a link issued
  for a known user skips the identification stage. The upstream expression (`bool(is_restored, True)`) is always
  true and never skipped it.
- `tak-recovery-email` has `activate_user_on_success: false`. With `true`, opening any valid link switched a
  suspended user back to active, even when a later stage then denied the flow.
### Left out on purpose

- `default-recovery-*` (a policy and two prompts) are defined here under their existing names. They came from
  Authentik's example recovery blueprint, which this stack does not apply.
- Objects from Authentik's own default blueprints (the `default-password-change` flow, the password change and
  user settings stages, and the like) are referenced, not redefined. The blueprint applies those default
  blueprints first. The login password stage is the exception: `tak-authentication-password` is a copy that
  this blueprint owns, because a change to `default-authentication-password` is reset whenever Authentik
  applies its own blueprint.
- Four unused prompt fields (`tak-user-settings-field-region`, `-color`, `-callsign`, `-role`) and the stage
  `tak-oauth-user-login` exist in Demo but belong to no flow. They are not in the blueprint and can be deleted
  in the UI.

## Moving or recreating an instance

- **A new environment (for example preview.tak.nz):** deploy this stack. The blueprints above recreate the
  login experience, the LDAP setup and the service accounts, and the stacks that own an OAuth2 provider create
  it on their own deploy. Users come from `tools/user-management/`; passwords cannot be exported, so set temporary ones.
- **The same domain in a new AWS account:** restore the database. A blueprint cannot carry passwords,
  passkeys, tokens or the certificate private keys. Copy the `Secret-Key` secret too: Authentik uses it to
  decrypt stored credentials, so the restored database needs the same value.

## Changing the file

`tak-flows.yaml` is long and was generated, but it is ordinary Authentik blueprint YAML and can be edited by
hand. After a change, test it on a throwaway instance rather than a deployed one: run a PostgreSQL container
plus the `ghcr.io/goauthentik/server` image as `server` and as `worker` (same version as `authentikVersion`),
mount `authentik/blueprints/` at `/blueprints/tak` in both, and run
`ak apply_blueprint /blueprints/tak/tak-flows.yaml` in the worker container.

Apply it twice: the second run must report no errors and create nothing. Things to know when editing:

- `PolicyBinding.target` for a flow must be `!KeyOf <flow entry id>`. `!Find` returns the flow's own ID, not
  the policy binding model ID the foreign key needs, and the entry then fails with a unique constraint error.
- A partial entry cannot update an existing stage (Authentik validates the whole object), so an entry for a
  stage lists all of its settings.
- A blueprint creates and updates; it never deletes. Removing an object from the file leaves it on every
  instance that has it. Add an `absent` entry to `tak-cleanup.yaml` as well.
