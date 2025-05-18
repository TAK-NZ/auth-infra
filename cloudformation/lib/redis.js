import cf from '@openaddresses/cloudfriend';

export default {
    Resources: {
        RedisAuthToken: {
            Type: 'AWS::SecretsManager::Secret',
            Properties: {
                Description: cf.join([cf.stackName, ' Redis Auth Token']),
                GenerateSecretString: {
                    ExcludePunctuation: true,
                    PasswordLength: 64
                },
                Name: cf.join([cf.stackName, '/redis/auth-token']),
                KmsKeyId: cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-kms']))
            }
        },
        Redis: {
            Type: 'AWS::ElastiCache::ReplicationGroup',
            Properties: {
                AutomaticFailoverEnabled: cf.if('CreateProdResources', true, false),
                AtRestEncryptionEnabled: true,
                TransitEncryptionEnabled: true,
                TransitEncryptionMode: 'required',
                AuthToken: cf.sub('{{resolve:secretsmanager:${AWS::StackName}/redis/auth-token:SecretString::AWSCURRENT}}'),
                KmsKeyId: cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-kms'])),
                CacheNodeType: 'cache.t3.micro',
                CacheSubnetGroupName: cf.ref('RedisSubnetGroup'),
                Engine: 'valkey',
                EngineVersion: '7.2',
                AutoMinorVersionUpgrade: true,
                NumCacheClusters: cf.if('CreateProdResources', 2, 1),
                ReplicationGroupDescription: 'Valkey (Redis) cluster for Authentik',
                SecurityGroupIds: [
                    cf.ref('RedisSecurityGroup')
                ]
            }
        },
        RedisSubnetGroup: {
            Type: 'AWS::ElastiCache::SubnetGroup',
            Properties: {
                Description: cf.join('-', [cf.stackName, 'redis-subnets']),
                SubnetIds: [
                    cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-subnet-private-a'])),
                    cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-subnet-private-b']))
                ]
            }
        },
        RedisSecurityGroup: {
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
                VpcId: cf.importValue(cf.join(['coe-base-', cf.ref('Environment'), '-vpc-id']))
            }
        }
    },
    Conditions: {
        CreateProdResources: cf.equals(cf.ref('EnvType'), 'prod')
    }
};
