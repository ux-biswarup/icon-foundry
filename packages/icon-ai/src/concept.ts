/**
 * The concept compiler, re-exported.
 *
 * The implementation moved to `icon-composer` so that the composer can run it
 * at render time — see the note there. This module stays so that the agent's
 * imports still read as concept work rather than composition work.
 */
export {
  ConceptError,
  composeConcept,
  deriveElements,
  pruneParts,
  type ComposeConceptOptions,
  type PrunedComposition,
} from "@icon-foundry/icon-composer";
