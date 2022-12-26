export enum AppEnvironment {
    DEV = 'dev',
    PROD = 'prod',
}
export function getNamespace(env: AppEnvironment): string {
    return `local-${env}`;
}

export const PROJECT_NAME = 'gvp';

export const DEFAULT_SERVICE_PORT = 80;
export const SSM_IMAGE_TAG_PARAM_NAME = 'app-imagetag';