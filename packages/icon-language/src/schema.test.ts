import { describe, expect, it } from "vitest";
import schema from "../../../languages/language.schema.json";
import lucideInspired from "../../../languages/lucide-inspired/language.json";
import technical from "../../../languages/technical/language.json";
import { parseIconLanguage, serializeIconLanguage } from "./parse.js";
import type { IconLanguageInput } from "./types.js";

/**
 * The schema is a public contract and the parser is the implementation, and
 * nothing kept them together. They drifted three features apart before anyone
 * noticed, because a schema nobody validates against is a document, not a
 * contract.
 *
 * This walks a language document against the schema and reports any field the
 * parser accepts that the schema does not describe. It is not a full JSON
 * Schema validator and is not trying to be — the failure it exists to catch is
 * "a field was added to the parser and not to the schema".
 */

type Spec = Record<string, unknown>;
const defs = (schema as Spec)["$defs"] as Record<string, Spec>;

function resolve(spec: Spec): Spec {
  const ref = spec["$ref"];
  if (typeof ref !== "string") return spec;
  const target = defs[ref.split("/").pop()!];
  if (!target) throw new Error(`schema has a dangling $ref: ${ref}`);
  const { $ref: _drop, ...rest } = spec;
  return { ...target, ...rest };
}

function walk(value: unknown, rawSpec: Spec, path: string, problems: string[]): void {
  const spec = resolve(rawSpec);
  if (Array.isArray(value)) {
    const items = spec["items"] as Spec | undefined;
    if (items) value.forEach((item, i) => walk(item, items, `${path}[${i}]`, problems));
    return;
  }
  if (typeof value !== "object" || value === null) return;

  const properties = (spec["properties"] ?? {}) as Record<string, Spec>;
  const extra = spec["additionalProperties"];
  for (const [key, child] of Object.entries(value)) {
    const childSpec = properties[key];
    if (childSpec) walk(child, childSpec, `${path}.${key}`, problems);
    else if (extra === false) problems.push(`${path}.${key} is not in the schema`);
  }
  for (const required of (spec["required"] ?? []) as string[]) {
    if (!(required in value)) problems.push(`${path}.${required} is required and missing`);
  }
}

function check(document: unknown): string[] {
  const problems: string[] = [];
  walk(document, schema as Spec, "language", problems);
  return problems;
}

/** A language that writes down every optional field, so nothing hides by being absent. */
const maximal: IconLanguageInput = {
  id: "maximal",
  name: "Maximal",
  version: "1.0.0",
  description: "Sets every field the parser accepts.",
  canvas: 16,
  grid: 0.5,
  safeArea: 1,
  stroke: { width: 1.25, cap: "round", join: "round" },
  cornerRadius: 1.5,
  style: { default: "outline", allowed: ["outline", "filled"] },
  colors: { allowed: ["currentColor"] },
  detail: "low",
  limits: { maxElements: 3, maxShapes: 9 },
  minNegativeSpace: 1.5,
  optical: {
    square: { x: 2, y: 2, width: 12, height: 12 },
    circle: { x: 1, y: 1, width: 14, height: 14 },
    horizontal: { x: 1, y: 3, width: 14, height: 10 },
    vertical: { x: 3, y: 1, width: 10, height: 14 },
  },
  optics: { junctionNotch: 0.4, junctionAngle: 50, interiorThin: 0.25, dotRatio: 1.6 },
  character: {
    purpose: "A purpose.",
    axes: { geometric: 80, minimal: 75, technical: 70, literal: 60 },
    metaphors: { use: ["containers"], avoid: ["faces"] },
    vocabulary: ["depot"],
    principles: ["A principle."],
  },
  grammar: {
    angles: [0, 45, 90, 135],
    angleTolerance: 1,
    closedShapes: true,
    diagonal: "up-right",
    badge: { ratio: 0.35, corner: "top-right" },
    arrangements: { allowed: ["single", "badge", "stack", "row", "contain"], spacing: 1.5 },
    silhouette: true,
  },
  construction: {
    interiorRadius: 0.5,
    grade: -0.08,
    aperture: "notch",
    inset: 1.2,
    accentSize: 1.1,
    slope: "iso",
    exceptions: { vehicle: { set: { accentSize: 1.4 }, why: "the wheels vanished at 16px" } },
  },
  derivation: { minimal: { maxElements: [7, 1], badgeRatio: [0.44, 0.26] }, technical: { cornerRadius: [0.2, 0.07] } },
  preferences: { restraint: 1.5, symmetry: 0 },
  sizes: [
    {
      canvas: 24,
      grid: 0.5,
      safeArea: 1.5,
      stroke: { width: 1.5 },
      cornerRadius: 2,
      limits: { maxElements: 4, maxShapes: 12 },
      minNegativeSpace: 2,
      optics: { junctionNotch: 0.6 },
    },
  ],
};

describe("the published language schema", () => {
  it("describes every language that ships with the repo", () => {
    expect(check(technical)).toEqual([]);
    expect(check(lucideInspired)).toEqual([]);
  });

  it("describes every field the parser accepts", () => {
    expect(check(maximal)).toEqual([]);
  });

  it("describes everything the serialiser can write", () => {
    // The round trip is what a team's folder actually holds after an edit in
    // the studio, so it is the document the schema has to cover.
    for (const source of [technical, lucideInspired, maximal]) {
      expect(check(serializeIconLanguage(parseIconLanguage(source)))).toEqual([]);
    }
  });

  it("agrees with the parser about what a language may leave out", () => {
    const required = (schema as { required: string[] }).required;
    const bare: Record<string, unknown> = {};
    for (const key of required) bare[key] = (maximal as unknown as Record<string, unknown>)[key];
    // Required by the schema is enough for the parser, and nothing more is.
    expect(() => parseIconLanguage(bare)).not.toThrow();
    for (const key of required) {
      const missing = { ...bare };
      delete missing[key];
      expect(() => parseIconLanguage(missing), `omitting ${key} should fail`).toThrow();
    }
  });
});
