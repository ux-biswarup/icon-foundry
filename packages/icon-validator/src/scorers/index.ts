import { composedBounds, topLevelIndex, type ComposedShape } from "@icon-foundry/icon-composer";
import { sampleShape, shapeDistance, type Point } from "@icon-foundry/icon-primitives";
import { defineScorer, type ScoringRule } from "../types.js";

/**
 * Soft preferences. Each returns 0 to 1, higher being better, and none of them
 * can fail an icon.
 *
 * A score is worth more than a politer warning because one measurement serves
 * three jobs: ranking candidates so a designer picks rather than compares,
 * auditing a set so drift is visible, and spotting an unstated rule when a
 * score clusters tightly across every icon.
 */

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Every sampled point of every shape, in canvas coordinates. */
function points(shapes: readonly ComposedShape[]): Point[] {
  const out: Point[] = [];
  for (const item of shapes) for (const poly of sampleShape(item.shape)) out.push(...poly);
  return out;
}

/** Total sampled length, used to weight shapes by how much ink they are. */
function polyLength(poly: readonly Point[]): number {
  let total = 0;
  for (let i = 0; i < poly.length - 1; i++) total += Math.hypot(poly[i + 1]![0] - poly[i]![0], poly[i + 1]![1] - poly[i]![1]);
  return total;
}

function shapeLength(item: ComposedShape): number {
  return sampleShape(item.shape).reduce((sum, poly) => sum + polyLength(poly), 0);
}

/**
 * Restraint. Detail is a budget, and it is a gradient rather than a cliff: an
 * icon at 90% of its budget is not "fine" the way the hard complexity rule
 * implies, it is nearly too busy.
 */
export const restraintScorer = defineScorer({
  id: "restraint",
  label: "Restraint",
  description: "Fewer parts and fewer shapes than the budget allows.",
  score: ({ composed, tokens }) => {
    if (!composed) return undefined;
    const parts = composed.elementCount / tokens.limits.maxElements;
    const shapes = composed.shapes.length / tokens.limits.maxShapes;
    const used = Math.max(parts, shapes);
    const value = clamp01(1 - used);
    const which = parts >= shapes ? `${composed.elementCount} of ${tokens.limits.maxElements} parts` : `${composed.shapes.length} of ${tokens.limits.maxShapes} shapes`;
    return { value, note: `Uses ${which}.` };
  },
});

/**
 * Optical balance. Geometry that sits off-centre reads as off-centre even when
 * its bounding box is centred, which is why the centre of ink matters more
 * than the centre of the box.
 */
export const balanceScorer = defineScorer({
  id: "balance",
  label: "Optical balance",
  description: "The weight of the drawing sits near the centre of the canvas.",
  score: ({ composed }) => {
    if (!composed || composed.shapes.length === 0) return undefined;
    const pts = points(composed.shapes);
    if (pts.length === 0) return undefined;
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const centre = composed.canvas / 2;
    const off = Math.hypot(cx - centre, cy - centre);
    // Half the canvas away is as wrong as it gets.
    const value = clamp01(1 - off / (composed.canvas / 4));
    return { value, note: off < 0.25 ? "Centred." : `Weight sits ${off.toFixed(1)} units off centre.` };
  },
});

/**
 * Symmetry. Mirrored geometry reads as deliberate; near-symmetry reads as a
 * mistake. This measures the horizontal mirror only, because vertical symmetry
 * is rare in icons and scoring it would punish every icon that has a base.
 */
export const symmetryScorer = defineScorer({
  id: "symmetry",
  label: "Symmetry",
  description: "The subject mirrors cleanly across its own vertical axis.",
  score: ({ composed }) => {
    if (!composed || composed.shapes.length === 0) return undefined;
    // The subject only. A badge is deliberate asymmetry, and scoring the whole
    // composition would mark down every icon that uses the pattern correctly.
    const subject = largestElement(composed.shapes);
    const pts = points(subject);
    if (pts.length < 4) return undefined;
    // Mirror about the subject's own centre, not the canvas centre, since a
    // subject that sits left of centre to make room for a badge is still symmetric.
    const xs = pts.map((p) => p[0]);
    const axis = (Math.min(...xs) + Math.max(...xs)) / 2;
    let total = 0;
    for (const [x, y] of pts) {
      const mx = 2 * axis - x;
      let best = Infinity;
      for (const [ox, oy] of pts) {
        const d = Math.hypot(mx - ox, y - oy);
        if (d < best) best = d;
        if (best === 0) break;
      }
      total += best;
    }
    const mean = total / pts.length;
    const value = clamp01(1 - mean / (composed.canvas / 8));
    return {
      value,
      note: value > 0.9 ? "Mirrors cleanly." : `Off the mirror by ${mean.toFixed(2)} units on average.`,
    };
  },
});

/**
 * Silhouette. An icon that survives being reduced to a solid shape survives
 * every small size and every low-contrast background. Closed geometry is what
 * survives, so this weighs closed ink against open ink.
 */
export const silhouetteScorer = defineScorer({
  id: "silhouette",
  label: "Silhouette",
  description: "Enough of the drawing is closed shape to read when filled.",
  score: ({ composed }) => {
    if (!composed || composed.shapes.length === 0) return undefined;
    let closed = 0;
    let total = 0;
    for (const item of composed.shapes) {
      const length = shapeLength(item);
      total += length;
      if (item.shape.fillable) closed += length;
    }
    if (total === 0) return undefined;
    const value = clamp01(closed / total);
    return {
      value,
      note: value > 0.75 ? "Reads as a solid shape." : `${Math.round(value * 100)}% of the drawing is closed shape.`,
    };
  },
});

/**
 * Breathing room. The hard rule only asks whether a gap clears the minimum;
 * this asks how comfortably, because a gap that just scrapes past is the one
 * that closes up the next time a stroke gets heavier.
 */
export const breathingScorer = defineScorer({
  id: "breathing",
  label: "Breathing room",
  description: "Separate parts keep more than the minimum gap between them.",
  score: ({ composed, tokens }) => {
    if (!composed || tokens.minNegativeSpace <= 0) return undefined;
    const half = (item: ComposedShape) => (item.style === "filled" && item.shape.fillable ? 0 : item.stroke.width / 2);
    let smallest = Infinity;
    for (let i = 0; i < composed.shapes.length; i++) {
      for (let j = i + 1; j < composed.shapes.length; j++) {
        const a = composed.shapes[i]!;
        const b = composed.shapes[j]!;
        if (topLevelIndex(a.source) === topLevelIndex(b.source)) continue;
        const d = shapeDistance(a.shape, b.shape);
        if (d === 0) continue; // a deliberate crossing, not a gap
        smallest = Math.min(smallest, d - half(a) - half(b));
      }
    }
    if (!Number.isFinite(smallest)) return undefined;
    // Twice the minimum is as generous as this needs to measure.
    const value = clamp01(smallest / (tokens.minNegativeSpace * 2));
    return { value, note: `Tightest gap is ${smallest.toFixed(2)} against a minimum of ${tokens.minNegativeSpace}.` };
  },
});

/** The top-level element with the most ink: the thing the icon is *of*. */
function largestElement(shapes: readonly ComposedShape[]): ComposedShape[] {
  const groups = new Map<number, ComposedShape[]>();
  for (const item of shapes) {
    const key = topLevelIndex(item.source);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  let best: ComposedShape[] = [...shapes];
  let bestLength = -1;
  for (const group of groups.values()) {
    const length = group.reduce((sum, item) => sum + shapeLength(item), 0);
    if (length > bestLength) {
      bestLength = length;
      best = group;
    }
  }
  return best;
}

/** Filled shapes that fill their box leave nothing to read; used by the audit too. */
export function boundsFill(composed: NonNullable<Parameters<typeof composedBounds>[0]>): number {
  const b = composedBounds(composed);
  const area = Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);
  return area / (composed.canvas * composed.canvas);
}

export const builtInScorers: readonly ScoringRule[] = [
  restraintScorer,
  balanceScorer,
  symmetryScorer,
  silhouetteScorer,
  breathingScorer,
];
