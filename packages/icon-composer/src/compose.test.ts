import { describe, expect, it } from "vitest";
import { lucideInspired } from "@icon-foundry/icon-language";
import { shapeBounds } from "@icon-foundry/icon-primitives";
import { parseIconSpec } from "@icon-foundry/icon-spec";
import { compose, ComposeError, composedBounds } from "./index.js";

const spec = (elements: unknown[], extra: Record<string, unknown> = {}) =>
  parseIconSpec({ name: "test", language: "lucide-inspired", canvas: 24, elements, ...extra });

describe("compose", () => {
  it("fits a primitive into its element box with uniform scale", () => {
    const icon = compose(spec([{ primitive: "circle", x: 2, y: 2, size: 20 }]), lucideInspired);
    expect(icon.shapes).toHaveLength(1);
    expect(icon.shapes[0]?.shape).toMatchObject({ kind: "circle", cx: 12, cy: 12, r: 10 });
  });

  it("preserves aspect ratio and centres by default", () => {
    // warehouse is 24 × 20; a 20 × 20 box gives scale 20/24 and a 16.67 tall placement.
    const icon = compose(spec([{ primitive: "warehouse", x: 2, y: 2, size: 20 }]), lucideInspired);
    const b = composedBounds(icon);
    expect(b.minX).toBeCloseTo(2);
    expect(b.maxX).toBeCloseTo(22);
    expect(b.minY).toBeCloseTo(2 + (20 - 20 * (20 / 24)) / 2);
    expect(b.maxY).toBeCloseTo(22 - (20 - 20 * (20 / 24)) / 2);
  });

  it("honours start/end alignment", () => {
    const icon = compose(
      spec([{ primitive: "warehouse", x: 2, y: 2, size: 20, align: { y: "end" } }]),
      lucideInspired,
    );
    expect(composedBounds(icon).maxY).toBeCloseTo(22);
  });

  it("handles zero-height primitives such as lines", () => {
    const icon = compose(spec([{ primitive: "line", x: 2, y: 2, width: 20, height: 20 }]), lucideInspired);
    expect(icon.shapes[0]?.shape).toMatchObject({ kind: "line", x1: 2, y1: 12, x2: 22, y2: 12 });
  });

  it("rotates around the element centre", () => {
    const icon = compose(
      spec([{ primitive: "arrow", x: 2, y: 2, size: 20, rotate: 90 }]),
      lucideInspired,
    );
    const b = composedBounds(icon);
    // A right arrow rotated 90° points down: taller than wide.
    expect(b.maxY - b.minY).toBeGreaterThan(b.maxX - b.minX);
    expect((b.minX + b.maxX) / 2).toBeCloseTo(12);
    expect((b.minY + b.maxY) / 2).toBeCloseTo(12);
  });

  it("applies the optical offset last", () => {
    const icon = compose(
      spec([{ primitive: "circle", x: 2, y: 2, size: 20, opticalOffset: [1, -1] }]),
      lucideInspired,
    );
    expect(icon.shapes[0]?.shape).toMatchObject({ kind: "circle", cx: 13, cy: 11 });
  });

  it("lays out groups in a virtual canvas and scales them as a unit", () => {
    const icon = compose(
      spec([
        {
          x: 12,
          y: 12,
          size: 12,
          children: [
            { primitive: "circle", x: 0, y: 0, size: 24 },
            { primitive: "plus", x: 6, y: 6, size: 12 },
          ],
        },
      ]),
      lucideInspired,
    );
    expect(icon.elementCount).toBe(2);
    expect(icon.shapes[0]?.shape).toMatchObject({ kind: "circle", cx: 18, cy: 18, r: 6 });
    expect(icon.shapes[0]?.source).toBe("elements[0].children[0]");
  });

  it("inherits style and stroke from spec → group → element", () => {
    const icon = compose(
      spec(
        [
          {
            x: 0,
            y: 0,
            size: 24,
            stroke: { width: 1.5 },
            children: [
              { primitive: "circle", x: 0, y: 0, size: 24 },
              { primitive: "square", x: 0, y: 0, size: 24, style: "outline", stroke: { cap: "butt" } },
            ],
          },
        ],
        { style: "filled" },
      ),
      lucideInspired,
    );
    expect(icon.shapes[0]).toMatchObject({ style: "filled", stroke: { width: 1.5, cap: "round" } });
    expect(icon.shapes[1]).toMatchObject({ style: "outline", stroke: { width: 1.5, cap: "butt" } });
  });

  it("uses the language default style when the spec has none", () => {
    expect(compose(spec([{ primitive: "circle", x: 2, y: 2, size: 20 }]), lucideInspired).style).toBe("outline");
  });

  it("throws a ComposeError with the element path for unknown primitives", () => {
    expect(() => compose(spec([{ primitive: "unicorn", x: 2, y: 2, size: 20 }]), lucideInspired)).toThrow(
      ComposeError,
    );
    expect(() => compose(spec([{ primitive: "unicorn", x: 2, y: 2, size: 20 }]), lucideInspired)).toThrow(
      /elements\[0\]/,
    );
  });

  it("uses the tokens of the spec's optical size", () => {
    const icon = compose(spec([{ primitive: "circle", x: 1, y: 1, size: 14 }], { canvas: 16 }), lucideInspired);
    expect(icon.tokens.canvas).toBe(16);
    expect(icon.shapes[0]?.stroke.width).toBe(1.25);
    // Unknown canvas falls back to the nearest size so the validator can still show geometry.
    expect(compose(spec([{ primitive: "circle", x: 1, y: 1, size: 14 }], { canvas: 18 }), lucideInspired).tokens.canvas).toBe(16);
  });

  it("composes freeform path elements with a derived natural box", () => {
    const icon = compose(spec([{ path: "M0 0 L10 0 L10 10 Z", x: 2, y: 2, size: 20 }]), lucideInspired);
    expect(icon.shapes[0]?.primitive).toBe("path");
    expect(icon.shapes[0]?.shape.fillable).toBe(true);
    const b = composedBounds(icon);
    expect([b.minX, b.minY, b.maxX, b.maxY]).toEqual([2, 2, 22, 22]);
    expect(() => compose(spec([{ path: "M0 0 Q1 1 2 2", x: 2, y: 2, size: 20 }]), lucideInspired)).toThrow(ComposeError);
  });

  it("is deterministic", () => {
    const s = spec([
      { primitive: "warehouse", x: 2, y: 6, width: 16, height: 16 },
      { primitive: "snowflake", x: 15, y: 2, size: 7 },
    ]);
    const a = compose(s, lucideInspired);
    const b = compose(s, lucideInspired);
    expect(a).toEqual(b);
    expect(a.shapes.map((x) => shapeBounds(x.shape))).toEqual(b.shapes.map((x) => shapeBounds(x.shape)));
  });
});
