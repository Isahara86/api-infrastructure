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
    aws_codepipeline,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Artifact } from 'aws-cdk-lib/aws-codepipeline';
import { AppEnvironment, DEFAULT_SERVICE_PORT, SSM_IMAGE_TAG_PARAM_NAME } from '../app-env';
import { PipelineContainerImage } from './pipeline-container-image';

export interface AppStackProps extends StackProps {
    vpc: ec2.Vpc;
    cluster: ecs.Cluster;
    serviceSecGroup: ec2.SecurityGroup;
    targetGroup: elbv2.ApplicationTargetGroup;
    desiredInstances: number;
    appEnv: AppEnvironment;
    serviceName: string;
    repoRegion: string;
    repoAccountId: string;
}

export class ApiService extends Stack {
    public readonly service: ecs.FargateService;
    public readonly repository: aws_ecr.Repository;

    constructor(scope: Construct, id: string, props: AppStackProps) {
        super(scope, id, props);

        const {appEnv, serviceName, desiredInstances, repoRegion, repoAccountId} = props;

        const pipelineName = `${appEnv}-${serviceName}Pipeline`;
        const dockerBuildProject = `${appEnv}-${serviceName}DockerBuild`;

        this.repository = new aws_ecr.Repository(this, `${serviceName}Repo`, {
            removalPolicy: RemovalPolicy.DESTROY,
        });
        const builtImage = new PipelineContainerImage(this.repository);

        const sourceOutput = new Artifact();
        const sourceAction = new aws_codepipeline_actions.CodeStarConnectionsSourceAction({
            actionName: 'TriggerOnGitPush',
            connectionArn: 'arn:aws:codestar-connections:us-east-1:812809021705:connection/b3034556-5c76-4e9a-9751-c54bbb1d01b9',
            owner: 'Isahara86',
            repo: 'aws-node-test',
            branch: 'test-app',
            triggerOnPush: true,
            output: sourceOutput,
        });

        const dockerBuild = new aws_codebuild.PipelineProject(this, dockerBuildProject, {
            timeout: Duration.minutes(10),
            environment: {
                buildImage: aws_codebuild.LinuxBuildImage.STANDARD_6_0,
                privileged: true,
            },
            buildSpec: aws_codebuild.BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    pre_build: {
                        commands: [
                            // `$(aws ecr get-login-password --region ${repoRegion})`,
                            // TODO move to secrets
                            `docker login -u sayferapp -p b8b79a4e-5d13-47e9-bcc3-39a304b1783f`,
                        ],
                    },
                    build: {
                        commands: [
                            'echo Build $SERVICE_REPOSITORY_URI',
                            'echo Build $CODEBUILD_RESOLVED_SOURCE_VERSION',
                            'echo Build $SERVICE_REPOSITORY_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION',
                            `docker build -t $SERVICE_REPOSITORY_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION .`,
                        ],
                    },
                    post_build: {
                        commands: [
                            'echo Logging in to Amazon ECR...',
                            // TODO ? id next line required
                            `aws ecr get-login-password --region ${repoRegion} | docker login --username AWS --password-stdin ${repoAccountId}.dkr.ecr.${repoRegion}.amazonaws.com`,
                            'docker push $SERVICE_REPOSITORY_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION',
                            `printf '{ "imageTag": "'$CODEBUILD_RESOLVED_SOURCE_VERSION'" }' > imageTag.json`,
                            'aws ssm put-parameter --name "' +
                            SSM_IMAGE_TAG_PARAM_NAME +
                            '" --value $CODEBUILD_RESOLVED_SOURCE_VERSION --type String --overwrite',
                        ],
                    },
                },
                artifacts: {
                    files: 'imageTag.json',
                },
            }),
            environmentVariables: {
                SERVICE_REPOSITORY_URI: {
                    value: this.repository.repositoryUri,
                },
            },
        });
        // add policy to allow fetching from secrets manager
        dockerBuild.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'secretsmanager:GetRandomPassword',
                'secretsmanager:GetResourcePolicy',
                'secretsmanager:GetSecretValue',
                'secretsmanager:DescribeSecret',
                'secretsmanager:ListSecretVersionIds',
            ],
            // resources: [apolloKey.secretArn],
            resources: ['*'],
        }));
        dockerBuild.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'ecr:BatchCheckLayerAvailability',
                'ecr:BatchGetImage',
                'ecr:GetDownloadUrlForLayer',
                'ecr:GetAuthorizationToken',
            ],
            resources: ['*'],
        }));
        this.repository.grantPullPush(dockerBuild);
        dockerBuild.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['ssm:PutParameter'],
            resources: ['arn:aws:ssm:*:*:parameter/' + SSM_IMAGE_TAG_PARAM_NAME],
        }));

        const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
            memoryLimitMiB: 512,
            cpu: 256,
        });
        const dockerBuildOutput = new Artifact('DockerBuildOutput');
        // const cdkBuildOutput = new Artifact();
        // Instantiate Fargate Service with cluster and images
         taskDefinition.addContainer('api', {
            portMappings: [{containerPort: DEFAULT_SERVICE_PORT}],
            image: builtImage
            // logging,
            // secrets: {
            //     ...secrets,
            // },
            // environment: {
            //     ...(environment ? environment[appEnv] : {}),
            //     APP_ENV: `${appEnv}`,
            //     AWS_REGION: this.region,
            // },
        });
        const service = new ecs.FargateService(this, 'Service', {
            cluster: props.cluster,
            taskDefinition: taskDefinition,
            desiredCount: desiredInstances,
            securityGroups: [props.serviceSecGroup],
            cloudMapOptions: {
                name: serviceName,
            },
        });
        // Setup autoscaling
        const scaling = service.autoScaleTaskCount({maxCapacity: 2, minCapacity: desiredInstances});
        scaling.scaleOnCpuUtilization('CpuScaling', {
            targetUtilizationPercent: 60,
            scaleInCooldown: Duration.seconds(300),
            scaleOutCooldown: Duration.seconds(300),
        });

        new aws_codepipeline.Pipeline(this, pipelineName, {
            stages: [
                {
                    stageName: 'Source',
                    actions: [
                        sourceAction,
                        // cdkSourceAction
                    ],
                },
                {
                    stageName: 'Build',
                    actions: [
                        new aws_codepipeline_actions.CodeBuildAction({
                            actionName: 'DockerBuild',
                            project: dockerBuild,
                            input: sourceOutput,
                            outputs: [dockerBuildOutput],
                        }),
                        // new codepipeline_actions.CodeBuildAction({
                        //   actionName: 'CdkBuild',
                        //   project: cdkBuild,
                        //   input: cdkSourceOutput,
                        //   outputs: [cdkBuildOutput],
                        // }),
                    ],
                },
                {
                    stageName: 'Deploy',
                    actions: [
                        new aws_codepipeline_actions.EcsDeployAction({
                            actionName: 'Deploy',
                            input: dockerBuildOutput,
                            service,
                        })
                    ],
                },
            ],
        });


        props.targetGroup.addTarget(service);
    }
}
