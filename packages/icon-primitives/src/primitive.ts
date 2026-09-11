import type { IconStyle } from "@icon-foundry/icon-language";
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
  /** Words that map natural-language intent to this primitive. */
  keywords: readonly string[];
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
