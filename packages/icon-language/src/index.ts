import type { IconSpec } from "@icon-foundry/icon-spec";
import lucideInspiredExemplars from "../../../languages/lucide-inspired/exemplars.json";
import lucideInspiredJson from "../../../languages/lucide-inspired/language.json";
import technicalExemplars from "../../../languages/technical/exemplars.json";
import technicalJson from "../../../languages/technical/language.json";
import { parseIconLanguage } from "./parse.js";
import type { IconLanguage } from "./types.js";

export * from "./types.js";
export {
  AXIS_NAMES,
  DERIVABLE,
  DEFAULT_DERIVATION,
  TOKEN_UNITS,
  deriveTokens,
  scaleDerived,
  derivedValue,
  derivedNumber,
  derivedEnum,
  type Contribution,
  type DerivableToken,
  type DerivedToken,
  type DerivedTokens,
} from "./derive.js";
export {
  IconLanguageError,
  DETAIL_LIMITS,
  DEFAULT_CHARACTER,
  DEFAULT_GRAMMAR,
  DEFAULT_CONSTRUCTION,
  DEFAULT_OPTICS,
  OPTICAL_SHAPES,
  defaultOpticalBoxes,
  parseIconLanguage,
  parseCharacter,
  parseGrammar,
  parseDerivation,
  parsePreferences,
  serializeIconLanguage,
  constructionFor,
  defineIconLanguage,
  resolveTokens,
  hasSize,
  nearestTokens,
} from "./parse.js";

/**
 * The default starter language: icons as technical drawings with a friendly
 * finish. 16px primary with a 24px optical size, 45° construction, closed
 * shapes, and gaps wide enough to survive at small sizes.
 */
export const technical: IconLanguage = parseIconLanguage(technicalJson);

/** A second bundled language, kept as a worked example of a different set of rules. */
export const lucideInspired: IconLanguage = parseIconLanguage(lucideInspiredJson);

/** All languages shipped with the repository, keyed by id. The first is the default. */
export const builtInLanguages: Readonly<Record<string, IconLanguage>> = Object.freeze({
  [technical.id]: technical,
  [lucideInspired.id]: lucideInspired,
});

/** Id used when a caller does not choose a language. */
export const DEFAULT_LANGUAGE_ID = technical.id;

/**
 * Reference icons shipped with each built-in language. They exist to be
 * *looked at*: the studio renders them beside every control so a token is
 * chosen by eye rather than typed, and they are copied into a library when a
 * language is created from a preset. The set covers each keyline shape, a
 * badge composition, a filled variant and a rotation, so a change to any rule
 * is visible in at least one of them.
 */
export const builtInExemplars: Readonly<Record<string, readonly IconSpec[]>> = Object.freeze({
  [technical.id]: technicalExemplars as IconSpec[],
  [lucideInspired.id]: lucideInspiredExemplars as IconSpec[],
});

export function getBuiltInExemplars(id: string): IconSpec[] {
  return (builtInExemplars[id] ?? []).map((spec) => structuredClone(spec) as IconSpec);
}

export function getBuiltInLanguage(id: string): IconLanguage {
  const language = builtInLanguages[id];
  if (!language) {
    throw new Error(`Unknown built-in Icon Language "${id}". Known: ${Object.keys(builtInLanguages).join(", ")}`);
  }
  return language;
}
