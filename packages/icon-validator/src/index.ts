import { compose, ComposeError, type ComposeOptions, type ComposedIcon } from "@icon-foundry/icon-composer";
import { hasSize, nearestTokens, resolveTokens, type IconLanguage } from "@icon-foundry/icon-language";
import type { IconSpec } from "@icon-foundry/icon-spec";
import { builtInRules } from "./rules/index.js";
import type { RuleContext, ValidationIssue, ValidationResult, ValidationRule } from "./types.js";

export * from "./types.js";
export * from "./rules/index.js";

export interface ValidateOptions extends ComposeOptions {
  /** Rules to run. Defaults to all built-in rules. */
  rules?: readonly ValidationRule[];
  /** Reuse an existing composition instead of composing again. */
  composed?: ComposedIcon;
}

/**
 * Validate an IconSpec against an Icon Language.
 * Composition happens here so rules can inspect real geometry; a spec that
 * cannot be composed yields a single `compose` error plus any spec-level issues.
 */
export function validateIconSpec(
  spec: IconSpec,
  language: IconLanguage,
  options: ValidateOptions = {},
): ValidationResult {
  const rules = options.rules ?? builtInRules;
  const issues: ValidationIssue[] = [];
  let composed = options.composed;

  if (!composed) {
    try {
      composed = compose(spec, language, options.registry ? { registry: options.registry } : {});
    } catch (error) {
      if (error instanceof ComposeError) {
        issues.push({ severity: "error", rule: "compose", message: error.message, source: error.source });
      } else {
        throw error;
      }
    }
  }

  const tokens = hasSize(language, spec.canvas) ? resolveTokens(language, spec.canvas) : nearestTokens(language, spec.canvas);
  const ctx: RuleContext = { spec, language, tokens, composed };
  const passed: string[] = [];
  for (const rule of rules) {
    const found = rule.check(ctx);
    if (found.length === 0) passed.push(rule.id);
    else issues.push(...found);
  }

  return {
    valid: issues.every((i) => i.severity !== "error"),
    issues,
    passed,
  };
}
