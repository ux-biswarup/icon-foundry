import type { Point } from "./geometry.js";

/**
 * Where a dragged vertex should land.
 *
 * Editing a skeleton by hand is the one place a person can leave the language
 * by accident, so the editor pulls toward it rather than policing it after the
 * fact. Two pulls, in order of what this set is made of:
 *
 * 1. **The angle set.** A segment at 44° is a mistake in a language built from
 *    0/45/90; it is never a decision. So a vertex near an allowed direction from
 *    one of its neighbours snaps onto that ray exactly, and the length along it
 *    lands on the grid.
 * 2. **The grid**, when no angle is near — which is the honest answer for a
 *    vertex in open space with nothing to be square to.
 *
 * A drag that is nowhere near either is left alone rather than dragged
 * somewhere it did not ask to go: pulling a point two units to satisfy a rule
 * is the editor overruling the person holding the mouse.
 */

export interface SnapOptions {
  /** Layout grid. 0 turns grid snapping off. */
  grid: number;
  /** Allowed line directions in degrees. Empty means any angle is fine. */
  angles?: readonly number[];
  /** How far a point may be pulled onto an allowed ray, in grid steps. */
  pull?: number;
  /** Skip the angle set for this drag: the modifier key is down. */
  free?: boolean;
}

export interface Snapped {
  point: Point;
  /** The direction it landed on, when it landed on one. */
  angle?: number;
}

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Trig residue cleaned off the cardinal values, which are exact by definition. */
const exact = (n: number): number =>
  Math.abs(n) < 1e-12 ? 0 : Math.abs(n - 1) < 1e-12 ? 1 : Math.abs(n + 1) < 1e-12 ? -1 : n;

const toGrid = (point: Point, grid: number): Point =>
  grid > 0 ? [Math.round(point[0] / grid) * grid, Math.round(point[1] / grid) * grid] : point;

/**
 * The allowed directions as full rays: a language that permits 45° permits
 * running down-left at 225° too, since an angle set describes lines rather than
 * arrows.
 */
function rays(angles: readonly number[]): number[] {
  const out = new Set<number>();
  for (const angle of angles) {
    out.add(((angle % 360) + 360) % 360);
    out.add(((angle + 180) % 360 + 360) % 360);
  }
  return [...out];
}

export function snapToConstruction(raw: Point, neighbours: readonly Point[], options: SnapOptions): Snapped {
  const { grid, free = false } = options;
  const angles = options.angles ?? [];
  const gridded = toGrid(raw, grid);
  if (free || angles.length === 0 || neighbours.length === 0) return { point: gridded };

  const limit = (options.pull ?? 1.5) * (grid > 0 ? grid : 1);
  let best: Snapped | undefined;
  let bestDistance = Infinity;

  for (const neighbour of neighbours) {
    const dx = raw[0] - neighbour[0];
    const dy = raw[1] - neighbour[1];
    if (dx === 0 && dy === 0) continue;

    for (const ray of rays(angles)) {
      const radians = (ray * Math.PI) / 180;
      // `Math.cos(Math.PI / 2)` is 6.1e-17, not 0, and a vertex snapped onto a
      // vertical then lands at 15.999999999999998 rather than on its
      // neighbour's own x. The direction of a right angle *is* (0, 1); the
      // library merely cannot say so.
      const direction: Point = [exact(Math.cos(radians)), exact(Math.sin(radians))];
      // How far along this ray the pointer is. A negative projection means the
      // pointer is behind the neighbour, which this ray cannot explain.
      const along = dx * direction[0] + dy * direction[1];
      if (along <= 0) continue;
      const stepped = grid > 0 ? Math.max(grid, Math.round(along / grid) * grid) : along;
      const candidate: Point = [neighbour[0] + direction[0] * stepped, neighbour[1] + direction[1] * stepped];
      const moved = distance(candidate, raw);
      if (moved > limit || moved >= bestDistance) continue;
      bestDistance = moved;
      best = { point: candidate, angle: ((ray % 180) + 180) % 180 };
    }
  }

  return best ?? { point: gridded };
}

/**
 * Is this direction one the language allows?
 *
 * Compared modulo 180, because a line has no arrow: 45° and 225° are the same
 * line drawn from opposite ends.
 */
export function isAllowedAngle(degrees: number, angles: readonly number[], tolerance = 1): boolean {
  if (angles.length === 0) return true;
  const normal = (((degrees % 180) + 180) % 180);
  return angles.some((allowed) => {
    const target = (((allowed % 180) + 180) % 180);
    const gap = Math.abs(normal - target);
    return Math.min(gap, 180 - gap) <= tolerance;
  });
}
