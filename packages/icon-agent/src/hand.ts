import {
  CONSTRUCTION_TRAITS,
  DEFAULT_CONSTRUCTION,
  TRAIT_CONSUMERS,
  type Construction,
  type ConstructionTrait,
  type IconLanguage,
} from "@icon-foundry/icon-language";
import type { PrimitiveRegistry } from "@icon-foundry/icon-primitives";
import { defaultRegistry } from "@icon-foundry/icon-primitives";
import { z } from "zod";
import type { AgentModel, AgentTool } from "./types.js";

/**
 * Moving construction traits from words.
 *
 * The smallest useful thing a model can do here, and deliberately the last
 * thing built. A chat panel over a property system that does not exist has
 * nothing to talk about and has to invent its own vocabulary, which is how you
 * end up with two models of the same thing. Now that the traits are named,
 * typed and bounded, this is four tools over values that already exist.
 *
 * The model never touches geometry. It reads what the traits are, proposes new
 * values inside their declared ranges, and every proposal lands on a canvas a
 * person is already looking at, with the previous values one undo away. That is
 * the product's own division of labour applied to its own editor: AI
 * understands the request, the language owns the appearance, the compiler owns
 * the geometry.
 */

export interface TraitRange {
  trait: ConstructionTrait;
  kind: "number" | "choice";
  current: number | string;
  /** Numeric traits: the inclusive bounds. */
  min?: number;
  max?: number;
  /** Choice traits: everything allowed. */
  options?: readonly string[];
  /** Primitives that read it, so a proposal can say what it will move. */
  consumers: string[];
  description: string;
}

const CHOICES: Partial<Record<ConstructionTrait, readonly string[]>> = {
  aperture: ["mixed", "line", "outline", "notch"],
  slope: ["mixed", "shallow", "iso", "45"],
};

const BOUNDS: Partial<Record<ConstructionTrait, [number, number]>> = {
  interiorRadius: [0, 1],
  grade: [-1, 1],
  inset: [0.2, 3],
  accentSize: [0.3, 2.5],
};

const DESCRIPTIONS: Record<ConstructionTrait, string> = {
  interiorRadius: "How much of the exterior corner radius a corner inside the silhouette takes. 0 is square, 1 follows the outline.",
  grade: "Thinning applied only on a dark ground, as a share of stroke width. Negative thins.",
  aperture: "How an opening is drawn. 'mixed' means each part keeps the answer it was drawn with.",
  inset: "Multiplier on how far interior detail sits from the contour it is inside. 1 is as drawn.",
  accentSize: "Multiplier on the signature round part: a head, a wheel, the dot of a pin. 1 is as drawn.",
  slope: "The pitch of a sloping or receding plane. A value here can break a metaphor.",
};

export function traitRanges(language: IconLanguage, registry: PrimitiveRegistry = defaultRegistry): TraitRange[] {
  return CONSTRUCTION_TRAITS.map((trait) => {
    const options = CHOICES[trait];
    const bounds = BOUNDS[trait];
    return {
      trait,
      kind: options ? ("choice" as const) : ("number" as const),
      current: language.construction[trait],
      ...(bounds && { min: bounds[0], max: bounds[1] }),
      ...(options && { options }),
      consumers: TRAIT_CONSUMERS[trait] === "renderer" ? [] : registry.consumersOf(trait),
      description: DESCRIPTIONS[trait],
    };
  });
}

/** A value the model asked for, already checked against the trait's own range. */
export interface TraitChange {
  trait: ConstructionTrait;
  from: number | string;
  to: number | string;
  /** Primitives this will redraw. Empty for a trait the renderer reads. */
  moves: string[];
}

export interface HandResult {
  /** Construction to apply, or the original when nothing was proposed. */
  construction: Construction;
  changes: TraitChange[];
  /** What the model said, or why nothing happened. */
  message: string;
  /** Values the model asked for that no trait could accept. */
  rejected: string[];
}

export interface HandOptions {
  request: string;
  language: IconLanguage;
  model?: AgentModel;
  registry?: PrimitiveRegistry;
  maxSteps?: number;
}

function clampNumber(value: unknown, range: TraitRange): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(range.max ?? n, Math.max(range.min ?? n, n));
}

/**
 * Ask for a change to how parts are built, in words.
 *
 * With no model this still answers, because the useful half is the reading: it
 * reports what the traits are, what they are set to, and what each one reaches.
 * A studio with no key configured should not lose the panel, it should lose the
 * suggestions.
 */
export async function adjustHand(options: HandOptions): Promise<HandResult> {
  const { request, language, model } = options;
  const registry = options.registry ?? defaultRegistry;
  const ranges = traitRanges(language, registry);
  const byTrait = new Map(ranges.map((r) => [r.trait as string, r]));

  const proposed = new Map<ConstructionTrait, number | string>();
  const rejected: string[] = [];

  const tools: AgentTool[] = [
    {
      name: "list_traits",
      description:
        "Every construction trait this language has: its current value, the range or options it accepts, and which parts read it.",
      inputSchema: z.object({}),
      execute: () => ({ traits: ranges }),
    },
    {
      name: "set_trait",
      description:
        "Propose a new value for one trait. Rejected if the value is outside the trait's range. Nothing is saved: a person reviews every proposal on the canvas.",
      inputSchema: z.object({
        trait: z.enum(CONSTRUCTION_TRAITS),
        value: z.union([z.number(), z.string()]),
      }),
      execute: (input) => {
        const { trait, value } = input as { trait: string; value: unknown };
        const range = byTrait.get(trait);
        if (!range) {
          rejected.push(`${trait}: not a trait of this language`);
          return { ok: false, reason: `no trait named "${trait}"` };
        }
        if (range.kind === "choice") {
          const v = String(value);
          if (!range.options!.includes(v)) {
            rejected.push(`${trait}=${v}: not one of ${range.options!.join(", ")}`);
            return { ok: false, reason: `${trait} accepts ${range.options!.join(", ")}` };
          }
          proposed.set(range.trait, v);
          return { ok: true, trait, value: v, moves: range.consumers };
        }
        const n = clampNumber(value, range);
        if (n === undefined) {
          rejected.push(`${trait}=${String(value)}: not a number`);
          return { ok: false, reason: `${trait} takes a number` };
        }
        proposed.set(range.trait, n);
        return { ok: true, trait, value: n, moves: range.consumers, clamped: n !== Number(value) };
      },
    },
    {
      name: "explain_trait",
      description: "What one trait means and which parts it reaches.",
      inputSchema: z.object({ trait: z.enum(CONSTRUCTION_TRAITS) }),
      execute: (input) => byTrait.get(String((input as { trait: string }).trait)) ?? { error: "unknown trait" },
    },
    {
      name: "note_to_designer",
      description: "Say something you cannot do with a trait, instead of forcing a value that does not mean what was asked.",
      inputSchema: z.object({ note: z.string() }),
      execute: (input) => ({ noted: String((input as { note: string }).note) }),
    },
  ];

  if (!model) {
    return {
      construction: language.construction,
      changes: [],
      message:
        "No model is configured, so nothing was proposed. The traits and what each one reaches are listed beside this panel, and every one can be set by hand.",
      rejected: [],
    };
  }

  const system = [
    `You adjust how the icon set "${language.name}" builds its parts.`,
    "",
    "You may only move the construction traits listed by list_traits, inside the ranges they declare.",
    "You never draw geometry and you never save anything: a person reviews every value you propose.",
    "",
    "Two rules that matter more than pleasing the request:",
    "- A trait moves every part that declares it. Say which parts a change will move.",
    "- If the request cannot be expressed as a trait, use note_to_designer and change nothing.",
    "  Forcing an unrelated value to look responsive is worse than admitting the gap.",
    "",
    language.character.purpose ? `The set's purpose: ${language.character.purpose}` : "",
    language.character.principles.length > 0 ? `Its principles:\n${language.character.principles.map((p) => `- ${p}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const { text } = await model.run({ system, prompt: request, tools, maxSteps: options.maxSteps ?? 8 });

  const changes: TraitChange[] = [];
  for (const [trait, to] of proposed) {
    const from = language.construction[trait];
    if (from === to) continue;
    changes.push({ trait, from, to, moves: byTrait.get(trait)!.consumers });
  }

  return {
    construction: changes.reduce<Construction>(
      (acc, c) => ({ ...acc, [c.trait]: c.to }),
      { ...DEFAULT_CONSTRUCTION, ...language.construction },
    ),
    changes,
    message: text.trim() || (changes.length > 0 ? "Proposed the changes listed." : "Nothing changed."),
    rejected,
  };
}
