import { describe, expect, it } from "vitest";
import { parsePathData } from "./path-data.js";
import { defaultRegistry } from "./registry.js";
import { rectToPath, sampleShape, type PathCommand, type Shape } from "./geometry.js";
import {
  cornerAngle,
  corners,
  moveVertex,
  segmentHeading,
  segmentStart,
  setCorner,
  skeletonFromCommands,
  skeletonFromPathData,
  skeletonToCommands,
} from "./skeleton.js";

const round = (n: number) => Math.round(n * 1e6) / 1e6;

describe("skeleton: reading", () => {
  it("shares a vertex between the segments that meet there", () => {
    const s = skeletonFromPathData("M0 0 L10 0 L10 10");
    expect(s.vertices).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
    // The corner is one point, not two copies of one: the first segment ends
    // where the second begins, by index.
    expect(s.subpaths[0]!.segments[0]!.to).toBe(1);
    expect(segmentStart(s.subpaths[0]!, 1)).toBe(1);
  });

  it("materialises the closing edge, so a closed shape has no special corner", () => {
    const s = skeletonFromPathData("M0 0 L10 0 L10 10 Z");
    const sub = s.subpaths[0]!;
    expect(sub.closed).toBe(true);
    expect(sub.segments).toHaveLength(3);
    expect(sub.segments[2]).toEqual({ kind: "line", to: 0 });
    // Three edges, three corners — including the one at the start vertex.
    expect(corners(s)).toHaveLength(3);
  });

  it("does not add an edge when the path already drew it", () => {
    const s = skeletonFromPathData("M0 0 L10 0 L10 10 L0 0 Z");
    expect(s.subpaths[0]!.segments).toHaveLength(3);
    expect(s.vertices).toHaveLength(3);
  });

  it("keeps an ellipse an ellipse, rather than rounding it to the circle it nearly is", () => {
    // Reducing rx/ry to one radius would silently redraw someone's curve. The
    // circular case — every arc this set's construction produces — still costs
    // one number.
    const oval = skeletonFromPathData("M2 12 A10 5 0 1 0 22 12");
    expect(oval.subpaths[0]!.segments[0]).toMatchObject({ radius: 10, radiusY: 5 });
    expect(skeletonToCommands(oval)).toEqual(parsePathData("M2 12 A10 5 0 1 0 22 12"));
    // A corner rule declines to measure it rather than using the circular
    // formula, which would be confidently wrong.
    expect(cornerAngle(oval, oval.subpaths[0]!, 0)).toBeUndefined();
    expect(skeletonFromPathData("M0 0 A5 5 0 0 1 5 5").subpaths[0]!.segments[0]).not.toHaveProperty("radiusY");
  });

  it("reads arcs and cubics without flattening them", () => {
    const s = skeletonFromPathData("M0 0 A2 2 0 0 1 4 0 C5 1 6 2 7 3");
    expect(s.subpaths[0]!.segments[0]).toEqual({ kind: "arc", to: 1, radius: 2, largeArc: false, sweep: true });
    expect(s.subpaths[0]!.segments[1]).toMatchObject({ kind: "cubic", c1: [5, 1], c2: [6, 2] });
  });

  it("keeps several subpaths apart", () => {
    const s = skeletonFromPathData(["M0 0 L4 0", "M8 0 L12 0 Z"]);
    expect(s.subpaths).toHaveLength(2);
    expect(s.subpaths[0]!.closed).toBe(false);
    expect(s.subpaths[1]!.closed).toBe(true);
  });

  it("welds only what it is told to weld", () => {
    const nearly = "M0 0 L10 0 M10.001 0 L10 10";
    expect(skeletonFromPathData(nearly).vertices).toHaveLength(4);
    // Tidy asks for this explicitly; reading geometry must never do it quietly.
    expect(skeletonFromPathData(nearly, { weld: 0.01 }).vertices).toHaveLength(3);
  });
});

describe("skeleton: round trip", () => {
  it("returns the commands it was given", () => {
    for (const d of [
      "M0 0 L10 0 L10 10 Z",
      "M1 1 L5 1 A2 2 0 0 1 7 3 L7 7 Z",
      "M0 0 C1 1 2 2 3 3",
      "M2 2 H10 V10 H2 Z",
      "M0 0 L4 0 M8 0 L12 4",
    ]) {
      const commands = parsePathData(d);
      expect(skeletonToCommands(skeletonFromCommands(commands)), d).toEqual(commands);
    }
  });

  it("round-trips every shape in the built-in vocabulary unchanged", () => {
    // The whole vocabulary, built at a real size, as the geometry it actually
    // draws. This is the test that says the representation is not lossy: not
    // three hand-picked paths, but every drawing the set ships.
    const ctx = {
      canvas: 24,
      scale: 1,
      strokeWidth: 1.5,
      cornerRadius: 2,
      style: "outline" as const,
      grid: 0.5,
      box: { x: 0, y: 0, width: 24, height: 24 },
    };

    /** Every shape kind as path commands, which is what a skeleton reads. */
    const asCommands = (shape: Shape): PathCommand[] | undefined => {
      switch (shape.kind) {
        case "path":
          return [...shape.commands];
        case "rect":
          return [...rectToPath(shape).commands];
        case "line":
          return [
            { c: "M", x: shape.x1, y: shape.y1 },
            { c: "L", x: shape.x2, y: shape.y2 },
          ];
        case "polyline": {
          const [first, ...rest] = shape.points;
          if (!first) return undefined;
          const out: PathCommand[] = [{ c: "M", x: first[0], y: first[1] }];
          for (const [x, y] of rest) out.push({ c: "L", x, y });
          if (shape.closed) out.push({ c: "Z" });
          return out;
        }
        default:
          return undefined; // a circle is not a construction; it has no corners
      }
    };

    let checked = 0;
    for (const primitive of defaultRegistry.list()) {
      for (const shape of primitive.build(ctx as never) as Shape[]) {
        const commands = asCommands(shape);
        if (!commands) continue;
        expect(skeletonToCommands(skeletonFromCommands(commands)), `${primitive.name} (${shape.kind})`).toEqual(commands);
        checked++;
      }
    }
    // rect + line + polyline + path across the shipped vocabulary.
    expect(checked).toBeGreaterThanOrEqual(46);
  });

  it("keeps the drawing in the same place", () => {
    const d = "M2 2 L10 2 A2 2 0 0 1 12 4 L12 12 Z";
    const before = sampleShape({ kind: "path", commands: parsePathData(d), fillable: true });
    const after = sampleShape({
      kind: "path",
      commands: skeletonToCommands(skeletonFromPathData(d)),
      fillable: true,
    });
    expect(after.map((poly) => poly.map(([x, y]) => [round(x), round(y)]))).toEqual(
      before.map((poly) => poly.map(([x, y]) => [round(x), round(y)])),
    );
  });
});

describe("skeleton: corners", () => {
  const angleAt = (d: string, joint: number) => {
    const s = skeletonFromPathData(d);
    return cornerAngle(s, s.subpaths[0]!, joint);
  };

  it("measures the included angle, not the turn", () => {
    // Right angle: the pen turns 90°, and the corner *is* 90°.
    expect(angleAt("M0 0 L10 0 L10 10", 1)).toBeCloseTo(90, 6);
    // Straight through is 180, whatever the direction of travel.
    expect(angleAt("M0 0 L10 0 L20 0", 1)).toBeCloseTo(180, 6);
    // A spike doubles back on itself.
    expect(angleAt("M0 0 L10 0 L0 1", 1)).toBeLessThan(10);
  });

  it("measures a 45° corner as 45, which is what the radius ramp is keyed on", () => {
    expect(angleAt("M0 0 L10 0 L0 10", 1)).toBeCloseTo(45, 6);
    expect(angleAt("M0 10 L10 10 L20 0", 1)).toBeCloseTo(135, 6);
  });

  it("uses the tangent where an edge is already round, not the chord", () => {
    // Both arcs run between the same two points, and both chords head off at
    // 45°. Measured by chord, both corners would read 135. They are not the
    // same corner: one arc leaves along the line it continues, the other turns.
    expect(angleAt("M0 0 L10 0 A5 5 0 0 1 15 5", 1)).toBeCloseTo(180, 6);
    expect(angleAt("M0 0 L10 0 A5 5 0 0 0 15 5", 1)).toBeCloseTo(90, 6);
  });

  it("measures an arc tangent exactly, because a band boundary is a cliff", () => {
    // A corner 2° out lands in the wrong band of the radius ramp. Sampling the
    // arc and taking the first step is about that far out, so this is computed.
    const s = skeletonFromPathData("M0 0 L10 0 A5 5 0 0 1 15 5");
    expect(segmentHeading(s, s.subpaths[0]!, 1)).toBeCloseTo(0, 9);
    expect(segmentHeading(s, s.subpaths[0]!, 1, true)).toBeCloseTo(90, 9);
  });

  it("has no corner at an open end, and one at every joint of a closed shape", () => {
    const open = skeletonFromPathData("M0 0 L10 0 L10 10");
    expect(cornerAngle(open, open.subpaths[0]!, 0)).toBeUndefined();
    expect(corners(open)).toHaveLength(1);

    const closed = skeletonFromPathData("M0 0 L10 0 L10 10 L0 10 Z");
    expect(corners(closed).map((c) => Math.round(c.angle))).toEqual([90, 90, 90, 90]);
  });
});

describe("skeleton: editing", () => {
  it("moves everything attached to a vertex, because it is one vertex", () => {
    const s = skeletonFromPathData("M0 0 L10 0 L10 10 Z");
    const moved = moveVertex(s, 1, [10, -5]);
    expect(moved.vertices[1]).toEqual([10, -5]);
    // Both edges that met there now meet at the new place, with no fix-up pass.
    const commands = skeletonToCommands(moved);
    expect(commands[1]).toEqual({ c: "L", x: 10, y: -5 });
    expect(commands[2]).toEqual({ c: "L", x: 10, y: 10 });
    // And the original is untouched, so an editor can undo by keeping it.
    expect(s.vertices[1]).toEqual([10, 0]);
  });

  it("states and clears a radius at one joint", () => {
    const s = skeletonFromPathData("M0 0 L10 0 L10 10 Z");
    const pinned = setCorner(s, 1, 0.5);
    expect(pinned.corners).toEqual({ 1: 0.5 });
    expect(setCorner(pinned, 1, undefined).corners).toEqual({});
    // A stated radius survives the vertices moving under it.
    expect(moveVertex(pinned, 1, [12, 0]).corners).toEqual({ 1: 0.5 });
  });
});
