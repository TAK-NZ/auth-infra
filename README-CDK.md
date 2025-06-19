# TAK Authentication Infrastructure - CDK Documentation

This project uses AWS CDK v2 for infrastructure as code, defining authentication services using TypeScript and AWS CDK L2 constructs.

## Architecture Overview

The infrastructure consists of several key components:

- **Database**: Aurora PostgreSQL Serverless v2 cluster with enhanced monitoring
- **Cache**: Redis (Valkey) cluster for session management  
- **Storage**: EFS for persistent storage with access points
- **Secrets**: AWS Secrets Manager for credential management
- **Compute**: ECS Fargate services for Authentik server and worker
- **Load Balancer**: Application Load Balancer with SSL termination
- **LDAP**: LDAP outpost for TAK server integration

## Prerequisites

- Node.js >= 18
- AWS CLI configured with appropriate credentials
- AWS CDK CLI installed globally: `npm install -g aws-cdk`
- Base infrastructure stack deployed first

## Project Structure

```
├── bin/
│   └── cdk.ts              # CDK app entry point
├── lib/
│   ├── auth-infra-stack.ts # Main stack definition
│   ├── stack-config.ts     # Configuration management
│   ├── outputs.ts          # Stack outputs
│   ├── constructs/         # CDK constructs
│   │   ├── authentik-server.ts  # Authentik server service
│   │   ├── authentik-worker.ts  # Authentik worker service
│   │   ├── database.ts          # Aurora PostgreSQL cluster
│   │   ├── efs.ts               # EFS file system
│   │   ├── redis.ts             # Redis cluster
│   │   ├── secrets-manager.ts   # Secrets management
│   │   ├── ldap.ts              # LDAP outpost service
│   │   └── elb.ts               # Load balancer
│   └── utils/              # Utility functions
│       ├── constants.ts         # Constants and defaults
│       ├── context-overrides.ts # Context parameter handling
│       └── tag-helpers.ts       # Resource tagging
├── test/                   # Test files
├── cdk.json               # CDK configuration
├── tsconfig.json          # TypeScript configuration
└── package.json           # Dependencies and scripts
```

## Development

### Installation

1. Install dependencies:
```bash
npm install
```

2. Build the TypeScript code:
```bash
npm run build
```

### Development Commands

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Clean build artifacts
npm run clean

# Watch mode for development
npm run build:watch
```

### CDK Commands

```bash
# Synthesize CloudFormation template
npm run synth

# Deploy to AWS
npm run deploy

# Show differences
npm run diff

# Destroy infrastructure
npm run destroy
```

## Deployment

### Deploy to Development Environment

```bash
npm run deploy -- --context envType=dev-test \
                   --context stackName=DevStack \
                   --context adminUserEmail=admin@example.com
```

### Deploy to Production Environment

```bash
npm run deploy -- --context envType=prod \
                   --context stackName=ProdStack \
                   --context adminUserEmail=admin@example.com
```

## Migration Notes

### Changes from CloudFriend to CDK

1. **Stack Definition**: Converted from CloudFriend's JSON-like format to CDK TypeScript classes
2. **Resource Organization**: Split into logical constructs for better maintainability
3. **Type Safety**: Full TypeScript support with compile-time validation
4. **L2 Constructs**: Using CDK L2 constructs for better defaults and simplified configuration
5. **Conditions**: Migrated CloudFormation conditions to CDK conditions

### Key Differences

- **Database**: Using `DatabaseCluster` construct instead of raw CloudFormation
- **ECS**: Using `FargateService` and `FargateTaskDefinition` constructs
- **Load Balancer**: Using `ApplicationLoadBalancer` with listeners
- **Security Groups**: Using CDK's type-safe security group rules
- **IAM**: Using CDK's `PolicyDocument` and `PolicyStatement` constructs

### Validation

The CDK version provides additional validation:
- Compile-time type checking
- Resource dependency validation
- Best practice recommendations
- Automatic resource tagging

## Commands

- `npm run build` - Compile TypeScript to JavaScript
- `npm run watch` - Watch for changes and compile
- `npm run test` - Run unit tests
- `cdk ls` - List all stacks
- `cdk diff` - Compare deployed stack with current state
- `cdk synth` - Synthesize CloudFormation template
- `cdk deploy` - Deploy stack to AWS
- `cdk destroy` - Destroy stack

## Environment Variables

The stack supports the following context variables:

- `environment` - Environment name (dev, prod)
- `envType` - Environment type (dev-test, prod)

## Parameters

The stack accepts the following parameters:

- `GitSha` - Git SHA for container image tagging
- `EnableExecute` - Enable ECS Exec for debugging
- `AuthentikAdminUserEmail` - Admin user email
- `AuthentikLDAPBaseDN` - LDAP base DN
- `AuthentikConfigFile` - Use S3 config file
- `HostnameAuthentik` - Hostname for Authentik service (default: 'account')
- `HostnameLdap` - Hostname for LDAP service (default: 'ldap')

**Note:** SSL Certificate ARN is automatically imported from the BaseInfra stack export and does not need to be provided as a parameter. Docker images are automatically sourced from ECR. Load balancers are configured with dualstack IP addressing. DNS records are automatically created in the Route53 hosted zone from BaseInfra.

## Parameter Management

This project includes a centralized parameter management system that supports multiple parameter sources with cascading resolution:

1. **CDK Context** (highest priority) - `--context parameter=value`
2. **Environment Variables** - `export PARAMETER=value`
3. **Default Values** (lowest priority) - Built-in defaults

### Quick Parameter Setup

```bash
# Set required parameters via environment variables
export AUTHENTIK_ADMIN_USER_EMAIL="admin@company.com"

# SSL Certificate ARN is automatically retrieved from BaseInfra stack
# No need to set SSL_CERTIFICATE_ARN manually

# Or pass via CDK context
npx cdk deploy --context authentikAdminUserEmail=admin@company.com
```

See [docs/PARAMETERS.md](docs/PARAMETERS.md) for comprehensive parameter documentation.

## Outputs

**Note**: The current stacks do not export any CloudFormation outputs. All inter-stack communication is handled through direct resource references and the LDAP stack's dependency on the Auth stack.

## Dependencies

This stack depends on the base infrastructure stack which provides:

- VPC and subnets
- ECS cluster
- KMS key
- S3 bucket

Import values are used to reference these resources:
- `TAK-{environment}-BaseInfra-vpc-id`
- `TAK-{environment}-BaseInfra-vpc-cidr-ipv4`
- `TAK-{environment}-BaseInfra-subnet-private-a`
- `TAK-{environment}-BaseInfra-subnet-private-b`
- `TAK-{environment}-BaseInfra-subnet-public-a`
- `TAK-{environment}-BaseInfra-subnet-public-b`
- `TAK-{environment}-BaseInfra-kms`
- `TAK-{environment}-BaseInfra-s3`
- `TAK-{environment}-BaseInfra-CERTIFICATE-ARN` - ACM SSL certificate ARN

## Troubleshooting

1. **Build Errors**: Run `npm run build` to check for TypeScript errors
2. **Deployment Failures**: Check CloudFormation events in AWS Console
3. **Service Issues**: Check ECS service events and container logs
4. **Dependencies**: Ensure base infrastructure stack is deployed first

## Stack Naming Convention

This project uses a consistent stack naming utility (`lib/stack-naming.ts`) to ensure standardized naming across all resources and cross-stack references.

### Stack Names

The stack naming follows the pattern: `{project}-{environment}-{component}`

- **Auth Stack**: `TAK-{environment}-AuthInfra` (e.g., `TAK-dev-AuthInfra`, `TAK-prod-AuthInfra`)
- **LDAP Stack**: `TAK-{environment}-AuthInfra-LDAP` (e.g., `TAK-dev-AuthInfra-LDAP`, `TAK-prod-AuthInfra-LDAP`)

### Export Names

All CloudFormation exports follow the pattern: `{stackName}-{resourceType}`

Examples:
- `TAK-dev-AuthInfra-authentik-url` - Main Authentik application URL
- `TAK-dev-AuthInfra-authentik-ldap-token-arn` - LDAP token secret ARN
- `TAK-dev-AuthInfra-ldapservice-user-arn` - LDAP service user secret ARN

### Import References

The stack naming utility provides helper functions for consistent imports:

```typescript
import { 
  createBaseImportValue, 
  createAuthImportValue,
  BASE_EXPORT_NAMES,
  AUTH_EXPORT_NAMES 
} from './lib/stack-naming.js';

// Import from base infrastructure
const vpcId = cdk.Fn.importValue(createBaseImportValue(environment, BASE_EXPORT_NAMES.VPC_ID));

// Import from auth infrastructure  
const ldapToken = cdk.Fn.importValue(createAuthImportValue(environment, AUTH_EXPORT_NAMES.AUTHENTIK_LDAP_TOKEN_ARN));
```
