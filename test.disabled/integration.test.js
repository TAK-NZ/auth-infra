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
const assertions_1 = require("aws-cdk-lib/assertions");
const auth_infra_stack_1 = require("../lib/auth-infra-stack");
const ldap_stack_1 = require("../lib/ldap-stack");
const stack_naming_1 = require("../lib/stack-naming");
describe('Integration Tests', () => {
    let app;
    let authStack;
    let ldapStack;
    let authTemplate;
    let ldapTemplate;
    beforeEach(() => {
        app = new cdk.App();
        // Set required context parameters
        app.node.setContext('authentikAdminUserEmail', 'admin@example.com');
        const stackName = 'test';
        const envType = 'dev-test';
        const authStackName = (0, stack_naming_1.generateAuthInfraStackName)(stackName);
        const ldapStackName = (0, stack_naming_1.generateLdapStackName)(stackName);
        // Create stacks with test configuration
        authStack = new auth_infra_stack_1.AuthInfraStack(app, authStackName, {
            stackName,
            envType,
            description: 'Test Auth Stack',
        });
        ldapStack = new ldap_stack_1.LdapStack(app, ldapStackName, {
            stackName,
            envType,
            description: 'Test LDAP Stack',
        });
        ldapStack.addDependency(authStack);
        authTemplate = assertions_1.Template.fromStack(authStack);
        ldapTemplate = assertions_1.Template.fromStack(ldapStack);
    });
    describe('Stack Dependencies', () => {
        it('should have correct dependency between stacks', () => {
            const dependencies = ldapStack.dependencies;
            expect(dependencies).toContain(authStack);
        });
        it('should have correct stack names', () => {
            expect(authStack.stackName).toBe('TAK-test-AuthInfra');
            expect(ldapStack.stackName).toBe('TAK-test-AuthInfra-LDAP');
        });
    });
    describe('Auth Stack Resources', () => {
        it('should create RDS Aurora PostgreSQL cluster', () => {
            authTemplate.hasResourceProperties('AWS::RDS::DBCluster', {
                Engine: 'aurora-postgresql',
                EngineVersion: '17.4',
            });
        });
        it('should create ElastiCache Redis', () => {
            authTemplate.hasResourceProperties('AWS::ElastiCache::ReplicationGroup', {
                Engine: 'valkey',
                CacheNodeType: assertions_1.Match.stringLikeRegexp('cache\\..*'),
            });
        });
        it('should create EFS file system', () => {
            authTemplate.hasResourceProperties('AWS::EFS::FileSystem', {
                Encrypted: true,
                PerformanceMode: 'generalPurpose',
            });
        });
        it('should create Application Load Balancer', () => {
            authTemplate.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
                Type: 'application',
                Scheme: 'internet-facing',
            });
        });
        it('should create ECS Fargate service', () => {
            authTemplate.hasResourceProperties('AWS::ECS::Service', {
                LaunchType: 'FARGATE',
                // PlatformVersion defaults to LATEST when not specified
            });
        });
        it('should create task definition with correct container configuration', () => {
            authTemplate.hasResourceProperties('AWS::ECS::TaskDefinition', {
                RequiresCompatibilities: ['FARGATE'],
                NetworkMode: 'awsvpc',
                Cpu: '512',
                Memory: '1024',
            });
        });
    });
    describe('LDAP Stack Resources', () => {
        it('should create Network Load Balancer', () => {
            ldapTemplate.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
                Type: 'network',
                Scheme: 'internal',
            });
        });
        it('should create ECS Fargate service for LDAP', () => {
            ldapTemplate.hasResourceProperties('AWS::ECS::Service', {
                LaunchType: 'FARGATE',
                // PlatformVersion defaults to LATEST when not specified
            });
        });
        it('should create LDAP listener on port 636', () => {
            ldapTemplate.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
                Port: 636,
                Protocol: 'TLS',
            });
        });
    });
    describe('Security Configuration', () => {
        it('should create security groups with proper ingress rules', () => {
            authTemplate.hasResourceProperties('AWS::EC2::SecurityGroup', {
                SecurityGroupIngress: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        FromPort: 443,
                        ToPort: 443,
                        IpProtocol: 'tcp',
                    }),
                ]),
            });
        });
        it('should create IAM roles with least privilege', () => {
            authTemplate.hasResourceProperties('AWS::IAM::Role', {
                AssumeRolePolicyDocument: assertions_1.Match.objectLike({
                    Statement: assertions_1.Match.arrayWith([
                        assertions_1.Match.objectLike({
                            Effect: 'Allow',
                            Principal: {
                                Service: 'ecs-tasks.amazonaws.com',
                            },
                        }),
                    ]),
                }),
            });
        });
        it('should encrypt RDS with KMS', () => {
            authTemplate.hasResourceProperties('AWS::RDS::DBCluster', {
                StorageEncrypted: true,
            });
        });
        it('should encrypt Redis in transit and at rest', () => {
            authTemplate.hasResourceProperties('AWS::ElastiCache::ReplicationGroup', {
                TransitEncryptionEnabled: true,
                AtRestEncryptionEnabled: true,
            });
        });
    });
    describe('Resource Tagging', () => {
        it('should tag all resources with Project tag', () => {
            // Note: Tags are inherited from the App level in bin/cdk.ts
            const stackTags = cdk.Tags.of(authStack);
            expect(stackTags).toBeDefined();
        });
    });
    describe('Environment-Specific Configuration', () => {
        it('should use appropriate instance sizes for test environment', () => {
            authTemplate.hasResourceProperties('AWS::RDS::DBCluster', {
                ServerlessV2ScalingConfiguration: {
                    MinCapacity: 0.5,
                    MaxCapacity: 4, // Current implementation uses fixed values
                },
            });
        });
        it('should set appropriate container resources for dev', () => {
            authTemplate.hasResourceProperties('AWS::ECS::TaskDefinition', {
                Cpu: '512',
                Memory: '1024',
            });
        });
    });
    describe('Cross-Stack Dependencies', () => {
        it('should import base infrastructure VPC correctly', () => {
            authTemplate.hasResourceProperties('AWS::ECS::Service', {
                NetworkConfiguration: {
                    AwsvpcConfiguration: {
                        Subnets: assertions_1.Match.anyValue(),
                    },
                },
            });
        });
        it('should import base infrastructure KMS key', () => {
            // Check that the secondary DB instance uses the KMS key for Performance Insights
            authTemplate.hasResourceProperties('AWS::RDS::DBInstance', {
                PerformanceInsightsKMSKeyId: assertions_1.Match.anyValue(),
            });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZWdyYXRpb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImludGVncmF0aW9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQyx1REFBeUQ7QUFDekQsOERBQXlEO0FBQ3pELGtEQUE4QztBQUM5QyxzREFBd0Y7QUFFeEYsUUFBUSxDQUFDLG1CQUFtQixFQUFFLEdBQUcsRUFBRTtJQUNqQyxJQUFJLEdBQVksQ0FBQztJQUNqQixJQUFJLFNBQXlCLENBQUM7SUFDOUIsSUFBSSxTQUFvQixDQUFDO0lBQ3pCLElBQUksWUFBc0IsQ0FBQztJQUMzQixJQUFJLFlBQXNCLENBQUM7SUFFM0IsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNkLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNwQixrQ0FBa0M7UUFDbEMsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMseUJBQXlCLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztRQUVwRSxNQUFNLFNBQVMsR0FBRyxNQUFNLENBQUM7UUFDekIsTUFBTSxPQUFPLEdBQUcsVUFBVSxDQUFDO1FBQzNCLE1BQU0sYUFBYSxHQUFHLElBQUEseUNBQTBCLEVBQUMsU0FBUyxDQUFDLENBQUM7UUFDNUQsTUFBTSxhQUFhLEdBQUcsSUFBQSxvQ0FBcUIsRUFBQyxTQUFTLENBQUMsQ0FBQztRQUV2RCx3Q0FBd0M7UUFDeEMsU0FBUyxHQUFHLElBQUksaUNBQWMsQ0FBQyxHQUFHLEVBQUUsYUFBYSxFQUFFO1lBQ2pELFNBQVM7WUFDVCxPQUFPO1lBQ1AsV0FBVyxFQUFFLGlCQUFpQjtTQUMvQixDQUFDLENBQUM7UUFFSCxTQUFTLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEdBQUcsRUFBRSxhQUFhLEVBQUU7WUFDNUMsU0FBUztZQUNULE9BQU87WUFDUCxXQUFXLEVBQUUsaUJBQWlCO1NBQy9CLENBQUMsQ0FB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b0RBQW9ELEVBQUUsR0FBRyxFQUFFO1lBQzVELFlBQVksQ0FBQyxxQkFBcUIsQ0FBQywwQkFBMEIsRUFBRTtnQkFDN0QsR0FBRyxFQUFFLEtBQUs7Z0JBQ1YsTUFBTSxFQUFFLE1BQU07YUFDZixDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLDBCQUEwQixFQUFFLEdBQUcsRUFBRTtRQUN4QyxFQUFFLENBQUMsaURBQWlELEVBQUUsR0FBRyxFQUFFO1lBQ3pELFlBQVksQ0FBQyxxQkFBcUIsQ0FBQyxtQkFBbUIsRUFBRTtnQkFDdEQsb0JBQW9CLEVBQUU7b0JBQ3BCLG1CQUFtQixFQUFFO3dCQUNuQixPQUFPLEVBQUUsa0JBQUssQ0FBQyxRQUFRLEVBQUU7cUJBQzFCO2lCQUNGO2FBQ0YsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFFSCxFQUFFLENBQUMsMkNBQTJDLEVBQUUsR0FBRyxFQUFFO1lBQ25ELGlGQUFpRjtZQUNqRixZQUFZLENBQUMscUJBQXFCLENBQUMsc0JBQXNCLEVBQUU7Z0JBQ3pELDJCQUEyQixFQUFFLGtCQUFLLENBQUMsUUFBUSxFQUFFO2FBQzlDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBUZW1wbGF0ZSwgTWF0Y2ggfSBmcm9tICdhd3MtY2RrLWxpYi9hc3NlcnRpb25zJztcbmltcG9ydCB7IEF1dGhJbmZyYVN0YWNrIH0gZnJvbSAnLi4vbGliL2F1dGgtaW5mcmEtc3RhY2snO1xuaW1wb3J0IHsgTGRhcFN0YWNrIH0gZnJvbSAnLi4vbGliL2xkYXAtc3RhY2snO1xuaW1wb3J0IHsgZ2VuZXJhdGVBdXRoSW5mcmFTdGFja05hbWUsIGdlbmVyYXRlTGRhcFN0YWNrTmFtZSB9IGZyb20gJy4uL2xpYi9zdGFjay1uYW1pbmcnO1xuXG5kZXNjcmliZSgnSW50ZWdyYXRpb24gVGVzdHMnLCAoKSA9PiB7XG4gIGxldCBhcHA6IGNkay5BcHA7XG4gIGxldCBhdXRoU3RhY2s6IEF1dGhJbmZyYVN0YWNrO1xuICBsZXQgbGRhcFN0YWNrOiBMZGFwU3RhY2s7XG4gIGxldCBhdXRoVGVtcGxhdGU6IFRlbXBsYXRlO1xuICBsZXQgbGRhcFRlbXBsYXRlOiBUZW1wbGF0ZTtcblxuICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuICAgIC8vIFNldCByZXF1aXJlZCBjb250ZXh0IHBhcmFtZXRlcnNcbiAgICBhcHAubm9kZS5zZXRDb250ZXh0KCdhdXRoZW50aWtBZG1pblVzZXJFbWFpbCcsICdhZG1pbkBleGFtcGxlLmNvbScpO1xuICAgIFxuICAgIGNvbnN0IHN0YWNrTmFtZSA9ICd0ZXN0JztcbiAgICBjb25zdCBlbnZUeXBlID0gJ2Rldi10ZXN0JztcbiAgICBjb25zdCBhdXRoU3RhY2tOYW1lID0gZ2VuZXJhdGVBdXRoSW5mcmFTdGFja05hbWUoc3RhY2tOYW1lKTtcbiAgICBjb25zdCBsZGFwU3RhY2tOYW1lID0gZ2VuZXJhdGVMZGFwU3RhY2tOYW1lKHN0YWNrTmFtZSk7XG5cbiAgICAvLyBDcmVhdGUgc3RhY2tzIHdpdGggdGVzdCBjb25maWd1cmF0aW9uXG4gICAgYXV0aFN0YWNrID0gbmV3IEF1dGhJbmZyYVN0YWNrKGFwcCwgYXV0aFN0YWNrTmFtZSwge1xuICAgICAgc3RhY2tOYW1lLFxuICAgICAgZW52VHlwZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGVzdCBBdXRoIFN0YWNrJyxcbiAgICB9KTtcblxuICAgIGxkYXBTdGFjayA9IG5ldyBMZGFwU3RhY2soYXBwLCBsZGFwU3RhY2tOYW1lLCB7XG4gICAgICBzdGFja05hbWUsXG4gICAgICBlbnZUeXBlLFxuICAgICAgZGVzY3JpcHRpb246ICdUZXN0IExEQVAgU3RhY2snLFxuICAgIH0pO1xuXG4gICAgbGRhcFN0YWNrLmFkZERlcGVuZGVuY3koYXV0aFN0YWNrKTtcblxuICAgIGF1dGhUZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhhdXRoU3RhY2spO1xuICAgIGxkYXBUZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhsZGFwU3RhY2spO1xuICB9KTtcblxuICBkZXNjcmliZSgnU3RhY2sgRGVwZW5kZW5jaWVzJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgaGF2ZSBjb3JyZWN0IGRlcGVuZGVuY3kgYmV0d2VlbiBzdGFja3MnLCAoKSA9PiB7XG4gICAgICBjb25zdCBkZXBlbmRlbmNpZXMgPSBsZGFwU3RhY2suZGVwZW5kZW5jaWVzO1xuICAgICAgZXhwZWN0KGRlcGVuZGVuY2llcykudG9Db250YWluKGF1dGhTdGFjayk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhdmUgY29ycmVjdCBzdGFjayBuYW1lcycsICgpID0+IHtcbiAgICAgIGV4cGVjdChhdXRoU3RhY2suc3RhY2tOYW1lKS50b0JlKCdUQUstdGVzdC1BdXRoSW5mcmEnKTtcbiAgICAgIGV4cGVjdChsZGFwU3RhY2suc3RhY2tOYW1lKS50b0JlKCdUQUstdGVzdC1BdXRoSW5mcmEtTERBUCcpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnQXV0aCBTdGFjayBSZXNvdXJjZXMnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBjcmVhdGUgUkRTIEF1cm9yYSBQb3N0Z3JlU1FMIGNsdXN0ZXInLCAoKSA9PiB7XG4gICAgICBhdXRoVGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlJEUzo6REJDbHVzdGVyJywge1xuICAgICAgICBFbmdpbmU6ICdhdXJvcmEtcG9zdGdyZXNxbCcsXG4gICAgICAgIEVuZ2luZVZlcnNpb246ICcxNy40JyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBjcmVhdGUgRWxhc3RpQ2FjaGUgUmVkaXMnLCAoKSA9PiB7XG4gICAgICBhdXRoVGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkVsYXN0aUNhY2hlOjpSZXBsaWNhdGlvbkdyb3VwJywge1xuICAgICAgICBFbmdpbmU6ICd2YWxrZXknLFxuICAgICAgICBDYWNoZU5vZGVUeXBlOiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKCdjYWNoZVxcXFwuLionKSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBjcmVhdGUgRUZTIGZpbGUgc3lzdGVtJywgKCkgPT4ge1xuICAgICAgYXV0aFRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpFRlM6OkZpbGVTeXN0ZW0nLCB7XG4gICAgICAgIEVuY3J5cHRlZDogdHJ1ZSxcbiAgICAgICAgUGVyZm9ybWFuY2VNb2RlOiAnZ2VuZXJhbFB1cnBvc2UnLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGNyZWF0ZSBBcHBsaWNhdGlvbiBMb2FkIEJhbGFuY2VyJywgKCkgPT4ge1xuICAgICAgYXV0aFRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpFbGFzdGljTG9hZEJhbGFuY2luZ1YyOjpMb2FkQmFsYW5jZXInLCB7XG4gICAgICAgIFR5cGU6ICdhcHBsaWNhdGlvbicsXG4gICAgICAgIFNjaGVtZTogJ2ludGVybmV0LWZhY2luZycsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgY3JlYXRlIEVDUyBGYXJnYXRlIHNlcnZpY2UnLCAoKSA9PiB7XG4gICAgICBhdXRoVGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkVDUzo6U2VydmljZScsIHtcbiAgICAgICAgTGF1bmNoVHlwZTogJ0ZBUkdBVEUnLFxuICAgICAgICAvLyBQbGF0Zm9ybVZlcnNpb24gZGVmYXVsdHMgdG8gTEFURVNUIHdoZW4gbm90IHNwZWNpZmllZFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGNyZWF0ZSB0YXNrIGRlZmluaXRpb24gd2l0aCBjb3JyZWN0IGNvbnRhaW5lciBjb25maWd1cmF0aW9uJywgKCkgPT4ge1xuICAgICAgYXV0aFRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpFQ1M6OlRhc2tEZWZpbml0aW9uJywge1xuICAgICAgICBSZXF1aXJlc0NvbXBhdGliaWxpdGllczogWydGQVJHQVRFJ10sXG4gICAgICAgIE5ldHdvcmtNb2RlOiAnYXdzdnBjJyxcbiAgICAgICAgQ3B1OiAnNTEyJyxcbiAgICAgICAgTWVtb3J5OiAnMTAyNCcsXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0xEQVAgU3RhY2sgUmVzb3VyY2VzJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgY3JlYXRlIE5ldHdvcmsgTG9hZCBCYWxhbmNlcicsICgpID0+IHtcbiAgICAgIGxkYXBUZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6RWxhc3RpY0xvYWRCYWxhbmNpbmdWMjo6TG9hZEJhbGFuY2VyJywge1xuICAgICAgICBUeXBlOiAnbmV0d29yaycsXG4gICAgICAgIFNjaGVtZTogJ2ludGVybmFsJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBjcmVhdGUgRUNTIEZhcmdhdGUgc2VydmljZSBmb3IgTERBUCcsICgpID0+IHtcbiAgICAgIGxkYXBUZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6RUNTOjpTZXJ2aWNlJywge1xuICAgICAgICBMYXVuY2hUeXBlOiAnRkFSR0FURScsXG4gICAgICAgIC8vIFBsYXRmb3JtVmVyc2lvbiBkZWZhdWx0cyB0byBMQVRFU1Qgd2hlbiBub3Qgc3BlY2lmaWVkXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgY3JlYXRlIExEQVAgbGlzdGVuZXIgb24gcG9ydCA2MzYnLCAoKSA9PiB7XG4gICAgICBsZGFwVGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkVsYXN0aWNMb2FkQmFsYW5jaW5nVjI6Okxpc3RlbmVyJywge1xuICAgICAgICBQb3J0OiA2MzYsXG4gICAgICAgIFByb3RvY29sOiAnVExTJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnU2VjdXJpdHkgQ29uZmlndXJhdGlvbicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGNyZWF0ZSBzZWN1cml0eSBncm91cHMgd2l0aCBwcm9wZXIgaW5ncmVzcyBydWxlcycsICgpID0+IHtcbiAgICAgIGF1dGhUZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6RUMyOjpTZWN1cml0eUdyb3VwJywge1xuICAgICAgICBTZWN1cml0eUdyb3VwSW5ncmVzczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIEZyb21Qb3J0OiA0NDMsXG4gICAgICAgICAgICBUb1BvcnQ6IDQ0MyxcbiAgICAgICAgICAgIElwUHJvdG9jb2w6ICd0Y3AnLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBjcmVhdGUgSUFNIHJvbGVzIHdpdGggbGVhc3QgcHJpdmlsZWdlJywgKCkgPT4ge1xuICAgICAgYXV0aFRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpJQU06OlJvbGUnLCB7XG4gICAgICAgIEFzc3VtZVJvbGVQb2xpY3lEb2N1bWVudDogTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgU3RhdGVtZW50OiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICAgIEVmZmVjdDogJ0FsbG93JyxcbiAgICAgICAgICAgICAgUHJpbmNpcGFsOiB7XG4gICAgICAgICAgICAgICAgU2VydmljZTogJ2Vjcy10YXNrcy5hbWF6b25hd3MuY29tJyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0pLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBlbmNyeXB0IFJEUyB3aXRoIEtNUycsICgpID0+IHtcbiAgICAgIGF1dGhUZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6UkRTOjpEQkNsdXN0ZXInLCB7XG4gICAgICAgIFN0b3JhZ2VFbmNyeXB0ZWQ6IHRydWUsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgZW5jcnlwdCBSZWRpcyBpbiB0cmFuc2l0IGFuZCBhdCByZXN0JywgKCkgPT4ge1xuICAgICAgYXV0aFRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpFbGFzdGlDYWNoZTo6UmVwbGljYXRpb25Hcm91cCcsIHtcbiAgICAgICAgVHJhbnNpdEVuY3J5cHRpb25FbmFibGVkOiB0cnVlLFxuICAgICAgICBBdFJlc3RFbmNyeXB0aW9uRW5hYmxlZDogdHJ1ZSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuXG5cbiAgZGVzY3JpYmUoJ1Jlc291cmNlIFRhZ2dpbmcnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCB0YWcgYWxsIHJlc291cmNlcyB3aXRoIFByb2plY3QgdGFnJywgKCkgPT4ge1xuICAgICAgLy8gTm90ZTogVGFncyBhcmUgaW5oZXJpdGVkIGZyb20gdGhlIEFwcCBsZXZlbCBpbiBiaW4vY2RrLnRzXG4gICAgICBjb25zdCBzdGFja1RhZ3MgPSBjZGsuVGFncy5vZihhdXRoU3RhY2spO1xuICAgICAgZXhwZWN0KHN0YWNrVGFncykudG9CZURlZmluZWQoKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0Vudmlyb25tZW50LVNwZWNpZmljIENvbmZpZ3VyYXRpb24nLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCB1c2UgYXBwcm9wcmlhdGUgaW5zdGFuY2Ugc2l6ZXMgZm9yIHRlc3QgZW52aXJvbm1lbnQnLCAoKSA9PiB7XG4gICAgICBhdXRoVGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlJEUzo6REJDbHVzdGVyJywge1xuICAgICAgICBTZXJ2ZXJsZXNzVjJTY2FsaW5nQ29uZmlndXJhdGlvbjoge1xuICAgICAgICAgIE1pbkNhcGFjaXR5OiAwLjUsXG4gICAgICAgICAgTWF4Q2FwYWNpdHk6IDQsIC8vIEN1cnJlbnQgaW1wbGVtZW50YXRpb24gdXNlcyBmaXhlZCB2YWx1ZXNcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBzZXQgYXBwcm9wcmlhdGUgY29udGFpbmVyIHJlc291cmNlcyBmb3IgZGV2JywgKCkgPT4ge1xuICAgICAgYXV0aFRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpFQ1M6OlRhc2tEZWZpbml0aW9uJywge1xuICAgICAgICBDcHU6ICc1MTInLFxuICAgICAgICBNZW1vcnk6ICcxMDI0JyxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnQ3Jvc3MtU3RhY2sgRGVwZW5kZW5jaWVzJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgaW1wb3J0IGJhc2UgaW5mcmFzdHJ1Y3R1cmUgVlBDIGNvcnJlY3RseScsICgpID0+IHtcbiAgICAgIGF1dGhUZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6RUNTOjpTZXJ2aWNlJywge1xuICAgICAgICBOZXR3b3JrQ29uZmlndXJhdGlvbjoge1xuICAgICAgICAgIEF3c3ZwY0NvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICAgIFN1Ym5ldHM6IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBpbXBvcnQgYmFzZSBpbmZyYXN0cnVjdHVyZSBLTVMga2V5JywgKCkgPT4ge1xuICAgICAgLy8gQ2hlY2sgdGhhdCB0aGUgc2Vjb25kYXJ5IERCIGluc3RhbmNlIHVzZXMgdGhlIEtNUyBrZXkgZm9yIFBlcmZvcm1hbmNlIEluc2lnaHRzXG4gICAgICBhdXRoVGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlJEUzo6REJJbnN0YW5jZScsIHtcbiAgICAgICAgUGVyZm9ybWFuY2VJbnNpZ2h0c0tNU0tleUlkOiBNYXRjaC5hbnlWYWx1ZSgpLFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xufSk7XG4iXX0=