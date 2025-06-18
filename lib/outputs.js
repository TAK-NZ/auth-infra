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
const aws_cdk_lib_1 = require("aws-cdk-lib");
const cloudformation_exports_1 = require("./cloudformation-exports");
/**
 * Register all outputs for the Auth Infrastructure stack
 */
function registerOutputs({ stack, stackName, databaseEndpoint, databaseSecretArn, redisEndpoint, redisAuthTokenArn, efsId, efsMediaAccessPointId, efsTemplatesAccessPointId, authentikSecretKeyArn, authentikAdminTokenArn, authentikLdapTokenArn, authentikAlbDns, authentikUrl, ldapNlbDns, ldapEndpoint, ldapsEndpoint, ldapTokenRetrieverLambdaArn }) {
    new cdk.CfnOutput(stack, 'DatabaseEndpointOutput', {
        description: 'RDS Aurora PostgreSQL cluster endpoint',
        value: databaseEndpoint,
        exportName: aws_cdk_lib_1.Fn.sub((0, cloudformation_exports_1.createDynamicExportName)(cloudformation_exports_1.AUTH_EXPORT_NAMES.DATABASE_ENDPOINT), {
            StackName: stackName,
        }),
    });
    new cdk.CfnOutput(stack, 'DatabaseSecretArnOutput', {
        description: 'RDS Aurora PostgreSQL master secret ARN',
        value: databaseSecretArn,
        exportName: aws_cdk_lib_1.Fn.sub((0, cloudformation_exports_1.createDynamicExportName)(cloudformation_exports_1.AUTH_EXPORT_NAMES.DATABASE_SECRET_ARN), {
            StackName: stackName,
        }),
    });
    new cdk.CfnOutput(stack, 'RedisEndpointOutput', {
        description: 'ElastiCache Redis cluster endpoint',
        value: redisEndpoint,
        exportName: aws_cdk_lib_1.Fn.sub((0, cloudformation_exports_1.createDynamicExportName)(cloudformation_exports_1.AUTH_EXPORT_NAMES.REDIS_ENDPOINT), {
            StackName: stackName,
        }),
    });
    new cdk.CfnOutput(stack, 'RedisAuthTokenArnOutput', {
        description: 'ElastiCache Redis auth token secret ARN',
        value: redisAuthTokenArn,
        exportName: aws_cdk_lib_1.Fn.sub((0, cloudformation_exports_1.createDynamicExportName)(cloudformation_exports_1.AUTH_EXPORT_NAMES.REDIS_AUTH_TOKEN_ARN), {
            StackName: stackName,
        }),
    });
    new cdk.CfnOutput(stack, 'EfsIdOutput', {
        description: 'EFS file system ID',
        value: efsId,
        exportName: aws_cdk_lib_1.Fn.sub((0, cloudformation_exports_1.createDynamicExportName)(cloudformation_exports_1.AUTH_EXPORT_NAMES.EFS_ID), {
            StackName: stackName,
        }),
    });
    new cdk.CfnOutput(stack, 'EfsMediaAccessPointOutput', {
        description: 'EFS media access point ID',
        value: efsMediaAccessPointId,
        exportName: aws_cdk_lib_1.Fn.sub((0, cloudformation_exports_1.createDynamicExportName)(cloudformation_exports_1.AUTH_EXPORT_NAMES.EFS_MEDIA_ACCESS_POINT), {
            StackName: stackName,
        }),
    });
    new cdk.CfnOutput(stack, 'EfsTemplatesAccessPointOutput', {
        description: 'EFS templates access point ID',
        value: efsTemplatesAccessPointId,
        exportName: aws_cdk_lib_1.Fn.sub((0, cloudformation_exports_1.createDynamicExportName)(cloudformation_exports_1.AUTH_EXPORT_NAMES.EFS_TEMPLATES_ACCESS_POINT), {
            StackName: stackName,
        }),
    });
    new cdk.CfnOutput(stack, 'AuthentikSecretKeyArnOutput', {
        description: 'Authentik secret key ARN',
        value: authentikSecretKeyArn,
        exportName: aws_cdk_lib_1.Fn.sub((0, cloudformation_exports_1.createDynamicExportName)(cloudformation_exports_1.AUTH_EXPORT_NAMES.AUTHENTIK_SECRET_KEY_ARN), {
            StackName: stackName,
        }),
    });
    new cdk.CfnOutput(stack, 'AuthentikAdminTokenArnOutput', {
        description: 'Authentik admin token ARN',
        value: authentikAdminTokenArn,
        exportName: aws_cdk_lib_1.Fn.sub((0, cloudformation_exports_1.createDynamicExportName)(cloudformation_exports_1.AUTH_EXPORT_NAMES.AUTHENTIK_ADMIN_TOKEN_ARN), {
            StackName: stackName,
        }),
    });
    new cdk.CfnOutput(stack, 'AuthentikLdapTokenArnOutput', {
        description: 'Authentik LDAP token ARN',
        value: authentikLdapTokenArn,
        exportName: aws_cdk_lib_1.Fn.sub((0, cloudformation_exports_1.createDynamicExportName)(cloudformation_exports_1.AUTH_EXPORT_NAMES.AUTHENTIK_LDAP_TOKEN_ARN), {
            StackName: stackName,
        }),
    });
    new cdk.CfnOutput(stack, 'AuthentikAlbDnsOutput', {
        description: 'Authentik Application Load Balancer DNS name',
        value: authentikAlbDns,
        exportName: aws_cdk_lib_1.Fn.sub((0, cloudformation_exports_1.createDynamicExportName)(cloudformation_exports_1.AUTH_EXPORT_NAMES.AUTHENTIK_ALB_DNS), {
            StackName: stackName,
        }),
    });
    new cdk.CfnOutput(stack, 'AuthentikUrlOutput', {
        description: 'Authentik application URL',
        value: authentikUrl,
        exportName: aws_cdk_lib_1.Fn.sub((0, cloudformation_exports_1.createDynamicExportName)(cloudformation_exports_1.AUTH_EXPORT_NAMES.AUTHENTIK_URL), {
            StackName: stackName,
        }),
    });
    // LDAP outputs
    new cdk.CfnOutput(stack, 'LdapNlbDnsOutput', {
        description: 'LDAP Network Load Balancer DNS name',
        value: ldapNlbDns,
        exportName: aws_cdk_lib_1.Fn.sub((0, cloudformation_exports_1.createDynamicExportName)(cloudformation_exports_1.AUTH_EXPORT_NAMES.LDAP_NLB_DNS), {
            StackName: stackName,
        }),
    });
    new cdk.CfnOutput(stack, 'LdapEndpointOutput', {
        description: 'LDAP endpoint URL',
        value: ldapEndpoint,
        exportName: aws_cdk_lib_1.Fn.sub((0, cloudformation_exports_1.createDynamicExportName)(cloudformation_exports_1.AUTH_EXPORT_NAMES.LDAP_ENDPOINT), {
            StackName: stackName,
        }),
    });
    new cdk.CfnOutput(stack, 'LdapsEndpointOutput', {
        description: 'LDAPS endpoint URL',
        value: ldapsEndpoint,
        exportName: aws_cdk_lib_1.Fn.sub((0, cloudformation_exports_1.createDynamicExportName)(cloudformation_exports_1.AUTH_EXPORT_NAMES.LDAPS_ENDPOINT), {
            StackName: stackName,
        }),
    });
    new cdk.CfnOutput(stack, 'LdapTokenRetrieverLambdaArnOutput', {
        description: 'ARN of the Lambda function that retrieves and updates LDAP tokens',
        value: ldapTokenRetrieverLambdaArn,
        exportName: aws_cdk_lib_1.Fn.sub((0, cloudformation_exports_1.createDynamicExportName)(cloudformation_exports_1.AUTH_EXPORT_NAMES.LDAP_TOKEN_RETRIEVER_LAMBDA_ARN), {
            StackName: stackName,
        }),
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3V0cHV0cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm91dHB1dHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQStCQSwwQ0FxSkM7QUFwTEQ7O0dBRUc7QUFDSCxpREFBbUM7QUFDbkMsNkNBQWlDO0FBQ2pDLHFFQUFzRjtBQXVCdEY7O0dBRUc7QUFDSCxTQUFnQixlQUFlLENBQUMsRUFDOUIsS0FBSyxFQUNMLFNBQVMsRUFDVCxnQkFBZ0IsRUFDaEIsaUJBQWlCLEVBQ2pCLGFBQWEsRUFDYixpQkFBaUIsRUFDakIsS0FBSyxFQUNMLHFCQUFxQixFQUNyQix5QkFBeUIsRUFDekIscUJBQXFCLEVBQ3JCLHNCQUFzQixFQUN0QixxQkFBcUIsRUFDckIsZUFBZSxFQUNmLFlBQVksRUFDWixVQUFVLEVBQ1YsWUFBWSxFQUNaLGFBQWEsRUFDYiwyQkFBMkIsRUFDZDtJQUViLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsd0JBQXdCLEVBQUU7UUFDakQsV0FBVyxFQUFFLHdDQUF3QztRQUNyRCxLQUFLLEVBQUUsZ0JBQWdCO1FBQ3ZCLFVBQVUsRUFBRSxnQkFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFBLGdEQUF1QixFQUFDLDBDQUFpQixDQUFDLGlCQUFpQixDQUFDLEVBQUU7WUFDL0UsU0FBUyxFQUFFLFNBQVM7U0FDckIsQ0FBQztLQUNILENBQUMsQ0FBQztJQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUseUJBQXlCLEVBQUU7UUFDbEQsV0FBVyxFQUFFLHlDQUF5QztRQUN0RCxLQUFLLEVBQUUsaUJBQWlCO1FBQ3hCLFVBQVUsRUFBRSxnQkFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFBLGdEQUF1QixFQUFDLDBDQUFpQixDQUFDLG1CQUFtQixDQUFDLEVBQUU7WUFDakYsU0FBUyxFQUFFLFNBQVM7U0FDckIsQ0FBQztLQUNILENBQUMsQ0FBQztJQUVILElBQUksR0FB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QUMsQ0FBQztJQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUscUJBQXFCLEVBQUU7UUFDOUMsV0FBVyxFQUFFLG9CQUFvQjtRQUNqQyxLQUFLLEVBQUUsYUFBYTtRQUNwQixVQUFVLEVBQUUsZ0JBQUUsQ0FBQyxHQUFHLENBQUMsSUFBQSxnREFBdUIsRUFBQywwQ0FBaUIsQ0FBQyxjQUFjLENBQUMsRUFBRTtZQUM1RSxTQUFTLEVBQUUsU0FBUztTQUNyQixDQUFDO0tBQ0gsQ0FBQyxDQUFDO0lBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxtQ0FBbUMsRUFBRTtRQUM1RCxXQUFXLEVBQUUsbUVBQW1FO1FBQ2hGLEtBQUssRUFBRSwyQkFBMkI7UUFDbEMsVUFBVSxFQUFFLGdCQUFFLENBQUMsR0FBRyxDQUFDLElBQUEsZ0RBQXVCLEVBQUMsMENBQWlCLENBQUMsK0JBQStCLENBQUMsRUFBRTtZQUM3RixTQUFTLEVBQUUsU0FBUztTQUNyQixDQUFDO0tBQ0gsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQ2VudHJhbGl6ZWQgb3V0cHV0cyBtYW5hZ2VtZW50IGZvciB0aGUgQXV0aCBJbmZyYXN0cnVjdHVyZSBzdGFja1xuICovXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgRm4gfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBjcmVhdGVEeW5hbWljRXhwb3J0TmFtZSwgQVVUSF9FWFBPUlRfTkFNRVMgfSBmcm9tICcuL2Nsb3VkZm9ybWF0aW9uLWV4cG9ydHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIE91dHB1dFBhcmFtcyB7XG4gIHN0YWNrOiBjZGsuU3RhY2s7XG4gIHN0YWNrTmFtZTogc3RyaW5nO1xuICBkYXRhYmFzZUVuZHBvaW50OiBzdHJpbmc7XG4gIGRhdGFiYXNlU2VjcmV0QXJuOiBzdHJpbmc7XG4gIHJlZGlzRW5kcG9pbnQ6IHN0cmluZztcbiAgcmVkaXNBdXRoVG9rZW5Bcm46IHN0cmluZztcbiAgZWZzSWQ6IHN0cmluZztcbiAgZWZzTWVkaWFBY2Nlc3NQb2ludElkOiBzdHJpbmc7XG4gIGVmc1RlbXBsYXRlc0FjY2Vzc1BvaW50SWQ6IHN0cmluZztcbiAgYXV0aGVudGlrU2VjcmV0S2V5QXJuOiBzdHJpbmc7XG4gIGF1dGhlbnRpa0FkbWluVG9rZW5Bcm46IHN0cmluZztcbiAgYXV0aGVudGlrTGRhcFRva2VuQXJuOiBzdHJpbmc7XG4gIGF1dGhlbnRpa0FsYkRuczogc3RyaW5nO1xuICBhdXRoZW50aWtVcmw6IHN0cmluZztcbiAgbGRhcE5sYkRuczogc3RyaW5nO1xuICBsZGFwRW5kcG9pbnQ6IHN0cmluZztcbiAgbGRhcHNFbmRwb2ludDogc3RyaW5nO1xuICBsZGFwVG9rZW5SZXRyaWV2ZXJMYW1iZGFBcm46IHN0cmluZztcbn1cblxuLyoqXG4gKiBSZWdpc3RlciBhbGwgb3V0cHV0cyBmb3IgdGhlIEF1dGggSW5mcmFzdHJ1Y3R1cmUgc3RhY2tcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyT3V0cHV0cyh7XG4gIHN0YWNrLFxuICBzdGFja05hbWUsXG4gIGRhdGFiYXNlRW5kcG9pbnQsXG4gIGRhdGFiYXNlU2VjcmV0QXJuLFxuICByZWRpc0VuZHBvaW50LFxuICByZWRpc0F1dGhUb2tlbkFybixcbiAgZWZzSWQsXG4gIGVmc01lZGlhQWNjZXNzUG9pbnRJZCxcbiAgZWZzVGVtcGxhdGVzQWNjZXNzUG9pbnRJZCxcbiAgYXV0aGVudGlrU2VjcmV0S2V5QXJuLFxuICBhdXRoZW50aWtBZG1pblRva2VuQXJuLFxuICBhdXRoZW50aWtMZGFwVG9rZW5Bcm4sXG4gIGF1dGhlbnRpa0FsYkRucyxcbiAgYXV0aGVudGlrVXJsLFxuICBsZGFwTmxiRG5zLFxuICBsZGFwRW5kcG9pbnQsXG4gIGxkYXBzRW5kcG9pbnQsXG4gIGxkYXBUb2tlblJldHJpZXZlckxhbWJkYUFyblxufTogT3V0cHV0UGFyYW1zKSB7XG4gIFxuICBuZXcgY2RrLkNmbk91dHB1dChzdGFjaywgJ0RhdGFiYXNlRW5kcG9pbnRPdXRwdXQnLCB7XG4gICAgZGVzY3JpcHRpb246ICdSRFMgQXVyb3JhIFBvc3RncmVTUUwgY2x1c3RlciBlbmRwb2ludCcsXG4gICAgdmFsdWU6IGRhdGFiYXNlRW5kcG9pbnQsXG4gICAgZXhwb3J0TmFtZTogRm4uc3ViKGNyZWF0ZUR5bmFtaWNFeHBvcnROYW1lKEFVVEhfRVhQT1JUX05BTUVTLkRBVEFCQVNFX0VORFBPSU5UKSwge1xuICAgICAgU3RhY2tOYW1lOiBzdGFja05hbWUsXG4gICAgfSksXG4gIH0pO1xuXG4gIG5ldyBjZGsuQ2ZuT3V0cHV0KHN0YWNrLCAnRGF0YWJhc2VTZWNyZXRBcm5PdXRwdXQnLCB7XG4gICAgZGVzY3JpcHRpb246ICdSRFMgQXVyb3JhIFBvc3RncmVTUUwgbWFzdGVyIHNlY3JldCBBUk4nLFxuICAgIHZhbHVlOiBkYXRhYmFzZVNlY3JldEFybixcbiAgICBleHBvcnROYW1lOiBGbi5zdWIoY3JlYXRlRHluYW1pY0V4cG9ydE5hbWUoQVVUSF9FWFBPUlRfTkFNRVMuREFUQUJBU0VfU0VDUkVUX0FSTiksIHtcbiAgICAgIFN0YWNrTmFtZTogc3RhY2tOYW1lLFxuICAgIH0pLFxuICB9KTtcblxuICBuZXcgY2RrLkNmbk91dHB1dChzdGFjaywgJ1JlZGlzRW5kcG9pbnRPdXRwdXQnLCB7XG4gICAgZGVzY3JpcHRpb246ICdFbGFzdGlDYWNoZSBSZWRpcyBjbHVzdGVyIGVuZHBvaW50JyxcbiAgICB2YWx1ZTogcmVkaXNFbmRwb2ludCxcbiAgICBleHBvcnROYW1lOiBGbi5zdWIoY3JlYXRlRHluYW1pY0V4cG9ydE5hbWUoQVVUSF9FWFBPUlRfTkFNRVMuUkVESVNfRU5EUE9JTlQpLCB7XG4gICAgICBTdGFja05hbWU6IHN0YWNrTmFtZSxcbiAgICB9KSxcbiAgfSk7XG5cbiAgbmV3IGNkay5DZm5PdXRwdXQoc3RhY2ssICdSZWRpc0F1dGhUb2tlbkFybk91dHB1dCcsIHtcbiAgICBkZXNjcmlwdGlvbjogJ0VsYXN0aUNhY2hlIFJlZGlzIGF1dGggdG9rZW4gc2VjcmV0IEFSTicsXG4gICAgdmFsdWU6IHJlZGlzQXV0aFRva2VuQXJuLFxuICAgIGV4cG9ydE5hbWU6IEZuLnN1YihjcmVhdGVEeW5hbWljRXhwb3J0TmFtZShBVVRIX0VYUE9SVF9OQU1FUy5SRURJU19BVVRIX1RPS0VOX0FSTiksIHtcbiAgICAgIFN0YWNrTmFtZTogc3RhY2tOYW1lLFxuICAgIH0pLFxuICB9KTtcblxuICBuZXcgY2RrLkNmbk91dHB1dChzdGFjaywgJ0Vmc0lkT3V0cHV0Jywge1xuICAgIGRlc2NyaXB0aW9uOiAnRUZTIGZpbGUgc3lzdGVtIElEJyxcbiAgICB2YWx1ZTogZWZzSWQsXG4gICAgZXhwb3J0TmFtZTogRm4uc3ViKGNyZWF0ZUR5bmFtaWNFeHBvcnROYW1lKEFVVEhfRVhQT1JUX05BTUVTLkVGU19JRCksIHtcbiAgICAgIFN0YWNrTmFtZTogc3RhY2tOYW1lLFxuICAgIH0pLFxuICB9KTtcblxuICBuZXcgY2RrLkNmbk91dHB1dChzdGFjaywgJ0Vmc01lZGlhQWNjZXNzUG9pbnRPdXRwdXQnLCB7XG4gICAgZGVzY3JpcHRpb246ICdFRlMgbWVkaWEgYWNjZXNzIHBvaW50IElEJyxcbiAgICB2YWx1ZTogZWZzTWVkaWFBY2Nlc3NQb2ludElkLFxuICAgIGV4cG9ydE5hbWU6IEZuLnN1YihjcmVhdGVEeW5hbWljRXhwb3J0TmFtZShBVVRIX0VYUE9SVF9OQU1FUy5FRlNfTUVESUFfQUNDRVNTX1BPSU5UKSwge1xuICAgICAgU3RhY2tOYW1lOiBzdGFja05hbWUsXG4gICAgfSksXG4gIH0pO1xuXG4gIG5ldyBjZGsuQ2ZuT3V0cHV0KHN0YWNrLCAnRWZzVGVtcGxhdGVzQWNjZXNzUG9pbnRPdXRwdXQnLCB7XG4gICAgZGVzY3JpcHRpb246ICdFRlMgdGVtcGxhdGVzIGFjY2VzcyBwb2ludCBJRCcsXG4gICAgdmFsdWU6IGVmc1RlbXBsYXRlc0FjY2Vzc1BvaW50SWQsXG4gICAgZXhwb3J0TmFtZTogRm4uc3ViKGNyZWF0ZUR5bmFtaWNFeHBvcnROYW1lKEFVVEhfRVhQT1JUX05BTUVTLkVGU19URU1QTEFURVNfQUNDRVNTX1BPSU5UKSwge1xuICAgICAgU3RhY2tOYW1lOiBzdGFja05hbWUsXG4gICAgfSksXG4gIH0pO1xuXG4gIG5ldyBjZGsuQ2ZuT3V0cHV0KHN0YWNrLCAnQXV0aGVudGlrU2VjcmV0S2V5QXJuT3V0cHV0Jywge1xuICAgIGRlc2NyaXB0aW9uOiAnQXV0aGVudGlrIHNlY3JldCBrZXkgQVJOJyxcbiAgICB2YWx1ZTogYXV0aGVudGlrU2VjcmV0S2V5QXJuLFxuICAgIGV4cG9ydE5hbWU6IEZuLnN1YihjcmVhdGVEeW5hbWljRXhwb3J0TmFtZShBVVRIX0VYUE9SVF9OQU1FUy5BVVRIRU5USUtfU0VDUkVUX0tFWV9BUk4pLCB7XG4gICAgICBTdGFja05hbWU6IHN0YWNrTmFtZSxcbiAgICB9KSxcbiAgfSk7XG5cbiAgbmV3IGNkay5DZm5PdXRwdXQoc3RhY2ssICdBdXRoZW50aWtBZG1pblRva2VuQXJuT3V0cHV0Jywge1xuICAgIGRlc2NyaXB0aW9uOiAnQXV0aGVudGlrIGFkbWluIHRva2VuIEFSTicsXG4gICAgdmFsdWU6IGF1dGhlbnRpa0FkbWluVG9rZW5Bcm4sXG4gICAgZXhwb3J0TmFtZTogRm4uc3ViKGNyZWF0ZUR5bmFtaWNFeHBvcnROYW1lKEFVVEhfRVhQT1JUX05BTUVTLkFVVEhFTlRJS19BRE1JTl9UT0tFTl9BUk4pLCB7XG4gICAgICBTdGFja05hbWU6IHN0YWNrTmFtZSxcbiAgICB9KSxcbiAgfSk7XG5cbiAgbmV3IGNkay5DZm5PdXRwdXQoc3RhY2ssICdBdXRoZW50aWtMZGFwVG9rZW5Bcm5PdXRwdXQnLCB7XG4gICAgZGVzY3JpcHRpb246ICdBdXRoZW50aWsgTERBUCB0b2tlbiBBUk4nLFxuICAgIHZhbHVlOiBhdXRoZW50aWtMZGFwVG9rZW5Bcm4sXG4gICAgZXhwb3J0TmFtZTogRm4uc3ViKGNyZWF0ZUR5bmFtaWNFeHBvcnROYW1lKEFVVEhfRVhQT1JUX05BTUVTLkFVVEhFTlRJS19MREFQX1RPS0VOX0FSTiksIHtcbiAgICAgIFN0YWNrTmFtZTogc3RhY2tOYW1lLFxuICAgIH0pLFxuICB9KTtcblxuICBuZXcgY2RrLkNmbk91dHB1dChzdGFjaywgJ0F1dGhlbnRpa0FsYkRuc091dHB1dCcsIHtcbiAgICBkZXNjcmlwdGlvbjogJ0F1dGhlbnRpayBBcHBsaWNhdGlvbiBMb2FkIEJhbGFuY2VyIEROUyBuYW1lJyxcbiAgICB2YWx1ZTogYXV0aGVudGlrQWxiRG5zLFxuICAgIGV4cG9ydE5hbWU6IEZuLnN1YihjcmVhdGVEeW5hbWljRXhwb3J0TmFtZShBVVRIX0VYUE9SVF9OQU1FUy5BVVRIRU5USUtfQUxCX0ROUyksIHtcbiAgICAgIFN0YWNrTmFtZTogc3RhY2tOYW1lLFxuICAgIH0pLFxuICB9KTtcblxuICBuZXcgY2RrLkNmbk91dHB1dChzdGFjaywgJ0F1dGhlbnRpa1VybE91dHB1dCcsIHtcbiAgICBkZXNjcmlwdGlvbjogJ0F1dGhlbnRpayBhcHBsaWNhdGlvbiBVUkwnLFxuICAgIHZhbHVlOiBhdXRoZW50aWtVcmwsXG4gICAgZXhwb3J0TmFtZTogRm4uc3ViKGNyZWF0ZUR5bmFtaWNFeHBvcnROYW1lKEFVVEhfRVhQT1JUX05BTUVTLkFVVEhFTlRJS19VUkwpLCB7XG4gICAgICBTdGFja05hbWU6IHN0YWNrTmFtZSxcbiAgICB9KSxcbiAgfSk7XG5cbiAgLy8gTERBUCBvdXRwdXRzXG4gIG5ldyBjZGsuQ2ZuT3V0cHV0KHN0YWNrLCAnTGRhcE5sYkRuc091dHB1dCcsIHtcbiAgICBkZXNjcmlwdGlvbjogJ0xEQVAgTmV0d29yayBMb2FkIEJhbGFuY2VyIEROUyBuYW1lJyxcbiAgICB2YWx1ZTogbGRhcE5sYkRucyxcbiAgICBleHBvcnROYW1lOiBGbi5zdWIoY3JlYXRlRHluYW1pY0V4cG9ydE5hbWUoQVVUSF9FWFBPUlRfTkFNRVMuTERBUF9OTEJfRE5TKSwge1xuICAgICAgU3RhY2tOYW1lOiBzdGFja05hbWUsXG4gICAgfSksXG4gIH0pO1xuXG4gIG5ldyBjZGsuQ2ZuT3V0cHV0KHN0YWNrLCAnTGRhcEVuZHBvaW50T3V0cHV0Jywge1xuICAgIGRlc2NyaXB0aW9uOiAnTERBUCBlbmRwb2ludCBVUkwnLFxuICAgIHZhbHVlOiBsZGFwRW5kcG9pbnQsXG4gICAgZXhwb3J0TmFtZTogRm4uc3ViKGNyZWF0ZUR5bmFtaWNFeHBvcnROYW1lKEFVVEhfRVhQT1JUX05BTUVTLkxEQVBfRU5EUE9JTlQpLCB7XG4gICAgICBTdGFja05hbWU6IHN0YWNrTmFtZSxcbiAgICB9KSxcbiAgfSk7XG5cbiAgbmV3IGNkay5DZm5PdXRwdXQoc3RhY2ssICdMZGFwc0VuZHBvaW50T3V0cHV0Jywge1xuICAgIGRlc2NyaXB0aW9uOiAnTERBUFMgZW5kcG9pbnQgVVJMJyxcbiAgICB2YWx1ZTogbGRhcHNFbmRwb2ludCxcbiAgICBleHBvcnROYW1lOiBGbi5zdWIoY3JlYXRlRHluYW1pY0V4cG9ydE5hbWUoQVVUSF9FWFBPUlRfTkFNRVMuTERBUFNfRU5EUE9JTlQpLCB7XG4gICAgICBTdGFja05hbWU6IHN0YWNrTmFtZSxcbiAgICB9KSxcbiAgfSk7XG5cbiAgbmV3IGNkay5DZm5PdXRwdXQoc3RhY2ssICdMZGFwVG9rZW5SZXRyaWV2ZXJMYW1iZGFBcm5PdXRwdXQnLCB7XG4gICAgZGVzY3JpcHRpb246ICdBUk4gb2YgdGhlIExhbWJkYSBmdW5jdGlvbiB0aGF0IHJldHJpZXZlcyBhbmQgdXBkYXRlcyBMREFQIHRva2VucycsXG4gICAgdmFsdWU6IGxkYXBUb2tlblJldHJpZXZlckxhbWJkYUFybixcbiAgICBleHBvcnROYW1lOiBGbi5zdWIoY3JlYXRlRHluYW1pY0V4cG9ydE5hbWUoQVVUSF9FWFBPUlRfTkFNRVMuTERBUF9UT0tFTl9SRVRSSUVWRVJfTEFNQkRBX0FSTiksIHtcbiAgICAgIFN0YWNrTmFtZTogc3RhY2tOYW1lLFxuICAgIH0pLFxuICB9KTtcbn1cbiJdfQ==