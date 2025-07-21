const { SecretsManagerClient, ListSecretsCommand, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// Main handler function for the Lambda
exports.handler = async (event, context) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  console.log('Environment variables:', {
    AUTHENTIK_URL: process.env.AUTHENTIK_URL,
    AUTHENTIK_ADMIN_SECRET_ARN: process.env.AUTHENTIK_ADMIN_SECRET_ARN ? '***' : undefined,
    PROVIDER_NAME: process.env.PROVIDER_NAME,
    APPLICATION_NAME: process.env.APPLICATION_NAME,
    APPLICATION_SLUG: process.env.APPLICATION_SLUG,
    REDIRECT_URIS: process.env.REDIRECT_URIS,
    LAUNCH_URL: process.env.LAUNCH_URL,
  });
  
  try {
    // Handle CloudFormation custom resource events
    if (event.RequestType === 'Delete') {
      // For delete events, we don't need to do anything as Authentik resources
      // will be managed separately from CloudFormation
      return {
        PhysicalResourceId: event.PhysicalResourceId || 'authentik-oidc-setup',
        Status: 'SUCCESS',
      };
    }
    
    // For local testing, use the token from environment variable if available
    let adminToken = process.env.AUTHENTIK_ADMIN_TOKEN;
    
    // In Lambda environment, get token from Secrets Manager
    if (!adminToken) {
      try {
        console.log('Getting admin token from Secrets Manager');
        const secretsManager = new SecretsManagerClient();
        let secretName = process.env.AUTHENTIK_ADMIN_SECRET_ARN;
        
        console.log(`Secret ARN: ${secretName}`);
        
        if (!secretName) {
          console.log('No secret ARN provided, attempting to find by name');
          const listCommand = new ListSecretsCommand({
            Filters: [{ Key: 'name', Values: ['AuthentikAdminToken'] }]
          });
          const listResponse = await secretsManager.send(listCommand);
          secretName = listResponse.SecretList[0].ARN;
          console.log(`Found secret ARN: ${secretName}`);
        }
        
        console.log('Retrieving secret value...');
        const getCommand = new GetSecretValueCommand({ SecretId: secretName });
        const secretData = await secretsManager.send(getCommand);
        console.log('Secret retrieved successfully');
        console.log('Secret string type:', typeof secretData.SecretString);
        
        // Log the first few characters to help debug without exposing the full secret
        if (secretData.SecretString) {
          console.log('Secret string preview:', secretData.SecretString.substring(0, 10) + '...');
        }
        
        try {
          // Try to parse as JSON
          const secret = JSON.parse(secretData.SecretString);
          adminToken = secret.token;
          
          if (!adminToken) {
            throw new Error('Admin token not found in secret. Secret should contain a "token" field.');
          }
        } catch (parseError) {
          console.log('Failed to parse secret as JSON, using raw string as token');
          // If not valid JSON, use the raw string as the token
          adminToken = secretData.SecretString;
        }
      } catch (error) {
        console.error('Error retrieving secret:', error);
        if (error.name === 'AccessDeniedException' && error.message.includes('KMS')) {
          console.error('KMS access denied. Make sure the Lambda has permission to use the KMS key that encrypts the secret.');
        }
        throw error;
      }
    }
    
    // Configure axios for Authentik API
    const authentikUrl = process.env.AUTHENTIK_URL;
    const api = axios.create({
      baseURL: authentikUrl,
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    // Get or create authentication flow
    const authenticationFlowName = process.env.AUTHENTICATION_FLOW_NAME || '';
    let authenticationFlow = authenticationFlowName ? 
      await getFlowByName(api, authenticationFlowName) : null;
    
    // Get or create authorization flow
    const authorizationFlowName = process.env.AUTHORIZATION_FLOW_NAME || 'default-provider-authorization-implicit-consent';
    let authorizationFlow = await getFlowByName(api, authorizationFlowName);
    
    // Get or create invalidation flow
    const invalidationFlowName = process.env.INVALIDATION_FLOW_NAME || 'default-provider-invalidation-flow';
    let invalidationFlow = await getFlowByName(api, invalidationFlowName);
    
    // Create or update OAuth2 provider
    const providerName = process.env.PROVIDER_NAME;
    const redirectUris = JSON.parse(process.env.REDIRECT_URIS).map(uri => ({
      url: uri,
      matching_mode: 'strict'
    }));
    
    // Get or create required scope mappings
    console.log('Setting up required scope mappings');
    const requiredScopes = ['email', 'openid', 'profile'];
    const scopeMappings = [];
    
    for (const scope of requiredScopes) {
      const mapping = await getOrCreateScopeMapping(api, scope);
      scopeMappings.push(mapping.pk);
    }
    
    const provider = await createOrUpdateProvider(api, {
      name: providerName,
      authorization_flow: authorizationFlow.pk,
      invalidation_flow: invalidationFlow.pk,
      ...(authenticationFlow ? { authentication_flow: authenticationFlow.pk } : {}),
      redirect_uris: redirectUris,
      client_type: 'confidential',
      include_claims_in_id_token: true,
      access_code_validity: 'minutes=1',
      access_token_validity: 'minutes=5',
      refresh_token_validity: 'days=30',
      signing_key: null, // Use default
      property_mappings: scopeMappings, // Add the scope mappings
    });
    
    // Create or update application
    const applicationName = process.env.APPLICATION_NAME;
    const applicationSlug = process.env.APPLICATION_SLUG || applicationName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const launchUrl = process.env.LAUNCH_URL;
    const openInNewTab = process.env.OPEN_IN_NEW_TAB === 'true';
    const groupName = process.env.GROUP_NAME;
    const description = process.env.APPLICATION_DESCRIPTION;
    
    const application = await createOrUpdateApplication(api, {
      name: applicationName,
      slug: applicationSlug,
      provider: provider.pk,
      meta_launch_url: launchUrl,
      open_in_new_tab: openInNewTab,
      ...(description ? { meta_description: description } : {}),
    });
    
    // Set application icon URL
    await uploadApplicationIcon(api, application.slug);
    
    // Assign group to application if specified
    if (groupName) {
      console.log(`Assigning group '${groupName}' to application`);
      await assignGroupToApplication(api, application.pk, groupName);
    }
    
    // Get OIDC configuration endpoints
    console.log('Retrieving OIDC configuration endpoints');
    const oidcConfig = await getOidcConfiguration(authentikUrl, applicationSlug);
    console.log('OIDC configuration retrieved:', JSON.stringify(oidcConfig, null, 2));
    
    // Log the provider data to debug
    console.log('Provider data:', JSON.stringify(provider, null, 2));
    
    // Ensure client_id and client_secret are available
    if (!provider.client_id) {
      throw new Error('Provider client_id is missing in the response from Authentik');
    }
    
    // Ensure issuer is available
    if (!oidcConfig.issuer) {
      throw new Error('OIDC issuer is missing in the configuration');
    }
    
    // Log critical values
    console.log('Critical OIDC values:', {
      clientId: provider.client_id,
      issuer: oidcConfig.issuer
    });
    
    // Return the client ID, secret, and OIDC endpoints for ALB OIDC configuration
    // Include clientId at both the top level and in the Data object to ensure it's accessible
    const response = {
      PhysicalResourceId: provider.pk.toString(),
      clientId: provider.client_id, // Add at top level for compatibility
      clientSecret: provider.client_secret, // Add at top level for compatibility
      issuer: oidcConfig.issuer, // Add at top level for compatibility
      authorizeUrl: oidcConfig.authorizeUrl, // Add at top level for compatibility
      tokenUrl: oidcConfig.tokenUrl, // Add at top level for compatibility
      userInfoUrl: oidcConfig.userInfoUrl, // Add at top level for compatibility
      jwksUri: oidcConfig.jwksUri, // Add at top level for compatibility
      Data: {
        clientId: provider.client_id,
        clientSecret: provider.client_secret,
        providerName: providerName,
        issuer: oidcConfig.issuer,
        authorizeUrl: oidcConfig.authorizeUrl,
        tokenUrl: oidcConfig.tokenUrl,
        token_endpoint: oidcConfig.tokenUrl, // Add snake_case version for compatibility
        userInfoUrl: oidcConfig.userInfoUrl,
        userinfo_endpoint: oidcConfig.userInfoUrl, // Add snake_case version for compatibility
        jwksUri: oidcConfig.jwksUri,
        jwks_uri: oidcConfig.jwksUri // Add snake_case version for compatibility
      },
    };
    
    // Log the response structure to help debug
    console.log('Response structure:', JSON.stringify({
      hasClientId: !!response.clientId,
      hasIssuer: !!response.issuer,
      dataHasClientId: !!response.Data.clientId,
      dataHasIssuer: !!response.Data.issuer
    }));
    
    // For CloudFormation custom resources, we need to include Status
    if (event.RequestType) {
      // Ensure we're following the exact format expected by CloudFormation
      const cfnResponse = {
        Status: 'SUCCESS',
        PhysicalResourceId: response.PhysicalResourceId,
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
        // Include Data at the top level for CloudFormation
        Data: {
          ...response.Data,
          // Ensure these are also at the top level of Data
          clientId: provider.client_id,
          clientSecret: provider.client_secret,
          issuer: response.Data.issuer
        },
        // Also include at the top level for backward compatibility
        clientId: provider.client_id,
        clientSecret: provider.client_secret,
        issuer: response.Data.issuer
      };
      
      console.log('Returning CloudFormation response:', JSON.stringify(cfnResponse, (key, value) => {
        // Mask sensitive values in logs
        if (key === 'clientSecret') return '***';
        return value;
      }, 2));
      
      return cfnResponse;
    }
    
    console.log('Returning successful response');
    return response;
  } catch (error) {
    console.error('Error:', error);
    
    // For CloudFormation custom resources, we need to return a specific format
    if (event.RequestType) {
      // Provide more detailed error information
      let errorDetails = error.message;
      if (error.response && error.response.data) {
        errorDetails += ` - API Response: ${JSON.stringify(error.response.data)}`;
      }
      
      const errorResponse = {
        Status: 'FAILED',
        Reason: `Error: ${errorDetails}`,
        PhysicalResourceId: event.PhysicalResourceId || 'authentik-oidc-setup-failed',
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
        // Include empty Data to avoid undefined errors
        Data: {}
      };
      
      console.log('Returning error response:', JSON.stringify(errorResponse));
      return errorResponse;
    }
    
    throw error;
  }
};

// Helper function to get a flow by name
async function getFlowByName(api, name) {
  try {
    console.log(`Looking for flow: ${name}`);
    const response = await api.get('/api/v3/flows/instances/', {
      params: { name: name }
    });
    
    if (response.data.results && response.data.results.length > 0) {
      console.log(`Found flow with name: ${name}, pk: ${response.data.results[0].pk}`);
      return response.data.results[0];
    }
    
    // If flow doesn't exist by name, try to find it by slug
    const allFlows = await api.get('/api/v3/flows/instances/');
    
    // First try to find the exact flow by slug
    const exactFlow = allFlows.data.results.find(flow => flow.slug === name);
    if (exactFlow) {
      console.log(`Found flow by slug: ${name}, pk: ${exactFlow.pk}`);
      return exactFlow;
    }
    
    // If we're looking for implicit consent, prioritize that
    if (name === 'default-provider-authorization-implicit-consent') {
      const implicitFlow = allFlows.data.results.find(flow => 
        flow.slug === 'default-provider-authorization-implicit-consent'
      );
      if (implicitFlow) {
        console.log(`Found implicit consent flow, pk: ${implicitFlow.pk}`);
        return implicitFlow;
      }
    }
    
    // Fallback to any authorization flow
    const fallbackFlow = allFlows.data.results.find(flow => 
      flow.slug === 'default-provider-authorization-implicit-consent' || 
      flow.slug === 'default-provider-authorization-explicit-consent'
    );
    
    if (fallbackFlow) {
      console.log(`Using fallback flow: ${fallbackFlow.slug}, pk: ${fallbackFlow.pk}`);
      return fallbackFlow;
    }
    
    throw new Error(`Flow not found: ${name}`);
  } catch (error) {
    console.error('Error getting flow:', error);
    throw error;
  }
}

// Helper function to create or update OAuth2 provider
async function createOrUpdateProvider(api, providerData) {
  try {
    // Check if provider exists
    const existingProviders = await api.get('/api/v3/providers/oauth2/', {
      params: { name: providerData.name }
    });
    
    let provider;
    
    if (existingProviders.data.results && existingProviders.data.results.length > 0) {
      // Update existing provider
      const existingProvider = existingProviders.data.results[0];
      console.log(`Updating existing provider with ID ${existingProvider.pk}`);
      const response = await api.patch(`/api/v3/providers/oauth2/${existingProvider.pk}/`, providerData);
      provider = response.data;
    } else {
      // Create new provider
      console.log('Creating new OAuth2 provider');
      const response = await api.post('/api/v3/providers/oauth2/', providerData);
      provider = response.data;
    }
    
    // Ensure we have client_id and client_secret
    if (!provider.client_id || !provider.client_secret) {
      // If missing, fetch the provider details to get the client_id and client_secret
      console.log(`Provider created/updated, but client_id or client_secret is missing. Fetching provider details...`);
      const detailsResponse = await api.get(`/api/v3/providers/oauth2/${provider.pk}/`);
      provider = detailsResponse.data;
      
      console.log(`Provider details fetched. Has client_id: ${!!provider.client_id}, Has client_secret: ${!!provider.client_secret}`);
    }
    
    return provider;
  } catch (error) {
    console.error('Error creating/updating provider:', error.message);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      if (error.response.data) {
        console.error('Error details:', JSON.stringify(error.response.data, null, 2));
      }
    }
    throw error;
  }
}

// Helper function to create or update application
async function createOrUpdateApplication(api, applicationData) {
  try {
    // Check if application exists
    const existingApps = await api.get('/api/v3/core/applications/', {
      params: { slug: applicationData.slug }
    });
    
    if (existingApps.data.results && existingApps.data.results.length > 0) {
      // Update existing application
      const existingApp = existingApps.data.results[0];
      const response = await api.patch(`/api/v3/core/applications/${existingApp.slug}/`, applicationData);
      return response.data;
    } else {
      // Create new application
      const response = await api.post('/api/v3/core/applications/', applicationData);
      return response.data;
    }
  } catch (error) {
    if (error.response && error.response.status === 404) {
      // If we get a 404, the application doesn't exist, so create it
      console.log('Application not found, creating new one');
      const response = await api.post('/api/v3/core/applications/', applicationData);
      return response.data;
    }
    console.error('Error creating/updating application:', error);
    if (error.response && error.response.data) {
      console.error('Error details:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

// Helper function to assign a group to an application
async function assignGroupToApplication(api, appSlug, groupName) {
  try {
    if (!groupName) {
      console.log('No group name provided, skipping group assignment');
      return null;
    }
    
    console.log(`Setting group name: ${groupName} for application: ${appSlug}`);
    
    // Update the application with the group name
    const response = await api.patch(`/api/v3/core/applications/${appSlug}/`, {
      group: groupName
    });
    
    console.log('Group assigned successfully');
    return response.data;
  } catch (error) {
    console.error('Error assigning group to application:', error.message);
    if (error.response && error.response.data) {
      console.error('Error details:', JSON.stringify(error.response.data, null, 2));
    }
    // Don't throw error for group assignment failures
    return null;
  }
}

// Helper function to upload application icon
async function uploadApplicationIcon(api, appSlug) {
  try {
    // Check if application already has an icon
    const appResponse = await api.get(`/api/v3/core/applications/${appSlug}/`);
    if (appResponse.data.meta_icon) {
      console.log(`Application ${appSlug} already has an icon, skipping upload`);
      return null;
    }
    
    // Use file upload instead of URL
    const iconPath = path.join(__dirname, 'TAK-Enroll.png');
    console.log(`Uploading icon from: ${iconPath}`);
    
    if (!fs.existsSync(iconPath)) {
      console.warn(`Icon file not found at ${iconPath}`);
      return null;
    }
    
    const form = new FormData();
    form.append('file', fs.createReadStream(iconPath));
    
    const response = await api.post(`/api/v3/core/applications/${appSlug}/set_icon/`, form, {
      headers: {
        ...form.getHeaders(),
        'Content-Type': 'multipart/form-data',
      },
    });
    
    console.log('Icon uploaded successfully');
    return response.data;
  } catch (error) {
    console.error('Error uploading application icon:', error.message);
    if (error.response && error.response.data) {
      console.error('Error details:', JSON.stringify(error.response.data, null, 2));
    }
    // Don't throw error for icon upload failures
    return null;
  }
}

// Helper function to get or create scope mapping
async function getOrCreateScopeMapping(api, scopeName) {
  try {
    // Check if scope mapping exists
    const existingMappings = await api.get('/api/v3/propertymappings/provider/scope/', {
      params: { scope_name: scopeName }
    });
    
    if (existingMappings.data.results && existingMappings.data.results.length > 0) {
      console.log(`Found existing scope mapping for ${scopeName}`);
      return existingMappings.data.results[0];
    }
    
    // If not found, create a new scope mapping
    console.log(`Creating new scope mapping for ${scopeName}`);
    const response = await api.post('/api/v3/propertymappings/provider/scope/', {
      name: `authentik default OAuth Mapping: OpenID '${scopeName}'`,
      scope_name: scopeName,
      expression: 'return {}',  // Default expression
      description: `Standard OpenID Connect scope: ${scopeName}`
    });
    
    return response.data;
  } catch (error) {
    console.error(`Error getting/creating scope mapping for ${scopeName}:`, error.message);
    if (error.response && error.response.data) {
      console.error('Error details:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

// Helper function to get OIDC configuration endpoints
async function getOidcConfiguration(authentikUrl, applicationSlug) {
  try {
    console.log('Getting OIDC configuration');
    
    // Try to get the application-specific OIDC configuration
    try {
      const appConfigUrl = `${authentikUrl}/application/o/${applicationSlug}/.well-known/openid-configuration`;
      console.log(`Trying application-specific configuration at: ${appConfigUrl}`);
      const appResponse = await axios.get(appConfigUrl);
      console.log('Retrieved application-specific OIDC configuration');
      
      return {
        issuer: appResponse.data.issuer,
        authorizeUrl: appResponse.data.authorization_endpoint,
        tokenUrl: appResponse.data.token_endpoint,
        token_endpoint: appResponse.data.token_endpoint,
        userInfoUrl: appResponse.data.userinfo_endpoint,
        userinfo_endpoint: appResponse.data.userinfo_endpoint,
        jwksUri: appResponse.data.jwks_uri,
        jwks_uri: appResponse.data.jwks_uri
      };
    } catch (appError) {
      console.warn('Application-specific configuration not available:', appError.message);
      
      // Fall back to generic configuration
      try {
        const wellKnownResponse = await axios.get(`${authentikUrl}/.well-known/openid-configuration`);
        console.log('Retrieved generic OIDC configuration from well-known endpoint');
        
        // Override the issuer with the correct application-specific one
        return {
          issuer: `${authentikUrl}/application/o/${applicationSlug}/`,
          authorizeUrl: wellKnownResponse.data.authorization_endpoint,
          tokenUrl: wellKnownResponse.data.token_endpoint,
          token_endpoint: wellKnownResponse.data.token_endpoint,
          userInfoUrl: wellKnownResponse.data.userinfo_endpoint,
          userinfo_endpoint: wellKnownResponse.data.userinfo_endpoint,
          jwksUri: wellKnownResponse.data.jwks_uri,
          jwks_uri: wellKnownResponse.data.jwks_uri
        };
      } catch (wellKnownError) {
        console.warn('Could not retrieve OIDC configuration from well-known endpoint:', wellKnownError.message);
        
        // Fallback: construct the URLs manually based on Authentik's known structure
        const baseUrl = authentikUrl;
        return {
          issuer: `${baseUrl}/application/o/${applicationSlug}/`,
          authorizeUrl: `${baseUrl}/application/o/authorize/`,
          tokenUrl: `${baseUrl}/application/o/token/`,
          token_endpoint: `${baseUrl}/application/o/token/`,
          userInfoUrl: `${baseUrl}/application/o/userinfo/`,
          userinfo_endpoint: `${baseUrl}/application/o/userinfo/`,
          jwksUri: `${baseUrl}/application/o/jwks/`,
          jwks_uri: `${baseUrl}/application/o/jwks/`
        };
      }
    }
  } catch (error) {
    console.error('Error getting OIDC configuration:', error.message);
    if (error.response && error.response.data) {
      console.error('Error details:', JSON.stringify(error.response.data, null, 2));
    }
    
    // Fallback with basic URLs if all else fails
    return {
      issuer: `${authentikUrl}/application/o/${applicationSlug}/`,
      authorizeUrl: `${authentikUrl}/application/o/authorize/`,
      tokenUrl: `${authentikUrl}/application/o/token/`,
      token_endpoint: `${authentikUrl}/application/o/token/`,
      userInfoUrl: `${authentikUrl}/application/o/userinfo/`,
      userinfo_endpoint: `${authentikUrl}/application/o/userinfo/`,
      jwksUri: `${authentikUrl}/application/o/jwks/`,
      jwks_uri: `${authentikUrl}/application/o/jwks/`
    };
  }
}