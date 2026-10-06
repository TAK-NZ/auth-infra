# CHANGELOG

## Emoji Cheatsheet
- :pencil2: doc updates
- :bug: when fixing a bug
- :rocket: when making general improvements
- :white_check_mark: when adding tests
- :arrow_up: when upgrading dependencies
- :tada: when adding new features

## Version History

### Pending Release

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

