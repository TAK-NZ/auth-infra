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
const context_overrides_1 = require("../lib/utils/context-overrides");
const constants_1 = require("../lib/utils/constants");
const tag_helpers_1 = require("../lib/utils/tag-helpers");
const app = new cdk.App();
// Get environment from context (defaults to dev-test)
const envName = app.node.tryGetContext('env') || 'dev-test';
// Get the environment configuration from context
// CDK automatically handles context overrides via --context flag
const envConfig = app.node.tryGetContext(envName);
const defaults = app.node.tryGetContext('tak-defaults');
if (!envConfig) {
    throw new Error(`
❌ Environment configuration for '${envName}' not found in cdk.json

Usage:
  npx cdk deploy --context env=dev-test
  npx cdk deploy --context env=prod

Expected cdk.json structure:
{
  "context": {
    "dev-test": { ... },
    "prod": { ... }
  }
}
  `);
}
// Apply context overrides for non-prefixed parameters
// This supports direct overrides that work for any environment:
// --context database.instanceClass=db.t3.small
const finalEnvConfig = (0, context_overrides_1.applyContextOverrides)(app, envConfig);
// Create stack name
const stackName = `TAK-${finalEnvConfig.stackName}-AuthInfra`;
// Create the stack
const stack = new auth_infra_stack_1.AuthInfraStack(app, stackName, {
    environment: envName,
    envConfig: finalEnvConfig,
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION || defaults?.region || constants_1.DEFAULT_AWS_REGION,
    },
    tags: (0, tag_helpers_1.generateStandardTags)(finalEnvConfig, envName, defaults)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsaURBQW1DO0FBQ25DLDhEQUF5RDtBQUN6RCxzRUFBdUU7QUFDdkUsc0RBQTREO0FBQzVELDBEQUFnRTtBQUVoRSxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUUxQixzREFBc0Q7QUFDdEQsTUFBTSxPQUFPLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLElBQUksVUFBVSxDQUFDO0FBRTVELGlEQUFpRDtBQUNqRCxpRUFBaUU7QUFDakUsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDbEQsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUFDLENBQUM7QUFFeEQsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO0lBQ2YsTUFBTSxJQUFJLEtBQUssQ0FBQzttQ0FDaUIsT0FBTzs7Ozs7Ozs7Ozs7OztHQWF2QyxDQUFDLENBQUM7QUFDTCxDQUFDO0FBRUQsc0RBQXNEO0FBQ3RELGdFQUFnRTtBQUNoRSwrQ0FBK0M7QUFDL0MsTUFBTSxjQUFjLEdBQUcsSUFBQSx5Q0FBcUIsRUFBQyxHQUFHLEVBQUUsU0FBUyxDQUFDLENBQUM7QUFFN0Qsb0JBQW9CO0FBQ3BCLE1BQU0sU0FBUyxHQUFHLE9BQU8sY0FBYyxDQUFDLFNBQVMsWUFBWSxDQUFDO0FBRTlELG1CQUFtQjtBQUNuQixNQUFNLEtBQUssR0FBRyxJQUFJLGlDQUFjLENBQUMsR0FBRyxFQUFFLFNBQVMsRUFBRTtJQUMvQyxXQUFXLEVBQUUsT0FBOEI7SUFDM0MsU0FBUyxFQUFFLGNBQWM7SUFDekIsR0FBRyxFQUFFO1FBQ0gsT0FBTyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CO1FBQ3hDLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixJQUFJLFFBQVEsRUFBRSxNQUFNLElBQUksOEJBQWtCO0tBQ2pGO0lBQ0QsSUFBSSxFQUFFLElBQUEsa0NBQW9CLEVBQUMsY0FBYyxFQUFFLE9BQThCLEVBQUUsUUFBUSxDQUFDO0NBQ3JGLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBBdXRoSW5mcmFTdGFjayB9IGZyb20gJy4uL2xpYi9hdXRoLWluZnJhLXN0YWNrJztcbmltcG9ydCB7IGFwcGx5Q29udGV4dE92ZXJyaWRlcyB9IGZyb20gJy4uL2xpYi91dGlscy9jb250ZXh0LW92ZXJyaWRlcyc7XG5pbXBvcnQgeyBERUZBVUxUX0FXU19SRUdJT04gfSBmcm9tICcuLi9saWIvdXRpbHMvY29uc3RhbnRzJztcbmltcG9ydCB7IGdlbmVyYXRlU3RhbmRhcmRUYWdzIH0gZnJvbSAnLi4vbGliL3V0aWxzL3RhZy1oZWxwZXJzJztcblxuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcblxuLy8gR2V0IGVudmlyb25tZW50IGZyb20gY29udGV4dCAoZGVmYXVsdHMgdG8gZGV2LXRlc3QpXG5jb25zdCBlbnZOYW1lID0gYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnZW52JykgfHwgJ2Rldi10ZXN0JztcblxuLy8gR2V0IHRoZSBlbnZpcm9ubWVudCBjb25maWd1cmF0aW9uIGZyb20gY29udGV4dFxuLy8gQ0RLIGF1dG9tYXRpY2FsbHkgaGFuZGxlcyBjb250ZXh0IG92ZXJyaWRlcyB2aWEgLS1jb250ZXh0IGZsYWdcbmNvbnN0IGVudkNvbmZpZyA9IGFwcC5ub2RlLnRyeUdldENvbnRleHQoZW52TmFtZSk7XG5jb25zdCBkZWZhdWx0cyA9IGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ3Rhay1kZWZhdWx0cycpO1xuXG5pZiAoIWVudkNvbmZpZykge1xuICB0aHJvdyBuZXcgRXJyb3IoYFxu4p2MIEVudmlyb25tZW50IGNvbmZpZ3VyYXRpb24gZm9yICcke2Vudk5hbWV9JyBub3QgZm91bmQgaW4gY2RrLmpzb25cblxuVXNhZ2U6XG4gIG5weCBjZGsgZGVwbG95IC0tY29udGV4dCBlbnY9ZGV2LXRlc3RcbiAgbnB4IGNkayBkZXBsb3kgLS1jb250ZXh0IGVudj1wcm9kXG5cbkV4cGVjdGVkIGNkay5qc29uIHN0cnVjdHVyZTpcbntcbiAgXCJjb250ZXh0XCI6IHtcbiAgICBcImRldi10ZXN0XCI6IHsgLi4uIH0sXG4gICAgXCJwcm9kXCI6IHsgLi4uIH1cbiAgfVxufVxuICBgKTtcbn1cblxuLy8gQXBwbHkgY29udGV4dCBvdmVycmlkZXMgZm9yIG5vbi1wcmVmaXhlZCBwYXJhbWV0ZXJzXG4vLyBUaGlzIHN1cHBvcnRzIGRpcmVjdCBvdmVycmlkZXMgdGhhdCB3b3JrIGZvciBhbnkgZW52aXJvbm1lbnQ6XG4vLyAtLWNvbnRleHQgZGF0YWJhc2UuaW5zdGFuY2VDbGFzcz1kYi50My5zbWFsbFxuY29uc3QgZmluYWxFbnZDb25maWcgPSBhcHBseUNvbnRleHRPdmVycmlkZXMoYXBwLCBlbnZDb25maWcpO1xuXG4vLyBDcmVhdGUgc3RhY2sgbmFtZVxuY29uc3Qgc3RhY2tOYW1lID0gYFRBSy0ke2ZpbmFsRW52Q29uZmlnLnN0YWNrTmFtZX0tQXV0aEluZnJhYDtcblxuLy8gQ3JlYXRlIHRoZSBzdGFja1xuY29uc3Qgc3RhY2sgPSBuZXcgQXV0aEluZnJhU3RhY2soYXBwLCBzdGFja05hbWUsIHtcbiAgZW52aXJvbm1lbnQ6IGVudk5hbWUgYXMgJ3Byb2QnIHwgJ2Rldi10ZXN0JyxcbiAgZW52Q29uZmlnOiBmaW5hbEVudkNvbmZpZyxcbiAgZW52OiB7XG4gICAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCxcbiAgICByZWdpb246IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTiB8fCBkZWZhdWx0cz8ucmVnaW9uIHx8IERFRkFVTFRfQVdTX1JFR0lPTixcbiAgfSxcbiAgdGFnczogZ2VuZXJhdGVTdGFuZGFyZFRhZ3MoZmluYWxFbnZDb25maWcsIGVudk5hbWUgYXMgJ3Byb2QnIHwgJ2Rldi10ZXN0JywgZGVmYXVsdHMpXG59KTtcblxuIl19