import {
    aws_ecs as ecs,
    aws_ec2 as ec2,
    aws_elasticloadbalancingv2 as elbv2,
    Stack,
    StackProps,
    Duration,
    aws_ecr,
    RemovalPolicy,
    aws_codepipeline_actions,
    aws_codebuild,
    aws_iam as iam,
    aws_codepipeline, App
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DEFAULT_SERVICE_PORT, getNamespace, SSM_IMAGE_TAG_PARAM_NAME } from '../config';
import { PipelineContainerImage } from './pipeline-container-image';
import { Artifact } from 'aws-cdk-lib/aws-codepipeline';
import { AppEnvironment } from '../../../app-env';

// import { getSecretArn, IEnvVariables } from './secrets';

export interface AppStackProps extends StackProps {
    vpc: ec2.Vpc;
    cluster: ecs.Cluster;
    serviceSecGroup: ec2.SecurityGroup;
    targetGroup: elbv2.ApplicationTargetGroup;
    // secrets?: IEnvVariables;
    // environment?: IEnvVariables;
    desiredInstances: number;
    appEnv: AppEnvironment;
    serviceName: string;
    appImage: ecs.ContainerImage;
}

export class GatewayStack extends Stack {

    constructor(scope: Construct, id: string, props: AppStackProps) {
        super(scope, id, props);

        const { appEnv, serviceName, desiredInstances } = props;

        // Task
        const gatewayTaskDef = new ecs.FargateTaskDefinition(this, 'TaskDef', {
            memoryLimitMiB: 512,
            cpu: 256,
        });

        // const secrets: { [key: string]: ecs.Secret } = {};
        //
        // if (props.secrets && props.secrets[appEnv]) {
        //     for (const key of Object.keys(props.secrets[appEnv]!)) {
        //         const secret = secretsmanager.Secret.fromSecretCompleteArn(
        //             this,
        //             key,
        //             getSecretArn(this, props.secrets[appEnv]![key]),
        //         );
        //         secret.grantRead(gatewayTaskDef.taskRole);
        //         secrets[key] = ecs.Secret.fromSecretsManager(secret);
        //     }
        // }

        // Add app container
        const logging = new ecs.AwsLogDriver({
            streamPrefix: `sayfer-${appEnv}/${serviceName}`,
        });

        const appContainer = gatewayTaskDef.addContainer(serviceName, {
            image: props.appImage,
            logging,
            // secrets: {
            //     ...secrets,
            // },
            // environment: {
            //     ...(environment ? environment[appEnv] : {}),
            //     APP_ENV: `${appEnv}`,
            //     AWS_REGION: this.region,
            // },
        });
        appContainer.addPortMappings({ containerPort: DEFAULT_SERVICE_PORT });

        // Instantiate Fargate Service with cluster and images
        const service = new ecs.FargateService(this, 'Service', {
            cluster: props.cluster,
            taskDefinition: gatewayTaskDef,
            desiredCount: desiredInstances,
            securityGroups: [props.serviceSecGroup],
            cloudMapOptions: {
                name: serviceName,
            },
        });

        // Setup autoscaling
        const scaling = service.autoScaleTaskCount({ maxCapacity: 2, minCapacity: desiredInstances });
        scaling.scaleOnCpuUtilization('CpuScaling', {
            targetUtilizationPercent: 60,
            scaleInCooldown: Duration.seconds(300),
            scaleOutCooldown: Duration.seconds(300),
        });

        props.targetGroup.addTarget(service);
    }
}