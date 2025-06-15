# TAK Authentication Infrastructure - Quick Reference

## Quick Comparison

### Production Configuration
```bash
# Deploy production
npx cdk deploy --context envType=prod --context authentikAdminUserEmail=admin@company.com --profile tak
```
- ✅ High availability (multi-AZ deployment)
- ✅ Full VPC endpoints for AWS services
- ✅ Redundant Aurora database instances
- ✅ Container Insights enabled
- ❌ Higher cost (~$210/month)

### Dev-Test Configuration  
```bash
# Deploy dev-test (default)
npx cdk deploy --context authentikAdminUserEmail=admin@example.com --profile tak
```
- ✅ Cost optimized (~$120/month)
- ✅ Same core functionality
- ✅ Perfect for development
- ❌ Single database instance
- ❌ Limited monitoring

## Key Resources Deployed

| Resource | Dev-Test | Production | Notes |
|----------|----------|------------|-------|
| Aurora PostgreSQL | 1 instance | 2 instances | Primary + secondary |
| ElastiCache Redis | 1 node | 2 nodes | Single vs multi-AZ |
| ECS Services | 3 (3 containers) | 3 (6 containers) | Authentik server + worker + LDAP |
| Load Balancers | 2 | 2 | ALB + NLB |
| EFS File System | 1 | 1 | Shared storage |
| Secrets Manager | 3 secrets | 3 secrets | DB, LDAP, admin tokens |
| Container Insights | ❌ | ✅ | Monitoring |
| Deletion Protection | ❌ | ✅ | Data safety |

## Stack Architecture

### AuthInfraStack (Main Stack)
- Authentik web application (ECS Fargate)
- Aurora PostgreSQL database
- ElastiCache Redis cluster
- Application Load Balancer
- EFS file system for media/certs
- Secrets Manager integration

### LdapStack (LDAP Outpost)
- Authentik LDAP Outpost (ECS Fargate)
- Network Load Balancer
- LDAP service integration
- TAK Server compatibility

## Cost Breakdown

### Dev-Test (~$120/month)
- Aurora PostgreSQL (1 instance): $45
- ElastiCache Redis (1 node): $15
- ECS Fargate (3 containers): $50
- Load Balancers (ALB + NLB): $20
- Storage (EFS + backups): $5

### Production (~$210/month)
- Aurora PostgreSQL (2 instances): $90
- ElastiCache Redis (2 nodes): $30
- ECS Fargate (6 containers): $80
- Load Balancers (ALB + NLB): $20
- Storage (EFS + backups): $5

## Decision Matrix

Choose **Dev-Test** if:
- 💰 Cost optimization priority
- 🧪 Development/testing workloads
- 📚 Learning about TAK on AWS
- ⏰ Some downtime acceptable

Choose **Production** if:
- 🚀 Production workloads
- 🔒 High availability required
- 👥 Serving real users
- 📊 Full monitoring needed

