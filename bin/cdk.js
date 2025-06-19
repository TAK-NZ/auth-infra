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
// --context r53ZoneName=custom.domain.com
// --context networking.createNatGateways=true
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsaURBQW1DO0FBQ25DLDhEQUF5RDtBQUN6RCxzRUFBdUU7QUFDdkUsc0RBQTREO0FBQzVELDBEQUFnRTtBQUVoRSxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUUxQixzREFBc0Q7QUFDdEQsTUFBTSxPQUFPLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLElBQUksVUFBVSxDQUFDO0FBRTVELGlEQUFpRDtBQUNqRCxpRUFBaUU7QUFDakUsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDbEQsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUFDLENBQUM7QUFFeEQsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO0lBQ2YsTUFBTSxJQUFJLEtBQUssQ0FBQzttQ0FDaUIsT0FBTzs7Ozs7Ozs7Ozs7OztHQWF2QyxDQUFDLENBQUM7QUFDTCxDQUFDO0FBRUQsc0RBQXNEO0FBQ3RELGdFQUFnRTtBQUNoRSwwQ0FBMEM7QUFDMUMsOENBQThDO0FBQzlDLCtDQUErQztBQUMvQyxNQUFNLGNBQWMsR0FBRyxJQUFBLHlDQUFxQixFQUFDLEdBQUcsRUFBRSxTQUFTLENBQUMsQ0FBQztBQUU3RCxvQkFBb0I7QUFDcEIsTUFBTSxTQUFTLEdBQUcsT0FBTyxjQUFjLENBQUMsU0FBUyxZQUFZLENBQUM7QUFFOUQsbUJBQW1CO0FBQ25CLE1BQU0sS0FBSyxHQUFHLElBQUksaUNBQWMsQ0FBQyxHQUFHLEVBQUUsU0FBUyxFQUFFO0lBQy9DLFdBQVcsRUFBRSxPQUE4QjtJQUMzQyxTQUFTLEVBQUUsY0FBYztJQUN6QixHQUFHLEVBQUU7UUFDSCxPQUFPLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUI7UUFDeEMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLElBQUksUUFBUSxFQUFFLE1BQU0sSUFBSSw4QkFBa0I7S0FDakY7SUFDRCxJQUFJLEVBQUUsSUFBQSxrQ0FBb0IsRUFBQyxjQUFjLEVBQUUsT0FBOEIsRUFBRSxRQUFRLENBQUM7Q0FDckYsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IEF1dGhJbmZyYVN0YWNrIH0gZnJvbSAnLi4vbGliL2F1dGgtaW5mcmEtc3RhY2snO1xuaW1wb3J0IHsgYXBwbHlDb250ZXh0T3ZlcnJpZGVzIH0gZnJvbSAnLi4vbGliL3V0aWxzL2NvbnRleHQtb3ZlcnJpZGVzJztcbmltcG9ydCB7IERFRkFVTFRfQVdTX1JFR0lPTiB9IGZyb20gJy4uL2xpYi91dGlscy9jb25zdGFudHMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVTdGFuZGFyZFRhZ3MgfSBmcm9tICcuLi9saWIvdXRpbHMvdGFnLWhlbHBlcnMnO1xuXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuXG4vLyBHZXQgZW52aXJvbm1lbnQgZnJvbSBjb250ZXh0IChkZWZhdWx0cyB0byBkZXYtdGVzdClcbmNvbnN0IGVudk5hbWUgPSBhcHAubm9kZS50cnlHZXRDb250ZXh0KCdlbnYnKSB8fCAnZGV2LXRlc3QnO1xuXG4vLyBHZXQgdGhlIGVudmlyb25tZW50IGNvbmZpZ3VyYXRpb24gZnJvbSBjb250ZXh0XG4vLyBDREsgYXV0b21hdGljYWxseSBoYW5kbGVzIGNvbnRleHQgb3ZlcnJpZGVzIHZpYSAtLWNvbnRleHQgZmxhZ1xuY29uc3QgZW52Q29uZmlnID0gYXBwLm5vZGUudHJ5R2V0Q29udGV4dChlbnZOYW1lKTtcbmNvbnN0IGRlZmF1bHRzID0gYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgndGFrLWRlZmF1bHRzJyk7XG5cbmlmICghZW52Q29uZmlnKSB7XG4gIHRocm93IG5ldyBFcnJvcihgXG7inYwgRW52aXJvbm1lbnQgY29uZmlndXJhdGlvbiBmb3IgJyR7ZW52TmFtZX0nIG5vdCBmb3VuZCBpbiBjZGsuanNvblxuXG5Vc2FnZTpcbiAgbnB4IGNkayBkZXBsb3kgLS1jb250ZXh0IGVudj1kZXYtdGVzdFxuICBucHggY2RrIGRlcGxveSAtLWNvbnRleHQgZW52PXByb2RcblxuRXhwZWN0ZWQgY2RrLmpzb24gc3RydWN0dXJlOlxue1xuICBcImNvbnRleHRcIjoge1xuICAgIFwiZGV2LXRlc3RcIjogeyAuLi4gfSxcbiAgICBcInByb2RcIjogeyAuLi4gfVxuICB9XG59XG4gIGApO1xufVxuXG4vLyBBcHBseSBjb250ZXh0IG92ZXJyaWRlcyBmb3Igbm9uLXByZWZpeGVkIHBhcmFtZXRlcnNcbi8vIFRoaXMgc3VwcG9ydHMgZGlyZWN0IG92ZXJyaWRlcyB0aGF0IHdvcmsgZm9yIGFueSBlbnZpcm9ubWVudDpcbi8vIC0tY29udGV4dCByNTNab25lTmFtZT1jdXN0b20uZG9tYWluLmNvbVxuLy8gLS1jb250ZXh0IG5ldHdvcmtpbmcuY3JlYXRlTmF0R2F0ZXdheXM9dHJ1ZVxuLy8gLS1jb250ZXh0IGRhdGFiYXNlLmluc3RhbmNlQ2xhc3M9ZGIudDMuc21hbGxcbmNvbnN0IGZpbmFsRW52Q29uZmlnID0gYXBwbHlDb250ZXh0T3ZlcnJpZGVzKGFwcCwgZW52Q29uZmlnKTtcblxuLy8gQ3JlYXRlIHN0YWNrIG5hbWVcbmNvbnN0IHN0YWNrTmFtZSA9IGBUQUstJHtmaW5hbEVudkNvbmZpZy5zdGFja05hbWV9LUF1dGhJbmZyYWA7XG5cbi8vIENyZWF0ZSB0aGUgc3RhY2tcbmNvbnN0IHN0YWNrID0gbmV3IEF1dGhJbmZyYVN0YWNrKGFwcCwgc3RhY2tOYW1lLCB7XG4gIGVudmlyb25tZW50OiBlbnZOYW1lIGFzICdwcm9kJyB8ICdkZXYtdGVzdCcsXG4gIGVudkNvbmZpZzogZmluYWxFbnZDb25maWcsXG4gIGVudjoge1xuICAgIGFjY291bnQ6IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQsXG4gICAgcmVnaW9uOiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9SRUdJT04gfHwgZGVmYXVsdHM/LnJlZ2lvbiB8fCBERUZBVUxUX0FXU19SRUdJT04sXG4gIH0sXG4gIHRhZ3M6IGdlbmVyYXRlU3RhbmRhcmRUYWdzKGZpbmFsRW52Q29uZmlnLCBlbnZOYW1lIGFzICdwcm9kJyB8ICdkZXYtdGVzdCcsIGRlZmF1bHRzKVxufSk7XG5cbiJdfQ==