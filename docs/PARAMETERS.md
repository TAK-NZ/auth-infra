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
- **ECS**: 512 CPU / 1024 MB memory, 1 instance per service
- **Monitoring**: Basic logging, no CloudWatch alarms
- **Cost**: Optimized for minimal spend

### Production (`envType=prod`)
- **Database**: `db.t4g.small`, multi-AZ, 7-day backup retention
- **Redis**: `cache.t4g.small`, multi-node, automatic failover
- **ECS**: 1024 CPU / 2048 MB memory, 2 instances per service
- **Monitoring**: Comprehensive alarms and extended log retention
- **Reliability**: High availability configuration

## Parameter Reference

### Required Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `stackName` | string | Stack identifier (e.g., `Demo`, `Prod`) |
| `authentikAdminUserEmail` | string | Admin user email for Authentik setup |

### Optional Core Configuration

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `envType` | string | `dev-test` | Environment type: `prod` or `dev-test` |
| `project` | string | `TAK` | Project prefix for resource naming |
| `gitSha` | string | auto-detected | Git SHA for ECR image tagging |
| `enableExecute` | boolean | `false` | Enable ECS exec for debugging |
| `useAuthentikConfigFile` | boolean | `false` | Load environment variables from S3 authentik-config.env file |
| `ldapBaseDn` | string | `dc=example,dc=com` | LDAP base DN |
| `hostnameAuthentik` | string | `account` | Hostname for Authentik service DNS records |
| `hostnameLdap` | string | `ldap` | Hostname for LDAP service DNS records |

### Infrastructure Override Parameters

| Parameter | Type | Default (dev-test) | Default (prod) | Description |
|-----------|------|-------------------|----------------|-------------|
| `dbInstanceClass` | string | `db.t4g.micro` | `db.t4g.small` | RDS instance class |
| `dbInstanceCount` | number | `1` | `2` | Number of RDS instances |
| `redisNodeType` | string | `cache.t4g.micro` | `cache.t4g.small` | Redis node type |
| `ecsTaskCpu` | number | `512` | `1024` | ECS task CPU units |
| `ecsTaskMemory` | number | `1024` | `2048` | ECS task memory (MB) |
| `enableDetailedLogging` | boolean | `false` (dev) | `true` (prod) | Enable detailed CloudWatch logging |

## Deployment Examples

### Minimal Development Deployment

```bash
# Only required parameters
npx cdk deploy --context stackName=Demo \
               --context authentikAdminUserEmail=admin@example.com
```

### Production Deployment

```bash
# Production environment with high availability
npx cdk deploy --context envType=prod \
               --context stackName=Prod \
               --context authentikAdminUserEmail=admin@company.com
```

### Custom Configuration

```bash
# Development with custom infrastructure sizing
npx cdk deploy --context envType=dev-test \
               --context stackName=CustomDemo \
               --context authentikAdminUserEmail=admin@company.com \
               --context dbInstanceClass=db.t4g.small \
               --context redisNodeType=cache.t4g.small \
               --context ecsTaskCpu=1024 \
               --context ecsTaskMemory=2048 \
               --context enableDetailedLogging=true
```

### Development with Debugging

```bash
# Enable ECS exec for debugging
npx cdk deploy --context stackName=Debug \
               --context authentikAdminUserEmail=admin@example.com \
               --context enableExecute=true
```

### Using S3 Environment File

```bash
# Deploy with S3 environment file enabled (assumes authentik-config.env exists in S3)
npx cdk deploy --context stackName=ConfigDemo \
               --context authentikAdminUserEmail=admin@company.com \
               --context useAuthentikConfigFile=true
```

### Custom DNS Hostnames

```bash
# Custom hostnames for services
npx cdk deploy --context stackName=CustomDNS \
               --context authentikAdminUserEmail=admin@company.com \
               --context hostnameAuthentik=auth \
               --context hostnameLdap=directory \
               --context ldapBaseDn="dc=company,dc=local"
```

## S3 Environment File Configuration

The stack can optionally load environment variables from an S3-stored configuration file for Authentik containers.

### Configuration

| Parameter | Description |
|-----------|-------------|
| `useAuthentikConfigFile` | When `true`, ECS containers will load environment variables from S3 |
| **S3 Path** | `{stackName}/authentik-config.env` in the configuration bucket |
| **Default Behavior** | Environment file is **not** loaded (containers use only CDK-defined environment variables) |

### Prerequisites

Before enabling `useAuthentikConfigFile=true`, ensure:

1. **File exists**: `authentik-config.env` must exist in S3 at `{stackName}/authentik-config.env`
2. **Proper format**: File should contain environment variables in `KEY=value` format
3. **S3 permissions**: ECS tasks have read access to the configuration bucket (handled automatically)

### Example Usage

```bash
# Deploy without S3 environment file (default)
npx cdk deploy --context stackName=Demo \
               --context authentikAdminUserEmail=admin@example.com

# Deploy with S3 environment file
npx cdk deploy --context stackName=Demo \
               --context authentikAdminUserEmail=admin@example.com \
               --context useAuthentikConfigFile=true
```

### File Location

For `stackName=Demo`, the file should be located at:
```
s3://tak-demo-config-bucket/Demo/authentik-config.env
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
- `--context stackName=Demo` → `TAK-Demo-AuthInfra`
- `--context stackName=Prod` → `TAK-Prod-AuthInfra`
- `--context stackName=Test` → `TAK-Test-AuthInfra`

## Resource Imports

The AuthInfra stack imports resources from the BaseInfra stack using the pattern:
`TAK-<stackName>-BaseInfra-<resource>`

Required BaseInfra exports:
- `TAK-<stackName>-BaseInfra-VPC-ID`
- `TAK-<stackName>-BaseInfra-Kms-ARN`
- `TAK-<stackName>-BaseInfra-Ecs-ARN`
- `TAK-<stackName>-BaseInfra-S3ConfBucket-ARN`
- `TAK-<stackName>-BaseInfra-Ecr-ARN`

## DNS and Service Endpoints

The stack creates two separate DNS records for the services:

### Authentik Service
- **URL**: `https://{hostnameAuthentik}.{domainName}`
- **Default**: `https://account.{domainName}`
- **Purpose**: Main Authentik web interface and API
- **TLS**: Uses ACM certificate for the domain

### LDAP Service  
- **URL**: `ldaps://{hostnameLdap}.{domainName}:636`
- **Default**: `ldaps://ldap.{domainName}:636`
- **Purpose**: LDAP directory service endpoint
- **TLS**: Uses the same ACM certificate

## Architecture Benefits

**Context-driven Configuration**: All parameters passed via CDK context for better CI/CD integration

**Environment-aware Defaults**: Automatic configuration based on `envType` (dev-test vs prod)

**Type Safety**: Full TypeScript typing and validation for all parameters

**Resource Import Integration**: Seamless integration with BaseInfra stack exports

**Split DNS Management**: Separate Route53 constructs for Authentik and LDAP services

**EFS Integration**: Proper EFS mount configuration with IAM permissions and access points

**Git SHA Tracking**: Automatic git commit tracking for ECR image tagging

## Automatic Git SHA Detection

The `gitSha` parameter is automatically detected from the current git repository when the CDK is executed:

- **Automatic Detection**: The system runs `git rev-parse HEAD` to get the current commit SHA
- **Full SHA Format**: Returns the complete 40-character SHA hash (e.g., `7e696824b7c12836338e52725cdec1ac96e9db5d`)
- **Context Override**: You can override with `--context gitSha=your-custom-sha`
- **Fallback**: If git is not available or fails, it falls back to `'development'`

This automatic detection ensures that:
1. Container images are tagged with the exact commit they were built from
2. Deployments can be traced back to specific code versions
3. No manual input is required for version tracking

## Best Practices

1. **Required Parameters**: Always provide `stackName` and `authentikAdminUserEmail`
2. **Environment Type**: Use `envType=prod` for production deployments to get high availability defaults
3. **Infrastructure Overrides**: Only override infrastructure parameters when you have specific requirements
4. **DNS Configuration**: Use meaningful hostnames (`hostnameAuthentik`, `hostnameLdap`) for your organization
5. **S3 Environment Files**: Only use `useAuthentikConfigFile=true` when you need custom Authentik environment variables
6. **Debugging**: Enable `enableExecute=true` only for development/debugging purposes
7. **Git SHA**: Let the system auto-detect the git SHA for proper image tagging
8. **Stack Naming**: Use descriptive but concise stack names (e.g., `Demo`, `Prod`, `Staging`)

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

## Complete Example

Here's a complete example showing all commonly used parameters:

```bash
# Production deployment with custom configuration
npx cdk deploy \
  --context envType=prod \
  --context stackName=Production \
  --context authentikAdminUserEmail=admin@company.com \
  --context ldapBaseDn="dc=company,dc=local" \
  --context hostnameAuthentik=auth \
  --context hostnameLdap=directory \
  --context useAuthentikConfigFile=true \
  --context enableDetailedLogging=true \
  --context dbInstanceClass=db.t4g.medium \
  --context redisNodeType=cache.t4g.medium
```
