import { describe, expect, it } from "vitest";
import { technical } from "@icon-foundry/icon-language";
import { Library, MemoryStore, type ElementRecord } from "@icon-foundry/icon-library";
import { previewElementChange } from "./index.js";

const cat: Omit<ElementRecord, "createdAt" | "updatedAt" | "status"> = {
  name: "cat",
  category: "object",
  keywords: ["cat"],
  outline: ["M0 20 L0 6 L6 0 L9 3 L15 3 L18 0 L24 6 L24 20 Z"],
};

async function withCat() {
  const lib = await Library.create(new MemoryStore(), { id: "acme", name: "Acme" });
  await lib.saveElement(cat);
  for (const name of ["cat-one", "cat-two"]) {
    await lib.save(
      { name, language: "technical", canvas: 16, elements: [{ primitive: "cat", x: 2, y: 2, size: 12 }] },
      { status: "published" },
    );
  }
  await lib.save(
    { name: "unrelated", language: "technical", canvas: 16, elements: [{ primitive: "clock", x: 1, y: 1, size: 14 }] },
    { status: "published" },
  );
  return lib;
}

describe("previewElementChange", () => {
  it("names every icon that uses the element, and no others", async () => {
    const lib = await withCat();
    const impacts = previewElementChange(lib, { ...lib.getElement("cat")!, outline: ["M0 20 L0 8 L12 0 L24 8 L24 20 Z"] });
    expect(impacts.map((i) => i.icon.spec.name).sort()).toEqual(["cat-one", "cat-two"]);
  });

  it("shows the drawing before and after, and says which ones actually change", async () => {
    const lib = await withCat();
    const impacts = previewElementChange(lib, { ...lib.getElement("cat")!, outline: ["M0 20 L0 8 L12 0 L24 8 L24 20 Z"] });
    for (const impact of impacts) {
      expect(impact.changed).toBe(true);
      expect(impact.before.svg).toBeTruthy();
      expect(impact.after.svg).toBeTruthy();
      expect(impact.before.svg).not.toBe(impact.after.svg);
    }
  });

  it("reports no change when the geometry is the same", async () => {
    const lib = await withCat();
    const impacts = previewElementChange(lib, { ...lib.getElement("cat")!, keywords: ["cat", "kitten"] });
    expect(impacts.every((i) => !i.changed)).toBe(true);
  });

  it("names rules an edit would newly break, so the cost is visible first", async () => {
    const lib = await withCat();
    // A shape with a 27° edge breaks the language's 45° construction rule.
    const impacts = previewElementChange(lib, { ...lib.getElement("cat")!, outline: ["M0 20 L0 6 L12 0 L24 6 L24 20 Z"] });
    expect(impacts.every((i) => i.newIssues.includes("construction"))).toBe(true);
    // And nothing was written: the library still draws the old cat.
    expect(previewElementChange(lib, lib.getElement("cat")!).every((i) => !i.changed)).toBe(true);
  });
});
