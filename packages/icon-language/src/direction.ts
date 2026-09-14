import type { BadgeCorner, DiagonalDirection } from "./types.js";

/**
 * Which way the set leans.
 *
 * Cursor's pointer runs from bottom left to top right, and so does every icon
 * that could go either way: diagonal arrows, flying objects, and any
 * composition where one part sits above another. Nobody reads this off the
 * screen. But a set where half the arrows lean one way and half the other stops
 * looking like it came from one place, and that *is* read — as carelessness.
 *
 * One direction, stated once in the grammar, and three things consume it: the
 * agent is told it, the slash is drawn against it, and the validator checks it.
 * They agree because they all read from here rather than each rederiving what
 * "up-right" means from a sign somewhere.
 *
 * The convention throughout is the one every angle in this project uses:
 * degrees from the x axis with **y growing downward**, normalised to 0–180
 * because a line has no direction. That makes 135° the up-right diagonal and
 * 45° the up-left one, which reads backwards until you remember the screen's y
 * axis points at the floor.
 */
export const DIAGONAL_ANGLES: Readonly<Record<Exclude<DiagonalDirection, "none">, number>> = {
  "up-right": 135,
  "up-left": 45,
};

/** The angle a lean is drawn at, or undefined when the set states no lean. */
export function diagonalAngle(direction: DiagonalDirection): number | undefined {
  return direction === "none" ? undefined : DIAGONAL_ANGLES[direction];
}

/**
 * The other diagonal.
 *
 * Named rather than inlined because it is the whole of the slash rule: a slash
 * cancels a direction, so it has to cut *against* the one the set follows. A
 * slash lying along the pointer reads as part of the drawing instead of as a
 * line through it.
 *
 * A set with no stated lean has no other one either, which is why this returns
 * "none" rather than picking a side on its behalf.
 */
export function oppositeDiagonal(direction: DiagonalDirection): DiagonalDirection {
  if (direction === "up-right") return "up-left";
  if (direction === "up-left") return "up-right";
  return "none";
}

/**
 * Which way a line leans, or undefined when it is flat or upright.
 *
 * `axial` is how far from horizontal or vertical a line has to be before it
 * counts as a diagonal at all. It is deliberately not the grammar's
 * `angleTolerance`: that answers "is this line on an angle the language
 * allows", which is usually a degree or less, and a line one degree off flat is
 * a horizontal line with a bug in it, not a diagonal leaning up-left.
 */
export function leanOf(angle: number, axial = 8): DiagonalDirection {
  const a = ((angle % 180) + 180) % 180;
  if (a < axial || a > 180 - axial || Math.abs(a - 90) < axial) return "none";
  return a < 90 ? "up-left" : "up-right";
}

/** English for a direction, for messages a designer reads. */
export function directionName(direction: DiagonalDirection): string {
  return direction === "none" ? "neither way" : direction.replace("-", " ");
}

/** Which corner a point sits in relative to an origin, y growing downward. */
export function cornerOf(dx: number, dy: number): BadgeCorner {
  return `${dy < 0 ? "top" : "bottom"}-${dx < 0 ? "left" : "right"}` as BadgeCorner;
}

/** English for a corner, for messages a designer reads. */
export const cornerName = (corner: BadgeCorner): string => corner.replace("-", " ");
