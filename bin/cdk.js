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
const utils_1 = require("../lib/utils");
const app = new cdk.App();
// Read configuration from CDK context only (command line --context parameters)
const ProjectName = app.node.tryGetContext('project');
const customStackName = app.node.tryGetContext('stackName');
const envType = app.node.tryGetContext('envType') || 'dev-test';
const authentikAdminUserEmail = app.node.tryGetContext('authentikAdminUserEmail');
// Calculate Git SHA for ECR image tagging
const gitSha = app.node.tryGetContext('gitSha') || (0, utils_1.getGitSha)();
// Validate parameters
(0, utils_1.validateEnvType)(envType);
(0, utils_1.validateRequiredParams)({
    stackName: customStackName,
    authentikAdminUserEmail
});
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
const stackName = `TAK-${customStackName}-AuthInfra`; // Always use TAK prefix
// Set calculated values in CDK context for the stack to use
app.node.setContext('calculatedGitSha', gitSha);
app.node.setContext('validatedAuthentikAdminUserEmail', authentikAdminUserEmail);
// Create configuration
const configResult = (0, stack_config_1.createStackConfig)(envType, customStackName, Object.keys(overrides).length > 0 ? overrides : undefined, 'TAK', // Always use TAK as project prefix
'AuthInfra');
// Create the stack with environment configuration for AWS API calls only
const stack = new auth_infra_stack_1.AuthInfraStack(app, stackName, {
    configResult: configResult,
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION || 'ap-southeast-2',
    },
    tags: {
        Project: ProjectName || 'TAK',
        Environment: customStackName,
        Component: 'AuthInfra',
        ManagedBy: 'CDK',
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsaURBQW1DO0FBQ25DLDhEQUF5RDtBQUN6RCxzREFBd0Q7QUFDeEQsd0NBQWtGO0FBRWxGLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBRTFCLCtFQUErRTtBQUMvRSxNQUFNLFdBQVcsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsQ0FBQztBQUN0RCxNQUFNLGVBQWUsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsQ0FBQztBQUM1RCxNQUFNLE9BQU8sR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsSUFBSSxVQUFVLENBQUM7QUFDaEUsTUFBTSx1QkFBdUIsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO0FBRWxGLDBDQUEwQztBQUMxQyxNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsSUFBSSxJQUFBLGlCQUFTLEdBQUUsQ0FBQztBQUUvRCxzQkFBc0I7QUFDdEIsSUFBQSx1QkFBZSxFQUFDLE9BQU8sQ0FBQyxDQUFDO0FBQ3pCLElBQUEsOEJBQXNCLEVBQUM7SUFDckIsU0FBUyxFQUFFLGVBQWU7SUFDMUIsdUJBQXVCO0NBQ3hCLENBQUMsQ0FBQztBQUVILGtDQUFrQztBQUNsQyxNQUFNLFNBQVMsR0FBRztJQUNoQixHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsaUJBQWlCLENBQUMsSUFBSTtRQUMvQyxRQUFRLEVBQUUsRUFBRSxhQUFhLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsaUJBQWlCLENBQUMsRUFBRTtLQUN2RSxDQUFDO0lBQ0YsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGlCQUFpQixDQUFDLElBQUk7UUFDL0MsUUFBUSxFQUFFLEVBQUUsYUFBYSxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFO0tBQ3JGLENBQUM7SUFDRixHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsZUFBZSxDQUFDLElBQUk7UUFDN0MsS0FBSyxFQUFFLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGVBQWUsQ0FBQyxFQUFFO0tBQzdELENBQUM7SUFDRixHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLElBQUk7UUFDMUMsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRTtLQUNyRSxDQUFDO0lBQ0YsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGVBQWUsQ0FBQyxJQUFJO1FBQzdDLEdBQUcsRUFBRSxFQUFFLFVBQVUsRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsZUFBZSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUU7S0FDM0UsQ0FBQztJQUNGLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyx1QkFBdUIsQ0FBQyxLQUFLLFNBQVMsSUFBSTtRQUNuRSxPQUFPLEVBQUUsRUFBRSxxQkFBcUIsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyx1QkFBdUIsQ0FBQyxLQUFLLE1BQU0sRUFBRTtLQUMvRixDQUFDO0NBQ0gsQ0FBQztBQUVGLGdFQUFnRTtBQUNoRSxNQUFNLFNBQVMsR0FBRyxPQUFPLGVBQWUsWUFBWSxDQUFDLENBQUMsd0JBQXdCO0FBRTlFLDREQUE0RDtBQUM1RCxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsRUFBRSxNQUFNLENBQUMsQ0FBQztBQUNoRCxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxrQ0FBa0MsRUFBRSx1QkFBdUIsQ0FBQyxDQUFDO0FBRWpGLHVCQUF1QjtBQUN2QixNQUFNLFlBQVksR0FBRyxJQUFBLGdDQUFpQixFQUNwQyxPQUE4QixFQUM5QixlQUFlLEVBQ2YsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFDekQsS0FBSyxFQUFFLG1DQUFtQztBQUMxQyxXQUFXLENBQ1osQ0FBQztBQUVGLHlFQUF5RTtBQUN6RSxNQUFNLEtBQUssR0FBRyxJQUFJLGlDQUFjLENBQUMsR0FBRyxFQUFFLFNBQVMsRUFBRTtJQUMvQyxZQUFZLEVBQUUsWUFBWTtJQUMxQixHQUFHLEVBQUU7UUFDSCxPQUFPLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUI7UUFDeEMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLElBQUksZ0JBQWdCO0tBQzNEO0lBQ0QsSUFBSSxFQUFFO1FBQ0osT0FBTyxFQUFFLFdBQVcsSUFBSSxLQUFLO1FBQzdCLFdBQVcsRUFBRSxlQUFlO1FBQzVCLFNBQVMsRUFBRSxXQUFXO1FBQ3RCLFNBQVMsRUFBRSxLQUFLO0tBQ2pCO0NBQ0YsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IEF1dGhJbmZyYVN0YWNrIH0gZnJvbSAnLi4vbGliL2F1dGgtaW5mcmEtc3RhY2snO1xuaW1wb3J0IHsgY3JlYXRlU3RhY2tDb25maWcgfSBmcm9tICcuLi9saWIvc3RhY2stY29uZmlnJztcbmltcG9ydCB7IGdldEdpdFNoYSwgdmFsaWRhdGVFbnZUeXBlLCB2YWxpZGF0ZVJlcXVpcmVkUGFyYW1zIH0gZnJvbSAnLi4vbGliL3V0aWxzJztcblxuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcblxuLy8gUmVhZCBjb25maWd1cmF0aW9uIGZyb20gQ0RLIGNvbnRleHQgb25seSAoY29tbWFuZCBsaW5lIC0tY29udGV4dCBwYXJhbWV0ZXJzKVxuY29uc3QgUHJvamVjdE5hbWUgPSBhcHAubm9kZS50cnlHZXRDb250ZXh0KCdwcm9qZWN0Jyk7XG5jb25zdCBjdXN0b21TdGFja05hbWUgPSBhcHAubm9kZS50cnlHZXRDb250ZXh0KCdzdGFja05hbWUnKTtcbmNvbnN0IGVudlR5cGUgPSBhcHAubm9kZS50cnlHZXRDb250ZXh0KCdlbnZUeXBlJykgfHwgJ2Rldi10ZXN0JztcbmNvbnN0IGF1dGhlbnRpa0FkbWluVXNlckVtYWlsID0gYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnYXV0aGVudGlrQWRtaW5Vc2VyRW1haWwnKTtcblxuLy8gQ2FsY3VsYXRlIEdpdCBTSEEgZm9yIEVDUiBpbWFnZSB0YWdnaW5nXG5jb25zdCBnaXRTaGEgPSBhcHAubm9kZS50cnlHZXRDb250ZXh0KCdnaXRTaGEnKSB8fCBnZXRHaXRTaGEoKTtcblxuLy8gVmFsaWRhdGUgcGFyYW1ldGVyc1xudmFsaWRhdGVFbnZUeXBlKGVudlR5cGUpO1xudmFsaWRhdGVSZXF1aXJlZFBhcmFtcyh7XG4gIHN0YWNrTmFtZTogY3VzdG9tU3RhY2tOYW1lLFxuICBhdXRoZW50aWtBZG1pblVzZXJFbWFpbFxufSk7XG5cbi8vIFJlYWQgb3B0aW9uYWwgY29udGV4dCBvdmVycmlkZXNcbmNvbnN0IG92ZXJyaWRlcyA9IHtcbiAgLi4uKGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2RiSW5zdGFuY2VDbGFzcycpICYmIHtcbiAgICBkYXRhYmFzZTogeyBpbnN0YW5jZUNsYXNzOiBhcHAubm9kZS50cnlHZXRDb250ZXh0KCdkYkluc3RhbmNlQ2xhc3MnKSB9XG4gIH0pLFxuICAuLi4oYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnZGJJbnN0YW5jZUNvdW50JykgJiYge1xuICAgIGRhdGFiYXNlOiB7IGluc3RhbmNlQ291bnQ6IHBhcnNlSW50KGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2RiSW5zdGFuY2VDb3VudCcpLCAxMCkgfVxuICB9KSxcbiAgLi4uKGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ3JlZGlzTm9kZVR5cGUnKSAmJiB7XG4gICAgcmVkaXM6IHsgbm9kZVR5cGU6IGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ3JlZGlzTm9kZVR5cGUnKSB9XG4gIH0pLFxuICAuLi4oYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnZWNzVGFza0NwdScpICYmIHtcbiAgICBlY3M6IHsgdGFza0NwdTogcGFyc2VJbnQoYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnZWNzVGFza0NwdScpLCAxMCkgfVxuICB9KSxcbiAgLi4uKGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2Vjc1Rhc2tNZW1vcnknKSAmJiB7XG4gICAgZWNzOiB7IHRhc2tNZW1vcnk6IHBhcnNlSW50KGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2Vjc1Rhc2tNZW1vcnknKSwgMTApIH1cbiAgfSksXG4gIC4uLihhcHAubm9kZS50cnlHZXRDb250ZXh0KCdlbmFibGVEZXRhaWxlZExvZ2dpbmcnKSAhPT0gdW5kZWZpbmVkICYmIHtcbiAgICBnZW5lcmFsOiB7IGVuYWJsZURldGFpbGVkTG9nZ2luZzogYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnZW5hYmxlRGV0YWlsZWRMb2dnaW5nJykgPT09ICd0cnVlJyB9XG4gIH0pLFxufTtcblxuLy8gQ3JlYXRlIHRoZSBzdGFjayBuYW1lIGVhcmx5IHNvIHdlIGNhbiB1c2UgaXQgaW4gY29uZmlndXJhdGlvblxuY29uc3Qgc3RhY2tOYW1lID0gYFRBSy0ke2N1c3RvbVN0YWNrTmFtZX0tQXV0aEluZnJhYDsgLy8gQWx3YXlzIHVzZSBUQUsgcHJlZml4XG5cbi8vIFNldCBjYWxjdWxhdGVkIHZhbHVlcyBpbiBDREsgY29udGV4dCBmb3IgdGhlIHN0YWNrIHRvIHVzZVxuYXBwLm5vZGUuc2V0Q29udGV4dCgnY2FsY3VsYXRlZEdpdFNoYScsIGdpdFNoYSk7XG5hcHAubm9kZS5zZXRDb250ZXh0KCd2YWxpZGF0ZWRBdXRoZW50aWtBZG1pblVzZXJFbWFpbCcsIGF1dGhlbnRpa0FkbWluVXNlckVtYWlsKTtcblxuLy8gQ3JlYXRlIGNvbmZpZ3VyYXRpb25cbmNvbnN0IGNvbmZpZ1Jlc3VsdCA9IGNyZWF0ZVN0YWNrQ29uZmlnKFxuICBlbnZUeXBlIGFzICdwcm9kJyB8ICdkZXYtdGVzdCcsXG4gIGN1c3RvbVN0YWNrTmFtZSxcbiAgT2JqZWN0LmtleXMob3ZlcnJpZGVzKS5sZW5ndGggPiAwID8gb3ZlcnJpZGVzIDogdW5kZWZpbmVkLFxuICAnVEFLJywgLy8gQWx3YXlzIHVzZSBUQUsgYXMgcHJvamVjdCBwcmVmaXhcbiAgJ0F1dGhJbmZyYSdcbik7XG5cbi8vIENyZWF0ZSB0aGUgc3RhY2sgd2l0aCBlbnZpcm9ubWVudCBjb25maWd1cmF0aW9uIGZvciBBV1MgQVBJIGNhbGxzIG9ubHlcbmNvbnN0IHN0YWNrID0gbmV3IEF1dGhJbmZyYVN0YWNrKGFwcCwgc3RhY2tOYW1lLCB7XG4gIGNvbmZpZ1Jlc3VsdDogY29uZmlnUmVzdWx0LFxuICBlbnY6IHtcbiAgICBhY2NvdW50OiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5ULFxuICAgIHJlZ2lvbjogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfUkVHSU9OIHx8ICdhcC1zb3V0aGVhc3QtMicsXG4gIH0sXG4gIHRhZ3M6IHtcbiAgICBQcm9qZWN0OiBQcm9qZWN0TmFtZSB8fCAnVEFLJyxcbiAgICBFbnZpcm9ubWVudDogY3VzdG9tU3RhY2tOYW1lLFxuICAgIENvbXBvbmVudDogJ0F1dGhJbmZyYScsXG4gICAgTWFuYWdlZEJ5OiAnQ0RLJywgICAgXG4gIH1cbn0pO1xuIl19