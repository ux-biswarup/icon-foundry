# The experience

What a person does, and why the screens are shaped that way. Merged from two
earlier drafts on 2026-09-12.

For the target architecture see [COMPILER.md](COMPILER.md). For what is built
today see [SYSTEM.md](SYSTEM.md). This document is design, not status.

---

## 1. The one sentence

> Open the app, say what icon you need, watch it get drawn correctly in your
> language, approve it, and it is in Figma.

Everything below exists to make that true without the user learning what an
IconSpec, a primitive or a validator is. Those stay available one layer down.

---

## 2. Who it is for

| Person | How often | What they need |
| --- | --- | --- |
| **Design lead** | A few times a year | Define and evolve the language. Approve what enters the set. Audit consistency. |
| **Product designer** | Daily | Get a missing icon that belongs, fast, without asking anyone. |
| **Engineer** | Weekly | Find the right icon by concept, get the asset, trust the name is stable. |
| **Everyone in Figma** | Daily | Use the icons as components, always current. |

The daily job is *getting an icon*. The default screen, the primary button and
the agent are all built for that. Defining a language is more important and far
rarer, so it is one step away and never in the way.

---

## 3. Principles

Borrowed openly from how Apple frames this, and from the Cursor article.

**Principles before properties.** A stroke width is not a preference, it is the
consequence of "legible at 17pt next to body text". The Human Interface
Guidelines lead with clarity and deference; numbers come later. Our language
should read the same way.

**A template, not a rulebook.** SF Symbols ships as a drawable template with
guides and a reference symbol already on it. Designers draw on top of an
example, so the rules are felt rather than read. Our reference icons are that
template.

**Derive, do not enumerate.** SF Symbols has nine weights and three scales, and
a designer picks one of each. Everything else follows. Ask a small number of
decisions a design lead can defend, and derive the rest.

**Tools make the wrong thing hard.** The SF Symbols app refuses to export a
broken symbol. It does not lecture; it shows you the guide you crossed.

**Consistency below conscious awareness.** Nobody says "the optical correction
at that junction is 0.25px better". They say these feel like they belong
together. So the measure of a new icon is not "is it good" but "does it fail to
stand out among its siblings" — which is why an icon should be reviewed among
its neighbours, not alone.

**True size first.** The row a designer judges is the one at the real pixel
size. Zoom is the secondary view. Cursor's designer mirrored the set to a phone
for exactly this reason.

### Rules each screen is held to

1. **One primary action per screen.** Library: New icon. Create: Approve. Language: Publish. Elements: Approve.
2. **Zero setup to the first icon.** A new user types a description within ten seconds of arriving.
3. **Every change is a diff, and every diff is undoable.**
4. **The system explains in the language's words**, never ours. No "IconSpec", "primitive" or "validator" in default copy.
5. **Progressive disclosure.** JSON, tokens and rules are one click down and never required.
6. **Nothing irreversible without a rendered preview of the consequence.**
7. **No modes.** Describe, compose and import are inputs, not modes.

---

## 4. Information architecture

Five places. No more.

```text
┌──────────────────────────────────────────────────────────────────┐
│  ⬡ Icon Foundry     Library   Create   Language   Elements   ⚙   │
└──────────────────────────────────────────────────────────────────┘
```

- **Library** (home): every icon, true size, searchable by concept. Publish, deprecate, delete, audit.
- **Create**: the agentic studio. One conversation, one canvas.
- **Language**: the setup board. Identity, philosophy, construction, sizes, exemplars, versions.
- **Elements**: the recurring parts. Where the vocabulary grows.
- **Settings**: Figma bridge, model provider, export formats.

The URL is the state, so any icon, draft or language version is a link.

---

## 5. Language: the setup board

### The blank page is the whole risk

"Define your philosophy" is the worst possible first screen. Three rules answer
it.

**Never blank.** A language always begins as something complete and working.
Three entry points, strongest first for a team that already has icons:

1. **Measure what you have.** Point at an existing SVG set; measure stroke, corner radius, canvas and angle distribution, and propose tokens and a grammar from *their* reality.
2. **Start from a lineage.** A preset, then diverge. The board records what changed, so the language has a history and a reason.
3. **Answer a few questions.** Six to eight forced choices about how the icons should feel, which set the axes and derive the rest. Two minutes from nothing to a working language.

**Never a number in the abstract.** No field says "corner radius". A control
shows two reference icons and asks which is right. The number is stored; the
decision is made by looking.

**Never locked in.** Changing the language re-renders the set, with a diff
before anything is written. Say this on the first screen: it is what makes
declaring early safe, and it is the thing Cursor could not do.

### The board

Left controls, right canvas. The reference icons are on screen the whole time,
at the design size and the smallest optical size, on light and dark.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Company Icons · draft from v0.1.0                      Compare ▾  Publish │
├────────────────────┬─────────────────────────────────────────────────────┤
│ 1 Start            │   ▢  ▣  ⌂  ✓  ⚠  →  ⊕  ◷  ☃  ▤                      │
│ 2 Identity         │        the reference set, re-rendered live           │
│ 3 Philosophy  ●    │                                                     │
│ 4 Construction     │   16px on light          16px on dark               │
│ 5 Sizes            │   ▫ ▪ ⌂ ✓ ⚠ → ⊕ ◷        ▫ ▪ ⌂ ✓ ⚠ → ⊕ ◷           │
│ 6 Colour & modes   │                                                     │
│ 7 Exemplars        │   ┌───────────────────────────────────────────────┐ │
│ 8 Publish          │   │ Guides: grid · safe area · keylines        ⌄  │ │
├────────────────────┴───┴───────────────────────────────────────────────┴─┤
│ Philosophy                                                               │
│ organic ────●──────── geometric    expressive ──●────────── minimal      │
│ friendly ──●────────── technical   abstract ───────●─────── literal      │
│ Purpose: "Quiet, precise icons for software used eight hours a day."     │
│ Uses: containers, arrows, badges    Refuses: faces, hands, fake depth    │
│                                                                          │
│ Derived: corner radius 1.5 · detail budget 3 parts · badge 35%           │
│ (unlock to override)                                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

### Show where each statement lands

The philosophy layer is only taken seriously if a team can see it working.
Every field states its destination next to the field, and states it honestly.

| What the team writes | Where it lands | Tier |
| --- | --- | --- |
| Purpose | Opens the agent's brief; shown above the set in review | human |
| Principle | Handed to the agent verbatim, one bullet each | mixed |
| Metaphor refused | A review check against element keywords | soft |
| Personality axis | Proposes the derived values below | hard |
| Line angles | A rule that flags geometry off the grammar | hard |
| Badge corner and size | Every generated layout, immediately | hard |

A principle that nothing consumes should be labelled guidance. Some cannot be
checked — "do not make it clever" — and saying so is better than pretending.

### Publish

Name a version, write the note, see a before/after of every reference icon, and
re-render the icons already built against the old version. **Compare** overlays
the draft against the published version or against the preset it came from, so
divergence is always a conscious act.

---

## 6. Create: the agentic studio

### What "agentic" means here

Not a chatbot that emits SVG. A collaborator that operates the deterministic
core through tools, inside the language, and shows its work. Every action is an
edit to a spec the user can see, undo, or take over by hand. It cannot publish.

The loop: understand intent → resolve the concept → check the library → draft
candidates → validate and score each → present them at true size with a
one-line rationale → take feedback in words or by direct manipulation → repeat.

### The screen

```text
┌────────────────────────────────┬─────────────────────────────────────────┐
│  Create                        │   Candidates          ranked by score    │
│  "cat mouse"                   │   ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│                                │   │   ▣     │ │   ▣     │ │   ▣     │   │
│  ◦ I read this as a cat with   │   │  16px   │ │  16px   │ │  16px   │   │
│    a computer mouse. Say so    │   └─────────┘ └─────────┘ └─────────┘   │
│    if you meant the animal.    │    A  0.91     B  0.84     C  0.71      │
│                                │   ✓ valid     ✓ valid     ⚠ gap 1.2    │
│  ◦ Your set has no cat. I      │                                         │
│    drafted one on 45° lines,   │   Why A                                 │
│    closed shapes, as your      │   Cat fills the circle keyline like     │
│    language asks.              │   your other animals. Badge top-right   │
│                                │   at 35%, matching your other twelve.   │
│  » A, but rounder ears         │                                         │
│                                │   [ Approve A ]  [ Edit ]  [ ↺ more ]   │
│  ┌──────────────────────────┐  │                                         │
│  │ Describe or adjust…      │  │   ▸ In context: toolbar · row · button  │
│  └──────────────────────────┘  │                                         │
└────────────────────────────────┴─────────────────────────────────────────┘
```

Rules of the screen:

- **Candidates, not a result.** Shown at true size, ranked by score rather than arriving in arbitrary order. Cursor's designer drew 156 hamburgers; the machine drafts, the human picks.
- **Every candidate carries its validation and its rationale**, in the language's own words. That is how the character stays alive instead of living in a document.
- **In context** drops the candidate into a toolbar, a list row and a button at real pixel size. Icons are judged where they live.
- **Direct manipulation is a first-class input.** Dragging the badge edits the spec; the agent continues from the edit. Words and hands are the same conversation.
- **At most one question before drafting.** Ambiguity is resolved by showing options, not by interrogation.

### How a subject with no element gets solved

The reconciliation between "arrange, do not invent" and "any subject works".

1. No `cat` element exists.
2. The agent drafts one **as a proposed element**, constrained by the grammar: construction angles, closed shapes, natural proportions, the right keyline shape. It is validated like anything else.
3. The icon is built from the proposal plus existing elements. The user approves the icon.
4. The proposed element enters **Elements** as a draft. A human promotes it. From then on every cat in the set is that cat.

The vocabulary grows through use, visibly and reversibly. A model never draws
into the library; it drafts into a queue.

### Three ways in, one path through

**Describe** (words, the default), **compose** (pick elements and place them),
**import** (paste an SVG and have it redrawn in the language). All three
produce a spec, hit the same validation, and end at the same Approve button.

---

## 7. Library: managing the set

**The grid.** True size by default, on the product's light and dark
backgrounds. Filters by status, category, keyline shape, language version and
"needs attention". Search covers tags, concepts and the keywords of the
elements used, so "search" finds the magnifying glass.

**Lifecycle.**

```text
draft ──► in review ──► published ──► deprecated ──► deleted
  ▲            │                          │
  └────────────┘  changes requested       └─ still resolvable; hidden from pickers
```

Deletion only from draft or deprecated. Publishing is the point of no return
for the *name*; the drawing can always change.

**Versions.** Publishing a batch, or upgrading to a new language version,
creates a library version with a rendered before/after of every changed icon.
This is the equivalent of Cursor's one-command ship: one action, everything
regenerated, nothing forgotten.

**Audit.** Set-level checks no single-icon rule can do: same keyline shape
within a category, badge size consistent, a recurring element drawn the same
way everywhere, near-duplicates, icons drifted from the current language
version. Each finding links to its icons and offers "fix with agent". A finding
informs; only a declared rule blocks.

**Gaps.** Concepts with no icon are requests, not silence. This is what answers
"what's the icon for X?" for the people who only ever ask that.

---

## 8. Elements: the growing vocabulary

The registry as a page. Each element shows its keyline shape, the icons that
use it, its keywords and its status. Proposed elements from the agent queue
here for a human to promote.

Editing an element re-renders every icon that uses it, with a diff. That is the
whole point of having a vocabulary rather than a pile of drawings.

---

## 9. Figma: the bridge

The plugin is not an authoring tool. It does three things:

1. **Connect** to a library.
2. **Sync**: create or update components for the published version on a dedicated page. Names are stable, so components update in place and instances stay attached. Style and Size become variant properties. The diff is shown before anything is written.
3. **Inspect**: select a synced component and see its library entry, spec and version. "Request icon" opens Create with the selection as context.

Removal is a library action. Deprecating hides an icon in the plugin; deleting
never happens from Figma. Figma is a render target, the same way SVG is.

---

## 10. Open questions

1. **Which personality axes matter**, and which are noise? Four is a guess.
2. **Unit of review.** Both the emergent-rule argument and the psychology say a new icon should be reviewed among its neighbours rather than alone in a row of three, which is what Create shows today.
3. **Import from existing SVGs**: essential for adoption, or a distraction until the language model is right?
4. **Who may publish a language version**, and is Git enough governance for now?
5. **Does the agent draft a new element without asking?** Decided 2026-09-12: yes, labelled clearly as new, never promoted silently.
