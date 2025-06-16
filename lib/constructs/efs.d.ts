/**
 * EFS Construct - CDK implementation of the Elastic File System
 */
import { Construct } from 'constructs';
import { aws_efs as efs, aws_ec2 as ec2, aws_kms as kms } from 'aws-cdk-lib';
import type { AuthInfraEnvironmentConfig } from '../environment-config';
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
     * VPC for deployment
     */
    vpc: ec2.IVpc;
    /**
     * VPC CIDR block for security group rules
     */
    vpcCidrBlock: string;
    /**
     * KMS key for encryption
     */
    kmsKey: kms.IKey;
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
