# Authentik Setup Script

This script sets up an OAuth2 provider and application in Authentik for TAK enrollment.

## Features

- Creates or updates an OAuth2 provider with configurable flows
- Creates or updates an application linked to the provider
- Uploads an icon for the application
- Configures OAuth scopes (openid, email, profile)
- Handles existing resources gracefully

## Configuration

Configuration is done through environment variables. Copy `.env.example` to `.env` and adjust the values:

```bash
cp .env.example .env
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AUTHENTIK_API_ENDPOINT` | Authentik API endpoint | - |
| `AUTHENTIK_API_TOKEN` | Authentik API token | - |
| `TAK_SERVER_DOMAIN` | TAK server domain | - |
| `ENROLL_SERVER_DOMAIN` | Enrollment server domain | - |
| `PROVIDER_NAME` | OAuth2 provider name | TAK Enrollment OAuth Provider |
| `APP_NAME` | Application name | Enroll a device |
| `APP_SLUG` | Application slug | tak-enrollment |
| `AUTHN_FLOW` | Authentication flow slug (empty to disable) | default-authentication-flow |
| `AUTHZ_FLOW` | Authorization flow slug | default-provider-authorization-implicit-consent |
| `INVALIDATION_FLOW` | Invalidation flow slug | default-provider-invalidation-flow |
| `ICON_PATH` | Path to icon file | ./TAK-Enroll.png |
| `DEBUG` | Enable debug logging | false |

## Usage

### Local Development

```bash
# Install dependencies
npm install

# Run the script
npm run test
```

### AWS Lambda

The script is designed to be used as an AWS Lambda function. The main function is exported from `index.js`.

## Files

- `test-local.js` - Main script with all the logic
- `index.js` - Lambda entry point
- `.env` - Configuration file
- `.env.example` - Example configuration file
- `TAK-Enroll.png` - Default icon file