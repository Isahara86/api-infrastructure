import {
    Stack,
    StackProps,
    aws_ecr,
    RemovalPolicy,
    Duration,
    aws_codebuild,
    aws_iam as iam,
    aws_elasticloadbalancingv2,
    aws_ec2 as ec2,
    aws_ecs as ecs,
} from 'aws-cdk-lib';
import { Artifact } from 'aws-cdk-lib/aws-codepipeline';
import { aws_codepipeline, aws_codepipeline_actions } from 'aws-cdk-lib';
import {
    // API_REPO_NAME,
    // AWS_SECRETS_GITHUB_TOKEN_NAME,
    // DEFAULT_SERVICE_PORT,
    // envBranches,
    // Environment,
    // getNamespace,
    // GITHUB_OWNER,
    // GRAPH_NAME,
    SSM_IMAGE_TAG_PARAM_NAME,
} from '../config';
import { Construct } from 'constructs';
import { AppEnvironment } from '../../../app-env';
import { PipelineContainerImage } from './pipeline-container-image';

// import { getSecretArn, secrets } from './secrets';

export interface PipelineStackProps extends StackProps {
    repoRegion: string;
    repoAccountId: string;
    serviceName: string;
    serviceStackName: string;
    appEnv: AppEnvironment;
}

export class PipelineStack extends Stack {
    public readonly builtImage: PipelineContainerImage;
    public readonly imageTag: string;
    public readonly repository: aws_ecr.Repository;

    constructor(scope: Construct, id: string, props: PipelineStackProps) {
        super(scope, id, {
            ...props,
        });


        // const repoName = API_REPO_NAME;
        const {serviceName, appEnv, repoRegion, repoAccountId, serviceStackName} = props;


        const pipelineName = `${appEnv}-${serviceName}Pipeline`;
        const dockerBuildProject = `${appEnv}-${serviceName}DockerBuild`;
        const cdkBuildProject = `${appEnv}-${serviceName}CdkBuild`;

        this.repository = new aws_ecr.Repository(this, `${serviceName}Repo`, {
            removalPolicy: RemovalPolicy.DESTROY,
        });
        this.builtImage = new PipelineContainerImage(this.repository);

        const sourceOutput = new Artifact();
        const sourceAction = new aws_codepipeline_actions.CodeStarConnectionsSourceAction({
            actionName: 'TriggerOnGitPush',
            connectionArn: 'arn:aws:codestar-connections:us-east-1:812809021705:connection/0e600bb8-685e-4151-aa72-c117bb83ac07',
            owner: 'Isahara86',
            repo: 'aws-node-test',
            branch: 'test-app',
            triggerOnPush: true,
            output: sourceOutput,
        });


        const cdkSourceOutput = new Artifact();
        const cdkSourceAction = new aws_codepipeline_actions.CodeStarConnectionsSourceAction({
            actionName: 'InfrastructureGitPush',
            connectionArn: 'arn:aws:codestar-connections:us-east-1:812809021705:connection/0e600bb8-685e-4151-aa72-c117bb83ac07',
            owner: 'Isahara86',
            repo: 'api-infrastructure',
            branch: 'main',
            triggerOnPush: true,
            output: cdkSourceOutput,
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
                        // commands: [
                        //     'echo Logging in to Amazon ECR...',
                        //     `aws ecr get-login-password --region ${repoRegion} | docker login --username AWS --password-stdin ${repoAccountId}.dkr.ecr.${repoRegion}.amazonaws.com`,
                        // ],
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

        const cdkBuild = new aws_codebuild.PipelineProject(this, cdkBuildProject, {
          timeout: Duration.minutes(10),
          environment: {
            buildImage: aws_codebuild.LinuxBuildImage.STANDARD_6_0,
          },
          buildSpec: aws_codebuild.BuildSpec.fromObject({
            version: '0.2',
            phases: {
                install: {
                    'runtime-versions': {
                        nodejs: '16.x',
                    },
                    commands: [
                        'npm install',
                    ]
                },
              build: {
                commands: ['npm run build', `npm run cdk synth -- -o .`],
              },
            },
            artifacts: {
              //  important to have same name as a service unless deploy will not find .template.json
              files: `${serviceStackName}.template.json`,
            },
          }),
        });
        cdkBuild.addToRolePolicy(
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['ec2:DescribeAvailabilityZones'],
            resources: ['*'],
          }),
        );

        const dockerBuildOutput = new Artifact('DockerBuildOutput');
        const cdkBuildOutput = new Artifact();

        const pipeline = new aws_codepipeline.Pipeline(this, pipelineName, {
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
                        new aws_codepipeline_actions.CodeBuildAction({
                            actionName: 'CdkBuild',
                            project: cdkBuild,
                            input: cdkSourceOutput,
                            outputs: [cdkBuildOutput],
                        }),
                    ],
                },
                {
                    stageName: 'Deploy',
                    actions: [
                        new aws_codepipeline_actions.CloudFormationCreateUpdateStackAction({
                            actionName: 'CFN_Deploy',
                            stackName: serviceStackName,
                            templatePath: cdkBuildOutput.atPath(`${serviceStackName}.template.json`),
                            adminPermissions: true,
                            parameterOverrides: {
                                [this.builtImage.paramName]: dockerBuildOutput.getParam(
                                    'imageTag.json',
                                    'imageTag',
                                ),
                            },
                            extraInputs: [dockerBuildOutput],
                        }),
                    ],
                },
            ],
        });

        this.imageTag = dockerBuildOutput.getParam('imageTag.json', 'imageTag');
    }
}
