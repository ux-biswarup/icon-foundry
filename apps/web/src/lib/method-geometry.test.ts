import { technical } from "@icon-foundry/icon-language";
import { skeletonFromPathData } from "@icon-foundry/icon-primitives";
import { describe, expect, it } from "vitest";
import {
  arcCentre,
  arcPoint,
  filletRadiusFromDrag,
  filletTangents,
  filletViews,
  invert,
  jointViews,
  leavesSafeArea,
  mapPoint,
  mapSkeleton,
  nearMisses,
  placementFor,
  radiusFromDrag,
  segmentViews,
  subpathGaps,
} from "./method-geometry.js";

const tokens = technical.sizes[16]!;
const square = () => skeletonFromPathData(["M2 2 L14 2 L14 14 L2 14 Z"]);

describe("placement", () => {
  it("fits a box into another uniformly, centred in the slack", () => {
    // A wide part in a square box keeps its proportions and takes the middle,
    // which is what `compose()` does — the whole reason this is not a stretch.
    const p = placementFor({ x: 0, y: 0, width: 20, height: 10 }, { x: 0, y: 0, width: 10, height: 10 });
    expect(p.k).toBe(0.5);
    expect(mapPoint([0, 0], p)).toEqual([0, 2.5]);
    expect(mapPoint([20, 10], p)).toEqual([10, 7.5]);
  });

  it("inverts exactly, because a drag has to survive the round trip", () => {
    const p = placementFor({ x: 0, y: 0, width: 13, height: 13 }, tokens.optical.square);
    const back = invert(p);
    for (const point of [[0, 0], [6.5, 12.5], [13, 1]] as [number, number][]) {
      const there = mapPoint(point, p);
      const home = mapPoint(there, back);
      expect(home[0]).toBeCloseTo(point[0], 9);
      expect(home[1]).toBeCloseTo(point[1], 9);
    }
  });

  it("scales radii with the drawing, not just its points", () => {
    // The omission that looks like a rendering bug: a fillet whose radius did
    // not scale no longer meets the edges it was cut between.
    const skeleton = skeletonFromPathData(["M0 4 A4 4 0 0 1 4 0"]);
    const moved = mapSkeleton(skeleton, { k: 2, ox: 0, oy: 0 });
    const segment = moved.subpaths[0]?.segments[0];
    expect(segment?.kind).toBe("arc");
    expect(segment?.kind === "arc" && segment.radius).toBe(8);
  });

  it("scales a cubic's control points too", () => {
    const skeleton = skeletonFromPathData(["M0 0 C1 2 3 4 5 6"]);
    const segment = mapSkeleton(skeleton, { k: 2, ox: 1, oy: 1 }).subpaths[0]?.segments[0];
    expect(segment?.kind === "cubic" && segment.c1).toEqual([3, 5]);
    expect(segment?.kind === "cubic" && segment.c2).toEqual([7, 9]);
  });
});

describe("arcCentre", () => {
  it("finds a centre the arc's own endpoints agree with", () => {
    const found = arcCentre([0, 10], [10, 0], 10, 10, 0, false, true);
    expect(found).toBeDefined();
    if (!found) return;
    expect(Math.hypot(found.centre[0] - 0, found.centre[1] - 10)).toBeCloseTo(10, 6);
    expect(Math.hypot(found.centre[0] - 10, found.centre[1] - 0)).toBeCloseTo(10, 6);
    // And the parameterisation starts and ends where the path data says.
    expect(arcPoint(found, 0)[0]).toBeCloseTo(0, 6);
    expect(arcPoint(found, 0)[1]).toBeCloseTo(10, 6);
    expect(arcPoint(found, 1)[0]).toBeCloseTo(10, 6);
    expect(arcPoint(found, 1)[1]).toBeCloseTo(0, 6);
  });

  it("grows a radius too small to join the endpoints, as a renderer would", () => {
    // Otherwise the circle drawn on screen is one nobody will ever see, sitting
    // on top of the one they will.
    const found = arcCentre([0, 0], [10, 0], 2, 2, 0, false, true);
    expect(found?.rx).toBeCloseTo(5, 6);
  });
});

describe("segmentViews", () => {
  it("marks a line pointing somewhere the grammar does not allow", () => {
    const skeleton = skeletonFromPathData(["M0 0 L10 0", "M0 5 L10 8"]);
    const views = segmentViews(skeleton, technical);
    expect(views.map((v) => v.offAngle)).toEqual([false, true]);
    expect(views[1]?.heading).toBeCloseTo(16.699, 2);
  });

  it("says nothing about angles for a part that declared it needs its own", () => {
    const skeleton = skeletonFromPathData(["M0 5 L10 8"]);
    expect(segmentViews(skeleton, technical, true)[0]?.offAngle).toBe(false);
  });

  it("puts a curve's label on the curve, not on its chord", () => {
    const skeleton = skeletonFromPathData(["M0 10 A10 10 0 0 1 10 0"]);
    const view = segmentViews(skeleton, technical)[0]!;
    const chord: [number, number] = [5, 5];
    expect(Math.hypot(view.mid[0] - chord[0], view.mid[1] - chord[1])).toBeGreaterThan(1);
  });
});

describe("jointViews", () => {
  it("gives a right angle the radius the ramp says, with the circle it cuts", () => {
    const joints = jointViews(square(), technical, tokens.cornerRadius);
    expect(joints).toHaveLength(4);
    const corner = joints.find((j) => j.at[0] === 2 && j.at[1] === 2)!;
    expect(corner.angle).toBeCloseTo(90, 6);
    expect(corner.radius).toBe(1.5);
    expect(corner.overridden).toBe(false);
    // The centre sits on the bisector at r / sin(45°), and the arc leaves each
    // leg r / tan(45°) from the corner.
    expect(corner.centre?.[0]).toBeCloseTo(3.5, 6);
    expect(corner.centre?.[1]).toBeCloseTo(3.5, 6);
    expect(corner.tangents?.map((t) => t.map((n) => Math.round(n * 1e6) / 1e6))).toEqual([
      [2, 3.5],
      [3.5, 2],
    ]);
  });

  it("prefers a radius the author stated over the ramp's", () => {
    const stated = { ...square(), corners: { 0: 4 } };
    const corner = jointViews(stated, technical, tokens.cornerRadius).find((j) => j.vertex === 0)!;
    expect(corner.radius).toBe(4);
    expect(corner.overridden).toBe(true);
  });

  it("draws no circle where one would not fit", () => {
    // A radius larger than the legs can hold has no fillet, and an overlay that
    // drew one anyway would be inventing geometry.
    const tight = { ...skeletonFromPathData(["M0 0 L1 0 L1 1 Z"]), corners: { 1: 9 } };
    const corner = jointViews(tight, technical, tokens.cornerRadius).find((j) => j.vertex === 1);
    expect(corner?.centre).toBeUndefined();
  });
});

describe("radiusFromDrag", () => {
  it("reads a radius off the bisector and ignores everything across it", () => {
    const corner = jointViews(square(), technical, tokens.cornerRadius).find((j) => j.vertex === 0)!;
    // Straight out along the bisector from (2,2).
    expect(radiusFromDrag(corner, [5, 5])).toBeCloseTo(3, 6);
    // The same distance along the bisector, pushed sideways: same radius.
    expect(radiusFromDrag(corner, [6, 4])).toBeCloseTo(3, 6);
  });

  it("will not put the centre behind the corner", () => {
    const corner = jointViews(square(), technical, tokens.cornerRadius).find((j) => j.vertex === 0)!;
    expect(radiusFromDrag(corner, [0, 0])).toBe(0);
  });
});

describe("faults", () => {
  it("finds a loose end resting against a segment it never joined", () => {
    const skeleton = skeletonFromPathData(["M0 0 L10 0", "M5 0.3 L5 5"]);
    const found = nearMisses(skeleton, segmentViews(skeleton, technical), 0.75);
    expect(found).toHaveLength(1);
    expect(found[0]?.at).toEqual([5, 0.3]);
    expect(found[0]?.to[1]).toBeCloseTo(0, 6);
  });

  it("says nothing about ends that actually meet, because they are one point", () => {
    // The defect this representation cannot hold: two endpoints in the same
    // place are the same vertex, so there is no near miss to find.
    const skeleton = skeletonFromPathData(["M0 0 L10 0 L10 10"]);
    expect(nearMisses(skeleton, segmentViews(skeleton, technical), 0.75)).toHaveLength(0);
  });

  it("measures gaps between subpaths, not along one stroke", () => {
    const skeleton = skeletonFromPathData(["M0 0 L10 0", "M0 1 L10 1"]);
    const views = segmentViews(skeleton, technical);
    expect(subpathGaps(views, 1.5)).toHaveLength(1);
    expect(subpathGaps(views, 0.5)).toHaveLength(0);
    // One stroke is not a gap from itself however long it is.
    const single = segmentViews(skeletonFromPathData(["M0 0 L10 0"]), technical);
    expect(subpathGaps(single, 1.5)).toHaveLength(0);
  });

  it("catches ink leaving the safe area", () => {
    const inside = segmentViews(skeletonFromPathData(["M2 2 L14 2"]), technical);
    const outside = segmentViews(skeletonFromPathData(["M0.5 0.5 L14 2"]), technical);
    expect(leavesSafeArea(inside, 16, 1)).toBe(false);
    expect(leavesSafeArea(outside, 16, 1)).toBe(true);
  });
});

describe("fillets", () => {
  /**
   * A rounded corner, written the way anything that rounds writes one: a line
   * in, an arc, a line out, with the arc tangent to both. The corner it was cut
   * from is (10, 0) — a point that is no longer in the geometry at all.
   */
  const cut = (radius = 2) =>
    skeletonFromPathData([`M0 0 L${10 - radius} 0 A${radius} ${radius} 0 0 1 10 ${radius} L10 10`]);

  it("recovers the corner an arc was cut from", () => {
    const skeleton = cut();
    const found = filletViews(skeleton, segmentViews(skeleton, technical));
    expect(found).toHaveLength(1);
    expect(found[0]?.corner[0]).toBeCloseTo(10, 6);
    expect(found[0]?.corner[1]).toBeCloseTo(0, 6);
    expect(found[0]?.angle).toBeCloseTo(90, 6);
    expect(found[0]?.radius).toBeCloseTo(2, 6);
  });

  it("finds nothing at a tangent joint, which is why this exists at all", () => {
    // The joints of the same drawing measure straight through, so `jointViews`
    // correctly offers no handle — and without fillets there would be none.
    const skeleton = cut();
    const straight = jointViews(skeleton, technical, tokens.cornerRadius).filter((j) => j.centre);
    expect(straight).toHaveLength(0);
  });

  it("declines an ellipse, which is not a fillet", () => {
    const skeleton = skeletonFromPathData(["M0 0 L8 0 A2 4 0 0 1 10 4 L10 10"]);
    expect(filletViews(skeleton, segmentViews(skeleton, technical))).toHaveLength(0);
  });

  it("reads a new radius off the bisector of the recovered corner", () => {
    const skeleton = cut();
    const fillet = filletViews(skeleton, segmentViews(skeleton, technical))[0]!;
    // The bisector of a right angle at (10,0) opening back into the drawing
    // points up-left. Three units along it is a radius of 3 / √2 · √2 = 3.
    const bisector: [number, number] = [
      (fillet.legs[0][0] + fillet.legs[1][0]) / Math.SQRT2,
      (fillet.legs[0][1] + fillet.legs[1][1]) / Math.SQRT2,
    ];
    const at: [number, number] = [
      fillet.corner[0] + bisector[0] * 3 * Math.SQRT2,
      fillet.corner[1] + bisector[1] * 3 * Math.SQRT2,
    ];
    expect(filletRadiusFromDrag(fillet, at)).toBeCloseTo(3, 6);
  });

  it("will not cut a fillet longer than the legs it sits between", () => {
    const skeleton = cut();
    const fillet = filletViews(skeleton, segmentViews(skeleton, technical))[0]!;
    // Dragged far past the far end of the shorter leg.
    const huge = filletRadiusFromDrag(fillet, [-100, 100]);
    expect(huge).toBeLessThanOrEqual(Math.min(...fillet.room) + 1e-9);
  });

  it("puts the tangent points back on the legs for any radius", () => {
    const skeleton = cut();
    const fillet = filletViews(skeleton, segmentViews(skeleton, technical))[0]!;
    const next = filletTangents(fillet, 4);
    // A 4-unit fillet of a right angle leaves each leg 4 units from the corner.
    expect(next.from[0]).toBeCloseTo(6, 6);
    expect(next.from[1]).toBeCloseTo(0, 6);
    expect(next.to[0]).toBeCloseTo(10, 6);
    expect(next.to[1]).toBeCloseTo(4, 6);
    // And the centre stays equidistant from both, which is what makes it an arc.
    expect(Math.hypot(next.centre[0] - next.from[0], next.centre[1] - next.from[1])).toBeCloseTo(4, 6);
    expect(Math.hypot(next.centre[0] - next.to[0], next.centre[1] - next.to[1])).toBeCloseTo(4, 6);
  });

  it("recovers the same corner whatever the radius", () => {
    // The property the handle depends on: re-cutting must not drift the corner,
    // or a second drag would be measured from somewhere the first one moved.
    for (const radius of [0.5, 1, 2, 4]) {
      const skeleton = cut(radius);
      const fillet = filletViews(skeleton, segmentViews(skeleton, technical))[0]!;
      expect(fillet.corner[0]).toBeCloseTo(10, 6);
      expect(fillet.corner[1]).toBeCloseTo(0, 6);
    }
  });
});
