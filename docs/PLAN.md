# Build plan

Written 2026-09-12, revised twice the same day: first to put language
authoring ahead of concepts, then to make executable philosophy the centre.
The target architecture is [COMPILER.md](COMPILER.md); the method for deciding
what a rule can enforce is in the same document.

**Status, 2026-09-12: every milestone M1–M18 is implemented.** The one thing from the first phase not
verified is the Figma plugin inside real Figma, which no test can stand in for.
Each milestone keeps its original text, with a status note recording what
shipped and what the building of it corrected — a plan that is edited to match
the outcome stops being evidence of anything.

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

Design detail for all three is in [EXPERIENCE.md](EXPERIENCE.md).

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
6. **A rule has one of three authorities.** Hard constraints are enforced,
   soft preferences are scored and ranked, human judgment is surfaced and
   never decided. Forcing every principle into the first tier is what makes
   rule systems get ignored.
7. **AI owns meaning, the language owns appearance, the compiler owns
   geometry.** The test: changing the language changes every icon; changing a
   concept changes one.
8. **Philosophy reaches an icon as a number or it does not reach it at all.**
   Prose has no arithmetic. The personality axes are the bridge.

---

## Milestones

### M1 — Author your own language ✅ done

A team states its identity, philosophy, construction and sizes in the app, and
sees the reference icons re-render on every change. Library format 2, writable
languages, per-language exemplars, version snapshots with notes, several
languages per library, format 1 migration.

Built and verified in the browser on 2026-09-12. Deferred: adding or removing
an optical size, and importing an existing SVG set to measure tokens from it.

---

### M2 — Executable philosophy ✅ done ← the central problem

**Goal.** Identity and Philosophy stop being metadata read by a prompt and
start producing constraints the compiler acts on. This is what separates a
compiler for a visual language from an SVG generator with a design-system
wrapper.

**Part 1 — The axes drive the tokens.** The four personality axes are the only
part of Philosophy that is already a number, and today nothing reads them.

- `deriveTokens(character, derivation, primaryCanvas)` proposes corner radius,
  stroke caps and joins, part and shape budgets, and badge size.
- **Derivation is interpolation between authored endpoints, not a formula.**
  Each axis declares the token values at each of its two poles, and the axis
  position interpolates between them, the way a variable font interpolates a
  weight axis. A formula would be our taste wearing the team's clothes.
- **The endpoints are editable in the app.** A team can say what "minimal"
  means for *their* set: which tokens each slider moves, and to what values at
  each extreme. Without this the axes are still our taste, just one level
  further from view.
- Where two axes move the same token, the proposal is the mean of their
  contributions, and the editor shows each contribution rather than only the
  result.
- **Absent means derived.** A derivable token omitted from the language file is
  computed; a token written in the file is an override that wins. So "unlock
  and override" is literally "write the value down", and the file stays small
  while the set is young.
- Endpoints are expressed in the units of the primary optical size; other sizes
  scale by canvas ratio, and can be overridden directly.
- Moving a slider moves the reference icons. The editor claimed this before it
  was true; that label has been corrected until this lands.

**Status (2026-09-12): Part 1 is built and verified in the browser.** The axes
derive corner radius, badge size and both budgets; overrides are per field; the
endpoints are editable per language; the panel shows each axis's contribution.
Two things surfaced while building it. Budget overrides were being written as
one block, so a field that *did* derive still read as overridden. And no
reference icon used a corner radius, so moving that slider changed a number and
nothing on screen — the set now includes two icons with rounded corners, and
"the reference set must exercise every token the language can change" is a rule
worth keeping.

**Part 2 — Rules declare their authority.** A rule is currently an id and a
severity. It needs a tier.

- `hard` enforces, `soft` scores, `human` surfaces.
- A soft rule returns a number from 0 to 1 with an explanation, not a list of
  issues.
- A principle may name the rule that enforces it, so the editor can show which
  principles have teeth, which are scored, and which are guidance. Two of the
  Technical language's eight principles are already guaranteed by the engine
  and nobody can tell.

**Part 3 — The first scorers.** Restraint against the detail budget as a
gradient rather than a cliff; silhouette survival; symmetry. Candidates in
Create are ranked by score instead of arriving in arbitrary order.

**Also here, because it is small and moves a field from Words to Check:**
metaphors the language refuses become a check against element keywords. No
model required.

**Done when.** Moving the "expressive ↔ minimal" slider visibly simplifies the
reference icons; a team with no model configured has a philosophy that changes
the drawing; Create ranks its candidates and says why.

**Status (2026-09-12): done.** Parts 2 and 3 landed after Part 1. A rule now
carries a tier: `hard` enforces, `soft` scores 0–1 with a sentence, `human`
asks a question and refuses to answer it. Five scorers ship — restraint,
optical balance, symmetry, silhouette and breathing room — and each one is
weighted by `language.preferences`, where a weight of zero turns it off,
because which preferences matter is taste and taste is the team's. Refused
metaphors became a keyword check with no model involved. The editor's last
section tells you plainly how many rules are enforced, scored, and left to you.

One correction worth recording. The symmetry scorer first measured the whole
composition and gave 0.00 to every badge icon, which is a deliberate,
correct pattern. It now measures the largest element only, mirrored about its
own centre. A score that punishes a pattern the grammar recommends is worse
than no score, because it teaches people to ignore the number.

**Why this is worth more than it looks.** One scorer serves three things the
plan otherwise treats as separate features: ranking candidates, auditing drift
across a set, and discovering emergent rules, since a score that clusters
tightly across a whole set is an unstated rule. Recording which candidates
humans actually approve, against their scores, lets the soft tier learn from
review with no model involved.

---

### M3 — The concept registry, with decomposition ✅ done

**Goal.** The engine knows what an icon *means* and what the thing is *made
of*, so the model is needed less every month.

Grown from the original scope: a concept is not a name with aliases, it carries
the decomposition.

- `concepts/<id>.json` with id, name, description, aliases, status, and a
  `composition`: an arrangement plus parts, each part naming an element, a
  count and a priority.
- Priority is how philosophy prunes: at a tight detail budget the optional
  parts are dropped, so one concept renders differently at 16px and 24px
  without anyone drawing either.
- `resolveConcept(text)` by id, name, then alias. **This replaces the keyword
  parser** rather than sitting beside it.
- Duplicate constraint at publish time: one published icon per concept per
  language.
- The agent calls `resolve_concept` first and returns the existing icon when it
  resolves.
- Library gains a **Gaps** view: concepts with no icon are requests.

**Done when.** "server", "host" and "backend" all resolve to one concept and
render with no model call; a second icon for the same concept in the same
language is refused.

**Status (2026-09-12): done.** `composeConcept` is the concept compiler:
decomposition plus language becomes an IconSpec, pruning optional parts to the
size's budget and recording what it dropped and why. Publishing a second icon
for a concept already published in that language is refused by name. The
library has a Gaps view.

Two bugs are worth keeping. Element boxes are centrelines, so a stack spaced by
the raw minimum gap draws two strokes half a stroke too close; the compiler now
owns that conversion rather than expecting a caller to remember it. And
`parseIconRecord` never read `concept`, so a concept link survived in memory
and vanished on reopen — it worked in-process and failed through the HTTP
route, which is the shape of bug that a test in the same process will never
catch.

---

### M4 — Arrangements in the grammar ✅ done

`stack`, `badge`, `contain`, `pair`, `single`, each with the rules for how this
set draws it. `grammar.badge` already works exactly this way and becomes the
first of them. Today there is one hardcoded arrangement: subject plus up to two
badges.

**Status (2026-09-12): done.** Five arrangements ship: `single`, `badge`,
`stack`, `row` and `contain`. A language declares which it allows, and a
concept asking for one it does not allow is refused with the list. `pair`
became `row`, because a row of two and a row of three are the same rule and
naming the count was an invitation to add `triple` later.

The series layout took two passes to get right. Gaps are rounded up to a whole
grid step and unit sizes rounded down, with the remainder split as a lead-in,
so a stack stays on the grid and inside its keyline instead of drifting off
both.

---

### M5 — Set-level audit ✅ done

The scorers from M2 run across every icon rather than one. Same optical shape
within a category, badge size consistent, a recurring element drawn the same
way everywhere, near-duplicate geometry, icons drifted from the current
language version. A finding never blocks publishing.

**Status (2026-09-12): done.** `auditLibrary` reports drift from the current
language version, duplicate geometry, two icons claiming one concept, icons
with no concept at all, inconsistent badge size, and score outliers. Nothing it
finds blocks anything.

The outlier detector first fired on a set of five icons. It now needs eight
scored icons and a three-times spread, because calling something an outlier out
of four samples is noise dressed as a finding, and a tool that cries wolf on a
new library is a tool nobody turns on twice.

---

### M6 — Promote emergent rules to declared ✅ done *(still provisional)*

A score that clusters tightly across the whole set is an unstated rule; offer
to write it into the language, with a preview of what would then start failing.
Do not start until M5 has run against a real set.

**Status (2026-09-12): done, and it stayed provisional on purpose.**
`proposeRules` can offer four: construction angles, a detail budget, a minimum
gap, and badge size. Every proposal carries `wouldFail` — the icons that would
start failing the moment you accept it — and an `apply()` that writes it into
the language. Nothing is ever written without that preview, because a rule
promoted silently turns your own set into a list of violations overnight.

---

### M7 — Element identity and derivation ✅ done

Changing the folder changes every icon that uses a folder, visibly and on
purpose. Settles whether an icon can *be* the canonical rendering of an element.

**Status (2026-09-12): done.** `previewElementChange` renders every icon that
uses an element, before and after, so the blast radius is a screen rather than
a guess.

---

### M8 — Ship a set ✅ done

Found missing entirely by [SYSTEM.md](SYSTEM.md): there is no way to get a
finished set out of the system. Bulk SVG export, an icon font, a sprite sheet,
and a code target. Without this, fifty icons in a library reach a product one
download at a time, and the engineer is the one role the system serves not at
all.

**Status (2026-09-12): done.** Six formats — individual SVGs, a sprite sheet, a
TypeScript module, React components, CSS, and a manifest — plus a ZIP of all of
them, written by a dependency-free archiver so shipping a set never turns into
a supply-chain question. Only published icons are exported: a draft is not a
release.

Codepoints are assigned from U+E000 upward and never reused, so a later release
can replace a font without renumbering what already shipped. The icon font
itself is not built here; the manifest carries what a font builder needs.

---

### M9 — Figma bridge ⚠ built, unverified in Figma

The plugin stops authoring and becomes connect, sync, inspect. It currently
does not depend on `icon-library` at all, so there are two ways to make an icon
that share no data — the clearest architectural contradiction in the repo.

**Status (2026-09-12): built, not yet verified inside Figma.** The plugin does
four things: connect to a library, show what a sync would change before it
changes it, sync, and tell you what a selected component is. Authoring is gone.

The rule that makes syncing safe: a component is found by the name recorded in
its plugin data, never by position or label, and it is updated in place.
Replacing the node would detach every instance of it in every file, which is
the one mistake in this milestone that a designer could not undo.

**Outstanding.** Nobody has run this in real Figma yet. The sandbox API is not
something a test can stand in for, so treat this as unverified until someone
opens it in a file with instances already placed.

---

### M10 — Filled rendering with interior knockout ✅ done

A `cutout` flag and an even-odd merge, so a filled warning keeps its
exclamation mark. Purely additive; can move earlier.

**Status (2026-09-12): done.** A shape can be marked as a hole, and filled
geometry of one colour is emitted as a single path with `fill-rule="evenodd"`.
Rendering the hole as its own element would paint it on top in the same colour,
which is indistinguishable from having no hole. A line is typed so it can never
be a cutout, because a line encloses nothing.

Five primitives now declare their holes: the warehouse door, the building's
windows and door, the document's folded corner, the warning's exclamation mark,
and the device screen. Verified by eye against the outline versions.

---

### M11 — Optical passes ✅ done

Junction notches, stroke thinning, dot roles. Last, deliberately: nearly
invisible at 16px by the author's own account, and they matter only once a set
is otherwise coherent.

**Status (2026-09-12): done, and more visible than expected.** Three passes run
on composed geometry, each declared in the language and each off until asked
for:

- **Junction notch.** A stroke end that meets another part of the same element
  at a shallow angle is pulled back, so ink stops piling up in the crook. The
  arrow is the clearest case: the shaft used to push into the arrowhead and
  blob; now the head reads as a clean V.
- **Interior thinning.** Detail drawn inside a contour of the same element
  draws lighter, so the contour stays the heavier line. The isometric package
  and the warehouse both improve a lot more than "nearly invisible" suggested.
- **Dot sizing.** Every dot gets one drawn diameter instead of whatever its box
  produced. This has to match two shapes, because an outline set draws a dot as
  a round cap on a stroke of no length, not as a circle.

Three decisions are worth keeping.

**Corrections run at render, never at validation.** The validator judges the
geometry the compiler laid out. If it saw the corrected drawing, a notch would
read as a negative-space failure and an audit would compare retouching rather
than geometry.

**Containment allows touching.** Strict containment on all four sides looks
like the right test for "interior detail" and is not: a warehouse door stands
on the warehouse floor and a window sits flush against a wall. Requiring a gap
on every side exempted exactly the detail the pass exists for.

**Interior thinning is a blunt instrument and stays one.** It treats everything
inside a contour as secondary. That is right for clock hands and the lines of a
cube; it is arguable for the exclamation mark in a warning. Nothing structural
in the spec separates the two cases, so the honest answer is to state the
limit, keep the pass off by default, and let the team set the number. That is
the soft tier working as designed rather than a gap in it.

Every pass reports what it changed, and the reference set gained a `warning`
icon so the dot token has something on screen to move.

---

---

# Phase two: the hand

Accepted 2026-09-12 from [proposals/construction.md](proposals/construction.md),
which carries the argument and a working concept of the screen at
[proposals/language-page-concept.html](proposals/language-page-concept.html).

**The gap this phase closes.** A team can already author their tokens, their
rules, their concepts and their preferences. They cannot author how a part is
*built*. Every construction decision — the pitch of a roof, how an opening is
drawn, how big a wheel is — is a literal in our TypeScript. So what a team gets
today is their tokens applied to our drawings, and that is the reason nobody has
built a real set with this yet.

**There is almost no backend here, and that is worth saying plainly.** The
library lives in the browser, on disk through the File System Access API or in
IndexedDB. The only server is the agent route, which exists to hold a model key.
So the split is not frontend and backend, it is:

| Side | What it is | Milestones |
| --- | --- | --- |
| **Engine** | The packages. Pure, deterministic, no network. | M12, M14, M15, M16 |
| **Studio** | The React app. | M13, M17 |
| **Server** | One route, `/api/agent`. Grows by one more in M18. | M18 |

### How the property research fits

A survey of what published icon systems actually specify — Material Symbols,
SF Symbols, Carbon, Lucide, Phosphor, Fluent and others — is running. The test
applied to it is recurrence: a property many independent systems specify is part
of the craft, while a property one system specifies is that team's taste.

**The mechanism does not depend on the answer, and the list does.** So M14 builds
how a trait is declared, derived, stored and consumed, using corner radius as its
only trait, and can start now. M15 is where the list lands, and it should not
start until the research has been read.

**Landed 2026-09-12: [research/icon-properties.md](research/icon-properties.md).**
Twenty-two sources, a hundred and ten claims, each survivor verified by three
adversarial votes. Only two vendors produced claims that survived — Google and
IBM — so "widely adopted" means "attested twice", not "industry consensus". Three
results changed this plan:

1. **Only four construction properties are exposed as tunable axes anywhere**, all
   of them Google's: `FILL`, `wght`, `GRAD`, `opsz`. IBM and Carbon expose none.
   Every other property is prose in both systems. The bet behind this phase is
   therefore genuinely unattempted rather than catching up.
2. **Corner radius is a rule set, not a number.** Exterior corners take the
   radius, interior corners are square, and nothing narrower than two strokes
   rounds at all. Two independent vendors, different values, identical structure.
   This revised M12 while it was being built and it adds a trait to M15.
3. **Our guessed traits have no external corroboration.** Aperture and detail
   budget were searched for by name and produced *zero* verified claims in any
   system. That is not an argument against them — it is the argument for them,
   since a decision nobody writes down is exactly a decision living in someone's
   head. But they are ours, and M15 labels them so.

---

### M12 — Corner radius reaches every primitive ✅ done

A defect fix, worth doing under any answer to anything else in this phase.

Set the language corner radius high today and eight primitives disagree about
whether it applies to them. The building, the monitor and the rounded rectangle
follow. The square and the isometric package decline, correctly. The truck's
cargo box, the warehouse's bay door and the warning's exclamation bar stay
sharp, because those radii are hardcoded numbers.

- Every primitive either honours the language radius or declares in code that it
  does not, with a reason.
- A test that fails when a primitive silently ignores a token it should consume.
  This is the class of bug that is invisible until a user moves a slider and
  nothing happens.

**Done when.** A team asking for a soft, rounded set does not get a rounded
building standing next to a sharp truck.

**Status (2026-09-12): done, and rewritten mid-flight by the research.** The
first pass made every rect follow the radius, including the building's windows
and the warehouse door. The survey then landed and said that is wrong twice
over: interior corners are square, and nothing narrower than two strokes rounds
at all. `localRadius` now refuses a corner too narrow to take one, and
`interiorRadius` keeps interior detail square in the outlined style while
letting holes follow the silhouette when filled.

A primitive now declares what it consumes, and the declaration is tested in both
directions: if it names corner radius its geometry must change, and if it does
not, its geometry must not. That test immediately earned itself. Once interiors
went square the `warning` primitive stopped responding at all — its triangle is
a polyline with no corner to take a radius, and its bar is two units wide — so
its declaration had become a lie and the test said so.

---

### M13 — Light and dark, chosen rather than inherited ✅ done

Small, independent, and it improves the review of everything after it.

Today `styles.css` follows `prefers-color-scheme` with no control, so a person
on a dark machine has never seen the light theme and cannot judge their icons in
it. The reference board already renders icons on both grounds; the app around it
does not.

- A theme control: light, dark, or follow the system. Persisted.
- The dark palette moves out of a media query and becomes an explicit theme, so
  all three states are real rather than two-and-a-default.
- **Every part is shown on both grounds at once, not one at a time.** This is the
  point rather than a nicety: the same stroke reads heavier as a light shape on a
  dark ground than inverted, so a weight chosen on white alone is wrong at night.
- **The theme is a view preference and never touches the language file.** It says
  nothing about the icons.

**Done when.** A person can pick a theme independently of their machine, and can
see any part in both grounds side by side whichever they picked.

**Status (2026-09-12): done.** Three real themes rather than two and a default,
chosen in the header, applied before first paint so there is no flash, and
remembered. Every part renders on both grounds at once regardless of which theme
is active.

The research supplied the reason this is more than a nicety. Material Symbols
ships an entire variable axis for it, `GRAD`, whose documented purpose is "to
reduce glare for a light symbol on a dark background", with roughly −25 grade
suggested for reversed contrast. A stroke weight chosen on white is measurably
wrong on black. That turns into a trait in M15.

---

### M14 — Construction traits in the language ✅ done

The data layer, and the whole mechanism. No new UI.

> **A construction trait is a named decision that several primitives consume.
> Primitives declare which traits they use. Setting a trait changes every
> primitive that declared it, and nothing else.**

- A `construction` block in the language, beside `grammar` and the size tokens:
  parsed, serialised, in the published schema, and covered by the schema test.
- Derivation from the personality axes, reusing the M2 mechanism exactly:
  interpolation between authored endpoints for numbers, a threshold for enums,
  the mean where two axes move one trait, and *absent means derived, present
  means override*.
- Length-valued traits scale per optical size the way the notch already does.
- `PrimitiveContext` carries the traits; `Primitive` declares which it consumes;
  the registry can answer "which primitives consume this trait".
- **The three-consumer rule is enforced by a test.** A decision used by one
  primitive is a property of that primitive, not a language decision. Without
  this the trait list grows to sixty and becomes unusable.

**Done when.** A language file sets a trait, a test proves its declared consumers
change, and a test proves nothing else did.

**Status (2026-09-12): done.** A `construction` block in the language, parsed,
serialised, in the published schema, derivable from the axes, with absent
meaning derived and present meaning an override. Two traits to prove the
mechanism, both attested by the research: `interiorRadius`, read by the
primitives, and `grade`, read by the renderer.

Three things worth keeping.

**Every default is the identity.** Square interiors and no grade are what the
shipped languages already drew, so adding the layer changed nothing. The
alternative — deriving them from the axes out of the box — would have redrawn
every icon in every library the moment someone upgraded, which is the one thing
a correction must never do.

**Grade applies at render and never at validation.** An icon must not pass on
white and fail on black, so the validator judges the composed geometry and the
ground is a rendering argument.

**The declaration test earned its keep twice more.** Once interiors went square
the `warehouse` stopped responding to the exterior radius at all, because its
silhouette is a polyline, and the test said its declaration had become a lie.

---

### M15 — The primitives consume traits ✅ done ← the large one

This is the milestone. The UI either side of it is the smaller half.

**Does not start until the property research has been read**, because this is
where the trait list is committed and the list should come from what icon
systems actually specify rather than from reading our own 23 primitives.

- Each primitive declares its traits and consumes them instead of literals.
- Golden-file rendering tests, so a change to a shared trait shows up as a
  reviewable diff across the whole set rather than a surprise.
- Every existing example, exemplar and library icon still renders.

**Expect the list to be wrong in at least one place.** A single trait for how an
opening is drawn is already too blunt in the concept, because a window and a
door want different answers. Splitting a trait is cheap; discovering the need
after the UI is built is not.

### The list, revised by the research

Two groups, and the difference between them is stated rather than blurred.

**Attested by two independent vendors.** Treat these as language primitives.

| Trait | What it decides | Evidence |
| --- | --- | --- |
| `interiorRadius` | Whether a corner inside the silhouette rounds with it or stays square. | Google and IBM both state exterior-rounds, interior-square, with different numbers. Material later made it a style family, which is the proof it is a team's decision rather than a law. |
| `grade` | A thickness offset applied only on dark grounds, finer than stroke weight. | Material Symbols' `GRAD` axis, −50 to 200, documented for "reducing glare for a light symbol on a dark background". |

**Ours.** Drawn from reading our own primitives and from one team's published
account. No system documents them, which is the reason to have them and also
the reason not to claim they are craft consensus.

| Trait | What it decides | Consumers |
| --- | --- | --- |
| `aperture` | How an opening is drawn: a line, a closed shape, a notch. | building, warehouse, document, device |
| `inset` | How far interior detail sits from the contour it is in. | building, device, warehouse |
| `accentSize` | The signature round part, relative to its host. | person, vehicle, location, clock, thermometer |
| `slope` | The pitch of a sloping or receding plane. | warehouse, package, vehicle, document |
| `arrowhead` | Open V, closed triangle, or chevron. | arrow, check |

Two token changes the research also calls for, which are not traits and are
cheap. **Live area is three rings**, not one inset: an inner region to stay
inside, an outer trim that must not be crossed, and a sanctioned overshoot
between them for visual weight. And **whole-pixel fitting** is a hard production
rule in both systems and something our `grid` token explicitly is not; it
belongs as a check at the primary optical size.

**Done when.** Every literal that encodes a shared construction decision is a
trait, and changing one moves the whole set.

**Status (2026-09-12): done.** Six traits ship. Two from the research —
`interiorRadius` and `grade` — and four of ours: `aperture`, `inset`,
`accentSize`, `slope`.

| Trait | Consumers |
| --- | --- |
| `cornerRadius` | rounded-rectangle, building, vehicle, device |
| `interiorRadius` | building, warehouse, device, warning |
| `aperture` | building, warehouse, device |
| `inset` | building, warehouse, device |
| `accentSize` | person, vehicle, warning, thermometer, location |
| `slope` | warehouse, package, document, vehicle |

**`arrowhead` was refused by our own rule, and that is the rule working.** It
had two consumers, arrow and check, and the three-consumer rule says a decision
used by fewer than three primitives is a property of those primitives rather
than of the language. It can come back when a third directional symbol arrives.

**Two traits default to `mixed`, which is not a style but an unmade decision.**
Our vocabulary answers the aperture question three different ways in one set —
a building's windows are lines, a warehouse's bay door is a closed rectangle, a
monitor's screen is nothing at all until filled — and the slope question two
ways, 45° and isometric. Defaulting to any one answer would silently redraw the
others. Defaulting to `mixed` preserves every drawing exactly *and* leaves the
inconsistency visible, which is the product's own thesis turned on itself: a
decision nobody made is still a decision.

**Verified by exhaustion, not by eye.** Rendering all 23 primitives in both
styles under the default construction produces geometry byte-identical to
before the milestone. Each trait then moves exactly the primitives that declare
it and no others.

**The predicted failure happened.** The plan said `slope` was "the trait most
likely to produce a broken drawing from a plausible value". Set to 45° the
isometric package becomes a diamond and stops reading as a box. The trait is
doing what it was told; the lesson is that a construction trait can break a
metaphor, and the editor has to show the whole set rather than a number.

---

### M16 — Exceptions, allowed and never silent ✅ done

- A per-primitive exception lives in the language beside the traits, carrying the
  values and a required written reason.
- Four things make it cost something: it is shown against the language value
  side by side at the same size, it carries that reason, it is marked on the
  part wherever the part appears, and it is counted.
- A new audit finding. One exception is a judgement; nine is a language that
  needs changing, and the audit should say which trait is being escaped.

**Done when.** An exception survives a round trip through the folder, appears in
the audit, and cannot be created without a reason.

**Status (2026-09-12): done.** An exception lives in the language beside the
traits, keyed by part, carrying the values and a reason the parser refuses to
accept as empty. The composer substitutes it per part, so no primitive has to
know exceptions exist. Two audit findings: one that lists every departure with
its reason, and one that escalates to a warning when three or more parts escape
the same trait, because at that point the language value is wrong rather than
the parts.

**Requiring the reason changed the editing order, and for the better.** The
first build wrote the exception the moment a number moved, which put an
exception with an empty reason into the draft — the parser rightly refused it
and the whole editor collapsed mid-edit. The exception is now held until it has
a reason, which is also the more honest sequence: you say what you saw before
you get to change anything.

---

### M17 — The merged Language page ✅ done

Frontend. The design is settled and demonstrated, so this is translation rather
than design: see the concept, which is a working page.

Three columns, sorted by one principle: **everything that changes the drawing
goes next to the canvas, everything else gets out of the way.**

| Column | Holds |
| --- | --- |
| Left | Identity, purpose, principles, metaphors, preference weights, the questions left to a person, versions. Collapsible. None of it changes the drawing. |
| Middle | The canvas. Built-in parts, your elements with their lifecycle actions, and icons composed from them. Filtered to whatever control you are touching. |
| Right | Personality axes first, then construction traits, size tokens, optical corrections. Everything that moves the drawing. |

- The navigation drops to three tabs: Library, Create, Language.
- **The Elements page is retired**, and everything it did moves here: approving
  and deprecating draft elements, editing an element, and the before-and-after
  preview of every icon a change would touch.
- The canvas filters to a trait's consumers on hover, so nobody has to wonder
  what a control reaches.
- **Every control must visibly change the drawing.** Written down twice already
  and learned twice the hard way; it matters most here.

**Done when.** Everything the two old pages did is doable on this one, and the
old routes are gone rather than orphaned.

**Status (2026-09-12): done.** Three columns, three tabs, and the Elements page
is gone. `#/elements` redirects to the language rather than 404ing, because an
old bookmark should land where its contents went.

Everything the two pages did is here: approving and deprecating draft elements,
editing an element's geometry with the before-and-after of every icon it
touches, and all seven sections of the old editor, sorted by whether they change
the drawing. Selecting a part says which traits it reads, which is the answer to
"what will this control do to this shape" without anyone having to guess.

Two things the build corrected. **The columns scroll independently**, because
one page scroll means reaching a control in the right column scrolls the canvas
out of view, which defeats the entire layout. And the trait panel scopes the
canvas on hover: touching `accentSize` dims 21 of 29 parts and lights the five
that read it.

---

### M18 — The trait chat panel ✅ done

Last, deliberately, and cheap by the time it arrives.

A panel that moves declared trait values inside declared ranges from natural
language. *Make it feel more industrial* becomes four trait values a person can
see, argue with, and keep.

- Four tools over the trait system: list, set, preview, explain. The model never
  touches geometry.
- A second server route, for the same reason as the first: the key stays server
  side.
- Every change it makes is visible on the canvas and reversible.

**Why it is last.** A chat panel over a property system that does not exist has
nothing to talk about and would have to invent its own vocabulary, which is how
you end up with two models of the same thing. Built after M14 through M17, it is
a small tool loop over values that are already named, typed and bounded.

**Status (2026-09-12): done, and cheap exactly as predicted.** Four tools —
`list_traits`, `set_trait`, `explain_trait`, `note_to_designer` — over a second
server route that exists for the same reason as the first: the key stays on that
side. A test asserts the model is offered those four and nothing else, so no
future edit can quietly hand it something that draws.

Three properties make it safe to use. Every value is held to the range its trait
declares rather than trusted, so a model asking for an accent of 99 gets 2.5.
Nothing is saved: a proposal becomes an unsaved edit that goes through the same
review and version as any other language change. And it can decline — a request
no trait expresses comes back as a sentence rather than as some unrelated value
nudged to look responsive, which is the failure mode of every assistant that has
to appear useful.

**With no model it keeps the useful half.** The panel still reports every trait,
its range, and which parts it reaches. A studio with no key should lose the
suggestions, not the panel.

Verified against the configured `openai/gpt-5-mini`: asked to make the wheels
and heads bigger, it set `accentSize` to 1.6, named the five parts that declare
it, and applying redrew six cells on the canvas.

---

## Shape of the work

| Phase | Milestones | What becomes true |
| --- | --- | --- |
| Ownership | M1 ✅ | The language is theirs |
| Execution | M2 ✅ | Their philosophy changes the drawing, with or without a model |
| Meaning | M3 ✅, M4 ✅ | The engine knows what things mean and what they are made of |
| Coherence | M5 ✅, M6 ✅ | The set polices itself and the language can grow from it |
| Delivery | M7 ✅, M8 ✅, M9 ⚠ | A set can actually be shipped and used |
| Craft | M10 ✅, M11 ✅ | The drawing gets good |
| Repair | M12 ✅, M13 ✅ | A token reaches every part, and you can see them in both grounds |
| The hand | M14 ✅, M15 ✅, M16 ✅ | How a part is built becomes theirs, not ours |
| The screen | M17 ✅, M18 ✅ | One page where the language is set and seen |

Both phases are built: M1 through M18. The property research landed mid-phase
and revised M12 and M15 while they were being written.

**What is still not true.** The Figma plugin has never run in Figma, no team has
built a real icon set with any of this, and every threshold in the audit is
still supported by synthetic evidence alone. That last one has not moved since
phase one, and it is the largest gap in the whole project.

---

## What I would have cut, and what building it showed

Before starting: M6 first (speculative), M11 next (marginal). Both were built,
and the judgement was half right.

M6 is still speculative. It can propose four rules and it previews what each
would break, but nobody has run it against a set large enough for a tight
cluster to mean anything rather than to mean "we have only made nine icons".

M11 was wrong. "Nearly invisible at 16px" was the author's account of drawing
these corrections by hand; computing them is cheap, and thinning interior
detail changes how a cube or a warehouse reads at any size. The lesson is that
a correction's value and its cost were being estimated together, and they are
not the same number.

---

## What this plan does not address

- **Unit of review.** A new icon should be reviewed among its neighbours
  rather than alone in a row of three. Belongs with M5.
- **Concept taxonomy.** Concepts are flat: no hierarchy, no relations.
- **Team roles and permissions.** Still Git.

## Still open after M11

Carried forward rather than closed, so nothing here is mistaken for finished.

- **The Figma plugin has never run in Figma.** The riskiest path is updating a
  component that already has instances placed in other files.
- **Optical sizes cannot be added or removed in the app.** Editing the ones a
  language has works; the set of them is fixed at creation.
- **No import path from an existing SVG set.** A team with icons today still
  starts from a preset rather than from a measurement of what they have.
- **The icon font is a manifest, not a font.** Codepoints are assigned and
  stable; building the binary is left to a font toolchain.
- **M6 has no evidence behind it.** It needs a real set before its proposals
  can be trusted or its thresholds tuned.
