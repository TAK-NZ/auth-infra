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
// Note: r53ZoneName, vpcCidr, and networking config are now automatically imported from BaseInfra CloudFormation exports
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsaURBQW1DO0FBQ25DLDhEQUF5RDtBQUN6RCxzRUFBdUU7QUFDdkUsc0RBQTREO0FBQzVELDBEQUFnRTtBQUVoRSxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUUxQixzREFBc0Q7QUFDdEQsTUFBTSxPQUFPLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLElBQUksVUFBVSxDQUFDO0FBRTVELGlEQUFpRDtBQUNqRCxpRUFBaUU7QUFDakUsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDbEQsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUFDLENBQUM7QUFFeEQsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO0lBQ2YsTUFBTSxJQUFJLEtBQUssQ0FBQzttQ0FDaUIsT0FBTzs7Ozs7Ozs7Ozs7OztHQWF2QyxDQUFDLENBQUM7QUFDTCxDQUFDO0FBRUQsc0RBQXNEO0FBQ3RELGdFQUFnRTtBQUNoRSwrQ0FBK0M7QUFDL0MseUhBQXlIO0FBQ3pILE1BQU0sY0FBYyxHQUFHLElBQUEseUNBQXFCLEVBQUMsR0FBRyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0FBRTdELG9CQUFvQjtBQUNwQixNQUFNLFNBQVMsR0FBRyxPQUFPLGNBQWMsQ0FBQyxTQUFTLFlBQVksQ0FBQztBQUU5RCxtQkFBbUI7QUFDbkIsTUFBTSxLQUFLLEdBQUcsSUFBSSxpQ0FBYyxDQUFDLEdBQUcsRUFBRSxTQUFTLEVBQUU7SUFDL0MsV0FBVyxFQUFFLE9BQThCO0lBQzNDLFNBQVMsRUFBRSxjQUFjO0lBQ3pCLEdBQUcsRUFBRTtRQUNILE9BQU8sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQjtRQUN4QyxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsSUFBSSxRQUFRLEVBQUUsTUFBTSxJQUFJLDhCQUFrQjtLQUNqRjtJQUNELElBQUksRUFBRSxJQUFBLGtDQUFvQixFQUFDLGNBQWMsRUFBRSxPQUE4QixFQUFFLFFBQVEsQ0FBQztDQUNyRixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQXV0aEluZnJhU3RhY2sgfSBmcm9tICcuLi9saWIvYXV0aC1pbmZyYS1zdGFjayc7XG5pbXBvcnQgeyBhcHBseUNvbnRleHRPdmVycmlkZXMgfSBmcm9tICcuLi9saWIvdXRpbHMvY29udGV4dC1vdmVycmlkZXMnO1xuaW1wb3J0IHsgREVGQVVMVF9BV1NfUkVHSU9OIH0gZnJvbSAnLi4vbGliL3V0aWxzL2NvbnN0YW50cyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVN0YW5kYXJkVGFncyB9IGZyb20gJy4uL2xpYi91dGlscy90YWctaGVscGVycyc7XG5cbmNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG5cbi8vIEdldCBlbnZpcm9ubWVudCBmcm9tIGNvbnRleHQgKGRlZmF1bHRzIHRvIGRldi10ZXN0KVxuY29uc3QgZW52TmFtZSA9IGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2VudicpIHx8ICdkZXYtdGVzdCc7XG5cbi8vIEdldCB0aGUgZW52aXJvbm1lbnQgY29uZmlndXJhdGlvbiBmcm9tIGNvbnRleHRcbi8vIENESyBhdXRvbWF0aWNhbGx5IGhhbmRsZXMgY29udGV4dCBvdmVycmlkZXMgdmlhIC0tY29udGV4dCBmbGFnXG5jb25zdCBlbnZDb25maWcgPSBhcHAubm9kZS50cnlHZXRDb250ZXh0KGVudk5hbWUpO1xuY29uc3QgZGVmYXVsdHMgPSBhcHAubm9kZS50cnlHZXRDb250ZXh0KCd0YWstZGVmYXVsdHMnKTtcblxuaWYgKCFlbnZDb25maWcpIHtcbiAgdGhyb3cgbmV3IEVycm9yKGBcbuKdjCBFbnZpcm9ubWVudCBjb25maWd1cmF0aW9uIGZvciAnJHtlbnZOYW1lfScgbm90IGZvdW5kIGluIGNkay5qc29uXG5cblVzYWdlOlxuICBucHggY2RrIGRlcGxveSAtLWNvbnRleHQgZW52PWRldi10ZXN0XG4gIG5weCBjZGsgZGVwbG95IC0tY29udGV4dCBlbnY9cHJvZFxuXG5FeHBlY3RlZCBjZGsuanNvbiBzdHJ1Y3R1cmU6XG57XG4gIFwiY29udGV4dFwiOiB7XG4gICAgXCJkZXYtdGVzdFwiOiB7IC4uLiB9LFxuICAgIFwicHJvZFwiOiB7IC4uLiB9XG4gIH1cbn1cbiAgYCk7XG59XG5cbi8vIEFwcGx5IGNvbnRleHQgb3ZlcnJpZGVzIGZvciBub24tcHJlZml4ZWQgcGFyYW1ldGVyc1xuLy8gVGhpcyBzdXBwb3J0cyBkaXJlY3Qgb3ZlcnJpZGVzIHRoYXQgd29yayBmb3IgYW55IGVudmlyb25tZW50OlxuLy8gLS1jb250ZXh0IGRhdGFiYXNlLmluc3RhbmNlQ2xhc3M9ZGIudDMuc21hbGxcbi8vIE5vdGU6IHI1M1pvbmVOYW1lLCB2cGNDaWRyLCBhbmQgbmV0d29ya2luZyBjb25maWcgYXJlIG5vdyBhdXRvbWF0aWNhbGx5IGltcG9ydGVkIGZyb20gQmFzZUluZnJhIENsb3VkRm9ybWF0aW9uIGV4cG9ydHNcbmNvbnN0IGZpbmFsRW52Q29uZmlnID0gYXBwbHlDb250ZXh0T3ZlcnJpZGVzKGFwcCwgZW52Q29uZmlnKTtcblxuLy8gQ3JlYXRlIHN0YWNrIG5hbWVcbmNvbnN0IHN0YWNrTmFtZSA9IGBUQUstJHtmaW5hbEVudkNvbmZpZy5zdGFja05hbWV9LUF1dGhJbmZyYWA7XG5cbi8vIENyZWF0ZSB0aGUgc3RhY2tcbmNvbnN0IHN0YWNrID0gbmV3IEF1dGhJbmZyYVN0YWNrKGFwcCwgc3RhY2tOYW1lLCB7XG4gIGVudmlyb25tZW50OiBlbnZOYW1lIGFzICdwcm9kJyB8ICdkZXYtdGVzdCcsXG4gIGVudkNvbmZpZzogZmluYWxFbnZDb25maWcsXG4gIGVudjoge1xuICAgIGFjY291bnQ6IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQsXG4gICAgcmVnaW9uOiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9SRUdJT04gfHwgZGVmYXVsdHM/LnJlZ2lvbiB8fCBERUZBVUxUX0FXU19SRUdJT04sXG4gIH0sXG4gIHRhZ3M6IGdlbmVyYXRlU3RhbmRhcmRUYWdzKGZpbmFsRW52Q29uZmlnLCBlbnZOYW1lIGFzICdwcm9kJyB8ICdkZXYtdGVzdCcsIGRlZmF1bHRzKVxufSk7XG5cbiJdfQ==