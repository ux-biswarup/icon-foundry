import { describe, expect, it } from "vitest";
import { circle, line, rect, sampleShape, shapeBounds, shapeDistance } from "./geometry.js";
import { parsePathData, pathShapeFromData } from "./path-data.js";
import { definePathPrimitive } from "./path-primitive.js";

describe("parsePathData", () => {
  it("parses absolute commands and implicit repetition", () => {
    expect(parsePathData("M0 0 L10 0 20 0 Z")).toEqual([
      { c: "M", x: 0, y: 0 },
      { c: "L", x: 10, y: 0 },
      { c: "L", x: 20, y: 0 },
      { c: "Z" },
    ]);
  });

  it("converts relative commands, H and V to absolute L", () => {
    expect(parsePathData("m2,3 h4 v-1 l1 1 z")).toEqual([
      { c: "M", x: 2, y: 3 },
      { c: "L", x: 6, y: 3 },
      { c: "L", x: 6, y: 2 },
      { c: "L", x: 7, y: 3 },
      { c: "Z" },
    ]);
  });

  it("parses arcs and cubics", () => {
    const cmds = parsePathData("M0 12A12 12 0 0 1 24 12C24 16 12 24 12 24");
    expect(cmds[1]).toMatchObject({ c: "A", rx: 12, ry: 12, largeArc: false, sweep: true, x: 24, y: 12 });
    expect(cmds[2]).toMatchObject({ c: "C", x: 12, y: 24 });
  });

  it("rejects unsupported commands and malformed data", () => {
    expect(() => parsePathData("M0 0 Q1 1 2 2")).toThrow(/unsupported path command "Q"/);
    expect(() => parsePathData("L0 0")).toThrow(/must start with M/);
    expect(() => parsePathData("M0")).toThrow(/expected a number/);
    expect(() => parsePathData("")).toThrow(/empty/);
  });

  it("infers fillable from closure", () => {
    expect(pathShapeFromData("M0 0 L1 0 L1 1 Z").fillable).toBe(true);
    expect(pathShapeFromData("M0 0 L1 0 L1 1").fillable).toBe(false);
    expect(pathShapeFromData("M0 0 L1 0 L1 1 Z", false).fillable).toBe(false);
  });
});

describe("sampleShape and shapeDistance", () => {
  it("samples closed shapes back to their start", () => {
    const [poly] = sampleShape(rect(0, 0, 2, 2));
    expect(poly?.[0]).toEqual(poly?.[poly.length - 1]);
    const [circ] = sampleShape(circle(0, 0, 1));
    expect(circ?.length).toBeGreaterThan(8);
  });

  it("measures gaps and detects crossings", () => {
    expect(shapeDistance(line(0, 0, 10, 0), line(0, 3, 10, 3))).toBeCloseTo(3);
    expect(shapeDistance(line(0, 0, 10, 10), line(0, 10, 10, 0))).toBe(0);
    expect(shapeDistance(circle(0, 0, 5), circle(20, 0, 5))).toBeCloseTo(10, 1);
    expect(shapeDistance(rect(0, 0, 4, 4), line(4, 0, 4, 4))).toBe(0);
  });
});

describe("definePathPrimitive", () => {
  const cat = {
    name: "cat",
    category: "object",
    description: "A cat face.",
    keywords: ["cat", "kitten"],
    outline: ["M2 22 L2 8 L7 2 L10 7 L14 7 L17 2 L22 8 L22 22 Z", "M8 14 L8 14.01", "M16 14 L16 14.01"],
  };

  it("builds a primitive with an inferred box and optical shape", () => {
    const p = definePathPrimitive(cat);
    expect(p.name).toBe("cat");
    // The cat is drawn from (2, 2) to (22, 22), so it is 20 across and not 22.
    // Taking `maxX` by `maxY` would fold the two units between the origin and
    // the drawing into the drawing, and the composer would then scale that void
    // up with everything else: the ink would sit hard against the bottom and
    // right of its keyline with a gap along the top and left.
    expect(p.box).toEqual({ width: 20, height: 20 });
    expect(p.opticalShape).toBe("square");
    expect(p.origin).toBe("draft");
    expect(p.build({ style: "outline", strokeWidth: 2, cornerRadius: 2, scale: 1 })).toHaveLength(3);
    // filled falls back to the fillable (closed) outline paths
    expect(p.build({ style: "filled", strokeWidth: 2, cornerRadius: 2, scale: 1 })).toHaveLength(1);
    // And the geometry moved with the box, so it still fills it exactly.
    expect(shapeBounds(p.build({ style: "filled", strokeWidth: 2, cornerRadius: 2, scale: 1 })[0]!).maxY).toBe(20);
  });

  it("leaves a drawing that already starts at the origin exactly where it is", () => {
    const square = definePathPrimitive({
      name: "block",
      category: "shape",
      keywords: [],
      outline: ["M0 0 L10 0 L10 8 L0 8 Z"],
    });
    expect(square.box).toEqual({ width: 10, height: 8 });
    expect(shapeBounds(square.build({ style: "outline", strokeWidth: 2, cornerRadius: 0, scale: 1 })[0]!)).toMatchObject({
      minX: 0,
      minY: 0,
    });
  });

  it("keeps padding somebody declared, because that was a decision", () => {
    // Only the derived case was ever an accident. A stated box means the author
    // wanted the drawing to sit inside it, and moving it would overrule them.
    const padded = definePathPrimitive({ ...cat, box: { width: 24, height: 24 } });
    expect(padded.box).toEqual({ width: 24, height: 24 });
    // Unrounded, so this measures where the drawing sits rather than where the
    // corner ramp pulled its sharpest point to.
    expect(shapeBounds(padded.build({ style: "outline", strokeWidth: 2, cornerRadius: 0, scale: 1 })[0]!)).toMatchObject({
      minX: 2,
      minY: 2,
    });
  });

  it("respects a declared box and rejects geometry that leaves it", () => {
    expect(definePathPrimitive({ ...cat, box: { width: 24, height: 24 } }).box).toEqual({ width: 24, height: 24 });
    expect(() => definePathPrimitive({ ...cat, box: { width: 10, height: 10 } })).toThrow(/leaves the declared box/);
  });

  it("validates names, categories, paths and filled geometry", () => {
    expect(() => definePathPrimitive({ ...cat, name: "Cat Face" })).toThrow(/kebab-case/);
    expect(() => definePathPrimitive({ ...cat, category: "animal" })).toThrow(/one of shape/);
    expect(() => definePathPrimitive({ ...cat, outline: ["Q1 1"] })).toThrow(/element\.outline\[0\]/);
    expect(() => definePathPrimitive({ ...cat, outline: ["M0 0 L5 5"] })).toThrow(/no fillable geometry/);
  });
});
