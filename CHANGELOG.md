# CHANGELOG

## Emoji Cheatsheet
- :pencil2: doc updates
- :bug: when fixing a bug
- :rocket: when making general improvements
- :white_check_mark: when adding tests
- :arrow_up: when upgrading dependencies
- :tada: when adding new features

## Version History

### Unreleased
### v2026.8.7
- :arrow_up: Bump Authentik to 2026.8.7 for both prod and dev-test (cdk.json, Dockerfile ARG defaults, README, docs/PARAMETERS.md and the package version). Upstream release notes: https://docs.goauthentik.io/releases/2026.8#fixed-in-202687. It includes ten security patch backports (notification webhook response, forward auth allowlist, kubeconfig validation, nginx forward auth path normalisation, JWT federation user matching, SAML inflate size limit, event email preview, notification hyperlink scheme, request smuggling, SMS override and policy engine fail-open), unique attribute checks that exclude the edited object (#27700), and `next` kept on the access denied page's cancel link (#27698)

- :arrow_up: Upgrade aws-cdk-lib to 2.278.0 and aws-cdk CLI to 2.1149.0. This release bundles `minimatch` 11.0.9, which clears the last `npm audit` findings (GHSA-g3hv-75wg-m249 and the `aws-cdk-lib` entry that depended on it); `npm audit` now reports 0 vulnerabilities at every severity level and Dependabot alert 147 can close. The "known residual" `minimatch` note below no longer applies
- :bug: Bump `buildRevision` from 2 to 3 for dev-test and prod. The image build skips a tag that already exists, so the `authentik-2026.8.6-tak-nz-r2` image pushed before the TAK flow blueprints merged was reused, and Demo ran without `tak-flows.yaml`. Bump `buildRevision` whenever anything baked into the images changes (blueprints, branding, templates) without a version change
- :tada: Add `authentik/blueprints/tak-flows.yaml` (TAK - Flows and sources): the login, passkey login, password change, user settings, enrollment, recovery and social login flows with their stages, prompts and policies, plus the Google and Apple login sources. Generated from a full export of the Demo instance with every database ID replaced by slug or name references. These were built by hand in the admin UI, so a rebuilt or new instance (for example preview.tak.nz) came up without them. The sources are created disabled with placeholder credentials and never overwrite credentials set in the UI; the first deploy to an existing instance takes over the flows and overwrites their settings with the file's (see docs/BLUEPRINTS.md)
- :tada: `tak-branding-change.yaml` now applies `tak-flows.yaml` first and sets `tak-auth` as the default brand's login flow
- :tada: Pass `TAK_TEAM_MANAGER_URL` (`https://<authentik.teamManagerHostname, default team>.<zone>`) to the Authentik server and worker, read by the enrollment flow's request-access redirect. New optional config `authentik.teamManagerHostname`
- :tada: Captcha on password recovery and login is created by the blueprint when `TAK_CAPTCHA_SITE_KEY` and `TAK_CAPTCHA_SECRET_KEY` are set in the Authentik containers; without them the blueprint leaves captcha alone. The stack does not set these yet
- :pencil2: Add docs/BLUEPRINTS.md: what each blueprint manages, which objects other stacks own (the OAuth2 providers and applications), the environment variables, the manual steps after a first deploy, and how to test a change
- :white_check_mark: Add test/unit/blueprint-env.test.ts for `TAK_TEAM_MANAGER_URL` on both Authentik containers

- :bug: Turn on `compatibility_mode` for the TAK login, passkey, source authentication, enrollment, recovery, password change and user settings flows in `tak-flows.yaml`, so password managers that cannot see into the flow's shadow DOM can autofill the password. Bump `buildRevision` from 3 to 4 for dev-test and prod because the blueprint is baked into the image. The Authentik default flows and `ldap-authentication-flow` are unchanged
- :bug: Fix the passkey button branding in `tak-branding-change.yaml` for flows in compatibility mode. With ShadyDOM the PatternFly reset and the button's own font-size beat the custom CSS, so "Use a security key" showed next to "Log in with Passkey" and the fingerprint icon overlapped the text. `font-size` and `padding-left` are now `!important`, and a `html[data-theme="dark"]` rule gives the dark icon, because `:host([theme="dark"])` does not match in compatibility mode. Bump `buildRevision` from 4 to 5 for dev-test and prod because the blueprint is baked into the image
- :bug: Restrict `ldap-identification-stage` in `ldap-authentication-flow` to `username` (was `username` and `email`). TAK Server binds as `cn=<typed value>,ou=users,...` and uses the typed value as the TAK user ID, and the LDAP outpost passes that `cn` to the identification stage unchecked. With `email` allowed, a user whose email differs from their username could log in with either and TAK Server created two users for one person. Logins with an email now fail. Outpost bind results are cached until the Authentik session expires (1 hour), so an email bind that succeeded shortly before the deploy can keep working for up to that long. Bump `buildRevision` from 5 to 6 for dev-test and prod because the blueprint is baked into the image
### v2026.8.6
- :arrow_up: Bump Authentik to 2026.8.6 for both prod and dev-test (cdk.json, Dockerfile ARG defaults, README and docs/PARAMETERS.md); upstream release is a bug-fix release, including the users-list superuser annotation split into two EXISTS subqueries (#26275), no DISTINCT on the users list when filtering by type (#26413) and batched cleanup of expired cache and channel records (#27587)
- :bug: Make the `AuthentikServer` and `AuthentikWorker` ECS services wait for the EFS mount targets (`efs.fileSystem.mountTargetsAvailable`). The task definitions only reference the file system by ID, so the services were created as soon as the file system existed, before its mount targets were available (36 to 51 seconds earlier on a fresh `TAK-Akl-AuthInfra` deploy in ap-southeast-6). The first tasks then failed with `ResourceInitializationError: ... Failed to resolve "fs-xxx.efs.<region>.amazonaws.com"`, and on a slow run that trips the ECS deployment circuit breaker and rolls the stack back (#153). It only shows on a new deploy: the file system and mount targets already exist for a running environment.
- :tada: Add a container health check to the LDAP outpost that binds as the TAK service account through the outpost itself (`docker/authentik-ldap/bindprobe`, a static Go binary baked into the distroless image). The outpost caches every bind result in memory, failures included (in the incident below it was never refreshed), so after an Authentik outage it can keep returning "Invalid Credentials" to TAK Server while the process looks healthy; this was seen on `TAK-Demo-AuthInfra` after the 2026-11-13 to 2026-11-16 database overload, and only replacing the task cleared it. Authentik's own `/ldap healthcheck` only proves the process is up. Five failures 30 s apart (after a 300 s start period) make ECS replace the task. The `Ldap` construct now takes `ldapServiceUser` and `ldapBaseDn`; the execution role gets read access to the service account secret. `buildRevision` goes from 1 to 2 for both profiles so the pipeline builds a new LDAP image (the task definition would otherwise reference a probe that the existing `r1` image does not contain)

- :arrow_up: Upgrade `golang.org/x/crypto` to 0.52.0 and `github.com/Azure/go-ntlmssp` to 0.1.1 in `docker/authentik-ldap/bindprobe` to clear Dependabot alerts 148-165. Both need Go 1.25 or newer, so the probe's `go.mod` is now `go 1.25.0` and the LDAP Dockerfile builder image is `golang:1.25-alpine`
- :rocket: Move the `dev-test` database from Aurora Serverless v2 (2 to 4 ACU, hardcoded) to one provisioned `db.t4g.large` writer, per item 2 of utils-infra `docs/COST_OPTIMIZATION.md` (estimated saving about $200 to $250 per month). The cluster sat at about 3 ACU all day, so Serverless v2 scaling had no benefit. The Demo pipeline's prod-window database override now passes `instanceClass=db.t4g.large` as well, so the writer is not flipped between serverless and provisioned on every run. `prod` is unchanged (`db.r7g.large` x 2). The existing cluster is converted in place by a writer instance class change, with a short outage. Check `CPUCreditBalance`, `FreeableMemory` and the connection count (about 60 connections) after deploying; the RDS Data API is already off on this cluster, so no extra step is needed
- :rocket: Right-size the `dev-test` Authentik worker from 2 vCPU / 4 GB to 1 vCPU / 4 GB (item 5 of utils-infra `docs/COST_OPTIMIZATION.md`; about $30 per month in Oregon and $35 in Sydney). Measured p99 CPU peak was 33% of 2 vCPU and peak memory 16% of 4 GB. Memory stays at 4 GB for headroom. This is the size the worker had before 2026-09-15. `prod` is unchanged (1 vCPU / 2 GB). Watch worker CPU after deploying; the worker restarts on deploy
- :tada: Enable Postgres read replicas (`enablePostgresReadReplicas`) for prod; dev-test stays disabled
- :pencil2: Remove the "read replicas are broken" warnings from docs/PARAMETERS.md, lib/stack-config.ts and lib/auth-infra-stack.ts; first-deploy failures with read replicas were fixed upstream in Authentik 2026.2.0 (goauthentik/authentik#15191, PR #19086), and this repo runs 2026.8.5
- :pencil2: Add a deployment guide troubleshooting entry for "Cannot update export LdapBaseDn" (deploying without the `ldapBaseDn` override a stack was originally deployed with)
- :arrow_up: Upgrade aws-cdk-lib to 2.275.0 and aws-cdk CLI to 2.1147.0
- :arrow_up: Add `minimatch` (>=11.0.1) and `glob` (>=14.0.2) overrides for GHSA-g3hv-75wg-m249 and GHSA-3g3m-2fjr-6pw4 (20 `npm audit` findings down to 7)
- :pencil2: Known residual `npm audit` findings: (1) minimatch 10.2.6 is bundled inside the aws-cdk-lib 2.275.0 tarball (synth-time asset globbing only), so overrides cannot reach it; tracked in aws/aws-cdk#39594 with fix PR #39595, expected to clear once a release bundles minimatch >=11.0.1; (2) deepmerge 4.3.1 (GHSA-gcqx-w48m-w2h4, low, dev-only via jest-config) has no patched release upstream

### v2026.8.5

- :arrow_up: Bump Authentik to 2026.8.5 for both prod and dev-test (cdk.json, Dockerfile ARG defaults, README and docs/PARAMETERS.md); upstream release is bug fixes only (endpoints MultipleObjectsReturned fix, Microsoft Entra group member handling, cert-related dependency bumps, web UI fixes)
- :arrow_up: Upgrade aws-cdk-lib to 2.274.0 and aws-cdk CLI to 2.1146.0 (constructs 10.8.1 is already the latest)
- :arrow_up: `npm audit` reports 0 vulnerabilities at every severity level (`npm audit --audit-level=low`); existing overrides kept and .npmrc note unchanged since aws-cdk-lib 2.274.0 still bundles a fixed brace-expansion

### v2026.8.4

- :arrow_up: Bump Authentik to 2026.8.4 for both prod and dev-test (cdk.json, Dockerfile ARG defaults, README and docs/PARAMETERS.md)
- :arrow_up: Upgrade aws-cdk-lib to 2.273.0 and aws-cdk CLI to 2.1145.0
- :arrow_up: `npm audit` now reports 0 vulnerabilities: aws-cdk-lib 2.273.0 bundles brace-expansion 5.0.12, which clears the previously documented residual finding (GHSA-q2hr-2g5m-vwhr, GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p); .npmrc note updated, existing overrides kept

### v2026.8.3

- :arrow_up: Bump Authentik to 2026.8.3
- :bug: Remove the temporary LDAP memory-searcher patch and custom build stage (PR #137 workaround); the LDAP image is now the plain upstream ghcr.io/goauthentik/ldap image, since the fix shipped upstream in 2026.8.3 (goauthentik/authentik#26028)
- :arrow_up: Upgrade aws-cdk-lib to 2.272.0 and aws-cdk CLI to 2.1144.0
- :arrow_up: Resolve npm audit findings: axios ^1.20.0, js-yaml >=5.4.1, jest ^30.5.2, @types/jest ^30.0.0, @swc/jest ^0.2.39, brace-expansion override >=5.0.12
- :pencil2: Known residual `npm audit` finding: brace-expansion 5.0.9 is bundled inside the aws-cdk-lib 2.272.0 tarball (used only at synth time for asset globbing), so overrides cannot reach it; tracked upstream in aws/aws-cdk#37390 and #38496 and expected to clear once aws-cdk-lib bundles brace-expansion >=5.0.12
- :rocket: Remove the device enrollment Lambda (src/enrollment-lambda), the Authentik OIDC provider setup (src/enroll-oidc-setup), the ALB OIDC listener-rule helper (src/enroll-alb-oidc-auth), the enrollment Route53 record and secret constructs, the enrollment cdk.json configuration and `enrollmentEnabled` context option, and the `preview:enrollment` tool; the feature has been disabled since #138 and device enrollment is handled by TAKTeamManager
- :rocket: Remove the Oidc* and Enrollment* CloudFormation outputs and exports (no other TAK-NZ stack imported them); this also stops exporting the enrollment OIDC client secret in plain text
- :rocket: Manual step: the Authentik application "TAK Device Enrollment" (slug `tak-device-activation`), the OAuth2 provider "TAK-Device-Activation" and the uploaded icon `application-icons/TAK-Enroll.png` are not removed automatically and must be deleted by hand in Authentik
- :pencil2: Remove docs/ENROLLMENT_GUIDE.md and enrollment references from the README and docs; refresh the test totals in test/TEST_ORGANIZATION.md
- :arrow_up: Remove dependencies only used by the enrollment Lambdas (axios, form-data, dotenv, @aws-sdk/client-secrets-manager, esbuild) along with the now-dead fast-xml-parser and follow-redirects overrides
- :arrow_up: Clear the 19 moderate `npm audit` findings (sprintf-js GHSA-hp3w-g68c-fv3c via jest's babel-plugin-istanbul chain) by pointing the `@istanbuljs/load-nyc-config` js-yaml override at the direct js-yaml dependency instead of js-yaml 3.x; only the bundled aws-cdk-lib brace-expansion finding remains (20 findings down to 1)

### v1.0.0

- :tada: Initial Release using Authentik

