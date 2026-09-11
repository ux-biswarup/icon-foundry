import { builtInLanguages, parseIconLanguage, type IconLanguage } from "@icon-foundry/icon-language";
import { defaultRegistry, definePathPrimitive, type PrimitiveRegistry } from "@icon-foundry/icon-primitives";
import { parseIconSpec, type IconSpec } from "@icon-foundry/icon-spec";
import type { FileStore } from "./store.js";
import {
  ELEMENTS_DIR,
  ICONS_DIR,
  ICON_STATUSES,
  LANGUAGE_PATH,
  LIBRARY_FORMAT,
  MANIFEST_PATH,
  STATUS_TRANSITIONS,
  type ElementRecord,
  type ElementStatus,
  type IconRecord,
  type IconStatus,
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

export function parseManifest(value: unknown): LibraryManifest {
  if (!isRecord(value)) throw new LibraryError("manifest: expected an object");
  if (value.format !== LIBRARY_FORMAT) {
    throw new LibraryError(`manifest: unsupported format ${String(value.format)} (this build reads format ${LIBRARY_FORMAT})`);
  }
  if (typeof value.id !== "string" || !NAME.test(value.id)) throw new LibraryError("manifest.id: expected a kebab-case id");
  if (typeof value.name !== "string" || !value.name) throw new LibraryError("manifest.name: expected a name");
  if (typeof value.language !== "string" || !value.language) throw new LibraryError("manifest.language: expected a language id");
  return {
    format: LIBRARY_FORMAT,
    id: value.id,
    name: value.name,
    language: value.language,
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
  return record;
}

export function parseElementRecord(value: unknown): ElementRecord {
  if (!isRecord(value)) throw new LibraryError("element: expected an object");
  // definePathPrimitive validates name, category, paths, box and optical shape.
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

export interface SearchOptions {
  status?: IconStatus[];
  limit?: number;
}

export interface SearchHit {
  record: IconRecord;
  score: number;
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
    public readonly manifest: LibraryManifest,
    private language_: IconLanguage,
    private readonly icons_: Map<string, IconRecord>,
    private readonly elements_: Map<string, ElementRecord>,
  ) {}

  /** Open an existing library folder. */
  static async open(store: FileStore): Promise<Library> {
    const manifestText = await store.read(MANIFEST_PATH);
    if (manifestText === undefined) throw new LibraryError(`not a library folder: missing ${MANIFEST_PATH}`);
    const manifest = parseManifest(JSON.parse(manifestText));

    const languageText = await store.read(LANGUAGE_PATH);
    let language: IconLanguage;
    if (languageText !== undefined) {
      language = parseIconLanguage(JSON.parse(languageText));
    } else {
      const builtIn = builtInLanguages[manifest.language];
      if (!builtIn) {
        throw new LibraryError(
          `manifest.language "${manifest.language}" is not a built-in language and ${LANGUAGE_PATH} is missing`,
        );
      }
      language = builtIn;
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

    return new Library(store, manifest, language, icons, elements);
  }

  /** Create a new library folder and open it. */
  static async create(
    store: FileStore,
    input: Omit<LibraryManifest, "format">,
    language?: IconLanguage,
  ): Promise<Library> {
    const manifest = parseManifest({ ...input, format: LIBRARY_FORMAT });
    if (!language && !builtInLanguages[manifest.language]) {
      throw new LibraryError(`language "${manifest.language}" is not built in; pass a language to write`);
    }
    await store.write(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    if (language) await store.write(LANGUAGE_PATH, `${JSON.stringify(language, null, 2)}\n`);
    return Library.open(store);
  }

  get language(): IconLanguage {
    return this.language_;
  }

  /* ------------------------------ icons ------------------------------ */

  icons(): IconRecord[] {
    return [...this.icons_.values()].sort((a, b) => a.spec.name.localeCompare(b.spec.name));
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
    extra: Partial<Pick<IconRecord, "tags" | "concepts" | "source" | "status">> = {},
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
    const existing = this.elements_.get(input.name);
    const now = new Date().toISOString();
    const record = parseElementRecord({
      ...input,
      status: input.status ?? existing?.status ?? "draft",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    await this.store.write(`${ELEMENTS_DIR}/${record.name}.json`, `${JSON.stringify(record, null, 2)}\n`);
    this.elements_.set(record.name, record);
    return record;
  }

  /** Promotion is always a human action; the agent only creates drafts. */
  async setElementStatus(name: string, status: ElementStatus): Promise<ElementRecord> {
    const record = this.elements_.get(name);
    if (!record) throw new LibraryError(`no element "${name}"`);
    const next = { ...record, status, updatedAt: new Date().toISOString() };
    await this.store.write(`${ELEMENTS_DIR}/${name}.json`, `${JSON.stringify(next, null, 2)}\n`);
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
    const out: Record<string, string> = {};
    const paths = [MANIFEST_PATH, LANGUAGE_PATH, ...(await this.store.list(ICONS_DIR)), ...(await this.store.list(ELEMENTS_DIR))];
    for (const path of paths) {
      const text = await this.store.read(path);
      if (text !== undefined) out[path] = text;
    }
    return out;
  }

  /* ------------------------------ internal --------------------------- */

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
    await this.store.write(`${ICONS_DIR}/${record.spec.name}.json`, `${JSON.stringify(record, null, 2)}\n`);
    this.icons_.set(record.spec.name, record);
  }
}
