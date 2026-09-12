import { describe, expect, it } from "vitest";
import { compose } from "@icon-foundry/icon-composer";
import { lucideInspired } from "@icon-foundry/icon-language";
import { parseIconSpec } from "@icon-foundry/icon-spec";
import { formatNumber, renderSpecToSvg, renderSvg, shapeToPathData } from "./index.js";

const temperatureWarehouse = parseIconSpec({
  name: "temperature-warehouse",
  language: "lucide-inspired",
  canvas: 24,
  elements: [
    { primitive: "warehouse", x: 2, y: 6, width: 16, height: 16 },
    { primitive: "snowflake", x: 15, y: 2, size: 7 },
  ],
});

describe("formatNumber", () => {
  it("strips trailing zeros and negative zero", () => {
    expect(formatNumber(2)).toBe("2");
    expect(formatNumber(2.5)).toBe("2.5");
    expect(formatNumber(1 / 3)).toBe("0.333");
    expect(formatNumber(-0.0001)).toBe("0");
  });
});

describe("renderSvg", () => {
  it("emits language tokens once on the root and minimal children", () => {
    const svg = renderSpecToSvg(
      parseIconSpec({ name: "c", language: "lucide-inspired", canvas: 24, elements: [{ primitive: "circle", x: 2, y: 2, size: 20 }] }),
      lucideInspired,
    );
    expect(svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>',
    );
  });

  it("fills fillable shapes and keeps strokes for symbols in the filled style", () => {
    const svg = renderSpecToSvg({ ...temperatureWarehouse, style: "filled" }, lucideInspired);
    expect(svg).toContain('fill="currentColor"');
    expect(svg).toContain('stroke="none"');
    // snowflake arms remain strokes
    expect(svg.match(/<line /g)?.length).toBe(3);
  });

  it("cuts interior detail out of a filled shape instead of losing it", () => {
    const outline = renderSpecToSvg(
      parseIconSpec({ name: "w", language: "lucide-inspired", canvas: 24, elements: [{ primitive: "warehouse", x: 2, y: 4, width: 20, height: 16 }] }),
      lucideInspired,
    );
    const filled = renderSpecToSvg(
      parseIconSpec({ name: "w", language: "lucide-inspired", canvas: 24, style: "filled", elements: [{ primitive: "warehouse", x: 2, y: 4, width: 20, height: 16 }] }),
      lucideInspired,
    );
    // The body and its door are one path, or the door would be painted over.
    expect(filled).toContain('fill-rule="evenodd"');
    expect(filled.match(/<path /g)?.length).toBe(1);
    expect(outline).not.toContain("evenodd");
    // And the door is still there: the filled path is longer than the body alone.
    expect(filled.length).toBeGreaterThan(120);
  });

  it("keeps a filled warning's exclamation mark", () => {
    const filled = renderSpecToSvg(
      parseIconSpec({ name: "w", language: "lucide-inspired", canvas: 24, style: "filled", elements: [{ primitive: "warning", x: 2, y: 2, size: 20 }] }),
      lucideInspired,
    );
    expect(filled).toContain('fill-rule="evenodd"');
    // Triangle, bar and dot, merged into one path.
    expect(filled.match(/<path /g)?.length).toBe(1);
    expect(filled.match(/M/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it("only writes stroke overrides that differ from the language", () => {
    const spec = parseIconSpec({
      name: "thin",
      language: "lucide-inspired",
      canvas: 24,
      elements: [{ primitive: "line", x: 2, y: 2, size: 20, stroke: { width: 1, cap: "butt" } }],
    });
    const svg = renderSpecToSvg(spec, lucideInspired);
    expect(svg).toContain('stroke-width="1" stroke-linecap="butt"');
    expect(svg).not.toContain('stroke-linejoin="round"/>');
  });

  it("contains no metadata, ids or whitespace noise", () => {
    const svg = renderSpecToSvg(temperatureWarehouse, lucideInspired);
    expect(svg).not.toMatch(/id=|<metadata|<title|\n/);
  });

  it("is deterministic", () => {
    const a = renderSvg(compose(temperatureWarehouse, lucideInspired), lucideInspired);
    const b = renderSvg(compose(temperatureWarehouse, lucideInspired), lucideInspired);
    expect(a).toBe(b);
  });

  it("emits the stroke of the spec's optical size on the root", () => {
    const svg = renderSpecToSvg(
      parseIconSpec({ name: "c16", language: "lucide-inspired", canvas: 16, elements: [{ primitive: "circle", x: 1, y: 1, size: 14 }] }),
      lucideInspired,
    );
    expect(svg).toContain('viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"');
  });

  it("can omit xmlns and dimensions for inline embedding", () => {
    const svg = renderSpecToSvg(temperatureWarehouse, lucideInspired, { xmlns: false, dimensions: false });
    expect(svg.startsWith('<svg viewBox="0 0 24 24" fill="none"')).toBe(true);
  });
});

describe("shapeToPathData", () => {
  it("converts every shape kind to path data", () => {
    expect(shapeToPathData({ kind: "line", x1: 0, y1: 0, x2: 1, y2: 1, fillable: false })).toBe("M0 0L1 1");
    expect(shapeToPathData({ kind: "polyline", points: [[0, 0], [1, 1]], closed: true, fillable: true })).toBe("M0 0L1 1Z");
    expect(shapeToPathData({ kind: "rect", x: 0, y: 0, width: 2, height: 2, rx: 0, fillable: true })).toBe("M0 0H2V2H0Z");
    expect(shapeToPathData({ kind: "circle", cx: 1, cy: 1, r: 1, fillable: true })).toMatch(/^M0 1A1 1 0 1 0 2 1A1 1 0 1 0 0 1Z$/);
  });
});
