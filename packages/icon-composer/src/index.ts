import {
  constructionFor,
  hasSize,
  nearestTokens,
  resolveTokens,
  type Box,
  type Construction,
  type IconLanguage,
  type IconStyle,
  type SizeTokens,
  type OpticalShape,
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
import { resolveSpec } from "./layout.js";
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
  /** The source primitive opted out of the language's construction angles. */
  freeAngles: boolean;
  /**
   * Which of the four keyline boxes this shape's part is sized against.
   *
   * Absent for freeform path geometry, which has no primitive and therefore no
   * optical shape — it was drawn at a size rather than fitted to one.
   */
  opticalShape?: OpticalShape;
  /** The box the element was actually fitted into. */
  box?: Box;
  /** JSON-pointer-like path to the source element, e.g. `elements[1].children[0]`. */
  source: string;
}

/**
 * A keyline this icon was actually built against.
 *
 * Reported rather than inferred. The composer has always chosen one — `keyline()`
 * in `layout.ts` is `tokens.optical[primitive.opticalShape]` — and then thrown
 * the choice away, which left every overlay downstream with no way to know
 * which of the four boxes applied. Drawing all four was what "I don't know"
 * looked like, and it is why a circle keyline appeared behind square icons.
 */
export interface ComposedKeyline {
  shape: OpticalShape;
  /** The box the part went into, which for a lone subject is the keyline box
   *  and for a badge is the smaller box the layout gave it. */
  box: Box;
  primitive: string;
}

export interface ComposedIcon {
  name: string;
  language: string;
  canvas: number;
  style: IconStyle;
  /** Tokens of the optical size the icon was composed with. */
  tokens: SizeTokens;
  /** How this language builds a part. Carried so the renderer can compensate. */
  construction: Construction;
  shapes: ComposedShape[];
  /**
   * The keylines in play, in the order their parts were composed.
   *
   * One entry per distinct box, so a lone part yields exactly one and a
   * subject-with-badge yields two. Empty for an icon made only of freeform
   * geometry, which is the honest answer: it was never sized against a keyline.
   */
  keylines: ComposedKeyline[];
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
  construction: Construction,
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
      count += composeElement(child, `${source}.children[${i}]`, next, tokens, construction, registry, local, groupCanvas);
    });
    const m = placementMatrix(el, { width: groupCanvas, height: groupCanvas });
    for (const item of local) out.push({ ...item, shape: transformShape(item.shape, m) });
    return count;
  }

  if (el.path !== undefined) {
    const { shapes, box: natural } = pathElementGeometry(el, source);
    const m = placementMatrix(el, natural);
    for (const shape of shapes) {
      out.push({ shape: transformShape(shape, m), style, stroke, color, primitive: "path", freeAngles: false, source });
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
    grid: tokens.grid,
    // Each part sees the language, then its own exception if it has one. The
    // substitution happens here so no primitive has to know exceptions exist.
    construction: constructionFor(construction, primitive.name),
  });
  const m = placementMatrix(el, primitive.box);
  for (const shape of shapes) {
    out.push({
      shape: transformShape(shape, m),
      style,
      stroke,
      color,
      primitive: primitive.name,
      freeAngles: primitive.freeAngles === true,
      opticalShape: primitive.opticalShape,
      box,
      source,
    });
  }
  return 1;
}

/** The distinct keylines a set of composed shapes went into. */
function keylinesOf(shapes: readonly ComposedShape[]): ComposedKeyline[] {
  const out: ComposedKeyline[] = [];
  for (const item of shapes) {
    if (!item.opticalShape || !item.box) continue;
    const { x, y, width, height } = item.box;
    if (out.some((k) => k.box.x === x && k.box.y === y && k.box.width === width && k.box.height === height)) continue;
    out.push({ shape: item.opticalShape, box: { x, y, width, height }, primitive: item.primitive });
  }
  return out;
}

/**
 * Deterministically turn an IconSpec into canvas-space geometry using the
 * tokens of an Icon Language. Same spec + same language ⇒ same output.
 */
export function compose(spec: IconSpec, language: IconLanguage, options: ComposeOptions = {}): ComposedIcon {
  const registry = options.registry ?? defaultRegistry;
  // Geometry first, and against *this* language. A spec that derives from a
  // composition has no boxes of its own until this line runs, which is what
  // makes a keyline edit reach it. See resolveSpec.
  const resolved = resolveSpec(spec, language, { registry });
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
  resolved.elements.forEach((el, i) => {
    elementCount += composeElement(el, `elements[${i}]`, inherited, tokens, language.construction, registry, shapes, spec.canvas);
  });

  return {
    name: spec.name,
    language: language.id,
    canvas: spec.canvas,
    style,
    tokens,
    construction: language.construction,
    shapes,
    keylines: keylinesOf(shapes),
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

/**
 * Bounds of the *ink*: every centreline grown by half the stroke painting it.
 *
 * The distinction the three rings turn on. A part drawn correctly to its
 * keyline has a centreline that reaches the live edge and ink that overhangs it
 * by half a stroke, so a rule measured on centrelines and a rule measured on
 * ink are asking genuinely different questions — and the one that asks whether
 * anything falls off the canvas has to ask this one.
 *
 * A filled shape is painted rather than stroked, so it grows by nothing.
 */
export function inkBounds(icon: ComposedIcon): Bounds {
  return unionBounds(
    icon.shapes.map((item) => {
      const b = shapeBounds(item.shape);
      const half = item.style === "filled" && item.shape.fillable ? 0 : item.stroke.width / 2;
      return { minX: b.minX - half, minY: b.minY - half, maxX: b.maxX + half, maxY: b.maxY + half };
    }),
  );
}

export {
  applyOptics,
  opticsEnabled,
  type OpticalCorrection,
  type OpticalPass,
  type OpticallyCorrected,
} from "./optics.js";

export {
  ConceptError,
  composeConcept,
  deriveElements,
  resolveSpec,
  pruneParts,
  type ResolvedSpec,
  type ComposeConceptOptions,
  type DerivedLayout,
  type PrunedComposition,
} from "./layout.js";

export * from "./offify.js";
