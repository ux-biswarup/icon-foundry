import { describe, expect, it } from "vitest";
import { createModel, modelConfigFromEnv } from "./index.js";

describe("modelConfigFromEnv", () => {
  it("is undefined only when nothing at all is configured", () => {
    expect(modelConfigFromEnv({})).toBeUndefined();
  });

  it("infers the provider from a vendor key variable, so pasting one key is enough", () => {
    expect(modelConfigFromEnv({ ANTHROPIC_API_KEY: "k" })).toMatchObject({ provider: "anthropic", apiKey: "k" });
    expect(modelConfigFromEnv({ OPENAI_API_KEY: "k", ICON_FOUNDRY_MODEL: "gpt-x" })).toMatchObject({ provider: "openai" });
    expect(modelConfigFromEnv({ GOOGLE_GENERATIVE_AI_API_KEY: "k", ICON_FOUNDRY_MODEL: "gem" })).toMatchObject({ provider: "google" });
  });

  it("infers the provider from the shape of a generic key", () => {
    expect(modelConfigFromEnv({ ICON_FOUNDRY_API_KEY: "sk-ant-abc" })).toMatchObject({ provider: "anthropic" });
    expect(modelConfigFromEnv({ ICON_FOUNDRY_API_KEY: "sk-proj-abc", ICON_FOUNDRY_MODEL: "gpt-x" })).toMatchObject({ provider: "openai" });
    expect(modelConfigFromEnv({ ICON_FOUNDRY_API_KEY: "AIzaXYZ", ICON_FOUNDRY_MODEL: "gem" })).toMatchObject({ provider: "google" });
  });

  it("treats a base URL on its own as an openai-compatible endpoint", () => {
    expect(modelConfigFromEnv({ ICON_FOUNDRY_BASE_URL: "http://localhost:11434/v1", ICON_FOUNDRY_MODEL: "llama3" })).toMatchObject({
      provider: "openai-compatible",
      baseURL: "http://localhost:11434/v1",
    });
  });

  it("refuses to silently ignore a key it cannot place", () => {
    expect(() => modelConfigFromEnv({ ICON_FOUNDRY_API_KEY: "mystery-token" })).toThrow(/could not be determined/);
  });

  it("passes a base URL through for the vendor providers too, for proxies and gateways", () => {
    expect(modelConfigFromEnv({ ANTHROPIC_API_KEY: "k", ICON_FOUNDRY_BASE_URL: "https://proxy.acme.test" })).toMatchObject({
      provider: "anthropic",
      baseURL: "https://proxy.acme.test",
    });
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

  it("rejects unknown providers, missing models, and a compatible endpoint with no URL", () => {
    expect(() => modelConfigFromEnv({ ICON_FOUNDRY_PROVIDER: "mistral" })).toThrow(/must be one of/);
    expect(() => modelConfigFromEnv({ ICON_FOUNDRY_PROVIDER: "openai" })).toThrow(/ICON_FOUNDRY_MODEL is required/);
    expect(() => modelConfigFromEnv({ ICON_FOUNDRY_PROVIDER: "openai-compatible", ICON_FOUNDRY_MODEL: "m" })).toThrow(
      /needs ICON_FOUNDRY_BASE_URL/,
    );
  });

  it("an explicit provider still wins over inference", () => {
    expect(
      modelConfigFromEnv({ ICON_FOUNDRY_PROVIDER: "openai-compatible", ICON_FOUNDRY_MODEL: "llama3", ICON_FOUNDRY_BASE_URL: "http://x/v1", ANTHROPIC_API_KEY: "k" }),
    ).toMatchObject({ provider: "openai-compatible" });
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
