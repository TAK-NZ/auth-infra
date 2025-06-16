/**
 * EFS Construct - CDK implementation of the Elastic File System
 */
import { Construct } from 'constructs';
import {
  aws_efs as efs,
  aws_ec2 as ec2,
  aws_kms as kms,
  CfnOutput,
  RemovalPolicy
} from 'aws-cdk-lib';
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
export class Efs extends Construct {
  /**
   * The EFS file system
   */
  public readonly fileSystem: efs.FileSystem;

  /**
   * The EFS access point for media
   */
  public readonly mediaAccessPoint: efs.AccessPoint;

  /**
   * The EFS access point for custom templates
   */
  public readonly customTemplatesAccessPoint: efs.AccessPoint;

  constructor(scope: Construct, id: string, props: EfsProps) {
    super(scope, id);

    // Create security group for EFS
    const efsSecurityGroup = new ec2.SecurityGroup(this, 'EFSMountTargetSecurityGroup', {
      vpc: props.vpc,
      description: 'EFS to Auth ECS Service',
      allowAllOutbound: false
    });

    // Allow NFS access from specified security groups
    props.allowAccessFrom.forEach(sg => {
      efsSecurityGroup.addIngressRule(
        ec2.Peer.securityGroupId(sg.securityGroupId),
        ec2.Port.tcp(2049),
        'Allow NFS access from ECS tasks'
      );
    });

    // Also allow access from VPC CIDR for broader compatibility
    efsSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpcCidrBlock), // Reverted to use props.vpcCidrBlock directly
      ec2.Port.tcp(2049),
      'Allow NFS access from VPC'
    );

    // Determine removal policy and throughput mode from environment configuration
    // Production: RETAIN policy to preserve data, Dev/Test: DESTROY to avoid costs
    const efsRemovalPolicy = props.config.efs.removalPolicy;
    const throughputMode = props.config.efs.throughputMode === 'provisioned' 
      ? efs.ThroughputMode.PROVISIONED 
      : efs.ThroughputMode.BURSTING;

    // Build EFS configuration object
    const efsConfig: any = {
      vpc: props.vpc,
      encrypted: true,
      kmsKey: props.kmsKey,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: throughputMode,
      securityGroup: efsSecurityGroup,
      removalPolicy: efsRemovalPolicy
    };

    // Add provisioned throughput if specified
    if (props.config.efs.throughputMode === 'provisioned' && props.config.efs.provisionedThroughput) {
      efsConfig.provisionedThroughputPerSecond = props.config.efs.provisionedThroughput;
    }

    // Create the EFS file system
    this.fileSystem = new efs.FileSystem(this, 'EFS', efsConfig);

    // Create access point for media files
    this.mediaAccessPoint = new efs.AccessPoint(this, 'EFSAccessPointMedia', {
      fileSystem: this.fileSystem,
      posixUser: {
        uid: '1000',
        gid: '1000'
      },
      path: '/media'
    });

    // Create access point for custom templates
    this.customTemplatesAccessPoint = new efs.AccessPoint(this, 'EFSAccessPointCustomTemplates', {
      fileSystem: this.fileSystem,
      posixUser: {
        uid: '1000',
        gid: '1000'
      },
      path: '/custom-templates'
    });

    // Create outputs
    new CfnOutput(this, 'EFSFileSystemId', {
      value: this.fileSystem.fileSystemId,
      description: 'EFS file system ID'
    });

    new CfnOutput(this, 'EFSMediaAccessPointId', {
      value: this.mediaAccessPoint.accessPointId,
      description: 'EFS media access point ID'
    });

    new CfnOutput(this, 'EFSCustomTemplatesAccessPointId', {
      value: this.customTemplatesAccessPoint.accessPointId,
      description: 'EFS custom templates access point ID'
    });
  }
}
