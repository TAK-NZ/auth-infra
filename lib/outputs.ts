/**
 * Centralized outputs management for the Auth Infrastructure stack
 */
import * as cdk from 'aws-cdk-lib';
import { Fn } from 'aws-cdk-lib';
import { createDynamicExportName, AUTH_EXPORT_NAMES } from './stack-naming';

export interface AuthInfraOutputParams {
  stack: cdk.Stack;
  stackName: string;
  databaseEndpoint: string;
  databaseSecretArn: string;
  redisEndpoint: string;
  redisAuthTokenArn: string;
  efsId: string;
  efsMediaAccessPointId: string;
  efsTemplatesAccessPointId: string;
  authentikSecretKeyArn: string;
  authentikAdminTokenArn: string;
  authentikLdapTokenArn: string;
  authentikAlbDns: string;
  authentikUrl: string;
  ldapAlbDns: string;
  ldapEndpoint: string;
  ldapsEndpoint: string;
  ldapTokenRetrieverLambdaArn: string;
}

export interface LdapOutputParams {
  stack: cdk.Stack;
  stackName: string;
  loadBalancerDns: string;
  ldapEndpoint: string;
  ldapsEndpoint: string;
}

/**
 * Register all outputs for the Auth Infrastructure stack
 */
export function registerAuthInfraOutputs({
  stack,
  stackName,
  databaseEndpoint,
  databaseSecretArn,
  redisEndpoint,
  redisAuthTokenArn,
  efsId,
  efsMediaAccessPointId,
  efsTemplatesAccessPointId,
  authentikSecretKeyArn,
  authentikAdminTokenArn,
  authentikLdapTokenArn,
  authentikAlbDns,
  authentikUrl,
  ldapAlbDns,
  ldapEndpoint,
  ldapsEndpoint,
  ldapTokenRetrieverLambdaArn
}: AuthInfraOutputParams) {
  
  new cdk.CfnOutput(stack, 'DatabaseEndpointOutput', {
    description: 'RDS Aurora PostgreSQL cluster endpoint',
    value: databaseEndpoint,
    exportName: Fn.sub(createDynamicExportName(AUTH_EXPORT_NAMES.DATABASE_ENDPOINT), {
      StackName: stackName,
    }),
  });

  new cdk.CfnOutput(stack, 'DatabaseSecretArnOutput', {
    description: 'RDS Aurora PostgreSQL master secret ARN',
    value: databaseSecretArn,
    exportName: Fn.sub(createDynamicExportName(AUTH_EXPORT_NAMES.DATABASE_SECRET_ARN), {
      StackName: stackName,
    }),
  });

  new cdk.CfnOutput(stack, 'RedisEndpointOutput', {
    description: 'ElastiCache Redis cluster endpoint',
    value: redisEndpoint,
    exportName: Fn.sub(createDynamicExportName(AUTH_EXPORT_NAMES.REDIS_ENDPOINT), {
      StackName: stackName,
    }),
  });

  new cdk.CfnOutput(stack, 'RedisAuthTokenArnOutput', {
    description: 'ElastiCache Redis auth token secret ARN',
    value: redisAuthTokenArn,
    exportName: Fn.sub(createDynamicExportName(AUTH_EXPORT_NAMES.REDIS_AUTH_TOKEN_ARN), {
      StackName: stackName,
    }),
  });

  new cdk.CfnOutput(stack, 'EfsIdOutput', {
    description: 'EFS file system ID',
    value: efsId,
    exportName: Fn.sub(createDynamicExportName(AUTH_EXPORT_NAMES.EFS_ID), {
      StackName: stackName,
    }),
  });

  new cdk.CfnOutput(stack, 'EfsMediaAccessPointOutput', {
    description: 'EFS media access point ID',
    value: efsMediaAccessPointId,
    exportName: Fn.sub(createDynamicExportName(AUTH_EXPORT_NAMES.EFS_MEDIA_ACCESS_POINT), {
      StackName: stackName,
    }),
  });

  new cdk.CfnOutput(stack, 'EfsTemplatesAccessPointOutput', {
    description: 'EFS templates access point ID',
    value: efsTemplatesAccessPointId,
    exportName: Fn.sub(createDynamicExportName(AUTH_EXPORT_NAMES.EFS_TEMPLATES_ACCESS_POINT), {
      StackName: stackName,
    }),
  });

  new cdk.CfnOutput(stack, 'AuthentikSecretKeyArnOutput', {
    description: 'Authentik secret key ARN',
    value: authentikSecretKeyArn,
    exportName: Fn.sub(createDynamicExportName(AUTH_EXPORT_NAMES.AUTHENTIK_SECRET_KEY_ARN), {
      StackName: stackName,
    }),
  });

  new cdk.CfnOutput(stack, 'AuthentikAdminTokenArnOutput', {
    description: 'Authentik admin token ARN',
    value: authentikAdminTokenArn,
    exportName: Fn.sub(createDynamicExportName(AUTH_EXPORT_NAMES.AUTHENTIK_ADMIN_TOKEN_ARN), {
      StackName: stackName,
    }),
  });

  new cdk.CfnOutput(stack, 'AuthentikLdapTokenArnOutput', {
    description: 'Authentik LDAP token ARN',
    value: authentikLdapTokenArn,
    exportName: Fn.sub(createDynamicExportName(AUTH_EXPORT_NAMES.AUTHENTIK_LDAP_TOKEN_ARN), {
      StackName: stackName,
    }),
  });

  new cdk.CfnOutput(stack, 'AuthentikAlbDnsOutput', {
    description: 'Authentik Application Load Balancer DNS name',
    value: authentikAlbDns,
    exportName: Fn.sub(createDynamicExportName(AUTH_EXPORT_NAMES.AUTHENTIK_ALB_DNS), {
      StackName: stackName,
    }),
  });

  new cdk.CfnOutput(stack, 'AuthentikUrlOutput', {
    description: 'Authentik application URL',
    value: authentikUrl,
    exportName: Fn.sub(createDynamicExportName(AUTH_EXPORT_NAMES.AUTHENTIK_URL), {
      StackName: stackName,
    }),
  });

  // LDAP outputs
  new cdk.CfnOutput(stack, 'LdapAlbDnsOutput', {
    description: 'LDAP Application Load Balancer DNS name',
    value: ldapAlbDns,
    exportName: Fn.sub(createDynamicExportName(AUTH_EXPORT_NAMES.LDAP_ALB_DNS), {
      StackName: stackName,
    }),
  });

  new cdk.CfnOutput(stack, 'LdapEndpointOutput', {
    description: 'LDAP endpoint URL',
    value: ldapEndpoint,
    exportName: Fn.sub(createDynamicExportName(AUTH_EXPORT_NAMES.LDAP_ENDPOINT), {
      StackName: stackName,
    }),
  });

  new cdk.CfnOutput(stack, 'LdapsEndpointOutput', {
    description: 'LDAPS endpoint URL',
    value: ldapsEndpoint,
    exportName: Fn.sub(createDynamicExportName(AUTH_EXPORT_NAMES.LDAPS_ENDPOINT), {
      StackName: stackName,
    }),
  });

  new cdk.CfnOutput(stack, 'LdapTokenRetrieverLambdaArnOutput', {
    description: 'ARN of the Lambda function that retrieves and updates LDAP tokens',
    value: ldapTokenRetrieverLambdaArn,
    exportName: Fn.sub(createDynamicExportName(AUTH_EXPORT_NAMES.LDAP_TOKEN_RETRIEVER_LAMBDA_ARN), {
      StackName: stackName,
    }),
  });
}

/**
 * Register all outputs for the LDAP stack
 */
export function registerLdapOutputs({
  stack,
  stackName,
  loadBalancerDns,
  ldapEndpoint,
  ldapsEndpoint
}: LdapOutputParams) {
  
  new cdk.CfnOutput(stack, 'LoadBalancerDnsNameOutput', {
    description: 'LDAP Network Load Balancer DNS name',
    value: loadBalancerDns,
  });

  new cdk.CfnOutput(stack, 'LdapEndpointOutput', {
    description: 'LDAP endpoint URL',
    value: ldapEndpoint,
  });

  new cdk.CfnOutput(stack, 'LdapsEndpointOutput', {
    description: 'LDAPS endpoint URL',
    value: ldapsEndpoint,
  });
}
