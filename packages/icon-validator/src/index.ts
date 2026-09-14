import { compose, resolveSpec, ComposeError, type ComposeOptions, type ComposedIcon, type ResolvedSpec } from "@icon-foundry/icon-composer";
import { hasSize, nearestTokens, resolveTokens, type IconLanguage } from "@icon-foundry/icon-language";
import { defaultRegistry } from "@icon-foundry/icon-primitives";
import type { IconSpec } from "@icon-foundry/icon-spec";
import { builtInHumanRules } from "./human.js";
import { builtInRules } from "./rules/index.js";
import { builtInScorers } from "./scorers/index.js";
import type { RuleContext, Score, ScoringRule, ValidationIssue, ValidationResult, ValidationRule } from "./types.js";

export * from "./types.js";
export * from "./rules/index.js";
export * from "./scorers/index.js";
export { builtInHumanRules } from "./human.js";
export * from "./fillability.js";

export interface ValidateOptions extends ComposeOptions {
  /** Hard rules to run. Defaults to all built-in rules. */
  rules?: readonly ValidationRule[];
  /** Soft rules to run. Defaults to all built-in scorers. Pass `[]` to skip. */
  scorers?: readonly ScoringRule[];
  /** Reuse an existing composition instead of composing again. */
  composed?: ComposedIcon;
}

/**
 * Validate an IconSpec against an Icon Language.
 *
 * Hard rules decide whether the icon is allowed to exist. Soft rules measure
 * how well it holds preferences that should never block, and are what let a
 * caller rank candidates or spot drift across a set. A spec that cannot be
 * composed yields a single `compose` error plus any spec-level issues.
 */
export function validateIconSpec(
  spec: IconSpec,
  language: IconLanguage,
  options: ValidateOptions = {},
): ValidationResult {
  const rules = options.rules ?? builtInRules;
  const scorers = options.scorers ?? builtInScorers;
  const registry = options.registry ?? defaultRegistry;
  const issues: ValidationIssue[] = [];
  let composed = options.composed;

  if (!composed) {
    try {
      composed = compose(spec, language, { registry });
    } catch (error) {
      if (error instanceof ComposeError) {
        issues.push({ severity: "error", rule: "compose", message: error.message, source: error.source });
      } else {
        throw error;
      }
    }
  }

  // Resolve once, and hand every rule the same geometry the composer drew.
  // A spec that cannot be resolved still validates: the reason is reported and
  // the rules run over whatever it did carry, so the caller sees the cause
  // alongside everything else that is wrong.
  let resolved: ResolvedSpec;
  try {
    resolved = resolveSpec(spec, language, { registry });
  } catch (error) {
    issues.push({
      severity: "error",
      rule: "compose",
      message: error instanceof Error ? error.message : String(error),
      source: "spec",
    });
    resolved = { ...spec, elements: spec.elements ?? [] };
  }

  const tokens = hasSize(language, spec.canvas) ? resolveTokens(language, spec.canvas) : nearestTokens(language, spec.canvas);
  const ctx: RuleContext = { spec: resolved, language, tokens, composed, registry };

  const passed: string[] = [];
  for (const rule of rules) {
    const found = rule.check(ctx);
    if (found.length === 0) passed.push(rule.id);
    else issues.push(...found);
  }

  // Which preferences matter is the team's taste, so the weights come from the
  // language. A weight of 0 turns a preference off entirely.
  const scores: Score[] = [];
  let weighted = 0;
  let totalWeight = 0;
  for (const scorer of scorers) {
    const weight = language.preferences[scorer.id] ?? 1;
    if (weight <= 0) continue;
    const result = scorer.score(ctx);
    if (!result) continue;
    scores.push({ rule: scorer.id, label: scorer.label, value: result.value, note: result.note });
    weighted += result.value * weight;
    totalWeight += weight;
  }

  return {
    valid: issues.every((i) => i.severity !== "error"),
    issues,
    passed,
    scores,
    ...(totalWeight > 0 && { overall: weighted / totalWeight }),
  };
}

/** Every question a person still has to answer, for a review surface. */
export function humanQuestions(): readonly { id: string; label: string; question: string }[] {
  return builtInHumanRules;
}
