/**
 * Security Groups Construct - Centralized security group management
 */
import { Construct } from 'constructs';
import {
  aws_ec2 as ec2,
  Fn
} from 'aws-cdk-lib';
import { createBaseImportValue, BASE_EXPORT_NAMES } from '../cloudformation-imports';

/**
 * Properties for the SecurityGroups construct
 */
export interface SecurityGroupsProps {
  /**
   * VPC to create security groups in
   */
  vpc: ec2.IVpc;

  /**
   * Stack name component for imports
   */
  stackNameComponent: string;

  /**
   * ALB security group to reference
   */
  albSecurityGroup: ec2.ISecurityGroup;
}

/**
 * CDK construct for all security groups
 */
export class SecurityGroups extends Construct {
  /**
   * Security group for Authentik Server ECS tasks
   */
  public readonly authentikServer: ec2.SecurityGroup;

  /**
   * Security group for Authentik Worker ECS tasks
   */
  public readonly authentikWorker: ec2.SecurityGroup;

  /**
   * Security group for LDAP ECS tasks
   */
  public readonly ldap: ec2.SecurityGroup;

  /**
   * Security group for LDAP Network Load Balancer
   */
  public readonly ldapNlb: ec2.SecurityGroup;

  /**
   * Security group for database access
   */
  public readonly database: ec2.SecurityGroup;

  /**
   * Security group for Redis access
   */
  public readonly redis: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: SecurityGroupsProps) {
    super(scope, id);

    // Create Authentik Server security group
    this.authentikServer = new ec2.SecurityGroup(this, 'AuthentikSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for Authentik Server ECS tasks',
      allowAllOutbound: false
    });

    // Allow Authentik application traffic from ALB
    this.authentikServer.addIngressRule(
      ec2.Peer.securityGroupId(props.albSecurityGroup.securityGroupId),
      ec2.Port.tcp(9443),
      'Allow Authentik HTTPS traffic from ALB'
    );

    // Authentik Server outbound rules
    this.addEcsOutboundRules(this.authentikServer);

    // Create Authentik Worker security group
    this.authentikWorker = new ec2.SecurityGroup(this, 'AuthentikWorkerSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for Authentik Worker ECS tasks',
      allowAllOutbound: false
    });

    // Authentik Worker outbound rules (same as server)
    this.addEcsOutboundRules(this.authentikWorker);

    // Create LDAP NLB security group
    this.ldapNlb = new ec2.SecurityGroup(this, 'LDAPNLBSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for LDAP Network Load Balancer',
      allowAllOutbound: false
    });

    // LDAP NLB inbound rules
    this.addLdapNlbInboundRules(this.ldapNlb, props.stackNameComponent);

    // Create LDAP security group
    this.ldap = new ec2.SecurityGroup(this, 'LdapSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for LDAP ECS tasks',
      allowAllOutbound: false
    });

    // LDAP inbound rules
    this.ldap.addIngressRule(
      ec2.Peer.securityGroupId(this.ldapNlb.securityGroupId),
      ec2.Port.tcp(3389),
      'Allow LDAP traffic from NLB'
    );
    this.ldap.addIngressRule(
      ec2.Peer.securityGroupId(this.ldapNlb.securityGroupId),
      ec2.Port.tcp(6636),
      'Allow LDAPS traffic from NLB'
    );

    // LDAP outbound rules (minimal)
    this.ldap.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS access to Authentik server'
    );
    this.addDnsRules(this.ldap);

    // Create database security group
    this.database = new ec2.SecurityGroup(this, 'DBSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for database',
      allowAllOutbound: false
    });

    // Database inbound rules (will be added after ECS security groups are created)
    this.database.addIngressRule(
      ec2.Peer.securityGroupId(this.authentikServer.securityGroupId),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access from Authentik Server'
    );
    this.database.addIngressRule(
      ec2.Peer.securityGroupId(this.authentikWorker.securityGroupId),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access from Authentik Worker'
    );

    // Create Redis security group
    this.redis = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for Redis',
      allowAllOutbound: false
    });

    // Redis inbound rules
    this.redis.addIngressRule(
      ec2.Peer.securityGroupId(this.authentikServer.securityGroupId),
      ec2.Port.tcp(6379),
      'Allow Redis access from Authentik Server'
    );
    this.redis.addIngressRule(
      ec2.Peer.securityGroupId(this.authentikWorker.securityGroupId),
      ec2.Port.tcp(6379),
      'Allow Redis access from Authentik Worker'
    );
  }

  /**
   * Add standard ECS outbound rules (Server/Worker)
   */
  private addEcsOutboundRules(securityGroup: ec2.SecurityGroup): void {
    securityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access'
    );
    securityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(6379),
      'Allow Redis access'
    );
    securityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(2049),
      'Allow EFS access'
    );
    securityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS access'
    );
    this.addDnsRules(securityGroup);
  }

  /**
   * Add DNS rules (TCP and UDP port 53)
   */
  private addDnsRules(securityGroup: ec2.SecurityGroup): void {
    securityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(53),
      'Allow DNS access'
    );
    securityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.udp(53),
      'Allow DNS access'
    );
  }

  /**
   * Add LDAP NLB inbound rules for IPv4 and IPv6
   */
  private addLdapNlbInboundRules(securityGroup: ec2.SecurityGroup, stackNameComponent: string): void {
    // IPv4 rules
    securityGroup.addIngressRule(
      ec2.Peer.ipv4(Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.VPC_CIDR_IPV4))),
      ec2.Port.tcp(389),
      'Allow LDAP access from VPC IPv4'
    );
    securityGroup.addIngressRule(
      ec2.Peer.ipv4(Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.VPC_CIDR_IPV4))),
      ec2.Port.tcp(636),
      'Allow LDAPS access from VPC IPv4'
    );

    // IPv6 rules
    securityGroup.addIngressRule(
      ec2.Peer.ipv6(Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.VPC_CIDR_IPV6))),
      ec2.Port.tcp(389),
      'Allow LDAP access from VPC IPv6'
    );
    securityGroup.addIngressRule(
      ec2.Peer.ipv6(Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.VPC_CIDR_IPV6))),
      ec2.Port.tcp(636),
      'Allow LDAPS access from VPC IPv6'
    );
  }
}