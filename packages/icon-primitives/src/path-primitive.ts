import type { OpticalShape } from "@icon-foundry/icon-language";
import { shapeBounds, unionBounds, type Shape } from "./geometry.js";
import { pathShapeFromData } from "./path-data.js";
import { inferOpticalShape, type Primitive, type PrimitiveCategory } from "./primitive.js";

/**
 * A primitive defined by data instead of code: SVG path strings per style.
 * This is the format user-defined elements use in a library folder and the
 * format the agent drafts when the vocabulary lacks a subject.
 */
export interface PathPrimitiveDefinition {
  name: string;
  category: PrimitiveCategory;
  description?: string;
  /** Natural box the paths are authored in. Derived from geometry if omitted. */
  box?: { width: number; height: number };
  opticalShape?: OpticalShape;
  keywords?: string[];
  origin?: "approved" | "draft";
  /** Path data for the outline style. Closed paths are fillable by default. */
  outline: string[];
  /** Path data for the filled style. Falls back to the fillable outline paths. */
  filled?: string[];
}

export class PathPrimitiveError extends Error {
  constructor(message: string, public readonly path: string) {
    super(`${path}: ${message}`);
    this.name = "PathPrimitiveError";
  }
}

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CATEGORIES: readonly PrimitiveCategory[] = ["shape", "object", "symbol"];

function parsePaths(list: unknown, path: string): Shape[] {
  if (!Array.isArray(list) || list.length === 0) throw new PathPrimitiveError("expected a non-empty array", path);
  return list.map((d, i) => {
    if (typeof d !== "string") throw new PathPrimitiveError("expected a path data string", `${path}[${i}]`);
    try {
      return pathShapeFromData(d);
    } catch (error) {
      throw new PathPrimitiveError(error instanceof Error ? error.message : String(error), `${path}[${i}]`);
    }
  });
}

/** Validate an untrusted definition and turn it into a Primitive. */
export function definePathPrimitive(input: unknown): Primitive {
  if (typeof input !== "object" || input === null) throw new PathPrimitiveError("expected an object", "element");
  const def = input as Record<string, unknown>;
  const at = (k: string) => `element.${k}`;

  if (typeof def.name !== "string" || !NAME.test(def.name)) {
    throw new PathPrimitiveError("expected a kebab-case name", at("name"));
  }
  if (typeof def.category !== "string" || !CATEGORIES.includes(def.category as PrimitiveCategory)) {
    throw new PathPrimitiveError(`expected one of ${CATEGORIES.join(", ")}`, at("category"));
  }
  const outline = parsePaths(def.outline, at("outline"));
  const filled = def.filled === undefined ? outline.filter((s) => s.fillable) : parsePaths(def.filled, at("filled"));
  if (filled.length === 0) {
    throw new PathPrimitiveError("no fillable geometry for the filled style; add `filled` paths", at("filled"));
  }

  const bounds = unionBounds([...outline, ...filled].map(shapeBounds));
  let box: { width: number; height: number };
  if (def.box !== undefined) {
    const b = def.box as Record<string, unknown>;
    if (typeof b.width !== "number" || typeof b.height !== "number" || b.width < 0 || b.height < 0) {
      throw new PathPrimitiveError("expected { width, height }", at("box"));
    }
    box = { width: b.width, height: b.height };
    const eps = 1e-6;
    if (bounds.minX < -eps || bounds.minY < -eps || bounds.maxX > box.width + eps || bounds.maxY > box.height + eps) {
      throw new PathPrimitiveError(
        `geometry (${bounds.minX.toFixed(2)}, ${bounds.minY.toFixed(2)} → ${bounds.maxX.toFixed(2)}, ${bounds.maxY.toFixed(2)}) leaves the declared box`,
        at("box"),
      );
    }
  } else {
    box = { width: bounds.maxX, height: bounds.maxY };
    if (bounds.minX < -1e-6 || bounds.minY < -1e-6) {
      throw new PathPrimitiveError("geometry must start at or after 0,0 when `box` is omitted", at("outline"));
    }
  }

  const keywords = Array.isArray(def.keywords) ? def.keywords.filter((k): k is string => typeof k === "string") : [];
  const opticalShape =
    def.opticalShape === undefined
      ? inferOpticalShape(box)
      : (["square", "circle", "horizontal", "vertical"].includes(def.opticalShape as string)
          ? (def.opticalShape as OpticalShape)
          : (() => {
              throw new PathPrimitiveError("expected square, circle, horizontal or vertical", at("opticalShape"));
            })());

  const primitive: Primitive = {
    name: def.name,
    category: def.category as PrimitiveCategory,
    description: typeof def.description === "string" ? def.description : `User-defined element "${def.name}".`,
    box,
    opticalShape,
    keywords,
    origin: def.origin === "approved" ? "approved" : "draft",
    build: (ctx) => (ctx.style === "filled" ? filled : outline),
  };
  return primitive;
}
