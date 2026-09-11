import type { IconLanguage } from "@icon-foundry/icon-language";
import type { IconElement, IconSpec } from "@icon-foundry/icon-spec";
import type { IconIntent } from "./types.js";

export interface RecipeOptions {
  /** Override the generated kebab-case name. */
  name?: string;
}

/** kebab-case a phrase for use as an icon name. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function round(n: number, grid: number): number {
  return Math.round(n / grid) * grid;
}

/**
 * Deterministic layout recipes. They are intentionally simple and produce
 * on-grid boxes inside the safe area; designers tune the resulting IconSpec.
 *
 * - no modifier: subject fills the safe area
 * - one modifier: subject shifts down-left, badge sits top-right
 * - two modifiers: second badge sits top-left
 */
export function intentToSpec(intent: IconIntent, language: IconLanguage, options: RecipeOptions = {}): IconSpec {
  const C = language.canvas;
  const S = language.safeArea;
  const g = language.grid;
  const content = C - 2 * S;

  const elements: IconElement[] = [];
  const modifiers = intent.modifiers.slice(0, 2);

  if (modifiers.length === 0) {
    elements.push({ primitive: intent.subject, x: S, y: S, width: content, height: content });
  } else {
    const badge = round(content * 0.35, g);
    const inset = round(content * 0.2, g);
    elements.push({
      primitive: intent.subject,
      x: S,
      y: S + inset,
      width: content - inset,
      height: content - inset,
      align: { x: "start", y: "end" },
    });
    elements.push({ primitive: modifiers[0]!, x: C - S - badge, y: S, width: badge, height: badge });
    if (modifiers[1]) {
      elements.push({ primitive: modifiers[1], x: S, y: S, width: badge, height: badge });
    }
  }

  const name = options.name ?? (slugify(intent.text ?? [...modifiers, intent.subject].join("-")) || intent.subject);

  return {
    name,
    language: language.id,
    canvas: C,
    ...(intent.style && { style: intent.style }),
    meta: {
      intent: { subject: intent.subject, modifiers: intent.modifiers, ...(intent.text && { text: intent.text }) },
      recipe: modifiers.length === 0 ? "single" : "badge",
    },
    elements,
  };
}
