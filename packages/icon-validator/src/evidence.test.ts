import { describe, expect, it } from "vitest";
import { technical } from "@icon-foundry/icon-language";
import { circle, closestPoints, line } from "@icon-foundry/icon-primitives";
import { parseIconSpec, type IconSpec } from "@icon-foundry/icon-spec";
import { validateIconSpec } from "./index.js";
import type { Evidence } from "./types.js";

const C = technical.defaultCanvas;

/** A spec with explicit geometry, so a test can place things exactly. */
const spec = (elements: IconSpec["elements"]): IconSpec =>
  parseIconSpec({ name: "t", language: technical.id, canvas: C, elements });

const evidenceFor = (s: IconSpec, rule: string): Evidence[] =>
  validateIconSpec(s, technical).issues.find((i) => i.rule === rule)?.evidence ?? [];

describe("closestPoints", () => {
  it("returns the two points that witness the distance", () => {
    const [a, b] = closestPoints(line(0, 0, 0, 10), line(4, 0, 4, 10));
    expect(b[0] - a[0]).toBeCloseTo(4, 6);
    expect(a[1]).toBeCloseTo(b[1], 6);
  });

  it("finds the nearest approach of two circles along their centre line", () => {
    const [a, b] = closestPoints(circle(0, 0, 2), circle(10, 0, 3));
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(5, 1);
    expect(a[1]).toBeCloseTo(0, 1);
    expect(b[1]).toBeCloseTo(0, 1);
  });
});

describe("rules keep the geometry they measured", () => {
  it("safeArea reports the bounds that overflowed", () => {
    const found = evidenceFor(spec([{ primitive: "square", x: 0, y: 0, size: C }]), "safeArea");
    expect(found[0]?.kind).toBe("bounds");
    if (found[0]?.kind !== "bounds") throw new Error("expected bounds");
    // The drawing really does reach the canvas edge, which is why it failed.
    expect(found[0].bounds.minX).toBeLessThan(technical.sizes[C]!.safeArea);
  });

  it("negativeSpace reports the two points that are too close, and the gap", () => {
    const tokens = technical.sizes[C]!;
    const found = evidenceFor(
      spec([
        { primitive: "square", x: 1, y: 1, size: 5 },
        { primitive: "square", x: 6.2, y: 1, size: 5 },
      ]),
      "negativeSpace",
    );
    expect(found[0]?.kind).toBe("gap");
    if (found[0]?.kind !== "gap") throw new Error("expected gap");
    expect(found[0].gap).toBeLessThan(tokens.minNegativeSpace);
    // The witnesses face each other across the gap, not across the icon.
    expect(Math.abs(found[0].a[1] - found[0].b[1])).toBeLessThan(1);
  });

  it("grid marks the corners the off-grid values move", () => {
    const found = evidenceFor(spec([{ primitive: "square", x: 1.3, y: 2, size: 6 }]), "grid");
    expect(found[0]?.kind).toBe("points");
    if (found[0]?.kind !== "points") throw new Error("expected points");
    // `x` is off, so both left corners are wrong and both right ones follow it.
    expect(found[0].points.length).toBe(4);
    expect(found[0].points.every(([x]) => x === 1.3 || x === 7.3)).toBe(true);
  });

  it("leaves an issue without anything useful to point at alone", () => {
    const clean = validateIconSpec(spec([{ primitive: "square", x: 2, y: 2, size: 12 }]), technical);
    for (const issue of clean.issues) {
      if (issue.evidence) expect(issue.evidence.length).toBeGreaterThan(0);
    }
  });
});
