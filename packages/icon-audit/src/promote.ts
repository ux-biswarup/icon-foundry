import { compose } from "@icon-foundry/icon-composer";
import { parseIconLanguage, resolveTokens, serializeIconLanguage, type IconLanguage } from "@icon-foundry/icon-language";
import type { IconRecord, Library } from "@icon-foundry/icon-library";
import { offGrammarAngles, shapeDistance } from "@icon-foundry/icon-primitives";
import { elementBox } from "@icon-foundry/icon-spec";
import { validateIconSpec } from "@icon-foundry/icon-validator";

/**
 * Rules the set already follows but nobody wrote down.
 *
 * This is how a language grows without anyone authoring an ontology up front.
 * Cursor's rules emerged from drawing 600 icons; the objection to declaring
 * rules early is that nobody knows their language before they have drawn any.
 * The answer is to read the rules back off the icons once they exist.
 *
 * Every proposal carries what would start failing if it were adopted, because
 * a rule is only worth declaring if you can see its cost.
 */

export interface RuleProposal {
  id: string;
  label: string;
  /** What the set already does, and what declaring it would mean. */
  message: string;
  /** Icons that would begin failing or warning if this were declared. */
  wouldFail: string[];
  /** The language with this rule written into it. */
  apply(): IconLanguage;
}

export interface PromoteOptions {
  languageId?: string;
  statuses?: IconRecord["status"][];
}

const ANGLE_CANDIDATES: Array<{ angles: number[]; name: string }> = [
  { angles: [0, 90], name: "flat and upright only" },
  { angles: [0, 45, 90, 135], name: "45° increments" },
  { angles: [0, 30, 45, 60, 90, 120, 135, 150], name: "30° and 45° increments" },
];

/** Patch a language through the file shape, so a proposal is exactly what a save would write. */
function patched(language: IconLanguage, change: (input: ReturnType<typeof serializeIconLanguage>) => void): IconLanguage {
  const input = serializeIconLanguage(language);
  change(input);
  return parseIconLanguage(input);
}

export function proposeRules(library: Library, options: PromoteOptions = {}): RuleProposal[] {
  const languageId = options.languageId ?? library.manifest.language;
  const language = library.getLanguage(languageId);
  const statuses = options.statuses ?? ["review", "published"];
  const registry = library.registry();
  const icons = library.iconsInLanguage(languageId).filter((r) => statuses.includes(r.status));
  // Reading a rule off four icons is reading it off noise.
  if (icons.length < 6) return [];

  const composed = icons
    .map((record) => {
      try {
        return { record, icon: compose(record.spec, language, { registry }) };
      } catch {
        return undefined;
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== undefined);
  if (composed.length < 6) return [];

  const wouldFail = (next: IconLanguage): string[] =>
    icons
      .filter((r) => validateIconSpec(r.spec, next, { registry }).issues.length > 0)
      .map((r) => r.spec.name);

  const proposals: RuleProposal[] = [];

  // 1. Construction angles the set already keeps to.
  if (language.grammar.angles.length === 0) {
    for (const candidate of ANGLE_CANDIDATES) {
      const conforms = composed.every(({ icon }) =>
        icon.shapes.every((s) => s.freeAngles || offGrammarAngles(s.shape, candidate.angles, 1).length === 0),
      );
      if (conforms) {
        const next = patched(language, (input) => {
          input.grammar = { ...input.grammar, angles: candidate.angles };
        });
        proposals.push({
          id: "angles",
          label: "Construction angles",
          message: `Every icon already draws on ${candidate.name}. Declaring it would catch the first one that does not.`,
          wouldFail: wouldFail(next),
          apply: () => next,
        });
        break; // the tightest set that fits is the one worth proposing
      }
    }
  }

  // 2. A detail budget the set never comes close to using.
  const tokens = resolveTokens(language, language.defaultCanvas);
  const maxShapes = Math.max(...composed.map(({ icon }) => icon.shapes.length));
  const maxParts = Math.max(...composed.map(({ icon }) => icon.elementCount));
  if (maxShapes + 3 <= tokens.limits.maxShapes || maxParts + 2 <= tokens.limits.maxElements) {
    const next = patched(language, (input) => {
      input.limits = { maxElements: Math.max(1, maxParts), maxShapes: Math.max(1, maxShapes) };
    });
    proposals.push({
      id: "budget",
      label: "Detail budget",
      message: `The busiest icon uses ${maxParts} parts and ${maxShapes} shapes, against a budget of ${tokens.limits.maxElements} and ${tokens.limits.maxShapes}. Tightening the budget to what the set actually uses would hold the line where it already sits.`,
      wouldFail: wouldFail(next),
      apply: () => next,
    });
  }

  // 3. Breathing room the set already gives itself.
  const gaps = composed
    .map(({ icon }) => smallestGap(icon))
    .filter((g): g is number => g !== undefined);
  if (gaps.length >= 3) {
    const observed = Math.min(...gaps);
    const rounded = Math.floor(observed / tokens.grid) * tokens.grid;
    if (rounded >= tokens.minNegativeSpace + tokens.grid) {
      const next = patched(language, (input) => {
        input.minNegativeSpace = rounded;
      });
      proposals.push({
        id: "gap",
        label: "Smallest gap",
        message: `No icon comes closer than ${observed.toFixed(2)} units, where the language only asks for ${tokens.minNegativeSpace}. Raising it to ${rounded} would keep the set from tightening later.`,
        wouldFail: wouldFail(next),
        apply: () => next,
      });
    }
  }

  // 4. A badge size every badge already uses.
  const ratios = new Set<number>();
  for (const record of icons) {
    const badge = badgeRatio(record);
    if (badge !== undefined) ratios.add(badge);
  }
  if (ratios.size === 1) {
    const [observed] = [...ratios];
    if (observed !== undefined && Math.abs(observed - language.grammar.badge.ratio) > 0.01) {
      const next = patched(language, (input) => {
        input.grammar = { ...input.grammar, badge: { ...input.grammar?.badge, ratio: observed } };
      });
      proposals.push({
        id: "badge",
        label: "Badge size",
        message: `Every badge in the set is ${Math.round(observed * 100)}% of the canvas, but the language says ${Math.round(language.grammar.badge.ratio * 100)}%. Matching it would make new icons come out like the ones you have.`,
        wouldFail: wouldFail(next),
        apply: () => next,
      });
    }
  }

  return proposals;
}

function smallestGap(icon: ReturnType<typeof compose>): number | undefined {
  const half = (item: (typeof icon.shapes)[number]) =>
    item.style === "filled" && item.shape.fillable ? 0 : item.stroke.width / 2;
  let smallest = Infinity;
  for (let i = 0; i < icon.shapes.length; i++) {
    for (let j = i + 1; j < icon.shapes.length; j++) {
      const a = icon.shapes[i]!;
      const b = icon.shapes[j]!;
      if (a.source.split(".")[0] === b.source.split(".")[0]) continue;
      const d = shapeDistance(a.shape, b.shape);
      if (d === 0) continue;
      smallest = Math.min(smallest, d - half(a) - half(b));
    }
  }
  return Number.isFinite(smallest) ? smallest : undefined;
}

/** The badge's width as a share of the canvas, when an icon clearly has one. */
function badgeRatio(record: IconRecord): number | undefined {
  if (record.spec.elements.length < 2) return undefined;
  const boxes = record.spec.elements.map(elementBox);
  const smallest = boxes.reduce((a, b) => (a.width * a.height <= b.width * b.height ? a : b));
  const largest = boxes.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
  if (smallest.width * smallest.height > largest.width * largest.height * 0.5) return undefined;
  return Math.round((smallest.width / record.spec.canvas) * 100) / 100;
}
