import lucideInspiredJson from "../../../languages/lucide-inspired/language.json";
import { parseIconLanguage } from "./parse.js";
import type { IconLanguage } from "./types.js";

export * from "./types.js";
export {
  IconLanguageError,
  DETAIL_LIMITS,
  OPTICAL_SHAPES,
  defaultOpticalBoxes,
  parseIconLanguage,
  defineIconLanguage,
  resolveTokens,
  hasSize,
  nearestTokens,
} from "./parse.js";

/** The bundled starter language. Copy `languages/lucide-inspired/language.json`
 * to create your own. */
export const lucideInspired: IconLanguage = parseIconLanguage(lucideInspiredJson);

/** All languages shipped with the repository, keyed by id. */
export const builtInLanguages: Readonly<Record<string, IconLanguage>> = Object.freeze({
  [lucideInspired.id]: lucideInspired,
});

export function getBuiltInLanguage(id: string): IconLanguage {
  const language = builtInLanguages[id];
  if (!language) {
    throw new Error(`Unknown built-in Icon Language "${id}". Known: ${Object.keys(builtInLanguages).join(", ")}`);
  }
  return language;
}
