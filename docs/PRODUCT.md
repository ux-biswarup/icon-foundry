# What Icon Foundry is for

Written 2026-09-12, after reading "The making of Cursor's icons" closely
(see [research/cursor-icons.md](research/cursor-icons.md)). This document
exists to settle what the product solves, so the core engine has a shape worth
committing to. It argues with parts of our own earlier reading of that article.

---

## 1. The problem, stated properly

The README currently leads with "eventually you need an icon your library
doesn't have". That is a symptom, and the least interesting one. A missing
icon is an afternoon of work.

The disease is this:

> **An icon set is easy to start and impossible to keep.**

Forty icons drawn by one person in one week are coherent for free. What
happens next is the actual problem:

- **The rules live in a head.** Cursor's set took one designer a year, holding
  155 recurring elements and hundreds of micro-decisions, supported by three
  Figma files. When that person moves on, the rules move with them.
- **Review is a matter of taste, so it is inconsistent.** "Does this belong?"
  is answered by holding the new icon next to three old ones and squinting.
  Two reviewers answer differently. One reviewer answers differently on a
  Friday.
- **Duplicates accumulate silently.** Three icons for "error" appear over two
  years, because at no point did anyone know to look.
- **The same object gets redrawn.** The folder in one icon is not the folder
  in another, because they were drawn four months apart by two people.
- **Contribution is gated on taste.** Only the designer who has the feel can
  safely add an icon, so the set becomes a queue behind one person.

None of these is a drawing problem. Every one is a systems problem. That is
the product.

> **Icon Foundry turns an icon system's rules into something executable and
> its vocabulary into something shared.**

The article's own phrase is the best summary of the goal: consistency as
**infrastructure** rather than memory.

### The filter

One question decides whether a feature belongs in this product:

> **Does it move a decision out of someone's head and into the system?**

If yes, build it. If no, it is craft, and craft belongs to the designer. This
filter is used throughout the rest of this document, and it disqualifies some
things we were otherwise excited about.

---

## 2. What the product is

The name was already right. A type foundry does not sell letters; it produces
a typeface that can set any word, in any size, consistently, for people the
designer will never meet.

**Icon Foundry does not produce icons. It produces a language that renders
concepts, and keeps that language honest as the set grows.**

What it is not:

- **Not a generator.** A generator optimises for the first icon. We optimise
  for the five-hundredth.
- **Not an icon library.** We ship no icons worth using. We ship the means to
  make yours.
- **Not only a linter.** A linter can say no. This has to say yes, by
  composing something correct.

---

## 3. The property worth designing for: needing AI less every month

Most products built around a model get more dependent on it over time. This
one should get **less** dependent, monotonically, and that should be a design
goal rather than an accident.

The loop already exists in the code:

```text
a concept has no element
        ↓
the model drafts one, inside the grammar
        ↓
a human approves it            ← the only step that adds to the vocabulary
        ↓
the vocabulary is larger
        ↓
the next concept needs no model
```

Play it forward over a real set:

| Icons | What happens |
| --- | --- |
| 1–50 | Most subjects have no element. Heavy model use. |
| 50–200 | The model mostly arranges what exists; occasionally draws something new. |
| 200+ | The vocabulary covers the domain. Deterministic composition handles most requests. The model is reserved for genuinely new concepts. |

The consequences are worth stating plainly, because they are unusual:

- **Cost per icon falls** as the set grows, instead of staying flat.
- **Quality rises**, because approved elements have been reviewed by a human
  and freshly generated geometry has not.
- **The system becomes portable.** A mature language plus vocabulary works
  with no key, no network, no vendor.
- **The asset belongs to the customer.** What accumulates is their vocabulary
  in their repository, not our model weights.

This gives us the metric the product should actually be judged on:

> **What share of icons were produced without a model call?**

That number should climb. If it does not, the vocabulary is not growing and
something is wrong. No other metric tells us as much.

---

## 4. Three kinds of rule

Our earlier reading of the article treated every rule as a thing to declare in
the language file. That is wrong, and the mistake matters. Rules come in three
kinds, and only one of them is authored.

**Declared.** Written in the language. "Stroke is 1.25 at 16px." "Lines run at
0°, 45°, 90°, 135°." Checkable against a single icon in isolation. This is
what we have built.

**Derived.** Computed from what is declared, never authored, and therefore
incapable of drifting. Keyline boxes come from canvas and safe area; the badge
box comes from ratio and corner. Every derived value is one fewer decision a
person can get wrong.

**Emergent.** True of the set, written nowhere, and invisible from any single
icon. *Every animal in this set uses the circle keyline. Every badge is the
same size. This folder is drawn the same way in all eleven icons that use it.*

Cursor's Overviews file was entirely the third kind: a human, comparing 600
icons in a table, by eye, holding the invariants in their head because there
was nowhere else to put them.

Two conclusions follow.

**The set-level audit is not a reporting feature. It is the third rule
engine.** Per-icon validation is structurally incapable of seeing these rules,
so no amount of work on the validator will find them.

**This is how the language grows without anyone authoring an ontology.** When
an emergent pattern holds across the whole set, the system can offer to
promote it to a declared rule. The language learns itself from the icons.

---

## 5. The engine, layered

Today the engine begins at the spec. `IconSpec` is our canonical form, and it
describes *where things go*. That is one level too low, and it produces a
specific, serious blind spot:

> **We can tell you an icon is well made. We cannot tell you it should not
> exist.**

Two icons with different specs can mean the same thing. That is a duplicate,
and it is the failure mode that damages a set most. Meaning lives above the
spec, and we have no representation of it. Concepts today are a free-text list
used to rank search results; nothing binds a concept to a canonical icon and
nothing stops two icons claiming the same one.

The engine should have five levels, each with its own kind of rule:

```text
CONCEPT       what it means          "refrigerated warehouse"
    │         rules: is this already answered? is it a duplicate?
    ↓         ── concept registry: canonical binding, aliases
COMPOSITION   what it is made of     warehouse + snowflake, badge top-right
    │         rules: is the subject an object? is the badge where badges go?
    ↓         ── vocabulary: elements with identity
SPEC          where things go        IconSpec: boxes, transforms, overrides
    │         rules: on the grid? inside the safe area? within budget?
    ↓         ── language: tokens
GEOMETRY      the actual shapes      composed shapes in canvas coordinates
    │         rules: construction angles, gaps, degenerate geometry
    ↓         ── language: grammar
RENDER        paths and pixels       SVG, Figma nodes, future targets
              rules: optical corrections
```

We have the bottom three. The top two are the work.

### The contract

A solid core engine is one that makes a promise it never breaks. This is the
promise worth making:

> Given a concept and a language, the engine does exactly one of three things:
> returns the **canonical icon** because it already exists; **composes** a new
> one from the vocabulary and proves it conforms; or says precisely **what is
> missing** — which element, or which rule it cannot satisfy.
>
> It never returns something plausible without saying which of the three
> happened.

That contract is testable, it is honest about failure, and it is the thing
that makes the system trustworthy enough to put in front of people who are not
icon designers.

---

## 6. Where the earlier reading was wrong

Arguing with our own notes, since they will otherwise become the plan.

**The full schema is a guess, not a design.** Our expanded outline had roughly
thirty-five fields across seven sections, authored up front. Cursor's rules
did not arrive that way; they emerged from drawing 600 icons, and the article
is a retrospective. A schema that large is a wall a design lead hits before
they get a single icon out of the tool. Fill it by discovery, promoting
emergent rules as they prove themselves, and let a language stay small until
its set earns more.

**Optical corrections are the most seductive and least urgent item.** Junction
notches and stroke thinning are the most technically interesting thing in the
article, and the author says plainly that the notch is nearly invisible at
16px. They matter at the margin of a set that is already coherent. If a set
has three icons for "error" and four different folders, no notch rescues it.
They are also a renderer concern rather than a schema concern, so deferring
them costs nothing architecturally. Later, and honestly.

**"Semantic dots" is right but it is not about dots.** The real observation is
that a part's *role* changes its geometry: a dot ending a line is not a dot
meaning "more". The general mechanism is a role passed into the primitive,
which the primitive context is already shaped to carry. One small
generalisation, not a taxonomy of dot types.

**Directionality should stay unenforced.** It is real, and it is genuinely
brand. But a mechanical check cannot tell which diagonal in a twelve-segment
icon is "the" diagonal, so it would fire on icons that are fine. A rule that
cries wolf teaches people to ignore rules, which is precisely the decay we
exist to prevent. State it, give it to the agent, show it in review, do not
gate on it.

**"Encode grammar, not style" understates the vocabulary.** Grammar constrains
how you draw. Vocabulary decides whether you have to draw at all. The
vocabulary is doing more work than the grammar, and it is the thing that makes
the model optional. It deserves to be first, not fifteenth.

**The concept table is not an icon feature.** Cursor built it because people
kept asking "what's the icon for Bugbot?" That is a findability problem, and
the people with it are engineers and product managers, who outnumber icon
designers on any team by an order of magnitude. The concept registry serves
the largest audience the product has, and we had it filed as a detail.

---

## 7. What to build, in order

Ordered by the filter in section 1, not by how interesting it is to build.

1. **Concept registry.** Canonical concept → icon binding, with aliases.
   Checked before anything is drafted and again before anything is approved.
   Cheapest item here, closes the engine's biggest hole, serves the biggest
   audience, and makes the agent safe by construction rather than by prompt.
2. **Set-level audit.** The third rule engine: same optical shape within a
   category, same badge size everywhere, same element drawn the same way,
   near-duplicate geometry, icons that drifted from the current language
   version. Then promote-to-declared, so the language grows from its own set.
3. **Element identity.** The bridge between "the folder element" and "the
   canonical folder icon", so changing the element updates all eleven icons
   that use it. Most of this exists; the binding does not.
4. **Filled rendering with interior knockout.** The one visible quality gap.
   A filled warning currently loses its exclamation mark. Bounded and real.
5. **Role-aware primitives.** The dot generalisation, once something needs it.
6. **Optical corrections.** Last. They are the reward for having done the rest.

The Figma bridge is not on this list because it is distribution rather than
engine. It stays scheduled alongside, since a system nobody can use in Figma
solves nothing.

---

## 8. Open questions

1. **Is a concept global or per-language?** A team with two languages
   (product and marketing, say) probably wants one concept vocabulary and two
   renderings. That argues for concepts living beside the library rather than
   inside the language.
2. **What is the unit of review?** Section 4 says invariants only exist across
   a set, and the psychology says an icon succeeds by *not* standing out among
   its siblings. Both argue that a new icon should always be reviewed among
   its neighbours, never alone in a row of three candidates, which is what
   Create shows today.
3. **When does an icon become an element?** If someone makes an icon that is
   just a folder, is that an icon, an element, or both? The answer decides
   whether derivation is icon-to-icon or element-to-icon. Current architecture
   assumes element-to-icon, which I believe is right, but the bridge in item 3
   is where it gets settled.
4. **Should the audit ever block?** An emergent rule is a pattern, not a law.
   Promoting one to a blocking rule is a human decision, but it is not obvious
   whether the system should ever nudge.
