# Parameters Management

The `lib/parameters.ts` module provides centralized parameter management for the TAK Authentication Infrastructure project. It supports cascading parameter resolution with multiple sources and validation.

## Parameter Resolution Priority

Parameters are resolved in the following order (highest to lowest priority):

1. **CDK Context** - Parameters passed via `--context` flag
2. **Environment Variables** - System environment variables
3. **Default Values** - Built-in defaults defined in the module

## Available Parameters

### Auth Infrastructure Parameters

| Parameter | Environment Variable | Default | Description |
|-----------|---------------------|---------|-------------|
| `stackName` | `STACK_NAME` | `'MyFirstStack'` | Deployment environment (dev, prod, staging) |
| `envType` | `ENV_TYPE` | `'dev-test'` | Environment type (prod, dev-test) |
| `gitSha` | `GIT_SHA` | Auto-detected | Git SHA for container image tagging (automatically detected from git repository, can be overridden with environment variable) |
| `enableExecute` | `ENABLE_EXECUTE` | `'false'` | Enable ECS Exec for debugging |
| `authentikAdminUserEmail` | `AUTHENTIK_ADMIN_USER_EMAIL` | `''` | Admin user email ⚠️ **Required** |
| `authentikLdapBaseDn` | `AUTHENTIK_LDAP_BASE_DN` | `'DC=example,DC=com'` | LDAP base DN |
| `ipAddressType` | `IP_ADDRESS_TYPE` | `'dualstack'` | Load balancer IP type |

**Note**: Docker images are automatically sourced from ECR using the pattern: `${account}.dkr.ecr.${region}.amazonaws.com/TAK-${stackName}-BaseInfra:auth-infra-*-${gitSha}`

### LDAP Parameters

| Parameter | Environment Variable | Default | Description |
|-----------|---------------------|---------|-------------|
| `stackName` | `STACK_NAME` | `'MyFirstStack'` | Deployment environment |
| `envType` | `ENV_TYPE` | `'dev-test'` | Environment type |
| `gitSha` | `GIT_SHA` | Auto-detected | Git SHA for container image tagging (automatically detected from git repository, can be overridden with environment variable) |
| `enableExecute` | `ENABLE_EXECUTE` | `'false'` | Enable ECS Exec for debugging |
| `authentikHost` | `AUTHENTIK_HOST` | `''` | Authentik host URL ⚠️ **Required** |

**Note**: SSL Certificate ARN is automatically retrieved from the BaseInfra stack export `TAK-{stackName}-BaseInfra-CERTIFICATE-ARN` and does not need to be configured as a parameter. Docker images are automatically sourced from ECR.

## Setting Parameters

### Method 1: CDK Context (Recommended for CI/CD)

```bash
npx cdk deploy --context project=MyCompany \
               --context stackName=Primary \
               --context envType=prod \
               --context authentikAdminUserEmail=admin@company.com
```

### Method 2: Environment Variables

```bash
# Development
export PROJECT=MyCompany
export STACK_NAME=Development
export ENV_TYPE=dev-test
export ENABLE_EXECUTE=true
npx cdk deploy
```

```bash
# Production
export PROJECT=MyCompany
export STACK_NAME=Production
export ENV_TYPE=prod
export AUTHENTIK_ADMIN_USER_EMAIL=admin@company.com
export ENABLE_EXECUTE=false

npx cdk deploy
```

### Method 3: .env File (Development)

Create a `.env` file in the project root:

```bash
PROJECT=MyCompany
STACK_NAME=Primary
ENV_TYPE=dev-test
AUTHENTIK_ADMIN_USER_EMAIL=admin@example.com
AUTHENTIK_LDAP_BASE_DN=DC=company,DC=com
ENABLE_EXECUTE=true
```

## Automatic Git SHA Detection

The `gitSha` parameter is automatically detected from the current git repository when the CDK is executed. This eliminates the need for manual input while ensuring accurate version tracking:

- **Automatic Detection**: The system runs `git rev-parse HEAD` to get the current commit SHA
- **Full SHA Format**: Returns the complete 40-character SHA hash (e.g., `7e696824b7c12836338e52725cdec1ac96e9db5d`)
- **Environment Variable Override**: You can still override the detected value using `GIT_SHA=your-custom-sha`
- **Fallback**: If git is not available or fails, it falls back to `'latest'`

This automatic detection ensures that:
1. Container images are tagged with the exact commit they were built from
2. Deployments can be traced back to specific code versions
3. No manual input is required for version tracking

## Best Practices

1. **Use CDK Context for CI/CD**: Pass parameters via `--context` in automated deployments
2. **Use Environment Variables for Development**: Set environment variables in your development environment
3. **Validate Early**: Always validate parameters before using them in constructs
4. **Document Required Parameters**: Clearly document which parameters are required for each stack
5. **Use Type Safety**: Leverage TypeScript interfaces for parameter validation
6. **Environment-Specific Defaults**: Use different defaults for different environments
