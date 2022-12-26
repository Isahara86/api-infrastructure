#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
// import { PortalStack } from '../lib/portal/portal-stack';
// import { AWS_ACCOUNT, AWS_REGION, buildPortalStackConfig } from '../lib/portal/config/build-config';
import { AppEnvironment } from '../lib/app-env';
// import { PipelineStack } from '../lib/infrastructure/cdk/lib/pipeline-stack';
import { ClusterStack } from '../lib/infrastructure/cdk/lib/cluster-stack';
import { Environment } from '../lib/infrastructure/cdk/config';
import { GatewayStack } from '../lib/infrastructure/cdk/lib/api-gateway-stack';
import { PipelineStack } from '../lib/infrastructure/cdk/lib/pipeline-stack';

const app = new cdk.App();

// const myPipelineStack = new PortalStack(app, buildPortalStackConfig(AppEnvironment.DEV));
const env = AppEnvironment.DEV;
const serviceName = 'api';
const AWS_ACCOUNT = '812809021705';
const AWS_REGION = 'us-east-1';



const cluster = new ClusterStack(app, `${Environment.DEV}-Cluster`, {
    cidr: '10.1.0.0/20',
    maxAZs: 2,
    appEnv: Environment.DEV,
});
cdk.Tags.of(cluster).add('environment', Environment.DEV);

//  important to have same name as a service unless deploy will not find .template.json
const serviceStackName = `${env}-${serviceName}Stack`;

const apiPipelineStack = new PipelineStack(app, `${env}-apiPipelineStack`, {
    appEnv: env,
    serviceName: 'api',
    repoAccountId: AWS_ACCOUNT,
    repoRegion: AWS_REGION,
    serviceStackName,
});
cdk.Tags.of(apiPipelineStack).add('environment', env);

const gatewayStack = new GatewayStack(app, serviceStackName, {
    stackName: serviceStackName,
    vpc: cluster.vpc,
    cluster: cluster.cluster,
    serviceSecGroup: cluster.securityGroup,
    desiredInstances: 1,
    serviceName: 'api',
    appEnv: env,
    targetGroup: cluster.gatewayTargetGroup,
    appImage: apiPipelineStack.builtImage,
});
cdk.Tags.of(gatewayStack).add('environment', env);


