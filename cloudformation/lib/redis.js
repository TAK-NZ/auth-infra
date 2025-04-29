import cf from '@openaddresses/cloudfriend';

export default {
    Resources: {
        AuthentikRedis: {
            Type: 'AWS::ElastiCache::ReplicationGroup',
            Properties: {
                AutomaticFailoverEnabled: cf.if('CreateProdResources', true, false),
                AtRestEncryptionEnabled: true,
                KmsKeyId: cf.ref('KMS'),
                CacheNodeType: 'cache.t4g.micro',
                CacheSubnetGroupName: cf.ref('AuthentikRedisSubnetGroup'),
                Engine: 'redis',
                EngineVersion: '7.1',
                NumCacheClusters: cf.if('CreateProdResources', 2, 1),
                PreferredMaintenanceWindow: 'Sun:22:30-Sun:23:30',
                ReplicationGroupDescription: "Redis cluster for authentik",
                SecurityGroupIds: [
                    cf.ref('AuthentikRedisSecurityGroup')
                ]
            }
        },
        AuthentikRedisSubnetGroup: {
            Type: 'AWS::ElastiCache::SubnetGroup',
            Properties: {
                Description: cf.join('-', [cf.stackName, 'redis-subnets']),
                SubnetIds: [
                    cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-subnet-private-a'])),
                    cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-subnet-private-b']))
                ]
            }
        },
        AuthentikRedisSecurityGroup: {
            Type: 'AWS::EC2::SecurityGroup',
            Properties: {
                Tags: [{
                    Key: 'Name',
                    Value: cf.join('-', [cf.stackName, 'redis-sg'])
                }],
                GroupName: cf.join('-', [cf.stackName, 'redis-sg']),
                GroupDescription: 'Authentik to ElastiCache Redis',
                SecurityGroupIngress: [{
                    IpProtocol: 'tcp',
                    FromPort: 6379,
                    ToPort: 6379,
                    SourceSecurityGroupId: cf.getAtt('ServiceSecurityGroup', 'GroupId')         
                }],
                VpcId: cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-vpc']))
            }
        }
    },
    Conditions: {
        CreateProdResources: cf.equals(cf.ref('EnvType'), 'prod')
    }
};
