# Docker Image Strategy

This document explains the hybrid Docker image strategy implemented in the AuthInfra stack, which supports both pre-built images and local Docker building.

## Overview

The stack uses a **fallback strategy** that:
1. **First tries to use pre-built images** from ECR (fast deployments)
2. **Falls back to building Docker images locally** if pre-built images aren't available

This provides the best of both worlds:
- **Fast CI/CD deployments** using pre-built images
- **Flexible local development** with on-demand building

## Configuration

### Context Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `usePreBuiltImages` | Enable/disable pre-built image usage | `true` or `false` |
| `authentikImageTag` | Tag for Authentik server/worker image | `authentik:abc123` |
| `ldapImageTag` | Tag for LDAP outpost image | `ldap:abc123` |

### Default Behavior

- **CI/CD environments**: Uses pre-built images when available
- **Local development**: Builds images on-demand (default)
- **Manual override**: Can force either mode via context parameters

## Usage Examples

### GitHub Actions (Pre-built Images)
```bash
npm run cdk deploy -- \
  --context usePreBuiltImages=true \
  --context authentikImageTag=authentik:${GITHUB_SHA} \
  --context ldapImageTag=ldap:${GITHUB_SHA}
```

### Local Development (Build on Demand)
```bash
# Use NPM scripts for convenience
npm run deploy:local:dev    # Dev environment, build locally
npm run deploy:local:prod   # Prod environment, build locally

# Or use CDK directly
npm run cdk deploy -- \
  --context envType=dev-test \
  --context usePreBuiltImages=false
```

### Manual with Pre-built Images
```bash
npm run cdk deploy -- \
  --context envType=prod \
  --context usePreBuiltImages=true \
  --context authentikImageTag=authentik:latest \
  --context ldapImageTag=ldap:latest
```

## Image Repositories

The stack expects images to be available in ECR repositories:

- **Authentik**: `${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com/authentik:${TAG}`
- **LDAP**: `${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com/ldap:${TAG}`

## Implementation Details

### Stack Logic
```typescript
// Determine image strategy
const usePreBuiltImages = app.node.tryGetContext('usePreBuiltImages') ?? false;
const authentikImageTag = app.node.tryGetContext('authentikImageTag');

if (usePreBuiltImages && authentikImageTag) {
  // Use pre-built image from ECR
  const imageUri = `${account}.dkr.ecr.${region}.amazonaws.com/${authentikImageTag}`;
  containerImage = ecs.ContainerImage.fromRegistry(imageUri);
} else {
  // Fall back to building Docker image asset
  const dockerImageAsset = new ecrAssets.DockerImageAsset(/* ... */);
  containerImage = ecs.ContainerImage.fromDockerImageAsset(dockerImageAsset);
}
```

### Construct Updates
All container constructs (`AuthentikServer`, `AuthentikWorker`, `Ldap`) now support:
- `containerImageUri?: string` - Optional pre-built image URI
- Automatic fallback to `DockerImageAsset` when URI not provided

## Benefits

### Performance
- **Deployment time**: ~15 minutes → ~5 minutes (no Docker builds)
- **CI/CD efficiency**: Only builds when Docker files change
- **Local flexibility**: Build on-demand for development

### Reliability
- **Separate concerns**: Image building vs infrastructure deployment
- **Retry capability**: Can retry deployments without rebuilding images
- **Error isolation**: Docker build failures don't affect infrastructure

### Flexibility
- **Environment-specific images**: Different image versions per environment
- **Easy rollbacks**: Change image tags without code changes
- **Independent lifecycle**: Manage images separately from infrastructure

## Migration Path

The implementation is **backward compatible**:

1. **Existing deployments** continue to work (build locally by default)
2. **Gradual adoption** of pre-built images as needed
3. **No breaking changes** to existing workflows

## Troubleshooting

### Common Issues

**Image not found in ECR:**
```
Error: Repository does not exist or no permission to access
```
- Ensure ECR repositories exist
- Verify image tags are correct
- Check AWS permissions

**Build failures in local mode:**
```
Error: Docker build failed
```
- Ensure Docker is running locally
- Check Dockerfile syntax
- Verify build context and dependencies

**Context parameter issues:**
```
Error: authentikImageTag context required
```
- Provide required image tags when using pre-built images
- Or set `usePreBuiltImages=false` to build locally

### Debug Commands

```bash
# Test synthesis with pre-built images
npm run cdk synth -- \
  --context usePreBuiltImages=true \
  --context authentikImageTag=authentik:test

# Test synthesis with local building
npm run cdk synth -- \
  --context usePreBuiltImages=false

# Check available context
npm run cdk context
```

## Future Enhancements

Potential improvements:
- **Automatic image discovery** from ECR latest tags
- **Image vulnerability scanning** integration
- **Multi-architecture support** (ARM64/AMD64)
- **Image caching strategies** for faster local builds