import { CfnParameter, Lazy, aws_ecs, aws_ecr } from 'aws-cdk-lib';

export class PipelineContainerImage extends aws_ecs.ContainerImage {
  public readonly imageName: string;
  private readonly repository: aws_ecr.IRepository;
  private parameter?: CfnParameter;

  constructor(repository: aws_ecr.IRepository) {
    super();
    this.imageName = repository.repositoryUriForTag(
      Lazy.string({ produce: () => this.parameter!.valueAsString }),
    );
    this.repository = repository;
  }

  public bind(containerDefinition: aws_ecs.ContainerDefinition): aws_ecs.ContainerImageConfig {
    this.repository.grantPull(containerDefinition.taskDefinition.obtainExecutionRole());
    this.parameter = new CfnParameter(containerDefinition, 'PipelineParam', {
      type: 'String',
      default: '5489421c0ec35dc54b84fda0124dc0bc25a0d3d7',
    });
    return {
      imageName: this.imageName,
    };
  }

  public get paramName(): string {
    // return cdk.Token.asString(this.parameter!.logicalId).toString();
    return Lazy.string({ produce: () => this.parameter!.logicalId });
  }
}
