import { describe, expect, it } from "vitest";
import { parseIconLanguage, resolveTokens, technical } from "@icon-foundry/icon-language";
import { parseIconSpec } from "@icon-foundry/icon-spec";
import { fillability, fillabilityBySize } from "./fillability.js";

const spec = (elements: unknown[], canvas = 16) =>
  parseIconSpec({ name: "t", language: "technical", canvas, elements });

const codes = (result: ReturnType<typeof fillability>) => result.reasons.map((r) => r.code);

describe("fillability", () => {
  it("fills a closed shape and says so in ink", () => {
    const result = fillability(spec([{ primitive: "square", x: 2, y: 2, size: 12 }]), technical);
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.closedInk).toBe(1);
    expect(result.canvas).toBe(16);
  });

  it("refuses an icon made only of strokes, because there is no silhouette", () => {
    // A check mark has no filled version. That is a fact about the drawing, and
    // the honest answer is the reason rather than a solid blob.
    const result = fillability(spec([{ primitive: "check", x: 2, y: 2, size: 12 }]), technical);
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual(["nothing-closed"]);
    expect(result.closedInk).toBe(0);
  });

  it("flags a knock-out that closes up, and names the element it is in", () => {
    const result = fillability(spec([{ primitive: "building", x: 2, y: 2, size: 12 }]), technical);
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain("cutout-closes-up");
    expect(result.reasons[0]?.source).toBe("elements[0]");
    expect(result.reasons[0]?.message).toMatch(/knock-out is \d+\.\d+ units across/);
  });

  it("asks the language for the minimum rather than deciding one", () => {
    // Same drawing, same size, a language that accepts finer knock-outs. The
    // threshold is the team's, and this is the test that proves it.
    const finer = parseIconLanguage({ ...technical, sizes: undefined, minCutout: 0.5 });
    const result = fillability(spec([{ primitive: "building", x: 2, y: 2, size: 12 }]), finer);
    expect(codes(result)).not.toContain("cutout-closes-up");
    expect(result.ok).toBe(true);
  });

  it("warns that a solid shape swallows line work drawn inside it", () => {
    const result = fillability(
      spec([
        { primitive: "warehouse", x: 1, y: 4, width: 14, height: 10 },
        { primitive: "snowflake", x: 5, y: 6, size: 4 },
      ]),
      technical,
    );
    expect(codes(result)).toContain("detail-swallowed");
    // A warning, not a refusal: the icon fills, it just loses a detail.
    expect(result.ok).toBe(true);
    expect(result.reasons.find((r) => r.code === "detail-swallowed")?.source).toBe("elements[1]");
  });

  it("warns when filling would throw away most of the drawing", () => {
    const result = fillability(
      spec([
        { primitive: "square", x: 7, y: 7, size: 2 },
        { primitive: "line", x: 1, y: 1, size: 14 },
        { primitive: "arrow", x: 1, y: 8, size: 6 },
      ]),
      technical,
    );
    expect(codes(result)).toContain("mostly-line");
    expect(result.closedInk).toBeLessThan(0.5);
  });

  it("answers per optical size, because a hole closes up at 16 and not at 32", () => {
    const narrow = parseIconLanguage({
      ...technical,
      minCutout: 2,
      sizes: [{ canvas: 32, stroke: { width: 2 }, minCutout: 1 }],
    });
    const results = fillabilityBySize(spec([{ primitive: "building", x: 2, y: 2, size: 12 }]), narrow);
    expect(results.map((r) => r.canvas)).toEqual([16, 32]);
    expect(results[0]?.ok).toBe(false);
    expect(results[1]?.ok).toBe(true);
  });

  it("reports an uncomposable spec as a reason instead of throwing", () => {
    const result = fillability(spec([{ primitive: "unicorn", x: 2, y: 2, size: 12 }]), technical);
    expect(result.ok).toBe(false);
    expect(result.reasons[0]?.source).toBe("elements[0]");
  });

  it("defaults the minimum knock-out to one stroke width at that size", () => {
    for (const canvas of [16, 24, 32]) {
      const tokens = resolveTokens(technical, canvas);
      expect(tokens.minCutout).toBe(tokens.stroke.width);
    }
  });
});
