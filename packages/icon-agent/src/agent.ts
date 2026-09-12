import type { Library } from "@icon-foundry/icon-library";
import { NoVocabularyError, plan } from "./planner.js";
import { systemPrompt, userPrompt } from "./prompt.js";
import { Session } from "./session.js";
import { buildTools } from "./tools.js";
import type { AgentModel, AgentResult, Brief, Candidate } from "./types.js";

export interface CreateIconOptions {
  brief: Brief;
  library: Library;
  /** When omitted, the deterministic planner runs. */
  model?: AgentModel;
  maxSteps?: number;
}

/**
 * Turn a brief into up to three validated candidates.
 *
 * With a model: a tool loop over the deterministic core, inside the language.
 * Without one, or if the model produces nothing usable: the planner arranges
 * existing vocabulary. Either way nothing is published; the caller decides.
 */
/**
 * Best first. Soft preferences cannot reject a candidate, but they can say
 * which of three is the one to look at — which is the 156-hamburger process
 * with the comparison done for you.
 */
function ranked(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
}

export async function createIcon(options: CreateIconOptions): Promise<AgentResult> {
  const { brief, library, model } = options;

  // The cheapest icon is the one that already exists. Resolving the brief
  // against the concept registry costs nothing and needs no model, and it is
  // the only thing that stops a set accumulating three icons for one meaning.
  if (!brief.feedback) {
    const concept = library.resolveConcept(brief.text);
    const icon = concept ? library.iconForConcept(concept.id, library.language.id) : undefined;
    if (concept && icon) {
      return {
        candidates: [],
        model: "registry",
        notes: [`"${concept.name}" is already answered by ${icon.spec.name}. Nothing was drafted.`],
        steps: [{ tool: "resolve_concept", input: { text: brief.text }, output: { concept: concept.id, icon: icon.spec.name } }],
        existing: { concept, icon },
      };
    }
  }

  if (!model) {
    const session = new Session(library, "planner");
    const candidates = plan(brief, session);
    return { candidates: ranked(candidates), model: "planner", notes: session.notes, steps: session.steps };
  }

  const session = new Session(library, "model");
  const tools = buildTools(session, brief);
  let text = "";
  try {
    const result = await model.run({
      system: systemPrompt(library.language, brief.canvas),
      prompt: userPrompt(brief),
      tools,
      maxSteps: options.maxSteps ?? 24,
    });
    text = result.text;
  } catch (error) {
    session.notes.push(`The model call failed (${error instanceof Error ? error.message : String(error)}). Showing deterministic layouts instead.`);
  }

  if (session.candidates.length === 0) {
    const fallback = new Session(library, "planner");
    try {
      const candidates = plan(brief, fallback);
      if (session.notes.length === 0) session.notes.push("The model produced no valid candidate; showing deterministic layouts instead.");
      return {
        candidates: ranked(candidates),
        model: `${model.id} → planner`,
        notes: [...session.notes, ...fallback.notes],
        steps: session.steps,
      };
    } catch (error) {
      if (error instanceof NoVocabularyError) {
        return { candidates: [], model: model.id, notes: [...session.notes, error.message], steps: session.steps };
      }
      throw error;
    }
  }

  if (text.trim()) session.notes.push(text.trim());
  return { candidates: ranked(session.candidates), model: model.id, notes: session.notes, steps: session.steps };
}
