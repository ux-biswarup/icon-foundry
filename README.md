# Icon Foundry

**A design-system-native icon foundry for creating, validating, and publishing custom icons in your own visual language.**

Icon Foundry lets a design team write down how their icons are built, then draws every new icon from those rules, checks it against them, ships the set to code, and syncs it into Figma. The design system is the source of truth. AI is optional.

## The problem

Every product eventually needs icons its icon library does not have.

Teams start with Lucide, Material, Phosphor, or another excellent open-source set. Then the product grows and needs a *temperature-controlled warehouse*, a *shipment exception*, a *delayed delivery*, or some concept that only exists inside the company. The usual fix looks like this:

1. Search several icon libraries for something close.
2. Modify it by hand.
3. Fix the stroke width, proportions, spacing, and visual weight to match the rest.
4. Export it and paste it into Figma.
5. Repeat for the next missing icon.

The result is a library where the 40th icon does not quite look like the 1st, and a team that stays dependent on an external library for every future need. AI icon generators do not solve this. They produce a clever SVG once, in a style of their own choosing, with no memory of your rules.

The deeper problem is not the missing icon. **An icon set is easy to start and impossible to keep.** Six months in, nobody remembers why the stroke is 1.25, two people have drawn the same concept under different names, and the rules that held the set together live in one designer's head. Every mechanism here exists to move a decision out of someone's head and into the system.

## What Icon Foundry offers

Icon Foundry treats icon creation like compilation rather than drawing. Three owners, one boundary each: **AI understands the request, the Icon Language understands the brand, the compiler understands the geometry.**

```text
Icon intent
    ↓          AI understands the request
Concept: what the thing is made of
    ↓          the Icon Language understands the brand
IconSpec
    ↓          the compiler understands the geometry
Deterministic composer → optical passes → renderer
    ↓
Validator: enforced rules, scored preferences, questions for a person
    ↓
SVG · sprite · React · TypeScript · CSS · manifest · Figma
```

**An Icon Language, in three layers.** *Character*: the purpose, personality, principles, and the metaphors your set refuses. *Grammar*: how icons are constructed, such as 45° line angles, closed shapes, where a badge sits, and how much gap two parts must keep. *Tokens*: optical sizes with their own stroke, safe area and detail budget, keyline boxes so a wide icon and a round one read as the same size, corner radius, allowed styles and colours. The character is not documentation; it is the prompt any drafting agent receives, and the grammar is what the validator enforces.

Two languages ship. **Technical** is the default: a 16px primary size at a 1.25 stroke, with 24px and 32px companions at 1.5 and 2.5, construction on 45° increments, closed shapes, and gaps wide enough to survive at small sizes. Every one of those weights is a starting point you edit in the studio, not a rule. **Lucide-inspired** is a second worked example. Copy either and make it yours.

**A growing vocabulary.** Composable building blocks such as warehouse, package, vehicle, document, person, snowflake, thermometer, clock, warning, arrow, and basic shapes. Each adapts to the active language, so a warehouse drawn today and one drawn next year share the same stroke and proportions. When a subject is missing, a freeform path or a user-defined element drawn once becomes part of the vocabulary, and every later use is consistent.

**And you own how those parts are built.** This is the layer where a set actually feels like the work of one hand, and it is the part most icon systems leave in a designer's head. Six construction traits — whether a corner inside the silhouette rounds with it, how an opening is drawn, how far detail sits from its contour, how big a wheel or a head is, how steep a receding plane is, and how much to thin a stroke on a dark background. A trait is a named decision, each primitive declares which ones it reads, and setting one changes every part that declared it and nothing else. The panel tells you how many parts each control reaches, and the canvas dims the ones it cannot.

Of the eleven icon systems we surveyed, only Material Symbols exposes construction as tunable axes at all, and only four of them. Everything else, everywhere, is prose.

**IconSpec, a portable icon representation.** An icon is stored as *which primitives go where*, not as path data. The same spec renders to SVG now and to other targets later, and re-renders automatically when the language changes.

**A deterministic composer and renderer.** Same spec plus same language always gives the same output. No randomness, no network, no API key.

**Concepts, so the same idea is only drawn once.** A concept records what a thing *means* and what it is *made of*: a server is a stack of units, whether your set is technical or playful. "Server", "host" and "backend" resolve to one concept and render with no model call. Publishing a second icon for a concept you have already drawn is refused by name. Parts carry a priority, which is how a philosophy prunes: at 16px the optional parts are dropped, so one concept draws correctly at two sizes without anyone drawing either.

**A validator that knows what it is allowed to decide.** Thirteen rules are enforced and block: optical size, safe area, stroke width, caps, joins, colours, grid alignment, negative space, construction angles, geometry sanity, complexity, and the metaphors your language refuses. Five preferences are scored from 0 to 1 and rank candidates without ever refusing one: restraint against the detail budget, optical balance, symmetry, silhouette survival, breathing room. Three questions are put to a person and never answered by the system. A rule that fires on icons that are fine teaches people to ignore every rule, so each one says plainly which kind it is.

**A set that polices itself.** The same scorers run across the whole library: icons drifted from the current language version, near-duplicate geometry, two icons claiming one concept, inconsistent badge size, outliers. Nothing a finding says can block a publish. When a score clusters tightly across your set, that is an unstated rule, and the system offers to write it into the language — always with a preview of exactly which icons would start failing if you accept.

**Optical corrections, if you want them.** Junction notches so ink stops piling up where two strokes meet at a shallow angle, interior thinning so a contour stays the heavier line, and one dot size for every dot in the set. Each is declared in your language and off until you ask, because a correction changes icons you have already shipped.

**A way to actually ship the set.** Individual SVGs, a sprite sheet, React components, a TypeScript module, CSS, and a manifest, or all of them as one ZIP. Only published icons are exported, because a draft is not a release. Codepoints are assigned from U+E000 and never reused, so a later font release cannot renumber what already shipped.

**A studio in the browser, in three tabs.** *Library* is what you have: every icon at true size, searchable by concept, with a draft, review, published, deprecated lifecycle, the set-level findings, and export. *Create* is how you get one more. *Language* is the hand that draws them — one screen sorted by a single rule, that everything changing the drawing sits beside a live canvas of every part and everything else gets out of the way. Move a slider and the whole set redraws as you type. Every part is shown on a light and a dark ground at once, because a stroke weight chosen on white is wrong at night. Your library is a plain folder of JSON that you own and commit to Git; the app opens it directly from disk.

**Say it in words, if you prefer.** Ask for the set to feel more industrial and a model proposes values for the traits it can reach, inside the ranges they declare, naming exactly which parts each change will move. It cannot draw, it cannot save, and when a request maps to no trait it says so instead of nudging something unrelated to look responsive.

**An exception is allowed, and never silent.** Sometimes one shape genuinely needs to break the rule. You see it beside the language value at the same size, you write down what you saw, it is marked on that part wherever it appears, and the audit counts it. One exception is a judgement. Nine on the same trait means the language value is wrong, and the audit says so.

**An optional agent, with any model.** With a model configured, the create page becomes agentic: the model operates the deterministic core through tools, reuses existing elements, drafts a new element only when the vocabulary lacks the subject, and every draft is validated before you see it. Anthropic, OpenAI, Google, any OpenAI-compatible endpoint such as Ollama, or your own adapter. Without a model, the same page arranges the existing vocabulary deterministically. Keys stay on the server side.

**A Figma plugin that is a bridge, not a second authoring tool.** It connects to your library, shows exactly what a sync would change before it changes anything, and writes native components named `icon/<style>/<name>`. Components are found by the name recorded on them and updated in place, so every instance already placed in every file stays attached. Select one and it tells you what it is, according to the library that made it.

## How it works

### 1. Define an Icon Language

```json
{
  "id": "company-icons",
  "name": "Company Icons",
  "version": "0.1.0",

  "character": {
    "purpose": "Icons for a tool someone uses all day. They should be read, not noticed.",
    "axes": { "geometric": 80, "minimal": 75, "technical": 70, "literal": 60 },
    "metaphors": { "use": ["containers", "arrows", "badges"], "avoid": ["faces", "fake depth"] },
    "principles": [
      "Detail is a budget, not a bonus. If it disappears at 16px, it should not be drawn.",
      "Draw a recurring part the same way every time it appears."
    ]
  },

  "grammar": {
    "angles": [0, 45, 90, 135],
    "closedShapes": true,
    "badge": { "ratio": 0.35, "corner": "top-right" },
    "silhouette": true
  },

  "canvas": 16,
  "grid": 0.5,
  "safeArea": 1,
  "stroke": { "width": 1.25, "cap": "round", "join": "round" },
  "cornerRadius": 1.5,
  "minNegativeSpace": 1.5,
  "style": { "default": "outline", "allowed": ["outline", "filled"] },
  "colors": { "allowed": ["currentColor"] },
  "detail": "low",
  "sizes": [{ "canvas": 24, "safeArea": 1.5, "stroke": { "width": 1.5 }, "minNegativeSpace": 2 }]
}
```

### 2. Describe the icon as an IconSpec

```json
{
  "name": "temperature-warehouse",
  "language": "lucide-inspired",
  "style": "outline",
  "canvas": 24,
  "elements": [
    { "primitive": "warehouse", "x": 2, "y": 9, "width": 15, "height": 11, "align": { "x": "start", "y": "end" } },
    { "primitive": "snowflake", "x": 15, "y": 2, "size": 7 }
  ]
}
```

Elements can be rotated, flipped, aligned, nudged for optical balance, grouped into reusable badges, and can override style or stroke per element. A `path` element carries freeform geometry for subjects no primitive covers. The validator flags any override that drifts from the language.

### 3. Compose, render, validate

```ts
import { lucideInspired } from "@icon-foundry/icon-language";
import { parseIconSpec } from "@icon-foundry/icon-spec";
import { renderSpecToSvg } from "@icon-foundry/icon-renderer";
import { validateIconSpec } from "@icon-foundry/icon-validator";

const spec = parseIconSpec(json);
const result = validateIconSpec(spec, lucideInspired);
// result.valid, result.issues[{ severity, rule, message, source }], result.passed

const svg = renderSpecToSvg(spec, lucideInspired);
```

A validation result for an icon that breaks the rules looks like this:

```text
error   safeArea     Geometry leaves the 2-unit safe area by 1.50 units.
warning construction Lines at 26.6° do not follow the language's construction angles (0°, 45°, 90°, 135°).
warning strokeWidth  Stroke is 50% heavier than the language stroke width (3 vs 2).
warning strokeCap    Stroke cap "butt" differs from the language cap "round".
error   color        Color "#ff0000" is not allowed (allowed: currentColor).
warning grid         Element x, y not on the 1-unit grid.
```

### 4. Ship the set

```ts
import { exportLibrary, exportArchive } from "@icon-foundry/icon-export";

const files = exportLibrary(library);           // svg/, sprite.svg, icons.ts,
                                                // icons.tsx, icons.css, icons.json
const zip = exportArchive(library);             // all of it, one download
```

Published icons only, with a manifest naming the language and version each one
was generated from, so a set can always be traced back to the rules that made
it.

### 5. Sync to Figma

```text
Icon Foundry · Acme Icons          Technical v0.2.0

Connected to acme-icons · 47 published icons

This sync would:
  + 6 new          cold-store, transit-delay, dock-door, …
  ~ 3 changed      warehouse, package, vehicle
  = 38 unchanged
  ⊘ 0 deprecated

               [ Sync 9 changes ]

Selected: icon/outline/warehouse
  Library   acme-icons        Concept   warehouse
  Language  technical         Codepoint U+E004
  Synced    2 minutes ago
```

Existing components are updated in place, never replaced, so instances stay
attached everywhere they have been used.

## Getting started

Requirements: Node 20+ and pnpm 10.

```bash
git clone https://github.com/ux-biswarup/icon-foundry.git
cd icon-foundry
pnpm install
pnpm check        # typecheck, tests, plugin build
pnpm examples     # renders examples/*.json to examples/out/ and prints validation
```

To run the studio:

```bash
pnpm dev          # http://localhost:5180
```

It opens with a browser-only demo library. Use **Open folder…** to work on a real library folder; an empty folder becomes a new library. To enable the agent, copy `apps/web/.env.example` to `apps/web/.env` and set a provider:

```bash
ICON_FOUNDRY_PROVIDER=anthropic          # or openai, google, openai-compatible
ICON_FOUNDRY_MODEL=claude-sonnet-5
ANTHROPIC_API_KEY=...
```

To try the Figma plugin locally:

1. Run `pnpm build`.
2. In Figma, open **Plugins → Development → Import plugin from manifest…**.
3. Select `apps/figma-plugin/manifest.json`.
4. Run **Icon Foundry** from the development plugins menu.

## Repository layout

```text
apps/
  web/                 The studio: library, create, language, elements (Vite + React)
  figma-plugin/        Figma bridge: connect, preview a sync, sync, inspect
packages/
  icon-spec/           IconSpec types and parser (the canonical representation)
  icon-language/       Icon Language types, parser, bundled starter language
  icon-primitives/     Geometry model and the primitive library
  icon-composer/       Deterministic layout engine, construction traits, optical passes
  icon-renderer/       SVG renderer
  icon-validator/      Rule engine: enforced rules, scorers, questions for a person
  icon-ai/             The concept compiler, keyword intent parsing, layout recipes
  icon-library/        Team-owned library folder format, concepts, lifecycle, search
  icon-audit/          Set-level findings, rule promotion, element change preview
  icon-export/         Six output formats, ZIP, and the Figma payload
  icon-agent/          Create agent: tools over the core, planner, pluggable providers
languages/
  technical/           The default language: character, grammar and three optical sizes
  lucide-inspired/     A second worked example, plus a JSON schema for authoring your own
examples/              IconSpec examples, including an intentionally invalid one
docs/                  Specification and architecture decisions
```

## Extending

- **New primitive.** Add a `definePrimitive` to `packages/icon-primitives/src/{shapes,objects,symbols}`. The registry, the intent parser, and the test suite pick it up automatically.
- **New rule.** Add a `defineRule` in `packages/icon-validator/src/rules` and a failing-spec test. For a preference rather than a requirement, add a `defineScorer` in `src/scorers` instead: it returns 0 to 1 with an explanation and can never refuse an icon.
- **New construction trait.** Add it to `CONSTRUCTION_TRAITS`, give it an identity default, and have at least three primitives declare and consume it. Fewer than three and it is a property of those primitives rather than a decision about the language; a test enforces this, and it has already refused one.
- **New language.** Copy `languages/technical/language.json`, rewrite the character and grammar for your team, change the tokens, and register it in `@icon-foundry/icon-language`.
- **Your own model.** Implement the small `AgentModel` contract in `@icon-foundry/icon-agent`, or point the OpenAI-compatible provider at any endpoint. Vendor SDKs are only imported in the provider adapters.

See [CONTRIBUTING.md](CONTRIBUTING.md), and [docs/](docs/README.md) for how the project is designed and why.

## Design philosophy

A good icon system is not a collection of individually beautiful icons. It is a collection of icons that look like they were drawn by the same hand. Icon Foundry exists to make the 100th icon belong next to the 1st, and to let AI help you express your design language rather than invent a new one every time.

## Status

Early-stage open-source project. The engine, the studio, the audit and the
export paths work end to end and are covered by tests. APIs may still change.
Two honest caveats: the Figma plugin has not yet been run inside real Figma,
and no team has built a production icon set with this yet.

## License

[MIT](LICENSE)
