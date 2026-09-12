import { describe, expect, it } from "vitest";
import { intentToSpec } from "@icon-foundry/icon-ai";
import { technical } from "@icon-foundry/icon-language";
import { Library, MemoryStore } from "@icon-foundry/icon-library";
import { ALL_FORMATS, exportArchive, exportLibrary, zip } from "./index.js";

async function shipped() {
  const lib = await Library.create(new MemoryStore(), { id: "acme", name: "Acme Icons" });
  for (const [name, subject, modifiers] of [
    ["cold-store", "warehouse", ["snowflake"]],
    ["account", "person", []],
    ["approve", "check", []],
  ] as const) {
    const spec = intentToSpec({ subject, modifiers: [...modifiers], text: name }, technical);
    await lib.save({ ...spec, name }, { status: "published", tags: ["core"] });
  }
  const draft = intentToSpec({ subject: "clock", modifiers: [], text: "wip" }, technical);
  await lib.save({ ...draft, name: "wip" });
  return lib;
}

describe("exportLibrary", () => {
  it("ships published icons only: a draft is not a release", async () => {
    const files = exportLibrary(await shipped());
    expect(Object.keys(files).filter((f) => f.startsWith("svg/")).sort()).toEqual([
      "svg/account.svg",
      "svg/approve.svg",
      "svg/cold-store.svg",
    ]);
    expect(files["icons.ts"]).not.toContain("wip");
  });

  it("produces every format, each usable on its own", async () => {
    const files = exportLibrary(await shipped());
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining(["sprite.svg", "icons.ts", "icons.tsx", "icons.css", "icons.json"]),
    );
    expect(files["sprite.svg"]).toContain('<symbol id="icon-account"');
    expect(files["icons.ts"]).toMatch(/export const icons = \{/);
    expect(files["icons.tsx"]).toContain("export function ColdStore(props: IconProps)");
    // React needs camelCase attributes or it warns at runtime.
    expect(files["icons.tsx"]).not.toMatch(/stroke-width=/);
    expect(files["icons.css"]).toContain(".icon-account {");
  });

  it("records a stable codepoint so a later release can replace this one", async () => {
    const lib = await shipped();
    const before = exportLibrary(lib, { formats: ["manifest"] });
    expect(JSON.parse(before["icons.json"]!).icons.every((i: { codepoint: null }) => i.codepoint === null)).toBe(true);

    const assigned = await lib.assignCodepoints();
    expect([...assigned.values()].every((c) => c >= 0xe000)).toBe(true);
    const manifest = JSON.parse(exportLibrary(lib, { formats: ["manifest"] })["icons.json"]!);
    expect(manifest.icons.map((i: { codepoint: string }) => i.codepoint)).toEqual(["U+E000", "U+E001", "U+E002"]);

    // Adding an icon later must not move the ones already shipped.
    const spec = intentToSpec({ subject: "device", modifiers: [], text: "screen" }, technical);
    await lib.save({ ...spec, name: "screen" }, { status: "published" });
    const again = await lib.assignCodepoints();
    expect(again.get("account")).toBe(assigned.get("account"));
    expect(again.get("screen")).toBe(0xe003);
  });

  it("names the language it was generated from, so a set can be traced", async () => {
    const manifest = JSON.parse(exportLibrary(await shipped(), { formats: ["manifest"] })["icons.json"]!);
    expect(manifest.language).toMatchObject({ id: "technical", version: technical.version });
    expect(manifest.name).toBe("Acme Icons");
  });

  it("exports nothing rather than an empty shell when there is nothing published", async () => {
    const lib = await Library.create(new MemoryStore(), { id: "a", name: "A" });
    expect(exportLibrary(lib)).toEqual({});
  });

  it("honours the format list", async () => {
    const files = exportLibrary(await shipped(), { formats: ["svg"] });
    expect(Object.keys(files).every((f) => f.startsWith("svg/"))).toBe(true);
    expect(ALL_FORMATS.length).toBe(6);
  });
});

describe("zip", () => {
  it("writes an archive with the right signatures and every entry named", () => {
    const bytes = zip({ "a.txt": "hello", "nested/b.json": "{}" });
    expect(bytes[0]).toBe(0x50); // "P"
    expect(bytes[1]).toBe(0x4b); // "K"
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("a.txt");
    expect(text).toContain("nested/b.json");
    expect(text).toContain("hello");
    // End-of-central-directory signature, 0x06054b50 little-endian.
    const tail = bytes.slice(-22);
    expect([tail[0], tail[1], tail[2], tail[3]]).toEqual([0x50, 0x4b, 0x05, 0x06]);
  });

  it("packs a whole library into one archive", async () => {
    const bytes = exportArchive(await shipped());
    expect(bytes.length).toBeGreaterThan(500);
    expect(new TextDecoder().decode(bytes)).toContain("icons.json");
  });
});
