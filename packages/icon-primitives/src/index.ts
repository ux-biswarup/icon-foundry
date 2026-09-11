export * from "./geometry.js";
export * from "./primitive.js";
export { PathDataError, parsePathData, pathShapeFromData, isClosedPath } from "./path-data.js";
export { PathPrimitiveError, definePathPrimitive, type PathPrimitiveDefinition } from "./path-primitive.js";
export { PrimitiveRegistry, builtInPrimitives, defaultRegistry } from "./registry.js";
export * from "./shapes/index.js";
export * from "./objects/index.js";
export * from "./symbols/index.js";
