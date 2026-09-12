import {
  DEFAULT_LANGUAGE_ID,
  builtInLanguages,
  getBuiltInExemplars,
  parseIconLanguage,
  serializeIconLanguage,
  type IconLanguage,
} from "@icon-foundry/icon-language";
import { defaultRegistry, definePathPrimitive, type PrimitiveRegistry } from "@icon-foundry/icon-primitives";
import { parseConceptComposition, parseIconSpec, type IconSpec } from "@icon-foundry/icon-spec";
import type { FileStore } from "./store.js";
import {
  CONCEPTS_DIR,
  ELEMENTS_DIR,
  ICONS_DIR,
  ICON_STATUSES,
  LANGUAGES_DIR,
  LEGACY_LANGUAGE_PATH,
  LIBRARY_FORMAT,
  MANIFEST_PATH,
  STATUS_TRANSITIONS,
  exemplarPath,
  exemplarsDir,
  languagePath,
  versionPath,
  versionsDir,
  type ConceptRecord,
  type ConceptStatus,
  type ElementRecord,
  type ElementStatus,
  type IconRecord,
  type IconStatus,
  type LanguageVersion,
  type LibraryManifest,
} from "./types.js";

export class LibraryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LibraryError";
  }
}

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/**
 * Parse a manifest of either format. Format 1 carried a single `language`;
 * format 2 carries a list, with `language` naming the default.
 */
export function parseManifest(value: unknown): LibraryManifest {
  if (!isRecord(value)) throw new LibraryError("manifest: expected an object");
  const format = value.format;
  if (format !== 1 && format !== LIBRARY_FORMAT) {
    throw new LibraryError(`manifest: unsupported format ${String(format)} (this build reads formats 1 and ${LIBRARY_FORMAT})`);
  }
  if (typeof value.id !== "string" || !NAME.test(value.id)) throw new LibraryError("manifest.id: expected a kebab-case id");
  if (typeof value.name !== "string" || !value.name) throw new LibraryError("manifest.name: expected a name");

  const fallback = value.language === undefined ? DEFAULT_LANGUAGE_ID : value.language;
  if (typeof fallback !== "string" || !fallback) throw new LibraryError("manifest.language: expected a language id");

  const listed = stringList(value.languages);
  const languages = listed.length > 0 ? [...new Set(listed)] : [fallback];
  if (!languages.includes(fallback)) {
    throw new LibraryError(`manifest.language "${fallback}" is not in manifest.languages`);
  }
  for (const id of languages) {
    if (!NAME.test(id)) throw new LibraryError(`manifest.languages: "${id}" is not a kebab-case id`);
  }

  return {
    format: LIBRARY_FORMAT,
    id: value.id,
    name: value.name,
    languages,
    language: fallback,
    ...(typeof value.description === "string" && { description: value.description }),
  };
}

export function parseIconRecord(value: unknown): IconRecord {
  if (!isRecord(value)) throw new LibraryError("icon: expected an object");
  const spec = parseIconSpec(value.spec);
  const status = value.status;
  if (typeof status !== "string" || !ICON_STATUSES.includes(status as IconStatus)) {
    throw new LibraryError(`icon ${spec.name}: status must be one of ${ICON_STATUSES.join(", ")}`);
  }
  const now = new Date().toISOString();
  const record: IconRecord = {
    spec,
    status: status as IconStatus,
    tags: stringList(value.tags),
    concepts: stringList(value.concepts),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : now,
  };
  if (isRecord(value.source)) {
    record.source = {
      ...(typeof value.source.brief === "string" && { brief: value.source.brief }),
      ...(typeof value.source.model === "string" && { model: value.source.model }),
    };
  }
  if (typeof value.replacedBy === "string") record.replacedBy = value.replacedBy;
  if (typeof value.concept === "string") record.concept = value.concept;
  if (typeof value.codepoint === "number" && Number.isInteger(value.codepoint)) record.codepoint = value.codepoint;
  return record;
}

export function parseElementRecord(value: unknown): ElementRecord {
  if (!isRecord(value)) throw new LibraryError("element: expected an object");
  const primitive = definePathPrimitive({ ...value, origin: "draft" });
  const status = value.status ?? "draft";
  if (status !== "draft" && status !== "approved" && status !== "deprecated") {
    throw new LibraryError(`element ${primitive.name}: status must be draft, approved or deprecated`);
  }
  const now = new Date().toISOString();
  const record: ElementRecord = {
    name: primitive.name,
    category: primitive.category,
    keywords: stringList(value.keywords),
    outline: stringList(value.outline),
    status,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : now,
  };
  if (typeof value.description === "string") record.description = value.description;
  if (isRecord(value.box) && typeof value.box.width === "number" && typeof value.box.height === "number") {
    record.box = { width: value.box.width, height: value.box.height };
  }
  if (typeof value.opticalShape === "string") record.opticalShape = primitive.opticalShape;
  if (Array.isArray(value.filled)) record.filled = stringList(value.filled);
  if (isRecord(value.source)) {
    record.source = {
      ...(typeof value.source.brief === "string" && { brief: value.source.brief }),
      ...(typeof value.source.model === "string" && { model: value.source.model }),
    };
  }
  return record;
}

export function parseConceptRecord(value: unknown): ConceptRecord {
  if (!isRecord(value)) throw new LibraryError("concept: expected an object");
  if (typeof value.id !== "string" || !NAME.test(value.id)) {
    throw new LibraryError("concept.id: expected a kebab-case id");
  }
  const status = value.status ?? "active";
  if (status !== "active" && status !== "deprecated") {
    throw new LibraryError(`concept ${value.id}: status must be active or deprecated`);
  }
  const now = new Date().toISOString();
  const record: ConceptRecord = {
    id: value.id,
    name: typeof value.name === "string" && value.name ? value.name : value.id,
    aliases: stringList(value.aliases),
    status,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : now,
  };
  if (typeof value.description === "string") record.description = value.description;
  if (value.composition !== undefined) {
    record.composition = parseConceptComposition(value.composition, `concept ${value.id}.composition`);
  }
  if (typeof value.replacedBy === "string") record.replacedBy = value.replacedBy;
  if (isRecord(value.source)) {
    record.source = {
      ...(typeof value.source.brief === "string" && { brief: value.source.brief }),
      ...(typeof value.source.model === "string" && { model: value.source.model }),
    };
  }
  return record;
}

export interface SearchOptions {
  status?: IconStatus[];
  limit?: number;
}

export interface SearchHit {
  record: IconRecord;
  score: number;
}

export interface CreateLibraryInput {
  id: string;
  name: string;
  description?: string;
  /** Language id for the library's first language. Defaults to the built-in default. */
  language?: string;
}

export interface SaveLanguageOptions {
  /** What changed and why. Recorded on the published version snapshot. */
  note?: string;
  /** Make this the library's default language. */
  makeDefault?: boolean;
}

/** Compare dotted numeric versions, falling back to string order for the rest. */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = Number(pa[i] ?? 0);
    const nb = Number(pb[i] ?? 0);
    if (Number.isNaN(na) || Number.isNaN(nb)) return a.localeCompare(b);
    if (na !== nb) return na - nb;
  }
  return 0;
}

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);

/**
 * In-memory model of a library folder. All mutations write through to the
 * store immediately, so the folder on disk is always the truth.
 */
export class Library {
  private constructor(
    private readonly store: FileStore,
    private manifest_: LibraryManifest,
    private readonly languages_: Map<string, IconLanguage>,
    private readonly icons_: Map<string, IconRecord>,
    private readonly elements_: Map<string, ElementRecord>,
    private readonly concepts_: Map<string, ConceptRecord>,
    /** True when the folder on disk is still format 1; upgraded on first write. */
    private legacy_: boolean,
  ) {}

  /** Open an existing library folder, in either format. */
  static async open(store: FileStore): Promise<Library> {
    const manifestText = await store.read(MANIFEST_PATH);
    if (manifestText === undefined) throw new LibraryError(`not a library folder: missing ${MANIFEST_PATH}`);
    const raw: unknown = JSON.parse(manifestText);
    const manifest = parseManifest(raw);
    const legacy = isRecord(raw) && raw.format === 1;

    const languages = new Map<string, IconLanguage>();
    for (const id of manifest.languages) {
      // Format 2 keeps a file per language. Format 1 had one optional override
      // and otherwise referenced a built-in by id.
      const text = (await store.read(languagePath(id))) ?? (legacy ? await store.read(LEGACY_LANGUAGE_PATH) : undefined);
      if (text !== undefined) {
        const language = parseIconLanguage(JSON.parse(text));
        if (language.id !== id) {
          throw new LibraryError(`${languagePath(id)} declares id "${language.id}" but is stored under "${id}"`);
        }
        languages.set(id, language);
        continue;
      }
      const builtIn = builtInLanguages[id];
      if (!builtIn) {
        throw new LibraryError(`language "${id}" has no ${languagePath(id)} and is not a built-in language`);
      }
      languages.set(id, builtIn);
    }

    const icons = new Map<string, IconRecord>();
    for (const path of await store.list(ICONS_DIR)) {
      if (!path.endsWith(".json")) continue;
      const text = await store.read(path);
      if (text === undefined) continue;
      const record = parseIconRecord(JSON.parse(text));
      icons.set(record.spec.name, record);
    }

    const elements = new Map<string, ElementRecord>();
    for (const path of await store.list(ELEMENTS_DIR)) {
      if (!path.endsWith(".json")) continue;
      const text = await store.read(path);
      if (text === undefined) continue;
      const record = parseElementRecord(JSON.parse(text));
      elements.set(record.name, record);
    }

    const concepts = new Map<string, ConceptRecord>();
    for (const path of await store.list(CONCEPTS_DIR)) {
      if (!path.endsWith(".json")) continue;
      const text = await store.read(path);
      if (text === undefined) continue;
      const record = parseConceptRecord(JSON.parse(text));
      concepts.set(record.id, record);
    }

    return new Library(store, manifest, languages, icons, elements, concepts, legacy);
  }

  /**
   * Create a new library folder and open it. The library always owns its
   * language files: a built-in is a preset that gets copied in, never a
   * reference, so the folder is self-contained once it exists.
   */
  static async create(store: FileStore, input: CreateLibraryInput, language?: IconLanguage): Promise<Library> {
    const id = language?.id ?? input.language ?? DEFAULT_LANGUAGE_ID;
    const resolved = language ?? builtInLanguages[id];
    if (!resolved) throw new LibraryError(`language "${id}" is not built in; pass a language to write`);

    const manifest = parseManifest({
      format: LIBRARY_FORMAT,
      id: input.id,
      name: input.name,
      languages: [id],
      language: id,
      ...(input.description !== undefined && { description: input.description }),
    });
    await store.write(MANIFEST_PATH, json(manifest));
    await store.write(languagePath(id), json(serializeIconLanguage(resolved)));
    for (const spec of getBuiltInExemplars(id)) {
      await store.write(exemplarPath(id, spec.name), json(spec));
    }
    return Library.open(store);
  }

  get manifest(): LibraryManifest {
    return this.manifest_;
  }

  /** The default language. Most callers want this. */
  get language(): IconLanguage {
    const language = this.languages_.get(this.manifest_.language);
    if (!language) throw new LibraryError(`default language "${this.manifest_.language}" is missing`);
    return language;
  }

  languages(): IconLanguage[] {
    return this.manifest_.languages.map((id) => {
      const language = this.languages_.get(id);
      if (!language) throw new LibraryError(`language "${id}" is missing`);
      return language;
    });
  }

  getLanguage(id?: string): IconLanguage {
    if (id === undefined) return this.language;
    const language = this.languages_.get(id);
    if (!language) {
      throw new LibraryError(`no language "${id}" in this library (has: ${this.manifest_.languages.join(", ")})`);
    }
    return language;
  }

  hasLanguage(id: string): boolean {
    return this.languages_.has(id);
  }

  /** The language an icon is authored in, falling back to the default. */
  languageFor(spec: IconSpec): IconLanguage {
    return this.languages_.get(spec.language) ?? this.language;
  }

  /* ----------------------------- languages --------------------------- */

  /**
   * Write a language. A new id is added to the manifest; an existing one is
   * replaced. The version is always snapshotted under `versions/`, so a set
   * can be traced back to the rules it was built under.
   */
  async saveLanguage(language: IconLanguage, options: SaveLanguageOptions = {}): Promise<IconLanguage> {
    // Serialise first, then parse: that validates the language and normalises
    // it through exactly the shape the folder will hold, so what is written is
    // provably what will be read back.
    const serialized = serializeIconLanguage(language);
    const parsed = parseIconLanguage(serialized);
    await this.store.write(languagePath(parsed.id), json(serialized));
    await this.store.write(
      versionPath(parsed.id, parsed.version),
      json({
        version: parsed.version,
        savedAt: new Date().toISOString(),
        ...(options.note !== undefined && { note: options.note }),
        language: serialized,
      }),
    );

    const isNew = !this.manifest_.languages.includes(parsed.id);
    const languages = isNew ? [...this.manifest_.languages, parsed.id] : this.manifest_.languages;
    const nextDefault = options.makeDefault ? parsed.id : this.manifest_.language;
    this.languages_.set(parsed.id, parsed);

    if (isNew || nextDefault !== this.manifest_.language || this.legacy_) {
      await this.writeManifest({ ...this.manifest_, languages, language: nextDefault });
    }

    // A brand-new language starts with the exemplars of its preset, if any,
    // so the studio always has something to render.
    if ((await this.store.list(exemplarsDir(parsed.id))).length === 0) {
      for (const spec of getBuiltInExemplars(parsed.id)) {
        await this.store.write(exemplarPath(parsed.id, spec.name), json(spec));
      }
    }
    return parsed;
  }

  /** Published snapshots of a language, newest first. */
  async languageHistory(id: string): Promise<LanguageVersion[]> {
    const out: LanguageVersion[] = [];
    for (const path of await this.store.list(versionsDir(id))) {
      if (!path.endsWith(".json")) continue;
      const text = await this.store.read(path);
      if (text === undefined) continue;
      const value: unknown = JSON.parse(text);
      if (!isRecord(value) || typeof value.version !== "string") continue;
      out.push({
        version: value.version,
        savedAt: typeof value.savedAt === "string" ? value.savedAt : "",
        ...(typeof value.note === "string" && { note: value.note }),
        language: parseIconLanguage(value.language),
      });
    }
    return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt) || compareVersions(b.version, a.version));
  }

  /* ----------------------------- exemplars --------------------------- */

  /** Reference icons for a language, rendered beside every control in the studio. */
  async exemplars(languageId?: string): Promise<IconSpec[]> {
    const id = languageId ?? this.manifest_.language;
    const out: IconSpec[] = [];
    for (const path of await this.store.list(exemplarsDir(id))) {
      if (!path.endsWith(".json")) continue;
      const text = await this.store.read(path);
      if (text === undefined) continue;
      out.push(parseIconSpec(JSON.parse(text)));
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async saveExemplar(languageId: string, spec: IconSpec): Promise<IconSpec> {
    await this.upgradeIfLegacy();
    const parsed = parseIconSpec(spec);
    await this.store.write(exemplarPath(languageId, parsed.name), json(parsed));
    return parsed;
  }

  async removeExemplar(languageId: string, name: string): Promise<void> {
    await this.store.delete(exemplarPath(languageId, name));
  }

  /* ------------------------------ icons ------------------------------ */

  icons(): IconRecord[] {
    return [...this.icons_.values()].sort((a, b) => a.spec.name.localeCompare(b.spec.name));
  }

  /** Icons authored in a given language. */
  iconsInLanguage(languageId: string): IconRecord[] {
    return this.icons().filter((i) => i.spec.language === languageId);
  }

  get(name: string): IconRecord | undefined {
    return this.icons_.get(name);
  }

  has(name: string): boolean {
    return this.icons_.has(name);
  }

  /** Create or update an icon. New icons start as drafts unless told otherwise. */
  async save(
    spec: IconSpec,
    extra: Partial<Pick<IconRecord, "tags" | "concepts" | "source" | "status" | "concept">> = {},
  ): Promise<IconRecord> {
    const existing = this.icons_.get(spec.name);
    const now = new Date().toISOString();
    const record: IconRecord = {
      spec,
      status: extra.status ?? existing?.status ?? "draft",
      tags: extra.tags ?? existing?.tags ?? [],
      concepts: extra.concepts ?? existing?.concepts ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (existing?.codepoint !== undefined) record.codepoint = existing.codepoint;
    const concept = extra.concept ?? existing?.concept;
    if (concept) {
      if (!this.concepts_.has(concept)) throw new LibraryError(`no concept "${concept}" in this library`);
      record.concept = concept;
    }
    const source = extra.source ?? existing?.source;
    if (source) record.source = source;
    if (existing?.replacedBy) record.replacedBy = existing.replacedBy;
    await this.writeIcon(record);
    return record;
  }

  /** Move an icon through its lifecycle. Publishing is the point of no return for the name. */
  async setStatus(name: string, status: IconStatus, options: { replacedBy?: string } = {}): Promise<IconRecord> {
    const record = this.require(name);
    if (record.status !== status && !STATUS_TRANSITIONS[record.status].includes(status)) {
      throw new LibraryError(`cannot move "${name}" from ${record.status} to ${status}`);
    }
    if (options.replacedBy !== undefined && !this.icons_.has(options.replacedBy)) {
      throw new LibraryError(`replacement "${options.replacedBy}" does not exist`);
    }
    // The hole this closes: two icons meaning the same thing. Drafts may
    // conflict freely; publishing is where a duplicate actually costs something.
    if (status === "published" && record.concept) {
      const rival = this.iconForConcept(record.concept, record.spec.language);
      if (rival && rival.spec.name !== name) {
        throw new LibraryError(
          `"${rival.spec.name}" is already the published icon for "${record.concept}" in ${record.spec.language}. ` +
            "Deprecate it first, or give this one a different concept.",
        );
      }
    }
    const next: IconRecord = { ...record, status, updatedAt: new Date().toISOString() };
    if (status === "deprecated" && options.replacedBy) next.replacedBy = options.replacedBy;
    if (status !== "deprecated") delete next.replacedBy;
    await this.writeIcon(next);
    return next;
  }

  /** Delete an icon. Only drafts and deprecated icons can be deleted, so
   * published names never disappear from under references. */
  async remove(name: string): Promise<void> {
    const record = this.require(name);
    if (record.status !== "draft" && record.status !== "deprecated") {
      throw new LibraryError(`cannot delete "${name}" while it is ${record.status}; deprecate it first`);
    }
    await this.store.delete(`${ICONS_DIR}/${name}.json`);
    this.icons_.delete(name);
  }

  /** Rank icons by name, tags, concepts, description, and the keywords of the
   * primitives they use, so "search" finds "magnifying-glass". */
  search(query: string, options: SearchOptions = {}): SearchHit[] {
    const terms = tokenize(query);
    const registry = this.registry();
    const hits: SearchHit[] = [];
    for (const record of this.icons_.values()) {
      if (options.status && !options.status.includes(record.status)) continue;
      if (terms.length === 0) {
        hits.push({ record, score: 0 });
        continue;
      }
      const name = record.spec.name.toLowerCase();
      const strong = new Set([...tokenize(record.spec.name), ...record.tags.flatMap(tokenize), ...record.concepts.flatMap(tokenize)]);
      const description = typeof record.spec.meta?.description === "string" ? tokenize(record.spec.meta.description) : [];
      const primitiveWords = new Set<string>();
      const walk = (els: IconSpec["elements"]) => {
        for (const el of els) {
          if (el.children) walk(el.children);
          else if (el.primitive && registry.has(el.primitive)) {
            const p = registry.get(el.primitive);
            for (const k of [p.name, ...p.keywords]) primitiveWords.add(k.toLowerCase());
          }
        }
      };
      walk(record.spec.elements);

      let score = 0;
      for (const term of terms) {
        if (name === term) score += 10;
        else if (strong.has(term)) score += 5;
        else if (name.includes(term)) score += 3;
        else if (description.includes(term)) score += 2;
        else if (primitiveWords.has(term)) score += 1;
      }
      if (score > 0) hits.push({ record, score });
    }
    hits.sort((a, b) => b.score - a.score || a.record.spec.name.localeCompare(b.record.spec.name));
    return options.limit ? hits.slice(0, options.limit) : hits;
  }

  /* ----------------------------- elements ---------------------------- */

  elements(): ElementRecord[] {
    return [...this.elements_.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  getElement(name: string): ElementRecord | undefined {
    return this.elements_.get(name);
  }

  /** Add or update a user-defined element. New elements start as drafts. */
  async saveElement(input: Omit<ElementRecord, "createdAt" | "updatedAt" | "status"> & { status?: ElementStatus }): Promise<ElementRecord> {
    if (defaultRegistry.has(input.name)) {
      throw new LibraryError(`"${input.name}" is a built-in primitive; choose another name`);
    }
    await this.upgradeIfLegacy();
    const existing = this.elements_.get(input.name);
    const now = new Date().toISOString();
    const record = parseElementRecord({
      ...input,
      status: input.status ?? existing?.status ?? "draft",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    await this.store.write(`${ELEMENTS_DIR}/${record.name}.json`, json(record));
    this.elements_.set(record.name, record);
    return record;
  }

  /** Promotion is always a human action; the agent only creates drafts. */
  async setElementStatus(name: string, status: ElementStatus): Promise<ElementRecord> {
    const record = this.elements_.get(name);
    if (!record) throw new LibraryError(`no element "${name}"`);
    await this.upgradeIfLegacy();
    const next = { ...record, status, updatedAt: new Date().toISOString() };
    await this.store.write(`${ELEMENTS_DIR}/${name}.json`, json(next));
    this.elements_.set(name, next);
    return next;
  }

  async removeElement(name: string): Promise<void> {
    const record = this.elements_.get(name);
    if (!record) throw new LibraryError(`no element "${name}"`);
    const users = this.icons().filter((i) => this.usesPrimitive(i.spec, name));
    if (users.length > 0) {
      throw new LibraryError(`element "${name}" is used by ${users.map((u) => u.spec.name).join(", ")}`);
    }
    await this.store.delete(`${ELEMENTS_DIR}/${name}.json`);
    this.elements_.delete(name);
  }

  /** Built-in primitives plus this library's non-deprecated elements. */
  registry(): PrimitiveRegistry {
    const extra = this.elements()
      .filter((e) => e.status !== "deprecated")
      .map((e) => definePathPrimitive({ ...e, origin: e.status === "approved" ? "approved" : "draft" }));
    return extra.length === 0 ? defaultRegistry : defaultRegistry.extend(extra);
  }

  /** Icons that use a given primitive or element. */
  usages(primitive: string): IconRecord[] {
    return this.icons().filter((i) => this.usesPrimitive(i.spec, primitive));
  }

  /** Every file of the library as path → text, for transport or export. */
  async snapshot(): Promise<Record<string, string>> {
    const paths = [
      MANIFEST_PATH,
      ...(await this.store.list(ICONS_DIR)),
      ...(await this.store.list(ELEMENTS_DIR)),
      ...(await this.store.list(CONCEPTS_DIR)),
    ];
    for (const id of this.manifest_.languages) {
      paths.push(languagePath(id), ...(await this.store.list(exemplarsDir(id))), ...(await this.store.list(versionsDir(id))));
    }
    const out: Record<string, string> = {};
    for (const path of paths) {
      const text = await this.store.read(path);
      if (text !== undefined) out[path] = text;
    }
    return out;
  }

  /**
   * Give every published icon a codepoint, keeping the ones already assigned.
   * Slots are never reused, not even by a deleted icon, because a reference in
   * someone's code outlives the icon it points at.
   */
  async assignCodepoints(start = 0xe000): Promise<Map<string, number>> {
    const taken = new Set<number>();
    for (const record of this.icons_.values()) if (record.codepoint !== undefined) taken.add(record.codepoint);
    let next = start;
    const assigned = new Map<string, number>();
    for (const record of this.icons()) {
      if (record.status !== "published") continue;
      if (record.codepoint !== undefined) {
        assigned.set(record.spec.name, record.codepoint);
        continue;
      }
      while (taken.has(next)) next += 1;
      taken.add(next);
      assigned.set(record.spec.name, next);
      await this.writeIcon({ ...record, codepoint: next, updatedAt: new Date().toISOString() });
    }
    return assigned;
  }

  /* ----------------------------- concepts ---------------------------- */

  concepts(): ConceptRecord[] {
    return [...this.concepts_.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  getConcept(id: string): ConceptRecord | undefined {
    return this.concepts_.get(id);
  }

  /**
   * Resolve words to a concept: exact id, then name, then alias, then a
   * containment match. This is what makes the model unnecessary the second
   * time anyone asks for the same thing.
   */
  resolveConcept(text: string): ConceptRecord | undefined {
    const needle = text.trim().toLowerCase();
    if (!needle) return undefined;
    const active = this.concepts().filter((c) => c.status === "active");
    const byId = active.find((c) => c.id === needle || c.id === needle.replace(/\s+/g, "-"));
    if (byId) return byId;
    const byName = active.find((c) => c.name.toLowerCase() === needle);
    if (byName) return byName;
    const byAlias = active.find((c) => c.aliases.some((a) => a.toLowerCase() === needle));
    if (byAlias) return byAlias;
    // A brief is usually a phrase, so allow an alias to appear inside it.
    return active.find((c) =>
      [c.id, c.name, ...c.aliases].some((w) => w.length > 2 && needle.includes(w.toLowerCase())),
    );
  }

  /** The published icon that answers a concept in a given language. */
  iconForConcept(conceptId: string, languageId?: string): IconRecord | undefined {
    const language = languageId ?? this.manifest_.language;
    return this.icons().find(
      (i) => i.concept === conceptId && i.spec.language === language && i.status === "published",
    );
  }

  /** Concepts with no published icon in a language: requests, not silence. */
  gaps(languageId?: string): ConceptRecord[] {
    const language = languageId ?? this.manifest_.language;
    return this.concepts().filter((c) => c.status === "active" && !this.iconForConcept(c.id, language));
  }

  async saveConcept(
    input: Omit<ConceptRecord, "createdAt" | "updatedAt" | "status" | "aliases"> & {
      aliases?: string[];
      status?: ConceptStatus;
    },
  ): Promise<ConceptRecord> {
    await this.upgradeIfLegacy();
    const existing = this.concepts_.get(input.id);
    const now = new Date().toISOString();
    const record = parseConceptRecord({
      ...input,
      aliases: input.aliases ?? existing?.aliases ?? [],
      status: input.status ?? existing?.status ?? "active",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    await this.store.write(`${CONCEPTS_DIR}/${record.id}.json`, json(record));
    this.concepts_.set(record.id, record);
    return record;
  }

  async removeConcept(id: string): Promise<void> {
    const record = this.concepts_.get(id);
    if (!record) throw new LibraryError(`no concept "${id}"`);
    const used = this.icons().filter((i) => i.concept === id);
    if (used.length > 0) {
      throw new LibraryError(`concept "${id}" is answered by ${used.map((u) => u.spec.name).join(", ")}`);
    }
    await this.store.delete(`${CONCEPTS_DIR}/${id}.json`);
    this.concepts_.delete(id);
  }

  /* ------------------------------ internal --------------------------- */

  private async writeManifest(next: LibraryManifest): Promise<void> {
    await this.store.write(MANIFEST_PATH, json(next));
    this.manifest_ = next;
    this.legacy_ = false;
  }

  /** Format 1 folders are upgraded the first time anything is written. */
  private async upgradeIfLegacy(): Promise<void> {
    if (!this.legacy_) return;
    for (const id of this.manifest_.languages) {
      const language = this.languages_.get(id);
      if (language && (await this.store.read(languagePath(id))) === undefined) {
        await this.store.write(languagePath(id), json(serializeIconLanguage(language)));
      }
      if ((await this.store.list(exemplarsDir(id))).length === 0) {
        for (const spec of getBuiltInExemplars(id)) {
          await this.store.write(exemplarPath(id, spec.name), json(spec));
        }
      }
    }
    await this.store.delete(LEGACY_LANGUAGE_PATH);
    await this.writeManifest({ ...this.manifest_ });
  }

  private usesPrimitive(spec: IconSpec, primitive: string): boolean {
    const walk = (els: IconSpec["elements"]): boolean =>
      els.some((el) => (el.children ? walk(el.children) : el.primitive === primitive));
    return walk(spec.elements);
  }

  private require(name: string): IconRecord {
    const record = this.icons_.get(name);
    if (!record) throw new LibraryError(`no icon "${name}"`);
    return record;
  }

  private async writeIcon(record: IconRecord): Promise<void> {
    await this.upgradeIfLegacy();
    await this.store.write(`${ICONS_DIR}/${record.spec.name}.json`, json(record));
    this.icons_.set(record.spec.name, record);
  }
}
