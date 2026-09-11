# Language Studio: defining an icon language the way Apple would

A proposal for the "master setup board" where a team defines the principles,
properties, values, and character of its iconography. Discussion draft,
2026-09-11. Nothing here is built.

---

## 1. How Apple would frame the problem

Apple would not start with "a settings page for icon properties". They would
start with a different question:

> How do we make thousands of people, and eventually software, draw icons that
> feel like they came from one hand?

Their answer, historically, has three parts that we should copy:

1. **Principles before properties.** The Human Interface Guidelines lead with
   clarity, deference, and depth. Numbers come later, and every number is
   justified by a principle. A stroke width is not a preference; it is the
   consequence of "legible at 17pt next to SF Pro Regular".
2. **A template, not a rulebook.** SF Symbols ships as a drawable template with
   guide lines: baseline, cap height, margins, and a reference symbol already
   drawn on it. Designers draw *on top of an example*, so the rules are felt,
   not read. The template is the language.
3. **Tools that make the wrong thing hard.** The SF Symbols app validates a
   custom symbol against the template and refuses to export a broken one. It
   does not lecture; it shows you the guide you crossed.

There is a fourth part that is easy to miss: **derive, don't enumerate.** SF
Symbols has nine weights and three scales, but a designer chooses *one*
weight and *one* scale. Everything else, including stroke, spacing, and
optical size, is derived so it matches the text it sits beside. Few decisions
in, many consistent values out.

So the Apple-shaped version of our problem is not "expose every field of
`language.json`". It is:

> Ask the team a small number of decisions that a design lead can actually
> defend, show the consequences immediately on real icons, and derive the
> rest.

## 2. Design principles for the Studio

1. **Every decision is visible on a reference set.** Nothing is edited in the
   abstract. A dozen exemplar icons sit beside the controls and re-render on
   every change. You do not set stroke width to 1.75; you drag until the
   warehouse looks right next to your body text.
2. **Principles are first-class data, not documentation.** The character of
   the language (what it should feel like, what metaphors it uses, what it
   avoids) is stored in the language file and consumed by the renderer,
   validator, and any model. Words a designer writes become constraints, not
   a PDF nobody opens.
3. **Few core decisions; derived tokens.** The Studio asks about eight
   questions. Corner radius, badge size, detail budget, safe area, and the
   like are proposed from those and can be unlocked and overridden, with the
   override recorded as a deliberate exception.
4. **Progressive disclosure.** The first screen fits on one view and produces
   a usable language. Advanced controls exist but are folded away.
5. **Start from a lineage.** Nobody starts blank. You begin from a preset
   (Lucide-like, SF-like, Material-like, Phosphor-like) and diverge. The
   Studio records what you changed, so the language has a history and a
   reason.
6. **Versioned like an API.** Publishing a language creates an immutable
   version with a changelog. Icons record which version they were built with.
   Upgrading a set is a re-render plus a diff, not a redraw.
7. **Validation is guidance.** When an icon breaks a rule, the Studio shows
   the guide it crossed on the canvas, in the language's own words: "Leaves
   the breathing room the language asks for". Errors are rare and reserved
   for things that would corrupt the set.

## 3. What an Icon Language contains

Today `language.json` holds tokens. The Studio would grow it into five layers.
Each layer is consumed by something in the pipeline.

```text
┌──────────────┐  who consumes it
│ 1 Character  │  model prompts, documentation, naming, validator tone
│ 2 Grammar    │  composer (layout rules), validator (composition rules)
│ 3 Tokens     │  renderer, validator (what exists today)
│ 4 Exemplars  │  Studio preview, regression tests, similarity checks
│ 5 Governance │  versioning, exceptions, ownership
└──────────────┘
```

### 3.1 Character

The "psychology" of the set, written as choices with consequences, not free
text alone.

- **Personality axes** (each a slider with a named pole): geometric ↔ organic,
  minimal ↔ expressive, technical ↔ friendly, literal ↔ abstract. These bias
  derived tokens (organic raises corner radius, technical lowers detail
  budget) and become the spine of any model prompt.
- **Purpose statement**: one sentence, e.g. "Icons for operational logistics
  software used eight hours a day; they should be quiet, precise, and
  scannable at 16px."
- **Metaphor policy**: which metaphors are welcome (containers, arrows, badges)
  and which are banned (skeuomorphic hardware, faces, hands). This is where
  "how do we draw a warehouse" is decided once.
- **Vocabulary**: the nouns the product owns (shipment, hub, lane, exception).
  This seeds primitive naming and keyword matching.

### 3.2 Grammar

Rules about how icons are built, not how they are drawn.

- **Composition patterns** allowed: single subject, subject + badge (where,
  how large, knockout gap), subject + container, pair, stack.
- **Modifier rules**: a badge may only be a symbol, never an object; at most
  one badge; badge sits top-right unless the subject has mass there.
- **Detail budget** per optical size: how many strokes an icon may have at
  16px versus 24px.
- **Silhouette rule**: every icon must be recognisable as a filled silhouette.
  This decides whether the filled style is a variant or a test.

### 3.3 Tokens

What exists today, restructured around **optical sizes** the way SF Symbols
uses scales: canvas, grid, safe area, stroke width, caps, joins, corner
radius, terminal style, allowed styles and colours, and how each token
changes at 16, 24, and 32. Most are derived from two decisions: the weight of
the text the icons sit beside, and the optical size they are designed at.

### 3.4 Exemplars

Twelve to twenty reference icons chosen to cover the grammar: one simple
object, one complex object, one symbol, one badge composition, one arrow,
one filled variant, one edge case that is deliberately hard. They are stored
as IconSpecs in the language folder and serve three roles: live preview in
the Studio, regression tests when the language changes, and the reference a
model or a new designer is shown before drawing anything.

### 3.5 Governance

Owner, version, changelog, deprecated tokens, recorded exceptions ("stroke
1.5 allowed in badge context because…"), and the lineage preset the language
diverged from.

## 4. The Studio experience

A single-window, left-controls, right-canvas layout. The canvas always shows
the exemplar set, both at the design size and at the smallest optical size,
on the background colours the product uses.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Company Icons · Draft from v0.1.0                          Compare ▾  Publish │
├────────────────────┬─────────────────────────────────────────────────────┤
│ 1 Start            │                                                     │
│ 2 Character   ●    │     ▢  ▣  ⌂  ✓  ⚠  →  ⊕  ◷  ☃  ▤  ⬡  ✕            │
│ 3 Canvas & optics  │        the exemplar set, re-rendered live          │
│ 4 Weight           │                                                     │
│ 5 Form             │     16px row on light   16px row on dark            │
│ 6 Composition      │     ▫ ▪ ⌂ ✓ ⚠ → ⊕ ◷      ▫ ▪ ⌂ ✓ ⚠ → ⊕ ◷            │
│ 7 Colour & modes   │                                                     │
│ 8 Exemplars        │   ┌───────────────────────────────────────────────┐ │
│ 9 Publish          │   │ Guides: grid · safe area · optical centre  ⌄  │ │
│                    │   └───────────────────────────────────────────────┘ │
├────────────────────┴─────────────────────────────────────────────────────┤
│ Character                                                                │
│ Geometric ────●──────── Organic      Minimal ──●────────── Expressive    │
│ Technical ──●────────── Friendly     Literal ───────●───── Abstract      │
│ Purpose: "Quiet, precise icons for operational logistics software…"     │
│ Metaphors we use: containers, arrows, badges   We avoid: faces, hands    │
│                                                                          │
│ Derived from this: corner radius 2 · detail budget low · badge ratio 0.35│
│ (unlock to override)                                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

Step by step, in the order a design lead thinks:

1. **Start.** Pick a lineage preset or import an existing SVG set. Importing
   measures stroke, radius, and canvas from the files and proposes tokens,
   so a team with 300 icons starts from *their* reality.
2. **Character.** The sliders and statements above. The exemplars visibly
   shift as sliders move, because the derived tokens move.
3. **Canvas & optics.** Choose the optical sizes the product uses and the
   type it sits beside. The Studio shows the exemplars inline with sample
   text at each size. Safe area and grid are derived and shown as guides.
4. **Weight.** One control, presented like a font weight picker, with the
   exemplars beside sample text. Stroke width per optical size is derived.
5. **Form.** Corners, terminals, angle policy (45° only, or free), how
   circles meet lines. Each option is a small before/after pair, not a
   number field.
6. **Composition.** Toggle the allowed patterns; drag the badge to set its
   corner, size, and knockout gap on a live badge exemplar.
7. **Colour & modes.** Monochrome by default. Optionally define hierarchical
   or multicolour rendering modes with roles (primary, secondary, accent),
   the way SF Symbols does, rather than fixed hex values.
8. **Exemplars.** Curate the reference set. The Studio warns if the set does
   not cover a pattern the grammar allows.
9. **Publish.** Name a version, write the changelog, see the diff against the
   previous version rendered as a before/after of every exemplar, export
   `language.json` and the exemplar specs. Icons already built with the
   previous version can be re-rendered in bulk.

Throughout, **Compare** overlays the current draft against the published
version or against a lineage preset, so divergence is always a conscious act.

## 5. What this means for the architecture

Almost everything the Studio needs already has a home.

| Studio concept | Where it lands | Change |
| --- | --- | --- |
| Character, grammar, governance | `IconLanguage` schema | New optional sections; today's tokens become `tokens`. |
| Derived tokens | new `@icon-foundry/icon-language` function `deriveTokens(character, optics)` | Pure, tested, overridable. |
| Optical sizes | `IconLanguage.tokens` keyed by size | Renderer picks the size; composer scales the detail budget. |
| Composition patterns | `@icon-foundry/icon-ai` recipes → move to a `@icon-foundry/icon-grammar` package | Recipes become data-driven from the grammar section. |
| Exemplars | `languages/<id>/exemplars/*.json` | Rendered in tests; used by Studio and prompts. |
| Guides on canvas | renderer option to emit guide layers | Studio and plugin share it. |
| Language diff | new function comparing two versions by re-rendering exemplars | Feeds the Publish step and the CLI. |
| Studio UI | `apps/web` (the empty slot in the original structure) | Vite app over the core packages; the Figma plugin gets a read-only "Language" tab that links to it. |

The core stays deterministic and offline. The Studio is a client of the core,
like the plugin.

Where the model fits, if that decision is later made in favour of generation:
the **Character** layer is the prompt spine and the **Exemplars** are the
few-shot examples. That is the only honest way to make a model draw in a
language: show it the principles the humans wrote and the icons the humans
approved, then validate its output with the same rules.

## 6. Where it should live

Two options, one recommendation.

- **Inside the Figma plugin.** Closest to the designer, but a 380px panel is
  the wrong place for a nine-step, side-by-side-comparison workflow, and a
  design lead defines a language a few times a year while designers make
  icons daily. Mixing the two audiences in one panel dilutes both.
- **A web app (`apps/web`), recommended.** Room for the canvas and the
  comparisons, shareable by URL for review, and it fills the slot the
  original structure reserved. The plugin consumes the published language
  and shows a compact summary of it.

## 7. Open questions for discussion

1. Which personality axes matter for your team, and which are noise? Four is
   a guess.
2. Should optical sizes be in the first version, or is a single 24px canvas
   enough until the product needs 16px?
3. Import from existing SVGs: essential for adoption, or a distraction until
   the language model is right?
4. Who is allowed to publish a language version, and does the Studio need
   accounts to answer that, or is Git the governance layer for now?
5. Does the Studio need to exist before deciding on model-drafted geometry,
   or in parallel? My view: the Character and Exemplar layers are
   prerequisites for any model doing acceptable work, so the Studio comes
   first either way.

---

## 8. Addendum after reading "The making of Cursor's icons"

See [research/cursor-icons.md](research/cursor-icons.md) for the full mapping.
The changes it forces on this proposal:

- **Optical shapes** join the Grammar layer: four fitting boxes (square,
  circle, horizontal, vertical); every primitive declares one; the composer
  fits to it. This replaces the single square safe area as the main
  consistency mechanism.
- **Optical sizes** move into the first version of Tokens. Two sizes with
  different stroke and detail budgets is the norm, not an advanced feature.
- **Negative space** gets a default of 3 grid units and an enforced rule.
- **Cut-outs** for the filled style become a requirement of the renderer.
- **Character** gains a directionality decision and a construction policy
  (angle set, closed over open, rounding after lines), each with a visible
  consequence in the exemplars.
- **Audit is set-level.** The Studio gets an Overview view that runs
  consistency checks across all exemplars and, later, across a team's whole
  library: same optical shape for same category, same badge size everywhere,
  same recurring element every time.
- **Preview is true-size first.** Zoom is a secondary view.
- **Explorations are a workflow.** Generating several candidates and
  comparing them at true size is how the human process works; the plugin
  should support it before any model does.
