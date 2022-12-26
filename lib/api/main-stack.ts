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
    aws_ecs_patterns,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Vpc } from './vpc';
import { Registry } from './registry';

const DB_PORT = 5432;
const DOMAIN_NAME = 'example-app.dev-environment.com';

export type MainStackProps = {
    registry: Registry;
};

export class MainStack extends Stack {
    readonly loadBalancedService: ecsPatterns.ApplicationLoadBalancedFargateService;

    constructor(scope: Construct, id: string, { registry }: MainStackProps) {
        super(scope, id);

        const vpc = new Vpc(this, 'VPC');

        // const database = new Database(this, 'Database', {
        //     vpc: vpc.vpc,
        //     port: DB_PORT,
        //     name: 'app',
        // });

        const hostedZone = new route53.PublicHostedZone(this, 'HostedZone', {
            zoneName: DOMAIN_NAME,
        });

        const certificate = new acm.DnsValidatedCertificate(this, 'Certificate', {
            domainName: DOMAIN_NAME,
            hostedZone,
        });

        const cluster = new ecs.Cluster(this, 'Cluster', {
            vpc: vpc.vpc,
        });

        const containerName = 'app';

        this.loadBalancedService = new aws_ecs_patterns.ApplicationLoadBalancedFargateService(
            this,
            'FargateService',
            {
                cluster,
                domainName: DOMAIN_NAME,
                domainZone: hostedZone,
                certificate,
                memoryLimitMiB: 1024,
                taskImageOptions: {
                    containerName,
                    image: ecs.ContainerImage.fromEcrRepository(registry.repository),
                    // environment: {
                    //     DB_HOST: database.instance.instanceEndpoint.hostname.toString(),
                    //     DB_NAME: database.name,
                    //     DB_USER: database.credentials.username.toString(),
                    //     DB_PASSWORD: database.credentials.password.toString(),
                    //     DB_PORT: DB_PORT.toString(),
                    // },
                    containerPort: 3000,
                },
                healthCheckGracePeriod: Duration.seconds(60),
            },
        );

        this.loadBalancedService.targetGroup.configureHealthCheck({
            unhealthyThresholdCount: 10,
        });

        // We're using `fromRepositoryAttributes` here to circumvent the `would create cyclic reference`
        // error caused by using a direct reference to the repository (see https://github.com/aws/aws-cdk/issues/5657)
        const repository = ecr.Repository.fromRepositoryAttributes(
            this,
            'ImportedRepository',
            {
                repositoryArn: registry.repository.repositoryArn,
                repositoryName: registry.repository.repositoryName,
            },
        );

        const sourceOutput = new codepipeline.Artifact();
        const transformedOutput = new codepipeline.Artifact();
        const buildProject = new codebuild.PipelineProject(
            this,
            'PipelineProject',
            {
                buildSpec: codebuild.BuildSpec.fromObject({
                    version: 0.2,
                    phases: {
                        build: {
                            commands: [
                                // https://docs.aws.amazon.com/codepipeline/latest/userguide/file-reference.html#pipelines-create-image-definitions
                                `echo "[{\\"name\\":\\"$CONTAINER_NAME\\",\\"imageUri\\":\\"$REPOSITORY_URI\\"}]" > imagedefinitions.json`,
                            ],
                        },
                    },
                    artifacts: {
                        files: ['imagedefinitions.json'],
                    },
                }),
                environment: {
                    buildImage: codebuild.LinuxBuildImage.STANDARD_2_0,
                },
                environmentVariables: {
                    // Container name as it exists in the task definition
                    CONTAINER_NAME: {
                        value: containerName,
                    },
                    // ECR URI
                    REPOSITORY_URI: {
                        value: registry.repository.repositoryUri,
                    },
                },
            });

        // Grant access to detect ECR pushes
        repository.grantPullPush(buildProject.grantPrincipal);

        new codepipeline.Pipeline(this, 'Pipeline', {
            stages: [
                // If something is pushed to the referenced ECR repository…
                {
                    stageName: 'Source',
                    actions: [
                        new codepipelineActions.EcrSourceAction({
                            actionName: 'Push',
                            repository,
                            output: sourceOutput,
                        }),
                    ],
                },
                // …then run the build pipeline above to create `imagedefinitions.json`…
                {
                    stageName: 'Build',
                    actions: [
                        new codepipelineActions.CodeBuildAction({
                            actionName: 'Build',
                            input: sourceOutput,
                            outputs: [transformedOutput],
                            project: buildProject,
                        }),
                    ],
                },
                // …and trigger an ECS deploy based on the previously created `imagedefinitions.json`
                {
                    stageName: 'Deploy',
                    actions: [
                        new codepipelineActions.EcsDeployAction({
                            actionName: 'Deploy',
                            input: transformedOutput,
                            service: this.loadBalancedService.service,
                        }),
                    ],
                },
            ],
        });
    }
}