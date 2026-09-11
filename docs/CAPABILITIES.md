# Current capabilities

Status as of 2026-09-11, commit `648339c`. This document describes what the
system does today, not what it is planned to do. It is the baseline for the
discussion about free-form icon generation.

## In one paragraph

Icon Foundry today is a **deterministic icon compiler with a fixed
vocabulary**. A designer types a description, the system matches words in it to
one of 23 hand-drawn primitives, arranges them with one of two layout recipes,
renders SVG using the tokens of an Icon Language, validates the result against
that language, and creates a native Figma component. It cannot draw anything
that is not already a primitive. No model, network, or API key is involved.

## What a designer can do in the Figma plugin

| Step | Works today | Notes |
| --- | --- | --- |
| Type an icon description | Yes | Matched by keywords only. See "Vocabulary". |
| Pick an Icon Language | Yes | One language ships: Lucide-inspired v0.1.0. |
| Pick outline or filled | Yes | Filled renders silhouettes; interior details disappear. |
| Generate and preview | Yes | Preview at 96px and 24px, rendered from the same SVG. |
| See a validation checklist | Yes | Ten rules, each shown as pass, warning, or error. |
| Edit the IconSpec JSON and re-render | Yes | This is the only way to fix a layout the recipe got wrong. |
| Create a native Figma component | Yes | Named `icon/<style>/<name>`, spec stored in plugin data. |
| Reopen a component and regenerate it | No | The spec is stored but nothing reads it back yet. |
| Get an icon for a subject with no primitive | No | Fails with "Could not map … to any primitive". |
| Publish to a team library | Manual | Standard Figma publish; the plugin does not automate it. |

## Vocabulary: the 23 primitives

Every icon is assembled only from these. Each is a pure geometry function that
adapts to the language stroke width, corner radius, and style.

| Category | Primitives |
| --- | --- |
| Shapes (6) | circle, square, rounded-rectangle, triangle, line, arc |
| Objects (7) | building, warehouse, package, document, person, vehicle, device |
| Symbols (10) | plus, minus, check, x, warning, snowflake, thermometer, location, clock, arrow |

Each primitive carries keywords. For example "cold", "frozen", "refrigerated"
all resolve to snowflake; "truck", "delivery", "fleet" resolve to vehicle.
Words with no keyword match are ignored. If nothing matches, generation fails.

## How a description becomes an icon

1. **Tokenise.** Lower-case, split, drop stop words such as "icon", "for", "controlled".
2. **Match.** Each remaining word is looked up against primitive names and keywords, with light plural and suffix stripping.
3. **Pick subject and modifiers.** The first matched *object* becomes the subject. Everything else becomes a modifier. At most two modifiers are used.
4. **Lay out.** Two recipes exist:
   - **single**: subject fills the safe area.
   - **badge**: subject shifts down-left, first modifier becomes a top-right badge, second modifier a top-left badge.
5. **Compose.** Each primitive is fitted into its box with a uniform scale, aligned, optionally rotated or flipped, and given the inherited style and stroke.
6. **Render.** Compact SVG with language tokens on the root element.
7. **Validate.** All rules below run on the composed geometry.

There is no step where anything new is drawn. The system arranges, it does not
draw.

## What the IconSpec can express

IconSpec is the canonical file format. Everything the plugin produces is one
of these, and a developer can author one by hand.

- Named primitives placed in boxes (`x`, `y`, `width`/`height` or `size`).
- Rotation, horizontal and vertical flips.
- Alignment within the box when aspect ratios differ.
- An optical offset applied after layout.
- Groups: child elements laid out in a virtual canvas and scaled as one unit, usable as reusable badges.
- Per-spec and per-element overrides of style, stroke width, cap, join, and colour. Overrides are allowed but validated.
- Free-form `meta` for tags, descriptions, and source intent.

It cannot express free-form paths, custom shapes, or anything outside the
primitive registry.

## What the validator checks

| Rule | Severity | What it catches |
| --- | --- | --- |
| canvas | error | Spec canvas differs from the language canvas. |
| style | error | A style the language does not allow. |
| geometry | error | Empty boxes, boxes outside the canvas, degenerate or non-finite shapes. |
| safeArea | error | Any geometry centreline outside the safe area. |
| strokeWidth | warning | Stroke override differs from the language, reported as a percentage. |
| strokeCap | warning | Cap override differs from the language. |
| strokeJoin | warning | Join override differs from the language. |
| color | error | A colour not in the language allow-list. |
| complexity | warning | More primitives or shapes than the language detail budget. |
| grid | warning | Top-level boxes not on the language grid. |
| compose | error | Unknown primitive; reported instead of thrown. |

Not checked: minimum negative space (declared in the language, not
enforced), visual similarity to existing icons, optical balance, legibility at
16px.

## What the Icon Language controls

Canvas size, grid step, safe area, stroke width, cap, join, corner radius,
default and allowed styles, allowed colours, detail level with element and
shape budgets, and a reserved minimum negative space. Renderers read these;
nothing is hard-coded. A second language can be added by copying the JSON
file and registering it.

## The AI layer as it exists

`@icon-foundry/icon-ai` contains three things:

1. **Keyword parser.** Offline, deterministic, used by the plugin today.
2. **Layout recipes.** Turn `{ subject, modifiers, style }` into an IconSpec.
3. **LLM adapter.** Provider-agnostic. Callers pass a `complete(prompt)` function. The model is asked only to choose a subject and modifiers **from the primitive list**, its answer is validated against the registry, and it falls back to the keyword parser on failure.

Nothing calls the LLM adapter yet. Even if wired up, it would have the same
vocabulary limit as the keyword parser, because it may only name existing
primitives.

## Determinism and dependencies

- Same IconSpec plus same language always produces byte-identical SVG.
- Core packages import no Figma API, no vendor SDK, and make no network calls.
- The plugin manifest declares `networkAccess: none`.
- 83 unit tests cover parsing, geometry, composition, rendering, validation, and intent parsing. CI runs typecheck, tests, and the plugin build on every push.

## Known gaps, in order of how often a designer will hit them

1. **Fixed vocabulary.** Any subject without a primitive fails outright. This is the gap raised on 2026-09-11 with "cat mouse".
2. **Badge overlaps subject.** The badge recipe places the modifier over the subject with no knockout gap, so generated icons read as drafts and often need a manual IconSpec edit.
3. **Filled style loses detail.** No cut-out support, so a filled warning has no exclamation mark and a filled warehouse has no door.
4. **Two layout recipes only.** No side-by-side, stacked, or contained arrangements.
5. **No round trip from Figma.** Components carry their spec but cannot be reopened for editing.
6. **One language.** The starter language is the only one; nothing has been tested with a different canvas or stroke.
7. **No negative-space rule.** Cramped compositions pass validation.

## Boundary the current design draws

The line today is: **the system arranges pre-drawn, on-brand parts; it never
invents geometry.** That guarantees consistency and reproducibility and is why
the core needs no model. It is also exactly why "cat mouse" cannot work.
Moving that line is the decision to make next.
