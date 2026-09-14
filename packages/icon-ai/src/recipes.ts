import { composeConcept } from "@icon-foundry/icon-composer";
import { resolveTokens, type Box, type IconLanguage, type SizeTokens } from "@icon-foundry/icon-language";
import { defaultRegistry, type PrimitiveRegistry } from "@icon-foundry/icon-primitives";
import type { ConceptComposition, IconSpec } from "@icon-foundry/icon-spec";
import type { IconIntent } from "./types.js";

export interface RecipeOptions {
  /** Override the generated kebab-case name. */
  name?: string;
  /** Optical size to lay out for. Defaults to the language default. */
  canvas?: number;
  registry?: PrimitiveRegistry;
}

/** kebab-case a phrase for use as an icon name. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function snap(n: number, grid: number): number {
  return Math.round(n / grid) * grid;
}

/** The keyline box a primitive should fill when it is the subject. */
export function subjectBox(primitive: string, tokens: SizeTokens, registry: PrimitiveRegistry = defaultRegistry): Box {
  return tokens.optical[registry.get(primitive).opticalShape];
}

/**
 * Turn a parsed intent into an icon.
 *
 * It decides *what the icon is* — a subject, plus up to two modifiers, related
 * as a badge — and then hands the placing to the concept compiler. It used to
 * do the placing itself, with its own copy of the badge rule and its own
 * negative-space search, which meant the studio had two answers to "where does
 * a badge go" and no way to notice when they disagreed. One rule, one place.
 *
 * The spec that comes back stores the composition, so an icon made from a
 * keyword brief follows the keyline sheet exactly like one made by hand.
 */
export function intentToSpec(intent: IconIntent, language: IconLanguage, options: RecipeOptions = {}): IconSpec {
  const tokens = resolveTokens(language, options.canvas);
  const modifiers = intent.modifiers.slice(0, 2);
  // A short brief makes a good name; a sentence does not, so fall back to the
  // parts the icon is actually made of.
  const fromText = slugify(intent.text ?? "");
  const derived = slugify([...modifiers, intent.subject].join("-")) || intent.subject;
  const name = options.name ?? (fromText && fromText.split("-").length <= 4 ? fromText : derived);

  const composition: ConceptComposition = {
    arrangement: modifiers.length === 0 ? "single" : "badge",
    parts: [
      { element: intent.subject, role: "subject", priority: "essential" },
      ...modifiers.map((element) => ({ element, role: "modifier", priority: "essential" as const })),
    ],
  };

  return composeConcept(composition, language, {
    name,
    canvas: tokens.canvas,
    ...(intent.style && { style: intent.style }),
    ...(options.registry && { registry: options.registry }),
    meta: {
      intent: { subject: intent.subject, modifiers: intent.modifiers, ...(intent.text && { text: intent.text }) },
      recipe: modifiers.length === 0 ? "single" : "badge",
    },
  });
}
