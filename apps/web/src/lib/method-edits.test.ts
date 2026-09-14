import { skeletonFromPathData, type Skeleton } from "@icon-foundry/icon-primitives";
import { skeletonPaths } from "@icon-foundry/icon-renderer";
import { describe, expect, it } from "vitest";
import {
  compact,
  deleteSegments,
  duplicateSegments,
  moveControlPoint,
  moveVertices,
  setArcRadius,
  verticesOf,
} from "./method-edits.js";

const ring = () => skeletonFromPathData(["M2 2 L14 2 L14 14 L2 14 Z"]);
const line = () => skeletonFromPathData(["M0 0 L5 0 L10 0 L15 0"]);

const shape = (s: Skeleton) =>
  s.subpaths.map((sub) => ({ start: sub.start, closed: sub.closed, count: sub.segments.length }));

describe("deleteSegments", () => {
  it("turns a ring that loses an edge into one open run, not two", () => {
    // The case worth having a test for. Taking the first edge out of a closed
    // path leaves a chain that reads as two runs unless the gap is rotated to
    // the front, and "two runs" would draw a shape nobody asked for.
    const cut = deleteSegments(ring(), new Set(["0:1"]));
    // It restarts at the far side of the gap and runs the whole way round.
    expect(shape(cut)).toEqual([{ start: 2, closed: false, count: 3 }]);
    expect(cut.vertices).toHaveLength(4);
  });

  it("splits an open path cut in the middle", () => {
    expect(shape(deleteSegments(line(), new Set(["0:1"])))).toEqual([
      { start: 0, closed: false, count: 1 },
      { start: 2, closed: false, count: 1 },
    ]);
  });

  it("keeps a ring closed when nothing was taken from it", () => {
    expect(shape(deleteSegments(ring(), new Set()))).toEqual([{ start: 0, closed: true, count: 4 }]);
  });

  it("drops the vertices nothing refers to any more", () => {
    // An orphan is not harmless: the editor draws a handle per vertex, so one
    // left behind is a control point attached to nothing that still saves.
    const cut = deleteSegments(line(), new Set(["0:0", "0:1"]));
    expect(cut.vertices).toEqual([
      [10, 0],
      [15, 0],
    ]);
    expect(shape(cut)).toEqual([{ start: 0, closed: false, count: 1 }]);
  });

  it("renumbers a stated radius along with its vertex", () => {
    const stated: Skeleton = { ...line(), corners: { 2: 3 } };
    const cut = deleteSegments(stated, new Set(["0:0"]));
    // Vertex 2 became vertex 1; the radius followed rather than being orphaned
    // onto whichever vertex happened to inherit the number.
    expect(cut.corners).toEqual({ 1: 3 });
  });
});

describe("duplicateSegments", () => {
  it("gives the copy vertices of its own", () => {
    const copied = duplicateSegments(ring(), new Set(["0:0"]), [1, 1]);
    expect(copied.vertices).toHaveLength(6);
    expect(copied.vertices.slice(4)).toEqual([
      [3, 3],
      [15, 3],
    ]);
    // Welded to the original would be the faster edit and completely wrong:
    // dragging one would then drag the other.
    expect(copied.subpaths[1]?.start).toBe(4);
    expect(copied.subpaths[0]).toEqual(ring().subpaths[0]);
  });

  it("offsets a cubic's control points with it", () => {
    const skeleton = skeletonFromPathData(["M0 0 C1 1 2 2 3 3"]);
    const segment = duplicateSegments(skeleton, new Set(["0:0"]), [10, 0]).subpaths[1]?.segments[0];
    expect(segment?.kind === "cubic" && segment.c1).toEqual([11, 1]);
    expect(segment?.kind === "cubic" && segment.c2).toEqual([12, 2]);
  });

  it("copies a whole ring as a ring", () => {
    const copied = duplicateSegments(ring(), new Set(["0:0", "0:1", "0:2", "0:3"]), [1, 1]);
    expect(shape(copied)).toEqual([
      { start: 0, closed: true, count: 4 },
      { start: 4, closed: true, count: 4 },
    ]);
  });
});

describe("moving", () => {
  it("moves a set of vertices by one delta", () => {
    const moved = moveVertices(ring(), [0, 1], [0, 2]);
    expect(moved.vertices).toEqual([
      [2, 4],
      [14, 4],
      [14, 14],
      [2, 14],
    ]);
  });

  it("names every vertex a selection covers", () => {
    expect([...verticesOf(ring(), new Set(["0:0"]))]).toEqual([0, 1]);
    // Two edges that share a corner name three vertices, not four.
    expect([...verticesOf(ring(), new Set(["0:0", "0:1"]))]).toEqual([0, 1, 2]);
  });

  it("moves one handle of a cubic and leaves the other alone", () => {
    const skeleton = skeletonFromPathData(["M0 0 C1 1 2 2 3 3"]);
    const segment = moveControlPoint(skeleton, 0, 0, 1, [5, 5]).subpaths[0]?.segments[0];
    expect(segment?.kind === "cubic" && segment.c1).toEqual([5, 5]);
    expect(segment?.kind === "cubic" && segment.c2).toEqual([2, 2]);
  });

  it("states an arc's radius without touching its endpoints", () => {
    const skeleton = skeletonFromPathData(["M0 10 A10 10 0 0 1 10 0"]);
    const next = setArcRadius(skeleton, 0, 0, 12);
    const segment = next.subpaths[0]?.segments[0];
    expect(segment?.kind === "arc" && segment.radius).toBe(12);
    expect(next.vertices).toEqual(skeleton.vertices);
  });
});

describe("compact", () => {
  it("leaves a skeleton with nothing orphaned exactly as it was", () => {
    const before = ring();
    expect(compact(before)).toBe(before);
  });

  it("still writes path data that parses back to the same drawing", () => {
    // The property that matters across every edit: the skeleton is a parse of
    // path data, so it has to convert back losslessly or an edit is a slow leak.
    const cut = deleteSegments(ring(), new Set(["0:1"]));
    const again = skeletonFromPathData(skeletonPaths(cut, 4));
    // Compared as the drawing rather than as the data structure. A cut ring
    // restarts at the far side of the gap, so its vertices are numbered from
    // somewhere new — which is a different description of the same shape, and
    // path data is the description both sides agree on.
    expect(skeletonPaths(again, 4)).toEqual(skeletonPaths(cut, 4));
  });
});
