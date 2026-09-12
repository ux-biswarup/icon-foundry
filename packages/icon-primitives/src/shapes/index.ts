import { circle, line, p, polyline, rect } from "../geometry.js";
import { definePrimitive, localRadius } from "../primitive.js";

export const circlePrimitive = definePrimitive({
  name: "circle",
  category: "shape",
  opticalShape: "circle",
  description: "A circle filling its box.",
  box: { width: 24, height: 24 },
  keywords: ["circle", "round", "dot", "ring"],
  build: () => [circle(12, 12, 12)],
});

export const squarePrimitive = definePrimitive({
  name: "square",
  // Declines the corner radius on purpose: it is the sharp sibling of
  // rounded-rectangle, and a set that wants round has one already.
  category: "shape",
  opticalShape: "square",
  description: "A sharp-cornered square.",
  box: { width: 24, height: 24 },
  keywords: ["square", "box-outline"],
  build: () => [rect(0, 0, 24, 24, 0)],
});

export const roundedRectanglePrimitive = definePrimitive({
  name: "rounded-rectangle",
  traits: ["cornerRadius"],
  category: "shape",
  opticalShape: "square",
  description: "A rectangle using the language corner radius.",
  box: { width: 24, height: 24 },
  keywords: ["rectangle", "rounded", "card", "frame"],
  build: (ctx) => [rect(0, 0, 24, 24, localRadius(ctx, 12))],
});

export const trianglePrimitive = definePrimitive({
  name: "triangle",
  freeAngles: true,
  category: "shape",
  opticalShape: "square",
  description: "An upward-pointing triangle.",
  box: { width: 24, height: 22 },
  keywords: ["triangle", "delta"],
  build: () => [polyline([[12, 0], [24, 22], [0, 22]], true)],
});

export const linePrimitive = definePrimitive({
  name: "line",
  category: "shape",
  opticalShape: "horizontal",
  description: "A horizontal line. Rotate the element for other angles.",
  box: { width: 24, height: 0 },
  keywords: ["line", "divider", "dash"],
  build: () => [line(0, 0, 24, 0)],
});

export const arcPrimitive = definePrimitive({
  name: "arc",
  category: "shape",
  opticalShape: "horizontal",
  description: "An open half-circle bulging upward.",
  box: { width: 24, height: 12 },
  keywords: ["arc", "curve", "half-circle"],
  build: () => [p().M(0, 12).A(12, 12, 0, false, true, 24, 12).build(false)],
});

export const shapes = [
  circlePrimitive,
  squarePrimitive,
  roundedRectanglePrimitive,
  trianglePrimitive,
  linePrimitive,
  arcPrimitive,
];
