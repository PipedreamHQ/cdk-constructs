import { App, Stack } from "aws-cdk-lib";
import { Template } from 'aws-cdk-lib/assertions'
import { DDBDeletedItemsToHTTPS } from '../lib/index';

test('SNS Topic Created', () => {
  const app = new App();
  const stack = new Stack(app, "TestStack");

  // WHEN
  new DDBDeletedItemsToHTTPS(stack, 'DDBDeletedItemsToHTTPS', {
    notificationURL: "https://pipedream.com",
  });

  // Prepare the stack for assertions.
  const template = Template.fromStack(stack);

  // THEN
  template.resourceCountIs("AWS::DynamoDB::Table", 1);
  template.resourceCountIs("AWS::SNS::Topic", 1);
  template.resourceCountIs("AWS::SNS::Subscription", 1);
});
