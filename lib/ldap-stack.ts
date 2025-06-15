/**
 * LDAP Stack - CDK implementation for Authentik LDAP outpost
 */
import { Construct } from 'constructs';
import {
  Stack,
  StackProps,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_secretsmanager as secretsmanager,
  CfnOutput
} from 'aws-cdk-lib';
import { importBaseInfraValue } from './stack-naming';
import { getEnvironmentConfig } from './environment-config';
import { LdapParameters } from './parameters';
import { Ldap } from './constructs/ldap';

/**
 * Properties for the LDAP Stack
 */
export interface LdapStackProps extends StackProps {
  /**
   * Stack name/environment
   */
  stackName: string;

  /**
   * Environment type
   */
  envType: 'prod' | 'dev-test';

  /**
   * Optional parameters override
   */
  parameters?: Partial<LdapParameters>;
}

/**
 * CDK stack for the LDAP outpost service
 */
export class LdapStack extends Stack {
  /**
   * The LDAP construct
   */
  public readonly ldap: Ldap;

  constructor(scope: Construct, id: string, props: LdapStackProps) {
    super(scope, id, props);

    // Get environment configuration
    const config = getEnvironmentConfig(props.envType);

    // Import VPC from base infrastructure
    const vpc = ec2.Vpc.fromLookup(this, 'VPC', {
      vpcId: importBaseInfraValue(props.stackName, 'vpc-id')
    });

    // Import or create ECS cluster
    const ecsCluster = new ecs.Cluster(this, 'ECSCluster', {
      vpc,
      clusterName: `${id}-cluster`,
      enableFargateCapacityProviders: true
    });

    // Create security group for ECS tasks
    const ecsSecurityGroup = new ec2.SecurityGroup(this, 'ECSSecurityGroup', {
      vpc,
      description: 'Security group for LDAP ECS tasks',
      allowAllOutbound: true
    });

    // Allow LDAP and LDAPS traffic
    ecsSecurityGroup.addIngressRule(
      ec2.Peer.ipv4('10.0.0.0/8'),
      ec2.Port.tcp(389),
      'Allow LDAP traffic'
    );

    ecsSecurityGroup.addIngressRule(
      ec2.Peer.ipv4('10.0.0.0/8'),
      ec2.Port.tcp(636),
      'Allow LDAPS traffic'
    );

    // Import LDAP token secret from the auth infrastructure stack
    const ldapTokenSecretName = `tak-auth-infra-${props.stackName}/authentik-ldap-token`;
    const ldapToken = secretsmanager.Secret.fromSecretCompleteArn(
      this, 
      'LdapToken', 
      `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${ldapTokenSecretName}`
    );

    // Create default parameters (these would normally come from the app)
    const defaultParams: LdapParameters = {
      gitSha: 'development',
      environment: props.stackName,
      envType: props.envType,
      enableExecute: false,
      sslCertificateArn: '',
      authentikHost: '',
      dockerImageLocation: 'Github'
    };

    // Merge with provided parameters
    const parameters = { ...defaultParams, ...(props.parameters || {}) };

    // Create LDAP construct
    this.ldap = new Ldap(this, 'LDAP', {
      environment: props.stackName,
      config,
      vpc,
      ecsSecurityGroup,
      ecsCluster,
      sslCertificateArn: parameters.sslCertificateArn,
      authentikHost: parameters.authentikHost,
      dockerImageLocation: parameters.dockerImageLocation,
      enableExecute: parameters.enableExecute,
      ldapToken
    });

    // Create stack outputs
    new CfnOutput(this, 'StackName', {
      value: this.stackName,
      description: 'Name of the deployed LDAP stack'
    });

    new CfnOutput(this, 'Environment', {
      value: props.stackName,
      description: 'Environment name'
    });

    new CfnOutput(this, 'EnvType', {
      value: props.envType,
      description: 'Environment type'
    });
  }
}
