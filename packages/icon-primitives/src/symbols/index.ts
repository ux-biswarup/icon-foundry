import { circle, line, p, polyline } from "../geometry.js";
import { definePrimitive } from "../primitive.js";

/** Symbols are mostly strokes and therefore render identically in the outline
 * and filled styles, which keeps badges legible on filled icons. */

export const plusPrimitive = definePrimitive({
  name: "plus",
  category: "symbol",
  description: "A plus sign.",
  box: { width: 24, height: 24 },
  keywords: ["plus", "add", "new", "create", "increase"],
  build: () => [line(12, 0, 12, 24), line(0, 12, 24, 12)],
});

export const minusPrimitive = definePrimitive({
  name: "minus",
  category: "symbol",
  description: "A minus sign.",
  box: { width: 24, height: 0 },
  keywords: ["minus", "remove", "subtract", "decrease", "less"],
  build: () => [line(0, 0, 24, 0)],
});

export const checkPrimitive = definePrimitive({
  name: "check",
  category: "symbol",
  description: "A check mark.",
  box: { width: 24, height: 18 },
  keywords: ["check", "done", "complete", "approved", "confirmed", "success", "ok", "verified"],
  build: () => [polyline([[0, 10], [8, 18], [24, 0]], false, false)],
});

export const xPrimitive = definePrimitive({
  name: "x",
  category: "symbol",
  description: "A cross.",
  box: { width: 24, height: 24 },
  keywords: ["x", "close", "cancel", "delete", "failed", "rejected", "cross"],
  build: () => [line(0, 0, 24, 24), line(24, 0, 0, 24)],
});

export const warningPrimitive = definePrimitive({
  name: "warning",
  category: "symbol",
  description: "A triangle with an exclamation mark.",
  box: { width: 24, height: 22 },
  keywords: ["warning", "alert", "exception", "issue", "problem", "caution", "risk", "error"],
  build: (ctx) => {
    const triangle = polyline([[12, 0], [24, 22], [0, 22]], true);
    if (ctx.style === "filled") return [triangle];
    return [triangle, line(12, 8, 12, 13), line(12, 17, 12, 17.01)];
  },
});

export const snowflakePrimitive = definePrimitive({
  name: "snowflake",
  category: "symbol",
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
  category: "symbol",
  description: "A thermometer with a round bulb.",
  box: { width: 10, height: 24 },
  keywords: ["thermometer", "temperature", "heat", "hot", "warm", "climate", "degrees"],
  build: () => {
    const joinY = 24 - 4 - Math.sqrt(12);
    return [p().M(3, joinY).L(3, 2).A(2, 2, 0, false, true, 7, 2).L(7, joinY).A(4, 4, 0, true, true, 3, joinY).Z().build(true)];
  },
});

export const locationPrimitive = definePrimitive({
  name: "location",
  category: "symbol",
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
    return [pin, circle(10, 10, 3, false)];
  },
});

export const clockPrimitive = definePrimitive({
  name: "clock",
  category: "symbol",
  description: "A clock face with hands.",
  box: { width: 24, height: 24 },
  keywords: ["clock", "time", "schedule", "duration", "hours", "deadline", "timer", "history"],
  build: (ctx) => {
    const face = circle(12, 12, 12);
    if (ctx.style === "filled") return [face];
    return [face, polyline([[12, 6], [12, 12], [16, 14]], false, false)];
  },
});

export const arrowPrimitive = definePrimitive({
  name: "arrow",
  category: "symbol",
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
