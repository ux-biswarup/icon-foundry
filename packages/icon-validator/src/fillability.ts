import { compose, ComposeError, type ComposeOptions, type ComposedShape } from "@icon-foundry/icon-composer";
import { nearestTokens, resolveTokens, hasSize, type IconLanguage, type SizeTokens } from "@icon-foundry/icon-language";
import { sampleShape, shapeBounds, type Bounds } from "@icon-foundry/icon-primitives";
import type { IconSpec } from "@icon-foundry/icon-spec";

/**
 * Can this icon be filled, and if not, why not.
 *
 * The system never decides that an icon *needs* a filled version — that is a
 * fact about a product's tab bars and selected states, and no property of a
 * drawing produces it. It decides the other question, which is geometry, and
 * reports it in geometric terms so a designer can act on the answer rather than
 * being told no.
 *
 * Every reason below is a measurement of the composed filled drawing. None of
 * them is worked around: the engine will not quietly widen a knock-out to make
 * a check pass, because widening it is drawing, and drawing is the designer's.
 */

export type FillBlocker =
  /** No closed geometry, so there is nothing to make solid. */
  | "nothing-closed"
  /** A hole narrower than the size's `minCutout`; it closes up and the icon goes solid. */
  | "cutout-closes-up"
  /** Interior detail that is stroke-only: in the filled style it has no hole to
   *  become, and is painted in the fill's own colour on top of the fill. */
  | "detail-swallowed"
  /** Most of the ink is open line, so the silhouette is not the drawing. */
  | "mostly-line";

export interface FillReason {
  code: FillBlocker;
  /** `impossible` means no filled version at this size. `warning` means it works and may be poor. */
  severity: "impossible" | "warning";
  message: string;
  /** Element path the reason belongs to, when it belongs to one. */
  source?: string;
}

export interface Fillability {
  /** The optical size the answer is for. A filled version can fail at 16 and hold at 32. */
  canvas: number;
  /** True when nothing makes a filled version impossible at this size. */
  ok: boolean;
  reasons: FillReason[];
  /** Share of ink that is closed shape, 0–1. The filled style is this share of the drawing. */
  closedInk: number;
}

/** Below this share of closed ink, filling the icon throws away most of it. */
const MOSTLY_LINE = 0.5;

function length(item: ComposedShape): number {
  let total = 0;
  for (const poly of sampleShape(item.shape)) {
    for (let i = 0; i < poly.length - 1; i++) {
      total += Math.hypot(poly[i + 1]![0] - poly[i]![0], poly[i + 1]![1] - poly[i]![1]);
    }
  }
  return total;
}

/** True when `inner` sits entirely within `outer`, which is what makes a
 *  stroke-only detail disappear once `outer` becomes solid ink. */
function inside(inner: Bounds, outer: Bounds): boolean {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY;
}

/**
 * Ask whether `spec` survives being filled, at its own optical size.
 *
 * The spec is composed in the filled style regardless of what style it declares,
 * because the question is about the filled drawing rather than about the one
 * the spec happens to be carrying.
 */
export function fillability(spec: IconSpec, language: IconLanguage, options: ComposeOptions = {}): Fillability {
  const tokens: SizeTokens = hasSize(language, spec.canvas)
    ? resolveTokens(language, spec.canvas)
    : nearestTokens(language, spec.canvas);
  const reasons: FillReason[] = [];

  let shapes: readonly ComposedShape[];
  try {
    shapes = compose({ ...spec, style: "filled" }, language, options).shapes;
  } catch (error) {
    if (error instanceof ComposeError) {
      return {
        canvas: tokens.canvas,
        ok: false,
        closedInk: 0,
        reasons: [{ code: "nothing-closed", severity: "impossible", message: error.message, source: error.source }],
      };
    }
    throw error;
  }

  const solid = shapes.filter((item) => item.shape.fillable && item.shape.cutout !== true);
  const holes = shapes.filter((item) => item.shape.cutout === true);
  const lines = shapes.filter((item) => !item.shape.fillable);

  if (solid.length === 0) {
    reasons.push({
      code: "nothing-closed",
      severity: "impossible",
      message: "Nothing in this icon is a closed shape, so there is no silhouette to fill.",
    });
  }

  // A hole is only a hole if it survives. Both dimensions are checked: a slot
  // 8 units long and a third of a unit wide reads as no slot at all.
  for (const hole of holes) {
    const b = shapeBounds(hole.shape);
    const narrowest = Math.min(b.maxX - b.minX, b.maxY - b.minY);
    if (narrowest < tokens.minCutout) {
      reasons.push({
        code: "cutout-closes-up",
        severity: "impossible",
        message: `A knock-out is ${narrowest.toFixed(2)} units across; at ${tokens.canvas}px this language needs ${tokens.minCutout}. It closes up and the shape goes solid.`,
        source: hole.source,
      });
    }
  }

  // Interior line work has no hole to become. The renderer keeps it as a stroke,
  // which at the same colour is ink on ink: present in the file, invisible on
  // screen. Reported rather than removed, because the fix is a cutout and only
  // the person drawing it knows which detail deserves one.
  const solidBounds = solid.map((item) => shapeBounds(item.shape));
  for (const line of lines) {
    const b = shapeBounds(line.shape);
    if (solidBounds.some((outer) => inside(b, outer))) {
      reasons.push({
        code: "detail-swallowed",
        severity: "warning",
        message: `${line.primitive} is drawn as line work inside a shape that becomes solid, so the fill swallows it. Cut it out instead.`,
        source: line.source,
      });
    }
  }

  let closed = 0;
  let total = 0;
  for (const item of shapes) {
    const ink = length(item);
    total += ink;
    if (item.shape.fillable) closed += ink;
  }
  const closedInk = total === 0 ? 0 : closed / total;
  if (solid.length > 0 && closedInk < MOSTLY_LINE) {
    reasons.push({
      code: "mostly-line",
      severity: "warning",
      message: `Only ${Math.round(closedInk * 100)}% of this drawing is closed shape, so filling it keeps less than half of what the icon is.`,
    });
  }

  return {
    canvas: tokens.canvas,
    ok: !reasons.some((r) => r.severity === "impossible"),
    reasons,
    closedInk,
  };
}

/**
 * The same question at every optical size the language defines.
 *
 * Worth asking as a set: `minCutout` scales with the size, so a knock-out that
 * closes up at 16 is usually fine at 32, and "this icon cannot be filled" is
 * nearly always "this icon cannot be filled *small*".
 */
export function fillabilityBySize(
  spec: IconSpec,
  language: IconLanguage,
  options: ComposeOptions = {},
): Fillability[] {
  return Object.keys(language.sizes)
    .map(Number)
    .sort((a, b) => a - b)
    .map((canvas) => fillability({ ...spec, canvas }, language, options));
}
