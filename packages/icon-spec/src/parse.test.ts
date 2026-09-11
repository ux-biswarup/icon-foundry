import { describe, expect, it } from "vitest";
import { IconSpecError, parseIconSpec } from "./index.js";

const valid = {
  name: "temperature-warehouse",
  language: "lucide-inspired",
  style: "outline",
  canvas: 24,
  elements: [
    { primitive: "warehouse", x: 3, y: 5, width: 18, height: 16 },
    { primitive: "snowflake", x: 15, y: 2, size: 7 },
  ],
};

describe("parseIconSpec", () => {
  it("accepts a well-formed spec and normalises size to width/height", () => {
    const spec = parseIconSpec(valid);
    expect(spec.name).toBe("temperature-warehouse");
    expect(spec.elements[1]).toMatchObject({ width: 7, height: 7 });
  });

  it("rejects non kebab-case names", () => {
    expect(() => parseIconSpec({ ...valid, name: "Temperature Warehouse" })).toThrow(IconSpecError);
  });

  it("rejects elements with neither primitive nor children", () => {
    expect(() => parseIconSpec({ ...valid, elements: [{ x: 0, y: 0, size: 4 }] })).toThrow(
      /exactly one of/,
    );
  });

  it("rejects elements with both primitive and children", () => {
    expect(() =>
      parseIconSpec({
        ...valid,
        elements: [{ primitive: "circle", children: [], x: 0, y: 0, size: 4 }],
      }),
    ).toThrow(/exactly one of/);
  });

  it("requires a size or width+height", () => {
    expect(() => parseIconSpec({ ...valid, elements: [{ primitive: "circle", x: 0, y: 0 }] })).toThrow(
      /needs `size`/,
    );
  });

  it("rejects non-finite numbers", () => {
    expect(() =>
      parseIconSpec({ ...valid, elements: [{ primitive: "circle", x: Number.NaN, y: 0, size: 4 }] }),
    ).toThrow(/finite number/);
  });

  it("rejects unknown styles and stroke caps", () => {
    expect(() => parseIconSpec({ ...valid, style: "duotone" })).toThrow(/one of outline, filled/);
    expect(() => parseIconSpec({ ...valid, stroke: { cap: "pointy" } })).toThrow(/one of butt/);
  });

  it("parses nested groups recursively with a path in errors", () => {
    const spec = parseIconSpec({
      ...valid,
      elements: [
        {
          x: 2,
          y: 2,
          size: 20,
          children: [{ primitive: "circle", x: 0, y: 0, size: 24 }],
        },
      ],
    });
    expect(spec.elements[0]).toHaveProperty("children");

    expect(() =>
      parseIconSpec({
        ...valid,
        elements: [{ x: 2, y: 2, size: 20, children: [{ primitive: "", x: 0, y: 0, size: 1 }] }],
      }),
    ).toThrow(/spec\.elements\[0\]\.children\[0\]\.primitive/);
  });
});
