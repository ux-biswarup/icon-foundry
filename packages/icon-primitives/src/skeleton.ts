import type { PathCommand, Point } from "./geometry.js";
import { parsePathData } from "./path-data.js";

/**
 * The drawing before its corners are rounded.
 *
 * The set's construction method is: straight segments on the language's angles,
 * then rounded joins. A skeleton is the first half of that sentence, made into a
 * data structure — which is what lets the second half be a rule the language
 * owns rather than numbers a person types into path data.
 *
 * It is a *parse* of geometry, not a second way to store it. Path data stays
 * canonical, the way `IconSpec` stays canonical against rendered SVG; a skeleton
 * is what you hold while editing, tidying, rounding or cutting, and it converts
 * back losslessly.
 *
 * **Vertices are shared.** Two segments that meet at a point name the same
 * vertex index, so "do these meet?" is an integer comparison rather than a
 * distance test repeated at every pass. Lucide's arcify has to re-scan every
 * path for endpoints near the corner it just rounded and drag them along; here
 * that fix-up does not exist, because there was only ever one point. It is also
 * what makes the editor work: drag a vertex and everything attached to it
 * follows, without anyone maintaining the attachment.
 */

export type SkeletonSegment =
  | { kind: "line"; to: number }
  /**
   * An arc. `radius` alone is the circular case, which is all this set's
   * construction method produces — a rounded join is a circular fillet.
   *
   * `radiusY` and `rotation` exist for the geometry that arrives from
   * elsewhere. Reducing an ellipse to "the larger of its two radii" would be a
   * silent redrawing of someone's curve, and a representation that quietly
   * changes the drawing it was handed is worse than one that cannot hold it.
   * Corner rules decline to measure an elliptical arc rather than guessing.
   */
  | {
      kind: "arc";
      to: number;
      radius: number;
      radiusY?: number;
      rotation?: number;
      largeArc: boolean;
      sweep: boolean;
    }
  /**
   * A cubic. The construction method calls freeform curves "extremely rare",
   * and the curve policy measures them — but rare is not never, and a
   * representation that could not hold one would silently destroy geometry it
   * was handed.
   */
  | { kind: "cubic"; to: number; c1: Point; c2: Point };

export interface SkeletonSubpath {
  /** Vertex index the subpath starts at. */
  start: number;
  segments: SkeletonSegment[];
  /**
   * Closed subpaths carry their closing segment like any other, so a corner at
   * the start vertex is a corner like any other. `Z` is how it is written, not
   * an extra edge that exists only at render time.
   */
  closed: boolean;
}

export interface Skeleton {
  vertices: Point[];
  subpaths: SkeletonSubpath[];
  /**
   * Radius stated at one joint, overriding the language's ramp there. Keyed by
   * vertex index, so it survives every other vertex moving.
   */
  corners: Record<number, number>;
}

export interface SkeletonOptions {
  /**
   * Distance below which two points are the same point.
   *
   * The default is tight on purpose: reading a skeleton must not change the
   * drawing. Welding geometry that merely *looks* coincident is a Tidy pass,
   * where it is asked for explicitly and can be seen.
   */
  weld?: number;
}

const DEFAULT_WELD = 1e-9;

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

export function skeletonFromCommands(commands: readonly PathCommand[], options: SkeletonOptions = {}): Skeleton {
  const weld = options.weld ?? DEFAULT_WELD;
  const vertices: Point[] = [];
  const subpaths: SkeletonSubpath[] = [];

  /** Index of the vertex at this point, adding one if nothing is there yet. */
  const vertexAt = (x: number, y: number): number => {
    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i]!;
      if (Math.abs(v[0] - x) <= weld && Math.abs(v[1] - y) <= weld) return i;
    }
    vertices.push([x, y]);
    return vertices.length - 1;
  };

  let current: SkeletonSubpath | undefined;
  let cursor = 0;

  const push = (segment: SkeletonSegment): void => {
    if (!current) return;
    current.segments.push(segment);
    cursor = segment.to;
  };

  for (const cmd of commands) {
    switch (cmd.c) {
      case "M": {
        if (current && current.segments.length > 0) subpaths.push(current);
        const start = vertexAt(cmd.x, cmd.y);
        current = { start, segments: [], closed: false };
        cursor = start;
        break;
      }
      case "L":
        push({ kind: "line", to: vertexAt(cmd.x, cmd.y) });
        break;
      case "A": {
        const rx = Math.abs(cmd.rx);
        const ry = Math.abs(cmd.ry);
        push({
          kind: "arc",
          to: vertexAt(cmd.x, cmd.y),
          radius: rx,
          // Written down only when there is something to say, so the circular
          // case — every arc this set draws — stays one number.
          ...(ry !== rx && { radiusY: ry }),
          ...(cmd.rotation !== 0 && { rotation: cmd.rotation }),
          largeArc: cmd.largeArc,
          sweep: cmd.sweep,
        });
        break;
      }
      case "C":
        push({
          kind: "cubic",
          to: vertexAt(cmd.x, cmd.y),
          c1: [cmd.x1, cmd.y1],
          c2: [cmd.x2, cmd.y2],
        });
        break;
      case "Z": {
        if (!current) break;
        current.closed = true;
        // `Z` draws a line home when the pen is not already there. Materialising
        // it means every edge of a closed shape is a segment, so the corner at
        // the start vertex is found by the same code as every other corner.
        if (cursor !== current.start) current.segments.push({ kind: "line", to: current.start });
        subpaths.push(current);
        current = undefined;
        break;
      }
    }
  }
  if (current && current.segments.length > 0) subpaths.push(current);

  return { vertices, subpaths, corners: {} };
}

export function skeletonFromPathData(d: string | readonly string[], options: SkeletonOptions = {}): Skeleton {
  const parts = typeof d === "string" ? [d] : d;
  return skeletonFromCommands(parts.flatMap((part) => parsePathData(part)), options);
}

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

export function skeletonToCommands(skeleton: Skeleton): PathCommand[] {
  const out: PathCommand[] = [];
  const at = (i: number): Point => skeleton.vertices[i] ?? [0, 0];

  for (const subpath of skeleton.subpaths) {
    const [sx, sy] = at(subpath.start);
    out.push({ c: "M", x: sx, y: sy });

    subpath.segments.forEach((segment, i) => {
      const last = i === subpath.segments.length - 1;
      // The closing line is written as `Z`, which draws it. Writing both would
      // add a zero-length segment that every later pass has to step over.
      if (last && subpath.closed && segment.kind === "line" && segment.to === subpath.start) return;
      const [x, y] = at(segment.to);
      switch (segment.kind) {
        case "line":
          out.push({ c: "L", x, y });
          break;
        case "arc":
          out.push({
            c: "A",
            rx: segment.radius,
            ry: segment.radiusY ?? segment.radius,
            rotation: segment.rotation ?? 0,
            largeArc: segment.largeArc,
            sweep: segment.sweep,
            x,
            y,
          });
          break;
        case "cubic":
          out.push({ c: "C", x1: segment.c1[0], y1: segment.c1[1], x2: segment.c2[0], y2: segment.c2[1], x, y });
          break;
      }
    });

    if (subpath.closed) out.push({ c: "Z" });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Reading the drawing off a skeleton                                  */
/* ------------------------------------------------------------------ */

/** Where a segment starts, which is the end of the one before it. */
export function segmentStart(subpath: SkeletonSubpath, index: number): number {
  return index === 0 ? subpath.start : subpath.segments[index - 1]!.to;
}

const degrees = (radians: number): number => (radians * 180) / Math.PI;

/**
 * Tangent direction at one end of a circular arc, in degrees.
 *
 * Computed rather than sampled. The inscribed-angle theorem gives it exactly:
 * the tangent at an endpoint sits half the arc's central angle away from the
 * chord. Sampling the arc and taking the first step is off by half a step —
 * around 2° at the sample rate used for bounds — and a corner measured 2° out
 * lands in the wrong band of the radius ramp, which is a visible mistake on a
 * shape whose whole point is that its corners agree.
 */
export function arcTangent(
  from: Point,
  to: Point,
  radius: number,
  largeArc: boolean,
  sweep: boolean,
  atEnd = false,
): number | undefined {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const chord = Math.hypot(dx, dy);
  if (chord === 0 || radius <= 0) return undefined;

  const chordDirection = degrees(Math.atan2(dy, dx));
  // A radius too small for the chord is scaled up by SVG until the arc is a
  // half circle, so clamping here matches what a renderer would draw.
  const half = degrees(Math.asin(Math.min(1, chord / (2 * radius))));
  const sweptHalf = largeArc ? 180 - half : half;
  const turn = sweep ? -sweptHalf : sweptHalf;
  return atEnd ? chordDirection - turn : chordDirection + turn;
}

/**
 * Direction a segment leaves its first point, in degrees.
 *
 * For a straight segment this is the segment. For an arc it is the tangent,
 * because a construction rule about the angle two edges meet at has to mean the
 * same thing when one of them is already round.
 */
export function segmentHeading(skeleton: Skeleton, subpath: SkeletonSubpath, index: number, atEnd = false): number | undefined {
  const segment = subpath.segments[index];
  if (!segment) return undefined;
  const from = skeleton.vertices[segmentStart(subpath, index)];
  const to = skeleton.vertices[segment.to];
  if (!from || !to) return undefined;

  if (segment.kind === "line") {
    if (from[0] === to[0] && from[1] === to[1]) return undefined;
    return degrees(Math.atan2(to[1] - from[1], to[0] - from[0]));
  }

  if (segment.kind === "cubic") {
    // The tangent is the first (or last) control leg, falling back to the chord
    // when a control point sits on its anchor.
    const [a, b] = atEnd ? [segment.c2, to] : [from, segment.c1];
    if (a[0] === b[0] && a[1] === b[1]) return degrees(Math.atan2(to[1] - from[1], to[0] - from[0]));
    return degrees(Math.atan2(b[1] - a[1], b[0] - a[0]));
  }

  // An elliptical arc has a tangent, but not one the circular formula below
  // knows. Declining is right twice over: the number would be wrong, and an
  // ellipse is not a corner this construction method makes.
  if (segment.radiusY !== undefined && segment.radiusY !== segment.radius) return undefined;
  if (segment.rotation) return undefined;
  return arcTangent(from, to, segment.radius, segment.largeArc, segment.sweep, atEnd);
}

/**
 * The included angle where two segments meet, 0–180.
 *
 * 180 is straight through, 90 is a right angle, and a small number is a spike.
 * This is the number the radius ramp is keyed on: a gentle bend can take a large
 * radius, and the same radius on a 30° point would eat the point.
 *
 * Undefined when the joint is not a joint — an open end, or a segment with no
 * direction to speak of.
 */
export function cornerAngle(skeleton: Skeleton, subpath: SkeletonSubpath, joint: number): number | undefined {
  const count = subpath.segments.length;
  if (count === 0) return undefined;
  const incoming = joint - 1 < 0 ? (subpath.closed ? count - 1 : undefined) : joint - 1;
  if (incoming === undefined || joint >= count) return undefined;

  const into = segmentHeading(skeleton, subpath, incoming, true);
  const out = segmentHeading(skeleton, subpath, joint);
  if (into === undefined || out === undefined) return undefined;

  // Measured between the two rays leaving the vertex: backwards along the edge
  // that arrived, forwards along the edge that leaves. That is the angle a
  // protractor would read, so 180 is straight through and a spike is small —
  // and it is the number the radius ramp is keyed on.
  const back = into + 180;
  const angle = Math.abs(((((out - back) % 360) + 540) % 360) - 180);
  return Number.isNaN(angle) ? undefined : angle;
}

/** Every joint of a skeleton, with the angle the two segments meet at. */
export function corners(skeleton: Skeleton): Array<{ subpath: number; joint: number; vertex: number; angle: number }> {
  const out: Array<{ subpath: number; joint: number; vertex: number; angle: number }> = [];
  skeleton.subpaths.forEach((subpath, s) => {
    for (let joint = 0; joint < subpath.segments.length; joint++) {
      if (joint === 0 && !subpath.closed) continue;
      const angle = cornerAngle(skeleton, subpath, joint);
      if (angle === undefined) continue;
      out.push({ subpath: s, joint, vertex: segmentStart(subpath, joint), angle });
    }
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Editing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Move one vertex. Every segment that meets there follows, because they are the
 * same point rather than three copies of it that have to be kept in step.
 */
export function moveVertex(skeleton: Skeleton, index: number, to: Point): Skeleton {
  if (!skeleton.vertices[index]) return skeleton;
  const vertices = skeleton.vertices.map((v, i) => (i === index ? ([to[0], to[1]] as Point) : v));
  return { ...skeleton, vertices };
}

/** State a radius at one joint, or clear it so the language's ramp decides. */
export function setCorner(skeleton: Skeleton, vertex: number, radius: number | undefined): Skeleton {
  const corners = { ...skeleton.corners };
  if (radius === undefined) delete corners[vertex];
  else corners[vertex] = radius;
  return { ...skeleton, corners };
}
