# OIDC ALB Integration Guide

This guide explains how to integrate the Authentik OIDC provider with an AWS Application Load Balancer (ALB) for authentication.

## Overview

The auth-infra stack creates an OIDC provider in Authentik that can be used to authenticate users accessing applications behind an ALB. The OIDC provider is created using a Lambda function that runs during stack deployment and outputs the client ID and secret needed for ALB configuration.

## How It Works

1. The `AuthentikOidcSetup` construct creates a Lambda function that configures an OIDC provider in Authentik
2. The Lambda function is invoked during stack deployment via a CloudFormation custom resource
3. The Lambda creates/updates the OIDC provider and application in Authentik
4. The client ID, client secret, and provider name are exported as stack outputs
5. These outputs can be imported by other stacks to configure ALB authentication

## Configuration

The OIDC provider is configured in `cdk.json` under the `authentik.enrollment` section:

```json
"authentik": {
  "enrollment": {
    "providerName": "tak-enrollment",
    "applicationName": "TAK Device Enrollment",
    "enrollmentHostname": "enroll",
    "enrollmentIcon": "https://github.com/TAK-NZ/auth-infra/blob/main/authentik/branding/icons/tak-nz-logo.png?raw=true"
  }
}
```

The redirect URI and launch URL are automatically derived from the `enrollmentHostname` and domain:
- Redirect URI: `https://{enrollmentHostname}.{domain}/oauth2/idpresponse`
- Launch URL: `https://{enrollmentHostname}.{domain}/`

The application icon is set using the `enrollmentIcon` URL. If not provided, no icon will be set.

## Using the OIDC Provider with ALB

To use the OIDC provider with an ALB in another stack:

1. Import the OIDC client ID, client secret, and provider name from the auth-infra stack:

```typescript
const oidcClientId = Fn.importValue(`${stackNameComponent}-OidcClientId`);
const oidcClientSecret = Fn.importValue(`${stackNameComponent}-OidcClientSecret`);
const oidcProviderName = Fn.importValue(`${stackNameComponent}-OidcProviderName`);
```

2. Configure the ALB listener with OIDC authentication:

```typescript
const listener = alb.addListener('HttpsListener', {
  port: 443,
  protocol: elbv2.ApplicationProtocol.HTTPS,
  certificates: [certificate],
  defaultAction: new elbv2.AuthenticateOidcAction({
    authenticationRequestExtraParams: {
      // Optional extra parameters
    },
    clientId: oidcClientId,
    clientSecret: oidcClientSecret,
    issuer: `https://account.${hostedZoneName}/application/o/${oidcProviderName}/`,
    next: elbv2.ListenerAction.forward([targetGroup]),
    onUnauthenticatedRequest: elbv2.UnauthenticatedAction.AUTHENTICATE,
    scope: 'openid email profile',
    sessionCookieName: 'AWSELBAuthSessionCookie',
    sessionTimeout: cdk.Duration.days(1),
  }),
});
```

## Testing the OIDC Provider

You can test the OIDC provider by accessing the ALB URL in a browser. You should be redirected to the Authentik login page, and after successful authentication, you should be redirected back to the application.

## Troubleshooting

If you encounter issues with the OIDC provider:

1. Check the Lambda function logs in CloudWatch
2. Verify the OIDC provider configuration in Authentik
3. Ensure the redirect URIs are correctly configured
4. Check the ALB listener configuration