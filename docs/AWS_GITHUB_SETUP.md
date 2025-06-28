# AWS GitHub Actions Setup for AuthInfra

This guide covers setting up GitHub Actions for the AuthInfra repository, building on the base infrastructure already configured in BaseInfra.

## Prerequisites

**⚠️ Important:** Steps 1-2 from the [BaseInfra AWS GitHub Setup](https://github.com/TAK-NZ/base-infra/blob/main/docs/AWS_GITHUB_SETUP.md) must be completed first:
- Route 53 DNS setup
- GitHub OIDC Identity Provider and IAM roles

## 3. GitHub Environment Setup for AuthInfra

### 3.1 Create Environments

In your AuthInfra GitHub repository, go to **Settings → Environments** and create:

1. **`production`** environment
   - **Protection rules:**
     - Required reviewers: Add team leads
     - Wait timer: 5 minutes
     - Deployment branches and tags: Select "Selected branches and tags"
       - Add rule: "v*" (for version tags like v1.0.0)

2. **`demo`** environment
   - **Protection rules:**
     - Deployment branches and tags: Select "Selected branches and tags"
       - Add rule: "main"
   - **Environment variables:**
     - `DEMO_TEST_DURATION`: `300` (wait time in seconds, default 5 minutes)
     - `STACK_NAME`: `Demo`
     - `AUTHENTIK_ADMIN_EMAIL`: `admin@tak.nz`

### 3.2 Configure Environment Secrets

**For `production` environment:**
- `AWS_ACCOUNT_ID`: `111111111111`
- `AWS_ROLE_ARN`: `arn:aws:iam::111111111111:role/GitHubActions-TAK-Role`
- `AWS_REGION`: `ap-southeast-2`

**For `demo` environment:**
- `AWS_ACCOUNT_ID`: `222222222222`
- `AWS_ROLE_ARN`: `arn:aws:iam::222222222222:role/GitHubActions-TAK-Role`
- `AWS_REGION`: `ap-southeast-2`

## 4. Branch Protection Setup

**Configure branch protection for `main`** to ensure only tested code is deployed:

1. Go to **Settings → Branches → Add rule**
2. **Branch name pattern**: `main`
3. **Enable these protections:**
   - ☑️ Require a pull request before merging
   - ☑️ Require status checks to pass before merging
     - ☑️ Require branches to be up to date before merging
     - ☑️ Status checks: Select "Test CDK code" after first workflow run

## 5. Breaking Change Detection for AuthInfra

### 5.1 AuthInfra-Specific Breaking Changes

**Critical resources that trigger breaking change detection:**
- PostgreSQL database cluster replacements
- Redis cluster replacements
- EFS file system replacements
- Application Load Balancer replacements
- Secrets Manager secret deletions

### 5.2 Override Mechanism

To deploy breaking changes intentionally:

1. **Include `[force-deploy]` in commit message**:
```bash
git commit -m "feat: upgrade PostgreSQL engine version [force-deploy]"
```

2. **The workflows will detect the override and proceed with deployment**

## 6. GitHub Actions Workflows

### 6.1 Demo Testing Workflow

The `demo-deploy.yml` workflow:
- Runs on every push to `main` branch
- Tests both prod and dev-test profiles in demo environment
- Includes breaking change detection and changeset validation
- Automatically reverts to dev-test profile after testing

### 6.2 Production Deployment Workflow

The `production-deploy.yml` workflow:
- Triggered only by version tags (e.g., `v1.0.0`)
- Requires manual approval in production environment
- Includes comprehensive validation before deployment

### 6.3 Test Workflow

The `cdk-test.yml` workflow:
- Runs on all PRs and pushes
- Includes TypeScript compilation checks
- Performs breaking change detection
- Provides comprehensive test coverage

## 8. Verification

Test the AuthInfra setup:

1. **Demo Testing:** Push to `main` branch → Should deploy demo with prod profile → Wait → Run tests → Revert to dev-test profile
2. **Production:** Create and push version tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
   → Should require approval → Deploy after approval

### 8.1 Deployment Flow

**Main Branch Push:**
```
Push to main → Tests → Demo (prod profile) → Wait → Tests → Demo (dev-test profile)
```

**Version Tag Push:**
```
Tag v* → Tests → Production (prod profile) [requires approval]
```

## 9. Troubleshooting

**Common Issues:**

- **Breaking Change Detection:** If legitimate changes are blocked, use `[force-deploy]` in commit message
- **Environment Variables:** Ensure `STACK_NAME` and `AUTHENTIK_ADMIN_EMAIL` are set in demo environment
- **CDK Context:** AuthInfra uses `envType` parameter (not `env`) for consistency with BaseInfra
- **Dependencies:** Ensure BaseInfra is deployed first as AuthInfra depends on its resources

**Useful Commands:**

```bash
# Test breaking change detection locally
./scripts/github/check-breaking-changes.sh auth prod

# Validate changeset locally
./scripts/github/validate-changeset.sh TAK-Demo-AuthInfra

# Deploy with specific context
npm run cdk deploy -- --context envType=prod --context stackName=Demo --context adminUserEmail=admin@tak.nz
```

**Dependencies on BaseInfra:**
- VPC and networking resources
- ECS cluster
- KMS keys
- Route 53 hosted zones
- S3 buckets for CDK assets

Ensure BaseInfra is deployed and stable before deploying AuthInfra changes.