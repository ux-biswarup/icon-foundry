import type { IconLanguage } from "@icon-foundry/icon-language";
import type { ConceptComposition, IconSpec } from "@icon-foundry/icon-spec";

/**
 * The library folder format. A team's icons are their data and live in a
 * folder they own (usually their own Git repository):
 *
 *   acme-icons/
 *     icon-foundry.json                       manifest (`LibraryManifest`)
 *     languages/<id>/language.json            a language the team owns and edits
 *     languages/<id>/exemplars/<name>.json    reference icons, rendered while editing
 *     languages/<id>/versions/<version>.json  published snapshots
 *     concepts/<id>.json                      what an icon means, and what it is made of
 *     elements/<name>.json                    user-defined elements
 *     icons/<name>.json                       one IconRecord per icon
 *
 * `format` is a public contract. Bump it and add a migration when it changes.
 *
 * Format 2 made two changes: a library may hold several languages (which is
 * what a language version migration looks like), and a language is writable
 * rather than a read-only override. Format 1 libraries are read and written
 * back as format 2.
 */
export const LIBRARY_FORMAT = 2;

export const MANIFEST_PATH = "icon-foundry.json";
export const ICONS_DIR = "icons";
export const ELEMENTS_DIR = "elements";
export const LANGUAGES_DIR = "languages";
export const CONCEPTS_DIR = "concepts";

/** Format 1 only: a single optional language override. */
export const LEGACY_LANGUAGE_PATH = "language/language.json";

export const languageDir = (id: string): string => `${LANGUAGES_DIR}/${id}`;
export const languagePath = (id: string): string => `${languageDir(id)}/language.json`;
export const exemplarsDir = (id: string): string => `${languageDir(id)}/exemplars`;
export const exemplarPath = (id: string, name: string): string => `${exemplarsDir(id)}/${name}.json`;
export const versionsDir = (id: string): string => `${languageDir(id)}/versions`;
export const versionPath = (id: string, version: string): string => `${versionsDir(id)}/${version}.json`;

export interface LibraryManifest {
  format: typeof LIBRARY_FORMAT;
  /** kebab-case identifier. */
  id: string;
  name: string;
  /** Every language this library holds. */
  languages: string[];
  /** The language used when a caller does not choose one. Always in `languages`. */
  language: string;
  description?: string;
}

/** A published snapshot of a language, so a set can be traced to the rules it was built under. */
export interface LanguageVersion {
  version: string;
  savedAt: string;
  /** What changed and why, in the author's words. */
  note?: string;
  language: IconLanguage;
}

export type ConceptStatus = "active" | "deprecated";

/**
 * A concept is a domain noun, not a visual rule: "refrigerated warehouse"
 * exists whether or not anyone has drawn it. It lives in the library rather
 * than in a language because one vocabulary can be rendered by several
 * languages, and because the two have different owners.
 *
 * A concept with no icon is a visible gap — a request — rather than silence.
 */
export interface ConceptRecord {
  /** kebab-case identity. Stable forever; the drawing may change. */
  id: string;
  name: string;
  description?: string;
  /** Other words people use for this. What makes search work without embeddings. */
  aliases: string[];
  status: ConceptStatus;
  /** What the thing is made of. Absent means nobody has decided yet. */
  composition?: ConceptComposition;
  createdAt: string;
  updatedAt: string;
  source?: { brief?: string; model?: string };
  /** For a deprecated concept: the concept that replaces it. */
  replacedBy?: string;
}

export type IconStatus = "draft" | "review" | "published" | "deprecated";

export const ICON_STATUSES: readonly IconStatus[] = ["draft", "review", "published", "deprecated"];

/** Allowed lifecycle moves. Deletion is only allowed from draft or deprecated. */
export const STATUS_TRANSITIONS: Record<IconStatus, readonly IconStatus[]> = {
  draft: ["review", "published"],
  review: ["draft", "published"],
  published: ["deprecated"],
  deprecated: ["published"],
};

export interface IconRecord {
  /** The canonical icon. `spec.name` is the record's identity. */
  spec: IconSpec;
  status: IconStatus;
  /** Free-form search terms. */
  tags: string[];
  /** Free-form search terms for concepts this icon touches. */
  concepts: string[];
  /** The concept this icon *is*. One published icon per concept per language. */
  concept?: string;
  createdAt: string;
  updatedAt: string;
  /** Provenance, for traceability. Never used to call anything. */
  source?: {
    brief?: string;
    model?: string;
  };
  /** For deprecated icons: the name of the icon that replaces this one. */
  replacedBy?: string;
  /**
   * A private-use codepoint, assigned once and never reused. It is what lets a
   * set be shipped as a font and later replaced without breaking a single
   * reference in a product's code.
   */
  codepoint?: number;
}

export type ElementStatus = "draft" | "approved" | "deprecated";

/** A user-defined element as stored on disk: a path primitive definition plus status. */
export interface ElementRecord {
  name: string;
  category: "shape" | "object" | "symbol";
  description?: string;
  box?: { width: number; height: number };
  opticalShape?: "square" | "circle" | "horizontal" | "vertical";
  keywords: string[];
  outline: string[];
  filled?: string[];
  status: ElementStatus;
  createdAt: string;
  updatedAt: string;
  source?: { brief?: string; model?: string };
}
