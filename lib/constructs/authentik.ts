/**
 * Authentik Construct - CDK implementation of the Authentik service
 * Orchestrates the server, worker, and load balancer components
 */
import { Construct } from 'constructs';
import {
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_elasticloadbalancingv2 as elbv2,
  aws_secretsmanager as secretsmanager,
  aws_s3 as s3,
  CfnOutput
} from 'aws-cdk-lib';
import type { AuthInfraEnvironmentConfig } from '../environment-config';
import { Elb } from './elb';
import { AuthentikServer } from './authentik-server';
import { AuthentikWorker } from './authentik-worker';

/**
 * Properties for the Authentik construct
 */
export interface AuthentikProps {
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
   * Security group for ECS tasks
   */
  ecsSecurityGroup: ec2.SecurityGroup;

  /**
   * ECS cluster
   */
  ecsCluster: ecs.ICluster;

  /**
   * S3 configuration bucket for environment files
   */
  s3ConfBucket: s3.IBucket;

  /**
   * S3 URI for the environment file (optional)
   */
  envFileS3Uri?: string;

  /**
   * S3 key for the environment file (optional)
   */
  envFileS3Key?: string;

  /**
   * SSL certificate ARN for HTTPS
   */
  sslCertificateArn: string;

  /**
   * Authentik admin user email
   */
  adminUserEmail: string;

  /**
   * LDAP base DN
   */
  ldapBaseDn: string;

  /**
   * Whether to use authentik-config.env file
   */
  useConfigFile: boolean;

  /**
   * ECR repository ARN for ECR images
   */
  ecrRepositoryArn?: string;

  /**
   * Allow SSH exec into container
   */
  enableExecute: boolean;

  /**
   * Database credentials secret
   */
  dbSecret: secretsmanager.Secret;

  /**
   * Database hostname
   */
  dbHostname: string;

  /**
   * Redis auth token secret
   */
  redisAuthToken: secretsmanager.Secret;

  /**
   * Redis hostname
   */
  redisHostname: string;

  /**
   * Authentik secret key
   */
  secretKey: secretsmanager.Secret;

  /**
   * Admin user password secret
   */
  adminUserPassword: secretsmanager.Secret;

  /**
   * Admin user token secret
   */
  adminUserToken: secretsmanager.Secret;

  /**
   * LDAP token secret
   */
  ldapToken: secretsmanager.Secret;

  /**
   * EFS filesystem ID
   */
  efsId: string;

  /**
   * EFS access point ID for media
   */
  efsMediaAccessPointId: string;

  /**
   * EFS access point ID for custom templates
   */
  efsCustomTemplatesAccessPointId: string;
}

/**
 * CDK construct for the Authentik service - orchestrates server, worker, and load balancer
 */
export class Authentik extends Construct {
  /**
   * The load balancer for the Authentik service
   */
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;

  /**
   * The ECS task definition for the Authentik server
   */
  public readonly taskDefinition: ecs.TaskDefinition;

  /**
   * The ECS service for Authentik server
   */
  public readonly ecsService: ecs.FargateService;

  /**
   * The ECS service for Authentik workers
   */
  public readonly workerService: ecs.FargateService;

  /**
   * DNS name of the load balancer
   */
  public readonly dnsName: string;

  constructor(scope: Construct, id: string, props: AuthentikProps) {
    super(scope, id);

    // Create the load balancer and networking
    const elb = new Elb(this, 'ELB', {
      environment: props.environment,
      config: props.config,
      vpc: props.vpc,
      sslCertificateArn: props.sslCertificateArn
    });

    // Create the Authentik server
    const server = new AuthentikServer(this, 'Server', {
      environment: props.environment,
      config: props.config,
      vpc: props.vpc,
      ecsSecurityGroup: props.ecsSecurityGroup,
      ecsCluster: props.ecsCluster,
      s3ConfBucket: props.s3ConfBucket,
      envFileS3Uri: props.envFileS3Uri,
      envFileS3Key: props.envFileS3Key,
      adminUserEmail: props.adminUserEmail,
      ldapBaseDn: props.ldapBaseDn,
      useConfigFile: props.useConfigFile,
      ecrRepositoryArn: props.ecrRepositoryArn,
      enableExecute: props.enableExecute,
      dbSecret: props.dbSecret,
      dbHostname: props.dbHostname,
      redisAuthToken: props.redisAuthToken,
      redisHostname: props.redisHostname,
      secretKey: props.secretKey,
      adminUserPassword: props.adminUserPassword,
      adminUserToken: props.adminUserToken,
      ldapToken: props.ldapToken,
      efsId: props.efsId,
      efsMediaAccessPointId: props.efsMediaAccessPointId,
      efsCustomTemplatesAccessPointId: props.efsCustomTemplatesAccessPointId
    });

    // Create the Authentik worker
    const worker = new AuthentikWorker(this, 'Worker', {
      environment: props.environment,
      config: props.config,
      vpc: props.vpc,
      ecsSecurityGroup: props.ecsSecurityGroup,
      ecsCluster: props.ecsCluster,
      s3ConfBucket: props.s3ConfBucket,
      envFileS3Key: props.envFileS3Key,
      ecrRepositoryArn: props.ecrRepositoryArn,
      enableExecute: props.enableExecute,
      dbSecret: props.dbSecret,
      dbHostname: props.dbHostname,
      redisAuthToken: props.redisAuthToken,
      redisHostname: props.redisHostname,
      secretKey: props.secretKey,
      efsId: props.efsId,
      efsMediaAccessPointId: props.efsMediaAccessPointId,
      efsCustomTemplatesAccessPointId: props.efsCustomTemplatesAccessPointId
    });

    // Connect the server to the load balancer
    server.createTargetGroup(props.vpc, elb.httpsListener);

    // Expose public properties
    this.loadBalancer = elb.loadBalancer;
    this.taskDefinition = server.taskDefinition;
    this.ecsService = server.ecsService;
    this.workerService = worker.ecsService;
    this.dnsName = elb.dnsName;

    // Export additional outputs
    new CfnOutput(this, 'AuthentikServerServiceName', {
      value: this.ecsService.serviceName,
      description: 'The name of the Authentik server ECS service'
    });

    new CfnOutput(this, 'AuthentikWorkerServiceName', {
      value: this.workerService.serviceName,
      description: 'The name of the Authentik worker ECS service'
    });
  }
}
