import * as cloudfront from '@aws-cdk/aws-cloudfront';
import * as origins from '@aws-cdk/aws-cloudfront-origins';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3n from '@aws-cdk/aws-s3-notifications';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';
import * as sqs from '@aws-cdk/aws-sqs';
import * as cfn_inc from '@aws-cdk/cloudformation-include';
import * as cdk from '@aws-cdk/core';

import { DEFAULT_SERVICE_PORT, Environment, getNamespace } from '../../config';
import { getSecretArn, IEnvVariables } from '../secrets';

export interface FilesStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  cluster: ecs.Cluster;
  serviceSecGroup: ec2.SecurityGroup;
  appImage: ecs.ContainerImage;
  targetGroup: elbv2.ApplicationTargetGroup;
  appEnv: Environment;
  secrets?: IEnvVariables;
  environment?: IEnvVariables;
  desiredInstances: number;
  serviceName: string;
}

export class FilesStack extends cdk.Stack {
  private readonly imageBucket: s3.Bucket;
  private readonly videoBucket: s3.Bucket;
  private readonly optimizedVideoBucket: s3.Bucket;
  private readonly videoThumbnailsBucket: s3.Bucket;

  private readonly customerImageDistribution: cloudfront.Distribution;
  private readonly optimizedVideoDistribution: cloudfront.Distribution;

  constructor(scope: cdk.Construct, id: string, props: FilesStackProps) {
    super(scope, id, props);

    const { appEnv, environment, desiredInstances, serviceName } = props;

    // Customer-uploaded images bucket
    this.imageBucket = new s3.Bucket(this, `${appEnv}-CustomerImage`, {
      publicReadAccess: true,
    });

    // Customer-uploaded videos bucket
    this.videoBucket = new s3.Bucket(this, `${appEnv}-CustomerVideo`, {
      publicReadAccess: true,
    });

    const videoUploadedQueue = new sqs.Queue(this, 'VideoUploaded');
    this.videoBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(videoUploadedQueue),
    );

    // Optimized videos bucket
    this.optimizedVideoBucket = new s3.Bucket(this, `${appEnv}-OptimizedVideo`, {
      publicReadAccess: true,
    });

    const optimizedVideoUploadedQueue = new sqs.Queue(this, 'OptimizedVideoUploaded');
    this.optimizedVideoBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(optimizedVideoUploadedQueue),
    );

    // Generated video thumbnails
    this.videoThumbnailsBucket = new s3.Bucket(this, `${appEnv}-VideoThumbnails`, {
      publicReadAccess: true,
    });

    const thumbnailUploadedQueue = new sqs.Queue(this, 'ThumbnailUploaded');
    this.videoThumbnailsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(thumbnailUploadedQueue),
    );

    // Cloudfront distributions
    this.customerImageDistribution = new cloudfront.Distribution(this, 'customerImageDist', {
      defaultBehavior: { origin: new origins.S3Origin(this.imageBucket) },
    });

    this.optimizedVideoDistribution = new cloudfront.Distribution(this, 'optimizedVideoDist', {
      defaultBehavior: { origin: new origins.S3Origin(this.optimizedVideoBucket) },
    });

    // Task
    const taskDef = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      memoryLimitMiB: 512,
      cpu: 256,
    });

    // Add app container
    const logging = new ecs.AwsLogDriver({
      streamPrefix: `sayfer-${appEnv}/${serviceName}`,
    });

    const imageProcessing = new cfn_inc.CfnInclude(this, 'ImageHandlerTemplate', {
      templateFile: './lib/files/serverless-image-handler.json',
      parameters: {
        CorsEnabled: 'Yes',
        SourceBuckets: `${this.imageBucket.bucketName},${this.videoThumbnailsBucket.bucketName}`,
        DeployDemoUI: 'No',
      },
      preserveLogicalIds: false,
    });

    const cdnBaseUrl = imageProcessing.getOutput('ApiEndpoint').value;

    const secrets: { [key: string]: ecs.Secret } = {};
    if (props.secrets && props.secrets[appEnv]) {
      for (const key of Object.keys(props.secrets[appEnv]!)) {
        const secret = secretsmanager.Secret.fromSecretCompleteArn(
          this,
          key,
          getSecretArn(this, props.secrets[appEnv]![key]),
        );
        secret.grantRead(taskDef.taskRole);
        secrets[key] = ecs.Secret.fromSecretsManager(secret);
      }
    }

    const appContainer = taskDef.addContainer(serviceName, {
      image: props.appImage,
      logging,
      secrets: {
        ...secrets,
      },
      environment: {
        ...(environment ? environment[appEnv] : {}),
        APP_ENV: `${appEnv}`,
        AWS_REGION: this.region,
        DB_SSL: 'true',
        PUBLIC_SERVICE_URL: `http://${serviceName}.${getNamespace(
          appEnv,
        )}:${DEFAULT_SERVICE_PORT}/graphql`,
        IMAGE_BUCKET_NAME: this.imageBucket.bucketName,
        VIDEO_BUCKET_NAME: this.videoBucket.bucketName,
        OPTIMIZED_VIDEO_BUCKET_NAME: this.optimizedVideoBucket.bucketName,
        THUMBNAIL_BUCKET_NAME: this.videoThumbnailsBucket.bucketName,
        VIDEO_UPLOADED_QUEUE: videoUploadedQueue.queueName,
        OPTIMIZED_VIDEO_UPLOADED_QUEUE: optimizedVideoUploadedQueue.queueName,
        THUMBNAIL_UPLOADED_QUEUE: thumbnailUploadedQueue.queueName,
        CDN_BASE_URL: cdnBaseUrl,
        IMAGE_DISTRIBUTION_BASE_URL: `https://${this.customerImageDistribution.distributionDomainName}`,
        OPTIMIZED_VIDEO_DISTRIBUTION_BASE_URL: `https://${this.optimizedVideoDistribution.distributionDomainName}`,
      },
    });
    appContainer.addPortMappings({ containerPort: DEFAULT_SERVICE_PORT });

    const service = new ecs.FargateService(this, 'Service', {
      cluster: props.cluster,
      taskDefinition: taskDef,
      desiredCount: desiredInstances,
      securityGroups: [props.serviceSecGroup],
      cloudMapOptions: {
        name: serviceName,
      },
    });

    // Setup autoscaling
    const scaling = service.autoScaleTaskCount({ maxCapacity: 4, minCapacity: desiredInstances });
    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 60,
      scaleInCooldown: cdk.Duration.seconds(300),
      scaleOutCooldown: cdk.Duration.seconds(300),
    });

    props.targetGroup.addTarget(service);
  }
}
