# Pipedream AWS CDK Constructs

A collection of CDK constructs used in various blog posts and other public-facing examples.

## Usage

[See the AWS CDK TypeScript guide](https://docs.aws.amazon.com/cdk/v2/guide/work-with-cdk-typescript.html) for general information on the AWS CDK.

```typescript
import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs" 
import { DDBDeletedItemsToHTTPS } from "@pipedream/cdk-constructs"

export class DDBDeadMansSwitch extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    new DDBDeletedItemsToHTTPS(this, 'DDBDeletedItemsToHTTPS', {
      notificationURL: "https://pipedream.com",
    });
  }
}
```

## Useful commands

- `npm run build` - Compile Typescript to JS
- `npm test` - Run CDK infra tests
