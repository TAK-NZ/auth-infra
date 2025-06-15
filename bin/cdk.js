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
const envType = app.node.tryGetContext('envType') || 'dev-test';
const stackName = app.node.tryGetContext('stackName');
const authentikAdminUserEmail = app.node.tryGetContext('authentikAdminUserEmail');
// Validate envType
if (envType !== 'prod' && envType !== 'dev-test') {
    throw new Error(`Invalid envType: ${envType}. Must be 'prod' or 'dev-test'`);
}
// Validate required parameters
if (!stackName) {
    throw new Error('stackName is required. Use --context stackName=YourStackName');
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
// Create configuration
const config = (0, stack_config_1.createStackConfig)(envType, stackName, Object.keys(overrides).length > 0 ? overrides : undefined, 'TAK', // Always use TAK as project prefix
'AuthInfra');
// Create the stack with environment configuration for AWS API calls only
const resolvedStackName = `${config.projectName}-${stackName}-${config.componentName}`;
const stack = new auth_infra_stack_1.AuthInfraStack(app, resolvedStackName, {
    stackConfig: config,
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION || 'ap-southeast-2',
    },
    description: 'TAK Authentication Layer - Authentik & LDAP',
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsaURBQW1DO0FBQ25DLDhEQUF5RDtBQUN6RCxzREFBd0Q7QUFFeEQsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7QUFFMUIsK0VBQStFO0FBQy9FLE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxJQUFJLFVBQVUsQ0FBQztBQUNoRSxNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsQ0FBQztBQUN0RCxNQUFNLHVCQUF1QixHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLHlCQUF5QixDQUFDLENBQUM7QUFFbEYsbUJBQW1CO0FBQ25CLElBQUksT0FBTyxLQUFLLE1BQU0sSUFBSSxPQUFPLEtBQUssVUFBVSxFQUFFLENBQUM7SUFDakQsTUFBTSxJQUFJLEtBQUssQ0FBQyxvQkFBb0IsT0FBTyxnQ0FBZ0MsQ0FBQyxDQUFDO0FBQy9FLENBQUM7QUFFRCwrQkFBK0I7QUFDL0IsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO0lBQ2YsTUFBTSxJQUFJLEtBQUssQ0FBQyw4REFBOEQsQ0FBQyxDQUFDO0FBQ2xGLENBQUM7QUFFRCxJQUFJLENBQUMsdUJBQXVCLElBQUksdUJBQXVCLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUM7SUFDdEUsTUFBTSxJQUFJLEtBQUssQ0FBQyw2RkFBNkYsQ0FBQyxDQUFDO0FBQ2pILENBQUM7QUFFRCxrQ0FBa0M7QUFDbEMsTUFBTSxTQUFTLEdBQUc7SUFDaEIsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGlCQUFpQixDQUFDLElBQUk7UUFDL0MsUUFBUSxFQUFFLEVBQUUsYUFBYSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGlCQUFpQixDQUFDLEVBQUU7S0FDdkUsQ0FBQztJQUNGLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJO1FBQy9DLFFBQVEsRUFBRSxFQUFFLGFBQWEsRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsaUJBQWlCLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRTtLQUNyRixDQUFDO0lBQ0YsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGVBQWUsQ0FBQyxJQUFJO1FBQzdDLEtBQUssRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxlQUFlLENBQUMsRUFBRTtLQUM3RCxDQUFDO0lBQ0YsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxJQUFJO1FBQzFDLEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUU7S0FDckUsQ0FBQztJQUNGLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxlQUFlLENBQUMsSUFBSTtRQUM3QyxHQUFHLEVBQUUsRUFBRSxVQUFVLEVBQUUsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGVBQWUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFO0tBQzNFLENBQUM7SUFDRixHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsdUJBQXVCLENBQUMsS0FBSyxTQUFTLElBQUk7UUFDbkUsT0FBTyxFQUFFLEVBQUUscUJBQXFCLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsdUJBQXVCLENBQUMsS0FBSyxNQUFNLEVBQUU7S0FDL0YsQ0FBQztDQUNILENBQUM7QUFFRix1QkFBdUI7QUFDdkIsTUFBTSxNQUFNLEdBQUcsSUFBQSxnQ0FBaUIsRUFDOUIsT0FBOEIsRUFDOUIsU0FBUyxFQUNULE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQ3pELEtBQUssRUFBRSxtQ0FBbUM7QUFDMUMsV0FBVyxDQUNaLENBQUM7QUFFRix5RUFBeUU7QUFDekUsTUFBTSxpQkFBaUIsR0FBRyxHQUFHLE1BQU0sQ0FBQyxXQUFXLElBQUksU0FBUyxJQUFJLE1BQU0sQ0FBQyxhQUFhLEVBQUUsQ0FBQztBQUN2RixNQUFNLEtBQUssR0FBRyxJQUFJLGlDQUFjLENBQUMsR0FBRyxFQUFFLGlCQUFpQixFQUFFO0lBQ3ZELFdBQVcsRUFBRSxNQUFNO0lBQ25CLEdBQUcsRUFBRTtRQUNILE9BQU8sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQjtRQUN4QyxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsSUFBSSxnQkFBZ0I7S0FDM0Q7SUFDRCxXQUFXLEVBQUUsNkNBQTZDO0NBQzNELENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBBdXRoSW5mcmFTdGFjayB9IGZyb20gJy4uL2xpYi9hdXRoLWluZnJhLXN0YWNrJztcbmltcG9ydCB7IGNyZWF0ZVN0YWNrQ29uZmlnIH0gZnJvbSAnLi4vbGliL3N0YWNrLWNvbmZpZyc7XG5cbmNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG5cbi8vIFJlYWQgY29uZmlndXJhdGlvbiBmcm9tIENESyBjb250ZXh0IG9ubHkgKGNvbW1hbmQgbGluZSAtLWNvbnRleHQgcGFyYW1ldGVycylcbmNvbnN0IGVudlR5cGUgPSBhcHAubm9kZS50cnlHZXRDb250ZXh0KCdlbnZUeXBlJykgfHwgJ2Rldi10ZXN0JztcbmNvbnN0IHN0YWNrTmFtZSA9IGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ3N0YWNrTmFtZScpO1xuY29uc3QgYXV0aGVudGlrQWRtaW5Vc2VyRW1haWwgPSBhcHAubm9kZS50cnlHZXRDb250ZXh0KCdhdXRoZW50aWtBZG1pblVzZXJFbWFpbCcpO1xuXG4vLyBWYWxpZGF0ZSBlbnZUeXBlXG5pZiAoZW52VHlwZSAhPT0gJ3Byb2QnICYmIGVudlR5cGUgIT09ICdkZXYtdGVzdCcpIHtcbiAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIGVudlR5cGU6ICR7ZW52VHlwZX0uIE11c3QgYmUgJ3Byb2QnIG9yICdkZXYtdGVzdCdgKTtcbn1cblxuLy8gVmFsaWRhdGUgcmVxdWlyZWQgcGFyYW1ldGVyc1xuaWYgKCFzdGFja05hbWUpIHtcbiAgdGhyb3cgbmV3IEVycm9yKCdzdGFja05hbWUgaXMgcmVxdWlyZWQuIFVzZSAtLWNvbnRleHQgc3RhY2tOYW1lPVlvdXJTdGFja05hbWUnKTtcbn1cblxuaWYgKCFhdXRoZW50aWtBZG1pblVzZXJFbWFpbCB8fCBhdXRoZW50aWtBZG1pblVzZXJFbWFpbC50cmltKCkgPT09ICcnKSB7XG4gIHRocm93IG5ldyBFcnJvcignYXV0aGVudGlrQWRtaW5Vc2VyRW1haWwgaXMgcmVxdWlyZWQuIFVzZSAtLWNvbnRleHQgYXV0aGVudGlrQWRtaW5Vc2VyRW1haWw9dXNlckBleGFtcGxlLmNvbScpO1xufVxuXG4vLyBSZWFkIG9wdGlvbmFsIGNvbnRleHQgb3ZlcnJpZGVzXG5jb25zdCBvdmVycmlkZXMgPSB7XG4gIC4uLihhcHAubm9kZS50cnlHZXRDb250ZXh0KCdkYkluc3RhbmNlQ2xhc3MnKSAmJiB7XG4gICAgZGF0YWJhc2U6IHsgaW5zdGFuY2VDbGFzczogYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnZGJJbnN0YW5jZUNsYXNzJykgfVxuICB9KSxcbiAgLi4uKGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2RiSW5zdGFuY2VDb3VudCcpICYmIHtcbiAgICBkYXRhYmFzZTogeyBpbnN0YW5jZUNvdW50OiBwYXJzZUludChhcHAubm9kZS50cnlHZXRDb250ZXh0KCdkYkluc3RhbmNlQ291bnQnKSwgMTApIH1cbiAgfSksXG4gIC4uLihhcHAubm9kZS50cnlHZXRDb250ZXh0KCdyZWRpc05vZGVUeXBlJykgJiYge1xuICAgIHJlZGlzOiB7IG5vZGVUeXBlOiBhcHAubm9kZS50cnlHZXRDb250ZXh0KCdyZWRpc05vZGVUeXBlJykgfVxuICB9KSxcbiAgLi4uKGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2Vjc1Rhc2tDcHUnKSAmJiB7XG4gICAgZWNzOiB7IHRhc2tDcHU6IHBhcnNlSW50KGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2Vjc1Rhc2tDcHUnKSwgMTApIH1cbiAgfSksXG4gIC4uLihhcHAubm9kZS50cnlHZXRDb250ZXh0KCdlY3NUYXNrTWVtb3J5JykgJiYge1xuICAgIGVjczogeyB0YXNrTWVtb3J5OiBwYXJzZUludChhcHAubm9kZS50cnlHZXRDb250ZXh0KCdlY3NUYXNrTWVtb3J5JyksIDEwKSB9XG4gIH0pLFxuICAuLi4oYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnZW5hYmxlRGV0YWlsZWRMb2dnaW5nJykgIT09IHVuZGVmaW5lZCAmJiB7XG4gICAgZ2VuZXJhbDogeyBlbmFibGVEZXRhaWxlZExvZ2dpbmc6IGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2VuYWJsZURldGFpbGVkTG9nZ2luZycpID09PSAndHJ1ZScgfVxuICB9KSxcbn07XG5cbi8vIENyZWF0ZSBjb25maWd1cmF0aW9uXG5jb25zdCBjb25maWcgPSBjcmVhdGVTdGFja0NvbmZpZyhcbiAgZW52VHlwZSBhcyAncHJvZCcgfCAnZGV2LXRlc3QnLFxuICBzdGFja05hbWUsXG4gIE9iamVjdC5rZXlzKG92ZXJyaWRlcykubGVuZ3RoID4gMCA/IG92ZXJyaWRlcyA6IHVuZGVmaW5lZCxcbiAgJ1RBSycsIC8vIEFsd2F5cyB1c2UgVEFLIGFzIHByb2plY3QgcHJlZml4XG4gICdBdXRoSW5mcmEnXG4pO1xuXG4vLyBDcmVhdGUgdGhlIHN0YWNrIHdpdGggZW52aXJvbm1lbnQgY29uZmlndXJhdGlvbiBmb3IgQVdTIEFQSSBjYWxscyBvbmx5XG5jb25zdCByZXNvbHZlZFN0YWNrTmFtZSA9IGAke2NvbmZpZy5wcm9qZWN0TmFtZX0tJHtzdGFja05hbWV9LSR7Y29uZmlnLmNvbXBvbmVudE5hbWV9YDtcbmNvbnN0IHN0YWNrID0gbmV3IEF1dGhJbmZyYVN0YWNrKGFwcCwgcmVzb2x2ZWRTdGFja05hbWUsIHtcbiAgc3RhY2tDb25maWc6IGNvbmZpZyxcbiAgZW52OiB7XG4gICAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCxcbiAgICByZWdpb246IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTiB8fCAnYXAtc291dGhlYXN0LTInLFxuICB9LFxuICBkZXNjcmlwdGlvbjogJ1RBSyBBdXRoZW50aWNhdGlvbiBMYXllciAtIEF1dGhlbnRpayAmIExEQVAnLFxufSk7XG4iXX0=