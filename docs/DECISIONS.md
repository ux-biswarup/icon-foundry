# Decisions

Why the code is shaped the way it is. Append-only: a record, not a status page.
Entries stay even when superseded, with a note saying what replaced them.

For the target architecture see [COMPILER.md](COMPILER.md). For what exists
today, including current limitations, see [SYSTEM.md](SYSTEM.md).

---


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

### A language is data the team writes, not a constant we ship

The engine has always *read* character, grammar and tokens and acted on all
three. Until M1 it could not write them, so a team got our language with their
concepts. A library now owns its language files outright:

```text
languages/<id>/language.json            what the team authored
languages/<id>/exemplars/<name>.json    reference icons, rendered while editing
languages/<id>/versions/<v>.json        published snapshots
```

A built-in language is a **preset that gets copied in**, never a reference, so
a library folder is self-contained the moment it exists.

Two consequences fell out of building it:

- **`serializeIconLanguage` had to exist.** A parsed language keys its sizes by
  canvas and carries fully defaulted keyline boxes; the file format uses an
  array of sizes and omits anything derivable. Without a serialiser a language
  could be read but never written. `parseIconLanguage(serialize(x))` equals
  `x`, and writes go through serialise-then-parse so what is stored is provably
  what will be read back.
- **The editor holds the authored shape, not the parsed one.** The studio's
  state is `IconLanguageInput`, exactly what the folder will hold, and it
  re-parses on every keystroke to derive keyline boxes and catch invalid
  intermediate states. Resolved values are read back off the parsed language,
  so an inherited token shows as a real number rather than a blank.

### A library can hold several languages

Not an exotic case: it is what a language version migration looks like. The
manifest lists `languages` and names one as the default, every `IconSpec`
already carries the language it was authored in, and `languageFor(spec)`
resolves per icon. Format 1 folders open unchanged and are rewritten as format
2 on the first write, materialising the language file and dropping the old
single-language path.

### The library is a folder the team owns

`@icon-foundry/icon-library` defines a plain-JSON folder format with a
`format` version in its manifest. The model writes through to a `FileStore`
on every mutation, so the folder is always the truth and Git is the review
and history layer. The web app implements the store over the File System
Access API and, for trying things out, over IndexedDB. The agent server
receives a snapshot of the folder with each request and holds no state.

### The agent is a tool loop over the core

*Superseded in part: there are ten tools now, the three concept tools first.
See "A brief resolves to a concept before it reaches a model".*

`createIcon` gives a model seven tools (search the library, list elements,
read the language, deterministic layout, draft an icon, propose an element,
leave a note). The model only chooses calls; we execute them, validate every
draft, and reject candidates with errors. Without a model the planner
arranges existing vocabulary into up to three variants. Providers are behind
the `AgentModel` contract; the AI SDK adapter is the only place vendor
packages are imported.

---

*Appended 2026-09-12, from building M2 through M11.*

### A rule declares its authority, not just its severity

A rule carries a tier: `hard` enforces, `soft` scores 0 to 1 with a sentence,
`human` states a question and never answers it. A warning is a boolean being
polite, and forcing every principle into the first tier is what makes rule
systems get ignored: a rule that fires on icons that are fine teaches people to
ignore every rule, which costs more than the rule was worth.

Which soft preferences matter is taste, and taste is the team's, so each scorer
is weighted by `language.preferences` and a weight of zero turns it off. The
scorers themselves stay ours; the weights are theirs.

### Philosophy reaches an icon as a number or it does not reach it at all

The four personality axes are the only part of a language's character that is
already a number, so they are the bridge from prose to geometry. They derive
corner radius, stroke caps and joins, both detail budgets and badge size.

**Derivation is interpolation between authored endpoints, not a formula.** Each
axis declares the token values at its two poles and the position interpolates
between them, the way a variable font interpolates a weight axis. A formula
would be our taste wearing the team's clothes; the endpoints are editable, so a
team can say what "minimal" means for their set.

**Absent means derived, present means override.** A derivable token omitted
from the file is computed; a token written down wins. So "unlock and override"
is literally "write the value down", and the overrides are tracked per field —
writing them as one block made a field that *did* derive read as overridden.

### A concept carries its decomposition, and priority is how philosophy prunes

A concept is not a name with aliases. It holds what the thing is made of and
how the parts relate, which is true independent of any visual language: a
server is a stack of units whether your set is technical or playful. Each part
names an element, a count and a priority.

Essential parts are always kept, even past the budget, because an icon missing
its subject is worse than an icon that is slightly too busy — and the hard
complexity rule will say so. Optional parts are added while the budget can
afford them, so one concept draws differently at 16px and 24px without anyone
drawing either.

Concepts live in the library, not the language, because a domain noun and a
visual rule have different owners and version at different rates. Icons point
at concepts and never the reverse: a one-way arrow needs no syncing and cannot
drift.

### A brief resolves to a concept before it reaches a model

`resolve_concept` is the agent's first tool, and a brief that resolves to a
concept already drawn in this language returns that icon instead of drafting a
second one. Publishing a rival icon for a concept already published is refused
by name.

The property this buys: the system needs the model less every month, because
each resolution, done once and approved, never needs doing again.

### Element boxes are centrelines, so the compiler owns the conversion

The visible gap between two stroked units is the box gap minus half a stroke at
each side. A stack spaced by the raw minimum gap draws two strokes too close.
The compiler adds the stroke itself rather than expecting every caller laying
out a stack to remember it.

Series layout rounds the gap up to a whole grid step and the unit size down,
then splits the remainder as a lead-in, so a stack stays on the grid and inside
its keyline instead of drifting off both.

### A finding never blocks, and a promoted rule never lands unseen

`auditLibrary` reports six things about a set and none of them can stop a
publish. `proposeRules` can offer four rules, and every proposal carries the
icons that would start failing the moment it is accepted. A rule promoted
silently turns a team's own set into a list of violations overnight.

The outlier detector needs eight scored icons and a three-times spread, raised
after it fired on a set of five. Calling something an outlier out of four
samples is noise dressed as a finding, and a tool that cries wolf on a new
library is a tool nobody turns on twice.

### A hole only exists relative to the shape it is cut from

Filled geometry of one colour is emitted as a single path with
`fill-rule="evenodd"`. Rendering a cutout as its own element would paint it on
top in the same colour, which is indistinguishable from having no hole. A
`LineShape` is typed so `cutout` can only ever be `false`, because a line
encloses nothing.

### Optical corrections run at render, never at validation

The three passes — junction notch, interior thinning, dot sizing — are declared
per optical size and are all off until a team asks for one. A correction
changes every icon already published, so opting in has to be a decision
somebody made.

They run on composed geometry at render time and the validator never sees them.
The validator judges what the compiler laid out: if it saw the corrected
drawing, a notch would read as a negative-space failure and an audit comparing
two icons would compare the retouching rather than the geometry. Every pass
reports what it changed, so a pass that ruins an icon is visible rather than
mysterious.

**Interior thinning stays blunt on purpose.** It treats everything inside a
contour of the same element as secondary, which is right for clock hands and
the interior lines of a cube, and arguable for the exclamation mark in a
warning. Nothing structural in the spec separates the two cases, so the honest
answer is to state the limit, default it off, and let the team set the number.
That is the soft tier working as designed rather than a gap in it.

### The reference set must exercise every token the language can change

Learned twice. First no reference icon used a corner radius, so moving that
slider changed a number and nothing on screen. Then none carried a dot, so the
dot size token had nothing to move. Both times the control was correct and the
feature looked broken, which is the same thing as being broken.

### The Figma plugin is a render target, not an author

It connects to a library, syncs what that library published, and tells you what
a component is. Authoring lives in the studio, because two ways to make an icon
that share no data is how a set ends up with two of everything. It depends on
none of the engine packages — it receives a rendered payload rather than
building one.

**A component is found by its recorded name, never by position or label, and it
is updated in place.** Replacing the node would detach every instance of it in
every file, which is the one mistake here that a designer could not undo.

### Only published icons are exported, and a codepoint is never reused

A draft is not a release. Codepoints are assigned from U+E000 upward and never
move, so adding an icon later cannot renumber one that already shipped — which
is what makes replacing a font version safe. The ZIP is written by a
dependency-free archiver, so shipping a set never turns into a supply-chain
question.

---

*Appended 2026-09-12, accepting [proposals/construction.md](proposals/construction.md).*

### How a part is built belongs to the team, and lives in the language

Every construction decision was a literal in our TypeScript: the pitch of a
warehouse roof, whether an opening is drawn as a line or a closed shape, how big
a wheel is relative to a truck. A team could set their stroke and their corners
and still get our drawings.

That is the layer where a set actually feels like one hand, so it becomes a
`construction` block in the language rather than anything owned by the elements
folder. Four reasons, and the first is the project's own test:

1. Changing the language changes every icon; changing a concept changes one. Roof
   pitch changes every icon with a roof.
2. A library may hold more than one language, and the second language exists
   precisely to draw the same concepts differently. Construction under
   `elements/` would force them to share it.
3. Versioning, the before-and-after review screen and the drift audit all work on
   it for free.
4. The personality axes can derive it, which is what "define the technical look
   here" means in practice.

### A construction trait is shared, or it is not a trait

> A trait is a named decision that several primitives consume. Primitives declare
> which traits they use. Setting a trait changes every primitive that declared
> it, and nothing else.

The rejected alternative was a panel of sliders over every primitive, which is
sixty controls and a roof-pitch slider that does nothing to a circle.

**A trait must have three or more consumers.** A decision used by one primitive
is a property of that primitive. Without the rule the vocabulary grows until
nobody can hold it, and the filter mirrors the one in PRODUCT.md: is this
decision shared widely enough that answering it once is worth asking?

### Primitives stay code and declare parameters

Two ways to hand over control: primitives keep their logic and expose the traits
they consume, or primitives become data in a declarative construction language.

The second means designing a format that can express "a warehouse", which is a
language project rather than a feature, and this repo already maintains IconSpec,
a library format and a published schema. The first preserves determinism, the
type system catching malformed geometry, and the filled-versus-cutout logic.

It also delivers the actual goal, which is not *let me draw a warehouse from
scratch* but *make every warehouse in my set feel like mine*. The escape hatch
for the rest already exists: a genuinely different shape is drawn elsewhere and
imported as a user-defined element. **Traits tune the shapes we ship; path data
adds shapes we do not.**

### An exception is allowed, and never silent

The first proposal was global control with no local escape, on the grounds that
a per-shape exception is how a set drifts. That was wrong in the same way a
rule system that forbids everything is wrong: it gets worked around.

An exception is allowed and made expensive enough to mean something. It is shown
against the language value side by side at the same size, it carries a written
reason, it is marked on the part wherever the part appears, and the audit counts
it. One exception is a judgement. Nine is a language that needs changing.

> If a part looks wrong at the language value, that is usually the value talking,
> not the part.

### The Language and Elements pages merge, sorted by what moves the drawing

Not two pages side by side. The old Language page held two kinds of thing:
sections that change the drawing (axes, tokens, construction, optical
corrections) and sections that never touch it (identity, purpose, principles,
metaphors, preference weights, versions). They want opposite treatment.

So: everything that changes the drawing sits next to a live canvas of every
part, and everything else collapses out of the way. The Elements page is retired
into the canvas, because the vocabulary is not a separate concept from the
language — it is what the language draws with.

The navigation becomes three tabs. Library is what you have, Create is how you
get one more, Language is the hand that draws them.

### Theme is a view preference, and an icon is judged in both grounds

The app followed `prefers-color-scheme` with no control, so a person on a dark
machine had never seen the light theme. Theme becomes an explicit choice of
light, dark, or follow the system, persisted locally, and **it never reaches the
language file** because it says nothing about the icons.

Separately, and more important: every part is shown on both grounds at once
rather than in whichever theme is active. The same stroke reads heavier as a
light shape on a dark ground than inverted, so a weight chosen on white alone is
wrong at night. Judging an icon in one mode is judging half of it.

### The trained artifact is the language file, not a set of weights

Asked for: a model trained on the icon language so generated icons are
consistent. Declined, for one decisive reason.

**Training freezes the language into weights; the compiler keeps it as data.**
Fine-tune on today's language, change the stroke width tomorrow, and the model is
wrong while the compiler is still right. That trades the ability to change your
mind for consistency with the past, which is the exact trade this product exists
to refuse. A fine-tune also needs hundreds of examples of a set that does not
exist yet.

What is worth building instead, in increasing order of value: few-shot prompting
with the team's own approved icons; scorer weights learned from what people
actually approved; and measuring construction traits from a set a team already
has, which turns "declare your language before you have drawn anything" into
"here is what your language already is, confirm it". Fine-tuning earns its keep
for exactly one job — turning a fuzzy phrase into a concept decomposition —
where the input is language rather than geometry and a human approves the result
before it becomes permanent data.

---

*Appended 2026-09-12, from building M12 through M18.*

### A primitive declares what it reads, and the declaration is tested both ways

Every primitive names the language values its geometry consumes. A test asserts
that naming one means its drawing changes when that value moves, and that *not*
naming one means its drawing does not.

The defect this catches has no symptom in any single icon. Corner radius reached
three of eight primitives in the shipped build, so a team asking for a soft
rounded set got a rounded building standing next to a sharp truck. Looking at
either one tells you nothing; only the set shows it, and by then nobody
remembers which change caused it. The test has since caught the same class of
thing three more times, each within minutes of it becoming true.

### Corner radius is a rule set, not a number

From the survey of published icon systems, and the cleanest recurrence in it:
two independent vendors state the same structure with different values.

1. **Exterior corners take the radius; interior corners are square.**
2. **Nothing narrower than one stroke rounds at all** — a shape that thin is a
   stroke, and strokes have ends rather than corners.
3. The radius is capped by the shape it is rounding.

Material later made rule 1 a property of its outlined style rather than a law,
shipping a Rounded family that rounds both. That is the proof it belongs to a
team rather than to us, so it is the `interiorRadius` trait: 0 is square and is
the default, 1 follows the silhouette.

### Theme is a view preference; an icon is judged on both grounds

The app followed `prefers-color-scheme` with no control, which is two themes and
a default rather than three states — somebody on a dark machine had never seen
the light one. Theme is now an explicit choice, applied before first paint, and
**it never reaches the language file** because it says nothing about the icons.

Separately: every part is shown on a light and a dark ground *at once*, not in
whichever theme is active. A light shape on a dark ground reads heavier than the
same shape inverted, an effect established well enough that Material Symbols
ships a variable axis for it. A weight chosen on white is wrong at night, so
judging an icon in one mode is judging half of it. That axis is our `grade`
trait, applied at render and only when the ground is dark.

### Every construction default is the identity

Square interiors, no grade, multipliers of one, and `mixed` for the two enums.
Verified by exhaustion: all 23 primitives in both styles render byte-identical
to before the layer existed.

Deriving the traits from the personality axes out of the box would have been
more impressive and would have redrawn every icon in every library the moment
someone upgraded. A team that wants an axis to move a trait writes the endpoints
down; we do not guess.

**`mixed` is not a style, it is an unmade decision.** Our own vocabulary answers
the aperture question three ways in one set — a building's windows are lines, a
warehouse's bay door is a closed rectangle, a monitor's screen is nothing until
filled — and the slope question two ways. Defaulting to any single answer would
silently redraw the others. Defaulting to `mixed` preserves every drawing *and*
leaves the inconsistency visible, which is this product's thesis turned on
itself: a decision nobody made is still a decision.

### A trait needs three consumers, or it is not a trait

Enforced by a test. A decision used by fewer than three primitives is a property
of those primitives and belongs in their code, not in a panel everyone has to
read. Without the rule the vocabulary grows to sixty controls and a panel that
large is no more usable than no panel.

The rule immediately refused `arrowhead`, which had two consumers and which we
had planned to ship. It can come back when a third directional symbol arrives.

### An exception must be reasoned before it exists

The parser refuses an exception with an empty reason, and the editor therefore
has to ask for the reason before it will apply one. The first build wrote the
exception the moment a value moved, which put an invalid language into the draft
and collapsed the editor mid-edit.

The enforced order turned out to be the better interaction as well: you say what
you saw before you get to change anything.

### The two editors merge, sorted by what moves the drawing

The old Language page held two kinds of thing. Sections that change the drawing —
axes, tokens, construction, optical corrections — and sections that never touch
it: identity, purpose, principles, metaphors, preference weights, versions. They
want opposite treatment, so the first go next to a live canvas of every part and
the second collapse out of the way.

The Elements page is retired into that canvas, and `#/elements` redirects rather
than 404ing. The vocabulary was never a separate concept from the language; it
is what the language draws with. The question asked of a draft element is
whether it *belongs among these*, which is the `belongs` rule the validator
refuses to answer — and a separate page guaranteed its neighbours were never on
screen.

The columns scroll independently, because one page scroll means reaching a
control scrolls the canvas out of view, which defeats the entire layout.

### The trait panel is a model's whole job here

Four tools — list, set, explain, decline — over values that are already named,
typed and bounded. A test asserts the model is offered those four and nothing
else, so no later edit can quietly hand it something that draws geometry.

Three properties make it safe. Every value is held to the range its trait
declares rather than trusted. Nothing is saved: a proposal becomes an unsaved
edit that goes through the same review and version as any other language change.
And it can decline — a request no trait expresses comes back as a sentence
rather than as an unrelated value nudged to look responsive, which is the
failure mode of every assistant that has to appear useful.

**Built last, on purpose, and cheap because of it.** A chat panel over a
property system that does not exist has nothing to talk about and has to invent
its own vocabulary, which is how a project ends up with two models of one thing.

