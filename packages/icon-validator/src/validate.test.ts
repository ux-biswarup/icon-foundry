import { describe, expect, it } from "vitest";
import { lucideInspired, parseIconLanguage } from "@icon-foundry/icon-language";
import { parseIconSpec } from "@icon-foundry/icon-spec";
import { validateIconSpec } from "./index.js";

const spec = (elements: unknown[], extra: Record<string, unknown> = {}) =>
  parseIconSpec({ name: "test", language: "lucide-inspired", canvas: 24, elements, ...extra });

const rules = (result: ReturnType<typeof validateIconSpec>) => result.issues.map((i) => i.rule);

describe("validateIconSpec", () => {
  it("passes a well-behaved icon and lists passed rules", () => {
    const result = validateIconSpec(
      spec([
        { primitive: "warehouse", x: 2, y: 6, width: 16, height: 16 },
        { primitive: "snowflake", x: 15, y: 2, size: 7 },
      ]),
      lucideInspired,
    );
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.passed).toContain("safeArea");
    expect(result.passed).toContain("strokeWidth");
  });

  it("flags a canvas mismatch", () => {
    const result = validateIconSpec(spec([{ primitive: "circle", x: 2, y: 2, size: 12 }], { canvas: 16 }), lucideInspired);
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
    const outlineOnly = parseIconLanguage({ ...lucideInspired, style: { default: "outline", allowed: ["outline"] } });
    const result = validateIconSpec(spec([{ primitive: "circle", x: 2, y: 2, size: 20 }], { style: "filled" }), outlineOnly);
    expect(rules(result)).toContain("style");
  });
});
