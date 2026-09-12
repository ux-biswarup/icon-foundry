import {
  sampleShape,
  shapeBounds,
  type Bounds,
  type LineShape,
  type Point,
  type PolylineShape,
  type Shape,
} from "@icon-foundry/icon-primitives";
import type { ComposedIcon, ComposedShape } from "./index.js";

/**
 * Optical corrections: the last pass, and the only one that is allowed to be
 * wrong on purpose.
 *
 * Everything before this point draws what the language says. This draws what
 * the language *means*, because the eye is predictably wrong about a few
 * things: ink piles up in an acute crook, interior detail at the same weight
 * as the outer contour flattens a drawing, and a dot sized by its box is a
 * different dot in every icon.
 *
 * Three properties keep it honest. It runs on composed geometry, so nothing
 * upstream has to know it exists. It is off unless the language asks, because
 * a correction changes every icon already published. And it reports every
 * change it makes, so a pass that quietly ruins an icon is visible rather than
 * mysterious.
 */

export type OpticalPass = "junction-notch" | "interior-thin" | "dot-size";

export interface OpticalCorrection {
  pass: OpticalPass;
  /** Pointer to the element whose geometry changed, e.g. `elements[1]`. */
  source: string;
  primitive: string;
  /** What changed, in the icon's own units. */
  note: string;
}

export interface OpticallyCorrected {
  icon: ComposedIcon;
  corrections: OpticalCorrection[];
}

const EPSILON = 1e-6;

/** Is every correction turned off? Then the pass is a no-op and says so. */
export function opticsEnabled(icon: ComposedIcon): boolean {
  const { junctionNotch, interiorThin, dotRatio } = icon.tokens.optics;
  return junctionNotch > 0 || interiorThin > 0 || dotRatio > 0;
}

/**
 * Apply the language's optical corrections to composed geometry.
 *
 * Returns the same icon when nothing is enabled, so a caller can run this
 * unconditionally.
 */
export function applyOptics(icon: ComposedIcon): OpticallyCorrected {
  if (!opticsEnabled(icon)) return { icon, corrections: [] };

  const corrections: OpticalCorrection[] = [];
  // A dot is claimed before anything else looks at it. Its size is the whole
  // point of the pass, and a later correction thinning it would undo that.
  const dots = new Set<number>();
  let shapes = dotPass(icon.shapes, icon, corrections, dots);
  shapes = interiorPass(shapes, icon, corrections, dots);
  shapes = junctionPass(shapes, icon, corrections, dots);

  if (corrections.length === 0) return { icon, corrections };
  return { icon: { ...icon, shapes }, corrections };
}

/* ------------------------------------------------------------------ */
/* Dot roles                                                           */
/* ------------------------------------------------------------------ */

/**
 * A stroke with no length worth speaking of: a round cap standing in for a dot.
 *
 * The threshold is a fraction of the stroke rather than zero, because a
 * primitive that wants a dot usually draws a hair of a line instead of a
 * genuinely zero-length one — several renderers drop the latter entirely.
 */
function isPointStroke(shape: Shape, width: number): boolean {
  const limit = Math.max(EPSILON, width / 10);
  if (shape.kind === "line") return Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1) < limit;
  if (shape.kind === "polyline" && !shape.closed) {
    const [first] = shape.points;
    return first !== undefined && shape.points.every((p) => Math.hypot(p[0] - first[0], p[1] - first[1]) < limit);
  }
  return false;
}

/**
 * A dot is a role, not a size. The dot on an exclamation mark, the dot on an
 * i, the pupil of an eye: each one arrives at whatever radius its box happened
 * to produce, and a set where they differ by a third of a unit reads as
 * careless even though no single icon looks wrong.
 *
 * Two shapes are doing that job. A circle no wider than two strokes is the
 * obvious one. The other is a stroke with no length and a round cap, which is
 * how an outline set draws a dot without adding a shape, and which is why the
 * pass cannot just look for circles. Drawn diameter is what gets matched in
 * both cases, so a stroked dot gives back the stroke it is drawn with.
 *
 * A hole is never a dot. Its size is structural, and resizing it would move
 * the wall it was cut through.
 */
function dotPass(
  shapes: readonly ComposedShape[],
  icon: ComposedIcon,
  out: OpticalCorrection[],
  claimed: Set<number>,
): ComposedShape[] {
  const { dotRatio } = icon.tokens.optics;
  if (dotRatio <= 0) return [...shapes];
  const target = dotRatio * icon.tokens.stroke.width;

  return shapes.map((item, i) => {
    const { shape } = item;
    if (shape.cutout === true) return item;

    if (isPointStroke(shape, item.stroke.width) && item.stroke.cap === "round") {
      claimed.add(i);
      if (Math.abs(item.stroke.width - target) < EPSILON) return item;
      out.push({
        pass: "dot-size",
        source: item.source,
        primitive: item.primitive,
        note: `Dot drawn ${item.stroke.width.toFixed(2)} → ${target.toFixed(2)} across.`,
      });
      return { ...item, stroke: { ...item.stroke, width: target } };
    }

    if (shape.kind !== "circle") return item;
    const width = item.stroke.width;
    if (shape.r > width) return item; // wider than two strokes: a disc, not a dot
    claimed.add(i);
    const filled = item.style === "filled" && shape.fillable;
    // A stroked circle's drawn diameter is 2r plus the stroke straddling it.
    const radius = filled ? target / 2 : Math.max(width / 4, (target - width) / 2);
    if (Math.abs(radius - shape.r) < EPSILON) return item;
    out.push({
      pass: "dot-size",
      source: item.source,
      primitive: item.primitive,
      note: `Dot radius ${shape.r.toFixed(2)} → ${radius.toFixed(2)} for a drawn ${target.toFixed(2)} across.`,
    });
    return { ...item, shape: { ...shape, r: radius } };
  });
}

/* ------------------------------------------------------------------ */
/* Interior thinning                                                   */
/* ------------------------------------------------------------------ */

/**
 * Contained, allowing the two to touch.
 *
 * Strict containment on all four sides looks like the right test and is not:
 * interior detail usually rests on the contour it sits in. A warehouse door
 * stands on the warehouse floor, a window sits flush against a wall, and
 * demanding a gap on every side would exempt exactly the detail this pass
 * exists for. Being smaller in at least one dimension is what separates the
 * detail from the contour.
 */
function insideOf(inner: Bounds, outer: Bounds): boolean {
  if (
    inner.minX < outer.minX - EPSILON ||
    inner.minY < outer.minY - EPSILON ||
    inner.maxX > outer.maxX + EPSILON ||
    inner.maxY > outer.maxY + EPSILON
  ) {
    return false;
  }
  return (
    inner.maxX - inner.minX < outer.maxX - outer.minX - EPSILON ||
    inner.maxY - inner.minY < outer.maxY - outer.minY - EPSILON
  );
}

/**
 * Weight hierarchy. A warehouse door drawn at the weight of the warehouse
 * makes a drawing with no outside and no inside; thinning the door restores
 * the order the eye expects, where the contour carries the shape and the
 * detail sits behind it.
 *
 * The test is containment within the *same element*, because that is the only
 * place the relationship is structural. A badge that happens to sit inside a
 * subject's bounding box is a separate part at its own weight, and thinning it
 * would be a different icon rather than a better-drawn one.
 */
function interiorPass(
  shapes: readonly ComposedShape[],
  icon: ComposedIcon,
  out: OpticalCorrection[],
  claimed: ReadonlySet<number>,
): ComposedShape[] {
  const { interiorThin } = icon.tokens.optics;
  if (interiorThin <= 0) return [...shapes];

  const bounds = shapes.map((item) => shapeBounds(item.shape));
  return shapes.map((item, i) => {
    if (claimed.has(i)) return item;
    if (item.style === "filled" && item.shape.fillable) return item;
    if (item.shape.cutout === true) return item;
    const mine = bounds[i]!;
    const contained = shapes.some(
      (other, j) => j !== i && other.source === item.source && insideOf(mine, bounds[j]!),
    );
    if (!contained) return item;
    const width = item.stroke.width * (1 - interiorThin);
    out.push({
      pass: "interior-thin",
      source: item.source,
      primitive: item.primitive,
      note: `Interior detail thinned ${item.stroke.width.toFixed(2)} → ${width.toFixed(2)}.`,
    });
    return { ...item, stroke: { ...item.stroke, width } };
  });
}

/* ------------------------------------------------------------------ */
/* Junction notches                                                    */
/* ------------------------------------------------------------------ */

interface Nearest {
  distance: number;
  /** Direction of the closest segment on the shape that was hit. */
  direction: Point;
}

function nearestOnShape(p: Point, shape: Shape): Nearest | undefined {
  let best: Nearest | undefined;
  for (const poly of sampleShape(shape)) {
    for (let i = 0; i < poly.length - 1; i++) {
      const a = poly[i]!;
      const b = poly[i + 1]!;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const lengthSq = dx * dx + dy * dy;
      if (lengthSq < EPSILON) continue;
      const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq));
      const distance = Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
      if (!best || distance < best.distance) best = { distance, direction: [dx, dy] };
    }
  }
  return best;
}

/** The acute angle between two directions, 0–90 degrees. */
function acuteBetween(a: Point, b: Point): number {
  const la = Math.hypot(a[0], a[1]);
  const lb = Math.hypot(b[0], b[1]);
  if (la < EPSILON || lb < EPSILON) return 90;
  const cos = Math.min(1, Math.max(-1, Math.abs((a[0] * b[0] + a[1] * b[1]) / (la * lb))));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Move `from` toward `to` by `by`, never past the halfway point. */
function retract(from: Point, to: Point, by: number): Point {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (length < EPSILON) return from;
  const step = Math.min(by, length / 2);
  return [from[0] + (dx / length) * step, from[1] + (dy / length) * step];
}

/** The endpoints of an open stroked shape, with the point each one runs toward. */
function endpoints(shape: Shape): Array<{ index: 0 | 1; at: Point; toward: Point }> {
  if (shape.kind === "line") {
    return [
      { index: 0, at: [shape.x1, shape.y1], toward: [shape.x2, shape.y2] },
      { index: 1, at: [shape.x2, shape.y2], toward: [shape.x1, shape.y1] },
    ];
  }
  if (shape.kind === "polyline" && !shape.closed && shape.points.length >= 2) {
    const pts = shape.points;
    return [
      { index: 0, at: pts[0]!, toward: pts[1]! },
      { index: 1, at: pts[pts.length - 1]!, toward: pts[pts.length - 2]! },
    ];
  }
  return [];
}

function withEndpoint(shape: LineShape | PolylineShape, index: 0 | 1, p: Point): Shape {
  if (shape.kind === "line") {
    return index === 0 ? { ...shape, x1: p[0], y1: p[1] } : { ...shape, x2: p[0], y2: p[1] };
  }
  const pts = [...shape.points];
  pts[index === 0 ? 0 : pts.length - 1] = p;
  return { ...shape, points: pts };
}

/**
 * Ink piles up where two strokes meet at a shallow angle: the two round caps
 * and the wedge between them merge into a blob that reads as a thicker mark
 * than either line. Pulling one end back by a fraction of a unit empties the
 * crook, and at the size this matters nobody sees the gap — they only stop
 * seeing the blob.
 *
 * Only the end of an open stroke is moved, and only where it actually touches
 * another shape of the same element. A closed shape has no ends to pull back,
 * and two parts that merely pass near each other are governed by the negative
 * space rule instead.
 */
function junctionPass(
  shapes: readonly ComposedShape[],
  icon: ComposedIcon,
  out: OpticalCorrection[],
  claimed: ReadonlySet<number>,
): ComposedShape[] {
  const { junctionNotch, junctionAngle } = icon.tokens.optics;
  if (junctionNotch <= 0) return [...shapes];

  return shapes.map((item, i) => {
    if (claimed.has(i)) return item;
    const { shape } = item;
    if (shape.kind !== "line" && shape.kind !== "polyline") return item;
    if (shape.kind === "polyline" && shape.closed) return item;
    if (item.style === "filled" && shape.fillable) return item;

    // A junction is a touch, so the tolerance is the ink itself.
    const touching = item.stroke.width;
    let current: Shape = shape;
    for (const end of endpoints(shape)) {
      let sharpest: number | undefined;
      for (let j = 0; j < shapes.length; j++) {
        const other = shapes[j]!;
        if (j === i || other.source !== item.source) continue;
        const near = nearestOnShape(end.at, other.shape);
        if (!near || near.distance > touching) continue;
        const mine: Point = [end.toward[0] - end.at[0], end.toward[1] - end.at[1]];
        const angle = acuteBetween(mine, near.direction);
        if (sharpest === undefined || angle < sharpest) sharpest = angle;
      }
      if (sharpest === undefined || sharpest > junctionAngle) continue;
      const moved = retract(end.at, end.toward, junctionNotch);
      current = withEndpoint(current as LineShape | PolylineShape, end.index, moved);
      out.push({
        pass: "junction-notch",
        source: item.source,
        primitive: item.primitive,
        note: `Notched a ${sharpest.toFixed(0)}° junction back by ${junctionNotch.toFixed(2)}.`,
      });
    }
    return current === shape ? item : { ...item, shape: current };
  });
}
