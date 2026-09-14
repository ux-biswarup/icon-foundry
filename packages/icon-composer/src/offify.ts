import { resolveTokens, type IconLanguage, type SizeTokens } from "@icon-foundry/icon-language";
import {
  bandThrough,
  clipOutsideBand,
  skeletonFromCommands,
  type Band,
  type PathCommand,
  type Shape,
  type Skeleton,
} from "@icon-foundry/icon-primitives";
import type { IconSpec } from "@icon-foundry/icon-spec";
import { compose, type ComposeOptions } from "./index.js";

/**
 * The slashed variant: `bell` becomes `bell-off`.
 *
 * Lucide builds this by posting the icon to an Inkscape service for a real
 * boolean path cut, behind an admin check and two environment variables. None of
 * that is needed here, and not because this is cleverer: it is because the
 * geometry is known rather than opaque. The cut is a band, the drawing is
 * segments and arcs, and cutting one against the other is arithmetic.
 *
 * Everything about the slash comes from the language, which the original cannot
 * do:
 *
 * | | Lucide | Here |
 * | --- | --- | --- |
 * | direction | `M2 2 L 22 22` | `grammar.diagonal`, on an angle the grammar allows |
 * | gap | a constant | `stroke.width + 2 × minNegativeSpace` — the gap rule already stated |
 * | size | 24px | whatever the optical size is |
 *
 * So a team's `-off` icons obey their own language rather than ours.
 */

export interface OffifyOptions extends ComposeOptions {
  /** Override the width of the gap the slash cuts, in canvas units. */
  gap?: number;
}

/**
 * The angle the slash runs at.
 *
 * The grammar says which way a diagonal leans; the angle set says which
 * diagonals exist. Taking the nearest allowed angle to that lean means a
 * language of 0/90 only gets a slash it can actually draw, rather than a 45°
 * line it forbids everywhere else.
 */
export function slashAngle(language: IconLanguage): number {
  const leaning = language.grammar.diagonal === "up-left" ? 135 : 45;
  const allowed = language.grammar.angles;
  if (allowed.length === 0) return leaning;
  let best = allowed[0]!;
  let closest = Infinity;
  for (const angle of allowed) {
    // Compared as lines rather than arrows, and never flat: a horizontal slash
    // reads as part of the drawing.
    const normal = ((angle % 180) + 180) % 180;
    if (normal < 1 || Math.abs(normal - 90) < 1) continue;
    const gap = Math.abs(normal - leaning);
    const distance = Math.min(gap, 180 - gap);
    if (distance < closest) {
      closest = distance;
      best = normal;
    }
  }
  return best;
}

/**
 * The gap the slash cuts through the drawing.
 *
 * The language's own minimum gap, plus a full stroke — half for the slash and
 * half for whatever it was cut away from. `minNegativeSpace` is a rule about
 * *visible* space, measured between the edges of two strokes rather than
 * between their centrelines, and the cut happens on centrelines.
 *
 * Getting this wrong is invisible by inspection and obvious to the validator:
 * a band of `stroke + 2 × gap` leaves exactly `gap − stroke/2` of white, which
 * the icon's own language then flags on the variant it just produced.
 *
 * One grid step on top, because cutting to exactly the minimum leaves a gap
 * that is legal by nothing at all — the comparison lands on the boundary and
 * floating point decides it. A step of the layout grid is the smallest margin
 * this language can express, and a slash should clear its own rule rather than
 * tie with it.
 */
export const slashGap = (tokens: SizeTokens): number =>
  2 * (tokens.stroke.width + tokens.minNegativeSpace) + tokens.grid;

export function slashBand(language: IconLanguage, tokens: SizeTokens, gap?: number): Band {
  const centre = tokens.canvas / 2;
  return bandThrough([centre, centre], slashAngle(language), gap ?? slashGap(tokens));
}

/** The slash itself, corner to corner of the safe area. */
export function slashPath(language: IconLanguage, tokens: SizeTokens): string {
  const { canvas, safeArea } = tokens;
  const radians = (slashAngle(language) * Math.PI) / 180;
  const centre = canvas / 2;
  // As long as the safe area allows in the direction it runs, so it reads as one
  // deliberate stroke rather than as a line that stops wherever it happened to.
  const reach = (canvas / 2 - safeArea) * Math.SQRT2;
  const dx = Math.cos(radians) * reach;
  const dy = Math.sin(radians) * reach;
  const clamp = (n: number) => Math.min(canvas - safeArea, Math.max(safeArea, n));
  return `M${clamp(centre - dx)} ${clamp(centre - dy)}L${clamp(centre + dx)} ${clamp(centre + dy)}`;
}

/**
 * The `-off` form of a spec: everything the band does not cover, plus the slash.
 *
 * The result is an `IconSpec` of freeform paths rather than stored geometry,
 * because it is *derived* — the same relationship the filled style has to its
 * outline. Nothing here is written down; re-running it after the language
 * changes gives a slash at the new stroke, through a new gap, at whatever angle
 * the grammar now allows.
 */
export function offify(spec: IconSpec, language: IconLanguage, options: OffifyOptions = {}): IconSpec {
  const tokens = resolveTokens(language, spec.canvas);
  const band = slashBand(language, tokens, options.gap);
  const composed = compose(spec, language, options);

  const kept: string[] = [];
  for (const item of composed.shapes) {
    const skeleton: Skeleton =
      item.shape.kind === "path"
        ? skeletonFromCommands(item.shape.commands)
        : skeletonFromCommands(commandsOf(item.shape));
    const cut = clipOutsideBand(skeleton, band);
    for (const path of pathsOf(cut)) kept.push(path);
  }

  /*
   * Placed as the canvas itself, not as their own bounding box.
   *
   * A path element is normally authored in a little box of its own and *fitted*
   * into the element box, with its natural size measured from the origin. These
   * fragments are already in canvas coordinates — a cut arc sitting wherever the
   * original drawing put it — so any fitting at all moves them. Declaring the
   * natural box to be the whole canvas makes the placement an identity, which is
   * what `natural` is for.
   */
  const whole = { x: 0, y: 0, width: tokens.canvas, height: tokens.canvas };
  const natural = { width: tokens.canvas, height: tokens.canvas };
  const elements: IconSpec["elements"] = [];
  if (kept.length > 0) elements.push({ path: kept, natural, ...whole });
  elements.push({ path: slashPath(language, tokens), natural, ...whole });

  return {
    ...spec,
    name: spec.name.endsWith("-off") ? spec.name : `${spec.name}-off`,
    elements,
  };
}

/** Any shape as path commands, so one clipper serves every kind of geometry. */
function commandsOf(shape: Shape): PathCommand[] {
  switch (shape.kind) {
    case "path":
      return [...shape.commands];
    case "line":
      return [
        { c: "M", x: shape.x1, y: shape.y1 },
        { c: "L", x: shape.x2, y: shape.y2 },
      ];
    case "polyline": {
      const [first, ...rest] = shape.points;
      if (!first) return [];
      return [
        { c: "M", x: first[0], y: first[1] },
        ...rest.map(([x, y]) => ({ c: "L" as const, x, y })),
        ...(shape.closed ? [{ c: "Z" as const }] : []),
      ];
    }
    case "rect": {
      const { x, y, width, height } = shape;
      return [
        { c: "M", x, y },
        { c: "L", x: x + width, y },
        { c: "L", x: x + width, y: y + height },
        { c: "L", x, y: y + height },
        { c: "Z" },
      ];
    }
    case "circle": {
      const { cx, cy, r } = shape;
      return [
        { c: "M", x: cx - r, y: cy },
        { c: "A", rx: r, ry: r, rotation: 0, largeArc: true, sweep: false, x: cx + r, y: cy },
        { c: "A", rx: r, ry: r, rotation: 0, largeArc: true, sweep: false, x: cx - r, y: cy },
        { c: "Z" },
      ];
    }
  }
}

/** One path string per subpath. Written here rather than imported from the
 *  renderer, which depends on this package. */
function pathsOf(skeleton: Skeleton): string[] {
  const out: string[] = [];
  const f = (n: number) => String(Math.round(n * 1000) / 1000);
  for (const subpath of skeleton.subpaths) {
    const start = skeleton.vertices[subpath.start];
    if (!start || subpath.segments.length === 0) continue;
    let d = `M${f(start[0])} ${f(start[1])}`;
    for (const segment of subpath.segments) {
      const to = skeleton.vertices[segment.to];
      if (!to) continue;
      if (segment.kind === "arc") {
        const ry = segment.radiusY ?? segment.radius;
        d += `A${f(segment.radius)} ${f(ry)} ${f(segment.rotation ?? 0)} ${segment.largeArc ? 1 : 0} ${segment.sweep ? 1 : 0} ${f(to[0])} ${f(to[1])}`;
      } else if (segment.kind === "cubic") {
        d += `C${f(segment.c1[0])} ${f(segment.c1[1])} ${f(segment.c2[0])} ${f(segment.c2[1])} ${f(to[0])} ${f(to[1])}`;
      } else {
        d += `L${f(to[0])} ${f(to[1])}`;
      }
    }
    if (subpath.closed) d += "Z";
    out.push(d);
  }
  return out;
}
