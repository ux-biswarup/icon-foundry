import { circle, line, p, polyline, rect, type Shape } from "../geometry.js";
import { definePrimitive, localRadius } from "../primitive.js";

/**
 * Objects return a silhouette in the filled style and add interior detail in
 * the outline style. Interior cut-outs for filled icons are a future renderer
 * feature (see docs/ARCHITECTURE.md).
 */

export const buildingPrimitive = definePrimitive({
  name: "building",
  category: "object",
  description: "A tall building with windows and a door.",
  box: { width: 20, height: 24 },
  keywords: ["building", "office", "company", "tower", "headquarters", "hq"],
  build: (ctx) => {
    const body = rect(0, 0, 20, 24, localRadius(ctx, 4));
    if (ctx.style === "filled") return [body];
    const windows: Shape[] = [
      line(6, 5, 8, 5),
      line(12, 5, 14, 5),
      line(6, 10, 8, 10),
      line(12, 10, 14, 10),
      line(6, 15, 8, 15),
      line(12, 15, 14, 15),
    ];
    return [body, ...windows, line(10, 24, 10, 20)];
  },
});

export const warehousePrimitive = definePrimitive({
  name: "warehouse",
  category: "object",
  description: "A wide building with a pitched roof and a bay door.",
  box: { width: 24, height: 20 },
  keywords: ["warehouse", "depot", "storage", "hub", "facility", "plant", "factory"],
  build: (ctx) => {
    const outline = polyline([[0, 20], [0, 6], [12, 0], [24, 6], [24, 20]], true);
    if (ctx.style === "filled") return [outline];
    return [outline, rect(7, 11, 10, 9, 0, false), line(7, 15, 17, 15)];
  },
});

export const packagePrimitive = definePrimitive({
  name: "package",
  category: "object",
  description: "An isometric box.",
  box: { width: 24, height: 24 },
  keywords: ["package", "box", "parcel", "shipment", "cargo", "goods", "pallet"],
  build: (ctx) => {
    const cube = polyline([[12, 0], [24, 6], [24, 18], [12, 24], [0, 18], [0, 6]], true);
    if (ctx.style === "filled") return [cube];
    return [cube, line(0, 6, 12, 12), line(12, 12, 24, 6), line(12, 12, 12, 24)];
  },
});

export const documentPrimitive = definePrimitive({
  name: "document",
  category: "object",
  description: "A sheet of paper with a folded corner.",
  box: { width: 20, height: 24 },
  keywords: ["document", "file", "report", "invoice", "page", "paper", "contract", "note"],
  build: (ctx) => {
    const sheet = p().M(0, 0).L(13, 0).L(20, 7).L(20, 24).L(0, 24).Z().build(true);
    if (ctx.style === "filled") return [sheet];
    return [sheet, polyline([[13, 0], [13, 7], [20, 7]], false, false)];
  },
});

export const personPrimitive = definePrimitive({
  name: "person",
  category: "object",
  description: "Head and shoulders of a person.",
  box: { width: 20, height: 24 },
  keywords: ["person", "user", "customer", "driver", "employee", "people", "profile", "account"],
  build: (ctx) => {
    const filled = ctx.style === "filled";
    const head = circle(10, 5, 5);
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
  category: "object",
  description: "A delivery truck facing right.",
  box: { width: 24, height: 18 },
  keywords: ["vehicle", "truck", "delivery", "shipping", "transport", "lorry", "van", "fleet"],
  build: (ctx) => {
    const filled = ctx.style === "filled";
    const cargo = rect(0, 0, 14, 12, 0);
    const cab = p().M(14, 3).L(19, 3).L(24, 8).L(24, 12).L(14, 12).Z().build(true);
    const wheels = [circle(5, 15, 3), circle(19, 15, 3)];
    if (filled) return [cargo, cab, ...wheels];
    return [cargo, cab, ...wheels, line(8, 15, 16, 15)];
  },
});

export const devicePrimitive = definePrimitive({
  name: "device",
  category: "object",
  description: "A monitor on a stand.",
  box: { width: 24, height: 20 },
  keywords: ["device", "monitor", "screen", "display", "computer", "laptop", "terminal", "dashboard"],
  build: (ctx) => [
    rect(0, 0, 24, 15, localRadius(ctx, 4)),
    line(12, 15, 12, 20),
    line(7, 20, 17, 20),
  ],
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
