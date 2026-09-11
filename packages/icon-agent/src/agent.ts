import type { Library } from "@icon-foundry/icon-library";
import { NoVocabularyError, plan } from "./planner.js";
import { systemPrompt, userPrompt } from "./prompt.js";
import { Session } from "./session.js";
import { buildTools } from "./tools.js";
import type { AgentModel, AgentResult, Brief } from "./types.js";

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
export async function createIcon(options: CreateIconOptions): Promise<AgentResult> {
  const { brief, library, model } = options;

  if (!model) {
    const session = new Session(library, "planner");
    const candidates = plan(brief, session);
    return { candidates, model: "planner", notes: session.notes, steps: session.steps };
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
      return { candidates, model: `${model.id} → planner`, notes: [...session.notes, ...fallback.notes], steps: session.steps };
    } catch (error) {
      if (error instanceof NoVocabularyError) {
        return { candidates: [], model: model.id, notes: [...session.notes, error.message], steps: session.steps };
      }
      throw error;
    }
  }

  if (text.trim()) session.notes.push(text.trim());
  return { candidates: session.candidates, model: model.id, notes: session.notes, steps: session.steps };
}
