const { ElasticLoadBalancingV2Client, DescribeRulesCommand, ModifyRuleCommand, CreateRuleCommand, DeleteRuleCommand } = require('@aws-sdk/client-elastic-load-balancing-v2');

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  try {
    const elbv2 = new ElasticLoadBalancingV2Client();
    const listenerArn = event.ResourceProperties.ListenerArn;
    const hostname = event.ResourceProperties.EnrollmentHostname;
    let targetGroupArn = event.ResourceProperties.TargetGroupArn;
    const priority = event.ResourceProperties.Priority || 100;
    const physicalResourceId = event.ResourceProperties.PhysicalResourceId || event.PhysicalResourceId || `alb-oidc-auth-${hostname}`;
    
    // Handle delete request
    if (event.RequestType === 'Delete') {
      // If we have a rule ARN stored in the physical resource ID, try to delete it
      if (event.PhysicalResourceId && event.PhysicalResourceId.includes('arn:aws:elasticloadbalancing')) {
        try {
          console.log(`Attempting to delete rule ${event.PhysicalResourceId}`);
          await elbv2.send(new DeleteRuleCommand({
            RuleArn: event.PhysicalResourceId
          }));
          console.log(`Successfully deleted rule ${event.PhysicalResourceId}`);
        } catch (deleteError) {
          console.warn(`Failed to delete rule: ${deleteError.message}`);
          // Continue with success even if delete fails
        }
      }
      
      return {
        PhysicalResourceId: physicalResourceId,
        Status: 'SUCCESS',
      };
    }
    
    // Get all rules for the listener
    const describeRulesResponse = await elbv2.send(new DescribeRulesCommand({
      ListenerArn: listenerArn
    }));
    
    // Find the rule that matches our hostname condition
    let rule = describeRulesResponse.Rules.find(r => {
      // Find the host header condition
      const hostCondition = r.Conditions.find(c => c.Field === 'host-header');
      if (!hostCondition || !hostCondition.Values) return false;
      
      // Check if the condition matches our hostname
      return hostCondition.Values.some(v => v.includes(hostname));
    });
    
    // If a specific rule ARN was provided, try to use that instead
    if (event.ResourceProperties.ListenerRuleArn) {
      try {
        const ruleResponse = await elbv2.send(new DescribeRulesCommand({
          RuleArns: [event.ResourceProperties.ListenerRuleArn]
        }));
        if (ruleResponse.Rules && ruleResponse.Rules.length > 0) {
          rule = ruleResponse.Rules[0];
          console.log(`Using provided rule ARN: ${rule.RuleArn}`);
        }
      } catch (ruleError) {
        console.warn(`Failed to get rule by ARN: ${ruleError.message}`);
      }
    }
    
    // If no rule exists, create a new one
    if (!rule) {
      console.log(`No existing rule found for hostname ${hostname}, creating new rule`);
      
      if (!targetGroupArn) {
        throw new Error('Target group ARN is required to create a new rule');
      }
      
      // Create a new rule with OIDC authentication
      const createRuleResponse = await elbv2.send(new CreateRuleCommand({
        ListenerArn: listenerArn,
        Priority: parseInt(priority),
        Conditions: [
          {
            Field: 'host-header',
            Values: [`${hostname}.*`]
          }
        ],
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
          {
            Type: 'forward',
            Order: 2,
            ForwardConfig: {
              TargetGroups: [
                {
                  TargetGroupArn: targetGroupArn
                }
              ]
            }
          }
        ]
      }));
      
      console.log(`Created new rule with ARN: ${createRuleResponse.Rules[0].RuleArn}`);
      
      return {
        PhysicalResourceId: createRuleResponse.Rules[0].RuleArn,
        Status: 'SUCCESS',
        Data: {
          ListenerRuleArn: createRuleResponse.Rules[0].RuleArn
        }
      };
    }
    
    console.log(`Found rule ${rule.RuleArn} for hostname ${hostname}`);
    
    // If not provided in the initial declaration, try to get it from the existing rule
    if (!targetGroupArn) {
      const forwardAction = rule.Actions.find(action => action.Type === 'forward');
      if (forwardAction && forwardAction.ForwardConfig && forwardAction.ForwardConfig.TargetGroups && forwardAction.ForwardConfig.TargetGroups.length > 0) {
        targetGroupArn = forwardAction.ForwardConfig.TargetGroups[0].TargetGroupArn;
      }
    }
    
    if (!targetGroupArn) {
      throw new Error('Could not determine target group ARN');
    }
    
    console.log(`Using target group ARN: ${targetGroupArn}`);
    
    // Check if the rule already has OIDC authentication
    const hasOidcAuth = rule.Actions.some(action => action.Type === 'authenticate-oidc');
    
    if (hasOidcAuth) {
      console.log(`Rule ${rule.RuleArn} already has OIDC authentication, updating configuration`);
    } else {
      console.log(`Adding OIDC authentication to rule ${rule.RuleArn}`);
    }
    
    // Modify the existing rule to add or update OIDC authentication
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
        {
          Type: 'forward',
          Order: 2,
          ForwardConfig: {
            TargetGroups: [
              {
                TargetGroupArn: targetGroupArn
              }
            ]
          }
        }
      ]
    }));
    
    console.log(`Modified rule ${rule.RuleArn} to add/update OIDC authentication`);
    
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