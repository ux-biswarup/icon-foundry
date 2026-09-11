# Icon Foundry

**A design-system-native icon foundry for creating, validating, and publishing custom icons in your own visual language.**

Icon Foundry lets a design team describe a missing icon, build it from reusable primitives that already follow the team's rules, check it against those rules, and drop it into Figma as a native component. The design system is the source of truth. AI is optional.

## The problem

Every product eventually needs icons its icon library does not have.

Teams start with Lucide, Material, Phosphor, or another excellent open-source set. Then the product grows and needs a *temperature-controlled warehouse*, a *shipment exception*, a *delayed delivery*, or some concept that only exists inside the company. The usual fix looks like this:

1. Search several icon libraries for something close.
2. Modify it by hand.
3. Fix the stroke width, proportions, spacing, and visual weight to match the rest.
4. Export it and paste it into Figma.
5. Repeat for the next missing icon.

The result is a library where the 40th icon does not quite look like the 1st, and a team that stays dependent on an external library for every future need. AI icon generators do not solve this. They produce a clever SVG once, in a style of their own choosing, with no memory of your rules.

## What Icon Foundry offers

Icon Foundry treats icon creation like compilation rather than drawing:

```text
Icon intent
    ↓
Icon Language + primitives
    ↓
IconSpec
    ↓
Deterministic renderer
    ↓
Validator
    ↓
Figma component
```

**An Icon Language, in three layers.** *Character*: the purpose, personality, principles, and the metaphors your set refuses. *Grammar*: how icons are constructed, such as 45° line angles, closed shapes, where a badge sits, and how much gap two parts must keep. *Tokens*: optical sizes with their own stroke, safe area and detail budget, keyline boxes so a wide icon and a round one read as the same size, corner radius, allowed styles and colours. The character is not documentation; it is the prompt any drafting agent receives, and the grammar is what the validator enforces.

Two languages ship. **Technical** is the default: a 16px primary size at a 1.25 stroke with a 24px companion, construction on 45° increments, closed shapes, and gaps wide enough to survive at small sizes. **Lucide-inspired** is a second worked example. Copy either and make it yours.

**A growing vocabulary.** Composable building blocks such as warehouse, package, vehicle, document, person, snowflake, thermometer, clock, warning, arrow, and basic shapes. Each adapts to the active language, so a warehouse drawn today and one drawn next year share the same stroke and proportions. When a subject is missing, a freeform path or a user-defined element drawn once becomes part of the vocabulary, and every later use is consistent.

**IconSpec, a portable icon representation.** An icon is stored as *which primitives go where*, not as path data. The same spec renders to SVG now and to other targets later, and re-renders automatically when the language changes.

**A deterministic composer and renderer.** Same spec plus same language always gives the same output. No randomness, no network, no API key.

**A first-class validator.** Every icon is checked against its language before it counts as done: optical size, safe area, stroke width, caps, joins, colours, grid alignment, negative space between parts, construction angles, geometry sanity, and complexity. Results are structured so tools can show a checklist instead of a wall of text.

**A studio in the browser.** A library page with every icon at true size, searchable by concept, with a draft, review, published, deprecated lifecycle. A create page where you describe an icon and get three validated candidates with a rationale each, approve one, or refine it in words. A language page and an elements page showing the vocabulary. Your library is a plain folder of JSON that you own and commit to Git; the app opens it directly from disk.

**An optional agent, with any model.** With a model configured, the create page becomes agentic: the model operates the deterministic core through tools, reuses existing elements, drafts a new element only when the vocabulary lacks the subject, and every draft is validated before you see it. Anthropic, OpenAI, Google, any OpenAI-compatible endpoint such as Ollama, or your own adapter. Without a model, the same page arranges the existing vocabulary deterministically. Keys stay on the server side.

**A Figma plugin.** Describe an icon, pick the language and style, preview it, read the validation checklist, and create a native Figma component named predictably as `icon/<style>/<name>`. The spec is stored on the component so it can be regenerated later.

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

### 4. Publish to Figma

```text
Icon Foundry

Icon           [ temperature controlled warehouse ]
Icon Language  [ Lucide-inspired v0.1.0 ]
Style          (•) Outline  ( ) Filled

               [ Generate ]

        ┌──────────────┐
        │   preview    │   ▪ 24px
        └──────────────┘

✓ Canvas size   ✓ Safe area   ✓ Stroke width
✓ Stroke caps   ✓ Stroke joins   ✓ Grid alignment

▸ IconSpec (editable)

               [ Create Component ]
```

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
  figma-plugin/        Figma adapter (UI runs the core, sandbox creates the component)
packages/
  icon-spec/           IconSpec types and parser (the canonical representation)
  icon-language/       Icon Language types, parser, bundled starter language
  icon-primitives/     Geometry model and the primitive library
  icon-composer/       Deterministic layout engine
  icon-renderer/       SVG renderer
  icon-validator/      Rule engine and built-in rules
  icon-ai/             Keyword intent parsing and layout recipes
  icon-library/        Team-owned library folder format, lifecycle, search
  icon-agent/          Create agent: tools over the core, planner, pluggable providers
languages/
  technical/           The default language: character, grammar and two optical sizes
  lucide-inspired/     A second worked example, plus a JSON schema for authoring your own
examples/              IconSpec examples, including an intentionally invalid one
docs/                  Specification and architecture decisions
```

## Extending

- **New primitive.** Add a `definePrimitive` to `packages/icon-primitives/src/{shapes,objects,symbols}`. The registry, the intent parser, and the test suite pick it up automatically.
- **New rule.** Add a `defineRule` in `packages/icon-validator/src/rules` and a failing-spec test.
- **New language.** Copy `languages/technical/language.json`, rewrite the character and grammar for your team, change the tokens, and register it in `@icon-foundry/icon-language`.
- **Your own model.** Implement the small `AgentModel` contract in `@icon-foundry/icon-agent`, or point the OpenAI-compatible provider at any endpoint. Vendor SDKs are only imported in the provider adapters.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Design philosophy

A good icon system is not a collection of individually beautiful icons. It is a collection of icons that look like they were drawn by the same hand. Icon Foundry exists to make the 100th icon belong next to the 1st, and to let AI help you express your design language rather than invent a new one every time.

## Status

Early-stage open-source project. The core packages, validator, and Figma plugin work end to end; APIs may still change.

## License

[MIT](LICENSE)
