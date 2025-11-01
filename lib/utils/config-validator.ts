import type { ContextEnvironmentConfig } from '../stack-config';

export class ConfigValidator {
  static validateEnvironmentConfig(config: ContextEnvironmentConfig, environment: string): void {
    this.validateRequired(config);
    this.validateDatabase(config.database);

    this.validateEcs(config.ecs);
    this.validateAuthentik(config.authentik);
    this.validateEnvironmentConstraints(config, environment);
  }

  private static validateRequired(config: ContextEnvironmentConfig): void {
    if (!config.stackName) {
      throw new Error('stackName is required');
    }
    if (!config.authentik.adminUserEmail) {
      throw new Error('authentik.adminUserEmail is required');
    }
    if (!this.isValidEmail(config.authentik.adminUserEmail)) {
      throw new Error(`Invalid email format: ${config.authentik.adminUserEmail}`);
    }
  }

  private static validateDatabase(dbConfig: any): void {
    const validInstanceClasses = ['db.serverless', 'db.t3.micro', 'db.t3.small', 'db.t4g.micro', 'db.t4g.small', 'db.t4g.medium', 'db.t4g.large'];
    if (!validInstanceClasses.includes(dbConfig.instanceClass)) {
      throw new Error(`Invalid database instance class: ${dbConfig.instanceClass}`);
    }
    
    if (dbConfig.instanceCount < 1 || dbConfig.instanceCount > 2) {
      throw new Error(`Database instance count must be 1 or 2, got: ${dbConfig.instanceCount}`);
    }
  }



  private static validateEcs(ecsConfig: any): void {
    const validCpuMemoryCombinations = [
      { cpu: 256, memory: [512, 1024, 2048] },
      { cpu: 512, memory: [1024, 2048, 3072, 4096] },
      { cpu: 1024, memory: [2048, 3072, 4096, 5120, 6144, 7168, 8192] },
      { cpu: 2048, memory: [4096, 5120, 6144, 7168, 8192, 9216, 10240, 11264, 12288, 13312, 14336, 15360, 16384] },
      { cpu: 4096, memory: [8192, 9216, 10240, 11264, 12288, 13312, 14336, 15360, 16384, 17408, 18432, 19456, 20480, 21504, 22528, 23552, 24576, 25600, 26624, 27648, 28672, 29696, 30720] }
    ];

    const validCombination = validCpuMemoryCombinations.find(combo => 
      combo.cpu === ecsConfig.taskCpu && combo.memory.includes(ecsConfig.taskMemory)
    );

    if (!validCombination) {
      throw new Error(`Invalid ECS CPU/Memory combination: ${ecsConfig.taskCpu}/${ecsConfig.taskMemory}`);
    }
  }

  private static validateAuthentik(authentikConfig: any): void {
    if (!authentikConfig.hostname) {
      throw new Error('authentik.hostname is required');
    }
    if (!authentikConfig.ldapHostname) {
      throw new Error('authentik.ldapHostname is required');
    }
    if (!authentikConfig.ldapBaseDn) {
      throw new Error('authentik.ldapBaseDn is required');
    }
  }

  private static validateEnvironmentConstraints(config: ContextEnvironmentConfig, environment: string): void {
    if (environment === 'prod') {
      if (config.database.instanceCount < 2) {
        console.warn('Production environment recommended to have at least 2 database instances for high availability');
      }

    }
  }

  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}