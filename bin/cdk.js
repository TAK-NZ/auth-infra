#!/usr/bin/env node
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
const auth_infra_stack_1 = require("../lib/auth-infra-stack");
const stack_config_1 = require("../lib/stack-config");
const app = new cdk.App();
// Read configuration from CDK context only (command line --context parameters)
const ProjectName = app.node.tryGetContext('project');
const customStackName = app.node.tryGetContext('stackName');
const envType = app.node.tryGetContext('envType') || 'dev-test';
const authentikAdminUserEmail = app.node.tryGetContext('authentikAdminUserEmail');
// Validate envType
if (envType !== 'prod' && envType !== 'dev-test') {
    throw new Error(`Invalid envType: ${envType}. Must be 'prod' or 'dev-test'`);
}
// Validate required parameters
if (!customStackName) {
    throw new Error('stackName is required. Use --context stackName=YourStackName\n' +
        'This parameter is mandatory as it determines the correct CloudFormation export names\n' +
        'for importing VPC and other resources from the base infrastructure stack.\n' +
        'Examples: --context stackName=Demo (for TAK-Demo-BaseInfra exports)');
}
if (!authentikAdminUserEmail || authentikAdminUserEmail.trim() === '') {
    throw new Error('authentikAdminUserEmail is required. Use --context authentikAdminUserEmail=user@example.com');
}
// Read optional context overrides
const overrides = {
    ...(app.node.tryGetContext('dbInstanceClass') && {
        database: { instanceClass: app.node.tryGetContext('dbInstanceClass') }
    }),
    ...(app.node.tryGetContext('dbInstanceCount') && {
        database: { instanceCount: parseInt(app.node.tryGetContext('dbInstanceCount'), 10) }
    }),
    ...(app.node.tryGetContext('redisNodeType') && {
        redis: { nodeType: app.node.tryGetContext('redisNodeType') }
    }),
    ...(app.node.tryGetContext('ecsTaskCpu') && {
        ecs: { taskCpu: parseInt(app.node.tryGetContext('ecsTaskCpu'), 10) }
    }),
    ...(app.node.tryGetContext('ecsTaskMemory') && {
        ecs: { taskMemory: parseInt(app.node.tryGetContext('ecsTaskMemory'), 10) }
    }),
    ...(app.node.tryGetContext('enableDetailedLogging') !== undefined && {
        general: { enableDetailedLogging: app.node.tryGetContext('enableDetailedLogging') === 'true' }
    }),
};
// Create the stack name early so we can use it in configuration
const environmentName = customStackName || 'Dev';
const stackName = `TAK-${environmentName}-AuthInfra`; // Always use TAK prefix
// Create configuration
const config = (0, stack_config_1.createStackConfig)(envType, customStackName, Object.keys(overrides).length > 0 ? overrides : undefined, 'TAK', // Always use TAK as project prefix
'AuthInfra');
// Create the stack with environment configuration for AWS API calls only
const stack = new auth_infra_stack_1.AuthInfraStack(app, stackName, {
    stackConfig: config,
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION || 'ap-southeast-2',
    },
    tags: {
        Project: ProjectName || 'TAK',
        'Environment Name': environmentName,
        Component: 'AuthInfra',
        ManagedBy: 'CDK',
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsaURBQW1DO0FBQ25DLDhEQUF5RDtBQUN6RCxzREFBd0Q7QUFFeEQsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7QUFFMUIsK0VBQStFO0FBQy9FLE1BQU0sV0FBVyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQ3RELE1BQU0sZUFBZSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0FBQzVELE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxJQUFJLFVBQVUsQ0FBQztBQUNoRSxNQUFNLHVCQUF1QixHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLHlCQUF5QixDQUFDLENBQUM7QUFFbEYsbUJBQW1CO0FBQ25CLElBQUksT0FBTyxLQUFLLE1BQU0sSUFBSSxPQUFPLEtBQUssVUFBVSxFQUFFLENBQUM7SUFDakQsTUFBTSxJQUFJLEtBQUssQ0FBQyxvQkFBb0IsT0FBTyxnQ0FBZ0MsQ0FBQyxDQUFDO0FBQy9FLENBQUM7QUFFRCwrQkFBK0I7QUFDL0IsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO0lBQ3JCLE1BQU0sSUFBSSxLQUFLLENBQUMsZ0VBQWdFO1FBQzlFLHdGQUF3RjtRQUN4Riw2RUFBNkU7UUFDN0UscUVBQXFFLENBQUMsQ0FBQztBQUMzRSxDQUFDO0FBRUQsSUFBSSxDQUFDLHVCQUF1QixJQUFJLHVCQUF1QixDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDO0lBQ3RFLE1BQU0sSUFBSSxLQUFLLENBQUMsNkZBQTZGLENBQUMsQ0FBQztBQUNqSCxDQUFDO0FBRUQsa0NBQWtDO0FBQ2xDLE1BQU0sU0FBUyxHQUFHO0lBQ2hCLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJO1FBQy9DLFFBQVEsRUFBRSxFQUFFLGFBQWEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFO0tBQ3ZFLENBQUM7SUFDRixHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsaUJBQWlCLENBQUMsSUFBSTtRQUMvQyxRQUFRLEVBQUUsRUFBRSxhQUFhLEVBQUUsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGlCQUFpQixDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUU7S0FDckYsQ0FBQztJQUNGLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxlQUFlLENBQUMsSUFBSTtRQUM3QyxLQUFLLEVBQUUsRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsZUFBZSxDQUFDLEVBQUU7S0FDN0QsQ0FBQztJQUNGLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsSUFBSTtRQUMxQyxHQUFHLEVBQUUsRUFBRSxPQUFPLEVBQUUsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFO0tBQ3JFLENBQUM7SUFDRixHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsZUFBZSxDQUFDLElBQUk7UUFDN0MsR0FBRyxFQUFFLEVBQUUsVUFBVSxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxlQUFlLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRTtLQUMzRSxDQUFDO0lBQ0YsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLHVCQUF1QixDQUFDLEtBQUssU0FBUyxJQUFJO1FBQ25FLE9BQU8sRUFBRSxFQUFFLHFCQUFxQixFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLHVCQUF1QixDQUFDLEtBQUssTUFBTSxFQUFFO0tBQy9GLENBQUM7Q0FDSCxDQUFDO0FBRUYsZ0VBQWdFO0FBQ2hFLE1BQU0sZUFBZSxHQUFHLGVBQWUsSUFBSSxLQUFLLENBQUM7QUFDakQsTUFBTSxTQUFTLEdBQUcsT0FBTyxlQUFlLFlBQVksQ0FBQyxDQUFDLHdCQUF3QjtBQUU5RSx1QkFBdUI7QUFDdkIsTUFBTSxNQUFNLEdBQUcsSUFBQSxnQ0FBaUIsRUFDOUIsT0FBOEIsRUFDOUIsZUFBZSxFQUNmLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQ3pELEtBQUssRUFBRSxtQ0FBbUM7QUFDMUMsV0FBVyxDQUNaLENBQUM7QUFFRix5RUFBeUU7QUFDekUsTUFBTSxLQUFLLEdBQUcsSUFBSSxpQ0FBYyxDQUFDLEdBQUcsRUFBRSxTQUFTLEVBQUU7SUFDL0MsV0FBVyxFQUFFLE1BQU07SUFDbkIsR0FBRyxFQUFFO1FBQ0gsT0FBTyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CO1FBQ3hDLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixJQUFJLGdCQUFnQjtLQUMzRDtJQUNELElBQUksRUFBRTtRQUNKLE9BQU8sRUFBRSxXQUFXLElBQUksS0FBSztRQUM3QixrQkFBa0IsRUFBRSxlQUFlO1FBQ25DLFNBQVMsRUFBRSxXQUFXO1FBQ3RCLFNBQVMsRUFBRSxLQUFLO0tBQ2pCO0NBQ0YsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IEF1dGhJbmZyYVN0YWNrIH0gZnJvbSAnLi4vbGliL2F1dGgtaW5mcmEtc3RhY2snO1xuaW1wb3J0IHsgY3JlYXRlU3RhY2tDb25maWcgfSBmcm9tICcuLi9saWIvc3RhY2stY29uZmlnJztcblxuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcblxuLy8gUmVhZCBjb25maWd1cmF0aW9uIGZyb20gQ0RLIGNvbnRleHQgb25seSAoY29tbWFuZCBsaW5lIC0tY29udGV4dCBwYXJhbWV0ZXJzKVxuY29uc3QgUHJvamVjdE5hbWUgPSBhcHAubm9kZS50cnlHZXRDb250ZXh0KCdwcm9qZWN0Jyk7XG5jb25zdCBjdXN0b21TdGFja05hbWUgPSBhcHAubm9kZS50cnlHZXRDb250ZXh0KCdzdGFja05hbWUnKTtcbmNvbnN0IGVudlR5cGUgPSBhcHAubm9kZS50cnlHZXRDb250ZXh0KCdlbnZUeXBlJykgfHwgJ2Rldi10ZXN0JztcbmNvbnN0IGF1dGhlbnRpa0FkbWluVXNlckVtYWlsID0gYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnYXV0aGVudGlrQWRtaW5Vc2VyRW1haWwnKTtcblxuLy8gVmFsaWRhdGUgZW52VHlwZVxuaWYgKGVudlR5cGUgIT09ICdwcm9kJyAmJiBlbnZUeXBlICE9PSAnZGV2LXRlc3QnKSB7XG4gIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBlbnZUeXBlOiAke2VudlR5cGV9LiBNdXN0IGJlICdwcm9kJyBvciAnZGV2LXRlc3QnYCk7XG59XG5cbi8vIFZhbGlkYXRlIHJlcXVpcmVkIHBhcmFtZXRlcnNcbmlmICghY3VzdG9tU3RhY2tOYW1lKSB7XG4gIHRocm93IG5ldyBFcnJvcignc3RhY2tOYW1lIGlzIHJlcXVpcmVkLiBVc2UgLS1jb250ZXh0IHN0YWNrTmFtZT1Zb3VyU3RhY2tOYW1lXFxuJyArXG4gICAgJ1RoaXMgcGFyYW1ldGVyIGlzIG1hbmRhdG9yeSBhcyBpdCBkZXRlcm1pbmVzIHRoZSBjb3JyZWN0IENsb3VkRm9ybWF0aW9uIGV4cG9ydCBuYW1lc1xcbicgK1xuICAgICdmb3IgaW1wb3J0aW5nIFZQQyBhbmQgb3RoZXIgcmVzb3VyY2VzIGZyb20gdGhlIGJhc2UgaW5mcmFzdHJ1Y3R1cmUgc3RhY2suXFxuJyArXG4gICAgJ0V4YW1wbGVzOiAtLWNvbnRleHQgc3RhY2tOYW1lPURlbW8gKGZvciBUQUstRGVtby1CYXNlSW5mcmEgZXhwb3J0cyknKTtcbn1cblxuaWYgKCFhdXRoZW50aWtBZG1pblVzZXJFbWFpbCB8fCBhdXRoZW50aWtBZG1pblVzZXJFbWFpbC50cmltKCkgPT09ICcnKSB7XG4gIHRocm93IG5ldyBFcnJvcignYXV0aGVudGlrQWRtaW5Vc2VyRW1haWwgaXMgcmVxdWlyZWQuIFVzZSAtLWNvbnRleHQgYXV0aGVudGlrQWRtaW5Vc2VyRW1haWw9dXNlckBleGFtcGxlLmNvbScpO1xufVxuXG4vLyBSZWFkIG9wdGlvbmFsIGNvbnRleHQgb3ZlcnJpZGVzXG5jb25zdCBvdmVycmlkZXMgPSB7XG4gIC4uLihhcHAubm9kZS50cnlHZXRDb250ZXh0KCdkYkluc3RhbmNlQ2xhc3MnKSAmJiB7XG4gICAgZGF0YWJhc2U6IHsgaW5zdGFuY2VDbGFzczogYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnZGJJbnN0YW5jZUNsYXNzJykgfVxuICB9KSxcbiAgLi4uKGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2RiSW5zdGFuY2VDb3VudCcpICYmIHtcbiAgICBkYXRhYmFzZTogeyBpbnN0YW5jZUNvdW50OiBwYXJzZUludChhcHAubm9kZS50cnlHZXRDb250ZXh0KCdkYkluc3RhbmNlQ291bnQnKSwgMTApIH1cbiAgfSksXG4gIC4uLihhcHAubm9kZS50cnlHZXRDb250ZXh0KCdyZWRpc05vZGVUeXBlJykgJiYge1xuICAgIHJlZGlzOiB7IG5vZGVUeXBlOiBhcHAubm9kZS50cnlHZXRDb250ZXh0KCdyZWRpc05vZGVUeXBlJykgfVxuICB9KSxcbiAgLi4uKGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2Vjc1Rhc2tDcHUnKSAmJiB7XG4gICAgZWNzOiB7IHRhc2tDcHU6IHBhcnNlSW50KGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2Vjc1Rhc2tDcHUnKSwgMTApIH1cbiAgfSksXG4gIC4uLihhcHAubm9kZS50cnlHZXRDb250ZXh0KCdlY3NUYXNrTWVtb3J5JykgJiYge1xuICAgIGVjczogeyB0YXNrTWVtb3J5OiBwYXJzZUludChhcHAubm9kZS50cnlHZXRDb250ZXh0KCdlY3NUYXNrTWVtb3J5JyksIDEwKSB9XG4gIH0pLFxuICAuLi4oYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnZW5hYmxlRGV0YWlsZWRMb2dnaW5nJykgIT09IHVuZGVmaW5lZCAmJiB7XG4gICAgZ2VuZXJhbDogeyBlbmFibGVEZXRhaWxlZExvZ2dpbmc6IGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2VuYWJsZURldGFpbGVkTG9nZ2luZycpID09PSAndHJ1ZScgfVxuICB9KSxcbn07XG5cbi8vIENyZWF0ZSB0aGUgc3RhY2sgbmFtZSBlYXJseSBzbyB3ZSBjYW4gdXNlIGl0IGluIGNvbmZpZ3VyYXRpb25cbmNvbnN0IGVudmlyb25tZW50TmFtZSA9IGN1c3RvbVN0YWNrTmFtZSB8fCAnRGV2JztcbmNvbnN0IHN0YWNrTmFtZSA9IGBUQUstJHtlbnZpcm9ubWVudE5hbWV9LUF1dGhJbmZyYWA7IC8vIEFsd2F5cyB1c2UgVEFLIHByZWZpeFxuXG4vLyBDcmVhdGUgY29uZmlndXJhdGlvblxuY29uc3QgY29uZmlnID0gY3JlYXRlU3RhY2tDb25maWcoXG4gIGVudlR5cGUgYXMgJ3Byb2QnIHwgJ2Rldi10ZXN0JyxcbiAgY3VzdG9tU3RhY2tOYW1lLFxuICBPYmplY3Qua2V5cyhvdmVycmlkZXMpLmxlbmd0aCA+IDAgPyBvdmVycmlkZXMgOiB1bmRlZmluZWQsXG4gICdUQUsnLCAvLyBBbHdheXMgdXNlIFRBSyBhcyBwcm9qZWN0IHByZWZpeFxuICAnQXV0aEluZnJhJ1xuKTtcblxuLy8gQ3JlYXRlIHRoZSBzdGFjayB3aXRoIGVudmlyb25tZW50IGNvbmZpZ3VyYXRpb24gZm9yIEFXUyBBUEkgY2FsbHMgb25seVxuY29uc3Qgc3RhY2sgPSBuZXcgQXV0aEluZnJhU3RhY2soYXBwLCBzdGFja05hbWUsIHtcbiAgc3RhY2tDb25maWc6IGNvbmZpZyxcbiAgZW52OiB7XG4gICAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCxcbiAgICByZWdpb246IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTiB8fCAnYXAtc291dGhlYXN0LTInLFxuICB9LFxuICB0YWdzOiB7XG4gICAgUHJvamVjdDogUHJvamVjdE5hbWUgfHwgJ1RBSycsXG4gICAgJ0Vudmlyb25tZW50IE5hbWUnOiBlbnZpcm9ubWVudE5hbWUsXG4gICAgQ29tcG9uZW50OiAnQXV0aEluZnJhJyxcbiAgICBNYW5hZ2VkQnk6ICdDREsnLCAgICBcbiAgfVxufSk7XG4iXX0=