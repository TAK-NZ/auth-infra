/**
 * EFS Construct - CDK implementation of the Elastic File System
 */
import { Construct } from 'constructs';
import {
  aws_efs as efs,
  aws_ec2 as ec2,
  aws_kms as kms,
  aws_iam as iam,
  RemovalPolicy
} from 'aws-cdk-lib';
import type { ContextEnvironmentConfig } from '../stack-config';
import type { InfrastructureConfig } from '../construct-configs';

/**
 * Properties for the EFS construct
 */
export interface EfsProps {
  /**
   * Environment type ('prod' | 'dev-test')
   */
  environment: 'prod' | 'dev-test';

  /**
   * Context-based environment configuration (direct from cdk.json)
   */
  contextConfig: ContextEnvironmentConfig;

  /**
   * Infrastructure configuration (VPC, KMS)
   */
  infrastructure: InfrastructureConfig;

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

    // Derive environment-specific values from context (matches reference pattern)
    const isHighAvailability = props.environment === 'prod';
    const efsRemovalPolicy = props.contextConfig.general.removalPolicy === 'RETAIN' ? 
      RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;
    const throughputMode = efs.ThroughputMode.BURSTING; // Use bursting mode for cost optimization

    // Create security group for EFS
    const efsSecurityGroup = new ec2.SecurityGroup(this, 'MountTargetSecurityGroup', {
      vpc: props.infrastructure.vpc,
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



    // Build EFS configuration object with file system policy
    const efsConfig: any = {
      vpc: props.infrastructure.vpc,
      encrypted: true,
      kmsKey: props.infrastructure.kmsKey,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: throughputMode,
      securityGroup: efsSecurityGroup,
      removalPolicy: efsRemovalPolicy,
      fileSystemPolicy: iam.PolicyDocument.fromJson({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              AWS: '*'
            },
            Action: [
              'elasticfilesystem:ClientMount',
              'elasticfilesystem:ClientWrite',
              'elasticfilesystem:ClientRootAccess'
            ],
            Condition: {
              Bool: {
                'elasticfilesystem:AccessedViaMountTarget': 'true'
              }
            }
          }
        ]
      })
    };

    // Since we're using bursting mode for cost optimization, skip provisioned throughput
    // (This simplifies the config to match reference architecture patterns)

    // Create the EFS file system
    this.fileSystem = new efs.FileSystem(this, 'EFS', efsConfig);

    // Create access point for media files
    this.mediaAccessPoint = new efs.AccessPoint(this, 'EFSAccessPointMedia', {
      fileSystem: this.fileSystem,
      posixUser: {
        uid: '1000',
        gid: '1000'
      },
      path: '/media',
      createAcl: {
        ownerUid: '1000',
        ownerGid: '1000',
        permissions: '755'
      }
    });

    // Create access point for custom templates
    this.customTemplatesAccessPoint = new efs.AccessPoint(this, 'EFSAccessPointCustomTemplates', {
      fileSystem: this.fileSystem,
      posixUser: {
        uid: '1000',
        gid: '1000'
      },
      path: '/custom-templates',
      createAcl: {
        ownerUid: '1000',
        ownerGid: '1000',
        permissions: '755'
      }
    });
  }
}
