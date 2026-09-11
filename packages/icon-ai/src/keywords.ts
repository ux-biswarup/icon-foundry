import { defaultRegistry, type PrimitiveRegistry } from "@icon-foundry/icon-primitives";
import type { IconIntent, IntentParser } from "./types.js";

const STYLE_WORDS: Record<string, "outline" | "filled"> = {
  filled: "filled",
  solid: "filled",
  fill: "filled",
  outline: "outline",
  outlined: "outline",
  line: "outline",
  stroke: "outline",
};

const STOP_WORDS = new Set([
  "a", "an", "the", "for", "of", "with", "and", "icon", "icons", "create", "make", "generate",
  "controlled", "control", "controlling", "in", "on", "to", "show", "showing", "style", "please",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));
}

/** Very small stemmer: strips plural "s" and "ing"/"ed" endings. */
function stem(word: string): string[] {
  const out = new Set([word]);
  if (word.endsWith("ies")) out.add(`${word.slice(0, -3)}y`);
  if (word.endsWith("es")) out.add(word.slice(0, -2));
  if (word.endsWith("s")) out.add(word.slice(0, -1));
  if (word.endsWith("ing")) out.add(word.slice(0, -3));
  if (word.endsWith("ed")) out.add(word.slice(0, -2));
  return [...out];
}

export interface KeywordIndex {
  lookup(word: string): string | undefined;
}

export function buildKeywordIndex(registry: PrimitiveRegistry = defaultRegistry): KeywordIndex {
  const map = new Map<string, string>();
  for (const primitive of registry.list()) {
    for (const keyword of [primitive.name, ...primitive.keywords]) {
      if (!map.has(keyword)) map.set(keyword, primitive.name);
    }
  }
  return {
    lookup: (word) => {
      for (const candidate of stem(word)) {
        const hit = map.get(candidate);
        if (hit) return hit;
      }
      return undefined;
    },
  };
}

export interface KeywordParserOptions {
  registry?: PrimitiveRegistry;
}

/**
 * Deterministic keyword matcher. Objects win the subject slot; symbols and
 * shapes become modifiers. Unknown words are ignored.
 */
export function parseIntentKeywords(text: string, options: KeywordParserOptions = {}): IconIntent {
  const registry = options.registry ?? defaultRegistry;
  const index = buildKeywordIndex(registry);

  let style: "outline" | "filled" | undefined;
  const matched: string[] = [];
  for (const token of tokenize(text)) {
    const styleHit = STYLE_WORDS[token];
    if (styleHit) {
      style = styleHit;
      continue;
    }
    const primitive = index.lookup(token);
    if (primitive && !matched.includes(primitive)) matched.push(primitive);
  }

  if (matched.length === 0) {
    throw new Error(`Could not map "${text}" to any primitive. Known primitives: ${registry.names().join(", ")}`);
  }

  const objects = matched.filter((name) => registry.get(name).category === "object");
  const subject = objects[0] ?? matched[0]!;
  const modifiers = matched.filter((name) => name !== subject);

  return { subject, modifiers, text, ...(style && { style }) };
}

export function createKeywordIntentParser(options: KeywordParserOptions = {}): IntentParser {
  return {
    id: "keywords",
    parse: async (text) => parseIntentKeywords(text, options),
  };
}
