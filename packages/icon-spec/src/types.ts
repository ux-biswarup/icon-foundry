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
  children?: never;
}

/** A group of elements laid out in a virtual canvas and then scaled into the
 * group's box as one unit. */
export interface GroupElement extends ElementBase {
  primitive?: never;
  children: IconElement[];
  /** Size of the virtual canvas the children are laid out in. Defaults to the
   * spec canvas. */
  canvas?: number;
}

export type IconElement = PrimitiveElement | GroupElement;

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
  elements: IconElement[];
}
