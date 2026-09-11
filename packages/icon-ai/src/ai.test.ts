import { describe, expect, it } from "vitest";
import { lucideInspired, parseIconLanguage, technical } from "@icon-foundry/icon-language";
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

describe("recipes follow the language grammar", () => {
  it("places the badge in the corner the grammar names, and moves the subject away from it", () => {
    const topRight = intentToSpec({ subject: "warehouse", modifiers: ["snowflake"], text: "cold warehouse" }, technical);
    const badge = topRight.elements[1]!;
    expect(badge.y).toBe(technical.safeArea);
    expect(badge.x).toBeGreaterThan(technical.canvas / 2);
    expect(topRight.elements[0]!.align).toMatchObject({ x: "start", y: "end" });

    const flipped = parseIconLanguage({ ...technical, sizes: undefined, grammar: { ...technical.grammar, badge: { ratio: 0.35, corner: "bottom-left" } } });
    const bottomLeft = intentToSpec({ subject: "warehouse", modifiers: ["snowflake"], text: "cold warehouse" }, flipped);
    const badge2 = bottomLeft.elements[1]!;
    expect(badge2.x).toBe(flipped.safeArea);
    expect(badge2.y).toBeGreaterThan(flipped.canvas / 2);
    expect(bottomLeft.elements[0]!.align).toMatchObject({ x: "end", y: "start" });
    expect(validateIconSpec(bottomLeft, flipped).issues).toEqual([]);
  });

  it("uses the badge ratio from the grammar", () => {
    const small = parseIconLanguage({ ...technical, sizes: undefined, grammar: { ...technical.grammar, badge: { ratio: 0.2, corner: "top-right" } } });
    const spec = intentToSpec({ subject: "warehouse", modifiers: ["snowflake"], text: "x" }, small);
    const wide = intentToSpec({ subject: "warehouse", modifiers: ["snowflake"], text: "x" }, technical);
    expect(spec.elements[1]!.width!).toBeLessThan(wide.elements[1]!.width!);
  });

  it("keeps every generated icon inside the language's construction and gap rules", () => {
    for (const canvas of [16, 24]) {
      for (const modifiers of [[], ["snowflake"], ["snowflake", "thermometer"]]) {
        const spec = intentToSpec({ subject: "warehouse", modifiers, text: "warehouse" }, technical, { canvas });
        expect(validateIconSpec(spec, technical).issues).toEqual([]);
      }
    }
  });
});

describe("icon naming", () => {
  const name = (text: string, modifiers: string[] = ["snowflake"]) =>
    intentToSpec({ subject: "warehouse", modifiers, text }, technical).name;

  it("names an icon after a short brief", () => {
    expect(name("temperature controlled warehouse")).toBe("temperature-controlled-warehouse");
  });

  it("falls back to the parts when the brief is a sentence", () => {
    expect(name("a cold storage warehouse, and maybe a cat")).toBe("snowflake-warehouse");
    expect(name("we need something for the refrigerated depot on the overview screen")).toBe("snowflake-warehouse");
  });

  it("still names a bare subject", () => {
    expect(name("warehouse", [])).toBe("warehouse");
  });
});
