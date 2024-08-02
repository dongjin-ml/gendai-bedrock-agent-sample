import { PromptTemplate } from "@langchain/core/prompts";
import { CfnAgent } from "aws-cdk-lib/aws-bedrock";
import * as fs from "fs";
import * as yaml from "js-yaml";

export function readYaml(filePath: string) {
  /**
   * Reads a YAML file and returns the deserialized object.
   * @param {string} filePath - The path to the YAML file.
   * @returns {any} The deserialized object from the YAML file.
   */
  if (!fs.existsSync(filePath)) {
    console.warn(`Warning: File ${filePath} does not exist.`);
    return undefined;
  }
  const fileContents = fs.readFileSync(filePath, "utf8");
  return yaml.load(fileContents);
}

interface IDeserializedPrompt {
  /**
   * Interface representing a deserialized prompt object.
   * @interface
   * @property {string} name - The name of the prompt.
   * @property {string} [template] - The template string for the prompt in f-format.
   * @property {string} [description] - A description of the prompt.
   * @property {string[]} [input_variables] - An array of input variable names for the prompt.
   */
  name: string;
  template?: string;
  description?: string;
  input_variables?: string[];
}

interface IPrompt {
  /**
   * Interface representing a prompt object.
   * @interface
   * @property {string} name - The name of the prompt.
   * @property {PromptTemplate} [promptTemplate] - The prompt template.
   * @property {string} [description] - A description of the prompt.
   * @property {string[]} [input_variables] - An array of input variable names for the prompt.
   */
  name: string;
  promptTemplate?: PromptTemplate;
  description?: string;
  input_variables?: string[];
}

export function loadPrompt(filePath: string): IPrompt {
  /**
   * Loads a prompt from a YAML file.
   * @param {string} filePath - The path to the YAML file.
   * @returns {IPrompt} The loaded prompt object.
   */
  const data = readYaml(filePath) as IDeserializedPrompt;
  const prompt = {
    name: data.name,
    description: data.description,
  } as IPrompt;

  if (data.template) {
    prompt.promptTemplate = new PromptTemplate({
      template: data.template,
      inputVariables: data.input_variables || [],
    });
  }

  return prompt;
}

export function loadFunctionsSchema(
  filePath: string,
): CfnAgent.FunctionSchemaProperty {
  /**
   * Loads a function schema from a YAML file.
   * @param {string} filePath - The path to the YAML file.
   * @returns {CfnAgent.FunctionSchemaProperty} The loaded function schema.
   */
  const fileContents = fs.readFileSync(filePath, "utf8");
  const data = yaml.load(fileContents);

  return data as CfnAgent.FunctionSchemaProperty;
}
