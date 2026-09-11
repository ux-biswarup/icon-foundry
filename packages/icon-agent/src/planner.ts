import { intentToSpec, parseIntentKeywords } from "@icon-foundry/icon-ai";
import type { IconStyle } from "@icon-foundry/icon-language";
import type { IconSpec } from "@icon-foundry/icon-spec";
import type { Session } from "./session.js";
import type { Brief, Candidate } from "./types.js";

export class NoVocabularyError extends Error {
  constructor(text: string) {
    super(`Nothing in the vocabulary matches "${text}". Connect a model to draft new elements, or compose it by hand.`);
    this.name = "NoVocabularyError";
  }
}

/**
 * Deterministic planner used when no model is configured (or as a fallback).
 * It only arranges existing vocabulary: keyword intent → layout recipes →
 * up to three variants that differ in style or composition.
 */
export function plan(brief: Brief, session: Session): Candidate[] {
  const language = session.language;
  let intent;
  try {
    intent = parseIntentKeywords(brief.text, { registry: session.registry });
  } catch {
    throw new NoVocabularyError(brief.text);
  }
  const style: IconStyle = brief.style ?? intent.style ?? language.style.default;
  const other: IconStyle = style === "outline" ? "filled" : "outline";
  const canvas = brief.canvas;
  const recipe = (mods: string[], s: IconStyle, name?: string): IconSpec =>
    intentToSpec(
      { subject: intent.subject, modifiers: mods, style: s, text: brief.text },
      language,
      { registry: session.registry, ...(canvas !== undefined && { canvas }), ...(name && { name }) },
    );

  const subject = session.registry.get(intent.subject);
  const words = (mods: string[]) => (mods.length ? `${subject.name} with ${mods.join(" and ")}` : subject.name);
  const variants: Array<{ spec: IconSpec; rationale: string }> = [];

  variants.push({
    spec: recipe(intent.modifiers, style),
    rationale: `${words(intent.modifiers)} in the ${style} style. The ${subject.name} fills the ${subject.opticalShape} keyline box${intent.modifiers.length ? " and the badge keeps the language's minimum gap" : ""}.`,
  });

  if (language.style.allowed.includes(other)) {
    variants.push({
      spec: recipe(intent.modifiers, other, `${recipe(intent.modifiers, style).name}-${other}`),
      rationale: `The same composition in the ${other} style, for contexts where the set uses ${other} icons.`,
    });
  }

  if (intent.modifiers.length > 1) {
    variants.push({
      spec: recipe(intent.modifiers.slice(0, 1), style, `${recipe(intent.modifiers, style).name}-simple`),
      rationale: `Only the strongest modifier (${intent.modifiers[0]}) kept, so the icon stays legible at the smallest size.`,
    });
  } else if (intent.modifiers.length === 1) {
    variants.push({
      spec: recipe([], style, `${subject.name}-plain`),
      rationale: `The ${subject.name} alone, in case the modifier is better expressed by context than by a badge.`,
    });
  }

  const out: Candidate[] = [];
  for (const v of variants) {
    try {
      out.push(session.addCandidate(v.spec, v.rationale));
    } catch {
      // A recipe that fails validation is dropped; the others still stand.
    }
  }
  return out;
}
