import type { IconStyle, OpticalShape } from "@icon-foundry/icon-language";
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
  /** Where the primitive came from. Built-ins are `builtin`; user-defined
   * elements carry their library status. */
  origin?: "builtin" | "approved" | "draft";
  build(ctx: PrimitiveContext): Shape[];
}

export function definePrimitive(primitive: Primitive): Primitive {
  return primitive;
}

/** Radius helper: convert a canvas-unit radius into primitive-local units. */
export function localRadius(ctx: PrimitiveContext, max: number): number {
  if (ctx.scale <= 0) return 0;
  return Math.min(ctx.cornerRadius / ctx.scale, max);
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
