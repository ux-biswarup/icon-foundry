import { describe, expect, it } from "vitest";
import { getBuiltInExemplars, parseIconLanguage, serializeIconLanguage, technical } from "@icon-foundry/icon-language";
import { parseIconSpec } from "@icon-foundry/icon-spec";
import { builtInScorers, validateIconSpec } from "../index.js";

const spec = (elements: unknown[], extra: Record<string, unknown> = {}) =>
  parseIconSpec({ name: "t", language: "technical", canvas: 16, elements, ...extra });

const score = (s: ReturnType<typeof validateIconSpec>, rule: string) => s.scores.find((x) => x.rule === rule)?.value;

describe("soft preferences", () => {
  it("never change whether an icon is valid", () => {
    const busy = spec([
      { primitive: "building", x: 1, y: 1, size: 14 },
      { primitive: "device", x: 1, y: 1, size: 14 },
    ]);
    const result = validateIconSpec(busy, technical);
    expect(result.valid).toBe(true);
    expect(result.overall).toBeLessThan(0.6);
  });

  it("restraint falls as an icon approaches its budget", () => {
    const simple = validateIconSpec(spec([{ primitive: "circle", x: 1, y: 1, size: 14 }]), technical);
    const busy = validateIconSpec(
      spec([
        { primitive: "building", x: 1, y: 1, width: 7, height: 14 },
        { primitive: "device", x: 9, y: 5, width: 6, height: 6 },
      ]),
      technical,
    );
    expect(score(simple, "restraint")!).toBeGreaterThan(score(busy, "restraint")!);
  });

  it("balance rewards ink near the centre", () => {
    const centred = validateIconSpec(spec([{ primitive: "circle", x: 2, y: 2, size: 12 }]), technical);
    const corner = validateIconSpec(spec([{ primitive: "circle", x: 1, y: 1, size: 5 }]), technical);
    expect(score(centred, "balance")!).toBeGreaterThan(score(corner, "balance")!);
  });

  it("symmetry measures the subject, so a badge is not punished for existing", () => {
    const plain = validateIconSpec(spec([{ primitive: "building", x: 3, y: 1, width: 10, height: 14 }]), technical);
    const badged = validateIconSpec(
      spec([
        { primitive: "building", x: 1, y: 4, width: 9, height: 11, align: { x: "start", y: "end" } },
        { primitive: "plus", x: 10, y: 1, size: 5 },
      ]),
      technical,
    );
    expect(score(plain, "symmetry")!).toBeGreaterThan(0.9);
    expect(score(badged, "symmetry")!).toBeGreaterThan(0.9);
  });

  it("silhouette tells the truth about an icon made only of open strokes", () => {
    const solid = validateIconSpec(spec([{ primitive: "package", x: 2, y: 2, size: 12 }]), technical);
    const strokes = validateIconSpec(spec([{ primitive: "check", x: 2, y: 2, size: 12 }]), technical);
    expect(score(solid, "silhouette")!).toBeGreaterThan(0.5);
    // The language asks every icon to read as a filled silhouette; a check mark
    // does not, and saying so is the point of the tier.
    expect(score(strokes, "silhouette")).toBe(0);
  });

  it("breathing rewards a gap wider than the minimum and is silent when nothing is separate", () => {
    const tight = validateIconSpec(
      spec([
        { primitive: "warehouse", x: 1, y: 6, width: 11, height: 7, align: { x: "start", y: "end" } },
        { primitive: "snowflake", x: 9, y: 1, size: 5 },
      ]),
      technical,
    );
    const alone = validateIconSpec(spec([{ primitive: "circle", x: 2, y: 2, size: 12 }]), technical);
    expect(score(tight, "breathing")).toBeGreaterThan(0);
    expect(score(alone, "breathing")).toBeUndefined();
  });

  it("takes its weights from the language, and a weight of zero turns one off", () => {
    const muted = parseIconLanguage({ ...serializeIconLanguage(technical), preferences: { symmetry: 0, silhouette: 0 } });
    const result = validateIconSpec(spec([{ primitive: "check", x: 2, y: 2, size: 12 }]), muted);
    expect(result.scores.map((s) => s.rule)).not.toContain("silhouette");
    expect(result.scores.map((s) => s.rule)).not.toContain("symmetry");
    // Dropping the preference the icon fails at raises its overall.
    const withAll = validateIconSpec(spec([{ primitive: "check", x: 2, y: 2, size: 12 }]), technical);
    expect(result.overall!).toBeGreaterThan(withAll.overall!);
  });

  it("scores every bundled reference icon without throwing, and ranks them apart", () => {
    const ranked = getBuiltInExemplars("technical").map((s) => validateIconSpec(s, technical).overall ?? 0);
    expect(ranked.every((v) => v >= 0 && v <= 1)).toBe(true);
    expect(Math.max(...ranked) - Math.min(...ranked)).toBeGreaterThan(0.2);
  });

  it("exposes each scorer with a description a designer can read", () => {
    for (const scorer of builtInScorers) {
      expect(scorer.tier).toBe("soft");
      expect(scorer.description.length).toBeGreaterThan(10);
    }
  });
});

describe("refused metaphors", () => {
  it("flags an element whose keywords match a metaphor the language refuses", () => {
    const noPeople = parseIconLanguage({
      ...serializeIconLanguage(technical),
      character: { ...technical.character, metaphors: { use: [], avoid: ["people"] } },
    });
    const result = validateIconSpec(spec([{ primitive: "person", x: 3, y: 1, width: 10, height: 14 }]), noPeople);
    expect(result.issues.find((i) => i.rule === "metaphor")?.message).toMatch(/refuses/);
    // It warns rather than blocks: the team may have a reason.
    expect(result.valid).toBe(true);
  });

  it("says nothing when the language refuses nothing", () => {
    const result = validateIconSpec(spec([{ primitive: "person", x: 3, y: 1, width: 10, height: 14 }]), technical);
    expect(result.issues.map((i) => i.rule)).not.toContain("metaphor");
  });
});
