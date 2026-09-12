import { circle, cutout, line, p, polyline, rect, type Shape } from "../geometry.js";
import { accent, definePrimitive, inset, interiorRadius, localRadius, slope, traits } from "../primitive.js";

/**
 * An object is a silhouette in the filled style and an outline with interior
 * detail in the outline style. The interior is not lost when filled: the parts
 * that carry the meaning — a door, a window, a folded corner — come back as
 * holes cut out of the solid shape.
 */

/**
 * One opening, drawn the way the language says openings are drawn.
 *
 * `mixed` keeps whatever the primitive was drawn with, which is how the set
 * stays as it is until somebody decides. `as` is that primitive's own answer.
 */
function opening(
  ctx: Parameters<typeof traits>[0],
  as: "line" | "outline" | "notch",
  x: number,
  y: number,
  w: number,
  h: number,
  rx = 0,
): Shape {
  const style = traits(ctx).aperture;
  const kind = style === "mixed" ? as : style;
  if (kind === "line") return line(x, y + h, x + w, y + h);
  if (kind === "notch") return polyline([[x, y + h], [x, y], [x + w, y], [x + w, y + h]], false, false);
  return rect(x, y, w, h, rx, false);
}

export const buildingPrimitive = definePrimitive({
  name: "building",
  traits: ["cornerRadius", "interiorRadius", "aperture", "inset"],
  category: "object",
  opticalShape: "vertical",
  description: "A tall building with windows and a door.",
  box: { width: 20, height: 24 },
  keywords: ["building", "office", "company", "tower", "headquarters", "hq"],
  build: (ctx) => {
    const body = rect(0, 0, 20, 24, localRadius(ctx, 4));
    // 6 is the drawn distance from the wall to the near edge of a window; the
    // language may crowd or relieve it, but not push a window off the far side.
    const side = inset(ctx, 6, 8);
    const rows = [4, 9, 14];
    if (ctx.style === "filled") {
      return [
        body,
        // Windows and the door are interior corners, so they follow whatever
        // the language says interiors do. A 2-unit window is no wider than the
        // stroke, so in practice it stays square.
        ...rows.flatMap((y) => [
          cutout(rect(side, y, 2, 2, interiorRadius(ctx, 1))),
          cutout(rect(20 - side - 2, y, 2, 2, interiorRadius(ctx, 1))),
        ]),
        cutout(rect(8, 19, 4, 5, interiorRadius(ctx, 1.5))),
      ];
    }
    const windows: Shape[] = rows.flatMap((y) => [
      opening(ctx, "line", side, y - 1, 2, 2),
      opening(ctx, "line", 20 - side - 2, y - 1, 2, 2),
    ]);
    // A doorway meets the floor it stands on, so it is a notch however the rest
    // of the openings are drawn.
    return [body, ...windows, polyline([[8, 24], [8, 19], [12, 19], [12, 24]], false, false)];
  },
});

export const warehousePrimitive = definePrimitive({
  name: "warehouse",
  // No exterior radius: the silhouette is a polyline with no corner to take one.
  freeAngles: true,
  traits: ["interiorRadius", "aperture", "inset", "slope"],
  category: "object",
  opticalShape: "horizontal",
  description: "A wide building with a pitched roof and a bay door.",
  box: { width: 24, height: 20 },
  keywords: ["warehouse", "depot", "storage", "hub", "facility", "plant", "factory"],
  build: (ctx) => {
    // Drawn at a rise of 6 over a run of 12: a half pitch, or isometric.
    const rise = 12 * slope(ctx, 0.5);
    const eave = Math.min(14, 6 + (6 - rise) / 2);
    const outline = polyline([[0, 20], [0, eave], [12, eave - rise], [24, eave], [24, 20]], true);
    const radius = interiorRadius(ctx, 2);
    const side = inset(ctx, 7, 10);
    const w = 24 - side * 2;
    if (ctx.style === "filled") return [outline, cutout(rect(side, 11, w, 9, radius))];
    return [outline, opening(ctx, "outline", side, 11, w, 9, radius), line(side, 15, side + w, 15)];
  },
});

export const packagePrimitive = definePrimitive({
  name: "package",
  // Declines the corner radius: an isometric polyline has no corner to round.
  traits: ["slope"],
  freeAngles: true,
  category: "object",
  opticalShape: "square",
  description: "An isometric box.",
  box: { width: 24, height: 24 },
  keywords: ["package", "box", "parcel", "shipment", "cargo", "goods", "pallet"],
  build: (ctx) => {
    // Drawn isometric: a rise of 6 over a run of 12.
    const d = Math.min(11, 12 * slope(ctx, 0.5));
    const cube = polyline([[12, 0], [24, d], [24, 24 - d], [12, 24], [0, 24 - d], [0, d]], true);
    if (ctx.style === "filled") return [cube];
    return [cube, line(0, d, 12, 2 * d), line(12, 2 * d, 24, d), line(12, 2 * d, 12, 24)];
  },
});

export const documentPrimitive = definePrimitive({
  name: "document",
  // Declines the corner radius: the fold is the shape, and rounding it would
  // read as a torn page rather than a folded one.
  traits: ["slope"],
  category: "object",
  opticalShape: "vertical",
  description: "A sheet of paper with a folded corner.",
  box: { width: 20, height: 24 },
  keywords: ["document", "file", "report", "invoice", "page", "paper", "contract", "note"],
  build: (ctx) => {
    // Drawn at 45°: a fold 7 across and 7 down.
    const f = Math.min(11, 7 * (slope(ctx, 1) / 1));
    const sheet = p().M(0, 0).L(20 - f, 0).L(20, f).L(20, 24).L(0, 24).Z().build(true);
    if (ctx.style === "filled") return [sheet, cutout(polyline([[20 - f, 1], [19, f], [20 - f, f]], true))];
    return [sheet, polyline([[20 - f, 0], [20 - f, f], [20, f]], false, false)];
  },
});

export const personPrimitive = definePrimitive({
  name: "person",
  traits: ["accentSize"],
  category: "object",
  opticalShape: "vertical",
  description: "Head and shoulders of a person.",
  box: { width: 20, height: 24 },
  keywords: ["person", "user", "customer", "driver", "employee", "people", "profile", "account"],
  build: (ctx) => {
    const filled = ctx.style === "filled";
    const r = accent(ctx, 5);
    const head = circle(10, r, r);
    const body = p()
      .M(0, 24)
      .L(0, 19)
      .A(5, 5, 0, false, true, 5, 14)
      .L(15, 14)
      .A(5, 5, 0, false, true, 20, 19)
      .L(20, 24);
    return [head, (filled ? body.Z() : body).build(filled)];
  },
});

export const vehiclePrimitive = definePrimitive({
  name: "vehicle",
  traits: ["cornerRadius", "accentSize", "slope"],
  category: "object",
  opticalShape: "horizontal",
  description: "A delivery truck facing right.",
  box: { width: 24, height: 18 },
  keywords: ["vehicle", "truck", "delivery", "shipping", "transport", "lorry", "van", "fleet"],
  build: (ctx) => {
    const filled = ctx.style === "filled";
    const cargo = rect(0, 0, 14, 12, localRadius(ctx, 4));
    // The windscreen is drawn at 45°: 5 across in 5 down.
    const s = Math.min(9, 5 * slope(ctx, 1));
    const cab = p().M(14, 3).L(24 - s, 3).L(24, 3 + s).L(24, 12).L(14, 12).Z().build(true);
    const w = accent(ctx, 3);
    const wheels = [circle(5, 15, w), circle(19, 15, w)];
    if (filled) return [cargo, cab, ...wheels];
    return [cargo, cab, ...wheels, line(8, 15, 16, 15)];
  },
});

export const devicePrimitive = definePrimitive({
  name: "device",
  traits: ["cornerRadius", "interiorRadius", "aperture", "inset"],
  category: "object",
  opticalShape: "horizontal",
  description: "A monitor on a stand.",
  box: { width: 24, height: 20 },
  keywords: ["device", "monitor", "screen", "display", "computer", "laptop", "terminal", "dashboard"],
  build: (ctx) => {
    const body = rect(0, 0, 24, 15, localRadius(ctx, 4));
    const stand = [line(12, 15, 12, 20), line(7, 20, 17, 20)];
    const pad = inset(ctx, 2.5, 6);
    const screen = { x: pad, y: pad, w: 24 - pad * 2, h: 15 - pad * 2 };
    if (ctx.style === "filled") {
      return [body, cutout(rect(screen.x, screen.y, screen.w, screen.h, interiorRadius(ctx, 2))), ...stand];
    }
    // Drawn with no screen outline at all, which is its own answer to the
    // aperture question: "nothing" is what `mixed` preserves here.
    const aperture = traits(ctx).aperture;
    const face =
      aperture === "mixed" ? [] : [opening(ctx, "outline", screen.x, screen.y, screen.w, screen.h, interiorRadius(ctx, 2))];
    return [body, ...face, ...stand];
  },
});

export const objects = [
  buildingPrimitive,
  warehousePrimitive,
  packagePrimitive,
  documentPrimitive,
  personPrimitive,
  vehiclePrimitive,
  devicePrimitive,
];
