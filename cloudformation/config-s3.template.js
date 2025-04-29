import cf from '@openaddresses/cloudfriend';

/**
 * Note this repo is designed to be managed by a single root administrator
 * You do not need to deploy or manage this template
 */

export default cf.merge({
    Description: 'TAK Authentication Layer - S3 bucket for .env configuration files',
    Parameters: {
        GitSha: {
            Description: 'GitSha that is currently being deployed',
            Type: 'String'
        }
    },
    Resources: {
        KMSAlias: {
            Type: 'AWS::KMS::Alias',
            Properties: {
                AliasName: cf.join(['alias/', cf.stackName]),
                TargetKeyId: cf.ref('KMS')
            }
        },
        KMS: {
            Type : 'AWS::KMS::Key',
            Properties: {
                Description: cf.stackName,
                Enabled: true,
                EnableKeyRotation: false,
                KeyPolicy: {
                    Id: cf.stackName,
                    Statement: [{
                        Effect: 'Allow',
                        Principal: {
                            AWS: cf.join(['arn:', cf.partition, ':iam::', cf.accountId, ':root'])
                        },
                        Action: ['kms:*'],
                        Resource: '*'
                    }]
                }
            }
        },
        ConfigBucket: {
            Type: 'AWS::S3::Bucket',
            Properties: {
                BucketName: cf.join([cf.stackName, '-', cf.region, '-env-config']),
                OwnershipControls: {
                    Rules: [{
                        ObjectOwnership: 'BucketOwnerEnforced'
                    }]
                },
                BucketEncryption: {
                    ServerSideEncryptionConfiguration: [{
                        ServerSideEncryptionByDefault: {
                                KMSMasterKeyID: cf.ref('KMSAlias'),
                                SSEAlgorithm: "aws:kms"
                        },
                        BucketKeyEnabled: true
                    }]
                },
                PublicAccessBlockConfiguration: {
                    BlockPublicAcls: true,
                    BlockPublicPolicy: true,
                    IgnorePublicAcls: true,
                    RestrictPublicBuckets: true
                }
            },
            DeletionPolicy: "Delete"
        }
    },
    Outputs: {
        KMS: {
            Description: 'KMS',
            Export: {
                Name: cf.join([cf.stackName, '-kms'])
            },
            Value: cf.getAtt('KMS', 'Arn')
        },
        ConfigBucket: {
            Description: 'Bucket ARN',
            Export: {
                Name: cf.join([cf.stackName, '-s3'])
            },
            Value: cf.getAtt('ConfigBucket', 'Arn')
        }
    }
});


