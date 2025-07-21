#!/bin/bash

# Quick script to update the enrollment Lambda function for testing
# Usage: ./scripts/update-lambda.sh <stack-name>

# Check for required dependencies
if ! command -v jq &> /dev/null; then
  echo "Error: jq is required but not installed. Please install jq first."
  echo "Ubuntu/Debian: sudo apt-get install jq"
  echo "macOS: brew install jq"
  echo "Amazon Linux: sudo yum install jq"
  exit 1
fi

if [ -z "$1" ]; then
  echo "Usage: $0 <stack-name> [env-var-file]"
  echo "Example: $0 Demo"
  echo "Example with env vars: $0 Demo env-vars.json"
  exit 1
fi

STACK_NAME="$1"
ENV_VAR_FILE="$2"

# If no env var file is specified, use the sample file if it exists
if [ -z "$ENV_VAR_FILE" ] && [ -f "scripts/sample-env-vars.json" ]; then
  ENV_VAR_FILE="scripts/sample-env-vars.json"
  echo "No environment variable file specified, using scripts/sample-env-vars.json"
  
  # Check if the sample file has been properly configured
  SAMPLE_ARN=$(cat "$ENV_VAR_FILE" | jq -r '.AUTHENTIK_API_TOKEN_SECRET_ARN')
  if [[ "$SAMPLE_ARN" == *":secret:"* ]]; then
    echo "Using ARN: $SAMPLE_ARN"
  else
    echo "WARNING: The sample environment variables file may not be properly configured."
    echo "Please check that AUTHENTIK_API_TOKEN_SECRET_ARN is set to a valid ARN."
  fi
fi

LAMBDA_NAME="TAK-${STACK_NAME}-AuthInfra-enrollment"
TEMP_DIR="/tmp/lambda-package"
ZIP_FILE="/tmp/lambda-package.zip"

echo "Packaging Lambda function for stack: $STACK_NAME"

# Create temp directory
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

# Copy Lambda files - main JS file
if [ -f "src/enrollment-lambda/index-simple.js" ]; then
  cp src/enrollment-lambda/index-simple.js "$TEMP_DIR/index.js"
else
  cp src/enrollment-lambda/index.js "$TEMP_DIR/index.js"
fi

# Copy all HTML and EJS files, preserving directory structure
find src/enrollment-lambda -type f \( -name "*.html" -o -name "*.ejs" -o -name "*.js" \) -not -path "*/node_modules/*" -not -name "index*.js" | while read file; do
  # Get the relative path from src/enrollment-lambda
  rel_path=${file#src/enrollment-lambda/}
  # Create the directory structure if it doesn't exist
  mkdir -p "$TEMP_DIR/$(dirname "$rel_path")"
  # Copy the file
  cp "$file" "$TEMP_DIR/$rel_path"
done

# Install dependencies
cd "$TEMP_DIR"
npm init -y > /dev/null
npm install --production ejs qrcode > /dev/null
cd - > /dev/null

# Create zip file
cd "$TEMP_DIR"
zip -r "$ZIP_FILE" * > /dev/null
cd - > /dev/null

# Update Lambda function
echo "Updating Lambda function: $LAMBDA_NAME"
aws lambda update-function-code \
  --function-name "$LAMBDA_NAME" \
  --zip-file "fileb://$ZIP_FILE"

# Force a new deployment by updating the function configuration
echo "Forcing new deployment..."
TIMESTAMP=$(date +"%Y%m%d%H%M%S")

# Check if an environment variable file was provided
if [ ! -z "$ENV_VAR_FILE" ] && [ -f "$ENV_VAR_FILE" ]; then
  echo "Using environment variables from file: $ENV_VAR_FILE"
  
  # Create environment variables string
  AUTHENTIK_API_TOKEN_SECRET_ARN=$(jq -r '.AUTHENTIK_API_TOKEN_SECRET_ARN' "$ENV_VAR_FILE")
  AUTHENTIK_API_ENDPOINT=$(jq -r '.AUTHENTIK_API_ENDPOINT' "$ENV_VAR_FILE")
  TAK_SERVER_DOMAIN=$(jq -r '.TAK_SERVER_DOMAIN' "$ENV_VAR_FILE")
  BRANDING=$(jq -r '.BRANDING' "$ENV_VAR_FILE")
  
  # Update the function with the environment variables
  echo "Setting environment variables..."
  aws lambda update-function-configuration \
    --function-name "$LAMBDA_NAME" \
    --environment "Variables={AUTHENTIK_API_TOKEN_SECRET_ARN=\"$AUTHENTIK_API_TOKEN_SECRET_ARN\",AUTHENTIK_API_ENDPOINT=\"$AUTHENTIK_API_ENDPOINT\",TAK_SERVER_DOMAIN=\"$TAK_SERVER_DOMAIN\",BRANDING=\"$BRANDING\",DEPLOYMENT_TIMESTAMP=\"$TIMESTAMP\"}"
else
  echo "No environment variable file provided, using default values"
  aws lambda update-function-configuration \
    --function-name "$LAMBDA_NAME" \
    --environment "Variables={DEPLOYMENT_TIMESTAMP=\"$TIMESTAMP\"}"
fi

# Wait for the update to complete
echo "Waiting for deployment to complete..."
aws lambda wait function-updated \
  --function-name "$LAMBDA_NAME"

# Verify the environment variables
echo "Verifying environment variables..."
aws lambda get-function-configuration \
  --function-name "$LAMBDA_NAME" \
  --query "Environment.Variables" \
  --output table

echo "Lambda update and deployment complete!"

# Show helpful information if no env var file was provided
if [ -z "$ENV_VAR_FILE" ]; then
  echo ""
  echo "NOTE: If you're seeing 'AUTHENTIK_API_TOKEN_SECRET_ARN environment variable is not set' error,"
  echo "you need to provide the required environment variables. You can:"
  echo ""
  echo "1. Copy and modify the sample environment variables file:"
  echo "   cp scripts/sample-env-vars.json my-env-vars.json"
  echo "   # Edit my-env-vars.json with your values"
  echo "   $0 $STACK_NAME my-env-vars.json"
  echo ""
  echo "2. Or set the environment variables in the AWS Console:"
  echo "   - Go to AWS Lambda Console"
  echo "   - Find the function: $LAMBDA_NAME"
  echo "   - Go to Configuration > Environment variables"
  echo "   - Add the required variables (see sample-env-vars.json for reference)"
  echo ""
fi