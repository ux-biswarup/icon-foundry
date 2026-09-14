import { describe, expect, it } from "vitest";
import { bandPolygon, bandThrough, clipOutsideBand, distanceFromBand, isInsideBand } from "./clip.js";
import { sampleShape, type Point } from "./geometry.js";
import { skeletonFromPathData, skeletonToCommands, type Skeleton } from "./skeleton.js";

const band = bandThrough([12, 12], 45, 4);
const length = (s: Skeleton): number => {
  const shape = { kind: "path" as const, commands: skeletonToCommands(s), fillable: false };
  let total = 0;
  for (const poly of sampleShape(shape)) {
    for (let i = 0; i < poly.length - 1; i++) total += Math.hypot(poly[i + 1]![0] - poly[i]![0], poly[i + 1]![1] - poly[i]![1]);
  }
  return total;
};
const points = (s: Skeleton): Point[] =>
  sampleShape({ kind: "path", commands: skeletonToCommands(s), fillable: false }).flat();

describe("a band", () => {
  it("measures distance from its centreline", () => {
    expect(distanceFromBand([12, 12], band)).toBeCloseTo(0, 9);
    // Two units along the normal is two units off the line, whatever the angle.
    expect(Math.abs(distanceFromBand([12 - Math.SQRT1_2 * 2, 12 + Math.SQRT1_2 * 2], band))).toBeCloseTo(2, 9);
    expect(isInsideBand([12, 12], band)).toBe(true);
    expect(isInsideBand([0, 24], band)).toBe(false);
  });

  it("covers the canvas, for the filled style where the cut is a hole", () => {
    const polygon = bandPolygon(band, 24);
    expect(polygon).toHaveLength(4);
    // Its corners straddle the centreline by exactly half the width.
    for (const corner of polygon) expect(Math.abs(distanceFromBand(corner, band))).toBeCloseTo(2, 6);
  });
});

describe("clipOutsideBand", () => {
  it("leaves a drawing that never meets the band alone", () => {
    // Well clear of the diagonal: a corner up in the top right.
    const clear = skeletonFromPathData("M14 2 L20 2 L20 8");
    const cut = clipOutsideBand(clear, band);
    expect(skeletonToCommands(cut)).toEqual(skeletonToCommands(clear));
  });

  it("removes a drawing that lies entirely inside it", () => {
    const covered = clipOutsideBand(skeletonFromPathData("M11 13 L13 11"), band);
    expect(covered.subpaths).toEqual([]);
  });

  it("cuts a line into the two pieces that survive", () => {
    const cut = clipOutsideBand(skeletonFromPathData("M2 22 L22 2"), band);
    expect(cut.subpaths).toHaveLength(2);
    // Nothing that is left is inside the band.
    for (const point of points(cut)) expect(isInsideBand(point, band, 1e-6)).toBe(false);
  });

  it("opens a closed shape rather than drawing across the gap", () => {
    const cut = clipOutsideBand(skeletonFromPathData("M4 4 L20 4 L20 20 L4 20 Z"), band);
    expect(cut.subpaths.length).toBeGreaterThan(0);
    expect(cut.subpaths.every((s) => !s.closed)).toBe(true);
    for (const point of points(cut)) expect(isInsideBand(point, band, 1e-6)).toBe(false);
  });

  it("cuts an arc without turning it into a line", () => {
    const circle = skeletonFromPathData("M4 12 A8 8 0 1 0 20 12 A8 8 0 1 0 4 12 Z");
    const cut = clipOutsideBand(circle, band);
    const kinds = cut.subpaths.flatMap((s) => s.segments.map((seg) => seg.kind));
    expect(kinds).toContain("arc");
    for (const point of points(cut)) expect(isInsideBand(point, band, 1e-6)).toBe(false);
  });

  it("only ever takes ink away", () => {
    for (const d of [
      "M2 22 L22 2",
      "M4 4 L20 4 L20 20 L4 20 Z",
      "M4 12 A8 8 0 1 0 20 12 A8 8 0 1 0 4 12 Z",
      "M2 2 L8 2 L8 8 M16 16 L22 16",
      "M2 20 C8 2 16 2 22 20",
    ]) {
      const before = skeletonFromPathData(d);
      const after = clipOutsideBand(before, band);
      expect(length(after), d).toBeLessThanOrEqual(length(before) + 1e-6);
      for (const point of points(after)) expect(isInsideBand(point, band, 1e-3), d).toBe(false);
    }
  });

  it("keeps every piece the band does not cover, on both sides", () => {
    // A line crossing the band leaves one piece each side, and they add up to
    // the original less the width of the crossing.
    const before = skeletonFromPathData("M2 22 L22 2");
    const after = clipOutsideBand(before, band);
    // The band is 4 wide and this line crosses it square on, so exactly 4 units
    // of the drawing are taken — no more, and from the middle rather than an end.
    expect(length(after)).toBeCloseTo(length(before) - 4, 3);
    expect(after.subpaths).toHaveLength(2);
  });
});
