import { compose, type ComposeOptions, type ComposedIcon, type ComposedShape } from "@icon-foundry/icon-composer";
import type { IconLanguage } from "@icon-foundry/icon-language";
import type { PathCommand, Shape } from "@icon-foundry/icon-primitives";
import type { IconSpec } from "@icon-foundry/icon-spec";

export interface RenderOptions {
  /** Decimal places kept in coordinates. */
  precision?: number;
  /** Emit `width`/`height` attributes on the root. Default true. */
  dimensions?: boolean;
  /** Emit the xmlns attribute. Default true. Figma's SVG importer accepts both. */
  xmlns?: boolean;
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

type Attrs = Array<[string, string]>;

function attrsToString(attrs: Attrs): string {
  return attrs.map(([k, v]) => ` ${k}="${v}"`).join("");
}

function shapeElement(item: ComposedShape, language: IconLanguage, precision: number): string {
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
    if (item.stroke.width !== language.stroke.width) attrs.push(["stroke-width", f(item.stroke.width)]);
    if (item.stroke.cap !== language.stroke.cap) attrs.push(["stroke-linecap", item.stroke.cap]);
    if (item.stroke.join !== language.stroke.join) attrs.push(["stroke-linejoin", item.stroke.join]);
  }

  return `<${tag}${attrsToString(attrs)}/>`;
}

/**
 * Render a composed icon to a compact, deterministic SVG string.
 * Root attributes carry the language tokens so per-shape output stays minimal.
 */
export function renderSvg(icon: ComposedIcon, language: IconLanguage, options: RenderOptions = {}): string {
  const precision = options.precision ?? 3;
  const f = (n: number) => formatNumber(n, precision);
  const root: Attrs = [];
  if (options.xmlns ?? true) root.push(["xmlns", SVG_NS]);
  root.push(["viewBox", `0 0 ${f(icon.canvas)} ${f(icon.canvas)}`]);
  if (options.dimensions ?? true) root.push(["width", f(icon.canvas)], ["height", f(icon.canvas)]);
  root.push(
    ["fill", "none"],
    ["stroke", "currentColor"],
    ["stroke-width", f(language.stroke.width)],
    ["stroke-linecap", language.stroke.cap],
    ["stroke-linejoin", language.stroke.join],
  );

  const body = icon.shapes.map((s) => shapeElement(s, language, precision)).join("");
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
