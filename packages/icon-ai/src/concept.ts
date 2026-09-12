import { resolveTokens, type Box, type IconLanguage, type IconStyle, type SizeTokens } from "@icon-foundry/icon-language";
import { defaultRegistry, type PrimitiveRegistry } from "@icon-foundry/icon-primitives";
import {
  partCount,
  type Arrangement,
  type ConceptComposition,
  type ConceptPart,
  type IconElement,
  type IconSpec,
  type PrimitiveElement,
} from "@icon-foundry/icon-spec";

/**
 * The concept compiler: what a thing is made of, plus a language, becomes an
 * IconSpec.
 *
 * The split this enforces is the whole architecture. The concept says a server
 * is a stack of units — true whether your set is technical or playful. The
 * grammar says what a stack looks like here. The tokens say how big, how heavy
 * and how much survives. Change the language and every icon changes; change a
 * concept and only that icon changes.
 */

export class ConceptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConceptError";
  }
}

export interface ComposeConceptOptions {
  /** kebab-case name for the resulting icon. */
  name: string;
  /** Optical size to design at. Defaults to the language default. */
  canvas?: number;
  style?: IconStyle;
  registry?: PrimitiveRegistry;
  meta?: Record<string, unknown>;
}

export interface PrunedComposition {
  parts: ConceptPart[];
  /** Parts the budget could not afford, in the order they were dropped. */
  dropped: ConceptPart[];
}

/**
 * Priority is how a philosophy prunes.
 *
 * Essential parts are always kept, even past the budget, because an icon
 * missing its subject is worse than an icon that is slightly too busy — and
 * the hard complexity rule will say so. Optional parts are added in order
 * while the budget can afford them, so the same concept draws differently at
 * 16px and 24px without anyone drawing either.
 */
export function pruneParts(parts: readonly ConceptPart[], budget: number): PrunedComposition {
  const essential = parts.filter((p) => p.priority === "essential");
  const kept = [...essential];
  const dropped: ConceptPart[] = [];
  let used = partCount(essential);
  for (const part of parts.filter((p) => p.priority === "optional")) {
    const cost = part.count ?? 1;
    if (used + cost <= budget) {
      kept.push(part);
      used += cost;
    } else {
      dropped.push(part);
    }
  }
  // Keep the author's order, not essential-then-optional.
  return { parts: parts.filter((p) => kept.includes(p)), dropped };
}

/** Expand `count` into one entry per element the layout has to place. */
function expand(parts: readonly ConceptPart[]): ConceptPart[] {
  return parts.flatMap((p) => Array.from({ length: p.count ?? 1 }, () => p));
}

const snap = (n: number, grid: number): number => Math.round(n / grid) * grid;

function keyline(element: string, tokens: SizeTokens, registry: PrimitiveRegistry): Box {
  if (!registry.has(element)) {
    throw new ConceptError(`no element named "${element}" in this vocabulary`);
  }
  return tokens.optical[registry.get(element).opticalShape];
}

function place(element: string, box: Box): PrimitiveElement {
  return { primitive: element, x: box.x, y: box.y, width: box.width, height: box.height };
}

/**
 * Units laid along one axis inside a box, evenly spaced.
 *
 * Everything lands on the grid and inside the box: the gap is rounded up to a
 * whole grid step so positions never drift, the unit size is rounded *down* so
 * the series cannot overflow the keyline, and whatever is left over is split
 * as a lead-in so the series stays centred.
 */
function series(elements: readonly string[], box: Box, gap: number, axis: "y" | "x", grid: number): IconElement[] {
  const n = elements.length;
  const span = axis === "y" ? box.height : box.width;
  const step = n > 1 ? Math.max(grid, Math.ceil(gap / grid) * grid) : 0;
  const size = Math.max(grid, Math.floor((span - step * (n - 1)) / n / grid) * grid);
  const lead = Math.max(0, snap((span - (size * n + step * (n - 1))) / 2, grid));
  return elements.map((element, i) => {
    const offset = lead + i * (size + step);
    return axis === "y"
      ? place(element, { x: box.x, y: box.y + offset, width: box.width, height: size })
      : place(element, { x: box.x + offset, y: box.y, width: size, height: box.height });
  });
}

function badgeLayout(
  parts: readonly ConceptPart[],
  language: IconLanguage,
  tokens: SizeTokens,
  registry: PrimitiveRegistry,
): IconElement[] {
  const [subject, ...rest] = parts;
  if (!subject) throw new ConceptError("a badge arrangement needs a subject");
  const { canvas: C, safeArea: S, grid: g } = tokens;
  const content = C - 2 * S;
  const { badge: rules } = language.grammar;
  const badge = Math.max(g, snap(content * rules.ratio, g));
  const top = rules.corner.startsWith("top");
  const right = rules.corner.endsWith("right");
  const badgeY = top ? S : C - S - badge;
  const box = keyline(subject.element, tokens, registry);
  const modifiers = expand(rest).slice(0, 2);

  const badges: IconElement[] = modifiers.map((part, i) => {
    const primary = i === 0;
    const x = (primary ? right : !right) ? C - S - badge : S;
    return place(part.element, { x, y: badgeY, width: badge, height: badge });
  });
  if (badges.length === 0) return [place(subject.element, box)];

  const alignY = top ? ("end" as const) : ("start" as const);
  const alignX = right ? ("start" as const) : ("end" as const);
  const two = badges.length === 2;

  // Shrink the subject in grid steps until it clears the badge. The gap rule is
  // what decides how far, so the spacing is the language's, not ours.
  const minInset = snap(content * 0.15, g);
  const maxInset = snap(content * 0.5, g);
  for (let inset = minInset; inset <= maxInset; inset += g) {
    const y = top ? box.y + inset : box.y;
    const subjectEl: PrimitiveElement = two
      ? { primitive: subject.element, x: box.x, y, width: box.width, height: box.height - inset, align: { x: "center", y: alignY } }
      : {
          primitive: subject.element,
          x: right ? box.x : box.x + inset,
          y,
          width: box.width - inset,
          height: box.height - inset,
          align: { x: alignX, y: alignY },
        };
    const candidate = [subjectEl, ...badges];
    if (inset >= maxInset || clears(candidate, tokens)) return candidate;
  }
  return [place(subject.element, box), ...badges];
}

/** Cheap box-level check: does the subject box clear every badge box by the gap? */
function clears(elements: readonly IconElement[], tokens: SizeTokens): boolean {
  const [first, ...rest] = elements;
  if (!first) return true;
  const box = (el: IconElement) => ({
    x: el.x,
    y: el.y,
    w: el.width ?? el.size ?? 0,
    h: el.height ?? el.size ?? 0,
  });
  const a = box(first);
  return rest.every((el) => {
    const b = box(el);
    const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w));
    const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h));
    return Math.max(dx, dy) >= tokens.minNegativeSpace;
  });
}

function containLayout(parts: readonly ConceptPart[], tokens: SizeTokens, registry: PrimitiveRegistry): IconElement[] {
  const [container, ...inside] = parts;
  if (!container) throw new ConceptError("a contain arrangement needs a container");
  const box = keyline(container.element, tokens, registry);
  const g = tokens.grid;
  const elements: IconElement[] = [place(container.element, box)];
  const items = expand(inside);
  if (items.length === 0) return elements;

  // Inset by the clearance the language asks for, plus a stroke, so what sits
  // inside never crowds the container's own outline.
  const inset = Math.max(g, Math.ceil((tokens.minNegativeSpace + tokens.stroke.width) / g) * g);
  const inner: Box = {
    x: box.x + inset,
    y: box.y + inset,
    width: box.width - inset * 2,
    height: box.height - inset * 2,
  };
  const gap = Math.max(g, tokens.minNegativeSpace + tokens.stroke.width);
  return [...elements, ...series(items.map((p) => p.element), inner, gap, items.length > 1 ? "x" : "y", g)];
}

/**
 * Compile a concept's decomposition into an IconSpec for one optical size.
 */
export function composeConcept(
  composition: ConceptComposition,
  language: IconLanguage,
  options: ComposeConceptOptions,
): IconSpec {
  const registry = options.registry ?? defaultRegistry;
  const tokens = resolveTokens(language, options.canvas);
  const { arrangement } = composition;

  if (!language.grammar.arrangements.allowed.includes(arrangement)) {
    throw new ConceptError(
      `"${language.name}" does not allow the ${arrangement} arrangement (allowed: ${language.grammar.arrangements.allowed.join(", ")})`,
    );
  }

  const { parts, dropped } = pruneParts(composition.parts, tokens.limits.maxElements);
  // Boxes are centrelines, so the visible gap between two stroked units is the
  // box gap minus half a stroke at each side. The compiler owns that
  // conversion; nobody laying out a stack should have to remember it.
  const gap =
    language.grammar.arrangements.spacing > 0
      ? language.grammar.arrangements.spacing
      : tokens.minNegativeSpace + tokens.stroke.width;

  let elements: IconElement[];
  switch (arrangement) {
    case "single": {
      const part = parts[0];
      if (!part) throw new ConceptError("a single arrangement needs one part");
      elements = [place(part.element, keyline(part.element, tokens, registry))];
      break;
    }
    case "badge":
      elements = badgeLayout(parts, language, tokens, registry);
      break;
    case "stack":
    case "row": {
      const items = expand(parts);
      const first = items[0];
      if (!first) throw new ConceptError(`a ${arrangement} arrangement needs at least one part`);
      // A series is judged as one shape, so it fills the keyline box that suits
      // the direction rather than the box of any single unit.
      const box = tokens.optical[arrangement === "stack" ? "vertical" : "horizontal"];
      for (const item of items) keyline(item.element, tokens, registry); // validates every element exists
      elements = series(
        items.map((p) => p.element),
        box,
        Math.max(tokens.grid, gap),
        arrangement === "stack" ? "y" : "x",
        tokens.grid,
      );
      break;
    }
    case "contain":
      elements = containLayout(parts, tokens, registry);
      break;
  }

  return {
    name: options.name,
    language: language.id,
    canvas: tokens.canvas,
    ...(options.style && { style: options.style }),
    meta: {
      arrangement,
      ...(dropped.length > 0 && {
        pruned: dropped.map((p) => p.element),
        prunedBecause: `the ${tokens.canvas}px budget allows ${tokens.limits.maxElements} parts`,
      }),
      ...options.meta,
    },
    elements,
  };
}
