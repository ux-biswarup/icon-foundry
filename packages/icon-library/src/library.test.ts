import { describe, expect, it } from "vitest";
import { lucideInspired, parseIconLanguage, serializeIconLanguage, technical } from "@icon-foundry/icon-language";
import { Library, LibraryError, MemoryStore } from "./index.js";

const warehouse = {
  name: "cold-warehouse",
  language: "technical",
  canvas: 16,
  meta: { description: "Temperature controlled warehouse" },
  elements: [
    { primitive: "warehouse", x: 1, y: 6, width: 11, height: 7, align: { x: "start", y: "end" } },
    { primitive: "snowflake", x: 10, y: 1, size: 5 },
  ],
} as const;

const spec = (over: Record<string, unknown> = {}) => ({ ...structuredClone(warehouse), ...over }) as never;

async function fresh() {
  const store = new MemoryStore();
  const lib = await Library.create(store, { id: "acme", name: "Acme Icons" });
  return { store, lib };
}

const files = (lib: Library) => (lib as unknown as { store: MemoryStore }).store.toJSON();

describe("Library: creation and format", () => {
  it("creates a self-contained format 2 folder with its own language and exemplars", async () => {
    const { store, lib } = await fresh();
    const paths = Object.keys(store.toJSON());
    expect(paths).toContain("icon-foundry.json");
    expect(paths).toContain("languages/technical/language.json");
    expect(paths.filter((p) => p.startsWith("languages/technical/exemplars/")).length).toBeGreaterThan(4);

    const manifest = JSON.parse(store.toJSON()["icon-foundry.json"]!);
    expect(manifest).toMatchObject({ format: 2, id: "acme", languages: ["technical"], language: "technical" });
    // The language is copied in, not referenced: the folder stands alone.
    expect(lib.language.id).toBe("technical");
    expect((await Library.open(store)).language.id).toBe("technical");
  });

  it("can be created from a different built-in preset, or a custom language", async () => {
    const byId = await Library.create(new MemoryStore(), { id: "a", name: "A", language: "lucide-inspired" });
    expect(byId.language.id).toBe("lucide-inspired");

    const custom = parseIconLanguage({ ...serializeIconLanguage(technical), id: "acme-icons", name: "Acme Icons", version: "0.1.0" });
    const byLanguage = await Library.create(new MemoryStore(), { id: "b", name: "B" }, custom);
    expect(byLanguage.language.id).toBe("acme-icons");
    expect(byLanguage.manifest.languages).toEqual(["acme-icons"]);
  });

  it("refuses unknown formats, unknown languages, and a default outside the list", async () => {
    await expect(
      Library.open(new MemoryStore({ "icon-foundry.json": '{"format":3,"id":"x","name":"X","language":"technical"}' })),
    ).rejects.toThrow(/unsupported format/);
    await expect(Library.create(new MemoryStore(), { id: "x", name: "X", language: "nope" })).rejects.toThrow(LibraryError);
    await expect(
      Library.open(new MemoryStore({ "icon-foundry.json": '{"format":2,"id":"x","name":"X","languages":["technical"],"language":"other"}' })),
    ).rejects.toThrow(/not in manifest.languages/);
  });

  it("rejects a language file stored under the wrong id", async () => {
    const store = new MemoryStore({
      "icon-foundry.json": '{"format":2,"id":"x","name":"X","languages":["mine"],"language":"mine"}',
      "languages/mine/language.json": JSON.stringify(serializeIconLanguage(technical)),
    });
    await expect(Library.open(store)).rejects.toThrow(/declares id "technical"/);
  });
});

describe("Library: format 1 migration", () => {
  const legacy = () =>
    new MemoryStore({
      "icon-foundry.json": '{"format":1,"id":"old","name":"Old","language":"lucide-inspired"}\n',
      "icons/arrow.json": JSON.stringify({
        spec: { name: "arrow", language: "lucide-inspired", canvas: 24, elements: [{ primitive: "arrow", x: 2, y: 2, size: 20 }] },
        status: "published",
        tags: [],
        concepts: [],
      }),
    });

  it("opens a format 1 folder, resolving the language from the built-ins", async () => {
    const lib = await Library.open(legacy());
    expect(lib.manifest.format).toBe(2);
    expect(lib.manifest.languages).toEqual(["lucide-inspired"]);
    expect(lib.language.id).toBe("lucide-inspired");
    expect(lib.icons().map((i) => i.spec.name)).toEqual(["arrow"]);
  });

  it("upgrades the folder on the first write, materialising the language and dropping the old path", async () => {
    const store = legacy();
    const lib = await Library.open(store);
    await lib.save(
      { name: "arrow", language: "lucide-inspired", canvas: 24, elements: [{ primitive: "arrow", x: 2, y: 2, size: 20 }] } as never,
    );
    const paths = Object.keys(store.toJSON());
    expect(JSON.parse(store.toJSON()["icon-foundry.json"]!).format).toBe(2);
    expect(paths).toContain("languages/lucide-inspired/language.json");
    expect(paths.some((p) => p.startsWith("languages/lucide-inspired/exemplars/"))).toBe(true);
    expect(paths).not.toContain("language/language.json");
    // And it reopens cleanly as format 2.
    expect((await Library.open(store)).language.id).toBe("lucide-inspired");
  });

  it("carries a format 1 custom language override across the upgrade", async () => {
    const custom = parseIconLanguage({ ...serializeIconLanguage(lucideInspired), version: "9.9.9" });
    const store = new MemoryStore({
      "icon-foundry.json": '{"format":1,"id":"old","name":"Old","language":"lucide-inspired"}',
      "language/language.json": JSON.stringify(serializeIconLanguage(custom)),
    });
    const lib = await Library.open(store);
    expect(lib.language.version).toBe("9.9.9");
    await lib.saveElement({ name: "blob", category: "shape", keywords: [], outline: ["M0 0 L10 0 L10 10 Z"] });
    expect(JSON.parse(store.toJSON()["languages/lucide-inspired/language.json"]!).version).toBe("9.9.9");
  });
});

describe("Library: authoring languages", () => {
  it("saves a language, snapshots the version, and seeds exemplars for a new one", async () => {
    const { lib } = await fresh();
    const mine = parseIconLanguage({
      ...serializeIconLanguage(technical),
      id: "acme",
      name: "Acme",
      version: "0.1.0",
      character: { ...technical.character, purpose: "Quiet icons for an ops console." },
    });
    const saved = await lib.saveLanguage(mine, { note: "First cut", makeDefault: true });
    expect(saved.character.purpose).toBe("Quiet icons for an ops console.");
    expect(lib.manifest.languages).toEqual(["technical", "acme"]);
    expect(lib.manifest.language).toBe("acme");
    expect(lib.language.id).toBe("acme");

    const history = await lib.languageHistory("acme");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ version: "0.1.0", note: "First cut" });
    expect(history[0]!.language.id).toBe("acme");
    // A language with no preset exemplars of its own simply has none to seed.
    expect(await lib.exemplars("acme")).toEqual([]);
  });

  it("records every published version and returns them newest first", async () => {
    const { lib } = await fresh();
    const base = serializeIconLanguage(technical);
    await lib.saveLanguage(parseIconLanguage({ ...base, version: "0.2.0" }), { note: "two" });
    await lib.saveLanguage(parseIconLanguage({ ...base, version: "0.3.0" }), { note: "three" });
    const history = await lib.languageHistory("technical");
    expect(history.map((h) => h.version)).toEqual(["0.3.0", "0.2.0"]);
    expect(lib.language.version).toBe("0.3.0");
  });

  it("holds several languages at once and resolves per icon", async () => {
    const { lib } = await fresh();
    await lib.saveLanguage(lucideInspired);
    expect(lib.manifest.languages).toEqual(["technical", "lucide-inspired"]);
    expect(lib.manifest.language).toBe("technical");

    await lib.save(spec());
    await lib.save(spec({ name: "old-warehouse", language: "lucide-inspired", canvas: 24, elements: [{ primitive: "warehouse", x: 2, y: 4, width: 20, height: 16 }] }));
    expect(lib.iconsInLanguage("technical").map((i) => i.spec.name)).toEqual(["cold-warehouse"]);
    expect(lib.iconsInLanguage("lucide-inspired").map((i) => i.spec.name)).toEqual(["old-warehouse"]);
    expect(lib.languageFor(lib.get("old-warehouse")!.spec).id).toBe("lucide-inspired");
    expect(lib.getLanguage("lucide-inspired").canvas).toBe(24);
    expect(() => lib.getLanguage("ghost")).toThrow(/no language "ghost"/);
  });

  it("round-trips a multi-language library through the folder", async () => {
    const { store, lib } = await fresh();
    await lib.saveLanguage(lucideInspired);
    const reopened = await Library.open(store);
    expect(reopened.languages().map((l) => l.id)).toEqual(["technical", "lucide-inspired"]);
    expect(reopened.hasLanguage("lucide-inspired")).toBe(true);
  });
});

describe("Library: exemplars", () => {
  it("ships a set that covers the keyline shapes, badges, a fill and a rotation", async () => {
    const { lib } = await fresh();
    const names = (await lib.exemplars()).map((e) => e.name);
    expect(names.length).toBeGreaterThanOrEqual(8);
    expect(names).toContain("arrow-down");
    expect(names.some((n) => n.includes("filled"))).toBe(true);
    expect((await lib.exemplars()).every((e) => e.language === "technical")).toBe(true);
  });

  it("adds and removes exemplars", async () => {
    const { lib } = await fresh();
    const before = (await lib.exemplars()).length;
    await lib.saveExemplar("technical", spec({ name: "extra-exemplar" }));
    expect((await lib.exemplars()).map((e) => e.name)).toContain("extra-exemplar");
    await lib.removeExemplar("technical", "extra-exemplar");
    expect((await lib.exemplars()).length).toBe(before);
  });
});

describe("Library: icons and elements", () => {
  it("enforces the lifecycle", async () => {
    const { lib } = await fresh();
    await lib.save(spec());
    await lib.setStatus("cold-warehouse", "review");
    await lib.setStatus("cold-warehouse", "published");
    await expect(lib.setStatus("cold-warehouse", "draft")).rejects.toThrow(/cannot move/);
    await expect(lib.remove("cold-warehouse")).rejects.toThrow(/deprecate it first/);
    await lib.setStatus("cold-warehouse", "deprecated");
    await lib.remove("cold-warehouse");
    expect(lib.icons()).toEqual([]);
  });

  it("records a replacement when deprecating", async () => {
    const { lib } = await fresh();
    await lib.save(spec(), { status: "published" });
    await lib.save(spec({ name: "cold-warehouse-2" }), { status: "published" });
    const dep = await lib.setStatus("cold-warehouse", "deprecated", { replacedBy: "cold-warehouse-2" });
    expect(dep.replacedBy).toBe("cold-warehouse-2");
    await expect(lib.setStatus("cold-warehouse-2", "deprecated", { replacedBy: "ghost" })).rejects.toThrow(/does not exist/);
  });

  it("searches by name, tags, concepts, description and primitive keywords", async () => {
    const { lib } = await fresh();
    await lib.save(spec(), { tags: ["logistics"], concepts: ["cold chain"] });
    await lib.save(
      { name: "add-file", language: "technical", canvas: 16, elements: [{ primitive: "document", x: 3, y: 1, width: 10, height: 14 }] } as never,
      { status: "published" },
    );
    expect(lib.search("cold chain")[0]?.record.spec.name).toBe("cold-warehouse");
    expect(lib.search("frozen")[0]?.record.spec.name).toBe("cold-warehouse");
    expect(lib.search("invoice")[0]?.record.spec.name).toBe("add-file");
    expect(lib.search("logistics", { status: ["published"] })).toEqual([]);
    expect(lib.search("").length).toBe(2);
  });

  it("stores user-defined elements, extends the registry, and protects built-ins and usages", async () => {
    const { lib } = await fresh();
    await expect(lib.saveElement({ name: "circle", category: "shape", keywords: [], outline: ["M0 0 L1 1 Z"] })).rejects.toThrow(/built-in/);
    const cat = await lib.saveElement({
      name: "cat",
      category: "object",
      keywords: ["cat"],
      outline: ["M0 20 L0 6 L6 0 L9 3 L15 3 L18 0 L24 6 L24 20 Z"],
    });
    expect(cat.status).toBe("draft");
    expect(lib.registry().get("cat").origin).toBe("draft");
    await lib.save({ name: "cat-alert", language: "technical", canvas: 16, elements: [{ primitive: "cat", x: 2, y: 2, size: 12 }] } as never);
    expect(lib.usages("cat").map((i) => i.spec.name)).toEqual(["cat-alert"]);
    await expect(lib.removeElement("cat")).rejects.toThrow(/used by cat-alert/);
    await lib.setElementStatus("cat", "approved");
    expect(lib.registry().get("cat").origin).toBe("approved");
    const reopened = await Library.open(new MemoryStore(files(lib)));
    expect(reopened.getElement("cat")?.status).toBe("approved");
  });

  it("snapshots every file, languages and exemplars included", async () => {
    const { lib } = await fresh();
    await lib.save(spec());
    const snap = await lib.snapshot();
    expect(Object.keys(snap)).toContain("languages/technical/language.json");
    expect(Object.keys(snap).some((p) => p.startsWith("languages/technical/exemplars/"))).toBe(true);
    expect(Object.keys(snap)).toContain("icons/cold-warehouse.json");
    // A snapshot is enough to rebuild the library elsewhere.
    expect((await Library.open(new MemoryStore(snap))).icons()).toHaveLength(1);
  });
});

describe("Library: concepts", () => {
  const cold = {
    id: "cold-storage",
    name: "Cold storage",
    description: "A warehouse held below ambient temperature",
    aliases: ["refrigerated", "chilled", "temperature controlled", "cold chain"],
    composition: {
      arrangement: "badge" as const,
      parts: [
        { element: "warehouse", priority: "essential" as const },
        { element: "snowflake", priority: "optional" as const },
      ],
    },
  };

  it("stores a concept with its decomposition and reopens it", async () => {
    const { store, lib } = await fresh();
    await lib.saveConcept(cold);
    const reopened = await Library.open(store);
    const got = reopened.getConcept("cold-storage")!;
    expect(got.status).toBe("active");
    expect(got.composition?.arrangement).toBe("badge");
    expect(got.composition?.parts).toHaveLength(2);
  });

  it("resolves words to a concept by id, name, alias, and inside a phrase", async () => {
    const { lib } = await fresh();
    await lib.saveConcept(cold);
    expect(lib.resolveConcept("cold-storage")?.id).toBe("cold-storage");
    expect(lib.resolveConcept("Cold storage")?.id).toBe("cold-storage");
    expect(lib.resolveConcept("refrigerated")?.id).toBe("cold-storage");
    expect(lib.resolveConcept("an icon for the chilled depot")?.id).toBe("cold-storage");
    expect(lib.resolveConcept("dragon")).toBeUndefined();
  });

  it("a concept with no published icon is a gap", async () => {
    const { lib } = await fresh();
    await lib.saveConcept(cold);
    expect(lib.gaps().map((c) => c.id)).toEqual(["cold-storage"]);

    await lib.save(spec({ concept: undefined }), { concept: "cold-storage" });
    // A draft does not answer it; only a published icon does.
    expect(lib.gaps().map((c) => c.id)).toEqual(["cold-storage"]);
    await lib.setStatus("cold-warehouse", "published");
    expect(lib.gaps()).toEqual([]);
    expect(lib.iconForConcept("cold-storage")?.spec.name).toBe("cold-warehouse");
  });

  it("refuses a second published icon for the same concept in the same language", async () => {
    const { lib } = await fresh();
    await lib.saveConcept(cold);
    await lib.save(spec(), { concept: "cold-storage", status: "published" });
    await lib.save(spec({ name: "rival" }), { concept: "cold-storage" });
    await expect(lib.setStatus("rival", "published")).rejects.toThrow(/already the published icon/);
    // Drafts may conflict freely; only publishing costs something.
    expect(lib.get("rival")?.status).toBe("draft");
  });

  it("allows the same concept once per language", async () => {
    const { lib } = await fresh();
    await lib.saveLanguage(lucideInspired);
    await lib.saveConcept(cold);
    await lib.save(spec(), { concept: "cold-storage", status: "published" });
    const other = spec({
      name: "cold-warehouse-24",
      language: "lucide-inspired",
      canvas: 24,
      elements: [{ primitive: "warehouse", x: 2, y: 4, width: 20, height: 16 }],
    });
    await expect(lib.save(other, { concept: "cold-storage", status: "published" })).resolves.toBeTruthy();
    expect(lib.iconForConcept("cold-storage", "lucide-inspired")?.spec.name).toBe("cold-warehouse-24");
  });

  it("refuses an icon pointing at a concept that does not exist, and a concept still in use", async () => {
    const { lib } = await fresh();
    await expect(lib.save(spec(), { concept: "ghost" })).rejects.toThrow(/no concept "ghost"/);
    await lib.saveConcept(cold);
    await lib.save(spec(), { concept: "cold-storage" });
    await expect(lib.removeConcept("cold-storage")).rejects.toThrow(/answered by cold-warehouse/);
  });

  it("keeps an icon's concept across a reopen", async () => {
    const { store, lib } = await fresh();
    await lib.saveConcept(cold);
    await lib.save(spec(), { concept: "cold-storage", status: "published" });
    const reopened = await Library.open(store);
    expect(reopened.get("cold-warehouse")?.concept).toBe("cold-storage");
    // Which is what makes the registry answer a brief without a model.
    expect(reopened.iconForConcept("cold-storage")?.spec.name).toBe("cold-warehouse");
    expect(reopened.gaps()).toEqual([]);
  });

  it("keeps concepts in the snapshot", async () => {
    const { lib } = await fresh();
    await lib.saveConcept(cold);
    const snap = await lib.snapshot();
    expect(Object.keys(snap)).toContain("concepts/cold-storage.json");
    expect((await Library.open(new MemoryStore(snap))).concepts()).toHaveLength(1);
  });
});
