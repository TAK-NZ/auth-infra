import cf from '@openaddresses/cloudfriend';
import Authentik from './lib/authentik.js';
import DB from './lib/db.js';
import SecretsManager from './lib/secretsmanager.js';
import EFS from './lib/efs.js';
import REDIS from './lib/redis.js';
import CustomResource from './lib/customresource.js';

export default cf.merge(
    Authentik,
    DB,
    SecretsManager,
    EFS,
    REDIS,
    CustomResource,
    {
        Description: 'TAK Authentication Layer - Authentik',
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
            }
        }
    }
);
