import { describe, expect, it } from "vitest";
import { DIAGONAL_ANGLES, parseIconLanguage, serializeIconLanguage, technical } from "@icon-foundry/icon-language";
import { offify } from "@icon-foundry/icon-composer";
import { parseIconSpec } from "@icon-foundry/icon-spec";
import { validateIconSpec } from "./index.js";

/**
 * Following the pointer.
 *
 * The tests that matter here are the ones where the rule says *nothing*: a
 * convention rule that fires on a triangle is worse than no rule, because it
 * teaches a team to skim past every warning underneath it.
 */

/** A freeform stroke, so the drawing's lean is the author's rather than a
 *  primitive's. `d` is authored in the 24-unit canvas and placed as itself. */
const stroke = (d: string) => ({ path: d, natural: { width: 24, height: 24 }, x: 0, y: 0, width: 24, height: 24 });

const icon = (elements: unknown[], name = "test") =>
  parseIconSpec({ name, language: "technical", canvas: 24, elements });

const directionIssues = (spec: ReturnType<typeof icon>, language = technical) =>
  validateIconSpec(spec, language).issues.filter((i) => i.rule === "direction");

/** Up-left and up-right leans, as the same stroke mirrored. */
const UP_RIGHT = "M6 18L18 6";
const UP_LEFT = "M6 6L18 18";

describe("the direction rule", () => {
  it("passes a diagonal that runs the way the set does", () => {
    expect(technical.grammar.diagonal).toBe("up-right");
    expect(directionIssues(icon([stroke(UP_RIGHT)]))).toEqual([]);
  });

  it("marks a diagonal that runs against it, and points at the line", () => {
    const issues = directionIssues(icon([stroke(UP_LEFT)]));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe("warning");
    expect(issues[0]!.message).toMatch(/leans up left/);
    // Detection here, drawing in the studio: the rule hands back the segment.
    expect(issues[0]!.evidence?.[0]).toMatchObject({ kind: "shape", shape: { kind: "line" } });
  });

  it("follows the language rather than a hardcoded direction", () => {
    const other = parseIconLanguage({
      ...serializeIconLanguage(technical),
      grammar: { ...technical.grammar, diagonal: "up-left" },
    });
    expect(directionIssues(icon([stroke(UP_LEFT)]), other)).toEqual([]);
    expect(directionIssues(icon([stroke(UP_RIGHT)]), other)).toHaveLength(1);
  });

  it("says nothing at all when the set states no direction", () => {
    const neutral = parseIconLanguage({
      ...serializeIconLanguage(technical),
      grammar: { ...technical.grammar, diagonal: "none" },
    });
    expect(directionIssues(icon([stroke(UP_LEFT)]), neutral)).toEqual([]);
  });

  /*
   * The objection this rule had to answer before it could exist: no rule can
   * tell which diagonal is the one that matters. It does not try. It speaks
   * only when the drawing has one lean rather than a pair.
   */
  it("says nothing about a drawing whose diagonals cancel", () => {
    // A chevron pair, an X, a triangle: two leans, neither of them a choice.
    expect(directionIssues(icon([stroke(`${UP_LEFT}M6 18L18 6`)]))).toEqual([]);
    expect(directionIssues(icon([stroke("M4 20L12 4L20 20Z")]))).toEqual([]);
  });

  it("says nothing about flat, upright or barely-off geometry", () => {
    expect(directionIssues(icon([stroke("M4 12L20 12M12 4L12 20")]))).toEqual([]);
    // A degree off horizontal is a horizontal line with a bug in it, not a lean.
    expect(directionIssues(icon([stroke("M4 12L20 12.3")]))).toEqual([]);
  });

  it("leaves alone a part whose concept fixes its diagonals", () => {
    // A document's fold leans up-left in every set, because that is where a page
    // folds. It declares that once in the vocabulary instead of every icon that
    // uses it carrying an exception.
    expect(directionIssues(icon([{ primitive: "document", x: 4, y: 2, width: 16, height: 20 }]))).toEqual([]);
    expect(directionIssues(icon([{ primitive: "clock", x: 2, y: 2, size: 20 }]))).toEqual([]);
    expect(directionIssues(icon([{ primitive: "check", x: 2, y: 4, width: 20, height: 15 }]))).toEqual([]);
  });

  describe("the slash", () => {
    it("expects the cancelled form to cut against the set", () => {
      const off = offify(icon([{ primitive: "circle", x: 5, y: 5, size: 14 }], "bell"), technical);
      expect(off.name).toBe("bell-off");
      expect(directionIssues(parseIconSpec(off))).toEqual([]);
    });

    it("marks a slash drawn along the set's own diagonal", () => {
      // The same icon with the slash mirrored: a line through a drawing that
      // lies along the pointer reads as part of the drawing.
      const wrong = icon([{ primitive: "circle", x: 5, y: 5, size: 14 }, stroke(UP_RIGHT)], "bell-off");
      const issues = directionIssues(wrong);
      expect(issues).toHaveLength(1);
      expect(issues[0]!.message).toMatch(/cancels a direction/);
    });

    it("draws the slash at the angle the rule expects", () => {
      // The one number both halves depend on, asserted once so the generator and
      // the checker cannot drift apart silently.
      expect(DIAGONAL_ANGLES["up-left"]).toBe(45);
      expect(DIAGONAL_ANGLES["up-right"]).toBe(135);
    });
  });

  describe("the badge corner", () => {
    const subject = { primitive: "square", x: 2, y: 6, width: 16, height: 16 };

    it("passes a badge in the corner the set names", () => {
      expect(technical.grammar.badge.corner).toBe("top-right");
      expect(directionIssues(icon([subject, { primitive: "circle", x: 15, y: 2, size: 7 }]))).toEqual([]);
    });

    it("marks a badge in a different corner", () => {
      const issues = directionIssues(icon([{ primitive: "square", x: 6, y: 2, width: 16, height: 16 }, { primitive: "circle", x: 2, y: 15, size: 7 }]));
      expect(issues).toHaveLength(1);
      expect(issues[0]!.message).toMatch(/bottom left/);
      expect(issues[0]!.source).toBe("elements[1]");
    });

    it("says nothing about two parts of comparable size", () => {
      // Two halves of one composition are not a subject and a badge, and which
      // corner they are in is not a decision anyone took.
      expect(
        directionIssues(icon([{ primitive: "square", x: 2, y: 2, size: 9 }, { primitive: "square", x: 13, y: 13, size: 9 }])),
      ).toEqual([]);
    });

    it("says nothing about a small part directly under the subject", () => {
      // A base, a shadow, a caption bar: offset one way only, so it is not in a
      // corner and was never a badge placed wrongly.
      expect(
        directionIssues(icon([{ primitive: "square", x: 4, y: 2, width: 16, height: 16 }, { primitive: "square", x: 9, y: 19, size: 6 }])),
      ).toEqual([]);
    });
  });
});
