import { describe, expect, it } from "vitest";
import { parseIconLanguage, serializeIconLanguage, technical } from "@icon-foundry/icon-language";
import type { ConceptComposition, IconSpec } from "@icon-foundry/icon-spec";
import { resolveSpec } from "@icon-foundry/icon-composer";
import { renderSpecToSvg } from "@icon-foundry/icon-renderer";
import { validateIconSpec } from "@icon-foundry/icon-validator";
import { ConceptError, composeConcept, pruneParts } from "./index.js";

const server: ConceptComposition = {
  arrangement: "stack",
  parts: [
    { element: "rounded-rectangle", role: "unit", count: 2, priority: "essential" },
    { element: "rounded-rectangle", role: "unit", count: 1, priority: "optional" },
    { element: "minus", role: "indicator", count: 1, priority: "optional" },
  ],
};
const coldStore: ConceptComposition = {
  arrangement: "badge",
  parts: [
    { element: "warehouse", priority: "essential" },
    { element: "snowflake", priority: "optional" },
  ],
};

const compile = (c: ConceptComposition, canvas?: number, name = "t") =>
  composeConcept(c, technical, { name, ...(canvas !== undefined && { canvas }) });

/** A compiled concept, placed. Geometry lives in the language, so a test that
 * wants boxes has to ask the language for them, exactly like a renderer does. */
const placed = (spec: IconSpec, language = technical) => resolveSpec(spec, language).elements;

describe("pruneParts", () => {
  it("keeps every essential part even past the budget", () => {
    const { parts, dropped } = pruneParts(server.parts, 1);
    expect(parts.map((p) => p.role)).toEqual(["unit"]);
    expect(parts[0]!.count).toBe(2); // two units, over a budget of one
    expect(dropped).toHaveLength(2);
  });

  it("adds optional parts in order while the budget can afford them", () => {
    expect(pruneParts(server.parts, 3).dropped.map((p) => p.element)).toEqual(["minus"]);
    expect(pruneParts(server.parts, 4).dropped).toEqual([]);
  });

  it("keeps the author's order rather than essential-first", () => {
    const parts = [
      { element: "a", priority: "optional" as const },
      { element: "b", priority: "essential" as const },
    ];
    expect(pruneParts(parts, 9).parts.map((p) => p.element)).toEqual(["a", "b"]);
  });
});

describe("composeConcept", () => {
  it("draws the same concept differently at two sizes, because the budget differs", () => {
    const small = compile(server, 16);
    const large = compile(server, 24);
    expect(placed(small).length).toBeLessThan(placed(large).length);
    expect((small.meta as Record<string, unknown>).pruned).toEqual(["minus"]);
    expect((large.meta as Record<string, unknown>).pruned).toBeUndefined();
    // And nobody drew either one.
    expect(validateIconSpec(small, technical).issues).toEqual([]);
    expect(validateIconSpec(large, technical).issues).toEqual([]);
  });

  it("produces a valid icon for every arrangement at every size", () => {
    const cases: Array<[string, ConceptComposition]> = [
      ["single", { arrangement: "single", parts: [{ element: "clock", priority: "essential" }] }],
      ["badge", coldStore],
      ["stack", server],
      ["row", { arrangement: "row", parts: [{ element: "square", count: 3, priority: "essential" }] }],
      [
        "contain",
        { arrangement: "contain", parts: [{ element: "rounded-rectangle", priority: "essential" }, { element: "check", priority: "essential" }] },
      ],
    ];
    for (const [name, composition] of cases) {
      for (const canvas of [16, 24, 32]) {
        const spec = compile(composition, canvas, `${name}-${canvas}`);
        const result = validateIconSpec(spec, technical);
        expect(result.valid, `${name}@${canvas}: ${result.issues.map((i) => i.message).join("; ")}`).toBe(true);
        expect(result.issues, `${name}@${canvas}`).toEqual([]);
      }
    }
  });

  it("keeps a series on the grid and inside its keyline box", () => {
    const spec = compile({ arrangement: "row", parts: [{ element: "square", count: 4, priority: "essential" }] }, 16);
    const tokens = technical.sizes[16]!;
    for (const el of placed(spec)) {
      for (const v of [el.x, el.y, el.width!, el.height!]) {
        expect(Math.abs(v / tokens.grid - Math.round(v / tokens.grid))).toBeLessThan(1e-9);
      }
      expect(el.x + el.width!).toBeLessThanOrEqual(tokens.canvas - tokens.safeArea + 1e-9);
    }
  });

  it("refuses an arrangement the language does not allow", () => {
    const strict = parseIconLanguage({
      ...serializeIconLanguage(technical),
      grammar: { ...technical.grammar, arrangements: { allowed: ["single", "badge"] } },
    });
    expect(() => composeConcept(server, strict, { name: "t" })).toThrow(ConceptError);
    expect(() => composeConcept(server, strict, { name: "t" })).toThrow(/does not allow the stack/);
  });

  it("refuses an element that is not in the vocabulary", () => {
    expect(() => compile({ arrangement: "single", parts: [{ element: "dragon", priority: "essential" }] })).toThrow(
      /no element named "dragon"/,
    );
  });

  it("renders one concept in two languages without changing the concept", () => {
    const base = serializeIconLanguage(technical);
    const other = parseIconLanguage({
      ...base,
      id: "playful",
      name: "Playful",
      // Let the badge size derive rather than inheriting Technical's override.
      grammar: { ...base.grammar, badge: { corner: "top-right" } },
      character: { ...technical.character, axes: { geometric: 10, minimal: 10, technical: 10, literal: 50 } },
    });
    const a = composeConcept(coldStore, technical, { name: "cold" });
    const b = composeConcept(coldStore, other, { name: "cold" });

    // The concept is untouched: same parts, same arrangement.
    expect(a.composition!.parts.map((p) => p.element)).toEqual(b.composition!.parts.map((p) => p.element));
    expect(a.meta).toMatchObject({ arrangement: "badge" });
    expect(b.meta).toMatchObject({ arrangement: "badge" });

    // The drawing is not. The badge derives larger in the more expressive
    // language, and the radius is heavier, so the SVG differs in both.
    expect(placed(b, other)[1]!.width!).toBeGreaterThan(placed(a)[1]!.width!);
    expect(renderSpecToSvg(a, technical)).not.toBe(renderSpecToSvg(b, other));
    expect(validateIconSpec(b, other).valid).toBe(true);
  });
});
