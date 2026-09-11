import type { IconSpec } from "@icon-foundry/icon-spec";

/**
 * The library folder format. A team's icons are their data and live in a
 * folder they own (usually their own Git repository):
 *
 *   acme-icons/
 *     icon-foundry.json      manifest (this file's `LibraryManifest`)
 *     language/language.json optional custom language; else a built-in id
 *     elements/<name>.json   user-defined elements (PathPrimitiveDefinition + status)
 *     icons/<name>.json      one IconRecord per icon
 *
 * `format` is a public contract. Bump it and add a migration when it changes.
 */
export const LIBRARY_FORMAT = 1;

export const MANIFEST_PATH = "icon-foundry.json";
export const LANGUAGE_PATH = "language/language.json";
export const ICONS_DIR = "icons";
export const ELEMENTS_DIR = "elements";

export interface LibraryManifest {
  format: typeof LIBRARY_FORMAT;
  /** kebab-case identifier. */
  id: string;
  name: string;
  /** Id of a built-in language, or the id of `language/language.json`. */
  language: string;
  description?: string;
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
  /** Product concepts this icon answers, e.g. "cold chain", "Bugbot". */
  concepts: string[];
  createdAt: string;
  updatedAt: string;
  /** Provenance, for traceability. Never used to call anything. */
  source?: {
    brief?: string;
    model?: string;
  };
  /** For deprecated icons: the name of the icon that replaces this one. */
  replacedBy?: string;
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
