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
function registerOutputs({ stack, stackName, databaseEndpoint, databaseSecretArn, redisEndpoint, redisAuthTokenArn, efsId, efsMediaAccessPointId, efsTemplatesAccessPointId, authentikSecretKeyArn, authentikAdminTokenArn, authentikLdapTokenArn, authentikAlbDns, authentikUrl, ldapNlbDns, ldapTokenRetrieverLambdaArn }) {
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
    new cdk.CfnOutput(stack, 'LdapTokenRetrieverLambdaArnOutput', {
        description: 'ARN of the Lambda function that retrieves and updates LDAP tokens',
        value: ldapTokenRetrieverLambdaArn,
        exportName: aws_cdk_lib_1.Fn.sub((0, cloudformation_exports_1.createDynamicExportName)(cloudformation_exports_1.AUTH_EXPORT_NAMES.LDAP_TOKEN_RETRIEVER_LAMBDA_ARN), {
            StackName: stackName,
        }),
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3V0cHV0cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm91dHB1dHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQTZCQSwwQ0FtSUM7QUFoS0Q7O0dBRUc7QUFDSCxpREFBbUM7QUFDbkMsNkNBQWlDO0FBQ2pDLHFFQUFzRjtBQXFCdEY7O0dBRUc7QUFDSCxTQUFnQixlQUFlLENBQUMsRUFDOUIsS0FBSyxFQUNMLFNBQVMsRUFDVCxnQkFBZ0IsRUFDaEIsaUJBQWlCLEVBQ2pCLGFBQWEsRUFDYixpQkFBaUIsRUFDakIsS0FBSyxFQUNMLHFCQUFxQixFQUNyQix5QkFBeUIsRUFDekIscUJBQXFCLEVBQ3JCLHNCQUFzQixFQUN0QixxQkFBcUIsRUFDckIsZUFBZSxFQUNmLFlBQVksRUFDWixVQUFVLEVBQ1YsMkJBQTJCLEVBQ2Q7SUFFYixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLHdCQUF3QixFQUFFO1FBQ2pELFdBQVcsRUFBRSx3Q0FBd0M7UUFDckQsS0FBSyxFQUFFLGdCQUFnQjtRQUN2QixVQUFVLEVBQUUsZ0JBQUUsQ0FBQyxHQUFHLENBQUMsSUFBQSxnREFBdUIsRUFBQywwQ0FBaUIsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFO1lBQy9FLFNBQVMsRUFBRSxTQUFTO1NBQ3JCLENBQUM7S0FDSCxDQUFDLENBQUM7SUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLHlCQUF5QixFQUFFO1FBQ2xELFdBQVcsRUFBRSx5Q0FBeUM7UUFDdEQsS0FBSyxFQUFFLGlCQUFpQjtRQUN4QixVQUFVLEVBQUUsZ0JBQUUsQ0FBQyxHQUFHLENBQUMsSUFBQSxnREFBdUIsRUFBQywwQ0FBaUIsQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFO1lBQ2pGLFNBQVMsRUFBRSxTQUFTO1NBQ3JCLENBQUM7S0FDSCxDQUFDLENBQUM7SUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsS0FB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QyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQ2VudHJhbGl6ZWQgb3V0cHV0cyBtYW5hZ2VtZW50IGZvciB0aGUgQXV0aCBJbmZyYXN0cnVjdHVyZSBzdGFja1xuICovXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgRm4gfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBjcmVhdGVEeW5hbWljRXhwb3J0TmFtZSwgQVVUSF9FWFBPUlRfTkFNRVMgfSBmcm9tICcuL2Nsb3VkZm9ybWF0aW9uLWV4cG9ydHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIE91dHB1dFBhcmFtcyB7XG4gIHN0YWNrOiBjZGsuU3RhY2s7XG4gIHN0YWNrTmFtZTogc3RyaW5nO1xuICBkYXRhYmFzZUVuZHBvaW50OiBzdHJpbmc7XG4gIGRhdGFiYXNlU2VjcmV0QXJuOiBzdHJpbmc7XG4gIHJlZGlzRW5kcG9pbnQ6IHN0cmluZztcbiAgcmVkaXNBdXRoVG9rZW5Bcm46IHN0cmluZztcbiAgZWZzSWQ6IHN0cmluZztcbiAgZWZzTWVkaWFBY2Nlc3NQb2ludElkOiBzdHJpbmc7XG4gIGVmc1RlbXBsYXRlc0FjY2Vzc1BvaW50SWQ6IHN0cmluZztcbiAgYXV0aGVudGlrU2VjcmV0S2V5QXJuOiBzdHJpbmc7XG4gIGF1dGhlbnRpa0FkbWluVG9rZW5Bcm46IHN0cmluZztcbiAgYXV0aGVudGlrTGRhcFRva2VuQXJuOiBzdHJpbmc7XG4gIGF1dGhlbnRpa0FsYkRuczogc3RyaW5nO1xuICBhdXRoZW50aWtVcmw6IHN0cmluZztcbiAgbGRhcE5sYkRuczogc3RyaW5nO1xuICBsZGFwVG9rZW5SZXRyaWV2ZXJMYW1iZGFBcm46IHN0cmluZztcbn1cblxuLyoqXG4gKiBSZWdpc3RlciBhbGwgb3V0cHV0cyBmb3IgdGhlIEF1dGggSW5mcmFzdHJ1Y3R1cmUgc3RhY2tcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyT3V0cHV0cyh7XG4gIHN0YWNrLFxuICBzdGFja05hbWUsXG4gIGRhdGFiYXNlRW5kcG9pbnQsXG4gIGRhdGFiYXNlU2VjcmV0QXJuLFxuICByZWRpc0VuZHBvaW50LFxuICByZWRpc0F1dGhUb2tlbkFybixcbiAgZWZzSWQsXG4gIGVmc01lZGlhQWNjZXNzUG9pbnRJZCxcbiAgZWZzVGVtcGxhdGVzQWNjZXNzUG9pbnRJZCxcbiAgYXV0aGVudGlrU2VjcmV0S2V5QXJuLFxuICBhdXRoZW50aWtBZG1pblRva2VuQXJuLFxuICBhdXRoZW50aWtMZGFwVG9rZW5Bcm4sXG4gIGF1dGhlbnRpa0FsYkRucyxcbiAgYXV0aGVudGlrVXJsLFxuICBsZGFwTmxiRG5zLFxuICBsZGFwVG9rZW5SZXRyaWV2ZXJMYW1iZGFBcm5cbn06IE91dHB1dFBhcmFtcykge1xuICBcbiAgbmV3IGNkay5DZm5PdXRwdXQoc3RhY2ssICdEYXRhYmFzZUVuZHBvaW50T3V0cHV0Jywge1xuICAgIGRlc2NyaXB0aW9uOiAnUkRTIEF1cm9yYSBQb3N0Z3JlU1FMIGNsdXN0ZXIgZW5kcG9pbnQnLFxuICAgIHZhbHVlOiBkYXRhYmFzZUVuZHBvaW50LFxuICAgIGV4cG9ydE5hbWU6IEZuLnN1YihjcmVhdGVEeW5hbWljRXhwb3J0TmFtZShBVVRIX0VYUE9SVF9OQU1FUy5EQVRBQkFTRV9FTkRQT0lOVCksIHtcbiAgICAgIFN0YWNrTmFtZTogc3RhY2tOYW1lLFxuICAgIH0pLFxuICB9KTtcblxuICBuZXcgY2RrLkNmbk91dHB1dChzdGFjaywgJ0RhdGFiYXNlU2VjcmV0QXJuT3V0cHV0Jywge1xuICAgIGRlc2NyaXB0aW9uOiAnUkRTIEF1cm9yYSBQb3N0Z3JlU1FMIG1hc3RlciBzZWNyZXQgQVJOJyxcbiAgICB2YWx1ZTogZGF0YWJhc2VTZWNyZXRBcm4sXG4gICAgZXhwb3J0TmFtZTogRm4uc3ViKGNyZWF0ZUR5bmFtaWNFeHBvcnROYW1lKEFVVEhfRVhQT1JUX05BTUVTLkRBVEFCQVNFX1NFQ1JFVF9BUk4pLCB7XG4gICAgICBTdGFja05hbWU6IHN0YWNrTmFtZSxcbiAgICB9KSxcbiAgfSk7XG5cbiAgbmV3IGNkay5DZm5PdXRwdXQoc3RhY2ssICdSZWRpc0VuZHBvaW50T3V0cHV0Jywge1xuICAgIGRlc2NyaXB0aW9uOiAnRWxhc3RpQ2FjaGUgUmVkaXMgY2x1c3RlciBlbmRwb2ludCcsXG4gICAgdmFsdWU6IHJlZGlzRW5kcG9pbnQsXG4gICAgZXhwb3J0TmFtZTogRm4uc3ViKGNyZWF0ZUR5bmFtaWNFeHBvcnROYW1lKEFVVEhfRVhQT1JUX05BTUVTLlJFRElTX0VORFBPSU5UKSwge1xuICAgICAgU3RhY2tOYW1lOiBzdGFja05hbWUsXG4gICAgfSksXG4gIH0pO1xuXG4gIG5ldyBjZGsuQ2ZuT3V0cHV0KHN0YWNrLCAnUmVkaXNBdXRoVG9rZW5Bcm5PdXRwdXQnLCB7XG4gICAgZGVzY3JpcHRpb246ICdFbGFzdGlDYWNoZSBSZWRpcyBhdXRoIHRva2VuIHNlY3JldCBBUk4nLFxuICAgIHZhbHVlOiByZWRpc0F1dGhUb2tlbkFybixcbiAgICBleHBvcnROYW1lOiBGbi5zdWIoY3JlYXRlRHluYW1pY0V4cG9ydE5hbWUoQVVUSF9FWFBPUlRfTkFNRVMuUkVESVNfQVVUSF9UT0tFTl9BUk4pLCB7XG4gICAgICBTdGFja05hbWU6IHN0YWNrTmFtZSxcbiAgICB9KSxcbiAgfSk7XG5cbiAgbmV3IGNkay5DZm5PdXRwdXQoc3RhY2ssICdFZnNJZE91dHB1dCcsIHtcbiAgICBkZXNjcmlwdGlvbjogJ0VGUyBmaWxlIHN5c3RlbSBJRCcsXG4gICAgdmFsdWU6IGVmc0lkLFxuICAgIGV4cG9ydE5hbWU6IEZuLnN1YihjcmVhdGVEeW5hbWljRXhwb3J0TmFtZShBVVRIX0VYUE9SVF9OQU1FUy5FRlNfSUQpLCB7XG4gICAgICBTdGFja05hbWU6IHN0YWNrTmFtZSxcbiAgICB9KSxcbiAgfSk7XG5cbiAgbmV3IGNkay5DZm5PdXRwdXQoc3RhY2ssICdFZnNNZWRpYUFjY2Vzc1BvaW50T3V0cHV0Jywge1xuICAgIGRlc2NyaXB0aW9uOiAnRUZTIG1lZGlhIGFjY2VzcyBwb2ludCBJRCcsXG4gICAgdmFsdWU6IGVmc01lZGlhQWNjZXNzUG9pbnRJZCxcbiAgICBleHBvcnROYW1lOiBGbi5zdWIoY3JlYXRlRHluYW1pY0V4cG9ydE5hbWUoQVVUSF9FWFBPUlRfTkFNRVMuRUZTX01FRElBX0FDQ0VTU19QT0lOVCksIHtcbiAgICAgIFN0YWNrTmFtZTogc3RhY2tOYW1lLFxuICAgIH0pLFxuICB9KTtcblxuICBuZXcgY2RrLkNmbk91dHB1dChzdGFjaywgJ0Vmc1RlbXBsYXRlc0FjY2Vzc1BvaW50T3V0cHV0Jywge1xuICAgIGRlc2NyaXB0aW9uOiAnRUZTIHRlbXBsYXRlcyBhY2Nlc3MgcG9pbnQgSUQnLFxuICAgIHZhbHVlOiBlZnNUZW1wbGF0ZXNBY2Nlc3NQb2ludElkLFxuICAgIGV4cG9ydE5hbWU6IEZuLnN1YihjcmVhdGVEeW5hbWljRXhwb3J0TmFtZShBVVRIX0VYUE9SVF9OQU1FUy5FRlNfVEVNUExBVEVTX0FDQ0VTU19QT0lOVCksIHtcbiAgICAgIFN0YWNrTmFtZTogc3RhY2tOYW1lLFxuICAgIH0pLFxuICB9KTtcblxuICBuZXcgY2RrLkNmbk91dHB1dChzdGFjaywgJ0F1dGhlbnRpa1NlY3JldEtleUFybk91dHB1dCcsIHtcbiAgICBkZXNjcmlwdGlvbjogJ0F1dGhlbnRpayBzZWNyZXQga2V5IEFSTicsXG4gICAgdmFsdWU6IGF1dGhlbnRpa1NlY3JldEtleUFybixcbiAgICBleHBvcnROYW1lOiBGbi5zdWIoY3JlYXRlRHluYW1pY0V4cG9ydE5hbWUoQVVUSF9FWFBPUlRfTkFNRVMuQVVUSEVOVElLX1NFQ1JFVF9LRVlfQVJOKSwge1xuICAgICAgU3RhY2tOYW1lOiBzdGFja05hbWUsXG4gICAgfSksXG4gIH0pO1xuXG4gIG5ldyBjZGsuQ2ZuT3V0cHV0KHN0YWNrLCAnQXV0aGVudGlrQWRtaW5Ub2tlbkFybk91dHB1dCcsIHtcbiAgICBkZXNjcmlwdGlvbjogJ0F1dGhlbnRpayBhZG1pbiB0b2tlbiBBUk4nLFxuICAgIHZhbHVlOiBhdXRoZW50aWtBZG1pblRva2VuQXJuLFxuICAgIGV4cG9ydE5hbWU6IEZuLnN1YihjcmVhdGVEeW5hbWljRXhwb3J0TmFtZShBVVRIX0VYUE9SVF9OQU1FUy5BVVRIRU5USUtfQURNSU5fVE9LRU5fQVJOKSwge1xuICAgICAgU3RhY2tOYW1lOiBzdGFja05hbWUsXG4gICAgfSksXG4gIH0pO1xuXG4gIG5ldyBjZGsuQ2ZuT3V0cHV0KHN0YWNrLCAnQXV0aGVudGlrTGRhcFRva2VuQXJuT3V0cHV0Jywge1xuICAgIGRlc2NyaXB0aW9uOiAnQXV0aGVudGlrIExEQVAgdG9rZW4gQVJOJyxcbiAgICB2YWx1ZTogYXV0aGVudGlrTGRhcFRva2VuQXJuLFxuICAgIGV4cG9ydE5hbWU6IEZuLnN1YihjcmVhdGVEeW5hbWljRXhwb3J0TmFtZShBVVRIX0VYUE9SVF9OQU1FUy5BVVRIRU5USUtfTERBUF9UT0tFTl9BUk4pLCB7XG4gICAgICBTdGFja05hbWU6IHN0YWNrTmFtZSxcbiAgICB9KSxcbiAgfSk7XG5cbiAgbmV3IGNkay5DZm5PdXRwdXQoc3RhY2ssICdBdXRoZW50aWtBbGJEbnNPdXRwdXQnLCB7XG4gICAgZGVzY3JpcHRpb246ICdBdXRoZW50aWsgQXBwbGljYXRpb24gTG9hZCBCYWxhbmNlciBETlMgbmFtZScsXG4gICAgdmFsdWU6IGF1dGhlbnRpa0FsYkRucyxcbiAgICBleHBvcnROYW1lOiBGbi5zdWIoY3JlYXRlRHluYW1pY0V4cG9ydE5hbWUoQVVUSF9FWFBPUlRfTkFNRVMuQVVUSEVOVElLX0FMQl9ETlMpLCB7XG4gICAgICBTdGFja05hbWU6IHN0YWNrTmFtZSxcbiAgICB9KSxcbiAgfSk7XG5cbiAgbmV3IGNkay5DZm5PdXRwdXQoc3RhY2ssICdBdXRoZW50aWtVcmxPdXRwdXQnLCB7XG4gICAgZGVzY3JpcHRpb246ICdBdXRoZW50aWsgYXBwbGljYXRpb24gVVJMJyxcbiAgICB2YWx1ZTogYXV0aGVudGlrVXJsLFxuICAgIGV4cG9ydE5hbWU6IEZuLnN1YihjcmVhdGVEeW5hbWljRXhwb3J0TmFtZShBVVRIX0VYUE9SVF9OQU1FUy5BVVRIRU5USUtfVVJMKSwge1xuICAgICAgU3RhY2tOYW1lOiBzdGFja05hbWUsXG4gICAgfSksXG4gIH0pO1xuXG4gIC8vIExEQVAgb3V0cHV0c1xuICBuZXcgY2RrLkNmbk91dHB1dChzdGFjaywgJ0xkYXBObGJEbnNPdXRwdXQnLCB7XG4gICAgZGVzY3JpcHRpb246ICdMREFQIE5ldHdvcmsgTG9hZCBCYWxhbmNlciBETlMgbmFtZScsXG4gICAgdmFsdWU6IGxkYXBObGJEbnMsXG4gICAgZXhwb3J0TmFtZTogRm4uc3ViKGNyZWF0ZUR5bmFtaWNFeHBvcnROYW1lKEFVVEhfRVhQT1JUX05BTUVTLkxEQVBfTkxCX0ROUyksIHtcbiAgICAgIFN0YWNrTmFtZTogc3RhY2tOYW1lLFxuICAgIH0pLFxuICB9KTtcblxuICBuZXcgY2RrLkNmbk91dHB1dChzdGFjaywgJ0xkYXBUb2tlblJldHJpZXZlckxhbWJkYUFybk91dHB1dCcsIHtcbiAgICBkZXNjcmlwdGlvbjogJ0FSTiBvZiB0aGUgTGFtYmRhIGZ1bmN0aW9uIHRoYXQgcmV0cmlldmVzIGFuZCB1cGRhdGVzIExEQVAgdG9rZW5zJyxcbiAgICB2YWx1ZTogbGRhcFRva2VuUmV0cmlldmVyTGFtYmRhQXJuLFxuICAgIGV4cG9ydE5hbWU6IEZuLnN1YihjcmVhdGVEeW5hbWljRXhwb3J0TmFtZShBVVRIX0VYUE9SVF9OQU1FUy5MREFQX1RPS0VOX1JFVFJJRVZFUl9MQU1CREFfQVJOKSwge1xuICAgICAgU3RhY2tOYW1lOiBzdGFja05hbWUsXG4gICAgfSksXG4gIH0pO1xufVxuIl19