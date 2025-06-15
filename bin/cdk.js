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
// Validate envType
if (envType !== 'prod' && envType !== 'dev-test') {
    throw new Error(`Invalid envType: ${envType}. Must be 'prod' or 'dev-test'`);
}
// Validate required parameters
if (!stackName) {
    throw new Error('stackName is required. Use --context stackName=YourStackName');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsaURBQW1DO0FBQ25DLDhEQUF5RDtBQUN6RCxzREFBd0Q7QUFFeEQsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7QUFFMUIsK0VBQStFO0FBQy9FLE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxJQUFJLFVBQVUsQ0FBQztBQUNoRSxNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsQ0FBQztBQUV0RCxtQkFBbUI7QUFDbkIsSUFBSSxPQUFPLEtBQUssTUFBTSxJQUFJLE9BQU8sS0FBSyxVQUFVLEVBQUUsQ0FBQztJQUNqRCxNQUFNLElBQUksS0FBSyxDQUFDLG9CQUFvQixPQUFPLGdDQUFnQyxDQUFDLENBQUM7QUFDL0UsQ0FBQztBQUVELCtCQUErQjtBQUMvQixJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7SUFDZixNQUFNLElBQUksS0FBSyxDQUFDLDhEQUE4RCxDQUFDLENBQUM7QUFDbEYsQ0FBQztBQUVELGtDQUFrQztBQUNsQyxNQUFNLFNBQVMsR0FBRztJQUNoQixHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsaUJBQWlCLENBQUMsSUFBSTtRQUMvQyxRQUFRLEVBQUUsRUFBRSxhQUFhLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsaUJBQWlCLENBQUMsRUFBRTtLQUN2RSxDQUFDO0lBQ0YsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGlCQUFpQixDQUFDLElBQUk7UUFDL0MsUUFBUSxFQUFFLEVBQUUsYUFBYSxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFO0tBQ3JGLENBQUM7SUFDRixHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsZUFBZSxDQUFDLElBQUk7UUFDN0MsS0FBSyxFQUFFLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGVBQWUsQ0FBQyxFQUFFO0tBQzdELENBQUM7SUFDRixHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLElBQUk7UUFDMUMsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRTtLQUNyRSxDQUFDO0lBQ0YsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGVBQWUsQ0FBQyxJQUFJO1FBQzdDLEdBQUcsRUFBRSxFQUFFLFVBQVUsRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsZUFBZSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUU7S0FDM0UsQ0FBQztJQUNGLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyx1QkFBdUIsQ0FBQyxLQUFLLFNBQVMsSUFBSTtRQUNuRSxPQUFPLEVBQUUsRUFBRSxxQkFBcUIsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyx1QkFBdUIsQ0FBQyxLQUFLLE1BQU0sRUFBRTtLQUMvRixDQUFDO0NBQ0gsQ0FBQztBQUVGLHVCQUF1QjtBQUN2QixNQUFNLE1BQU0sR0FBRyxJQUFBLGdDQUFpQixFQUM5QixPQUE4QixFQUM5QixTQUFTLEVBQ1QsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFDekQsS0FBSyxFQUFFLG1DQUFtQztBQUMxQyxXQUFXLENBQ1osQ0FBQztBQUVGLHlFQUF5RTtBQUN6RSxNQUFNLGlCQUFpQixHQUFHLEdBQUcsTUFBTSxDQUFDLFdBQVcsSUFBSSxTQUFTLElBQUksTUFBTSxDQUFDLGFBQWEsRUFBRSxDQUFDO0FBQ3ZGLE1BQU0sS0FBSyxHQUFHLElBQUksaUNBQWMsQ0FBQyxHQUFHLEVBQUUsaUJBQWlCLEVBQUU7SUFDdkQsV0FBVyxFQUFFLE1BQU07SUFDbkIsR0FBRyxFQUFFO1FBQ0gsT0FBTyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CO1FBQ3hDLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixJQUFJLGdCQUFnQjtLQUMzRDtJQUNELFdBQVcsRUFBRSw2Q0FBNkM7Q0FDM0QsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IEF1dGhJbmZyYVN0YWNrIH0gZnJvbSAnLi4vbGliL2F1dGgtaW5mcmEtc3RhY2snO1xuaW1wb3J0IHsgY3JlYXRlU3RhY2tDb25maWcgfSBmcm9tICcuLi9saWIvc3RhY2stY29uZmlnJztcblxuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcblxuLy8gUmVhZCBjb25maWd1cmF0aW9uIGZyb20gQ0RLIGNvbnRleHQgb25seSAoY29tbWFuZCBsaW5lIC0tY29udGV4dCBwYXJhbWV0ZXJzKVxuY29uc3QgZW52VHlwZSA9IGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2VudlR5cGUnKSB8fCAnZGV2LXRlc3QnO1xuY29uc3Qgc3RhY2tOYW1lID0gYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnc3RhY2tOYW1lJyk7XG5cbi8vIFZhbGlkYXRlIGVudlR5cGVcbmlmIChlbnZUeXBlICE9PSAncHJvZCcgJiYgZW52VHlwZSAhPT0gJ2Rldi10ZXN0Jykge1xuICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgZW52VHlwZTogJHtlbnZUeXBlfS4gTXVzdCBiZSAncHJvZCcgb3IgJ2Rldi10ZXN0J2ApO1xufVxuXG4vLyBWYWxpZGF0ZSByZXF1aXJlZCBwYXJhbWV0ZXJzXG5pZiAoIXN0YWNrTmFtZSkge1xuICB0aHJvdyBuZXcgRXJyb3IoJ3N0YWNrTmFtZSBpcyByZXF1aXJlZC4gVXNlIC0tY29udGV4dCBzdGFja05hbWU9WW91clN0YWNrTmFtZScpO1xufVxuXG4vLyBSZWFkIG9wdGlvbmFsIGNvbnRleHQgb3ZlcnJpZGVzXG5jb25zdCBvdmVycmlkZXMgPSB7XG4gIC4uLihhcHAubm9kZS50cnlHZXRDb250ZXh0KCdkYkluc3RhbmNlQ2xhc3MnKSAmJiB7XG4gICAgZGF0YWJhc2U6IHsgaW5zdGFuY2VDbGFzczogYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnZGJJbnN0YW5jZUNsYXNzJykgfVxuICB9KSxcbiAgLi4uKGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2RiSW5zdGFuY2VDb3VudCcpICYmIHtcbiAgICBkYXRhYmFzZTogeyBpbnN0YW5jZUNvdW50OiBwYXJzZUludChhcHAubm9kZS50cnlHZXRDb250ZXh0KCdkYkluc3RhbmNlQ291bnQnKSwgMTApIH1cbiAgfSksXG4gIC4uLihhcHAubm9kZS50cnlHZXRDb250ZXh0KCdyZWRpc05vZGVUeXBlJykgJiYge1xuICAgIHJlZGlzOiB7IG5vZGVUeXBlOiBhcHAubm9kZS50cnlHZXRDb250ZXh0KCdyZWRpc05vZGVUeXBlJykgfVxuICB9KSxcbiAgLi4uKGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2Vjc1Rhc2tDcHUnKSAmJiB7XG4gICAgZWNzOiB7IHRhc2tDcHU6IHBhcnNlSW50KGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2Vjc1Rhc2tDcHUnKSwgMTApIH1cbiAgfSksXG4gIC4uLihhcHAubm9kZS50cnlHZXRDb250ZXh0KCdlY3NUYXNrTWVtb3J5JykgJiYge1xuICAgIGVjczogeyB0YXNrTWVtb3J5OiBwYXJzZUludChhcHAubm9kZS50cnlHZXRDb250ZXh0KCdlY3NUYXNrTWVtb3J5JyksIDEwKSB9XG4gIH0pLFxuICAuLi4oYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnZW5hYmxlRGV0YWlsZWRMb2dnaW5nJykgIT09IHVuZGVmaW5lZCAmJiB7XG4gICAgZ2VuZXJhbDogeyBlbmFibGVEZXRhaWxlZExvZ2dpbmc6IGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2VuYWJsZURldGFpbGVkTG9nZ2luZycpID09PSAndHJ1ZScgfVxuICB9KSxcbn07XG5cbi8vIENyZWF0ZSBjb25maWd1cmF0aW9uXG5jb25zdCBjb25maWcgPSBjcmVhdGVTdGFja0NvbmZpZyhcbiAgZW52VHlwZSBhcyAncHJvZCcgfCAnZGV2LXRlc3QnLFxuICBzdGFja05hbWUsXG4gIE9iamVjdC5rZXlzKG92ZXJyaWRlcykubGVuZ3RoID4gMCA/IG92ZXJyaWRlcyA6IHVuZGVmaW5lZCxcbiAgJ1RBSycsIC8vIEFsd2F5cyB1c2UgVEFLIGFzIHByb2plY3QgcHJlZml4XG4gICdBdXRoSW5mcmEnXG4pO1xuXG4vLyBDcmVhdGUgdGhlIHN0YWNrIHdpdGggZW52aXJvbm1lbnQgY29uZmlndXJhdGlvbiBmb3IgQVdTIEFQSSBjYWxscyBvbmx5XG5jb25zdCByZXNvbHZlZFN0YWNrTmFtZSA9IGAke2NvbmZpZy5wcm9qZWN0TmFtZX0tJHtzdGFja05hbWV9LSR7Y29uZmlnLmNvbXBvbmVudE5hbWV9YDtcbmNvbnN0IHN0YWNrID0gbmV3IEF1dGhJbmZyYVN0YWNrKGFwcCwgcmVzb2x2ZWRTdGFja05hbWUsIHtcbiAgc3RhY2tDb25maWc6IGNvbmZpZyxcbiAgZW52OiB7XG4gICAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCxcbiAgICByZWdpb246IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTiB8fCAnYXAtc291dGhlYXN0LTInLFxuICB9LFxuICBkZXNjcmlwdGlvbjogJ1RBSyBBdXRoZW50aWNhdGlvbiBMYXllciAtIEF1dGhlbnRpayAmIExEQVAnLFxufSk7XG4iXX0=