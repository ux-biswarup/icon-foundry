import { DEFAULT_DERIVATION, DERIVABLE, TOKEN_UNITS, deriveTokens, scaleDerived, type DerivedTokens } from "./derive.js";
import { ARRANGEMENTS } from "@icon-foundry/icon-spec";
import { CONSTRUCTION_TRAITS } from "./types.js";
import type {
  AxisEndpoints,
  AxisName,
  BadgeCorner,
  Box,
  Derivation,
  DetailLevel,
  DetailLimits,
  DiagonalDirection,
  IconCharacter,
  IconGrammar,
  IconLanguage,
  IconLanguageInput,
  IconStyle,
  ApertureStyle,
  Construction,
  ConstructionException,
  OpticalBoxes,
  OpticalShape,
  OpticsTokens,
  Preferences,
  SlopeStyle,
  SizeInput,
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
const DIAGONALS: readonly DiagonalDirection[] = ["up-right", "up-left", "none"];
const CORNERS: readonly BadgeCorner[] = ["top-right", "top-left", "bottom-right", "bottom-left"];

/** A language that states nothing takes the permissive defaults. */
export const DEFAULT_CHARACTER: IconCharacter = {
  axes: { geometric: 50, minimal: 50, technical: 50, literal: 50 },
  metaphors: { use: [], avoid: [] },
  vocabulary: [],
  principles: [],
};

export const DEFAULT_GRAMMAR: IconGrammar = {
  angles: [],
  angleTolerance: 1,
  closedShapes: false,
  diagonal: "none",
  badge: { ratio: 0.35, corner: "top-right" },
  arrangements: { allowed: [...ARRANGEMENTS], spacing: 0 },
  silhouette: false,
};

/**
 * Square interiors and no grade: what every shipped language already draws.
 *
 * Both are the verified default rather than a neutral one. "Interior corners
 * should be square" is stated independently by Google and IBM, and a grade
 * offset nobody asked for would redraw every icon already published the moment
 * they upgraded.
 */
export const DEFAULT_CONSTRUCTION: Construction = {
  interiorRadius: 0,
  grade: 0,
  aperture: "mixed",
  inset: 1,
  accentSize: 1,
  slope: "mixed",
  exceptions: {},
};

const APERTURES: readonly ApertureStyle[] = ["mixed", "line", "outline", "notch"];
const SLOPES: readonly SlopeStyle[] = ["mixed", "shallow", "iso", "45"];

/**
 * No corrections. A pass has to be asked for, because every one of them makes
 * the rendered geometry differ from the geometry the compiler laid out, and a
 * set that never opted in should never see that difference appear.
 */
export const DEFAULT_OPTICS: OpticsTokens = {
  junctionNotch: 0,
  junctionAngle: 45,
  interiorThin: 0,
  dotRatio: 0,
};

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

function num(value: unknown, path: string, opts: { min?: number; max?: number; exclusiveMin?: number } = {}): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(path, "expected a finite number");
  if (opts.min !== undefined && value < opts.min) fail(path, `must be >= ${opts.min}`);
  if (opts.max !== undefined && value > opts.max) fail(path, `must be <= ${opts.max}`);
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

/**
 * Cap and join may be omitted and are then derived from the axes. Width may
 * not: it has no derivation, and it is the single most defining token of a
 * set, so silently handing out a default is worse than refusing the file.
 * Extra optical sizes inherit it from the primary, which is why the
 * requirement is a parameter rather than a rule of the function.
 */
function parseStroke(value: unknown, path: string, base: StrokeTokens, requireWidth = false): StrokeTokens {
  if (!isRecord(value)) fail(path, "expected an object");
  if (requireWidth && value.width === undefined) fail(`${path}.width`, "expected a finite number");
  return {
    width: value.width === undefined ? base.width : num(value.width, `${path}.width`, { exclusiveMin: 0 }),
    cap: value.cap === undefined ? base.cap : oneOf(value.cap, CAPS, `${path}.cap`),
    join: value.join === undefined ? base.join : oneOf(value.join, JOINS, `${path}.join`),
  };
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

const AXES: readonly AxisName[] = ["geometric", "minimal", "technical", "literal"];

/** Endpoint pairs: two numbers, or two of the same enum. */
export function parseDerivation(value: unknown, path = "language.derivation"): Derivation {
  if (value === undefined) return DEFAULT_DERIVATION;
  if (!isRecord(value)) fail(path, "expected an object");
  const out: Derivation = {};
  for (const axis of AXES) {
    const raw = value[axis];
    if (raw === undefined) continue;
    if (!isRecord(raw)) fail(`${path}.${axis}`, "expected an object");
    const endpoints: AxisEndpoints = {};
    for (const token of DERIVABLE) {
      const pair = raw[token];
      if (pair === undefined) continue;
      const at = `${path}.${axis}.${token}`;
      if (!Array.isArray(pair) || pair.length !== 2) fail(at, "expected [low, high]");
      if (TOKEN_UNITS[token] === "enum") {
        const allowed = token === "strokeCap" ? CAPS : JOINS;
        endpoints[token] = [oneOf(pair[0], allowed, `${at}[0]`), oneOf(pair[1], allowed, `${at}[1]`)] as never;
      } else {
        endpoints[token] = [num(pair[0], `${at}[0]`), num(pair[1], `${at}[1]`)] as never;
      }
    }
    out[axis] = endpoints;
  }
  return out;
}

export function parsePreferences(value: unknown, path = "language.preferences"): Preferences {
  if (value === undefined) return {};
  if (!isRecord(value)) fail(path, "expected an object of weights keyed by preference");
  const out: Preferences = {};
  for (const [key, weight] of Object.entries(value)) {
    out[key] = num(weight, `${path}.${key}`, { min: 0 });
  }
  return out;
}

function strList(value: unknown, path: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(path, "expected an array of strings");
  return value.map((v, i) => str(v, `${path}[${i}]`));
}

function axis(value: unknown, path: string, fallback: number): number {
  if (value === undefined) return fallback;
  return num(value, path, { min: 0 }) > 100 ? fail(path, "must be between 0 and 100") : (value as number);
}

export function parseCharacter(value: unknown, path = "language.character"): IconCharacter {
  if (value === undefined) return DEFAULT_CHARACTER;
  if (!isRecord(value)) fail(path, "expected an object");
  const axesIn = isRecord(value.axes) ? value.axes : {};
  const metaphorsIn = isRecord(value.metaphors) ? value.metaphors : {};
  const character: IconCharacter = {
    axes: {
      geometric: axis(axesIn.geometric, `${path}.axes.geometric`, DEFAULT_CHARACTER.axes.geometric),
      minimal: axis(axesIn.minimal, `${path}.axes.minimal`, DEFAULT_CHARACTER.axes.minimal),
      technical: axis(axesIn.technical, `${path}.axes.technical`, DEFAULT_CHARACTER.axes.technical),
      literal: axis(axesIn.literal, `${path}.axes.literal`, DEFAULT_CHARACTER.axes.literal),
    },
    metaphors: {
      use: strList(metaphorsIn.use, `${path}.metaphors.use`),
      avoid: strList(metaphorsIn.avoid, `${path}.metaphors.avoid`),
    },
    vocabulary: strList(value.vocabulary, `${path}.vocabulary`),
    principles: strList(value.principles, `${path}.principles`),
  };
  if (value.purpose !== undefined) character.purpose = str(value.purpose, `${path}.purpose`);
  return character;
}

export function parseGrammar(value: unknown, path = "language.grammar", derivedRatio?: number): IconGrammar {
  const fallbackRatio = derivedRatio ?? DEFAULT_GRAMMAR.badge.ratio;
  if (value === undefined) return { ...DEFAULT_GRAMMAR, badge: { ...DEFAULT_GRAMMAR.badge, ratio: fallbackRatio } };
  if (!isRecord(value)) fail(path, "expected an object");
  const badgeIn = isRecord(value.badge) ? value.badge : {};
  const arrangeIn = isRecord(value.arrangements) ? value.arrangements : {};
  const allowed =
    arrangeIn.allowed === undefined
      ? [...DEFAULT_GRAMMAR.arrangements.allowed]
      : (() => {
          if (!Array.isArray(arrangeIn.allowed)) fail(`${path}.arrangements.allowed`, "expected an array");
          if (arrangeIn.allowed.length === 0) fail(`${path}.arrangements.allowed`, "a set must allow at least one arrangement");
          return arrangeIn.allowed.map((a, i) => oneOf(a, ARRANGEMENTS, `${path}.arrangements.allowed[${i}]`));
        })();
  const spacing =
    arrangeIn.spacing === undefined ? DEFAULT_GRAMMAR.arrangements.spacing : num(arrangeIn.spacing, `${path}.arrangements.spacing`, { min: 0 });
  const angles =
    value.angles === undefined
      ? DEFAULT_GRAMMAR.angles
      : (() => {
          if (!Array.isArray(value.angles)) fail(`${path}.angles`, "expected an array of degrees");
          return value.angles.map((a, i) => {
            const deg = num(a, `${path}.angles[${i}]`, { min: 0 });
            if (deg >= 180) fail(`${path}.angles[${i}]`, "angles are measured 0–180 (a line has no direction)");
            return deg;
          });
        })();
  const ratio = badgeIn.ratio === undefined ? fallbackRatio : num(badgeIn.ratio, `${path}.badge.ratio`, { exclusiveMin: 0 });
  if (ratio >= 1) fail(`${path}.badge.ratio`, "must be smaller than 1");
  return {
    angles,
    angleTolerance:
      value.angleTolerance === undefined
        ? DEFAULT_GRAMMAR.angleTolerance
        : num(value.angleTolerance, `${path}.angleTolerance`, { min: 0 }),
    closedShapes: value.closedShapes === undefined ? DEFAULT_GRAMMAR.closedShapes : Boolean(value.closedShapes),
    diagonal: value.diagonal === undefined ? DEFAULT_GRAMMAR.diagonal : oneOf(value.diagonal, DIAGONALS, `${path}.diagonal`),
    badge: {
      ratio,
      corner: badgeIn.corner === undefined ? DEFAULT_GRAMMAR.badge.corner : oneOf(badgeIn.corner, CORNERS, `${path}.badge.corner`),
    },
    arrangements: { allowed, spacing },
    silhouette: value.silhouette === undefined ? DEFAULT_GRAMMAR.silhouette : Boolean(value.silhouette),
  };
}

function pickNumber(derived: DerivedTokens, token: (typeof DERIVABLE)[number], fallback: number): number {
  const v = derived[token]?.value;
  return typeof v === "number" ? v : fallback;
}

function pickEnum<T extends string>(derived: DerivedTokens, token: (typeof DERIVABLE)[number], fallback: T): T {
  const v = derived[token]?.value;
  return typeof v === "string" ? (v as T) : fallback;
}

function parseConstruction(value: unknown, path: string, derived: DerivedTokens): Construction {
  // Absent means derived, present means an override that wins — the same rule
  // the size tokens follow, so there is one thing to learn rather than two.
  const base: Construction = {
    interiorRadius: pickNumber(derived, "interiorRadius", DEFAULT_CONSTRUCTION.interiorRadius),
    grade: pickNumber(derived, "grade", DEFAULT_CONSTRUCTION.grade),
    aperture: pickEnum(derived, "aperture", DEFAULT_CONSTRUCTION.aperture),
    inset: pickNumber(derived, "inset", DEFAULT_CONSTRUCTION.inset),
    accentSize: pickNumber(derived, "accentSize", DEFAULT_CONSTRUCTION.accentSize),
    slope: pickEnum(derived, "slope", DEFAULT_CONSTRUCTION.slope),
    exceptions: {},
  };
  if (value === undefined) return base;
  if (!isRecord(value)) fail(path, "expected an object");
  return {
    interiorRadius:
      value.interiorRadius === undefined
        ? base.interiorRadius
        : num(value.interiorRadius, `${path}.interiorRadius`, { min: 0, max: 1 }),
    grade: value.grade === undefined ? base.grade : num(value.grade, `${path}.grade`, { min: -1, max: 1 }),
    aperture: value.aperture === undefined ? base.aperture : oneOf(value.aperture, APERTURES, `${path}.aperture`),
    inset: value.inset === undefined ? base.inset : num(value.inset, `${path}.inset`, { min: 0.2, max: 3 }),
    accentSize:
      value.accentSize === undefined ? base.accentSize : num(value.accentSize, `${path}.accentSize`, { min: 0.3, max: 2.5 }),
    slope: value.slope === undefined ? base.slope : oneOf(value.slope, SLOPES, `${path}.slope`),
    exceptions: parseExceptions(value.exceptions, `${path}.exceptions`),
  };
}

/**
 * Per-part departures. Allowed, and never free.
 *
 * The reason is required and must say something. An exception without one is
 * drift with a nicer name: six months later nobody remembers why the truck is
 * different, and the set has quietly stopped having a language.
 */
function parseExceptions(value: unknown, path: string): Record<string, ConstructionException> {
  if (value === undefined) return {};
  if (!isRecord(value)) fail(path, "expected an object keyed by primitive name");
  const out: Record<string, ConstructionException> = {};
  for (const [name, raw] of Object.entries(value)) {
    const at = `${path}.${name}`;
    if (!isRecord(raw)) fail(at, "expected an object");
    const why = str(raw.why, `${at}.why`);
    if (why.trim().length < 3) fail(`${at}.why`, "an exception needs a reason somebody can read later");
    if (!isRecord(raw.set)) fail(`${at}.set`, "expected an object of trait values");
    const set: ConstructionException["set"] = {};
    const src = raw.set;
    if (src.interiorRadius !== undefined) set.interiorRadius = num(src.interiorRadius, `${at}.set.interiorRadius`, { min: 0, max: 1 });
    if (src.grade !== undefined) set.grade = num(src.grade, `${at}.set.grade`, { min: -1, max: 1 });
    if (src.aperture !== undefined) set.aperture = oneOf(src.aperture, APERTURES, `${at}.set.aperture`);
    if (src.inset !== undefined) set.inset = num(src.inset, `${at}.set.inset`, { min: 0.2, max: 3 });
    if (src.accentSize !== undefined) set.accentSize = num(src.accentSize, `${at}.set.accentSize`, { min: 0.3, max: 2.5 });
    if (src.slope !== undefined) set.slope = oneOf(src.slope, SLOPES, `${at}.set.slope`);
    if (Object.keys(set).length === 0) fail(`${at}.set`, "an exception that changes nothing is not an exception");
    out[name] = { set, why };
  }
  return out;
}

/** The construction one part sees: the language, then its own exception. */
export function constructionFor(construction: Construction, primitive: string): Construction {
  const exception = construction.exceptions[primitive];
  return exception ? { ...construction, ...exception.set } : construction;
}

function parseOptics(value: unknown, path: string, base: OpticsTokens): OpticsTokens {
  if (value === undefined) return base;
  if (!isRecord(value)) fail(path, "expected an object");
  return {
    junctionNotch:
      value.junctionNotch === undefined ? base.junctionNotch : num(value.junctionNotch, `${path}.junctionNotch`, { min: 0 }),
    junctionAngle:
      value.junctionAngle === undefined
        ? base.junctionAngle
        : num(value.junctionAngle, `${path}.junctionAngle`, { min: 0, max: 90 }),
    interiorThin:
      value.interiorThin === undefined ? base.interiorThin : num(value.interiorThin, `${path}.interiorThin`, { min: 0, max: 0.9 }),
    dotRatio: value.dotRatio === undefined ? base.dotRatio : num(value.dotRatio, `${path}.dotRatio`, { min: 0 }),
  };
}

/** A notch is a length, so it scales with the canvas; the rest are ratios and
 * angles, which do not. */
function scaleOptics(optics: OpticsTokens, fromCanvas: number, toCanvas: number): OpticsTokens {
  if (fromCanvas === toCanvas || fromCanvas <= 0) return optics;
  return { ...optics, junctionNotch: (optics.junctionNotch * toCanvas) / fromCanvas };
}

function parseSize(value: Record<string, unknown>, path: string, base: SizeTokens, derived: DerivedTokens): SizeTokens {
  const canvas = num(value.canvas, `${path}.canvas`, { exclusiveMin: 0 });
  const safeArea = value.safeArea === undefined ? base.safeArea : num(value.safeArea, `${path}.safeArea`, { min: 0 });
  if (safeArea * 2 >= canvas) fail(`${path}.safeArea`, "safe area leaves no room on the canvas");
  // An absent token is derived for *this* size, not copied from the primary.
  const here = scaleDerived(derived, base.canvas, canvas);
  const strokeBase: StrokeTokens = {
    width: base.stroke.width,
    cap: pickEnum(here, "strokeCap", base.stroke.cap),
    join: pickEnum(here, "strokeJoin", base.stroke.join),
  };
  return {
    canvas,
    grid: value.grid === undefined ? base.grid : num(value.grid, `${path}.grid`, { exclusiveMin: 0 }),
    safeArea,
    stroke: value.stroke === undefined ? strokeBase : parseStroke(value.stroke, `${path}.stroke`, strokeBase),
    cornerRadius:
      value.cornerRadius === undefined
        ? pickNumber(here, "cornerRadius", base.cornerRadius)
        : num(value.cornerRadius, `${path}.cornerRadius`, { min: 0 }),
    limits: parseLimits(value.limits, `${path}.limits`, {
      maxElements: pickNumber(here, "maxElements", base.limits.maxElements),
      maxShapes: pickNumber(here, "maxShapes", base.limits.maxShapes),
    }),
    minNegativeSpace:
      value.minNegativeSpace === undefined
        ? base.minNegativeSpace
        : num(value.minNegativeSpace, `${path}.minNegativeSpace`, { min: 0 }),
    optical: parseOptical(value.optical, `${path}.optical`, canvas, safeArea),
    optics: parseOptics(value.optics, `${path}.optics`, scaleOptics(base.optics, base.canvas, canvas)),
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

  // Character and derivation come first: every token below may be computed
  // from them. A derivable token absent from the file is derived; a token
  // written in the file is an override and wins.
  const character = parseCharacter(input.character);
  const derivation = parseDerivation(input.derivation);
  const preferences = parsePreferences(input.preferences);

  // Default optical size from the top-level tokens.
  const canvas = num(input.canvas, "language.canvas", { exclusiveMin: 0 });
  const safeArea = num(input.safeArea, "language.safeArea", { min: 0 });
  if (safeArea * 2 >= canvas) fail("language.safeArea", "safe area leaves no room on the canvas");
  const derived = deriveTokens(character, derivation, canvas);
  const grammar = parseGrammar(input.grammar, "language.grammar", pickNumber(derived, "badgeRatio", DEFAULT_GRAMMAR.badge.ratio));

  const defaultSize: SizeTokens = {
    canvas,
    grid: num(input.grid, "language.grid", { exclusiveMin: 0 }),
    safeArea,
    stroke: parseStroke(
      input.stroke,
      "language.stroke",
      { width: 1, cap: pickEnum(derived, "strokeCap", "round"), join: pickEnum(derived, "strokeJoin", "round") },
      true,
    ),
    cornerRadius:
      input.cornerRadius === undefined
        ? pickNumber(derived, "cornerRadius", 0)
        : num(input.cornerRadius, "language.cornerRadius", { min: 0 }),
    limits: parseLimits(input.limits, "language.limits", {
      maxElements: pickNumber(derived, "maxElements", DETAIL_LIMITS[detail].maxElements),
      maxShapes: pickNumber(derived, "maxShapes", DETAIL_LIMITS[detail].maxShapes),
    }),
    minNegativeSpace:
      input.minNegativeSpace === undefined ? 0 : num(input.minNegativeSpace, "language.minNegativeSpace", { min: 0 }),
    optical: parseOptical(input.optical, "language.optical", canvas, safeArea),
    optics: parseOptics(input.optics, "language.optics", DEFAULT_OPTICS),
  };

  const sizes: Record<number, SizeTokens> = { [canvas]: defaultSize };
  if (input.sizes !== undefined) {
    if (!Array.isArray(input.sizes)) fail("language.sizes", "expected an array");
    input.sizes.forEach((raw, i) => {
      const path = `language.sizes[${i}]`;
      if (!isRecord(raw)) fail(path, "expected an object");
      const size = parseSize(raw, path, defaultSize, derived);
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
    character,
    grammar,
    construction: parseConstruction(input.construction, "language.construction", derived),
    derivation,
    preferences,
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

/* ------------------------------------------------------------------ */
/* Serialisation                                                       */
/* ------------------------------------------------------------------ */

function sameBox(a: Box, b: Box): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function isDerivedOptical(optical: OpticalBoxes, canvas: number, safeArea: number): boolean {
  const derived = defaultOpticalBoxes(canvas, safeArea);
  return OPTICAL_SHAPES.every((shape) => sameBox(optical[shape], derived[shape]));
}

function sizeInput(tokens: SizeTokens, derived: DerivedTokens, base: SizeTokens): SizeInput {
  const here = derived;
  const out: SizeInput = {
    canvas: tokens.canvas,
    grid: tokens.grid,
    safeArea: tokens.safeArea,
    stroke: strokeInput(tokens.stroke, here),
    minNegativeSpace: tokens.minNegativeSpace,
  };
  // A token equal to what the axes propose is left out: absent means derived.
  if (tokens.cornerRadius !== pickNumber(here, "cornerRadius", NaN)) out.cornerRadius = tokens.cornerRadius;
  const limits = limitsInput(tokens.limits, here);
  if (limits) out.limits = limits;
  if (!isDerivedOptical(tokens.optical, tokens.canvas, tokens.safeArea)) out.optical = tokens.optical;
  const optics = opticsInput(tokens.optics, scaleOptics(base.optics, base.canvas, tokens.canvas));
  if (optics) out.optics = optics;
  return out;
}

/** Only the corrections that differ from the inherited baseline are written
 * down, per field, so asking for one pass does not pin the other three. */
function opticsInput(optics: OpticsTokens, base: OpticsTokens): Partial<OpticsTokens> | undefined {
  const out: Partial<OpticsTokens> = {};
  for (const key of ["junctionNotch", "junctionAngle", "interiorThin", "dotRatio"] as const) {
    if (optics[key] !== base[key]) out[key] = optics[key];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Only the budgets that differ from the proposal are written down, so one
 * overridden field does not drag the other out of derivation with it. */
function limitsInput(limits: DetailLimits, derived: DerivedTokens): Partial<DetailLimits> | undefined {
  const out: Partial<DetailLimits> = {};
  if (limits.maxElements !== pickNumber(derived, "maxElements", NaN)) out.maxElements = limits.maxElements;
  if (limits.maxShapes !== pickNumber(derived, "maxShapes", NaN)) out.maxShapes = limits.maxShapes;
  return Object.keys(out).length > 0 ? out : undefined;
}

function strokeInput(stroke: StrokeTokens, derived: DerivedTokens): { width: number; cap?: StrokeCap; join?: StrokeJoin } {
  const out: { width: number; cap?: StrokeCap; join?: StrokeJoin } = { width: stroke.width };
  if (stroke.cap !== pickEnum(derived, "strokeCap", "round")) out.cap = stroke.cap;
  if (stroke.join !== pickEnum(derived, "strokeJoin", "round")) out.join = stroke.join;
  return out;
}

export function serializeIconLanguage(language: IconLanguage): IconLanguageInput {
  const defaultTokens = language.sizes[language.defaultCanvas];
  if (!defaultTokens) throw new IconLanguageError("default size is missing", "language.sizes");

  const derived = deriveTokens(language.character, language.derivation, defaultTokens.canvas);
  const derivedGrammar = { ...DEFAULT_GRAMMAR, badge: { ...DEFAULT_GRAMMAR.badge, ratio: pickNumber(derived, "badgeRatio", DEFAULT_GRAMMAR.badge.ratio) } };

  const out: IconLanguageInput = {
    id: language.id,
    name: language.name,
    version: language.version,
    ...(language.description !== undefined && { description: language.description }),
    canvas: defaultTokens.canvas,
    grid: defaultTokens.grid,
    safeArea: defaultTokens.safeArea,
    stroke: strokeInput(defaultTokens.stroke, derived),
    style: { default: language.style.default, allowed: [...language.style.allowed] },
    colors: { allowed: [...language.colors.allowed] },
    detail: language.detail,
    minNegativeSpace: defaultTokens.minNegativeSpace,
  };

  // Omit anything a reader would derive identically, so an authored file shows
  // only real decisions and a diff shows only real changes.
  if (defaultTokens.cornerRadius !== pickNumber(derived, "cornerRadius", NaN)) {
    out.cornerRadius = defaultTokens.cornerRadius;
  }
  const limits = limitsInput(defaultTokens.limits, derived);
  if (limits) out.limits = limits;
  if (!isDerivedOptical(defaultTokens.optical, defaultTokens.canvas, defaultTokens.safeArea)) {
    out.optical = defaultTokens.optical;
  }
  const defaultOptics = opticsInput(defaultTokens.optics, DEFAULT_OPTICS);
  if (defaultOptics) out.optics = defaultOptics;
  const construction: Partial<Construction> = {};
  if (Object.keys(language.construction.exceptions).length > 0) {
    construction.exceptions = language.construction.exceptions;
  }
  for (const trait of CONSTRUCTION_TRAITS) {
    const proposed =
      typeof DEFAULT_CONSTRUCTION[trait] === "number"
        ? pickNumber(derived, trait, DEFAULT_CONSTRUCTION[trait] as number)
        : pickEnum(derived, trait, DEFAULT_CONSTRUCTION[trait] as string);
    if (language.construction[trait] !== proposed) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (construction as Record<string, unknown>)[trait] = language.construction[trait];
    }
  }
  if (Object.keys(construction).length > 0) out.construction = construction;
  if (JSON.stringify(language.character) !== JSON.stringify(DEFAULT_CHARACTER)) out.character = language.character;
  if (JSON.stringify(language.grammar) !== JSON.stringify(derivedGrammar)) out.grammar = language.grammar;
  if (JSON.stringify(language.derivation) !== JSON.stringify(DEFAULT_DERIVATION)) out.derivation = language.derivation;
  if (Object.keys(language.preferences).length > 0) out.preferences = language.preferences;

  const extra = Object.values(language.sizes)
    .filter((t) => t.canvas !== language.defaultCanvas)
    .sort((a, b) => a.canvas - b.canvas)
    .map((t) => sizeInput(t, scaleDerived(derived, defaultTokens.canvas, t.canvas), defaultTokens));
  if (extra.length > 0) out.sizes = extra;

  return out;
}
