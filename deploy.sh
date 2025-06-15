#!/bin/bash

# TAK Auth Infrastructure CDK Deployment Script
# This script helps deploy the CDK sta        -i|--ip-type)
            IP_ADDRESS_TYPE="$2"
            shift 2
            ;;
        -g|--git-sha)
            GIT_SHA="$2"
            shift 2
            ;;
        -s|--synth-only)
            SYNTH_ONLY="true"
            shift
            ;;
        --help)rameter validation

set -e

# Default values
STACK_NAME=""
ENV_TYPE=""
ADMIN_EMAIL=""
LDAP_BASE_DN="DC=example,DC=com"
ENABLE_EXECUTE="false"
IP_ADDRESS_TYPE="dualstack"
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "latest")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}[DEPLOY]${NC} $1"
}

# Function to show usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Deploy TAK Auth Infrastructure using AWS CDK

OPTIONS:
    -s, --stack-name STACK_NAME      Stack name (required: dev, prod)
    -t, --env-type ENV_TYPE         Environment type (dev-test, prod)
    -m, --admin-email EMAIL         Admin user email (required)
    -b, --base-dn BASE_DN           LDAP Base DN (default: DC=example,DC=com)
    -x, --enable-execute            Enable ECS Exec for debugging
    -i, --ip-type TYPE              IP address type (ipv4, dualstack)
    -g, --git-sha SHA               Git SHA for image tagging
    -s, --synth-only                Only synthesize, don't deploy
    -h, --help                      Show this help message

EXAMPLES:
    # Deploy to development
    $0 -s dev -t dev-test -m admin@example.com

    # Deploy to production with custom settings
    $0 -s prod -t prod -m admin@example.com -b "DC=company,DC=com" -i ipv4

    # Just synthesize the template
    $0 -s dev -t dev-test -m admin@example.com --synth-only

NOTE:
    SSL Certificate ARN is automatically retrieved from the BaseInfra stack export.
    Ensure your BaseInfra stack is deployed first with the certificate configured.

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -s|--stack-name)
            STACK_NAME="$2"
            shift 2
            ;;
        -t|--env-type)
            ENV_TYPE="$2"
            shift 2
            ;;
        -m|--admin-email)
            ADMIN_EMAIL="$2"
            shift 2
            ;;
        -b|--base-dn)
            LDAP_BASE_DN="$2"
            shift 2
            ;;
        -x|--enable-execute)
            ENABLE_EXECUTE="true"
            shift
            ;;
        -i|--ip-type)
            IP_ADDRESS_TYPE="$2"
            shift 2
            ;;
        -g|--git-sha)
            GIT_SHA="$2"
            shift 2
            ;;
        -s|--synth-only)
            SYNTH_ONLY="true"
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Validation
if [[ -z "$STACK_NAME" ]]; then
    print_error "Stack name is required (-s/--stack-name)"
    exit 1
fi

if [[ ! "$STACK_NAME" =~ ^(dev|prod)$ ]]; then
    print_error "Stack name must be 'dev' or 'prod'"
    exit 1
fi

if [[ -z "$ENV_TYPE" ]]; then
    # Auto-determine env type based on stack name
    if [[ "$STACK_NAME" == "prod" ]]; then
        ENV_TYPE="prod"
    else
        ENV_TYPE="dev-test"
    fi
    print_warning "Env type not specified, using: $ENV_TYPE"
fi

if [[ -z "$ADMIN_EMAIL" ]]; then
    print_error "Admin email is required (-m/--admin-email)"
    exit 1
fi

# Validate email format
if [[ ! "$ADMIN_EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
    print_error "Invalid email format: $ADMIN_EMAIL"
    exit 1
fi

# Validate IP address type
if [[ ! "$IP_ADDRESS_TYPE" =~ ^(ipv4|dualstack)$ ]]; then
    print_error "IP address type must be 'ipv4' or 'dualstack'"
    exit 1
fi

# Check prerequisites
print_header "Checking prerequisites..."

# Check if CDK is installed
if ! command -v cdk &> /dev/null; then
    print_error "CDK CLI is not installed. Run: npm install -g aws-cdk"
    exit 1
fi

# Check if AWS CLI is configured
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS CLI is not configured or no valid credentials"
    exit 1
fi

# Check if dependencies are installed
if [[ ! -d "node_modules" ]]; then
    print_warning "Dependencies not installed. Running npm install..."
    npm install
fi

# Build the project
print_header "Building TypeScript code..."
npm run build

# Show configuration
print_header "Deployment Configuration"
echo "Stack Name: $STACK_NAME"
echo "Environment Type: $ENV_TYPE"
echo "Admin Email: $ADMIN_EMAIL"
echo "LDAP Base DN: $LDAP_BASE_DN"
echo "Enable Execute: $ENABLE_EXECUTE"
echo "IP Address Type: $IP_ADDRESS_TYPE"
echo "Git SHA: $GIT_SHA"
echo "SSL Certificate: Auto-retrieved from BaseInfra stack"
echo "Docker Images: Auto-retrieved from ECR"

# Check base infrastructure dependencies
print_header "Checking base infrastructure..."
REQUIRED_EXPORTS=(
    "TAK-$STACK_NAME-BaseInfra-vpc-id"
    "TAK-$STACK_NAME-BaseInfra-kms"
    "TAK-$STACK_NAME-BaseInfra-CERTIFICATE-ARN"
)

for export_name in "${REQUIRED_EXPORTS[@]}"; do
    if ! aws cloudformation list-exports --query "Exports[?Name=='$export_name'].Value" --output text 2>/dev/null | grep -q .; then
        print_error "Required export not found: $export_name"
        print_error "Ensure the base infrastructure stack is deployed first"
        exit 1
    else
        print_status "Found required export: $export_name"
    fi
done

# CDK parameters
CDK_PARAMS=(
    "--context" "environment=$STACK_NAME"
    "--context" "envType=$ENV_TYPE"
    "--parameters" "GitSha=$GIT_SHA"
    "--parameters" "EnableExecute=$ENABLE_EXECUTE"
    "--parameters" "AuthentikAdminUserEmail=$ADMIN_EMAIL"
    "--parameters" "AuthentikLDAPBaseDN=$LDAP_BASE_DN"
)

# Synthesize template
print_header "Synthesizing CloudFormation template..."
cdk synth "${CDK_PARAMS[@]}"

if [[ "$SYNTH_ONLY" == "true" ]]; then
    print_status "Synthesis complete. Template available in cdk.out/"
    exit 0
fi

# Show diff if stack exists
print_header "Checking for changes..."
if cdk diff "${CDK_PARAMS[@]}" --fail; then
    print_status "No changes detected"
else
    print_warning "Changes detected (see above)"
fi

# Confirm deployment
echo ""
read -p "Do you want to proceed with deployment? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_status "Deployment cancelled"
    exit 0
fi

# Deploy
print_header "Deploying stack..."
cdk deploy "${CDK_PARAMS[@]}" --require-approval never

print_status "Deployment complete!"
print_status "Check the AWS Console for stack outputs and resource details."
