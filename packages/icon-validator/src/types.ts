import type { ComposedIcon, ResolvedSpec } from "@icon-foundry/icon-composer";
import type { IconLanguage, SizeTokens } from "@icon-foundry/icon-language";
import type { Bounds, Point, PrimitiveRegistry, Shape } from "@icon-foundry/icon-primitives";
import type { IconSpec } from "@icon-foundry/icon-spec";

export type Severity = "error" | "warning";

/**
 * How much authority a rule has.
 *
 * Forcing every design principle into the first tier is what makes rule
 * systems get ignored: a rule that fires on icons that are fine teaches people
 * to ignore every rule, which costs more than the rule was worth.
 */
export type RuleTier = "hard" | "soft" | "human";

/**
 * Where a rule found what it found, in canvas units.
 *
 * Rules already compute this. They measured the overflow, they know which two
 * shapes nearly touched and by how much — and then they formatted it into a
 * sentence and dropped the geometry on the floor. You cannot draw a
 * `.toFixed(2)`: a designer reading "gap is 0.42 units" still has to hunt the
 * icon for which 0.42 that is.
 *
 * Keeping the witnesses lets the studio draw the problem where the problem is,
 * while detection stays here — unit-tested and away from any JSX. Rules detect;
 * overlays draw.
 */
export type Evidence =
  /** An overflowing or otherwise notable rectangle. */
  | { kind: "bounds"; bounds: Bounds }
  /** The nearest pair of points between two shapes, and the gap between them. */
  | { kind: "gap"; a: Point; b: Point; gap: number }
  /** Specific positions worth marking, e.g. corners that are off the grid. */
  | { kind: "points"; points: Point[] }
  /** A whole shape to highlight. */
  | { kind: "shape"; shape: Shape };

export interface ValidationIssue {
  severity: Severity;
  /** Stable rule identifier, e.g. `safeArea`. */
  rule: string;
  message: string;
  /** Element path such as `elements[1]`, when the issue is attributable. */
  source?: string;
  /**
   * Where to draw the problem. Optional, so a rule that has nothing useful to
   * point at — or has not been taught to yet — stays exactly as it was.
   */
  evidence?: Evidence[];
}

/** What a soft rule returns: a gradient, not a verdict. */
export interface Score {
  rule: string;
  label: string;
  /** 0 to 1. Higher is better. */
  value: number;
  /** One short sentence a designer can act on. */
  note: string;
}

export interface ValidationResult {
  /** True when there are no errors. Warnings and scores never fail validation. */
  valid: boolean;
  issues: ValidationIssue[];
  /** Hard rules that ran and produced no issues, for "✓ Safe area" style UIs. */
  passed: string[];
  /** Soft rules, for ranking candidates and auditing a set. Never blocks. */
  scores: Score[];
  /** The mean of every score, or undefined when nothing was scored. */
  overall?: number;
}

export interface RuleContext {
  /**
   * The spec with its geometry worked out against `language`.
   *
   * Resolved, not raw: a rule that read the stored elements would be checking
   * an icon's old geometry against the current language, and would pass an
   * icon that no longer obeys its own keyline sheet.
   */
  spec: ResolvedSpec;
  language: IconLanguage;
  /** Tokens for the spec's canvas, or the nearest size when the canvas is unknown. */
  tokens: SizeTokens;
  /** Undefined when the spec could not be composed. */
  composed: ComposedIcon | undefined;
  /** The vocabulary in play, so a rule can ask what an element means. */
  registry: PrimitiveRegistry;
}

/** A hard constraint: enforce it, or refuse the icon. */
export interface ValidationRule {
  id: string;
  /** Human-readable label for UIs. */
  label: string;
  tier?: "hard";
  check(ctx: RuleContext): ValidationIssue[];
}

/** A soft preference: measure it, rank by it, never refuse. */
export interface ScoringRule {
  id: string;
  label: string;
  tier: "soft";
  /** What the preference is, in the language's own terms. */
  description: string;
  /** Undefined when the rule has nothing to say about this icon. */
  score(ctx: RuleContext): { value: number; note: string } | undefined;
}

/**
 * A question only a person can answer. The machine's whole job is to put it in
 * front of someone with enough context, and then get out of the way.
 */
export interface HumanRule {
  id: string;
  label: string;
  tier: "human";
  /** The question, phrased for a reviewer rather than a developer. */
  question: string;
}

export function defineRule(rule: ValidationRule): ValidationRule {
  return { tier: "hard", ...rule };
}

export function defineScorer(rule: Omit<ScoringRule, "tier">): ScoringRule {
  return { ...rule, tier: "soft" };
}

export function defineHumanRule(rule: Omit<HumanRule, "tier">): HumanRule {
  return { ...rule, tier: "human" };
}
