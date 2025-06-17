import {
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_secretsmanager as secretsmanager,
  aws_s3 as s3,
  aws_kms as kms,
  aws_elasticloadbalancingv2 as elbv2,
} from 'aws-cdk-lib';

/**
 * Infrastructure configuration shared across constructs
 */
export interface InfrastructureConfig {
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
   * KMS key for secrets encryption
   */
  kmsKey: kms.IKey;
}

/**
 * Secrets configuration for all services
 */
export interface SecretsConfig {
  /**
   * Database secret
   */
  database: secretsmanager.ISecret;

  /**
   * Redis auth token
   */
  redisAuthToken: secretsmanager.ISecret;

  /**
   * Authentik-specific secrets
   */
  authentik: {
    /**
     * Authentik secret key
     */
    secretKey: secretsmanager.ISecret;

    /**
     * Admin user password
     */
    adminUserPassword: secretsmanager.ISecret;

    /**
     * Admin user token
     */
    adminUserToken: secretsmanager.ISecret;

    /**
     * LDAP token
     */
    ldapToken: secretsmanager.ISecret;

    /**
     * LDAP service user credentials
     */
    ldapServiceUser?: secretsmanager.ISecret;
  };
}

/**
 * Storage configuration for S3 and EFS
 */
export interface StorageConfig {
  /**
   * S3 configuration
   */
  s3: {
    /**
     * S3 configuration bucket for environment files
     */
    configBucket: s3.IBucket;

    /**
     * S3 URI for the environment file (optional)
     */
    envFileUri?: string;

    /**
     * S3 key for the environment file (optional)
     */
    envFileKey?: string;
  };

  /**
   * EFS configuration
   */
  efs: {
    /**
     * EFS file system ID
     */
    fileSystemId: string;

    /**
     * EFS media access point ID
     */
    mediaAccessPointId: string;

    /**
     * EFS custom templates access point ID
     */
    customTemplatesAccessPointId: string;
  };
}

/**
 * Deployment configuration
 */
export interface DeploymentConfig {
  /**
   * Git SHA for Docker image tagging
   */
  gitSha: string;

  /**
   * ECR repository ARN for ECR images
   */
  ecrRepositoryArn?: string;

  /**
   * Allow SSH exec into container
   */
  enableExecute: boolean;

  /**
   * Use authentik config file from S3
   */
  useConfigFile: boolean;
}

/**
 * Application configuration for Authentik services
 */
export interface AuthentikApplicationConfig {
  /**
   * Authentik admin user email
   */
  adminUserEmail: string;

  /**
   * LDAP base DN
   */
  ldapBaseDn: string;

  /**
   * Database configuration
   */
  database: {
    /**
     * Database hostname
     */
    hostname: string;
  };

  /**
   * Redis configuration
   */
  redis: {
    /**
     * Redis hostname
     */
    hostname: string;
  };

  /**
   * Authentik host URL (for worker and LDAP constructs)
   */
  authentikHost?: string;
}

/**
 * Network configuration for DNS and load balancers
 */
export interface NetworkConfig {
  /**
   * Hosted Zone ID imported from base infrastructure
   */
  hostedZoneId: string;

  /**
   * Hosted Zone Name imported from base infrastructure
   */
  hostedZoneName: string;

  /**
   * SSL certificate ARN for HTTPS/LDAPS
   */
  sslCertificateArn: string;

  /**
   * Hostname for services
   */
  hostname?: string;

  /**
   * Load balancer (when applicable)
   */
  loadBalancer?: elbv2.ILoadBalancerV2;
}

/**
 * Validation configuration for ECR images
 */
export interface ValidationConfig {
  /**
   * List of required image tags to validate
   */
  requiredImageTags: string[];
}

/**
 * Token retrieval configuration for LDAP
 */
export interface TokenConfig {
  /**
   * Name of the LDAP outpost in Authentik
   */
  outpostName: string;

  /**
   * Admin token secret for Authentik API access
   */
  adminTokenSecret: secretsmanager.ISecret;

  /**
   * Target LDAP token secret to update
   */
  ldapTokenSecret: secretsmanager.ISecret;

  /**
   * Authentik Server ECS service (for dependency)
   */
  authentikServerService: ecs.IService;

  /**
   * Authentik Worker ECS service (for dependency)
   */
  authentikWorkerService: ecs.IService;
}
