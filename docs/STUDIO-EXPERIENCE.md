# Icon Foundry Web: the studio experience

Discussion draft, 2026-09-11. Builds on [LANGUAGE-STUDIO.md](LANGUAGE-STUDIO.md)
and [research/cursor-icons.md](research/cursor-icons.md). Decisions taken so
far: the product centre is a web app in `apps/web`; the Figma plugin becomes a
bridge that places published icons and does not author or manage them; the
icon library is managed from the web; icon creation is an agentic experience
inside the language.

---

## 1. The one sentence

> Open the app, say what icon you need, watch it get drawn correctly in your
> language, approve it, and it is in Figma.

Everything below exists to make that sentence true without the user learning
anything about IconSpecs, primitives, grids, or validators. Those stay
available for the people who want them, one layer down.

## 2. Who uses it and how often

| Person | Frequency | What they need | Where they live |
| --- | --- | --- | --- |
| Design lead | a few times a year | define and evolve the language, approve what enters the set, audit consistency | Language, Library audit |
| Product designer | daily | get a missing icon that belongs, fast, without asking anyone | Create |
| Engineer | weekly | find the right icon by concept, get the asset, trust the name is stable | Library search, export |
| Everyone in Figma | daily | use the icons as components, always current | Figma bridge |

The daily job is *getting an icon*. The app's default state, primary button,
and agent are all built for that. Language definition is important but rare,
so it is one step away, never in the way.

## 3. Information architecture

Five places. No more.

```text
┌──────────────────────────────────────────────────────────────────┐
│  ⬡ Icon Foundry     Library   Create   Language   Elements   ⚙   │
└──────────────────────────────────────────────────────────────────┘
```

- **Library** (home): every icon in the set, true size, searchable by
  concept. Publish, deprecate, delete, version, audit.
- **Create**: the agentic icon studio. One conversation, one canvas.
- **Language**: the setup board from LANGUAGE-STUDIO.md. Character, grammar,
  tokens, exemplars, versions.
- **Elements**: the recurring parts (Cursor's 155 tracked elements, our
  primitives). Where the vocabulary grows.
- **Settings**: Figma bridge, model provider, export formats, team.

The URL is the state. `/library/temperature-warehouse`, `/create/abc123`,
`/language/v0.3` are shareable and reviewable.

## 4. Create: the agentic studio

### 4.1 What "agentic" means here, precisely

The agent is not a chatbot that emits SVG. It is a collaborator that operates
the deterministic core through tools, inside the language, and shows its
work. Every action it takes is an edit to an IconSpec that the user can see,
undo, or take over by hand.

Its tools are the functions we already have plus a few we need:

| Tool | Exists | Purpose |
| --- | --- | --- |
| `searchLibrary(concept)` | no | Avoid duplicates. "You already have `cold-storage`; is this different?" |
| `listElements()` | yes (registry) | Know the vocabulary |
| `readLanguage()` | yes | Know the rules and the character |
| `compose` / `render` / `validate` | yes | Draft and check |
| `proposeElement(name, geometry)` | no | Draft a new recurring element when the vocabulary lacks one |
| `auditAgainstSet(spec)` | no | Check consistency with siblings: same badge size, same optical shape as its category |
| `explain(spec)` | no | Describe the icon in the language's own terms for the rationale panel |

The agent loop is: understand intent → check the library → draft two or
three candidates → validate and audit each → present them true size with a
one-line rationale → take feedback in words or by direct manipulation →
repeat. It stops when the user approves. It cannot publish.

### 4.2 The screen

```text
┌────────────────────────────────┬─────────────────────────────────────────┐
│  Create                        │                                         │
│                                │   Candidates                            │
│  "cat mouse"                   │                                         │
│                                │   ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  ◦ I read this two ways: a     │   │   ▣     │ │   ▣     │ │   ▣     │   │
│    cat with a computer mouse,  │   │  24px   │ │  24px   │ │  24px   │   │
│    or a cat and a mouse        │   └─────────┘ └─────────┘ └─────────┘   │
│    (animal). Which one?        │    ▪ 16px      ▪ 16px      ▪ 16px       │
│                                │   A  cat +     B  cat      C  mouse +   │
│  » computer mouse, for the     │      badge        holding     cat badge │
│    "AI pair" feature           │      mouse        cursor                │
│                                │   ✓ valid      ✓ valid     ⚠ gap 2.5   │
│  ◦ Your set has no cat yet.    │                                         │
│    I drafted one as a new      │   Rationale for A                       │
│    element following your      │   Cat uses the "circle" optical shape   │
│    "closed shapes, 45° only"   │   like other animals. Badge top-right   │
│    rule. Three options:        │   at 0.35, knockout 3 units, matching   │
│                                │   your other 12 badge icons.            │
│  » A, but rounder ears         │                                         │
│                                │   [ Approve A ]  [ Edit spec ]  [ ↺ ]   │
│  ◦ Rounder ears within your    │                                         │
│    corner radius of 2. Done.   │   ▸ In context: toolbar · list · button │
│  ┌──────────────────────────┐  │                                         │
│  │ Describe or adjust…      │  │                                         │
│  └──────────────────────────┘  │                                         │
└────────────────────────────────┴─────────────────────────────────────────┘
```

Rules of the screen:

- **Candidates, not a result.** Two or three, always shown at true size in
  both optical sizes. Cursor's designer made 156 hamburgers; the agent makes
  three and the human picks. Iteration replaces perfection.
- **Every candidate carries its validation and its rationale.** The rationale
  uses the language's own words ("closed shapes", "your badge ratio"). This
  is how the character stays alive instead of living in a document.
- **"In context" preview** drops the candidate into a toolbar, a list row,
  and a button at real pixel size. Icons are judged where they live.
- **Direct manipulation is a first-class input.** Dragging the badge, nudging
  an element, or toggling filled edits the spec; the agent sees the edit and
  continues from it. Words and hands are the same conversation.
- **Edit spec** is one click away for the people who want the JSON. It is
  never required.
- **The agent asks at most one question before drafting.** Ambiguity is
  resolved by showing options, not by interrogation.

### 4.3 How "cat mouse" gets solved without breaking the system

This is the reconciliation between the original principle (arrange, don't
invent) and the requirement that any subject works.

1. The agent finds no `cat` element in the vocabulary.
2. It drafts one **as a proposed element**, using freeform geometry but
   constrained by the grammar: construction angles, closed shapes, natural
   proportions, the circle optical shape for animals, stroke and radius from
   tokens. The draft is validated like anything else.
3. The icon is built from the proposed element plus existing elements (badge,
   cursor). The user approves the icon.
4. On approval, the proposed `cat` element enters **Elements** with status
   *draft*. The design lead promotes it to *approved* or edits it. From then
   on every cat in the set is that cat.

The vocabulary grows through use, exactly as Cursor's 155 recurring elements
grew, but the growth is visible, reviewable, and reversible. A model never
draws directly into the library; it drafts into a queue.

### 4.4 Flexibility without modes

Three ways in, one path through:

- **Describe**: the default. Words.
- **Compose**: pick elements from a palette and place them; the agent fills
  in the rules (alignment, badge knockout, optical shape).
- **Import**: paste an SVG or drop a sketch; the agent redraws it in the
  language and shows the original beside the redraw.

All three produce an IconSpec, all three hit the same validation, all three
end at the same Approve button.

## 5. Library: managing the set

### 5.1 The grid

True size by default, on the product's light and dark backgrounds. Zoom is a
slider, not the default. Filters: category, style, status, optical shape,
language version, "needs attention". Search runs on tags and concepts, not
only names, so "search" finds `magnifying-glass`.

### 5.2 Lifecycle

```text
draft ──► in review ──► published ──► deprecated ──► deleted
  ▲            │                          │
  └────────────┘  (changes requested)     └─ still resolvable by name; hidden from pickers
```

- **Draft**: created in Create, visible to its author, not synced anywhere.
- **In review**: visible to the team; the lead approves or requests changes,
  with the rationale panel and the audit as the review material.
- **Published**: part of a library version; synced to Figma; exported.
- **Deprecated**: kept so references never break, hidden from pickers,
  optionally pointing at a replacement.
- **Deleted**: only from draft or deprecated. Publishing is the point of no
  return for the *name*; the drawing can always change.

### 5.3 Versions

The library has versions the way the language has versions. Publishing a
batch of icons, or upgrading the set to a new language version, creates a
library version with a rendered before/after diff of every changed icon.
This is the Studio's equivalent of Cursor's `ship it`: one action, everything
regenerated, nothing forgotten.

### 5.4 Audit (the Overview view)

Set-level checks that no single-icon validator can do:

- same optical shape within a category
- same badge size and knockout everywhere
- same recurring element every time it appears
- gap rule across all icons
- icons that drifted from the current language version
- near-duplicates by geometry

Each finding links to the icons and offers "fix with agent", which opens
Create with the finding as the brief.

### 5.5 Detail panel

Name, tags, concepts it answers ("What is the icon for Bugbot?"), both
sizes and styles, validation and audit state, the IconSpec, the elements it
uses, versions and who changed what, where it is used in Figma, and the
export menu (SVG, spec, React later).

## 6. Elements: the growing vocabulary

The registry as a page. Each element shows its optical shape, the icons that
use it, its keywords, and its status (built-in, approved, draft, deprecated).
Proposed elements from the agent queue here. Editing an element re-renders
every icon that uses it, with a diff, which is the whole point of having a
vocabulary at all.

## 7. Figma: the bridge

The plugin stops being an authoring tool. It does three things and nothing
else:

1. **Connect** to a library (paste a library URL or token; later, sign in).
2. **Sync**: create or update components for the published version on a
   dedicated Icons page. Names are stable, so existing components update in
   place and instances across files stay attached. Variant properties carry
   Style and Size, matching how Cursor's final file is organised. The plugin
   shows the diff before it writes.
3. **Inspect**: select any synced component and see its library entry, spec,
   and version. A "Request icon" button opens Create in the web app with the
   selection as context.

Removal is a library action. Deprecating an icon in the web app hides it in
the plugin and marks the component; deleting never happens from Figma. Figma
is a rendering target, the same way SVG is.

## 8. Simplicity rules

Written down so we can hold each screen to them.

1. **One primary action per screen.** Library: New icon. Create: Approve.
   Language: Publish. Elements: Approve. Settings: Connect.
2. **Zero setup to the first icon.** The starter language is preloaded; a new
   user types a description in under ten seconds of arriving.
3. **True size first, always.** Zoom is opt-in.
4. **Every change is a diff and every diff is undoable.** Language edits,
   icon edits, element edits, syncs.
5. **The agent explains in the language's words**, never in ours. No
   "IconSpec", "primitive", or "validator" in default UI copy.
6. **Progressive disclosure.** JSON, tokens, and rules exist one click down
   and are never required.
7. **Nothing irreversible without a rendered preview of the consequence.**
8. **No modes.** Describe, compose, and import are inputs, not modes.

## 9. Architecture consequences

- `apps/web`: Vite + React + TypeScript over the core packages. The core
  stays deterministic and offline.
- **Storage: the library is a folder the team owns, never this repo.**
  Icon Foundry is the tool; a team's icons are their data and live in their
  own Git repository (or a folder in their design-system repo), in a
  versioned plain-JSON format:

  ```text
  acme-icons/
    icon-foundry.json   manifest: format version, library name, language ref
    language/           language.json, exemplars, versions
    elements/           approved and draft recurring elements
    icons/              one IconSpec per icon with status and tags
    dist/               generated SVG and exports, committed or built in CI
  ```

  Pull requests are the review workflow; CI runs the validator and audit.
  The web app reaches a library three ways, in this order of delivery:
  open a local folder with the File System Access API (no server, no
  accounts); run `npx icon-foundry` inside the repo, Storybook-style; and
  later connect to GitHub through the API for designers who do not use a
  terminal, which is also how a hosted version would work. This repo ships
  one demo library and a gitignored `libraries/` scratch folder. The folder
  format is a public contract: it carries a format version from day one and
  ships migrations when it changes. A database or hosted service is not
  needed for ownership, offline use, or review, and if one is ever built it
  stores this same format.
- **Agent runtime**: a small server-side function is required regardless of
  provider so API keys never sit in a browser. Locally, an environment
  variable and a dev proxy. The agent's tools are the core functions exposed
  as tool definitions; the model chooses, the core executes, validation
  gates.
- **Model provider: pluggable by design.** The agent depends on one small
  `ModelProvider` contract owned by this repo: send messages, receive text
  or tool calls, request structured JSON. Three ways to plug in: built-in
  adapters for Anthropic, OpenAI, and Gemini; an OpenAI-compatible endpoint
  adapter (base URL plus key) that covers Ollama, LM Studio, vLLM,
  OpenRouter, Groq, Azure, Mistral, and most local models; and a
  bring-your-own adapter, one file implementing the contract. The adapters
  are implemented with the Vercel AI SDK behind our interface, so provider
  quirks are not ours to maintain and the SDK can be swapped without
  touching the agent. Models that cannot do tool calls fall back to a
  single-shot structured-JSON mode; the deterministic core validates both
  paths identically, so a weak model yields fewer good candidates, never
  broken icons. Provider choice and keys are user settings and environment,
  never stored in the team's library folder; the library may record which
  model drafted an icon for traceability.
- **Elements**: freeform geometry enters the schema as a `path` element type
  and as user-defined elements stored beside the language. Built-in
  primitives become the seed vocabulary of every library.
- **Optical shapes and sizes** enter the language schema before the web app
  renders anything, or the first icons will need redrawing.
- **Figma plugin** shrinks: connect, sync, inspect. The current authoring UI
  is kept behind a developer flag for testing the core.

## 10. First slice

Small enough to use in weeks, complete enough to feel like the sentence in
section 1.

1. Language schema: optical shapes, optical sizes, `minNegativeSpace` rule,
   `path` element, user-defined elements.
2. `apps/web` with Library (grid, search, detail, publish/deprecate/delete,
   local-first storage, folder import/export) and Create (describe input,
   three candidates, approve, edit spec). Agent behind a local proxy.
3. Plugin: connect to an exported library folder or URL, sync, inspect.
4. Language and Elements pages read-only, editing via JSON until the setup
   board lands.

Deliberately after the first slice: the full Language setup board, set-level
audit, import from SVG, team roles.

## 11. Questions still open

1. Decided 2026-09-11: libraries live in the team's own repository as a
   versioned folder format; local folder access first, GitHub connection
   later. Open: does the first version need draft sharing beyond Git?
2. Decided 2026-09-11: the agent drafts a new element without asking,
   labels it clearly as new, and never promotes it silently. Promotion is a
   human action on the Elements page.
3. Decided 2026-09-11: three candidates, with a "show me more" action that
   drafts three more from the user's feedback.
4. Decided 2026-09-11: the current plugin authoring UI stays behind a
   developer flag until Create ships, then is removed. One way to do one
   thing.
5. Decided 2026-09-11: the model provider is fully pluggable. See
   "Model provider" under Architecture consequences.
