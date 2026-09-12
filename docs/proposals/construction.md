# Elements as the construction surface

**Proposal, 2026-09-12. Accepted, and built as M12 through M18.**

This document is history now: the argument was accepted, the milestones are in
[PLAN.md](../PLAN.md) with what each one actually cost, and the decisions are in
[DECISIONS.md](../DECISIONS.md). It is kept because the reasoning is what makes
the architecture legible, and because two of its guesses turned out to be wrong
in ways worth remembering.

**Where it was wrong.** The trait list in §5 was derived from reading our own
primitives, and the survey in
[research/icon-properties.md](../research/icon-properties.md) replaced most of
it: corner radius is a rule set rather than a number, `interiorRadius` and
`grade` are attested craft we had not thought of, and `arrowhead` was refused by
our own three-consumer rule. The concept at
[language-page-concept.html](language-page-concept.html) is still worth opening;
the built page follows it closely.

The argument was accepted on review and is now milestones M12 to M18 in
[PLAN.md](../PLAN.md), with the decisions recorded in
[DECISIONS.md](../DECISIONS.md). This document stays in `proposals/` until the
property research lands and the trait list in §5 is replaced, because that list
is the one part of the argument still resting on a guess.

Three of the questions have been answered and are now settled. Construction goes
in the language. The Language and Elements pages merge into one screen.
Exceptions are allowed but never silent. They are recorded in §6, §8 and §9.
§16 collects what is still open.

**There is a working concept to review:
[language-page-concept.html](language-page-concept.html).** Open it in a
browser; no build step, no dependency. The controls really redraw the parts, so
it can answer the only question that matters here, which is whether moving one
control makes the whole set move together. A static mockup could not.

The idea is not mine. It came from a question about what the Elements page is
for, followed by the observation that it might be the most important screen in
the product. I think that is right, and this document argues why, sharpens it
in three places, and says what it would cost.

For what exists today see [SYSTEM.md](../SYSTEM.md). For the architecture this
extends see [COMPILER.md](../COMPILER.md).

---

## 1. The claim

> A set feels like the work of one hand because of how its parts are
> *constructed*, not because of what its tokens are set to.

Stroke width and canvas size are table stakes. Every icon set has them and
getting them right buys you nothing but the absence of an obvious error. What
makes Lucide look like Lucide is how a corner is turned, where a line stops
relative to a junction, whether a container's opening is drawn as a gap or a
line, and how big a handle is relative to the thing it is attached to.

Those decisions currently live in TypeScript literals inside
`packages/icon-primitives`. A team using Icon Foundry cannot reach any of them.

So the proposal is: **the Elements page becomes where a team defines how their
parts are built, and those definitions are shared across every primitive that
uses them.** Not a list of shapes you can look at. The place the hand is set.

---

## 2. The evidence: the tool already fails at this, visibly

This is not hypothetical. Set `cornerRadius` to a high value in the language
today and ask eight primitives to redraw:

| Primitive | Follows the language? | Why |
| --- | --- | --- |
| building | **yes** | `localRadius(ctx, 4)` |
| device | **yes** | `localRadius(ctx, 4)` and `localRadius(ctx, 2)` |
| rounded-rectangle | **yes** | `localRadius` |
| square | no, correctly | It has a rounded sibling. A square is a square. |
| package | no, correctly | An isometric polyline has no corner to round. |
| **vehicle** | **no, wrongly** | Cargo box is `rect(0, 0, 14, 12, 0)`. Hardcoded sharp. |
| **warehouse** | **no, wrongly** | Bay door is `rect(7, 11, 10, 9, 0, false)`. Hardcoded sharp. |
| **warning** | **no, wrongly** | Exclamation bar is `rect(11, 8, 2, 6, 1)`. Hardcoded to 1. |

Three follow. Two decline for good reasons. Three are plain inconsistencies.

A team that asks for a soft, rounded set gets a rounded building standing next
to a sharp-cornered truck. That is the problem this product exists to solve,
reproduced by the product, in the shipped build.

The same pattern appears elsewhere. An opening is drawn as a **line** in the
building's windows and as a **rect** in the warehouse's door, in the same
style, in the same set. The warning's dot is a `circle(…, 1.2)` when filled and
a stroke of length `0.01` when outlined, which are two different diameters. The
M11 dot pass exists partly to paper over that second one.

None of these are bugs in the ordinary sense. Each literal is a reasonable
answer, written once, by us, with no way for anyone else to disagree.

---

## 3. Why the architecture has this hole

The stated thesis is that the language is theirs. Check it layer by layer:

| Layer | Whose? |
| --- | --- |
| Tokens, character, grammar | Theirs. Authored in the app since M1. |
| Concepts and decomposition | Theirs. M3. |
| Icons | Theirs. |
| Preferences and rule weights | Theirs. M2. |
| **Primitives** | **Ours.** |

A team can say *our stroke is 1.5 and our corners are sharp*. They cannot say
*our warehouses have flat roofs* or *our arrows have closed heads*. So what a
team actually gets today is **their tokens applied to our drawings.**

That is a considerably weaker product than "a design language compiler", and it
is the reason a real set has never been built with this. You would get our
warehouse.

Put the other way round: this is not a feature request competing with "go build
a real set." It is the thing standing in front of it.

---

## 4. Sharpening one: "global control" is a shared vocabulary, not a panel of sliders

The obvious reading of a global properties panel is: sliders on the right,
moving one changes all 23 primitives. That works for corner radius, which is
already a token, and is meaningless for almost everything else. A roof-pitch
slider does nothing to a circle. Twenty-three primitives times their own
properties is sixty controls nobody can hold in their head.

The right abstraction is smaller and much more powerful:

> **A construction trait is a named decision that several primitives consume.
> Primitives declare which traits they use. Setting a trait changes every
> primitive that declared it, and nothing else.**

This is the same mechanism the language already uses for the personality axes:
a value at each pole, interpolated, with the consumers declared rather than
guessed. It generalises with no new concepts.

It also makes the panel legible. A trait shows which primitives it affects, and
the canvas filters to exactly those. You are never wondering what a control
does, because the things it changes are the things on screen.

### The filter that keeps it from exploding

Twenty traits is a system. Sixty is a mess. One filter:

> **A trait must be consumed by three or more primitives.**

A decision used by one primitive is a property of that primitive, not a
language decision, and it belongs in that primitive's own panel. This mirrors
the filter already in [PRODUCT.md](../PRODUCT.md): *does it move a decision out
of someone's head and into the system?* The new one is: *is this decision
shared widely enough that answering it once is worth asking?*

---

## 5. A starter set, grounded in the primitives that exist

Six traits, each with its real consumers. These are not invented; every one is
a literal somebody already wrote down.

| Trait | What it decides | Consumers today |
| --- | --- | --- |
| `cornerRadius` | How a corner is turned. **Already a token**; the work is making every primitive honour it. | building, device, rounded-rectangle, vehicle, warehouse, warning |
| `aperture` | How an opening is drawn: a gap, a line, a closed rect, a notch. | building (windows, door), warehouse (bay), document (fold), device (screen), vehicle (window) |
| `inset` | How far interior detail sits from the contour it is inside, as a fraction. | building, device, warehouse, document, vehicle |
| `slope` | The pitch of a sloping or receding plane. Two families exist today: 45° and 26.6°. | warehouse (roof), package (isometric), vehicle (cab), document (fold) |
| `accentSize` | The signature round part, relative to its host. | person (head), vehicle (wheels), location (dot), clock (centre), thermometer (bulb), warning (dot) |
| `arrowhead` | Open V, closed triangle, or chevron, and how deep. | arrow, check, x, and every future directional symbol |

`accentSize` deserves a note: M11's dot pass is a render-time correction for
the *symptom* of not having this. If dot size were a declared construction
trait, the correction would mostly stop being necessary. That is a good sign —
a proposal that makes an earlier patch redundant is usually addressing the
cause.

I would ship four of these first: `cornerRadius` done properly, `aperture`,
`inset`, `accentSize`. `slope` and `arrowhead` are the second wave.

**This list is provisional and should be replaced.** It was derived by reading
our own 23 primitives, which means it describes the decisions *we* happened to
make, not the decisions an icon language is made of. A survey of what published
icon systems actually specify is underway; whatever recurs across many
independent systems is the better starting set, and this table should defer to
it. See §15.

---

## 6. Sharpening two: this belongs in the language, not in `elements/`

**Decided on review: construction goes in the language.** The reasoning below
is what the decision was made on; it stays for the record.

The most consequential question here, and the easiest to get wrong.

**It goes in `language.json`**, as a block beside `grammar` and the size tokens.
Four reasons, in order of weight:

1. **The project's own test says so.** From COMPILER.md: *changing the language
   changes every icon; changing a concept changes one.* Roof pitch changes every
   icon with a roof. That is a language change by definition.
2. **A library can hold more than one language** (decided in M1). If
   construction lived under `elements/`, two languages in one library would be
   forced to share it — which defeats the entire point of having a second
   language, since the second language exists precisely to draw the same
   concepts differently.
3. **It versions and audits for free.** Language versions are already
   snapshotted with a note, the review screen already shows every reference icon
   before and after, and the audit already reports icons drifted from the current
   language version. Construction inherits all of it on day one.
4. **The axes can derive it.** `technical: 70` proposing a crisp `aperture`,
   `geometric: 80` proposing a specific `slope`. That is M2's derivation
   mechanism pointed at a richer set of tokens, and it is exactly what was meant
   by defining "the technical look" here.

**Rejected: nesting it under `grammar`.** Grammar today is either *checked*
(angles) or *consumed by layout* (badge, arrangements). These traits are
consumed by primitive geometry, which is a third mechanism, and COMPILER.md
treats mechanism as load-bearing. A sibling block named `construction` keeps
that line visible.

---

## 7. Sharpening three: primitives stay code and declare parameters

Two ways to give a team control:

- **(a) Primitives stay TypeScript and declare the traits they consume.** A
  team tunes; they cannot redraw.
- **(b) Primitives become data in a declarative construction language.** A team
  can author new ones from the UI.

**Take (a), decisively.**

(b) means designing a second custom format that can express "a warehouse". That
is a language project, not a feature, and this repo already maintains one format
(IconSpec) plus a library format plus a JSON schema. A second one would be the
largest thing in the codebase within a month.

(a) preserves every guarantee that currently holds: determinism, the type system
catching malformed geometry, the filled-versus-cutout logic, the existing
`DECISIONS.md` reasoning for why primitives are code at all.

And (a) delivers the actual goal. The goal is not *let me draw a warehouse from
scratch in a browser*. It is *make every warehouse in my set feel like mine*.
Parameters do that.

**There is already an escape hatch for the rest.** A team that needs a
genuinely different warehouse draws one and imports it as a user-defined element
from SVG path data, which works today. The split is clean: **traits tune the
shapes we ship; path data adds shapes we do not.**

---

## 8. The screen: one page, sorted by what moves the drawing

**Decided on review: the Language page and the Elements page merge.** Three
columns, and the navigation drops to Library, Create, and this.

The instinct behind the merge is right and the reason is worth stating,
because it changes how the contents should be arranged. Today's Language page
holds seven sections, and they divide cleanly into two kinds of thing that want
completely different treatment:

| Kind | Sections | Wants |
| --- | --- | --- |
| **Moves the drawing** | personality axes, size tokens, construction traits, optical corrections, keyline boxes | A canvas next to it, updating as you touch it |
| **Does not move the drawing** | identity, purpose, principles, metaphors, vocabulary words, preference weights, human questions, version history | A form, read occasionally, out of the way |

So the merge is not two pages placed side by side. It is: **everything that
changes the drawing moves next to the canvas, and everything that does not moves
out of the way.** That sorting is what makes three columns work rather than
producing one very long page with a picture stuck to it.

```text
┌─────────────────────┬──────────────────────────────┬──────────────────────┐
│ THE LANGUAGE        │ THE CANVAS                   │ THE CONTROLS         │
│ as words and rules  │ every part, live             │ everything that      │
│                     │                              │ moves the drawing    │
│ Identity            │  ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢            │                      │
│ Purpose             │  ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢            │ Personality axes     │
│ Principles          │  ▢ ▢ ▢ ▢ ▢ ▢ ▢              │   ── propose it all  │
│ Metaphors           │                              │                      │
│ Product vocabulary  │  Your elements               │ Construction traits  │
│                     │  ▢ ▢ ▢  + 2 drafts           │   corner radius      │
│ Preference weights  │                              │   aperture           │
│ Left to a person    │  Filtered to whatever         │   inset              │
│                     │  control you are touching     │   accent size        │
│ Versions            │                              │                      │
│                     │                              │ Size tokens          │
│ collapsible         │                              │ Optical corrections  │
└─────────────────────┴──────────────────────────────┴──────────────────────┘
```

Three things this arrangement buys that neither current page has.

**The axes finally read as the global control they are.** Put them at the top
of the right column and one slider moves radius, caps, joins, budgets, badge
size and every construction trait at once, with the whole canvas responding.
That is what *defining the technical look here* actually means, and today it is
invisible because the axes sit in the middle of a long form with eleven small
reference icons in a side rail.

**The vocabulary stops needing its own page.** Draft elements appear in the
canvas beside the approved ones, carrying their approve and deprecate actions.
That is strictly better than a separate list, because the question being asked
of a draft element is *does this belong with these*, which is the existing
`belongs` human rule, and you cannot answer it without seeing the neighbours.

**The confusion reported about the current app disappears.** Three tabs, one
sentence each. Library is what you have. Create is how you get one more.
Language is the hand that draws them.

### Naming

Keep **Language**. It is the word the entire product is built on, and the
Elements name simply goes away. The vocabulary is not a separate concept from
the language; it is what the language draws with, which is the whole argument
of this document.

### The rules that keep it honest

**The canvas filters to what the control touches.** Touch `aperture` and the
canvas shows the five primitives that consume it. You should never wonder what a
control does, because its consequences are the things on screen.

**Every control must visibly change the drawing.** Written down twice already in
`DECISIONS.md`, learned twice the hard way, and it matters more here than
anywhere, because the whole value of this screen is that the consequence is
visible. A trait that moves a number and nothing else is worse than no trait.

**The left column collapses and remembers.** Identity and principles are written
once and read rarely. They should not cost a third of the screen every day.

## 9. Exceptions: allowed, and never silent

**Decided on review.** I argued for global control with no local escape, on the
grounds that a per-shape exception is how a set drifts. The answer was better:
allow the exception, and require it to be optically justified.

That is the right call, and it is the rule tiers applied to the editor itself.
This project's whole position on rules is that forbidding a thing you cannot
fully judge teaches people to ignore the system, and that the honest move is to
surface rather than refuse. An exception is exactly that case. Sometimes a shape
genuinely needs one, and a tool that refuses gets worked around in worse ways.

So an exception is allowed, and four things make it expensive enough to mean
something:

1. **It is shown against the language value, side by side, at the same size.**
   You are not adjusting a number, you are looking at two drawings and choosing.
2. **It carries a written reason.** What did you see that the language value got
   wrong? An exception without a reason is drift with a nicer name.
3. **It is marked on the part**, wherever the part appears.
4. **It is counted where everyone can see it**, and the set-level audit reports
   it. One exception is a judgement. Nine is a language that needs changing.

The framing the editor should hold, and which the concept states on screen:

> **If a part looks wrong at the language value, that is usually the value
> talking, not the part.**

All four behaviours are built in the concept, so the cost of an exception can be
judged rather than argued about.

---

## 10. The chat panel: after, and then nearly free

This was flagged as an addition that works best once element control exists.
That is exactly right and worth reinforcing, because the reverse order is a
trap: a chat panel over a property system that does not exist has nothing to
talk about, and would have to invent its own vocabulary, which is how you end
up with two models of the same thing.

Once traits are named, typed and bounded, the panel is small. It is the same
tool loop that already exists in `icon-agent`, with three or four tools:
`list_traits`, `set_trait`, `preview`, `explain_trait`. The model never touches
geometry. It moves declared values inside declared ranges, and every change it
makes is visible on the canvas and reversible.

That is also the strongest version of the product's own thesis. AI understands
the request, the language understands the brand, the compiler understands the
geometry. Here, AI is doing nothing but translating *"make it feel more
industrial"* into four trait values a human can see, argue with, and keep.

---

## 11. A model that learns your language

Raised on review: *a model that trains on this icon language, so generated
icons are consistent.*

The goal is right and the mechanism is the wrong one. Two arguments, and the
second is decisive.

**A fine-tuned model gives a tendency. The compiler gives a guarantee.** If the
language says the stroke is 1.25, the compiler cannot emit anything else. A
model trained on your set will usually get close, and "usually" is a strange
thing to accept when the deterministic version is already built and free.

**Training freezes the language into weights; the compiler keeps it as data.**
This is the one that settles it. The entire value of this product is that you
can change a rule and re-render the set. Fine-tune on your current language,
then change your stroke width, and the model is now wrong while the compiler is
still right. You would have bought consistency with the past at the cost of
being able to change your mind, which is the exact trade this product exists to
refuse.

There is also a practical circularity: fine-tuning needs hundreds of examples of
your set, and you do not have a set yet. That is the problem we are trying to
solve.

### What you actually want, in increasing order of value

**Few-shot with your own approved icons.** Put your highest-scoring approved
icons into the agent's prompt as worked examples. No training, updates the
instant you approve one more, costs nothing but tokens. This is most of the
benefit of fine-tuning for none of the cost, and it should be built.

**Weights learned from approvals.** Already noted as unbuilt in
[COMPILER.md](../COMPILER.md) §10. If your team keeps approving icons the
symmetry scorer marks down, symmetry is wrong for your language. Adjust the
weight from the record of what people actually approved. Deterministic, no model
involved, and it is the soft tier learning from review.

**Trait inference from a set you already have.** Point it at your existing SVG
icons and *measure* the construction traits: stroke widths, corner radii, the
angles that recur, how openings are drawn, the proportion of recurring parts.
This is the closest honest thing to "train on our language", it is arithmetic
rather than a model, and it is already on the plan as the missing import path.
For a team that already has icons, this is probably the single highest-value
thing in this entire document, because it turns *declare your language before
you have drawn anything* into *here is what your language already is, confirm
it*.

**Fine-tuning, for exactly one job.** Turning a fuzzy phrase into a concept
decomposition in your domain's vocabulary. That is where a statistical model
earns its keep, because the input is language rather than geometry, and where
being wrong is cheap, because a human approves the decomposition and it then
becomes permanent data that never needs the model again.

### The reframing

> **The trained artifact is the language file, and it already exists.**

Every concept resolved, every element approved, every weight tuned, every trait
set is knowledge accumulating in a folder you own and can read. That is a better
asset than a set of weights: you can diff it, review it in Git, explain it to a
new designer, and hand it to a different model next year.

---

## 12. What it costs, and what it does not

**What it does not cost is the interesting part.** Nothing architectural has to
change:

- IconSpec stores which primitives go where, never geometry, so every existing
  icon re-renders when construction changes. This was designed in from the first
  commit.
- The language review screen already shows before and after.
- The audit already detects drift from a language version.
- The Elements page already renders a blast-radius preview of an element change.
- Derivation from the axes already exists and already scales per optical size.

**A proposal that lands this cleanly on existing machinery is usually the
proposal the architecture was waiting for.** That is the single strongest
argument in this document.

**What it does cost is the primitives, and the UI is the small half.** Roughly:

| Work | Size |
| --- | --- |
| Declare the trait types, parse, serialise, schema, derivation endpoints | Small. Follows the token pattern exactly. |
| Thread traits through `PrimitiveContext` | Small. |
| **Rewrite 23 primitives to consume traits instead of literals** | **Large. This is the milestone.** |
| Canvas + trait panel + per-primitive override | Medium. |
| Chat panel | Small, later, and only after the above. |

---

## 13. Sequencing

The order matters more than usual, because the obvious order is wrong. Building
the panel first produces a panel that controls corner radius and nothing else.

1. **Fix corner radius properly first.** Make all six consumers honour it.
   Small, self-contained, and it repairs a real inconsistency in the shipped
   product regardless of whether the rest of this is ever built. This is worth
   doing even if the proposal is rejected.
2. **Add `aperture`, `inset`, `accentSize`** across their consumers. No UI yet;
   drive them from the language file and a test.
3. **Build the canvas and the trait panel.** By now there is something to
   control.
4. **Per-primitive overrides**, using the existing override display.
5. **Then go build a real icon set with it.** This is the test the whole product
   is waiting for, and step 5 is the first point at which it is a fair test.
6. **Chat panel**, last.

---

## 14. Risks, honestly

**The trait set grows without limit.** Contained by the three-consumer rule, and
by refusing to add a trait until a second primitive asks for it.

**Traits fight each other.** `inset` and `accentSize` both affect how crowded an
interior looks, and the M11 interior-thinning pass touches the same thing again.
Three controls for one visual outcome is a worse experience than one. Needs
watching; may need merging later.

**It splits one file across two screens.** Real, and only mitigated by a very
clear framing. If the framing cannot be written in one line, the two screens
should merge instead.

**It could be gold-plating.** The mechanism is elegant, and elegant mechanisms
attract more work than they deserve. The guard is step 5: go build a real set
before extending the trait vocabulary any further.

**Some primitives will resist parameterisation.** The snowflake's six arms and
the package's isometric projection are close to being what those shapes *are*.
Expect a few primitives to declare no traits at all, and treat that as correct
rather than as a gap to fill.

---

## 15. What I would cut

The chat panel, first, without hesitation — not because it is bad but because
its value is entirely dependent on everything above it, and it will be cheap
whenever it happens.

`slope` second. It is the trait most likely to produce a broken drawing from a
plausible value, since a roof at the wrong pitch stops reading as a roof.

I would not cut step 1 under any circumstance. Corner radius reaching three of
eight primitives is a defect in the current build, independent of this proposal.

---

## 16. Still open

Answered on review and now settled:

| Question | Answer |
| --- | --- |
| Where does construction live? | **The language.** §6. |
| Do Language and Elements merge? | **Yes, one page, three columns.** §8. |
| Should per-primitive overrides exist in v1? | **Yes, as exceptions that must be optically justified.** §9. |

Still open, in the order they need deciding:

1. **Which properties actually define an iconographic language?** Being
   researched separately, across the published construction rules of Material
   Symbols, SF Symbols, Carbon, Lucide, Phosphor, Fluent and others. The test
   applied to the result is recurrence: a property that many independent systems
   specify is part of the craft, while a property only one system specifies is
   that team's taste. The trait set in §5 is a first guess from our own
   primitives and should be replaced by whatever that finds.
2. **Is the starter set the right four?** Deferred until the research lands, for
   the same reason.
3. **Sequencing.** Deferred by request until the property question is settled.
   §13 holds the current proposal and should be re-read after, not before.

One item needs no decision. Corner radius reaching three of eight primitives is
a defect in the current build, independent of everything above, and fixing it is
useful under any answer to any question here.

---

## Addendum: the control panel, v2

**2026-09-12, after the build. For review.** Concept at
[language-panel-concept.html](language-panel-concept.html).

The right column shipped as a document pretending to be a control surface. Six
traits, each carrying a label, a field, a provenance badge, two lines of prose,
a consumer list and an axis breakdown — about sixty rows to hold six decisions,
in a column narrow enough that the derivation table overflowed it.

### What the panel has that Figma's does not

Worth being precise, because the fix is not "make it look like Figma".

Figma's properties panel edits **your selection**. You always know what you are
changing because you clicked it. This panel edits **everything that declared a
trait**, which is the entire feature and also the thing most likely to surprise
somebody. So two pieces of information have to survive any diet:

- **Scope.** How many parts does this row move, and which.
- **Provenance.** Did the axes propose this value, or did you type it?

What does not have to survive is **justification** — why a trait exists and what
it means. That is reference material, and it was sitting in a control surface.

> **The rule: scope and provenance become glyphs, justification moves to hover,
> and the prose comes back only when asked for.**

### What the concept takes from Figma

| Idiom | Why it fits here |
| --- | --- |
| **Scrubbable labels** | Matters more here than in Figma. Choosing a construction value is not "set it to 1.2", it is sweeping until the set feels right, and a number field makes you guess one value at a time. |
| **Icon segmented controls** | The glyph is the definition. Three small drawings beat the words "line, outline, notch". |
| **A binding dot** | Hollow means the axes proposed it, filled means you typed it, clicking it goes back. This is Figma's variable-binding indicator and its detach, and it maps exactly onto *absent means derived, present means override*. |
| **Collapsible sections with counts** | Four sections instead of one scroll. |
| **Fixed-height dense rows** | Fourteen rows instead of sixty. The whole panel fits on screen without scrolling. |
| **A real "Mixed" value** | We already have the concept literally. |

### Three decisions the concept makes that are worth arguing about

**Mixed is a state, not an option.** The first pass showed `mixed` as a fourth
button beside line, outline and notch. That is wrong, and wrong in a way that
undoes the framing: it says mixed is a style you can choose, when the whole
point is that it is a decision nobody has made. So the segments show only the
real options, none is lit when the value is mixed, a chip says so, and clicking
the lit option again un-decides it.

**The scope badge teaches the three-consumer rule.** A trait read by fewer than
three parts gets an amber badge and a tooltip saying it is a property of those
parts rather than a decision about the language. The rule is already enforced by
a test; this makes it visible while somebody is designing rather than at the
moment their commit fails.

**Tokens say `all` rather than a count.** Stroke width reaches every part, and
printing a dash there implied it reached none.

### What still needs deciding

1. **Is `Learn` the right affordance for the prose?** It currently expands every
   description at once. A per-row tooltip might be better for someone who knows
   five of six traits and has forgotten one.
2. **Does the panel need the derivation table at all?** Hovering an axis now
   lights the rows it proposes, which may be enough. The full table with
   editable endpoints could move behind its own disclosure.
3. **Two fields per row?** Figma pairs X/Y and W/H. The size tokens have natural
   pairs, and it would save four more rows, at some cost in scannability.
