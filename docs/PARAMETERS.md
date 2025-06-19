# Configuration Parameters Reference

## Overview

This document provides a comprehensive reference for all configuration parameters available in the TAK Authentication Infrastructure CDK stack.

## Parameter Categories

### **Required Parameters**

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `stackName` | string | Stack identifier for CloudFormation exports | `"Demo"`, `"Prod"` |
| `authentik.adminUserEmail` | string | Administrator email for Authentik | `"admin@company.com"` |

### **Database Configuration**

| Parameter | Type | Default (dev-test) | Default (prod) | Description |
|-----------|------|-------------------|----------------|-------------|
| `database.instanceClass` | string | `db.t3.micro` | `db.t3.small` | RDS instance class |
| `database.instanceCount` | number | `1` | `2` | Number of database instances |
| `database.allocatedStorage` | number | `20` | `100` | Initial storage allocation (GB) |
| `database.maxAllocatedStorage` | number | `100` | `1000` | Maximum storage allocation (GB) |
| `database.enablePerformanceInsights` | boolean | `false` | `true` | Enable performance insights |
| `database.monitoringInterval` | number | `0` | `60` | Enhanced monitoring interval |
| `database.backupRetentionDays` | number | `7` | `30` | Backup retention period |
| `database.deleteProtection` | boolean | `false` | `true` | Enable deletion protection |

### **Redis Configuration**

| Parameter | Type | Default (dev-test) | Default (prod) | Description |
|-----------|------|-------------------|----------------|-------------|
| `redis.nodeType` | string | `cache.t3.micro` | `cache.t3.small` | ElastiCache node type |
| `redis.numCacheNodes` | number | `1` | `2` | Number of cache nodes |
| `redis.enableTransit` | boolean | `false` | `true` | Enable encryption in transit |
| `redis.enableAtRest` | boolean | `false` | `true` | Enable encryption at rest |

### **ECS Configuration**

| Parameter | Type | Default (dev-test) | Default (prod) | Description |
|-----------|------|-------------------|----------------|-------------|
| `ecs.taskCpu` | number | `512` | `1024` | CPU units for ECS tasks |
| `ecs.taskMemory` | number | `1024` | `2048` | Memory (MB) for ECS tasks |
| `ecs.desiredCount` | number | `1` | `2` | Desired number of running tasks |
| `ecs.enableDetailedLogging` | boolean | `true` | `false` | Enable detailed application logging |

### **Application Configuration**

| Parameter | Type | Default (dev-test) | Default (prod) | Description |
|-----------|------|-------------------|----------------|-------------|
| `authentik.domain` | string | `account.dev.tak.nz` | `account.tak.nz` | Authentik web interface domain |
| `authentik.adminUserEmail` | string | **Required** | **Required** | Administrator email address |
| `ldap.domain` | string | `ldap.dev.tak.nz` | `ldap.tak.nz` | LDAP service domain |

### **General Configuration**

| Parameter | Type | Default (dev-test) | Default (prod) | Description |
|-----------|------|-------------------|----------------|-------------|
| `general.removalPolicy` | string | `DESTROY` | `RETAIN` | Resource cleanup policy |
| `general.enableDetailedLogging` | boolean | `true` | `false` | Enable detailed CloudWatch logging |
| `general.enableContainerInsights` | boolean | `false` | `true` | Enable ECS Container Insights |

## Environment Types

### **dev-test Environment**
- **Focus**: Cost optimization and development efficiency
- **Database**: Single instance, minimal storage
- **Redis**: Single node, no encryption
- **ECS**: Minimal CPU/memory allocation
- **Logging**: Detailed logging enabled for debugging
- **Cleanup**: Resources can be destroyed

### **prod Environment**
- **Focus**: High availability, security, and production readiness
- **Database**: Multi-AZ deployment, performance insights
- **Redis**: Multi-node, encryption enabled
- **ECS**: Higher resource allocation, multiple tasks
- **Logging**: Optimized logging, Container Insights enabled
- **Cleanup**: Resources protected from deletion

## Parameter Override Examples

### **Basic Overrides**
```bash
# Custom admin email
npm run deploy:dev -- --context authentik.adminUserEmail=admin@company.com

# Custom stack name
npm run deploy:dev -- --context stackName=MyDemo
```

### **Database Scaling**
```bash
# Upgrade database instance
npm run deploy:dev -- --context database.instanceClass=db.t3.small

# Enable multi-AZ for development
npm run deploy:dev -- --context database.instanceCount=2

# Increase storage
npm run deploy:dev -- --context database.allocatedStorage=50
```

### **Performance Tuning**
```bash
# Increase ECS resources
npm run deploy:dev -- \
  --context ecs.taskCpu=1024 \
  --context ecs.taskMemory=2048

# Scale Redis
npm run deploy:dev -- --context redis.nodeType=cache.t3.small

# Enable performance monitoring
npm run deploy:dev -- --context database.enablePerformanceInsights=true
```

### **Security Enhancements**
```bash
# Enable Redis encryption in dev
npm run deploy:dev -- \
  --context redis.enableTransit=true \
  --context redis.enableAtRest=true

# Enable database protection
npm run deploy:dev -- --context database.deleteProtection=true
```

## Configuration Validation

The stack validates configuration parameters at deployment time:

- **Required parameters** must be provided
- **Database instance classes** must be valid RDS instance types
- **Redis node types** must be valid ElastiCache node types
- **ECS CPU/memory** combinations must be valid Fargate configurations
- **Email addresses** must be valid format

## Best Practices

### **Development Environments**
- Use cost-optimized defaults (`env=dev-test`)
- Override only specific parameters as needed
- Enable detailed logging for debugging
- Use smaller instance sizes

### **Production Environments**
- Use production defaults (`env=prod`)
- Enable all security features
- Use multi-AZ deployments
- Monitor performance and costs

### **Staging Environments**
- Start with production configuration
- Selectively optimize for cost
- Test production-like settings
- Validate performance characteristics

## Troubleshooting

### **Invalid Parameter Values**
```
Error: Invalid instance class: db.invalid.type
```
**Solution**: Use valid AWS instance types from the documentation.

### **Resource Limits**
```
Error: Requested CPU/memory combination not supported
```
**Solution**: Use valid Fargate CPU/memory combinations.

### **Missing Required Parameters**
```
Error: authentik.adminUserEmail is required
```
**Solution**: Provide all required parameters via context or configuration.