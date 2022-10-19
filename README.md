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

### Growthbook

[Growthbook](http://growthbook.com/) provides an open-source, Bayesian experimentation platform. We use Growthbook at Pipedream and have released the ECS deployment we use as a CDK construct:

```typescript
import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs" 
import { Growthbook } from "@pipedream/cdk-constructs"

export class GrowthbookStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    new Growthbook(this, 'Growthbook', {
      hostedZoneName: "yourdomain.com",
      growthbookHost: "growthbook",
      emailHost: "smtp.sendgrid.com",
      emailPort: "587",
      emailFromAddress: "noreply@yourdomain.com" 
    });
  }
}
```

This stack assumes you have your own hosted zone in Route53 where DNS records can be created, and a MongoDB cluster accessible from the Growthbook ECS instance. [See the Growthbook docs](https://docs.growthbook.io/self-host) for more information.

The stack also pulls secrets from AWS Secrets Manager, and assumes the following secrets have been created prior to creating the stack:

```
prod/mongo/secretMongoURI
prod/mongo/secretJwtSecret
prod/mongo/secretEncryptionKey
prod/email/secretUsername
prod/email/secretPassword
```

## Useful commands

- `npm run build` - Compile Typescript to JS
- `npm test` - Run CDK infra tests
