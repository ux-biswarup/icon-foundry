import { defaultRegistry, type PrimitiveRegistry } from "@icon-foundry/icon-primitives";
import type { IconIntent, IntentParser } from "./types.js";

/** A single text completion. Bring your own provider: Anthropic, OpenAI, a
 * local model, or a stub. Icon Foundry never imports a vendor SDK. */
export type CompleteFn = (prompt: string) => Promise<string>;

export interface LlmIntentParserOptions {
  complete: CompleteFn;
  registry?: PrimitiveRegistry;
  /** Used when the model output cannot be parsed or names unknown primitives. */
  fallback?: IntentParser;
}

export function buildIntentPrompt(text: string, registry: PrimitiveRegistry = defaultRegistry): string {
  const catalogue = registry
    .list()
    .map((p) => `- ${p.name} (${p.category}): ${p.description} Keywords: ${p.keywords.join(", ")}`)
    .join("\n");
  return [
    "You map an icon request to a structured intent using ONLY the primitives below.",
    "Return strict JSON with keys: subject (one primitive name), modifiers (array of up to two primitive names), style (\"outline\" | \"filled\" | null).",
    "Prefer an object as the subject. Do not invent primitives. Do not output anything but JSON.",
    "",
    "Primitives:",
    catalogue,
    "",
    `Request: ${JSON.stringify(text)}`,
  ].join("\n");
}

/** Validate an untrusted JSON value into an IconIntent. */
export function parseIconIntent(value: unknown, registry: PrimitiveRegistry = defaultRegistry): IconIntent {
  if (typeof value !== "object" || value === null) throw new Error("intent must be an object");
  const v = value as Record<string, unknown>;
  if (typeof v.subject !== "string" || !registry.has(v.subject)) {
    throw new Error(`intent.subject must be a known primitive, got ${JSON.stringify(v.subject)}`);
  }
  const modifiersRaw = v.modifiers ?? [];
  if (!Array.isArray(modifiersRaw)) throw new Error("intent.modifiers must be an array");
  const modifiers = modifiersRaw.map((m) => {
    if (typeof m !== "string" || !registry.has(m)) throw new Error(`unknown modifier ${JSON.stringify(m)}`);
    return m;
  });
  const style = v.style === "outline" || v.style === "filled" ? v.style : undefined;
  return { subject: v.subject, modifiers, ...(style && { style }) };
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object in model output");
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Optional LLM adapter. The model only classifies intent; everything after
 * that is deterministic and validated. Falls back when the output is unusable.
 */
export function createLlmIntentParser(options: LlmIntentParserOptions): IntentParser {
  const registry = options.registry ?? defaultRegistry;
  return {
    id: "llm",
    parse: async (text) => {
      try {
        const raw = await options.complete(buildIntentPrompt(text, registry));
        return { ...parseIconIntent(extractJson(raw), registry), text };
      } catch (error) {
        if (options.fallback) return options.fallback.parse(text);
        throw error;
      }
    },
  };
}
