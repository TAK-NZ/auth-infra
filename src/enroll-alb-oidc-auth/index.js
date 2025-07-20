const { ElasticLoadBalancingV2Client, DescribeRulesCommand, ModifyRuleCommand } = require('@aws-sdk/client-elastic-load-balancing-v2');

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  try {
    if (event.RequestType === 'Delete') {
      return {
        PhysicalResourceId: event.PhysicalResourceId || 'alb-oidc-auth-setup',
        Status: 'SUCCESS',
      };
    }
    
    const elbv2 = new ElasticLoadBalancingV2Client();
    const listenerArn = event.ResourceProperties.ListenerArn;
    const hostname = event.ResourceProperties.EnrollmentHostname;
    
    // Get all rules for the listener
    const describeRulesResponse = await elbv2.send(new DescribeRulesCommand({
      ListenerArn: listenerArn
    }));
    
    // Find the rule that matches our hostname condition
    const rule = describeRulesResponse.Rules.find(r => {
      // Find the host header condition
      const hostCondition = r.Conditions.find(c => c.Field === 'host-header');
      if (!hostCondition || !hostCondition.Values) return false;
      
      // Check if the condition matches our hostname
      return hostCondition.Values.some(v => v.includes(hostname));
    });
    
    if (!rule) {
      throw new Error(`Could not find rule for hostname ${hostname}`);
    }
    
    // Modify the rule to add OIDC authentication
    await elbv2.send(new ModifyRuleCommand({
      RuleArn: rule.RuleArn,
      Actions: [
        {
          Type: 'authenticate-oidc',
          Order: 1,
          AuthenticateOidcConfig: {
            AuthorizationEndpoint: event.ResourceProperties.AuthorizeUrl,
            ClientId: event.ResourceProperties.ClientId,
            ClientSecret: event.ResourceProperties.ClientSecret,
            Issuer: event.ResourceProperties.Issuer,
            TokenEndpoint: event.ResourceProperties.TokenUrl,
            UserInfoEndpoint: event.ResourceProperties.UserInfoUrl,
            OnUnauthenticatedRequest: 'authenticate',
            Scope: event.ResourceProperties.Scope,
            SessionCookieName: event.ResourceProperties.SessionCookieName,
            SessionTimeout: parseInt(event.ResourceProperties.SessionTimeout)
          }
        },
        ...rule.Actions.map(action => ({
          ...action,
          Order: 2
        }))
      ]
    }));
    
    return {
      PhysicalResourceId: rule.RuleArn,
      Status: 'SUCCESS',
      Data: {
        ListenerRuleArn: rule.RuleArn
      }
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      Status: 'FAILED',
      Reason: `Error: ${error.message}`,
      PhysicalResourceId: event.PhysicalResourceId || 'alb-oidc-auth-setup-failed',
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
    };
  }
};