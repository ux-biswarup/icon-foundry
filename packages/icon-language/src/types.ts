export type IconStyle = "outline" | "filled";
export type StrokeCap = "butt" | "round" | "square";
export type StrokeJoin = "miter" | "round" | "bevel";
export type DetailLevel = "low" | "medium" | "high";

/**
 * An Icon Language is the versioned set of design rules that make a team's
 * icons recognisably belong together. It is the source of truth: renderers
 * read tokens from it and the validator enforces it.
 */
export interface IconLanguage {
  id: string;
  name: string;
  version: string;
  description?: string;
  /** Canvas size in units (24 means a 24 × 24 viewBox). */
  canvas: number;
  /** Grid step. Element boxes are expected to sit on this grid. */
  grid: number;
  /** Padding from the canvas edge that geometry should not enter. */
  safeArea: number;
  stroke: {
    width: number;
    cap: StrokeCap;
    join: StrokeJoin;
  };
  cornerRadius: number;
  style: {
    default: IconStyle;
    allowed: IconStyle[];
  };
  colors: {
    allowed: string[];
  };
  detail: DetailLevel;
  limits: {
    maxElements: number;
    maxShapes: number;
  };
  /** Reserved: minimum gap between strokes. Not yet enforced by the validator. */
  minNegativeSpace: number;
}

/** The raw JSON shape accepted by `parseIconLanguage`. Optional fields get
 * defaults so language files can stay short. */
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
  limits?: { maxElements?: number; maxShapes?: number };
  minNegativeSpace?: number;
}
