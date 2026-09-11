import type {
  Alignment,
  GroupElement,
  IconElement,
  IconSpec,
  PathElement,
  PrimitiveElement,
  IconStyle,
  StrokeCap,
  StrokeJoin,
  StrokeOverride,
} from "./types.js";

export class IconSpecError extends Error {
  constructor(
    message: string,
    public readonly path: string,
  ) {
    super(`${path}: ${message}`);
    this.name = "IconSpecError";
  }
}

const STYLES: readonly IconStyle[] = ["outline", "filled"];
const CAPS: readonly StrokeCap[] = ["butt", "round", "square"];
const JOINS: readonly StrokeJoin[] = ["miter", "round", "bevel"];
const ALIGNMENTS: readonly Alignment[] = ["start", "center", "end"];

export const ICON_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(path: string, message: string): never {
  throw new IconSpecError(message, path);
}

function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(path, "expected a finite number");
  }
  return value;
}

function optionalFinite(value: unknown, path: string): number | undefined {
  return value === undefined ? undefined : finite(value, path);
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "expected a boolean");
  return value;
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    fail(path, `expected one of ${allowed.join(", ")}`);
  }
  return value as T;
}

export function parseStrokeOverride(value: unknown, path: string): StrokeOverride {
  if (!isRecord(value)) fail(path, "expected an object");
  const out: StrokeOverride = {};
  const width = optionalFinite(value.width, `${path}.width`);
  if (width !== undefined) {
    if (width <= 0) fail(`${path}.width`, "must be greater than zero");
    out.width = width;
  }
  if (value.cap !== undefined) out.cap = oneOf(value.cap, CAPS, `${path}.cap`);
  if (value.join !== undefined) out.join = oneOf(value.join, JOINS, `${path}.join`);
  return out;
}

function parseAlign(value: unknown, path: string): { x?: Alignment; y?: Alignment } {
  if (!isRecord(value)) fail(path, "expected an object");
  const out: { x?: Alignment; y?: Alignment } = {};
  if (value.x !== undefined) out.x = oneOf(value.x, ALIGNMENTS, `${path}.x`);
  if (value.y !== undefined) out.y = oneOf(value.y, ALIGNMENTS, `${path}.y`);
  return out;
}

export function parseIconElement(value: unknown, path = "elements[0]"): IconElement {
  if (!isRecord(value)) fail(path, "expected an object");

  const hasPrimitive = value.primitive !== undefined;
  const hasPath = value.path !== undefined;
  const hasChildren = value.children !== undefined;
  if ([hasPrimitive, hasPath, hasChildren].filter(Boolean).length !== 1) {
    fail(path, "an element must have exactly one of `primitive`, `path` or `children`");
  }

  const x = finite(value.x, `${path}.x`);
  const y = finite(value.y, `${path}.y`);
  const size = optionalFinite(value.size, `${path}.size`);
  const width = optionalFinite(value.width, `${path}.width`) ?? size;
  const height = optionalFinite(value.height, `${path}.height`) ?? size;
  if (width === undefined || height === undefined) {
    fail(path, "an element needs `size`, or both `width` and `height`");
  }
  if (width <= 0 || height <= 0) fail(path, "width and height must be greater than zero");

  const base: Omit<PrimitiveElement, "primitive" | "children"> = { x, y, width, height };
  if (value.rotate !== undefined) base.rotate = finite(value.rotate, `${path}.rotate`);
  if (value.flipX !== undefined) base.flipX = bool(value.flipX, `${path}.flipX`);
  if (value.flipY !== undefined) base.flipY = bool(value.flipY, `${path}.flipY`);
  if (value.align !== undefined) base.align = parseAlign(value.align, `${path}.align`);
  if (value.style !== undefined) base.style = oneOf(value.style, STYLES, `${path}.style`);
  if (value.stroke !== undefined) base.stroke = parseStrokeOverride(value.stroke, `${path}.stroke`);
  if (value.color !== undefined) base.color = parseColor(value.color, `${path}.color`);
  if (value.opticalOffset !== undefined) {
    const raw = value.opticalOffset;
    if (!Array.isArray(raw) || raw.length !== 2) {
      fail(`${path}.opticalOffset`, "expected [dx, dy]");
    }
    base.opticalOffset = [
      finite(raw[0], `${path}.opticalOffset[0]`),
      finite(raw[1], `${path}.opticalOffset[1]`),
    ];
  }

  if (hasPrimitive) {
    if (typeof value.primitive !== "string" || value.primitive.length === 0) {
      fail(`${path}.primitive`, "expected a non-empty string");
    }
    return { ...base, primitive: value.primitive };
  }

  if (hasPath) {
    const raw = value.path;
    const list = Array.isArray(raw) ? raw : [raw];
    if (list.length === 0 || !list.every((d) => typeof d === "string" && d.trim().length > 0)) {
      fail(`${path}.path`, "expected a path data string or a non-empty array of them");
    }
    const el: PathElement = { ...base, path: Array.isArray(raw) ? (list as string[]) : (raw as string) };
    if (value.natural !== undefined) {
      if (!isRecord(value.natural)) fail(`${path}.natural`, "expected { width, height }");
      const w = finite(value.natural.width, `${path}.natural.width`);
      const h = finite(value.natural.height, `${path}.natural.height`);
      if (w < 0 || h < 0) fail(`${path}.natural`, "width and height must not be negative");
      el.natural = { width: w, height: h };
    }
    if (value.fillable !== undefined) el.fillable = bool(value.fillable, `${path}.fillable`);
    return el;
  }

  if (!Array.isArray(value.children) || value.children.length === 0) {
    fail(`${path}.children`, "expected a non-empty array");
  }
  const children = value.children.map((child, i) =>
    parseIconElement(child, `${path}.children[${i}]`),
  );
  const canvas = optionalFinite(value.canvas, `${path}.canvas`);
  if (canvas !== undefined && canvas <= 0) fail(`${path}.canvas`, "must be greater than zero");
  const group: GroupElement = { ...base, children };
  if (canvas !== undefined) group.canvas = canvas;
  return group;
}

function parseColor(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(path, "expected a non-empty string");
  }
  return value;
}

/**
 * Parse and structurally validate an unknown value into an IconSpec.
 * This checks shape only; design-rule validation lives in `@icon-foundry/icon-validator`.
 */
export function parseIconSpec(value: unknown): IconSpec {
  if (!isRecord(value)) fail("spec", "expected an object");

  if (typeof value.name !== "string" || !ICON_NAME_PATTERN.test(value.name)) {
    fail("spec.name", "expected a kebab-case identifier like `temperature-warehouse`");
  }
  if (typeof value.language !== "string" || value.language.length === 0) {
    fail("spec.language", "expected a non-empty string");
  }
  const canvas = finite(value.canvas, "spec.canvas");
  if (canvas <= 0) fail("spec.canvas", "must be greater than zero");

  if (!Array.isArray(value.elements) || value.elements.length === 0) {
    fail("spec.elements", "expected a non-empty array");
  }
  const elements = value.elements.map((el, i) => parseIconElement(el, `spec.elements[${i}]`));

  if (value.meta !== undefined && !isRecord(value.meta)) fail("spec.meta", "expected an object");

  const spec: IconSpec = { name: value.name, language: value.language, canvas, elements };
  if (value.style !== undefined) spec.style = oneOf(value.style, STYLES, "spec.style");
  if (value.stroke !== undefined) spec.stroke = parseStrokeOverride(value.stroke, "spec.stroke");
  if (value.meta !== undefined) spec.meta = value.meta;
  return spec;
}

/** Resolve an element's box, honouring the `size` shorthand. */
export function elementBox(el: IconElement): { x: number; y: number; width: number; height: number } {
  const width = el.width ?? el.size ?? 0;
  const height = el.height ?? el.size ?? 0;
  return { x: el.x, y: el.y, width, height };
}
