import { resolveTokens, type Box, type IconLanguage, type SizeTokens } from "@icon-foundry/icon-language";
import { defaultRegistry, type PrimitiveRegistry } from "@icon-foundry/icon-primitives";
import type { IconElement, IconSpec, PrimitiveElement } from "@icon-foundry/icon-spec";
import { negativeSpaceRule, validateIconSpec } from "@icon-foundry/icon-validator";
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

function baseSpec(intent: IconIntent, language: IconLanguage, tokens: SizeTokens, elements: IconElement[], recipe: string, name: string): IconSpec {
  return {
    name,
    language: language.id,
    canvas: tokens.canvas,
    ...(intent.style && { style: intent.style }),
    meta: {
      intent: { subject: intent.subject, modifiers: intent.modifiers, ...(intent.text && { text: intent.text }) },
      recipe,
    },
    elements,
  };
}

/**
 * Deterministic layout recipes.
 *
 * - no modifier: the subject fills the keyline box of its optical shape
 * - one modifier: subject shifts down-left, badge sits top-right
 * - two modifiers: subject centred at the bottom, badges in both top corners
 *
 * With badges, the subject is shrunk in grid steps until the language's
 * negative-space rule is satisfied, so generated icons never merge into a
 * blur at small sizes. Designers tune the resulting IconSpec by hand.
 */
export function intentToSpec(intent: IconIntent, language: IconLanguage, options: RecipeOptions = {}): IconSpec {
  const registry = options.registry ?? defaultRegistry;
  const tokens = resolveTokens(language, options.canvas);
  const { canvas: C, safeArea: S, grid: g } = tokens;
  const content = C - 2 * S;
  const modifiers = intent.modifiers.slice(0, 2);
  const keyline = subjectBox(intent.subject, tokens, registry);
  const name = options.name ?? (slugify(intent.text ?? [...modifiers, intent.subject].join("-")) || intent.subject);

  if (modifiers.length === 0) {
    return baseSpec(intent, language, tokens, [{ primitive: intent.subject, ...keyline }], "single", name);
  }

  const badge = Math.max(g, snap(content * 0.35, g));
  const badges: PrimitiveElement[] = [{ primitive: modifiers[0]!, x: C - S - badge, y: S, width: badge, height: badge }];
  if (modifiers[1]) badges.push({ primitive: modifiers[1], x: S, y: S, width: badge, height: badge });
  const two = badges.length === 2;

  const candidate = (inset: number): IconSpec => {
    const subject: PrimitiveElement = two
      ? { primitive: intent.subject, x: keyline.x, y: keyline.y + inset, width: keyline.width, height: keyline.height - inset, align: { x: "center", y: "end" } }
      : { primitive: intent.subject, x: keyline.x, y: keyline.y + inset, width: keyline.width - inset, height: keyline.height - inset, align: { x: "start", y: "end" } };
    return baseSpec(intent, language, tokens, [subject, ...badges], "badge", name);
  };

  const minInset = snap(content * 0.15, g);
  const maxInset = snap(content * 0.5, g);
  let last = candidate(minInset);
  for (let inset = minInset; inset <= maxInset; inset += g) {
    last = candidate(inset);
    const check = validateIconSpec(last, language, { rules: [negativeSpaceRule], registry });
    if (check.issues.length === 0) return last;
  }
  return last;
}
