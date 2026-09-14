# The system as built

Written 2026-09-12, rewritten the same day once every milestone in
[PLAN.md](PLAN.md) was built. **This document describes what exists, not what
should.** Every other document in `docs/` argues for a direction; this one only
reports. It is the baseline for deciding whether the thing we have is the thing
we want.

Nothing here is a proposal. Section 8 lists observations and gaps, clearly
separated from the description.

---

## 1. Shape of the system

One engine, three surfaces, one data format.

```text
                        ┌──────────────────────────────────┐
   SURFACES             │  Web studio (apps/web)           │  authors everything
                        │  Library · Create · Language     │
                        │                                  │
                        └───────────────┬──────────────────┘
                                        │
                        ┌───────────────┴──────────────────┐
                        │  Two server routes               │  /api/agent, /api/hand: hold the keys
                        └───────────────┬──────────────────┘
                                        │
  ┌─────────────────────────────────────┴──────────────────────────────────┐
  │  ENGINE (packages/*)                                                    │
  │  spec → language → primitives → composer → renderer → validator         │
  │  library (data)  ai (concepts + recipes)  agent (tools + providers)      │
  │  audit (set-level)                        export (six formats)           │
  └─────────────────────────────────────┬──────────────────────────────────┘
                                        │
                        ┌───────────────┴──────────────────┐
   DATA                 │  A library folder the team owns   │  plain JSON, format 2
                        └──────────────────────────────────┘

   Figma plugin (apps/figma-plugin) ── a render target, not an author.
                                       It syncs what the library published.
```

---

## 2. The engine

Five things happen to an icon, in order. Each is a separate package and each
can be run on its own.

| Stage | Package | What it does |
| --- | --- | --- |
| **Spec** | `icon-spec` | `IconSpec` types and a strict parser. The canonical representation: which parts go where, in canvas units. No geometry. |
| **Language** | `icon-language` | Parses and serialises an Icon Language: character, grammar, construction traits, and tokens per optical size. Derives keyline boxes. Ships two presets. |
| **Vocabulary** | `icon-primitives` | The geometry model (shapes, transforms, bounds, distance, angles) and 23 built-in primitives, each declaring which language values its geometry reads. Also parses SVG path data into reusable elements. |
| **Compose** | `icon-composer` | Fits each part into its box with a uniform scale, resolves style and stroke inheritance, applies rotation, flips and optical offsets. Produces shapes in canvas coordinates. Also holds the optical passes. |
| **Render** | `icon-renderer` | Composed shapes → a compact, deterministic SVG string. Merges filled shapes and their cutouts into one even-odd path. Applies optical corrections. |
| **Validate** | `icon-validator` | 13 enforced rules, 5 scored preferences and 3 questions left to a person, over the spec and the composed geometry. |

Four optional layers sit beside it:

| Layer | Package | What it does |
| --- | --- | --- |
| **Concepts and recipes** | `icon-ai` | The concept compiler: a decomposition plus a language becomes an IconSpec, pruned to the size's detail budget. Also keyword intent parsing and the older layout recipes. No model. |
| **Agent** | `icon-agent` | Ten tools over the engine for drafting an icon and four more for moving construction traits, a planner that works with no model, the `AgentModel` contract, and adapters for Anthropic, OpenAI, Google and any OpenAI-compatible endpoint. |
| **Audit** | `icon-audit` | Six set-level findings, four rule proposals with a preview of what each would break, and a before/after preview of changing an element. |
| **Export** | `icon-export` | Six output formats, a ZIP written without a dependency, and the payload the Figma plugin syncs from. |

**The deterministic boundary.** Everything above except the provider adapters
runs with no network and no key. Given the same spec and the same language, the
renderer produces byte-identical SVG.

### Rules, by what they are allowed to do

A rule declares its authority, and the three tiers behave differently on
purpose. Forcing every principle into the first tier is what makes rule systems
get ignored.

**Enforced (13).** `canvas`, `style`, `geometry`, `safeArea`, `strokeWidth`,
`strokeCap`, `strokeJoin`, `color`, `complexity`, `grid`, `negativeSpace`,
`construction`, `metaphor`. Errors block; warnings do not. A composition
failure is reported as a `compose` issue rather than thrown.

**Scored (5).** `restraint`, `balance`, `symmetry`, `silhouette`, `breathing`.
Each returns 0 to 1 with a sentence explaining the number, and none of them can
fail an icon. Each is weighted by `language.preferences`, where zero turns one
off.

**Left to a person (3).** `belongs`, `communicates`, `character`. The system
asks the question in review and never answers it.

### The ten agent tools

`resolve_concept`, `propose_concept`, `layout_from_concept`, `search_library`,
`list_elements`, `read_language`, `layout_from_intent`, `draft_icon`,
`propose_element`, `note_to_designer`. The model chooses calls; we execute them.
The concept tools come first for a reason: a brief that resolves to a concept
already drawn returns the existing icon instead of making a second one. Every
draft is validated before it becomes a candidate, and a draft with errors is
rejected back to the model.

### The three optical passes

Junction notches, interior thinning and dot sizing, declared per optical size
in the language and every one off unless a team asks for it. They run at render
and never at validation, so the validator always judges the geometry the
compiler laid out rather than the retouching.

### The six construction traits

How a part is built, as opposed to how big or how heavy it is. A trait is a
named decision that several primitives consume; primitives declare which they
read, so setting one changes every primitive that declared it and nothing else.

| Trait | Read by | Source |
| --- | --- | --- |
| `interiorRadius` | building, warehouse, device, warning | Attested by Google and IBM |
| `grade` | the renderer, on dark grounds only | Material Symbols' `GRAD` axis |
| `aperture` | building, warehouse, device | Ours |
| `inset` | building, warehouse, device | Ours |
| `accentSize` | person, vehicle, warning, thermometer, location | Ours |
| `slope` | warehouse, package, document, vehicle | Ours |

Three rules hold the layer together. **A trait needs three consumers or more**,
enforced by a test: fewer than that and it is a property of those primitives
rather than a decision about the language. **Every default is the identity**, so
adding the layer changed nothing that already existed. And **a declaration is
checked in both directions** — a primitive that names a trait must change when
it moves, and one that does not must not.

Two traits default to `mixed`, which is not a style but an unmade decision: our
own vocabulary answers the aperture question three ways and the slope question
two, and `mixed` preserves every drawing while leaving the inconsistency
visible.

### Exceptions

A part may be drawn against the language, and never quietly. An exception lives
in the language keyed by part, carries values and a reason the parser will not
accept as empty, is marked on the part wherever it appears, and is counted by
the audit. Three or more parts escaping one trait escalates to a warning,
because at that point the language value is wrong rather than the parts.

See [research/icon-properties.md](research/icon-properties.md) for what the
survey of published icon systems found, including the fact that only four
construction properties are exposed as tunable axes anywhere in it.

---

## 3. Package dependencies

```text
icon-spec        (none)
icon-language    spec
icon-primitives  language
icon-composer    spec language primitives
icon-renderer    spec language primitives composer
icon-validator   spec language primitives composer
icon-ai          spec language primitives validator
icon-library     spec language primitives
icon-audit       spec language primitives composer renderer validator library
icon-export      spec language primitives renderer library
icon-agent       all of the above
apps/web         all of the above + icon-agent
apps/figma-plugin  its own message types only
                   ── it receives a payload; it does not build one
```

The Figma plugin's dependency list is the shortest in the repo and that is the
point. It takes a rendered payload from the studio and writes components. A
plugin that could compose its own geometry would be a second way to make an
icon, which is how a set ends up with two of everything.

---

## 4. The data

A library is a folder of plain JSON the team owns, usually their own Git
repository. Format version 2.

```text
acme-icons/
  icon-foundry.json                       format, id, name, languages[], default language
  languages/<id>/language.json            the language the team authored
  languages/<id>/exemplars/<name>.json    reference icons, rendered while editing
  languages/<id>/versions/<version>.json  published snapshots, with a note
  concepts/<id>.json                      what a thing means and what it is made of
  elements/<name>.json                    user-defined elements, with a status
  icons/<name>.json                       one record per icon
```

**An icon record** holds the spec, a status, tags, the concept it draws,
timestamps, provenance (the brief and the model that drafted it), a stable
codepoint once assigned, and, when deprecated, a replacement name.

**A concept record** holds an id, a name, a description, aliases, a status, and
a composition: an arrangement plus parts, each naming an element, a count and a
priority. Priority is how a philosophy prunes — at a tight detail budget the
optional parts are dropped, so one concept draws differently at 16px and 24px
without anyone drawing either.

**An element record** holds SVG path data per style, a category, an optical
shape, keywords and a status.

**A language** holds four layers: character (purpose, four personality axes,
principles, metaphors used and refused, product vocabulary), grammar (line
angles, closed shapes, diagonal direction, badge corner and ratio, the
arrangements it allows, silhouette), tokens per optical size (canvas, grid,
safe area, stroke, corner radius, minimum gap, budgets, keyline boxes, optical
corrections), and two cross-cutting blocks: `derivation`, which says what each
personality axis moves and to what value at each pole, and `preferences`, which
weights the scored rules.

**Absent means derived.** A derivable token left out of the file is computed
from the axes; a token written down is an override that wins. So "unlock and
override" is literally "write the value down", and a young set's file stays
short.

**Icons point at concepts, never the reverse.** A one-way arrow needs no
syncing and cannot drift. One published icon per concept per language is
enforced at publish time, by name.

**Where the folder actually lives.** Two modes. A real folder on disk through
the File System Access API, which works in Chrome and Edge and is remembered
between sessions. Or browser-only storage in IndexedDB, which is the default
and is seeded with a five-icon demo library on first run.

---

## 5. User flows as they exist

### 5.1 First run

1. Open the studio. It tries the remembered folder, then falls back to browser storage.
2. With no library in browser storage, it creates one: the Technical language, its twelve reference icons, and five demo icons generated by the recipes.
3. Lands on Library.

No onboarding, no questions asked. The user is looking at somebody else's icons in a language they did not choose.

### 5.2 Author a language

The Language tab is one screen sorted by a single rule: **everything that
changes the drawing sits next to the canvas, everything else gets out of the
way.** The words used to be a permanent left column, which is a poor trade — a
purpose statement is written once and read rarely — so they became the first
view of the canvas instead, left of Parts.

| Column | Holds |
| --- | --- |
| Far left | A strip that opens the assistant. Closed by default, because there is nothing in it yet. |
| Middle | Four views. **Language**: identity, purpose, principles, metaphors, preference weights, the questions left to a person. **Parts**: all 23 built-in parts, your own elements, and icons composed from them, every one drawn on a light and a dark ground at once. **Keylines**: the boxes those parts are sized against. **Method**: how a part is built. |
| Right | A rail that follows the view: version history against the words, the keyline boxes against the sheet, and against the parts, personality axes first, then the construction traits, the grammar, the size tokens, the optical corrections. |

1. Move anything on the right and the canvas redraws as you type.
2. Hovering a construction trait dims every part it cannot reach, so nobody has to guess what a shared control does.
3. Each control states where its value lands: verbatim to the agent, a checked rule, a score, or guidance that does not block. The left column counts them: 13 enforced, 5 scored, 3 left to you.
4. A derivation panel shows, for each token the axes propose, what each axis contributed and what the result is, with the endpoints editable so "minimal" can mean what this team means by it.
5. A trait set by hand is badged as such, against one the axes proposed. Absent means derived; present means an override, and only overrides get written to the file.
6. Ask for a change in words, and a model proposes trait values inside their declared ranges, names the parts each will move, and saves nothing.
7. Selecting a part says which traits it reads, and lets you draw it against the language as a reasoned exception.
8. "Review and save" shows every reference icon before and after, flagging the ones that changed. Enter a version and a note; the version is snapshotted under `versions/`.

**The rule the reference set has to obey:** it must exercise every token the
language can change. This was learned the hard way twice — first no reference
icon used a corner radius, then none carried a dot, and in both cases moving the
control changed a number and nothing on screen. The canvas now shows every part
rather than a chosen few, which retires the problem rather than managing it.

**Stops at:** adding or removing an optical size, and importing an existing SVG set to measure tokens from it. Neither is built.

### 5.3 Create an icon

1. Create tab. Type a brief. Optionally pick a style and an optical size.
2. Generate. The brief is first resolved against the concept registry by id, name, then alias. A brief that resolves to a concept already drawn in this language returns that icon and drafts nothing.
3. Otherwise: with a model configured, the request goes to the server route and the agent runs its tool loop. With no model, the deterministic planner runs in the browser.
4. Up to three candidates come back, ranked by their scores, each with a preview at three sizes, a one-line rationale, the scores with their explanations, and a compact validation checklist.
5. Refine in words, or "show me more".
6. Approve one. Any new elements it needed are saved as draft elements, the icon is saved as a draft linked to its concept, and the view jumps to it in the library.

**Stops at:** without a model and without a matching concept, a subject with no matching primitive fails outright. There are 23 primitives.

### 5.4 Move an icon through its life

1. Library. Search by name, tag, concept, description, or the keywords of the elements it uses. Filter by status, or by gaps and findings.
2. Select an icon for a detail panel: previews, the full rule checklist, the scores, lifecycle buttons, tags, its concept, the editable spec, and an SVG download.
3. Draft → review → published → deprecated. Deletion only from draft or deprecated, so a published name never disappears.
4. Publishing a second icon for a concept already published in this language is refused, by name.

### 5.5 Grow the vocabulary

This had its own page and no longer does. The vocabulary is not a separate
concept from the language, it is what the language draws with, so it lives on
the canvas in the middle of the Language tab. `#/elements` redirects there.

1. Your elements appear beside the built-ins, drafts badged as drafts.
2. A draft element, usually one the agent proposed and a designer approved with an icon, can be approved, deprecated, or deleted when unused.
3. Approving is always a human action.

Changing an approved element shows a before/after of every icon that uses it,
so the blast radius is a screen rather than a guess.

**Why the merge matters more than tidiness:** the question being asked of a
draft element is whether it belongs among these, which is the `belongs` rule the
validator refuses to answer. You cannot answer it without its neighbours on
screen, and a separate page guaranteed they never were.

### 5.6 Audit the set

1. Library, findings view. Six checks run across every icon: drift from the current language version, duplicate geometry, two icons claiming one concept, an icon with no concept, inconsistent badge size, and score outliers.
2. Nothing a finding says can block publishing. A finding is a claim about the set, not a verdict on an icon.
3. Beside them, up to four rule proposals: construction angles, a detail budget, a minimum gap, badge size. Each carries the icons that would start failing the moment you accept it.
4. Accepting one writes it into the language, which is a normal language edit and goes through the same review and version.

**The threshold that had to be raised:** the outlier detector first fired on a
set of five icons. It now needs eight scored icons and a three-times spread.

### 5.7 Ship the set

1. Library. Export.
2. Six formats, each usable on its own: individual SVGs, a sprite sheet, a TypeScript module, React components, CSS, and a manifest. Or all of them as one ZIP.
3. Only published icons are exported. A draft is not a release.
4. Codepoints are assigned from U+E000 upward and never reused, so adding an icon later cannot renumber one already shipped.

**Not built:** the font binary. The manifest carries what a font builder needs;
building it is left to a font toolchain.

### 5.8 Get icons into Figma

1. Import the plugin manifest into Figma as a development plugin.
2. Copy the payload from the studio's library page and connect the plugin to it.
3. The plugin shows what a sync would change before it changes anything: new, changed, unchanged, deprecated.
4. Sync. Components are named `icon/<style>/<name>` and carry the library id, the icon name, the language, the concept, the codepoint and the SVG in plugin data.
5. Selecting a component or an instance tells you what it is, according to the library that made it.

**The rule that makes it safe:** a component is found by the name recorded in
its plugin data, never by position or label, and it is updated in place.
Replacing the node would detach every instance of it in every file.

**Never verified in real Figma.** The sandbox API is not something a test can
stand in for.

---

## 6. Workflow and roles

| Role | What the system supports today | What it does not |
| --- | --- | --- |
| **Design lead** | Author and version the language, including how its parts are *built*, what its axes mean, and how much each preference counts. Approve elements. Run the set-level audit. Accept a promoted rule with a preview of what breaks. Publish and deprecate icons. | Cannot add or remove an optical size, or measure a language from an existing SVG set. |
| **Product designer** | Describe an icon and get the existing one back if the concept is already drawn. Compare ranked candidates, refine, approve. Edit a spec by hand. | Reviews a new icon in a row of three rather than among its neighbours. |
| **Engineer** | Six export formats and a ZIP. Stable codepoints. A manifest naming the language and version each icon came from. | No published package, no API, no font binary. |

**Automated:** composition, rendering, validation, scoring and ranking, concept
resolution and pruning to a detail budget, keyline fitting, badge placement and
gap-safe sizing, series layout on the grid, construction traits applied across
every part that declares one, optical corrections, grade on dark grounds,
language re-rendering, set-level findings, export.

**Manual:** every status change, every element approval, every version publish,
accepting any promoted rule, and every Figma sync.

---

## 7. What runs where

| Thing | Where it runs | Needs a key |
| --- | --- | --- |
| Engine packages | Anywhere: browser or Node | No |
| Construction traits and exceptions | Browser | No |
| Concept compiler, scorers, audit, export | Browser | No |
| Planner (deterministic candidates) | Browser | No |
| Agent tool loop | Server route, `/api/agent` | Yes |
| Trait suggestions | Server route, `/api/hand` | Yes, and it degrades to reading the traits without one |
| Library reads and writes | Browser, to disk or IndexedDB | No |
| Figma component writes | Figma plugin sandbox | No, network disabled |

421 tests. Typecheck clean. Both apps build.

---

## 8. Observations

Facts about the current state, listed so they can be argued with. Not
proposals.

**The Figma plugin is no longer orphaned, and has never been run in Figma.**
It stopped authoring and became connect, sync, inspect, so there is now one way
to make an icon. But no test can stand in for the sandbox API, and the riskiest
path — updating a component that already has instances placed in other files —
has never been executed.

**The character layer is mostly connected now.** The four personality axes can
derive corner radius, stroke caps and joins, both detail budgets, badge size and
all six construction traits, by interpolating between endpoints the team can
edit. Refused metaphors became a keyword check with no model involved. Purpose
and principles remain consumed by exactly one thing, the agent's prompt, so
those two are still inert without a model.

**The construction traits are derivable and not derived, on purpose.** Every one
defaults to the identity — square interiors, no grade, multipliers of one, and
`mixed` for the two enums. Deriving them out of the box would have redrawn every
icon in every library the moment someone upgraded. A team that wants an axis to
move a trait says so; we do not guess.

**A team now owns how a part is built, and that was the largest hole.** Before
this phase, every construction decision — the pitch of a roof, how an opening is
drawn, how big a wheel is — was a literal in our TypeScript. A team got their
tokens applied to our drawings, which is a much weaker product than the one
described. Six traits do not close the gap entirely, but the mechanism is there
and adding the seventh is small.

**We found the product failing at its own thesis, in the shipped build.** Corner
radius reached three of eight primitives, so a team asking for a soft rounded set
got a rounded building standing beside a sharp truck. That is the exact problem
this exists to solve. A primitive now declares what it reads and the declaration
is tested in both directions, which is the class of defect that is invisible
until someone moves a slider and half the set ignores it.

**The product is less gated on a model than it was, and still gated.** A brief
that resolves to a concept needs no model at all, and the philosophy changes the
drawing with or without one. But a brief for something the registry has never
heard of still needs either a model or one of 23 primitives.

**The decay mechanisms exist and have never met a real set.** Concept registry,
duplicate refusal at publish, six set-level findings, rule promotion with a
preview of what breaks — all built. None has run against a set large enough for
its thresholds to mean anything. The outlier detector already had to be
retuned once for exactly this reason.

**A set can be shipped, except as a font.** Six formats and a ZIP, published
icons only, with codepoints that never move. The font binary is still a
manifest plus somebody else's toolchain.

**The default experience is somebody else's icons.** First run seeds a demo
library in our language. There is no onboarding that asks what the team wants
before showing them something. Unchanged.

**Data ownership is conditional.** The Git-backed folder story requires Chrome
or Edge and a deliberate "Open folder" click. The default is browser storage
that never leaves the machine and is not in version control. Unchanged.

**No real set exists.** Every validation so far has been synthetic: generated
examples, test fixtures, a stub model, and one run against a real
`openai/gpt-5-mini`. Nobody has built a real icon set with this. This is the
single largest gap in the evidence, and most of the remaining uncertainty in
the audit and promotion machinery collapses the moment someone does.

**Only four construction properties are exposed as tunable axes anywhere in the
industry**, all of them Google's, according to a verified survey of what
published icon systems document. IBM and Carbon expose none. That is the
strongest available evidence that parameterising construction is unattempted
rather than table stakes — and also that we have no prior art to copy for most
of it.

**Optical corrections were underestimated in the plan and are still blunt.**
They were scheduled last as "nearly invisible at 16px" and turned out to change
how a cube or a warehouse reads at any size. Interior thinning in particular
treats everything inside a contour as secondary, which is right for clock hands
and arguable for the exclamation mark in a warning. Nothing in the spec
separates the two cases.

**The docs used to contradict each other.** Resolved on 2026-09-12: the
original brief said the problem was a missing icon while `PRODUCT.md` rejects
that framing outright, and two separate documents described the studio. The set
is now six documents with one job each, indexed in
[README.md](README.md), and the original brief is preserved under `research/`
as history.

---

## 9. Questions this document cannot answer

These need a decision rather than more code.

1. **Who is this for first?** The design lead defining a language, the designer needing one icon today, or the engineer who needs the set in their product? All three are now served; they still want different first screens, and first run picks none of them.
2. **Is the product creation or governance?** The build now does both. Which one the first screen should be about is still undecided.
3. **What does "done" look like for a set?** Export answered the mechanical half. Nothing answers when a set is finished enough to stop.
4. **Is Figma the destination, or one of several?** Settled in the code — the plugin is an adapter, one render target beside SVG — but never tested against a team that treats Figma as the source of truth.
5. **Should the system be useful with no model at all?** Concepts moved this a long way. The remaining question is whether a team is expected to author concepts up front, which is the same "declare it before you have drawn it" objection the plan had to answer for languages.
6. **What happens the first time a real team uses this?** Every threshold in the audit, every default in the derivation, and the claim that a language can be declared before the set exists are all currently supported by synthetic evidence only.
