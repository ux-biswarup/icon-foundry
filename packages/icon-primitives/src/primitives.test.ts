import { describe, expect, it } from "vitest";
import { isFiniteShape, shapeBounds, unionBounds } from "./geometry.js";
import type { PrimitiveContext } from "./primitive.js";
import { builtInPrimitives, defaultRegistry } from "./registry.js";

const ctx = (style: PrimitiveContext["style"]): PrimitiveContext => ({
  style,
  strokeWidth: 2,
  cornerRadius: 2,
  scale: 1,
});

describe("built-in primitives", () => {
  it("has unique names and between 20 and 30 primitives", () => {
    const names = builtInPrimitives.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBeGreaterThanOrEqual(20);
    expect(names.length).toBeLessThanOrEqual(30);
  });

  it.each(builtInPrimitives.map((p) => [p.name, p] as const))(
    "%s builds finite geometry inside its natural box in both styles",
    (_name, primitive) => {
      for (const style of ["outline", "filled"] as const) {
        const shapes = primitive.build(ctx(style));
        expect(shapes.length).toBeGreaterThan(0);
        for (const shape of shapes) expect(isFiniteShape(shape)).toBe(true);
        const b = unionBounds(shapes.map(shapeBounds));
        const eps = 0.02;
        expect(b.minX).toBeGreaterThanOrEqual(-eps);
        expect(b.minY).toBeGreaterThanOrEqual(-eps);
        expect(b.maxX).toBeLessThanOrEqual(primitive.box.width + eps);
        expect(b.maxY).toBeLessThanOrEqual(primitive.box.height + eps);
      }
    },
  );

  it("is deterministic: the same context yields structurally equal shapes", () => {
    for (const primitive of builtInPrimitives) {
      expect(primitive.build(ctx("outline"))).toEqual(primitive.build(ctx("outline")));
    }
  });

  it("exposes primitives through the registry", () => {
    expect(defaultRegistry.get("warehouse").category).toBe("object");
    expect(() => defaultRegistry.get("unicorn")).toThrow(/Unknown primitive/);
  });
});
