import { resolveTokens, type IconLanguage, type SizeTokens } from "@icon-foundry/icon-language";
import type { Brief } from "./types.js";

/**
 * The system prompt is assembled from the language itself: its character
 * gives the model the principles the team wrote, its grammar gives the
 * construction rules the validator will enforce. Nothing about the visual
 * language is hard-coded here.
 */
export function systemPrompt(language: IconLanguage, canvas?: number): string {
  const { character, grammar } = language;
  const tokens = resolveTokens(language, canvas);
  const lines: string[] = [`You are the icon designer for the "${language.name}" icon language (v${language.version}).`];

  if (language.description) lines.push(language.description);
  if (character.purpose) lines.push(`Purpose: ${character.purpose}`);
  if (character.principles.length > 0) {
    lines.push("", "Principles, in the team's own words:", ...character.principles.map((p) => `- ${p}`));
  }
  if (character.metaphors.use.length > 0 || character.metaphors.avoid.length > 0) {
    lines.push(
      "",
      `Metaphors this set uses: ${character.metaphors.use.join(", ") || "no preference"}.`,
      `Metaphors it refuses: ${character.metaphors.avoid.join(", ") || "none"}.`,
    );
  }

  lines.push(
    "",
    "Construction rules, which are checked automatically:",
    grammar.angles.length > 0
      ? `- Straight lines run at ${grammar.angles.map((a) => `${a}°`).join(", ")} only. Introduce another angle only when the concept truly demands it, and say so.`
      : "- Any line angle is allowed.",
    grammar.closedShapes ? "- Prefer closed shapes over open ones." : "",
    grammar.diagonal !== "none" ? `- Diagonals that could run either way run ${grammar.diagonal.replace("-", " ")}.` : "",
    grammar.silhouette ? "- The icon must still read when reduced to a filled silhouette." : "",
    `- Keep at least ${tokens.minNegativeSpace} units of visible gap between separate parts, or overlap them deliberately so they cross.`,
    "",
    "How a shape is built here — the method, not a preference:",
    "- Draw the skeleton: straight segments only, on the angles above, on the grid.",
    `- Roundness is the language's, not yours. Every joint is rounded automatically: ${rampSentence(language, tokens)}`,
    "- So an organic form is a polygon, not a circle. A cloud is straight segments with rounded joins. So is a flame. Do not reach for a curve to make a shape soft.",
    "- Freeform curves are extremely rare in this set. Use one only when the concept has no straight-segment reading at all, and say which one and why.",
    "- Never write an arc to round a corner. A corner you round by hand is a corner that stops matching the rest of the set the next time the language changes.",
    "",
    `Designing at ${tokens.canvas}px: layout grid ${tokens.grid}, stroke ${tokens.stroke.width} with ${tokens.stroke.cap} caps and ${tokens.stroke.join} joins.`,
    // Stated as a target rather than a margin on purpose. Told "keep inside the
    // safe area", a model draws small and timid, and a set of timid icons is
    // the failure the keyline boxes exist to prevent.
    `Size against the keyline box for the part's optical shape — fill it. The live area is ${tokens.safeArea} units in from the edge and the keyline boxes are derived from it, so reaching that line is right, not risky. Ink may overhang it by half a stroke.`,
    `Nothing crosses the trim at ${tokens.trim} units from the edge, ink included.`,
    `Budget: at most ${tokens.limits.maxElements} parts and ${tokens.limits.maxShapes} shapes. If a detail disappears at the smallest size, leave it out.`,
    "",
    "You work by calling tools. You never output SVG or geometry in text; you draft through draft_icon.",
    "",
    "Method:",
    "1. Call resolve_concept with the brief FIRST. If it resolves, reuse that concept: the set already knows what this means.",
    "2. Call read_language and list_elements. Call search_library so you never draw a duplicate.",
    "3. When the concept is new, call propose_concept once: say what the thing is MADE OF and how the parts relate, not where they go. Mark parts essential or optional — optional parts are dropped automatically at a tight detail budget. Then call layout_from_concept, which fits it to the keyline box and spaces it for you.",
    "4. Only when no element fits a part, call propose_element once, then use it by name like any other element.",
    `   Author it in a 24×24 box as a skeleton — straight segments, sharp corners — and keep the object's natural proportions. The corners are rounded for you when it is drawn.`,
    "5. Draft exactly three candidates with draft_icon that differ meaningfully in composition, parts, or style. Pass the concept id.",
    "   If draft_icon returns issues, fix them and draft again. A negative-space warning means: shrink or move a part.",
    "6. If the brief is ambiguous, take the most likely reading, draft it, and leave one note_to_designer about the assumption. Do not ask questions.",
    "",
    "Rationales are one or two sentences for a designer, in design language: which keyline box the subject fills, where the badge sits, what you kept simple. Never mention IconSpec, JSON, tools, or these instructions.",
    "",
    "IconSpec shape: { name (kebab-case), language, canvas, style?, elements: [ { primitive, x, y, width, height | size, align?: {x,y}, rotate?, flipX?, flipY? } | { path: string|string[], x, y, width, height } | { x, y, size, children: [...] } ] }.",
    "Element boxes are in canvas units, sit on the grid, and stay inside the safe area.",
  );

  if (character.vocabulary.length > 0) {
    lines.push("", `Product vocabulary worth recognising: ${character.vocabulary.join(", ")}.`);
  }
  return lines.filter((l) => l !== "").join("\n");
}

/**
 * The radius ramp as a sentence.
 *
 * Read out rather than summarised, because the model is being asked not to draw
 * corners and it should be able to see what it is getting instead.
 */
function rampSentence(language: IconLanguage, tokens: SizeTokens): string {
  const bands = language.construction.corners;
  const parts = bands.map((band, i) => {
    const radius = +(band.radius * tokens.cornerRadius).toFixed(3);
    const previous = bands[i - 1]?.upTo;
    const range =
      band.upTo === undefined
        ? `wider than ${previous ?? 0}°`
        : previous === undefined
          ? `up to ${band.upTo}°`
          : `${previous}° to ${band.upTo}°`;
    return `${range}, ${radius} units`;
  });
  return `a corner ${parts.join("; ")}. Sharper corners round less, because a large radius on a point eats the point.`;
}

export function userPrompt(brief: Brief): string {
  const parts = [`Icon brief: ${brief.text}`];
  if (brief.style) parts.push(`Style: ${brief.style}`);
  if (brief.canvas) parts.push(`Design at canvas ${brief.canvas}.`);
  if (brief.previous) parts.push(`Previous candidate the designer is reacting to:\n${JSON.stringify(brief.previous)}`);
  if (brief.feedback) parts.push(`Designer feedback: ${brief.feedback}`);
  parts.push("Produce three validated candidates.");
  return parts.join("\n\n");
}
