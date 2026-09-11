import { composedBounds } from "@icon-foundry/icon-composer";
import { isFiniteShape } from "@icon-foundry/icon-primitives";
import { elementBox, type IconElement } from "@icon-foundry/icon-spec";
import { defineRule, type ValidationIssue, type ValidationRule } from "../types.js";

function walk(elements: IconElement[], prefix: string, visit: (el: IconElement, source: string) => void): void {
  elements.forEach((el, i) => {
    const source = `${prefix}[${i}]`;
    visit(el, source);
    if (el.children) walk(el.children, `${source}.children`, visit);
  });
}

const EPS = 1e-6;
const onGrid = (value: number, grid: number): boolean => {
  const q = value / grid;
  return Math.abs(q - Math.round(q)) < EPS;
};

export const canvasRule = defineRule({
  id: "canvas",
  label: "Canvas size",
  check: ({ spec, language }) =>
    spec.canvas === language.canvas
      ? []
      : [
          {
            severity: "error",
            rule: "canvas",
            message: `Canvas is ${spec.canvas} but the language "${language.name}" requires ${language.canvas}.`,
          },
        ],
});

export const styleRule = defineRule({
  id: "style",
  label: "Style",
  check: ({ spec, language }) => {
    const issues: ValidationIssue[] = [];
    const check = (style: string | undefined, source: string | undefined) => {
      if (style && !language.style.allowed.includes(style as "outline" | "filled")) {
        issues.push({
          severity: "error",
          rule: "style",
          message: `Style "${style}" is not allowed by the language (allowed: ${language.style.allowed.join(", ")}).`,
          ...(source && { source }),
        });
      }
    };
    check(spec.style, undefined);
    walk(spec.elements, "elements", (el, source) => check(el.style, source));
    return issues;
  },
});

export const geometryRule = defineRule({
  id: "geometry",
  label: "Geometry",
  check: ({ spec, composed }) => {
    const issues: ValidationIssue[] = [];
    walk(spec.elements, "elements", (el, source) => {
      const box = elementBox(el);
      if (box.width <= 0 || box.height <= 0) {
        issues.push({ severity: "error", rule: "geometry", message: "Element box has no area.", source });
      }
    });
    // Top-level boxes must sit inside the canvas.
    spec.elements.forEach((el, i) => {
      const box = elementBox(el);
      if (box.x < 0 || box.y < 0 || box.x + box.width > spec.canvas || box.y + box.height > spec.canvas) {
        issues.push({
          severity: "error",
          rule: "geometry",
          message: `Element box (${box.x}, ${box.y}, ${box.width} × ${box.height}) extends outside the ${spec.canvas} canvas.`,
          source: `elements[${i}]`,
        });
      }
    });
    if (composed) {
      for (const item of composed.shapes) {
        if (!isFiniteShape(item.shape)) {
          issues.push({
            severity: "error",
            rule: "geometry",
            message: `Primitive "${item.primitive}" produced degenerate or non-finite geometry.`,
            source: item.source,
          });
        }
      }
    }
    return issues;
  },
});

export const safeAreaRule = defineRule({
  id: "safeArea",
  label: "Safe area",
  check: ({ language, composed }) => {
    if (!composed || composed.shapes.length === 0) return [];
    const b = composedBounds(composed);
    const min = language.safeArea;
    const max = language.canvas - language.safeArea;
    const overflow = Math.max(min - b.minX, min - b.minY, b.maxX - max, b.maxY - max);
    if (overflow <= EPS) return [];
    return [
      {
        severity: "error",
        rule: "safeArea",
        message: `Geometry leaves the ${language.safeArea}-unit safe area by ${overflow.toFixed(2)} units (bounds ${b.minX.toFixed(2)}, ${b.minY.toFixed(2)} → ${b.maxX.toFixed(2)}, ${b.maxY.toFixed(2)}).`,
      },
    ];
  },
});

export const strokeWidthRule = defineRule({
  id: "strokeWidth",
  label: "Stroke width",
  check: ({ language, composed }) => {
    if (!composed) return [];
    const seen = new Set<string>();
    const issues: ValidationIssue[] = [];
    for (const item of composed.shapes) {
      if (item.stroke.width === language.stroke.width || seen.has(item.source)) continue;
      seen.add(item.source);
      const pct = Math.round(((item.stroke.width - language.stroke.width) / language.stroke.width) * 100);
      issues.push({
        severity: "warning",
        rule: "strokeWidth",
        message: `Stroke is ${Math.abs(pct)}% ${pct > 0 ? "heavier" : "lighter"} than the language stroke width (${item.stroke.width} vs ${language.stroke.width}).`,
        source: item.source,
      });
    }
    return issues;
  },
});

export const strokeCapRule = defineRule({
  id: "strokeCap",
  label: "Stroke caps",
  check: ({ language, composed }) => {
    if (!composed) return [];
    const seen = new Set<string>();
    const issues: ValidationIssue[] = [];
    for (const item of composed.shapes) {
      if (item.stroke.cap === language.stroke.cap || seen.has(item.source)) continue;
      seen.add(item.source);
      issues.push({
        severity: "warning",
        rule: "strokeCap",
        message: `Stroke cap "${item.stroke.cap}" differs from the language cap "${language.stroke.cap}".`,
        source: item.source,
      });
    }
    return issues;
  },
});

export const strokeJoinRule = defineRule({
  id: "strokeJoin",
  label: "Stroke joins",
  check: ({ language, composed }) => {
    if (!composed) return [];
    const seen = new Set<string>();
    const issues: ValidationIssue[] = [];
    for (const item of composed.shapes) {
      if (item.stroke.join === language.stroke.join || seen.has(item.source)) continue;
      seen.add(item.source);
      issues.push({
        severity: "warning",
        rule: "strokeJoin",
        message: `Stroke join "${item.stroke.join}" differs from the language join "${language.stroke.join}".`,
        source: item.source,
      });
    }
    return issues;
  },
});

export const colorRule = defineRule({
  id: "color",
  label: "Colors",
  check: ({ spec, language }) => {
    const issues: ValidationIssue[] = [];
    walk(spec.elements, "elements", (el, source) => {
      if (el.color && !language.colors.allowed.includes(el.color)) {
        issues.push({
          severity: "error",
          rule: "color",
          message: `Color "${el.color}" is not allowed (allowed: ${language.colors.allowed.join(", ")}).`,
          source,
        });
      }
    });
    return issues;
  },
});

export const complexityRule = defineRule({
  id: "complexity",
  label: "Complexity",
  check: ({ language, composed }) => {
    if (!composed) return [];
    const issues: ValidationIssue[] = [];
    if (composed.elementCount > language.limits.maxElements) {
      issues.push({
        severity: "warning",
        rule: "complexity",
        message: `${composed.elementCount} primitives exceed the language budget of ${language.limits.maxElements} for "${language.detail}" detail.`,
      });
    }
    if (composed.shapes.length > language.limits.maxShapes) {
      issues.push({
        severity: "warning",
        rule: "complexity",
        message: `${composed.shapes.length} shapes exceed the language budget of ${language.limits.maxShapes}.`,
      });
    }
    return issues;
  },
});

export const gridRule = defineRule({
  id: "grid",
  label: "Grid alignment",
  check: ({ spec, language }) => {
    const issues: ValidationIssue[] = [];
    // Only top-level boxes are checked: group children live in a virtual canvas.
    spec.elements.forEach((el, i) => {
      const box = elementBox(el);
      const off = (["x", "y", "width", "height"] as const).filter((k) => !onGrid(box[k], language.grid));
      if (off.length > 0) {
        issues.push({
          severity: "warning",
          rule: "grid",
          message: `Element ${off.join(", ")} not on the ${language.grid}-unit grid.`,
          source: `elements[${i}]`,
        });
      }
    });
    return issues;
  },
});

export const builtInRules: readonly ValidationRule[] = [
  canvasRule,
  styleRule,
  geometryRule,
  safeAreaRule,
  strokeWidthRule,
  strokeCapRule,
  strokeJoinRule,
  colorRule,
  complexityRule,
  gridRule,
];
