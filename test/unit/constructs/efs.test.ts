/**
 * Test suite for EFS construct
 */
import { App, Stack } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Template } from 'aws-cdk-lib/assertions';
import { Efs } from '../../../lib/constructs/efs';
import { MOCK_CONFIGS } from '../../__fixtures__/mock-configs';
import { CDKTestHelper } from '../../__helpers__/cdk-test-utils';

describe('EFS Construct', () => {
  let app: App;
  let stack: Stack;
  let vpc: ec2.IVpc;
  let kmsKey: kms.IKey;
  let securityGroup: ec2.SecurityGroup;

  beforeEach(() => {
    ({ app, stack } = CDKTestHelper.createTestStack());
    const infrastructure = CDKTestHelper.createMockInfrastructure(stack);
    vpc = infrastructure.vpc;
    kmsKey = infrastructure.kmsKey;
    securityGroup = infrastructure.ecsSecurityGroup;
  });

  test('should create EFS with dev-test configuration', () => {
    const efs = new Efs(stack, 'TestEFS', {
      environment: 'dev-test',
      contextConfig: MOCK_CONFIGS.DEV_TEST,
      infrastructure: { vpc, ecsSecurityGroup: securityGroup, ecsCluster: {} as any, kmsKey },
      allowAccessFrom: [securityGroup]
    });

    expect(efs.fileSystem).toBeDefined();
    expect(efs.mediaAccessPoint).toBeDefined();
    expect(efs.customTemplatesAccessPoint).toBeDefined();

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::EFS::FileSystem', {
      Encrypted: true,
      PerformanceMode: 'generalPurpose',
      ThroughputMode: 'bursting'
    });
  });

  test('should create EFS with production configuration', () => {
    const efs = new Efs(stack, 'TestEFS', {
      environment: 'prod',
      contextConfig: MOCK_CONFIGS.PROD,
      infrastructure: { vpc, ecsSecurityGroup: securityGroup, ecsCluster: {} as any, kmsKey },
      allowAccessFrom: [securityGroup]
    });

    expect(efs.fileSystem).toBeDefined();
    expect(efs.mediaAccessPoint).toBeDefined();
    expect(efs.customTemplatesAccessPoint).toBeDefined();

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::EFS::AccessPoint', {
      PosixUser: {
        Uid: '1000',
        Gid: '1000'
      }
    });
  });
});