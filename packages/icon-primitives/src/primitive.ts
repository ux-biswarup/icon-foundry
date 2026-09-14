import { DEFAULT_CONSTRUCTION, type Construction, type IconStyle, type OpticalShape } from "@icon-foundry/icon-language";
import type { Shape } from "./geometry.js";

export type PrimitiveCategory = "shape" | "object" | "symbol";

/** Everything a primitive may adapt to. Primitives must be pure functions of
 * this context: same context, same shapes. */
export interface PrimitiveContext {
  style: IconStyle;
  /** Stroke width in canvas units. */
  strokeWidth: number;
  /** Corner radius in canvas units, from the language. */
  cornerRadius: number;
  /** Factor the composer will scale this primitive by. Divide canvas-unit
   * values (like `cornerRadius`) by it to keep them exact after scaling. */
  scale: number;
  /** Layout grid in canvas units. Only corner snapping reads it. */
  grid?: number;
  /** How this language builds a part. Optional so a caller composing one shape
   * in isolation does not have to supply a whole language. */
  construction?: Construction;
}

export interface Primitive {
  name: string;
  category: PrimitiveCategory;
  description: string;
  /** Natural geometry box the shapes are authored in. A zero width or height
   * means the primitive is a pure line along the other axis. */
  box: { width: number; height: number };
  /** Which keyline box this primitive should be fitted into when it is the
   * subject of an icon. */
  opticalShape: OpticalShape;
  /** Words that map natural-language intent to this primitive. */
  keywords: readonly string[];
  /**
   * True when the shape's concept demands angles outside the language grammar
   * (a triangle, an isometric box, a snowflake's 60° symmetry). Declared once
   * here and reviewed by a human, so the construction rule can police
   * everything else — especially freeform geometry.
   */
  freeAngles?: boolean;
  /**
   * Language values this primitive's geometry reads.
   *
   * A declaration, not a hint. If a primitive names a value here, changing that
   * value in the language must change what it draws; if it does not name one,
   * changing that value must leave it alone. Both directions are tested,
   * because the failure this prevents is invisible: a token that silently
   * reaches only some of the set produces a rounded building standing next to a
   * sharp truck, and nobody can see the cause by looking at either one.
   *
   * A primitive that declines a value declines it on purpose. A square has a
   * rounded sibling, and an isometric box has no corner to round.
   */
  traits?: readonly string[];
  /** Where the primitive came from. Built-ins are `builtin`; user-defined
   * elements carry their library status. */
  origin?: "builtin" | "approved" | "draft";
  build(ctx: PrimitiveContext): Shape[];
}

export function definePrimitive(primitive: Primitive): Primitive {
  return primitive;
}

/**
 * The language's corner radius, in this primitive's local units.
 *
 * Radius is a rule set rather than a number, and the two rules below are the
 * cleanest recurrence in the survey of published icon systems: Google and IBM
 * state them independently, with different values and identical structure.
 * See docs/research/icon-properties.md §3.
 *
 * **A corner narrower than two strokes does not round.** Google: "Do not round
 * the corners of strokes (shapes 2dp wide or less)." Rounding one does not make
 * it softer, it makes it a lozenge, and at the size this matters it just looks
 * like a mistake.
 *
 * `max` is the geometric ceiling: half the shorter side of whatever is being
 * rounded, so a very round language cannot turn a rect into something else.
 */
export function localRadius(ctx: PrimitiveContext, max: number): number {
  if (ctx.scale <= 0) return 0;
  // `max` is half the narrow side, so `max * 2` is the shape's width. Google
  // states the threshold at its own numbers — a 2dp stroke and "shapes 2dp wide
  // or less" — which generalises to: no wider than one stroke is a stroke.
  const localStroke = ctx.strokeWidth / ctx.scale;
  if (max * 2 <= localStroke) return 0;
  return Math.min(ctx.cornerRadius / ctx.scale, max);
}

/**
 * Radius for a corner *inside* the silhouette, which in the outlined style is
 * square.
 *
 * "Rounded exteriors with 90° interiors" is IBM's phrasing; Material says
 * "interior corners should be square" and later made it a property of the
 * outlined style rather than a law, since its Rounded family rounds both. That
 * is exactly the shape of a decision that belongs to a team rather than to us,
 * so this is the seam where an `interiorRadius` trait will land. Until then the
 * outlined style keeps its interiors square and the filled style rounds its
 * holes with the rest of the silhouette.
 */
export function interiorRadius(ctx: PrimitiveContext, max: number): number {
  const share = ctx.construction?.interiorRadius ?? DEFAULT_CONSTRUCTION.interiorRadius;
  if (share <= 0) return 0;
  return localRadius(ctx, max) * share;
}

/** The construction this context was built with, or the defaults. */
export function traits(ctx: PrimitiveContext): Construction {
  return ctx.construction ?? DEFAULT_CONSTRUCTION;
}

/**
 * Scale a distance from a contour by the language's inset multiplier.
 *
 * Each primitive keeps the inset it was drawn with at 1, so the trait moves the
 * whole set together without anyone having to agree what the right absolute
 * number is. `limit` stops a generous language from pushing detail through the
 * far wall.
 */
export function inset(ctx: PrimitiveContext, drawn: number, limit: number): number {
  return Math.min(limit, drawn * traits(ctx).inset);
}

/**
 * Scale the signature round part: a head, a wheel, the dot of a pin.
 *
 * Nobody publishes a rule for this, which is exactly why it belongs in a
 * language file. A set where every accent is a hair different reads as careless
 * without any single icon looking wrong.
 */
export function accent(ctx: PrimitiveContext, drawn: number): number {
  return drawn * traits(ctx).accentSize;
}

/**
 * Rise per unit of run for a sloping or receding plane.
 *
 * `mixed` returns the pitch the primitive was drawn at, because our own
 * vocabulary currently answers this two different ways — 45° for a document
 * fold and a truck cab, 26.6° for a warehouse roof and an isometric box — and
 * picking one silently would redraw the other.
 */
export function slope(ctx: PrimitiveContext, drawn: number): number {
  switch (traits(ctx).slope) {
    case "45":
      return 1;
    case "iso":
      return 0.5;
    case "shallow":
      return 0.32;
    default:
      return drawn;
  }
}

/** Pick an optical shape from a natural box's aspect ratio. */
export function inferOpticalShape(box: { width: number; height: number }, hint?: "round"): OpticalShape {
  if (hint === "round") return "circle";
  if (box.width === 0 || box.height === 0) return box.width === 0 ? "vertical" : "horizontal";
  const ratio = box.width / box.height;
  if (ratio > 1.15) return "horizontal";
  if (ratio < 1 / 1.15) return "vertical";
  return "square";
}
