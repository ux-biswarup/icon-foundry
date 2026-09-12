import { compose } from "@icon-foundry/icon-composer";
import type { IconLanguage } from "@icon-foundry/icon-language";
import { definePathPrimitive, type PathPrimitiveDefinition, type PrimitiveRegistry } from "@icon-foundry/icon-primitives";
import { renderSvg } from "@icon-foundry/icon-renderer";
import type { IconSpec } from "@icon-foundry/icon-spec";
import { validateIconSpec, type ValidationResult } from "@icon-foundry/icon-validator";
import type { Library } from "@icon-foundry/icon-library";
import type { AgentStep, Candidate, ProposedConcept } from "./types.js";

export const MAX_CANDIDATES = 3;

/**
 * Mutable state for one agent run: the registry (library elements plus any
 * elements proposed during the run), the candidates drafted so far, and the
 * transcript. Tools close over a session.
 */
export class Session {
  readonly language: IconLanguage;
  readonly candidates: Candidate[] = [];
  readonly proposedElements = new Map<string, PathPrimitiveDefinition>();
  readonly proposedConcepts = new Map<string, ProposedConcept>();
  readonly steps: AgentStep[] = [];
  readonly notes: string[] = [];
  private registry_: PrimitiveRegistry;
  private counter = 0;

  constructor(
    readonly library: Library,
    readonly source: Candidate["source"],
  ) {
    this.language = library.language;
    this.registry_ = library.registry();
  }

  get registry(): PrimitiveRegistry {
    return this.registry_;
  }

  nextId(): string {
    this.counter += 1;
    return `c${this.counter}`;
  }

  record(step: AgentStep): void {
    this.steps.push(step);
  }

  /** Validate and render a spec with the session registry. */
  evaluate(spec: IconSpec): { validation: ValidationResult; svg: string | undefined } {
    const validation = validateIconSpec(spec, this.language, { registry: this.registry_ });
    const composable = !validation.issues.some((i) => i.rule === "compose");
    const svg = composable ? renderSvg(compose(spec, this.language, { registry: this.registry_ }), this.language) : undefined;
    return { validation, svg };
  }

  /** Register a proposed element for the rest of the run. Replaces a previous proposal of the same name. */
  propose(def: PathPrimitiveDefinition): void {
    if (this.library.registry().has(def.name) && !this.proposedElements.has(def.name)) {
      throw new Error(`"${def.name}" already exists in the vocabulary; use it or pick another name`);
    }
    definePathPrimitive(def); // throws on invalid geometry
    this.proposedElements.set(def.name, def);
    this.registry_ = this.library
      .registry()
      .extend([...this.proposedElements.values()].map((d) => definePathPrimitive({ ...d, origin: "draft" })));
  }

  /** Elements a spec uses that only exist as proposals in this session. */
  newElementsFor(spec: IconSpec): PathPrimitiveDefinition[] {
    const used = new Set<string>();
    const walk = (els: IconSpec["elements"]) => {
      for (const el of els) {
        if (el.children) walk(el.children);
        else if (el.primitive) used.add(el.primitive);
      }
    };
    walk(spec.elements);
    return [...this.proposedElements.values()].filter((d) => used.has(d.name));
  }

  /** Add a validated candidate. Errors are rejected; warnings are allowed and shown. */
  addCandidate(spec: IconSpec, rationale: string, concept?: string): Candidate {
    const { validation, svg } = this.evaluate(spec);
    if (!validation.valid || !svg) {
      const errors = validation.issues.filter((i) => i.severity === "error").map((i) => `${i.rule}: ${i.message}`);
      throw new Error(`candidate rejected: ${errors.join("; ")}`);
    }
    const candidate: Candidate = {
      id: this.nextId(),
      spec,
      svg,
      validation,
      scores: validation.scores,
      overall: validation.overall,
      rationale,
      newElements: this.newElementsFor(spec),
      ...(concept && { concept }),
      ...(concept && this.proposedConcepts.has(concept) && { newConcept: this.proposedConcepts.get(concept)! }),
      source: this.source,
    };
    if (this.candidates.length >= MAX_CANDIDATES) this.candidates.shift();
    this.candidates.push(candidate);
    return candidate;
  }
}
