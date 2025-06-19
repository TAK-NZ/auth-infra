/**
 * Centralized outputs management for the Auth Infrastructure stack
 */
import * as cdk from 'aws-cdk-lib';

export interface OutputParams {
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
  ldapNlbDns: string;
  ldapEndpoint: string;
  ldapsEndpoint: string;
  ldapTokenRetrieverLambdaArn: string;
}

export function registerOutputs(params: OutputParams): void {
  const { stack, stackName } = params;
  
  const outputs = [
    { key: 'DatabaseEndpoint', value: params.databaseEndpoint, description: 'RDS Aurora PostgreSQL cluster endpoint' },
    { key: 'DatabaseSecretArn', value: params.databaseSecretArn, description: 'RDS Aurora PostgreSQL master secret ARN' },
    { key: 'RedisEndpoint', value: params.redisEndpoint, description: 'ElastiCache Redis cluster endpoint' },
    { key: 'RedisAuthTokenArn', value: params.redisAuthTokenArn, description: 'ElastiCache Redis auth token secret ARN' },
    { key: 'EfsId', value: params.efsId, description: 'EFS file system ID' },
    { key: 'EfsMediaAccessPoint', value: params.efsMediaAccessPointId, description: 'EFS media access point ID' },
    { key: 'EfsTemplatesAccessPoint', value: params.efsTemplatesAccessPointId, description: 'EFS templates access point ID' },
    { key: 'AuthentikSecretKeyArn', value: params.authentikSecretKeyArn, description: 'Authentik secret key ARN' },
    { key: 'AuthentikAdminTokenArn', value: params.authentikAdminTokenArn, description: 'Authentik admin token ARN' },
    { key: 'AuthentikLdapTokenArn', value: params.authentikLdapTokenArn, description: 'Authentik LDAP token ARN' },
    { key: 'AuthentikAlbDns', value: params.authentikAlbDns, description: 'Authentik Application Load Balancer DNS name' },
    { key: 'AuthentikUrl', value: params.authentikUrl, description: 'Authentik application URL' },
    { key: 'LdapNlbDns', value: params.ldapNlbDns, description: 'LDAP Network Load Balancer DNS name' },
    { key: 'LdapEndpoint', value: params.ldapEndpoint, description: 'LDAP endpoint URL' },
    { key: 'LdapsEndpoint', value: params.ldapsEndpoint, description: 'LDAPS endpoint URL' },
    { key: 'LdapTokenRetrieverLambdaArn', value: params.ldapTokenRetrieverLambdaArn, description: 'ARN of the Lambda function that retrieves and updates LDAP tokens' },
  ];

  outputs.forEach(({ key, value, description }) => {
    new cdk.CfnOutput(stack, `${key}Output`, {
      value,
      description,
      exportName: `${stackName}-${key}`,
    });
  });
}
