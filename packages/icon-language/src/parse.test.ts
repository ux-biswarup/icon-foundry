import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHARACTER,
  DEFAULT_GRAMMAR,
  IconLanguageError,
  defaultOpticalBoxes,
  hasSize,
  lucideInspired,
  nearestTokens,
  parseIconLanguage,
  resolveTokens,
  technical,
} from "./index.js";

const minimal = {
  id: "minimal",
  name: "Minimal",
  version: "0.0.1",
  canvas: 16,
  grid: 0.5,
  safeArea: 1,
  stroke: { width: 1.5, cap: "butt", join: "miter" },
  cornerRadius: 0,
  style: { default: "filled" },
};

describe("parseIconLanguage", () => {
  it("loads the bundled starter language with two optical sizes", () => {
    expect(lucideInspired.id).toBe("lucide-inspired");
    expect(lucideInspired.canvas).toBe(24);
    expect(lucideInspired.defaultCanvas).toBe(24);
    expect(lucideInspired.stroke).toEqual({ width: 2, cap: "round", join: "round" });
    expect(lucideInspired.style.allowed).toEqual(["outline", "filled"]);
    expect(Object.keys(lucideInspired.sizes).map(Number).sort()).toEqual([16, 24]);
  });

  it("applies defaults for optional fields", () => {
    const lang = parseIconLanguage(minimal);
    expect(lang.style.allowed).toEqual(["filled"]);
    expect(lang.colors.allowed).toEqual(["currentColor"]);
    expect(lang.detail).toBe("low");
    expect(lang.limits).toEqual({ maxElements: 4, maxShapes: 12 });
    expect(lang.minNegativeSpace).toBe(0);
    expect(lang.optical).toEqual(defaultOpticalBoxes(16, 1));
  });

  it("derives Material-style keyline boxes for a 24 canvas with a 2 safe area", () => {
    expect(defaultOpticalBoxes(24, 2)).toEqual({
      square: { x: 3, y: 3, width: 18, height: 18 },
      circle: { x: 2, y: 2, width: 20, height: 20 },
      horizontal: { x: 2, y: 4, width: 20, height: 16 },
      vertical: { x: 4, y: 2, width: 16, height: 20 },
    });
  });

  it("lets a language override individual optical boxes", () => {
    const lang = parseIconLanguage({ ...minimal, optical: { circle: { x: 0, y: 0, width: 16, height: 16 } } });
    expect(lang.optical.circle).toEqual({ x: 0, y: 0, width: 16, height: 16 });
    expect(lang.optical.square).toEqual(defaultOpticalBoxes(16, 1).square);
    expect(() =>
      parseIconLanguage({ ...minimal, optical: { circle: { x: 4, y: 0, width: 16, height: 16 } } }),
    ).toThrow(/fit inside/);
  });

  it("additional sizes inherit from the default and derive their own optical boxes", () => {
    const t16 = resolveTokens(lucideInspired, 16);
    expect(t16.stroke).toEqual({ width: 1.5, cap: "round", join: "round" });
    expect(t16.grid).toBe(1);
    expect(t16.safeArea).toBe(1);
    expect(t16.optical.circle).toEqual({ x: 1, y: 1, width: 14, height: 14 });
    expect(t16.limits).toEqual({ maxElements: 3, maxShapes: 8 });
  });

  it("resolves, tests and approximates sizes", () => {
    expect(resolveTokens(lucideInspired).canvas).toBe(24);
    expect(hasSize(lucideInspired, 16)).toBe(true);
    expect(hasSize(lucideInspired, 20)).toBe(false);
    expect(() => resolveTokens(lucideInspired, 20)).toThrow(IconLanguageError);
    expect(nearestTokens(lucideInspired, 18).canvas).toBe(16);
    expect(nearestTokens(lucideInspired, 21).canvas).toBe(24);
  });

  it("rejects duplicate sizes and impossible safe areas", () => {
    expect(() => parseIconLanguage({ ...minimal, sizes: [{ canvas: 16 }] })).toThrow(/defined twice/);
    expect(() => parseIconLanguage({ ...minimal, safeArea: 8 })).toThrow(/no room/);
  });

  it("rejects a default style that is not in the allowed list", () => {
    expect(() =>
      parseIconLanguage({ ...minimal, style: { default: "filled", allowed: ["outline"] } }),
    ).toThrow(IconLanguageError);
  });

  it("rejects invalid stroke settings", () => {
    expect(() => parseIconLanguage({ ...minimal, stroke: { width: 0, cap: "round", join: "round" } })).toThrow(
      /stroke\.width/,
    );
    expect(() => parseIconLanguage({ ...minimal, stroke: { width: 2, cap: "flat", join: "round" } })).toThrow(
      /stroke\.cap/,
    );
  });
});

describe("character and grammar", () => {
  it("reads the Technical language's character and grammar", () => {
    expect(technical.id).toBe("technical");
    expect(technical.defaultCanvas).toBe(16);
    expect(resolveTokens(technical, 16).stroke.width).toBe(1.25);
    expect(resolveTokens(technical, 24).stroke.width).toBe(1.5);
    // Cursor's rule: a gap never smaller than 3 grid units.
    const t16 = resolveTokens(technical, 16);
    expect(t16.minNegativeSpace).toBe(3 * t16.grid);
    expect(technical.grammar.angles).toEqual([0, 45, 90, 135]);
    expect(technical.grammar.closedShapes).toBe(true);
    expect(technical.grammar.diagonal).toBe("up-right");
    expect(technical.grammar.badge).toEqual({ ratio: 0.35, corner: "top-right" });
    expect(technical.character.axes.geometric).toBeGreaterThan(50);
    expect(technical.character.principles.length).toBeGreaterThan(4);
    expect(technical.character.metaphors.avoid).toContain("faces");
  });

  it("defaults to a permissive character and grammar when a language states neither", () => {
    const lang = parseIconLanguage(minimal);
    expect(lang.grammar).toEqual(DEFAULT_GRAMMAR);
    expect(lang.character).toEqual(DEFAULT_CHARACTER);
    expect(lang.grammar.angles).toEqual([]);
    expect(lucideInspired.grammar.angles).toEqual([]);
  });

  it("validates grammar values", () => {
    const g = (grammar: unknown) => () => parseIconLanguage({ ...minimal, grammar });
    expect(g({ angles: [0, 180] })).toThrow(/measured 0–180/);
    expect(g({ angles: 45 })).toThrow(/array of degrees/);
    expect(g({ diagonal: "sideways" })).toThrow(/one of up-right/);
    expect(g({ badge: { corner: "middle" } })).toThrow(/one of top-right/);
    expect(g({ badge: { ratio: 1 } })).toThrow(/smaller than 1/);
    expect(() => parseIconLanguage({ ...minimal, character: { axes: { geometric: 140 } } })).toThrow(/between 0 and 100/);
  });

  it("keeps partial grammar and character on top of the defaults", () => {
    const lang = parseIconLanguage({ ...minimal, grammar: { angles: [0, 90] }, character: { purpose: "Tiny set." } });
    expect(lang.grammar.angles).toEqual([0, 90]);
    expect(lang.grammar.badge).toEqual(DEFAULT_GRAMMAR.badge);
    expect(lang.character.purpose).toBe("Tiny set.");
    expect(lang.character.principles).toEqual([]);
  });
});
