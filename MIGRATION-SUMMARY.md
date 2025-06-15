# CDK Migration Summary

## Overview

The TAK Authentication Infrastructure has been successfully converted from using `@openaddresses/cloudfriend` to AWS CDK v2. This migration provides better type safety, maintainability, and modern infrastructure-as-code practices.

## Key Benefits of CDK Migration

1. **Type Safety**: Full TypeScript support with compile-time validation
2. **Better Organization**: Logical separation into reusable constructs
3. **Modern Practices**: Using AWS CDK L2 constructs with sensible defaults
4. **Enhanced Testing**: Built-in testing framework with assertions
5. **Improved Documentation**: Self-documenting code with TypeScript interfaces

## Files Created/Modified

### New CDK Structure
- `cdk.json` - CDK configuration
- `bin/cdk.ts` - CDK application entry point
- `lib/auth-infra-stack.ts` - Main stack definition
- `lib/constructs/` - Modular construct definitions
  - `database.ts` - Aurora PostgreSQL cluster
  - `redis.ts` - Redis/Valkey cluster
  - `efs.ts` - EFS file system and access points
  - `secrets.ts` - Secrets Manager secrets
  - `authentik.ts` - ECS services, ALB, and related resources

### Deployment Tools
- `deploy.sh` - Comprehensive deployment script
- `README-CDK.md` - CDK-specific documentation

### Testing
- `test/auth-infra-stack.test.ts` - Unit tests for stack validation
- `jest.config.json` - Jest testing configuration

### Updated Files
- `package.json` - Updated dependencies and scripts
- `tsconfig.json` - TypeScript configuration

## Installation Steps

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Install CDK CLI globally** (if not already installed):
   ```bash
   npm install -g aws-cdk
   ```

3. **Build the project**:
   ```bash
   npm run build
   ```

4. **Synthesize template** (validate without deploying):
   ```bash
   cdk synth --context environment=dev --context envType=dev-test
   ```

## Deployment Examples

### Development Environment
```bash
./deploy.sh -e dev -t dev-test \\
  -c arn:aws:acm:us-east-1:123456789012:certificate/abc123 \\
  -m admin@example.com
```

### Production Environment
```bash
./deploy.sh -e prod -t prod \\
  -c arn:aws:acm:us-east-1:123456789012:certificate/abc123 \\
  -m admin@example.com \\
  -b "DC=company,DC=com"
```

### Manual CDK Commands
```bash
# Deploy with specific parameters
cdk deploy --context environment=dev --context envType=dev-test \\
  --parameters SSLCertificateARN=arn:aws:acm:region:account:certificate/cert-id \\
  --parameters AuthentikAdminUserEmail=admin@example.com \\
  --parameters AuthentikLDAPBaseDN=DC=example,DC=com

# Show differences before deployment
cdk diff --context environment=dev --context envType=dev-test

# Destroy stack
cdk destroy --context environment=dev
```

## Resource Mapping

| CloudFriend Resource | CDK Equivalent | Construct Location |
|---------------------|----------------|-------------------|
| Aurora DB Cluster | `rds.DatabaseCluster` | `database.ts` |
| Redis Cluster | `elasticache.CfnReplicationGroup` | `redis.ts` |
| EFS File System | `efs.FileSystem` | `efs.ts` |
| Secrets Manager | `secretsmanager.Secret` | `secrets.ts` |
| ECS Services | `ecs.FargateService` | `authentik.ts` |
| Application Load Balancer | `elbv2.ApplicationLoadBalancer` | `authentik.ts` |
| Security Groups | `ec2.SecurityGroup` | Various constructs |
| IAM Roles | `iam.Role` | `authentik.ts` |

## Key Differences from CloudFriend

1. **Modular Design**: Resources are organized into logical constructs
2. **Type Safety**: TypeScript interfaces ensure proper configuration
3. **Sensible Defaults**: CDK L2 constructs provide better defaults
4. **Automatic Dependencies**: CDK manages resource dependencies automatically
5. **Built-in Validation**: Compile-time and runtime validation
6. **Better Error Messages**: More descriptive error messages

## Dependencies

### Base Infrastructure Requirements
The stack requires the following exports from the base infrastructure:
- `TAK-{environment}-BaseInfra-vpc-id`
- `TAK-{environment}-BaseInfra-vpc-cidr-ipv4`
- `TAK-{environment}-BaseInfra-subnet-private-a`
- `TAK-{environment}-BaseInfra-subnet-private-b`
- `TAK-{environment}-BaseInfra-subnet-public-a`
- `TAK-{environment}-BaseInfra-subnet-public-b`
- `TAK-{environment}-BaseInfra-kms`
- `TAK-{environment}-BaseInfra-s3`

### Package Dependencies
- `aws-cdk-lib`: ^2.170.0
- `constructs`: ^10.0.0
- `typescript`: ~5.5.0
- `ts-node`: ^10.9.1

## Testing

Run the test suite to validate the stack:
```bash
npm test
```

The tests validate:
- Stack creation
- Resource existence and properties
- Parameter definitions
- Output declarations
- IAM permissions
- Security group configurations

## Troubleshooting

### Common Issues

1. **Build Errors**: Run `npm run build` to identify TypeScript errors
2. **Missing Dependencies**: Ensure all exports from base infrastructure exist
3. **AWS Credentials**: Verify AWS CLI is configured with proper permissions
4. **CDK Bootstrap**: Ensure CDK is bootstrapped in your AWS account/region

### Debug Commands
```bash
# Check synthesized template
cdk synth --context environment=dev | less

# List all stacks
cdk list

# Show deployment progress
cdk deploy --context environment=dev --progress events

# Check CDK version
cdk --version
```

## Migration Checklist

- [ ] Install CDK dependencies (`npm install`)
- [ ] Build TypeScript code (`npm run build`)
- [ ] Validate template synthesis (`cdk synth`)
- [ ] Test in development environment
- [ ] Review differences (`cdk diff`)
- [ ] Deploy to development (`./deploy.sh`)
- [ ] Validate functionality
- [ ] Deploy to production
- [ ] Update CI/CD pipelines
- [ ] Archive CloudFriend configuration

## Rollback Plan

If issues occur during migration:

1. Keep the original CloudFriend configuration in `backup/cloudformation/`
2. The CDK stack can be destroyed with `cdk destroy`
3. Redeploy using the original CloudFriend method if needed
4. Data persistence: RDS and EFS data will be preserved during stack operations

## Support

For issues or questions regarding the CDK migration:
1. Check the AWS CDK documentation
2. Review the test suite for expected behavior
3. Use the migration check script for validation
4. Refer to the CloudFormation template in `cdk.out/` for troubleshooting

## Stack Naming Convention

The CDK migration uses the TAK standard naming convention:

### Stack Names
- **Auth Stack**: `TAK-{environment}-AuthInfra` (e.g., `TAK-dev-AuthInfra`, `TAK-prod-AuthInfra`)
- **LDAP Stack**: `TAK-{environment}-AuthInfra-LDAP` (e.g., `TAK-dev-AuthInfra-LDAP`, `TAK-prod-AuthInfra-LDAP`)

### Export Names
All CloudFormation exports follow the pattern: `{stackName}-{resourceType}`

Examples:
- `TAK-dev-AuthInfra-authentik-url` - Main Authentik application URL
- `TAK-dev-AuthInfra-authentik-ldap-token-arn` - LDAP token secret ARN
- `TAK-dev-AuthInfra-ldapservice-user-arn` - LDAP service user secret ARN

### Stack Naming Utility
The project includes a centralized stack naming utility (`lib/stack-naming.ts`) that provides:
- Consistent stack name generation
- Standardized export/import name creation
- Type-safe resource name constants
- Helper functions for cross-stack references
