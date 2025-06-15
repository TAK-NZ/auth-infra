<h1 align=center>TAK Auth Infra</h1>

<p align=center>TAK Authentication Layer (Authentik SSO & LDAP)</p>

## Background

The [Team Awareness Kit (TAK)](https://tak.gov/solutions/emergency) provides Fire, Emergency Management, and First Responders an operationally agnostic tool for improved situational awareness and a common operational picture. 
This repo - which is part of a [larger collection](https://github.com/TAK-NZ/) - deploys [Authentik](https://goauthentik.io/) as the authentication layer for a [TAK server](https://tak.gov/solutions/emergency) on AWS.

While a TAK server supports built-in file-based authentication, this approach is very limited. This stack provides a robust LDAP-based authentication solution using Authentik, which offers advanced capabilities such as single sign-on via OIDC, user management, and enterprise-grade security features.

This stack must be deployed after the base infrastructure layer:

| Name                  | Notes |
| --------------------- | ----- |
| `TAK-<name>-BaseInfra` | Base Layer (VPC, ECS, ECR, S3, KMS) - [repo](https://github.com/TAK-NZ/base-infra) |

The following additional layers should be deployed after this authentication layer:

| Name                  | Notes |
| --------------------- | ----- |
| `TAK-<name>-TakInfra` | TAK Server layer - [repo](https://github.com/TAK-NZ/tak-infra) |

## Pre-Reqs

The following dependencies must be fulfilled:
- An [AWS Account](https://signin.aws.amazon.com/signup?request_type=register). 
  - Your AWS credentials must be configured for the CDK to access your account. You can configure credentials using the [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html) (`aws configure`) or [environment variables](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-envvars.html). The deployment examples in this guide assume you have configured an AWS profile named `tak` - you can either create this profile or substitute it with your preferred profile name in the commands below.
- The base infrastructure stack (`TAK-<name>-BaseInfra`) must be deployed first.
  - This provides the VPC, ECS cluster, ECR repository, S3 bucket, KMS key, and ACM certificate.
  - The ACM certificate from the base stack is automatically imported and used for HTTPS/TLS.
- A public hosted zone in Route 53 for your domain name (e.g., `tak.nz`).
  - This stack creates the following default hostnames (which can be changed):
    - account: Authentik SSO (e.g., `account.tak.nz`)
    - ldap: Internal LDAP endpoint (e.g., `ldap.tak.nz`)

## Resources

This AWS CDK project provisions the following resources:
- **Database**: RDS Aurora PostgreSQL cluster with encryption and backup retention
- **Cache**: ElastiCache Redis cluster for session management
- **Storage**: EFS file system for persistent Authentik data and certificates
- **Secrets**: AWS Secrets Manager for database credentials and API tokens
- **Authentik Service**: ECS service running Authentik containers with auto-scaling
- **LDAP Outpost**: ECS service running Authentik LDAP provider
- **Load Balancers**: Application Load Balancer (ALB) for web interface and Network Load Balancer (NLB) for LDAP
- **Security Groups**: Fine-grained network access controls
- **DNS Records**: Route 53 records for service endpoints

## AWS Deployment

### Basic Deployment

Deploy the stack with CDK context parameters (no environment variables needed for stack configuration):

```bash
# AWS credentials (auto-detectable from profile/environment)
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_REGION=$(aws configure get region)

# Deploy with required parameters via CDK context
npx cdk deploy --context envType=dev-test \
               --context stackName=MyFirstStack \
               --context authentikAdminUserEmail=admin@company.com
```

### Production Deployment

For production deployments, use `envType=prod` which automatically applies production-optimized defaults:

```bash
# Production deployment with enhanced security and availability
npx cdk deploy --context envType=prod \
               --context stackName=ProdStack \
               --context authentikAdminUserEmail=admin@company.com
```

### Custom Configuration

Override specific settings using additional context parameters:

```bash
# Example: Custom database and Redis settings
npx cdk deploy --context envType=dev-test \
               --context stackName=TestStack \
               --context authentikAdminUserEmail=admin@company.com \
               --context dbInstanceClass=db.t4g.small \
               --context redisNodeType=cache.t4g.small \
               --context enableDetailedLogging=true
```

### Available Context Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `envType` | No | `dev-test` | Environment type: `prod` or `dev-test` |
| `stackName` | **Yes** | None | Stack identifier (forms `TAK-{stackName}-AuthInfra`) |
| `dbInstanceClass` | No | env-based* | RDS PostgreSQL instance class |
| `dbInstanceCount` | No | env-based* | Number of RDS instances (1 or 2) |
| `redisNodeType` | No | env-based* | ElastiCache Redis node type |
| `ecsTaskCpu` | No | env-based* | ECS task CPU units (512, 1024, 2048, 4096) |
| `ecsTaskMemory` | No | env-based* | ECS task memory in MB |
| `enableDetailedLogging` | No | `true` | Enable detailed CloudWatch logging |
| `gitSha` | No | auto-detected | Git SHA for resource tagging |
| `enableExecute` | No | `false` | Enable ECS exec for debugging |
| `authentikAdminUserEmail` | **Yes** | None | Admin user email for Authentik setup |
| `authentikLdapBaseDn` | No | `DC=example,DC=com` | LDAP base DN for directory structure |

*Environment-based defaults: `prod` = high-availability, `dev-test` = cost-optimized

### Environment-Specific Defaults

The stack uses environment-based defaults for optimal configuration:

**Development/Test (`envType=dev-test`)**:
- `dbInstanceClass`: `db.t4g.micro`
- `dbInstanceCount`: `1` 
- `redisNodeType`: `cache.t4g.micro`
- `ecsTaskCpu`: `512`
- `ecsTaskMemory`: `1024`
- Cost-optimized for development/testing
- Resources can be destroyed (`RemovalPolicy.DESTROY`)

**Production (`envType=prod`)**:
- `dbInstanceClass`: `db.t4g.small`
- `dbInstanceCount`: `2` (high availability)
- `redisNodeType`: `cache.t4g.small` 
- `ecsTaskCpu`: `1024`
- `ecsTaskMemory`: `2048`
- High-availability configuration with redundancy
- Resources protected from deletion (`RemovalPolicy.RETAIN`)

**Hierarchical Parameter System:**
The stack uses a cascading configuration system:
1. **Environment Type** (`envType`) provides defaults for resource sizing and availability:
   - `prod`: Multi-AZ deployment, larger instances, high availability enabled
   - `dev-test`: Single-AZ deployment, smaller instances, cost-optimized
2. **Individual context parameters** override environment defaults when specified
3. **Example**: `--context envType=prod --context dbInstanceCount=1` creates production environment with single database instance

**Required AWS Environment Variables (for AWS SDK only):**
- `CDK_DEFAULT_ACCOUNT` - Your AWS account ID (auto-set with: `aws sts get-caller-identity --query Account --output text --profile tak`)
- `CDK_DEFAULT_REGION` - Your AWS region (auto-set with: `aws configure get region --profile tak`)

### AWS Credentials

AWS credentials are handled separately from stack configuration:

```bash
# Option 1: AWS Profile (recommended)
aws configure --profile tak
export AWS_PROFILE=tak

# Option 2: Environment variables
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export AWS_DEFAULT_REGION=ap-southeast-2

# Option 3: Auto-detection from current session
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_REGION=$(aws configure get region)
```

### 1. Install Tooling Dependencies
   ```bash
   npm install
   ```

### 2. Bootstrap your AWS environment (if not already done):
   ```bash
   npx cdk bootstrap --profile tak
   ```

### 3. (Optional) Authentik Configuration

The base infrastructure stack creates an S3 bucket which can be used for advanced [Authentik configuration](https://docs.goauthentik.io/docs/install-config/configuration/) via an .env configuration file.

> [!NOTE] 
> The deployment automatically creates an empty `authentik-config.env` file in the S3 bucket if it doesn't already exist. The most common item that you might want to configure in Authentik are the [E-Mail provider settings](https://docs.goauthentik.io/docs/install-config/configuration/#authentik_email).

### 4. Deploy the Auth Infrastructure Stack

The stack uses CDK context parameters for all configuration (no environment variables needed):

#### Basic Development Deployment
```bash
# Set AWS credentials (auto-detectable)
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text --profile tak)
export CDK_DEFAULT_REGION=$(aws configure get region --profile tak || echo "ap-southeast-2")

# Deploy with minimal required parameters
npx cdk deploy --profile tak \
               --context envType=dev-test \
               --context stackName=MyFirstStack \
               --context authentikAdminUserEmail=admin@example.com
```

#### Production Deployment
```bash
# Production deployment with admin email
npx cdk deploy --profile tak \
               --context envType=prod \
               --context stackName=ProdStack \
               --context authentikAdminUserEmail=admin@company.com
```

#### Custom Configuration Deployment
```bash
# Development with custom settings
npx cdk deploy --profile tak \
               --context envType=dev-test \
               --context stackName=TestStack \
               --context authentikAdminUserEmail=admin@company.com \
               --context authentikLdapBaseDn=DC=company,DC=com \
               --context dbInstanceClass=db.t4g.small \
               --context enableDetailedLogging=true
```

**Stack Naming**: The final AWS stack name follows the pattern `TAK-<stackName>-AuthInfra`

**Docker Images**: Automatically sourced from ECR using the pattern `${account}.dkr.ecr.${region}.amazonaws.com/TAK-${stackName}-BaseInfra:auth-infra-*-${gitSha}`

### 5. Configure DNS Records

The stacks automatically create Route 53 records for the following endpoints:
- **account.{domain}**: Authentik web interface (SSO portal)
- **ldap.{domain}**: LDAP endpoint for TAK server authentication

No manual DNS configuration is required if using Route 53 hosted zones.

### 8. Configure Authentik LDAP Provider

After deployment, configure the Authentik LDAP provider:

1. Access the Authentik admin interface at `https://account.{your-domain}`
2. Use the admin credentials created during deployment
3. The LDAP provider is automatically configured via blueprints
4. Verify the LDAP outpost is connected and healthy

## SSL Certificate Integration

The stack automatically imports the SSL certificate from the base infrastructure stack. No manual certificate configuration is required.

The certificate ARN is imported from the base stack export: `TAK-{STACK_NAME}-BaseInfra-CERTIFICATE-ARN`

## Stack Dependencies

This stack depends on the base infrastructure stack which provides:
- VPC and subnets (public and private)
- ECS cluster for container orchestration
- ECR repository for container images
- KMS key for encryption
- S3 bucket for configuration and storage
- ACM certificate for HTTPS/TLS

Cross-stack references are automatically resolved using CloudFormation exports.

## Notes

- Make sure your AWS credentials are configured
- The base infrastructure stack must be deployed first
- The LDAP stack has an explicit dependency on the Auth Infrastructure stack
- SSL certificates are automatically imported from the base stack
- All resources are encrypted using the KMS key from the base stack

## Estimated Cost

The estimated AWS cost for this authentication layer without data transfer or processing-based usage is:

| Environment type | Estimated monthly cost | Estimated yearly cost |
| ---------------- | ---------------------- | -------------------- |
| Prod            | $366.87 USD           | $4,402.44 USD        |
| Dev-Test        | $106.25 USD           | $1,275.00 USD        |
