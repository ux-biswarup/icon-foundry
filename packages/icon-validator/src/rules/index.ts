import { composedBounds, inkBounds, topLevelIndex } from "@icon-foundry/icon-composer";
import {
  cornerName,
  cornerOf,
  directionName,
  hasSize,
  leanOf,
  oppositeDiagonal,
  type DiagonalDirection,
} from "@icon-foundry/icon-language";
import {
  closestPoints,
  isFiniteShape,
  offGrammarAngles,
  shapeDistance,
  straightSegments,
  type Point,
  type Shape,
  type StraightSegment,
} from "@icon-foundry/icon-primitives";
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

/**
 * The live area: a target the drawing should reach, and may overshoot.
 *
 * A **warning**, not an error, and that is the whole point of the three rings.
 * The keyline boxes are derived from this inset — the circle box *is* this
 * inset — so a circular part drawn correctly has its centreline sitting exactly
 * on this line. Treating the line as a fence would flag every well-drawn circle
 * in the set. What is worth saying is the opposite: a drawing that stops well
 * short of it will read small beside its neighbours.
 *
 * Measured on centrelines, because that is what a keyline is a line of.
 */
export const safeAreaRule = defineRule({
  id: "safeArea",
  label: "Live area",
  check: ({ tokens, composed }) => {
    if (!composed || composed.shapes.length === 0) return [];
    const b = composedBounds(composed);
    const min = tokens.safeArea;
    const max = tokens.canvas - tokens.safeArea;
    const overflow = Math.max(min - b.minX, min - b.minY, b.maxX - max, b.maxY - max);
    if (overflow <= EPS) return [];
    return [
      {
        severity: "warning",
        rule: "safeArea",
        message: `Centrelines pass the ${tokens.safeArea}-unit live area by ${overflow.toFixed(2)} units (bounds ${b.minX.toFixed(2)}, ${b.minY.toFixed(2)} → ${b.maxX.toFixed(2)}, ${b.maxY.toFixed(2)}). Ink may overhang the live edge; the drawing itself should not.`,
        evidence: [{ kind: "bounds", bounds: b }],
      },
    ];
  },
});

/**
 * The trim: the line nothing crosses.
 *
 * The error half of the pair, and the one measured on **ink** rather than on
 * centrelines — because what it is actually asking is whether any of the
 * drawing falls off the edge of what will be composited, and half a stroke
 * hanging into space is exactly that.
 */
export const trimRule = defineRule({
  id: "trim",
  label: "Trim",
  check: ({ tokens, composed }) => {
    if (!composed || composed.shapes.length === 0) return [];
    const b = inkBounds(composed);
    const min = tokens.trim;
    const max = tokens.canvas - tokens.trim;
    const overflow = Math.max(min - b.minX, min - b.minY, b.maxX - max, b.maxY - max);
    if (overflow <= EPS) return [];
    const edge = tokens.trim > 0 ? `${tokens.trim}-unit trim` : "canvas";
    return [
      {
        severity: "error",
        rule: "trim",
        message: `Ink crosses the ${edge} by ${overflow.toFixed(2)} units (stroked bounds ${b.minX.toFixed(2)}, ${b.minY.toFixed(2)} → ${b.maxX.toFixed(2)}, ${b.maxY.toFixed(2)}). Half a stroke sits outside what will be drawn.`,
        evidence: [{ kind: "bounds", bounds: b }],
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
        // Mark every corner that sits off the grid. Asked of the coordinates
        // themselves rather than inferred from which fields were off: an
        // off-grid `x` puts all four corners in the wrong column, because the
        // right-hand pair is `x + width`.
        const points: Point[] = [];
        for (const x of [box.x, box.x + box.width]) {
          for (const y of [box.y, box.y + box.height]) {
            if (!onGrid(x, tokens.grid) || !onGrid(y, tokens.grid)) points.push([x, y]);
          }
        }
        issues.push({
          severity: "warning",
          rule: "grid",
          message: `Element ${off.join(", ")} not on the ${tokens.grid}-unit grid.`,
          source: `elements[${i}]`,
          ...(points.length > 0 && { evidence: [{ kind: "points" as const, points }] }),
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

    const worst = new Map<string, { gap: number; a: number; b: number; shapeA: Shape; shapeB: Shape }>();
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
        if (!prev || gap < prev.gap) {
          worst.set(key, { gap, a: Math.min(ta, tb), b: Math.max(ta, tb), shapeA: A.shape, shapeB: B.shape });
        }
      }
    }
    return [...worst.values()].map(({ gap, a, b, shapeA, shapeB }) => {
      // The two points that are too close. Drawing the span between them is
      // the difference between "a gap is wrong" and "*this* gap is wrong".
      const [pa, pb] = closestPoints(shapeA, shapeB);
      return {
        severity: "warning" as const,
        rule: "negativeSpace",
        message:
          gap <= 0
            ? `elements[${a}] and elements[${b}] nearly touch without crossing (${gap.toFixed(2)} units); either overlap them deliberately or keep a ${min}-unit gap.`
            : `Gap between elements[${a}] and elements[${b}] is ${gap.toFixed(2)} units; the language asks for at least ${min}.`,
        source: `elements[${b}]`,
        evidence: [{ kind: "gap" as const, a: pa, b: pb, gap }],
      };
    });
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

/**
 * Metaphors the language refuses. Every element carries keywords, so "we do not
 * draw faces" can be checked rather than only asked for in a prompt — which
 * moves one philosophy field off the model's goodwill and onto arithmetic.
 */
export const metaphorRule = defineRule({
  id: "metaphor",
  label: "Metaphors",
  check: ({ spec, language, registry }) => {
    const avoid = language.character.metaphors.avoid.map((m) => m.toLowerCase().trim()).filter(Boolean);
    if (avoid.length === 0) return [];
    const issues: ValidationIssue[] = [];
    walk(spec.elements, "elements", (el, source) => {
      if (!el.primitive || !registry.has(el.primitive)) return;
      const primitive = registry.get(el.primitive);
      const words = new Set([primitive.name, ...primitive.keywords].map((w) => w.toLowerCase()));
      // Match a refused metaphor against the element's own words, allowing the
      // plural a team is likely to have written ("faces" against "face").
      const hit = avoid.find((m) => words.has(m) || words.has(m.replace(/s$/, "")) || words.has(`${m}s`));
      if (hit) {
        issues.push({
          severity: "warning",
          rule: "metaphor",
          message: `"${primitive.name}" is a ${hit} metaphor, which this language refuses.`,
          source,
        });
      }
    });
    return issues;
  },
});

/**
 * Following the pointer.
 *
 * Cursor's pointer runs from bottom left to top right, and so does every icon
 * that could go either way: diagonal arrows, flying objects, and any
 * composition where one part sits above another — the smaller part goes to the
 * top right. Slashes run the other way, top left to bottom right, because a
 * slash cancels a direction and should cut against it.
 *
 * No one reads this off the screen. But without rules like it, a set stops
 * looking like it came from one place, and *that* is read.
 *
 * ## Answering the objection
 *
 * This field sat unchecked for a long time behind a fair objection: no rule can
 * tell which diagonal is the one that matters. A triangle has two. A chevron
 * has two. An X is nothing but two, and marking either of them would be the
 * rule firing on icons that are fine, which is how a rule set gets ignored.
 *
 * So it does not try. It weighs the diagonal ink each way and speaks only when
 * one side clearly wins — when the drawing has a lean rather than a pair of
 * them. A triangle's two sides cancel and it says nothing. An arrow's shaft and
 * both barbs point one way and it does.
 *
 * That is also why it is a warning. It is checking a convention, and a
 * convention has exceptions a person is entitled to make.
 */

/** How far off flat or upright a line must be before it counts as a diagonal. */
const AXIAL = 8;
/**
 * How lopsided the diagonal ink has to be before there is a lean to check.
 *
 * At 0.6, a triangle (two equal sides) and a chevron say nothing, while an
 * arrow — whose shaft and both barbs agree — says plenty. Set tighter and
 * symmetric drawings start getting marked; set looser and the rule stops
 * noticing arrows drawn with a stray counter-stroke.
 */
const LOPSIDED = 0.6;

interface Lean {
  direction: DiagonalDirection;
  /** Diagonal ink running that way, in canvas units. */
  length: number;
  /** The longest single run of it, for pointing at. */
  longest: StraightSegment | undefined;
}

/**
 * The diagonal ink of a composed icon, weighed each way.
 *
 * Primitives whose concept fixes their diagonals opt out once in the
 * vocabulary, the way they already do for construction angles, so what is
 * weighed here is what a designer actually chose.
 */
function weighDiagonals(shapes: readonly { shape: Shape; freeDirection: boolean }[]): Record<"up-right" | "up-left", Lean> {
  const totals: Record<"up-right" | "up-left", Lean> = {
    "up-right": { direction: "up-right", length: 0, longest: undefined },
    "up-left": { direction: "up-left", length: 0, longest: undefined },
  };
  for (const item of shapes) {
    if (item.freeDirection) continue;
    for (const segment of straightSegments(item.shape)) {
      const lean = leanOf(segment.angle, AXIAL);
      if (lean === "none") continue;
      const total = totals[lean];
      total.length += segment.length;
      if (!total.longest || segment.length > total.longest.length) total.longest = segment;
    }
  }
  return totals;
}

/** A run of straight line, as geometry a UI can draw over the icon. */
const asLine = (segment: StraightSegment): Shape => ({
  kind: "line",
  x1: segment.from[0],
  y1: segment.from[1],
  x2: segment.to[0],
  y2: segment.to[1],
  fillable: false,
});

/**
 * The cancelled form of an icon, by the only convention the set has for it:
 * the `-off` suffix `offify` writes and the library stores. Its slash is the
 * long corner-to-corner diagonal, and it is expected to run against the set —
 * so the same rule that would flag it as backwards is what checks it is.
 */
const isCancelled = (name: string): boolean => /-off$/.test(name);

export const directionRule = defineRule({
  id: "direction",
  label: "Direction",
  check: ({ spec, language, composed, tokens }) => {
    const issues: ValidationIssue[] = [];
    const { diagonal, badge } = language.grammar;

    if (composed && diagonal !== "none") {
      const cancelled = isCancelled(spec.name);
      const wanted = cancelled ? oppositeDiagonal(diagonal) : diagonal;
      const totals = weighDiagonals(composed.shapes);
      const along = totals[wanted === "up-right" ? "up-right" : "up-left"];
      const against = totals[wanted === "up-right" ? "up-left" : "up-right"];

      /*
       * Nothing to say about a drawing with no diagonals, and nothing to say
       * about one with a balanced pair. One grid step of ink is the floor: below
       * that the "diagonal" is a rounded corner or a join, not a decision.
       */
      const total = along.length + against.length;
      if (total >= tokens.grid && against.length > along.length && against.length >= total * LOPSIDED) {
        issues.push({
          severity: "warning",
          rule: "direction",
          message: cancelled
            ? `The slash runs ${directionName(against.direction)}, along the ${directionName(diagonal)} diagonal this set follows. A slash cancels a direction, so it should cut against it and run ${directionName(wanted)}.`
            : `The drawing leans ${directionName(against.direction)}; "${language.name}" runs diagonals ${directionName(wanted)}. Mirror it, or keep it and say why — an icon whose subject has a real direction is allowed one.`,
          ...(against.longest && { evidence: [{ kind: "shape" as const, shape: asLine(against.longest) }] }),
        });
      }
    }

    /*
     * The same convention where it is a composition rather than a line: of two
     * parts, the smaller one goes to the stated corner. "Smaller" is the badge
     * test the audit already uses — clearly subordinate, not merely smaller —
     * and both offsets have to be real, so a small part sitting directly under
     * a subject is a base, not a badge placed wrongly.
     */
    if (spec.elements.length >= 2) {
      const boxes = spec.elements.map(elementBox);
      const area = (b: (typeof boxes)[number]) => b.width * b.height;
      const smallest = boxes.reduce((a, b) => (area(a) <= area(b) ? a : b));
      const largest = boxes.reduce((a, b) => (area(a) >= area(b) ? a : b));
      const centre = (b: (typeof boxes)[number]) => [b.x + b.width / 2, b.y + b.height / 2] as const;
      const dx = centre(smallest)[0] - centre(largest)[0];
      const dy = centre(smallest)[1] - centre(largest)[1];
      // An eighth of the canvas each way: enough offset that the part is in a
      // corner rather than beside or beneath the subject.
      const clear = spec.canvas / 8;
      if (area(smallest) <= area(largest) * 0.5 && Math.abs(dx) >= clear && Math.abs(dy) >= clear) {
        const corner = cornerOf(dx, dy);
        if (corner !== badge.corner) {
          issues.push({
            severity: "warning",
            rule: "direction",
            message: `The smaller part sits ${cornerName(corner)}; this set puts a badge ${cornerName(badge.corner)}.`,
            source: `elements[${boxes.indexOf(smallest)}]`,
            evidence: [{ kind: "bounds" as const, bounds: { minX: smallest.x, minY: smallest.y, maxX: smallest.x + smallest.width, maxY: smallest.y + smallest.height } }],
          });
        }
      }
    }

    return issues;
  },
});

export const builtInRules: readonly ValidationRule[] = [
  canvasRule,
  styleRule,
  geometryRule,
  safeAreaRule,
  trimRule,
  strokeWidthRule,
  strokeCapRule,
  strokeJoinRule,
  colorRule,
  complexityRule,
  gridRule,
  negativeSpaceRule,
  constructionRule,
  directionRule,
  metaphorRule,
];
