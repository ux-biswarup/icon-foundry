import { moveVertex, segmentStart, type Point, type Skeleton, type SkeletonSegment, type SkeletonSubpath } from "@icon-foundry/icon-primitives";
import { tangentsFor, type FilletView } from "./method-geometry.js";

/**
 * Editing a skeleton by the segment rather than by the vertex.
 *
 * `moveVertex` and `setCorner` already live in the primitives package, because
 * they are operations on the representation. What is here is the rest of what a
 * direct-manipulation editor needs — moving a selection, deleting it,
 * duplicating it — and it lives in the app because each one embeds a decision
 * about what a *gesture* should mean, not about what geometry is.
 *
 * Deleting is the only one with any depth to it, and all of that depth is in
 * one place: a subpath is a chain, so removing a link from the middle of one
 * leaves two chains, and removing a link from a ring leaves one. Both fall out
 * of taking the chain apart into edges and putting back whatever still joins
 * up, rather than being two cases someone has to remember to write.
 */

interface Edge {
  from: number;
  to: number;
  segment: SkeletonSegment;
}

const edgesOf = (skeleton: Skeleton, subpath: SkeletonSubpath): Edge[] =>
  subpath.segments.map((segment, i) => ({ from: segmentStart(subpath, i), to: segment.to, segment }));

/**
 * Edges back into subpaths, starting a new one wherever the chain breaks.
 *
 * `intact` says whether every edge of the original survived, which is the only
 * way a ring can still be a ring. A run whose ends happen to coincide is not
 * the same thing: that is a shape drawn back to its own start, and calling it
 * closed would add a `Z` its author did not write.
 */
function rechain(edges: readonly Edge[], wasClosed: boolean, intact: boolean): SkeletonSubpath[] {
  if (edges.length === 0) return [];
  if (wasClosed && intact) {
    return [{ start: edges[0]!.from, segments: edges.map((e) => e.segment), closed: true }];
  }

  let ordered = [...edges];
  if (wasClosed) {
    // The ring is broken somewhere; rotating the gap to the front turns what
    // would read as two runs back into the single run it actually is.
    const breakAt = ordered.findIndex((edge, i) => i > 0 && ordered[i - 1]!.to !== edge.from);
    if (breakAt > 0) ordered = [...ordered.slice(breakAt), ...ordered.slice(0, breakAt)];
  }

  const out: SkeletonSubpath[] = [];
  let run: Edge[] = [];
  const flush = () => {
    if (run.length === 0) return;
    out.push({ start: run[0]!.from, segments: run.map((e) => e.segment), closed: false });
    run = [];
  };
  for (const edge of ordered) {
    const previous = run[run.length - 1];
    if (previous && previous.to !== edge.from) flush();
    run.push(edge);
  }
  flush();
  return out;
}

/**
 * Drop vertices nothing refers to, and renumber what is left.
 *
 * Deleting leaves holes in the vertex array, and a hole is not harmless: the
 * editor draws a handle per vertex, so an orphan is a control point sitting in
 * space attached to nothing, draggable, and saved into the path data as a
 * `M` that goes nowhere.
 */
export function compact(skeleton: Skeleton): Skeleton {
  const used = new Set<number>();
  for (const subpath of skeleton.subpaths) {
    subpath.segments.forEach((segment, i) => {
      used.add(segmentStart(subpath, i));
      used.add(segment.to);
    });
  }
  if (used.size === skeleton.vertices.length) return skeleton;

  const order = [...used].sort((a, b) => a - b);
  const remap = new Map<number, number>();
  order.forEach((old, next) => remap.set(old, next));

  const corners: Record<number, number> = {};
  for (const [vertex, radius] of Object.entries(skeleton.corners)) {
    const next = remap.get(Number(vertex));
    if (next !== undefined) corners[next] = radius;
  }

  return {
    vertices: order.map((i) => skeleton.vertices[i]!),
    corners,
    subpaths: skeleton.subpaths.map((subpath) => ({
      ...subpath,
      start: remap.get(subpath.start) ?? 0,
      segments: subpath.segments.map((segment) => ({ ...segment, to: remap.get(segment.to) ?? 0 })),
    })),
  };
}

/**
 * Move a set of vertices by the same amount.
 *
 * A set, not a vertex, because a selection of segments is a selection of the
 * vertices they share — and moving them one at a time through `moveVertex`
 * would rebuild the vertex array once per vertex for no gain.
 */
export function moveVertices(skeleton: Skeleton, vertices: Iterable<number>, delta: Point): Skeleton {
  const moving = new Set(vertices);
  if (moving.size === 0) return skeleton;
  return {
    ...skeleton,
    vertices: skeleton.vertices.map((v, i) => (moving.has(i) ? ([v[0] + delta[0], v[1] + delta[1]] as Point) : v)),
  };
}

/** Every vertex the given segments touch. */
export function verticesOf(skeleton: Skeleton, ids: ReadonlySet<string>): Set<number> {
  const out = new Set<number>();
  skeleton.subpaths.forEach((subpath, s) => {
    subpath.segments.forEach((segment, i) => {
      if (!ids.has(`${s}:${i}`)) return;
      out.add(segmentStart(subpath, i));
      out.add(segment.to);
    });
  });
  return out;
}

const replaceSegment = (
  skeleton: Skeleton,
  sub: number,
  index: number,
  fn: (segment: SkeletonSegment) => SkeletonSegment,
): Skeleton => ({
  ...skeleton,
  subpaths: skeleton.subpaths.map((subpath, s) =>
    s !== sub
      ? subpath
      : { ...subpath, segments: subpath.segments.map((segment, i) => (i === index ? fn(segment) : segment)) },
  ),
});

/** Move one handle of a cubic. The other end stays where the author put it. */
export function moveControlPoint(skeleton: Skeleton, sub: number, index: number, which: 1 | 2, to: Point): Skeleton {
  return replaceSegment(skeleton, sub, index, (segment) =>
    segment.kind === "cubic" ? { ...segment, [which === 1 ? "c1" : "c2"]: to } : segment,
  );
}

/**
 * State the radius of an arc that is already in the drawing.
 *
 * Distinct from `setCorner`, which states the radius of a *fillet the language
 * has not cut yet*. Both are radius handles and they look identical on screen,
 * but one edits geometry and the other edits a decision, and collapsing them
 * would mean dragging a corner silently baked it.
 */
export function setArcRadius(skeleton: Skeleton, sub: number, index: number, radius: number): Skeleton {
  const safe = Math.max(radius, 1e-3);
  return replaceSegment(skeleton, sub, index, (segment) =>
    segment.kind === "arc"
      ? { ...segment, radius: safe, ...(segment.radiusY !== undefined && { radiusY: safe }) }
      : segment,
  );
}

export function deleteSegments(skeleton: Skeleton, ids: ReadonlySet<string>): Skeleton {
  if (ids.size === 0) return skeleton;
  const subpaths: SkeletonSubpath[] = [];
  skeleton.subpaths.forEach((subpath, s) => {
    const edges = edgesOf(skeleton, subpath);
    const kept = edges.filter((_, i) => !ids.has(`${s}:${i}`));
    subpaths.push(...rechain(kept, subpath.closed, kept.length === edges.length));
  });
  return compact({ ...skeleton, subpaths });
}

/**
 * Copy a selection, offset, as subpaths of its own.
 *
 * The copy gets fresh vertices rather than sharing the originals'. Sharing them
 * would be the faster edit and completely wrong: the two drawings would then be
 * welded together, and dragging one would drag the other.
 */
export function duplicateSegments(skeleton: Skeleton, ids: ReadonlySet<string>, delta: Point): Skeleton {
  if (ids.size === 0) return skeleton;

  const vertices = [...skeleton.vertices];
  const copies = new Map<number, number>();
  const copy = (vertex: number): number => {
    const existing = copies.get(vertex);
    if (existing !== undefined) return existing;
    const source = skeleton.vertices[vertex];
    if (!source) return vertex;
    const next = vertices.length;
    vertices.push([source[0] + delta[0], source[1] + delta[1]]);
    copies.set(vertex, next);
    return next;
  };

  const added: SkeletonSubpath[] = [];
  skeleton.subpaths.forEach((subpath, s) => {
    const edges = edgesOf(skeleton, subpath);
    const selected = edges.filter((_, i) => ids.has(`${s}:${i}`));
    if (selected.length === 0) return;
    const moved = selected.map(({ from, to, segment }) => ({
      from: copy(from),
      to: copy(to),
      segment:
        segment.kind === "cubic"
          ? {
              ...segment,
              to: copy(to),
              c1: [segment.c1[0] + delta[0], segment.c1[1] + delta[1]] as Point,
              c2: [segment.c2[0] + delta[0], segment.c2[1] + delta[1]] as Point,
            }
          : { ...segment, to: copy(to) },
    }));
    added.push(...rechain(moved, subpath.closed, selected.length === edges.length));
  });

  const corners: Record<number, number> = { ...skeleton.corners };
  for (const [original, next] of copies) {
    const radius = skeleton.corners[original];
    if (radius !== undefined) corners[next] = radius;
  }

  return { vertices, corners, subpaths: [...skeleton.subpaths, ...added] };
}

/**
 * Give a corner that is already cut a different radius.
 *
 * Both tangent points move, and because they are vertices the adjoining lines
 * move with them — which is the whole reason this is three lines here and a
 * repair pass in the tool it comes from. There, the lines hold copies of these
 * points, so re-cutting opens a gap that something else has to notice and
 * close. Here there is nothing to hold a gap open.
 */
export function recutFillet(skeleton: Skeleton, fillet: FilletView, radius: number): Skeleton {
  const cut = tangentsFor(fillet, radius);
  const moved = moveVertex(moveVertex(skeleton, fillet.fromVertex, cut.from), fillet.toVertex, cut.to);
  return setArcRadius(moved, fillet.sub, fillet.index, radius);
}
