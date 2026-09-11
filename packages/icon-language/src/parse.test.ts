import { describe, expect, it } from "vitest";
import { IconLanguageError, lucideInspired, parseIconLanguage } from "./index.js";

describe("parseIconLanguage", () => {
  it("loads the bundled starter language", () => {
    expect(lucideInspired.id).toBe("lucide-inspired");
    expect(lucideInspired.canvas).toBe(24);
    expect(lucideInspired.stroke).toEqual({ width: 2, cap: "round", join: "round" });
    expect(lucideInspired.style.allowed).toEqual(["outline", "filled"]);
  });

  it("applies defaults for optional fields", () => {
    const lang = parseIconLanguage({
      id: "minimal",
      name: "Minimal",
      version: "0.0.1",
      canvas: 16,
      grid: 0.5,
      safeArea: 1,
      stroke: { width: 1.5, cap: "butt", join: "miter" },
      cornerRadius: 0,
      style: { default: "filled" },
    });
    expect(lang.style.allowed).toEqual(["filled"]);
    expect(lang.colors.allowed).toEqual(["currentColor"]);
    expect(lang.detail).toBe("low");
    expect(lang.limits).toEqual({ maxElements: 4, maxShapes: 12 });
    expect(lang.minNegativeSpace).toBe(0);
  });

  it("rejects a default style that is not in the allowed list", () => {
    expect(() =>
      parseIconLanguage({
        ...lucideInspired,
        style: { default: "filled", allowed: ["outline"] },
      }),
    ).toThrow(IconLanguageError);
  });

  it("rejects invalid stroke settings", () => {
    expect(() => parseIconLanguage({ ...lucideInspired, stroke: { width: 0, cap: "round", join: "round" } })).toThrow(
      /stroke\.width/,
    );
    expect(() => parseIconLanguage({ ...lucideInspired, stroke: { width: 2, cap: "flat", join: "round" } })).toThrow(
      /stroke\.cap/,
    );
  });
});
