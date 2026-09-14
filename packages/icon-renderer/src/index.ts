import { applyOptics, compose, type ComposeOptions, type ComposedIcon, type ComposedShape } from "@icon-foundry/icon-composer";
import type { IconLanguage, SizeTokens } from "@icon-foundry/icon-language";
import { skeletonToCommands, type PathCommand, type Shape, type Skeleton } from "@icon-foundry/icon-primitives";
import type { IconSpec } from "@icon-foundry/icon-spec";

export interface RenderOptions {
  /** Decimal places kept in coordinates. */
  precision?: number;
  /** Emit `width`/`height` attributes on the root. Default true. */
  dimensions?: boolean;
  /** Emit the xmlns attribute. Default true. Figma's SVG importer accepts both. */
  xmlns?: boolean;
  /**
   * Render for a dark ground, applying the language's grade.
   *
   * A light shape on a dark ground reads heavier than the same shape inverted
   * at the same stroke, which is why Material Symbols ships a whole variable
   * axis for it. A language with no grade is unaffected, so this is safe to
   * pass whenever the ground is known.
   */
  onDark?: boolean;
  /**
   * Apply the language's optical corrections. Default true, and a no-op for
   * every language that has not asked for any.
   *
   * Rendering is where this belongs. The validator judges what the compiler
   * laid out, so a notch that opens a hair of a gap must not read as a
   * negative-space failure, and an audit comparing two icons must compare the
   * geometry rather than the retouching. Set false to see the uncorrected
   * drawing.
   */
  optics?: boolean;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Deterministic number formatting: fixed precision, no trailing zeros, no "-0". */
export function formatNumber(n: number, precision = 3): string {
  const rounded = Number(n.toFixed(precision));
  const normalised = rounded === 0 ? 0 : rounded;
  return String(normalised);
}

function commandToString(cmd: PathCommand, f: (n: number) => string): string {
  switch (cmd.c) {
    case "M":
    case "L":
      return `${cmd.c}${f(cmd.x)} ${f(cmd.y)}`;
    case "A":
      return `A${f(cmd.rx)} ${f(cmd.ry)} ${f(cmd.rotation)} ${cmd.largeArc ? 1 : 0} ${cmd.sweep ? 1 : 0} ${f(cmd.x)} ${f(cmd.y)}`;
    case "C":
      return `C${f(cmd.x1)} ${f(cmd.y1)} ${f(cmd.x2)} ${f(cmd.y2)} ${f(cmd.x)} ${f(cmd.y)}`;
    case "Z":
      return "Z";
  }
}

/** Convert a shape to an SVG path `d` string. */
export function shapeToPathData(shape: Shape, precision = 3): string {
  const f = (n: number) => formatNumber(n, precision);
  switch (shape.kind) {
    case "path":
      return shape.commands.map((c) => commandToString(c, f)).join("");
    case "line":
      return `M${f(shape.x1)} ${f(shape.y1)}L${f(shape.x2)} ${f(shape.y2)}`;
    case "polyline": {
      const [first, ...rest] = shape.points;
      if (!first) return "";
      const body = rest.map(([x, y]) => `L${f(x)} ${f(y)}`).join("");
      return `M${f(first[0])} ${f(first[1])}${body}${shape.closed ? "Z" : ""}`;
    }
    case "circle": {
      const { cx, cy, r } = shape;
      return `M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)}Z`;
    }
    case "rect": {
      const { x, y, width: w, height: h } = shape;
      const rx = Math.min(shape.rx, w / 2, h / 2);
      if (rx <= 0) return `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`;
      return [
        `M${f(x + rx)} ${f(y)}`,
        `H${f(x + w - rx)}`,
        `A${f(rx)} ${f(rx)} 0 0 1 ${f(x + w)} ${f(y + rx)}`,
        `V${f(y + h - rx)}`,
        `A${f(rx)} ${f(rx)} 0 0 1 ${f(x + w - rx)} ${f(y + h)}`,
        `H${f(x + rx)}`,
        `A${f(rx)} ${f(rx)} 0 0 1 ${f(x)} ${f(y + h - rx)}`,
        `V${f(y + rx)}`,
        `A${f(rx)} ${f(rx)} 0 0 1 ${f(x + rx)} ${f(y)}`,
        "Z",
      ].join("");
    }
  }
}

/**
 * A skeleton as path data, one string per subpath.
 *
 * Lives here rather than beside the skeleton because this is where numbers are
 * formatted. A second formatter in the geometry package would be a second answer
 * to "how many decimals", and the two would drift.
 */
export function skeletonPaths(skeleton: Skeleton, precision = 3): string[] {
  return skeleton.subpaths.map((subpath) =>
    shapeToPathData(
      { kind: "path", commands: skeletonToCommands({ ...skeleton, subpaths: [subpath] }), fillable: subpath.closed },
      precision,
    ),
  );
}

/** The whole skeleton as one `d` string. */
export function skeletonToPathData(skeleton: Skeleton, precision = 3): string {
  return skeletonPaths(skeleton, precision).join("");
}

/**
 * Filled geometry is one path, not many.
 *
 * A hole only exists relative to the shape it is cut from, so the body and its
 * cutouts have to be a single path with an even-odd fill rule. Rendering them
 * as separate elements would paint the hole on top in the same colour, which
 * is indistinguishable from having no hole at all.
 */
function renderShapes(icon: ComposedIcon, tokens: SizeTokens, precision: number): string {
  const solid: ComposedShape[] = [];
  const rest: ComposedShape[] = [];
  for (const item of icon.shapes) {
    const filled = item.style === "filled" && item.shape.fillable;
    (filled ? solid : rest).push(item);
  }

  const out: string[] = [];
  // Group by colour: two colours cannot share one path.
  const byColour = new Map<string, ComposedShape[]>();
  for (const item of solid) byColour.set(item.color, [...(byColour.get(item.color) ?? []), item]);
  for (const [color, group] of byColour) {
    const hasCutout = group.some((item) => item.shape.cutout === true);
    if (!hasCutout) {
      for (const item of group) out.push(shapeElement(item, tokens, precision));
      continue;
    }
    const d = group.map((item) => shapeToPathData(item.shape, precision)).join("");
    out.push(`<path d="${d}" fill="${color}" fill-rule="evenodd" stroke="none"/>`);
  }
  for (const item of rest) out.push(shapeElement(item, tokens, precision));
  return out.join("");
}

type Attrs = Array<[string, string]>;

function attrsToString(attrs: Attrs): string {
  return attrs.map(([k, v]) => ` ${k}="${v}"`).join("");
}

function shapeElement(item: ComposedShape, tokens: SizeTokens, precision: number): string {
  const f = (n: number) => formatNumber(n, precision);
  const { shape } = item;
  const filled = item.style === "filled" && shape.fillable;

  const attrs: Attrs = [];
  let tag: string;

  switch (shape.kind) {
    case "circle":
      tag = "circle";
      attrs.push(["cx", f(shape.cx)], ["cy", f(shape.cy)], ["r", f(shape.r)]);
      break;
    case "rect":
      tag = "rect";
      attrs.push(["x", f(shape.x)], ["y", f(shape.y)], ["width", f(shape.width)], ["height", f(shape.height)]);
      if (shape.rx > 0) attrs.push(["rx", f(shape.rx)]);
      break;
    case "line":
      tag = "line";
      attrs.push(["x1", f(shape.x1)], ["y1", f(shape.y1)], ["x2", f(shape.x2)], ["y2", f(shape.y2)]);
      break;
    default:
      tag = "path";
      attrs.push(["d", shapeToPathData(shape, precision)]);
  }

  // Only emit presentation attributes that differ from the root defaults.
  if (filled) {
    attrs.push(["fill", item.color], ["stroke", "none"]);
  } else {
    if (item.color !== "currentColor") attrs.push(["stroke", item.color]);
    if (item.stroke.width !== tokens.stroke.width) attrs.push(["stroke-width", f(item.stroke.width)]);
    if (item.stroke.cap !== tokens.stroke.cap) attrs.push(["stroke-linecap", item.stroke.cap]);
    if (item.stroke.join !== tokens.stroke.join) attrs.push(["stroke-linejoin", item.stroke.join]);
  }

  return `<${tag}${attrsToString(attrs)}/>`;
}

/**
 * Apply the grade offset, which exists only because the eye is wrong about
 * reversed contrast in a predictable direction.
 *
 * Every stroke is scaled by the same fraction, including the root default, so
 * the icon keeps one weight rather than acquiring a hierarchy it never asked
 * for. A negative grade thins; the floor stops a large one from erasing the
 * drawing outright.
 */
function applyGrade(icon: ComposedIcon): ComposedIcon {
  const { grade } = icon.construction;
  if (!grade) return icon;
  const factor = Math.max(0.1, 1 + grade);
  return {
    ...icon,
    tokens: { ...icon.tokens, stroke: { ...icon.tokens.stroke, width: icon.tokens.stroke.width * factor } },
    shapes: icon.shapes.map((item) => ({ ...item, stroke: { ...item.stroke, width: item.stroke.width * factor } })),
  };
}

/**
 * Render a composed icon to a compact, deterministic SVG string.
 * Root attributes carry the size tokens the icon was composed with, so
 * per-shape output stays minimal. The language argument is accepted for API
 * symmetry; tokens come from the composition.
 */
export function renderSvg(icon: ComposedIcon, _language?: IconLanguage, options: RenderOptions = {}): string {
  const graded = options.onDark ? applyGrade(icon) : icon;
  const corrected = (options.optics ?? true) ? applyOptics(graded).icon : graded;
  const tokens = corrected.tokens;
  const precision = options.precision ?? 3;
  const f = (n: number) => formatNumber(n, precision);
  const root: Attrs = [];
  if (options.xmlns ?? true) root.push(["xmlns", SVG_NS]);
  root.push(["viewBox", `0 0 ${f(corrected.canvas)} ${f(corrected.canvas)}`]);
  if (options.dimensions ?? true) root.push(["width", f(corrected.canvas)], ["height", f(corrected.canvas)]);
  root.push(
    ["fill", "none"],
    ["stroke", "currentColor"],
    ["stroke-width", f(tokens.stroke.width)],
    ["stroke-linecap", tokens.stroke.cap],
    ["stroke-linejoin", tokens.stroke.join],
  );

  const body = renderShapes(corrected, tokens, precision);
  return `<svg${attrsToString(root)}>${body}</svg>`;
}

/** Convenience: compose and render in one step. */
export function renderSpecToSvg(
  spec: IconSpec,
  language: IconLanguage,
  options: RenderOptions & ComposeOptions = {},
): string {
  const { registry, ...render } = options;
  return renderSvg(compose(spec, language, registry ? { registry } : {}), language, render);
}
