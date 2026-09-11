import { composedBounds, topLevelIndex } from "@icon-foundry/icon-composer";
import { hasSize } from "@icon-foundry/icon-language";
import { isFiniteShape, offGrammarAngles, shapeDistance } from "@icon-foundry/icon-primitives";
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
    hasSize(language, spec.canvas)
      ? []
      : [
          {
            severity: "error",
            rule: "canvas",
            message: `Canvas ${spec.canvas} is not an optical size of "${language.name}" (sizes: ${Object.keys(language.sizes).join(", ")}).`,
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
  check: ({ tokens, composed }) => {
    if (!composed || composed.shapes.length === 0) return [];
    const b = composedBounds(composed);
    const min = tokens.safeArea;
    const max = tokens.canvas - tokens.safeArea;
    const overflow = Math.max(min - b.minX, min - b.minY, b.maxX - max, b.maxY - max);
    if (overflow <= EPS) return [];
    return [
      {
        severity: "error",
        rule: "safeArea",
        message: `Geometry leaves the ${tokens.safeArea}-unit safe area by ${overflow.toFixed(2)} units (bounds ${b.minX.toFixed(2)}, ${b.minY.toFixed(2)} → ${b.maxX.toFixed(2)}, ${b.maxY.toFixed(2)}).`,
      },
    ];
  },
});

export const strokeWidthRule = defineRule({
  id: "strokeWidth",
  label: "Stroke width",
  check: ({ tokens, composed }) => {
    if (!composed) return [];
    const seen = new Set<string>();
    const issues: ValidationIssue[] = [];
    for (const item of composed.shapes) {
      if (item.stroke.width === tokens.stroke.width || seen.has(item.source)) continue;
      seen.add(item.source);
      const pct = Math.round(((item.stroke.width - tokens.stroke.width) / tokens.stroke.width) * 100);
      issues.push({
        severity: "warning",
        rule: "strokeWidth",
        message: `Stroke is ${Math.abs(pct)}% ${pct > 0 ? "heavier" : "lighter"} than the language stroke width (${item.stroke.width} vs ${tokens.stroke.width}).`,
        source: item.source,
      });
    }
    return issues;
  },
});

export const strokeCapRule = defineRule({
  id: "strokeCap",
  label: "Stroke caps",
  check: ({ tokens, composed }) => {
    if (!composed) return [];
    const seen = new Set<string>();
    const issues: ValidationIssue[] = [];
    for (const item of composed.shapes) {
      if (item.stroke.cap === tokens.stroke.cap || seen.has(item.source)) continue;
      seen.add(item.source);
      issues.push({
        severity: "warning",
        rule: "strokeCap",
        message: `Stroke cap "${item.stroke.cap}" differs from the language cap "${tokens.stroke.cap}".`,
        source: item.source,
      });
    }
    return issues;
  },
});

export const strokeJoinRule = defineRule({
  id: "strokeJoin",
  label: "Stroke joins",
  check: ({ tokens, composed }) => {
    if (!composed) return [];
    const seen = new Set<string>();
    const issues: ValidationIssue[] = [];
    for (const item of composed.shapes) {
      if (item.stroke.join === tokens.stroke.join || seen.has(item.source)) continue;
      seen.add(item.source);
      issues.push({
        severity: "warning",
        rule: "strokeJoin",
        message: `Stroke join "${item.stroke.join}" differs from the language join "${tokens.stroke.join}".`,
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
  check: ({ language, tokens, composed }) => {
    if (!composed) return [];
    const issues: ValidationIssue[] = [];
    if (composed.elementCount > tokens.limits.maxElements) {
      issues.push({
        severity: "warning",
        rule: "complexity",
        message: `${composed.elementCount} primitives exceed the budget of ${tokens.limits.maxElements} for "${language.detail}" detail at ${tokens.canvas}px.`,
      });
    }
    if (composed.shapes.length > tokens.limits.maxShapes) {
      issues.push({
        severity: "warning",
        rule: "complexity",
        message: `${composed.shapes.length} shapes exceed the budget of ${tokens.limits.maxShapes} at ${tokens.canvas}px.`,
      });
    }
    return issues;
  },
});

export const gridRule = defineRule({
  id: "grid",
  label: "Grid alignment",
  check: ({ spec, tokens }) => {
    const issues: ValidationIssue[] = [];
    // Only top-level boxes are checked: group children live in a virtual canvas.
    spec.elements.forEach((el, i) => {
      const box = elementBox(el);
      const off = (["x", "y", "width", "height"] as const).filter((k) => !onGrid(box[k], tokens.grid));
      if (off.length > 0) {
        issues.push({
          severity: "warning",
          rule: "grid",
          message: `Element ${off.join(", ")} not on the ${tokens.grid}-unit grid.`,
          source: `elements[${i}]`,
        });
      }
    });
    return issues;
  },
});

/**
 * Negative space: shapes from different top-level elements must either cross
 * (an intentional overlap) or keep a visible gap of at least
 * `minNegativeSpace`. Below that, strokes merge into a blur at small sizes.
 * The visible gap is the centreline distance minus half of each stroke.
 */
export const negativeSpaceRule = defineRule({
  id: "negativeSpace",
  label: "Negative space",
  check: ({ tokens, composed }) => {
    const min = tokens.minNegativeSpace;
    if (!composed || min <= 0) return [];
    const half = (item: (typeof composed.shapes)[number]) =>
      item.style === "filled" && item.shape.fillable ? 0 : item.stroke.width / 2;

    const worst = new Map<string, { gap: number; a: number; b: number }>();
    for (let i = 0; i < composed.shapes.length; i++) {
      for (let j = i + 1; j < composed.shapes.length; j++) {
        const A = composed.shapes[i]!;
        const B = composed.shapes[j]!;
        const ta = topLevelIndex(A.source);
        const tb = topLevelIndex(B.source);
        if (ta === tb) continue;
        const d = shapeDistance(A.shape, B.shape);
        if (d === 0) continue; // crossing: intentional overlap
        const gap = d - half(A) - half(B);
        if (gap >= min - EPS) continue;
        const key = `${Math.min(ta, tb)}-${Math.max(ta, tb)}`;
        const prev = worst.get(key);
        if (!prev || gap < prev.gap) worst.set(key, { gap, a: Math.min(ta, tb), b: Math.max(ta, tb) });
      }
    }
    return [...worst.values()].map(({ gap, a, b }) => ({
      severity: "warning" as const,
      rule: "negativeSpace",
      message:
        gap <= 0
          ? `elements[${a}] and elements[${b}] nearly touch without crossing (${gap.toFixed(2)} units); either overlap them deliberately or keep a ${min}-unit gap.`
          : `Gap between elements[${a}] and elements[${b}] is ${gap.toFixed(2)} units; the language asks for at least ${min}.`,
      source: `elements[${b}]`,
    }));
  },
});

/**
 * Construction: straight lines must run at one of the language's angles.
 * Primitives whose concept demands other angles (a triangle, an isometric
 * box) opt out once in the vocabulary, so this rule polices what actually
 * drifts: freeform geometry and odd rotations.
 */
export const constructionRule = defineRule({
  id: "construction",
  label: "Construction",
  check: ({ language, composed }) => {
    const { angles, angleTolerance } = language.grammar;
    if (!composed || angles.length === 0) return [];
    const worst = new Map<string, number[]>();
    for (const item of composed.shapes) {
      if (item.freeAngles) continue;
      const off = offGrammarAngles(item.shape, angles, angleTolerance);
      if (off.length === 0) continue;
      const seen = worst.get(item.source) ?? [];
      for (const a of off) if (!seen.some((x) => Math.abs(x - a) < 0.5)) seen.push(a);
      worst.set(item.source, seen);
    }
    return [...worst.entries()].map(([source, off]) => ({
      severity: "warning" as const,
      rule: "construction",
      message: `Lines at ${off.map((a) => `${a.toFixed(1)}°`).join(", ")} do not follow the language's construction angles (${angles.map((a) => `${a}°`).join(", ")}).`,
      source,
    }));
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
  negativeSpaceRule,
  constructionRule,
];
