# Quick Reference Guide

## Essential Commands

### **Development Workflow**
```bash
# Install and build
npm install && npm run build

# Deploy development environment
npm run deploy:dev

# Deploy production environment
npm run deploy:prod

# Preview changes
npm run synth:dev
npm run synth:prod

# Show differences
npm run cdk:diff:dev
npm run cdk:diff:prod
```

### **Testing**
```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### **Cleanup**
```bash
# Clean build artifacts
npm run clean

# Destroy stack (development)
npx cdk destroy --context env=dev-test
```

## Common Deployment Patterns

### **Basic Deployment**
```bash
# Minimal required parameters
npm run deploy:dev -- \
  --context stackName=Demo \
  --context authentik.adminUserEmail=admin@company.com
```

### **Custom Database**
```bash
# Upgrade database instance
npm run deploy:dev -- \
  --context stackName=Demo \
  --context authentik.adminUserEmail=admin@company.com \
  --context database.instanceClass=db.t4g.small
```

### **Production Deployment**
```bash
# Full production setup
npm run deploy:prod -- \
  --context stackName=Prod \
  --context authentik.adminUserEmail=admin@company.com
```

### **High-Performance Development**
```bash
# Development with production-like resources
npm run deploy:dev -- \
  --context stackName=Staging \
  --context authentik.adminUserEmail=admin@company.com \
  --context ecs.taskCpu=1024 \
  --context ecs.taskMemory=2048 \
  --context database.instanceClass=db.t4g.small
```

## Environment Defaults

| Setting | dev-test | prod |
|---------|----------|------|
| **Database** | db.serverless (1 instance) | db.t4g.large (2 instances) |
| **Redis** | cache.t3.micro (1 node) | cache.t3.small (2 nodes) |
| **ECS** | 512 CPU, 1024 MB | 1024 CPU, 2048 MB |
| **Encryption** | Disabled | Enabled |
| **Monitoring** | Basic | Enhanced |
| **ECS Exec** | Enabled | Disabled |
| **Cleanup** | DESTROY | RETAIN |

## Stack Outputs

After deployment, the stack provides these outputs:

```bash
# View all outputs
aws cloudformation describe-stacks \
  --stack-name TAK-Demo-AuthInfra \
  --query 'Stacks[0].Outputs'
```

### **Key Outputs**
- `AuthentikUrl` - Web interface URL
- `LdapEndpoint` - LDAP connection string
- `DatabaseEndpoint` - RDS endpoint
- `RedisEndpoint` - ElastiCache endpoint

## Troubleshooting Quick Fixes

### **Missing Base Infrastructure**
```bash
# Check if base stack exists
aws cloudformation describe-stacks --stack-name TAK-Demo-BaseInfra
```

### **ECR Images Missing**
```bash
# List available images
aws ecr describe-images --repository-name TAK-Demo-BaseInfra
```

### **Parameter Validation Errors**
```bash
# Validate configuration
npm run synth:dev -- --context stackName=Demo
```

### **Deployment Stuck**
```bash
# Check CloudFormation events
aws cloudformation describe-stack-events \
  --stack-name TAK-Demo-AuthInfra \
  --max-items 10
```

## Service Endpoints

After successful deployment:

- **Authentik Web UI**: `https://account.{domain}`
- **LDAP Service**: `ldap.{domain}:389` (LDAP) / `ldap.{domain}:636` (LDAPS)
- **Admin Credentials**: Stored in AWS Secrets Manager

## Cost Optimization Tips

### **Development**
- Use `env=dev-test` for cost-optimized defaults
- Single database instance (`database.instanceCount=1`)
- Smaller instance types (`db.t3.micro`, `cache.t3.micro`)
- Disable encryption for non-sensitive data

### **Production**
- Use `env=prod` for high-availability defaults
- Enable all security features
- Monitor costs with AWS Cost Explorer
- Use Reserved Instances for predictable workloads

## Security Checklist

- ✅ Admin email configured
- ✅ Database encryption enabled (prod)
- ✅ Redis encryption enabled (prod)
- ✅ Security groups properly configured
- ✅ Secrets stored in AWS Secrets Manager
- ✅ SSL certificates from ACM

## Next Steps

1. **Configure Authentik** - Access web interface and set up authentication
2. **Test LDAP** - Verify LDAP connectivity from TAK server
3. **Monitor Resources** - Set up CloudWatch alarms
4. **Deploy TAK Server** - Connect to authentication infrastructure