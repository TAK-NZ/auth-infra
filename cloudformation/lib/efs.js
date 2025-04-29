import cf from '@openaddresses/cloudfriend';

export default {
    Resources: {
        EFS: {
            Type: 'AWS::EFS::FileSystem',
            Properties: {
                FileSystemTags: [{
                    Key: 'Name',
                    Value: cf.stackName
                }],
                Encrypted: true,
                KmsKeyId: cf.ref('KMS'),
                PerformanceMode: 'generalPurpose',
                ThroughputMode: 'bursting',
                BackupPolicy: {
                    Status: 'DISABLED'
                },
            }
        },
        EFSMountTargetSecurityGroup: {
            Type: 'AWS::EC2::SecurityGroup',
            Properties: {
                Tags: [{
                    Key: 'Name',
                    Value: cf.join('-', [cf.stackName, 'efs-sg'])
                }],
                GroupName: cf.join('-', [cf.stackName, 'efs-sg']),
                GroupDescription: 'EFS to Auth ECS Service',
                SecurityGroupIngress: [{
                    IpProtocol: 'tcp',
                    FromPort: 2049,
                    ToPort: 2049,
                    CidrIp: cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-vpc-cidr']))
                }],
                VpcId: cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-vpc']))
            }
        },
        EFSAccessPointMedia: {
            Type: 'AWS::EFS::AccessPoint',
            Properties: {
                AccessPointTags: [{
                    Key: 'Name',
                    Value: cf.join('-', [cf.stackName, 'authentik-media-accesspoint'])
                }],
                FileSystemId: cf.ref('EFS'),
                PosixUser: {
                    Uid: 1000,
                    Gid: 1000
                },
                RootDirectory: {
                    CreationInfo: {
                        OwnerGid: 1000,
                        OwnerUid: 1000,
                        Permissions: '755'
                    },
                    Path: '/media'
                }
            }
        },
        EFSMountTargetSubnetPrivateA: {
            Type: 'AWS::EFS::MountTarget',
            Properties: {
                FileSystemId: cf.ref('EFS'),
                SubnetId: cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-subnet-private-a'])),
                SecurityGroups: [cf.ref('EFSMountTargetSecurityGroup')]
            }
        },
        EFSMountTargetSubnetPrivateB: {
            Type: 'AWS::EFS::MountTarget',
            Properties: {
                FileSystemId: cf.ref('EFS'),
                SubnetId: cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-subnet-private-b'])),
                SecurityGroups: [cf.ref('EFSMountTargetSecurityGroup')]
            }
        }
    }
};
