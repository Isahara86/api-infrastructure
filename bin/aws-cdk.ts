#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AppEnvironment } from '../lib/app-env';
import { ClusterStack } from '../lib/api/cluster-stack';
import { GatewayStack } from '../lib/api/api-gateway-stack';
import { PipelineStack } from '../lib/api/pipeline-stack';

const app = new cdk.App();

const env = AppEnvironment.DEV;
const serviceName = 'api';
const AWS_ACCOUNT = '812809021705';
const AWS_REGION = 'us-east-1';


const cluster = new ClusterStack(app, `${AppEnvironment.DEV}-Cluster`, {
    cidr: '10.1.0.0/20',
    maxAZs: 2,
    appEnv: AppEnvironment.DEV,
});
cdk.Tags.of(cluster).add('environment', AppEnvironment.DEV);

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


