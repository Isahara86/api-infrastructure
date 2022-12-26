import { AppEnvironment } from '../../app-env';

export const GITHUB_OWNER = 'la-developers';
export const API_REPO_NAME = 'sayfer-backend';
export const APP_REPO_NAME = 'sayfer-app';
export const MODERATOR_APP_REPO_NAME = 'sayfer-mc';
export const ADMIN_V2_APP_REPO_NAME = 'sayfer-admin-v2';

export const GIT_DEV_BRANCH = 'master';
export const GIT_PROD_BRANCH = 'prod';

export const AWS_SECRETS_GITHUB_TOKEN_NAME = 'github-access-token';
export const SSM_IMAGE_TAG_PARAM_NAME = 'sayfer-imagetag';

export const GRAPH_NAME = 'sayfer';

export const NAMESPACE = 'local';
export const DEFAULT_SERVICE_PORT = 80;

export const FILES_SERVICE_URL = 'files-service';
export const FILES_SERVICE_NAME = 'files';

export const getMQTTEndpoint = (id: string, region: string) => {
  return `ssl://${id}-1.mq.${region}.amazonaws.com:8883`;
};

export const getAMQPEndpoint = (id: string, region: string) => {
  return `amqps://${id}.mq.${region}.amazonaws.com:5671`;
};

// iam
export const IAM_MICROSERVICE_USERNAME = 'microservice';

export enum Environment {
  DEV = 'dev',
  PROD = 'prod',
}

export function getNamespace(env: AppEnvironment): string {
  return `local-${env}`;
}

export const envBranches = {
  [Environment.DEV]: GIT_DEV_BRANCH,
  [Environment.PROD]: GIT_PROD_BRANCH,
};
