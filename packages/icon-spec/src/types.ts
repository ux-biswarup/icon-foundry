/**
 * IconSpec is the canonical intermediate representation of an icon.
 *
 * intent ≠ IconSpec ≠ SVG ≠ Figma node
 *
 * Everything downstream (SVG, Figma vectors, future code targets) is a render
 * target derived from an IconSpec plus an Icon Language.
 */

export type IconStyle = "outline" | "filled";

export type StrokeCap = "butt" | "round" | "square";
export type StrokeJoin = "miter" | "round" | "bevel";

export type Alignment = "start" | "center" | "end";

/** Optional per-element or per-spec stroke overrides. The validator flags
 * anything that diverges from the active Icon Language. */
export interface StrokeOverride {
  width?: number;
  cap?: StrokeCap;
  join?: StrokeJoin;
}

interface ElementBase {
  /** Left edge of the element box, in canvas units. */
  x: number;
  /** Top edge of the element box, in canvas units. */
  y: number;
  /** Box width. Use `size` for square boxes. */
  width?: number;
  /** Box height. Use `size` for square boxes. */
  height?: number;
  /** Shorthand for width = height = size. */
  size?: number;
  /** Rotation in degrees around the box centre. */
  rotate?: number;
  flipX?: boolean;
  flipY?: boolean;
  /** How the primitive's natural box is aligned inside the element box when
   * aspect ratios differ. Defaults to center/center. */
  align?: { x?: Alignment; y?: Alignment };
  /** Optical-centering hook: a final translation applied after layout. */
  opticalOffset?: [number, number];
  /** Overrides the inherited style for this element (and its children). */
  style?: IconStyle;
  stroke?: StrokeOverride;
  /** Colour token. Languages usually allow only `currentColor`. */
  color?: string;
}

/** A single primitive placed on the canvas. */
export interface PrimitiveElement extends ElementBase {
  primitive: string;
  path?: never;
  children?: never;
}

/**
 * Freeform geometry: one or more SVG path data strings authored in a natural
 * box, fitted into the element box exactly like a primitive. This is how
 * subjects with no primitive are drawn, by a designer or by the agent, while
 * the language still owns stroke, style, and validation.
 */
export interface PathElement extends ElementBase {
  primitive?: never;
  children?: never;
  /** SVG path data (M, L, H, V, C, A, Z; absolute or relative). */
  path: string | string[];
  /** Natural box of the path data. Derived from geometry bounds if omitted. */
  natural?: { width: number; height: number };
  /** Force fillable on or off; defaults to "closed paths are fillable". */
  fillable?: boolean;
}

/** A group of elements laid out in a virtual canvas and then scaled into the
 * group's box as one unit. */
export interface GroupElement extends ElementBase {
  primitive?: never;
  path?: never;
  children: IconElement[];
  /** Size of the virtual canvas the children are laid out in. Defaults to the
   * spec canvas. */
  canvas?: number;
}

export type IconElement = PrimitiveElement | PathElement | GroupElement;

export interface IconSpec {
  /** kebab-case identifier, e.g. "temperature-warehouse". */
  name: string;
  /** Identifier of the Icon Language this spec is authored against. */
  language: string;
  /** Style for the whole icon. Falls back to the language default. */
  style?: IconStyle;
  /** Canvas size in units. Must match the language canvas to be valid. */
  canvas: number;
  stroke?: StrokeOverride;
  /** Free-form metadata: tags, description, source intent. Never rendered. */
  meta?: Record<string, unknown>;
  /**
   * What the icon is made of and how its parts relate.
   *
   * This is what an icon *is*. Where the parts sit is not stored, because the
   * language already says: the keyline boxes give every part its size, the
   * grammar says what a badge or a stack looks like here, and the tokens say
   * how much fits. Deriving it on every render is what makes a change to the
   * sheet reach an icon drawn months ago — and what will make the next keyline
   * property reach it too, without anyone migrating anything.
   */
  composition?: ConceptComposition;
  /**
   * Explicit geometry, for an icon that is not derived at all.
   *
   * Optional on purpose. A spec carries `composition` or `elements`, and the
   * common case is `composition`. Anything reading this field directly is
   * reading geometry that may not be there yet: resolve the spec against its
   * language first. See `resolveSpec` in the composer.
   */
  elements?: IconElement[];
}

/* ------------------------------------------------------------------ */
/* Concepts: what a thing is made of, above where the parts go          */
/* ------------------------------------------------------------------ */

/**
 * How the parts of a concept relate. The concept says *stack*; the language's
 * grammar says what a stack looks like in this set, and the tokens say how big
 * and how heavy. That split is what lets one concept render in two languages.
 */
export type Arrangement = "single" | "badge" | "stack" | "row" | "contain";

export const ARRANGEMENTS: readonly Arrangement[] = ["single", "badge", "stack", "row", "contain"];

/**
 * Priority is how a philosophy prunes. An optional part is dropped when the
 * detail budget for an optical size cannot afford it, so "reduce concepts to
 * essential recognizable geometry" becomes arithmetic instead of a sentence.
 */
export type PartPriority = "essential" | "optional";

export interface ConceptPart {
  /** Element or primitive name. */
  element: string;
  /** What this part is for, e.g. "unit", "indicator". Documentation, not logic. */
  role?: string;
  /** How many of it. Defaults to 1. */
  count?: number;
  priority: PartPriority;
  /** Drawn against the language on purpose. See {@link PartException}. */
  except?: PartException;
}

/**
 * A part positioned by hand instead of by the language.
 *
 * This is the only way an icon's geometry can disagree with its keyline sheet,
 * and it is deliberately not free. `why` is required, because an exception
 * without a reason is indistinguishable from drift — and drift is the thing
 * this whole arrangement exists to make impossible to create by accident.
 *
 * The same contract the construction traits already use: an exception is
 * allowed, it is never silent, it shows beside the rule it breaks, and the
 * audit counts it.
 */
export interface PartException {
  /** The box this part is pinned to, in canvas units. */
  box: { x: number; y: number; width: number; height: number };
  /** What you saw that the language's box got wrong. */
  why: string;
  /** Alignment inside the pinned box, when it differs from the derived one. */
  align?: { x?: Alignment; y?: Alignment };
}

/**
 * What a thing is made of, independent of any visual language. "A server is a
 * stack of rectangular units with optional indicator dots" is true whether the
 * set is technical or playful.
 */
export interface ConceptComposition {
  arrangement: Arrangement;
  parts: ConceptPart[];
}
