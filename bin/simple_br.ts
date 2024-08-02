#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { AwsSolutionsChecks, NagSuppressions } from "cdk-nag";
import { SupportedLanguage, SimpleBrStack } from "../lib/simple_br-stack";

const app = new cdk.App();
const mainStack = new SimpleBrStack(app, "SimpleBrStack", {
  lang: app.node.tryGetContext("lang") as SupportedLanguage | undefined,
});

cdk.Aspects.of(app).add(new AwsSolutionsChecks());
NagSuppressions.addStackSuppressions(mainStack, [
  {
    id: "AwsSolutions-IAM4",
    reason: "Lambda default policy is acceptable for this demo",
  },
  {
    id: "AwsSolutions-DDB3",
    reason: "Point-in-time Recovery not required for this demo",
  },
]);

NagSuppressions.addResourceSuppressionsByPath(
  mainStack,
  "/SimpleBrStack/DocBucket/Resource",
  [
    {
      id: "AwsSolutions-S1",
      reason: "For this demo there's no requirement to log S3 server access",
    },
  ],
);
NagSuppressions.addResourceSuppressionsByPath(
  mainStack,
  "/SimpleBrStack",
  [
    {
      id: "AwsSolutions-IAM5",
      reason: "Policy defined by bedrock construct",
    },
  ],
  true,
);
