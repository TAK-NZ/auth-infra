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
    'r53ZoneName': { type: 'string', path: ['r53ZoneName'] },
    'vpcCidr': { type: 'string', path: ['vpcCidr'] },
    'stackName': { type: 'string', path: ['stackName'] },
    // Networking properties
    'networking.createNatGateways': { type: 'boolean', path: ['networking', 'createNatGateways'] },
    'networking.createVpcEndpoints': { type: 'boolean', path: ['networking', 'createVpcEndpoints'] },
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGV4dC1vdmVycmlkZXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjb250ZXh0LW92ZXJyaWRlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztHQUdHOzs7QUE2REgsc0RBcUJDO0FBN0VEOzs7R0FHRztBQUNVLFFBQUEsZUFBZSxHQUFHO0lBQzdCLHVCQUF1QjtJQUN2QixhQUFhLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxhQUFhLENBQUMsRUFBRTtJQUNqRSxTQUFTLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxTQUFTLENBQUMsRUFBRTtJQUN6RCxXQUFXLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxXQUFXLENBQUMsRUFBRTtJQUU3RCx3QkFBd0I7SUFDeEIsOEJBQThCLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBa0IsRUFBRSxJQUFJLEVBQUUsQ0FBQyxZQUFZLEVBQUUsbUJBQW1CLENBQUMsRUFBRTtJQUN2RywrQkFBK0IsRUFBRSxFQUFFLElBQUksRUFBRSxTQUFrQixFQUFFLElBQUksRUFBRSxDQUFDLFlBQVksRUFBRSxvQkFBb0IsQ0FBQyxFQUFFO0lBRXpHLHNCQUFzQjtJQUN0Qix3QkFBd0IsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFpQixFQUFFLElBQUksRUFBRSxDQUFDLFVBQVUsRUFBRSxlQUFlLENBQUMsRUFBRTtJQUMxRix3QkFBd0IsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFpQixFQUFFLElBQUksRUFBRSxDQUFDLFVBQVUsRUFBRSxlQUFlLENBQUMsRUFBRTtJQUMxRiwyQkFBMkIsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFpQixFQUFFLElBQUksRUFBRSxDQUFDLFVBQVUsRUFBRSxrQkFBa0IsQ0FBQyxFQUFFO0lBQ2hHLDhCQUE4QixFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQWlCLEVBQUUsSUFBSSxFQUFFLENBQUMsVUFBVSxFQUFFLHFCQUFxQixDQUFDLEVBQUU7SUFDdEcsb0NBQW9DLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBa0IsRUFBRSxJQUFJLEVBQUUsQ0FBQyxVQUFVLEVBQUUsMkJBQTJCLENBQUMsRUFBRTtJQUNuSCw2QkFBNkIsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFpQixFQUFFLElBQUksRUFBRSxDQUFDLFVBQVUsRUFBRSxvQkFBb0IsQ0FBQyxFQUFFO0lBQ3BHLDhCQUE4QixFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQWlCLEVBQUUsSUFBSSxFQUFFLENBQUMsVUFBVSxFQUFFLHFCQUFxQixDQUFDLEVBQUU7SUFDdEcsMkJBQTJCLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBa0IsRUFBRSxJQUFJLEVBQUUsQ0FBQyxVQUFVLEVBQUUsa0JBQWtCLENBQUMsRUFBRTtJQUVqRyxtQkFBbUI7SUFDbkIsZ0JBQWdCLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxPQUFPLEVBQUUsVUFBVSxDQUFDLEVBQUU7SUFDMUUscUJBQXFCLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxPQUFPLEVBQUUsZUFBZSxDQUFDLEVBQUU7SUFDcEYscUJBQXFCLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBa0IsRUFBRSxJQUFJLEVBQUUsQ0FBQyxPQUFPLEVBQUUsZUFBZSxDQUFDLEVBQUU7SUFDckYsb0JBQW9CLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBa0IsRUFBRSxJQUFJLEVBQUUsQ0FBQyxPQUFPLEVBQUUsY0FBYyxDQUFDLEVBQUU7SUFFbkYsaUJBQWlCO0lBQ2pCLGFBQWEsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFpQixFQUFFLElBQUksRUFBRSxDQUFDLEtBQUssRUFBRSxTQUFTLENBQUMsRUFBRTtJQUNwRSxnQkFBZ0IsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFpQixFQUFFLElBQUksRUFBRSxDQUFDLEtBQUssRUFBRSxZQUFZLENBQUMsRUFBRTtJQUMxRSxrQkFBa0IsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFpQixFQUFFLElBQUksRUFBRSxDQUFDLEtBQUssRUFBRSxjQUFjLENBQUMsRUFBRTtJQUM5RSwyQkFBMkIsRUFBRSxFQUFFLElBQUksRUFBRSxTQUFrQixFQUFFLElBQUksRUFBRSxDQUFDLEtBQUssRUFBRSx1QkFBdUIsQ0FBQyxFQUFFO0lBRWpHLHVCQUF1QjtJQUN2QixrQkFBa0IsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFpQixFQUFFLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxRQUFRLENBQUMsRUFBRTtJQUM5RSwwQkFBMEIsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFpQixFQUFFLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxnQkFBZ0IsQ0FBQyxFQUFFO0lBRTlGLGtCQUFrQjtJQUNsQixhQUFhLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDLEVBQUU7SUFFcEUscUJBQXFCO0lBQ3JCLHVCQUF1QixFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQWlCLEVBQUUsSUFBSSxFQUFFLENBQUMsU0FBUyxFQUFFLGVBQWUsQ0FBQyxFQUFFO0lBQ3hGLCtCQUErQixFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQWtCLEVBQUUsSUFBSSxFQUFFLENBQUMsU0FBUyxFQUFFLHVCQUF1QixDQUFDLEVBQUU7SUFDekcsaUNBQWlDLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBa0IsRUFBRSxJQUFJLEVBQUUsQ0FBQyxTQUFTLEVBQUUseUJBQXlCLENBQUMsRUFBRTtDQUM5RyxDQUFDO0FBRUY7Ozs7OztHQU1HO0FBQ0gsU0FBZ0IscUJBQXFCLENBQ25DLEdBQVksRUFDWixVQUFvQztJQUVwQyx1REFBdUQ7SUFDdkQsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxDQUE2QixDQUFDO0lBRWxGLCtCQUErQjtJQUMvQixLQUFLLE1BQU0sQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyx1QkFBZSxDQUFDLEVBQUUsQ0FBQztRQUNuRSxNQUFNLFlBQVksR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUV4RCxJQUFJLFlBQVksS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUMvQiw0Q0FBNEM7WUFDNUMsTUFBTSxjQUFjLEdBQUcsbUJBQW1CLENBQUMsWUFBWSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUV0RSxzQ0FBc0M7WUFDdEMsaUJBQWlCLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFDOUQsQ0FBQztJQUNILENBQUM7SUFFRCxPQUFPLE1BQU0sQ0FBQztBQUNoQixDQUFDO0FBRUQ7O0dBRUc7QUFDSCxTQUFTLG1CQUFtQixDQUFDLEtBQVUsRUFBRSxJQUFZO0lBQ25ELElBQUksS0FBSyxLQUFLLFNBQVMsSUFBSSxLQUFLLEtBQUssSUFBSSxFQUFFLENBQUM7UUFDMUMsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDO0lBRUQsUUFBUSxJQUFJLEVBQUUsQ0FBQztRQUNiLEtBQUssU0FBUztZQUNaLElBQUksT0FBTyxLQUFLLEtBQUssU0FBUztnQkFBRSxPQUFPLEtBQUssQ0FBQztZQUM3QyxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsRUFBRSxDQUFDO2dCQUM5QixNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQ2xDLElBQUksS0FBSyxLQUFLLE1BQU07b0JBQUUsT0FBTyxJQUFJLENBQUM7Z0JBQ2xDLElBQUksS0FBSyxLQUFLLE9BQU87b0JBQUUsT0FBTyxLQUFLLENBQUM7WUFDdEMsQ0FBQztZQUNELE9BQU8sT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRXhCLEtBQUssUUFBUTtZQUNYLElBQUksT0FBTyxLQUFLLEtBQUssUUFBUTtnQkFBRSxPQUFPLEtBQUssQ0FBQztZQUM1QyxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsRUFBRSxDQUFDO2dCQUM5QixNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUNuQyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQztvQkFBRSxPQUFPLE1BQU0sQ0FBQztZQUNwQyxDQUFDO1lBQ0QsT0FBTyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFdkIsS0FBSyxRQUFRLENBQUM7UUFDZDtZQUNFLE9BQU8sTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3pCLENBQUM7QUFDSCxDQUFDO0FBRUQ7O0dBRUc7QUFDSCxTQUFTLGlCQUFpQixDQUFDLEdBQVEsRUFBRSxJQUFjLEVBQUUsS0FBVTtJQUM3RCxJQUFJLE9BQU8sR0FBRyxHQUFHLENBQUM7SUFFbEIsZ0RBQWdEO0lBQ2hELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ3pDLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNwQixJQUFJLENBQUMsQ0FBQyxHQUFHLElBQUksT0FBTyxDQUFDLElBQUksT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDMUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNwQixDQUFDO1FBQ0QsT0FBTyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUN6QixDQUFDO0lBRUQseUJBQXlCO0lBQ3pCLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ3ZDLE9BQU8sQ0FBQyxRQUFRLENBQUMsR0FBRyxLQUFLLENBQUM7QUFDNUIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogRHluYW1pYyBjb250ZXh0IG92ZXJyaWRlIHV0aWxpdGllc1xuICogSGFuZGxlcyBjb21tYW5kLWxpbmUgY29udGV4dCBvdmVycmlkZXMgd2l0aG91dCBtYW51YWwgcHJvcGVydHkgbWFwcGluZ1xuICovXG5cbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb250ZXh0RW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuLi9zdGFjay1jb25maWcnO1xuXG4vKipcbiAqIENvbmZpZ3VyYXRpb24gbWFwcGluZyBmb3IgY29udGV4dCBvdmVycmlkZXNcbiAqIERlZmluZXMgd2hpY2ggcHJvcGVydGllcyBjYW4gYmUgb3ZlcnJpZGRlbiBhbmQgdGhlaXIgdHlwZXNcbiAqL1xuZXhwb3J0IGNvbnN0IE9WRVJSSURFX0NPTkZJRyA9IHtcbiAgLy8gVG9wLWxldmVsIHByb3BlcnRpZXNcbiAgJ3I1M1pvbmVOYW1lJzogeyB0eXBlOiAnc3RyaW5nJyBhcyBjb25zdCwgcGF0aDogWydyNTNab25lTmFtZSddIH0sXG4gICd2cGNDaWRyJzogeyB0eXBlOiAnc3RyaW5nJyBhcyBjb25zdCwgcGF0aDogWyd2cGNDaWRyJ10gfSxcbiAgJ3N0YWNrTmFtZSc6IHsgdHlwZTogJ3N0cmluZycgYXMgY29uc3QsIHBhdGg6IFsnc3RhY2tOYW1lJ10gfSxcbiAgXG4gIC8vIE5ldHdvcmtpbmcgcHJvcGVydGllc1xuICAnbmV0d29ya2luZy5jcmVhdGVOYXRHYXRld2F5cyc6IHsgdHlwZTogJ2Jvb2xlYW4nIGFzIGNvbnN0LCBwYXRoOiBbJ25ldHdvcmtpbmcnLCAnY3JlYXRlTmF0R2F0ZXdheXMnXSB9LFxuICAnbmV0d29ya2luZy5jcmVhdGVWcGNFbmRwb2ludHMnOiB7IHR5cGU6ICdib29sZWFuJyBhcyBjb25zdCwgcGF0aDogWyduZXR3b3JraW5nJywgJ2NyZWF0ZVZwY0VuZHBvaW50cyddIH0sXG4gIFxuICAvLyBEYXRhYmFzZSBwcm9wZXJ0aWVzXG4gICdkYXRhYmFzZS5pbnN0YW5jZUNsYXNzJzogeyB0eXBlOiAnc3RyaW5nJyBhcyBjb25zdCwgcGF0aDogWydkYXRhYmFzZScsICdpbnN0YW5jZUNsYXNzJ10gfSxcbiAgJ2RhdGFiYXNlLmluc3RhbmNlQ291bnQnOiB7IHR5cGU6ICdudW1iZXInIGFzIGNvbnN0LCBwYXRoOiBbJ2RhdGFiYXNlJywgJ2luc3RhbmNlQ291bnQnXSB9LFxuICAnZGF0YWJhc2UuYWxsb2NhdGVkU3RvcmFnZSc6IHsgdHlwZTogJ251bWJlcicgYXMgY29uc3QsIHBhdGg6IFsnZGF0YWJhc2UnLCAnYWxsb2NhdGVkU3RvcmFnZSddIH0sXG4gICdkYXRhYmFzZS5tYXhBbGxvY2F0ZWRTdG9yYWdlJzogeyB0eXBlOiAnbnVtYmVyJyBhcyBjb25zdCwgcGF0aDogWydkYXRhYmFzZScsICdtYXhBbGxvY2F0ZWRTdG9yYWdlJ10gfSxcbiAgJ2RhdGFiYXNlLmVuYWJsZVBlcmZvcm1hbmNlSW5zaWdodHMnOiB7IHR5cGU6ICdib29sZWFuJyBhcyBjb25zdCwgcGF0aDogWydkYXRhYmFzZScsICdlbmFibGVQZXJmb3JtYW5jZUluc2lnaHRzJ10gfSxcbiAgJ2RhdGFiYXNlLm1vbml0b3JpbmdJbnRlcnZhbCc6IHsgdHlwZTogJ251bWJlcicgYXMgY29uc3QsIHBhdGg6IFsnZGF0YWJhc2UnLCAnbW9uaXRvcmluZ0ludGVydmFsJ10gfSxcbiAgJ2RhdGFiYXNlLmJhY2t1cFJldGVudGlvbkRheXMnOiB7IHR5cGU6ICdudW1iZXInIGFzIGNvbnN0LCBwYXRoOiBbJ2RhdGFiYXNlJywgJ2JhY2t1cFJldGVudGlvbkRheXMnXSB9LFxuICAnZGF0YWJhc2UuZGVsZXRlUHJvdGVjdGlvbic6IHsgdHlwZTogJ2Jvb2xlYW4nIGFzIGNvbnN0LCBwYXRoOiBbJ2RhdGFiYXNlJywgJ2RlbGV0ZVByb3RlY3Rpb24nXSB9LFxuICBcbiAgLy8gUmVkaXMgcHJvcGVydGllc1xuICAncmVkaXMubm9kZVR5cGUnOiB7IHR5cGU6ICdzdHJpbmcnIGFzIGNvbnN0LCBwYXRoOiBbJ3JlZGlzJywgJ25vZGVUeXBlJ10gfSxcbiAgJ3JlZGlzLm51bUNhY2hlTm9kZXMnOiB7IHR5cGU6ICdudW1iZXInIGFzIGNvbnN0LCBwYXRoOiBbJ3JlZGlzJywgJ251bUNhY2hlTm9kZXMnXSB9LFxuICAncmVkaXMuZW5hYmxlVHJhbnNpdCc6IHsgdHlwZTogJ2Jvb2xlYW4nIGFzIGNvbnN0LCBwYXRoOiBbJ3JlZGlzJywgJ2VuYWJsZVRyYW5zaXQnXSB9LFxuICAncmVkaXMuZW5hYmxlQXRSZXN0JzogeyB0eXBlOiAnYm9vbGVhbicgYXMgY29uc3QsIHBhdGg6IFsncmVkaXMnLCAnZW5hYmxlQXRSZXN0J10gfSxcbiAgXG4gIC8vIEVDUyBwcm9wZXJ0aWVzXG4gICdlY3MudGFza0NwdSc6IHsgdHlwZTogJ251bWJlcicgYXMgY29uc3QsIHBhdGg6IFsnZWNzJywgJ3Rhc2tDcHUnXSB9LFxuICAnZWNzLnRhc2tNZW1vcnknOiB7IHR5cGU6ICdudW1iZXInIGFzIGNvbnN0LCBwYXRoOiBbJ2VjcycsICd0YXNrTWVtb3J5J10gfSxcbiAgJ2Vjcy5kZXNpcmVkQ291bnQnOiB7IHR5cGU6ICdudW1iZXInIGFzIGNvbnN0LCBwYXRoOiBbJ2VjcycsICdkZXNpcmVkQ291bnQnXSB9LFxuICAnZWNzLmVuYWJsZURldGFpbGVkTG9nZ2luZyc6IHsgdHlwZTogJ2Jvb2xlYW4nIGFzIGNvbnN0LCBwYXRoOiBbJ2VjcycsICdlbmFibGVEZXRhaWxlZExvZ2dpbmcnXSB9LFxuICBcbiAgLy8gQXV0aGVudGlrIHByb3BlcnRpZXNcbiAgJ2F1dGhlbnRpay5kb21haW4nOiB7IHR5cGU6ICdzdHJpbmcnIGFzIGNvbnN0LCBwYXRoOiBbJ2F1dGhlbnRpaycsICdkb21haW4nXSB9LFxuICAnYXV0aGVudGlrLmFkbWluVXNlckVtYWlsJzogeyB0eXBlOiAnc3RyaW5nJyBhcyBjb25zdCwgcGF0aDogWydhdXRoZW50aWsnLCAnYWRtaW5Vc2VyRW1haWwnXSB9LFxuICBcbiAgLy8gTERBUCBwcm9wZXJ0aWVzXG4gICdsZGFwLmRvbWFpbic6IHsgdHlwZTogJ3N0cmluZycgYXMgY29uc3QsIHBhdGg6IFsnbGRhcCcsICdkb21haW4nXSB9LFxuICBcbiAgLy8gR2VuZXJhbCBwcm9wZXJ0aWVzXG4gICdnZW5lcmFsLnJlbW92YWxQb2xpY3knOiB7IHR5cGU6ICdzdHJpbmcnIGFzIGNvbnN0LCBwYXRoOiBbJ2dlbmVyYWwnLCAncmVtb3ZhbFBvbGljeSddIH0sXG4gICdnZW5lcmFsLmVuYWJsZURldGFpbGVkTG9nZ2luZyc6IHsgdHlwZTogJ2Jvb2xlYW4nIGFzIGNvbnN0LCBwYXRoOiBbJ2dlbmVyYWwnLCAnZW5hYmxlRGV0YWlsZWRMb2dnaW5nJ10gfSxcbiAgJ2dlbmVyYWwuZW5hYmxlQ29udGFpbmVySW5zaWdodHMnOiB7IHR5cGU6ICdib29sZWFuJyBhcyBjb25zdCwgcGF0aDogWydnZW5lcmFsJywgJ2VuYWJsZUNvbnRhaW5lckluc2lnaHRzJ10gfSxcbn07XG5cbi8qKlxuICogQXBwbGllcyBjb250ZXh0IG92ZXJyaWRlcyB0byBlbnZpcm9ubWVudCBjb25maWd1cmF0aW9uIGR5bmFtaWNhbGx5XG4gKiBcbiAqIEBwYXJhbSBhcHAgLSBDREsgQXBwIGluc3RhbmNlIHRvIHJlYWQgY29udGV4dCBmcm9tXG4gKiBAcGFyYW0gYmFzZUNvbmZpZyAtIEJhc2UgZW52aXJvbm1lbnQgY29uZmlndXJhdGlvbiBmcm9tIGNkay5qc29uXG4gKiBAcmV0dXJucyBDb25maWd1cmF0aW9uIHdpdGggYXBwbGllZCBvdmVycmlkZXNcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5Q29udGV4dE92ZXJyaWRlcyhcbiAgYXBwOiBjZGsuQXBwLCBcbiAgYmFzZUNvbmZpZzogQ29udGV4dEVudmlyb25tZW50Q29uZmlnXG4pOiBDb250ZXh0RW52aXJvbm1lbnRDb25maWcge1xuICAvLyBEZWVwIGNsb25lIHRoZSBiYXNlIGNvbmZpZ3VyYXRpb24gdG8gYXZvaWQgbXV0YXRpb25zXG4gIGNvbnN0IHJlc3VsdCA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoYmFzZUNvbmZpZykpIGFzIENvbnRleHRFbnZpcm9ubWVudENvbmZpZztcbiAgXG4gIC8vIEFwcGx5IGVhY2ggcG9zc2libGUgb3ZlcnJpZGVcbiAgZm9yIChjb25zdCBbY29udGV4dEtleSwgY29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhPVkVSUklERV9DT05GSUcpKSB7XG4gICAgY29uc3QgY29udGV4dFZhbHVlID0gYXBwLm5vZGUudHJ5R2V0Q29udGV4dChjb250ZXh0S2V5KTtcbiAgICBcbiAgICBpZiAoY29udGV4dFZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIC8vIENvbnZlcnQgY29udGV4dCB2YWx1ZSB0byBhcHByb3ByaWF0ZSB0eXBlXG4gICAgICBjb25zdCBjb252ZXJ0ZWRWYWx1ZSA9IGNvbnZlcnRDb250ZXh0VmFsdWUoY29udGV4dFZhbHVlLCBjb25maWcudHlwZSk7XG4gICAgICBcbiAgICAgIC8vIFNldCB0aGUgdmFsdWUgYXQgdGhlIHNwZWNpZmllZCBwYXRoXG4gICAgICBzZXROZXN0ZWRQcm9wZXJ0eShyZXN1bHQsIFsuLi5jb25maWcucGF0aF0sIGNvbnZlcnRlZFZhbHVlKTtcbiAgICB9XG4gIH1cbiAgXG4gIHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogQ29udmVydHMgY29udGV4dCBzdHJpbmcgdmFsdWVzIHRvIGFwcHJvcHJpYXRlIHR5cGVzXG4gKi9cbmZ1bmN0aW9uIGNvbnZlcnRDb250ZXh0VmFsdWUodmFsdWU6IGFueSwgdHlwZTogc3RyaW5nKTogYW55IHtcbiAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cbiAgXG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4gdmFsdWU7XG4gICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICBjb25zdCBsb3dlciA9IHZhbHVlLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGlmIChsb3dlciA9PT0gJ3RydWUnKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgaWYgKGxvd2VyID09PSAnZmFsc2UnKSByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICByZXR1cm4gQm9vbGVhbih2YWx1ZSk7XG4gICAgICBcbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicpIHJldHVybiB2YWx1ZTtcbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZCA9IHBhcnNlSW50KHZhbHVlLCAxMCk7XG4gICAgICAgIGlmICghaXNOYU4ocGFyc2VkKSkgcmV0dXJuIHBhcnNlZDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBOdW1iZXIodmFsdWUpO1xuICAgICAgXG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIFN0cmluZyh2YWx1ZSk7XG4gIH1cbn1cblxuLyoqXG4gKiBTZXRzIGEgbmVzdGVkIHByb3BlcnR5IHZhbHVlIHVzaW5nIGEgcGF0aCBhcnJheVxuICovXG5mdW5jdGlvbiBzZXROZXN0ZWRQcm9wZXJ0eShvYmo6IGFueSwgcGF0aDogc3RyaW5nW10sIHZhbHVlOiBhbnkpOiB2b2lkIHtcbiAgbGV0IGN1cnJlbnQgPSBvYmo7XG4gIFxuICAvLyBOYXZpZ2F0ZSB0byB0aGUgcGFyZW50IG9mIHRoZSB0YXJnZXQgcHJvcGVydHlcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBwYXRoLmxlbmd0aCAtIDE7IGkrKykge1xuICAgIGNvbnN0IGtleSA9IHBhdGhbaV07XG4gICAgaWYgKCEoa2V5IGluIGN1cnJlbnQpIHx8IHR5cGVvZiBjdXJyZW50W2tleV0gIT09ICdvYmplY3QnKSB7XG4gICAgICBjdXJyZW50W2tleV0gPSB7fTtcbiAgICB9XG4gICAgY3VycmVudCA9IGN1cnJlbnRba2V5XTtcbiAgfVxuICBcbiAgLy8gU2V0IHRoZSBmaW5hbCBwcm9wZXJ0eVxuICBjb25zdCBmaW5hbEtleSA9IHBhdGhbcGF0aC5sZW5ndGggLSAxXTtcbiAgY3VycmVudFtmaW5hbEtleV0gPSB2YWx1ZTtcbn1cbiJdfQ==