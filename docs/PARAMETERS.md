# Configuration Management Guide

The TAK Authentication Infrastructure uses **AWS CDK context-based configuration** with centralized settings in [`cdk.json`](../cdk.json). This provides a single source of truth for all environment configurations while supporting runtime overrides.

## Quick Configuration Reference

### **Environment-Specific Deployment**
```bash
# Deploy with default configuration
npm run deploy:dev     # Development environment
npm run deploy:prod    # Production environment

# Deploy with configuration overrides
npm run deploy:dev -- --context adminUserEmail=admin@company.com
npm run deploy:prod -- --context instanceClass=db.t4g.large
```

## Configuration System Architecture

### **Context-Based Configuration**
All configurations are stored in [`cdk.json`](../cdk.json) under the `context` section:

```json
{
  "context": {
    "dev-test": {
      "stackName": "Dev",
      "database": {
        "instanceClass": "db.serverless",
        "instanceCount": 1,
        "engineVersion": "17.4",
        "allocatedStorage": 20,
        "maxAllocatedStorage": 100,
        "enablePerformanceInsights": false,
        "monitoringInterval": 0,
        "backupRetentionDays": 7,
        "deleteProtection": false
      },
      "redis": {
        "nodeType": "cache.t3.micro",
        "numCacheNodes": 1,
        "enableTransit": false,
        "enableAtRest": false
      },
      "ecs": {
        "taskCpu": 512,
        "taskMemory": 1024,
        "desiredCount": 1,
        "enableDetailedLogging": true,
        "enableEcsExec": true
      },
      "authentik": {
        "hostname": "account",
        "adminUserEmail": "admin@tak.nz",
        "ldapHostname": "ldap",
        "ldapBaseDn": "dc=tak,dc=nz",
        "useS3AuthentikConfigFile": false,
        "enablePostgresReadReplicas": false,
        "branding": "tak-nz",
        "authentikVersion": "2025.6.2",
        "outboundEmailServerPort": 587
      },
      "ecr": {
        "imageRetentionCount": 5,
        "scanOnPush": false
      },
      "general": {
        "removalPolicy": "DESTROY",
        "enableDetailedLogging": true,
        "enableContainerInsights": false
      }
    },
    "prod": {
      "stackName": "Prod",
      "database": {
        "instanceClass": "db.t4g.large",
        "instanceCount": 2,
        "engineVersion": "17.4",
        "allocatedStorage": 100,
        "maxAllocatedStorage": 1000,
        "enablePerformanceInsights": true,
        "monitoringInterval": 60,
        "backupRetentionDays": 30,
        "deleteProtection": true
      },
      "redis": {
        "nodeType": "cache.t3.small",
        "numCacheNodes": 2,
        "enableTransit": true,
        "enableAtRest": true
      },
      "ecs": {
        "taskCpu": 1024,
        "taskMemory": 2048,
        "desiredCount": 2,
        "enableDetailedLogging": false,
        "enableEcsExec": false
      },
      "authentik": {
        "hostname": "account",
        "adminUserEmail": "admin@tak.nz",
        "ldapHostname": "ldap",
        "ldapBaseDn": "dc=tak,dc=nz",
        "useS3AuthentikConfigFile": true,
        "enablePostgresReadReplicas": false,
        "branding": "tak-nz",
        "authentikVersion": "2025.6.2",
        "outboundEmailServerPort": 587
      },
      "ecr": {
        "imageRetentionCount": 20,
        "scanOnPush": true
      },
      "general": {
        "removalPolicy": "RETAIN",
        "enableDetailedLogging": false,
        "enableContainerInsights": true
      }
    }
  }
}
```

### **Environment Comparison**

| Environment | Stack Name | Description | Monthly Cost* |
|-------------|------------|-------------|---------------|
| `dev-test` | `TAK-Dev-AuthInfra` | Cost-optimized development | ~$106 USD |
| `prod` | `TAK-Prod-AuthInfra` | High-availability production | ~$367 USD |

*Estimated AWS costs in USD for ap-southeast-2 region, excluding data transfer and storage usage

### **Key Configuration Differences**

| Setting | dev-test | prod | Impact |
|---------|----------|------|--------|
| **Database Instance** | `db.serverless` (Aurora Serverless v2) | `db.t4g.large` (2 instances) | High availability |
| **Database Storage** | `20GB` initial, `100GB` max | `100GB` initial, `1000GB` max | Storage capacity |
| **Performance Insights** | `false` | `true` | Database monitoring |
| **Redis Nodes** | `cache.t3.micro` (1 node) | `cache.t3.small` (2 nodes) | High availability |
| **Redis Encryption** | `false` | `true` | Security compliance |
| **ECS Resources** | `512 CPU, 1024 MB` | `1024 CPU, 2048 MB` | Performance |
| **ECS Tasks** | `1` task | `2` tasks | High availability |
| **ECS Exec** | `true` (debugging) | `false` (security) | Development access |
| **Container Insights** | `false` | `true` | ECS monitoring |
| **S3 Config File** | `false` | `true` | Advanced configuration |
| **ECR Image Retention** | `5` images | `20` images | Image history |
| **ECR Vulnerability Scanning** | `false` | `true` | Security scanning |
| **Removal Policy** | `DESTROY` | `RETAIN` | Resource cleanup |

---

## **Runtime Configuration Overrides**

Use CDK's built-in `--context` flag with **flat parameter names** to override any configuration value. The actual implementation uses flat parameters, not dot notation:

### **Database Configuration**
| Parameter | Description | dev-test | prod |
|-----------|-------------|----------|------|
| `instanceClass` | RDS instance class | `db.serverless` | `db.t4g.large` |
| `instanceCount` | Number of database instances | `1` | `2` |
| `engineVersion` | PostgreSQL engine version | `17.4` | `17.4` |
| `allocatedStorage` | Initial storage allocation (GB) | `20` | `100` |
| `maxAllocatedStorage` | Maximum storage allocation (GB) | `100` | `1000` |
| `enablePerformanceInsights` | Enable performance insights | `false` | `true` |
| `monitoringInterval` | Enhanced monitoring interval (seconds) | `0` | `60` |
| `backupRetentionDays` | Backup retention period (days) | `7` | `30` |
| `deleteProtection` | Enable deletion protection | `false` | `true` |
| `enableCloudWatchLogs` | Enable CloudWatch logs for database | `false` | `false` |

### **Redis Configuration**
| Parameter | Description | dev-test | prod |
|-----------|-------------|----------|------|
| `nodeType` | ElastiCache node type | `cache.t3.micro` | `cache.t3.small` |
| `numCacheNodes` | Number of cache nodes | `1` | `2` |
| `enableTransit` | Enable encryption in transit | `false` | `true` |
| `enableAtRest` | Enable encryption at rest | `false` | `true` |

### **ECS Configuration**
| Parameter | Description | dev-test | prod |
|-----------|-------------|----------|------|
| `taskCpu` | CPU units for ECS tasks | `512` | `1024` |
| `taskMemory` | Memory (MB) for ECS tasks | `1024` | `2048` |
| `desiredCount` | Desired number of running tasks | `1` | `2` |
| `enableDetailedLogging` | Enable detailed application logging | `true` | `false` |
| `enableEcsExec` | Enable ECS exec for debugging | `true` | `false` |

### **Authentik Configuration**
| Parameter | Description | dev-test | prod |
|-----------|-------------|----------|------|
| `authentikHostname` | Hostname for Authentik service | `account` | `account` |
| `adminUserEmail` | Administrator email address | `admin@tak.nz` | `admin@tak.nz` |
| `ldapHostname` | Hostname for LDAP service | `ldap` | `ldap` |
| `ldapBaseDn` | LDAP base DN | `dc=tak,dc=nz` | `dc=tak,dc=nz` |
| `useS3AuthentikConfigFile` | Use S3 configuration file | `false` | `true` |
| `enablePostgresReadReplicas` | Enable read replicas (currently disabled) | `false` | `false` |
| `branding` | Docker image branding variant | `tak-nz` | `tak-nz` |
| `authentikVersion` | Authentik version | `2025.6.3` | `2025.6.3` |
| `outboundEmailServerPort` | Email server port for outbound connections | `587` | `587` |

### **ECR Configuration**
| Parameter | Description | dev-test | prod |
|-----------|-------------|----------|------|
| `ecr.imageRetentionCount` | Number of ECR images to retain | `5` | `20` |
| `ecr.scanOnPush` | Enable ECR vulnerability scanning | `false` | `true` |

### **Enrollment Configuration**
| Parameter | Description | dev-test | prod |
|-----------|-------------|----------|------|
| `enrollmentEnabled` | Enable device enrollment feature | `true` | `true` |

**Note**: Other enrollment settings (provider name, application details, etc.) are only configurable via [`cdk.json`](../cdk.json) and cannot be overridden via CLI.

### **General Configuration**
| Parameter | Description | dev-test | prod |
|-----------|-------------|----------|------|
| `removalPolicy` | Resource cleanup policy | `DESTROY` | `RETAIN` |
| `enableDetailedLogging` | Enable detailed CloudWatch logging | `true` | `false` |
| `enableContainerInsights` | Enable ECS Container Insights | `false` | `true` |

---

## **Security Considerations**

### **Network Security**
- **Private Subnets**: All compute resources deployed in private subnets
- **Security Groups**: Restrictive access controls with least privilege
- **Load Balancers**: Application Load Balancer for HTTPS, Network Load Balancer for LDAP
- **VPC Integration**: Imports VPC and subnets from base infrastructure

### **Data Security**
- **Database Encryption**: Aurora PostgreSQL encrypted with KMS
- **Redis Encryption**: In-transit and at-rest encryption (production)
- **Secrets Management**: AWS Secrets Manager for all sensitive data
- **EFS Encryption**: Encrypted file system for persistent storage

### **Access Control**
- **IAM Roles**: Service-specific roles with minimal permissions
- **ECS Exec**: Enabled in development, disabled in production
- **Admin Access**: Controlled via Authentik admin interface

---

## **Cost Optimization**

### **Development Environment Optimizations**
- **Aurora Serverless v2**: Pay-per-use database scaling (~$235 USD/month savings vs prod)
- **Single Redis Node**: Eliminates multi-AZ costs (~$15 USD/month savings vs prod)
- **Basic Encryption**: KMS storage encryption only (vs full transit + at-rest)
- **Smaller ECS Tasks**: Minimal CPU/memory allocation (~$25 USD/month savings vs prod)
- **Container Insights Disabled**: Reduces CloudWatch costs (~$15 USD/month savings vs prod)

### **Production Environment Features**
- **High Availability**: Multi-AZ database and Redis deployment
- **Enhanced Security**: Full encryption, vulnerability scanning
- **Performance Monitoring**: Performance Insights, Container Insights
- **Advanced Configuration**: S3-based Authentik configuration
- **Image Management**: Extended ECR retention, vulnerability scanning

---

## **Troubleshooting Configuration**

### **Common Configuration Issues**

#### **Invalid Database Instance Class**
```
Error: Invalid instance class: db.invalid.type
```
**Solution**: Use valid RDS instance types (e.g., `db.t4g.micro`, `db.t4g.small`, `db.t4g.large`, `db.serverless`)

#### **Missing Admin Email**
```
Error: authentik.adminUserEmail is required
```
**Solution**: Provide admin email in context configuration

#### **Invalid ECS CPU/Memory Combination**
```
Error: Invalid CPU/memory combination
```
**Solution**: Use valid Fargate combinations (512/1024, 1024/2048, etc.)

### **Configuration Validation**
```bash
# Preview configuration before deployment
npm run synth:dev
npm run synth:prod

# Validate specific overrides
npm run synth:dev -- --context instanceClass=db.t4g.small
```

### **Parameter Override Examples**
```bash
# Custom admin email
npm run deploy:dev -- --context adminUserEmail=admin@company.com

# Database scaling
npm run deploy:dev -- --context instanceClass=db.t4g.small

# Enable production features in development
npm run deploy:dev -- \
  --context enableTransit=true \
  --context enableAtRest=true \
  --context enablePerformanceInsights=true

# Custom stack name
npm run deploy:dev -- --context stackName=Demo

# Override ECS resources
npm run deploy:dev -- \
  --context taskCpu=1024 \
  --context taskMemory=2048 \
  --context desiredCount=2

# Enable S3 configuration in development
npm run deploy:dev -- --context useS3AuthentikConfigFile=true

# Custom branding and version
npm run deploy:prod -- \
  --context branding=generic \
  --context authentikVersion=2025.7.1

# Disable enrollment feature
npm run deploy:dev -- --context enrollmentEnabled=false

# Enable enrollment feature (if disabled in config)
npm run deploy:prod -- --context enrollmentEnabled=true
```

### **Override Syntax Rules**
- Use **flat parameter names**: `instanceClass=value` (NOT `database.instanceClass=value`)
- **Command-line context always takes precedence** over `cdk.json` values
- Can override **any configuration property** defined in the environment config
- Boolean values: `true`/`false` (not `True`/`False`)
- Numeric values: Raw numbers (not quoted)

---

## **Stack Naming and Tagging**

### **Stack Names**
- **dev-test**: `TAK-Dev-AuthInfra`  
- **prod**: `TAK-Prod-AuthInfra`

### **Custom Stack Names**
```bash
# Results in "TAK-Staging-AuthInfra"
npm run deploy:prod -- --context stackName=Staging

# Results in "TAK-Demo-AuthInfra"  
npm run deploy:dev -- --context stackName=Demo
```

### **Resource Tagging**
All AWS resources are automatically tagged with:
- **Project**: "TAK.NZ" (from `tak-defaults.project` or `tak-project` override)
- **Component**: "BaseInfra" (from `tak-defaults.component` or `tak-component` override)
- **Environment**: The environment name (from `stackName`)
- **ManagedBy**: "CDK"

### **Project Configuration Overrides**
The project metadata can be overridden using individual context parameters:

```bash
# Override project name for custom branding
npm run deploy:dev -- --context tak-project="Custom TAK Project"

# Override component name (useful for custom deployments)
npm run deploy:dev -- --context tak-component="CustomBaseInfra"

# Override region for tagging purposes
npm run deploy:dev -- --context tak-region="us-east-1"
```

#### **Project Context Parameters**
| Parameter | Description | Default | Example Override |
|-----------|-------------|---------|------------------|
| `tak-project` | Project name for resource tagging | `TAK.NZ` | `"Enterprise TAK"` |
| `tak-component` | Component name for resource tagging | `BaseInfra` | `"CustomBaseInfra"` |
| `tak-region` | Region identifier for tagging | `ap-southeast-2` | `"us-west-2"` |

**Note**: These parameters provide backward compatibility with the existing `tak-defaults` object while allowing individual overrides for deployment scripts and CI/CD pipelines.

---

## **Complete Configuration Reference**

### **Required Parameters**
| Parameter | Description | Example |
|-----------|-------------|----------|
| `stackName` | Stack identifier for CloudFormation exports | `Dev`, `Prod`, `Demo` |
| `adminUserEmail` | Administrator email for Authentik | `admin@company.com` |

### **Database Configuration**
| Parameter | Type | Description | Valid Values |
|-----------|------|-------------|-------------|
| `instanceClass` | string | RDS instance class | `db.serverless`, `db.t4g.micro`, `db.t4g.small`, `db.t4g.medium`, `db.t4g.large` |
| `instanceCount` | number | Number of database instances | `1`, `2` |
| `engineVersion` | string | PostgreSQL engine version | `17.4` |
| `allocatedStorage` | number | Initial storage allocation (GB) | `20-65536` |
| `maxAllocatedStorage` | number | Maximum storage allocation (GB) | `100-65536` |
| `enablePerformanceInsights` | boolean | Enable performance insights | `true`, `false` |
| `monitoringInterval` | number | Enhanced monitoring interval (seconds) | `0`, `15`, `30`, `60` |
| `backupRetentionDays` | number | Backup retention period (days) | `1-35` |
| `deleteProtection` | boolean | Enable deletion protection | `true`, `false` |
| `enableCloudWatchLogs` | boolean | Enable CloudWatch logs for database | `true`, `false` |

### **Redis Configuration**
| Parameter | Type | Description | Valid Values |
|-----------|------|-------------|-------------|
| `nodeType` | string | ElastiCache node type | `cache.t3.micro`, `cache.t3.small`, `cache.t3.medium` |
| `numCacheNodes` | number | Number of cache nodes | `1`, `2` |
| `enableTransit` | boolean | Enable encryption in transit | `true`, `false` |
| `enableAtRest` | boolean | Enable encryption at rest | `true`, `false` |

### **ECS Configuration**
| Parameter | Type | Description | Valid Values |
|-----------|------|-------------|-------------|
| `taskCpu` | number | CPU units for ECS tasks | `256`, `512`, `1024`, `2048`, `4096` |
| `taskMemory` | number | Memory (MB) for ECS tasks | `512`, `1024`, `2048`, `4096`, `8192` |
| `desiredCount` | number | Desired number of running tasks | `1-10` |
| `enableDetailedLogging` | boolean | Enable detailed application logging | `true`, `false` |
| `enableEcsExec` | boolean | Enable ECS exec for debugging | `true`, `false` |

## 📋 Deployment Examples

### Basic Deployments
```bash
# Development environment
npm run deploy:dev

# Production environment
npm run deploy:prod
```

### Advanced Deployments
```bash
# Production with custom domain
npm run deploy:prod -- --context r53ZoneName=company.com

# Development with production-like database
npm run deploy:dev -- \
  --context instanceClass=db.t4g.small \
  --context enablePerformanceInsights=true

# Custom environment for feature testing
npm run deploy:dev -- \
  --context stackName=FeatureX \
  --context r53ZoneName=feature.tak.nz

# High-performance development environment
npm run deploy:dev -- \
  --context taskCpu=1024 \
  --context taskMemory=2048 \
  --context desiredCount=2
```

### Environment-Specific Overrides
```bash
# Development with enhanced security
npm run deploy:dev -- \
  --context enableTransit=true \
  --context enableAtRest=true \
  --context deleteProtection=true

# Production with cost optimization
npm run deploy:prod -- \
  --context instanceCount=1 \
  --context numCacheNodes=1

# Custom admin configuration
npm run deploy:dev -- \
  --context adminUserEmail=admin@company.com \
  --context authentikHostname=sso
```

## Required Environment Variables

```bash
# Set AWS credentials and region
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_REGION=$(aws configure get region || echo "ap-southeast-2")

# Deploy with environment variables set
npm run deploy:prod
```

### Using AWS Profiles
```bash
# Set profile-specific environment variables
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text --profile your-profile)
export CDK_DEFAULT_REGION=$(aws configure get region --profile your-profile)

# Deploy using specific profile
AWS_PROFILE=your-profile npm run deploy:prod
```