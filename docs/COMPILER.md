# The design language compiler

The target architecture, and the method for deciding what a rule can actually
enforce. Written 2026-09-12 from a working session.

For why the product exists see [PRODUCT.md](PRODUCT.md). For what is built
today see [SYSTEM.md](SYSTEM.md). Where this document and the current build
differ, it says so.

**Updated 2026-09-12, twice.** Everything this document described as missing has
since been built: the concept registry with decomposition, the soft and human
tiers, arrangements as grammar, the optical passes, and back ends past SVG.

A second phase then added the layer this document did not think to ask for.
Every construction decision — how a corner is turned, how an opening is drawn,
how steep a plane is — was a literal in our TypeScript, so a team got *their
tokens applied to our drawings*. That is a much weaker claim than "a compiler
for a visual language", and it is now a `construction` block in the language
that the primitives themselves read. The argument is left as written, with the status
lines corrected, because the reasoning is what makes the architecture legible
and rewriting it into the past tense would lose that.

---

## 1. Three owners, one boundary each

```text
  AI            understands the request
  Icon Language understands the brand
  Compiler      understands the geometry
```

The whole design follows from refusing to let any of them do another's job.

**AI owns meaning, never appearance.** Asked for "a database icon", it must not
decide what a database looks like in your set. It resolves words to a concept
and stops.

**The Icon Language owns appearance, never meaning.** It has no opinion on what
a database is. It decides which angles, which stroke, which radius, how much
detail survives, how much negative space, how the thing behaves at 16px.

**The compiler owns geometry, never either.** It takes a structure and a set of
rules and produces the only drawing consistent with both.

The test for whether the boundary holds: **change the language and every icon
changes; change a concept and only that icon changes.**

---

## 2. The pipeline, traced

"Create a server icon", against a language whose identity is technical,
precise and restrained.

```text
  "create a server icon"
        │  ── resolve ──────────────────────────────────────────
        │     Concept Registry: alias "server" → concept `server`
        │     AI is needed here only if the phrase is unknown.
        ▼
  CONCEPT  server
        │     composition: stack of rectangular units,
        │                  indicator dots (optional)
        │  ── select ───────────────────────────────────────────
        │     Each part resolves to an element in the vocabulary.
        ▼
  PARTS    rounded-rectangle ×3, dot ×3
        │  ── prune ────────────────────────────────────────────
        │     The detail budget for this optical size decides how
        │     many optional parts survive. 16px keeps 2 units and
        │     drops the dots; 24px keeps all three and one dot row.
        ▼
  STRUCTURE
        │  ── arrange ──────────────────────────────────────────
        │     Grammar says how a "stack" is drawn: even spacing,
        │     minimum gap from the tokens, fitted to the vertical
        │     keyline box for this optical size.
        ▼
  ICONSPEC                       ← the IR. Still no geometry.
        │  ── compose ──────────────────────────────────────────
        │     Uniform scale into each box, style and stroke
        │     inheritance, rotation, optical offsets.
        ▼
  GEOMETRY in canvas units
        │  ── optical passes ───────────────────────────────  ✓ built, off by default
        │     Junction notches, interior thinning, dot sizing.
        │  ── construction traits ──────────────────────────  ✓ built, read by the primitives
        │     Interior corners, apertures, insets, accents, slopes.
        ▼
  ── back ends ──  SVG ✓  Figma ✓  sprite ✓  React ✓  module ✓  CSS ✓  font ~manifest only

  DIAGNOSTICS, alongside every stage:
      hard   errors, block               ✓ built, 13 rules
      soft   scores, rank, never block   ✓ built, 5 scorers, weighted per language
      human  surfaced with context       ✓ built, 3 questions, never answered
```

Notice what the language did and did not touch. It never chose "stacked
rectangular units" — that is what a server *is*. It chose how many survived, at
what angles, with what radius, at what weight, with what gaps.

The repo has called itself an icon compiler since the first commit but used
only half the analogy. A compiler is not a machine that accepts or rejects. It
has a front end, an IR, passes, several back ends, and **diagnostics at more
than one severity**. Two of those were missing when this was written, and the
second mattered most. Both are built now.

**The Icon Language is this compiler's type system.** Hard constraints are the
types: geometry that violates one is not a valid program. That is why the sizes
section feels solid and the philosophy section feels decorative — one is typed
and the other is a comment.

---

## 3. The concept registry holds the decomposition

The keystone. Built as described below; `composeConcept` is the compiler.

A concept is not a name with aliases. It carries **what the thing is made of
and how the parts relate**, independent of any visual language:

```json
{
  "id": "server",
  "name": "Server",
  "aliases": ["host", "machine", "node", "instance", "backend"],
  "description": "A machine that serves requests",
  "composition": {
    "arrangement": "stack",
    "parts": [
      { "element": "rounded-rectangle", "role": "unit", "count": 3, "priority": "essential" },
      { "element": "dot", "role": "indicator", "count": 3, "priority": "optional" }
    ]
  }
}
```

Three properties follow.

**It makes the model genuinely optional.** The first time anyone asks for a
server, a human or a model proposes the decomposition and a human approves it.
Every time after that, "server", "host" and "backend" resolve with no model at
all. The registry is where learning accumulates, as the team's data in the
team's repository.

**One concept, many languages.** "Server is stacked units" is true whether your
set is technical or playful. Both render it; they differ in radius, weight and
how many units survive. This is why concepts belong to the library, not the
language.

**It replaces the keyword parser rather than sitting beside it.**
`intentToSpec` keyword-matched a subject and modifiers, then applied one
hardcoded arrangement: that was this idea with a vocabulary nobody could edit
and an arrangement nobody could choose. `composeConcept` took over. The keyword
parser is still there as the fallback when no concept resolves and no model is
configured.

### Arrangements are grammar, not concept

The concept says *stack*. The grammar says what a stack looks like in this set,
the same way it already says where a badge goes and how big it is.

| Layer | Owns | Example |
| --- | --- | --- |
| Concept | Which parts, and how they relate | server = stack of units, dots optional |
| Grammar | How that relation is drawn | stacks evenly spaced, top-aligned; badges top-right at 35% |
| Tokens | How big, how heavy, how much | 1.25 stroke, 1.5 radius, 1.5 gap, 3 parts max |

`grammar.badge` already works exactly this way. Arrangements generalise it.

---

## 4. Priority is how philosophy prunes

"Reduce concepts to essential recognizable geometry" cannot be executed as a
sentence. It becomes executable the moment parts carry a priority and sizes
carry a budget.

```text
  server: 3 units (essential) + 3 dots (optional)

  24px, budget 4 parts  →  3 units + 1 dot row
  16px, budget 3 parts  →  2 units, no dots
```

Same concept, same language, two drawings, and nobody wrote either. That is the
compiler doing what the philosophy asked.

---

## 5. Every rule has an authority and a mechanism

Two independent questions. Authority is *how much the rule decides*. Mechanism
is *how it reaches the icon*. Confusing them is how rule systems go wrong.

### Authority: not everything should be a boolean

| Tier | The machine's job | Examples |
| --- | --- | --- |
| **Hard** | Enforce. Prevent it, or detect and refuse it. | stroke 1.25, angles on 45°, minimum gap, canvas, allowed colours |
| **Soft** | Score. Measure, rank, never refuse. | prefer symmetry, simple silhouette, natural proportions, restrained detail |
| **Human** | Surface with enough context to decide. | Does this feel like our brand? Does it communicate the concept? Does this correction look right? |

Forcing every principle into the first tier is what makes rule systems hated. A
rule that fires on icons that are fine teaches people to ignore every rule,
which costs more than the rule was worth.

**All three tiers exist now.** When this was written only the first did, and a
warning is a boolean being polite. A scored rule returns a number from 0 to 1
with a sentence, weighted by `language.preferences`, where a weight of zero
turns it off — because which preferences matter is taste, and taste is the
team's. A human rule states its question and refuses to answer it.

### Mechanism: how the value reaches the drawing

| Mechanism | What it is | Guarantee |
| --- | --- | --- |
| **Math** | The value enters a calculation that produces geometry. | Total. The violation cannot be expressed. |
| **Check** | The value is compared against finished geometry. | High. Nothing prevented, nothing missed. |
| **Score** | The value is measured as a gradient, 0 to 1. | None, by design. It ranks. |
| **Words** | The value goes into the drafting model's prompt. | None. Influence. |
| **Nothing** | Stored and displayed. | None, and it looks like something. |

```text
                Math        Check       Score       Words
  Hard           ✓✓          ✓           —           —
  Soft           —           —           ✓✓          ✓
  Human          —           —           —           ✓     + a review surface
```

**Math beats Check for hard constraints.** A violation that cannot be expressed
never has to be reported: the composer only ever applies a uniform scale, so a
squashed pencil is not representable, and "keep natural proportions" needs no
rule at all.

**Score is the only honest mechanism for a soft preference.** It is now a
column we have.

---

## 6. Where every field lands

Corrected 2026-09-12. The rows that used to read "Words only" are the ones the
soft tier picked up.

### Identity

| Field | Tier | Mechanism |
| --- | --- | --- |
| Name | — | Nothing. Labels in the UI. |
| Description | Human | Words. Second line of the prompt. |

### Philosophy

| Field | Tier | Mechanism |
| --- | --- | --- |
| Purpose | Human | Words. Opening line of the prompt. |
| Principles | mixed | Words. One bullet each, verbatim. |
| Metaphors refused | Hard | **Check.** A keyword check against the elements an icon uses. No model required. |
| Metaphors used | Soft | Words. Offered to the agent as the vocabulary to reach for. |
| Product vocabulary | — | Words. |
| **Personality axes** | Hard | **Math.** Interpolated between authored endpoints into corner radius, caps, joins, badge size, both budgets and all six construction traits; overridable per field. |
| **Preferences** | Soft | **Math.** A weight per scorer; zero turns one off. |

### Construction

| Field | Tier | Mechanism |
| --- | --- | --- |
| Line angles | Hard | Check. Measures every straight segment after composition. |
| Badge corner | Hard | **Math.** The badge layout computes the box from it. |
| Badge size | Hard | **Math.** The badge layout computes the box from it, and the axes propose it. |
| Allowed arrangements | Hard | **Check.** A concept asking for one this set does not allow is refused with the list. |
| Arrangement spacing | Hard | **Math.** Drives the series layout; zero means "use the minimum gap". |
| Diagonal direction | Human | Words, and labelled as guidance. No rule can tell which diagonal is the one that matters. |
| Closed shapes | Soft | **Score.** The `silhouette` scorer weighs closed ink against open ink. |
| Silhouette required | Soft | **Score.** Same scorer. |

### Sizes

Almost entirely Math and Check, which is exactly why they work.

| Field | Tier | Mechanism |
| --- | --- | --- |
| Canvas | Hard | Math + Check. The `viewBox`; the `canvas` rule. |
| Stroke width / cap / join | Hard | Math + Check. Root attributes and the primitive context; three rules. |
| Corner radius | Hard | **Math.** Converted to local units inside each primitive so it stays exact after scaling. |
| Safe area | Hard | Math + Check. Derives the keyline boxes; the `safeArea` rule. |
| Layout grid | Hard | Math + Check. Recipes snap to it; the `grid` rule. |
| Smallest gap | Hard | Math + Check. Recipes shrink the subject until it passes. |
| Keyline boxes | Hard | **Math.** The subject is fitted into the box for its keyline shape. |
| Budgets | Hard + Soft | **Math, Check and Score.** Priority prunes optional parts to the budget; `complexity` still refuses the impossible; `restraint` scores how much of the budget was used, because detail is a gradient as well as a cliff. |
| Optical corrections | — | **Math, at render.** Off unless the language asks. Deliberately outside validation, so a correction can never read as a failure. |
| **Construction traits** | Hard | **Math.** Read by the primitives themselves, so a trait cannot be violated — only set. Each declares its consumers, and both directions are tested. |
| **Grade** | — | **Math, at render, on dark grounds only.** The one correction whose trigger is the background rather than the geometry. |
| **Exceptions** | Human | **Words plus Math.** The value is arithmetic; the reason is a sentence nobody can skip, and the audit counts how many there are. |

**So the sizes are mathematics, and that is why they hold.** Philosophy is no
longer only Words: the axes are Math, the refused metaphors are a Check, and
the preferences are the weights on five Scores. Purpose and principles are
still Words, and for most of them that is the right answer.

---

## 7. The axes drive the tokens

Philosophy reaches an icon as a number or it does not reach it at all. The four
personality axes are the only part of a language's character that is already a
number, so they are the bridge:

```text
  Philosophy (words)
        ↓        expressive ↔ minimal, abstract ↔ literal
  Personality axes (numbers)
        ↓        derivation
  Corner radius, badge size, part and shape budgets, caps and joins
        ↓        the compiler
  The drawing
```

**Derivation is interpolation between authored endpoints, not a formula.** Each
axis declares what a token is worth at each of its poles and the position
interpolates, the way a variable font interpolates a weight axis. `radius = 3 −
geometric / 50` would be our taste wearing the team's clothes, and unarguable.
Endpoints are data, editable in the app, so a team can say what "minimal" means
for *their* set.

Where two axes move the same token the proposal is the mean of their
contributions, which is why "geometric but friendly" lands between the two
rather than at either extreme, and the editor shows each contribution rather
than only the result. Enum tokens cannot be averaged, so they take the nearer
pole.

**Absent means derived.** A derivable token omitted from the language file is
computed; a token written in the file is an override that wins. "Unlock and
override" is literally "write the value down", per field, so one overridden
budget does not drag the other out of derivation with it.

Two constraints tune the defaults. With every axis neutral the proposals
reproduce exactly what a language that stated nothing used to get, so adding
derivation changed no existing language by accident. And the bundled Technical
language predicts its own corner radius and part budget from its own axes — if
a shipped language had to override everything, the defaults would be wrong.

One consequence worth stating: **the reference set has to exercise every token
the language can change.** None of the original nine exercised corner radius, so
moving that slider changed a number and nothing on screen. A control that moves
a value invisibly is the same failure as a label that claims an enforcement it
does not have.

## 8. Turning a principle into a rule

A principle is a sentence. A constraint is a predicate over geometry. Nothing
converts one to the other automatically — it is a design act, but a repeatable
one.

**Step 1. Decide its tier.** Can the machine enforce it, only score it, or
merely surface it? Getting this wrong in either direction is expensive:
enforcing a preference makes the system hated, prompting a hard constraint
makes it worthless.

**Step 2. Find the observable.** What is measurable on a finished icon? For a
hard constraint it must be a predicate; for a soft one a gradient, which is a
much lower bar and is why the soft tier catches so much more. No observable at
all means human judgment — stop and label it.

**Step 3. Take the threshold or weight from the language.** The number is the
team's decision. A constraint with a hard-coded threshold is our taste again.

**Step 4. Prevent if you can, detect if you cannot, score if you should not.**

**Step 5. Show the tier in the UI, next to the principle.** A team should see
at a glance which principles have teeth, which are scored, and which are a note
to a human.

---

## 9. The method applied to the Technical language

All eight of its principles.

| Principle | Tier | Status |
| --- | --- | --- |
| "Keep the natural proportions of real objects." | Hard | **Already prevented** by uniform-scale composition. Nobody knows, because the principle is not linked to the guarantee. |
| "Closer to a technical drawing than an illustration." | Hard | **Already checked**, as the angle set plus the cap choice. A summary of two rules it is not linked to. |
| "Detail is a budget. If it disappears at 16px, do not draw it." | **Soft** | **Now both.** `complexity` still refuses the impossible; the `restraint` scorer measures how much of the budget is used, because detail is a gradient and an icon at 90% of its budget is not "fine". Part priority handles the 16px half: optional parts are pruned to the size's budget. |
| "Draw a recurring part the same way every time." | Hard | **Built, at the set level.** No per-icon rule can see it, so it is an audit finding: duplicate geometry, and a before/after of every icon that uses an element when the element changes. |
| "Every icon must read as a filled silhouette." | **Soft** | **Built** as the `silhouette` scorer: weigh closed ink against open ink. |
| "Extend a line rather than clip it short." | **Soft** | Still unbuilt, and now partly contradicted: the junction notch deliberately clips a line short where it meets another at a shallow angle. The principle and the correction want reconciling before either becomes a rule. |
| "Cut a slash flat. Never imply depth." | **Soft** | Still unbuilt. Weak either way; a crude proxy at best. |
| "An icon should not take your attention. Utilitarian, but never ugly or boring." | **Human** | **Built as a question.** Asked in review as `character`, never answered by the system. |

Of the eight: two were already guaranteed and invisible, and still are. Three
now have the scorer they wanted. One became an audit finding because no
per-icon rule could ever see it. One is asked of a person and always will be.
Two remain unbuilt, and one of those turned out to disagree with a correction
we shipped — which is more useful than leaving it as an unexamined sentence in
a prompt.

---

## 10. What the scoring layer would unify

The reason the soft tier is worth more than a nicer warning list: **one scorer
serves three things the plan otherwise treats as separate features.**

1. **Ranking candidates.** Create used to return three in arbitrary order and the designer compared by eye. Candidates are now ranked by score, which is Cursor's 156-hamburger process with the comparison automated.
2. **Auditing the set.** The same scorers run across every icon. One that scores far from its siblings is the drift an audit is meant to find.
3. **Discovering emergent rules.** A score that clusters tightly across a whole set *is* an unstated rule, and can be offered for promotion to a declared one.

All three are built. The second became `auditLibrary` and the third
`proposeRules`, which never writes a rule without first showing the icons that
would start failing.

And a quieter fourth, still unbuilt: **human decisions tune the weights.** If a
team consistently approves icons a scorer marks down, the scorer is wrong for
that language. Recording approvals against scores would let the soft tier learn
from review, deterministically, with no model involved. Today the weights are
set by hand in the language editor.

---

## 11. What AI is left with

Three jobs, each producing something a human approves that then becomes
permanent:

1. **An unknown phrase → a known concept.** Fuzzy resolution when aliases miss.
2. **A new concept → a proposed decomposition.** "What is a server made of?"
3. **A missing element → proposed geometry**, inside the grammar.

Everything else — arrangement, fitting, pruning, stroke, radius, gaps,
validation, rendering — is arithmetic over the language.

The property this buys: **the system needs the model less every month**, because
each job, done once and approved, never needs doing again. The share of icons
produced with no model call is the number that should climb.

---

## 12. What exists and what does not

| Layer | State |
| --- | --- |
| IconSpec as the IR | Built |
| Language: character, grammar, tokens per optical size | Built, and authorable |
| Vocabulary: 23 primitives plus user elements | Built, each declaring which language values it reads |
| **Construction traits** | Built: 6 traits, three consumers minimum, identity defaults, derivable from the axes |
| **Per-part exceptions** | Built: allowed, reasoned, marked, counted by the audit |
| Compose, render, validate | Built, deterministic |
| Arrangements | Built: single, badge, stack, row, contain. A language declares which it allows. |
| Concept registry | Built. Resolved by id, name, then alias; one published icon per concept per language. |
| Decomposition and part priority | Built. Optional parts prune to the size's detail budget, and the spec records what was dropped and why. |
| Axes driving derived tokens | Built, with editable endpoints |
| Soft tier and scoring | Built: 5 scorers, weighted per language, zero disables |
| Human tier | Built: 3 questions, asked and never answered |
| Set-level audit and rule promotion | Built: 6 findings, 4 proposals, each with a preview of what it breaks |
| Optical passes | Built: junction notch, interior thinning, dot sizing. Off unless asked for. |
| Back ends | SVG, sprite, React, TypeScript module, CSS, manifest, Figma. Font is a manifest, not a binary. |
| Natural language over the traits | Built: four tools, values held to their declared ranges, nothing saved |
| Weights learned from approvals | **Not built.** Weights are set by hand. |
| Font binary | **Not built.** Codepoints are assigned and stable; the build is left to a font toolchain. |
| Concept hierarchy or relations | **Not built.** Concepts are flat. |

What is left is in [PLAN.md](PLAN.md) under "Still open after M11". The largest
item is not on any list: **none of this has met a real icon set.**
