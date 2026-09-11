import { describe, expect, it } from "vitest";
import { Library, LibraryError, MemoryStore } from "./index.js";

const warehouse = {
  name: "cold-warehouse",
  language: "lucide-inspired",
  canvas: 24,
  meta: { description: "Temperature controlled warehouse" },
  elements: [
    { primitive: "warehouse", x: 2, y: 9, width: 15, height: 11, align: { x: "start", y: "end" } },
    { primitive: "snowflake", x: 15, y: 2, size: 7 },
  ],
} as const;

async function fresh() {
  const store = new MemoryStore();
  const lib = await Library.create(store, { id: "acme", name: "Acme Icons", language: "lucide-inspired" });
  return { store, lib };
}

describe("Library", () => {
  it("creates a folder with a manifest and reopens it", async () => {
    const { store, lib } = await fresh();
    expect(Object.keys(store.toJSON())).toEqual(["icon-foundry.json"]);
    expect(lib.language.id).toBe("lucide-inspired");
    await lib.save(structuredClone(warehouse) as never, { tags: ["logistics"], concepts: ["cold chain"] });
    const reopened = await Library.open(store);
    expect(reopened.icons().map((i) => i.spec.name)).toEqual(["cold-warehouse"]);
    expect(reopened.get("cold-warehouse")?.status).toBe("draft");
  });

  it("refuses unknown formats and languages", async () => {
    await expect(Library.open(new MemoryStore({ "icon-foundry.json": '{"format":2,"id":"x","name":"X","language":"lucide-inspired"}' }))).rejects.toThrow(/unsupported format/);
    await expect(Library.create(new MemoryStore(), { id: "x", name: "X", language: "nope" })).rejects.toThrow(LibraryError);
  });

  it("enforces the lifecycle", async () => {
    const { lib } = await fresh();
    await lib.save(structuredClone(warehouse) as never);
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
    await lib.save(structuredClone(warehouse) as never, { status: "published" });
    await lib.save({ ...structuredClone(warehouse), name: "cold-warehouse-2" } as never, { status: "published" });
    const dep = await lib.setStatus("cold-warehouse", "deprecated", { replacedBy: "cold-warehouse-2" });
    expect(dep.replacedBy).toBe("cold-warehouse-2");
    await expect(lib.setStatus("cold-warehouse-2", "deprecated", { replacedBy: "ghost" })).rejects.toThrow(/does not exist/);
  });

  it("searches by name, tags, concepts, description and primitive keywords", async () => {
    const { lib } = await fresh();
    await lib.save(structuredClone(warehouse) as never, { tags: ["logistics"], concepts: ["cold chain"] });
    await lib.save(
      { name: "add-file", language: "lucide-inspired", canvas: 24, elements: [{ primitive: "document", x: 4, y: 2, width: 16, height: 20 }] } as never,
      { status: "published" },
    );
    expect(lib.search("cold chain")[0]?.record.spec.name).toBe("cold-warehouse");
    expect(lib.search("frozen")[0]?.record.spec.name).toBe("cold-warehouse"); // snowflake keyword
    expect(lib.search("invoice")[0]?.record.spec.name).toBe("add-file"); // document keyword
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
    await lib.save({ name: "cat-alert", language: "lucide-inspired", canvas: 24, elements: [{ primitive: "cat", x: 3, y: 3, size: 18 }] } as never);
    expect(lib.usages("cat").map((i) => i.spec.name)).toEqual(["cat-alert"]);
    await expect(lib.removeElement("cat")).rejects.toThrow(/used by cat-alert/);
    await lib.setElementStatus("cat", "approved");
    expect(lib.registry().get("cat").origin).toBe("approved");
    const reopened = await Library.open(new MemoryStore((lib as unknown as { store: MemoryStore }).store.toJSON()));
    expect(reopened.getElement("cat")?.status).toBe("approved");
  });
});
