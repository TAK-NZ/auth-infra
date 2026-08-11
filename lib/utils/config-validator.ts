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
    // Matches "db.serverless" or any standard RDS/Aurora instance class naming
    // pattern, e.g. db.t4g.large, db.r6g.xlarge, db.r7g.2xlarge, db.r8gd.large.
    // A fixed allow-list would need code changes every time a new instance
    // family/generation is adopted, so we validate the shape instead.
    const instanceClassPattern = /^db\.(serverless|[a-z]+\d[a-z]*\.(nano|micro|small|medium|large|\d{1,2}xlarge))$/;
    if (!instanceClassPattern.test(dbConfig.instanceClass)) {
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

    const isValidCombo = (cpu: number, memory: number) =>
      validCpuMemoryCombinations.some(combo => combo.cpu === cpu && combo.memory.includes(memory));

    if (!isValidCombo(ecsConfig.server.taskCpu, ecsConfig.server.taskMemory)) {
      throw new Error(`Invalid ECS CPU/Memory combination for server: ${ecsConfig.server.taskCpu}/${ecsConfig.server.taskMemory}`);
    }

    if (!isValidCombo(ecsConfig.worker.taskCpu, ecsConfig.worker.taskMemory)) {
      throw new Error(`Invalid ECS CPU/Memory combination for worker: ${ecsConfig.worker.taskCpu}/${ecsConfig.worker.taskMemory}`);
    }

    if (!isValidCombo(ecsConfig.ldap.taskCpu, ecsConfig.ldap.taskMemory)) {
      throw new Error(`Invalid ECS CPU/Memory combination for ldap: ${ecsConfig.ldap.taskCpu}/${ecsConfig.ldap.taskMemory}`);
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