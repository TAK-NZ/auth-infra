# TAK Authentication Infrastructure

<p align=center>Modern AWS CDK v2 authentication infrastructure for Team Awareness Kit (TAK) deployments using Authentik SSO & LDAP

## Overview

The [Team Awareness Kit (TAK)](https://tak.gov/solutions/emergency) provides Fire, Emergency Management, and First Responders an operationally agnostic tool for improved situational awareness and a common operational picture. 

This repository deploys the authentication layer infrastructure for a complete TAK server deployment, providing robust LDAP-based authentication using [Authentik](https://goauthentik.io/) with advanced capabilities such as single sign-on via OIDC, user management, and enterprise-grade security features.

### Architecture Layers

This authentication infrastructure requires the base infrastructure and supports additional application layers:

| Layer | Repository | Description |
|-------|------------|-------------|
| **Base Infrastructure** | [`base-infra`](https://github.com/TAK-NZ/base-infra) | VPC, ECS, ECR, S3, KMS, ACM |
| **Authentication Layer** | `auth-infra` (this repo) | Authentik SSO and LDAP |
| **TAK Server Layer** | [`tak-infra`](https://github.com/TAK-NZ/tak-infra) | TAK Server deployment |

## Quick Start

### Prerequisites
- [AWS Account](https://signin.aws.amazon.com/signup) with configured credentials
- Base infrastructure stack (`TAK-<name>-BaseInfra`) must be deployed first
- Public Route 53 hosted zone (e.g., `tak.nz`)
- [Node.js](https://nodejs.org/) and npm installed

### Installation & Deployment

```bash
# 1. Install dependencies
npm install

# 2. Deploy development environment
npm run deploy:dev

# 3. Deploy production environment  
npm run deploy:prod
```

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

## ECR Image Validation

This stack includes **automatic ECR image validation** to ensure required Docker images are available before deployment. The validation occurs during the CDK deployment process and will **fail the deployment** if required images are missing.

### Required Images

The stack requires the following Docker images to be present in your ECR repository:

1. **`auth-infra-server-<git-sha>`** - Used by both Authentik Server and Worker containers
2. **`auth-infra-ldap-<git-sha>`** - Used by the LDAP Outpost container

Where `<git-sha>` is the short Git SHA of your current commit (automatically detected).

### How It Works

- **Pre-deployment Check**: Before any ECS services are created, the stack validates image availability
- **Automatic Git SHA Detection**: Uses `git rev-parse --short HEAD` to determine the current commit
- **CloudFormation Integration**: Implemented as a CloudFormation custom resource
- **Deployment Dependencies**: All ECS services depend on successful image validation

### Example Error Messages

If images are missing, you'll see clear error messages:

```
Missing required ECR images in repository 'my-repo': 
['auth-infra-server-abc1234', 'auth-infra-ldap-abc1234']
Available tags: ['latest', 'auth-infra-server-xyz5678']
```

### Building and Pushing Images

Ensure your Docker images are built and pushed to ECR before deployment:

```bash
# Example build and push commands
docker build -t auth-infra-server .
docker tag auth-infra-server:latest $ECR_URI:auth-infra-server-$(git rev-parse --short HEAD)
docker push $ECR_URI:auth-infra-server-$(git rev-parse --short HEAD)

docker build -f Dockerfile.ldap -t auth-infra-ldap .
docker tag auth-infra-ldap:latest $ECR_URI:auth-infra-ldap-$(git rev-parse --short HEAD)
docker push $ECR_URI:auth-infra-ldap-$(git rev-parse --short HEAD)
```

## AWS Deployment

### Required Parameters

The following parameters are **mandatory** for deployment:

- **`stackName`**: The environment/stack name component (e.g., "Demo", "Prod")
  - **CRITICAL**: This determines CloudFormation export names for importing VPC and resources from base infrastructure
  - Must match the `<name>` part of your base infrastructure stack name `TAK-<name>-BaseInfra`
  - Example: If your base stack is `TAK-Demo-BaseInfra`, use `stackName=Demo`

- **`authentikAdminUserEmail`**: Email address for the Authentik administrator account

## Development

### Prerequisites
- Node.js 18 or later
- AWS CLI configured
- Docker (for local testing)

### Getting Started
```bash
# Install dependencies
npm install

# Run tests
npm test

# Build the project
npm run build

# Clean build artifacts
npm run clean
```

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### CDK Commands
```bash
# Synthesize CloudFormation template
npm run synth

# Deploy to AWS
npm run deploy

# Destroy infrastructure
npm run destroy

# Show differences
npm run diff
```

## Configuration

### Basic Deployment

Deploy the stack with CDK context parameters (no environment variables needed for stack configuration):

```bash
# Deploy with required parameters via CDK context
npm run deploy -- --context envType=dev-test \
                   --context stackName=MyFirstStack \
                   --context adminUserEmail=admin@company.com
```

### Production Deployment

For production deployments, use `envType=prod` which automatically applies production-optimized defaults:

```bash
# Production deployment with enhanced security and availability
npm run deploy -- --context envType=prod \
                   --context stackName=ProdStack \
                   --context adminUserEmail=admin@company.com
```

### Custom Configuration

Override specific settings using additional context parameters:

```bash
# Example: Custom database and Redis settings
npm run deploy -- --context envType=dev-test \
                   --context stackName=TestStack \
                   --context adminUserEmail=admin@company.com \
                   --context instanceClass=db.t4g.small \
                   --context nodeType=cache.t4g.small \
                   --context enableDetailedLogging=true
```

### Available Context Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `envType` | No | `dev-test` | Environment type: `prod` or `dev-test` |
| `stackName` | **Yes** | None | Stack identifier (forms `TAK-{stackName}-AuthInfra`) |
| `instanceClass` | No | env-based* | RDS PostgreSQL instance class |
| `instanceCount` | No | env-based* | Number of RDS instances (1 or 2) |
| `nodeType` | No | env-based* | ElastiCache Redis node type |
| `adminUserEmail` | **Yes** | None | Authentik administrator email |
| `taskCpu` | No | env-based* | ECS task CPU units |
| `taskMemory` | No | env-based* | ECS task memory (MB) |
| `desiredCount` | No | env-based* | Number of ECS tasks |
| `enableDetailedLogging` | No | env-based* | Enable detailed application logging |
| `redisNodeType` | No | env-based* | ElastiCache Redis node type |
| `ecsTaskCpu` | No | env-based* | ECS task CPU units (512, 1024, 2048, 4096) |
| `ecsTaskMemory` | No | env-based* | ECS task memory in MB |
| `enableDetailedLogging` | No | `true` | Enable detailed CloudWatch logging |
| `gitSha` | No | auto-detected | Git SHA for resource tagging |
| `enableExecute` | No | `false` | Enable ECS exec for debugging |
| `authentikAdminUserEmail` | **Yes** | None | Admin user email for Authentik setup |
| `authentikLdapBaseDn` | No | `DC=example,DC=com` | LDAP base DN for directory structure |
| `hostnameAuthentik` | No | `account` | Hostname for Authentik service (creates DNS A/AAAA records) |
| `hostnameLdap` | No | `ldap` | Hostname for LDAP service (creates DNS A record) |

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
You can use the CDK context parameter `--context useEnvironmentFile=true` to instruct CDK to use this file. 

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
npm run deploy -- --context envType=dev-test \
                   --context stackName=MyFirstStack \
                   --context adminUserEmail=admin@example.com
```

#### Production Deployment
```bash
# Production deployment with admin email
npm run deploy -- --context envType=prod \
                   --context stackName=ProdStack \
                   --context adminUserEmail=admin@company.com
```

#### Custom Configuration Deployment
```bash
# Development with custom settings
npm run deploy -- --context envType=dev-test \
                   --context stackName=TestStack \
                   --context adminUserEmail=admin@company.com \
                   --context instanceClass=db.t4g.small \
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

## Infrastructure Resources

### Authentication Services
- **Authentik SSO** - Web-based single sign-on portal
- **LDAP Provider** - Enterprise LDAP directory service
- **User Management** - Web UI for user and group administration

### Core Infrastructure
- **Database** - RDS Aurora PostgreSQL cluster with encryption and backup retention
- **Cache** - ElastiCache Redis cluster for session management
- **Storage** - EFS file system for persistent Authentik data and certificates
- **Secrets** - AWS Secrets Manager for database credentials and API tokens
- **Load Balancers** - Application Load Balancer (ALB) for web interface and Network Load Balancer (NLB) for LDAP
- **Security Groups** - Fine-grained network access controls
- **DNS Records** - Route 53 records for service endpoints

## Available Environments

| Environment | Stack Name | Description | Domain | Monthly Cost* |
|-------------|------------|-------------|--------|---------------|
| `dev-test` | `TAK-Dev-AuthInfra` | Cost-optimized development | `account.dev.tak.nz` | ~$85 |
| `prod` | `TAK-Prod-AuthInfra` | High-availability production | `account.tak.nz` | ~$245 |

*Estimated AWS costs for ap-southeast-2, excluding data processing and storage usage

## Development Workflow

### New NPM Scripts (Enhanced Developer Experience)
```bash
# Development and Testing
npm run dev                    # Build and test
npm run test:watch            # Run tests in watch mode
npm run test:coverage         # Generate coverage report

# Environment-Specific Deployment
npm run deploy:dev            # Deploy to dev-test
npm run deploy:prod           # Deploy to production
npm run synth:dev             # Preview dev infrastructure
npm run synth:prod            # Preview prod infrastructure

# Infrastructure Management
npm run cdk:diff:dev          # Show what would change in dev
npm run cdk:diff:prod         # Show what would change in prod
npm run cdk:bootstrap         # Bootstrap CDK in account
```

### Configuration System

The project uses **AWS CDK context-based configuration** for consistent deployments:

- **All settings** stored in [`cdk.json`](cdk.json) under `context` section
- **Version controlled** - consistent deployments across team members
- **Runtime overrides** - use `--context` flag for one-off changes
- **Environment-specific** - separate configs for dev-test and production

#### Required Parameters

The following parameters are **mandatory** for deployment:

- **`stackName`**: The environment/stack name component (e.g., "Demo", "Prod")
  - **CRITICAL**: This determines CloudFormation export names for importing VPC and resources from base infrastructure
  - Must match the `<name>` part of your base infrastructure stack name `TAK-<name>-BaseInfra`
  - Example: If your base stack is `TAK-Demo-BaseInfra`, use `stackName=Demo`

- **`adminUserEmail`**: Email address for the Authentik administrator account

#### Configuration Override Examples
```bash
# Override admin email for custom deployment
npm run deploy:dev -- --context adminUserEmail=admin@company.com

# Deploy with custom database settings
npm run deploy:dev -- --context instanceClass=db.t4g.small --context nodeType=cache.t4g.small

# Enable detailed logging for debugging
npm run deploy:dev -- --context enableDetailedLogging=true
```
