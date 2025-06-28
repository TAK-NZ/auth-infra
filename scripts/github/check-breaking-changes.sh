#!/bin/bash
# Breaking change detection for infrastructure deployments

STACK_TYPE=${1:-"auth"}
CONTEXT_ENV=${2:-"prod"}
OVERRIDE_CHECK=${3:-"false"}

# Stack-specific breaking change patterns
case $STACK_TYPE in
  "base")
    PATTERNS=(
      "VPC.*will be destroyed"
      "Subnet.*will be destroyed"
      "KMSKey.*will be destroyed"
      "HostedZone.*will be destroyed"
      "ECSCluster.*will be destroyed"
      "S3.*Bucket.*will be destroyed"
    )
    ;;
  "auth")
    PATTERNS=(
      "DatabaseCluster.*will be destroyed"
      "ReplicationGroup.*will be destroyed"
      "FileSystem.*will be destroyed"
      "ApplicationLoadBalancer.*will be destroyed"
      "Secret.*will be destroyed"
    )
    ;;
  "tak")
    PATTERNS=(
      "DatabaseCluster.*will be destroyed"
      "FileSystem.*will be destroyed"
      "NetworkLoadBalancer.*will be destroyed"
      "Secret.*will be destroyed"
    )
    ;;
esac

echo "🔍 Checking for breaking changes in $STACK_TYPE stack..."

# Generate CDK diff
npm run cdk diff --context envType=$CONTEXT_ENV > stack-diff.txt 2>&1

# Check for breaking patterns
BREAKING_FOUND=false
for pattern in "${PATTERNS[@]}"; do
  if grep -q "$pattern" stack-diff.txt; then
    echo "❌ Breaking change detected: $pattern"
    BREAKING_FOUND=true
  fi
done

if [ "$BREAKING_FOUND" = true ]; then
  if [ "$OVERRIDE_CHECK" = "true" ]; then
    echo "🚨 Breaking changes detected but override enabled - proceeding"
    exit 0
  else
    echo ""
    echo "💡 To override this check, use commit message containing '[force-deploy]'"
    echo "📋 Review the full diff above to understand the impact"
    exit 1
  fi
else
  echo "✅ No breaking changes detected"
fi