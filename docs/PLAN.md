# Build plan

Written 2026-09-12, revised the same day to put language authoring first.
Sequenced from [PRODUCT.md](PRODUCT.md) §7. **For review before
implementation starts.**

Ordering follows one filter: *does this move a decision out of someone's head
and into the system?* Not how interesting it is to build.

---

## Revision: why language authoring moved to the front

The plan originally opened with the concept registry. It now opens with
letting a team author its own language, for one reason:

> **A team cannot start using Icon Foundry for real until it speaks their
> language. Everything before that is a demo.**

Today the engine reads character, grammar and tokens from a language file and
acts on all three — the principles go verbatim into the agent's prompt, the
refused metaphors go with them, the grammar drives the validator and the
layout recipes. **That pipeline is finished.** What is missing is the other
half: `Library` has no way to write a language, so a team gets *our* Technical
language with *their* concepts. That makes this a library, not a foundry.

Concepts, audits and Figma sync are all valuable only after a team has
committed, and a team commits by declaring how its icons should look. So
concepts move from M1 to M2. The cost of that delay is small: duplicates only
start accumulating once a team is making icons in earnest, which is after they
have a language.

### The objection, and why it does not hold here

[PRODUCT.md](PRODUCT.md) §6 argues against authoring a large schema up front,
because Cursor's rules *emerged* from drawing 600 icons and nobody knows their
icon language before they have drawn any. That objection is real and the
Studio design has to answer it — but it is much weaker for us than it was for
them, for a reason worth stating plainly:

> **Cursor could not revise 600 icons when a rule changed. We can.**

Their designer held rules in his head because writing them down would not have
helped; he would still have had to redraw everything. For us, writing a rule
down *is* the mechanism, and changing one is a re-render rather than a redraw.
That inverts the objection. Declaring early is not premature, it is cheap, as
long as the Studio makes three promises:

1. **You never start from a blank page.** Every language begins as a preset or
   as a measurement of icons you already have.
2. **You never set a number in the abstract.** Every control changes real
   exemplar icons on screen as you move it.
3. **You are never locked in.** Changing the language re-renders the set, with
   a diff shown before anything is written.

Design detail for all three is in [LANGUAGE-STUDIO.md](LANGUAGE-STUDIO.md).

---

## Decisions this plan assumes

Settled in discussion; listed here so a reviewer can reject one and change the
plan rather than discover it in a diff.

1. **A team authors its own language in the app**, starting from a preset,
   never a blank form.
2. **Concepts live in the library, not the language.** A concept is a domain
   noun, not a visual rule; the two have different owners and version at
   different rates.
3. **A library can hold more than one language.** Not exotic: it is what a
   language version migration looks like.
4. **Icons point at concepts, never the reverse.** A one-way arrow needs no
   syncing and cannot drift.
5. **The library format is a versioned public contract.** It goes to 2 in M1.
6. **Directionality and closed-shapes stay unenforced.** Stated in the
   grammar, given to the agent, shown in review, never blocking.

---

## Milestones

### M1 — Author your own language

**Goal.** A team can state its rules, guidelines, psychology and philosophy in
the app, and every icon it makes is built on that statement.

**Scope, core.**

- Library format v2: `languages/<id>/language.json`, writable. Manifest gains
  `languages: string[]` with `language` retained as the default id.
- `Library.saveLanguage()` and language versions inside the library, each with
  a changelog entry.
- Exemplars per language (`languages/<id>/exemplars/`), seeded from the preset
  when a language is created, so the Studio always has something to render.
- Re-render: changing a language reports every icon that changes, before
  anything is written.
- Format 1 libraries open and are written back as format 2 on first mutation.

**Scope, the Studio.** The minimum that lets a team own its language, not the
full board:

- **Start from a lineage.** Technical or Lucide-like as presets. (Import from
  existing SVGs is deferred; see below.)
- **Character**: purpose, the four personality axes, principles, the metaphors
  the set uses and refuses. Each field shows where it lands — a principle is
  labelled as going to the agent verbatim, a refused metaphor as a review
  check.
- **Grammar**: line angles, closed shapes, diagonal direction, badge corner
  and ratio, silhouette requirement.
- **Tokens** per optical size, presented as consequences rather than numbers.
- The exemplar set is on screen throughout and re-renders on every change.
- Publish a version, with a before/after of every exemplar.

**Done when.** A team creates a library, answers a short set of questions,
gets a working language of their own, and the icons they then make are
validated and drafted against it — with no JSON edited by hand.

**Deferred out of M1**, to keep it shippable: import-and-measure from an
existing SVG set, promote-emergent (M4), and the full nine-step board from
[LANGUAGE-STUDIO.md](LANGUAGE-STUDIO.md) §4.

**Risk.** This is the largest UI surface in the plan, and it comes before the
next engine validation point. The mitigation is the split above: ship the
minimum that lets a team own its language, then widen.

---

### M2 — Concepts

**Goal.** The engine can represent what an icon *means*, so it can tell you an
icon should not exist.

**Scope, core.**

- `concepts/<id>.json`: `{ id, name, description, aliases[], status, replacedBy? }`.
  A concept exists independently of any icon, so a concept with no icon is a
  visible gap rather than nothing.
- `IconRecord` gains `concept?: string`. That is the entire binding.
- `resolveConcept(text)`: exact id, then name, then alias.
- **Duplicate constraint at publish time**: refuse to publish a second icon
  for the same `(concept, language)`. Drafts may conflict freely.

**Scope, surfaces.**

- The agent calls `resolve_concept` **first**; when it resolves, the run
  returns the existing icon instead of drafting, and says so.
- Approving a candidate records its concept; a new concept is created as part
  of approval.
- Library page: concept on the detail panel, filter by concept, and a **Gaps**
  view listing concepts with no icon in a given language.

**Done when.** Asking for a concept that exists returns it without a model
call; publishing a duplicate is refused with a message naming the existing
icon; the gaps view lists a concept added with no icon.

**Note.** This serves the biggest audience the product has — the engineers and
product managers who only ever ask "which icon do I use?"

---

### M3 — Set-level audit

**Goal.** The third rule engine: invariants that are invisible from any single
icon.

**Scope.** An audit across the whole library: same optical shape within a
category, badge size and corner consistent, a recurring element drawn the same
way everywhere, near-duplicate geometry, icons drifted from the current
language version. Findings are structured like validation issues but scoped to
a set. Web gets an **Audit** view.

**Decision to make here.** Whether a finding can ever block publishing. My
position: no. An emergent pattern is a pattern, not a law, and a rule that
cries wolf teaches people to ignore rules.

**Done when.** A deliberately inconsistent test library produces the expected
findings and a consistent one produces none.

---

### M4 — Promote emergent rules to declared *(provisional)*

**Goal.** The language learns itself from its own set, so the Studio never has
to grow into a thirty-five-field form.

**Scope.** When an audited pattern holds across the whole set, offer to write
it into the language, with a preview of what would then start failing.

**Why provisional.** The most appealing item in the plan and the least proven.
Do not start until M3 has run against a real set. Cut without regret.

---

### M5 — Element identity and derivation

Changing the folder changes every icon that uses a folder, visibly and on
purpose. Settles PRODUCT.md open question 3: whether an icon can *be* the
canonical rendering of an element. **Done when** editing the warehouse element
lists the icons that change and shows the diff before writing.

---

### M6 — Filled rendering with interior knockout

A `cutout` flag on shapes and an even-odd merge in the renderer, so a filled
warning keeps its exclamation mark. Purely additive, no `IconSpec` change, so
it can move earlier if the filled style starts mattering sooner.

---

### M7 — Figma bridge

The plugin stops authoring and becomes connect, sync, inspect
([STUDIO-EXPERIENCE.md](STUDIO-EXPERIENCE.md) §7). Components update in place
by stable name so instances stay attached; a diff is shown before writing.
Independent of M1–M6 and can move earlier if a designer needs it.

---

### M8 — Role-aware primitives

A part's role changes its geometry: a dot ending a line is not a dot meaning
"more". One generalisation of `PrimitiveContext`, done when something needs it.

---

### M9 — Optical corrections

Junction notches and stroke thinning. Last, deliberately: nearly invisible at
16px by the author's own account, and they matter only once a set is otherwise
coherent.

---

## Shape of the work

| Phase | Milestones | What becomes true |
| --- | --- | --- |
| Ownership | M1 | The language is theirs, and every icon is built on it |
| Meaning | M2 | The engine knows what an icon means, and cannot produce a duplicate |
| Coherence | M3, M4 | The set polices itself, and the language can grow from it |
| Craft | M5, M6, M8, M9 | The vocabulary holds together and the drawing gets good |
| Reach | M7 | It arrives where designers actually work |

M1 is the committed next slice. M2 follows immediately. Everything from M3 on
should be re-examined once a real team has authored a real language.

---

## What I would cut

If this plan has to be smaller, cut in this order: M4 first (speculative), M9
next (marginal), then M8 (wait for a need). M1 through M3 are the plan; the
rest is what the plan enables.

---

## What this plan does not address

- **Unit of review** (PRODUCT.md open question 2). A new icon should be
  reviewed among its neighbours rather than alone in a row of three. Belongs
  with M3, once the audit can say who the neighbours are.
- **Concept taxonomy.** Concepts are flat: no hierarchy, no relations.
- **Team roles and permissions.** Still Git.
