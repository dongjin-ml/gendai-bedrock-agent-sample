import { PythonFunction } from "@aws-cdk/aws-lambda-python-alpha";
import { bedrock } from "@cdklabs/generative-ai-cdk-constructs";
import { Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import * as path from "path";
import { loadFunctionsSchema, loadPrompt, readYaml } from "./loadPrompt";

export type SupportedLanguage = "en" | "ko" | "jp";

export interface ISimpleBrStackProps extends StackProps {
  /**
   * Language for Bedrock prompt templates
   *
   * @default "en"
   */
  lang?: SupportedLanguage;
}

export class SimpleBrStack extends Stack {
  constructor(scope: Construct, id: string, props?: ISimpleBrStackProps) {
    super(scope, id);

    const lang = props?.lang || "en";
    const localizationPath = "../prompts/" + lang;

    // Dynamo DB table to store information about customer reservations
    const ddbTable = new dynamodb.Table(this, "metadata", {
      partitionKey: { name: "booking_id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Amazon Bedrock agent powering an assistant that allows customers to create, delete or get reservation information
    const agentPrompt = loadPrompt(
      path.join(__dirname, localizationPath, "booking_agent.yaml"),
    );

    // check for post-processing prompts, here used to provide localization
    let promptOverrideConfiguration = undefined;
    const postProcessingPromptRaw = readYaml(
      path.join(
        __dirname,
        localizationPath,
        "booking_agent-postprocessing.yaml",
      ),
    );

    if (postProcessingPromptRaw) {
      promptOverrideConfiguration = {
        promptConfigurations: [
          {
            promptType: bedrock.PromptType.POST_PROCESSING,
            promptState: bedrock.PromptState.ENABLED,
            promptCreationMode: bedrock.PromptCreationMode.OVERRIDDEN,
            inferenceConfiguration: {
              temperature: 0.0,
              topP: 1,
              topK: 250,
              maximumLength: 2048,
              stopSequences: ["/n/nHuman"],
            },
            basePromptTemplate: JSON.stringify(
              postProcessingPromptRaw,
              null,
              4,
            ),
          },
        ],
      };
    }
    const agent = new bedrock.Agent(this, "BookingManagementAgent", {
      foundationModel:
        bedrock.BedrockFoundationModel.ANTHROPIC_CLAUDE_HAIKU_V1_0, //TODO: add model selection to prompt template file
      instruction: agentPrompt.promptTemplate?.template as string,
      name: agentPrompt.name,
      description: agentPrompt.description,
      idleSessionTTL: Duration.seconds(1800),
      promptOverrideConfiguration: promptOverrideConfiguration,
    });

    // lambda function that executes the actions for our agent. This lambda function will have 3 actions:
    // - get_booking_details(booking_id): returns the details of a booking based on the booking id
    // - create_booking(date, name, hour, num_guests): creates a new booking for the restaurant
    // - delete_booking(booking_id): deletes an existent booking based on the booking id

    const actionGroupFunction = new PythonFunction(
      this,
      "BookingManagementFunction",
      {
        runtime: lambda.Runtime.PYTHON_3_12,
        entry: path.join(__dirname, "../functions/booking-agent-kb"),
        environment: {
          DDB_TABLE_NAME: ddbTable.tableName,
        },
      },
    );

    // grant to lambda function write permission on DYnamo DB table
    ddbTable.grantReadWriteData(actionGroupFunction);

    // The action group will allow the agent to execute the booking tasks
    const actionGroupPrompt = loadPrompt(
      path.join(__dirname, localizationPath, "booking_agent_action_group.yaml"),
    );

    const actionGroup = new bedrock.AgentActionGroup(
      this,
      "BookingActionGroup",
      {
        actionGroupName: actionGroupPrompt.name,
        description: actionGroupPrompt.description,
        actionGroupExecutor: {
          lambda: actionGroupFunction,
        },
        actionGroupState: "ENABLED",
        functionSchema: loadFunctionsSchema(
          path.join(__dirname, "../schemas/restaurant_function_schema.yaml"),
        ),
      },
    );
    agent.addActionGroup(actionGroup);

    // Knowledge Base to allow customers to also ask questions about the restaurant menus
    const kbPrompt = loadPrompt(
      path.join(__dirname, localizationPath, "menu_kb_instructions.yaml"),
    );

    const kb = new bedrock.KnowledgeBase(this, "KnowledgeBase", {
      embeddingsModel: bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V2_1024,
      description: kbPrompt.description,
    });

    const docBucket = new Bucket(this, "DocBucket", {
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    new bedrock.S3DataSource(this, "DataSource", {
      bucket: docBucket,
      knowledgeBase: kb,
      dataSourceName: agent.name + "-kb-docs",
      chunkingStrategy: bedrock.ChunkingStrategy.FIXED_SIZE,
      maxTokens: 512,
      overlapPercentage: 20,
    });

    // Necessary to account for LangChain PromptTemplate async nature
    const kbInstruction = kbPrompt.promptTemplate?.format({ kb_name: kb.name });
    if (!kbInstruction) {
      throw new Error("Failed to format the KB instruction prompt");
    }
    kbInstruction
      .then((value) => {
        (kb.instruction as any) = value;
        agent.addKnowledgeBase(kb);
      })
      .catch((err) => {
        console.error(err);
      });
  }
}
