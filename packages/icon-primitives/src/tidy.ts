import type { Point } from "./geometry.js";
import {
  arcTangent,
  segmentStart,
  type Skeleton,
  type SkeletonSegment,
  type SkeletonSubpath,
} from "./skeleton.js";

/**
 * Tidy: make drawn geometry into the geometry it was meant to be.
 *
 * Lucide Studio's `optimize` is twenty passes run twice, and both halves of that
 * sentence are load-bearing. Passes enable each other — merging collinear lines
 * only becomes possible once the corners between them have been snapped — so one
 * sweep leaves work on the table. And every pass is caught rather than trusted,
 * because the input that reaches this code is geometry that has just been
 * pasted, dragged or cut, which is exactly the input that makes a pass throw.
 *
 * What is different here: **the thresholds are the language's, not constants.**
 * Tidying a 16px language and a 32px one are not the same operation, and a weld
 * distance that is sensible on a 24-unit canvas is a demolition on a 16-unit
 * one. The options below are the plain numbers a `PrimitiveContext` already
 * carries, so this layer never learns what a language is.
 *
 * What is missing on purpose: svgo. The renderer already emits minimal
 * deterministic SVG, so adding it would mean a dependency whose job is to undo
 * work we never did.
 */

export interface TidyOptions {
  /** Layout grid to snap vertices to. 0 leaves positions alone. */
  grid?: number;
  /** Distance below which two points are the same point. */
  weld?: number;
  /** Segments shorter than this are collapsed rather than kept. */
  minSegment?: number;
  /** Canvas size, so a full-canvas backdrop rectangle can be recognised. */
  canvas?: number;
  /** Angle in degrees below which two segments count as the same line. */
  collinear?: number;
}

interface Resolved {
  grid: number;
  weld: number;
  minSegment: number;
  canvas: number;
  collinear: number;
}

function resolve(options: TidyOptions): Resolved {
  const grid = options.grid ?? 0;
  // A weld of an eighth of a grid step is below anything a person can mean and
  // above the noise a cut or a drag leaves behind.
  const weld = options.weld ?? (grid > 0 ? grid / 8 : 0.01);
  return {
    grid,
    weld,
    minSegment: options.minSegment ?? weld * 2,
    canvas: options.canvas ?? 0,
    collinear: options.collinear ?? 0.5,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const distance = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

function segmentLength(skeleton: Skeleton, subpath: SkeletonSubpath, index: number): number {
  const segment = subpath.segments[index];
  if (!segment) return 0;
  const from = skeleton.vertices[segmentStart(subpath, index)];
  const to = skeleton.vertices[segment.to];
  if (!from || !to) return 0;
  return distance(from, to);
}

function heading(skeleton: Skeleton, subpath: SkeletonSubpath, index: number): number | undefined {
  const segment = subpath.segments[index];
  const from = skeleton.vertices[segmentStart(subpath, index)];
  const to = skeleton.vertices[segment?.to ?? -1];
  if (!segment || !from || !to || (from[0] === to[0] && from[1] === to[1])) return undefined;
  return (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;
}

/**
 * How many segment *ends* meet at each vertex.
 *
 * Both ends of every segment, so a point in the middle of a polyline scores 2
 * and the centre of a T scores 3. Counting the times a vertex is named instead
 * would score both at 2, and merging through a T deletes the junction.
 */
function degrees(skeleton: Skeleton): number[] {
  const out = new Array<number>(skeleton.vertices.length).fill(0);
  for (const subpath of skeleton.subpaths) {
    subpath.segments.forEach((segment, i) => {
      const from = segmentStart(subpath, i);
      out[from] = (out[from] ?? 0) + 1;
      out[segment.to] = (out[segment.to] ?? 0) + 1;
    });
  }
  return out;
}

/**
 * Rebuild a skeleton with vertices renumbered by `map`, dropping segments that
 * collapsed to nothing and subpaths left with no segments.
 *
 * A subpath that loses every segment is not deleted outright: if it had one to
 * begin with, it becomes a dot. A stroke with round caps draws a zero-length
 * segment as a dot, which is how this vocabulary spells one, and deleting it
 * would silently remove ink a person drew.
 */
function remap(skeleton: Skeleton, map: number[]): Skeleton {
  const subpaths: SkeletonSubpath[] = [];
  for (const subpath of skeleton.subpaths) {
    const start = map[subpath.start] ?? subpath.start;
    const segments: SkeletonSegment[] = [];
    let cursor = start;
    for (const segment of subpath.segments) {
      const to = map[segment.to] ?? segment.to;
      // A line from a point to itself is nothing; an arc or a cubic from a point
      // to itself is a loop, and throwing it away would lose a drawn shape.
      if (segment.kind === "line" && to === cursor) continue;
      segments.push({ ...segment, to });
      cursor = to;
    }
    if (segments.length === 0) {
      if (subpath.segments.length > 0) subpaths.push({ start, segments: [{ kind: "line", to: start }], closed: false });
      continue;
    }
    subpaths.push({ start, segments, closed: subpath.closed });
  }

  const corners: Record<number, number> = {};
  for (const [key, radius] of Object.entries(skeleton.corners)) {
    corners[map[Number(key)] ?? Number(key)] = radius;
  }
  return compact({ vertices: skeleton.vertices, subpaths, corners });
}

/** Drop vertices nothing refers to, so indices stay meaningful to a reader. */
function compact(skeleton: Skeleton): Skeleton {
  const used = new Set<number>();
  for (const subpath of skeleton.subpaths) {
    used.add(subpath.start);
    for (const segment of subpath.segments) used.add(segment.to);
  }
  if (used.size === skeleton.vertices.length) return skeleton;

  const map: number[] = [];
  const vertices: Point[] = [];
  skeleton.vertices.forEach((vertex, i) => {
    if (!used.has(i)) return;
    map[i] = vertices.length;
    vertices.push(vertex);
  });

  const subpaths = skeleton.subpaths.map((subpath) => ({
    start: map[subpath.start] ?? 0,
    segments: subpath.segments.map((segment) => ({ ...segment, to: map[segment.to] ?? 0 })),
    closed: subpath.closed,
  }));
  const corners: Record<number, number> = {};
  for (const [key, radius] of Object.entries(skeleton.corners)) {
    const next = map[Number(key)];
    if (next !== undefined) corners[next] = radius;
  }
  return { vertices, subpaths, corners };
}

/* ------------------------------------------------------------------ */
/* The passes                                                          */
/* ------------------------------------------------------------------ */

/** Put every vertex on the layout grid. Ours, not Lucide's: they round decimals. */
export function snapToGrid(skeleton: Skeleton, grid: number): Skeleton {
  if (grid <= 0) return skeleton;
  const snap = (n: number) => Math.round(n / grid) * grid;
  return { ...skeleton, vertices: skeleton.vertices.map(([x, y]) => [snap(x), snap(y)] as Point) };
}

/** Two points closer than `tolerance` become one point. */
export function weldVertices(skeleton: Skeleton, tolerance: number): Skeleton {
  if (tolerance <= 0) return skeleton;
  const map = skeleton.vertices.map((_, i) => i);
  for (let i = 0; i < skeleton.vertices.length; i++) {
    if (map[i] !== i) continue;
    for (let j = i + 1; j < skeleton.vertices.length; j++) {
      if (map[j] !== j) continue;
      if (distance(skeleton.vertices[i]!, skeleton.vertices[j]!) <= tolerance) map[j] = i;
    }
  }
  return map.every((to, from) => to === from) ? skeleton : remap(skeleton, map);
}

/**
 * Two lines that nearly meet are moved to where they actually cross.
 *
 * The pass that turns a hand-drawn box into a box. Welding the two loose ends
 * together would land them at whichever of the two the loop reached first, which
 * tilts both lines by a little; putting them on the true intersection of the
 * lines they are on keeps both directions exactly, and direction is what a
 * language built on 0/45/90 is made of.
 */
export function snapLinesToIntersection(skeleton: Skeleton, tolerance: number): Skeleton {
  if (tolerance <= 0) return skeleton;
  const vertices = skeleton.vertices.map((v) => [...v] as unknown as Point);
  const lines: Array<{ a: number; b: number }> = [];
  for (const subpath of skeleton.subpaths) {
    subpath.segments.forEach((segment, i) => {
      if (segment.kind !== "line") return;
      lines.push({ a: segmentStart(subpath, i), b: segment.to });
    });
  }

  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const one = lines[i]!;
      const two = lines[j]!;
      // Only loose ends: two segments that already share a vertex are already
      // meeting, and no arithmetic is going to improve on that.
      const ends: Array<[number, number]> = [
        [one.a, two.a],
        [one.a, two.b],
        [one.b, two.a],
        [one.b, two.b],
      ];
      for (const [p, q] of ends) {
        if (p === q) continue;
        const gap = distance(vertices[p]!, vertices[q]!);
        if (gap === 0 || gap > tolerance) continue;
        const crossing = intersection(vertices[one.a]!, vertices[one.b]!, vertices[two.a]!, vertices[two.b]!);
        if (!crossing) continue;
        // A crossing far from the gap belongs to some other part of the drawing.
        if (distance(crossing, vertices[p]!) > tolerance * 2) continue;
        vertices[p] = crossing;
        vertices[q] = crossing;
      }
    }
  }
  return weldVertices({ ...skeleton, vertices }, tolerance);
}

/** Where two infinite lines cross, or undefined when they are parallel. */
function intersection(a: Point, b: Point, c: Point, d: Point): Point | undefined {
  const denominator = (d[1] - c[1]) * (b[0] - a[0]) - (d[0] - c[0]) * (b[1] - a[1]);
  if (Math.abs(denominator) < 1e-12) return undefined;
  const ua = ((d[0] - c[0]) * (a[1] - c[1]) - (d[1] - c[1]) * (a[0] - c[0])) / denominator;
  return [a[0] + ua * (b[0] - a[0]), a[1] + ua * (b[1] - a[1])];
}

/** A segment too short to be seen is collapsed, not deleted: its ends become one. */
export function removeTinySegments(skeleton: Skeleton, minimum: number): Skeleton {
  if (minimum <= 0) return skeleton;
  const map = skeleton.vertices.map((_, i) => i);
  const find = (i: number): number => (map[i] === i ? i : (map[i] = find(map[i]!)));

  for (const subpath of skeleton.subpaths) {
    // A subpath of one segment is the whole drawing of it — a dash, or a dot.
    // Collapsing that is deleting it.
    if (subpath.segments.length <= 1) continue;
    subpath.segments.forEach((segment, i) => {
      if (segment.kind !== "line") return;
      if (segmentLength(skeleton, subpath, i) >= minimum) return;
      const from = find(segmentStart(subpath, i));
      const to = find(segment.to);
      if (from !== to) map[Math.max(from, to)] = Math.min(from, to);
    });
  }
  const resolved = map.map((_, i) => find(i));
  return resolved.every((to, from) => to === from) ? skeleton : remap(skeleton, resolved);
}

/**
 * Two straight segments carrying on in the same direction become one.
 *
 * Only through a vertex where nothing else is attached, and only where no radius
 * has been stated: a joint someone has pinned a corner radius to is a joint they
 * have said is a corner, whatever its angle says.
 */
export function mergeLines(skeleton: Skeleton, tolerance: number): Skeleton {
  const degree = degrees(skeleton);
  const subpaths = skeleton.subpaths.map((subpath) => {
    const segments: SkeletonSegment[] = [];
    let index = 0;
    while (index < subpath.segments.length) {
      const segment = subpath.segments[index]!;
      const next = subpath.segments[index + 1];
      const merged =
        segment.kind === "line" &&
        next?.kind === "line" &&
        (degree[segment.to] ?? 0) === 2 &&
        skeleton.corners[segment.to] === undefined &&
        !(subpath.closed && segment.to === subpath.start) &&
        sameDirection(heading(skeleton, subpath, index), heading(skeleton, subpath, index + 1), tolerance);
      if (merged) {
        segments.push({ kind: "line", to: next.to });
        index += 2;
        continue;
      }
      segments.push(segment);
      index += 1;
    }
    return { ...subpath, segments };
  });
  return compact({ ...skeleton, subpaths });
}

function sameDirection(a: number | undefined, b: number | undefined, tolerance: number): boolean {
  if (a === undefined || b === undefined) return false;
  // The signed difference folded into [-180, 180), then its size: 0 is the same
  // direction, 180 is doubling back.
  const difference = Math.abs(((((a - b) % 360) + 540) % 360) - 180);
  return difference <= tolerance;
}

/** An open subpath whose ends have come together is a closed one. */
export function smartClose(skeleton: Skeleton, tolerance: number): Skeleton {
  let changed = false;
  const subpaths = skeleton.subpaths.map((subpath) => {
    if (subpath.closed || subpath.segments.length < 2) return subpath;
    const last = subpath.segments[subpath.segments.length - 1]!;
    const end = skeleton.vertices[last.to];
    const start = skeleton.vertices[subpath.start];
    if (!end || !start) return subpath;
    if (last.to === subpath.start) {
      changed = true;
      return { ...subpath, closed: true };
    }
    if (distance(end, start) > tolerance) return subpath;
    changed = true;
    const segments = [...subpath.segments];
    segments[segments.length - 1] = { ...last, to: subpath.start };
    return { ...subpath, segments, closed: true };
  });
  return changed ? compact({ ...skeleton, subpaths }) : skeleton;
}

/**
 * Two open subpaths that meet end to end become one.
 *
 * Mostly a pass for after a cut, which leaves a drawing in as many pieces as the
 * band crossed it, and for pasted geometry where every segment arrived as its
 * own path element.
 */
export function mergePaths(skeleton: Skeleton): Skeleton {
  const open = skeleton.subpaths.filter((s) => !s.closed);
  if (open.length < 2) return skeleton;

  const out: SkeletonSubpath[] = skeleton.subpaths.filter((s) => s.closed).map((s) => ({ ...s }));
  const pending = open.map((s) => ({ ...s, segments: [...s.segments] }));

  while (pending.length > 0) {
    const run = pending.shift()!;
    let joined = true;
    while (joined) {
      joined = false;
      const end = run.segments[run.segments.length - 1]?.to ?? run.start;
      for (let i = 0; i < pending.length; i++) {
        const candidate = pending[i]!;
        if (candidate.start !== end) continue;
        run.segments.push(...candidate.segments);
        pending.splice(i, 1);
        joined = true;
        break;
      }
    }
    out.push(run);
  }
  return out.length === skeleton.subpaths.length && out.every((s, i) => s.segments.length === skeleton.subpaths[i]?.segments.length)
    ? skeleton
    : compact({ ...skeleton, subpaths: out });
}

/** A rectangle the size of the canvas is a backdrop, not a drawing. */
export function removeBackdrop(skeleton: Skeleton, canvas: number, tolerance: number): Skeleton {
  if (canvas <= 0) return skeleton;
  const subpaths = skeleton.subpaths.filter((subpath) => {
    if (!subpath.closed || subpath.segments.length !== 4) return true;
    const points = [subpath.start, ...subpath.segments.map((s) => s.to)].map((i) => skeleton.vertices[i]!);
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const covers =
      Math.abs(Math.min(...xs)) <= tolerance &&
      Math.abs(Math.min(...ys)) <= tolerance &&
      Math.abs(Math.max(...xs) - canvas) <= tolerance &&
      Math.abs(Math.max(...ys) - canvas) <= tolerance;
    return !covers;
  });
  return subpaths.length === skeleton.subpaths.length ? skeleton : compact({ ...skeleton, subpaths });
}

/**
 * A closed loop too small to read is a dot.
 *
 * Kept rather than dropped, because a dot is something this vocabulary draws —
 * the `dotRatio` correction exists to size them — and because ink a person put
 * on the canvas disappearing during a tidy is the worst thing a tidy can do.
 */
export function fixDots(skeleton: Skeleton, minimum: number): Skeleton {
  if (minimum <= 0) return skeleton;
  let changed = false;
  const vertices = [...skeleton.vertices];
  const subpaths = skeleton.subpaths.map((subpath) => {
    if (!subpath.closed || subpath.segments.length === 0) return subpath;
    const points = [subpath.start, ...subpath.segments.map((s) => s.to)].map((i) => vertices[i]!);
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    if (Math.max(...xs) - Math.min(...xs) > minimum || Math.max(...ys) - Math.min(...ys) > minimum) return subpath;
    changed = true;
    const centre: Point = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    vertices[subpath.start] = centre;
    return { start: subpath.start, segments: [{ kind: "line", to: subpath.start } as SkeletonSegment], closed: false };
  });
  return changed ? compact({ ...skeleton, vertices, subpaths }) : skeleton;
}

/* ------------------------------------------------------------------ */
/* The pipeline                                                        */
/* ------------------------------------------------------------------ */

type Pass = (skeleton: Skeleton, options: Resolved) => Skeleton;

const PASSES: Array<[string, Pass]> = [
  ["snapToGrid", (s, o) => snapToGrid(s, o.grid)],
  ["snapLinesToIntersection", (s, o) => snapLinesToIntersection(s, o.weld)],
  ["weldVertices", (s, o) => weldVertices(s, o.weld)],
  ["removeTinySegments", (s, o) => removeTinySegments(s, o.minSegment)],
  ["mergeLines", (s, o) => mergeLines(s, o.collinear)],
  ["smartClose", (s, o) => smartClose(s, o.weld)],
  ["mergePaths", (s) => mergePaths(s)],
  ["removeBackdrop", (s, o) => removeBackdrop(s, o.canvas, o.weld)],
  ["fixDots", (s, o) => fixDots(s, o.minSegment)],
];

function runPasses(skeleton: Skeleton, options: Resolved): Skeleton {
  let current = skeleton;
  for (const [, pass] of PASSES) {
    try {
      const next = pass(current, options);
      // A pass that returns nothing usable is a pass that did not run.
      if (next && next.subpaths.length > 0) current = next;
    } catch {
      // Skipped, deliberately and silently. The input here is geometry someone
      // has just pasted, dragged or cut in half; one pass that cannot cope with
      // it must not take the other eight down with it.
    }
  }
  return current;
}

/**
 * Tidy a skeleton. Runs the pipeline twice, because passes enable each other:
 * lines cannot be merged as collinear until the corner between them has been
 * snapped, and a subpath cannot be closed until its ends have been welded.
 */
export function tidy(skeleton: Skeleton, options: TidyOptions = {}): Skeleton {
  const resolved = resolve(options);
  return runPasses(runPasses(skeleton, resolved), resolved);
}
