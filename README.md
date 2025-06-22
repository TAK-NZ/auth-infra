# TAK Authentication Infrastructure

<p align=center>Modern AWS CDK v2 authentication infrastructure for Team Awareness Kit (TAK) deployments

## Overview

The [Team Awareness Kit (TAK)](https://tak.gov/solutions/emergency) provides Fire, Emergency Management, and First Responders an operationally agnostic tool for improved situational awareness and a common operational picture. 

This repository deploys the authentication layer infrastructure for a complete TAK server deployment, providing robust LDAP-based authentication using [Authentik](https://goauthentik.io/) with advanced capabilities such as single sign-on via OIDC, user management, and enterprise-grade security features - all while using [free and open source software](https://en.wikipedia.org/wiki/Free_and_open-source_software).

It is specifically targeted at the deployment of [TAK.NZ](https://tak.nz) via a CI/CD pipeline. Nevertheless others interested in deploying a similar infrastructure can do so by adapting the configuration items.

> [!CAUTION]
> **New Deployment Tool**
> 
> This is the new [AWS CDK](https://aws.amazon.com/cdk/) version of the Authentication Infrastructure Layer. It is **not compatible** with the [previous version](../../tree/legacy) that uses the [OpenAddresses Deploy Tool](https://github.com/openaddresses/deploy).
> 
> **For new deployments:**
> - Choose either CDK **OR** Deploy Tool for your entire stack - both approaches cannot be mixed
> - CDK versions are not yet available for all stack layers - verify complete CDK coverage before choosing this approach
> - Existing Deploy Tool deployments can remain unchanged - no migration required
> 
> **When to choose CDK:** All future feature enhancements and updates will only be made to the CDK version. New deployments should use CDK when all required stack layers are available.
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

# 2. Bootstrap CDK (first time only)
npx cdk bootstrap --profile your-aws-profile

# 3. Deploy development environment
npm run deploy:dev

# 4. Deploy production environment  
npm run deploy:prod
```

## Infrastructure Resources

### Database & Storage
- **RDS Aurora PostgreSQL** - Encrypted cluster with backup retention
- **ElastiCache Redis** - Session management and caching
- **EFS File System** - Persistent Authentik data and certificates
- **S3 Bucket** - Configuration storage with KMS encryption

### Compute & Services
- **ECS Services** - Authentik server, worker, and LDAP outpost containers
- **Auto Scaling** - Dynamic scaling based on CPU and memory utilization
- **Load Balancers** - ALB for web interface, NLB for LDAP

### Security & DNS
- **AWS Secrets Manager** - Database credentials and API tokens
- **Security Groups** - Fine-grained network access controls
- **Route 53 Records** - Service endpoint DNS management
- **KMS Encryption** - Data encryption at rest and in transit

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
- **`tak-nz`**: TAK.NZ branded images (default)
- **`generic`**: Generic TAK branded images

### Authentik Version

Docker images are built with the Authentik version specified in configuration:
```json
"authentik": {
  "authentikVersion": "2025.6.2"
}
```

## Available Environments

| Environment | Stack Name | Description | Domain | Monthly Cost* |
|-------------|------------|-------------|--------|---------------|
| `dev-test` | `TAK-Dev-AuthInfra` | Cost-optimized development | `auth.dev.tak.nz` | ~$85 |
| `prod` | `TAK-Prod-AuthInfra` | High-availability production | `auth.tak.nz` | ~$245 |

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

#### Configuration Override Examples
```bash
# Override admin email for deployment
npm run deploy:dev -- --context adminUserEmail=admin@custom.tak.nz

# Deploy with different Authentik version
npm run deploy:prod -- --context authentikVersion=2025.6.3

# Use different branding
npm run deploy:dev -- --context branding=generic
```

## 📚 Documentation

- **[🚀 Deployment Guide](docs/DEPLOYMENT_GUIDE.md)** - Comprehensive deployment instructions and configuration options
- **[🏗️ Architecture Guide](docs/ARCHITECTURE.md)** - Technical architecture and design decisions  
- **[⚡ Quick Reference](docs/QUICK_REFERENCE.md)** - Fast deployment commands and environment comparison
- **[⚙️ Configuration Guide](docs/PARAMETERS.md)** - Complete configuration management reference
- **[🧪 Test Organization](test/TEST_ORGANIZATION.md)** - Test structure and coverage information

## Security Features

### Enterprise-Grade Security
- **🔑 KMS Encryption** - All data encrypted with customer-managed keys
- **🛡️ Network Security** - Private subnets with controlled internet access
- **🔒 IAM Policies** - Least-privilege access patterns throughout
- **📋 LDAP Security** - Secure LDAP authentication with TLS encryption
- **🔐 SSO Integration** - Single sign-on via OIDC and SAML protocolsontext

## Getting Help

### Common Issues
- **Base Infrastructure** - Ensure base infrastructure stack is deployed first
- **Route53 Hosted Zone** - Ensure your domain's hosted zone exists before deployment
- **AWS Permissions** - CDK requires broad permissions for CloudFormation operations
- **Docker Images** - CDK automatically handles Docker image building and ECR management
- **Stack Name Matching** - Ensure stackName parameter matches your base infrastructure deployment

### Support Resources
- **AWS CDK Documentation** - https://docs.aws.amazon.com/cdk/
- **Authentik Documentation** - https://goauthentik.io/docs/
- **TAK-NZ Project** - https://github.com/TAK-NZ/
- **Issue Tracking** - Use GitHub Issues for bug reports and feature requests