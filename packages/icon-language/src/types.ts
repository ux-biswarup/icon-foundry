export type IconStyle = "outline" | "filled";
export type StrokeCap = "butt" | "round" | "square";
export type StrokeJoin = "miter" | "round" | "bevel";
export type DetailLevel = "low" | "medium" | "high";

/**
 * Optical shapes: the four underlying keyline systems that make icons of
 * different proportions read as the same size. Every primitive declares one;
 * layout recipes fit a subject into the matching box.
 */
export type OpticalShape = "square" | "circle" | "horizontal" | "vertical";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type OpticalBoxes = Record<OpticalShape, Box>;

export interface StrokeTokens {
  width: number;
  cap: StrokeCap;
  join: StrokeJoin;
}

export interface DetailLimits {
  maxElements: number;
  maxShapes: number;
}

/**
 * Tokens for one optical size. Like optical sizes in type: a 16px icon and a
 * 24px icon of the same language share character but differ in stroke,
 * safe area, and how much detail they can carry.
 */
export interface SizeTokens {
  /** Canvas size in units; also the identity of the optical size. */
  canvas: number;
  /** Layout grid step for element boxes. Not a pixel-snapping rule. */
  grid: number;
  /** Padding from the canvas edge that geometry centrelines should not enter. */
  safeArea: number;
  stroke: StrokeTokens;
  cornerRadius: number;
  limits: DetailLimits;
  /** Minimum visible gap between shapes of different elements, in units.
   * Zero disables the rule. */
  minNegativeSpace: number;
  optical: OpticalBoxes;
}

/**
 * An Icon Language is the versioned set of design rules that make a team's
 * icons recognisably belong together. It is the source of truth: renderers
 * read tokens from it and the validator enforces it.
 *
 * The flat token fields (`canvas`, `stroke`, …) are the tokens of the default
 * optical size, kept for convenience. Use `resolveTokens(language, canvas)`
 * whenever a spec's canvas is known.
 */
export interface IconLanguage extends SizeTokens {
  id: string;
  name: string;
  version: string;
  description?: string;
  style: {
    default: IconStyle;
    allowed: IconStyle[];
  };
  colors: {
    allowed: string[];
  };
  detail: DetailLevel;
  /** Canvas of the default optical size. */
  defaultCanvas: number;
  /** All optical sizes keyed by canvas, including the default. */
  sizes: Record<number, SizeTokens>;
}

/** Partial tokens for an additional optical size; unspecified fields inherit
 * from the default size, except `optical`, which is derived for the size. */
export interface SizeInput {
  canvas: number;
  grid?: number;
  safeArea?: number;
  stroke?: Partial<StrokeTokens>;
  cornerRadius?: number;
  limits?: Partial<DetailLimits>;
  minNegativeSpace?: number;
  optical?: Partial<OpticalBoxes>;
}

/** The raw JSON shape accepted by `parseIconLanguage`. Top-level tokens
 * describe the default optical size; `sizes` adds more. */
export interface IconLanguageInput {
  $schema?: string;
  id: string;
  name: string;
  version: string;
  description?: string;
  canvas: number;
  grid: number;
  safeArea: number;
  stroke: { width: number; cap: StrokeCap; join: StrokeJoin };
  cornerRadius: number;
  style: { default: IconStyle; allowed?: IconStyle[] };
  colors?: { allowed?: string[] };
  detail?: DetailLevel;
  limits?: Partial<DetailLimits>;
  minNegativeSpace?: number;
  optical?: Partial<OpticalBoxes>;
  sizes?: SizeInput[];
}
