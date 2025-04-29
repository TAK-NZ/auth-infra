import cf from '@openaddresses/cloudfriend';

export default {
    Parameters: {
        EnableExecute: {
            Description: 'Allow SSH into docker container - should only be enabled for limited debugging',
            Type: 'String',
            AllowedValues: ['true', 'false'],
            Default: false
        },
        SSLCertificateARN: {
            Description: 'ACM SSL certificate ARN for LDAPS protocol',
            Type: 'String'
        },
        AuthentikHost: {
            Description: 'URL of the Authentik auth service',
            Type: 'String'
        },
    },
    Resources: {
        NLB: {
            Type: 'AWS::ElasticLoadBalancingV2::LoadBalancer',
            Properties: {
                Name: cf.stackName,
                Type: 'network',
                Scheme: 'internal',
                SecurityGroups: [cf.ref('NLBSecurityGroup')],
                Subnets:  [
                    cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-subnet-private-a'])),
                    cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-subnet-private-b']))
                ]
            }

        },
        NLBSecurityGroup: {
            Type : 'AWS::EC2::SecurityGroup',
            Properties : {
                Tags: [{
                    Key: 'Name',
                    Value: cf.join('-', [cf.stackName, 'nlb-sg'])
                }],
                GroupName: cf.join('-', [cf.stackName, 'nlb-sg']),
                GroupDescription: 'Allow 389 and 636 Access to NLB',
                SecurityGroupIngress: [{
                    CidrIp: '10.0.0.0/8',
                    IpProtocol: 'tcp',
                    FromPort: 389,
                    ToPort: 389
                },{
                    CidrIp: '10.0.0.0/8',
                    IpProtocol: 'tcp',
                    FromPort: 80,
                    ToPort: 80
                }],
                VpcId: cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-vpc']))
            }
        },
        LDAPListener: {
            Type: 'AWS::ElasticLoadBalancingV2::Listener',
            Properties: {
                DefaultActions: [{
                    Type: 'forward',
                    TargetGroupArn: cf.ref('TargetGroup3389')
                }],
                LoadBalancerArn: cf.ref('NLB'),
                Port: 389,
                Protocol: "TCP"
            }
        },
        LDAPSListener: {
            Type: 'AWS::ElasticLoadBalancingV2::Listener',
            Properties: {
                Certificates: [{
                    CertificateArn: cf.ref('SSLCertificateARN')
                }],
                DefaultActions: [{
                    Type: 'forward',
                    TargetGroupArn: cf.ref('TargetGroup6636')
                }],
                LoadBalancerArn: cf.ref('NLB'),
                Port: 636,
                Protocol: "TLS"
            }
        },
        TargetGroup3389: {
            Type: 'AWS::ElasticLoadBalancingV2::TargetGroup',
            DependsOn: 'NLB',
            Properties: {
                Port: 3389,
                Protocol: 'TCP',
                TargetType: 'ip',
                VpcId: cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-vpc'])),

                HealthCheckEnabled: true,
                HealthCheckIntervalSeconds: 30,
                HealthCheckPort: 3389,
                HealthCheckProtocol: 'TCP',
                HealthCheckTimeoutSeconds: 10,
                HealthyThresholdCount: 2
            }
        },
        TargetGroup6636: {
            Type: 'AWS::ElasticLoadBalancingV2::TargetGroup',
            DependsOn: 'NLB',
            Properties: {
                Port: 6636,
                Protocol: 'TCP',
                TargetType: 'ip',
                VpcId: cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-vpc'])),

                HealthCheckEnabled: true,
                HealthCheckIntervalSeconds: 30,
                HealthCheckPort: 6636,
                HealthCheckProtocol: 'TCP',
                HealthCheckTimeoutSeconds: 10,
                HealthyThresholdCount: 2
            }
        },
        TaskRole: {
            Type: 'AWS::IAM::Role',
            Properties: {
                AssumeRolePolicyDocument: {
                    Version: '2012-10-17',
                    Statement: [{
                        Effect: 'Allow',
                        Principal: {
                            Service: 'ecs-tasks.amazonaws.com'
                        },
                        Action: 'sts:AssumeRole'
                    }]
                },
                Policies: [{
                    PolicyName: cf.join('-', [cf.stackName, 'api-policy']),
                    PolicyDocument: {
                        Statement: [{
                            Effect: 'Allow',
                            Action: [
                                'ssmmessages:CreateControlChannel',
                                'ssmmessages:CreateDataChannel',
                                'ssmmessages:OpenControlChannel',
                                'ssmmessages:OpenDataChannel'
                            ],
                            Resource: '*'
                        },{
                            Effect: 'Allow',
                            Action: [
                                'logs:CreateLogGroup',
                                'logs:CreateLogStream',
                                'logs:PutLogEvents',
                                'logs:DescribeLogStreams'
                            ],
                            Resource: [cf.join(['arn:', cf.partition, ':logs:*:*:*'])]
                        }]
                    }
                }]
            }
        },
        ExecRole: {
            Type: 'AWS::IAM::Role',
            Properties: {
                AssumeRolePolicyDocument: {
                    Version: '2012-10-17',
                    Statement: [{
                        Effect: 'Allow',
                        Principal: {
                            Service: 'ecs-tasks.amazonaws.com'
                        },
                        Action: 'sts:AssumeRole'
                    }]
                },
                Policies: [{
                    PolicyName: cf.join([cf.stackName, '-api-logging']),
                    PolicyDocument: {
                        Statement: [{
                            Effect: 'Allow',
                            Action: [
                                'logs:CreateLogGroup',
                                'logs:CreateLogStream',
                                'logs:PutLogEvents',
                                'logs:DescribeLogStreams'
                            ],
                            Resource: [cf.join(['arn:', cf.partition, ':logs:*:*:*'])]
                        }]
                    }
                }],
                ManagedPolicyArns: [
                    cf.join(['arn:', cf.partition, ':iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy'])
                ],
                Path: '/service-role/'
            }
        },
        OutpostTaskDefinition: {
            Type: 'AWS::ECS::TaskDefinition',
            Properties: {
                Family: cf.stackName,
                Cpu: cf.if('CreateProdResources', 512, 256),
                Memory: cf.if('CreateProdResources', 1024, 512),
                NetworkMode: 'awsvpc',
                RequiresCompatibilities: ['FARGATE'],
                Tags: [{
                    Key: 'Name',
                    Value: cf.join('-', [cf.stackName, 'ldap-outpost'])
                }],
                ExecutionRoleArn: cf.getAtt('ExecRole', 'Arn'),
                TaskRoleArn: cf.getAtt('TaskRole', 'Arn'),
                ContainerDefinitions: [{
                    Name: 'AuthentikLdapOutpost',
                    Image: 'ghcr.io/goauthentik/ldap',
                    PortMappings: [{
                        ContainerPort: 3389
                    },{
                        ContainerPort: 6636
                    }],
                    Environment: [
                        { Name: 'StackName',                    Value: cf.stackName },
                        { Name: 'AWS_DEFAULT_REGION',           Value: cf.region },
                        { Name: 'AUTHENTIK_HOST',               Value: cf.ref('AuthentikHost') },
                        { Name: 'AUTHENTIK_INSECURE',           Value: 'false' },
                        { Name: 'AUTHENTIK_TOKEN',              Value: cf.sub('{{resolve:secretsmanager:coe-auth-${Environment}/authentik-ldap-token:::AWSCURRENT}}') }
                    ],
                    LogConfiguration: {
                        LogDriver: 'awslogs',
                        Options: {
                            'awslogs-group': cf.stackName,
                            'awslogs-region': cf.region,
                            'awslogs-stream-prefix': cf.stackName,
                            'awslogs-create-group': true
                        }
                    }, 
                    Essential: true
                }]
            }
        },
        OutpostService: {
            Type: 'AWS::ECS::Service',
            Properties: {
                ServiceName: cf.join('-', [cf.stackName, 'LDAP-Outpost']),
                Cluster: cf.join(['coe-ecs-', cf.ref('Environment')]),
                DeploymentConfiguration: {
                    Alarms: {
                        AlarmNames: [],
                        Enable: false,
                        Rollback: false
                    },
                    MaximumPercent: 200,
                    MinimumHealthyPercent: 50
                },
                EnableExecuteCommand: cf.ref('EnableExecute'),
                TaskDefinition: cf.ref('OutpostTaskDefinition'),
                LaunchType: 'FARGATE',
                HealthCheckGracePeriodSeconds: 300,
                DesiredCount: cf.if('CreateProdResources', 2, 1)
                NetworkConfiguration: {
                    AwsvpcConfiguration: {
                        AssignPublicIp: 'DISABLED',
                        SecurityGroups: [cf.ref('ServiceSecurityGroup')],
                        Subnets:  [
                            cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-subnet-private-a'])),
                            cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-subnet-private-b']))
                        ]
                    }
                },
                LoadBalancers: [{
                    ContainerName: 'AuthentikLdapOutpost',
                    ContainerPort: 3389,
                    TargetGroupArn: cf.ref('TargetGroup3389')
                },{
                    ContainerName: 'AuthentikLdapOutpost',
                    ContainerPort: 6636,
                    TargetGroupArn: cf.ref('TargetGroup6636')
                }]
            }
        },
        ServiceSecurityGroup: {
            Type: 'AWS::EC2::SecurityGroup',
            Properties: {
                Tags: [{
                    Key: 'Name',
                    Value: cf.join('-', [cf.stackName, 'ecs-ldap-sg'])
                }],
                GroupName: cf.join('-', [cf.stackName, 'ecs-ldap-sg']),
                GroupDescription: cf.join('-', [cf.stackName, 'ecs-sg']),
                VpcId: cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-vpc'])),
                SecurityGroupIngress: [{
                    Description: 'LDAP Traffic',
                    SourceSecurityGroupId: cf.ref('NLBSecurityGroup'),
                    IpProtocol: 'tcp',
                    FromPort: 3389,
                    ToPort: 3389
                },{
                    Description: 'LDAPS Traffic',
                    SourceSecurityGroupId: cf.ref('NLBSecurityGroup'),
                    IpProtocol: 'tcp',
                    FromPort: 6636,
                    ToPort: 6636
                }]
            }
        }
    },
    Conditions: {
        CreateProdResources: cf.equals(cf.ref('EnvType'), 'prod')
    },
    Outputs: {
        LDAP: {
            Description: 'LDAP(S) endpoint for CNAME target',
            Export: {
                Name: cf.join([cf.stackName, '-ldap'])
            },
            Value: cf.getAtt('NLB', 'DNSName')
        }
    }
};
