import { describe, expect, it } from "vitest";
import { lucideInspired } from "@icon-foundry/icon-language";
import { validateIconSpec } from "@icon-foundry/icon-validator";
import { createKeywordIntentParser, createLlmIntentParser, intentToSpec, parseIntentKeywords } from "./index.js";

describe("parseIntentKeywords", () => {
  it("maps the canonical example to warehouse + snowflake + thermometer", () => {
    const intent = parseIntentKeywords("filled icon for temperature controlled warehouse, cold storage");
    expect(intent.subject).toBe("warehouse");
    expect(intent.modifiers).toEqual(["thermometer", "snowflake"]);
    expect(intent.style).toBe("filled");
  });

  it("prefers objects as subject regardless of word order", () => {
    expect(parseIntentKeywords("alert for a shipment").subject).toBe("package");
    expect(parseIntentKeywords("alert for a shipment").modifiers).toEqual(["warning"]);
  });

  it("falls back to the first matched primitive when no object is present", () => {
    expect(parseIntentKeywords("add").subject).toBe("plus");
  });

  it("handles simple plurals", () => {
    expect(parseIntentKeywords("documents").subject).toBe("document");
  });

  it("throws on unknown concepts", () => {
    expect(() => parseIntentKeywords("quantum flux capacitor")).toThrow(/Could not map/);
  });
});

describe("intentToSpec", () => {
  it("fits a single subject into the keyline box of its optical shape", () => {
    const wide = intentToSpec({ subject: "warehouse", modifiers: [], text: "warehouse" }, lucideInspired);
    expect(wide.elements[0]).toMatchObject({ primitive: "warehouse", x: 2, y: 4, width: 20, height: 16 });
    const tall = intentToSpec({ subject: "document", modifiers: [], text: "document" }, lucideInspired);
    expect(tall.elements[0]).toMatchObject({ x: 4, y: 2, width: 16, height: 20 });
    const round = intentToSpec({ subject: "clock", modifiers: [], text: "clock" }, lucideInspired);
    expect(round.elements[0]).toMatchObject({ x: 2, y: 2, width: 20, height: 20 });
    expect(validateIconSpec(wide, lucideInspired).issues).toEqual([]);
  });

  it("lays out for a requested optical size", () => {
    const spec = intentToSpec({ subject: "warehouse", modifiers: ["snowflake"], text: "cold warehouse" }, lucideInspired, { canvas: 16 });
    expect(spec.canvas).toBe(16);
    expect(validateIconSpec(spec, lucideInspired).issues).toEqual([]);
  });

  it("produces a valid, on-grid badge layout for one and two modifiers", () => {
    for (const modifiers of [["snowflake"], ["snowflake", "thermometer"]]) {
      const spec = intentToSpec({ subject: "warehouse", modifiers, text: "temperature controlled warehouse" }, lucideInspired);
      const result = validateIconSpec(spec, lucideInspired);
      expect(result.issues).toEqual([]);
      expect(result.passed).toContain("negativeSpace");
      expect(spec.name).toBe("temperature-controlled-warehouse");
    }
  });
});

describe("createLlmIntentParser", () => {
  it("accepts well-formed model output and rejects hallucinated primitives", async () => {
    const good = createLlmIntentParser({
      complete: async () => 'Sure! {"subject":"vehicle","modifiers":["clock"],"style":null}',
    });
    expect(await good.parse("late truck")).toMatchObject({ subject: "vehicle", modifiers: ["clock"] });

    const bad = createLlmIntentParser({ complete: async () => '{"subject":"dragon","modifiers":[]}' });
    await expect(bad.parse("dragon")).rejects.toThrow(/known primitive/);
  });

  it("falls back to the keyword parser when the model output is unusable", async () => {
    const parser = createLlmIntentParser({
      complete: async () => "I cannot help with that.",
      fallback: createKeywordIntentParser(),
    });
    expect(await parser.parse("delivery truck")).toMatchObject({ subject: "vehicle" });
  });
});
