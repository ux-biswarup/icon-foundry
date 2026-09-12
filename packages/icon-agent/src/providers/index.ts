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

/** Shared settings: a key when there is one, and a base URL when the user
 * points us at a proxy or gateway rather than the vendor's own endpoint. */
function settings(config: ModelConfig): { apiKey?: string; baseURL?: string } {
  return {
    ...(config.apiKey && { apiKey: config.apiKey }),
    ...(config.baseURL && { baseURL: config.baseURL }),
  };
}

export function createModel(config: ModelConfig): AgentModel {
  const id = `${config.provider}/${config.model}`;
  switch (config.provider) {
    case "anthropic":
      return fromLanguageModel(id, createAnthropic(settings(config))(config.model));
    case "openai":
      return fromLanguageModel(id, createOpenAI(settings(config))(config.model));
    case "google":
      return fromLanguageModel(id, createGoogle(settings(config))(config.model));
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

const KEY_VARS: Record<Exclude<ProviderKind, "openai-compatible">, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

/** Which vendor a key belongs to, by its prefix. Used only when nothing else says. */
function providerFromKey(key: string): ProviderKind | undefined {
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("AIza")) return "google";
  if (key.startsWith("sk-")) return "openai";
  return undefined;
}

/**
 * Read a model configuration from environment variables.
 *
 *   ICON_FOUNDRY_PROVIDER   anthropic | openai | google | openai-compatible
 *   ICON_FOUNDRY_MODEL      model id
 *   ICON_FOUNDRY_API_KEY    or the provider's usual variable
 *   ICON_FOUNDRY_BASE_URL   a proxy, a gateway, or a local endpoint
 *   ICON_FOUNDRY_NAME       display name for an openai-compatible endpoint
 *
 * The provider is inferred when it is not stated: from a vendor key variable,
 * from the shape of a generic key, or from a base URL on its own. Pasting one
 * key should be enough — asking for a provider as well is a trap, because a
 * key that is present and unused looks exactly like a key that is working.
 *
 * Returns undefined only when nothing at all is configured, which means the
 * deterministic planner runs and no model is called.
 */
export function modelConfigFromEnv(env: Record<string, string | undefined>): ModelConfig | undefined {
  const stated = env.ICON_FOUNDRY_PROVIDER;
  if (stated !== undefined && !KINDS.includes(stated as ProviderKind)) {
    throw new Error(`ICON_FOUNDRY_PROVIDER must be one of ${KINDS.join(", ")} (got "${stated}")`);
  }
  const vendorKeyVar = (Object.keys(KEY_VARS) as Array<keyof typeof KEY_VARS>).find((k) => env[KEY_VARS[k]]);
  const genericKey = env.ICON_FOUNDRY_API_KEY;
  const baseURL = env.ICON_FOUNDRY_BASE_URL;

  const provider =
    (stated as ProviderKind | undefined) ??
    vendorKeyVar ??
    (genericKey ? providerFromKey(genericKey) : undefined) ??
    (baseURL ? ("openai-compatible" as const) : undefined);

  if (!provider) {
    // Nothing configured at all is a valid state. A key we cannot place is not:
    // silently ignoring it is how a key sits unused and nobody notices.
    if (genericKey) {
      throw new Error(
        "ICON_FOUNDRY_API_KEY is set but the provider could not be determined from it. " +
          `Set ICON_FOUNDRY_PROVIDER to one of ${KINDS.join(", ")}.`,
      );
    }
    return undefined;
  }

  const apiKey = genericKey ?? (provider === "openai-compatible" ? undefined : env[KEY_VARS[provider]]);
  const model = env.ICON_FOUNDRY_MODEL ?? DEFAULT_MODELS[provider];
  if (!model) {
    throw new Error(`ICON_FOUNDRY_MODEL is required for provider "${provider}" (no default is assumed for it)`);
  }
  if (provider === "openai-compatible" && !baseURL) {
    throw new Error('Provider "openai-compatible" needs ICON_FOUNDRY_BASE_URL, for example http://localhost:11434/v1');
  }

  return {
    provider,
    model,
    ...(apiKey && { apiKey }),
    ...(baseURL && { baseURL }),
    ...(env.ICON_FOUNDRY_NAME && { name: env.ICON_FOUNDRY_NAME }),
  };
}
