"use strict";
/**
 * Dynamic context override utilities
 * Handles command-line context overrides without manual property mapping
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OVERRIDE_CONFIG = void 0;
exports.applyContextOverrides = applyContextOverrides;
/**
 * Configuration mapping for context overrides
 * Defines which properties can be overridden and their types
 */
exports.OVERRIDE_CONFIG = {
    // Top-level properties
    'stackName': { type: 'string', path: ['stackName'] },
    // Database properties
    'database.instanceClass': { type: 'string', path: ['database', 'instanceClass'] },
    'database.instanceCount': { type: 'number', path: ['database', 'instanceCount'] },
    'database.allocatedStorage': { type: 'number', path: ['database', 'allocatedStorage'] },
    'database.maxAllocatedStorage': { type: 'number', path: ['database', 'maxAllocatedStorage'] },
    'database.enablePerformanceInsights': { type: 'boolean', path: ['database', 'enablePerformanceInsights'] },
    'database.monitoringInterval': { type: 'number', path: ['database', 'monitoringInterval'] },
    'database.backupRetentionDays': { type: 'number', path: ['database', 'backupRetentionDays'] },
    'database.deleteProtection': { type: 'boolean', path: ['database', 'deleteProtection'] },
    // Redis properties
    'redis.nodeType': { type: 'string', path: ['redis', 'nodeType'] },
    'redis.numCacheNodes': { type: 'number', path: ['redis', 'numCacheNodes'] },
    'redis.enableTransit': { type: 'boolean', path: ['redis', 'enableTransit'] },
    'redis.enableAtRest': { type: 'boolean', path: ['redis', 'enableAtRest'] },
    // ECS properties
    'ecs.taskCpu': { type: 'number', path: ['ecs', 'taskCpu'] },
    'ecs.taskMemory': { type: 'number', path: ['ecs', 'taskMemory'] },
    'ecs.desiredCount': { type: 'number', path: ['ecs', 'desiredCount'] },
    'ecs.enableDetailedLogging': { type: 'boolean', path: ['ecs', 'enableDetailedLogging'] },
    // Authentik properties
    'authentik.domain': { type: 'string', path: ['authentik', 'domain'] },
    'authentik.adminUserEmail': { type: 'string', path: ['authentik', 'adminUserEmail'] },
    // LDAP properties
    'ldap.domain': { type: 'string', path: ['ldap', 'domain'] },
    // General properties
    'general.removalPolicy': { type: 'string', path: ['general', 'removalPolicy'] },
    'general.enableDetailedLogging': { type: 'boolean', path: ['general', 'enableDetailedLogging'] },
    'general.enableContainerInsights': { type: 'boolean', path: ['general', 'enableContainerInsights'] },
};
/**
 * Applies context overrides to environment configuration dynamically
 *
 * @param app - CDK App instance to read context from
 * @param baseConfig - Base environment configuration from cdk.json
 * @returns Configuration with applied overrides
 */
function applyContextOverrides(app, baseConfig) {
    // Deep clone the base configuration to avoid mutations
    const result = JSON.parse(JSON.stringify(baseConfig));
    // Apply each possible override
    for (const [contextKey, config] of Object.entries(exports.OVERRIDE_CONFIG)) {
        const contextValue = app.node.tryGetContext(contextKey);
        if (contextValue !== undefined) {
            // Convert context value to appropriate type
            const convertedValue = convertContextValue(contextValue, config.type);
            // Set the value at the specified path
            setNestedProperty(result, [...config.path], convertedValue);
        }
    }
    return result;
}
/**
 * Converts context string values to appropriate types
 */
function convertContextValue(value, type) {
    if (value === undefined || value === null) {
        return value;
    }
    switch (type) {
        case 'boolean':
            if (typeof value === 'boolean')
                return value;
            if (typeof value === 'string') {
                const lower = value.toLowerCase();
                if (lower === 'true')
                    return true;
                if (lower === 'false')
                    return false;
            }
            return Boolean(value);
        case 'number':
            if (typeof value === 'number')
                return value;
            if (typeof value === 'string') {
                const parsed = parseInt(value, 10);
                if (!isNaN(parsed))
                    return parsed;
            }
            return Number(value);
        case 'string':
        default:
            return String(value);
    }
}
/**
 * Sets a nested property value using a path array
 */
function setNestedProperty(obj, path, value) {
    let current = obj;
    // Navigate to the parent of the target property
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (!(key in current) || typeof current[key] !== 'object') {
            current[key] = {};
        }
        current = current[key];
    }
    // Set the final property
    const finalKey = path[path.length - 1];
    current[finalKey] = value;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGV4dC1vdmVycmlkZXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjb250ZXh0LW92ZXJyaWRlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztHQUdHOzs7QUF1REgsc0RBcUJDO0FBdkVEOzs7R0FHRztBQUNVLFFBQUEsZUFBZSxHQUFHO0lBQzdCLHVCQUF1QjtJQUN2QixXQUFXLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxXQUFXLENBQUMsRUFBRTtJQUU3RCxzQkFBc0I7SUFDdEIsd0JBQXdCLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxVQUFVLEVBQUUsZUFBZSxDQUFDLEVBQUU7SUFDMUYsd0JBQXdCLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxVQUFVLEVBQUUsZUFBZSxDQUFDLEVBQUU7SUFDMUYsMkJBQTJCLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxVQUFVLEVBQUUsa0JBQWtCLENBQUMsRUFBRTtJQUNoRyw4QkFBOEIsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFpQixFQUFFLElBQUksRUFBRSxDQUFDLFVBQVUsRUFBRSxxQkFBcUIsQ0FBQyxFQUFFO0lBQ3RHLG9DQUFvQyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQWtCLEVBQUUsSUFBSSxFQUFFLENBQUMsVUFBVSxFQUFFLDJCQUEyQixDQUFDLEVBQUU7SUFDbkgsNkJBQTZCLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxVQUFVLEVBQUUsb0JBQW9CLENBQUMsRUFBRTtJQUNwRyw4QkFBOEIsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFpQixFQUFFLElBQUksRUFBRSxDQUFDLFVBQVUsRUFBRSxxQkFBcUIsQ0FBQyxFQUFFO0lBQ3RHLDJCQUEyQixFQUFFLEVBQUUsSUFB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QUVEOztHQUVHO0FBQ0gsU0FBUyxpQkFBaUIsQ0FBQyxHQUFRLEVBQUUsSUFBYyxFQUFFLEtBQVU7SUFDN0QsSUFBSSxPQUFPLEdBQUcsR0FBRyxDQUFDO0lBRWxCLGdEQUFnRDtJQUNoRCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUN6QyxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDcEIsSUFBSSxDQUFDLENBQUMsR0FBRyxJQUFJLE9BQU8sQ0FBQyxJQUFJLE9BQU8sT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQzFELE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDcEIsQ0FBQztRQUNELE9BQU8sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDekIsQ0FBQztJQUVELHlCQUF5QjtJQUN6QixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztJQUN2QyxPQUFPLENBQUMsUUFBUSxDQUFDLEdBQUcsS0FBSyxDQUFDO0FBQzVCLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIER5bmFtaWMgY29udGV4dCBvdmVycmlkZSB1dGlsaXRpZXNcbiAqIEhhbmRsZXMgY29tbWFuZC1saW5lIGNvbnRleHQgb3ZlcnJpZGVzIHdpdGhvdXQgbWFudWFsIHByb3BlcnR5IG1hcHBpbmdcbiAqL1xuXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29udGV4dEVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi4vc3RhY2stY29uZmlnJztcblxuLyoqXG4gKiBDb25maWd1cmF0aW9uIG1hcHBpbmcgZm9yIGNvbnRleHQgb3ZlcnJpZGVzXG4gKiBEZWZpbmVzIHdoaWNoIHByb3BlcnRpZXMgY2FuIGJlIG92ZXJyaWRkZW4gYW5kIHRoZWlyIHR5cGVzXG4gKi9cbmV4cG9ydCBjb25zdCBPVkVSUklERV9DT05GSUcgPSB7XG4gIC8vIFRvcC1sZXZlbCBwcm9wZXJ0aWVzXG4gICdzdGFja05hbWUnOiB7IHR5cGU6ICdzdHJpbmcnIGFzIGNvbnN0LCBwYXRoOiBbJ3N0YWNrTmFtZSddIH0sXG4gIFxuICAvLyBEYXRhYmFzZSBwcm9wZXJ0aWVzXG4gICdkYXRhYmFzZS5pbnN0YW5jZUNsYXNzJzogeyB0eXBlOiAnc3RyaW5nJyBhcyBjb25zdCwgcGF0aDogWydkYXRhYmFzZScsICdpbnN0YW5jZUNsYXNzJ10gfSxcbiAgJ2RhdGFiYXNlLmluc3RhbmNlQ291bnQnOiB7IHR5cGU6ICdudW1iZXInIGFzIGNvbnN0LCBwYXRoOiBbJ2RhdGFiYXNlJywgJ2luc3RhbmNlQ291bnQnXSB9LFxuICAnZGF0YWJhc2UuYWxsb2NhdGVkU3RvcmFnZSc6IHsgdHlwZTogJ251bWJlcicgYXMgY29uc3QsIHBhdGg6IFsnZGF0YWJhc2UnLCAnYWxsb2NhdGVkU3RvcmFnZSddIH0sXG4gICdkYXRhYmFzZS5tYXhBbGxvY2F0ZWRTdG9yYWdlJzogeyB0eXBlOiAnbnVtYmVyJyBhcyBjb25zdCwgcGF0aDogWydkYXRhYmFzZScsICdtYXhBbGxvY2F0ZWRTdG9yYWdlJ10gfSxcbiAgJ2RhdGFiYXNlLmVuYWJsZVBlcmZvcm1hbmNlSW5zaWdodHMnOiB7IHR5cGU6ICdib29sZWFuJyBhcyBjb25zdCwgcGF0aDogWydkYXRhYmFzZScsICdlbmFibGVQZXJmb3JtYW5jZUluc2lnaHRzJ10gfSxcbiAgJ2RhdGFiYXNlLm1vbml0b3JpbmdJbnRlcnZhbCc6IHsgdHlwZTogJ251bWJlcicgYXMgY29uc3QsIHBhdGg6IFsnZGF0YWJhc2UnLCAnbW9uaXRvcmluZ0ludGVydmFsJ10gfSxcbiAgJ2RhdGFiYXNlLmJhY2t1cFJldGVudGlvbkRheXMnOiB7IHR5cGU6ICdudW1iZXInIGFzIGNvbnN0LCBwYXRoOiBbJ2RhdGFiYXNlJywgJ2JhY2t1cFJldGVudGlvbkRheXMnXSB9LFxuICAnZGF0YWJhc2UuZGVsZXRlUHJvdGVjdGlvbic6IHsgdHlwZTogJ2Jvb2xlYW4nIGFzIGNvbnN0LCBwYXRoOiBbJ2RhdGFiYXNlJywgJ2RlbGV0ZVByb3RlY3Rpb24nXSB9LFxuICBcbiAgLy8gUmVkaXMgcHJvcGVydGllc1xuICAncmVkaXMubm9kZVR5cGUnOiB7IHR5cGU6ICdzdHJpbmcnIGFzIGNvbnN0LCBwYXRoOiBbJ3JlZGlzJywgJ25vZGVUeXBlJ10gfSxcbiAgJ3JlZGlzLm51bUNhY2hlTm9kZXMnOiB7IHR5cGU6ICdudW1iZXInIGFzIGNvbnN0LCBwYXRoOiBbJ3JlZGlzJywgJ251bUNhY2hlTm9kZXMnXSB9LFxuICAncmVkaXMuZW5hYmxlVHJhbnNpdCc6IHsgdHlwZTogJ2Jvb2xlYW4nIGFzIGNvbnN0LCBwYXRoOiBbJ3JlZGlzJywgJ2VuYWJsZVRyYW5zaXQnXSB9LFxuICAncmVkaXMuZW5hYmxlQXRSZXN0JzogeyB0eXBlOiAnYm9vbGVhbicgYXMgY29uc3QsIHBhdGg6IFsncmVkaXMnLCAnZW5hYmxlQXRSZXN0J10gfSxcbiAgXG4gIC8vIEVDUyBwcm9wZXJ0aWVzXG4gICdlY3MudGFza0NwdSc6IHsgdHlwZTogJ251bWJlcicgYXMgY29uc3QsIHBhdGg6IFsnZWNzJywgJ3Rhc2tDcHUnXSB9LFxuICAnZWNzLnRhc2tNZW1vcnknOiB7IHR5cGU6ICdudW1iZXInIGFzIGNvbnN0LCBwYXRoOiBbJ2VjcycsICd0YXNrTWVtb3J5J10gfSxcbiAgJ2Vjcy5kZXNpcmVkQ291bnQnOiB7IHR5cGU6ICdudW1iZXInIGFzIGNvbnN0LCBwYXRoOiBbJ2VjcycsICdkZXNpcmVkQ291bnQnXSB9LFxuICAnZWNzLmVuYWJsZURldGFpbGVkTG9nZ2luZyc6IHsgdHlwZTogJ2Jvb2xlYW4nIGFzIGNvbnN0LCBwYXRoOiBbJ2VjcycsICdlbmFibGVEZXRhaWxlZExvZ2dpbmcnXSB9LFxuICBcbiAgLy8gQXV0aGVudGlrIHByb3BlcnRpZXNcbiAgJ2F1dGhlbnRpay5kb21haW4nOiB7IHR5cGU6ICdzdHJpbmcnIGFzIGNvbnN0LCBwYXRoOiBbJ2F1dGhlbnRpaycsICdkb21haW4nXSB9LFxuICAnYXV0aGVudGlrLmFkbWluVXNlckVtYWlsJzogeyB0eXBlOiAnc3RyaW5nJyBhcyBjb25zdCwgcGF0aDogWydhdXRoZW50aWsnLCAnYWRtaW5Vc2VyRW1haWwnXSB9LFxuICBcbiAgLy8gTERBUCBwcm9wZXJ0aWVzXG4gICdsZGFwLmRvbWFpbic6IHsgdHlwZTogJ3N0cmluZycgYXMgY29uc3QsIHBhdGg6IFsnbGRhcCcsICdkb21haW4nXSB9LFxuICBcbiAgLy8gR2VuZXJhbCBwcm9wZXJ0aWVzXG4gICdnZW5lcmFsLnJlbW92YWxQb2xpY3knOiB7IHR5cGU6ICdzdHJpbmcnIGFzIGNvbnN0LCBwYXRoOiBbJ2dlbmVyYWwnLCAncmVtb3ZhbFBvbGljeSddIH0sXG4gICdnZW5lcmFsLmVuYWJsZURldGFpbGVkTG9nZ2luZyc6IHsgdHlwZTogJ2Jvb2xlYW4nIGFzIGNvbnN0LCBwYXRoOiBbJ2dlbmVyYWwnLCAnZW5hYmxlRGV0YWlsZWRMb2dnaW5nJ10gfSxcbiAgJ2dlbmVyYWwuZW5hYmxlQ29udGFpbmVySW5zaWdodHMnOiB7IHR5cGU6ICdib29sZWFuJyBhcyBjb25zdCwgcGF0aDogWydnZW5lcmFsJywgJ2VuYWJsZUNvbnRhaW5lckluc2lnaHRzJ10gfSxcbn07XG5cbi8qKlxuICogQXBwbGllcyBjb250ZXh0IG92ZXJyaWRlcyB0byBlbnZpcm9ubWVudCBjb25maWd1cmF0aW9uIGR5bmFtaWNhbGx5XG4gKiBcbiAqIEBwYXJhbSBhcHAgLSBDREsgQXBwIGluc3RhbmNlIHRvIHJlYWQgY29udGV4dCBmcm9tXG4gKiBAcGFyYW0gYmFzZUNvbmZpZyAtIEJhc2UgZW52aXJvbm1lbnQgY29uZmlndXJhdGlvbiBmcm9tIGNkay5qc29uXG4gKiBAcmV0dXJucyBDb25maWd1cmF0aW9uIHdpdGggYXBwbGllZCBvdmVycmlkZXNcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5Q29udGV4dE92ZXJyaWRlcyhcbiAgYXBwOiBjZGsuQXBwLCBcbiAgYmFzZUNvbmZpZzogQ29udGV4dEVudmlyb25tZW50Q29uZmlnXG4pOiBDb250ZXh0RW52aXJvbm1lbnRDb25maWcge1xuICAvLyBEZWVwIGNsb25lIHRoZSBiYXNlIGNvbmZpZ3VyYXRpb24gdG8gYXZvaWQgbXV0YXRpb25zXG4gIGNvbnN0IHJlc3VsdCA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoYmFzZUNvbmZpZykpIGFzIENvbnRleHRFbnZpcm9ubWVudENvbmZpZztcbiAgXG4gIC8vIEFwcGx5IGVhY2ggcG9zc2libGUgb3ZlcnJpZGVcbiAgZm9yIChjb25zdCBbY29udGV4dEtleSwgY29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhPVkVSUklERV9DT05GSUcpKSB7XG4gICAgY29uc3QgY29udGV4dFZhbHVlID0gYXBwLm5vZGUudHJ5R2V0Q29udGV4dChjb250ZXh0S2V5KTtcbiAgICBcbiAgICBpZiAoY29udGV4dFZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIC8vIENvbnZlcnQgY29udGV4dCB2YWx1ZSB0byBhcHByb3ByaWF0ZSB0eXBlXG4gICAgICBjb25zdCBjb252ZXJ0ZWRWYWx1ZSA9IGNvbnZlcnRDb250ZXh0VmFsdWUoY29udGV4dFZhbHVlLCBjb25maWcudHlwZSk7XG4gICAgICBcbiAgICAgIC8vIFNldCB0aGUgdmFsdWUgYXQgdGhlIHNwZWNpZmllZCBwYXRoXG4gICAgICBzZXROZXN0ZWRQcm9wZXJ0eShyZXN1bHQsIFsuLi5jb25maWcucGF0aF0sIGNvbnZlcnRlZFZhbHVlKTtcbiAgICB9XG4gIH1cbiAgXG4gIHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogQ29udmVydHMgY29udGV4dCBzdHJpbmcgdmFsdWVzIHRvIGFwcHJvcHJpYXRlIHR5cGVzXG4gKi9cbmZ1bmN0aW9uIGNvbnZlcnRDb250ZXh0VmFsdWUodmFsdWU6IGFueSwgdHlwZTogc3RyaW5nKTogYW55IHtcbiAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cbiAgXG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4gdmFsdWU7XG4gICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICBjb25zdCBsb3dlciA9IHZhbHVlLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGlmIChsb3dlciA9PT0gJ3RydWUnKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgaWYgKGxvd2VyID09PSAnZmFsc2UnKSByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICByZXR1cm4gQm9vbGVhbih2YWx1ZSk7XG4gICAgICBcbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicpIHJldHVybiB2YWx1ZTtcbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZCA9IHBhcnNlSW50KHZhbHVlLCAxMCk7XG4gICAgICAgIGlmICghaXNOYU4ocGFyc2VkKSkgcmV0dXJuIHBhcnNlZDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBOdW1iZXIodmFsdWUpO1xuICAgICAgXG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIFN0cmluZyh2YWx1ZSk7XG4gIH1cbn1cblxuLyoqXG4gKiBTZXRzIGEgbmVzdGVkIHByb3BlcnR5IHZhbHVlIHVzaW5nIGEgcGF0aCBhcnJheVxuICovXG5mdW5jdGlvbiBzZXROZXN0ZWRQcm9wZXJ0eShvYmo6IGFueSwgcGF0aDogc3RyaW5nW10sIHZhbHVlOiBhbnkpOiB2b2lkIHtcbiAgbGV0IGN1cnJlbnQgPSBvYmo7XG4gIFxuICAvLyBOYXZpZ2F0ZSB0byB0aGUgcGFyZW50IG9mIHRoZSB0YXJnZXQgcHJvcGVydHlcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBwYXRoLmxlbmd0aCAtIDE7IGkrKykge1xuICAgIGNvbnN0IGtleSA9IHBhdGhbaV07XG4gICAgaWYgKCEoa2V5IGluIGN1cnJlbnQpIHx8IHR5cGVvZiBjdXJyZW50W2tleV0gIT09ICdvYmplY3QnKSB7XG4gICAgICBjdXJyZW50W2tleV0gPSB7fTtcbiAgICB9XG4gICAgY3VycmVudCA9IGN1cnJlbnRba2V5XTtcbiAgfVxuICBcbiAgLy8gU2V0IHRoZSBmaW5hbCBwcm9wZXJ0eVxuICBjb25zdCBmaW5hbEtleSA9IHBhdGhbcGF0aC5sZW5ndGggLSAxXTtcbiAgY3VycmVudFtmaW5hbEtleV0gPSB2YWx1ZTtcbn1cbiJdfQ==