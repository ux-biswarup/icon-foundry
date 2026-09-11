import type {
  Box,
  DetailLevel,
  DetailLimits,
  IconLanguage,
  IconLanguageInput,
  IconStyle,
  OpticalBoxes,
  OpticalShape,
  SizeTokens,
  StrokeCap,
  StrokeJoin,
  StrokeTokens,
} from "./types.js";

export class IconLanguageError extends Error {
  constructor(
    message: string,
    public readonly path: string,
  ) {
    super(`${path}: ${message}`);
    this.name = "IconLanguageError";
  }
}

const STYLES: readonly IconStyle[] = ["outline", "filled"];
const CAPS: readonly StrokeCap[] = ["butt", "round", "square"];
const JOINS: readonly StrokeJoin[] = ["miter", "round", "bevel"];
const DETAIL: readonly DetailLevel[] = ["low", "medium", "high"];
export const OPTICAL_SHAPES: readonly OpticalShape[] = ["square", "circle", "horizontal", "vertical"];

/** Default shape budgets per detail level, used when `limits` is omitted. */
export const DETAIL_LIMITS: Record<DetailLevel, DetailLimits> = {
  low: { maxElements: 4, maxShapes: 12 },
  medium: { maxElements: 6, maxShapes: 20 },
  high: { maxElements: 10, maxShapes: 40 },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(path: string, message: string): never {
  throw new IconLanguageError(message, path);
}

function num(value: unknown, path: string, opts: { min?: number; exclusiveMin?: number } = {}): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(path, "expected a finite number");
  if (opts.min !== undefined && value < opts.min) fail(path, `must be >= ${opts.min}`);
  if (opts.exclusiveMin !== undefined && value <= opts.exclusiveMin) fail(path, `must be > ${opts.exclusiveMin}`);
  return value;
}

function str(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) fail(path, "expected a non-empty string");
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    fail(path, `expected one of ${allowed.join(", ")}`);
  }
  return value as T;
}

/**
 * Default keyline boxes for a canvas, following the Material/SF convention:
 * a circle fills the content area, a square is inset so it reads the same
 * size, and rectangles trade height for width.
 *
 *   content c = canvas − 2·safeArea
 *   square   (c−2)×(c−2)   circle c×c   horizontal c×(c−4)   vertical (c−4)×c
 */
export function defaultOpticalBoxes(canvas: number, safeArea: number): OpticalBoxes {
  const c = canvas - 2 * safeArea;
  const centred = (w: number, h: number): Box => ({
    x: (canvas - w) / 2,
    y: (canvas - h) / 2,
    width: w,
    height: h,
  });
  const inset = Math.min(2, c / 4);
  const trim = Math.min(4, c / 2);
  return {
    square: centred(c - inset, c - inset),
    circle: centred(c, c),
    horizontal: centred(c, c - trim),
    vertical: centred(c - trim, c),
  };
}

function parseBox(value: unknown, path: string, canvas: number): Box {
  if (!isRecord(value)) fail(path, "expected an object");
  const box: Box = {
    x: num(value.x, `${path}.x`, { min: 0 }),
    y: num(value.y, `${path}.y`, { min: 0 }),
    width: num(value.width, `${path}.width`, { exclusiveMin: 0 }),
    height: num(value.height, `${path}.height`, { exclusiveMin: 0 }),
  };
  if (box.x + box.width > canvas || box.y + box.height > canvas) {
    fail(path, `box must fit inside the ${canvas} canvas`);
  }
  return box;
}

function parseOptical(value: unknown, path: string, canvas: number, safeArea: number): OpticalBoxes {
  const defaults = defaultOpticalBoxes(canvas, safeArea);
  if (value === undefined) return defaults;
  if (!isRecord(value)) fail(path, "expected an object");
  const out: OpticalBoxes = { ...defaults };
  for (const shape of OPTICAL_SHAPES) {
    if (value[shape] !== undefined) out[shape] = parseBox(value[shape], `${path}.${shape}`, canvas);
  }
  return out;
}

function parseStroke(value: unknown, path: string, base?: StrokeTokens): StrokeTokens {
  if (!isRecord(value)) fail(path, "expected an object");
  const width = value.width === undefined && base ? base.width : num(value.width, `${path}.width`, { exclusiveMin: 0 });
  const cap = value.cap === undefined && base ? base.cap : oneOf(value.cap, CAPS, `${path}.cap`);
  const join = value.join === undefined && base ? base.join : oneOf(value.join, JOINS, `${path}.join`);
  return { width, cap, join };
}

function parseLimits(value: unknown, path: string, base: DetailLimits): DetailLimits {
  if (value === undefined) return base;
  if (!isRecord(value)) fail(path, "expected an object");
  return {
    maxElements:
      value.maxElements === undefined ? base.maxElements : num(value.maxElements, `${path}.maxElements`, { min: 1 }),
    maxShapes: value.maxShapes === undefined ? base.maxShapes : num(value.maxShapes, `${path}.maxShapes`, { min: 1 }),
  };
}

function parseSize(value: Record<string, unknown>, path: string, base: SizeTokens): SizeTokens {
  const canvas = num(value.canvas, `${path}.canvas`, { exclusiveMin: 0 });
  const safeArea = value.safeArea === undefined ? base.safeArea : num(value.safeArea, `${path}.safeArea`, { min: 0 });
  if (safeArea * 2 >= canvas) fail(`${path}.safeArea`, "safe area leaves no room on the canvas");
  return {
    canvas,
    grid: value.grid === undefined ? base.grid : num(value.grid, `${path}.grid`, { exclusiveMin: 0 }),
    safeArea,
    stroke: value.stroke === undefined ? base.stroke : parseStroke(value.stroke, `${path}.stroke`, base.stroke),
    cornerRadius:
      value.cornerRadius === undefined ? base.cornerRadius : num(value.cornerRadius, `${path}.cornerRadius`, { min: 0 }),
    limits: parseLimits(value.limits, `${path}.limits`, base.limits),
    minNegativeSpace:
      value.minNegativeSpace === undefined
        ? base.minNegativeSpace
        : num(value.minNegativeSpace, `${path}.minNegativeSpace`, { min: 0 }),
    optical: parseOptical(value.optical, `${path}.optical`, canvas, safeArea),
  };
}

/**
 * Parse a language JSON document into a fully-defaulted IconLanguage.
 */
export function parseIconLanguage(value: unknown): IconLanguage {
  if (!isRecord(value)) fail("language", "expected an object");
  const input = value as Partial<IconLanguageInput> & Record<string, unknown>;

  const id = str(input.id, "language.id");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) fail("language.id", "expected a kebab-case identifier");

  if (!isRecord(input.style)) fail("language.style", "expected an object");
  const defaultStyle = oneOf(input.style.default, STYLES, "language.style.default");
  const allowedStyles =
    input.style.allowed === undefined
      ? [defaultStyle]
      : (input.style.allowed as unknown[]).map((s, i) => oneOf(s, STYLES, `language.style.allowed[${i}]`));
  if (!allowedStyles.includes(defaultStyle)) fail("language.style.allowed", "must include the default style");

  const detail = input.detail === undefined ? "low" : oneOf(input.detail, DETAIL, "language.detail");

  const colorsIn = isRecord(input.colors) ? input.colors : {};
  const allowedColors =
    colorsIn.allowed === undefined
      ? ["currentColor"]
      : (colorsIn.allowed as unknown[]).map((c, i) => str(c, `language.colors.allowed[${i}]`));

  // Default optical size from the top-level tokens.
  const canvas = num(input.canvas, "language.canvas", { exclusiveMin: 0 });
  const safeArea = num(input.safeArea, "language.safeArea", { min: 0 });
  if (safeArea * 2 >= canvas) fail("language.safeArea", "safe area leaves no room on the canvas");
  const defaultSize: SizeTokens = {
    canvas,
    grid: num(input.grid, "language.grid", { exclusiveMin: 0 }),
    safeArea,
    stroke: parseStroke(input.stroke, "language.stroke"),
    cornerRadius: num(input.cornerRadius, "language.cornerRadius", { min: 0 }),
    limits: parseLimits(input.limits, "language.limits", DETAIL_LIMITS[detail]),
    minNegativeSpace:
      input.minNegativeSpace === undefined ? 0 : num(input.minNegativeSpace, "language.minNegativeSpace", { min: 0 }),
    optical: parseOptical(input.optical, "language.optical", canvas, safeArea),
  };

  const sizes: Record<number, SizeTokens> = { [canvas]: defaultSize };
  if (input.sizes !== undefined) {
    if (!Array.isArray(input.sizes)) fail("language.sizes", "expected an array");
    input.sizes.forEach((raw, i) => {
      const path = `language.sizes[${i}]`;
      if (!isRecord(raw)) fail(path, "expected an object");
      const size = parseSize(raw, path, defaultSize);
      if (sizes[size.canvas]) fail(`${path}.canvas`, `optical size ${size.canvas} is defined twice`);
      sizes[size.canvas] = size;
    });
  }

  return {
    ...defaultSize,
    id,
    name: str(input.name, "language.name"),
    version: str(input.version, "language.version"),
    ...(input.description !== undefined && { description: str(input.description, "language.description") }),
    style: { default: defaultStyle, allowed: allowedStyles },
    colors: { allowed: allowedColors },
    detail,
    defaultCanvas: canvas,
    sizes,
  };
}

/** Identity helper for authoring languages in TypeScript with type checking. */
export function defineIconLanguage(input: IconLanguageInput): IconLanguage {
  return parseIconLanguage(input);
}

/** Tokens for the optical size identified by `canvas`. Throws for unknown sizes. */
export function resolveTokens(language: IconLanguage, canvas?: number): SizeTokens {
  const key = canvas ?? language.defaultCanvas;
  const tokens = language.sizes[key];
  if (!tokens) {
    throw new IconLanguageError(
      `no optical size with canvas ${key} (available: ${Object.keys(language.sizes).join(", ")})`,
      "language.sizes",
    );
  }
  return tokens;
}

/** True when the language defines an optical size for this canvas. */
export function hasSize(language: IconLanguage, canvas: number): boolean {
  return language.sizes[canvas] !== undefined;
}

/** Tokens for the size nearest to `canvas`, for graceful degradation. */
export function nearestTokens(language: IconLanguage, canvas: number): SizeTokens {
  const keys = Object.keys(language.sizes).map(Number);
  let best = keys[0] ?? language.defaultCanvas;
  for (const k of keys) if (Math.abs(k - canvas) < Math.abs(best - canvas)) best = k;
  return resolveTokens(language, best);
}
