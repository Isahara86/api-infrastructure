import { Construct } from 'constructs';
import { Environment, getNamespace } from '../config';
import {
    aws_certificatemanager,
    CfnOutput,
    Duration,
    Stack,
    StackProps,
    aws_servicediscovery,
    aws_elasticloadbalancingv2 as elbv2,
    aws_ecs as ecs,
    aws_ec2 as ec2,
} from 'aws-cdk-lib';

export interface ClusterStackProps extends StackProps {
    cidr: string;
    maxAZs: number;
    appEnv: Environment;
}

export class ClusterStack extends Stack {
    public readonly vpc: ec2.Vpc;
    public readonly cluster: ecs.Cluster;
    public readonly namespace: aws_servicediscovery.INamespace;
    public readonly securityGroup: ec2.SecurityGroup;
    public readonly gatewayTargetGroup: elbv2.ApplicationTargetGroup;
    // public readonly certificate: aws_certificatemanager.Certificate;

    constructor(scope: Construct, id: string, props: ClusterStackProps) {
        super(scope, id, props);

        const {appEnv} = props;

        // this.certificate = new aws_certificatemanager.Certificate(this, 'SayferCertificate', {
        //     domainName: '*.test.com',
        // });

        this.vpc = new ec2.Vpc(this, `Vpc`, {
            maxAzs: props.maxAZs,
            cidr: props.cidr,
        });

        this.cluster = new ecs.Cluster(this, `FargateCluster`, {
            vpc: this.vpc,
            containerInsights: true,
        });

        this.namespace = this.cluster.addDefaultCloudMapNamespace({
            name: getNamespace(appEnv),
        });

        // Security group
        this.securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
            vpc: this.vpc,
            allowAllOutbound: true,
        });
        this.securityGroup.connections.allowFromAnyIpv4(ec2.Port.allTraffic());

        const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'external', {
            vpc: this.vpc,
            internetFacing: true,
            idleTimeout: Duration.minutes(60),
        });

        this.gatewayTargetGroup = new elbv2.ApplicationTargetGroup(this, 'GatewayTargetGroup', {
            vpc: this.vpc,
            port: 80,
            protocol: elbv2.ApplicationProtocol.HTTP,
            healthCheck: {
                path: '/',
            },
            targetType: elbv2.TargetType.IP,
        });

        loadBalancer.addListener('Listener', {
            port: 80,
            // defaultAction: elbv2.ListenerAction.redirect({
            //     protocol: 'HTTPS',
            // }),

            defaultTargetGroups: [this.gatewayTargetGroup],
        });

        // loadBalancer.addListener('HttpsListener', {
        //     port: 443,
        //     certificates: [elbv2.ListenerCertificate.fromCertificateManager(this.certificate)],
        //     defaultTargetGroups: [this.gatewayTargetGroup],
        // });


        new CfnOutput(this, 'LoadBalancerDNS: ', {value: loadBalancer.loadBalancerDnsName});
    }
}
