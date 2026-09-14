import { resolveSpec, type ResolvedSpec } from "@icon-foundry/icon-composer";
import type { IconLanguage } from "@icon-foundry/icon-language";
import type { IconRecord, Library } from "@icon-foundry/icon-library";
import { renderSpecToSvg } from "@icon-foundry/icon-renderer";
import { elementBox, type IconSpec } from "@icon-foundry/icon-spec";
import { validateIconSpec, type ValidationResult } from "@icon-foundry/icon-validator";

/**
 * The third rule engine.
 *
 * A per-icon rule can only ever ask whether one icon is well made. It cannot
 * see that this folder is drawn differently from the other eleven, or that two
 * icons mean the same thing, or that one icon has quietly drifted from rules
 * the rest of the set follows. Those invariants exist only across a set, and
 * they are exactly the ones a human used to hold in their head.
 *
 * Nothing here blocks. An audited pattern is a pattern, not a law: only a rule
 * the language declares can refuse an icon.
 */

export { proposeRules, type PromoteOptions, type RuleProposal } from "./promote.js";
export { previewElementChange, type ElementImpact } from "./elements.js";

export type AuditSeverity = "info" | "warning";

export interface AuditFinding {
  /** Stable check id. */
  id: string;
  label: string;
  severity: AuditSeverity;
  message: string;
  /** Icon names the finding is about, so a UI can link to them. */
  icons: string[];
}

export interface AuditOptions {
  /** Audit one language. Defaults to the library's default. */
  languageId?: string;
  /** Which statuses count. Defaults to review and published: drafts are unfinished. */
  statuses?: IconRecord["status"][];
}

interface Subject {
  record: IconRecord;
  /** Resolved against the language, so geometry checks measure what is drawn
   * today rather than what was stored the day the icon was made. */
  spec: ResolvedSpec;
  validation: ValidationResult;
  svg: string | undefined;
}

/** Run every check across a library and return what it found. */
export function auditLibrary(library: Library, options: AuditOptions = {}): AuditFinding[] {
  const languageId = options.languageId ?? library.manifest.language;
  const language = library.getLanguage(languageId);
  const statuses = options.statuses ?? ["review", "published"];
  const registry = library.registry();

  const subjects: Subject[] = library
    .iconsInLanguage(languageId)
    .filter((r) => statuses.includes(r.status))
    .map((record) => {
      const validation = validateIconSpec(record.spec, language, { registry });
      const composable = !validation.issues.some((i) => i.rule === "compose");
      return {
        record,
        spec: resolveSpec(record.spec, language, { registry }),
        validation,
        svg: composable ? renderSpecToSvg(record.spec, language, { registry }) : undefined,
      };
    });

  // Exceptions are a property of the language, so they are worth reporting even
  // when nothing has been drawn with it yet.
  const exceptions = constructionExceptions(language);
  if (subjects.length === 0) return exceptions;

  return [
    ...driftedFromLanguage(subjects, language),
    ...duplicateGeometry(subjects),
    ...conflictingConcepts(subjects, languageId),
    ...ungovernedIcons(subjects),
    ...ungovernedGeometry(subjects),
    ...pinnedParts(subjects),
    ...inconsistentBadges(subjects),
    ...exceptions,
    ...scoreOutliers(subjects),
  ];
}

/**
 * Parts drawn against the language on purpose.
 *
 * An exception is allowed, and this is the fourth thing that makes it cost
 * something: it is shown against the language value, it carries a reason, it is
 * marked on the part, and it is counted here where the whole team can see it.
 *
 * The count is the signal. One exception is a judgement someone made and wrote
 * down. Several on the same trait is not a run of judgements, it is the
 * language value being wrong, and the finding says which trait is being escaped
 * so the fix is obvious.
 */
function constructionExceptions(language: IconLanguage): AuditFinding[] {
  const entries = Object.entries(language.construction.exceptions);
  if (entries.length === 0) return [];

  const byTrait = new Map<string, string[]>();
  for (const [name, exception] of entries) {
    for (const trait of Object.keys(exception.set)) {
      byTrait.set(trait, [...(byTrait.get(trait) ?? []), name]);
    }
  }

  const findings: AuditFinding[] = [
    {
      id: "construction-exception",
      label: "Drawn against the language",
      severity: "info",
      message: `${entries.length} ${entries.length === 1 ? "part departs" : "parts depart"} from ${language.name}: ${entries
        .map(([name, e]) => `${name} (${e.why})`)
        .join("; ")}.`,
      icons: [],
    },
  ];

  for (const [trait, parts] of byTrait) {
    if (parts.length < 3) continue;
    findings.push({
      id: "exception-cluster",
      label: "A value most parts escape",
      severity: "warning",
      message: `${parts.length} parts override ${trait}: ${parts.join(", ")}. At that many, the language value is likely wrong rather than the parts.`,
      icons: [],
    });
  }
  return findings;
}

/**
 * Icons made under older rules. Re-rendering keeps a set current automatically,
 * but a composition decision taken under a looser rule does not fix itself.
 */
function driftedFromLanguage(subjects: Subject[], language: IconLanguage): AuditFinding[] {
  return subjects
    .filter((s) => s.validation.issues.length > 0)
    .map((s) => {
      const errors = s.validation.issues.filter((i) => i.severity === "error");
      return {
        id: "drift",
        label: "Drifted from the language",
        severity: errors.length > 0 ? ("warning" as const) : ("info" as const),
        message: `${s.record.spec.name} no longer satisfies ${language.name} v${language.version}: ${s.validation.issues
          .map((i) => i.rule)
          .join(", ")}.`,
        icons: [s.record.spec.name],
      };
    });
}

/** Two icons that draw exactly the same thing. The renderer is deterministic,
 * so an identical body means identical geometry, not merely similar. */
function duplicateGeometry(subjects: Subject[]): AuditFinding[] {
  const bySvg = new Map<string, string[]>();
  for (const s of subjects) {
    if (!s.svg) continue;
    const body = s.svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
    bySvg.set(body, [...(bySvg.get(body) ?? []), s.record.spec.name]);
  }
  return [...bySvg.values()]
    .filter((names) => names.length > 1)
    .map((names) => ({
      id: "duplicate-geometry",
      label: "Identical drawings",
      severity: "warning" as const,
      message: `${names.join(" and ")} render to exactly the same geometry. One of them is probably unnecessary.`,
      icons: names,
    }));
}

/** Two icons claiming one meaning. Publishing refuses this; drafts do not. */
function conflictingConcepts(subjects: Subject[], languageId: string): AuditFinding[] {
  const byConcept = new Map<string, string[]>();
  for (const s of subjects) {
    if (!s.record.concept) continue;
    byConcept.set(s.record.concept, [...(byConcept.get(s.record.concept) ?? []), s.record.spec.name]);
  }
  return [...byConcept.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([concept, names]) => ({
      id: "concept-conflict",
      label: "One meaning, several icons",
      severity: "warning" as const,
      message: `${names.join(", ")} all answer "${concept}" in ${languageId}. Only one can be published.`,
      icons: names,
    }));
}

/** A published icon with no concept cannot be found by meaning, cannot be
 * checked for duplication, and cannot be answered by the registry. */
/**
 * Icons the keyline sheet does not reach.
 *
 * An icon that carries its own geometry is not governed by the language at
 * all: move a keyline box and it will not follow, and nothing else in the app
 * will mention it. That is precisely the state this finding exists to stop
 * being invisible — it is the difference between a sheet that is the rule and
 * a sheet that is a picture of one.
 *
 * It is a warning rather than an error because it is sometimes right. What it
 * must never be is unnoticed.
 */
function ungovernedGeometry(subjects: Subject[]): AuditFinding[] {
  const loose = subjects.filter((s) => !s.record.spec.composition).map((s) => s.record.spec.name);
  if (loose.length === 0) return [];
  return [
    {
      id: "ungoverned-geometry",
      label: "Outside the keyline sheet",
      severity: "warning",
      message:
        `${loose.length} ${loose.length === 1 ? "icon carries" : "icons carry"} geometry of ${loose.length === 1 ? "its" : "their"} own, ` +
        `so changing a keyline box will not move ${loose.length === 1 ? "it" : "them"}: ${loose.join(", ")}.`,
      icons: loose,
    },
  ];
}

/**
 * Parts drawn against the language on purpose.
 *
 * Not a problem — an exception is allowed. But it is counted and named, the
 * same way a construction exception is, because a set where half the parts are
 * exceptions has a language that is describing something nobody follows.
 */
function pinnedParts(subjects: Subject[]): AuditFinding[] {
  const pinned: string[] = [];
  const reasons: string[] = [];
  for (const s of subjects) {
    const parts = s.record.spec.composition?.parts.filter((part) => part.except) ?? [];
    if (parts.length === 0) continue;
    pinned.push(s.record.spec.name);
    for (const part of parts) reasons.push(`${s.record.spec.name}/${part.element}: ${part.except!.why}`);
  }
  if (pinned.length === 0) return [];
  return [
    {
      id: "pinned-parts",
      label: "Drawn against the language",
      severity: "info",
      message: `${reasons.length} ${reasons.length === 1 ? "part is" : "parts are"} pinned by hand — ${reasons.join("; ")}.`,
      icons: pinned,
    },
  ];
}

function ungovernedIcons(subjects: Subject[]): AuditFinding[] {
  const orphans = subjects.filter((s) => s.record.status === "published" && !s.record.concept).map((s) => s.record.spec.name);
  if (orphans.length === 0) return [];
  return [
    {
      id: "no-concept",
      label: "Published without a meaning",
      severity: "info",
      message: `${orphans.length} published ${orphans.length === 1 ? "icon has" : "icons have"} no concept, so nothing stops a duplicate of ${orphans.length === 1 ? "it" : "them"} being drawn: ${orphans.join(", ")}.`,
      icons: orphans,
    },
  ];
}

/**
 * Badges the same size everywhere. This is Cursor's overview table: the check
 * no single icon can fail, because being wrong means differing from the others.
 */
function inconsistentBadges(subjects: Subject[]): AuditFinding[] {
  const ratios = new Map<number, string[]>();
  for (const s of subjects) {
    if (s.spec.elements.length < 2) continue;
    const boxes = s.spec.elements.map(elementBox);
    const smallest = boxes.reduce((a, b) => (a.width * a.height <= b.width * b.height ? a : b));
    const largest = boxes.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
    // Only treat it as a badge when it is clearly subordinate to the subject.
    if (smallest.width * smallest.height > largest.width * largest.height * 0.5) continue;
    const ratio = Math.round((smallest.width / s.spec.canvas) * 100) / 100;
    ratios.set(ratio, [...(ratios.get(ratio) ?? []), s.record.spec.name]);
  }
  if (ratios.size < 2) return [];
  const sorted = [...ratios.entries()].sort((a, b) => b[1].length - a[1].length);
  const [common, ...rest] = sorted;
  if (!common) return [];
  return rest.map(([ratio, names]) => ({
    id: "badge-consistency",
    label: "Badges of different sizes",
    severity: "warning" as const,
    message: `${names.join(", ")} use a badge ${Math.round(ratio * 100)}% of the canvas, where ${common[1].length} other ${common[1].length === 1 ? "icon uses" : "icons use"} ${Math.round(common[0] * 100)}%.`,
    icons: names,
  }));
}

/**
 * An icon that scores far below its siblings. Not wrong, but different — which
 * is the whole definition of drift in a set that is otherwise coherent.
 */
function scoreOutliers(subjects: Subject[]): AuditFinding[] {
  const scored = subjects.filter((s) => s.validation.overall !== undefined);
  // "Unlike its siblings" needs siblings. Calling something an outlier out of
  // four samples is noise dressed as a finding, and a check that cries wolf
  // teaches people to ignore every check.
  if (scored.length < 8) return [];
  const values = scored.map((s) => s.validation.overall!).sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)]!;
  const deviations = values.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const spread = deviations[Math.floor(deviations.length / 2)]!;
  // With no spread there is nothing to be an outlier from.
  if (spread < 0.02) return [];
  const cutoff = median - spread * 3;
  return scored
    .filter((s) => s.validation.overall! < cutoff)
    .map((s) => ({
      id: "outlier",
      label: "Unlike its siblings",
      severity: "info" as const,
      message: `${s.record.spec.name} scores ${s.validation.overall!.toFixed(2)} against a set median of ${median.toFixed(2)}. Weakest: ${
        [...s.validation.scores].sort((a, b) => a.value - b.value)[0]?.label.toLowerCase() ?? "unknown"
      }.`,
      icons: [s.record.spec.name],
    }));
}
