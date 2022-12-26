import * as cdk from 'aws-cdk-lib/core';

import { Environment } from '../config';

export interface IEnvVariables {
  [Environment.DEV]?: {
    [key: string]: string;
  };
  [Environment.PROD]?: {
    [key: string]: string;
  };
}

export const secrets = {
  [Environment.DEV]: {
    MQ_USERNAME: `dev/mq/username-8bpNSb`,
    MQ_PASSWORD: `dev/mq/secret-ZCMRkf`,
    APOLLO_KEY: `apollo-key-Bcqn5d`,
    AWS_ACCESS_KEY_ID: `iam/microservice/key-id-kcRHpQ`,
    AWS_SECRET_ACCESS_KEY: `iam/microservice/key-secret-IQiT0e`,
    TWITTER_KEY: `twitter-consumer-key-hXILQQ`,
    TWITTER_SECRET: `twitter-consumer-secret-w5WMOV`,
    DB_URL: `dev/db/postgres-url-plnbxA`,
    APPLE_PRIVATE_KEY: 'dev/apple/private-key-A5WArN',
    SYSTEM_USER_TOKEN: 'dev/auth/system-token-vld24Y',
    AUTH_PRIVATE_KEY: 'dev/auth/private-key-1PYS7f',
  },
  [Environment.PROD]: {
    MQ_USERNAME: `prod/mq/username-6Vvqj0`,
    MQ_PASSWORD: `prod/mq/secret-yC1GMP`,
    APOLLO_KEY: `prod/apollo/key-1sQ9ww`,
    AWS_ACCESS_KEY_ID: `prod/iam/microservice/key-id-EVBxDI`,
    AWS_SECRET_ACCESS_KEY: `prod/iam/microservice/key-secret-1bPPDa`,
    TWITTER_KEY: `prod/twitter/key-gkFoJu`,
    TWITTER_SECRET: `prod/twitter/secret-SkcS2x`,
    DB_URL: `prod/db/postgres-url-h98cG2`,
    APPLE_PRIVATE_KEY: 'prod/apple/private-key-TtNsPT',
    SYSTEM_USER_TOKEN: 'prod/auth/system-token-kPKNuJ',
    AUTH_PRIVATE_KEY: 'prod/auth/private-key-ZGYJgs',
  },
};

export const environments = {
  [Environment.DEV]: {
    APPLE_REDIRECT_URI: 'https://dev.sayferapp.com/#/callbacks/sign_in_with_apple',
    APPLE_APP_CLIENT_ID: 'app.sayfer.dev',
    APPLE_KEY_ID: '4HJRW398T2',
    BRANCH_KEY: 'key_test_kd2elDh42WD5BwSdCBtnhocfEwmc63a7',
    HUBSPOT_API_KEY: 'ac2615dd-b3f8-4992-aae0-ac1eb0f385de',
    MQ_ENDPOINT: 'amqps://b-47370b10-668d-44fb-9499-896032a91e25.mq.us-west-1.amazonaws.com:5671',
    REDIS_URL: 'redis://sayfer-cache.blntsk.0001.usw1.cache.amazonaws.com:6379',
    NODE_ENV: 'development',
    APP_ID: 'app.sayfer.dev',
    PUBLIC_API_URL: 'https://gw-dev.sayferapp.com',
    // File uploaded to env database
    SAYFER_LOGO_FILE_ID: '19e51760-8da0-11eb-9daf-d17b8a47fb92.png',
  },
  [Environment.PROD]: {
    APPLE_REDIRECT_URI: 'https://sayferapp.com/#/callbacks/sign_in_with_apple',
    APPLE_APP_CLIENT_ID: 'app.sayfer',
    APPLE_KEY_ID: '4HJRW398T2',
    BRANCH_KEY: 'key_live_np7iduj2WXE1sxPkAtCghmpgEzhm1YeL',
    HUBSPOT_API_KEY: 'a74728ef-0186-49ee-bd40-402317474f36',
    MQ_ENDPOINT: 'amqps://b-431484ea-18d4-4cde-b328-3b3331064989.mq.us-west-2.amazonaws.com:5671',
    REDIS_URL: 'redis://sayfer-cache-prod.ucbo2l.0001.usw2.cache.amazonaws.com:6379',
    NODE_ENV: 'production',
    APP_ID: 'app.sayfer',
    PUBLIC_API_URL: 'https://gw.sayferapp.com',
    // File uploaded to env database
    SAYFER_LOGO_FILE_ID: '60d6dd70-8da0-11eb-a4ab-51844c540bc2.png',
  },
};

export function getSecretArn(stack: cdk.Stack, key: string) {
  return `arn:aws:secretsmanager:${stack.region}:${stack.account}:secret:${key}`;
}
