import type { Arrangement } from "@icon-foundry/icon-spec";

export type IconStyle = "outline" | "filled";

/**
 * Which icons this product needs a filled version of.
 *
 * Stated by concept tag rather than by icon name: naming individual icons here
 * means editing the language every time the set grows, and the language is the
 * one file that should change least.
 *
 * This is a *policy*, not a rule. Nothing refuses an icon for having no filled
 * version — the system reports coverage against this list and a person decides.
 * Whether a filled version would *work* is a separate question, and that one is
 * geometry: see `fillability` in icon-validator.
 */
export interface FilledPolicy {
  /** Concept tags whose icons the product needs filled. Empty means none. */
  requiredFor: string[];
}
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
 * Optical corrections: the small deliberate inaccuracies that make a drawing
 * read correctly at a given size.
 *
 * Every one of these is off by default, and that is the point. A correction is
 * a lie about the geometry, told because the eye is wrong in a predictable
 * way. Whether a set tells that lie is taste, so it is the team's decision,
 * and turning one on silently would quietly redraw every icon already
 * published. Zero disables a pass outright.
 */
export interface OpticsTokens {
  /** Trim a stroke end back from a junction it meets at an acute angle, in
   * units at this optical size. Stops ink piling up in the crook. */
  junctionNotch: number;
  /** At or below this angle, in degrees, a junction counts as acute. */
  junctionAngle: number;
  /** Fraction by which to thin a stroke drawing detail inside another shape of
   * the same element, so the outer contour stays the heavier line. */
  interiorThin: number;
  /** Drawn diameter of a dot, as a multiple of stroke width. Makes every dot
   * in the set the same size instead of whatever its box produced. */
  dotRatio: number;
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
  /**
   * Narrowest knock-out that still reads in the filled style, in units.
   *
   * The filled analogue of `minNegativeSpace`. A hole cut from a solid shape
   * stops reading below roughly one stroke width and the icon goes solid, and
   * the size where that happens is almost always the smallest one — which is
   * why this is a token per optical size rather than a single number.
   */
  minCutout: number;
  optical: OpticalBoxes;
  /** Optical corrections applied after composition. All off by default. */
  optics: OpticsTokens;
}

/**
 * Character: why the icons look the way they do. Stated once, then enforced
 * through the grammar and tokens below. Consumed by the agent prompt, the
 * studio, and documentation — never a mood board nobody reads.
 *
 * Axes run 0–100 between two named poles:
 *   geometric  0 organic    → 100 geometric
 *   minimal    0 expressive → 100 minimal
 *   technical  0 friendly   → 100 technical
 *   literal    0 abstract   → 100 literal
 */
export interface IconCharacter {
  /** One sentence: who these icons are for and how they should behave. */
  purpose?: string;
  axes: { geometric: number; minimal: number; technical: number; literal: number };
  /** Metaphors the set uses, and the ones it refuses. */
  metaphors: { use: string[]; avoid: string[] };
  /** Nouns the product owns; seeds naming and keyword matching. */
  vocabulary: string[];
  /** Principles in the team's own words. Given verbatim to any drafting agent. */
  principles: string[];
}

/**
 * Construction: how a part is built, as opposed to how big or how heavy it is.
 *
 * This is the layer where a set actually feels like the work of one hand. A
 * stroke width is table stakes; what distinguishes one set from another is how
 * a corner is turned, whether an interior corner follows the silhouette or
 * stays square, and how the drawing is compensated on a dark ground.
 *
 * A trait is a named decision that several primitives consume. Primitives
 * declare which traits they read, so setting one changes every primitive that
 * declared it and nothing else. Traits are ratios and offsets rather than
 * lengths, so unlike the size tokens they do not vary per optical size.
 *
 * Only two are defined here. Both are attested independently by Google and IBM;
 * see docs/research/icon-properties.md. The ones drawn from our own primitives
 * arrive separately and are labelled as ours.
 */
export const CONSTRUCTION_TRAITS = [
  "interiorRadius",
  "grade",
  "aperture",
  "inset",
  "accentSize",
  "slope",
] as const;
export type ConstructionTrait = (typeof CONSTRUCTION_TRAITS)[number];

/** Who reads a trait. Only geometry traits have to earn their keep by being shared. */
export type TraitConsumer = "primitives" | "renderer";

export const TRAIT_CONSUMERS: Record<ConstructionTrait, TraitConsumer> = {
  interiorRadius: "primitives",
  grade: "renderer",
  aperture: "primitives",
  inset: "primitives",
  accentSize: "primitives",
  slope: "primitives",
};

/**
 * How an opening is drawn. `mixed` is not a style, it is an unmade decision.
 *
 * Our own vocabulary currently answers this three different ways in one set: a
 * building's windows are short lines, a warehouse's bay door is a closed
 * rectangle, and a monitor's screen is nothing at all until the icon is filled.
 * Defaulting to any one of those would silently redraw the other two, so the
 * default admits the inconsistency instead, and the editor can point at it.
 * That is the product thesis applied to itself: a decision living in nobody's
 * head is still a decision nobody made.
 */
export type ApertureStyle = "mixed" | "line" | "outline" | "notch";

/** The pitch of a sloping or receding plane. `mixed` is an unmade decision. */
export type SlopeStyle = "mixed" | "shallow" | "iso" | "45";

/**
 * How hard a corner rounds, by how sharp it is.
 *
 * The set's construction method is straight segments, then rounded joins — so
 * "how round" is not one number. A gentle bend can take a generous radius; the
 * same radius on a 30° point eats the point. Lucide encodes this as a table in
 * its Arcify tool; here it is a property of the language, because it is a
 * decision about how a set is built rather than a setting in an editor.
 *
 * The radius is a **multiple of the size's `cornerRadius`**, not a length. That
 * buys two things: a corner rounds the way that language's rectangles round, so
 * there is one roundness to reason about; and it scales across optical sizes
 * for free, because `cornerRadius` already does.
 */
export interface CornerBand {
  /** Applies to corners at or below this included angle in degrees. The last
   *  band omits it and takes everything above the one before. */
  upTo?: number;
  /** Radius as a multiple of the size's `cornerRadius`. */
  radius: number;
}

export interface Construction {
  /**
   * How much of the exterior corner radius an interior corner takes, 0 to 1.
   *
   * Zero is square, and zero is the default because both vendors say so:
   * "interior corners should be square" (Material), "rounded exteriors with 90°
   * interiors" (IBM). One makes interiors follow the silhouette, which is what
   * Material's Rounded family does — and the fact that they shipped it as a
   * second family rather than a fix is the proof this is a team's decision
   * rather than a law.
   */
  interiorRadius: number;
  /**
   * Thickness offset applied only on a dark ground, as a fraction of stroke
   * width. Negative thins.
   *
   * A light shape on a dark ground reads heavier than the same shape inverted,
   * so a weight chosen on white is wrong at night. Material Symbols ships an
   * entire variable axis for this, `GRAD`, documented "to reduce glare for a
   * light symbol on a dark background", and suggests roughly −25 of its −50..200
   * range for reversed contrast. Zero by default: a correction nobody asked for
   * would silently redraw every icon already published.
   */
  grade: number;
  /** How an opening is drawn. See ApertureStyle. */
  aperture: ApertureStyle;
  /**
   * Multiplier on how far interior detail sits from the contour it is inside.
   * 1 leaves each primitive at the inset it was drawn with; below 1 crowds the
   * contour, above 1 pulls away from it.
   */
  inset: number;
  /**
   * Multiplier on the signature round part: a head, a wheel, the dot of a pin.
   * 1 leaves each primitive as drawn. Ours rather than anyone's published rule;
   * no system documents it, which is the reason it is worth having.
   */
  accentSize: number;
  /** The pitch of a sloping or receding plane. See SlopeStyle. */
  slope: SlopeStyle;
  /**
   * The radius ramp, sharpest band first. See CornerBand.
   *
   * The default says: a right angle rounds exactly like this language's
   * rectangles do, a gentle bend twice as hard, a sharp point half as hard.
   */
  corners: CornerBand[];
  /**
   * Adjust a rounded corner so its tangent points land on the layout grid.
   *
   * Off by default, because it moves a radius away from the number the ramp
   * states and a control that silently disagrees with its own value is worse
   * than one that is merely coarse. On, it is the general form of the two
   * constants Lucide hardcodes for diagonal corners — though not their exact
   * values; see the note in `arcify`.
   */
  cornerSnap: boolean;
  /**
   * Per-part departures from the values above.
   *
   * Allowed, because forbidding something you cannot fully judge gets worked
   * around in worse ways, and sometimes a shape genuinely needs one. Never
   * silent: an exception carries a written reason, and the set-level audit
   * counts it. One is a judgement. Nine is a language that needs changing.
   *
   * Keyed by primitive name. The reason is required by the parser, because an
   * exception without a reason is drift with a nicer name.
   */
  exceptions: Record<string, ConstructionException>;
}

export interface ConstructionException {
  /** Traits this part departs on. Anything absent still follows the language. */
  set: Partial<Omit<Construction, "exceptions">>;
  /** What was seen that the language value got wrong. Required, non-empty. */
  why: string;
}

export type AxisName = "geometric" | "minimal" | "technical" | "literal";

/**
 * What one personality axis is worth at each of its poles: `[low, high]`.
 * Lengths are a fraction of the canvas, counts are counts at the primary
 * optical size, and enums snap to the nearer pole.
 */
export interface AxisEndpoints {
  cornerRadius?: [number, number];
  maxElements?: [number, number];
  maxShapes?: [number, number];
  badgeRatio?: [number, number];
  strokeCap?: [StrokeCap, StrokeCap];
  strokeJoin?: [StrokeJoin, StrokeJoin];
  /** Construction traits. Absent from the defaults on purpose; see derive.ts. */
  interiorRadius?: [number, number];
  grade?: [number, number];
  inset?: [number, number];
  accentSize?: [number, number];
  aperture?: [ApertureStyle, ApertureStyle];
  slope?: [SlopeStyle, SlopeStyle];
}

/** Which tokens each axis moves, and to what. Editable per language. */
export type Derivation = Partial<Record<AxisName, AxisEndpoints>>;

/**
 * How much each soft preference counts for this set, keyed by scorer id.
 * A weight of 0 turns one off. Which preferences matter is taste, and taste is
 * the team's, so it belongs in the language rather than in our scorers.
 */
export type Preferences = Record<string, number>;

export type DiagonalDirection = "up-right" | "up-left" | "none";
export type BadgeCorner = "top-right" | "top-left" | "bottom-right" | "bottom-left";

/**
 * Grammar: how icons are constructed, as opposed to how they are drawn.
 * These are the rules a validator can check and a recipe can follow.
 */
/** How this set draws each way of relating parts. */
export interface ArrangementRules {
  /** Arrangements this set permits. A concept asking for another is refused. */
  allowed: Arrangement[];
  /** Gap between units in a stack or a row, in units at the primary size.
   * Zero means "use the language's minimum gap". */
  spacing: number;
}

export interface IconGrammar {
  /**
   * Allowed straight-line angles in degrees, measured 0–180 from the x axis.
   * An empty list means any angle. Geometry whose concept demands other
   * angles opts out per element (`freeAngles`).
   */
  angles: number[];
  /** Tolerance in degrees when checking angles. */
  angleTolerance: number;
  /** Prefer closed shapes over open ones, for legibility at small sizes. */
  closedShapes: boolean;
  /** Canonical direction for diagonals that could run either way. */
  diagonal: DiagonalDirection;
  /** How a modifier badge is placed on a subject. */
  badge: { ratio: number; corner: BadgeCorner };
  /** How the other ways of relating parts are drawn. */
  arrangements: ArrangementRules;
  /** Every icon must still read when reduced to a filled silhouette. */
  silhouette: boolean;
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
    /** Which icons the product requires a filled version of. See FilledPolicy. */
    filled: FilledPolicy;
  };
  colors: {
    allowed: string[];
  };
  detail: DetailLevel;
  character: IconCharacter;
  grammar: IconGrammar;
  /** How a part is built. Shared by every primitive that declares a trait. */
  construction: Construction;
  /** What each personality axis moves. Tokens absent from the file come from here. */
  derivation: Derivation;
  /** Weight per soft preference. Absent means 1; 0 turns one off. */
  preferences: Preferences;
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
  minCutout?: number;
  optical?: Partial<OpticalBoxes>;
  optics?: Partial<OpticsTokens>;
}

/**
 * Grammar as it appears in a file. `badge.ratio` is separately optional from
 * `badge.corner`, because the size is derivable from the axes and the corner
 * is not — omitting one must not force the other.
 */
export interface GrammarInput extends Partial<Omit<IconGrammar, "badge" | "arrangements">> {
  badge?: Partial<IconGrammar["badge"]>;
  arrangements?: Partial<ArrangementRules>;
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
  stroke: { width: number; cap?: StrokeCap; join?: StrokeJoin };
  /** Omit to derive from the personality axes. Present means an override. */
  cornerRadius?: number;
  style: { default: IconStyle; allowed?: IconStyle[]; filled?: Partial<FilledPolicy> };
  colors?: { allowed?: string[] };
  detail?: DetailLevel;
  character?: Partial<IconCharacter>;
  grammar?: GrammarInput;
  construction?: Partial<Construction>;
  derivation?: Derivation;
  preferences?: Preferences;
  limits?: Partial<DetailLimits>;
  minNegativeSpace?: number;
  minCutout?: number;
  optical?: Partial<OpticalBoxes>;
  optics?: Partial<OpticsTokens>;
  sizes?: SizeInput[];
}
