import { describe, expect, it } from "vitest";
import { DEFAULT_OPTICS, technical, type IconLanguage, type OpticsTokens } from "@icon-foundry/icon-language";
import { parseIconLanguage, serializeIconLanguage } from "@icon-foundry/icon-language";
import type { IconSpec } from "@icon-foundry/icon-spec";
import { applyOptics, compose, opticsEnabled } from "./index.js";

/** The same language with corrections turned on at every optical size. */
function withOptics(base: IconLanguage, optics: Partial<OpticsTokens>): IconLanguage {
  const merged = { ...base.optics, ...optics };
  return {
    ...base,
    optics: merged,
    sizes: Object.fromEntries(Object.entries(base.sizes).map(([k, t]) => [Number(k), { ...t, optics: merged }])),
  };
}

const icon = (primitive: string): IconSpec => ({
  name: primitive,
  language: technical.id,
  canvas: 16,
  elements: [{ primitive, x: 2, y: 2, width: 12, height: 12 }],
});

const shapeAt = (composed: ReturnType<typeof compose>, i: number) => composed.shapes[i]!;

describe("applyOptics", () => {
  it("does nothing at all to a language that asked for nothing", () => {
    const composed = compose(icon("warning"), technical);
    expect(opticsEnabled(composed)).toBe(false);
    const result = applyOptics(composed);
    expect(result.corrections).toEqual([]);
    // Same object, not a copy: a no-op pass must be free to run everywhere.
    expect(result.icon).toBe(composed);
  });

  it("reports every change it makes rather than silently retouching", () => {
    const language = withOptics(technical, { interiorThin: 0.3 });
    const { corrections } = applyOptics(compose(icon("building"), language));
    expect(corrections.length).toBeGreaterThan(0);
    for (const c of corrections) {
      expect(c.pass).toBe("interior-thin");
      expect(c.primitive).toBe("building");
      expect(c.source).toBe("elements[0]");
      expect(c.note).toMatch(/\d/);
    }
  });
});

describe("dot sizing", () => {
  it("gives every dot the same drawn size, however the primitive drew it", () => {
    const language = withOptics(technical, { dotRatio: 1.6 });
    const plain = compose(icon("warning"), technical);
    // The warning's dot is a round-capped stroke of almost no length.
    expect(shapeAt(plain, 2).stroke.width).toBe(technical.stroke.width);

    const { icon: fixed, corrections } = applyOptics(compose(icon("warning"), language));
    expect(corrections.map((c) => c.pass)).toEqual(["dot-size"]);
    expect(shapeAt(fixed, 2).stroke.width).toBeCloseTo(1.6 * technical.stroke.width, 6);
    // The bar above it is a real line and keeps its weight.
    expect(shapeAt(fixed, 1).stroke.width).toBe(technical.stroke.width);
  });

  it("leaves a disc alone: a circle wider than two strokes is not a dot", () => {
    const language = withOptics(technical, { dotRatio: 1.6 });
    const { icon: fixed } = applyOptics(compose(icon("clock"), language));
    const dial = shapeAt(fixed, 0).shape;
    expect(dial.kind).toBe("circle");
    if (dial.kind === "circle") expect(dial.r).toBe(6);
  });

  it("does not let a later pass thin the dot it just sized", () => {
    const language = withOptics(technical, { dotRatio: 1.6, interiorThin: 0.4 });
    const { icon: fixed, corrections } = applyOptics(compose(icon("warning"), language));
    // The dot sits inside the triangle, so without the claim it would be thinned.
    expect(shapeAt(fixed, 2).stroke.width).toBeCloseTo(1.6 * technical.stroke.width, 6);
    expect(corrections.filter((c) => c.pass === "interior-thin")).toHaveLength(1);
  });
});

describe("interior thinning", () => {
  it("lightens detail drawn inside a contour of the same element", () => {
    const language = withOptics(technical, { interiorThin: 0.25 });
    const { icon: fixed } = applyOptics(compose(icon("warehouse"), language));
    expect(shapeAt(fixed, 0).stroke.width).toBe(technical.stroke.width); // the house
    expect(shapeAt(fixed, 1).stroke.width).toBeCloseTo(technical.stroke.width * 0.75, 6); // the door
    expect(shapeAt(fixed, 2).stroke.width).toBeCloseTo(technical.stroke.width * 0.75, 6); // its shelf
  });

  it("thins detail that rests on the contour it sits in", () => {
    // The warehouse door stands on the warehouse floor. Requiring a gap on all
    // four sides would exempt most interior detail there is.
    const plain = compose(icon("warehouse"), technical);
    const door = plain.shapes[1]!.shape;
    const house = plain.shapes[0]!.shape;
    if (door.kind !== "rect" || house.kind !== "polyline") throw new Error("warehouse changed shape");
    expect(door.y + door.height).toBe(Math.max(...house.points.map((p) => p[1])));

    const language = withOptics(technical, { interiorThin: 0.25 });
    const { corrections } = applyOptics(compose(icon("warehouse"), language));
    expect(corrections).toHaveLength(2);
  });

  it("leaves separate parts of a composition at their own weight", () => {
    const language = withOptics(technical, { interiorThin: 0.25 });
    // A badge sits inside the subject's bounding box but is its own element.
    const spec: IconSpec = {
      name: "badged",
      language: technical.id,
      canvas: 16,
      elements: [
        { primitive: "square", x: 1, y: 1, width: 14, height: 14 },
        { primitive: "circle", x: 5, y: 5, width: 6, height: 6 },
      ],
    };
    const { corrections } = applyOptics(compose(spec, language));
    expect(corrections).toEqual([]);
  });

  it("never thins a hole, whose size is structural", () => {
    const language = withOptics(technical, { interiorThin: 0.25 });
    const spec: IconSpec = { ...icon("warehouse"), style: "filled" };
    const { corrections } = applyOptics(compose(spec, language));
    expect(corrections).toEqual([]);
  });
});

describe("junction notches", () => {
  it("pulls a stroke end out of the crook it meets at an acute angle", () => {
    const language = withOptics(technical, { junctionNotch: 0.5, junctionAngle: 50 });
    const plain = compose(icon("arrow"), technical);
    const { icon: fixed, corrections } = applyOptics(compose(icon("arrow"), language));

    expect(corrections.map((c) => c.pass)).toEqual(["junction-notch"]);
    const before = plain.shapes.find((s) => s.shape.kind === "line")!.shape;
    const after = fixed.shapes.find((s) => s.shape.kind === "line")!.shape;
    if (before.kind !== "line" || after.kind !== "line") throw new Error("expected the shaft to be a line");
    // The shaft got shorter; the tail it starts from did not move.
    const length = (l: typeof before) => Math.hypot(l.x2 - l.x1, l.y2 - l.y1);
    expect(length(after)).toBeCloseTo(length(before) - 0.5, 6);
    expect([after.x1, after.y1]).toEqual([before.x1, before.y1]);
  });

  it("leaves a right angle alone: nothing piles up there", () => {
    const language = withOptics(technical, { junctionNotch: 0.5, junctionAngle: 30 });
    // The document's fold meets the page at 45°, above this threshold.
    const { corrections } = applyOptics(compose(icon("document"), language));
    expect(corrections).toEqual([]);
  });

  it("never touches a closed shape, which has no ends to pull back", () => {
    const language = withOptics(technical, { junctionNotch: 0.5, junctionAngle: 89 });
    const { icon: fixed } = applyOptics(compose(icon("square"), language));
    expect(fixed.shapes.every((s) => s.shape.kind !== "polyline" || s.shape.closed)).toBe(true);
  });
});

describe("optics in the language file", () => {
  const base = {
    id: "t",
    name: "T",
    version: "1.0.0",
    canvas: 16,
    grid: 1,
    safeArea: 2,
    stroke: { width: 1.5 },
    style: { default: "outline" as const },
  };

  it("is off unless the file asks", () => {
    expect(parseIconLanguage(base).optics).toEqual(DEFAULT_OPTICS);
  });

  it("survives a write-then-read round trip", () => {
    const language = parseIconLanguage({ ...base, optics: { junctionNotch: 0.4, dotRatio: 1.5 } });
    expect(language.optics.junctionNotch).toBe(0.4);
    const written = serializeIconLanguage(language);
    // Only the fields that were set are written down.
    expect(written.optics).toEqual({ junctionNotch: 0.4, dotRatio: 1.5 });
    expect(parseIconLanguage(written).optics).toEqual(language.optics);
  });

  it("scales the notch with the canvas, because it is a length", () => {
    const language = parseIconLanguage({
      ...base,
      optics: { junctionNotch: 0.4, interiorThin: 0.3 },
      sizes: [{ canvas: 24 }],
    });
    const big = language.sizes[24]!;
    expect(big.optics.junctionNotch).toBeCloseTo(0.6, 6);
    // A fraction is a fraction at every size.
    expect(big.optics.interiorThin).toBe(0.3);
  });

  it("refuses a thinning fraction that would erase the stroke", () => {
    expect(() => parseIconLanguage({ ...base, optics: { interiorThin: 1 } })).toThrow(/interiorThin/);
  });
});
