# TAK Authentication Infrastructure - Quick Reference

## Quick Deployment Commands

### Using Enhanced NPM Scripts (Recommended)
```bash
# Development environment (cost-optimized)
npm run deploy:dev

# Production environment (high availability)
npm run deploy:prod
```

### Using Direct CDK Commands
```bash
# Development environment
npx cdk deploy --context env=dev-test --profile your-aws-profile

# Production environment
npx cdk deploy --context env=prod --profile your-aws-profile
```

## Environment Comparison

### Development Environment (`dev-test`)
- ✅ **Cost optimized** (~$106 USD/month)
- ✅ **Same core functionality** as production
- ✅ **Perfect for development** and testing
- ✅ **Aurora Serverless v2** (pay-per-use scaling)
- ❌ **Single AZ deployment** (potential downtime during maintenance)
- ❌ **Basic encryption** (KMS encrypted storage only)
- ❌ **Basic monitoring** (limited insights)

### Production Environment (`prod`)
- ✅ **High availability** (Multi-AZ deployment)
- ✅ **Full encryption** (at-rest and in-transit)
- ✅ **Enhanced monitoring** (Performance Insights, Container Insights)
- ✅ **Production-grade database** (dedicated instances)
- ✅ **Data protection** (retention policies)
- ❌ **Higher cost** (~$367 USD/month)

## Configuration Override Examples

```bash
# Custom domain deployment
npm run deploy:dev -- --context r53ZoneName=custom.tak.nz

# Enhanced development environment
npm run deploy:dev -- --context instanceClass=db.t4g.small

# Custom admin email
npm run deploy:prod -- --context adminUserEmail=admin@company.com

# High-performance development
npm run deploy:dev -- \
  --context taskCpu=1024 \
  --context taskMemory=2048 \
  --context desiredCount=2
```

## Infrastructure Resources

| Resource | Dev-Test | Production | Notes |
|----------|----------|------------|-------|
| **Aurora PostgreSQL** | **Serverless v2** | **Dedicated (Multi-AZ)** | Major cost/performance difference |
| **ElastiCache Redis** | **1 node** | **2 nodes** | Single vs clustered |
| **ECS Tasks** | 1 × 512/1024 | 2 × 1024/2048 | CPU/Memory allocation |
| **Application Load Balancer** | 1 | 1 | HTTPS termination |
| **Network Load Balancer** | 1 | 1 | LDAP traffic |
| **Enrollment Lambda** | 1 | 1 | Device enrollment interface |
| **EFS File System** | 1 | 1 | Persistent storage |
| **Secrets Manager** | 3 secrets | 3 secrets | Admin, DB, Redis credentials |
| **ECR Repositories** | 2 | 2 | Authentik server + LDAP |
| **CloudWatch Logs** | Basic | Enhanced | Retention and insights |

## Cost Breakdown (Estimated USD for ap-southeast-2)

### Development Environment (~$106 USD/month)
- **Aurora Serverless v2**: ~$45/month (0.5 ACU average)
- **ElastiCache**: ~$15/month (cache.t3.micro)
- **ECS Fargate**: ~$25/month (1 task × 512 CPU/1024 MB)
- **Load Balancers**: ~$18/month (ALB + NLB)
- **Storage & Other**: ~$3/month (EFS, logs, secrets)

### Production Environment (~$367 USD/month)
- **Aurora Multi-AZ**: ~$280/month (2 × db.t4g.large)
- **ElastiCache**: ~$30/month (2 × cache.t3.small)
- **ECS Fargate**: ~$50/month (2 tasks × 1024 CPU/2048 MB)
- **Load Balancers**: ~$18/month (ALB + NLB)
- **Enhanced Features**: ~$15/month (monitoring, insights)

## Development Workflow

### Available NPM Scripts
```bash
# Development and Testing
npm run build                # Build TypeScript
npm run test                 # Run unit tests
npm run test:watch          # Run tests in watch mode
npm run test:coverage       # Generate coverage report

# Infrastructure Management
npm run synth:dev           # Preview dev infrastructure
npm run synth:prod          # Preview prod infrastructure
npm run cdk:diff:dev        # Show changes for dev
npm run cdk:diff:prod       # Show changes for prod
npm run cdk:bootstrap       # Bootstrap CDK
```

## Decision Matrix

### Choose Development Environment if:
- 💰 **Cost is primary concern**
- 🧪 **Development/testing workloads**
- 📚 **Learning Authentik/LDAP integration**
- ⏰ **Occasional downtime acceptable**
- 🚀 **Rapid iteration needed**

### Choose Production Environment if:
- 🏢 **Production authentication workloads**
- 🔒 **Security compliance required**
- ⚡ **High availability needed**
- 👥 **Serving real users**
- 📊 **Monitoring/insights required**
- 💾 **Data protection critical**

## Service Endpoints

After successful deployment:

- **Authentik Web UI**: `https://account.{domain}`
- **Device Enrollment**: `https://enroll.{domain}` - ATAK/iTAK device enrollment interface
- **LDAP Service**: `ldap.{domain}:389` (LDAP) / `ldap.{domain}:636` (LDAPS)
- **Admin Credentials**: Stored in AWS Secrets Manager
- **Database**: Private endpoint (accessible via ECS tasks)
- **Redis**: Private endpoint (accessible via ECS tasks)

## Troubleshooting Quick Fixes

### **Missing Base Infrastructure**
```bash
# Check if base stack exists
aws cloudformation describe-stacks --stack-name TAK-Demo-BaseInfra
```

### **Docker Build Issues**
```bash
# Check Docker daemon is running
docker info

# Verify Dockerfiles exist
ls -la docker/authentik-server/
ls -la docker/authentik-ldap/
```

### **Missing Admin Email**
```bash
# Deploy with admin email
npm run deploy:dev -- --context adminUserEmail=admin@company.com
```

### **Deployment Stuck**
```bash
# Check CloudFormation events
aws cloudformation describe-stack-events \
  --stack-name TAK-Demo-AuthInfra \
  --max-items 10
```

## Quick Links

- **[Main README](../README.md)** - Complete project overview
- **[Deployment Guide](DEPLOYMENT_GUIDE.md)** - Detailed deployment instructions
- **[Configuration Guide](PARAMETERS.md)** - Complete configuration reference
- **[Device Enrollment Guide](ENROLLMENT_GUIDE.md)** - ATAK/iTAK device enrollment
- **[Architecture Guide](ARCHITECTURE.md)** - Technical architecture details