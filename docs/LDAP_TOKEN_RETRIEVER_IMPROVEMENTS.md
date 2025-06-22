# LDAP Token Retriever Improvements

## Overview

The LDAP Token Retriever has been enhanced with robust retry logic and comprehensive logging capabilities to address deployment failures and improve operational visibility.

## Key Improvements

### 1. Exponential Backoff Retry Logic

- **Maximum Retries**: 5 attempts (configurable via environment variables)
- **Base Delay**: 1 second with exponential backoff
- **Maximum Delay**: 30 seconds cap to prevent excessive wait times
- **Jitter**: Random delay component to prevent thundering herd problems
- **Configurable**: All retry parameters can be adjusted via environment variables

### 2. Enhanced Logging

- **Structured Logging**: JSON-formatted logs with timestamps and context
- **Operation Tracking**: Detailed logging for each retry attempt
- **Error Context**: Comprehensive error information including error types and stack traces
- **Performance Metrics**: Execution time tracking and remaining Lambda time monitoring
- **Security**: Sensitive data (tokens) are masked in logs, showing only prefixes

### 3. Improved Error Handling

- **Detailed Error Messages**: More descriptive error messages with context
- **HTTP Response Logging**: Full HTTP response details for debugging
- **Timeout Handling**: 30-second timeout for HTTP requests
- **CloudFormation Response**: Enhanced response data for stack operations

### 4. Configuration Enhancements

- **Environment Variables**: Retry configuration via Lambda environment variables
- **Increased Timeout**: Lambda timeout increased to 10 minutes to accommodate retries
- **Enhanced IAM Permissions**: Additional CloudWatch Logs permissions for better monitoring

## Configuration

### Environment Variables

The following environment variables can be set to customize retry behavior:

```typescript
MAX_RETRIES: '5'              // Maximum number of retry attempts
BASE_DELAY_MS: '1000'         // Base delay in milliseconds
MAX_DELAY_MS: '30000'         // Maximum delay cap in milliseconds
BACKOFF_MULTIPLIER: '2'       // Exponential backoff multiplier
```

### Retry Strategy

The retry logic uses exponential backoff with jitter:

```
delay = min(baseDelay * (multiplier ^ attempt), maxDelay) + random(0, 1000)
```

Example retry delays:
- Attempt 1: ~1 second
- Attempt 2: ~2 seconds  
- Attempt 3: ~4 seconds
- Attempt 4: ~8 seconds
- Attempt 5: ~16 seconds

## Log Structure

All logs follow a structured JSON format:

```json
{
  "timestamp": "2025-01-22T10:30:45.123Z",
  "level": "INFO",
  "message": "Attempting retrieveToken",
  "attempt": 1,
  "maxRetries": 6,
  "authentikHost": "https://account.example.com",
  "outpostName": "LDAP"
}
```

## Error Scenarios Handled

### 1. Network Connectivity Issues
- HTTP timeouts (30-second limit)
- Connection failures
- DNS resolution problems

### 2. Authentication Problems
- Invalid admin tokens
- Expired tokens
- Permission issues

### 3. Authentik API Issues
- Service unavailability
- Rate limiting
- Invalid responses

### 4. AWS Services Issues
- Secrets Manager unavailability
- KMS key access problems
- CloudFormation response failures

## Monitoring and Troubleshooting

### CloudWatch Logs

Enhanced logging provides detailed information for troubleshooting:

1. **Search for specific operations**: Filter by `"level": "ERROR"` for failures
2. **Track retry attempts**: Look for `"attempt"` field in logs
3. **Monitor execution time**: Check `"executionTimeMs"` for performance issues
4. **Identify bottlenecks**: Review HTTP request/response timing

### Common Issues and Solutions

#### Issue: "Outpost with name LDAP not found"
**Solution**: Check if Authentik is fully initialized and LDAP outpost is configured

#### Issue: "HTTP error! status: 500"
**Solution**: Authentik server may not be ready; retry logic will handle this automatically

#### Issue: "Request timeout"
**Solution**: Network connectivity issues; check security groups and network configuration

#### Issue: "Token identifier not found"
**Solution**: LDAP outpost configuration may be incomplete in Authentik

## Performance Impact

- **Increased Lambda Duration**: Retry logic may extend execution time
- **Cost Implications**: Longer execution times increase Lambda costs marginally
- **Reliability Improvement**: Significantly reduces deployment failures due to transient issues

## Backward Compatibility

All changes are backward compatible:
- Existing deployments will continue to work
- Default retry configuration matches previous behavior expectations
- No breaking changes to the construct interface

## Testing

The improvements can be tested by:

1. **Simulating Network Issues**: Temporarily blocking network access
2. **Testing with Unready Authentik**: Deploy before Authentik is fully initialized
3. **Load Testing**: Multiple concurrent deployments
4. **Timeout Testing**: Artificially slow responses

## Future Enhancements

Potential future improvements:
- **Circuit Breaker Pattern**: Prevent cascading failures
- **Health Check Integration**: Verify Authentik readiness before token retrieval
- **Metrics Export**: CloudWatch custom metrics for monitoring
- **Dead Letter Queue**: Handle permanent failures differently