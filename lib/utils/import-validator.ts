import { Fn } from 'aws-cdk-lib';

export class ImportValidator {
  static validateImportValue(exportName: string, description: string): string {
    try {
      return Fn.importValue(exportName);
    } catch (error) {
      throw new Error(
        `Failed to import ${description} (${exportName}). ` +
        `Ensure the base infrastructure stack is deployed and exports this value. ` +
        `Original error: ${error}`
      );
    }
  }

  static createImportWithValidation(stackComponent: string, exportKey: string, description: string): string {
    const exportName = `TAK-${stackComponent}-BaseInfra-${exportKey}`;
    return this.validateImportValue(exportName, description);
  }
}