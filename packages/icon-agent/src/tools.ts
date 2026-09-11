import { intentToSpec, slugify } from "@icon-foundry/icon-ai";
import { composedBounds, compose } from "@icon-foundry/icon-composer";
import { resolveTokens } from "@icon-foundry/icon-language";
import { parseIconSpec } from "@icon-foundry/icon-spec";
import { z } from "zod";
import type { Session } from "./session.js";
import type { AgentTool } from "./types.js";

/** Wrap a tool so every call is recorded in the session transcript. */
function recorded<I, O>(session: Session, tool: AgentTool<I, O>): AgentTool<I, O> {
  return {
    ...tool,
    execute: async (input) => {
      try {
        const output = await tool.execute(input);
        session.record({ tool: tool.name, input, output });
        return output;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        session.record({ tool: tool.name, input, output: { error: message } });
        return { error: message } as O;
      }
    },
  };
}

const elementSchema = z.object({
  name: z.string().describe("kebab-case name, e.g. cat"),
  category: z.enum(["shape", "object", "symbol"]),
  description: z.string().optional(),
  keywords: z.array(z.string()).default([]),
  opticalShape: z.enum(["square", "circle", "horizontal", "vertical"]).optional(),
  box: z.object({ width: z.number(), height: z.number() }).optional().describe("natural box; default 24×24 authoring space"),
  outline: z.array(z.string()).min(1).describe("SVG path data for the outline style, authored in the natural box"),
  filled: z.array(z.string()).optional().describe("SVG path data for the filled style; defaults to the closed outline paths"),
});

/**
 * The tools the agent operates the deterministic core through. Every tool is
 * executed by us; the model only chooses which to call and with what input.
 */
export function buildTools(session: Session, brief: { canvas?: number }): AgentTool[] {
  const language = session.language;
  const tokens = resolveTokens(language, brief.canvas);

  const searchLibrary = recorded(session, {
    name: "search_library",
    description: "Find existing icons by concept so you never draw a duplicate. Returns name, status, tags.",
    inputSchema: z.object({ query: z.string() }),
    execute: ({ query }) =>
      session.library.search(query, { limit: 8 }).map(({ record }) => ({
        name: record.spec.name,
        status: record.status,
        tags: record.tags,
        concepts: record.concepts,
      })),
  });

  const listElements = recorded(session, {
    name: "list_elements",
    description:
      "The vocabulary: every primitive and element you may place. Prefer these over drawing new geometry.",
    inputSchema: z.object({ category: z.enum(["shape", "object", "symbol"]).optional() }),
    execute: ({ category }) =>
      session.registry
        .list()
        .filter((p) => !category || p.category === category)
        .map((p) => ({
          name: p.name,
          category: p.category,
          opticalShape: p.opticalShape,
          naturalBox: p.box,
          keywords: p.keywords,
          origin: p.origin ?? "builtin",
        })),
  });

  const readLanguage = recorded(session, {
    name: "read_language",
    description: "The design rules every icon must follow: sizes, stroke, safe area, keyline boxes, gaps, budgets.",
    inputSchema: z.object({}),
    execute: () => ({
      name: language.name,
      version: language.version,
      description: language.description,
      designingFor: {
        canvas: tokens.canvas,
        safeArea: tokens.safeArea,
        grid: tokens.grid,
        stroke: tokens.stroke,
        cornerRadius: tokens.cornerRadius,
        keylineBoxes: tokens.optical,
        minNegativeSpace: tokens.minNegativeSpace,
        budget: tokens.limits,
      },
      otherSizes: Object.keys(language.sizes).map(Number).filter((c) => c !== tokens.canvas),
      styles: language.style,
      colors: language.colors.allowed,
    }),
  });

  const layoutFromIntent = recorded(session, {
    name: "layout_from_intent",
    description:
      "Deterministic layout: fits a subject into its keyline box and places up to two badges with correct gaps. Returns a ready IconSpec you can draft as-is or adjust.",
    inputSchema: z.object({
      subject: z.string().describe("primitive or element name"),
      modifiers: z.array(z.string()).max(2).default([]),
      style: z.enum(["outline", "filled"]).optional(),
      name: z.string().optional(),
    }),
    execute: ({ subject, modifiers, style, name }) => {
      const spec = intentToSpec(
        { subject, modifiers, ...(style && { style }) },
        language,
        { registry: session.registry, ...(name && { name: slugify(name) }), ...(brief.canvas !== undefined && { canvas: brief.canvas }) },
      );
      const { validation } = session.evaluate(spec);
      return { spec, valid: validation.valid, issues: validation.issues };
    },
  });

  const draftIcon = recorded(session, {
    name: "draft_icon",
    description:
      "Validate an IconSpec and, if it has no errors, add it as a candidate (max 3; the oldest is replaced). Returns issues and geometry bounds. Fix warnings when you can.",
    inputSchema: z.object({
      spec: z.unknown().describe("an IconSpec object"),
      rationale: z.string().describe("one or two sentences for the designer, in plain design language"),
    }),
    execute: ({ spec: raw, rationale }) => {
      const spec = parseIconSpec(raw);
      const { validation, svg } = session.evaluate(spec);
      const bounds = svg ? composedBounds(compose(spec, language, { registry: session.registry })) : undefined;
      if (!validation.valid) {
        return { accepted: false, issues: validation.issues, bounds };
      }
      const candidate = session.addCandidate(spec, rationale);
      return { accepted: true, candidateId: candidate.id, warnings: validation.issues, bounds };
    },
  });

  const proposeElement = recorded(session, {
    name: "propose_element",
    description:
      "Draft a new reusable element when the vocabulary has no fitting subject. Author in a 24×24 box with lines at 0°, 45° or 90°, closed shapes, natural proportions. It becomes usable as a primitive name in draft_icon and is saved as a draft element only if the designer approves a candidate that uses it.",
    inputSchema: elementSchema,
    execute: (def) => {
      const clean = {
        name: def.name,
        category: def.category,
        outline: def.outline,
        keywords: def.keywords,
        ...(def.description !== undefined && { description: def.description }),
        ...(def.opticalShape !== undefined && { opticalShape: def.opticalShape }),
        ...(def.box !== undefined && { box: def.box }),
        ...(def.filled !== undefined && { filled: def.filled }),
      };
      session.propose(clean);
      const primitive = session.registry.get(def.name);
      return { registered: def.name, naturalBox: primitive.box, opticalShape: primitive.opticalShape };
    },
  });

  const note = recorded(session, {
    name: "note_to_designer",
    description: "Leave a short note the designer will see next to the candidates (an assumption you made, a question).",
    inputSchema: z.object({ text: z.string() }),
    execute: ({ text }) => {
      session.notes.push(text);
      return { ok: true };
    },
  });

  return [searchLibrary, listElements, readLanguage, layoutFromIntent, draftIcon, proposeElement, note];
}
