import OpenAI from "openai";

import type { OpenAiTokenUsage } from "@/modules/costs/cost.types";
import { OPENAI_REASONING_MODEL } from "@/modules/storyboard/storyboard.constants";

export interface OpenAiPlanningConfig {
  apiKey: string;
  model: string;
  modelLabel: typeof OPENAI_REASONING_MODEL;
}

export interface OpenAiPlanningJsonRequest {
  operation: string;
  prompt: string;
}

export interface OpenAiPlanningJsonResult<T> {
  json: T;
  usage: OpenAiTokenUsage;
}

interface OpenAiPlanningClientOptions {
  apiKey?: string;
  model?: string;
  responsesCreate?: ResponsesCreate;
}

type ResponsesCreate = (input: {
  model: string;
  input: string;
  instructions: string;
  reasoning?: {
    effort: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  };
}) => Promise<unknown>;

export interface OpenAiPlanningClient {
  generateJson<T>(input: OpenAiPlanningJsonRequest): Promise<OpenAiPlanningJsonResult<T>>;
}

export function resolveOpenAiPlanningConfig(
  env: Partial<Record<string, string | undefined>> = process.env,
): OpenAiPlanningConfig {
  const apiKey = env.OPENAI_API_KEY;
  const model = env.OPENAI_PLANNING_MODEL;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for live OpenAI planning.");
  }

  if (!model) {
    throw new Error(
      `OPENAI_PLANNING_MODEL must be set to the exact API model id for ${OPENAI_REASONING_MODEL}. No silent fallback is allowed.`,
    );
  }

  return {
    apiKey,
    model,
    modelLabel: OPENAI_REASONING_MODEL,
  };
}

export function createOpenAiPlanningClient(
  options: OpenAiPlanningClientOptions = {},
): OpenAiPlanningClient {
  const config =
    options.apiKey && options.model
      ? {
          apiKey: options.apiKey,
          model: options.model,
          modelLabel: OPENAI_REASONING_MODEL,
        }
      : resolveOpenAiPlanningConfig();
  const openai = options.responsesCreate ? null : new OpenAI({ apiKey: config.apiKey });
  const responsesCreate =
    options.responsesCreate ??
    ((input) =>
      openai!.responses.create({
        model: input.model,
        instructions: input.instructions,
        input: input.input,
        reasoning: input.reasoning,
      }));

  return {
    async generateJson<T>(
      input: OpenAiPlanningJsonRequest,
    ): Promise<OpenAiPlanningJsonResult<T>> {
      const response = await responsesCreate({
        model: config.model,
        instructions: [
          `You are ${OPENAI_REASONING_MODEL}, the Recipe2Video planning and prompt engine.`,
          "Return strictly valid JSON for the requested operation. Do not include Markdown fences or explanatory prose.",
        ].join(" "),
        input: input.prompt,
        reasoning: { effort: "high" },
      });

      const outputText = getOutputText(response);

      return {
        json: parseJsonObject<T>(outputText, input.operation),
        usage: getTokenUsage(response),
      };
    },
  };
}

export function parseJsonObject<T>(text: string, operation: string): T {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `OpenAI ${operation} returned invalid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`,
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`OpenAI ${operation} must return a JSON object.`);
  }

  return parsed as T;
}

function getOutputText(response: unknown): string {
  if (isRecord(response) && typeof response.output_text === "string") {
    return response.output_text;
  }

  throw new Error("OpenAI response did not include output_text.");
}

function getTokenUsage(response: unknown): OpenAiTokenUsage {
  if (isRecord(response) && isRecord(response.usage)) {
    return {
      inputTokens: numberOrZero(response.usage.input_tokens),
      outputTokens: numberOrZero(response.usage.output_tokens),
    };
  }

  return {
    inputTokens: 0,
    outputTokens: 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" ? value : 0;
}
