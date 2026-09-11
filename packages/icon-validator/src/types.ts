import type { ComposedIcon } from "@icon-foundry/icon-composer";
import type { IconLanguage } from "@icon-foundry/icon-language";
import type { IconSpec } from "@icon-foundry/icon-spec";

export type Severity = "error" | "warning";

export interface ValidationIssue {
  severity: Severity;
  /** Stable rule identifier, e.g. `safeArea`. */
  rule: string;
  message: string;
  /** Element path such as `elements[1]`, when the issue is attributable. */
  source?: string;
}

export interface ValidationResult {
  /** True when there are no errors. Warnings do not fail validation. */
  valid: boolean;
  issues: ValidationIssue[];
  /** Rules that ran and produced no issues, for "✓ Safe area" style UIs. */
  passed: string[];
}

export interface RuleContext {
  spec: IconSpec;
  language: IconLanguage;
  /** Undefined when the spec could not be composed. */
  composed: ComposedIcon | undefined;
}

export interface ValidationRule {
  id: string;
  /** Human-readable label for UIs. */
  label: string;
  check(ctx: RuleContext): ValidationIssue[];
}

export function defineRule(rule: ValidationRule): ValidationRule {
  return rule;
}
