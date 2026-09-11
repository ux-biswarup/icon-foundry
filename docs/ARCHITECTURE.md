# Architecture

Icon Foundry is an **icon compiler**, not a prompt-to-SVG generator.

```text
Icon intent  ──►  IconSpec  ──►  compose  ──►  render  ──►  SVG / Figma
                     ▲              │
                     │              └──►  validate  ──►  structured issues
              Icon Language
              + primitives
```

The design system (the Icon Language) is the source of truth. An LLM is an
optional front-end that turns free text into a *structured intent*; it never
touches geometry.

## Packages

| Package | Responsibility | Depends on |
| --- | --- | --- |
| `@icon-foundry/icon-spec` | `IconSpec` types and a strict structural parser. The canonical representation of an icon. | — |
| `@icon-foundry/icon-language` | `IconLanguage` types, parser with defaults, the bundled starter language. | — |
| `@icon-foundry/icon-primitives` | Geometry model (shapes, transforms, bounds) and the built-in primitive library. | icon-language |
| `@icon-foundry/icon-composer` | Deterministic layout: fits primitives into element boxes, resolves style/stroke inheritance, handles groups, rotation, flips, optical offsets. | spec, language, primitives |
| `@icon-foundry/icon-renderer` | Composed geometry → compact deterministic SVG. | composer, language, primitives, spec |
| `@icon-foundry/icon-validator` | Rules that check a spec and its composed geometry against the language. | composer, language, primitives, spec |
| `@icon-foundry/icon-ai` | Optional semantic layer: keyword intent parser (no network), provider-agnostic LLM adapter, deterministic layout recipes that turn intent into an `IconSpec`. | spec, language, primitives, validator (tests) |
| `@icon-foundry/icon-library` | The team-owned library folder format (manifest, icons, elements, optional language), lifecycle, search, and a `FileStore` abstraction over disk, browser, or memory. | spec, language, primitives |
| `@icon-foundry/icon-agent` | The Create agent: tools over the deterministic core, a planner that works without a model, the `AgentModel` contract, and AI SDK provider adapters (`./providers`). | ai, composer, language, library, primitives, renderer, spec, validator |
| `apps/web` | The studio: Library, Create, Language, Elements over a library folder (File System Access API) or browser storage. The agent runs in a server route so keys never reach the browser. | all of the above |
| `apps/figma-plugin` | Adapter: runs the core in the plugin UI, hands a finished SVG to the sandbox, which creates a native component. Becomes a connect/sync/inspect bridge next. | core packages |

Rules that keep the packages honest:

- The composer, renderer and validator contain **no randomness and no I/O**.
- Nothing in `packages/` imports a Figma API, a vendor SDK, or `fetch`.
- The Figma plugin manifest declares `networkAccess: none`.
- Every package has unit tests next to its source (`*.test.ts`).

## Key decisions

### IconSpec is canonical, SVG is a render target

Storing SVG would freeze every design token into the artefact. Storing an
`IconSpec` (primitives + boxes + overrides) lets a team re-render the whole
library when the language changes (for example stroke width 2 → 1.75) and lets
the validator reason about intent instead of path data. The Figma plugin stores
the serialised spec on the component node in plugin data for future
regeneration.

### Primitives are TypeScript, not JSON

The spec suggested a top-level `primitives/` folder of data files. We chose
`packages/icon-primitives/src/{shapes,objects,symbols}` with primitives as pure
functions of a `PrimitiveContext` (style, stroke width, corner radius, scale).
Reasons: primitives need small amounts of logic (drop interior detail in the
filled style, use the language corner radius exactly after scaling), and the
type system catches malformed geometry at build time. A JSON primitive loader
can be added later without changing the composer.

### Uniform scaling only

The composer fits a primitive's natural box into the element box with a single
uniform scale factor and alignment. Non-uniform stretching would distort
stroke geometry and corner radii, which is exactly the inconsistency the
project exists to prevent. Zero-height or zero-width natural boxes (lines) are
supported by scaling along the other axis.

### Safe area is measured on centrelines

Validation compares geometry bounds, not stroke outlines, against
`safeArea`. With the starter language (2px stroke, 2-unit safe area) this
matches the Lucide convention: centrelines live in 2…22, stroke edges in 1…23.
Filled shapes have no stroke, so their outer edge is their bound.

### Filled style = silhouette

In the filled style, `fillable` shapes are filled and non-fillable strokes
(lines, open polylines, arcs) remain strokes. Objects drop interior details
(windows, box edges) because there is no cut-out support yet. Adding a
`cutout` flag plus an even-odd merge in the renderer is the natural next step
and does not require changing any `IconSpec`.

### Groups use a virtual canvas

A group element declares `children` laid out in a virtual canvas (default: the
spec canvas) and is then placed like a primitive. This keeps a group's
internal coordinates stable regardless of where it is used, which is what
makes badges reusable.

### The LLM only classifies

`@icon-foundry/icon-ai` asks a model for `{ subject, modifiers, style }` using
only primitive names it was given, validates the answer against the registry,
and falls back to the keyword parser if the answer is unusable. Layout is done
by deterministic recipes. No vendor SDK is imported; callers pass a
`complete(prompt) => Promise<string>` function.

### Optical sizes are keyed by canvas

A language carries `sizes`, one token set per canvas (stroke, safe area,
grid, corner radius, detail budget, negative space, keyline boxes). The
spec's `canvas` selects the size; `resolveTokens(language, canvas)` is the
only way downstream code reads tokens. The flat fields on `IconLanguage` are
the default size's tokens, kept for convenience. A spec on an unknown canvas
still composes with the nearest size so the validator can show geometry next
to the canvas error.

### Optical shapes are keyline boxes

Each size has four keyline boxes (square, circle, horizontal, vertical),
derived Material/SF-style from the content area unless the language overrides
them. Every primitive declares an optical shape; recipes fit a subject into
the matching box so a wide warehouse and a round clock read as the same size.

### Negative space is measured, crossings are exempt

`minNegativeSpace` is enforced between shapes of different top-level
elements: visible gap = centreline distance − half of each stroke (zero for
filled areas). Shapes that cross are treated as a deliberate overlap and
skipped. Recipes shrink the subject in grid steps until the rule passes, so
generated icons never merge into a blur at small sizes.

### A language carries character and grammar, not only tokens

Tokens alone cannot make a set cohere: two languages with identical stroke and
canvas can still look nothing alike. An `IconLanguage` therefore has three
layers.

- **Character** — purpose, four personality axes, the metaphors the set uses
  and refuses, and the principles in the team's own words. It is data, not
  documentation: the agent's system prompt is assembled from it, and the
  studio shows it beside the icons.
- **Grammar** — how icons are *constructed*: allowed line angles and
  tolerance, closed shapes over open, the canonical diagonal direction, badge
  corner and ratio, and whether every icon must read as a silhouette. Layout
  recipes follow it and the validator checks it.
- **Tokens** — the per-optical-size numbers described above.

Both new layers default to permissive, so a language that states neither
behaves exactly as before. `lucide-inspired` does; `technical` states both.

### Construction is checked where drift actually happens

The `construction` rule measures the angle of every straight segment in the
composed geometry and warns when one leaves the grammar. Curves carry no
construction angle and are skipped, as are dot-length segments. Because the
check runs *after* composition, it also catches a rotation that pushes
conforming geometry off the grammar.

A primitive whose concept genuinely demands other angles declares
`freeAngles` once in the vocabulary, where a human reviews it: a triangle, an
isometric box, a snowflake's 60° symmetry. Everything else is policed, which
aims the rule at freeform paths and new elements, exactly where a set drifts.
This is Cursor's "angles introduced only when the concept demands" made
mechanical.

### Freeform geometry stays inside the language

A `path` element carries SVG path data (M, L, H, V, C, A, Z) authored in a
natural box and is placed exactly like a primitive. A user-defined element is
the same idea packaged as a reusable primitive (`definePathPrimitive`), which
is the format a library's `elements/` folder uses and the format the agent
drafts when the vocabulary lacks a subject. In both cases stroke, caps, joins,
style, and validation come from the language; the geometry only says where
lines go.

### The library is a folder the team owns

`@icon-foundry/icon-library` defines a plain-JSON folder format with a
`format` version in its manifest. The model writes through to a `FileStore`
on every mutation, so the folder is always the truth and Git is the review
and history layer. The web app implements the store over the File System
Access API and, for trying things out, over IndexedDB. The agent server
receives a snapshot of the folder with each request and holds no state.

### The agent is a tool loop over the core

`createIcon` gives a model seven tools (search the library, list elements,
read the language, deterministic layout, draft an icon, propose an element,
leave a note). The model only chooses calls; we execute them, validate every
draft, and reject candidates with errors. Without a model the planner
arranges existing vocabulary into up to three variants. Providers are behind
the `AgentModel` contract; the AI SDK adapter is the only place vendor
packages are imported.

## Known limitations

- Filled icons have no interior cut-outs.
- `closedShapes` and `diagonal` are carried in the grammar and given to the
  agent, but not machine-checked: a mechanical rule for either would produce
  more noise than signal.
- Layout recipes are deliberately simple (single subject, one or two badges).
- The Figma plugin creates local components; team-library publishing is a
  manual step in Figma.
