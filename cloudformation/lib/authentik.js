import cf from '@openaddresses/cloudfriend';

export default {
    Parameters: {
        EnableExecute: {
            Description: 'Allow SSH into docker container - should only be enabled for limited debugging',
            Type: 'String',
            AllowedValues: ['true', 'false'],
            Default: 'false'
        },
        SSLCertificateARN: {
            Description: 'ACM SSL Certificate ARN for HTTPS Protocol',
            Type: 'String'
        },
        AuthentikAdminUserEmail: {
            Description: 'E-Mail address for the Authentik akadmin user',
            Type: 'String'
        },
        AuthentikLDAPBaseDN: {
            Description: 'LDAP Base DN',
            Type: 'String',
            Default: 'DC=example,DC=com'
        },
        AuthentikConfigFile: {
            Description: 'Use authentik-config.env config file in S3 bucket',
            Type: 'String',
            AllowedValues: ['true', 'false'],
            Default: 'false'
        },
        IpAddressType: {
            Description: 'ELB IP Address Type - IPv4-only or IPv4/IPv6-Dualstack',
            Type: 'String',
            AllowedValues: ['ipv4', 'dualstack'],
            Default: 'dualstack'
        },
        DockerImageLocation: {
            Description: 'Use the docker image from Github or the local AWS ECR?',
            Type: 'String',
            AllowedValues: ['Github', 'Local ECR'],
            Default: 'Github'
        }
    },
    Resources: {
        Logs: {
            Type: 'AWS::Logs::LogGroup',
            Properties: {
                LogGroupName: cf.stackName,
                RetentionInDays: 7
            }
        },
        ALB: {
            Type: 'AWS::ElasticLoadBalancingV2::LoadBalancer',
            Properties: {
                Name: cf.stackName,
                Type: 'application',
                IpAddressType: cf.ref('IpAddressType'),
                Scheme: 'internet-facing',
                SecurityGroups: [cf.ref('ALBSecurityGroup')],
                Subnets:  [
                    cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-subnet-public-a'])),
                    cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-subnet-public-b']))
                ]
            }

        },
        ALBSecurityGroup: {
            Type : 'AWS::EC2::SecurityGroup',
            Properties : {
                Tags: [{
                    Key: 'Name',
                    Value: cf.join('-', [cf.stackName, 'alb-sg'])
                }],
                GroupName: cf.join('-', [cf.stackName, 'alb-sg']),
                GroupDescription: 'Allow 80 and 443 Access to ALB',
                SecurityGroupIngress: [{
                    CidrIp: '0.0.0.0/0',
                    IpProtocol: 'tcp',
                    FromPort: 443,
                    ToPort: 443
                },{
                    CidrIp: '0.0.0.0/0',
                    IpProtocol: 'tcp',
                    FromPort: 80,
                    ToPort: 80
                }],
                VpcId: cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-vpc-id']))
            }
        },
        HTTPListener: {
            Type: 'AWS::ElasticLoadBalancingV2::Listener',
            Properties: {
                DefaultActions: [{
                    Type: 'redirect',
                    RedirectConfig: {
                        Protocol: 'HTTPS',
                        StatusCode: 'HTTP_301'
                    }
                }],
                LoadBalancerArn: cf.ref('ALB'),
                Port: 80,
                Protocol: 'HTTP'
            }
        },
        HTTPSListener: {
            Type: 'AWS::ElasticLoadBalancingV2::Listener',
            Properties: {
                Certificates: [{
                    CertificateArn: cf.ref('SSLCertificateARN')
                }],
                DefaultActions: [{
                    Type: 'forward',
                    TargetGroupArn: cf.ref('TargetGroup')
                }],
                LoadBalancerArn: cf.ref('ALB'),
                Port: 443,
                Protocol: 'HTTPS'
            }
        },
        TargetGroup: {
            Type: 'AWS::ElasticLoadBalancingV2::TargetGroup',
            DependsOn: 'ALB',
            Properties: {
                HealthCheckPath: '/-/health/live/',
                Matcher: {
                    HttpCode: '200'
                },
                Port: 9000,
                Protocol: 'HTTP',
                TargetGroupAttributes: [
                    {
                        Key: 'stickiness.enabled',
                        Value: 'false'
                    }
                ],
                TargetType: 'ip',
                VpcId: cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-vpc-id']))
            }
        },
        ServerTaskRole: {
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
                    PolicyName: cf.join('-', [cf.stackName, 'auth-policy']),
                    PolicyDocument: {
                        Statement: [{
                            // ECS Exec permissions
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
                                'logs:CreateLogStream',
                                'logs:DescribeLogStreams',
                                'logs:PutLogEvents',
                                'logs:DescribeLogGroups'
                            ],
                            Resource: [cf.join(['arn:', cf.partition, ':logs:*:*:*'])]
                        }]
                    }
                }]
            }
        },
        ServerExecRole: {
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
                    PolicyName: cf.join([cf.stackName, '-auth-logging']),
                    PolicyDocument: {
                        Statement: [{
                            Effect: 'Allow',
                            Action: [
                                'logs:CreateLogStream',
                                'logs:PutLogEvents'
                            ],
                            Resource: [cf.join(['arn:', cf.partition, ':logs:*:*:*'])]
                        },{
                            Effect: 'Allow',
                            Action: [
                                'kms:Decrypt',
                                'kms:GenerateDataKey'
                            ],
                            Resource: [
                                cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-kms']))
                            ]
                        },{
                            Effect: 'Allow',
                            Action: [
                                'secretsmanager:DescribeSecret',
                                'secretsmanager:GetSecretValue'
                            ],
                            Resource: [
                                cf.join(['arn:', cf.partition, ':secretsmanager:', cf.region, ':', cf.accountId, ':secret:', cf.stackName, '/*'])
                            ]
                        },{
                            Effect: 'Allow',
                            Action: [
                                's3:GetBucketLocation'
                            ],
                            Resource: [
                                cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-s3']))
                            ]
                        },{
                            Effect: 'Allow',
                            Action: [
                                's3:GetObject'
                            ],
                            Resource: [
                                cf.join([cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-s3'])), '/*'])
                            ]
                        }]
                    }
                }],
                ManagedPolicyArns: [
                    cf.join(['arn:', cf.partition, ':iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy'])
                ],
                Path: '/service-role/'
            }
        },
        ServerTaskDefinition: {
            Type: 'AWS::ECS::TaskDefinition',
            Properties: {
                Family: cf.join('-', [cf.stackName, 'server']),
                // Task Size options: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html#task_size
                Cpu: 1024,
                Memory: 2048,
                NetworkMode: 'awsvpc',
                RequiresCompatibilities: ['FARGATE'],
                Tags: [{
                    Key: 'Name',
                    Value: cf.join('-', [cf.stackName, 'auth'])
                }],
                ExecutionRoleArn: cf.getAtt('ServerExecRole', 'Arn'),
                TaskRoleArn: cf.getAtt('ServerTaskRole', 'Arn'),
                Volumes: [{
                    Name: cf.join([cf.stackName, '-media']),
                    EFSVolumeConfiguration: {
                        FilesystemId: cf.ref('EFS'),
                        TransitEncryption: 'ENABLED',
                        AuthorizationConfig: {
                            AccessPointId: cf.ref('EFSAccessPointMedia')
                        }
                    }
                }],
                ContainerDefinitions: [{
                    Name: 'Server',
                    Command: ['server'],
                    HealthCheck: {
                        Command: [
                            'CMD',
                            'ak',
                            'healthcheck'
                        ],
                        Interval: 30,
                        Retries: 3,
                        StartPeriod: 60,
                        Timeout: 30
                    },
                    Image: cf.if('DockerGithubImage',
                        'ghcr.io/tak-nz/auth-infra-server:latest',
                        cf.join([cf.accountId, '.dkr.ecr.', cf.region, '.amazonaws.com/coe-base-', cf.ref('Environment'), ':auth-infra-server-', cf.ref('GitSha')])
                    ),
                    MountPoints: [{
                        ContainerPath: '/media',
                        SourceVolume: cf.join([cf.stackName, '-media'])
                    }],
                    PortMappings: [{
                        ContainerPort: 9000,
                        Protocol: 'tcp'
                    }],
                    Environment: [
                        { Name: 'StackName',                                    Value: cf.stackName },
                        { Name: 'AWS_DEFAULT_REGION',                           Value: cf.region },
                        { Name: 'AUTHENTIK_POSTGRESQL__HOST',                   Value: cf.getAtt('DBCluster', 'Endpoint.Address') },
                        { Name: 'AUTHENTIK_POSTGRESQL__USER',                   Value: cf.sub('{{resolve:secretsmanager:${AWS::StackName}/rds/secret:SecretString:username:AWSCURRENT}}') },
                        // Support for read replicas at first deployment is currently broken. See https://github.com/goauthentik/authentik/issues/14319#issuecomment-2844233291
                        // { Name: 'AUTHENTIK_POSTGRESQL__READ_REPLICAS__0__HOST', Value: cf.getAtt('DBCluster', 'ReadEndpoint.Address') },
                        // { Name: 'AUTHENTIK_POSTGRESQL__READ_REPLICAS__0__USER', Value: cf.sub('{{resolve:secretsmanager:${AWS::StackName}/rds/secret:SecretString:username:AWSCURRENT}}') },
                        // { Name: 'AUTHENTIK_POSTGRESQL__READ_REPLICAS__0__NAME', Value: 'authentik' },
                        // { Name: 'AUTHENTIK_POSTGRESQL__READ_REPLICAS__0__PORT', Value: '5432' },
                        { Name: 'AUTHENTIK_REDIS__HOST',                        Value: cf.getAtt('Redis', 'PrimaryEndPoint.Address') },
                        { Name: 'AUTHENTIK_REDIS__TLS',                         Value: 'True' }
                    ],
                    Secrets: [
                        { Name: 'AUTHENTIK_POSTGRESQL__PASSWORD',                   ValueFrom: cf.join([cf.ref('DBMasterSecret'), ':password::']) },
                        // { Name: 'AUTHENTIK_POSTGRESQL__READ_REPLICAS__0__PASSWORD', ValueFrom: cf.join([cf.ref('DBMasterSecret'), ':password::']) },
                        { Name: 'AUTHENTIK_SECRET_KEY',                             ValueFrom: cf.ref('AuthentikSecretKey') },
                        { Name: 'AUTHENTIK_REDIS__PASSWORD',                        ValueFrom: cf.ref('RedisAuthToken') }
                    ],
                    EnvironmentFiles: [
                        cf.if('S3ConfigValueSet',
                            {
                                Value: cf.join([cf.join([cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-s3'])), '/authentik-config.env'])]),
                                Type: 's3'
                            },
                            cf.ref('AWS::NoValue')
                        )
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
                    RestartPolicy: {
                        Enabled: true
                    },
                    Essential: true
                }]
            }
        },
        ServerService: {
            Type: 'AWS::ECS::Service',
            DependsOn: [
                'HTTPSListener',
                'ServerTaskRole'
            ],
            Properties: {
                ServiceName: cf.join('-', [cf.stackName, 'Server']),
                Cluster: cf.join(['coe-base-', cf.ref('Environment')]),
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
                TaskDefinition: cf.ref('ServerTaskDefinition'),
                LaunchType: 'FARGATE',
                HealthCheckGracePeriodSeconds: 300,
                DesiredCount: cf.if('CreateProdResources', 2, 1),
                NetworkConfiguration: {
                    AwsvpcConfiguration: {
                        AssignPublicIp: 'DISABLED',
                        SecurityGroups: [cf.ref('ServiceSecurityGroup')],
                        Subnets:  [
                            cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-subnet-private-a'])),
                            cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-subnet-private-b']))
                        ]
                    }
                },
                LoadBalancers: [{
                    ContainerName: 'Server',
                    ContainerPort: 9000,
                    TargetGroupArn: cf.ref('TargetGroup')
                }]
            }
        },
        WorkerTaskRole: {
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
                    PolicyName: cf.join('-', [cf.stackName, 'auth-policy']),
                    PolicyDocument: {
                        Statement: [{
                            // ECS Exec permissions
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
                                'logs:CreateLogStream',
                                'logs:DescribeLogStreams',
                                'logs:PutLogEvents',
                                'logs:DescribeLogGroups'
                            ],
                            Resource: [cf.join(['arn:', cf.partition, ':logs:*:*:*'])]
                        }]
                    }
                }]
            }
        },
        WorkerExecRole: {
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
                    PolicyName: cf.join([cf.stackName, '-auth-logging']),
                    PolicyDocument: {
                        Statement: [{
                            Effect: 'Allow',
                            Action: [
                                'logs:CreateLogStream',
                                'logs:PutLogEvents'
                            ],
                            Resource: [cf.join(['arn:', cf.partition, ':logs:*:*:*'])]
                        },{
                            Effect: 'Allow',
                            Action: [
                                'kms:Decrypt',
                                'kms:GenerateDataKey'
                            ],
                            Resource: [
                                cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-kms']))
                            ]
                        },{
                            Effect: 'Allow',
                            Action: [
                                'secretsmanager:DescribeSecret',
                                'secretsmanager:GetSecretValue'
                            ],
                            Resource: [
                                cf.join(['arn:', cf.partition, ':secretsmanager:', cf.region, ':', cf.accountId, ':secret:', cf.stackName, '/*'])
                            ]
                        },{
                            Effect: 'Allow',
                            Action: [
                                's3:GetBucketLocation'
                            ],
                            Resource: [
                                cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-s3']))
                            ]
                        },{
                            Effect: 'Allow',
                            Action: [
                                's3:GetObject'
                            ],
                            Resource: [
                                cf.join([cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-s3'])), '/*'])
                            ]
                        }]
                    }
                }],
                ManagedPolicyArns: [
                    cf.join(['arn:', cf.partition, ':iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy'])
                ],
                Path: '/service-role/'
            }
        },
        WorkerTaskDefinition: {
            Type: 'AWS::ECS::TaskDefinition',
            Properties: {
                Family: cf.join('-', [cf.stackName, 'worker']),
                // Task Size options: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html#task_size
                Cpu: 512,
                Memory: 1024,
                NetworkMode: 'awsvpc',
                RequiresCompatibilities: ['FARGATE'],
                Tags: [{
                    Key: 'Name',
                    Value: cf.join('-', [cf.stackName, 'auth'])
                }],
                ExecutionRoleArn: cf.getAtt('WorkerExecRole', 'Arn'),
                TaskRoleArn: cf.getAtt('WorkerTaskRole', 'Arn'),
                Volumes: [{
                    Name: cf.join([cf.stackName, '-media']),
                    EFSVolumeConfiguration: {
                        FilesystemId: cf.ref('EFS'),
                        TransitEncryption: 'ENABLED',
                        AuthorizationConfig: {
                            AccessPointId: cf.ref('EFSAccessPointMedia')
                        }
                    }
                }],
                ContainerDefinitions: [{
                    Name: 'worker',
                    Command: ['worker'],
                    HealthCheck: {
                        Command: [
                            'CMD',
                            'ak',
                            'healthcheck'
                        ],
                        Interval: 30,
                        Retries: 3,
                        StartPeriod: 60,
                        Timeout: 30
                    },
                    Image: cf.if('DockerGithubImage',
                        'ghcr.io/tak-nz/auth-infra-server:latest',
                        cf.join([cf.accountId, '.dkr.ecr.', cf.region, '.amazonaws.com/coe-base-', cf.ref('Environment'), ':auth-infra-server-', cf.ref('GitSha')])
                    ),
                    MountPoints: [{
                        ContainerPath: '/media',
                        SourceVolume: cf.join([cf.stackName, '-media'])
                    }],
                    PortMappings: [{
                        ContainerPort: 9000
                    }],
                    Environment: [
                        { Name: 'StackName',                                    Value: cf.stackName },
                        { Name: 'AWS_DEFAULT_REGION',                           Value: cf.region },
                        { Name: 'AUTHENTIK_POSTGRESQL__HOST',                   Value: cf.getAtt('DBCluster', 'Endpoint.Address') },
                        { Name: 'AUTHENTIK_POSTGRESQL__USER',                   Value: cf.sub('{{resolve:secretsmanager:${AWS::StackName}/rds/secret:SecretString:username:AWSCURRENT}}') },
                        // Support for read replicas at first deployment is currently broken. See https://github.com/goauthentik/authentik/issues/14319#issuecomment-2844233291
                        // { Name: 'AUTHENTIK_POSTGRESQL__READ_REPLICAS__0__HOST', Value: cf.getAtt('DBCluster', 'ReadEndpoint.Address') },
                        // { Name: 'AUTHENTIK_POSTGRESQL__READ_REPLICAS__0__USER', Value: cf.sub('{{resolve:secretsmanager:${AWS::StackName}/rds/secret:SecretString:username:AWSCURRENT}}') },
                        // { Name: 'AUTHENTIK_POSTGRESQL__READ_REPLICAS__0__NAME', Value: 'authentik' },
                        // { Name: 'AUTHENTIK_POSTGRESQL__READ_REPLICAS__0__PORT', Value: '5432' },
                        { Name: 'AUTHENTIK_REDIS__HOST',                        Value: cf.getAtt('Redis', 'PrimaryEndPoint.Address') },
                        { Name: 'AUTHENTIK_REDIS__TLS',                         Value: 'True' },
                        { Name: 'AUTHENTIK_BOOTSTRAP_EMAIL',                    Value: cf.ref('AuthentikAdminUserEmail') },
                        { Name: 'AUTHENTIK_BOOTSTRAP_LDAPSERVICE_USERNAME',     Value: cf.sub('{{resolve:secretsmanager:${AWS::StackName}/ldapservice:SecretString:username:AWSCURRENT}}') },
                        { Name: 'AUTHENTIK_BOOTSTRAP_LDAP_BASEDN',              Value: cf.ref('AuthentikLDAPBaseDN') }
                    ],
                    Secrets: [
                        { Name: 'AUTHENTIK_POSTGRESQL__PASSWORD',                   ValueFrom: cf.join([cf.ref('DBMasterSecret'), ':password::']) },
                        // { Name: 'AUTHENTIK_POSTGRESQL__READ_REPLICAS__0__PASSWORD', ValueFrom: cf.join([cf.ref('DBMasterSecret'), ':password::']) },
                        { Name: 'AUTHENTIK_SECRET_KEY',                             ValueFrom: cf.ref('AuthentikSecretKey') },
                        { Name: 'AUTHENTIK_REDIS__PASSWORD',                        ValueFrom: cf.ref('RedisAuthToken') },
                        { Name: 'AUTHENTIK_BOOTSTRAP_PASSWORD',                     ValueFrom: cf.join([cf.ref('AuthentikAdminUserPassword'), ':password::']) },
                        { Name: 'AUTHENTIK_BOOTSTRAP_TOKEN',                        ValueFrom: cf.ref('AuthentikAdminUserToken') },
                        { Name: 'AUTHENTIK_BOOTSTRAP_LDAPSERVICE_PASSWORD',         ValueFrom: cf.join([cf.ref('LDAPServiceUserPassword'), ':password::']) }
                    ],
                    EnvironmentFiles: [
                        cf.if('S3ConfigValueSet',
                            {
                                Value: cf.join([cf.join([cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-s3'])), '/authentik-config.env'])]),
                                Type: 's3'
                            },
                            cf.ref('AWS::NoValue')
                        )],
                    LogConfiguration: {
                        LogDriver: 'awslogs',
                        Options: {
                            'awslogs-group': cf.stackName,
                            'awslogs-region': cf.region,
                            'awslogs-stream-prefix': cf.stackName,
                            'awslogs-create-group': true
                        }
                    },
                    RestartPolicy: {
                        Enabled: true
                    },
                    Essential: true
                }]
            }
        },
        WorkerService: {
            Type: 'AWS::ECS::Service',
            DependsOn: [
                'DBCluster',
                'WorkerTaskRole'
            ],
            Properties: {
                ServiceName: cf.join('-', [cf.stackName, 'Worker']),
                Cluster: cf.join(['coe-base-', cf.ref('Environment')]),
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
                TaskDefinition: cf.ref('WorkerTaskDefinition'),
                LaunchType: 'FARGATE',
                HealthCheckGracePeriodSeconds: 300,
                DesiredCount: cf.if('CreateProdResources', 2, 1),
                NetworkConfiguration: {
                    AwsvpcConfiguration: {
                        AssignPublicIp: 'DISABLED',
                        SecurityGroups: [cf.ref('ServiceSecurityGroup')],
                        Subnets:  [
                            cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-subnet-private-a'])),
                            cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-subnet-private-b']))
                        ]
                    }
                }
            }
        },
        ServiceSecurityGroup: {
            Type: 'AWS::EC2::SecurityGroup',
            Properties: {
                Tags: [{
                    Key: 'Name',
                    Value: cf.join('-', [cf.stackName, 'ecs-service-sg'])
                }],
                GroupName: cf.join('-', [cf.stackName, 'ecs-service-sg']),
                GroupDescription: cf.join('-', [cf.stackName, 'ecs-sg']),
                VpcId: cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-vpc-id'])),
                SecurityGroupIngress: [{
                    Description: 'ALB Traffic',
                    SourceSecurityGroupId: cf.ref('ALBSecurityGroup'),
                    IpProtocol: 'tcp',
                    FromPort: 9000,
                    ToPort: 9000
                }]
            }
        }
    },
    Conditions: {
        CreateProdResources: cf.equals(cf.ref('EnvType'), 'prod'),
        S3ConfigValueSet: cf.equals(cf.ref('AuthentikConfigFile'), true),
        DockerGithubImage: cf.equals(cf.ref('DockerImageLocation'), 'Github')
    },
    Outputs: {
        Authentik: {
            Description: 'HTTP(S) ALB endpoint for CNAME',
            Export: {
                Name: cf.join([cf.stackName, '-auth-endpoint'])
            },
            Value: cf.getAtt('ALB', 'DNSName')
        },
        AuthentikLDAPBaseDN: {
            Description: 'LDAP Base DN',
            Export: {
                Name: cf.join([cf.stackName, '-auth-ldap-basedn'])
            },
            Value: cf.ref('AuthentikLDAPBaseDN')
        }
    }
};
