import {
  hasSize,
  nearestTokens,
  resolveTokens,
  type IconLanguage,
  type IconStyle,
  type SizeTokens,
  type StrokeCap,
  type StrokeJoin,
} from "@icon-foundry/icon-language";
import {
  chain,
  defaultRegistry,
  PathDataError,
  pathShapeFromData,
  rotate,
  scale,
  shapeBounds,
  transformShape,
  translate,
  unionBounds,
  type Bounds,
  type Matrix,
  type PrimitiveRegistry,
  type Shape,
} from "@icon-foundry/icon-primitives";
import {
  elementBox,
  type Alignment,
  type IconElement,
  type IconSpec,
  type PathElement,
  type StrokeOverride,
} from "@icon-foundry/icon-spec";

export interface ResolvedStroke {
  width: number;
  cap: StrokeCap;
  join: StrokeJoin;
}

/** A shape in canvas coordinates with every style decision already resolved. */
export interface ComposedShape {
  shape: Shape;
  style: IconStyle;
  stroke: ResolvedStroke;
  color: string;
  /** Name of the primitive that produced the shape, or "path" for freeform geometry. */
  primitive: string;
  /** JSON-pointer-like path to the source element, e.g. `elements[1].children[0]`. */
  source: string;
}

export interface ComposedIcon {
  name: string;
  language: string;
  canvas: number;
  style: IconStyle;
  /** Tokens of the optical size the icon was composed with. */
  tokens: SizeTokens;
  shapes: ComposedShape[];
  /** Number of leaf (primitive or path) elements in the spec. */
  elementCount: number;
}

export interface ComposeOptions {
  registry?: PrimitiveRegistry;
}

export class ComposeError extends Error {
  constructor(
    message: string,
    public readonly source: string,
  ) {
    super(`${source}: ${message}`);
    this.name = "ComposeError";
  }
}

interface Inherited {
  style: IconStyle;
  stroke: ResolvedStroke;
  color: string;
}

function mergeStroke(base: ResolvedStroke, override: StrokeOverride | undefined): ResolvedStroke {
  if (!override) return base;
  return {
    width: override.width ?? base.width,
    cap: override.cap ?? base.cap,
    join: override.join ?? base.join,
  };
}

function alignOffset(free: number, align: Alignment | undefined): number {
  switch (align ?? "center") {
    case "start":
      return 0;
    case "center":
      return free / 2;
    case "end":
      return free;
  }
}

/** Uniform scale that fits a natural box into a target box, tolerating
 * zero-sized natural axes (pure lines). */
function fitScale(natural: { width: number; height: number }, target: { width: number; height: number }): number {
  const sx = natural.width > 0 ? target.width / natural.width : Infinity;
  const sy = natural.height > 0 ? target.height / natural.height : Infinity;
  const s = Math.min(sx, sy);
  if (!Number.isFinite(s) || s <= 0) return 1;
  return s;
}

/**
 * Build the matrix that places geometry authored in `natural` space into an
 * element box, applying alignment, rotation, flips and the optical offset.
 */
export function placementMatrix(
  el: IconElement,
  natural: { width: number; height: number },
): Matrix {
  const box = elementBox(el);
  const s = fitScale(natural, box);
  const placedW = natural.width * s;
  const placedH = natural.height * s;
  const ox = alignOffset(box.width - placedW, el.align?.x);
  const oy = alignOffset(box.height - placedH, el.align?.y);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const [dx, dy] = el.opticalOffset ?? [0, 0];

  return chain(
    scale(s),
    translate(box.x + ox, box.y + oy),
    translate(-cx, -cy),
    scale(el.flipX ? -1 : 1, el.flipY ? -1 : 1),
    rotate(el.rotate ?? 0),
    translate(cx, cy),
    translate(dx, dy),
  );
}

/** Parse a path element's data into shapes and its natural box. */
export function pathElementGeometry(el: PathElement, source: string): { shapes: Shape[]; box: { width: number; height: number } } {
  const list = Array.isArray(el.path) ? el.path : [el.path];
  const shapes = list.map((d, i) => {
    try {
      return pathShapeFromData(d, el.fillable);
    } catch (error) {
      if (error instanceof PathDataError) throw new ComposeError(error.message, `${source}.path[${i}]`);
      throw error;
    }
  });
  if (el.natural) return { shapes, box: el.natural };
  const b = unionBounds(shapes.map(shapeBounds));
  if (b.minX < -1e-6 || b.minY < -1e-6) {
    throw new ComposeError("path geometry must start at or after 0,0 unless `natural` is given", `${source}.path`);
  }
  return { shapes, box: { width: b.maxX, height: b.maxY } };
}

function composeElement(
  el: IconElement,
  source: string,
  inherited: Inherited,
  tokens: SizeTokens,
  registry: PrimitiveRegistry,
  out: ComposedShape[],
  virtualCanvas: number,
): number {
  const style = el.style ?? inherited.style;
  const stroke = mergeStroke(inherited.stroke, el.stroke);
  const color = el.color ?? inherited.color;
  const next: Inherited = { style, stroke, color };

  if (el.children) {
    const groupCanvas = el.canvas ?? virtualCanvas;
    const local: ComposedShape[] = [];
    let count = 0;
    el.children.forEach((child, i) => {
      count += composeElement(child, `${source}.children[${i}]`, next, tokens, registry, local, groupCanvas);
    });
    const m = placementMatrix(el, { width: groupCanvas, height: groupCanvas });
    for (const item of local) out.push({ ...item, shape: transformShape(item.shape, m) });
    return count;
  }

  if (el.path !== undefined) {
    const { shapes, box: natural } = pathElementGeometry(el, source);
    const m = placementMatrix(el, natural);
    for (const shape of shapes) {
      out.push({ shape: transformShape(shape, m), style, stroke, color, primitive: "path", source });
    }
    return 1;
  }

  if (!registry.has(el.primitive)) {
    throw new ComposeError(`unknown primitive "${el.primitive}"`, source);
  }
  const primitive = registry.get(el.primitive);
  const box = elementBox(el);
  const s = fitScale(primitive.box, box);
  const shapes = primitive.build({
    style,
    strokeWidth: stroke.width,
    cornerRadius: tokens.cornerRadius,
    scale: s,
  });
  const m = placementMatrix(el, primitive.box);
  for (const shape of shapes) {
    out.push({ shape: transformShape(shape, m), style, stroke, color, primitive: primitive.name, source });
  }
  return 1;
}

/**
 * Deterministically turn an IconSpec into canvas-space geometry using the
 * tokens of an Icon Language. Same spec + same language ⇒ same output.
 */
export function compose(spec: IconSpec, language: IconLanguage, options: ComposeOptions = {}): ComposedIcon {
  const registry = options.registry ?? defaultRegistry;
  const style = spec.style ?? language.style.default;
  // A spec on an unknown canvas still composes (with the nearest size's
  // tokens) so the validator can show it alongside the canvas error.
  const tokens = hasSize(language, spec.canvas) ? resolveTokens(language, spec.canvas) : nearestTokens(language, spec.canvas);
  const inherited: Inherited = {
    style,
    stroke: mergeStroke(tokens.stroke, spec.stroke),
    color: language.colors.allowed[0] ?? "currentColor",
  };

  const shapes: ComposedShape[] = [];
  let elementCount = 0;
  spec.elements.forEach((el, i) => {
    elementCount += composeElement(el, `elements[${i}]`, inherited, tokens, registry, shapes, spec.canvas);
  });

  return {
    name: spec.name,
    language: language.id,
    canvas: spec.canvas,
    style,
    tokens,
    shapes,
    elementCount,
  };
}

/** Index of the top-level element a composed shape came from. */
export function topLevelIndex(source: string): number {
  const m = /^elements\[(\d+)\]/.exec(source);
  return m ? Number(m[1]) : -1;
}

/** Centreline bounds of the whole composed icon. */
export function composedBounds(icon: ComposedIcon): Bounds {
  return unionBounds(icon.shapes.map((s) => shapeBounds(s.shape)));
}
