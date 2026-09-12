# Build plan

Written 2026-09-12. Sequenced from [PRODUCT.md](PRODUCT.md) §7, with the
concept-location question from §8 now decided. **For review before
implementation starts.**

Ordering follows one filter: *does this move a decision out of someone's head
and into the system?* Not how interesting it is to build.

---

## Decisions this plan assumes

Settled in discussion; listed here so a reviewer can reject one and change the
plan rather than discover it in a diff.

1. **Concepts live in the library, not the language.** A concept is a domain
   noun, not a visual rule; the two have different owners and version at
   different rates.
2. **A library can hold more than one language.** Not an exotic case: it is
   what a language version migration looks like, and forcing one library per
   language duplicates the concept vocabulary and recreates the decay one
   level up.
3. **Icons point at concepts, never the reverse.** A one-way arrow needs no
   syncing and cannot drift. No `renderings` map on the concept record.
4. **The library format is a versioned public contract.** It goes to 2 in M1,
   which is the last cheap moment to change its shape.
5. **Directionality and closed-shapes stay unenforced.** Stated in the
   grammar, given to the agent, shown in review, never blocking.

---

## Milestones

### M1 — Library format v2: concepts and multiple languages

**Goal.** The engine can represent what an icon *means*, and a library can
hold one concept vocabulary rendered in more than one language.

**Scope.** Core packages only, no UI.

- `concepts/<id>.json`: `{ id, name, description, aliases[], status, replacedBy? }`.
  A concept exists independently of any icon, so a concept with no icon is a
  visible gap rather than nothing.
- `IconRecord` gains `concept?: string`. That is the entire binding.
- Manifest: `languages: string[]`, with `language` retained as the *default*
  language id. `language/language.json` becomes `languages/<id>.json`.
- `Library` holds a map of languages; `renderSpec` and friends resolve per
  icon via the `language` already on every `IconSpec`.
- `resolveConcept(text)`: exact id, then name, then alias match. Returns the
  concept and its icon in a given language, or nothing.
- **Duplicate constraint at publish time**: refuse to publish a second icon
  for the same `(concept, language)`. Drafts may conflict freely; publishing
  is where it matters, which matches the existing lifecycle.
- Format 1 libraries open and are written back as format 2 on first mutation.
  No separate migrate command.

**Done when.** A library holds two languages and one concept list; publishing
a duplicate concept in the same language is refused with a message naming the
existing icon; a format 1 library opens, upgrades on write, and loses nothing.

**Risk.** The format change touches 10 call sites across 7 files, all of which
currently read `library.language`. Small, but it is the widest blast radius in
this plan.

---

### M2 — Concepts in the studio and the agent

**Goal.** Nobody can accidentally create an icon that already exists, and
"what's the icon for X?" has an answer.

**Scope.**

- Agent gains `resolve_concept` as the tool it is told to call **first**. When
  the concept resolves, the run returns the existing icon instead of drafting
  and says so.
- Approving a candidate records its concept; a new concept is created as part
  of approval.
- Library page: concept shown on the detail panel, filter by concept, and a
  **Gaps** view listing concepts with no icon in a given language.
- Create: if the brief resolves to an existing concept, show that icon first
  and make drafting anyway a deliberate second step.

**Done when.** Asking for a concept that exists returns it without a model
call; the gaps view lists a concept added with no icon.

**Note.** This is where the biggest audience is served — the engineers and
product managers who only ever ask "which icon do I use?"

---

### M3 — Set-level audit

**Goal.** The third rule engine: invariants that are invisible from any single
icon.

**Scope.**

- An audit that runs across a whole library: same optical shape within a
  category, badge size and corner consistent across icons that have one, a
  recurring element drawn the same way everywhere it appears, near-duplicate
  geometry, icons drifted from the current language version.
- Findings are structured like validation issues, but scoped to a set and
  carrying the icons involved.
- Web: an **Audit** view grouping findings, each linking to its icons.

**Decision to make during this milestone.** Whether an audit finding can ever
block publishing. My position: no. An emergent pattern is a pattern, not a
law, and a rule that cries wolf teaches people to ignore rules. Findings
inform; only a declared rule blocks.

**Done when.** A deliberately inconsistent test library produces the expected
findings, and a consistent one produces none.

---

### M4 — Promote emergent rules to declared *(provisional)*

**Goal.** The language learns itself from its own set, so nobody has to author
a thirty-five-field schema up front.

**Scope.** When an audited pattern holds across the whole set, offer to write
it into the language as a declared rule, with a preview of what would then
start failing.

**Why provisional.** This is the most intellectually appealing item in the
plan and the least proven. It should not start until M3 has run against a real
set and we know which patterns actually hold. Cut it without regret if M3
shows the patterns are noisier than expected.

---

### M5 — Element identity and derivation

**Goal.** Changing the folder changes every icon that uses a folder, visibly
and on purpose.

**Scope.**

- Settle whether an icon can *be* the canonical rendering of an element
  (open question 3 in PRODUCT.md). Current architecture assumes
  element-to-icon derivation, which I believe is right; this milestone is
  where the bridge is built or the assumption is rejected.
- Editing an element previews every dependent icon before and after, and
  re-renders them on confirm.

**Done when.** Editing the warehouse element lists the icons that change and
shows the diff before anything is written.

---

### M6 — Filled rendering with interior knockout

**Goal.** Close the one visible quality gap.

**Scope.** A `cutout` flag on shapes and an even-odd merge in the renderer, so
a filled warning keeps its exclamation mark and a filled warehouse keeps its
door. Objects regain their interior detail in the filled style.

**Done when.** Every built-in object renders with interior detail in both
styles, and the examples sheet shows it.

**Note.** Purely additive: no `IconSpec` changes, so it can move earlier if
the filled style starts mattering sooner.

---

### M7 — Figma bridge

**Goal.** Distribution. A system nobody can use in Figma solves nothing.

**Scope.** The plugin stops authoring and becomes connect, sync, inspect, as
described in [STUDIO-EXPERIENCE.md](STUDIO-EXPERIENCE.md) §7. Components
update in place by stable name so instances stay attached; Style and Size
become variant properties; a diff is shown before anything is written. The
current authoring UI goes behind a developer flag, then is removed.

**Done when.** Publishing in the web app and syncing in Figma updates existing
components without detaching instances.

**Note.** Independent of M1–M6. Can run in parallel or move earlier if a real
designer needs it before the engine work lands.

---

### M8 — Role-aware primitives

A part's role changes its geometry: a dot ending a line is not a dot meaning
"more". One generalisation of `PrimitiveContext`, done when something needs
it. Small.

---

### M9 — Optical corrections

Junction notches and stroke thinning. Last, deliberately. They are nearly
invisible at 16px by the author's own account, and they matter only once a set
is otherwise coherent. They are a renderer concern, so deferring costs nothing
architecturally.

---

## Shape of the work

| Phase | Milestones | What becomes true |
| --- | --- | --- |
| Meaning | M1, M2 | The engine knows what an icon means, and cannot produce a duplicate |
| Coherence | M3, M4 | The set polices itself, and the language can grow from it |
| Craft | M5, M6, M8, M9 | The vocabulary holds together and the drawing gets good |
| Reach | M7 | It arrives where designers actually work |

M1 and M2 are the committed next slice. Everything from M3 on should be
re-examined once they have run against a real set.

---

## What I would cut

If this plan has to be smaller, cut in this order: M4 first (speculative), M9
next (marginal), then M8 (wait for a need). M1 through M3 are the plan; the
rest is what the plan enables.

---

## What this plan does not address

- **Unit of review** (PRODUCT.md open question 2). Both the emergent-rule
  argument and the psychology say a new icon should be reviewed among its
  neighbours rather than alone in a row of three. That changes the Create
  page, and it belongs with M3 once the audit can say who the neighbours are.
- **Concept taxonomy.** Concepts are flat here: no hierarchy, no relations
  between them. That is deliberate for now.
- **Team roles and permissions.** Still Git.
