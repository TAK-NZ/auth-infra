# TAK Authentication Infrastructure

<p align=center>Modern AWS CDK v2 authentication infrastructure for Team Awareness Kit (TAK) deployments

## Overview

The [Team Awareness Kit (TAK)](https://tak.gov/solutions/emergency) provides Fire, Emergency Management, and First Responders an operationally agnostic tool for improved situational awareness and a common operational picture. 

This repository deploys the authentication layer infrastructure for a complete TAK server deployment, providing robust LDAP-based authentication using [Authentik](https://goauthentik.io/) with advanced capabilities such as single sign-on via OIDC, user management, and enterprise-grade security features.

### Architecture Layers

This authentication infrastructure requires the base infrastructure and is the foundation of additional higher level layers. Layers can be deployed in multiple independent environments. As an example:

```
        PRODUCTION ENVIRONMENT                DEVELOPMENT ENVIRONMENT
        Domain: tak.nz                        Domain: dev.tak.nz

┌─────────────────────────────────┐    ┌─────────────────────────────────┐
│         CloudTAK                │    │         CloudTAK                │
│    CloudFormation Stack         │    │    CloudFormation Stack         │
└─────────────────────────────────┘    └─────────────────────────────────┘
                │                                        │
                ▼                                        ▼
┌─────────────────────────────────┐    ┌─────────────────────────────────┐
│        VideoInfra               │    │        VideoInfra               │
│    CloudFormation Stack         │    │    CloudFormation Stack         │
└─────────────────────────────────┘    └─────────────────────────────────┘
                │                                        │
                ▼                                        ▼
┌─────────────────────────────────┐    ┌─────────────────────────────────┐
│         TakInfra                │    │         TakInfra                │
│    CloudFormation Stack         │    │    CloudFormation Stack         │
└─────────────────────────────────┘    └─────────────────────────────────┘
                │                                        │
                ▼                                        ▼
┌─────────────────────────────────┐    ┌─────────────────────────────────┐
│        AuthInfra                │    │        AuthInfra                │
│    CloudFormation Stack         │    │    CloudFormation Stack         │
│      (This Repository)          │    │      (This Repository)          │
└─────────────────────────────────┘    └─────────────────────────────────┘
                │                                        │
                ▼                                        ▼
┌─────────────────────────────────┐    ┌─────────────────────────────────┐
│        BaseInfra                │    │        BaseInfra                │
│    CloudFormation Stack         │    │    CloudFormation Stack         │
└─────────────────────────────────┘    └─────────────────────────────────┘
```

| Layer | Repository | Description |
|-------|------------|-------------|
| **BaseInfra** | [`base-infra`](https://github.com/TAK-NZ/base-infra)  | Foundation: VPC, ECS, S3, KMS, ACM |
| **AuthInfra** | `auth-infra` (this repo) | SSO via Authentik, LDAP |
| **TAKInfra** | [`tak-infra`](https://github.com/TAK-NZ/tak-infra) | TAK Server |
| **VideoInfra** | [`video-infra`](https://github.com/TAK-NZ/video-infra) | Video Server based on Mediamtx |
| **CloudTAK** | [`CloudTAK`](https://github.com/TAK-NZ/CloudTAK) | CloudTAK web interface and ETL |

**Deployment Order**: BaseInfra must be deployed first, followed by AuthInfra, TakInfra, VideoInfra, and finally CloudTAK. Each layer imports outputs from the layer below via CloudFormation exports.

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

## Docker Image Handling

This stack uses **AWS CDK's built-in Docker image assets** for automatic container image management. CDK handles all Docker image building, ECR repository creation, and image pushing automatically during deployment.

### How It Works

- **Automatic Building**: CDK builds Docker images from local Dockerfiles during deployment
- **ECR Integration**: CDK automatically creates ECR repositories and pushes images
- **Version Management**: Images are tagged with CDK-generated hashes for consistency
- **No Manual Steps**: No need to manually build or push Docker images

### Docker Images Used

1. **Authentik Server & Worker**: Built from `docker/authentik-server/Dockerfile.{branding}`
2. **LDAP Outpost**: Built from `docker/authentik-ldap/Dockerfile`

### Branding Support

The stack supports different Docker image variants via the `branding` configuration:
- **`tak-nz`**: TAK-NZ branded images (default)
- **`generic`**: Generic Authentik images

### Authentik Version

Docker images are built with the Authentik version specified in configuration:
```json
"authentik": {
  "authentikVersion": "2025.6.2"
}
```

## AWS Deployment

### Required Parameters

The following parameters are **mandatory** for deployment:

- **`stackName`**: The environment/stack name component (e.g., "Demo", "Prod")
  - **CRITICAL**: This determines CloudFormation export names for importing VPC and resources from base infrastructure
  - Must match the `<name>` part of your base infrastructure stack name `TAK-<name>-BaseInfra`
  - Example: If your base stack is `TAK-Demo-BaseInfra`, use `stackName=Demo`

- **`adminUserEmail`**: Email address for the Authentik administrator account (override via `--context adminUserEmail=email@domain.com`)

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
npm run synth:dev     # Development environment
npm run synth:prod    # Production environment

# Deploy to AWS
npm run deploy:dev    # Development environment
npm run deploy:prod   # Production environment

# Show differences
npm run cdk:diff:dev  # Development environment
npm run cdk:diff:prod # Production environment

# Destroy infrastructure (use CDK directly)
npx cdk destroy --context env=dev-test
npx cdk destroy --context env=prod
```

## Configuration

### Basic Deployment

Deploy the stack with CDK context parameters (no environment variables needed for stack configuration):

```bash
# Deploy with required parameters via CDK context
npm run deploy:dev -- --context stackName=MyFirstStack \
                       --context adminUserEmail=admin@company.com
```

### Production Deployment

For production deployments, use the `deploy:prod` script which automatically applies production-optimized defaults:

```bash
# Production deployment with enhanced security and availability
npm run deploy:prod -- --context stackName=ProdStack \
                        --context adminUserEmail=admin@company.com
```

### Custom Configuration

Override specific settings using additional context parameters:

```bash
# Example: Custom database and Redis settings
npm run deploy:dev -- --context stackName=TestStack \
                       --context adminUserEmail=admin@company.com \
                       --context instanceClass=db.t4g.small \
                       --context nodeType=cache.t4g.small \
                       --context enableDetailedLogging=true
```

### Configuration Structure

Configuration is managed through CDK context in `cdk.json`. Runtime overrides use **flat parameter names**. See [PARAMETERS.md](docs/PARAMETERS.md) for complete configuration reference.

**Common Override Parameters:**
- `stackName` - Stack identifier
- `adminUserEmail` - Authentik admin email
- `instanceClass` - Database instance class
- `nodeType` - Redis node type
- `taskCpu` - ECS task CPU
- `taskMemory` - ECS task memory
- `enableDetailedLogging` - Enable detailed logging

### Environment-Specific Defaults

The stack uses environment-based defaults defined in `cdk.json`:

**Development/Test (`dev-test`)**:
- Database: `db.serverless` (Aurora Serverless v2, single instance)
- Redis: `cache.t3.micro` (single node)
- ECS: `512 CPU, 1024 MB memory`
- Removal Policy: `DESTROY`
- Cost-optimized for development/testing

**Production (`prod`)**:
- Database: `db.t4g.large` (2 instances, high availability)
- Redis: `cache.t3.small` (2 nodes)
- ECS: `1024 CPU, 2048 MB memory`
- Removal Policy: `RETAIN`
- High-availability configuration with redundancy

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

### 3. Deploy the Auth Infrastructure Stack

The stack uses CDK context parameters for all configuration:

```bash
# Development deployment
npm run deploy:dev -- --context stackName=Demo --context adminUserEmail=admin@company.com

# Production deployment
npm run deploy:prod -- --context stackName=Prod --context adminUserEmail=admin@company.com
```

### 4. Configure DNS Records

The stack automatically creates Route 53 records for:
- **account.{domain}**: Authentik web interface (SSO portal)
- **ldap.{domain}**: LDAP endpoint for TAK server authentication

### 5. Configure Authentik LDAP Provider

After deployment:
1. Access the Authentik admin interface at `https://account.{your-domain}`
2. Use the admin credentials created during deployment
3. The LDAP provider is automatically configured via blueprints
4. Verify the LDAP outpost is connected and healthy

## (Optional) Authentik Configuration

The base infrastructure stack creates an S3 bucket which can be used for advanced [Authentik configuration](https://docs.goauthentik.io/docs/install-config/configuration/) via an .env configuration file.

> [!NOTE] 
> The deployment automatically creates an empty `authentik-config.env` file in the S3 bucket if it doesn't already exist. The most common item that you might want to configure in Authentik are the [E-Mail provider settings](https://docs.goauthentik.io/docs/install-config/configuration/#authentik_email).

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

## Available Environments

| Environment | Stack Name | Description | Domain | Monthly Cost* |
|-------------|------------|-------------|--------|---------------|
| `dev-test` | `TAK-Dev-AuthInfra` | Cost-optimized development | `account.dev.tak.nz` | ~$106 |
| `prod` | `TAK-Prod-AuthInfra` | High-availability production | `account.tak.nz` | ~$367 |

*Estimated AWS costs for ap-southeast-2, excluding data processing and storage usage

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


