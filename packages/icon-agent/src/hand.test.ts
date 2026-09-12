import { describe, expect, it } from "vitest";
import { technical } from "@icon-foundry/icon-language";
import { adjustHand, traitRanges } from "./hand.js";
import type { AgentModel, AgentTool } from "./types.js";

/** A model that calls the tools it is told to, so the loop is provable with no key. */
const scripted = (calls: Array<[string, unknown]>, text = "done"): AgentModel => ({
  id: "scripted",
  run: async ({ tools }) => {
    for (const [name, input] of calls) {
      const tool = tools.find((t: AgentTool) => t.name === name);
      if (!tool) throw new Error(`the agent did not offer ${name}`);
      await tool.execute(tool.inputSchema.parse(input));
    }
    return { text, steps: calls.length };
  },
});

describe("what the panel can say without a model", () => {
  it("still reports every trait, its range, and what it reaches", () => {
    const ranges = traitRanges(technical);
    expect(ranges.map((r) => r.trait)).toContain("accentSize");
    const accent = ranges.find((r) => r.trait === "accentSize")!;
    expect(accent.kind).toBe("number");
    expect(accent.consumers).toContain("person");
    const aperture = ranges.find((r) => r.trait === "aperture")!;
    expect(aperture.options).toContain("notch");
    // A trait the renderer reads is reached by no part, and says so.
    expect(ranges.find((r) => r.trait === "grade")!.consumers).toEqual([]);
  });

  it("loses the suggestions rather than the panel", async () => {
    const result = await adjustHand({ request: "make it friendlier", language: technical });
    expect(result.changes).toEqual([]);
    expect(result.construction).toBe(technical.construction);
    expect(result.message).toMatch(/no model/i);
  });
});

describe("moving traits from words", () => {
  it("proposes a value and says which parts it will move", async () => {
    const result = await adjustHand({
      request: "make the wheels and heads a bit bigger",
      language: technical,
      model: scripted([
        ["list_traits", {}],
        ["set_trait", { trait: "accentSize", value: 1.25 }],
      ]),
    });
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({ trait: "accentSize", from: 1, to: 1.25 });
    expect(result.changes[0]!.moves).toContain("vehicle");
    expect(result.construction.accentSize).toBe(1.25);
  });

  it("holds a value to the range the trait declares rather than trusting the model", async () => {
    const result = await adjustHand({
      request: "make them enormous",
      language: technical,
      model: scripted([["set_trait", { trait: "accentSize", value: 99 }]]),
    });
    expect(result.construction.accentSize).toBe(2.5);
  });

  it("refuses a choice that is not one of the trait's own", async () => {
    const result = await adjustHand({
      request: "draw the openings as circles",
      language: technical,
      model: scripted([["set_trait", { trait: "aperture", value: "circle" }]]),
    });
    expect(result.changes).toEqual([]);
    expect(result.rejected.join()).toMatch(/aperture/);
    expect(result.construction.aperture).toBe("mixed");
  });

  it("reports nothing changed when the model proposes what is already set", async () => {
    const result = await adjustHand({
      request: "keep the interiors square",
      language: technical,
      model: scripted([["set_trait", { trait: "interiorRadius", value: 0 }]]),
    });
    expect(result.changes).toEqual([]);
  });

  it("can decline in words instead of forcing an unrelated value", async () => {
    // The failure mode this prevents: a model that must look responsive will
    // move whatever it can reach, and the set drifts to satisfy a sentence.
    const result = await adjustHand({
      request: "give the icons rounded arrow heads",
      language: technical,
      model: scripted([["note_to_designer", { note: "no trait controls arrowheads" }]], "No trait controls arrowheads."),
    });
    expect(result.changes).toEqual([]);
    expect(result.message).toMatch(/arrowhead/i);
  });

  it("never offers a tool that could touch geometry", async () => {
    let offered: string[] = [];
    await adjustHand({
      request: "anything",
      language: technical,
      model: { id: "spy", run: async ({ tools }) => ((offered = tools.map((t) => t.name)), { text: "", steps: 0 }) },
    });
    expect(offered.sort()).toEqual(["explain_trait", "list_traits", "note_to_designer", "set_trait"]);
  });
});
