import { 
  aws_certificatemanager as acm,
  aws_dynamodb as ddb,
  aws_ecs as ecs,
  aws_ecs_patterns as ecsPatterns, 
  aws_elasticloadbalancingv2 as elbv2,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_logs as logs,
  aws_lambda_event_sources as eventsources,
  aws_route53 as route53, 
  aws_secretsmanager as secretsmanager,
  aws_sns as sns,
  Duration,
} from "aws-cdk-lib"
import { Construct } from "constructs" 
import path from 'node:path'

export interface DDBDeletedItemsToHTTPSProps {
  /**
   * The HTTPS endpoint where alarm notifications should be routed
   */
  readonly notificationURL: string;
}

// Items that reach their TTL in the DynamoDB table will be delivered
// to a Lambda function that adds the item to an SNS topic. SNS delivers
// the event to the HTTPS endpoint specified in the props.
export class DDBDeletedItemsToHTTPS extends Construct {
  constructor(scope: Construct, id: string, props: DDBDeletedItemsToHTTPSProps) {
    super(scope, id)

    const table = new ddb.Table(this, "SlackThreadsTable", {
      partitionKey: { name: "id", type: ddb.AttributeType.STRING },
      sortKey: { name: "channel", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      encryption: ddb.TableEncryption.DEFAULT,
      stream: ddb.StreamViewType.KEYS_ONLY,
      tableName: "SlackThreadsTTL",
      timeToLiveAttribute: "ttl",
    })

    // DynamoDB Streams only support Lambda and Kinesis as native targets,
    // so we create a Lambda function that will publish to an SNS topic
    const topic = new sns.Topic(this, 'SlackThreads');

    // Create an HTTPS subscription to Pipedream
    new sns.Subscription(this, 'Subscription', {
      topic,
      // The HTTPS URL of the Pipedream endpoint where you want notifications delivered
      endpoint: props.notificationURL,
      protocol: sns.SubscriptionProtocol.HTTPS,
    });

    const functionName = "SlackThreadsDynamoDeadMansSwitch"
    const fn = new lambda.Function(this, functionName, {
      functionName,
      description: 'Process DynamoDB records deleted from the SlackThreads table',
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      timeout: Duration.seconds(30),
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda', 'ddb-stream-to-sns')),
      environment: {
        SNS_TOPIC_ARN: topic.topicArn,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // Add the DynamoDB stream as an event source for the Lambda function
    fn.addEventSource(new eventsources.DynamoEventSource(table, {
      startingPosition: lambda.StartingPosition.LATEST, 
    }));

    // Add permissions for Lambda to publish to our SNS topic
    const snsPublishPolicy = new iam.PolicyStatement({
      actions: ['sns:Publish'],
      resources: [topic.topicArn],
    });

    fn.role?.attachInlinePolicy(
      new iam.Policy(this, 'sns-publish-policy', {
        statements: [snsPublishPolicy],
      }),
    );
  }
}
  
interface GrowthbookProps {
  readonly hostedZoneName: string
  readonly growthbookHost: string;
  readonly emailHost: string;
  readonly emailPort: string;
  readonly emailFromAddress: string;
}
  
export class Growthbook extends Construct {
  constructor(scope: Construct, id: string, props: GrowthbookProps) {
    super(scope, id)
  
    const { growthbookHost, hostedZoneName } = props
  
    const hostedZone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: hostedZoneName });
  
    // Growthbook ECS service 
    const domainName = `${growthbookHost}.${hostedZoneName}`
    const certificate = new acm.DnsValidatedCertificate(this, "GrowthbookCertificate", {
      domainName,
      hostedZone,
    })
  
    const loadBalancedFargateService = new ecsPatterns.ApplicationMultipleTargetGroupsFargateService(this, "GrowthbookService", {
      cpu: 512,
      desiredCount: 1,
      loadBalancers: [
        {
          name: "GrowthbookLoadBalancer",
          domainName,
          domainZone: hostedZone,
          listeners: [
            { 
              name: "growthbook-ui",
              port: 443,
              certificate,
              protocol: elbv2.ApplicationProtocol.HTTPS,
              sslPolicy: elbv2.SslPolicy.FORWARD_SECRECY_TLS12_RES_GCM,
            },
            { 
              name: "growthbook-api",
              port: 3100,
              certificate,
              protocol: elbv2.ApplicationProtocol.HTTPS,
              sslPolicy: elbv2.SslPolicy.FORWARD_SECRECY_TLS12_RES_GCM,
            }
          ],
          publicLoadBalancer: true,
        }
  
      ],
      memoryLimitMiB: 1024,
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry("growthbook/growthbook:latest"),
        environment: {
          APP_ORIGIN: `https://${domainName}`,
          API_HOST: `https://${domainName}:3100`,
          NODE_ENV: "production",
          EMAIL_ENABLED: "true",
          EMAIL_HOST: props.emailHost,
          EMAIL_PORT: props.emailPort,
          EMAIL_FROM: props.emailFromAddress,
        },
        secrets: {
          MONGODB_URI: ecs.Secret.fromSecretsManager(
            secretsmanager.Secret.fromSecretNameV2(this, 'secretMongoURI', 'prod/mongo'),
            'MONGODB_URI',
          ),
          JWT_SECRET: ecs.Secret.fromSecretsManager(
            secretsmanager.Secret.fromSecretNameV2(this, 'secretJwtSecret', 'prod/mongo'),
            'JWT_SECRET',
          ),
          ENCRYPTION_KEY: ecs.Secret.fromSecretsManager(
            secretsmanager.Secret.fromSecretNameV2(this, 'secretEncryptionKey', 'prod/mongo'),
            'ENCRYPTION_KEY',
          ),
          EMAIL_HOST_USER: ecs.Secret.fromSecretsManager(
            secretsmanager.Secret.fromSecretNameV2(this, 'secretUsername', 'prod/email'),
            'USER',
          ),
          EMAIL_HOST_PASSWORD: ecs.Secret.fromSecretsManager(
            secretsmanager.Secret.fromSecretNameV2(this, 'secretPassword', 'prod/email'),
            'PASSWORD',
          ),
        },
        containerPorts: [3000, 3100]
      },
      serviceName: "growthbook",
      targetGroups: [
        {
          containerPort: 3000,
          listener: "growthbook-ui",
        },
        { 
          containerPort: 3100,
          listener: "growthbook-api",
        }
      ]
    })
  
    const scalableTarget = loadBalancedFargateService.service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 5,
    });
      
    scalableTarget.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 50,
    });
      
    scalableTarget.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 50,
    });
  }
}