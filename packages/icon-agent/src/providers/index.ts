import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, stepCountIs, tool, type LanguageModel, type ToolSet } from "ai";
import type { AgentModel, AgentTool } from "../types.js";

/**
 * Pluggable model providers, implemented with the Vercel AI SDK behind the
 * AgentModel contract. Keys and provider choice are user settings and
 * environment, never library data.
 */

export type ProviderKind = "anthropic" | "openai" | "google" | "openai-compatible";

export interface ModelConfig {
  provider: ProviderKind;
  /** Model id as the provider names it. */
  model: string;
  apiKey?: string;
  /** Required for openai-compatible (Ollama, LM Studio, vLLM, OpenRouter, Groq, Azure…). */
  baseURL?: string;
  /** Display name for openai-compatible endpoints. */
  name?: string;
}

export const DEFAULT_MODELS: Partial<Record<ProviderKind, string>> = {
  anthropic: "claude-sonnet-5",
};

/** Adapt any AI SDK LanguageModel to the AgentModel contract. */
export function fromLanguageModel(id: string, model: LanguageModel): AgentModel {
  return {
    id,
    async run({ system, prompt, tools, maxSteps }) {
      const toolSet: ToolSet = Object.fromEntries(
        tools.map((t: AgentTool) => [
          t.name,
          tool({
            description: t.description,
            inputSchema: t.inputSchema,
            execute: async (input: unknown) => t.execute(input),
          }),
        ]),
      );
      const result = await generateText({ model, system, prompt, tools: toolSet, stopWhen: stepCountIs(maxSteps) });
      return { text: result.text, steps: result.steps.length };
    },
  };
}

export function createModel(config: ModelConfig): AgentModel {
  const id = `${config.provider}/${config.model}`;
  switch (config.provider) {
    case "anthropic":
      return fromLanguageModel(id, createAnthropic({ ...(config.apiKey && { apiKey: config.apiKey }) })(config.model));
    case "openai":
      return fromLanguageModel(id, createOpenAI({ ...(config.apiKey && { apiKey: config.apiKey }) })(config.model));
    case "google":
      return fromLanguageModel(id, createGoogle({ ...(config.apiKey && { apiKey: config.apiKey }) })(config.model));
    case "openai-compatible": {
      if (!config.baseURL) throw new Error("openai-compatible provider needs a baseURL");
      const provider = createOpenAICompatible({
        name: config.name ?? "openai-compatible",
        baseURL: config.baseURL,
        ...(config.apiKey && { apiKey: config.apiKey }),
      });
      return fromLanguageModel(id, provider(config.model));
    }
  }
}

const KINDS: readonly ProviderKind[] = ["anthropic", "openai", "google", "openai-compatible"];

/**
 * Read a model configuration from environment variables.
 *
 *   ICON_FOUNDRY_PROVIDER   anthropic | openai | google | openai-compatible
 *   ICON_FOUNDRY_MODEL      model id (defaults exist for anthropic only)
 *   ICON_FOUNDRY_API_KEY    or the provider's usual variable
 *   ICON_FOUNDRY_BASE_URL   for openai-compatible endpoints
 *   ICON_FOUNDRY_NAME       display name for openai-compatible endpoints
 *
 * Returns undefined when no provider is configured, which means "planner only".
 */
export function modelConfigFromEnv(env: Record<string, string | undefined>): ModelConfig | undefined {
  const provider = env.ICON_FOUNDRY_PROVIDER as ProviderKind | undefined;
  if (!provider) return undefined;
  if (!KINDS.includes(provider)) throw new Error(`ICON_FOUNDRY_PROVIDER must be one of ${KINDS.join(", ")}`);
  const model = env.ICON_FOUNDRY_MODEL ?? DEFAULT_MODELS[provider];
  if (!model) throw new Error(`ICON_FOUNDRY_MODEL is required for provider "${provider}"`);
  const fallbackKey = {
    anthropic: env.ANTHROPIC_API_KEY,
    openai: env.OPENAI_API_KEY,
    google: env.GOOGLE_GENERATIVE_AI_API_KEY,
    "openai-compatible": undefined,
  }[provider];
  const apiKey = env.ICON_FOUNDRY_API_KEY ?? fallbackKey;
  return {
    provider,
    model,
    ...(apiKey && { apiKey }),
    ...(env.ICON_FOUNDRY_BASE_URL && { baseURL: env.ICON_FOUNDRY_BASE_URL }),
    ...(env.ICON_FOUNDRY_NAME && { name: env.ICON_FOUNDRY_NAME }),
  };
}
