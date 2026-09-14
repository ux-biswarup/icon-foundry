import { describe, expect, it } from "vitest";
import { parseIconLanguage, serializeIconLanguage, technical, type IconLanguage } from "@icon-foundry/icon-language";
import { parseIconSpec, type IconSpec } from "@icon-foundry/icon-spec";
import { composeConcept, resolveSpec } from "./layout.js";

const CANVAS = technical.defaultCanvas;
/** Two square keylines to compare: roomy, and tight. */
const ROOMY = CANVAS - 2;
const TIGHT = CANVAS - 6;

/** The same language with one keyline box resized. Nothing else moves. */
function withSquareBox(width: number): IconLanguage {
  const file = serializeIconLanguage(technical);
  const offset = (CANVAS - width) / 2;
  return parseIconLanguage({
    ...file,
    optical: {
      ...(file as { optical?: Record<string, unknown> }).optical,
      square: { x: offset, y: offset, width, height: width },
    },
  });
}

const square: IconSpec = composeConcept(
  { arrangement: "single", parts: [{ element: "square", priority: "essential" }] },
  technical,
  { name: "a-square" },
);

describe("the keyline sheet governs the set", () => {
  it("stores what an icon is made of, not where its parts sit", () => {
    expect(square.composition?.parts.map((p) => p.element)).toEqual(["square"]);
    expect(square.elements).toBeUndefined();
  });

  it("moves an already-drawn icon when its keyline box changes", () => {
    const before = resolveSpec(square, withSquareBox(ROOMY)).elements[0]!;
    const after = resolveSpec(square, withSquareBox(TIGHT)).elements[0]!;

    expect(before).toMatchObject({ width: ROOMY, height: ROOMY });
    expect(after).toMatchObject({ width: TIGHT, height: TIGHT });
    // Still centred, because the origin is derived rather than stored.
    expect(after.x).toBe((CANVAS - TIGHT) / 2);
  });

  it("keeps a pinned part where it was put, and lets the rest follow", () => {
    const badge = composeConcept(
      {
        arrangement: "badge",
        parts: [
          { element: "warehouse", priority: "essential" },
          { element: "snowflake", priority: "essential", except: { box: { x: 1, y: 1, width: 4, height: 4 }, why: "the snowflake reads small at 24 and needs the corner" } },
        ],
      },
      technical,
      { name: "pinned" },
    );

    const wide = resolveSpec(badge, withSquareBox(ROOMY)).elements;
    const narrow = resolveSpec(badge, withSquareBox(TIGHT)).elements;

    // The exception is honoured under both languages...
    expect(wide[1]).toMatchObject({ x: 1, y: 1, width: 4, height: 4 });
    expect(narrow[1]).toMatchObject({ x: 1, y: 1, width: 4, height: 4 });
    // ...while everything it did not pin still answers to the sheet.
    expect(wide[0]).toBeDefined();
  });

  it("refuses an exception that does not say why", () => {
    const withNoReason = {
      name: "no-reason",
      language: technical.id,
      canvas: CANVAS,
      composition: {
        arrangement: "single",
        parts: [{ element: "square", priority: "essential", except: { box: { x: 1, y: 1, width: 4, height: 4 } } }],
      },
    };
    expect(() => parseIconSpec(withNoReason)).toThrow(/indistinguishable from drift/);
  });

  it("refuses a spec that carries both a composition and its own geometry", () => {
    expect(() =>
      parseIconSpec({
        name: "both",
        language: technical.id,
        canvas: 24,
        composition: { arrangement: "single", parts: [{ element: "square", priority: "essential" }] },
        elements: [{ primitive: "square", x: 2, y: 2, size: 20 }],
      }),
    ).toThrow(/not both/);
  });
});
