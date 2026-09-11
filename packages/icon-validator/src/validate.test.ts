import { describe, expect, it } from "vitest";
import { lucideInspired, parseIconLanguage, technical } from "@icon-foundry/icon-language";
import { parseIconSpec } from "@icon-foundry/icon-spec";
import { validateIconSpec } from "./index.js";

const spec = (elements: unknown[], extra: Record<string, unknown> = {}) =>
  parseIconSpec({ name: "test", language: "lucide-inspired", canvas: 24, elements, ...extra });

const rules = (result: ReturnType<typeof validateIconSpec>) => result.issues.map((i) => i.rule);

describe("validateIconSpec", () => {
  it("passes a well-behaved icon and lists passed rules", () => {
    const result = validateIconSpec(
      spec([
        { primitive: "warehouse", x: 2, y: 9, width: 15, height: 11, align: { x: "start", y: "end" } },
        { primitive: "snowflake", x: 15, y: 2, size: 7 },
      ]),
      lucideInspired,
    );
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.passed).toContain("safeArea");
    expect(result.passed).toContain("strokeWidth");
    expect(result.passed).toContain("negativeSpace");
  });

  it("validates against the tokens of the spec's optical size", () => {
    const at16 = validateIconSpec(
      spec(
        [
          { primitive: "warehouse", x: 1, y: 6, width: 11, height: 7, align: { x: "start", y: "end" } },
          { primitive: "snowflake", x: 10, y: 1, size: 5, stroke: { width: 1.5 } },
        ],
        { canvas: 16 },
      ),
      lucideInspired,
    );
    // 1.5 is the 16px stroke, so the override is not a deviation there.
    expect(at16.issues).toEqual([]);
    const at24 = validateIconSpec(spec([{ primitive: "circle", x: 2, y: 2, size: 20, stroke: { width: 1.5 } }]), lucideInspired);
    expect(rules(at24)).toContain("strokeWidth");
  });

  it("warns when elements nearly touch or leave too small a gap, but allows crossings", () => {
    const tight = validateIconSpec(
      spec([
        { primitive: "warehouse", x: 2, y: 6, width: 16, height: 16 },
        { primitive: "snowflake", x: 15, y: 2, size: 7 },
      ]),
      lucideInspired,
    );
    expect(tight.valid).toBe(true);
    expect(tight.issues.find((i) => i.rule === "negativeSpace")?.message).toMatch(/Gap between elements\[0\] and elements\[1\] is 0\.\d+ units; the language asks for at least 2/);

    const crossing = validateIconSpec(
      spec([
        { primitive: "circle", x: 2, y: 2, size: 20 },
        { primitive: "line", x: 2, y: 2, size: 20 },
      ]),
      lucideInspired,
    );
    expect(rules(crossing)).not.toContain("negativeSpace");
  });

  it("validates freeform path elements like primitives", () => {
    const ok = validateIconSpec(spec([{ path: "M0 0 L20 0 L20 20 L0 20 Z", x: 2, y: 2, size: 20 }]), lucideInspired);
    expect(ok.valid).toBe(true);
    const bad = validateIconSpec(spec([{ path: "M0 0 Q1 1 2 2", x: 2, y: 2, size: 20 }]), lucideInspired);
    expect(bad.issues[0]).toMatchObject({ rule: "compose", source: "elements[0].path[0]" });
  });

  it("flags a canvas mismatch", () => {
    const result = validateIconSpec(spec([{ primitive: "circle", x: 2, y: 2, size: 16 }], { canvas: 20 }), lucideInspired);
    expect(result.valid).toBe(false);
    expect(rules(result)).toContain("canvas");
  });

  it("flags safe-area violations using real geometry", () => {
    const result = validateIconSpec(spec([{ primitive: "circle", x: 1, y: 1, size: 22 }]), lucideInspired);
    expect(result.valid).toBe(false);
    expect(result.issues.find((i) => i.rule === "safeArea")?.message).toMatch(/leaves the 2-unit safe area by 1.00/);
  });

  it("does not flag safe area when a tall primitive is centred in a square box", () => {
    const result = validateIconSpec(spec([{ primitive: "thermometer", x: 2, y: 2, size: 20 }]), lucideInspired);
    expect(rules(result)).not.toContain("safeArea");
  });

  it("warns about stroke width, cap and join overrides with element paths", () => {
    const result = validateIconSpec(
      spec([{ primitive: "line", x: 2, y: 2, size: 20, stroke: { width: 2.24, cap: "butt", join: "miter" } }]),
      lucideInspired,
    );
    expect(result.valid).toBe(true);
    expect(rules(result).sort()).toEqual(["strokeCap", "strokeJoin", "strokeWidth"]);
    expect(result.issues[0]?.source).toBe("elements[0]");
    expect(result.issues.find((i) => i.rule === "strokeWidth")?.message).toMatch(/12% heavier/);
  });

  it("rejects colors not allowed by the language", () => {
    const result = validateIconSpec(spec([{ primitive: "circle", x: 2, y: 2, size: 20, color: "#ff0000" }]), lucideInspired);
    expect(result.valid).toBe(false);
    expect(rules(result)).toContain("color");
  });

  it("warns when the shape budget is exceeded", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ primitive: "building", x: 2 + i * 3, y: 2, width: 3, height: 20 }));
    const result = validateIconSpec(spec(many), lucideInspired);
    expect(rules(result)).toContain("complexity");
  });

  it("warns about off-grid element boxes", () => {
    const result = validateIconSpec(spec([{ primitive: "circle", x: 2.5, y: 2, size: 19 }]), lucideInspired);
    expect(result.issues.find((i) => i.rule === "grid")?.message).toMatch(/Element x not on the 1-unit grid/);
  });

  it("errors when an element box leaves the canvas", () => {
    const result = validateIconSpec(spec([{ primitive: "circle", x: 10, y: 10, size: 20 }]), lucideInspired);
    expect(result.valid).toBe(false);
    expect(rules(result)).toContain("geometry");
  });

  it("reports unknown primitives as a compose error instead of throwing", () => {
    const result = validateIconSpec(spec([{ primitive: "unicorn", x: 2, y: 2, size: 20 }]), lucideInspired);
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toMatchObject({ rule: "compose", source: "elements[0]" });
  });

  it("rejects styles the language does not allow", () => {
    const outlineOnly = parseIconLanguage({ ...lucideInspired, sizes: undefined, style: { default: "outline", allowed: ["outline"] } });
    const result = validateIconSpec(spec([{ primitive: "circle", x: 2, y: 2, size: 20 }], { style: "filled" }), outlineOnly);
    expect(rules(result)).toContain("style");
  });
});

describe("construction rule", () => {
  const tech = (elements: unknown[], canvas = 16) =>
    parseIconSpec({ name: "t", language: "technical", canvas, elements });

  it("passes the built-in vocabulary, which is drawn to the grammar", () => {
    for (const name of ["document", "vehicle", "check", "clock", "arrow", "x", "device"]) {
      const result = validateIconSpec(tech([{ primitive: name, x: 2, y: 2, size: 12 }]), technical);
      expect(rules(result)).not.toContain("construction");
    }
  });

  it("flags freeform geometry that leaves the language's angles", () => {
    const result = validateIconSpec(tech([{ path: "M0 0 L12 6 L12 0 Z", x: 2, y: 2, size: 12 }]), technical);
    expect(result.valid).toBe(true); // a warning, not an error
    expect(result.issues.find((i) => i.rule === "construction")?.message).toMatch(/26\.6°.*0°, 45°, 90°, 135°/);
  });

  it("accepts freeform geometry drawn on 45° increments", () => {
    const result = validateIconSpec(tech([{ path: "M0 0 L12 0 L12 12 L6 6 Z", x: 2, y: 2, size: 12 }]), technical);
    expect(rules(result)).not.toContain("construction");
  });

  it("flags a rotation that pushes conforming geometry off the grammar", () => {
    expect(rules(validateIconSpec(tech([{ primitive: "arrow", x: 2, y: 2, size: 12, rotate: 90 }]), technical))).not.toContain("construction");
    expect(rules(validateIconSpec(tech([{ primitive: "arrow", x: 2, y: 2, size: 12, rotate: 30 }]), technical))).toContain("construction");
  });

  it("respects primitives whose concept demands other angles", () => {
    for (const name of ["triangle", "warehouse", "package", "warning", "snowflake"]) {
      expect(rules(validateIconSpec(tech([{ primitive: name, x: 2, y: 2, size: 12 }]), technical))).not.toContain("construction");
    }
  });

  it("does nothing for a language that states no angles", () => {
    const result = validateIconSpec(
      parseIconSpec({ name: "t", language: "lucide-inspired", canvas: 24, elements: [{ path: "M0 0 L12 5", x: 2, y: 2, size: 20 }] }),
      lucideInspired,
    );
    expect(rules(result)).not.toContain("construction");
  });
});
