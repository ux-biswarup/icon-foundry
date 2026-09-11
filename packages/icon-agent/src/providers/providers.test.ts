import { describe, expect, it } from "vitest";
import { createModel, modelConfigFromEnv } from "./index.js";

describe("modelConfigFromEnv", () => {
  it("is undefined when no provider is set (planner only)", () => {
    expect(modelConfigFromEnv({})).toBeUndefined();
  });

  it("reads provider, model and keys, with the Anthropic default model", () => {
    expect(modelConfigFromEnv({ ICON_FOUNDRY_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" })).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-5",
      apiKey: "k",
    });
    expect(
      modelConfigFromEnv({
        ICON_FOUNDRY_PROVIDER: "openai-compatible",
        ICON_FOUNDRY_MODEL: "llama3",
        ICON_FOUNDRY_BASE_URL: "http://localhost:11434/v1",
        ICON_FOUNDRY_NAME: "ollama",
      }),
    ).toEqual({ provider: "openai-compatible", model: "llama3", baseURL: "http://localhost:11434/v1", name: "ollama" });
  });

  it("rejects unknown providers and missing models", () => {
    expect(() => modelConfigFromEnv({ ICON_FOUNDRY_PROVIDER: "mistral" })).toThrow(/must be one of/);
    expect(() => modelConfigFromEnv({ ICON_FOUNDRY_PROVIDER: "openai" })).toThrow(/ICON_FOUNDRY_MODEL is required/);
  });
});

describe("createModel", () => {
  it("builds an AgentModel for every provider kind without network access", () => {
    expect(createModel({ provider: "anthropic", model: "claude-sonnet-5", apiKey: "k" }).id).toBe("anthropic/claude-sonnet-5");
    expect(createModel({ provider: "openai", model: "gpt-x", apiKey: "k" }).id).toBe("openai/gpt-x");
    expect(createModel({ provider: "google", model: "gemini-x", apiKey: "k" }).id).toBe("google/gemini-x");
    expect(createModel({ provider: "openai-compatible", model: "llama3", baseURL: "http://localhost:11434/v1" }).id).toBe(
      "openai-compatible/llama3",
    );
    expect(() => createModel({ provider: "openai-compatible", model: "x" })).toThrow(/baseURL/);
  });
});
