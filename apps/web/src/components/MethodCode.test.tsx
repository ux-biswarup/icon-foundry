import { technical } from "@icon-foundry/icon-language";
import { skeletonFromPathData } from "@icon-foundry/icon-primitives";
import { describe, expect, it } from "vitest";
import { segmentViews } from "../lib/method-geometry.js";
import { tokenise } from "./MethodCode.js";

/**
 * The tokeniser has one job that matters: number segments the way the parser
 * does.
 *
 * Everything the code pane offers rests on it. If the two disagree by one, then
 * putting the caret in a segment lights up its neighbour on the canvas, and
 * every selection the pane makes is quietly pointing at the wrong geometry.
 */

const ids = (text: string) => [...new Set(tokenise(text).flatMap((s) => (s.seg ? [s.seg] : [])))];

/** What the parser calls the same segments, which is the answer to match. */
const parsed = (text: string) =>
  segmentViews(skeletonFromPathData(text.split("\n")), technical).map((v) => v.id);

describe("tokenise", () => {
  it("numbers a plain path exactly as the parser does", () => {
    const text = "M0.5 0.5 L12.5 0.5 L12.5 12.5 L0.5 12.5 Z";
    expect(ids(text)).toEqual(parsed(text));
    expect(ids(text)).toEqual(["0:0", "0:1", "0:2", "0:3"]);
  });

  it("does not make a segment out of the move that opens a subpath", () => {
    const spans = tokenise("M4 5 L6 7");
    const move = spans.filter((s) => s.text === "4" || s.text === "5");
    expect(move.every((s) => s.seg === undefined)).toBe(true);
  });

  it("counts a repeated argument group as a further segment", () => {
    // `L1 2 3 4` is two lines. Treating the repeat as part of the first would
    // put half the numbers on screen under the wrong segment.
    const text = "M0 0 L1 2 3 4";
    expect(ids(text)).toEqual(["0:0", "0:1"]);
    expect(ids(text)).toEqual(parsed(text));
  });

  it("keeps a second subpath's segments apart from the first's", () => {
    const text = "M0 0 L5 0\nM0 5 L5 5 L5 9";
    expect(ids(text)).toEqual(["0:0", "1:0", "1:1"]);
    expect(ids(text)).toEqual(parsed(text));
  });

  it("gives an arc all seven of its numbers", () => {
    const spans = tokenise("M0 10 A10 10 0 0 1 10 0");
    expect(spans.filter((s) => s.seg === "0:0" && s.kind === "number")).toHaveLength(7);
  });

  it("loses no characters, so the highlight lines up with the text", () => {
    // The layer is painted under a transparent textarea. A dropped character
    // slides every colour after it off the token it belongs to.
    const text = "M0.5 0.5 L12.5 0.5  L12.5 12.5 Z";
    expect(tokenise(text).map((s) => s.text).join("")).toBe(text);
  });
});
