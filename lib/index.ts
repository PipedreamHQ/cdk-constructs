import { 
  aws_dynamodb as ddb,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_logs as logs,
  aws_lambda_event_sources as eventsources,
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