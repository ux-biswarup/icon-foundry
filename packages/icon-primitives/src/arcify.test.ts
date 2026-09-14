import { describe, expect, it } from "vitest";
import { cornerRadiusFor, DEFAULT_CORNERS } from "@icon-foundry/icon-language";
import { arcify } from "./arcify.js";
import { definePathPrimitive } from "./path-primitive.js";
import { shapeBounds } from "./geometry.js";
import { corners, skeletonFromPathData, skeletonToCommands, setCorner, type Skeleton } from "./skeleton.js";

const rounded = (d: string | string[], options: Parameters<typeof arcify>[1]) => arcify(skeletonFromPathData(d), options);
const arcs = (s: Skeleton) => s.subpaths.flatMap((sub) => sub.segments.filter((seg) => seg.kind === "arc"));
const commands = (s: Skeleton) =>
  skeletonToCommands(s).map((c) =>
    Object.fromEntries(
      Object.entries(c).map(([k, v]) => [k, typeof v === "number" ? Math.round(v * 1e9) / 1e9 : v]),
    ),
  );
const near = (n: number, to: number, within = 1e-6) => Math.abs(n - to) <= within;
/** The drawing itself, for measuring; `commands` is for reading. */
const drawn = (s: Skeleton) => ({ kind: "path" as const, commands: skeletonToCommands(s), fillable: false });

describe("the radius ramp", () => {
  it("reads sharpest band first, and the last band takes everything above", () => {
    // The shipped ramp, against a language whose rectangles round by 2.
    expect(cornerRadiusFor(30, DEFAULT_CORNERS, 2)).toBe(1);
    expect(cornerRadiusFor(60, DEFAULT_CORNERS, 2)).toBe(1);
    expect(cornerRadiusFor(90, DEFAULT_CORNERS, 2)).toBe(2);
    expect(cornerRadiusFor(150, DEFAULT_CORNERS, 2)).toBe(4);
  });

  it("is a multiple of the language's own roundness, so one number moves the set", () => {
    // The property that makes the default safe: a right angle rounds exactly the
    // way this language's rectangles round.
    for (const cornerRadius of [0, 1, 2, 3.5]) {
      expect(cornerRadiusFor(90, DEFAULT_CORNERS, cornerRadius)).toBe(cornerRadius);
    }
  });
});

describe("arcify", () => {
  it("replaces a right angle with a tangent arc of the ramp's radius", () => {
    const s = rounded("M0 0 L10 0 L10 10", { cornerRadius: 2 });
    expect(arcs(s)).toHaveLength(1);
    expect(arcs(s)[0]).toMatchObject({ radius: 2 });
    // Tangent distance for a right angle is the radius itself, so the arc starts
    // 2 before the corner and ends 2 after it — and the corner is gone.
    expect(commands(s)).toEqual([
      { c: "M", x: 0, y: 0 },
      { c: "L", x: 8, y: 0 },
      { c: "A", rx: 2, ry: 2, rotation: 0, largeArc: false, sweep: true, x: 10, y: 2 },
      { c: "L", x: 10, y: 10 },
    ]);
  });

  it("rounds a sharp point less than a gentle bend, which is the whole point of a ramp", () => {
    // 45° and 153°: one in the sharp band, one in the gentle one.
    const sharp = arcs(rounded("M0 0 L10 0 L0 10", { cornerRadius: 2 }))[0];
    const gentle = arcs(rounded("M0 0 L10 0 L18 4", { cornerRadius: 2 }))[0];
    expect(sharp).toMatchObject({ radius: 1 });
    expect(gentle).toMatchObject({ radius: 4 });
  });

  it("gives a spike whatever radius fits, rather than the one the ramp asked for", () => {
    // An 11° point needs a 10-unit run to carry even a 1-unit radius, and the
    // edge is 10 long. The corner takes what there is: half the edge.
    const spike = arcs(rounded("M0 0 L10 0 L0 2", { cornerRadius: 2 }))[0]!;
    expect(spike.radius).toBeLessThan(1);
    expect(spike.radius).toBeGreaterThan(0);
  });

  it("turns the way the drawing turns", () => {
    const clockwise = arcs(rounded("M0 0 L10 0 L10 10", { cornerRadius: 2 }))[0];
    const other = arcs(rounded("M0 10 L10 10 L10 0", { cornerRadius: 2 }))[0];
    expect(clockwise).toMatchObject({ sweep: true });
    expect(other).toMatchObject({ sweep: false });
  });

  it("rounds every joint of a closed shape, including the one at the start", () => {
    const s = rounded("M2 2 L18 2 L18 18 L2 18 Z", { cornerRadius: 2 });
    expect(arcs(s)).toHaveLength(4);
    expect(s.subpaths[0]!.closed).toBe(true);
    // Still the same box, 16 across, with its corners taken off.
    const bounds = shapeBounds(drawn(s));
    expect([bounds.minX, bounds.minY, bounds.maxX, bounds.maxY]).toEqual([2, 2, 18, 18]);
  });

  it("leaves an edge that is already round alone", () => {
    // One line-to-line joint here; the other two touch an arc and are already
    // as round as they are going to get.
    const s = rounded("M0 0 L10 0 A2 2 0 0 1 12 2 L12 12 L0 12", { cornerRadius: 2 });
    expect(arcs(s)).toHaveLength(2);
    expect(arcs(s).filter((a) => near(a.radius, 2))).toHaveLength(2);
  });

  it("does not round a corner that is not one", () => {
    expect(arcs(rounded("M0 0 L10 0 L20 0", { cornerRadius: 2 }))).toHaveLength(0);
    expect(arcs(rounded("M0 0 L10 0", { cornerRadius: 2 }))).toHaveLength(0);
    // A ramp of zero is a language with square corners, and it gets them.
    expect(arcs(rounded("M0 0 L10 0 L10 10", { cornerRadius: 0 }))).toHaveLength(0);
  });

  it("never eats more than half an edge", () => {
    // Two right angles two units apart: the ramp asks for 2 each, which would
    // consume the whole segment between them twice over.
    const s = rounded("M0 0 L10 0 L10 2 L20 2", { cornerRadius: 2 });
    expect(arcs(s)).toHaveLength(2);
    for (const arc of arcs(s)) expect(arc.radius).toBeLessThanOrEqual(1.0000001);
    // And the drawing still runs end to end.
    const bounds = shapeBounds(drawn(s));
    expect([bounds.minX, bounds.maxX]).toEqual([0, 20]);
  });

  it("obeys a radius stated at one joint over the ramp", () => {
    const skeleton = setCorner(skeletonFromPathData("M0 0 L10 0 L10 10"), 1, 0.5);
    expect(arcs(arcify(skeleton, { cornerRadius: 2 }))[0]).toMatchObject({ radius: 0.5 });
    // And zero at a joint means this one stays sharp.
    const sharp = setCorner(skeletonFromPathData("M0 0 L10 0 L10 10"), 1, 0);
    expect(arcs(arcify(sharp, { cornerRadius: 2 }))).toHaveLength(0);
  });

  it("changes the whole set when the ramp changes, with nobody redrawing a part", () => {
    const flame = "M6 18 L10 6 L14 12 L16 8 L18 18 Z";
    const soft = arcs(rounded(flame, { cornerRadius: 2 }));
    const hard = arcs(rounded(flame, { cornerRadius: 0.5 }));
    expect(soft).toHaveLength(hard.length);
    expect(soft.every((arc, i) => arc.radius > hard[i]!.radius)).toBe(true);
  });
});

describe("arcify: snapping to the grid", () => {
  it("pulls a radius to one whose tangent points land on the grid", () => {
    // A right angle between two axis-aligned legs: tangent distance is the
    // radius, so the radius itself has to be a grid multiple.
    const s = rounded("M0 0 L10 0 L10 10", { cornerRadius: 1.7, grid: 0.5, snap: true });
    expect(arcs(s)[0]!.radius).toBeCloseTo(1.5, 9);
    // Off, the ramp says what it says.
    expect(arcs(rounded("M0 0 L10 0 L10 10", { cornerRadius: 1.7 }))[0]!.radius).toBeCloseTo(1.7, 9);
  });

  it("uses the diagonal step where both legs are diagonal", () => {
    // Two 45° legs meeting at a right angle: a tangent point moves r/√2 in each
    // axis, so the grid multiple to hit is the diagonal one.
    const s = rounded("M0 10 L10 0 L20 10", { cornerRadius: 1.6, grid: 0.5, snap: true });
    expect(arcs(s)[0]!.radius).toBeCloseTo(0.5 * Math.SQRT2 * 2, 6);
  });

  it("leaves a mixed corner on the ramp, because no radius aligns both legs", () => {
    // One axis-aligned leg, one diagonal: this is the case Lucide answers with a
    // memorised constant. There is no rule to derive, so the ramp stands.
    const s = rounded("M0 0 L10 0 L0 10", { cornerRadius: 1.7, grid: 0.5, snap: true });
    expect(arcs(s)[0]!.radius).toBeCloseTo(cornerRadiusFor(45, DEFAULT_CORNERS, 1.7), 9);
  });
});

describe("a drawn element is a skeleton the language rounds", () => {
  // The construction method, end to end: a cloud authored as straight segments,
  // drawn as a shape with round joins, with nobody writing an arc.
  const cloud = {
    name: "cloud",
    category: "object" as const,
    keywords: ["cloud"],
    outline: ["M4 18 L4 12 L8 6 L16 6 L20 12 L20 18 Z"],
  };

  it("rounds the joints of an element nobody drew arcs into", () => {
    const primitive = definePathPrimitive(cloud);
    const shapes = primitive.build({ style: "outline", strokeWidth: 1.5, cornerRadius: 2, scale: 1 });
    const path = shapes[0]!;
    expect(path.kind).toBe("path");
    const rounded = path.kind === "path" ? path.commands.filter((c) => c.c === "A") : [];
    // Six joints, six arcs, and not one of them in the authored path data.
    expect(rounded).toHaveLength(6);
    expect(cloud.outline[0]).not.toContain("A");
  });

  it("re-rounds when the language changes, with the element untouched", () => {
    const primitive = definePathPrimitive(cloud);
    const radiusAt = (cornerRadius: number) => {
      const shape = primitive.build({ style: "outline", strokeWidth: 1.5, cornerRadius, scale: 1 })[0]!;
      return shape.kind === "path" ? shape.commands.filter((c) => c.c === "A").map((c) => (c.c === "A" ? c.rx : 0)) : [];
    };
    const soft = radiusAt(3);
    const tight = radiusAt(1);
    expect(soft.every((r, i) => r > tight[i]!)).toBe(true);
    // Square corners are a language too, and asking for them gets them.
    expect(radiusAt(0)).toEqual([]);
  });

  it("leaves an element alone when its corners were drawn on purpose", () => {
    const kept = definePathPrimitive({ ...cloud, corners: "keep" });
    const shape = kept.build({ style: "outline", strokeWidth: 1.5, cornerRadius: 2, scale: 1 })[0]!;
    expect(shape.kind === "path" ? shape.commands.filter((c) => c.c === "A") : []).toHaveLength(0);
  });

  it("keeps a radius the size the language asked for, whatever box the element is in", () => {
    // The composer scales an element into its box, so a radius stated in canvas
    // units has to be divided by that scale to survive it.
    // Long edges, so nothing here is clamped and the scaling is the only effect
    // being measured.
    const primitive = definePathPrimitive({ ...cloud, name: "panel", outline: ["M0 0 L24 0 L24 24 L0 24 Z"] });
    const half = primitive.build({ style: "outline", strokeWidth: 1.5, cornerRadius: 2, scale: 0.5 })[0]!;
    const full = primitive.build({ style: "outline", strokeWidth: 1.5, cornerRadius: 2, scale: 1 })[0]!;
    const radius = (shape: typeof half) =>
      shape.kind === "path" ? shape.commands.flatMap((c) => (c.c === "A" ? [c.rx] : [])) : [];
    expect(radius(half)[0]).toBeCloseTo(radius(full)[0]! * 2, 9);
  });
});
