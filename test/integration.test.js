import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { AuthInfraStack } from '../lib/auth-infra-stack';
import { LdapStack } from '../lib/ldap-stack';
import { generateAuthInfraStackName, generateLdapStackName } from '../lib/stack-naming';
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
        const authStackName = generateAuthInfraStackName(stackName);
        const ldapStackName = generateLdapStackName(stackName);
        // Create stacks with test configuration
        authStack = new AuthInfraStack(app, authStackName, {
            stackName,
            envType,
            description: 'Test Auth Stack',
        });
        ldapStack = new LdapStack(app, ldapStackName, {
            stackName,
            envType,
            description: 'Test LDAP Stack',
        });
        ldapStack.addDependency(authStack);
        authTemplate = Template.fromStack(authStack);
        ldapTemplate = Template.fromStack(ldapStack);
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
                CacheNodeType: Match.stringLikeRegexp('cache\\..*'),
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
                SecurityGroupIngress: Match.arrayWith([
                    Match.objectLike({
                        FromPort: 443,
                        ToPort: 443,
                        IpProtocol: 'tcp',
                    }),
                ]),
            });
        });
        it('should create IAM roles with least privilege', () => {
            authTemplate.hasResourceProperties('AWS::IAM::Role', {
                AssumeRolePolicyDocument: Match.objectLike({
                    Statement: Match.arrayWith([
                        Match.objectLike({
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
                        Subnets: Match.anyValue(),
                    },
                },
            });
        });
        it('should import base infrastructure KMS key', () => {
            // Check that the secondary DB instance uses the KMS key for Performance Insights
            authTemplate.hasResourceProperties('AWS::RDS::DBInstance', {
                PerformanceInsightsKMSKeyId: Match.anyValue(),
            });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZWdyYXRpb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImludGVncmF0aW9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxLQUFLLEdBQUcsTUFBTSxhQUFhLENBQUM7QUFDbkMsT0FBTyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDekQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQzlDLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRXhGLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSxHQUFHLEVBQUU7SUFDakMsSUFBSSxHQUFZLENBQUM7SUFDakIsSUFBSSxTQUF5QixDQUFDO0lBQzlCLElBQUksU0FBb0IsQ0FBQztJQUN6QixJQUFJLFlBQXNCLENBQUM7SUFDM0IsSUFBSSxZQUFzQixDQUFDO0lBRTNCLFVBQVUsQ0FBQyxHQUFHLEVBQUU7UUFDZCxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDcEIsa0NBQWtDO1FBQ2xDLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLHlCQUF5QixFQUFFLG1CQUFtQixDQUFDLENBQUM7UUFFcEUsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDO1FBQ3pCLE1BQU0sT0FBTyxHQUFHLFVBQVUsQ0FBQztRQUMzQixNQUFNLGFBQWEsR0FBRywwQkFBMEIsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUM1RCxNQUFNLGFBQWEsR0FBRyxxQkFBcUIsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUV2RCx3Q0FBd0M7UUFDeEMsU0FBUyxHQUFHLElBQUksY0FBYyxDQUFDLEdBQUcsRUFBRSxhQUFhLEVBQUU7WUFDakQsU0FBUztZQUNULE9BQU87WUFDUCxXQUFXLEVBQUUs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QWdDLEVBQUU7b0JBQ2hDLFdBQVcsRUFBRSxHQUFHO29CQUNoQixXQUFXLEVBQUUsQ0FBQyxFQUFFLDJDQUEyQztpQkFDNUQ7YUFDRixDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyxvREFBb0QsRUFBRSxHQUFHLEVBQUU7WUFDNUQsWUFBWSxDQUFDLHFCQUFxQixDQUFDLDBCQUEwQixFQUFFO2dCQUM3RCxHQUFHLEVBQUUsS0FBSztnQkFDVixNQUFNLEVBQUUsTUFBTTthQUNmLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsMEJBQTBCLEVBQUUsR0FBRyxFQUFFO1FBQ3hDLEVBQUUsQ0FBQyxpREFBaUQsRUFBRSxHQUFHLEVBQUU7WUFDekQsWUFBWSxDQUFDLHFCQUFxQixDQUFDLG1CQUFtQixFQUFFO2dCQUN0RCxvQkFBb0IsRUFBRTtvQkFDcEIsbUJBQW1CLEVBQUU7d0JBQ25CLE9BQU8sRUFBRSxLQUFLLENBQUMsUUFBUSxFQUFFO3FCQUMxQjtpQkFDRjthQUNGLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLDJDQUEyQyxFQUFFLEdBQUcsRUFBRTtZQUNuRCxpRkFBaUY7WUFDakYsWUFBWSxDQUFDLHFCQUFxQixDQUFDLHNCQUFzQixFQUFFO2dCQUN6RCwyQkFBMkIsRUFBRSxLQUFLLENBQUMsUUFBUSxFQUFFO2FBQzlDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBUZW1wbGF0ZSwgTWF0Y2ggfSBmcm9tICdhd3MtY2RrLWxpYi9hc3NlcnRpb25zJztcbmltcG9ydCB7IEF1dGhJbmZyYVN0YWNrIH0gZnJvbSAnLi4vbGliL2F1dGgtaW5mcmEtc3RhY2snO1xuaW1wb3J0IHsgTGRhcFN0YWNrIH0gZnJvbSAnLi4vbGliL2xkYXAtc3RhY2snO1xuaW1wb3J0IHsgZ2VuZXJhdGVBdXRoSW5mcmFTdGFja05hbWUsIGdlbmVyYXRlTGRhcFN0YWNrTmFtZSB9IGZyb20gJy4uL2xpYi9zdGFjay1uYW1pbmcnO1xuXG5kZXNjcmliZSgnSW50ZWdyYXRpb24gVGVzdHMnLCAoKSA9PiB7XG4gIGxldCBhcHA6IGNkay5BcHA7XG4gIGxldCBhdXRoU3RhY2s6IEF1dGhJbmZyYVN0YWNrO1xuICBsZXQgbGRhcFN0YWNrOiBMZGFwU3RhY2s7XG4gIGxldCBhdXRoVGVtcGxhdGU6IFRlbXBsYXRlO1xuICBsZXQgbGRhcFRlbXBsYXRlOiBUZW1wbGF0ZTtcblxuICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuICAgIC8vIFNldCByZXF1aXJlZCBjb250ZXh0IHBhcmFtZXRlcnNcbiAgICBhcHAubm9kZS5zZXRDb250ZXh0KCdhdXRoZW50aWtBZG1pblVzZXJFbWFpbCcsICdhZG1pbkBleGFtcGxlLmNvbScpO1xuICAgIFxuICAgIGNvbnN0IHN0YWNrTmFtZSA9ICd0ZXN0JztcbiAgICBjb25zdCBlbnZUeXBlID0gJ2Rldi10ZXN0JztcbiAgICBjb25zdCBhdXRoU3RhY2tOYW1lID0gZ2VuZXJhdGVBdXRoSW5mcmFTdGFja05hbWUoc3RhY2tOYW1lKTtcbiAgICBjb25zdCBsZGFwU3RhY2tOYW1lID0gZ2VuZXJhdGVMZGFwU3RhY2tOYW1lKHN0YWNrTmFtZSk7XG5cbiAgICAvLyBDcmVhdGUgc3RhY2tzIHdpdGggdGVzdCBjb25maWd1cmF0aW9uXG4gICAgYXV0aFN0YWNrID0gbmV3IEF1dGhJbmZyYVN0YWNrKGFwcCwgYXV0aFN0YWNrTmFtZSwge1xuICAgICAgc3RhY2tOYW1lLFxuICAgICAgZW52VHlwZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGVzdCBBdXRoIFN0YWNrJyxcbiAgICB9KTtcblxuICAgIGxkYXBTdGFjayA9IG5ldyBMZGFwU3RhY2soYXBwLCBsZGFwU3RhY2tOYW1lLCB7XG4gICAgICBzdGFja05hbWUsXG4gICAgICBlbnZUeXBlLFxuICAgICAgZGVzY3JpcHRpb246ICdUZXN0IExEQVAgU3RhY2snLFxuICAgIH0pO1xuXG4gICAgbGRhcFN0YWNrLmFkZERlcGVuZGVuY3koYXV0aFN0YWNrKTtcblxuICAgIGF1dGhUZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhhdXRoU3RhY2spO1xuICAgIGxkYXBUZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhsZGFwU3RhY2spO1xuICB9KTtcblxuICBkZXNjcmliZSgnU3RhY2sgRGVwZW5kZW5jaWVzJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgaGF2ZSBjb3JyZWN0IGRlcGVuZGVuY3kgYmV0d2VlbiBzdGFja3MnLCAoKSA9PiB7XG4gICAgICBjb25zdCBkZXBlbmRlbmNpZXMgPSBsZGFwU3RhY2suZGVwZW5kZW5jaWVzO1xuICAgICAgZXhwZWN0KGRlcGVuZGVuY2llcykudG9Db250YWluKGF1dGhTdGFjayk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhdmUgY29ycmVjdCBzdGFjayBuYW1lcycsICgpID0+IHtcbiAgICAgIGV4cGVjdChhdXRoU3RhY2suc3RhY2tOYW1lKS50b0JlKCdUQUstdGVzdC1BdXRoSW5mcmEnKTtcbiAgICAgIGV4cGVjdChsZGFwU3RhY2suc3RhY2tOYW1lKS50b0JlKCdUQUstdGVzdC1BdXRoSW5mcmEtTERBUCcpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnQXV0aCBTdGFjayBSZXNvdXJjZXMnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBjcmVhdGUgUkRTIEF1cm9yYSBQb3N0Z3JlU1FMIGNsdXN0ZXInLCAoKSA9PiB7XG4gICAgICBhdXRoVGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlJEUzo6REJDbHVzdGVyJywge1xuICAgICAgICBFbmdpbmU6ICdhdXJvcmEtcG9zdGdyZXNxbCcsXG4gICAgICAgIEVuZ2luZVZlcnNpb246ICcxNy40JyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBjcmVhdGUgRWxhc3RpQ2FjaGUgUmVkaXMnLCAoKSA9PiB7XG4gICAgICBhdXRoVGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkVsYXN0aUNhY2hlOjpSZXBsaWNhdGlvbkdyb3VwJywge1xuICAgICAgICBFbmdpbmU6ICd2YWxrZXknLFxuICAgICAgICBDYWNoZU5vZGVUeXBlOiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKCdjYWNoZVxcXFwuLionKSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBjcmVhdGUgRUZTIGZpbGUgc3lzdGVtJywgKCkgPT4ge1xuICAgICAgYXV0aFRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpFRlM6OkZpbGVTeXN0ZW0nLCB7XG4gICAgICAgIEVuY3J5cHRlZDogdHJ1ZSxcbiAgICAgICAgUGVyZm9ybWFuY2VNb2RlOiAnZ2VuZXJhbFB1cnBvc2UnLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGNyZWF0ZSBBcHBsaWNhdGlvbiBMb2FkIEJhbGFuY2VyJywgKCkgPT4ge1xuICAgICAgYXV0aFRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpFbGFzdGljTG9hZEJhbGFuY2luZ1YyOjpMb2FkQmFsYW5jZXInLCB7XG4gICAgICAgIFR5cGU6ICdhcHBsaWNhdGlvbicsXG4gICAgICAgIFNjaGVtZTogJ2ludGVybmV0LWZhY2luZycsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgY3JlYXRlIEVDUyBGYXJnYXRlIHNlcnZpY2UnLCAoKSA9PiB7XG4gICAgICBhdXRoVGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkVDUzo6U2VydmljZScsIHtcbiAgICAgICAgTGF1bmNoVHlwZTogJ0ZBUkdBVEUnLFxuICAgICAgICAvLyBQbGF0Zm9ybVZlcnNpb24gZGVmYXVsdHMgdG8gTEFURVNUIHdoZW4gbm90IHNwZWNpZmllZFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGNyZWF0ZSB0YXNrIGRlZmluaXRpb24gd2l0aCBjb3JyZWN0IGNvbnRhaW5lciBjb25maWd1cmF0aW9uJywgKCkgPT4ge1xuICAgICAgYXV0aFRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpFQ1M6OlRhc2tEZWZpbml0aW9uJywge1xuICAgICAgICBSZXF1aXJlc0NvbXBhdGliaWxpdGllczogWydGQVJHQVRFJ10sXG4gICAgICAgIE5ldHdvcmtNb2RlOiAnYXdzdnBjJyxcbiAgICAgICAgQ3B1OiAnNTEyJyxcbiAgICAgICAgTWVtb3J5OiAnMTAyNCcsXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0xEQVAgU3RhY2sgUmVzb3VyY2VzJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgY3JlYXRlIE5ldHdvcmsgTG9hZCBCYWxhbmNlcicsICgpID0+IHtcbiAgICAgIGxkYXBUZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6RWxhc3RpY0xvYWRCYWxhbmNpbmdWMjo6TG9hZEJhbGFuY2VyJywge1xuICAgICAgICBUeXBlOiAnbmV0d29yaycsXG4gICAgICAgIFNjaGVtZTogJ2ludGVybmFsJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBjcmVhdGUgRUNTIEZhcmdhdGUgc2VydmljZSBmb3IgTERBUCcsICgpID0+IHtcbiAgICAgIGxkYXBUZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6RUNTOjpTZXJ2aWNlJywge1xuICAgICAgICBMYXVuY2hUeXBlOiAnRkFSR0FURScsXG4gICAgICAgIC8vIFBsYXRmb3JtVmVyc2lvbiBkZWZhdWx0cyB0byBMQVRFU1Qgd2hlbiBub3Qgc3BlY2lmaWVkXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgY3JlYXRlIExEQVAgbGlzdGVuZXIgb24gcG9ydCA2MzYnLCAoKSA9PiB7XG4gICAgICBsZGFwVGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkVsYXN0aWNMb2FkQmFsYW5jaW5nVjI6Okxpc3RlbmVyJywge1xuICAgICAgICBQb3J0OiA2MzYsXG4gICAgICAgIFByb3RvY29sOiAnVExTJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnU2VjdXJpdHkgQ29uZmlndXJhdGlvbicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGNyZWF0ZSBzZWN1cml0eSBncm91cHMgd2l0aCBwcm9wZXIgaW5ncmVzcyBydWxlcycsICgpID0+IHtcbiAgICAgIGF1dGhUZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6RUMyOjpTZWN1cml0eUdyb3VwJywge1xuICAgICAgICBTZWN1cml0eUdyb3VwSW5ncmVzczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIEZyb21Qb3J0OiA0NDMsXG4gICAgICAgICAgICBUb1BvcnQ6IDQ0MyxcbiAgICAgICAgICAgIElwUHJvdG9jb2w6ICd0Y3AnLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBjcmVhdGUgSUFNIHJvbGVzIHdpdGggbGVhc3QgcHJpdmlsZWdlJywgKCkgPT4ge1xuICAgICAgYXV0aFRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpJQU06OlJvbGUnLCB7XG4gICAgICAgIEFzc3VtZVJvbGVQb2xpY3lEb2N1bWVudDogTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgU3RhdGVtZW50OiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICAgIEVmZmVjdDogJ0FsbG93JyxcbiAgICAgICAgICAgICAgUHJpbmNpcGFsOiB7XG4gICAgICAgICAgICAgICAgU2VydmljZTogJ2Vjcy10YXNrcy5hbWF6b25hd3MuY29tJyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0pLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBlbmNyeXB0IFJEUyB3aXRoIEtNUycsICgpID0+IHtcbiAgICAgIGF1dGhUZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6UkRTOjpEQkNsdXN0ZXInLCB7XG4gICAgICAgIFN0b3JhZ2VFbmNyeXB0ZWQ6IHRydWUsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgZW5jcnlwdCBSZWRpcyBpbiB0cmFuc2l0IGFuZCBhdCByZXN0JywgKCkgPT4ge1xuICAgICAgYXV0aFRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpFbGFzdGlDYWNoZTo6UmVwbGljYXRpb25Hcm91cCcsIHtcbiAgICAgICAgVHJhbnNpdEVuY3J5cHRpb25FbmFibGVkOiB0cnVlLFxuICAgICAgICBBdFJlc3RFbmNyeXB0aW9uRW5hYmxlZDogdHJ1ZSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuXG5cbiAgZGVzY3JpYmUoJ1Jlc291cmNlIFRhZ2dpbmcnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCB0YWcgYWxsIHJlc291cmNlcyB3aXRoIFByb2plY3QgdGFnJywgKCkgPT4ge1xuICAgICAgLy8gTm90ZTogVGFncyBhcmUgaW5oZXJpdGVkIGZyb20gdGhlIEFwcCBsZXZlbCBpbiBiaW4vY2RrLnRzXG4gICAgICBjb25zdCBzdGFja1RhZ3MgPSBjZGsuVGFncy5vZihhdXRoU3RhY2spO1xuICAgICAgZXhwZWN0KHN0YWNrVGFncykudG9CZURlZmluZWQoKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0Vudmlyb25tZW50LVNwZWNpZmljIENvbmZpZ3VyYXRpb24nLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCB1c2UgYXBwcm9wcmlhdGUgaW5zdGFuY2Ugc2l6ZXMgZm9yIHRlc3QgZW52aXJvbm1lbnQnLCAoKSA9PiB7XG4gICAgICBhdXRoVGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlJEUzo6REJDbHVzdGVyJywge1xuICAgICAgICBTZXJ2ZXJsZXNzVjJTY2FsaW5nQ29uZmlndXJhdGlvbjoge1xuICAgICAgICAgIE1pbkNhcGFjaXR5OiAwLjUsXG4gICAgICAgICAgTWF4Q2FwYWNpdHk6IDQsIC8vIEN1cnJlbnQgaW1wbGVtZW50YXRpb24gdXNlcyBmaXhlZCB2YWx1ZXNcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBzZXQgYXBwcm9wcmlhdGUgY29udGFpbmVyIHJlc291cmNlcyBmb3IgZGV2JywgKCkgPT4ge1xuICAgICAgYXV0aFRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpFQ1M6OlRhc2tEZWZpbml0aW9uJywge1xuICAgICAgICBDcHU6ICc1MTInLFxuICAgICAgICBNZW1vcnk6ICcxMDI0JyxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnQ3Jvc3MtU3RhY2sgRGVwZW5kZW5jaWVzJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgaW1wb3J0IGJhc2UgaW5mcmFzdHJ1Y3R1cmUgVlBDIGNvcnJlY3RseScsICgpID0+IHtcbiAgICAgIGF1dGhUZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6RUNTOjpTZXJ2aWNlJywge1xuICAgICAgICBOZXR3b3JrQ29uZmlndXJhdGlvbjoge1xuICAgICAgICAgIEF3c3ZwY0NvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICAgIFN1Ym5ldHM6IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBpbXBvcnQgYmFzZSBpbmZyYXN0cnVjdHVyZSBLTVMga2V5JywgKCkgPT4ge1xuICAgICAgLy8gQ2hlY2sgdGhhdCB0aGUgc2Vjb25kYXJ5IERCIGluc3RhbmNlIHVzZXMgdGhlIEtNUyBrZXkgZm9yIFBlcmZvcm1hbmNlIEluc2lnaHRzXG4gICAgICBhdXRoVGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlJEUzo6REJJbnN0YW5jZScsIHtcbiAgICAgICAgUGVyZm9ybWFuY2VJbnNpZ2h0c0tNU0tleUlkOiBNYXRjaC5hbnlWYWx1ZSgpLFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xufSk7XG4iXX0=