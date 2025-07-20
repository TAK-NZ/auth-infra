require('dotenv').config();
const { handler } = require('./index');

// Mock event for local testing
const mockEvent = {
  RequestType: 'Create',
  ResourceProperties: {
    ServiceToken: 'mock-service-token',
    timestamp: new Date().toISOString(),
  },
  ResponseURL: 'https://example.com/response',
  StackId: 'mock-stack-id',
  RequestId: 'mock-request-id',
  LogicalResourceId: 'mock-resource-id',
  ResourceType: 'Custom::AuthentikOidcSetup',
};

// Mock context for local testing
const mockContext = {
  logStreamName: 'mock-log-stream',
  functionName: 'mock-function-name',
};

// Set environment variables for local testing
process.env.AUTHENTIK_ADMIN_SECRET_ARN = 'mock-secret-arn';
process.env.AUTHENTIK_ADMIN_TOKEN = process.env.AUTHENTIK_ADMIN_TOKEN;
process.env.AUTHENTICATION_FLOW_NAME = process.env.AUTHENTICATION_FLOW_NAME || '';
process.env.AUTHORIZATION_FLOW_NAME = process.env.AUTHORIZATION_FLOW_NAME || 'default-provider-authorization-explicit-consent';
process.env.INVALIDATION_FLOW_NAME = process.env.INVALIDATION_FLOW_NAME || 'default-invalidation-flow';

// Run the handler
async function runTest() {
  try {
    console.log('Running test with event:', JSON.stringify(mockEvent, null, 2));
    const result = await handler(mockEvent, mockContext);
    console.log('Result:', JSON.stringify(result, null, 2));
    
    // Display OIDC endpoints for validation
    if (result.Data) {
      console.log('\n=== OIDC Configuration for ALB ===');
      console.log(`Issuer: ${result.Data.issuer}`);
      console.log(`Authorize URL: ${result.Data.authorizeUrl}`);
      console.log(`Token URL: ${result.Data.tokenUrl}`);
      console.log(`UserInfo URL: ${result.Data.userInfoUrl}`);
      console.log(`JWKS URI: ${result.Data.jwksUri}`);
      console.log(`Client ID: ${result.Data.clientId}`);
      console.log(`Client Secret: ${result.Data.clientSecret ? '***' : 'Not available'}`);
      console.log('================================\n');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

runTest();