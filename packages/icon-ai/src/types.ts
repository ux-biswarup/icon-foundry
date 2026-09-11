import type { IconStyle } from "@icon-foundry/icon-language";

/**
 * Structured intent: the only thing an LLM is ever asked to produce.
 * Deterministic code turns it into an IconSpec.
 */
export interface IconIntent {
  /** Primitive name of the main subject, e.g. "warehouse". */
  subject: string;
  /** Primitive names of badges/modifiers, e.g. ["snowflake"]. Max two are used. */
  modifiers: string[];
  style?: IconStyle;
  /** Original text, kept for naming and traceability. */
  text?: string;
}

export interface IntentParser {
  readonly id: string;
  parse(text: string): Promise<IconIntent>;
}
