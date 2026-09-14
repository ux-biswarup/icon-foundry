import { cornerRadiusFor, type Box, type IconLanguage } from "@icon-foundry/icon-language";
import {
  isAllowedAngle,
  segmentHeading,
  segmentStart,
  type Point,
  type Skeleton,
  type SkeletonSegment,
  type SkeletonSubpath,
} from "@icon-foundry/icon-primitives";

/**
 * Everything the construction editor needs to read off a skeleton.
 *
 * Kept out of the component because all of it is arithmetic on geometry, and
 * arithmetic that lives inside a React file is arithmetic nobody tests. The
 * overlays draw what this returns and the drag handlers move what this names;
 * neither measures anything itself, which is the same split the validator and
 * the preview layers already keep.
 *
 * The tool this borrows its shape from works on a flat list of path segments
 * with duplicated endpoints, so most of its machinery is there to find the
 * places two endpoints *nearly* coincide and repair them. Here vertices are
 * shared, so that entire class of defect cannot be represented — and the near
 * miss this module does look for is the one that survives shared vertices: a
 * loose end resting against a segment it never joined.
 */

/* ------------------------------------------------------------------ */
/* Placement                                                           */
/* ------------------------------------------------------------------ */

/**
 * A uniform scale and translation, which is the only kind of placement the
 * composer performs and therefore the only kind worth being able to invert.
 *
 * The editor works in canvas units rather than in the part's own box, because
 * every rule it draws — the grid step, the safe area, the optical boxes, the
 * corner radius — is stated in canvas units. Editing in the part's box meant
 * multiplying each of them by `extent / canvas` at the point of use, and a
 * correction applied in six places is a correction that will one day be applied
 * in five.
 */
export interface Placement {
  k: number;
  ox: number;
  oy: number;
}

export const IDENTITY: Placement = { k: 1, ox: 0, oy: 0 };

/** The placement that fits `from` into `to`, centred, without distorting it. */
export function placementFor(from: Box, to: Box): Placement {
  const k = Math.min(to.width / (from.width || 1), to.height / (from.height || 1));
  return {
    k,
    ox: to.x + (to.width - from.width * k) / 2 - from.x * k,
    oy: to.y + (to.height - from.height * k) / 2 - from.y * k,
  };
}

export function invert(p: Placement): Placement {
  return { k: 1 / p.k, ox: -p.ox / p.k, oy: -p.oy / p.k };
}

export const mapPoint = (pt: Point, p: Placement): Point => [pt[0] * p.k + p.ox, pt[1] * p.k + p.oy];

/**
 * The same drawing in another space.
 *
 * Radii and control points are lengths and positions in the drawing, so they
 * scale with it. Leaving radii alone — the obvious omission — turns every
 * fillet into an arc that no longer meets the edges it was cut between, and the
 * failure looks like a rendering bug rather than a missing multiplication.
 */
export function mapSkeleton(skeleton: Skeleton, p: Placement): Skeleton {
  const corners: Record<number, number> = {};
  for (const [vertex, radius] of Object.entries(skeleton.corners)) corners[Number(vertex)] = radius * p.k;
  return {
    vertices: skeleton.vertices.map((v) => mapPoint(v, p)),
    corners,
    subpaths: skeleton.subpaths.map((subpath) => ({
      ...subpath,
      segments: subpath.segments.map((segment) => {
        if (segment.kind === "arc") {
          return {
            ...segment,
            radius: segment.radius * p.k,
            ...(segment.radiusY !== undefined && { radiusY: segment.radiusY * p.k }),
          };
        }
        if (segment.kind === "cubic") {
          return { ...segment, c1: mapPoint(segment.c1, p), c2: mapPoint(segment.c2, p) };
        }
        return segment;
      }),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Arcs                                                                */
/* ------------------------------------------------------------------ */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export interface ArcCentre {
  centre: Point;
  rx: number;
  ry: number;
  rotation: number;
  /** Where on the ellipse the arc starts, in degrees. */
  start: number;
  /** How far it sweeps, signed. */
  extent: number;
}

/**
 * An arc's centre, from the endpoint form SVG stores it in.
 *
 * The spec's own conversion (F.6.5), including its correction for a radius too
 * small to join the endpoints. That correction is not pedantry: a renderer
 * grows such a radius rather than refusing to draw, so a centre computed
 * without it is the centre of a circle nobody will ever see, drawn on top of
 * the one they will.
 */
export function arcCentre(
  from: Point,
  to: Point,
  rxIn: number,
  ryIn: number,
  rotationDeg: number,
  largeArc: boolean,
  sweep: boolean,
): ArcCentre | undefined {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx < 1e-9 || ry < 1e-9) return undefined;

  const phi = rotationDeg * RAD;
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  const dx = (from[0] - to[0]) / 2;
  const dy = (from[1] - to[1]) / 2;
  const x1 = cosP * dx + sinP * dy;
  const y1 = -sinP * dx + cosP * dy;

  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }

  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  if (denominator < 1e-12) return undefined;
  const factor = Math.sqrt(Math.max(0, numerator / denominator)) * (largeArc === sweep ? -1 : 1);
  const cx1 = (factor * rx * y1) / ry;
  const cy1 = (-factor * ry * x1) / rx;

  const ux = (x1 - cx1) / rx;
  const uy = (y1 - cy1) / ry;
  const vx = (-x1 - cx1) / rx;
  const vy = (-y1 - cy1) / ry;

  const start = Math.atan2(uy, ux) * DEG;
  let extent = (Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy) * DEG) % 360;
  if (!sweep && extent > 0) extent -= 360;
  if (sweep && extent < 0) extent += 360;

  return {
    centre: [cosP * cx1 - sinP * cy1 + (from[0] + to[0]) / 2, sinP * cx1 + cosP * cy1 + (from[1] + to[1]) / 2],
    rx,
    ry,
    rotation: rotationDeg,
    start,
    extent,
  };
}

/** A point on an arc, `t` running 0 to 1 along its sweep. */
export function arcPoint(arc: ArcCentre, t: number): Point {
  const theta = (arc.start + arc.extent * t) * RAD;
  const phi = arc.rotation * RAD;
  const x = arc.rx * Math.cos(theta);
  const y = arc.ry * Math.sin(theta);
  return [
    arc.centre[0] + x * Math.cos(phi) - y * Math.sin(phi),
    arc.centre[1] + x * Math.sin(phi) + y * Math.cos(phi),
  ];
}

/* ------------------------------------------------------------------ */
/* Segments                                                            */
/* ------------------------------------------------------------------ */

/** A segment resolved into everything an overlay or a handle needs from it. */
export interface SegmentView {
  /** Stable within one skeleton: subpath index and position in it. */
  id: string;
  sub: number;
  index: number;
  kind: SkeletonSegment["kind"];
  fromVertex: number;
  toVertex: number;
  from: Point;
  to: Point;
  /** Where a label sits: on the drawing, not on the chord, for a curve. */
  mid: Point;
  d: string;
  length: number;
  /** Direction in degrees, 0–180. Undefined for a segment with no length. */
  heading: number | undefined;
  /** A line pointing somewhere the grammar does not allow. */
  offAngle: boolean;
  arc?: ArcCentre;
  cubic?: { c1: Point; c2: Point };
}

export const segmentKey = (sub: number, index: number): string => `${sub}:${index}`;

function segmentPath(from: Point, to: Point, segment: SkeletonSegment): string {
  if (segment.kind === "arc") {
    const ry = segment.radiusY ?? segment.radius;
    return `M${from[0]} ${from[1]}A${segment.radius} ${ry} ${segment.rotation ?? 0} ${segment.largeArc ? 1 : 0} ${segment.sweep ? 1 : 0} ${to[0]} ${to[1]}`;
  }
  if (segment.kind === "cubic") {
    return `M${from[0]} ${from[1]}C${segment.c1[0]} ${segment.c1[1]} ${segment.c2[0]} ${segment.c2[1]} ${to[0]} ${to[1]}`;
  }
  return `M${from[0]} ${from[1]}L${to[0]} ${to[1]}`;
}

const cubicAt = (a: Point, c1: Point, c2: Point, b: Point, t: number): Point => {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return [
    a[0] * w0 + c1[0] * w1 + c2[0] * w2 + b[0] * w3,
    a[1] * w0 + c1[1] * w1 + c2[1] * w2 + b[1] * w3,
  ];
};

export function segmentViews(skeleton: Skeleton, language: IconLanguage, freeAngles = false): SegmentView[] {
  const out: SegmentView[] = [];
  skeleton.subpaths.forEach((subpath, s) => {
    subpath.segments.forEach((segment, index) => {
      const fromVertex = segmentStart(subpath, index);
      const from = skeleton.vertices[fromVertex];
      const to = skeleton.vertices[segment.to];
      if (!from || !to) return;

      const heading = segmentHeading(skeleton, subpath, index);
      const offAngle =
        !freeAngles &&
        segment.kind === "line" &&
        heading !== undefined &&
        !isAllowedAngle(heading, language.grammar.angles, language.grammar.angleTolerance);

      const arc =
        segment.kind === "arc"
          ? arcCentre(
              from,
              to,
              segment.radius,
              segment.radiusY ?? segment.radius,
              segment.rotation ?? 0,
              segment.largeArc,
              segment.sweep,
            )
          : undefined;

      const mid: Point =
        segment.kind === "cubic"
          ? cubicAt(from, segment.c1, segment.c2, to, 0.5)
          : arc
            ? arcPoint(arc, 0.5)
            : [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];

      out.push({
        id: segmentKey(s, index),
        sub: s,
        index,
        kind: segment.kind,
        fromVertex,
        toVertex: segment.to,
        from,
        to,
        mid,
        d: segmentPath(from, to, segment),
        length: Math.hypot(to[0] - from[0], to[1] - from[1]),
        heading,
        offAngle,
        ...(arc && { arc }),
        ...(segment.kind === "cubic" && { cubic: { c1: segment.c1, c2: segment.c2 } }),
      });
    });
  });
  return out;
}

/** A segment as a run of points, for any measurement a chord cannot answer. */
export function samples(view: SegmentView, step: number): Point[] {
  if (view.kind === "line") {
    const count = Math.max(1, Math.ceil(view.length / step));
    return Array.from({ length: count + 1 }, (_, i) => {
      const t = i / count;
      return [view.from[0] + (view.to[0] - view.from[0]) * t, view.from[1] + (view.to[1] - view.from[1]) * t] as Point;
    });
  }
  if (view.arc) {
    const span = Math.abs(view.arc.extent * RAD) * Math.max(view.arc.rx, view.arc.ry);
    const count = Math.max(2, Math.ceil(span / step));
    return Array.from({ length: count + 1 }, (_, i) => arcPoint(view.arc as ArcCentre, i / count));
  }
  if (view.cubic) {
    const { c1, c2 } = view.cubic;
    const rough =
      Math.hypot(c1[0] - view.from[0], c1[1] - view.from[1]) +
      Math.hypot(c2[0] - c1[0], c2[1] - c1[1]) +
      Math.hypot(view.to[0] - c2[0], view.to[1] - c2[1]);
    const count = Math.max(2, Math.ceil(rough / step));
    return Array.from({ length: count + 1 }, (_, i) => cubicAt(view.from, c1, c2, view.to, i / count));
  }
  return [view.from, view.to];
}

/* ------------------------------------------------------------------ */
/* Corners                                                             */
/* ------------------------------------------------------------------ */

/**
 * A corner, reduced to the four things a radius depends on.
 *
 * Two different situations produce one of these and they are worth naming
 * together, because on screen they are the same handle and the maths under them
 * is identical. A **joint** is a corner the language has not rounded yet. A
 * **fillet** is a corner something already rounded, recovered from the arc that
 * rounded it. Once both are a point, two directions, an angle and how much room
 * there is, neither needs its own radius arithmetic.
 */
export interface CornerFrame {
  /** The point the two legs meet at. For a fillet, a point no longer drawn. */
  corner: Point;
  /** Unit directions out from the corner along each leg. */
  legs: [Point, Point];
  /** Included angle, 0–180. 180 is straight through. */
  angle: number;
  /** How far a tangent point may travel along each leg before it runs out. */
  room: [number, number];
}

const unit = (from: Point, to: Point): Point | undefined => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  return length < 1e-9 ? undefined : [dx / length, dy / length];
};

const bisectorOf = (legs: [Point, Point]): Point | undefined =>
  unit([0, 0], [legs[0][0] + legs[1][0], legs[0][1] + legs[1][1]]);

/**
 * The radius implied by dragging a corner's fillet centre to `to`.
 *
 * The centre is only free along the bisector, so the drag is projected onto it
 * and everything across it is discarded. A pointer is not a radius; this is the
 * conversion, and keeping it here means no drag handler contains geometry.
 */
export function radiusFrom(frame: CornerFrame, to: Point): number {
  const bisector = bisectorOf(frame.legs);
  if (!bisector) return 0;
  const reach = (to[0] - frame.corner[0]) * bisector[0] + (to[1] - frame.corner[1]) * bisector[1];
  if (reach <= 0) return 0;
  const half = (frame.angle / 2) * RAD;
  const room = Math.min(frame.room[0], frame.room[1]);
  const limit = Number.isFinite(room) ? room * Math.tan(half) : Infinity;
  return Math.max(0, Math.min(reach * Math.sin(half), limit));
}

/** Where a given radius touches each leg, and where its centre sits. */
export function tangentsFor(frame: CornerFrame, radius: number): { from: Point; to: Point; centre: Point } {
  const half = (frame.angle / 2) * RAD;
  const along = radius / Math.tan(half);
  const reach = radius / Math.sin(half);
  const [a, b] = frame.legs;
  const bisector = bisectorOf(frame.legs) ?? [0, 0];
  return {
    from: [frame.corner[0] + a[0] * along, frame.corner[1] + a[1] * along],
    to: [frame.corner[0] + b[0] * along, frame.corner[1] + b[1] * along],
    centre: [frame.corner[0] + bisector[0] * reach, frame.corner[1] + bisector[1] * reach],
  };
}

/** Does a corner have anything to round, and room to round it in? */
const roundable = (frame: CornerFrame, radius: number): boolean => {
  if (!(frame.angle > 1 && frame.angle < 179) || radius <= 0) return false;
  const along = radius / Math.tan((frame.angle / 2) * RAD);
  return along <= frame.room[0] + 1e-9 && along <= frame.room[1] + 1e-9;
};

/**
 * A corner the language has not cut yet, with the fillet it would give it.
 *
 * The tool this borrows from has to reverse-engineer a corner radius from an
 * arc somebody already baked into path data, which is why its radius handle is
 * the most delicate code it owns. Here the radius is still a *decision* — the
 * ramp's, or the author's override on top of it — so the circle below is the
 * one that will be cut, computed forwards. Dragging its centre states a radius;
 * it does not repair one.
 */
export interface JointView extends CornerFrame {
  vertex: number;
  sub: number;
  joint: number;
  at: Point;
  radius: number;
  /** True when the author has stated a radius here instead of the ramp's. */
  overridden: boolean;
  /** Centre of the fillet circle, on the bisector. Absent where none fits. */
  centre?: Point;
  /** Where the fillet leaves each leg. */
  tangents?: [Point, Point];
}

export function jointViews(skeleton: Skeleton, language: IconLanguage, cornerRadius: number): JointView[] {
  const out: JointView[] = [];
  skeleton.subpaths.forEach((subpath, s) => {
    const count = subpath.segments.length;
    for (let joint = 0; joint < count; joint++) {
      if (joint === 0 && !subpath.closed) continue;
      const incoming = joint - 1 < 0 ? (subpath.closed ? count - 1 : undefined) : joint - 1;
      if (incoming === undefined) continue;
      const vertex = segmentStart(subpath, joint);
      const at = skeleton.vertices[vertex];
      if (!at) continue;

      /*
       * Directions, not neighbouring points.
       *
       * Measuring to the far end of the adjoining segment is only the same
       * thing when that segment is straight. Where an arc adjoins, the chord to
       * its far endpoint can sit 45° off the direction the drawing actually
       * leaves in — so a corner already rounded tangentially, which has nothing
       * left to round, measured as a sharp one and got a fillet handle for a
       * corner that is not there. `segmentHeading` knows about arcs.
       */
      const into = segmentHeading(skeleton, subpath, incoming, true);
      const away = segmentHeading(skeleton, subpath, joint);
      if (into === undefined || away === undefined) continue;
      const legs: [Point, Point] = [
        [-Math.cos(into * RAD), -Math.sin(into * RAD)],
        [Math.cos(away * RAD), Math.sin(away * RAD)],
      ];
      const dot = Math.max(-1, Math.min(1, legs[0][0] * legs[1][0] + legs[0][1] * legs[1][1]));
      const angle = Math.acos(dot) * DEG;

      const back = skeleton.vertices[segmentStart(subpath, incoming)];
      const forward = skeleton.vertices[subpath.segments[joint]?.to ?? -1];
      const room: [number, number] = [
        back ? Math.hypot(back[0] - at[0], back[1] - at[1]) : Infinity,
        forward ? Math.hypot(forward[0] - at[0], forward[1] - at[1]) : Infinity,
      ];

      const override = skeleton.corners[vertex];
      const radius = override ?? cornerRadiusFor(angle, language.construction.corners, cornerRadius);
      const frame: CornerFrame = { corner: at, legs, angle, room };

      const view: JointView = {
        ...frame,
        vertex,
        sub: s,
        joint,
        at,
        radius,
        overridden: override !== undefined,
      };

      // A fillet needs an actual corner and a radius that fits inside both
      // legs. Drawing one that does not is how an overlay starts lying.
      if (roundable(frame, radius)) {
        const cut = tangentsFor(frame, radius);
        view.centre = cut.centre;
        view.tangents = [cut.from, cut.to];
      }

      out.push(view);
    }
  });
  return out;
}

/** Kept for callers that still speak in joints. */
export const radiusFromDrag = (joint: JointView, to: Point): number => radiusFrom(joint, to);

/* ------------------------------------------------------------------ */
/* Diagnostics                                                         */
/* ------------------------------------------------------------------ */

/** How many segments meet at each vertex. One means a loose end. */
export function degrees(skeleton: Skeleton): number[] {
  const out = new Array<number>(skeleton.vertices.length).fill(0);
  for (const subpath of skeleton.subpaths) {
    subpath.segments.forEach((segment, i) => {
      const from = segmentStart(subpath, i);
      const a = out[from];
      if (a !== undefined) out[from] = a + 1;
      const b = out[segment.to];
      if (b !== undefined) out[segment.to] = b + 1;
    });
  }
  return out;
}

export interface NearMiss {
  /** The loose end that is nearly, but not quite, touching something. */
  at: Point;
  /** Where it would land if it were. */
  to: Point;
}

/**
 * A loose end resting against a segment it never joined.
 *
 * The only near miss shared vertices leave available. Two ends at the same
 * point are already *one* point here, so "these two should have been welded"
 * cannot arise — but an end that stops a fifth of a unit short of a line it was
 * meant to meet still can, and it is the defect that survives every export and
 * shows up as a hairline gap at 16px.
 */
export function nearMisses(skeleton: Skeleton, views: readonly SegmentView[], tolerance: number): NearMiss[] {
  const degree = degrees(skeleton);
  const out: NearMiss[] = [];
  skeleton.vertices.forEach((at, vertex) => {
    if ((degree[vertex] ?? 0) !== 1) return;
    let best: { to: Point; distance: number } | undefined;
    for (const view of views) {
      if (view.fromVertex === vertex || view.toVertex === vertex) continue;
      for (const point of samples(view, tolerance / 2)) {
        const distance = Math.hypot(point[0] - at[0], point[1] - at[1]);
        if (distance > 1e-6 && distance < tolerance && (!best || distance < best.distance)) {
          best = { to: point, distance };
        }
      }
    }
    if (best) out.push({ at, to: best.to });
  });
  return out;
}

export interface Gap {
  a: Point;
  b: Point;
  distance: number;
}

/**
 * Two parts of the drawing that come closer than the language allows.
 *
 * Measured between subpaths, because two points on the same stroke being near
 * each other is what a stroke is. Anything below the minimum reads as ink
 * touching once it is drawn at a real size, which is the whole reason the
 * token exists.
 */
export function subpathGaps(views: readonly SegmentView[], minimum: number): Gap[] {
  if (minimum <= 0) return [];
  const bySubpath = new Map<number, Point[]>();
  for (const view of views) {
    const points = bySubpath.get(view.sub) ?? [];
    points.push(...samples(view, Math.max(minimum / 2, 0.1)));
    bySubpath.set(view.sub, points);
  }
  const groups = [...bySubpath.entries()];
  const out: Gap[] = [];
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      let best: Gap | undefined;
      for (const a of groups[i]![1]) {
        for (const b of groups[j]![1]) {
          const distance = Math.hypot(a[0] - b[0], a[1] - b[1]);
          if (distance > 1e-6 && distance < minimum && (!best || distance < best.distance)) {
            best = { a, b, distance };
          }
        }
      }
      if (best) out.push(best);
    }
  }
  return out;
}

/**
 * The three rings, as two questions.
 *
 * They are genuinely different questions and the studio used to conflate them:
 * the gate was measured on centrelines and the hatch was drawn around strokes,
 * so the picture could show a region several times the size of the thing that
 * had actually been found — or show nothing while ink hung off the canvas.
 *
 * **Live area** is a target. The keyline boxes are derived from it and the
 * circle box *is* it, so a circular part drawn correctly has its centreline
 * resting on this line. Passing it is worth mentioning, not refusing.
 *
 * **Trim** is the edge of what will be drawn, and the only ring measured on the
 * ink rather than the centreline — half a stroke hanging into space is exactly
 * what it exists to catch. Between the two is padding, and overhanging into it
 * is the correct behaviour rather than a tolerated one.
 */
function crosses(views: readonly SegmentView[], low: number, high: number, grow: number): boolean {
  for (const view of views) {
    for (const [x, y] of samples(view, 0.25)) {
      if (x - grow < low - 1e-6 || x + grow > high + 1e-6) return true;
      if (y - grow < low - 1e-6 || y + grow > high + 1e-6) return true;
    }
  }
  return false;
}

/** Centrelines past the live edge. A remark, not a fault. */
export function leavesLiveArea(views: readonly SegmentView[], canvas: number, inset: number): boolean {
  if (inset <= 0) return false;
  return crosses(views, inset, canvas - inset, 0);
}

/** Ink past the trim. The fault. */
export function inkCrossesTrim(
  views: readonly SegmentView[],
  canvas: number,
  trim: number,
  strokeWidth: number,
): boolean {
  return crosses(views, trim, canvas - trim, strokeWidth / 2);
}

/* ------------------------------------------------------------------ */
/* Fillets                                                             */
/* ------------------------------------------------------------------ */

/**
 * A corner that has already been cut, recovered from the arc that cut it.
 *
 * `jointViews` handles a corner the language has *not* rounded yet, and that
 * covers a skeleton being drawn and nothing else — because the moment geometry
 * is rounded, by `arcify` or by arriving from anywhere that rounds, it is
 * line → arc → line and those joints are tangent. They measure straight
 * through, so they are correctly offered no handle, and the drawing ends up
 * with no draggable radius anywhere despite every corner in it visibly having
 * one.
 *
 * The way back is the arc itself. Extend the tangents at its two ends and they
 * meet at the corner the fillet was cut from — a corner no longer present in
 * the geometry, but fully determined by it. The radius handle belongs there.
 *
 * Where this improves on the tool it is taken from: there, the arc and its
 * neighbouring lines hold separate copies of the points they share, so
 * re-cutting a fillet moves the arc's ends and leaves the lines behind, and a
 * repair pass has to notice. Here those are the same vertices, so the lines
 * follow. The gap cannot open, because there is nothing to hold it open.
 */
export interface FilletView extends CornerFrame {
  id: string;
  sub: number;
  index: number;
  fromVertex: number;
  toVertex: number;
  centre: Point;
  radius: number;
}

/** Where two rays meet, or undefined when they are parallel. */
function meet(a: Point, da: Point, b: Point, db: Point): Point | undefined {
  const denominator = da[0] * db[1] - da[1] * db[0];
  if (Math.abs(denominator) < 1e-10) return undefined;
  const t = ((b[0] - a[0]) * db[1] - (b[1] - a[1]) * db[0]) / denominator;
  return [a[0] + da[0] * t, a[1] + da[1] * t];
}

export function filletViews(skeleton: Skeleton, views: readonly SegmentView[]): FilletView[] {
  const out: FilletView[] = [];
  for (const view of views) {
    // Circular arcs only. An ellipse is not a fillet, and pretending it is
    // would hand someone a radius handle that silently makes it circular.
    if (!view.arc || Math.abs(view.arc.rx - view.arc.ry) > 1e-6) continue;

    const { centre, rx } = view.arc;
    // The tangent at a point of a circle is the radius turned a right angle.
    const tangentAt = (at: Point): Point => [-(at[1] - centre[1]), at[0] - centre[0]];
    const corner = meet(view.from, tangentAt(view.from), view.to, tangentAt(view.to));
    if (!corner) continue;

    const a = unit(corner, view.from);
    const b = unit(corner, view.to);
    if (!a || !b) continue;
    const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]));
    const angle = Math.acos(dot) * DEG;
    if (!(angle > 1 && angle < 179)) continue;

    const subpath = skeleton.subpaths[view.sub];
    if (!subpath) continue;
    const count = subpath.segments.length;
    const before = view.index - 1 < 0 ? (subpath.closed ? count - 1 : undefined) : view.index - 1;
    const after = view.index + 1 >= count ? (subpath.closed ? 0 : undefined) : view.index + 1;
    const reach = (vertex: number | undefined): number => {
      const at = vertex === undefined ? undefined : skeleton.vertices[vertex];
      // No neighbour means the leg runs off the end of the drawing, so the only
      // limit is the one already on it.
      return at ? Math.hypot(at[0] - corner[0], at[1] - corner[1]) : Infinity;
    };

    out.push({
      id: view.id,
      sub: view.sub,
      index: view.index,
      fromVertex: view.fromVertex,
      toVertex: view.toVertex,
      corner,
      centre,
      radius: rx,
      angle,
      legs: [a, b],
      room: [
        reach(before === undefined ? undefined : segmentStart(subpath, before)),
        reach(after === undefined ? undefined : subpath.segments[after]?.to),
      ],
    });
  }
  return out;
}

/** Kept for callers that still speak in fillets. */
export const filletRadiusFromDrag = (fillet: FilletView, to: Point): number => radiusFrom(fillet, to);
export const filletTangents = (fillet: FilletView, radius: number) => tangentsFor(fillet, radius);
