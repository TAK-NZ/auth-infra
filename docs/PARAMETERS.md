# Parameters Management

The AuthInfra project uses a context-driven parameter management system that aligns with CDK best practices. All stack configuration is handled through CDK context parameters, providing clear separation between AWS credentials and stack configuration.

## Parameter Resolution Hierarchy

Parameters are resolved in the following order (highest to lowest priority):

1. **CDK Context** (highest precedence) - `--context` CLI parameters
2. **Environment Defaults** - Based on `envType` (prod vs dev-test)
3. **Built-in Defaults** - Hardcoded fallback values

## Environment-Specific Defaults

The stack automatically applies optimal defaults based on `envType`:

### Development/Test (`envType=dev-test`)
- **Database**: `db.t4g.micro`, single instance, 1-day backup retention
- **Redis**: `cache.t4g.micro`, single node, no failover
- **ECS**: 512 CPU / 1024 MB memory, 1-3 instances
- **Monitoring**: Basic logging, no CloudWatch alarms
- **Cost**: Optimized for minimal spend (~$106/month)

### Production (`envType=prod`)
- **Database**: `db.t4g.small`, multi-AZ, 7-day backup retention
- **Redis**: `cache.t4g.small`, multi-node, automatic failover
- **ECS**: 1024 CPU / 2048 MB memory, 2-6 instances
- **Monitoring**: Comprehensive alarms and extended log retention
- **Reliability**: High availability configuration (~$367/month)

## Parameter Reference

### Required Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `stackName` | string | Stack identifier (e.g., `MyFirstStack`, `ProdStack`) |

### Core Configuration

| Parameter | Type | Default (dev-test) | Default (prod) | Description |
|-----------|------|-------------------|----------------|-------------|
| `envType` | string | `dev-test` | - | Environment type: `prod` or `dev-test` |
| `authentikAdminUserEmail` | string | **Required** | **Required** | Admin user email for Authentik |
| `authentikLdapBaseDn` | string | `DC=example,DC=com` | `DC=example,DC=com` | LDAP base DN |
| `useEnvironmentFile` | boolean | `false` | `false` | Load environment variables from S3 authentik-config.env file |
| `gitSha` | string | auto-detected | auto-detected | Git SHA for resource tagging |
| `enableExecute` | boolean | `false` | `false` | Enable ECS exec for debugging |
| `hostnameAuthentik` | string | `account` | `account` | Hostname for Authentik service DNS records |
| `hostnameLdap` | string | `ldap` | `ldap` | Hostname for LDAP service DNS records |

### Infrastructure Overrides

| Parameter | Type | Default (dev-test) | Default (prod) | Description |
|-----------|------|-------------------|----------------|-------------|
| `dbInstanceClass` | string | `db.t4g.micro` | `db.t4g.small` | RDS instance class |
| `dbInstanceCount` | number | `1` | `2` | Number of RDS instances |
| `redisNodeType` | string | `cache.t4g.micro` | `cache.t4g.small` | Redis node type |
| `ecsTaskCpu` | number | `512` | `1024` | ECS task CPU units |
| `ecsTaskMemory` | number | `1024` | `2048` | ECS task memory (MB) |
| `enableDetailedLogging` | boolean | `true` | `true` | Enable detailed CloudWatch logging |

## Deployment Examples

### Basic Development Deployment

```bash
npx cdk deploy --context envType=dev-test \
               --context stackName=MyFirstStack
```

### Production Deployment

```bash
npx cdk deploy --context envType=prod \
               --context stackName=ProdStack \
               --context authentikAdminUserEmail=admin@company.com
```

### Custom Configuration

```bash
npx cdk deploy --context envType=dev-test \
               --context stackName=TestStack \
               --context dbInstanceClass=db.t4g.small \
               --context redisNodeType=cache.t4g.small \
               --context authentikAdminUserEmail=admin@company.com \
               --context enableDetailedLogging=true
```

### Using S3 Environment File

```bash
# Deploy with S3 environment file enabled (assumes authentik-config.env exists in S3)
npx cdk deploy --context envType=dev-test \
               --context stackName=MyStack \
               --context authentikAdminUserEmail=admin@company.com \
               --context useEnvironmentFile=true
```

## S3 Environment File Configuration

The stack can optionally load environment variables from an S3-stored configuration file for Authentik containers.

### Configuration

| Parameter | Description |
|-----------|-------------|
| `useEnvironmentFile` | When `true`, ECS containers will load environment variables from S3 |
| **S3 Path** | `{stackName}/authentik-config.env` in the configuration bucket |
| **Default Behavior** | Environment file is **not** loaded (containers use only CDK-defined environment variables) |

### Prerequisites

Before enabling `useEnvironmentFile=true`, ensure:

1. **File exists**: `authentik-config.env` must exist in S3 at `{stackName}/authentik-config.env`
2. **Proper format**: File should contain environment variables in `KEY=value` format
3. **S3 permissions**: ECS tasks have read access to the configuration bucket (handled automatically)

### Example Usage

```bash
# Deploy without S3 environment file (default)
npx cdk deploy --context stackName=MyStack

# Deploy with S3 environment file
npx cdk deploy --context stackName=MyStack \
               --context useEnvironmentFile=true
```

### File Location

For `stackName=MyStack`, the file should be located at:
```
s3://tak-mystack-config-bucket/MyStack/authentik-config.env
```

## AWS Credentials

AWS credentials are handled separately from stack configuration:

```bash
# Option 1: AWS Profile (recommended)
aws configure --profile tak
export AWS_PROFILE=tak

# Option 2: Environment variables (AWS credentials only)
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_REGION=$(aws configure get region)

# Option 3: IAM roles for CI/CD
# AWS credentials automatically available in CI/CD environments
```

## Stack Naming Convention

Stack names follow the pattern: `TAK-<stackName>-AuthInfra`

Examples:
- `--context stackName=MyFirstStack` → `TAK-MyFirstStack-AuthInfra`
- `--context stackName=ProdStack` → `TAK-ProdStack-AuthInfra`
- `--context stackName=TestEnv` → `TAK-TestEnv-AuthInfra`

## Resource Imports

The AuthInfra stack imports resources from the BaseInfra stack using the pattern:
`TAK-<stackName>-BaseInfra-<resource>`

Required BaseInfra exports:
- `TAK-<stackName>-BaseInfra-VPC-ID`
- `TAK-<stackName>-BaseInfra-Kms-ARN`
- `TAK-<stackName>-BaseInfra-Ecs-ARN`
- `TAK-<stackName>-BaseInfra-S3ConfBucket-ARN`
- `TAK-<stackName>-BaseInfra-Ecr-ARN`

## Configuration Benefits

**Cleaner separation**: AWS credentials (env vars) vs stack config (CDK context)

**Better CI/CD integration**: Parameters explicitly defined in deployment commands

**Type safety**: Full TypeScript typing for all parameters

**Environment consistency**: Structured defaults for dev-test vs prod

**Cost optimization**: Environment-specific defaults (dev-test optimized for cost)

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
