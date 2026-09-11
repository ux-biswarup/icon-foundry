import type {
  DetailLevel,
  IconLanguage,
  IconLanguageInput,
  IconStyle,
  StrokeCap,
  StrokeJoin,
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

/** Default shape budgets per detail level, used when `limits` is omitted. */
export const DETAIL_LIMITS: Record<DetailLevel, { maxElements: number; maxShapes: number }> = {
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
 * Parse a language JSON document into a fully-defaulted IconLanguage.
 */
export function parseIconLanguage(value: unknown): IconLanguage {
  if (!isRecord(value)) fail("language", "expected an object");
  const input = value as Partial<IconLanguageInput> & Record<string, unknown>;

  const id = str(input.id, "language.id");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) fail("language.id", "expected a kebab-case identifier");

  if (!isRecord(input.stroke)) fail("language.stroke", "expected an object");
  if (!isRecord(input.style)) fail("language.style", "expected an object");

  const defaultStyle = oneOf(input.style.default, STYLES, "language.style.default");
  const allowedStyles = input.style.allowed === undefined
    ? [defaultStyle]
    : (input.style.allowed as unknown[]).map((s, i) => oneOf(s, STYLES, `language.style.allowed[${i}]`));
  if (!allowedStyles.includes(defaultStyle)) {
    fail("language.style.allowed", "must include the default style");
  }

  const detail = input.detail === undefined ? "low" : oneOf(input.detail, DETAIL, "language.detail");
  const limitsIn = isRecord(input.limits) ? input.limits : {};

  const colorsIn = isRecord(input.colors) ? input.colors : {};
  const allowedColors = colorsIn.allowed === undefined
    ? ["currentColor"]
    : (colorsIn.allowed as unknown[]).map((c, i) => str(c, `language.colors.allowed[${i}]`));

  return {
    id,
    name: str(input.name, "language.name"),
    version: str(input.version, "language.version"),
    ...(input.description !== undefined && { description: str(input.description, "language.description") }),
    canvas: num(input.canvas, "language.canvas", { exclusiveMin: 0 }),
    grid: num(input.grid, "language.grid", { exclusiveMin: 0 }),
    safeArea: num(input.safeArea, "language.safeArea", { min: 0 }),
    stroke: {
      width: num(input.stroke.width, "language.stroke.width", { exclusiveMin: 0 }),
      cap: oneOf(input.stroke.cap, CAPS, "language.stroke.cap"),
      join: oneOf(input.stroke.join, JOINS, "language.stroke.join"),
    },
    cornerRadius: num(input.cornerRadius, "language.cornerRadius", { min: 0 }),
    style: { default: defaultStyle, allowed: allowedStyles },
    colors: { allowed: allowedColors },
    detail,
    limits: {
      maxElements:
        limitsIn.maxElements === undefined
          ? DETAIL_LIMITS[detail].maxElements
          : num(limitsIn.maxElements, "language.limits.maxElements", { min: 1 }),
      maxShapes:
        limitsIn.maxShapes === undefined
          ? DETAIL_LIMITS[detail].maxShapes
          : num(limitsIn.maxShapes, "language.limits.maxShapes", { min: 1 }),
    },
    minNegativeSpace:
      input.minNegativeSpace === undefined
        ? 0
        : num(input.minNegativeSpace, "language.minNegativeSpace", { min: 0 }),
  };
}

/** Identity helper for authoring languages in TypeScript with type checking. */
export function defineIconLanguage(input: IconLanguageInput): IconLanguage {
  return parseIconLanguage(input);
}
