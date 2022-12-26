import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib/core';
import { Environment } from '../config';
import { ClusterStack } from '../lib/cluster-stack';
import { environments, secrets } from '../lib/secrets';
import { PipelineStack } from '../lib/pipeline-stack';
import { GatewayStack } from '../lib/api-gateway-stack';

const app = new cdk.App();

function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
}

const devClusterStack = new ClusterStack(app, `${Environment.DEV}-Cluster`, {
  cidr: '10.1.0.0/20',
  maxAZs: 2,
  appEnv: Environment.DEV,
});
cdk.Tags.of(devClusterStack).add('environment', Environment.DEV);

// const cluster = devClusterStack;
const env = Environment.DEV
const desiredInstances = 1;

const sharedSecrets = {
  MQ_PASSWORD: secrets[env].MQ_PASSWORD,
  MQ_USERNAME: secrets[env].MQ_USERNAME,
  APOLLO_SERVICE_KEY: secrets[env].APOLLO_KEY,
  DB_URL: secrets[env].DB_URL,
  SYSTEM_USER_TOKEN: secrets[env].SYSTEM_USER_TOKEN,
};

const sharedEnv = {
  REDIS_URL: environments[env].REDIS_URL,
  MQ_ENDPOINT: environments[env].MQ_ENDPOINT,
  NODE_ENV: environments[env].NODE_ENV,
  APP_ID: environments[env].APP_ID,
  PUBLIC_API_URL: environments[env].PUBLIC_API_URL,
};

//######################################################
//####################### GATEWAY ######################
//######################################################
// const gatewayPipelineStack = new PipelineStack(app, `${env}-apiPipelineStack`, {
//   appEnv: env,
//   serviceName: 'api',
// });
// cdk.Tags.of(gatewayPipelineStack).add('environment', env);

// const gatewayStack = new GatewayStack(app, `${env}-apiStack`, {
//   vpc: cluster.vpc,
//   cluster: cluster.cluster,
//   serviceSecGroup: cluster.securityGroup,
//   appImage: gatewayPipelineStack.builtImage,
//   secrets: {
//     [env]: {
//       ...sharedSecrets,
//       APOLLO_KEY: secrets[env].APOLLO_KEY,
//     },
//   },
//   environment: {
//     [env]: {
//       ...sharedEnv,
//       SENTRY_DSN: 'https://ba261cd22023464b9fd5cc3bf453edbb@o445881.ingest.sentry.io/5424610',
//     },
//   },
//   desiredInstances,
//   serviceName: 'gateway',
//   appEnv: env,
//   targetGroup: cluster.gatewayTargetGroup,
// });
// cdk.Tags.of(gatewayStack).add('environment', env);