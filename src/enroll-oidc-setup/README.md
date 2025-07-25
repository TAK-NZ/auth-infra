# Enrollment OIDC Setup

This Lambda function sets up an OIDC provider and application in Authentik for use with AWS ALB authentication.

## Overview

The function performs the following tasks:
1. Creates or updates an OAuth2 provider in Authentik
2. Creates or updates an application in Authentik
3. Sets up required scope mappings for OpenID Connect
4. Retrieves OIDC configuration endpoints for ALB setup
5. Returns client credentials and endpoint URLs

## OIDC Configuration

The function returns the following OIDC configuration values needed for ALB authentication:

| Value | Description | Example |
|-------|-------------|---------|
| `issuer` | Application-specific issuer | `https://account.tak.nz/application/o/tak-device-enrollment/` |
| `authorizeUrl` | Authorization endpoint | `https://account.tak.nz/application/o/authorize/` |
| `tokenUrl` | Token endpoint | `https://account.tak.nz/application/o/token/` |
| `userInfoUrl` | User info endpoint | `https://account.tak.nz/application/o/userinfo/` |
| `jwksUri` | JSON Web Key Set URI | `https://account.tak.nz/application/o/tak-device-enrollment/jwks/` |
| `clientId` | OAuth2 client ID | `abcdef123456` |
| `clientSecret` | OAuth2 client secret | `********` |

## Testing

To test the function locally:

1. Create a `.env` file with the required environment variables
2. Run `node test-local.js` to test the full function

> **Note:** The `.env` file is only used for local testing and is excluded from the Lambda deployment package. Environment variables for the Lambda function are set through the CDK construct.

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|----------|
| `AUTHENTIK_URL` | Authentik base URL | Yes | - |
| `AUTHENTIK_ADMIN_SECRET_ARN` | Secrets Manager ARN for admin token | Yes* | - |
| `AUTHENTIK_ADMIN_TOKEN` | Admin API token (local testing only) | Yes* | - |
| `PROVIDER_NAME` | OAuth2 provider name | Yes | - |
| `APPLICATION_NAME` | Application name | Yes | - |
| `APPLICATION_SLUG` | Application slug | No | Auto-generated from name |
| `REDIRECT_URIS` | JSON array of redirect URIs | Yes | - |
| `LAUNCH_URL` | Application launch URL | Yes | - |
| `OPEN_IN_NEW_TAB` | Open in new tab (true/false) | No | `false` |
| `GROUP_NAME` | Group to assign to application | No | - |
| `APPLICATION_DESCRIPTION` | Application description | No | - |
| `ICON_URL` | Application icon URL | No | - |
| `AUTHENTICATION_FLOW_NAME` | Authentication flow name | No | - |
| `AUTHORIZATION_FLOW_NAME` | Authorization flow name | No | `default-provider-authorization-implicit-consent` |
| `INVALIDATION_FLOW_NAME` | Invalidation flow name | No | `default-provider-invalidation-flow` |

*Either `AUTHENTIK_ADMIN_SECRET_ARN` (for Lambda) or `AUTHENTIK_ADMIN_TOKEN` (for local testing) is required.