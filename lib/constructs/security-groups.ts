/**
 * Security Groups Construct - Centralized security group management
 */
import { Construct } from 'constructs';
import {
  aws_ec2 as ec2,
  Fn
} from 'aws-cdk-lib';
import { createBaseImportValue, BASE_EXPORT_NAMES } from '../cloudformation-imports';
import { DATABASE_CONSTANTS, REDIS_CONSTANTS, AUTHENTIK_CONSTANTS, EFS_CONSTANTS } from '../utils/constants';

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

  /**
   * Outbound email server port (default: 587)
   */
  outboundEmailServerPort?: number;
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

    const emailServerPort = props.outboundEmailServerPort ?? 587;
    
    // Allow ALB to talk to any destination over HTTPS (port 443)
    // This is required for OIDC authentication 
    props.albSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow ALB to talk to any destination over HTTPS (IPv4)'
    );
    
    props.albSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv6(),
      ec2.Port.tcp(443),
      'Allow ALB to talk to any destination over HTTPS (IPv6)'
    );

    // Create Authentik Server security group
    this.authentikServer = new ec2.SecurityGroup(this, 'AuthentikServer', {
      vpc: props.vpc,
      description: 'Security group for Authentik Server ECS tasks',
      allowAllOutbound: false
    });

    // Allow Authentik application traffic from ALB
    this.authentikServer.addIngressRule(
      ec2.Peer.securityGroupId(props.albSecurityGroup.securityGroupId),
      ec2.Port.tcp(AUTHENTIK_CONSTANTS.SERVER_PORT),
      'Allow Authentik HTTPS traffic from ALB'
    );

    // Authentik Server outbound rules
    this.addEcsOutboundRules(this.authentikServer);
    this.authentikServer.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(emailServerPort),
      'Allow outbound email server access'
    );
    this.authentikServer.addEgressRule(
      ec2.Peer.anyIpv6(),
      ec2.Port.tcp(emailServerPort),
      'Allow outbound email server access IPv6'
    );

    // Create Authentik Worker security group
    this.authentikWorker = new ec2.SecurityGroup(this, 'AuthentikWorker', {
      vpc: props.vpc,
      description: 'Security group for Authentik Worker ECS tasks',
      allowAllOutbound: false
    });

    // Authentik Worker outbound rules (includes email server access)
    this.addEcsOutboundRules(this.authentikWorker);
    this.authentikWorker.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(emailServerPort),
      'Allow outbound email server access'
    );
    this.authentikWorker.addEgressRule(
      ec2.Peer.anyIpv6(),
      ec2.Port.tcp(emailServerPort),
      'Allow outbound email server access IPv6'
    );

    // Create LDAP NLB security group
    this.ldapNlb = new ec2.SecurityGroup(this, 'LDAPNLB', {
      vpc: props.vpc,
      description: 'Security group for LDAP Network Load Balancer',
      allowAllOutbound: false
    });

    // Create LDAP security group first
    this.ldap = new ec2.SecurityGroup(this, 'AuthentikLdap', {
      vpc: props.vpc,
      description: 'Security group for LDAP ECS tasks',
      allowAllOutbound: false
    });
    
    // LDAP outbound rules (minimal)
    this.ldap.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS access to Authentik server'
    );
    this.ldap.addEgressRule(
      ec2.Peer.anyIpv6(),
      ec2.Port.tcp(443),
      'Allow HTTPS access to Authentik server IPv6'
    );
    this.addDnsRules(this.ldap);
    
    // LDAP NLB inbound rules
    this.addLdapNlbInboundRules(this.ldapNlb, props.stackNameComponent);

    // LDAP inbound rules - add after NLB security group is fully configured
    this.ldap.addIngressRule(
      ec2.Peer.securityGroupId(this.ldapNlb.securityGroupId),
      ec2.Port.tcp(AUTHENTIK_CONSTANTS.NLB_LDAP_PORT),
      'Allow LDAP traffic from NLB'
    );
    this.ldap.addIngressRule(
      ec2.Peer.securityGroupId(this.ldapNlb.securityGroupId),
      ec2.Port.tcp(AUTHENTIK_CONSTANTS.NLB_LDAPS_PORT),
      'Allow LDAPS traffic from NLB'
    );

    // LDAP NLB outbound rules for health checks - add at the end to avoid circular dependencies
    this.addLdapNlbOutboundRules(this.ldapNlb, props.stackNameComponent);

    // Create database security group
    this.database = new ec2.SecurityGroup(this, 'AuroraDB', {
      vpc: props.vpc,
      description: 'Security group for database',
      allowAllOutbound: false
    });

    // Database inbound rules (will be added after ECS security groups are created)
    this.database.addIngressRule(
      ec2.Peer.securityGroupId(this.authentikServer.securityGroupId),
      ec2.Port.tcp(DATABASE_CONSTANTS.PORT),
      'Allow PostgreSQL access from Authentik Server'
    );
    this.database.addIngressRule(
      ec2.Peer.securityGroupId(this.authentikWorker.securityGroupId),
      ec2.Port.tcp(DATABASE_CONSTANTS.PORT),
      'Allow PostgreSQL access from Authentik Worker'
    );

    // Create Redis security group
    this.redis = new ec2.SecurityGroup(this, 'Redis', {
      vpc: props.vpc,
      description: 'Security group for Redis',
      allowAllOutbound: false
    });

    // Redis inbound rules
    this.redis.addIngressRule(
      ec2.Peer.securityGroupId(this.authentikServer.securityGroupId),
      ec2.Port.tcp(REDIS_CONSTANTS.PORT),
      'Allow Redis access from Authentik Server'
    );
    this.redis.addIngressRule(
      ec2.Peer.securityGroupId(this.authentikWorker.securityGroupId),
      ec2.Port.tcp(REDIS_CONSTANTS.PORT),
      'Allow Redis access from Authentik Worker'
    );
  }

  /**
   * Add standard ECS outbound rules (Server/Worker)
   */
  private addEcsOutboundRules(securityGroup: ec2.SecurityGroup): void {
    securityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(DATABASE_CONSTANTS.PORT),
      'Allow PostgreSQL access'
    );
    securityGroup.addEgressRule(
      ec2.Peer.anyIpv6(),
      ec2.Port.tcp(DATABASE_CONSTANTS.PORT),
      'Allow PostgreSQL access IPv6'
    );
    securityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(REDIS_CONSTANTS.PORT),
      'Allow Redis access'
    );
    securityGroup.addEgressRule(
      ec2.Peer.anyIpv6(),
      ec2.Port.tcp(REDIS_CONSTANTS.PORT),
      'Allow Redis access IPv6'
    );
    securityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(EFS_CONSTANTS.PORT),
      'Allow EFS access'
    );
    securityGroup.addEgressRule(
      ec2.Peer.anyIpv6(),
      ec2.Port.tcp(EFS_CONSTANTS.PORT),
      'Allow EFS access IPv6'
    );
    securityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS access'
    );
    securityGroup.addEgressRule(
      ec2.Peer.anyIpv6(),
      ec2.Port.tcp(443),
      'Allow HTTPS access IPv6'
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
      ec2.Peer.anyIpv6(),
      ec2.Port.tcp(53),
      'Allow DNS access IPv6'
    );
    securityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.udp(53),
      'Allow DNS access'
    );
    securityGroup.addEgressRule(
      ec2.Peer.anyIpv6(),
      ec2.Port.udp(53),
      'Allow DNS access IPv6'
    );
  }

  /**
   * Add LDAP NLB inbound rules for IPv4 and IPv6
   */
  private addLdapNlbInboundRules(securityGroup: ec2.SecurityGroup, stackNameComponent: string): void {
    // IPv4 rules
    securityGroup.addIngressRule(
      ec2.Peer.ipv4(Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.VPC_CIDR_IPV4))),
      ec2.Port.tcp(AUTHENTIK_CONSTANTS.LDAP_PORT),
      'Allow LDAP access from VPC IPv4'
    );
    securityGroup.addIngressRule(
      ec2.Peer.ipv4(Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.VPC_CIDR_IPV4))),
      ec2.Port.tcp(AUTHENTIK_CONSTANTS.LDAPS_PORT),
      'Allow LDAPS access from VPC IPv4'
    );

    // IPv6 rules
    securityGroup.addIngressRule(
      ec2.Peer.ipv6(Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.VPC_CIDR_IPV6))),
      ec2.Port.tcp(AUTHENTIK_CONSTANTS.LDAP_PORT),
      'Allow LDAP access from VPC IPv6'
    );
    securityGroup.addIngressRule(
      ec2.Peer.ipv6(Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.VPC_CIDR_IPV6))),
      ec2.Port.tcp(AUTHENTIK_CONSTANTS.LDAPS_PORT),
      'Allow LDAPS access from VPC IPv6'
    );
  }

  /**
   * Add LDAP NLB outbound rules for health checks
   */
  private addLdapNlbOutboundRules(securityGroup: ec2.SecurityGroup, stackNameComponent: string): void {
    // IPv4 rules for health checks
    securityGroup.addEgressRule(
      ec2.Peer.ipv4(Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.VPC_CIDR_IPV4))),
      ec2.Port.tcp(AUTHENTIK_CONSTANTS.NLB_LDAP_PORT),
      'Allow health check to LDAP container IPv4'
    );
    securityGroup.addEgressRule(
      ec2.Peer.ipv4(Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.VPC_CIDR_IPV4))),
      ec2.Port.tcp(AUTHENTIK_CONSTANTS.NLB_LDAPS_PORT),
      'Allow health check to LDAPS container IPv4'
    );

    // IPv6 rules for health checks
    securityGroup.addEgressRule(
      ec2.Peer.ipv6(Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.VPC_CIDR_IPV6))),
      ec2.Port.tcp(AUTHENTIK_CONSTANTS.NLB_LDAP_PORT),
      'Allow health check to LDAP container IPv6'
    );
    securityGroup.addEgressRule(
      ec2.Peer.ipv6(Fn.importValue(createBaseImportValue(stackNameComponent, BASE_EXPORT_NAMES.VPC_CIDR_IPV6))),
      ec2.Port.tcp(AUTHENTIK_CONSTANTS.NLB_LDAPS_PORT),
      'Allow health check to LDAPS container IPv6'
    );
  }
}