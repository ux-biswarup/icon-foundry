import type { OpticalShape } from "@icon-foundry/icon-language";
import { shapeBounds, unionBounds, type Shape } from "./geometry.js";
import { pathShapeFromData } from "./path-data.js";
import { inferOpticalShape, type Primitive, type PrimitiveCategory, type PrimitiveContext } from "./primitive.js";
import { arcify } from "./arcify.js";
import { skeletonFromCommands, skeletonToCommands } from "./skeleton.js";

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
  /** Set when the concept demands angles outside the language grammar. */
  freeAngles?: boolean;
  /**
   * How the joints of this element are rounded.
   *
   * `language` — the default — treats the paths as a skeleton and rounds every
   * line-to-line joint by the language's ramp at draw time. That is the whole
   * construction method in one line: straight segments are authored, roundness
   * is a property of the set, and changing the ramp re-rounds every element
   * without anyone reopening a drawing.
   *
   * `keep` draws the paths exactly as authored, for geometry whose corners were
   * drawn deliberately and are not the language's business.
   */
  corners?: "language" | "keep";
  origin?: "approved" | "draft";
  /** Path data for the outline style. Closed paths are fillable by default. */
  outline: string[];
  /** Path data for the filled style. Falls back to the fillable outline paths. */
  filled?: string[];
}

/**
 * Round one authored shape by the language's ramp.
 *
 * Radii are divided by the scale the composer will apply, the same way
 * `localRadius` does, so an element's corners come out the size the language
 * asked for rather than the size its natural box happened to be.
 *
 * Anything that is not path geometry is returned untouched: a rect states its
 * own radius and a circle has no corners.
 */
function round(shape: Shape, ctx: PrimitiveContext): Shape {
  if (shape.kind !== "path" || ctx.cornerRadius <= 0 || ctx.scale <= 0) return shape;
  const skeleton = skeletonFromCommands(shape.commands);
  const construction = ctx.construction;
  const rounded = arcify(skeleton, {
    cornerRadius: ctx.cornerRadius / ctx.scale,
    ...(construction?.corners && { corners: construction.corners }),
    ...(construction?.cornerSnap && { snap: true, grid: (ctx.grid ?? 0) / ctx.scale }),
  });
  return { ...shape, commands: skeletonToCommands(rounded) };
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
    ...(def.freeAngles === true && { freeAngles: true }),
    origin: def.origin === "approved" ? "approved" : "draft",
    build: (ctx) => {
      const shapes = ctx.style === "filled" ? filled : outline;
      if (def.corners === "keep") return shapes;
      return shapes.map((shape) => round(shape, ctx));
    },
  };
  return primitive;
}
