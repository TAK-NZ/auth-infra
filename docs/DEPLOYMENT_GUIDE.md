# 🚀 TAK Authentication Infrastructure - Deployment Guide

## **Quick Start (Recommended)**

### **Prerequisites**
- AWS Account with configured credentials
- Base infrastructure stack (`TAK-<n>-BaseInfra`) deployed
- Public Route 53 hosted zone for your domain
- Node.js 18+ and npm installed

### **One-Command Deployment**
```bash
# Install dependencies
npm install

# Deploy development environment
npm run deploy:dev

# Deploy production environment  
npm run deploy:prod
```

**That's it!** 🎉 The enhanced npm scripts handle building, context configuration, and deployment.

---

## **📋 Environment Configurations**

| Environment | Stack Name | Domain | Enrollment | Cost/Month* | Features |
|-------------|------------|--------|------------|-------------|----------|
| **dev-test** | `TAK-Dev-AuthInfra` | `account.dev.tak.nz` | `enroll.dev.tak.nz` | ~$106 USD | Cost-optimized, Aurora Serverless v2 |
| **prod** | `TAK-Prod-AuthInfra` | `account.tak.nz` | `enroll.tak.nz` | ~$367 USD | High availability, multi-AZ deployment |

*Estimated AWS costs in USD for ap-southeast-2 region, excluding data transfer and storage usage

---

## **🔧 Advanced Configuration**

### **Custom Stack Deployment**
```bash
# Deploy with custom stack name
npm run deploy:dev -- --context stackName=Demo
npm run deploy:prod -- --context stackName=Enterprise
```

### **Database Configuration Overrides**
```bash
# Custom database settings
npm run deploy:dev -- --context instanceClass=db.t4g.small
npm run deploy:prod -- --context instanceCount=1

# Redis configuration
npm run deploy:dev -- --context nodeType=cache.t3.small
```

### **Infrastructure Preview**
```bash
# Preview changes before deployment
npm run synth:dev     # Development environment
npm run synth:prod    # Production environment

# Show what would change
npm run cdk:diff:dev  # Development diff
npm run cdk:diff:prod # Production diff
```

---

## **⚙️ Configuration System Deep Dive**

### **Environment Configuration Structure**
All settings are stored in [`cdk.json`](../cdk.json) under the `context` section:

```json
{
  "context": {
    "dev-test": {
      "stackName": "Dev",
      "database": {
        "instanceClass": "db.serverless",
        "instanceCount": 1
      },
      "authentik": {
        "hostname": "account",
        "adminUserEmail": "admin@tak.nz"
      }
    }
  }
}
```

### **Runtime Configuration Overrides**
Override any configuration value using CDK's built-in `--context` flag:

```bash
# Custom admin email
npm run deploy:dev -- --context adminUserEmail=admin@company.com

# Database scaling
npm run deploy:dev -- --context instanceClass=db.t3.small

# Enable detailed logging
npm run deploy:dev -- --context enableDetailedLogging=true
```

---

## **🚀 First-Time Setup**

### **Prerequisites**
1. **AWS Account** with appropriate permissions
2. **Base Infrastructure** deployed (`TAK-<n>-BaseInfra`)
3. **Node.js 18+** and npm installed  
4. **AWS CLI** configured with credentials

### **Initial Setup Steps**
```bash
# 1. Clone and install
git clone <repository-url>
cd auth-infra
npm install

# 2. Set environment variables (if using AWS profiles)
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text --profile your-profile)
export CDK_DEFAULT_REGION=$(aws configure get region --profile your-profile)

# 3. Deploy authentication infrastructure
npm run deploy:dev -- --context stackName=YourStackName
```

---

## **🔄 Environment Transformation**

### **Switching Between Environment Types**

One of the powerful features of this CDK stack is the ability to transform deployed environments between different configuration profiles (dev-test ↔ prod) without recreating resources from scratch.

### **Initial Deployment with Custom Configuration**
You can deploy a stack with custom naming and domain configuration that doesn't follow the standard dev-test or prod patterns:

```bash
# Deploy a demo environment with dev-test configuration
npm run deploy:dev -- --context stackName=Demo --context r53ZoneName=demo.tak.nz
```

This creates a stack named `TAK-Demo-AuthInfra` with:
- **Aurora Serverless v2** (cost-optimized)
- **Single AZ deployment** (basic availability)
- **Development-grade settings** for logging and monitoring
- **Minimal Redis configuration**

### **Environment Upgrade (dev-test → prod)**
Later, you can upgrade the same stack to production-grade configuration:

```bash
# Transform to production configuration
npm run deploy:prod -- --context stackName=Demo --context r53ZoneName=demo.tak.nz
```

This **upgrades the existing** `TAK-Demo-AuthInfra` stack to:
- **Aurora with dedicated instances** (high performance)
- **Multi-AZ deployment** (high availability)
- **Production-grade monitoring** and logging
- **Enhanced Redis configuration** with clustering
- **Resource retention policies** (data protection)

### **Environment Downgrade (prod → dev-test)**
You can also downgrade for cost optimization during development phases:

```bash
# Scale back to development configuration
npm run deploy:dev -- --context stackName=Demo --context r53ZoneName=demo.tak.nz
```

### **⚠️ Important Considerations**

1. **Database Changes**: When switching between Aurora Serverless v2 and dedicated instances, there may be brief connection interruptions during the transition.

2. **Removal Policies**: When downgrading from prod to dev-test, resources with `RETAIN` policies will switch to `DESTROY` policies, but existing resources retain their original policy until replaced.

3. **Cost Impact**: Upgrading to prod configuration will significantly increase costs due to dedicated database instances, multi-AZ deployment, and enhanced monitoring.

4. **Incremental Updates**: CDK intelligently updates only the resources that need to change, minimizing disruption to running applications.

### **Best Practices**
- **Test transformations** in a non-critical environment first
- **Plan for brief downtime** during database configuration changes
- **Monitor costs** when upgrading to production configurations
- **Use consistent domain names** across transformations to avoid certificate recreation
- **Backup data** before major configuration changes

---

## **🛠️ Troubleshooting**

### **Common Issues**

#### **Missing Base Infrastructure**
```
Error: Cannot import value TAK-Demo-BaseInfra-VPC-ID
```
**Solution:** Ensure base infrastructure stack is deployed first.

#### **Missing Admin Email**
```
Error: adminUserEmail is required
```
**Solution:** Set admin email in context or via override:
```bash
npm run deploy:dev -- --context adminUserEmail=admin@company.com
```

#### **Docker Build Issues**
```
Error: Docker build failed
```
**Solution:** Ensure Docker is running and Dockerfiles exist in docker/ directory.

### **Debug Commands**
```bash
# Check what would be deployed
npm run synth:dev
npm run synth:prod

# See differences from current state
npm run cdk:diff:dev
npm run cdk:diff:prod

# View CloudFormation events
aws cloudformation describe-stack-events --stack-name TAK-Dev-AuthInfra
```

---

## **📊 Post-Deployment**

### **Verify Deployment**
```bash
# Check stack status
aws cloudformation describe-stacks --stack-name TAK-Dev-AuthInfra

# View outputs
aws cloudformation describe-stacks --stack-name TAK-Dev-AuthInfra \
  --query 'Stacks[0].Outputs'
```

### **Access Services**
- **Authentik Web Interface**: `https://account.{domain}`
- **Device Enrollment**: `https://enroll.{domain}` - ATAK/iTAK device enrollment
- **LDAP Endpoint**: `ldap.{domain}:389` (LDAP) / `ldap.{domain}:636` (LDAPS)

### **Cleanup**
```bash
# Destroy development environment
npm run cdk:destroy -- --context env=dev-test

# Destroy production environment (use with caution!)
npm run cdk:destroy -- --context env=prod
```

---

---

## **🔗 Related Documentation**

- **[Main README](../README.md)** - Project overview and quick start
- **[Architecture Guide](ARCHITECTURE.md)** - Technical architecture details
- **[Configuration Guide](PARAMETERS.md)** - Complete configuration reference
- **[Device Enrollment Guide](ENROLLMENT_GUIDE.md)** - ATAK/iTAK device enrollment
- **[Quick Reference](QUICK_REFERENCE.md)** - Fast deployment commands
