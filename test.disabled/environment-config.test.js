"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const environment_config_1 = require("../lib/environment-config");
describe('Environment Configuration', () => {
    describe('getEnvironmentConfig', () => {
        it('should return dev-test config for dev-test environment', () => {
            expect((0, environment_config_1.getEnvironmentConfig)('dev-test')).toEqual(environment_config_1.devTestConfig);
        });
        it('should return prod config for prod environment', () => {
            expect((0, environment_config_1.getEnvironmentConfig)('prod')).toEqual(environment_config_1.prodConfig);
        });
    });
    describe('Environment-specific configurations', () => {
        it('should have appropriate dev-test settings', () => {
            expect(environment_config_1.devTestConfig.isProd).toBe(false);
            expect(environment_config_1.devTestConfig.envType).toBe('dev-test');
            expect(environment_config_1.devTestConfig.ecsTaskDesiredCount).toBe(1);
            expect(environment_config_1.devTestConfig.dbInstanceCount).toBe(1);
            expect(environment_config_1.devTestConfig.redisNumCacheClusters).toBe(1);
            expect(environment_config_1.devTestConfig.minCapacity).toBe(1);
            expect(environment_config_1.devTestConfig.maxCapacity).toBe(3);
        });
        it('should have appropriate prod settings', () => {
            expect(environment_config_1.prodConfig.isProd).toBe(true);
            expect(environment_config_1.prodConfig.envType).toBe('prod');
            expect(environment_config_1.prodConfig.ecsTaskDesiredCount).toBe(2);
            expect(environment_config_1.prodConfig.dbInstanceCount).toBe(2);
            expect(environment_config_1.prodConfig.redisNumCacheClusters).toBe(2);
            expect(environment_config_1.prodConfig.minCapacity).toBe(2);
            expect(environment_config_1.prodConfig.maxCapacity).toBe(6);
        });
    });
    describe('mergeConfig', () => {
        it('should merge config with overrides', () => {
            const merged = (0, environment_config_1.mergeConfig)('dev-test', { ecsTaskDesiredCount: 5 });
            expect(merged.ecsTaskDesiredCount).toBe(5);
            expect(merged.isProd).toBe(false); // Should keep other values
        });
        it('should work without overrides', () => {
            const merged = (0, environment_config_1.mergeConfig)('prod');
            expect(merged).toEqual(environment_config_1.prodConfig);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW52aXJvbm1lbnQtY29uZmlnLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJlbnZpcm9ubWVudC1jb25maWcudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLGtFQUF5RztBQUV6RyxRQUFRLENBQUMsMkJBQTJCLEVBQUUsR0FBRyxFQUFFO0lBQ3pDLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLEVBQUU7UUFDcEMsRUFBRSxDQUFDLHdEQUF3RCxFQUFFLEdBQUcsRUFBRTtZQUNoRSxNQUFNLENBQUMsSUFBQSx5Q0FBb0IsRUFBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxrQ0FBYSxDQUFDLENBQUM7UUFDbEUsQ0FBQyxDQUFDLENBQUM7UUFFSCxFQUFFLENBQUMsZ0RBQWdELEVBQUUsR0FBRyxFQUFFO1lBQ3hELE1BQU0sQ0FBQyxJQUFBLHlDQUFvQixFQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLCtCQUFVLENBQUMsQ0FBQztRQUMzRCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLHFDQUFxQyxFQUFFLEdBQUcsRUFBRTtRQUNuRCxFQUFFLENBQUMsMkNBQTJDLEVBQUUsR0FBRyxFQUFFO1lBQ25ELE1BQU0sQ0FBQyxrQ0FBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN6QyxNQUFNLENBQUMsa0NBQWEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDL0MsTUFBTSxDQUFDLGtDQUFhLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbEQsTUFBTSxDQUFDLGtDQUFhLENBQUMsZUFBZSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzlDLE1BQU0sQ0FBQyxrQ0FBYSxDQUFDLHFCQUFxQixDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3BELE1BQU0sQ0FBQyxrQ0FBYSxDQUFDLFdBQVcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMxQyxNQUFNLENBQUMsa0NBQWEsQ0FBQyxXQUFXLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDNUMsQ0FBQyxDQUFDLENBQUM7UUFFSCxFQUFFLENBQUMsdUNBQXVDLEVBQUUsR0FBRyxFQUFFO1lBQy9DLE1BQU0sQ0FBQywrQkFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsK0JBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDeEMsTUFBTSxDQUFDLCtCQUFVLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDL0MsTUFBTSxDQUFDLCtCQUFVLENBQUMsZUFBZSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzNDLE1BQU0sQ0FBQywrQkFBVSxDQUFDLHFCQUFxQixDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2pELE1BQU0sQ0FBQywrQkFBVSxDQUFDLFdBQVcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN2QyxNQUFNLENBQUMsK0JBQVUsQ0FBQyxXQUFXLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDekMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxhQUFhLEVBQUUsR0FBRyxFQUFFO1FBQzNCLEVBQUUsQ0FBQyxvQ0FBb0MsRUFBRSxHQUFHLEVBQUU7WUFDNUMsTUFBTSxNQUFNLEdBQUcsSUFBQSxnQ0FBVyxFQUFDLFVBQVUsRUFBRSxFQUFFLG1CQUFtQixFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDbkUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMzQyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLDJCQUEyQjtRQUNoRSxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQywrQkFBK0IsRUFBRSxHQUFHLEVBQUU7WUFDdkMsTUFBTSxNQUFNLEdBQUcsSUFBQSxnQ0FBVyxFQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ25DLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsK0JBQVUsQ0FBQyxDQUFDO1FBQ3JDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGdldEVudmlyb25tZW50Q29uZmlnLCBkZXZUZXN0Q29uZmlnLCBwcm9kQ29uZmlnLCBtZXJnZUNvbmZpZyB9IGZyb20gJy4uL2xpYi9lbnZpcm9ubWVudC1jb25maWcnO1xuXG5kZXNjcmliZSgnRW52aXJvbm1lbnQgQ29uZmlndXJhdGlvbicsICgpID0+IHtcbiAgZGVzY3JpYmUoJ2dldEVudmlyb25tZW50Q29uZmlnJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgcmV0dXJuIGRldi10ZXN0IGNvbmZpZyBmb3IgZGV2LXRlc3QgZW52aXJvbm1lbnQnLCAoKSA9PiB7XG4gICAgICBleHBlY3QoZ2V0RW52aXJvbm1lbnRDb25maWcoJ2Rldi10ZXN0JykpLnRvRXF1YWwoZGV2VGVzdENvbmZpZyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiBwcm9kIGNvbmZpZyBmb3IgcHJvZCBlbnZpcm9ubWVudCcsICgpID0+IHtcbiAgICAgIGV4cGVjdChnZXRFbnZpcm9ubWVudENvbmZpZygncHJvZCcpKS50b0VxdWFsKHByb2RDb25maWcpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnRW52aXJvbm1lbnQtc3BlY2lmaWMgY29uZmlndXJhdGlvbnMnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBoYXZlIGFwcHJvcHJpYXRlIGRldi10ZXN0IHNldHRpbmdzJywgKCkgPT4ge1xuICAgICAgZXhwZWN0KGRldlRlc3RDb25maWcuaXNQcm9kKS50b0JlKGZhbHNlKTtcbiAgICAgIGV4cGVjdChkZXZUZXN0Q29uZmlnLmVudlR5cGUpLnRvQmUoJ2Rldi10ZXN0Jyk7XG4gICAgICBleHBlY3QoZGV2VGVzdENvbmZpZy5lY3NUYXNrRGVzaXJlZENvdW50KS50b0JlKDEpO1xuICAgICAgZXhwZWN0KGRldlRlc3RDb25maWcuZGJJbnN0YW5jZUNvdW50KS50b0JlKDEpO1xuICAgICAgZXhwZWN0KGRldlRlc3RDb25maWcucmVkaXNOdW1DYWNoZUNsdXN0ZXJzKS50b0JlKDEpO1xuICAgICAgZXhwZWN0KGRldlRlc3RDb25maWcubWluQ2FwYWNpdHkpLnRvQmUoMSk7XG4gICAgICBleHBlY3QoZGV2VGVzdENvbmZpZy5tYXhDYXBhY2l0eSkudG9CZSgzKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGF2ZSBhcHByb3ByaWF0ZSBwcm9kIHNldHRpbmdzJywgKCkgPT4ge1xuICAgICAgZXhwZWN0KHByb2RDb25maWcuaXNQcm9kKS50b0JlKHRydWUpO1xuICAgICAgZXhwZWN0KHByb2RDb25maWcuZW52VHlwZSkudG9CZSgncHJvZCcpO1xuICAgICAgZXhwZWN0KHByb2RDb25maWcuZWNzVGFza0Rlc2lyZWRDb3VudCkudG9CZSgyKTtcbiAgICAgIGV4cGVjdChwcm9kQ29uZmlnLmRiSW5zdGFuY2VDb3VudCkudG9CZSgyKTtcbiAgICAgIGV4cGVjdChwcm9kQ29uZmlnLnJlZGlzTnVtQ2FjaGVDbHVzdGVycykudG9CZSgyKTtcbiAgICAgIGV4cGVjdChwcm9kQ29uZmlnLm1pbkNhcGFjaXR5KS50b0JlKDIpO1xuICAgICAgZXhwZWN0KHByb2RDb25maWcubWF4Q2FwYWNpdHkpLnRvQmUoNik7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdtZXJnZUNvbmZpZycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIG1lcmdlIGNvbmZpZyB3aXRoIG92ZXJyaWRlcycsICgpID0+IHtcbiAgICAgIGNvbnN0IG1lcmdlZCA9IG1lcmdlQ29uZmlnKCdkZXYtdGVzdCcsIHsgZWNzVGFza0Rlc2lyZWRDb3VudDogNSB9KTtcbiAgICAgIGV4cGVjdChtZXJnZWQuZWNzVGFza0Rlc2lyZWRDb3VudCkudG9CZSg1KTtcbiAgICAgIGV4cGVjdChtZXJnZWQuaXNQcm9kKS50b0JlKGZhbHNlKTsgLy8gU2hvdWxkIGtlZXAgb3RoZXIgdmFsdWVzXG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHdvcmsgd2l0aG91dCBvdmVycmlkZXMnLCAoKSA9PiB7XG4gICAgICBjb25zdCBtZXJnZWQgPSBtZXJnZUNvbmZpZygncHJvZCcpO1xuICAgICAgZXhwZWN0KG1lcmdlZCkudG9FcXVhbChwcm9kQ29uZmlnKTtcbiAgICB9KTtcbiAgfSk7XG59KTtcbiJdfQ==