import type { IconStyle } from "@icon-foundry/icon-language";
import type { ConceptRecord, IconRecord } from "@icon-foundry/icon-library";
import type { PathPrimitiveDefinition } from "@icon-foundry/icon-primitives";
import type { ConceptComposition, IconSpec } from "@icon-foundry/icon-spec";
import type { Score, ValidationResult } from "@icon-foundry/icon-validator";
import type { z } from "zod";

/** What the user asked for. */
export interface Brief {
  text: string;
  style?: IconStyle;
  /** Optical size to design at. Defaults to the language default. */
  canvas?: number;
  /** Feedback on a previous round, if this is an iteration. */
  feedback?: string;
  /** Candidate the feedback refers to, if any. */
  previous?: IconSpec;
}

/** One proposed icon. Always validated; never published by the agent. */
export interface Candidate {
  id: string;
  spec: IconSpec;
  svg: string;
  validation: ValidationResult;
  /** Soft preferences, and their weighted mean. Used to rank, never to reject. */
  scores: Score[];
  overall: number | undefined;
  /** One or two sentences in the language's own words. */
  rationale: string;
  /** Elements the candidate needs that do not exist yet. Saved as drafts on approval. */
  newElements: PathPrimitiveDefinition[];
  /** A concept the candidate needs that does not exist yet. Saved on approval. */
  newConcept?: ProposedConcept;
  /** The existing concept this candidate answers, when there is one. */
  concept?: string;
  source: "model" | "planner";
}

/** A concept the run invented, pending a human's approval. */
export interface ProposedConcept {
  id: string;
  name: string;
  description?: string;
  aliases: string[];
  composition: ConceptComposition;
}

export interface AgentResult {
  candidates: Candidate[];
  /** Model id, or "planner" when no model was used. */
  model: string;
  /** Short notes the agent wants the user to see (clarifications, caveats). */
  notes: string[];
  /** Tool calls made, for the transcript panel. */
  steps: AgentStep[];
  /**
   * Set when the brief resolved to a concept the library already answers. The
   * run stops there: the cheapest icon is the one that already exists.
   */
  existing?: { concept: ConceptRecord; icon: IconRecord };
}

export interface AgentStep {
  tool: string;
  input: unknown;
  output: unknown;
}

/**
 * A tool the agent can call. Defined with zod so any provider adapter can
 * derive a JSON schema; executed by us, never by the model.
 */
export interface AgentTool<I = unknown, O = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  execute(input: I): Promise<O> | O;
}

/**
 * The only contract the agent has with a model. Adapters (AI SDK, a local
 * server, a test fake) implement it; the agent never imports a vendor SDK.
 */
export interface AgentModel {
  id: string;
  /** Run a tool loop: the model may call tools until it stops or `maxSteps` is hit. */
  run(input: { system: string; prompt: string; tools: AgentTool[]; maxSteps: number }): Promise<{ text: string; steps: number }>;
}
