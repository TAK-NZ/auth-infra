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

### 4. Set required environment variables:

> [!NOTE]  
> Even when using AWS profiles, CDK requires explicit account/region specification for context providers (like Route 53 hosted zone lookups). The profile handles authentication, but CDK needs these values for CloudFormation template generation.

```bash
# Set AWS account and region for CDK deployment (using your profile)
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text --profile tak)
export CDK_DEFAULT_REGION=$(aws configure get region --profile tak || echo "ap-southeast-2")

# Verify the values
echo "Account: $CDK_DEFAULT_ACCOUNT"
echo "Region: $CDK_DEFAULT_REGION"
```

### 5. Deploy the Auth Infrastructure Stack:

The stack supports flexible parameter configuration through multiple methods with cascading priority:

#### Method 1: Environment Variables (Recommended)
```bash
# Required parameters
export AUTHENTIK_ADMIN_USER_EMAIL="admin@company.com"

# Optional parameters with defaults
export STACK_NAME="MyFirstStack"
export ENV_TYPE="dev-test"
export GIT_SHA="latest"
export ENABLE_EXECUTE="false"
export AUTHENTIK_LDAP_BASE_DN="DC=example,DC=com"
export IP_ADDRESS_TYPE="dualstack"

# Deploy the stack
npx cdk deploy --profile tak --context stackName=MyFirstStack --context envType=dev-test
```

#### Method 2: CLI Context
```bash
npx cdk deploy --profile tak --context stackName=MyFirstStack --context envType=dev-test \
  --parameters AuthentikAdminUserEmail=admin@company.com \
  --parameters AuthentikLDAPBaseDN=DC=example,DC=com \
  --parameters EnableExecute=false \
  --parameters IpAddressType=dualstack
```

#### Method 3: Production Deployment
```bash
# Set production parameters
export AUTHENTIK_ADMIN_USER_EMAIL="admin@company.com"
export STACK_NAME="prod"
export ENV_TYPE="prod"

# Deploy to production
npx cdk deploy --profile tak --context stackName=prod --context envType=prod
```

**Parameters:**
- `stackName`: Stack name component that creates the final stack name in format "TAK-<stackName>-AuthInfra". Default: `MyFirstStack`
- `envType`: Environment type (`prod` or `dev-test`). Default: `dev-test`
  - `prod`: Production-grade resources with enhanced performance and reliability
  - `dev-test`: Cost-optimized for development/testing
- `authentikAdminUserEmail`: **(Required)** Admin user email for Authentik
- `authentikLdapBaseDn`: LDAP base DN. Default: `DC=example,DC=com`
- `gitSha`: Git SHA for container image tagging. Default: `latest`
- `enableExecute`: Enable ECS Exec for debugging. Default: `false`
- `ipAddressType`: Load balancer IP type (ipv4/dualstack). Default: `dualstack`

**Docker Images**: Automatically sourced from ECR using the pattern `${account}.dkr.ecr.${region}.amazonaws.com/TAK-${stackName}-BaseInfra:auth-infra-*-${gitSha}`

**Parameter Resolution Priority:**
1. Environment Variables (highest priority) - use `STACK_NAME` env var
2. CLI Context (`--context`) - use `stackName` context
3. CLI Parameters (`--parameters`)
4. Default Values (lowest priority)

Higher priority methods override lower priority ones.

### 6. Deploy the LDAP Stack:

After the Auth Infrastructure stack is deployed, deploy the LDAP stack:

```bash
# Deploy LDAP stack with same environment configuration
npx cdk deploy TAK-{STACK_NAME}-AuthInfra-LDAP --profile tak --context stackName=MyFirstStack --context envType=dev-test \
  --parameters AuthentikHost=account.tak.nz
```

### 7. Configure DNS Records

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
