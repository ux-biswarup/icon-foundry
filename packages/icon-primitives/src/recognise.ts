import {
  chain,
  scale as scaleMatrix,
  shapeBounds,
  sampleShape,
  transformShape,
  translate,
  unionBounds,
  type Bounds,
  type Point,
  type Shape,
} from "./geometry.js";
import type { PrimitiveContext } from "./primitive.js";
import type { PrimitiveRegistry } from "./registry.js";
import { skeletonToCommands, type Skeleton } from "./skeleton.js";

/**
 * Recognise drawn geometry as a primitive the set already has.
 *
 * Lucide's equivalent is four passes — `optimizeRect`, `optimizeEllipse`,
 * `optimizeHalfCircle`, `pathsToElement` — that turn path data back into
 * `<rect>` and `<circle>`. There it is tidiness: an SVG element instead of a
 * path.
 *
 * Here it is the most valuable pass in the pipeline, because a named primitive
 * is not a tidier way of writing the same geometry. It is geometry *attached to
 * the language*: it declares which traits it reads, it takes its corner radius
 * from the tokens, and it redraws itself when the language changes. Four drawn
 * lines are inert. A `square` is part of the set.
 *
 * The one rule this follows: **it must never be wrong.** A drawing that goes
 * unrecognised costs nothing — it stays exactly as drawn. A drawing recognised
 * as the wrong thing is silently replaced by geometry its author did not draw,
 * which is unforgivable in a tool that is supposed to be precise. So every test
 * below is conservative, and every doubt is resolved by declining.
 */

export interface Recognition {
  /** Name of the primitive the drawing turned out to be. */
  primitive: string;
  /** The box to place it in, so composing it reproduces the drawing. */
  box: { x: number; y: number; width: number; height: number };
  /** Worst distance between the drawing and the primitive, in canvas units. */
  deviation: number;
}

export interface RecogniseOptions extends Partial<PrimitiveContext> {
  /**
   * How far a point may sit from the primitive and still count as the same
   * drawing. Defaults to a fifth of a grid step: below what a person could have
   * meant, well above floating-point noise.
   */
  tolerance?: number;
  /** Layout grid, only used to pick a default tolerance. */
  grid?: number;
  /** Names to consider. Defaults to every primitive in the registry. */
  only?: readonly string[];
}

/** Walk a polyline, emitting a point every `step` units, so two drawings are
 *  compared along their edges rather than at their corners. Comparing corner
 *  sets alone would call a Z and a square the same shape. */
function densify(polylines: readonly Point[][], step: number): Point[] {
  const out: Point[] = [];
  for (const poly of polylines) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      out.push(a);
      const b = poly[i + 1];
      if (!b) continue;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.floor(length / step);
      for (let k = 1; k < steps; k++) {
        out.push([a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps]);
      }
    }
  }
  return out;
}

/** Worst distance from any point of `from` to the nearest point of `to`. */
function oneWay(from: readonly Point[], to: readonly Point[]): number {
  let worst = 0;
  for (const a of from) {
    let best = Infinity;
    for (const b of to) {
      const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
      if (d < best) best = d;
    }
    if (best > worst) worst = best;
    if (!Number.isFinite(worst)) break;
  }
  return Math.sqrt(worst);
}

/** Symmetric: neither drawing may stray from the other. */
function deviation(a: readonly Point[], b: readonly Point[]): number {
  if (a.length === 0 || b.length === 0) return Infinity;
  return Math.max(oneWay(a, b), oneWay(b, a));
}

const size = (b: Bounds) => ({ width: b.maxX - b.minX, height: b.maxY - b.minY });

export function recognise(
  skeleton: Skeleton,
  registry: PrimitiveRegistry,
  options: RecogniseOptions = {},
): Recognition | undefined {
  if (skeleton.subpaths.length === 0) return undefined;

  const grid = options.grid ?? 0.5;
  const tolerance = options.tolerance ?? grid / 5;
  const step = Math.max(tolerance, 1e-3);

  const drawn: Shape = { kind: "path", commands: skeletonToCommands(skeleton), fillable: false };
  const drawnBounds = shapeBounds(drawn);
  const drawnSize = size(drawnBounds);
  const drawnPoints = densify(sampleShape(drawn), step);
  if (drawnPoints.length === 0) return undefined;

  const ctx: PrimitiveContext = {
    style: options.style ?? "outline",
    strokeWidth: options.strokeWidth ?? 1.5,
    cornerRadius: options.cornerRadius ?? 0,
    scale: 1,
    ...(options.construction && { construction: options.construction }),
  };

  let best: Recognition | undefined;

  for (const primitive of registry.list()) {
    if (options.only && !options.only.includes(primitive.name)) continue;

    let shapes: Shape[];
    try {
      shapes = primitive.build(ctx);
    } catch {
      continue;
    }
    if (shapes.length === 0) continue;

    const naturalBounds = unionBounds(shapes.map(shapeBounds));
    const natural = size(naturalBounds);

    // A primitive that is a pure line along one axis can only be the drawing if
    // the drawing is too, and vice versa.
    const flatX = natural.width < 1e-9;
    const flatY = natural.height < 1e-9;
    if (flatX !== drawnSize.width < 1e-9 || flatY !== drawnSize.height < 1e-9) continue;

    const sx = flatX ? undefined : drawnSize.width / natural.width;
    const sy = flatY ? undefined : drawnSize.height / natural.height;
    const factors = [sx, sy].filter((n): n is number => n !== undefined && Number.isFinite(n) && n > 0);
    if (factors.length === 0) continue;

    // Only a near-uniform fit is considered. A stretched circle may well be what
    // the composer would draw for that box — or it may not, and recognising one
    // wrongly rewrites a person's drawing. Declining is the cheap mistake.
    const factor = factors.reduce((a, b) => a + b, 0) / factors.length;
    if (factors.some((f) => Math.abs(f - factor) > 0.02 * factor)) continue;

    // `chain` applies in argument order: to the origin, scaled, then to where
    // the drawing actually is.
    const matrix = chain(
      translate(
        -(naturalBounds.minX + naturalBounds.maxX) / 2,
        -(naturalBounds.minY + naturalBounds.maxY) / 2,
      ),
      scaleMatrix(factor),
      translate(
        (drawnBounds.minX + drawnBounds.maxX) / 2,
        (drawnBounds.minY + drawnBounds.maxY) / 2,
      ),
    );

    const placed = shapes.map((shape) => transformShape(shape, matrix));
    const points = densify(placed.flatMap((shape) => sampleShape(shape)), step);
    const distance = deviation(drawnPoints, points);
    if (distance > tolerance) continue;
    if (best && distance >= best.deviation) continue;

    const bounds = unionBounds(placed.map(shapeBounds));
    best = {
      primitive: primitive.name,
      box: {
        x: bounds.minX,
        y: bounds.minY,
        width: bounds.maxX - bounds.minX,
        height: bounds.maxY - bounds.minY,
      },
      deviation: distance,
    };
  }

  return best;
}
