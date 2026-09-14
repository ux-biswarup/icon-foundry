import { describe, expect, it } from "vitest";
import { defaultRegistry } from "./registry.js";
import { recognise } from "./recognise.js";
import { skeletonFromCommands, skeletonFromPathData, skeletonToCommands, type Skeleton } from "./skeleton.js";
import {
  mergeArcs,
  fixDots,
  mergeLines,
  mergePaths,
  removeBackdrop,
  removeTinySegments,
  smartClose,
  snapLinesToIntersection,
  snapToGrid,
  tidy,
  weldVertices,
} from "./tidy.js";

const options = { grid: 0.5, canvas: 24 };
const segments = (s: Skeleton) => s.subpaths.map((sub) => sub.segments.length);
const at = (s: Skeleton, i: number) => s.vertices[i]!.map((n) => Math.round(n * 1e6) / 1e6);

describe("tidy: passes", () => {
  it("snaps vertices to the layout grid", () => {
    const s = snapToGrid(skeletonFromPathData("M0.13 0.02 L9.9 0.1"), 0.5);
    expect(at(s, 0)).toEqual([0, 0]);
    expect(at(s, 1)).toEqual([10, 0]);
    // Zero leaves a drawing alone rather than rounding it to nothing.
    expect(snapToGrid(skeletonFromPathData("M0.13 0.02 L9.9 0.1"), 0).vertices[0]).toEqual([0.13, 0.02]);
  });

  it("welds two points that are the same point", () => {
    const s = weldVertices(skeletonFromPathData("M0 0 L10 0 M10.004 0 L10 10"), 0.01);
    expect(s.vertices).toHaveLength(3);
  });

  it("puts two nearly-meeting lines on their true crossing, keeping both directions", () => {
    // A hand-drawn corner: the horizontal stops short, the vertical starts late.
    const s = snapLinesToIntersection(skeletonFromPathData("M0 0 L9.97 0.02 M10.02 0.05 L10 10"), 0.1);
    // One point, and it is where the two lines actually cross — which is a
    // little past the end of both, not the midpoint of the gap.
    expect(s.vertices).toHaveLength(3);
    const corner = s.vertices.find(([x, y]) => Math.abs(x - 10) < 0.1 && Math.abs(y) < 0.1)!;
    expect(corner[0]).toBeCloseTo(10.0201, 4);
    expect(corner[1]).toBeCloseTo(0.0201, 4);
    // The claim this pass makes: both lines keep the direction they were drawn
    // at. Welding the ends to their midpoint instead would tilt both, and a
    // language built on 0/45/90 is made of those directions.
    expect(s.vertices).toContainEqual([0, 0]);
    expect(s.vertices).toContainEqual([10, 10]);
  });

  it("collapses a segment too short to see, without losing the drawing", () => {
    const s = removeTinySegments(skeletonFromPathData("M0 0 L10 0 L10.004 0 L10 10"), 0.05);
    expect(segments(s)).toEqual([2]);
    // A subpath that *is* one short segment is a dash or a dot, and survives.
    expect(segments(removeTinySegments(skeletonFromPathData("M0 0 L0.004 0"), 0.05))).toEqual([1]);
  });

  it("merges collinear lines, but not through a junction or a pinned corner", () => {
    expect(segments(mergeLines(skeletonFromPathData("M0 0 L5 0 L10 0"), 0.5))).toEqual([1]);
    // A T: the middle vertex carries a third segment, so it is not a place to
    // merge through even though the two lines are collinear.
    const tee = skeletonFromPathData("M0 0 L5 0 L10 0 M5 0 L5 5");
    expect(segments(mergeLines(tee, 0.5))).toEqual([2, 1]);
    // A joint someone pinned a radius to is a corner, whatever its angle says.
    const pinned = { ...skeletonFromPathData("M0 0 L5 0 L10 0"), corners: { 1: 1 } };
    expect(segments(mergeLines(pinned, 0.5))).toEqual([2]);
  });

  it("closes a subpath whose ends have come together", () => {
    const s = smartClose(skeletonFromPathData("M0 0 L10 0 L10 10 L0.004 0.004"), 0.01);
    expect(s.subpaths[0]!.closed).toBe(true);
    expect(s.vertices).toHaveLength(3);
  });

  it("joins two open subpaths that meet end to end", () => {
    const s = mergePaths(skeletonFromPathData(["M0 0 L10 0", "M10 0 L10 10"]));
    expect(segments(s)).toEqual([2]);
  });

  it("drops a backdrop the size of the canvas", () => {
    const withBackdrop = skeletonFromPathData(["M0 0 L24 0 L24 24 L0 24 Z", "M4 4 L8 4"]);
    expect(removeBackdrop(withBackdrop, 24, 0.01).subpaths).toHaveLength(1);
    // A rectangle that is merely large is a drawing.
    const drawing = skeletonFromPathData("M2 2 L20 2 L20 20 L2 20 Z");
    expect(removeBackdrop(drawing, 24, 0.01).subpaths).toHaveLength(1);
  });

  it("turns a loop too small to read into a dot rather than deleting it", () => {
    const s = fixDots(skeletonFromPathData("M4 4 L4.02 4 L4.02 4.02 L4 4.02 Z"), 0.1);
    expect(segments(s)).toEqual([1]);
    // Ink a person drew stays on the canvas, at the middle of where it was.
    expect(at(s, 0)).toEqual([4.01, 4.01]);
  });
});

describe("tidy: the pipeline", () => {
  it("makes a hand-drawn box into a box", () => {
    // Four strokes, none quite meeting, none quite on the grid.
    const drawn = skeletonFromPathData([
      "M2.03 1.98 L17.99 2.01",
      "M18.02 2.04 L18 17.97",
      "M17.98 18.02 L2.01 18",
      "M1.99 17.99 L2.02 2.03",
    ]);
    const clean = tidy(drawn, options);
    expect(clean.subpaths).toHaveLength(1);
    expect(clean.subpaths[0]!.closed).toBe(true);
    expect(clean.subpaths[0]!.segments).toHaveLength(4);
    expect(clean.vertices.map((v) => v.map(Math.round))).toEqual([
      [2, 2],
      [18, 2],
      [18, 18],
      [2, 18],
    ]);
  });

  it("is idempotent: tidying a tidy drawing changes nothing", () => {
    const drawn = skeletonFromPathData([
      "M2.03 1.98 L17.99 2.01",
      "M18.02 2.04 L18 17.97",
      "M17.98 18.02 L2.01 18",
      "M1.99 17.99 L2.02 2.03",
    ]);
    const once = tidy(drawn, options);
    expect(skeletonToCommands(tidy(once, options))).toEqual(skeletonToCommands(once));
  });

  it("leaves the shipped vocabulary alone, because it is already right", () => {
    // The strongest test of a tidy is not what it repairs but what it refuses to
    // touch: run it over drawings that need no tidying and check it is not
    // quietly "improving" them.
    let checked = 0;
    for (const primitive of defaultRegistry.list()) {
      for (const shape of primitive.build({ style: "outline", strokeWidth: 1.5, cornerRadius: 2, scale: 1 })) {
        if (shape.kind !== "path") continue;
        const before = skeletonFromCommands(shape.commands);
        expect(skeletonToCommands(tidy(before, { canvas: 24 })), primitive.name).toEqual(skeletonToCommands(before));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(5);
  });

  it("only moves a drawing onto the grid when asked, because the set is not all on it", () => {
    // Grid snapping is the one pass that will move geometry that was already
    // right: a thermometer's bulb does not sit on halves, and nor does any 45°
    // construction whose length is a diagonal. So it is off unless asked for,
    // and asking for it is a decision about a drawing rather than a clean-up.
    const bulb = skeletonFromPathData("M3 16.5 L3 16.532 L3.25 16.75");
    expect(skeletonToCommands(tidy(bulb, {}))).toEqual(skeletonToCommands(bulb));
    expect(skeletonToCommands(tidy(bulb, { grid: 0.5 }))).not.toEqual(skeletonToCommands(bulb));
  });

  it("survives a pass that cannot cope, rather than failing the whole tidy", () => {
    // Geometry with a degenerate segment and a lone point: the kind of thing a
    // cut leaves behind.
    const awkward = skeletonFromPathData(["M5 5 L5 5", "M0 0 L10 0 L10 10"]);
    expect(() => tidy(awkward, options)).not.toThrow();
    expect(tidy(awkward, options).subpaths.length).toBeGreaterThan(0);
  });

  it("does not quietly delete ink", () => {
    const drawn = skeletonFromPathData(["M2 2 L18 2", "M2 6 L18 6", "M2 10 L18 10"]);
    expect(tidy(drawn, options).subpaths).toHaveLength(3);
  });
});

describe("recognise", () => {
  const registry = defaultRegistry;

  it("knows a hand-drawn box is a square", () => {
    const drawn = tidy(
      skeletonFromPathData([
        "M2.03 1.98 L17.99 2.01",
        "M18.02 2.04 L18 17.97",
        "M17.98 18.02 L2.01 18",
        "M1.99 17.99 L2.02 2.03",
      ]),
      options,
    );
    const found = recognise(drawn, registry, { grid: 0.5 });
    expect(found?.primitive).toBe("square");
    expect(found?.box).toMatchObject({ x: 2, y: 2, width: 16, height: 16 });
  });

  it("knows a drawn circle is a circle", () => {
    const drawn = skeletonFromPathData("M4 12 A8 8 0 1 0 20 12 A8 8 0 1 0 4 12 Z");
    expect(recognise(drawn, registry, { grid: 0.5 })?.primitive).toBe("circle");
  });

  it("declines rather than guessing", () => {
    // A shape the set has no name for stays exactly as it was drawn.
    const blob = skeletonFromPathData("M2 2 L18 5 L15 18 L6 14 L9 9 Z");
    expect(recognise(blob, registry, { grid: 0.5 })).toBeUndefined();
  });

  it("declines a stretched primitive rather than claiming the box would fit", () => {
    // A 2:1 "circle" is an ellipse. Whether the composer would draw one for that
    // box is not this function's business, so it says nothing.
    const oval = skeletonFromPathData("M2 12 A10 5 0 1 0 22 12 A10 5 0 1 0 2 12 Z");
    expect(recognise(oval, registry, { grid: 0.5 })).toBeUndefined();
    // And the ellipse is still an ellipse: the skeleton kept both radii rather
    // than rounding it into the circle it nearly is.
    expect(skeletonToCommands(oval)[1]).toMatchObject({ c: "A", rx: 10, ry: 5 });
  });

  it("tightens with the tolerance it is given", () => {
    const wonky = skeletonFromPathData("M2 2 L18 2.4 L18 18 L2 18 Z");
    expect(recognise(wonky, registry, { tolerance: 1 })?.primitive).toBe("square");
    expect(recognise(wonky, registry, { tolerance: 0.05 })).toBeUndefined();
  });
});

describe("mergeArcs", () => {
  /** A quarter circle centred on the origin, split into two eighths. */
  const halves = () => skeletonFromPathData(["M10 0 A10 10 0 0 1 7.0711 7.0711 A10 10 0 0 1 0 10"]);

  it("makes two arcs of one circle into one arc", () => {
    const merged = mergeArcs(halves(), 0.05);
    expect(merged.subpaths[0]?.segments).toHaveLength(1);
    // Same circle, same ends: the drawing did not change, only its description.
    const only = merged.subpaths[0]?.segments[0];
    expect(only?.kind === "arc" && only.radius).toBeCloseTo(10, 3);
    expect(merged.vertices[merged.subpaths[0]!.segments[0]!.to]?.[0]).toBeCloseTo(0, 3);
  });

  it("leaves an S-bend alone, because equal radii are not a shared circle", () => {
    // Two arcs of the same radius that curve away from each other. Merging on
    // radius alone would replace this with a curve nobody drew.
    const s = skeletonFromPathData(["M0 0 A5 5 0 0 1 10 0 A5 5 0 0 0 20 0"]);
    expect(mergeArcs(s, 0.05).subpaths[0]?.segments).toHaveLength(2);
  });

  it("keeps a seam somebody pinned a radius to", () => {
    const pinned = { ...halves(), corners: { 1: 2 } };
    expect(mergeArcs(pinned, 0.05).subpaths[0]?.segments).toHaveLength(2);
  });

  it("keeps a seam another subpath joins", () => {
    // Three things meeting is a junction, and a junction is not a seam.
    const joined = skeletonFromPathData([
      "M10 0 A10 10 0 0 1 7.0711 7.0711 A10 10 0 0 1 0 10",
      "M7.0711 7.0711 L20 20",
    ]);
    expect(mergeArcs(joined, 0.05).subpaths[0]?.segments).toHaveLength(2);
  });

  it("sets the large-arc flag when the joined sweep passes a half turn", () => {
    // Three quarters of a circle, written as two arcs, each under a half turn.
    const wide = skeletonFromPathData(["M10 0 A10 10 0 0 1 -10 0 A10 10 0 0 1 0 -10"]);
    const merged = mergeArcs(wide, 0.05);
    const only = merged.subpaths[0]?.segments[0];
    expect(merged.subpaths[0]?.segments).toHaveLength(1);
    expect(only?.kind === "arc" && only.largeArc).toBe(true);
  });

  it("runs as part of tidy, on geometry that arrived split", () => {
    expect(tidy(halves(), { grid: 0, canvas: 24 }).subpaths[0]?.segments).toHaveLength(1);
  });
});
