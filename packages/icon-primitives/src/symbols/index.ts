import { circle, cutout, line, p, polyline, rect } from "../geometry.js";
import { accent, definePrimitive, interiorRadius } from "../primitive.js";

/** Symbols are mostly strokes and therefore render identically in the outline
 * and filled styles, which keeps badges legible on filled icons. */

export const plusPrimitive = definePrimitive({
  name: "plus",
  category: "symbol",
  opticalShape: "square",
  description: "A plus sign.",
  box: { width: 24, height: 24 },
  keywords: ["plus", "add", "new", "create", "increase"],
  build: () => [line(12, 0, 12, 24), line(0, 12, 24, 12)],
});

export const minusPrimitive = definePrimitive({
  name: "minus",
  category: "symbol",
  opticalShape: "horizontal",
  description: "A minus sign.",
  box: { width: 24, height: 0 },
  keywords: ["minus", "remove", "subtract", "decrease", "less"],
  build: () => [line(0, 0, 24, 0)],
});

export const checkPrimitive = definePrimitive({
  name: "check",
  category: "symbol",
  opticalShape: "horizontal",
  description: "A check mark.",
  box: { width: 24, height: 17 },
  keywords: ["check", "done", "complete", "approved", "confirmed", "success", "ok", "verified"],
  build: () => [polyline([[0, 10], [7, 17], [24, 0]], false, false)],
});

export const xPrimitive = definePrimitive({
  name: "x",
  category: "symbol",
  opticalShape: "square",
  description: "A cross.",
  box: { width: 24, height: 24 },
  keywords: ["x", "close", "cancel", "delete", "failed", "rejected", "cross"],
  build: () => [line(0, 0, 24, 24), line(24, 0, 0, 24)],
});

export const warningPrimitive = definePrimitive({
  name: "warning",
  // Declines the exterior radius: the triangle is a polyline, with no corner to
  // take one. The exclamation bar is interior, so it follows whatever the
  // language says interiors do.
  traits: ["interiorRadius", "accentSize"],
  freeAngles: true,
  category: "symbol",
  opticalShape: "square",
  description: "A triangle with an exclamation mark.",
  box: { width: 24, height: 22 },
  keywords: ["warning", "alert", "exception", "issue", "problem", "caution", "risk", "error"],
  build: (ctx) => {
    const triangle = polyline([[12, 0], [24, 22], [0, 22]], true);
    // Filled keeps the mark: a warning with no exclamation is just a triangle.
    // The bar is interior detail, and at 2 units it is narrower than two
    // strokes, so it stays square in both styles. Kept as a call rather than a
    // literal so it follows the language if either of those facts changes.
    const bar = interiorRadius(ctx, 1);
    const dot = accent(ctx, 1.2);
    if (ctx.style === "filled") return [triangle, cutout(rect(11, 8, 2, 6, bar)), cutout(circle(12, 17.5, dot))];
    // Outlined, the dot is a round cap on a stroke of no length, so the accent
    // reaches it through the stroke rather than a radius. Left as drawn.
    return [triangle, line(12, 8, 12, 13), line(12, 17, 12, 17.01)];
  },
});

export const snowflakePrimitive = definePrimitive({
  name: "snowflake",
  freeAngles: true,
  category: "symbol",
  opticalShape: "circle",
  description: "A six-armed snowflake.",
  box: { width: 24, height: 24 },
  keywords: ["snowflake", "cold", "frozen", "freeze", "chilled", "refrigerated", "cool", "ice", "winter"],
  build: () => {
    const cx = 12;
    const cy = 12;
    const r = 12;
    const arms = [90, 30, -30].map((deg) => {
      const rad = (deg * Math.PI) / 180;
      const dx = Math.cos(rad) * r;
      const dy = Math.sin(rad) * r;
      return line(cx - dx, cy - dy, cx + dx, cy + dy);
    });
    return arms;
  },
});

export const thermometerPrimitive = definePrimitive({
  name: "thermometer",
  traits: ["accentSize"],
  category: "symbol",
  opticalShape: "vertical",
  description: "A thermometer with a round bulb.",
  box: { width: 10, height: 24 },
  keywords: ["thermometer", "temperature", "heat", "hot", "warm", "climate", "degrees"],
  build: (ctx) => {
    // The bulb is the accent. Its radius sets where the stem meets it, so the
    // two stay joined however large the language draws it.
    const bulb = Math.max(2.2, accent(ctx, 4));
    const joinY = 24 - bulb - Math.sqrt(Math.max(0, bulb * bulb - 4));
    return [
      p().M(3, joinY).L(3, 2).A(2, 2, 0, false, true, 7, 2).L(7, joinY).A(bulb, bulb, 0, true, true, 3, joinY).Z().build(true),
    ];
  },
});

export const locationPrimitive = definePrimitive({
  name: "location",
  traits: ["accentSize"],
  category: "symbol",
  opticalShape: "vertical",
  description: "A map pin.",
  box: { width: 20, height: 24 },
  keywords: ["location", "pin", "place", "address", "map", "gps", "site", "destination"],
  build: (ctx) => {
    const pin = p()
      .M(10, 24)
      .C(10, 24, 0, 16, 0, 10)
      .A(10, 10, 0, false, true, 20, 10)
      .C(20, 16, 10, 24, 10, 24)
      .Z()
      .build(true);
    if (ctx.style === "filled") return [pin];
    return [pin, circle(10, 10, Math.min(7, accent(ctx, 3)), false)];
  },
});

export const clockPrimitive = definePrimitive({
  name: "clock",
  category: "symbol",
  opticalShape: "circle",
  description: "A clock face with hands.",
  box: { width: 24, height: 24 },
  keywords: ["clock", "time", "schedule", "duration", "hours", "deadline", "timer", "history"],
  build: (ctx) => {
    const face = circle(12, 12, 12);
    if (ctx.style === "filled") return [face];
    return [face, polyline([[12, 6], [12, 12], [16, 16]], false, false)];
  },
});

export const arrowPrimitive = definePrimitive({
  name: "arrow",
  category: "symbol",
  opticalShape: "horizontal",
  description: "An arrow pointing right. Rotate the element for other directions.",
  box: { width: 24, height: 20 },
  keywords: ["arrow", "next", "forward", "direction", "move", "transfer", "send", "route"],
  build: () => [line(0, 10, 24, 10), polyline([[14, 0], [24, 10], [14, 20]], false, false)],
});

export const symbols = [
  plusPrimitive,
  minusPrimitive,
  checkPrimitive,
  xPrimitive,
  warningPrimitive,
  snowflakePrimitive,
  thermometerPrimitive,
  locationPrimitive,
  clockPrimitive,
  arrowPrimitive,
];
