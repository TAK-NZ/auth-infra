# Architecture Documentation

## System Architecture

The TAK Authentication Infrastructure provides centralized authentication and authorization services with SSO via OIDC using Authentik, along with LDAP integration for the TAK server.

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Internet      │────│  Application     │────│   Authentik     │
│   Users         │    │  Load Balancer   │    │   ECS Service   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                        │
                                                 ┌──────┴──────────┐
                                                 │                 │
┌─────────────────┐    ┌──────────────────┐      ▼                 ▼
│   TAK Server    │────│   Network        │ ┌──────────┐    ┌──────────────┐
│   (External)    │    │   Load Balancer  │ │   RDS    │    │     EFS      │
└─────────────────┘    │   (LDAP)         │ │ Aurora   │    │  Shared      │
                       └──────────────────┘ │PostgreSQL│    │  Storage     │
                                │           └──────────┘    └──────────────┘
                        ┌───────┴────────┐       │
                        │  LDAP Outpost  │       │
                        │  ECS Service   │       │
                        └────────────────┘       │
                                │                │
                                ▼                ▼
                        ┌────────────────────────────┐
                        │      ElastiCache Redis     │
                        │     Session Storage        │
                        └────────────────────────────┘
```

## Component Details

### Core Services

#### 1. Authentik Application Server
- **Technology**: Python/Django application running in ECS Fargate
- **Purpose**: Web-based authentication and identity management
- **Scaling**: Auto-scaling based on CPU/memory utilization
- **Storage**: Persistent data in Aurora PostgreSQL, session data in Redis

#### 2. LDAP Outpost
- **Technology**: Go-based LDAP proxy running in ECS Fargate
- **Purpose**: Provides LDAP interface for TAK Server and other legacy applications
- **Protocol**: LDAP over TLS on port 636
- **Authentication**: Connects back to Authentik for user validation
- **Access**: Accessed directly by TAK Server via Network Load Balancer

#### 3. TAK Server Integration
- **Location**: External to this authentication infrastructure
- **Access Method**: Connects to LDAP Outpost via Network Load Balancer
- **Protocol**: LDAPS (LDAP over TLS) on port 636
- **Purpose**: Authenticates TAK users against the centralized identity store
- **Protocol**: LDAP over TLS on port 636
- **Authentication**: Connects back to Authentik for user validation

### Data Layer

#### 1. Aurora PostgreSQL Database
- **Purpose**: Primary data store for Authentik configuration and user data
- **Configuration**: Multi-AZ cluster for high availability
- **Backup**: Automated backups with point-in-time recovery
- **Encryption**: Encrypted at rest using AWS KMS

#### 2. ElastiCache Redis
- **Purpose**: Session storage and caching
- **Configuration**: Single node (dev) or cluster mode (prod)
- **Persistence**: Configured for session persistence
- **Encryption**: In-transit and at-rest encryption

#### 3. EFS File System
- **Purpose**: Shared storage for Authentik media and certificates
- **Mount Points**: `/media` and `/certs` in Authentik containers
- **Backup**: AWS Backup service integration
- **Encryption**: Encrypted at rest

### Network Architecture

#### 1. VPC Configuration
- **Subnets**: Public subnets for ALB, private subnets for services
- **Availability Zones**: Multi-AZ deployment for high availability
- **NAT Gateway**: Outbound internet access for private subnets

#### 2. Load Balancing
- **Application Load Balancer**: HTTPS termination and routing for Authentik web interface (accessed by Internet Users)
- **Network Load Balancer**: Layer 4 load balancing for LDAP traffic (accessed by TAK Server)
- **Traffic Separation**: Web UI and LDAP protocols use separate load balancers for optimal performance
- **Health Checks**: Custom health check endpoints for both services

#### 3. Security Groups
- **Principle of Least Privilege**: Minimal required access between components
- **Ingress Rules**: Specific port and protocol restrictions
- **Egress Rules**: Controlled outbound access

## Environment Configuration System

### 1. Environment Types

#### **dev-test** (Default)
- **Focus**: Cost optimization and development efficiency
- **Database**: Aurora Serverless v2 (single instance, auto-scaling)
- **Redis**: Single node, no encryption
- **ECS**: Minimal CPU/memory allocation (512/1024)
- **Container Insights**: Disabled
- **ECS Exec**: Enabled (debugging access)
- **S3 Config File**: Disabled (uses environment variables)
- **ECR**: 5 image retention, no vulnerability scanning
- **Resource Removal**: DESTROY policy (allows cleanup)

#### **prod**
- **Focus**: High availability, security, and production readiness
- **Database**: Aurora PostgreSQL (2 instances, multi-AZ)
- **Redis**: Multi-node cluster with encryption
- **ECS**: Higher resource allocation (1024/2048)
- **Container Insights**: Enabled (monitoring and observability)
- **ECS Exec**: Disabled (security)
- **S3 Config File**: Enabled (advanced configuration)
- **ECR**: 20 image retention, vulnerability scanning enabled
- **Resource Removal**: RETAIN policy (protects production resources)

### 2. Parameter Override System
- **Environment Variables**: Highest precedence override mechanism
- **CDK Context**: CLI-based parameter overrides
- **Environment Defaults**: Fallback configuration based on environment type
- **Hierarchical Resolution**: Context → Environment Variables → Environment Defaults

## Security Architecture

### 1. Network Security Groups

The infrastructure implements a layered security model with dedicated security groups for each component, following the principle of least privilege.

#### Internet-Facing Services

**AuthentikELBALBSecurityGroup** (Application Load Balancer)
- **Port 80/TCP** from `0.0.0.0/0` (IPv4) and `::/0` (IPv6) - HTTP redirects to HTTPS
- **Port 443/TCP** from `0.0.0.0/0` (IPv4) and `::/0` (IPv6) - HTTPS web interface

**LDAPNLBSecurityGroup** (Network Load Balancer)
- **Port 389/TCP** from VPC CIDR (IPv4/IPv6) - LDAP access
- **Port 636/TCP** from VPC CIDR (IPv4/IPv6) - LDAPS access

#### Application Services

**AuthentikSecurityGroup** (Server)
- **Port 9000/TCP** from `AuthentikELBALBSecurityGroup` only - ALB to application traffic

**AuthentikWorkerSecurityGroup** (Worker)
- **No inbound rules** - Worker processes background tasks, no incoming connections required

**LdapSecurityGroup** (LDAP Outpost)
- **Port 3389/TCP** from `LDAPNLBSecurityGroup` - LDAP traffic from NLB
- **Port 6636/TCP** from `LDAPNLBSecurityGroup` - LDAPS traffic from NLB

#### Data Layer Services

**DBSecurityGroup** (Aurora PostgreSQL)
- **Port 5432/TCP** from `AuthentikSecurityGroup` - Database access from Server
- **Port 5432/TCP** from `AuthentikWorkerSecurityGroup` - Database access from Worker

**RedisSecurityGroup** (ElastiCache)
- **Port 6379/TCP** from `AuthentikSecurityGroup` - Redis access from Server
- **Port 6379/TCP** from `AuthentikWorkerSecurityGroup` - Redis access from Worker

**EFSMountTargetSecurityGroup** (Elastic File System)
- **Port 2049/TCP** from `AuthentikSecurityGroup` - NFS access from Server
- **Port 2049/TCP** from `AuthentikWorkerSecurityGroup` - NFS access from Worker

#### Security Design Principles

- **Network Segmentation**: Each service tier has dedicated security groups
- **Minimal Access**: Only required ports and protocols are allowed
- **Source Restriction**: Database, Redis, and EFS only accept traffic from application security groups
- **Dualstack Support**: Internet-facing services support both IPv4 and IPv6
- **No Broad Access**: VPC CIDR rules eliminated in favor of specific security group references

### 2. Encryption
- **In Transit**: TLS 1.2+ for all communications
- **At Rest**: AWS KMS encryption for all data stores
- **Key Management**: Separate KMS keys per environment

### 3. Access Control
- **IAM Roles**: Service-specific roles with minimal permissions
- **Security Groups**: Network-level access control (detailed above)
- **Secrets Management**: AWS Secrets Manager for sensitive data

### 4. Monitoring and Logging
- **CloudWatch Logs**: Application and system logs
- **CloudWatch Metrics**: Performance and health metrics
- **AWS CloudTrail**: API access logging

## Deployment Architecture

### 1. Infrastructure as Code
- **AWS CDK**: TypeScript-based infrastructure definitions
- **Version Control**: Git-based infrastructure versioning
- **Automated Testing**: Unit tests for infrastructure code

### 2. Container Management
- **ECR**: Private container registry
- **ECS Fargate**: Serverless container orchestration
- **Auto Scaling**: CPU and memory-based scaling policies

### 3. Environment Separation
- **Development**: Single AZ, minimal redundancy
- **Production**: Multi-AZ, full redundancy and backups

## Cost Optimization

### 1. Environment-Based Scaling
- **Development**: Minimal redundancy, single AZ where possible
- **Production**: Full redundancy and high availability
- **Staging**: Production-like with cost optimizations

### 2. Resource Optimization
- **NAT Gateway**: Single vs. redundant based on environment
- **VPC Endpoints**: Gateway endpoints preferred for cost efficiency
- **ECS Capacity**: FARGATE_SPOT integration for cost savings
- **Storage**: Lifecycle policies and intelligent tiering

### 3. Monitoring and Alerts
- **Cost Tracking**: Resource tagging for cost allocation
- **Usage Monitoring**: CloudWatch metrics for resource utilization
- **Budget Integration**: Compatible with AWS Budgets and Cost Explorer

## Disaster Recovery and High Availability

### 1. Multi-AZ Deployment
- **Database**: Aurora PostgreSQL cluster with writer and reader instances (production)
- **Redis**: Multi-node replication group with automatic failover (production)
- **Services**: ECS services deployed across multiple availability zones
- **Load Balancers**: ALB and NLB distribute traffic across AZs

### 2. Backup Configuration
- **Database**: Aurora automated backups (7 days dev, 30 days prod)
- **Database Snapshots**: Automatic snapshots with configurable retention
- **EFS Storage**: Persistent storage for Authentik media and certificates
- **Infrastructure**: All infrastructure defined as code in version control

### 3. Auto-Recovery Features
- **ECS Services**: Automatic container replacement on failure
- **Aurora**: Built-in failover to reader instance in production
- **Redis**: Automatic failover in multi-node configuration
- **Auto Scaling**: ECS services scale based on CPU and memory utilization

## Performance Considerations

### 1. Scaling Patterns
- **Horizontal Scaling**: ECS service auto-scaling
- **Database Scaling**: Read replicas for read-heavy workloads
- **Caching**: Redis for session and application caching

### 2. Monitoring
- **Response Time**: Application response time monitoring
- **Resource Utilization**: CPU, memory, and network monitoring
- **Error Rates**: Application error tracking and alerting

### 3. Optimization
- **Container Resources**: Right-sized CPU and memory allocation
- **Database Performance**: Query optimization and indexing
- **Network**: Optimized security group rules and routing
