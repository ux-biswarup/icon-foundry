import { describe, expect, it } from "vitest";
import { intentToSpec } from "@icon-foundry/icon-ai";
import { parseIconLanguage, serializeIconLanguage, technical } from "@icon-foundry/icon-language";
import { Library, MemoryStore } from "@icon-foundry/icon-library";
import { auditLibrary } from "./index.js";

async function coherent() {
  const lib = await Library.create(new MemoryStore(), { id: "acme", name: "Acme" });
  const seeds: Array<[string, string, string[]]> = [
    ["cold-storage", "warehouse", ["snowflake"]],
    ["shipment-exception", "package", ["warning"]],
    ["scheduled-delivery", "vehicle", ["clock"]],
    ["create-document", "document", ["plus"]],
    ["account", "person", []],
  ];
  for (const [concept, subject, modifiers] of seeds) {
    await lib.saveConcept({ id: concept, name: concept, aliases: [] });
    const spec = intentToSpec({ subject, modifiers, text: concept }, technical);
    await lib.save({ ...spec, name: concept }, { concept, status: "published" });
  }
  return lib;
}

const ids = (findings: ReturnType<typeof auditLibrary>) => [...new Set(findings.map((f) => f.id))].sort();

describe("auditLibrary", () => {
  it("says nothing about a coherent set", async () => {
    expect(auditLibrary(await coherent())).toEqual([]);
  });

  it("does not call anything an outlier until there are enough siblings to judge against", async () => {
    const lib = await coherent();
    // Five icons that legitimately differ (some badged, some not) must not
    // produce outliers; the check only speaks once a set is big enough.
    expect(auditLibrary(lib).filter((f) => f.id === "outlier")).toEqual([]);
    for (const [name, subject] of [["a", "clock"], ["b", "square"], ["c", "circle"], ["d", "triangle"]] as const) {
      await lib.saveConcept({ id: name, name, aliases: [] });
      const spec = intentToSpec({ subject, modifiers: [], text: name }, technical);
      await lib.save({ ...spec, name }, { concept: name, status: "published" });
    }
    // With nine icons it is willing to judge, and may or may not find one.
    expect(() => auditLibrary(lib)).not.toThrow();
  });

  it("is silent on an empty library rather than inventing findings", async () => {
    const lib = await Library.create(new MemoryStore(), { id: "a", name: "A" });
    expect(auditLibrary(lib)).toEqual([]);
  });

  it("ignores drafts, because an unfinished icon is not drift", async () => {
    const lib = await coherent();
    const spec = intentToSpec({ subject: "person", modifiers: [], text: "twin" }, technical);
    await lib.save({ ...spec, name: "twin" });
    expect(auditLibrary(lib)).toEqual([]);
    await lib.setStatus("twin", "review");
    expect(ids(auditLibrary(lib))).toContain("duplicate-geometry");
  });

  it("finds two icons that draw exactly the same thing", async () => {
    const lib = await coherent();
    const spec = intentToSpec({ subject: "person", modifiers: [], text: "twin" }, technical);
    await lib.save({ ...spec, name: "twin" }, { status: "review" });
    const finding = auditLibrary(lib).find((f) => f.id === "duplicate-geometry")!;
    expect(finding.icons.sort()).toEqual(["account", "twin"]);
    expect(finding.message).toMatch(/same geometry/);
  });

  it("finds a published icon with no meaning attached", async () => {
    const lib = await coherent();
    const spec = intentToSpec({ subject: "device", modifiers: [], text: "screen" }, technical);
    await lib.save({ ...spec, name: "screen" }, { status: "published" });
    const finding = auditLibrary(lib).find((f) => f.id === "no-concept")!;
    expect(finding.icons).toEqual(["screen"]);
  });

  it("finds two icons claiming one meaning, which publishing alone cannot catch", async () => {
    const lib = await coherent();
    const spec = intentToSpec({ subject: "building", modifiers: ["snowflake"], text: "rival" }, technical);
    await lib.save({ ...spec, name: "rival" }, { concept: "cold-storage", status: "review" });
    const finding = auditLibrary(lib).find((f) => f.id === "concept-conflict")!;
    expect(finding.icons.sort()).toEqual(["cold-storage", "rival"]);
  });

  it("finds a badge that is a different size from every other badge", async () => {
    const lib = await coherent();
    const spec = intentToSpec({ subject: "building", modifiers: ["plus"], text: "odd" }, technical);
    const odd = { ...spec, name: "odd-badge", elements: [spec.elements[0]!, { ...spec.elements[1]!, width: 3, height: 3 }] };
    await lib.saveConcept({ id: "odd", name: "Odd", aliases: [] });
    await lib.save(odd, { concept: "odd", status: "published" });
    const finding = auditLibrary(lib).find((f) => f.id === "badge-consistency")!;
    expect(finding.icons).toEqual(["odd-badge"]);
    expect(finding.message).toMatch(/where \d+ other/);
  });

  it("finds an icon that drifted from the language it is stored against", async () => {
    const lib = await coherent();
    const spec = intentToSpec({ subject: "warehouse", modifiers: ["snowflake"], text: "tight" }, technical);
    // Push the badge into the subject so the gap rule now has something to say.
    const tight = { ...spec, name: "tight", elements: [spec.elements[0]!, { ...spec.elements[1]!, x: 7, y: 5 }] };
    await lib.saveConcept({ id: "tight", name: "Tight", aliases: [] });
    await lib.save(tight, { concept: "tight", status: "published" });
    const finding = auditLibrary(lib).find((f) => f.id === "drift")!;
    expect(finding.icons).toEqual(["tight"]);
  });

  it("never blocks: every finding is information, not a verdict", async () => {
    const lib = await coherent();
    const spec = intentToSpec({ subject: "person", modifiers: [], text: "twin" }, technical);
    await lib.save({ ...spec, name: "twin" }, { status: "published" });
    for (const finding of auditLibrary(lib)) {
      expect(["info", "warning"]).toContain(finding.severity);
      expect(finding.icons.length).toBeGreaterThan(0);
      expect(finding.message.length).toBeGreaterThan(10);
    }
  });
});

describe("construction exceptions", () => {
  const withExceptions = (exceptions: Record<string, { set: Record<string, unknown>; why: string }>) =>
    parseIconLanguage({
      ...JSON.parse(JSON.stringify(serializeIconLanguage(technical))),
      construction: { exceptions },
    });

  it("reports a part drawn against the language, with the reason beside it", async () => {
    const lib = await Library.create(new MemoryStore(), { id: "a", name: "A" });
    await lib.saveLanguage(
      withExceptions({ vehicle: { set: { accentSize: 1.4 }, why: "the wheels vanished at 16px" } }),
      { note: "one exception" },
    );
    const findings = auditLibrary(lib);
    const one = findings.find((f) => f.id === "construction-exception");
    expect(one).toBeDefined();
    expect(one!.message).toContain("vehicle");
    expect(one!.message).toContain("the wheels vanished at 16px");
    // It is a report, never a block.
    expect(one!.severity).toBe("info");
  });

  it("says nothing when no part departs", async () => {
    const lib = await Library.create(new MemoryStore(), { id: "b", name: "B" });
    expect(auditLibrary(lib).some((f) => f.id.startsWith("construction-exception"))).toBe(false);
  });

  it("escalates when a value most parts escape is probably the wrong value", async () => {
    const lib = await Library.create(new MemoryStore(), { id: "c", name: "C" });
    await lib.saveLanguage(
      withExceptions({
        vehicle: { set: { accentSize: 1.4 }, why: "wheels too small" },
        person: { set: { accentSize: 1.4 }, why: "head too small" },
        location: { set: { accentSize: 1.4 }, why: "dot too small" },
      }),
      { note: "three exceptions on one trait" },
    );
    const cluster = auditLibrary(lib).find((f) => f.id === "exception-cluster");
    expect(cluster).toBeDefined();
    expect(cluster!.severity).toBe("warning");
    expect(cluster!.message).toContain("accentSize");
  });
});
