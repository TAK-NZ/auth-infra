/**
 * EFS Construct - CDK implementation of the Elastic File System
 */
import { Construct } from 'constructs';
import { aws_efs as efs, aws_ec2 as ec2 } from 'aws-cdk-lib';
import type { AuthInfraEnvironmentConfig } from '../environment-config';
import type { InfrastructureConfig } from '../construct-configs';
/**
 * Properties for the EFS construct
 */
export interface EfsProps {
    /**
     * Environment name (e.g. 'prod', 'dev', etc.)
     */
    environment: string;
    /**
     * Environment configuration
     */
    config: AuthInfraEnvironmentConfig;
    /**
     * Infrastructure configuration (VPC, KMS)
     */
    infrastructure: InfrastructureConfig;
    /**
     * VPC CIDR block for security group rules
     */
    vpcCidrBlock: string;
    /**
     * Security groups for EFS access
     */
    allowAccessFrom: ec2.SecurityGroup[];
}
/**
 * CDK construct for the EFS file system
 */
export declare class Efs extends Construct {
    /**
     * The EFS file system
     */
    readonly fileSystem: efs.FileSystem;
    /**
     * The EFS access point for media
     */
    readonly mediaAccessPoint: efs.AccessPoint;
    /**
     * The EFS access point for custom templates
     */
    readonly customTemplatesAccessPoint: efs.AccessPoint;
    constructor(scope: Construct, id: string, props: EfsProps);
}
