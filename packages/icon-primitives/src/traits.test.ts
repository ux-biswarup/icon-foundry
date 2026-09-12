import { describe, expect, it } from "vitest";
import { CONSTRUCTION_TRAITS, DEFAULT_CONSTRUCTION, TRAIT_CONSUMERS, type Construction } from "@icon-foundry/icon-language";
import { defaultRegistry } from "./registry.js";
import { localRadius, type PrimitiveContext } from "./primitive.js";

/**
 * A declaration is only worth having if it is checked in both directions.
 *
 * The bug this exists to catch has no symptom you can see in one icon. A
 * language sets a rounder corner, three primitives follow and three do not, and
 * the result is a rounded building standing next to a sharp truck. Looking at
 * either one tells you nothing. Only the set shows it, and by then nobody
 * remembers which change caused it.
 */

const c = (over: Partial<Construction>): Construction => ({ ...DEFAULT_CONSTRUCTION, ...over });

/** Every value a primitive may read, at two settings far enough apart to see. */
const SETTINGS: Record<string, [Partial<PrimitiveContext>, Partial<PrimitiveContext>]> = {
  cornerRadius: [{ cornerRadius: 0 }, { cornerRadius: 4 }],
  interiorRadius: [
    { cornerRadius: 4, construction: c({ interiorRadius: 0 }) },
    { cornerRadius: 4, construction: c({ interiorRadius: 1 }) },
  ],
  aperture: [{ construction: c({ aperture: "line" }) }, { construction: c({ aperture: "notch" }) }],
  inset: [{ construction: c({ inset: 0.5 }) }, { construction: c({ inset: 1.6 }) }],
  accentSize: [{ construction: c({ accentSize: 0.6 }) }, { construction: c({ accentSize: 1.8 }) }],
  slope: [{ construction: c({ slope: "shallow" }) }, { construction: c({ slope: "45" }) }],
};

const base: PrimitiveContext = { style: "outline", strokeWidth: 1.5, cornerRadius: 1.5, scale: 1 };

/** Geometry as a comparable string, so "did this change" is a plain question. */
const shapesAt = (name: string, over: Partial<PrimitiveContext>, style: PrimitiveContext["style"]) =>
  JSON.stringify(defaultRegistry.get(name).build({ ...base, ...over, style }));

/** Does this value reach this primitive at all, in either style? */
function responds(name: string, trait: string): boolean {
  const [lo, hi] = SETTINGS[trait]!;
  return (["outline", "filled"] as const).some((style) => shapesAt(name, lo, style) !== shapesAt(name, hi, style));
}

describe("a primitive draws exactly what it declares", () => {
  const geometryTraits = Object.keys(SETTINGS);

  for (const trait of geometryTraits) {
    describe(trait, () => {
      it("has primitives on both sides of the question", () => {
        const yes = defaultRegistry.names().filter((n) => defaultRegistry.get(n).traits?.includes(trait));
        expect(yes.length).toBeGreaterThan(0);
        expect(yes.length).toBeLessThan(defaultRegistry.names().length);
        expect(defaultRegistry.consumersOf(trait)).toEqual(yes);
      });

      it.each(defaultRegistry.names())("%s", (name) => {
        const declares = defaultRegistry.get(name).traits?.includes(trait) ?? false;
        const moved = responds(name, trait);
        if (declares) {
          expect(moved, `"${name}" declares ${trait} but draws the same either way`).toBe(true);
        } else {
          expect(moved, `"${name}" does not declare ${trait} but its geometry moved`).toBe(false);
        }
      });
    });
  }
});

describe("the trait vocabulary stays small enough to hold", () => {
  /**
   * A decision used by one primitive is a property of that primitive, not a
   * language decision. Without this rule the vocabulary grows until nobody can
   * hold it, and a panel of sixty controls is no more usable than no panel.
   */
  it("gives every geometry trait at least three consumers", () => {
    for (const trait of CONSTRUCTION_TRAITS) {
      if (TRAIT_CONSUMERS[trait] !== "primitives") continue;
      const consumers = defaultRegistry.consumersOf(trait);
      expect(consumers.length, `"${trait}" is read by ${consumers.length} primitives: ${consumers.join(", ")}`)
        .toBeGreaterThanOrEqual(3);
    }
  });

  it("does not ask the primitives about a trait nobody draws", () => {
    // `grade` is applied at render, so no primitive should claim it.
    for (const trait of CONSTRUCTION_TRAITS) {
      if (TRAIT_CONSUMERS[trait] === "primitives") continue;
      expect(defaultRegistry.consumersOf(trait)).toEqual([]);
    }
  });
});

describe("corner radius knows what it may not round", () => {
  it("caps a radius to the shape it is rounding", () => {
    const construction: Construction = { ...DEFAULT_CONSTRUCTION, interiorRadius: 1 };
    const wide = JSON.stringify(
      defaultRegistry.get("building").build({ ...base, cornerRadius: 999, construction, style: "filled" }),
    );
    expect(wide).not.toContain("NaN");
    for (const m of wide.matchAll(/"width":(\d+(?:\.\d+)?),"height":(\d+(?:\.\d+)?),"rx":(\d+(?:\.\d+)?)/g)) {
      const [, w, h, rx] = m;
      expect(Number(rx)).toBeLessThanOrEqual(Math.min(Number(w), Number(h)) / 2 + 1e-9);
    }
  });

  it("refuses a corner on a shape no wider than its own stroke", () => {
    // Google states it at their numbers — a 2dp stroke, and "do not round the
    // corners of strokes (shapes 2dp wide or less)" — so the general rule is
    // that a shape no wider than one stroke is a stroke, and strokes have ends
    // rather than corners.
    const round = { ...base, cornerRadius: 99 };
    expect(localRadius(round, 0.5), "a 1-wide shape under a 1.5 stroke").toBe(0);
    expect(localRadius(round, 0.75), "a 1.5-wide shape under a 1.5 stroke").toBe(0);
    expect(localRadius(round, 2), "a 4-wide shape rounds, capped at half its side").toBe(2);
  });

  it("measures the threshold in the primitive's own units, not the canvas", () => {
    // A primitive drawn at 24 and placed in a 12-unit box sees a stroke twice
    // as thick in its own space, so the same shape stops rounding.
    const small = { ...base, cornerRadius: 99, scale: 0.5 };
    expect(localRadius({ ...base, cornerRadius: 99, scale: 1 }, 1)).toBe(1);
    expect(localRadius(small, 1)).toBe(0);
  });
});
