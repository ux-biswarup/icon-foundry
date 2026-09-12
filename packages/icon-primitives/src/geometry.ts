/**
 * Geometry model shared by primitives, the composer, renderers and the validator.
 * Coordinates are plain numbers in whatever space the owner declares; the
 * composer maps primitive-local coordinates into canvas coordinates.
 */

export type Point = readonly [number, number];

export type PathCommand =
  | { readonly c: "M"; readonly x: number; readonly y: number }
  | { readonly c: "L"; readonly x: number; readonly y: number }
  | {
      readonly c: "A";
      readonly rx: number;
      readonly ry: number;
      readonly rotation: number;
      readonly largeArc: boolean;
      readonly sweep: boolean;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly c: "C";
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly x: number;
      readonly y: number;
    }
  | { readonly c: "Z" };

/**
 * `fillable` tells the renderer whether the shape becomes a solid area in the
 * filled style. Strokes such as lines and open arcs are never fillable.
 *
 * `cutout` marks a closed shape as a *hole* in that solid area rather than
 * more of it. This is what keeps a filled warning's exclamation mark and a
 * filled warehouse's door: without it, filling an icon erases everything
 * inside its outline, which is exactly the detail that made it legible.
 */
export interface PathShape {
  readonly kind: "path";
  readonly commands: readonly PathCommand[];
  readonly fillable: boolean;
  readonly cutout?: boolean;
}
export interface CircleShape {
  readonly kind: "circle";
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly fillable: boolean;
  readonly cutout?: boolean;
}
export interface RectShape {
  readonly kind: "rect";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rx: number;
  readonly fillable: boolean;
  readonly cutout?: boolean;
}
export interface LineShape {
  readonly kind: "line";
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly fillable: false;
  /** A line encloses nothing, so it can never be a hole. */
  readonly cutout?: false;
}
export interface PolylineShape {
  readonly kind: "polyline";
  readonly points: readonly Point[];
  readonly closed: boolean;
  readonly fillable: boolean;
  readonly cutout?: boolean;
}

export type Shape = PathShape | CircleShape | RectShape | LineShape | PolylineShape;

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/* ------------------------------------------------------------------ */
/* Constructors                                                        */
/* ------------------------------------------------------------------ */

export const circle = (cx: number, cy: number, r: number, fillable = true): CircleShape => ({
  kind: "circle",
  cx,
  cy,
  r,
  fillable,
});

/** The same shape, marked as a hole in the filled silhouette. */
export function cutout<T extends Shape>(shape: T): T {
  return { ...shape, fillable: true, cutout: true };
}

export const rect = (
  x: number,
  y: number,
  width: number,
  height: number,
  rx = 0,
  fillable = true,
): RectShape => ({ kind: "rect", x, y, width, height, rx, fillable });

export const line = (x1: number, y1: number, x2: number, y2: number): LineShape => ({
  kind: "line",
  x1,
  y1,
  x2,
  y2,
  fillable: false,
});

export const polyline = (points: readonly Point[], closed = false, fillable = closed): PolylineShape => ({
  kind: "polyline",
  points,
  closed,
  fillable,
});

export const path = (commands: readonly PathCommand[], fillable: boolean): PathShape => ({
  kind: "path",
  commands,
  fillable,
});

/** Tiny fluent builder for path commands. */
export class PathBuilder {
  private readonly commands: PathCommand[] = [];
  M(x: number, y: number): this {
    this.commands.push({ c: "M", x, y });
    return this;
  }
  L(x: number, y: number): this {
    this.commands.push({ c: "L", x, y });
    return this;
  }
  A(rx: number, ry: number, rotation: number, largeArc: boolean, sweep: boolean, x: number, y: number): this {
    this.commands.push({ c: "A", rx, ry, rotation, largeArc, sweep, x, y });
    return this;
  }
  C(x1: number, y1: number, x2: number, y2: number, x: number, y: number): this {
    this.commands.push({ c: "C", x1, y1, x2, y2, x, y });
    return this;
  }
  Z(): this {
    this.commands.push({ c: "Z" });
    return this;
  }
  build(fillable: boolean): PathShape {
    return path(this.commands, fillable);
  }
}

export const p = (): PathBuilder => new PathBuilder();

/* ------------------------------------------------------------------ */
/* Affine transforms                                                   */
/* ------------------------------------------------------------------ */

/** Row-major affine matrix [a, b, c, d, e, f] mapping (x, y) → (a x + c y + e, b x + d y + f). */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export const translate = (tx: number, ty: number): Matrix => [1, 0, 0, 1, tx, ty];
export const scale = (sx: number, sy = sx): Matrix => [sx, 0, 0, sy, 0, 0];
export const rotate = (degrees: number): Matrix => {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [cos, sin, -sin, cos, 0, 0];
};

/** Returns m1 · m2 (apply m2 first, then m1). */
export function multiply(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

/** Compose matrices left-to-right in application order: first is applied first. */
export function chain(...matrices: Matrix[]): Matrix {
  return matrices.reduceRight((acc, m) => multiply(acc, m), IDENTITY);
}

export function applyToPoint(m: Matrix, [x, y]: Point): Point {
  const [a, b, c, d, e, f] = m;
  return [a * x + c * y + e, b * x + d * y + f];
}

function determinant(m: Matrix): number {
  return m[0] * m[3] - m[1] * m[2];
}

/** Uniform scale factor of a similarity transform. */
export function uniformScale(m: Matrix): number {
  return Math.sqrt(Math.abs(determinant(m)));
}

function rotationDegrees(m: Matrix): number {
  return (Math.atan2(m[1], m[0]) * 180) / Math.PI;
}

function isAxisAligned(m: Matrix): boolean {
  const eps = 1e-9;
  return Math.abs(m[1]) < eps && Math.abs(m[2]) < eps;
}

/** Convert a (possibly rounded) rectangle to an equivalent path. */
export function rectToPath(r: RectShape): PathShape {
  const { x, y, width: w, height: h } = r;
  const rx = Math.min(r.rx, w / 2, h / 2);
  if (rx <= 0) {
    return p().M(x, y).L(x + w, y).L(x + w, y + h).L(x, y + h).Z().build(r.fillable);
  }
  return p()
    .M(x + rx, y)
    .L(x + w - rx, y)
    .A(rx, rx, 0, false, true, x + w, y + rx)
    .L(x + w, y + h - rx)
    .A(rx, rx, 0, false, true, x + w - rx, y + h)
    .L(x + rx, y + h)
    .A(rx, rx, 0, false, true, x, y + h - rx)
    .L(x, y + rx)
    .A(rx, rx, 0, false, true, x + rx, y)
    .Z()
    .build(r.fillable);
}

/**
 * Apply a similarity transform (uniform scale, rotation, flips, translation)
 * to a shape. Non-uniform scaling is intentionally unsupported: the composer
 * always fits primitives with a uniform scale so strokes stay consistent.
 */
export function transformShape(shape: Shape, m: Matrix): Shape {
  const s = uniformScale(m);
  const flipped = determinant(m) < 0;
  const pt = (x: number, y: number): Point => applyToPoint(m, [x, y]);

  switch (shape.kind) {
    case "circle": {
      const [cx, cy] = pt(shape.cx, shape.cy);
      return { ...shape, cx, cy, r: shape.r * s };
    }
    case "line": {
      const [x1, y1] = pt(shape.x1, shape.y1);
      const [x2, y2] = pt(shape.x2, shape.y2);
      return { ...shape, x1, y1, x2, y2 };
    }
    case "polyline":
      return { ...shape, points: shape.points.map((q) => applyToPoint(m, q)) };
    case "rect": {
      if (isAxisAligned(m)) {
        const [ax, ay] = pt(shape.x, shape.y);
        const [bx, by] = pt(shape.x + shape.width, shape.y + shape.height);
        return {
          ...shape,
          x: Math.min(ax, bx),
          y: Math.min(ay, by),
          width: Math.abs(bx - ax),
          height: Math.abs(by - ay),
          rx: shape.rx * s,
        };
      }
      return transformShape(rectToPath(shape), m);
    }
    case "path": {
      const rot = rotationDegrees(m);
      const commands = shape.commands.map((cmd): PathCommand => {
        switch (cmd.c) {
          case "M":
          case "L": {
            const [x, y] = pt(cmd.x, cmd.y);
            return { c: cmd.c, x, y };
          }
          case "C": {
            const [x1, y1] = pt(cmd.x1, cmd.y1);
            const [x2, y2] = pt(cmd.x2, cmd.y2);
            const [x, y] = pt(cmd.x, cmd.y);
            return { c: "C", x1, y1, x2, y2, x, y };
          }
          case "A": {
            const [x, y] = pt(cmd.x, cmd.y);
            return {
              c: "A",
              rx: cmd.rx * s,
              ry: cmd.ry * s,
              rotation: cmd.rotation + rot,
              largeArc: cmd.largeArc,
              sweep: flipped ? !cmd.sweep : cmd.sweep,
              x,
              y,
            };
          }
          case "Z":
            return cmd;
        }
      });
      return { ...shape, commands };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Bounds                                                              */
/* ------------------------------------------------------------------ */

const ARC_SAMPLES = 24;

function emptyBounds(): Bounds {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

function extend(b: Bounds, x: number, y: number): void {
  if (x < b.minX) b.minX = x;
  if (x > b.maxX) b.maxX = x;
  if (y < b.minY) b.minY = y;
  if (y > b.maxY) b.maxY = y;
}

/** Sample points along an SVG elliptical arc (endpoint parameterisation). */
export function sampleArc(
  x0: number,
  y0: number,
  cmd: Extract<PathCommand, { c: "A" }>,
  samples = ARC_SAMPLES,
): Point[] {
  const { x, y, largeArc, sweep } = cmd;
  let rx = Math.abs(cmd.rx);
  let ry = Math.abs(cmd.ry);
  if (rx === 0 || ry === 0) return [[x, y]];

  const phi = (cmd.rotation * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (x0 - x) / 2;
  const dy = (y0 - y) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const k = Math.sqrt(lambda);
    rx *= k;
    ry *= k;
  }

  const sign = largeArc === sweep ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = den === 0 ? 0 : sign * Math.sqrt(Math.max(0, num / den));
  const cxp = coef * ((rx * y1p) / ry);
  const cyp = coef * (-(ry * x1p) / rx);
  const cx = cosPhi * cxp - sinPhi * cyp + (x0 + x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y0 + y) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let a = Math.acos(Math.min(1, Math.max(-1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  else if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  const out: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = theta1 + (dTheta * i) / samples;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    out.push([cosPhi * ex - sinPhi * ey + cx, sinPhi * ex + cosPhi * ey + cy]);
  }
  return out;
}

function sampleCubic(
  x0: number,
  y0: number,
  cmd: Extract<PathCommand, { c: "C" }>,
  samples = ARC_SAMPLES,
): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const mt = 1 - t;
    const x = mt ** 3 * x0 + 3 * mt * mt * t * cmd.x1 + 3 * mt * t * t * cmd.x2 + t ** 3 * cmd.x;
    const y = mt ** 3 * y0 + 3 * mt * mt * t * cmd.y1 + 3 * mt * t * t * cmd.y2 + t ** 3 * cmd.y;
    out.push([x, y]);
  }
  return out;
}

/** Geometric (centreline) bounds of a shape. Stroke width is not included. */
export function shapeBounds(shape: Shape): Bounds {
  const b = emptyBounds();
  switch (shape.kind) {
    case "circle":
      extend(b, shape.cx - shape.r, shape.cy - shape.r);
      extend(b, shape.cx + shape.r, shape.cy + shape.r);
      break;
    case "rect":
      extend(b, shape.x, shape.y);
      extend(b, shape.x + shape.width, shape.y + shape.height);
      break;
    case "line":
      extend(b, shape.x1, shape.y1);
      extend(b, shape.x2, shape.y2);
      break;
    case "polyline":
      for (const [x, y] of shape.points) extend(b, x, y);
      break;
    case "path": {
      let cx = 0;
      let cy = 0;
      let startX = 0;
      let startY = 0;
      for (const cmd of shape.commands) {
        switch (cmd.c) {
          case "M":
            startX = cmd.x;
            startY = cmd.y;
            extend(b, cmd.x, cmd.y);
            cx = cmd.x;
            cy = cmd.y;
            break;
          case "L":
            extend(b, cmd.x, cmd.y);
            cx = cmd.x;
            cy = cmd.y;
            break;
          case "A":
            for (const [x, y] of sampleArc(cx, cy, cmd)) extend(b, x, y);
            cx = cmd.x;
            cy = cmd.y;
            break;
          case "C":
            for (const [x, y] of sampleCubic(cx, cy, cmd)) extend(b, x, y);
            cx = cmd.x;
            cy = cmd.y;
            break;
          case "Z":
            cx = startX;
            cy = startY;
            break;
        }
      }
      break;
    }
  }
  return b;
}

export function unionBounds(list: readonly Bounds[]): Bounds {
  const b = emptyBounds();
  for (const item of list) {
    extend(b, item.minX, item.minY);
    extend(b, item.maxX, item.maxY);
  }
  return b;
}

/** True when every numeric field of the shape is finite. */
export function isFiniteShape(shape: Shape): boolean {
  const ok = (n: number): boolean => Number.isFinite(n);
  switch (shape.kind) {
    case "circle":
      return ok(shape.cx) && ok(shape.cy) && ok(shape.r) && shape.r > 0;
    case "rect":
      return ok(shape.x) && ok(shape.y) && ok(shape.width) && ok(shape.height) && shape.width > 0 && shape.height > 0;
    case "line":
      return ok(shape.x1) && ok(shape.y1) && ok(shape.x2) && ok(shape.y2) && !(shape.x1 === shape.x2 && shape.y1 === shape.y2);
    case "polyline":
      return shape.points.length >= 2 && shape.points.every(([x, y]) => ok(x) && ok(y));
    case "path":
      return shape.commands.length >= 2 && shape.commands.every((cmd) => {
        switch (cmd.c) {
          case "Z":
            return true;
          case "M":
          case "L":
            return ok(cmd.x) && ok(cmd.y);
          case "A":
            return ok(cmd.x) && ok(cmd.y) && ok(cmd.rx) && ok(cmd.ry) && cmd.rx > 0 && cmd.ry > 0 && ok(cmd.rotation);
          case "C":
            return [cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y].every(ok);
        }
      });
  }
}

/* ------------------------------------------------------------------ */
/* Sampling and distance                                               */
/* ------------------------------------------------------------------ */

/**
 * Approximate a shape as one or more polylines. Used for gap measurement and
 * other geometry checks. Closed shapes repeat their first point at the end.
 */
export function sampleShape(shape: Shape, samples = ARC_SAMPLES): Point[][] {
  switch (shape.kind) {
    case "line":
      return [[[shape.x1, shape.y1], [shape.x2, shape.y2]]];
    case "polyline": {
      const pts = [...shape.points];
      if (shape.closed && pts.length > 1) pts.push(pts[0]!);
      return [pts];
    }
    case "rect": {
      const { x, y, width: w, height: h } = shape;
      return [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]];
    }
    case "circle": {
      const pts: Point[] = [];
      for (let i = 0; i <= samples; i++) {
        const t = (i / samples) * Math.PI * 2;
        pts.push([shape.cx + shape.r * Math.cos(t), shape.cy + shape.r * Math.sin(t)]);
      }
      return [pts];
    }
    case "path": {
      const out: Point[][] = [];
      let current: Point[] = [];
      let cx = 0;
      let cy = 0;
      let startX = 0;
      let startY = 0;
      const flush = () => {
        if (current.length > 1) out.push(current);
        current = [];
      };
      for (const cmd of shape.commands) {
        switch (cmd.c) {
          case "M":
            flush();
            startX = cx = cmd.x;
            startY = cy = cmd.y;
            current.push([cx, cy]);
            break;
          case "L":
            cx = cmd.x;
            cy = cmd.y;
            current.push([cx, cy]);
            break;
          case "A":
            current.push(...sampleArc(cx, cy, cmd, samples).slice(1));
            cx = cmd.x;
            cy = cmd.y;
            break;
          case "C":
            current.push(...sampleCubic(cx, cy, cmd, samples).slice(1));
            cx = cmd.x;
            cy = cmd.y;
            break;
          case "Z":
            current.push([startX, startY]);
            cx = startX;
            cy = startY;
            break;
        }
      }
      flush();
      return out;
    }
  }
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (o: Point, p: Point, q: Point) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const onSegment = (p: Point, q: Point, r: Point) =>
    Math.min(p[0], r[0]) - 1e-9 <= q[0] && q[0] <= Math.max(p[0], r[0]) + 1e-9 &&
    Math.min(p[1], r[1]) - 1e-9 <= q[1] && q[1] <= Math.max(p[1], r[1]) + 1e-9;
  if (Math.abs(d1) < 1e-9 && onSegment(c, a, d)) return true;
  if (Math.abs(d2) < 1e-9 && onSegment(c, b, d)) return true;
  if (Math.abs(d3) < 1e-9 && onSegment(a, c, b)) return true;
  if (Math.abs(d4) < 1e-9 && onSegment(a, d, b)) return true;
  return false;
}

function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b),
  );
}

/** Minimum centreline distance between two shapes. Zero when they cross or touch. */
export function shapeDistance(a: Shape, b: Shape): number {
  let best = Infinity;
  for (const pa of sampleShape(a)) {
    for (const pb of sampleShape(b)) {
      for (let i = 0; i < pa.length - 1; i++) {
        for (let j = 0; j < pb.length - 1; j++) {
          const d = segmentDistance(pa[i]!, pa[i + 1]!, pb[j]!, pb[j + 1]!);
          if (d < best) best = d;
          if (best === 0) return 0;
        }
      }
    }
  }
  return best;
}

/** True when the two shapes' sampled outlines cross or touch. */
export function shapesIntersect(a: Shape, b: Shape): boolean {
  return shapeDistance(a, b) === 0;
}

/* ------------------------------------------------------------------ */
/* Construction angles                                                 */
/* ------------------------------------------------------------------ */

/** Segments shorter than this are treated as dots, not lines. */
const MIN_SEGMENT = 0.05;

function angleOf(x1: number, y1: number, x2: number, y2: number): number | undefined {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (Math.hypot(dx, dy) < MIN_SEGMENT) return undefined;
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  deg = ((deg % 180) + 180) % 180; // a line has no direction
  return deg > 180 - 1e-9 ? 0 : deg;
}

/**
 * Angles of every straight segment in a shape, measured 0–180 from the x axis.
 * Curves (arcs and cubics) carry no construction angle and are skipped, as are
 * dot-length segments.
 */
export function segmentAngles(shape: Shape): number[] {
  const out: number[] = [];
  const push = (x1: number, y1: number, x2: number, y2: number) => {
    const a = angleOf(x1, y1, x2, y2);
    if (a !== undefined) out.push(a);
  };
  switch (shape.kind) {
    case "circle":
      break;
    case "rect":
      // Rects are axis-aligned by construction; rotation converts them to paths.
      if (shape.width >= MIN_SEGMENT) out.push(0);
      if (shape.height >= MIN_SEGMENT) out.push(90);
      break;
    case "line":
      push(shape.x1, shape.y1, shape.x2, shape.y2);
      break;
    case "polyline": {
      const pts = shape.points;
      for (let i = 0; i < pts.length - 1; i++) push(pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1]);
      if (shape.closed && pts.length > 2) {
        const a = pts[pts.length - 1]!;
        const b = pts[0]!;
        push(a[0], a[1], b[0], b[1]);
      }
      break;
    }
    case "path": {
      let cx = 0;
      let cy = 0;
      let startX = 0;
      let startY = 0;
      for (const cmd of shape.commands) {
        switch (cmd.c) {
          case "M":
            startX = cx = cmd.x;
            startY = cy = cmd.y;
            break;
          case "L":
            push(cx, cy, cmd.x, cmd.y);
            cx = cmd.x;
            cy = cmd.y;
            break;
          case "A":
          case "C":
            cx = cmd.x;
            cy = cmd.y;
            break;
          case "Z":
            push(cx, cy, startX, startY);
            cx = startX;
            cy = startY;
            break;
        }
      }
      break;
    }
  }
  return out;
}

/** Angles in the shape that no allowed angle matches within `tolerance`. */
export function offGrammarAngles(shape: Shape, allowed: readonly number[], tolerance: number): number[] {
  if (allowed.length === 0) return [];
  const off: number[] = [];
  for (const angle of segmentAngles(shape)) {
    const fits = allowed.some((a) => {
      const d = Math.abs(((angle - a + 90) % 180) - 90);
      return d <= tolerance + 1e-9;
    });
    if (!fits && !off.some((o) => Math.abs(o - angle) < 0.5)) off.push(angle);
  }
  return off;
}
