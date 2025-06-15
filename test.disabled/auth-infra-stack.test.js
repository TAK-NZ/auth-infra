"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const cdk = __importStar(require("aws-cdk-lib"));
const assertions_1 = require("aws-cdk-lib/assertions");
const auth_infra_stack_1 = require("../lib/auth-infra-stack");
describe('AuthInfraStack', () => {
    let app;
    let stack;
    let template;
    beforeEach(() => {
        app = new cdk.App();
        // Set required context parameters
        app.node.setContext('authentikAdminUserEmail', 'admin@example.com');
        app.node.setContext('authentikLdapBaseDn', 'DC=example,DC=com');
        stack = new auth_infra_stack_1.AuthInfraStack(app, 'TestStack', {
            envType: 'dev-test',
        });
        template = assertions_1.Template.fromStack(stack);
    });
    test('Stack creates successfully', () => {
        expect(stack).toBeDefined();
    });
    test('Contains Aurora PostgreSQL cluster', () => {
        template.hasResourceProperties('AWS::RDS::DBCluster', {
            Engine: 'aurora-postgresql',
            DatabaseName: 'authentik',
        });
    });
    test('Contains Redis replication group', () => {
        template.hasResourceProperties('AWS::ElastiCache::ReplicationGroup', {
            Engine: 'valkey',
            ReplicationGroupDescription: 'Valkey (Redis) cluster for Authentik',
        });
    });
    test('Contains EFS file system', () => {
        template.hasResourceProperties('AWS::EFS::FileSystem', {
            Encrypted: true,
        });
    });
    test('Contains Application Load Balancer', () => {
        template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
            Type: 'application',
            Scheme: 'internet-facing',
        });
    });
    test('Contains both Authentik and LDAP ECS Task Definitions', () => {
        // Should have 2 task definitions - one for Authentik, one for LDAP
        template.resourceCountIs('AWS::ECS::TaskDefinition', 2);
        template.hasResourceProperties('AWS::ECS::TaskDefinition', {
            RequiresCompatibilities: ['FARGATE'],
            NetworkMode: 'awsvpc',
        });
    });
    test('Contains Secrets Manager secrets', () => {
        template.hasResourceProperties('AWS::SecretsManager::Secret', {
            Description: assertions_1.Match.stringLikeRegexp('.*Authentik.*'),
        });
    });
    test('Contains security groups', () => {
        template.hasResourceProperties('AWS::EC2::SecurityGroup', {
            GroupDescription: assertions_1.Match.anyValue(),
        });
    });
    test('Contains IAM roles for ECS tasks', () => {
        template.hasResourceProperties('AWS::IAM::Role', {
            AssumeRolePolicyDocument: {
                Statement: [
                    {
                        Effect: 'Allow',
                        Principal: {
                            Service: 'ecs-tasks.amazonaws.com',
                        },
                        Action: 'sts:AssumeRole',
                    },
                ],
            },
        });
    });
    test('Contains CloudWatch log group', () => {
        template.hasResourceProperties('AWS::Logs::LogGroup', {
            RetentionInDays: 7,
        });
    });
    test('Stack has required parameters', () => {
        template.hasParameter('EnableExecute', {
            Type: 'String',
            AllowedValues: ['true', 'false'],
            Default: 'false',
        });
        template.hasParameter('AuthentikAdminUserEmail', {
            Type: 'String',
        });
        template.hasParameter('AuthentikLDAPBaseDN', {
            Type: 'String',
            Default: 'DC=example,DC=com',
        });
        template.hasParameter('IpAddressType', {
            Type: 'String',
            AllowedValues: ['ipv4', 'dualstack'],
            Default: 'dualstack',
        });
        // GitSha parameter was removed - now used directly from imports
        // SSLCertificateARN parameter was removed - now imported from base stack
        template.hasParameter('AuthentikAdminUserEmail', {
            Type: 'String',
            Description: 'E-Mail address for the Authentik akadmin user',
        });
    });
    test('Stack has required outputs', () => {
        // CDK generates unique output names with suffixes
        const templateObj = template.toJSON();
        const outputKeys = Object.keys(templateObj.Outputs || {});
        // Check for Authentik URL output (name starts with 'Authentik' but may have suffix)
        const authentikOutput = outputKeys.find(key => key.startsWith('Authentik') && !key.includes('LDAP'));
        expect(authentikOutput).toBeDefined();
        if (authentikOutput) {
            expect(templateObj.Outputs[authentikOutput]).toMatchObject({
                Description: 'HTTP(S) ALB endpoint for CNAME',
            });
        }
        // Check for LDAP Base DN output (name starts with 'Authentik' and includes 'LDAP')
        const ldapBaseDnOutput = outputKeys.find(key => key.startsWith('Authentik') && key.includes('LDAP'));
        expect(ldapBaseDnOutput).toBeDefined();
        if (ldapBaseDnOutput) {
            expect(templateObj.Outputs[ldapBaseDnOutput]).toMatchObject({
                Description: 'LDAP Base DN',
            });
        }
    });
    test('Stack has conditions', () => {
        template.hasCondition('CreateProdResources', {});
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC1pbmZyYS1zdGFjay50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYXV0aC1pbmZyYS1zdGFjay50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdURBQXlEO0FBQ3pELDhEQUF5RDtBQUV6RCxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxFQUFFO0lBQzlCLElBQUksR0FBWSxDQUFDO0lBQ2pCLElBQUksS0FBcUIsQ0FBQztJQUMxQixJQUFJLFFBQWtCLENBQUM7SUFFdkIsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNkLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNwQixrQ0FBa0M7UUFDbEMsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMseUJBQXlCLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztRQUNwRSxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxxQkFBcUIsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO1FBRWhFLEtBQUssR0FBRyxJQUFJLGlDQUFjLENBQUMsR0FBRyxFQUFFLFdBQVcsRUFBRTtZQUMzQyxPQUFPLEVBQUUsVUFBVTtTQUNwQixDQUFDLENBQUM7UUFDSCxRQUFRLEdBQUcscUJBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDdkMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsNEJBQTRCLEVBQUUsR0FBRyxFQUFFO1FBQ3RDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUM5QixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxvQ0FBb0MsRUFBRSxHQUFHLEVBQUU7UUFDOUMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLHFCQUFxQixFQUFFO1lBQ3BELE1BQU0sRUFBRSxtQkFBbUI7WUFDM0IsWUFBWSxFQUFFLFdBQVc7U0FDMUIsQ0FB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Q3JHLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ3ZDLElBQUksZ0JBQWdCLEVBQUUsQ0FBQztZQUNyQixNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDO2dCQUMxRCxXQUFXLEVBQUUsY0FBYzthQUM1QixDQUFDLENBQUM7UUFDTCxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsc0JBQXNCLEVBQUUsR0FBRyxFQUFFO1FBQ2hDLFFBQVEsQ0FBQyxZQUFZLENBQUMscUJBQXFCLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDbkQsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBUZW1wbGF0ZSwgTWF0Y2ggfSBmcm9tICdhd3MtY2RrLWxpYi9hc3NlcnRpb25zJztcbmltcG9ydCB7IEF1dGhJbmZyYVN0YWNrIH0gZnJvbSAnLi4vbGliL2F1dGgtaW5mcmEtc3RhY2snO1xuXG5kZXNjcmliZSgnQXV0aEluZnJhU3RhY2snLCAoKSA9PiB7XG4gIGxldCBhcHA6IGNkay5BcHA7XG4gIGxldCBzdGFjazogQXV0aEluZnJhU3RhY2s7XG4gIGxldCB0ZW1wbGF0ZTogVGVtcGxhdGU7XG5cbiAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgYXBwID0gbmV3IGNkay5BcHAoKTtcbiAgICAvLyBTZXQgcmVxdWlyZWQgY29udGV4dCBwYXJhbWV0ZXJzXG4gICAgYXBwLm5vZGUuc2V0Q29udGV4dCgnYXV0aGVudGlrQWRtaW5Vc2VyRW1haWwnLCAnYWRtaW5AZXhhbXBsZS5jb20nKTtcbiAgICBhcHAubm9kZS5zZXRDb250ZXh0KCdhdXRoZW50aWtMZGFwQmFzZURuJywgJ0RDPWV4YW1wbGUsREM9Y29tJyk7XG4gICAgXG4gICAgc3RhY2sgPSBuZXcgQXV0aEluZnJhU3RhY2soYXBwLCAnVGVzdFN0YWNrJywge1xuICAgICAgZW52VHlwZTogJ2Rldi10ZXN0JyxcbiAgICB9KTtcbiAgICB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG4gIH0pO1xuXG4gIHRlc3QoJ1N0YWNrIGNyZWF0ZXMgc3VjY2Vzc2Z1bGx5JywgKCkgPT4ge1xuICAgIGV4cGVjdChzdGFjaykudG9CZURlZmluZWQoKTtcbiAgfSk7XG5cbiAgdGVzdCgnQ29udGFpbnMgQXVyb3JhIFBvc3RncmVTUUwgY2x1c3RlcicsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6UkRTOjpEQkNsdXN0ZXInLCB7XG4gICAgICBFbmdpbmU6ICdhdXJvcmEtcG9zdGdyZXNxbCcsXG4gICAgICBEYXRhYmFzZU5hbWU6ICdhdXRoZW50aWsnLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdDb250YWlucyBSZWRpcyByZXBsaWNhdGlvbiBncm91cCcsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6RWxhc3RpQ2FjaGU6OlJlcGxpY2F0aW9uR3JvdXAnLCB7XG4gICAgICBFbmdpbmU6ICd2YWxrZXknLFxuICAgICAgUmVwbGljYXRpb25Hcm91cERlc2NyaXB0aW9uOiAnVmFsa2V5IChSZWRpcykgY2x1c3RlciBmb3IgQXV0aGVudGlrJyxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnQ29udGFpbnMgRUZTIGZpbGUgc3lzdGVtJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpFRlM6OkZpbGVTeXN0ZW0nLCB7XG4gICAgICBFbmNyeXB0ZWQ6IHRydWUsXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ0NvbnRhaW5zIEFwcGxpY2F0aW9uIExvYWQgQmFsYW5jZXInLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkVsYXN0aWNMb2FkQmFsYW5jaW5nVjI6OkxvYWRCYWxhbmNlcicsIHtcbiAgICAgIFR5cGU6ICdhcHBsaWNhdGlvbicsXG4gICAgICBTY2hlbWU6ICdpbnRlcm5ldC1mYWNpbmcnLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdDb250YWlucyBib3RoIEF1dGhlbnRpayBhbmQgTERBUCBFQ1MgVGFzayBEZWZpbml0aW9ucycsICgpID0+IHtcbiAgICAvLyBTaG91bGQgaGF2ZSAyIHRhc2sgZGVmaW5pdGlvbnMgLSBvbmUgZm9yIEF1dGhlbnRpaywgb25lIGZvciBMREFQXG4gICAgdGVtcGxhdGUucmVzb3VyY2VDb3VudElzKCdBV1M6OkVDUzo6VGFza0RlZmluaXRpb24nLCAyKTtcbiAgICBcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6RUNTOjpUYXNrRGVmaW5pdGlvbicsIHtcbiAgICAgIFJlcXVpcmVzQ29tcGF0aWJpbGl0aWVzOiBbJ0ZBUkdBVEUnXSxcbiAgICAgIE5ldHdvcmtNb2RlOiAnYXdzdnBjJyxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnQ29udGFpbnMgU2VjcmV0cyBNYW5hZ2VyIHNlY3JldHMnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlNlY3JldHNNYW5hZ2VyOjpTZWNyZXQnLCB7XG4gICAgICBEZXNjcmlwdGlvbjogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cCgnLipBdXRoZW50aWsuKicpLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdDb250YWlucyBzZWN1cml0eSBncm91cHMnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkVDMjo6U2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIEdyb3VwRGVzY3JpcHRpb246IE1hdGNoLmFueVZhbHVlKCksXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ0NvbnRhaW5zIElBTSByb2xlcyBmb3IgRUNTIHRhc2tzJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpJQU06OlJvbGUnLCB7XG4gICAgICBBc3N1bWVSb2xlUG9saWN5RG9jdW1lbnQ6IHtcbiAgICAgICAgU3RhdGVtZW50OiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgRWZmZWN0OiAnQWxsb3cnLFxuICAgICAgICAgICAgUHJpbmNpcGFsOiB7XG4gICAgICAgICAgICAgIFNlcnZpY2U6ICdlY3MtdGFza3MuYW1hem9uYXdzLmNvbScsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgQWN0aW9uOiAnc3RzOkFzc3VtZVJvbGUnLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdDb250YWlucyBDbG91ZFdhdGNoIGxvZyBncm91cCcsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6TG9nczo6TG9nR3JvdXAnLCB7XG4gICAgICBSZXRlbnRpb25JbkRheXM6IDcsXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ1N0YWNrIGhhcyByZXF1aXJlZCBwYXJhbWV0ZXJzJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1BhcmFtZXRlcignRW5hYmxlRXhlY3V0ZScsIHtcbiAgICAgIFR5cGU6ICdTdHJpbmcnLFxuICAgICAgQWxsb3dlZFZhbHVlczogWyd0cnVlJywgJ2ZhbHNlJ10sXG4gICAgICBEZWZhdWx0OiAnZmFsc2UnLFxuICAgIH0pO1xuXG4gICAgdGVtcGxhdGUuaGFzUGFyYW1ldGVyKCdBdXRoZW50aWtBZG1pblVzZXJFbWFpbCcsIHtcbiAgICAgIFR5cGU6ICdTdHJpbmcnLFxuICAgIH0pO1xuXG4gICAgdGVtcGxhdGUuaGFzUGFyYW1ldGVyKCdBdXRoZW50aWtMREFQQmFzZUROJywge1xuICAgICAgVHlwZTogJ1N0cmluZycsXG4gICAgICBEZWZhdWx0OiAnREM9ZXhhbXBsZSxEQz1jb20nLFxuICAgIH0pO1xuXG4gICAgdGVtcGxhdGUuaGFzUGFyYW1ldGVyKCdJcEFkZHJlc3NUeXBlJywge1xuICAgICAgVHlwZTogJ1N0cmluZycsXG4gICAgICBBbGxvd2VkVmFsdWVzOiBbJ2lwdjQnLCAnZHVhbHN0YWNrJ10sXG4gICAgICBEZWZhdWx0OiAnZHVhbHN0YWNrJyxcbiAgICB9KTtcblxuICAgIC8vIEdpdFNoYSBwYXJhbWV0ZXIgd2FzIHJlbW92ZWQgLSBub3cgdXNlZCBkaXJlY3RseSBmcm9tIGltcG9ydHNcbiAgICAvLyBTU0xDZXJ0aWZpY2F0ZUFSTiBwYXJhbWV0ZXIgd2FzIHJlbW92ZWQgLSBub3cgaW1wb3J0ZWQgZnJvbSBiYXNlIHN0YWNrXG4gICAgXG4gICAgdGVtcGxhdGUuaGFzUGFyYW1ldGVyKCdBdXRoZW50aWtBZG1pblVzZXJFbWFpbCcsIHtcbiAgICAgIFR5cGU6ICdTdHJpbmcnLFxuICAgICAgRGVzY3JpcHRpb246ICdFLU1haWwgYWRkcmVzcyBmb3IgdGhlIEF1dGhlbnRpayBha2FkbWluIHVzZXInLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdTdGFjayBoYXMgcmVxdWlyZWQgb3V0cHV0cycsICgpID0+IHtcbiAgICAvLyBDREsgZ2VuZXJhdGVzIHVuaXF1ZSBvdXRwdXQgbmFtZXMgd2l0aCBzdWZmaXhlc1xuICAgIGNvbnN0IHRlbXBsYXRlT2JqID0gdGVtcGxhdGUudG9KU09OKCk7XG4gICAgY29uc3Qgb3V0cHV0S2V5cyA9IE9iamVjdC5rZXlzKHRlbXBsYXRlT2JqLk91dHB1dHMgfHwge30pO1xuICAgIFxuICAgIC8vIENoZWNrIGZvciBBdXRoZW50aWsgVVJMIG91dHB1dCAobmFtZSBzdGFydHMgd2l0aCAnQXV0aGVudGlrJyBidXQgbWF5IGhhdmUgc3VmZml4KVxuICAgIGNvbnN0IGF1dGhlbnRpa091dHB1dCA9IG91dHB1dEtleXMuZmluZChrZXkgPT4ga2V5LnN0YXJ0c1dpdGgoJ0F1dGhlbnRpaycpICYmICFrZXkuaW5jbHVkZXMoJ0xEQVAnKSk7XG4gICAgZXhwZWN0KGF1dGhlbnRpa091dHB1dCkudG9CZURlZmluZWQoKTtcbiAgICBpZiAoYXV0aGVudGlrT3V0cHV0KSB7XG4gICAgICBleHBlY3QodGVtcGxhdGVPYmouT3V0cHV0c1thdXRoZW50aWtPdXRwdXRdKS50b01hdGNoT2JqZWN0KHtcbiAgICAgICAgRGVzY3JpcHRpb246ICdIVFRQKFMpIEFMQiBlbmRwb2ludCBmb3IgQ05BTUUnLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgZm9yIExEQVAgQmFzZSBETiBvdXRwdXQgKG5hbWUgc3RhcnRzIHdpdGggJ0F1dGhlbnRpaycgYW5kIGluY2x1ZGVzICdMREFQJylcbiAgICBjb25zdCBsZGFwQmFzZURuT3V0cHV0ID0gb3V0cHV0S2V5cy5maW5kKGtleSA9PiBrZXkuc3RhcnRzV2l0aCgnQXV0aGVudGlrJykgJiYga2V5LmluY2x1ZGVzKCdMREFQJykpO1xuICAgIGV4cGVjdChsZGFwQmFzZURuT3V0cHV0KS50b0JlRGVmaW5lZCgpO1xuICAgIGlmIChsZGFwQmFzZURuT3V0cHV0KSB7XG4gICAgICBleHBlY3QodGVtcGxhdGVPYmouT3V0cHV0c1tsZGFwQmFzZURuT3V0cHV0XSkudG9NYXRjaE9iamVjdCh7XG4gICAgICAgIERlc2NyaXB0aW9uOiAnTERBUCBCYXNlIEROJyxcbiAgICAgIH0pO1xuICAgIH1cbiAgfSk7XG5cbiAgdGVzdCgnU3RhY2sgaGFzIGNvbmRpdGlvbnMnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzQ29uZGl0aW9uKCdDcmVhdGVQcm9kUmVzb3VyY2VzJywge30pO1xuICB9KTtcbn0pO1xuIl19