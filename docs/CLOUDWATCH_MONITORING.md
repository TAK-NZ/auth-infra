# CloudWatch Monitoring Guide

## Overview

The TAK Authentication Infrastructure provides comprehensive monitoring through AWS CloudWatch, with environment-specific monitoring configurations optimized for cost and observability needs.

## Monitoring Architecture

### **Environment-Based Monitoring**

| Feature | dev-test | prod | Purpose |
|---------|----------|------|---------|
| **Container Insights** | Disabled | Enabled | ECS task and service metrics |
| **Enhanced Monitoring** | Disabled | 60-second intervals | RDS performance metrics |
| **Performance Insights** | Disabled | Enabled | Database query analysis |
| **Detailed Logging** | Enabled | Optimized | Application debugging |
| **Log Retention** | 1 week | 1 month | Cost vs. compliance balance |

## Core Metrics and Dashboards

### **Application Layer Metrics**

#### **Authentik Server (ECS Service)**
- **CPU Utilization**: Task-level CPU usage
- **Memory Utilization**: Task-level memory consumption
- **Task Count**: Running vs. desired task count
- **Health Check Status**: ALB target health
- **Response Time**: Application response latency

#### **LDAP Outpost (ECS Service)**
- **CPU Utilization**: LDAP proxy performance
- **Memory Utilization**: Memory usage patterns
- **Connection Count**: Active LDAP connections
- **Request Rate**: LDAP queries per second
- **Error Rate**: Failed authentication attempts

### **Data Layer Metrics**

#### **Aurora PostgreSQL Database**
- **CPU Utilization**: Database server performance
- **Database Connections**: Active connection count
- **Read/Write IOPS**: Storage performance
- **Query Performance**: Slow query identification (prod only)
- **Replication Lag**: Multi-AZ synchronization (prod only)

#### **ElastiCache Redis**
- **CPU Utilization**: Cache server performance
- **Memory Usage**: Cache utilization
- **Cache Hit Ratio**: Cache effectiveness
- **Network I/O**: Data transfer rates
- **Evictions**: Memory pressure indicators

#### **EFS File System**
- **Total I/O**: File system activity
- **Throughput**: Data transfer rates
- **Client Connections**: Active mount connections

### **Network Layer Metrics**

#### **Application Load Balancer**
- **Request Count**: HTTP/HTTPS requests
- **Target Response Time**: Backend latency
- **HTTP Error Rates**: 4xx/5xx error tracking
- **Healthy Target Count**: Available backend instances

#### **Network Load Balancer**
- **Active Flow Count**: LDAP connections
- **New Flow Count**: Connection establishment rate
- **Target Health**: LDAP service availability

## Log Management

### **Application Logs**

#### **Authentik Server Logs**
```
Log Group: /ecs/TAK-{StackName}-AuthInfra-AuthentikServer
Retention: 1 week (dev-test) | 1 month (prod)
Content: Application logs, authentication events, errors
```

#### **Authentik Worker Logs**
```
Log Group: /ecs/TAK-{StackName}-AuthInfra-AuthentikWorker
Retention: 1 week (dev-test) | 1 month (prod)
Content: Background task processing, email sending, maintenance
```

#### **LDAP Outpost Logs**
```
Log Group: /ecs/TAK-{StackName}-AuthInfra-LDAP
Retention: 1 week (dev-test) | 1 month (prod)
Content: LDAP queries, authentication attempts, connection logs
```

### **Database Logs**

#### **Aurora PostgreSQL Logs**
```
Log Group: /aws/rds/cluster/TAK-{StackName}-AuthInfra-Database/postgresql
Retention: 1 week (dev-test) | 1 month (prod)
Content: SQL queries, connection logs, error messages
```

### **Load Balancer Logs**

#### **Application Load Balancer Access Logs**
- **Storage**: S3 bucket (imported from base infrastructure)
- **Format**: Standard ALB access log format
- **Content**: HTTP requests, response codes, client IPs

#### **Network Load Balancer Flow Logs**
- **Storage**: CloudWatch Logs
- **Content**: LDAP connection flows, source/destination tracking

## Alerting and Notifications

### **Production Alerting (prod environment only)**

The production environment includes comprehensive alerting for critical metrics:

#### **Database Alerts**
- **High CPU Utilization**: > 80% for 5 minutes
- **High Connection Count**: > 80% of max connections
- **Replication Lag**: > 30 seconds
- **Storage Space**: > 85% utilization

#### **Application Alerts**
- **ECS Service Unhealthy**: < 50% healthy tasks
- **High Memory Usage**: > 85% for 10 minutes
- **Load Balancer Errors**: > 5% error rate
- **Target Health**: < 1 healthy target

#### **Cache Alerts**
- **Redis High Memory**: > 90% utilization
- **Low Cache Hit Ratio**: < 80% for 15 minutes
- **High Eviction Rate**: Significant memory pressure

### **Notification Channels**

Alerts are delivered via:
- **Email**: Configured admin email address
- **SNS Topic**: `TAK-{StackName}-AuthInfra-Alerts`

## Cost Monitoring

### **Resource Cost Tracking**

The infrastructure includes automatic cost allocation through resource tagging:

#### **Cost Allocation Tags**
- **Project**: TAK.NZ
- **Component**: AuthInfra
- **Environment**: Dev/Prod (from stackName)
- **ManagedBy**: CDK

#### **Cost Categories**
- **Compute**: ECS Fargate tasks
- **Database**: Aurora PostgreSQL instances
- **Cache**: ElastiCache Redis nodes
- **Storage**: EFS file system
- **Network**: Load balancers, data transfer
- **Monitoring**: CloudWatch logs and metrics

### **Budget Integration**

The stack is designed to integrate with AWS Budgets:

#### **Recommended Budget Setup**
```bash
# Development environment budget
aws budgets create-budget --account-id {ACCOUNT_ID} --budget '{
  "BudgetName": "TAK-Dev-AuthInfra-Monthly",
  "BudgetLimit": {"Amount": "150", "Unit": "USD"},
  "TimeUnit": "MONTHLY",
  "BudgetType": "COST",
  "CostFilters": {
    "TagKey": ["Component"],
    "TagValue": ["AuthInfra"]
  }
}'

# Production environment budget
aws budgets create-budget --account-id {ACCOUNT_ID} --budget '{
  "BudgetName": "TAK-Prod-AuthInfra-Monthly",
  "BudgetLimit": {"Amount": "400", "Unit": "USD"},
  "TimeUnit": "MONTHLY",
  "BudgetType": "COST",
  "CostFilters": {
    "TagKey": ["Component"],
    "TagValue": ["AuthInfra"]
  }
}'
```

## Performance Optimization

### **Monitoring-Driven Optimization**

#### **Database Performance**
- **Performance Insights**: Query-level analysis (prod only)
- **Enhanced Monitoring**: OS-level metrics (prod only)
- **Slow Query Log**: Queries > 1000ms logged

#### **Application Performance**
- **Container Insights**: Task-level resource utilization (prod only)
- **Custom Metrics**: Application-specific performance indicators
- **X-Ray Integration**: Distributed tracing (optional)

#### **Cache Performance**
- **Hit Ratio Monitoring**: Cache effectiveness tracking
- **Memory Usage Patterns**: Optimization opportunities
- **Eviction Monitoring**: Memory pressure indicators

## Troubleshooting with CloudWatch

### **Common Monitoring Scenarios**

#### **High Database CPU**
```bash
# Check database performance metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name CPUUtilization \
  --dimensions Name=DBClusterIdentifier,Value=TAK-{StackName}-AuthInfra-Database \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T01:00:00Z \
  --period 300 \
  --statistics Average
```

#### **ECS Service Issues**
```bash
# Check ECS service metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=TAK-{StackName}-AuthInfra-AuthentikServer \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T01:00:00Z \
  --period 300 \
  --statistics Average
```

#### **Load Balancer Health**
```bash
# Check ALB target health
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name HealthyHostCount \
  --dimensions Name=LoadBalancer,Value={ALB_NAME} \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T01:00:00Z \
  --period 300 \
  --statistics Average
```

### **Log Analysis**

#### **Application Error Investigation**
```bash
# Search Authentik server logs for errors
aws logs filter-log-events \
  --log-group-name /ecs/TAK-{StackName}-AuthInfra-AuthentikServer \
  --filter-pattern "ERROR" \
  --start-time 1640995200000 \
  --end-time 1640998800000
```

#### **LDAP Connection Issues**
```bash
# Search LDAP logs for connection failures
aws logs filter-log-events \
  --log-group-name /ecs/TAK-{StackName}-AuthInfra-LDAP \
  --filter-pattern "connection" \
  --start-time 1640995200000 \
  --end-time 1640998800000
```

## Best Practices

### **Development Environment**
- **Enable Detailed Logging**: For debugging and development
- **Disable Container Insights**: Cost optimization
- **Short Log Retention**: 1 week retention period
- **Manual Monitoring**: On-demand metric review

### **Production Environment**
- **Enable All Monitoring**: Comprehensive observability
- **Set Up Alerting**: Proactive issue detection
- **Extended Log Retention**: 1 month for compliance
- **Automated Responses**: Integration with incident management

### **Cost Management**
- **Right-size Log Retention**: Balance cost vs. compliance needs
- **Use Metric Filters**: Reduce log ingestion costs
- **Monitor Unused Metrics**: Clean up unnecessary custom metrics
- **Regular Review**: Monthly cost and usage analysis

## Integration with External Tools

### **Third-Party Monitoring**
The CloudWatch metrics can be integrated with external monitoring solutions:

- **Grafana**: Custom dashboards using CloudWatch data source
- **Datadog**: CloudWatch integration for unified monitoring
- **New Relic**: Infrastructure monitoring integration
- **Prometheus**: CloudWatch exporter for metrics collection

### **Automation Integration**
- **AWS Lambda**: Automated responses to CloudWatch alarms
- **AWS Systems Manager**: Automated remediation actions
- **CI/CD Pipelines**: Deployment health checks using CloudWatch metrics