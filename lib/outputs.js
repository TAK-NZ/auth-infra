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
exports.registerOutputs = registerOutputs;
/**
 * Centralized outputs management for the Auth Infrastructure stack
 */
const cdk = __importStar(require("aws-cdk-lib"));
function registerOutputs(params) {
    const { stack, stackName } = params;
    const outputs = [
        { key: 'DatabaseEndpoint', value: params.databaseEndpoint, description: 'RDS Aurora PostgreSQL cluster endpoint' },
        { key: 'DatabaseSecretArn', value: params.databaseSecretArn, description: 'RDS Aurora PostgreSQL master secret ARN' },
        { key: 'RedisEndpoint', value: params.redisEndpoint, description: 'ElastiCache Redis cluster endpoint' },
        { key: 'RedisAuthTokenArn', value: params.redisAuthTokenArn, description: 'ElastiCache Redis auth token secret ARN' },
        { key: 'EfsId', value: params.efsId, description: 'EFS file system ID' },
        { key: 'EfsMediaAccessPoint', value: params.efsMediaAccessPointId, description: 'EFS media access point ID' },
        { key: 'EfsTemplatesAccessPoint', value: params.efsTemplatesAccessPointId, description: 'EFS templates access point ID' },
        { key: 'AuthentikSecretKeyArn', value: params.authentikSecretKeyArn, description: 'Authentik secret key ARN' },
        { key: 'AuthentikAdminTokenArn', value: params.authentikAdminTokenArn, description: 'Authentik admin token ARN' },
        { key: 'AuthentikLdapTokenArn', value: params.authentikLdapTokenArn, description: 'Authentik LDAP token ARN' },
        { key: 'AuthentikAlbDns', value: params.authentikAlbDns, description: 'Authentik Application Load Balancer DNS name' },
        { key: 'AuthentikUrl', value: params.authentikUrl, description: 'Authentik application URL' },
        { key: 'LdapNlbDns', value: params.ldapNlbDns, description: 'LDAP Network Load Balancer DNS name' },
        { key: 'LdapEndpoint', value: params.ldapEndpoint, description: 'LDAP endpoint URL' },
        { key: 'LdapsEndpoint', value: params.ldapsEndpoint, description: 'LDAPS endpoint URL' },
        { key: 'LdapTokenRetrieverLambdaArn', value: params.ldapTokenRetrieverLambdaArn, description: 'ARN of the Lambda function that retrieves and updates LDAP tokens' },
    ];
    outputs.forEach(({ key, value, description }) => {
        new cdk.CfnOutput(stack, `${key}Output`, {
            value,
            description,
            exportName: `${stackName}-${key}`,
        });
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3V0cHV0cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm91dHB1dHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQTBCQSwwQ0E2QkM7QUF2REQ7O0dBRUc7QUFDSCxpREFBbUM7QUF1Qm5DLFNBQWdCLGVBQWUsQ0FBQyxNQUFvQjtJQUNsRCxNQUFNLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxHQUFHLE1BQU0sQ0FBQztJQUVwQyxNQUFNLE9BQU8sR0FBRztRQUNkLEVBQUUsR0FBRyxFQUFFLGtCQUFrQixFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsZ0JBQWdCLEVBQUUsV0FBVyxFQUFFLHdDQUF3QyxFQUFFO1FBQ2xILEVBQUUsR0FBRyxFQUFFLG1CQUFtQixFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsaUJBQWlCLEVBQUUsV0FBVyxFQUFFLHlDQUF5QyxFQUFFO1FBQ3JILEVBQUUsR0FBRyxFQUFFLGVBQWUsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLGFBQWEsRUFBRSxXQUFXLEVBQUUsb0NBQW9DLEVBQUU7UUFDeEcsRUFBRSxHQUFHLEVBQUUsbUJBQW1CLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRSxXQUFXLEVBQUUseUNBQXlDLEVBQUU7UUFDckgsRUFBRSxHQUFHLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsS0FBSyxFQUFFLFdBQVcsRUFBRSxvQkFBb0IsRUFBRTtRQUN4RSxFQUFFLEdBQUcsRUFBRSxxQkFBcUIsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLHFCQUFxQixFQUFFLFdBQVcsRUFBRSwyQkFBMkIsRUFBRTtRQUM3RyxFQUFFLEdBQUcsRUFBRSx5QkFBeUIsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLHlCQUF5QixFQUFFLFdBQVcsRUFBRSwrQkFBK0IsRUFBRTtRQUN6SCxFQUFFLEdBQUcsRUFBRSx1QkFBdUIsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLHFCQUFxQixFQUFFLFdBQVcsRUFBRSwwQkFBMEIsRUFBRTtRQUM5RyxFQUFFLEdBQUcsRUFBRSx3QkFBd0IsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLHNCQUFzQixFQUFFLFdBQVcsRUFBRSwyQkFBMkIsRUFBRTtRQUNqSCxFQUFFLEdBQUcsRUFBRSx1QkFBdUIsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLHFCQUFxQixFQUFFLFdBQVcsRUFBRSwwQkFBMEIsRUFBRTtRQUM5RyxFQUFFLEdBQUcsRUFBRSxpQkFBaUIsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLGVBQWUsRUFBRSxXQUFXLEVBQUUsOENBQThDLEVBQUU7UUFDdEgsRUFBRSxHQUFHLEVBQUUsY0FBYyxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsWUFBWSxFQUFFLFdBQVcsRUFBRSwyQkFBMkIsRUFBRTtRQUM3RixFQUFFLEdBQUcsRUFBRSxZQUFZLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxVQUFVLEVBQUUsV0FBVyxFQUFFLHFDQUFxQyxFQUFFO1FBQ25HLEVBQUUsR0FBRyxFQUFFLGNBQWMsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLFlBQVksRUFBRSxXQUFXLEVBQUUsbUJBQW1CLEVBQUU7UUFDckYsRUFBRSxHQUFHLEVBQUUsZUFBZSxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsYUFBYSxFQUFFLFdBQVcsRUFBRSxvQkFBb0IsRUFBRTtRQUN4RixFQUFFLEdBQUcsRUFBRSw2QkFBNkIsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLDJCQUEyQixFQUFFLFdBQVcsRUFBRSxtRUFBbUUsRUFBRTtLQUNwSyxDQUFDO0lBRUYsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsRUFBRSxFQUFFO1FBQzlDLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsR0FBRyxHQUFHLFFBQVEsRUFBRTtZQUN2QyxLQUFLO1lBQ0wsV0FBVztZQUNYLFVBQVUsRUFBRSxHQUFHLFNBQVMsSUFBSSxHQUFHLEVBQUU7U0FDbEMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBDZW50cmFsaXplZCBvdXRwdXRzIG1hbmFnZW1lbnQgZm9yIHRoZSBBdXRoIEluZnJhc3RydWN0dXJlIHN0YWNrXG4gKi9cbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgT3V0cHV0UGFyYW1zIHtcbiAgc3RhY2s6IGNkay5TdGFjaztcbiAgc3RhY2tOYW1lOiBzdHJpbmc7XG4gIGRhdGFiYXNlRW5kcG9pbnQ6IHN0cmluZztcbiAgZGF0YWJhc2VTZWNyZXRBcm46IHN0cmluZztcbiAgcmVkaXNFbmRwb2ludDogc3RyaW5nO1xuICByZWRpc0F1dGhUb2tlbkFybjogc3RyaW5nO1xuICBlZnNJZDogc3RyaW5nO1xuICBlZnNNZWRpYUFjY2Vzc1BvaW50SWQ6IHN0cmluZztcbiAgZWZzVGVtcGxhdGVzQWNjZXNzUG9pbnRJZDogc3RyaW5nO1xuICBhdXRoZW50aWtTZWNyZXRLZXlBcm46IHN0cmluZztcbiAgYXV0aGVudGlrQWRtaW5Ub2tlbkFybjogc3RyaW5nO1xuICBhdXRoZW50aWtMZGFwVG9rZW5Bcm46IHN0cmluZztcbiAgYXV0aGVudGlrQWxiRG5zOiBzdHJpbmc7XG4gIGF1dGhlbnRpa1VybDogc3RyaW5nO1xuICBsZGFwTmxiRG5zOiBzdHJpbmc7XG4gIGxkYXBFbmRwb2ludDogc3RyaW5nO1xuICBsZGFwc0VuZHBvaW50OiBzdHJpbmc7XG4gIGxkYXBUb2tlblJldHJpZXZlckxhbWJkYUFybjogc3RyaW5nO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJPdXRwdXRzKHBhcmFtczogT3V0cHV0UGFyYW1zKTogdm9pZCB7XG4gIGNvbnN0IHsgc3RhY2ssIHN0YWNrTmFtZSB9ID0gcGFyYW1zO1xuICBcbiAgY29uc3Qgb3V0cHV0cyA9IFtcbiAgICB7IGtleTogJ0RhdGFiYXNlRW5kcG9pbnQnLCB2YWx1ZTogcGFyYW1zLmRhdGFiYXNlRW5kcG9pbnQsIGRlc2NyaXB0aW9uOiAnUkRTIEF1cm9yYSBQb3N0Z3JlU1FMIGNsdXN0ZXIgZW5kcG9pbnQnIH0sXG4gICAgeyBrZXk6ICdEYXRhYmFzZVNlY3JldEFybicsIHZhbHVlOiBwYXJhbXMuZGF0YWJhc2VTZWNyZXRBcm4sIGRlc2NyaXB0aW9uOiAnUkRTIEF1cm9yYSBQb3N0Z3JlU1FMIG1hc3RlciBzZWNyZXQgQVJOJyB9LFxuICAgIHsga2V5OiAnUmVkaXNFbmRwb2ludCcsIHZhbHVlOiBwYXJhbXMucmVkaXNFbmRwb2ludCwgZGVzY3JpcHRpb246ICdFbGFzdGlDYWNoZSBSZWRpcyBjbHVzdGVyIGVuZHBvaW50JyB9LFxuICAgIHsga2V5OiAnUmVkaXNBdXRoVG9rZW5Bcm4nLCB2YWx1ZTogcGFyYW1zLnJlZGlzQXV0aFRva2VuQXJuLCBkZXNjcmlwdGlvbjogJ0VsYXN0aUNhY2hlIFJlZGlzIGF1dGggdG9rZW4gc2VjcmV0IEFSTicgfSxcbiAgICB7IGtleTogJ0Vmc0lkJywgdmFsdWU6IHBhcmFtcy5lZnNJZCwgZGVzY3JpcHRpb246ICdFRlMgZmlsZSBzeXN0ZW0gSUQnIH0sXG4gICAgeyBrZXk6ICdFZnNNZWRpYUFjY2Vzc1BvaW50JywgdmFsdWU6IHBhcmFtcy5lZnNNZWRpYUFjY2Vzc1BvaW50SWQsIGRlc2NyaXB0aW9uOiAnRUZTIG1lZGlhIGFjY2VzcyBwb2ludCBJRCcgfSxcbiAgICB7IGtleTogJ0Vmc1RlbXBsYXRlc0FjY2Vzc1BvaW50JywgdmFsdWU6IHBhcmFtcy5lZnNUZW1wbGF0ZXNBY2Nlc3NQb2ludElkLCBkZXNjcmlwdGlvbjogJ0VGUyB0ZW1wbGF0ZXMgYWNjZXNzIHBvaW50IElEJyB9LFxuICAgIHsga2V5OiAnQXV0aGVudGlrU2VjcmV0S2V5QXJuJywgdmFsdWU6IHBhcmFtcy5hdXRoZW50aWtTZWNyZXRLZXlBcm4sIGRlc2NyaXB0aW9uOiAnQXV0aGVudGlrIHNlY3JldCBrZXkgQVJOJyB9LFxuICAgIHsga2V5OiAnQXV0aGVudGlrQWRtaW5Ub2tlbkFybicsIHZhbHVlOiBwYXJhbXMuYXV0aGVudGlrQWRtaW5Ub2tlbkFybiwgZGVzY3JpcHRpb246ICdBdXRoZW50aWsgYWRtaW4gdG9rZW4gQVJOJyB9LFxuICAgIHsga2V5OiAnQXV0aGVudGlrTGRhcFRva2VuQXJuJywgdmFsdWU6IHBhcmFtcy5hdXRoZW50aWtMZGFwVG9rZW5Bcm4sIGRlc2NyaXB0aW9uOiAnQXV0aGVudGlrIExEQVAgdG9rZW4gQVJOJyB9LFxuICAgIHsga2V5OiAnQXV0aGVudGlrQWxiRG5zJywgdmFsdWU6IHBhcmFtcy5hdXRoZW50aWtBbGJEbnMsIGRlc2NyaXB0aW9uOiAnQXV0aGVudGlrIEFwcGxpY2F0aW9uIExvYWQgQmFsYW5jZXIgRE5TIG5hbWUnIH0sXG4gICAgeyBrZXk6ICdBdXRoZW50aWtVcmwnLCB2YWx1ZTogcGFyYW1zLmF1dGhlbnRpa1VybCwgZGVzY3JpcHRpb246ICdBdXRoZW50aWsgYXBwbGljYXRpb24gVVJMJyB9LFxuICAgIHsga2V5OiAnTGRhcE5sYkRucycsIHZhbHVlOiBwYXJhbXMubGRhcE5sYkRucywgZGVzY3JpcHRpb246ICdMREFQIE5ldHdvcmsgTG9hZCBCYWxhbmNlciBETlMgbmFtZScgfSxcbiAgICB7IGtleTogJ0xkYXBFbmRwb2ludCcsIHZhbHVlOiBwYXJhbXMubGRhcEVuZHBvaW50LCBkZXNjcmlwdGlvbjogJ0xEQVAgZW5kcG9pbnQgVVJMJyB9LFxuICAgIHsga2V5OiAnTGRhcHNFbmRwb2ludCcsIHZhbHVlOiBwYXJhbXMubGRhcHNFbmRwb2ludCwgZGVzY3JpcHRpb246ICdMREFQUyBlbmRwb2ludCBVUkwnIH0sXG4gICAgeyBrZXk6ICdMZGFwVG9rZW5SZXRyaWV2ZXJMYW1iZGFBcm4nLCB2YWx1ZTogcGFyYW1zLmxkYXBUb2tlblJldHJpZXZlckxhbWJkYUFybiwgZGVzY3JpcHRpb246ICdBUk4gb2YgdGhlIExhbWJkYSBmdW5jdGlvbiB0aGF0IHJldHJpZXZlcyBhbmQgdXBkYXRlcyBMREFQIHRva2VucycgfSxcbiAgXTtcblxuICBvdXRwdXRzLmZvckVhY2goKHsga2V5LCB2YWx1ZSwgZGVzY3JpcHRpb24gfSkgPT4ge1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHN0YWNrLCBgJHtrZXl9T3V0cHV0YCwge1xuICAgICAgdmFsdWUsXG4gICAgICBkZXNjcmlwdGlvbixcbiAgICAgIGV4cG9ydE5hbWU6IGAke3N0YWNrTmFtZX0tJHtrZXl9YCxcbiAgICB9KTtcbiAgfSk7XG59XG4iXX0=