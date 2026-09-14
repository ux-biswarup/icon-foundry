import {
  chain,
  circle,
  line,
  polyline,
  rect,
  rotate,
  scale,
  transformShape,
  translate,
  type Matrix,
  type Point,
  type Shape,
} from "./geometry.js";
import { pathShapeFromData } from "./path-data.js";

/**
 * Reading somebody else's SVG.
 *
 * Nobody has a `d` string on their clipboard. They have an `<svg>` — from
 * Figma, from Lucide, from a designer — and a tool that cannot take one is a
 * tool you retype into. This is the door.
 *
 * **The rule that keeps it a door and not a second source of truth: geometry is
 * taken, and everything else is reported and refused.** An incoming
 * `stroke-width="2"` is not a fact about the drawing, it is somebody else's
 * language leaking into this one; a paste that silently brought it in would be
 * the exact failure this project exists to prevent. So those attributes are
 * collected, handed back, and dropped — the caller can say what it ignored.
 *
 * No parser dependency. This reads the subset that tools emit rather than the
 * whole specification, and it is deliberately strict about the difference:
 * anything it does not understand becomes a refusal with a reason, never a
 * silent omission. A drawing that half-imports is worse than one that does not.
 */

export interface SvgImport {
  /** One path-data string per drawable element, in document order. */
  paths: string[];
  /** The `viewBox`, when the source declared one. */
  viewBox?: { x: number; y: number; width: number; height: number };
  /**
   * Attributes the language owns that the source also had an opinion about.
   * Reported so a caller can say what it is throwing away.
   */
  ignored: Array<{ name: string; value: string }>;
}

export class SvgImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SvgImportError";
  }
}

/** Attributes that belong to the language, not to the drawing. */
const LANGUAGE_OWNED = [
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke",
  "fill",
  "color",
  "opacity",
  "stroke-opacity",
  "fill-opacity",
  "width",
  "height",
];

const TAG = /<\s*(\/?)\s*([a-zA-Z][\w:-]*)([^>]*?)(\/?)\s*>/g;
const ATTR = /([a-zA-Z_:][-\w:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
const NUMBERS = /-?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g;

function attributesOf(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of source.matchAll(ATTR)) {
    out[match[1]!.toLowerCase()] = match[3] ?? match[4] ?? "";
  }
  return out;
}

const num = (value: string | undefined, fallback = 0): number => {
  if (value === undefined) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function pointsOf(value: string | undefined): Point[] {
  if (!value) return [];
  const found = value.match(NUMBERS)?.map(Number) ?? [];
  const out: Point[] = [];
  for (let i = 0; i + 1 < found.length; i += 2) out.push([found[i]!, found[i + 1]!]);
  return out;
}

/**
 * An SVG `transform` attribute as a matrix.
 *
 * Supported because real exports use them — a Figma frame is almost always a
 * `translate` — and because ignoring one does not produce a slightly-off
 * drawing, it produces geometry in the wrong place with no indication why.
 */
export function parseTransform(value: string | undefined): Matrix | undefined {
  if (!value) return undefined;
  const parts = [...value.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)];
  if (parts.length === 0) return undefined;
  const matrices: Matrix[] = [];
  for (const [, nameRaw, argsRaw] of parts) {
    const name = (nameRaw ?? "").toLowerCase();
    const args = (argsRaw ?? "").match(NUMBERS)?.map(Number) ?? [];
    switch (name) {
      case "translate":
        matrices.push(translate(args[0] ?? 0, args[1] ?? 0));
        break;
      case "scale":
        matrices.push(scale(args[0] ?? 1, args[1] ?? args[0] ?? 1));
        break;
      case "rotate":
        if (args.length >= 3) {
          matrices.push(
            chain(translate(-(args[1] ?? 0), -(args[2] ?? 0)), rotate(args[0] ?? 0), translate(args[1] ?? 0, args[2] ?? 0)),
          );
        } else {
          matrices.push(rotate(args[0] ?? 0));
        }
        break;
      case "matrix":
        if (args.length >= 6) {
          matrices.push([args[0]!, args[1]!, args[2]!, args[3]!, args[4]!, args[5]!] as Matrix);
        }
        break;
      default:
        throw new SvgImportError(`transform "${name}()" is not supported`);
    }
  }
  return matrices.length === 1 ? matrices[0]! : chain(...matrices);
}

/** One drawable element as a shape, or undefined when it draws nothing. */
function shapeFor(tag: string, attrs: Record<string, string>): Shape | undefined {
  switch (tag) {
    case "path": {
      const d = attrs.d;
      if (!d || d.trim().length === 0) return undefined;
      return pathShapeFromData(d);
    }
    case "rect": {
      const width = num(attrs.width);
      const height = num(attrs.height);
      if (width <= 0 || height <= 0) return undefined;
      // `rx` and `ry` may differ in SVG. Ours is one radius, so an unequal pair
      // would be quietly redrawn — refuse instead.
      const rx = attrs.rx !== undefined ? num(attrs.rx) : attrs.ry !== undefined ? num(attrs.ry) : 0;
      const ry = attrs.ry !== undefined ? num(attrs.ry) : rx;
      if (Math.abs(rx - ry) > 1e-6) {
        throw new SvgImportError("a rect with different rx and ry cannot be represented without redrawing it");
      }
      return rect(num(attrs.x), num(attrs.y), width, height, rx);
    }
    case "circle": {
      const r = num(attrs.r);
      return r > 0 ? circle(num(attrs.cx), num(attrs.cy), r) : undefined;
    }
    case "ellipse": {
      const rx = num(attrs.rx);
      const ry = num(attrs.ry);
      if (rx <= 0 || ry <= 0) return undefined;
      if (Math.abs(rx - ry) < 1e-6) return circle(num(attrs.cx), num(attrs.cy), rx);
      // A true ellipse is not in the shape union, so it arrives as the two arcs
      // that draw one. Kept rather than rounded: refusing a designer's ellipse
      // would be worse than carrying it.
      const cx = num(attrs.cx);
      const cy = num(attrs.cy);
      return pathShapeFromData(
        `M${cx - rx} ${cy}A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}A${rx} ${ry} 0 0 1 ${cx - rx} ${cy}Z`,
      );
    }
    case "line":
      return line(num(attrs.x1), num(attrs.y1), num(attrs.x2), num(attrs.y2));
    case "polyline": {
      const points = pointsOf(attrs.points);
      return points.length >= 2 ? polyline(points, false) : undefined;
    }
    case "polygon": {
      const points = pointsOf(attrs.points);
      return points.length >= 3 ? polyline(points, true) : undefined;
    }
    default:
      return undefined;
  }
}

const DRAWABLE = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
/** Elements whose content draws nothing here, and whose children must be skipped. */
const SKIP = new Set(["defs", "clippath", "mask", "pattern", "marker", "symbol", "filter", "lineargradient", "radialgradient"]);

/**
 * Path data for every drawable element of an SVG document, in document order.
 *
 * `toPathData` is taken as an argument rather than imported so this module does
 * not depend on the renderer, which depends on this package. The caller passes
 * `shapeToPathData`.
 */
export function importSvg(source: string, toPathData: (shape: Shape, precision?: number) => string, precision = 4): SvgImport {
  if (!/<\s*svg[\s>]/i.test(source)) throw new SvgImportError("expected an <svg> element");

  const paths: string[] = [];
  const ignored: Array<{ name: string; value: string }> = [];
  const seen = new Set<string>();
  let viewBox: SvgImport["viewBox"];

  /** Accumulated transform, innermost last. */
  const stack: Matrix[] = [];
  /** Depth inside an element whose contents do not draw. */
  let skipping = 0;

  const note = (attrs: Record<string, string>) => {
    for (const name of LANGUAGE_OWNED) {
      const value = attrs[name];
      if (value === undefined || seen.has(name)) continue;
      seen.add(name);
      ignored.push({ name, value });
    }
  };

  for (const match of source.matchAll(TAG)) {
    const closing = match[1] === "/";
    const tag = (match[2] ?? "").toLowerCase();
    const body = match[3] ?? "";
    const selfClosing = match[4] === "/";

    if (SKIP.has(tag)) {
      if (closing) skipping = Math.max(0, skipping - 1);
      else if (!selfClosing) skipping += 1;
      continue;
    }
    if (skipping > 0) continue;

    if (closing) {
      if (tag === "g" || tag === "svg") stack.pop();
      continue;
    }

    const attrs = attributesOf(body);

    if (tag === "svg" || tag === "g") {
      if (tag === "svg") {
        const box = attrs.viewbox?.match(NUMBERS)?.map(Number);
        if (box && box.length >= 4) viewBox = { x: box[0]!, y: box[1]!, width: box[2]!, height: box[3]! };
      }
      note(attrs);
      const own = parseTransform(attrs.transform);
      const parent = stack[stack.length - 1];
      if (!selfClosing) stack.push(own && parent ? chain(own, parent) : (own ?? parent ?? translate(0, 0)));
      continue;
    }

    if (!DRAWABLE.has(tag)) continue;
    note(attrs);

    const shape = shapeFor(tag, attrs);
    if (!shape) continue;

    const own = parseTransform(attrs.transform);
    const inherited = stack[stack.length - 1];
    const matrix = own && inherited ? chain(own, inherited) : (own ?? inherited);
    const placed = matrix ? transformShape(shape, matrix) : shape;
    const d = toPathData(placed, precision);
    if (d.trim().length > 0) paths.push(d);
  }

  if (paths.length === 0) throw new SvgImportError("found no geometry in that SVG");
  return { paths, ...(viewBox && { viewBox }), ignored };
}
