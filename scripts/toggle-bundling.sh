#!/bin/bash

# Script to toggle between development and test modes for Lambda bundling

MODE=$1

if [ "$MODE" == "dev" ]; then
  echo "Switching to development mode with bundling enabled..."
  
  # Update enroll-oidc-setup.ts
  sed -i 's/code: lambda.Code.fromAsset(path.join(__dirname, '\''..\/..\/src\/enroll-oidc-setup'\''), {\n        exclude: ['\''\.env'\'', '\''\.env\.example'\'']\n      }),/code: lambda.Code.fromAsset(path.join(__dirname, '\''..\/..\/src\/enroll-oidc-setup'\''), {\n        exclude: ['\''\.env'\'', '\''\.env\.example'\''],\n        bundling: {\n          image: lambda.Runtime.NODEJS_22_X.bundlingImage,\n          command: [\n            '\''bash'\'', '\''-c'\'', [\n              '\''cp -r \/asset-input\/* \/asset-output\/'\'',\n              '\''cd \/asset-output'\'',\n              '\''npm ci --production'\'',\n              '\''rm -rf package-lock.json'\''\n            ].join('\'' \&\& '\'')\n          ]\n        }\n      }),/' lib/constructs/enroll-oidc-setup.ts
  
  # Update enrollment-lambda.ts
  sed -i 's/code: lambda.Code.fromAsset(path.join(__dirname, '\''..\/..\/src\/enrollment-lambda'\''), {\n        exclude: ['\''\.env'\'', '\''\.env\.example'\'', '\''*\.md'\'']\n      }),/code: lambda.Code.fromAsset(path.join(__dirname, '\''..\/..\/src\/enrollment-lambda'\''), {\n        exclude: ['\''\.env'\'', '\''\.env\.example'\'', '\''*\.md'\''],\n        bundling: {\n          image: lambda.Runtime.NODEJS_22_X.bundlingImage,\n          command: [\n            '\''bash'\'', '\''-c'\'', [\n              '\''cp -r \/asset-input\/* \/asset-output\/'\'',\n              '\''cd \/asset-output'\'',\n              '\''npm ci --production'\'',\n              '\''rm -rf package-lock.json'\''\n            ].join('\'' \&\& '\'')\n          ]\n        }\n      }),/' lib/constructs/enrollment-lambda.ts
  
  # Update enroll-alb-oidc-auth.ts
  sed -i 's/code: lambda.Code.fromAsset(path.join(__dirname, '\''..\/..\/src\/enroll-alb-oidc-auth'\'')),/code: lambda.Code.fromAsset(path.join(__dirname, '\''..\/..\/src\/enroll-alb-oidc-auth'\''), {\n        bundling: {\n          image: lambda.Runtime.NODEJS_22_X.bundlingImage,\n          command: [\n            '\''bash'\'', '\''-c'\'', [\n              '\''cp -r \/asset-input\/* \/asset-output\/'\'',\n              '\''cd \/asset-output'\'',\n              '\''npm ci --production'\''\n            ].join('\'' \&\& '\'')\n          ],\n        },\n      }),/' lib/constructs/enroll-alb-oidc-auth.ts
  
  echo "Development mode enabled."
  
elif [ "$MODE" == "test" ]; then
  echo "Switching to test mode with bundling disabled..."
  
  # Update enroll-oidc-setup.ts
  sed -i 's/code: lambda.Code.fromAsset(path.join(__dirname, '\''..\/..\/src\/enroll-oidc-setup'\''), {.*bundling:.*}),/code: lambda.Code.fromAsset(path.join(__dirname, '\''..\/..\/src\/enroll-oidc-setup'\''), {\n        exclude: ['\''\.env'\'', '\''\.env\.example'\'']\n      }),/' lib/constructs/enroll-oidc-setup.ts
  
  # Update enrollment-lambda.ts
  sed -i 's/code: lambda.Code.fromAsset(path.join(__dirname, '\''..\/..\/src\/enrollment-lambda'\''), {.*bundling:.*}),/code: lambda.Code.fromAsset(path.join(__dirname, '\''..\/..\/src\/enrollment-lambda'\''), {\n        exclude: ['\''\.env'\'', '\''\.env\.example'\'', '\''*\.md'\'']\n      }),/' lib/constructs/enrollment-lambda.ts
  
  # Update enroll-alb-oidc-auth.ts
  sed -i 's/code: lambda.Code.fromAsset(path.join(__dirname, '\''..\/..\/src\/enroll-alb-oidc-auth'\''), {.*bundling:.*}),/code: lambda.Code.fromAsset(path.join(__dirname, '\''..\/..\/src\/enroll-alb-oidc-auth'\'')),/' lib/constructs/enroll-alb-oidc-auth.ts
  
  echo "Test mode enabled."
  
else
  echo "Usage: $0 [dev|test]"
  echo "  dev  - Enable bundling for development/deployment"
  echo "  test - Disable bundling for tests"
  exit 1
fi