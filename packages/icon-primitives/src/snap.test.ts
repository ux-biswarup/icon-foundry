import { describe, expect, it } from "vitest";
import { isAllowedAngle, snapToConstruction } from "./snap.js";
import type { Point } from "./geometry.js";

const angles = [0, 45, 90, 135];
const round = (p: Point): Point => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6];

describe("snapToConstruction", () => {
  it("pulls a vertex onto an allowed direction from its neighbour", () => {
    // Dragged to 4° off flat: nobody means 4°.
    const { point, angle } = snapToConstruction([10.2, 0.4], [[0, 0]], { grid: 0.5, angles });
    expect(round(point)).toEqual([10, 0]);
    expect(angle).toBe(0);
  });

  it("keeps the angle exactly and the length on the grid", () => {
    const { point, angle } = snapToConstruction([7.1, 7.4], [[0, 0]], { grid: 0.5, angles });
    expect(angle).toBe(45);
    // Exactly diagonal, and the run along it is a whole number of grid steps.
    expect(round(point)[0]).toBe(round(point)[1]);
    expect(Math.round((Math.hypot(point[0], point[1]) / 0.5) * 1e6) / 1e6 % 1).toBe(0);
  });

  it("lands exactly on a neighbour's own coordinate, not a hair off it", () => {
    // Snapped onto a vertical, the x is the neighbour's x — not
    // 15.999999999999998, which is what the sine of a right angle gives you if
    // you believe it. A near-miss here is a near-miss in saved path data.
    const { point } = snapToConstruction([16.4, 7.3], [[16, 16]], { grid: 0.5, angles });
    expect(point[0]).toBe(16);
    const flat = snapToConstruction([7.3, 16.4], [[16, 16]], { grid: 0.5, angles });
    expect(flat.point[1]).toBe(16);
  });

  it("falls back to the grid when no direction is near", () => {
    // 27° from the neighbour is not in the set and not close to one, so the
    // editor does not drag the point somewhere it did not ask to go.
    const { point, angle } = snapToConstruction([10.1, 5.1], [[0, 0]], { grid: 0.5, angles });
    expect(round(point)).toEqual([10, 5]);
    expect(angle).toBeUndefined();
  });

  it("takes the nearer of two neighbours' rays", () => {
    // Between a horizontal neighbour and a vertical one, and closer to being
    // upright from the second.
    const { point } = snapToConstruction([10.1, 5.2], [[0, 0], [10, 10]], { grid: 0.5, angles });
    expect(round(point)[0]).toBe(10);
  });

  it("lets go when the modifier is down", () => {
    const free = snapToConstruction([10.2, 0.4], [[0, 0]], { grid: 0.5, angles, free: true });
    expect(round(free.point)).toEqual([10, 0.5]);
    expect(free.angle).toBeUndefined();
  });

  it("snaps to the grid alone when the language allows any angle", () => {
    const { point } = snapToConstruction([10.2, 0.4], [[0, 0]], { grid: 0.5, angles: [] });
    expect(round(point)).toEqual([10, 0.5]);
  });

  it("never places a vertex on top of its neighbour", () => {
    const { point } = snapToConstruction([0.1, 0.05], [[0, 0]], { grid: 0.5, angles });
    expect(round(point)).not.toEqual([0, 0]);
  });
});

describe("isAllowedAngle", () => {
  it("treats a line as a line, not an arrow", () => {
    expect(isAllowedAngle(45, angles)).toBe(true);
    expect(isAllowedAngle(225, angles)).toBe(true);
    expect(isAllowedAngle(-135, angles)).toBe(true);
    expect(isAllowedAngle(30, angles)).toBe(false);
  });

  it("allows everything when the language states nothing", () => {
    expect(isAllowedAngle(27, [])).toBe(true);
  });
});
