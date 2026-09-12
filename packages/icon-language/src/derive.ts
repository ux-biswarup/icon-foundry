import type { AxisName, Derivation, IconCharacter, StrokeCap, StrokeJoin } from "./types.js";

/**
 * Turning philosophy into arithmetic.
 *
 * The four personality axes are the only part of a language's character that is
 * already a number, so they are the only part that can reach the geometry
 * without going through a model. Each axis declares what a token is worth at
 * each of its two poles; the axis position interpolates between them, the way a
 * variable font interpolates a weight axis.
 *
 * Deliberately not a formula. `radius = 3 − geometric / 50` would be our taste
 * wearing the team's clothes, and unarguable. Endpoints are data: a team can
 * say what "minimal" means for their set, and see the reference icons move.
 */

export const AXIS_NAMES: readonly AxisName[] = ["geometric", "minimal", "technical", "literal"];

/** Tokens an axis is allowed to move. Anything not here is authored by hand. */
export const DERIVABLE = [
  "cornerRadius",
  "maxElements",
  "maxShapes",
  "badgeRatio",
  "strokeCap",
  "strokeJoin",
  "interiorRadius",
  "grade",
  "aperture",
  "inset",
  "accentSize",
  "slope",
] as const;
export type DerivableToken = (typeof DERIVABLE)[number];

/** Units each endpoint is written in, so the editor can label them honestly. */
export const TOKEN_UNITS: Record<DerivableToken, "canvasFraction" | "count" | "fraction" | "enum"> = {
  cornerRadius: "canvasFraction",
  maxElements: "count",
  maxShapes: "count",
  badgeRatio: "fraction",
  strokeCap: "enum",
  strokeJoin: "enum",
  interiorRadius: "fraction",
  grade: "fraction",
  aperture: "enum",
  inset: "fraction",
  accentSize: "fraction",
  slope: "enum",
};

/**
 * What each slider moves, out of the box. Tuned against two constraints.
 *
 * With every axis neutral at 50 the proposals reproduce exactly what a
 * language that stated nothing used to get — four parts, twelve shapes, a 35%
 * badge — so adding derivation changed no existing language by accident.
 *
 * And the bundled Technical language, at 80/75/70/60, predicts its own tokens:
 * radius 1.5 at a 16 canvas, three parts. If a shipped language had to override
 * everything, the defaults would be wrong.
 *
 * Stroke caps and joins are deliberately absent: Technical sits at 70 on
 * friendly↔technical and still wants round caps, because "a technical drawing
 * with a friendly finish" is a real position these axes do not predict. A team
 * can add them; we do not guess.
 *
 * The construction traits are absent for the same reason and a sharper one.
 * Both default to the value the shipped languages already draw at — square
 * interiors, no grade — so adding them changed nothing that already existed.
 * Deriving them would have silently redrawn every icon in every library on
 * upgrade, which is the one thing a correction must never do.
 */
export const DEFAULT_DERIVATION: Derivation = {
  geometric: {
    cornerRadius: [0.22, 0.04],
  },
  minimal: {
    maxElements: [7, 1],
    maxShapes: [18, 6],
    badgeRatio: [0.44, 0.26],
  },
  technical: {
    cornerRadius: [0.2, 0.07],
  },
  literal: {
    maxElements: [3, 5],
    maxShapes: [8, 16],
  },
};

export interface Contribution {
  axis: AxisName;
  /** Where the axis sits, 0–100. */
  position: number;
  /** What this axis alone proposes, in the token's own units. */
  value: number | string;
}

export interface DerivedToken {
  /** The proposal: the mean of every axis that moves this token. */
  value: number | string;
  contributions: Contribution[];
}

export type DerivedTokens = Partial<Record<DerivableToken, DerivedToken>>;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function isNumericPair(pair: unknown): pair is [number, number] {
  return Array.isArray(pair) && pair.length === 2 && typeof pair[0] === "number" && typeof pair[1] === "number";
}

/**
 * Interpolate every derivable token from the axes.
 *
 * `primaryCanvas` converts canvas-fraction endpoints into units, so the same
 * derivation produces a sane radius whether a language is designed at 16 or 32.
 * Where two axes move the same token the proposal is the mean of their
 * contributions, which is why "geometric but friendly" lands between the two
 * rather than at either extreme. Enum tokens cannot be averaged, so they take
 * the pole the axis is nearer to.
 */
export function deriveTokens(character: IconCharacter, derivation: Derivation, primaryCanvas: number): DerivedTokens {
  const out: DerivedTokens = {};

  for (const token of DERIVABLE) {
    const contributions: Contribution[] = [];
    for (const axis of AXIS_NAMES) {
      const pair = derivation[axis]?.[token];
      if (pair === undefined) continue;
      const position = character.axes[axis];
      const t = Math.min(100, Math.max(0, position)) / 100;
      if (isNumericPair(pair)) {
        const raw = lerp(pair[0], pair[1], t);
        const value = TOKEN_UNITS[token] === "canvasFraction" ? raw * primaryCanvas : raw;
        contributions.push({ axis, position, value });
      } else {
        // An enum has no midpoint, so it snaps to the nearer pole.
        contributions.push({ axis, position, value: t < 0.5 ? pair[0] : pair[1] });
      }
    }
    if (contributions.length === 0) continue;

    const numeric = contributions.filter((c) => typeof c.value === "number") as Array<Contribution & { value: number }>;
    if (numeric.length === contributions.length) {
      const mean = numeric.reduce((sum, c) => sum + c.value, 0) / numeric.length;
      out[token] = { value: round(token, mean), contributions };
    } else {
      // Mixed or enum: the last axis that speaks wins, and the editor shows why.
      out[token] = { value: contributions[contributions.length - 1]!.value, contributions };
    }
  }
  return out;
}

/** Counts are whole; lengths and ratios are rounded to something a human would type. */
function round(token: DerivableToken, value: number): number {
  if (TOKEN_UNITS[token] === "count") return Math.max(1, Math.round(value));
  if (TOKEN_UNITS[token] === "fraction") return Math.round(value * 100) / 100;
  return Math.round(value * 4) / 4;
}

/** The derived value for one token, or undefined when no axis moves it. */
export function derivedValue(derived: DerivedTokens, token: DerivableToken): number | string | undefined {
  return derived[token]?.value;
}

export function derivedNumber(derived: DerivedTokens, token: DerivableToken, fallback: number): number {
  const value = derivedValue(derived, token);
  return typeof value === "number" ? value : fallback;
}

export function derivedEnum<T extends StrokeCap | StrokeJoin>(
  derived: DerivedTokens,
  token: DerivableToken,
  fallback: T,
): T {
  const value = derivedValue(derived, token);
  return typeof value === "string" ? (value as T) : fallback;
}

/**
 * The same derivation at a different optical size. Lengths and counts scale
 * with the canvas — a 24px icon earns more radius and more detail than a 16px
 * one — while ratios and enums are size-independent.
 */
export function scaleDerived(derived: DerivedTokens, fromCanvas: number, toCanvas: number): DerivedTokens {
  if (fromCanvas === toCanvas || fromCanvas <= 0) return derived;
  const ratio = toCanvas / fromCanvas;
  const out: DerivedTokens = {};
  for (const token of DERIVABLE) {
    const d = derived[token];
    if (!d) continue;
    const unit = TOKEN_UNITS[token];
    if (typeof d.value !== "number" || unit === "fraction" || unit === "enum") {
      out[token] = d;
      continue;
    }
    out[token] = { ...d, value: round(token, d.value * ratio) };
  }
  return out;
}
