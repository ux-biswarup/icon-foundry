import lucideInspiredJson from "../../../languages/lucide-inspired/language.json";
import technicalJson from "../../../languages/technical/language.json";
import { parseIconLanguage } from "./parse.js";
import type { IconLanguage } from "./types.js";

export * from "./types.js";
export {
  IconLanguageError,
  DETAIL_LIMITS,
  DEFAULT_CHARACTER,
  DEFAULT_GRAMMAR,
  OPTICAL_SHAPES,
  defaultOpticalBoxes,
  parseIconLanguage,
  parseCharacter,
  parseGrammar,
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

export function getBuiltInLanguage(id: string): IconLanguage {
  const language = builtInLanguages[id];
  if (!language) {
    throw new Error(`Unknown built-in Icon Language "${id}". Known: ${Object.keys(builtInLanguages).join(", ")}`);
  }
  return language;
}
