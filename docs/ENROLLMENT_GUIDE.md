# Device Enrollment Guide

## Overview

The TAK Authentication Infrastructure includes a device enrollment service that provides a web-based interface for ATAK and iTAK mobile device onboarding. This service integrates with Authentik via OIDC authentication to provide secure, user-friendly device enrollment.

## What is Device Enrollment?

Device enrollment is the process of configuring ATAK (Android Team Awareness Kit) or iTAK (iPhone Team Awareness Kit) mobile applications to connect to your TAK server infrastructure. The enrollment service provides:

- **Web-based enrollment interface** accessible via browser
- **QR code generation** for easy mobile device configuration
- **Secure OIDC authentication** via Authentik
- **Direct app store links** for ATAK and iTAK downloads
- **Automated configuration** for TAK server connection

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Mobile User   │────│  Enrollment      │────│   Authentik     │
│   (Browser)     │    │  Web Interface   │    │   (OIDC Auth)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │  Configuration   │
                       │  Generation      │
                       │  (QR Codes)      │
                       └──────────────────┘
```

## Access and Authentication

### Service Endpoints

- **Development**: `https://enroll.dev.tak.nz`
- **Production**: `https://enroll.tak.nz`

### Authentication Flow

1. **User Access**: User navigates to enrollment URL
2. **OIDC Redirect**: ALB redirects to Authentik for authentication
3. **User Login**: User authenticates with Authentik credentials
4. **Token Exchange**: OIDC tokens exchanged securely
5. **Enrollment Access**: User gains access to enrollment interface

## Using the Enrollment Service

### Step 1: Access the Enrollment Interface

Navigate to your enrollment URL in a web browser:
```
https://enroll.{your-domain}
```

### Step 2: Authenticate

- You'll be redirected to Authentik for authentication
- Log in with your TAK user credentials
- After successful authentication, you'll be redirected back to the enrollment interface

### Step 3: Download Mobile App

The enrollment interface provides direct links to:
- **ATAK** (Android): Google Play Store link
- **iTAK** (iPhone): Apple App Store link

### Step 4: Configure Device

1. **QR Code Method** (Recommended):
   - Use your mobile device to scan the QR code displayed
   - The app will automatically configure server settings
   - **Security Note**: The QR code contains a temporary app password (token), not your actual user password

2. **Manual Configuration**:
   - Copy the server configuration details
   - Manually enter them in your ATAK/iTAK app

## Feature Flag Control

The enrollment feature can be enabled or disabled using the `enrollmentEnabled` configuration flag.

### Enable/Disable via CLI

```bash
# Disable enrollment feature
npm run deploy:dev -- --context enrollmentEnabled=false

# Enable enrollment feature
npm run deploy:prod -- --context enrollmentEnabled=true
```

### Configuration in cdk.json

```json
{
  "context": {
    "dev-test": {
      "enrollment": {
        "enrollmentEnabled": true,
        "enrollmentHostname": "enroll",
        "applicationName": "TAK Device Enrollment"
      }
    }
  }
}
```

## Security Considerations

### OIDC Authentication

- **Secure Token Exchange**: OAuth2/OpenID Connect standard protocols
- **Session Management**: Secure session handling via Authentik
- **Access Control**: Only authenticated users can access enrollment

### Network Security

- **HTTPS Only**: All enrollment traffic encrypted in transit
- **ALB Integration**: Application Load Balancer handles OIDC authentication
- **Private Lambda**: Enrollment Lambda runs in private subnets

### Data Protection

- **No Persistent Storage**: Enrollment service doesn't store user data
- **Temporary Sessions**: Configuration data generated on-demand
- **Secure Secrets**: All sensitive configuration stored in AWS Secrets Manager
- **App Password Security**: QR codes contain temporary app passwords (tokens) instead of actual user passwords, improving overall security by:
  - Limiting exposure of primary user credentials
  - Enabling token revocation without password changes
  - Providing device-specific authentication credentials

## Troubleshooting

### Common Issues

#### **Enrollment Service Not Accessible**
```
Error: This site can't be reached
```
**Possible Causes**:
- Enrollment feature disabled (`enrollmentEnabled: false`)
- DNS records not properly configured
- ALB listener rules not configured

**Solutions**:
```bash
# Check if enrollment is enabled
npm run synth:dev | grep -i enrollment

# Enable enrollment feature
npm run deploy:dev -- --context enrollmentEnabled=true
```

#### **Authentication Redirect Loop**
```
Error: Too many redirects
```
**Possible Causes**:
- OIDC configuration mismatch
- Authentik provider not properly configured
- Session cookie issues

**Solutions**:
- Clear browser cookies for the enrollment domain
- Check Authentik OIDC provider configuration
- Verify ALB OIDC authentication settings

#### **QR Code Not Working**
```
Error: Invalid configuration
```
**Possible Causes**:
- TAK server configuration incorrect
- Network connectivity issues
- Mobile app version compatibility

**Solutions**:
- Verify TAK server endpoints are accessible
- Check mobile device network connectivity
- Update ATAK/iTAK app to latest version

### Debug Commands

```bash
# Check enrollment infrastructure
aws cloudformation describe-stack-resources \
  --stack-name TAK-Dev-AuthInfra \
  --query 'StackResources[?contains(LogicalResourceId, `Enrollment`)]'

# View enrollment Lambda logs
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/TAK-Dev-EnrollmentLambda

# Check ALB listener rules
aws elbv2 describe-rules --listener-arn <listener-arn>
```

## Integration with TAK Server

The enrollment service generates configuration for connecting to your TAK server infrastructure. The configuration includes:

- **Server Endpoints**: TAK server connection details
- **Certificate Information**: SSL/TLS certificate configuration
- **Authentication Settings**: LDAP connection parameters
- **Protocol Configuration**: TAK protocol settings

## Cost Impact

The enrollment feature adds minimal cost to your infrastructure:

- **Lambda Function**: Pay-per-request pricing (~$0.01 per 1000 requests)
- **ALB Listener Rules**: No additional cost for OIDC authentication
- **Route53 Records**: Minimal DNS query costs

## Best Practices

### Security
- **Regular Updates**: Keep ATAK/iTAK apps updated
- **Strong Authentication**: Use strong passwords for Authentik accounts
- **Network Security**: Use secure networks for device enrollment

### User Experience
- **Clear Instructions**: Provide users with enrollment URL and instructions
- **Support Documentation**: Maintain user guides for device enrollment
- **Testing**: Regularly test enrollment process with different devices

### Operational
- **Monitoring**: Monitor enrollment Lambda function performance
- **Logging**: Enable detailed logging for troubleshooting
- **Backup**: Ensure Authentik configuration is backed up

## Related Documentation

- **[Main README](../README.md)** - Project overview and quick start
- **[Architecture Guide](ARCHITECTURE.md)** - Technical architecture details
- **[Configuration Guide](PARAMETERS.md)** - Complete configuration reference
- **[Deployment Guide](DEPLOYMENT_GUIDE.md)** - Deployment instructions