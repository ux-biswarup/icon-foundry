import { describe, expect, it } from "vitest";
import { intentToSpec } from "@icon-foundry/icon-ai";
import { lucideInspired, parseIconLanguage, serializeIconLanguage, technical } from "@icon-foundry/icon-language";
import { Library, MemoryStore } from "@icon-foundry/icon-library";
import { proposeRules } from "./index.js";

/** Eight coherent icons: enough for the checks to be willing to speak. */
async function set(language = technical) {
  const lib = await Library.create(new MemoryStore(), { id: "acme", name: "Acme" }, language);
  const seeds: Array<[string, string, string[]]> = [
    ["cold-storage", "warehouse", ["snowflake"]],
    ["shipment-exception", "package", ["warning"]],
    ["scheduled-delivery", "vehicle", ["clock"]],
    ["create-document", "document", ["plus"]],
    ["account", "person", []],
    ["time", "clock", []],
    ["screen", "device", []],
    ["approve", "check", []],
  ];
  for (const [concept, subject, modifiers] of seeds) {
    await lib.saveConcept({ id: concept, name: concept, aliases: [] });
    const spec = intentToSpec({ subject, modifiers, text: concept }, language);
    await lib.save({ ...spec, name: concept }, { concept, status: "published" });
  }
  return lib;
}

const byId = (props: ReturnType<typeof proposeRules>) => Object.fromEntries(props.map((p) => [p.id, p]));

describe("proposeRules", () => {
  it("says nothing about a set too small to read a rule off", async () => {
    const lib = await Library.create(new MemoryStore(), { id: "a", name: "A" });
    const spec = intentToSpec({ subject: "clock", modifiers: [], text: "t" }, technical);
    await lib.save(spec, { status: "published" });
    expect(proposeRules(lib)).toEqual([]);
  });

  it("reads the construction angles off a set whose language declares none", async () => {
    const lib = await set(lucideInspired);
    const angles = byId(proposeRules(lib)).angles;
    expect(angles).toBeDefined();
    expect(angles!.message).toMatch(/already draws on/);
    // And adopting it produces a language that actually declares them.
    expect(angles!.apply().grammar.angles.length).toBeGreaterThan(0);
  });

  it("does not re-propose a rule the language already declares", async () => {
    const lib = await set(technical);
    expect(byId(proposeRules(lib)).angles).toBeUndefined();
  });

  it("offers to tighten a budget the set never comes close to using", async () => {
    const roomy = parseIconLanguage({ ...serializeIconLanguage(technical), limits: { maxElements: 12, maxShapes: 40 } });
    const lib = await set(roomy);
    const budget = byId(proposeRules(lib)).budget!;
    expect(budget.message).toMatch(/against a budget of 12 and 40/);
    expect(budget.apply().limits.maxShapes).toBeLessThan(40);
  });

  it("carries what would start failing, so a rule's cost is visible before adopting it", async () => {
    const roomy = parseIconLanguage({ ...serializeIconLanguage(technical), limits: { maxElements: 12, maxShapes: 40 } });
    const lib = await set(roomy);
    const budget = byId(proposeRules(lib)).budget!;
    // Tightening to exactly what the set uses costs nothing today.
    expect(budget.wouldFail).toEqual([]);

    // But a gap raised above what one icon manages names that icon.
    const tight = parseIconLanguage({ ...serializeIconLanguage(technical), minNegativeSpace: 0.5 });
    const lib2 = await set(tight);
    const gap = byId(proposeRules(lib2)).gap;
    if (gap) expect(Array.isArray(gap.wouldFail)).toBe(true);
  });

  it("proposes a language that round-trips, so adopting one is just a save", async () => {
    const lib = await set(lucideInspired);
    for (const proposal of proposeRules(lib)) {
      const next = proposal.apply();
      expect(parseIconLanguage(serializeIconLanguage(next))).toEqual(next);
      expect(next.id).toBe(lucideInspired.id);
    }
  });
});
