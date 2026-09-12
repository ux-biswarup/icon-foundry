import type { ElementRecord, IconRecord, Library } from "@icon-foundry/icon-library";
import { definePathPrimitive } from "@icon-foundry/icon-primitives";
import { renderSpecToSvg } from "@icon-foundry/icon-renderer";
import { validateIconSpec, type ValidationResult } from "@icon-foundry/icon-validator";

/**
 * What editing one element does to the set.
 *
 * This is the payoff of having a vocabulary rather than a pile of drawings: a
 * folder drawn once is the same folder in all eleven icons that use it, and
 * changing it changes all eleven. That is only safe if you can see the eleven
 * before you commit, which is what this produces.
 */

export interface ElementImpact {
  icon: IconRecord;
  before: { svg: string | undefined; validation: ValidationResult };
  after: { svg: string | undefined; validation: ValidationResult };
  /** True when the drawing actually changes. */
  changed: boolean;
  /** Rules that were clean before and are not after: the cost of the edit. */
  newIssues: string[];
}

/**
 * Render every icon that uses an element, before and after a proposed change.
 * Nothing is written; the caller decides.
 */
export function previewElementChange(library: Library, next: ElementRecord): ElementImpact[] {
  const current = library.registry();
  // The same vocabulary with one element replaced.
  const replacement = definePathPrimitive({ ...next, origin: next.status === "approved" ? "approved" : "draft" });
  const proposed = current.without(next.name).extend([replacement]);

  return library.usages(next.name).map((icon) => {
    const language = library.languageFor(icon.spec);
    const render = (registry: typeof current) => {
      const validation = validateIconSpec(icon.spec, language, { registry });
      const svg = validation.issues.some((i) => i.rule === "compose")
        ? undefined
        : renderSpecToSvg(icon.spec, language, { registry });
      return { svg, validation };
    };
    const before = render(current);
    const after = render(proposed);
    const had = new Set(before.validation.issues.map((i) => i.rule));
    return {
      icon,
      before,
      after,
      changed: before.svg !== after.svg,
      newIssues: [...new Set(after.validation.issues.map((i) => i.rule))].filter((r) => !had.has(r)),
    };
  });
}
