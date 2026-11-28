# Authentik blueprints

The Authentik server and worker images carry every file in `authentik/blueprints/` (copied to
`/blueprints/tak/` by `docker/authentik-server/Dockerfile.*`). Authentik applies a blueprint when it is
discovered at startup and again whenever the file changes, so a change here needs a new image and a
redeploy. See [Scoped service accounts](SCOPED_SERVICE_ACCOUNTS.md) for the service account blueprints.
### Applied on every deploy
Authentik's own discovery is not enough for the login rules. It runs in whichever worker is up, and during a
deployment that is often the old one, which then finds nothing new (the new worker's startup tasks get
consumed by the draining one, and the next discovery is the hourly run). It also ignores a change that comes
only from an environment variable. So the Lambda of the `LdapTokenRetriever` custom resource, which runs on
every deploy, applies `tak-ldap-setup.yaml`, `tak-branding-change.yaml` (which applies `tak-flows.yaml`
first) and then `tak-cleanup.yaml`, waits for each result and fails the deploy when one does not succeed. The
custom resource depends on the server and worker ECS services, so it starts after the old tasks are gone. If
Authentik has not registered a file yet, the Lambda creates the blueprint instance.
`tak-cloudtak-setup.yaml` and `tak-teammanager-setup.yaml` are left to Authentik's own discovery: they need
objects that other stacks create, and do not apply on an instance without them.

| File | Blueprint name | What it manages |
|---|---|---|
| `tak-ldap-setup.yaml` | TAK - LDAP Setup | LDAP service account, LDAP flow, provider, application and outpost |
| `tak-cloudtak-setup.yaml` | TAK - CloudTAK Service Account Setup | Scoped service account for CloudTAK |
| `tak-teammanager-setup.yaml` | TAK - TAKTeamManager Service Account Setup | Scoped service account for Team Manager |
| `tak-flows.yaml` | TAK - Flows and sources | Login, passkey login, password change, user settings, enrollment and recovery flows, with their stages, prompts and policies, the MFA rules, the password policy and the IP lock on the login and recovery flows. The name predates the removal of the social login sources and stays, because other blueprints refer to it |
| `tak-cleanup.yaml` | TAK - Cleanup of removed objects | Deletes objects that earlier versions created (the Google and Apple sources and their flows, the captcha stage, the administrator-only MFA stage, the second passkey flow `tak-passwordless-flow`, the flow `tak-password-change`, the login stage of the recovery flow). Can be deleted once every instance has applied it |
| `tak-branding-change.yaml` | TAK - Branding change | Default brand: custom CSS (passkey button label, hidden Connected services tab and Save button), the user settings flow, English as the language, `tak-auth` as the login flow and `tak-recovery-flow` as the recovery flow. Applies `tak-flows.yaml` first |

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
after changing `authentik.ipLock` (or any variable in this table) the file does not change, so Authentik
would not apply it. The deploy applies the blueprints itself (see above) and picks the new value up. Do not
switch the lock off by disabling the policy binding. A stage binding with no enabled policy always runs, and
the deny stage would then deny everybody.

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

### MFA
Every human ends a web login with at least two authenticators, at least one of them a passkey or an
authenticator app. Recovery codes count as the second authenticator, as one authenticator however many codes
there are, and only while unused codes are left. Administrators (members of a group with superuser rights) hold at
least one passkey, which is all their login accepts, and at least two authenticators in all: the second is the
recovery codes, which no login or recovery check accepts from an administrator. SMS, email codes and Duo are not offered. Members of the
`tak-break-glass` group cannot sign in on the web at all. The rules are checked at every login, so an account
that has fewer authenticators (an older account, or a device that was removed) is sent to enrol before it
gets a session.
`tak-auth`, after the identification stage (order 10):
| Order | Stage | Runs for |
|---|---|---|
| 15 | `tak-authentication-break-glass-deny` | members of `tak-break-glass` |
| 20 | `tak-authentication-mfa-validation-user` (passkey, authenticator app or recovery code) | an ordinary user with any authenticator |
| 21 | `tak-authentication-mfa-validation-admin-fallback` (authenticator app or recovery code) | an administrator who has authenticators but no passkey: a password alone does not add a passkey to such an account |
| 22 | `tak-authentication-mfa-validation-admin` (passkey; enrols the first one if there is none) | an administrator |
| 30 | `tak-authentication-mfa-enrol` (passkey or authenticator app) | an ordinary user with no passkey and no authenticator app |
| 40 | the recovery code setup stage | an ordinary user with fewer than two authenticators |
| 41 | the recovery code setup stage | an administrator with fewer than two authenticators |
| 100 | `tak-authentication-login` | everybody |
An administrator needs one passkey and one more authenticator, which is the recovery codes. It used to need two
passkeys, but Authentik asks the browser to register a passkey without listing the ones that already exist, so a
second passkey made on the same device or password manager **replaces** the first one: the account would hold two
records and one working passkey. The first passkey is registered in the validate stage at order 22, or in the
recovery flow for a first activation (a screen, `tak-admin-passkey-intro`, then the registration, at orders 55 and 56).
#### Retired bindings on an instance that had them
The bindings that asked for a second passkey are not in the file any more, but a blueprint cannot delete a binding,
so Test and any instance that deployed the earlier version still has them: `tak-auth` orders 24 and 25, `tak-passkey`
13 and 14, and `tak-recovery-flow` 51 to 54 (the screen `tak-admin-passkey-intro` and the stage
`default-authenticator-webauthn-setup`). They never run: the policy `tak-mfa-fewer-than-two-passkeys`, which gates
them, now never passes. **Do not delete that policy** while such bindings may exist, because they would then run for
every administrator. To tidy up, delete the bindings by hand, in **Flows and Stages > Flows >** the flow **> Stage
Bindings**, or with `DELETE /api/v3/flows/bindings/<id>/` (find the id with
`GET /api/v3/flows/bindings/?target=<flow id>&ordering=order`). A new instance never gets them.
`tak-passkey` (the passkey button and passkey autofill on the login page) applies the same rules at orders 12,
14 and 16 before its login stage at 20, because a passkey login there never visits `tak-auth`. The stages at
15 to 40 are bound with policy engine mode *all*, to the policies `tak-mfa-is-admin`, `tak-mfa-is-break-glass`,
`tak-mfa-has-authenticator`, `tak-mfa-has-passkey-or-app`, `tak-mfa-fewer-than-two-passkeys` and
`tak-mfa-fewer-than-two-authenticators`, which are expression policies that look at the user who has just
been identified. A user who signs in with only a recovery code is asked for it, and then has to enrol a
passkey or authenticator app.
The three setup stages are the ones from Authentik's default blueprints, renamed in place: *Passkey* (a
discoverable credential, user verification required), *Authenticator app* and *Recovery codes* (10 codes). The
user settings page lists them by that name. Authentik's default blueprint resets the names when it changes
(after an upgrade), and the next deploy applies this file again. The device type column and some labels
inside the stages ("Security key", "Recovery keys") come from Authentik and cannot be renamed from a blueprint.
**Changing authenticators.** The three setup flows (`default-authenticator-*-setup`, which the user settings
page links to) start with a validate stage at order -20 (ordinary users) or -10 (administrators): the user proves
possession of an existing authenticator (NZISM 16.1.36). Authentik remembers a passed check for 5 minutes in the
cookie `authentik_mfa`, so one check covers all three flows in that browser for that time. A user who has just
enrolled has not passed the check yet and is asked once. An administrator is asked for a passkey, which the browser
offers straight away; an ordinary user first chooses between a passkey and a recovery code or authenticator app. A
screen in front of the check ("Confirm it is you", order -30, shown only when the check will run, which the policy
`tak-mfa-reauth-needed` decides from the cookie) says why, and the flows are titled for what they add: *Add a
passkey*, *Add an authenticator app* and *Get recovery codes*. Removing a device cannot be gated by a flow, because
it is an API call.
**Flows this stack does not use.** The default login flow `default-authentication-flow` and the default
password change flow `default-password-change` stay on every instance, so each starts with the deny stage
`tak-flow-disabled-deny` (order -100). The copy of the passkey flow `tak-passwordless-flow`, which only the
Demo and Test instances had, is deleted by `tak-cleanup.yaml`.
### Activation and recovery
`tak-recovery-flow` serves first activation and recovery. Both start with an identified user, either through the
email link of the self-service recovery or through the one-time link that TAK Team Manager makes with
`POST /api/v3/core/users/{id}/recovery/` (valid 24 hours, used up the first time it is opened; it skips the
identification and email stages). Team Manager also sets the user attribute `tak_activation_expires` (an ISO 8601
time, 7 days ahead) when it sends the link. After the identified user:
| Order | Stage | Runs for |
|---|---|---|
| 22 | `tak-recovery-deny`, decided by the policy `tak-recovery-refuse` | an inactive account, a member of `tak-break-glass`, or an account with no authenticator and no open activation window |
| 25 | `tak-recovery-verify-intro`, a screen "Confirm it is you" | a user with an authenticator |
| 26 | `tak-recovery-validate-user` (passkey, authenticator app or recovery code) | an ordinary user with an authenticator |
| 27 | `tak-recovery-validate-admin` (passkey) | an administrator with an authenticator; one with none of its own passkeys is refused and needs an administrator reset |
| 30, 40 | new password (with `tak-password-policy`) and write | everybody |
| 45 | `tak-recovery-enrol-intro`, a screen "Add a second step to your sign-in" | a user who still has to enrol (policy `tak-mfa-needs-enrolment`) |
| 50 to 60 | the enrolment stages and rules of `tak-auth` | a user with fewer than two authenticators (a first activation) |
| 90 | `tak-recovery-finished`, a screen "Your password is saved" | everybody |
| 100 | `tak-recovery-done`, a redirect to `/` | everybody |
The flow title is "Your TAK.NZ account", because one flow serves activation and recovery. Authentik's own stages (the
choice of an authenticator, the passkey registration, the recovery codes) carry no explanation and their text cannot
be changed from a blueprint. So the password screen has a heading and a description (which differ for a first
activation, an administrator and a recovery), and the three screens above are prompt stages that hold only static
text, placed in front of or after those stages. Static prompt fields accept HTML and, with `initial_value_expression`,
a Python expression that sees the identified user as `user`. They need a non-blank label.
`tak-recovery-refuse` first reads the user again from the database and puts that copy into the flow. A flow keeps
a copy of the identified user from the moment its link was made (up to 24 hours), and Authentik's user write stage
saves that copy over the current row. Without the refresh, a link made before an account was suspended switched
the account back on when the password was set, and attributes that Team Manager had changed in the meantime were
reverted. The same read makes the activation window count as it is now, not as it was when the link was made.
A user who already has an authenticator proves possession of one **before** the new password prompt, so an email
link alone cannot reset a password (NZISM 16.1.36). The flow has no login stage: the user ends at the login page
and signs in under the rules of `tak-auth`, so there is no session after an email link. An account that has no
authenticator and no open activation window (for example one whose devices an administrator removed, until a new
link is sent) is refused. Opening a link does not switch a suspended account back on (`activate_user_on_success`
is off on the email stage). The redirect goes to `/`, not to the login flow, so that the flow token in the URL is
not carried along.
### Passwords
`tak-password-policy` asks for at least 16 characters, with no rules on the kind of characters (NZISM
16.1.31), and a zxcvbn strength estimate, which runs inside Authentik and rejects common and predictable
passwords. It is on the password prompt of the recovery flow and of the password change flow. The check against
the list of breached passwords (`check_have_i_been_pwned`) is off: it sends a hash prefix of the password to
api.pwnedpasswords.com, and a password change fails while that service cannot be reached.
The password change flow is `tak-change-password` (the earlier `tak-password-change` ran the shared default
stages, which a blueprint cannot unbind, and is deleted by `tak-cleanup.yaml`). The user settings page reaches it
through the password stage `tak-authentication-password`, the only password stage with a configure flow, so
the page lists one "Change password" entry. The flow asks for the current password first (order 10). That is a
password stage, so wrong guesses lower the IP reputation and the flow ends after 3. An account without a
password yet skips it. The flow works only when opened from the user settings page: the password stage needs
the user that page puts into the flow.
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
- Objects from Authentik's own default blueprints (the user settings flow and stage, the password prompt
  fields, and the like) are referenced, not redefined. The blueprint applies those default blueprints first.
  The login password stage is the exception: `tak-authentication-password` is a copy that this blueprint owns,
  because a change to `default-authentication-password` is reset whenever Authentik applies its own blueprint.
  The three authenticator setup stages are the other exception: they are renamed and tightened in place, and
  the deploy applies this file again after Authentik applies the default ones.
- User settings > User details is the flow `tak-user-settings`, which `tak-branding-change.yaml` sets on the
  default brand. It shows username, name and email as read-only fields and has no locale field. The tenant
  settings (*default user change name, email and username*) are off as well, and the validation policy
  `tak-user-settings-authorization` refuses a changed value. The brand CSS hides the Save button of that page
  (`ak-user-stage-prompt` is the stage element of the user settings only, so no other flow is affected), and
  the brand attribute `settings.locale` is `en`, so the interface is in English whatever the browser asks for.
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
- Do not use `absent` for a stage binding. Authentik fails on the second apply, when the binding is already
  gone. Delete the flow or the stage instead (which removes its bindings), as the cleanup file does.
- A stage binding with no policy needs `evaluate_on_plan: true` or `re_evaluate_policies: true`; one with
  policies that must be checked when the stage is reached needs `re_evaluate_policies: true`.
- A blueprint apply started by hand while the worker applies one fails on a database deadlock. Wait for the worker.
