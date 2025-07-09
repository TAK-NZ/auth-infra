# Cost Analysis - TAK Authentication Infrastructure

## Summary

Based on thorough analysis of the CDK code and actual AWS resources deployed, the cost estimates have been updated across all documentation to reflect accurate pricing in USD for the ap-southeast-2 region.

## Updated Cost Estimates

| Environment | Previous Estimate | Updated Estimate | Difference |
|-------------|------------------|------------------|------------|
| **dev-test** | ~$85 USD | ~$106 USD | +$21 USD (+25%) |
| **prod** | ~$245 USD | ~$367 USD | +$122 USD (+50%) |

## Detailed Cost Breakdown

### Development Environment (~$106 USD/month)

| Resource | Configuration | Monthly Cost |
|----------|---------------|--------------|
| **Aurora Serverless v2** | 0.5 ACU average, single AZ | ~$45 |
| **ElastiCache Redis** | cache.t3.micro, 1 node | ~$15 |
| **ECS Fargate** | 1 task × 512 CPU/1024 MB | ~$25 |
| **Application Load Balancer** | Standard ALB | ~$16 |
| **Network Load Balancer** | Standard NLB | ~$16 |
| **EFS File System** | Bursting mode | ~$2 |
| **Secrets Manager** | 5 secrets | ~$2 |
| **CloudWatch Logs** | Basic retention | ~$1 |
| **Route53** | 2 DNS records | ~$1 |
| **KMS** | Encryption operations | ~$1 |
| **ECR** | 2 repositories, 5 images each | ~$1 |
| **Lambda** | LDAP token retriever | <$1 |

**Total: ~$106 USD/month**

### Production Environment (~$367 USD/month)

| Resource | Configuration | Monthly Cost |
|----------|---------------|--------------|
| **Aurora PostgreSQL** | 2 × db.t4g.large, Multi-AZ | ~$280 |
| **ElastiCache Redis** | 2 × cache.t3.small, encrypted | ~$30 |
| **ECS Fargate** | 2 tasks × 1024 CPU/2048 MB | ~$50 |
| **Application Load Balancer** | Standard ALB | ~$16 |
| **Network Load Balancer** | Standard NLB | ~$16 |
| **EFS File System** | Bursting mode | ~$2 |
| **Secrets Manager** | 5 secrets | ~$2 |
| **CloudWatch Logs** | Extended retention | ~$3 |
| **Performance Insights** | Database monitoring | ~$7 |
| **Container Insights** | ECS monitoring | ~$8 |
| **Route53** | 2 DNS records | ~$1 |
| **KMS** | Encryption operations | ~$1 |
| **ECR** | 2 repositories, 20 images each, scanning | ~$2 |
| **Lambda** | LDAP token retriever | <$1 |

**Total: ~$367 USD/month**

## Key Cost Drivers

### Major Differences Between Environments

1. **Database**: $235 USD difference
   - Dev: Aurora Serverless v2 (~$45)
   - Prod: 2 × db.t4g.large Multi-AZ (~$280)

2. **ECS Compute**: $25 USD difference
   - Dev: 1 task × 512/1024 (~$25)
   - Prod: 2 tasks × 1024/2048 (~$50)

3. **Redis**: $15 USD difference
   - Dev: 1 × cache.t3.micro (~$15)
   - Prod: 2 × cache.t3.small (~$30)

4. **Monitoring**: $15 USD difference
   - Dev: Basic CloudWatch (~$1)
   - Prod: Performance Insights + Container Insights (~$15)

## Cost Optimization Opportunities

### Development Environment
- Aurora Serverless v2 provides significant cost savings vs dedicated instances
- Single AZ deployment reduces costs but impacts availability
- Minimal monitoring reduces CloudWatch costs
- Basic encryption (KMS storage only) vs full transit encryption

### Production Environment
- Multi-AZ deployment ensures high availability
- Enhanced monitoring provides operational insights
- Full encryption (transit + at-rest) ensures security compliance
- Resource retention policies protect against accidental deletion

## Factors Not Included in Estimates

- **Data Transfer**: Outbound data transfer charges
- **Storage Usage**: Variable EFS storage costs based on actual usage
- **API Calls**: Variable costs for AWS API operations
- **Backup Storage**: Aurora backup storage beyond free tier
- **Regional Variations**: Costs may vary in different AWS regions

## Validation Against CDK Resources

The cost estimates are based on analysis of the actual CDK constructs:

- **Database**: `lib/constructs/database.ts` - Aurora Serverless v2 vs provisioned instances
- **Redis**: `lib/constructs/redis.ts` - ElastiCache configuration
- **ECS**: `lib/constructs/authentik-server.ts` and `lib/constructs/authentik-worker.ts` - Fargate tasks
- **Load Balancers**: `lib/constructs/elb.ts` and `lib/constructs/ldap.ts` - ALB and NLB
- **Storage**: `lib/constructs/efs.ts` - EFS file system
- **Configuration**: `cdk.json` - Environment-specific settings

All cost estimates reflect the actual resources deployed by the CDK stack.