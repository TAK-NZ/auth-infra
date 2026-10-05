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

- :arrow_up: Bump Authentik to 2026.8.3
- :bug: Remove the temporary LDAP memory-searcher patch and custom build stage (PR #137 workaround); the LDAP image is now the plain upstream ghcr.io/goauthentik/ldap image, since the fix shipped upstream in 2026.8.3 (goauthentik/authentik#26028)
- :arrow_up: Upgrade aws-cdk-lib to 2.272.0 and aws-cdk CLI to 2.1144.0
- :arrow_up: Resolve npm audit findings: axios ^1.20.0, js-yaml >=5.4.1, jest ^30.5.2, @types/jest ^30.0.0, @swc/jest ^0.2.39, brace-expansion override >=5.0.12

### v1.0.0

- :tada: Initial Release using Authentik

