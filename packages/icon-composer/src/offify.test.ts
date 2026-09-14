import { describe, expect, it } from "vitest";
import { DIAGONAL_ANGLES, parseIconLanguage, resolveTokens, serializeIconLanguage, technical } from "@icon-foundry/icon-language";
import { parseIconSpec } from "@icon-foundry/icon-spec";
import { isInsideBand, sampleShape, pathShapeFromData } from "@icon-foundry/icon-primitives";
import { compose } from "./index.js";
import { offify, slashAngle, slashBand, slashGap, slashPath } from "./offify.js";

const bell = parseIconSpec({
  name: "bell",
  language: "technical",
  canvas: 16,
  elements: [{ primitive: "circle", x: 3, y: 3, size: 10 }],
});

const points = (spec: ReturnType<typeof offify>) =>
  compose(spec, technical).shapes.flatMap((item) => sampleShape(item.shape)).flat();
/** `elements` is optional on a spec and always present on an offified one. */
const partsOf = (spec: ReturnType<typeof offify>) => spec.elements ?? [];

describe("the slash", () => {
  it("cuts against the way the grammar's diagonals lean", () => {
    // technical runs up-right, so its slash is the up-left one: 45° in the
    // 0–180, y-down convention, which is the top-left to bottom-right stroke
    // Lucide hardcodes. A set that leans the other way gets the other slash.
    expect(technical.grammar.diagonal).toBe("up-right");
    expect(slashAngle(technical)).toBe(DIAGONAL_ANGLES["up-left"]);
    const other = parseIconLanguage({
      ...serializeIconLanguage(technical),
      grammar: { ...technical.grammar, diagonal: "up-left" },
    });
    expect(slashAngle(other)).toBe(DIAGONAL_ANGLES["up-right"]);
  });

  it("still picks a slash for a set that states no lean", () => {
    const neutral = parseIconLanguage({
      ...serializeIconLanguage(technical),
      grammar: { ...technical.grammar, diagonal: "none" },
    });
    expect(slashAngle(neutral)).toBe(DIAGONAL_ANGLES["up-left"]);
  });

  it("never picks an angle the language forbids", () => {
    // A language of right angles only cannot draw a 45° slash, so it does not.
    const orthogonal = parseIconLanguage({
      ...serializeIconLanguage(technical),
      grammar: { ...technical.grammar, angles: [0, 90] },
    });
    expect([0, 90]).toContain(slashAngle(orthogonal));
    // And a language that states nothing gets the lean it asked for.
    const free = parseIconLanguage({ ...serializeIconLanguage(technical), grammar: { ...technical.grammar, angles: [] } });
    expect(slashAngle(free)).toBe(45);
  });

  it("cuts a gap the language already specified", () => {
    // Wide enough that what is left has the language's own minimum of *visible*
    // white beside the slash — measured between stroke edges, which is why a
    // whole stroke is in here — with one grid step of margin so the result
    // clears the rule rather than tying with it.
    const tokens = resolveTokens(technical, 16);
    const visible = slashGap(tokens) / 2 - tokens.stroke.width;
    expect(visible).toBeGreaterThan(tokens.minNegativeSpace);
    expect(visible).toBeLessThan(tokens.minNegativeSpace + tokens.grid);
    // It scales with the optical size, with nobody stating a second number.
    expect(slashGap(resolveTokens(technical, 32))).toBeGreaterThan(slashGap(tokens));
  });

  it("stays inside the safe area", () => {
    const tokens = resolveTokens(technical, 16);
    const shape = pathShapeFromData(slashPath(technical, tokens));
    for (const [x, y] of sampleShape(shape).flat()) {
      expect(x).toBeGreaterThanOrEqual(tokens.safeArea - 1e-9);
      expect(x).toBeLessThanOrEqual(tokens.canvas - tokens.safeArea + 1e-9);
      expect(y).toBeGreaterThanOrEqual(tokens.safeArea - 1e-9);
      expect(y).toBeLessThanOrEqual(tokens.canvas - tokens.safeArea + 1e-9);
    }
  });
});

describe("offify", () => {
  it("names the variant after the icon it came from", () => {
    expect(offify(bell, technical).name).toBe("bell-off");
    // And does not keep adding the suffix.
    expect(offify(offify(bell, technical), technical).name).toBe("bell-off");
  });

  it("leaves nothing of the drawing in the gap the slash needs", () => {
    const off = offify(bell, technical);
    const band = slashBand(technical, resolveTokens(technical, 16));
    // Every point of the cut drawing, except the slash itself, is outside.
    const kept = { ...off, elements: partsOf(off).slice(0, -1) };
    for (const point of points(kept)) expect(isInsideBand(point, band, 1e-3)).toBe(false);
  });

  it("adds the slash, and only one", () => {
    const off = offify(bell, technical);
    const slashes = partsOf(off).filter((el) => "path" in el && el.path === slashPath(technical, resolveTokens(technical, 16)));
    expect(slashes).toHaveLength(1);
  });

  it("keeps the parts of the drawing the slash does not cross", () => {
    const off = offify(bell, technical);
    // Two elements — what is left of the drawing, and the slash — however many
    // pieces the cut made. An element each would blow the detail budget on an
    // icon that is not any more complicated than it was.
    expect(partsOf(off)).toHaveLength(2);
    expect(compose(off, technical).shapes.length).toBeGreaterThanOrEqual(3);
  });

  it("stays inside the language's budget, which a cut could easily break", () => {
    const off = offify(bell, technical);
    const tokens = resolveTokens(technical, 16);
    expect(partsOf(off).length).toBeLessThanOrEqual(tokens.limits.maxElements);
  });

  it("composes and validates like any other icon", () => {
    const off = offify(bell, technical);
    expect(() => compose(off, technical)).not.toThrow();
  });

  it("follows the language rather than a constant", () => {
    const heavier = parseIconLanguage({
      ...serializeIconLanguage(technical),
      stroke: { width: 3, cap: "round", join: "round" },
      minNegativeSpace: 3,
    });
    const wide = slashGap(resolveTokens(heavier, 16));
    const narrow = slashGap(resolveTokens(technical, 16));
    expect(wide).toBeGreaterThan(narrow);
    // A heavier language cuts a wider gap, so less of the drawing survives.
    const before = partsOf(offify(bell, technical)).length;
    const after = partsOf(offify({ ...bell, language: heavier.id }, heavier)).length;
    expect(after).toBeLessThanOrEqual(before);
  });

  it("works at every optical size the language has", () => {
    for (const canvas of [16, 24, 32]) {
      const spec = parseIconSpec({ ...bell, canvas, elements: [{ primitive: "circle", x: 2, y: 2, size: canvas - 4 }] });
      const off = offify(spec, technical);
      const band = slashBand(technical, resolveTokens(technical, canvas));
      const kept = { ...off, elements: partsOf(off).slice(0, -1) };
      for (const point of points(kept)) expect(isInsideBand(point, band, 1e-3), `${canvas}px`).toBe(false);
    }
  });
});
