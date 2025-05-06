import cf from '@openaddresses/cloudfriend';
import LDAP from './lib/ldap.js';

export default cf.merge(
    LDAP,
    {
        Description: 'TAK Authentication Layer - LDAP Outpost',
        Parameters: {
            GitSha: {
                Description: 'GitSha that is currently being deployed',
                Type: 'String'
            },
            Environment: {
                Description: 'VPC/ECS Stack to deploy into',
                Type: 'String',
                Default: 'prod'
            },
            EnvType: {
                Description: 'Environment type',
                Type: 'String',
                AllowedValues: ['prod', 'dev-test'],
                Default: 'prod'
            },
            DockerImageLocation: {
                Description: 'Use the docker image from Github or the local AWS ECR?',
                Type: 'String',
                AllowedValues: ['Github', 'Local ECR'],
                Default: 'Github'
            }
        }
    }
);
