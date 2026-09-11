import { describe, expect, it } from "vitest";
import {
  chain,
  circle,
  line,
  offGrammarAngles,
  p,
  rect,
  segmentAngles,
  rotate,
  scale,
  shapeBounds,
  transformShape,
  translate,
} from "./geometry.js";

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("transformShape", () => {
  it("scales and translates circles uniformly", () => {
    const out = transformShape(circle(12, 12, 12), chain(scale(0.5), translate(2, 3)));
    expect(out.kind).toBe("circle");
    if (out.kind !== "circle") return;
    close(out.cx, 8);
    close(out.cy, 9);
    close(out.r, 6);
  });

  it("keeps rects as rects under axis-aligned transforms, including flips", () => {
    const out = transformShape(rect(0, 0, 10, 4, 1), chain(scale(-1, 1), translate(10, 0)));
    expect(out).toMatchObject({ kind: "rect", x: 0, y: 0, width: 10, height: 4, rx: 1 });
  });

  it("converts rotated rects to paths", () => {
    const out = transformShape(rect(0, 0, 10, 4, 0), rotate(45));
    expect(out.kind).toBe("path");
  });

  it("flips arc sweep when the transform mirrors", () => {
    const arc = p().M(0, 0).A(5, 5, 0, false, true, 10, 0).build(false);
    const out = transformShape(arc, scale(-1, 1));
    if (out.kind !== "path") throw new Error("expected path");
    const cmd = out.commands[1];
    expect(cmd?.c === "A" && cmd.sweep).toBe(false);
  });
});

describe("shapeBounds", () => {
  it("bounds lines and circles exactly", () => {
    expect(shapeBounds(line(1, 2, 5, 9))).toEqual({ minX: 1, minY: 2, maxX: 5, maxY: 9 });
    expect(shapeBounds(circle(12, 12, 10))).toEqual({ minX: 2, minY: 2, maxX: 22, maxY: 22 });
  });

  it("includes the bulge of arcs, not just endpoints", () => {
    const arc = p().M(0, 12).A(12, 12, 0, false, true, 24, 12).build(false);
    const b = shapeBounds(arc);
    close(b.minY, 0);
    close(b.maxY, 12);
    close(b.minX, 0);
    close(b.maxX, 24);
  });
});

describe("segmentAngles and offGrammarAngles", () => {
  const t = (shape: Parameters<typeof segmentAngles>[0]) => segmentAngles(shape).map((a) => Number(a.toFixed(1)));

  it("measures straight segments 0–180 and ignores direction", () => {
    expect(t(line(0, 0, 10, 0))).toEqual([0]);
    expect(t(line(10, 0, 0, 0))).toEqual([0]);
    expect(t(line(0, 0, 0, 10))).toEqual([90]);
    expect(t(line(0, 0, 10, 10))).toEqual([45]);
    expect(t(line(10, 0, 0, 10))).toEqual([135]);
  });

  it("skips curves and dot-length segments", () => {
    expect(t(circle(5, 5, 5))).toEqual([]);
    expect(t(p().M(0, 12).A(12, 12, 0, false, true, 24, 12).build(false))).toEqual([]);
    expect(t(line(5, 5, 5, 5.01))).toEqual([]);
  });

  it("walks polylines, closures and rect edges", () => {
    expect(t({ kind: "polyline", points: [[0, 0], [10, 0], [10, 10]], closed: true, fillable: true })).toEqual([0, 90, 45]);
    expect(t(rect(0, 0, 4, 4, 0)).sort()).toEqual([0, 90]);
  });

  it("flags only the angles no allowed angle matches", () => {
    const allowed = [0, 45, 90, 135];
    expect(offGrammarAngles(line(0, 0, 10, 10), allowed, 1)).toEqual([]);
    expect(offGrammarAngles(line(0, 0, 12, 6), allowed, 1).map((a) => Math.round(a))).toEqual([27]);
    // A wide tolerance forgives it; an empty allow-list checks nothing.
    expect(offGrammarAngles(line(0, 0, 12, 6), allowed, 20)).toEqual([]);
    expect(offGrammarAngles(line(0, 0, 12, 6), [], 1)).toEqual([]);
  });
});
