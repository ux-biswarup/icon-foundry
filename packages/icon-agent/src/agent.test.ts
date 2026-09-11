import { describe, expect, it } from "vitest";
import { Library, MemoryStore } from "@icon-foundry/icon-library";
import { createIcon, NoVocabularyError } from "./index.js";
import type { AgentModel, AgentTool } from "./types.js";

async function library() {
  const lib = await Library.create(new MemoryStore(), { id: "acme", name: "Acme", language: "lucide-inspired" });
  await lib.save(
    {
      name: "cold-storage",
      language: "lucide-inspired",
      canvas: 24,
      elements: [{ primitive: "warehouse", x: 2, y: 4, width: 20, height: 16 }],
    },
    { status: "published", concepts: ["cold chain"] },
  );
  return lib;
}

const call = async (tools: AgentTool[], name: string, input: unknown) => {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t.execute(t.inputSchema.parse(input));
};

describe("createIcon without a model", () => {
  it("plans up to three validated variants from existing vocabulary", async () => {
    const result = await createIcon({ brief: { text: "temperature controlled warehouse" }, library: await library() });
    expect(result.model).toBe("planner");
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    expect(result.candidates.length).toBeLessThanOrEqual(3);
    for (const c of result.candidates) {
      expect(c.validation.valid).toBe(true);
      expect(c.svg.startsWith("<svg")).toBe(true);
      expect(c.rationale.length).toBeGreaterThan(10);
      expect(c.newElements).toEqual([]);
      expect(c.source).toBe("planner");
    }
    expect(new Set(result.candidates.map((c) => c.spec.name)).size).toBe(result.candidates.length);
  });

  it("honours a requested style and canvas", async () => {
    const result = await createIcon({ brief: { text: "truck", style: "filled", canvas: 16 }, library: await library() });
    expect(result.candidates[0]?.spec.style).toBe("filled");
    expect(result.candidates[0]?.spec.canvas).toBe(16);
  });

  it("fails clearly when nothing in the vocabulary matches", async () => {
    await expect(createIcon({ brief: { text: "cat mouse" }, library: await library() })).rejects.toThrow(NoVocabularyError);
  });
});

describe("createIcon with a model", () => {
  it("lets the model draft through tools, including a new element, and reports steps", async () => {
    const fake: AgentModel = {
      id: "fake",
      async run({ tools }) {
        await call(tools, "read_language", {});
        const elements = (await call(tools, "list_elements", { category: "object" })) as Array<{ name: string }>;
        expect(elements.map((e) => e.name)).toContain("warehouse");
        const hits = (await call(tools, "search_library", { query: "cold chain" })) as Array<{ name: string }>;
        expect(hits[0]?.name).toBe("cold-storage");

        await call(tools, "propose_element", {
          name: "cat",
          category: "object",
          keywords: ["cat"],
          outline: ["M0 20 L0 6 L6 0 L9 3 L15 3 L18 0 L24 6 L24 20 Z", "M8 12 L8 12.01", "M16 12 L16 12.01"],
        });
        const layout = (await call(tools, "layout_from_intent", { subject: "cat", modifiers: ["warning"], name: "cat alert" })) as { spec: unknown; valid: boolean };
        expect(layout.valid).toBe(true);
        const drafted = (await call(tools, "draft_icon", { spec: layout.spec, rationale: "Cat in the square keyline box with a warning badge top-right." })) as { accepted: boolean };
        expect(drafted.accepted).toBe(true);

        // An invalid draft is rejected with issues, not thrown.
        const bad = (await call(tools, "draft_icon", {
          spec: { name: "bad", language: "lucide-inspired", canvas: 24, elements: [{ primitive: "circle", x: 0, y: 0, size: 24 }] },
          rationale: "too big",
        })) as { accepted: boolean; issues: Array<{ rule: string }> };
        expect(bad.accepted).toBe(false);
        expect(bad.issues.map((i) => i.rule)).toContain("safeArea");

        await call(tools, "note_to_designer", { text: "Read 'cat mouse' as a cat with an alert." });
        return { text: "Done.", steps: 7 };
      },
    };
    const result = await createIcon({ brief: { text: "cat mouse" }, library: await library(), model: fake });
    expect(result.model).toBe("fake");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.newElements.map((e) => e.name)).toEqual(["cat"]);
    expect(result.candidates[0]?.source).toBe("model");
    expect(result.notes).toContain("Read 'cat mouse' as a cat with an alert.");
    expect(result.steps.map((s) => s.tool)).toEqual([
      "read_language", "list_elements", "search_library", "propose_element", "layout_from_intent", "draft_icon", "draft_icon", "note_to_designer",
    ]);
  });

  it("falls back to the planner when the model fails or drafts nothing", async () => {
    const broken: AgentModel = { id: "broken", run: async () => { throw new Error("401"); } };
    const result = await createIcon({ brief: { text: "delivery truck" }, library: await library(), model: broken });
    expect(result.model).toBe("broken → planner");
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.notes[0]).toMatch(/model call failed/);

    const silent: AgentModel = { id: "silent", run: async () => ({ text: "", steps: 0 }) };
    const none = await createIcon({ brief: { text: "cat mouse" }, library: await library(), model: silent });
    expect(none.candidates).toEqual([]);
    expect(none.notes.join(" ")).toMatch(/Nothing in the vocabulary/);
  });
});
