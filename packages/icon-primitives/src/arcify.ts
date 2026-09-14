import { cornerRadiusFor, DEFAULT_CORNERS, type CornerBand } from "@icon-foundry/icon-language";
import type { Point } from "./geometry.js";
import { cornerAngle, segmentStart, type Skeleton, type SkeletonSegment, type SkeletonSubpath } from "./skeleton.js";

/**
 * Round the joints of a skeleton, by the language's ramp.
 *
 * The second half of the construction method: straight segments on the angle
 * set, *then round the corners until the shape follows the idea*. A cloud is not
 * built from circles — it is a polygon whose joins are round, and so is a flame.
 *
 * This is Lucide's Arcify moved to the other end of the pipe. There it repairs
 * hand-drawn SVG after the fact, which is why it has to re-scan every path for
 * endpoints sitting on the corner it just rounded and drag them along. Here the
 * skeleton is the authored form and the rounding is derived from it, so the
 * radius can never drift from the rule, and a language that changes its ramp
 * re-rounds every part that was drawn this way.
 */

export interface ArcifyOptions {
  /** Radius bands, sharpest first. Defaults to the shipped ramp. */
  corners?: readonly CornerBand[];
  /** The size's corner radius, which the bands are multiples of. */
  cornerRadius: number;
  /** Layout grid, for `snap`. */
  grid?: number;
  /** Pull each radius to one that puts its tangent points on the grid. */
  snap?: boolean;
  /** Corners gentler than this are left alone: there is nothing there to round. */
  straight?: number;
}

const RIGHT = Math.PI / 180;

const unit = (from: Point, to: Point): Point | undefined => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  return length === 0 ? undefined : [dx / length, dy / length];
};

/**
 * A radius whose tangent points land on the grid, or the radius unchanged when
 * no such radius is near.
 *
 * This is the general form of the two constants Lucide hardcodes — and it is
 * honestly *not* their values. Lucide's `(1+√2)/2` for a 90° corner between two
 * diagonals places the arc's apex half a unit from the true corner; this places
 * the tangent points on grid intersections instead, which is the property that
 * generalises to a grid that differs per optical size. Both are defensible; only
 * one of them can be derived rather than memorised.
 *
 * When the two legs disagree — one axis-aligned, one diagonal — no radius puts
 * both tangent points on the grid, and the ramp's value stands. That case is
 * exactly Lucide's second constant, which is a number rather than a rule for the
 * same reason.
 */
function snapRadius(radius: number, angle: number, grid: number, headings: [number, number]): number {
  if (grid <= 0) return radius;
  const steps = headings.map((heading) => {
    const turned = ((heading % 90) + 90) % 90;
    if (turned < 0.01 || turned > 89.99) return grid; // along an axis
    if (Math.abs(turned - 45) < 0.01) return grid * Math.SQRT2; // along a diagonal
    return 0; // some other angle: nothing to align to
  });
  const [a, b] = steps;
  if (!a || !b || Math.abs(a - b) > 1e-9) return radius;

  // tangent distance t = r / tan(θ/2), so a t on the grid means an r on it too.
  const half = Math.tan((angle / 2) * RIGHT);
  if (!Number.isFinite(half) || half <= 0) return radius;
  const t = radius / half;
  const snapped = Math.round(t / a) * a;
  return snapped <= 0 ? radius : snapped * half;
}

/**
 * Round every line-to-line joint the ramp has something to say about.
 *
 * Only line-to-line: a joint where one side is already an arc is already round,
 * and rounding a round thing is how a shape loses the geometry someone drew.
 */
export function arcify(skeleton: Skeleton, options: ArcifyOptions): Skeleton {
  const corners = options.corners ?? DEFAULT_CORNERS;
  const straight = options.straight ?? 179;
  const vertices: Point[] = skeleton.vertices.map((v) => [v[0], v[1]]);
  const subpaths: SkeletonSubpath[] = [];

  for (const subpath of skeleton.subpaths) {
    const segments: SkeletonSegment[] = [];
    let start = subpath.start;

    // Each joint is rounded against the *original* geometry, so two corners at
    // the ends of one short segment cannot each eat the other's half of it.
    const lengths = subpath.segments.map((segment, i) => {
      const from = skeleton.vertices[segmentStart(subpath, i)];
      const to = skeleton.vertices[segment.to];
      return from && to ? Math.hypot(to[0] - from[0], to[1] - from[1]) : 0;
    });

    subpath.segments.forEach((segment, i) => {
      const previous = i === 0 ? (subpath.closed ? subpath.segments.length - 1 : undefined) : i - 1;
      const before = previous === undefined ? undefined : subpath.segments[previous];
      const angle = previous === undefined ? undefined : cornerAngle(skeleton, subpath, i);

      const corner =
        angle !== undefined &&
        angle < straight &&
        angle > 0 &&
        segment.kind === "line" &&
        before?.kind === "line" &&
        (skeleton.corners[segmentStart(subpath, i)] ?? -1) !== 0;

      if (!corner || previous === undefined) {
        // Copied, always. The loop below rewrites the `to` of whatever it last
        // pushed, and pushing the caller's own object would rewrite the skeleton
        // being read — which changes the angle of the joint after this one.
        segments.push({ ...segment });
        return;
      }

      const vertexIndex = segmentStart(subpath, i);
      const vertex = skeleton.vertices[vertexIndex]!;
      const incomingFrom = skeleton.vertices[segmentStart(subpath, previous)]!;
      const outgoingTo = skeleton.vertices[segment.to]!;
      const back = unit(vertex, incomingFrom);
      const forward = unit(vertex, outgoingTo);
      if (!back || !forward) {
        segments.push({ ...segment });
        return;
      }

      const stated = skeleton.corners[vertexIndex];
      let radius = stated ?? cornerRadiusFor(angle, corners, options.cornerRadius);
      if (radius <= 0) {
        segments.push({ ...segment });
        return;
      }
      if (options.snap && stated === undefined) {
        radius = snapRadius(radius, angle, options.grid ?? 0, [
          (Math.atan2(back[1], back[0]) * 180) / Math.PI,
          (Math.atan2(forward[1], forward[0]) * 180) / Math.PI,
        ]);
      }

      const half = Math.tan((angle / 2) * RIGHT);
      let tangent = radius / half;
      // Never eat more than half of either leg: a corner that consumes its own
      // edge has stopped being a corner.
      const room = Math.min(lengths[previous] ?? 0, lengths[i] ?? 0) / 2;
      if (room <= 0) {
        segments.push({ ...segment });
        return;
      }
      if (tangent > room) {
        tangent = room;
        radius = tangent * half;
      }

      const a: Point = [vertex[0] + back[0] * tangent, vertex[1] + back[1] * tangent];
      const b: Point = [vertex[0] + forward[0] * tangent, vertex[1] + forward[1] * tangent];
      // Which way the arc turns. `back` points *away* from the corner along the
      // edge that arrived, so the direction of travel is its negation, and the
      // cross product of travel-in against travel-out gives the turn: positive
      // is clockwise on a y-down canvas, which is SVG's sweep flag.
      const cross = -back[0] * forward[1] + back[1] * forward[0];

      const aIndex = vertices.push(a) - 1;
      const bIndex = vertices.push(b) - 1;

      // The segment that arrived now stops short of the corner…
      const last = segments[segments.length - 1];
      if (last) last.to = aIndex;
      else start = aIndex;
      // …an arc crosses it…
      segments.push({ kind: "arc", to: bIndex, radius, largeArc: false, sweep: cross > 0 });
      // …and the segment that leaves starts on the far side.
      segments.push({ kind: "line", to: segment.to });
    });

    // A closed subpath rounded at its first joint no longer ends where it began.
    if (subpath.closed && segments.length > 0) {
      const lastSegment = segments[segments.length - 1]!;
      if (lastSegment.to !== start && lastSegment.kind === "line") lastSegment.to = start;
    }
    subpaths.push({ start, segments, closed: subpath.closed });
  }

  return { vertices, subpaths, corners: {} };
}
