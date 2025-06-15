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
const stack_naming_1 = require("../lib/stack-naming");
const app = new cdk.App();
// Read project tag with cascading priority:
// Priority: 1. Environment Variables, 2. CLI Context, 3. Defaults
const projectTag = process.env.PROJECT ||
    app.node.tryGetContext('project') ||
    stack_naming_1.FIXED_STACK_CONFIG.PROJECT;
const envType = process.env.ENV_TYPE ||
    app.node.tryGetContext('envType') ||
    'dev-test';
const stackNameSuffix = process.env.STACK_NAME ||
    app.node.tryGetContext('stackName') ||
    'MyFirstStack';
// Generate consistent stack name using the utility function
const stackName = (0, stack_naming_1.generateStackName)({
    project: stack_naming_1.FIXED_STACK_CONFIG.PROJECT,
    environment: stackNameSuffix,
    component: stack_naming_1.FIXED_STACK_CONFIG.COMPONENT
});
// Tag every resource in the stack with the project name
cdk.Tags.of(app).add("Project", projectTag);
// Deploy main auth infrastructure stack (contains both Authentik and LDAP)
new auth_infra_stack_1.AuthInfraStack(app, stackName, {
    envType: envType,
    // Environment can be resolved from AWS profile or environment variables
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT || process.env.CDK_DEPLOY_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION || process.env.CDK_DEPLOY_REGION || 'ap-southeast-2'
    },
    description: 'TAK Authentication Layer - Authentik & LDAP',
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsaURBQW1DO0FBQ25DLDhEQUF5RDtBQUN6RCxzREFBNEU7QUFFNUUsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7QUFFMUIsNENBQTRDO0FBQzVDLGtFQUFrRTtBQUNsRSxNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU87SUFDbkIsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDO0lBQ2pDLGlDQUFrQixDQUFDLE9BQU8sQ0FBQztBQUU5QyxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVE7SUFDckIsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDO0lBQ2pDLFVBQVUsQ0FBQztBQUUxQixNQUFNLGVBQWUsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVU7SUFDdkIsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDO0lBQ25DLGNBQWMsQ0FBQztBQUV0Qyw0REFBNEQ7QUFDNUQsTUFBTSxTQUFTLEdBQUcsSUFBQSxnQ0FBaUIsRUFBQztJQUNsQyxPQUFPLEVBQUUsaUNBQWtCLENBQUMsT0FBTztJQUNuQyxXQUFXLEVBQUUsZUFBZTtJQUM1QixTQUFTLEVBQUUsaUNBQWtCLENBQUMsU0FBUztDQUN4QyxDQUFDLENBQUM7QUFFSCx3REFBd0Q7QUFDeEQsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxVQUFVLENBQUMsQ0FBQztBQUU1QywyRUFBMkU7QUFDM0UsSUFBSSxpQ0FBYyxDQUFDLEdBQUcsRUFBRSxTQUFTLEVBQUU7SUFDakMsT0FBTyxFQUFFLE9BQThCO0lBRXZDLHdFQUF3RTtJQUN4RSxHQUFHLEVBQUU7UUFDSCxPQUFPLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQjtRQUMxRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixJQUFJLGdCQUFnQjtLQUM1RjtJQUVELFdBQVcsRUFBRSw2Q0FBNkM7Q0FDM0QsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IEF1dGhJbmZyYVN0YWNrIH0gZnJvbSAnLi4vbGliL2F1dGgtaW5mcmEtc3RhY2snO1xuaW1wb3J0IHsgZ2VuZXJhdGVTdGFja05hbWUsIEZJWEVEX1NUQUNLX0NPTkZJRyB9IGZyb20gJy4uL2xpYi9zdGFjay1uYW1pbmcnO1xuXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuXG4vLyBSZWFkIHByb2plY3QgdGFnIHdpdGggY2FzY2FkaW5nIHByaW9yaXR5OlxuLy8gUHJpb3JpdHk6IDEuIEVudmlyb25tZW50IFZhcmlhYmxlcywgMi4gQ0xJIENvbnRleHQsIDMuIERlZmF1bHRzXG5jb25zdCBwcm9qZWN0VGFnID0gcHJvY2Vzcy5lbnYuUFJPSkVDVCB8fCBcbiAgICAgICAgICAgICAgICAgICBhcHAubm9kZS50cnlHZXRDb250ZXh0KCdwcm9qZWN0JykgfHwgXG4gICAgICAgICAgICAgICAgICAgRklYRURfU1RBQ0tfQ09ORklHLlBST0pFQ1Q7XG5cbmNvbnN0IGVudlR5cGUgPSBwcm9jZXNzLmVudi5FTlZfVFlQRSB8fCBcbiAgICAgICAgICAgICAgIGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2VudlR5cGUnKSB8fCBcbiAgICAgICAgICAgICAgICdkZXYtdGVzdCc7XG5cbmNvbnN0IHN0YWNrTmFtZVN1ZmZpeCA9IHByb2Nlc3MuZW52LlNUQUNLX05BTUUgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgIGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ3N0YWNrTmFtZScpIHx8IFxuICAgICAgICAgICAgICAgICAgICAgICAnTXlGaXJzdFN0YWNrJztcblxuLy8gR2VuZXJhdGUgY29uc2lzdGVudCBzdGFjayBuYW1lIHVzaW5nIHRoZSB1dGlsaXR5IGZ1bmN0aW9uXG5jb25zdCBzdGFja05hbWUgPSBnZW5lcmF0ZVN0YWNrTmFtZSh7XG4gIHByb2plY3Q6IEZJWEVEX1NUQUNLX0NPTkZJRy5QUk9KRUNULFxuICBlbnZpcm9ubWVudDogc3RhY2tOYW1lU3VmZml4LFxuICBjb21wb25lbnQ6IEZJWEVEX1NUQUNLX0NPTkZJRy5DT01QT05FTlRcbn0pO1xuXG4vLyBUYWcgZXZlcnkgcmVzb3VyY2UgaW4gdGhlIHN0YWNrIHdpdGggdGhlIHByb2plY3QgbmFtZVxuY2RrLlRhZ3Mub2YoYXBwKS5hZGQoXCJQcm9qZWN0XCIsIHByb2plY3RUYWcpO1xuXG4vLyBEZXBsb3kgbWFpbiBhdXRoIGluZnJhc3RydWN0dXJlIHN0YWNrIChjb250YWlucyBib3RoIEF1dGhlbnRpayBhbmQgTERBUClcbm5ldyBBdXRoSW5mcmFTdGFjayhhcHAsIHN0YWNrTmFtZSwge1xuICBlbnZUeXBlOiBlbnZUeXBlIGFzICdwcm9kJyB8ICdkZXYtdGVzdCcsXG4gIFxuICAvLyBFbnZpcm9ubWVudCBjYW4gYmUgcmVzb2x2ZWQgZnJvbSBBV1MgcHJvZmlsZSBvciBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgZW52OiB7XG4gICAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCB8fCBwcm9jZXNzLmVudi5DREtfREVQTE9ZX0FDQ09VTlQsXG4gICAgcmVnaW9uOiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9SRUdJT04gfHwgcHJvY2Vzcy5lbnYuQ0RLX0RFUExPWV9SRUdJT04gfHwgJ2FwLXNvdXRoZWFzdC0yJ1xuICB9LFxuICBcbiAgZGVzY3JpcHRpb246ICdUQUsgQXV0aGVudGljYXRpb24gTGF5ZXIgLSBBdXRoZW50aWsgJiBMREFQJyxcbn0pO1xuIl19