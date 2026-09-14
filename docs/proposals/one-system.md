# One system, no loose ends

Written 2026-09-14. **Phases A–D landed.** The grammar rules come next.

> Icon Foundry turns a brand's visual identity and design philosophy into an
> executable icon language — so every icon is not just consistent, but
> unmistakably part of the same system.

That sentence is the spec for this document. "Executable" is the load-bearing
word: a language that is *described* and then separately *drawn* is two things
that will disagree. Everything below is a place where this codebase currently
lets them disagree, and what it takes to close each one.

---

## What is actually broken

Seven findings, from reading the code rather than from taste. Four are defects,
three are absences.

### 1. Every icon is shown against all four keylines at once

**This is a real break, and it is the one worth fixing first**, because it is
the clearest case of a decision being made and then thrown away.

The composer already decides. `keyline()` in `icon-composer/src/layout.ts:91`
is the whole rule:

```ts
return tokens.optical[registry.get(element).opticalShape];
```

Each primitive declares an optical shape, or has one inferred from its aspect
ratio by `inferOpticalShape` — wider than 1.15 is `horizontal`, narrower than
1/1.15 is `vertical`, otherwise `square`, with `circle` only ever declared. So a
square part *is* sized against the square box, and a round one against the
circle box. The system is right.

Then `ComposedIcon` does not carry the answer. It has `canvas`, `tokens`,
`construction`, `shapes`, `elementCount` — and nothing that says which keyline
any of those shapes was fitted to. So `KeylineLayer` in `IconPreview.tsx`,
having no way to know, draws all four:

```tsx
{Object.entries(tokens.optical).map(([shape, box]) => …)}
```

Which is why a circle keyline appears behind every icon in the studio. The
overlay is not wrong about the tokens; it has simply never been told which one
applies, and four boxes is what "I don't know" looks like.

**The fix is to make the composer report the decision it already makes.** Add
the keyline to each composed shape and name the subject's on the icon. Then
every surface — the preview, the drawer, the method canvas, the audit — draws
the box the geometry was actually fitted to, because there is one answer and
they all read it. The keyline stops being an overlay's guess and becomes what it
should have been: part of the composed result.

### 2. The radius handle is absent exactly where it is needed

Ours is computed forwards, from the ramp, at a *joint*: `jointViews` walks the
corners of a skeleton and offers a handle at each. It also requires a real
corner — `angle > 1 && angle < 179` — which is correct, because there is no
fillet to cut at a joint that runs straight through.

And that is why the handle is missing from every drawing that matters. Once
geometry is rounded — by `arcify`, or by arriving from Lucide, or by being a
rounded rectangle anybody has ever drawn — it is line → arc → line, and the
joints where the line meets the arc are *tangent*. They measure ~180°. So they
are correctly excluded, and the drawing has no draggable radius anywhere, even
though every corner in it visibly has one.

Lucide solves this and the solution is worth taking. For each arc it intersects
the tangents at the two endpoints (`intersectTangents` in `get-paths.ts:421`)
and recovers the **virtual corner** the fillet was cut from. The radius handle
then sits on the bisector of that corner, and dragging it re-cuts the fillet:
new radius, new tangent points, arc endpoints moved onto them.

Ours will be better than the original for a structural reason. Lucide moves only
the arc's own endpoints, because its neighbouring lines hold *copies* of those
points — so after a radius drag the line and the arc no longer meet, and it
needs its repair passes and its snap-violation overlay to notice. Here vertices
are shared: moving the arc's endpoints moves the ends of the lines, because they
are the same points. The gap cannot open.

The two handles then unify. A sharp joint shows the fillet the language *would*
cut; a rounded one shows the fillet somebody *has* cut. Same gesture, same mark,
and dragging either states a radius.

### 3. Dragging selects the annotation

Pointer events are already off on every overlay group, which stops the labels
swallowing a drag. It does not stop the browser starting a *text selection* when
a drag crosses an SVG `<text>`, which is a separate mechanism and needs
`user-select: none` on the stage. The symptom is the degree labels highlighting
and smearing during a drag.

### 4. Tidy is nine passes, and the plan said more

`tidy` runs `snapToGrid`, `snapLinesToIntersection`, `weldVertices`,
`removeTinySegments`, `mergeLines`, `smartClose`, `mergePaths`,
`removeBackdrop`, `fixDots` — twice, each wrapped so a throw skips the pass
rather than the operation. The structure is right and matches the plan.

**Corrected after checking.** The first draft of this section said all three
needed behavioural tests. They already have them — 48 between them, asserting on
what the geometry does rather than that the function exists, including the
properties that matter most (`tidy` is idempotent and never deletes ink; `arcify`
never eats more than half an edge and re-rounds the whole set when the ramp
changes; `clipOutsideBand` only ever takes ink away). Arcify and Offify are
implemented as specified and need nothing.

One real gap, and one thing the earlier proposal got wrong about itself:

- **`mergeArcs` was absent** and now exists. The reason given for it originally
  — fragments after a cut — turns out not to be the reason: Offify removes the
  middle of a curve, so the two survivors are not adjacent and there is nothing
  to merge. The real case is imported geometry, where a quarter circle arrives
  as two eighths because that meant something to the tool that exported it. Left
  alone, every pass that asks a question about a curve gets two answers, and the
  radius handle offers two handles for one corner. It merges on a **shared
  centre**, not a shared radius, because two arcs of equal radius that curve away
  from each other are an S-bend and joining those would draw something nobody
  asked for.
- **`recognise()` cannot be a tidy pass**, and the construction-editor proposal
  was wrong to list it as one. `tidy` maps a skeleton to a skeleton; recognising
  a drawing as a `warehouse` produces a *primitive reference*, which is a change
  to the spec and not expressible in the return type. It is correctly a separate
  offer, and the method canvas already makes it.

### 5. The code pane speaks path data, and designers speak SVG

The pane round-trips `d` strings, which is what is stored. But nobody has a `d`
string on their clipboard — they have an `<svg>`, from Figma, from Lucide, from
a designer. Accepting one is the difference between a code pane you can use and
one you can only read.

The rule that keeps this from becoming a second source of truth: **SVG is an
import and export surface, not storage.** Paste an `<svg>` and its *geometry* is
taken; its `stroke-width`, `stroke-linecap`, `viewBox` and colour are read,
reported, and then discarded, because those belong to the language. A paste that
silently brought a 2px stroke into a 1.5px language would be the exact failure
this product exists to prevent.

### 6. Create and Method are two different editors

The method canvas is where a drawing can be seen against its own rules. The
create page has a brief box, candidate cards and a static preview strip — so the
one moment a designer most wants to nudge geometry, before it enters the
library, is the one moment they cannot.

These should be the same component. Not similar: the same.

### 7. The right rail explains where it should show

Three sections of prose — personality, line angles, corners — each with a
paragraph above it. The corner ramp is already drawn rather than typed, and it
is the best thing on the panel, which is the argument for the rest.

---

## What this adds up to

Every finding above is the same shape: **a decision is made in one place and
re-derived, guessed at, or ignored somewhere else.** The composer picks a
keyline and the preview guesses. The language owns corner radii and the editor
cannot reach them once they are cut. Storage is path data and the clipboard is
SVG. Construction is editable on one page and frozen on another.

So the work is not seven features. It is one principle applied seven times:
**whoever decides, reports; everyone else reads.**

---

## Plan

Four phases, ordered so each one makes the next smaller.

### Phase A — close the loops that already exist

The defects. Nothing new, just the decisions already being made becoming
visible to the things that need them.

| | What becomes true | |
| --- | --- | --- |
| **A1** | `ComposedIcon` carries the keyline each shape was fitted into. Every preview draws that one. | ✅ |
| **A2** | An arc knows the corner it was cut from, so every radius in a drawing is draggable — including on geometry that arrived already rounded. | ✅ |
| **A3** | A drag never starts a text selection. | ✅ |
| **A4** | `mergeArcs` lands. Tidy/Arcify/Offify turned out to be tested already; `recognise` turned out not to be expressible as a pass. | ✅ |

**A2 found a defect on the way.** `jointViews` measured a corner by the
*neighbouring vertex* rather than by the direction the drawing actually leaves
in. For two straight legs those agree, so it looked right everywhere it was
first tried. Where an arc adjoins they do not: the chord to the arc's far end
can sit 45° off its tangent, so a corner that was already rounded — nothing left
to round — measured as a sharp one and was offered a fillet handle for a corner
that is not there. It now reads directions from `segmentHeading`, which is what
`cornerAngle` in the primitives package had been doing correctly all along.

### Phase B — the code pane speaks SVG ✅

`<svg>` in, `<svg>` out, geometry only. `importSvg` reads path, rect, circle,
ellipse, line, polyline and polygon, composes nested `transform`s, skips
`<defs>` and friends, and refuses rather than redrawing anything it cannot hold
(an unequal `rx`/`ry`, a `skewX`). An incoming `stroke-width="2"` is reported to
the designer and dropped.

It takes its path-data writer as an argument rather than importing the renderer,
so the importer does not invert the package graph to reach a function that
formats numbers.

### Phase C — one canvas, two pages ✅

`ConstructionStage` is the canvas, and it does not know what it is editing: it
takes a skeleton in canvas units and hands back a new one. `useConstruction`
measures a drawing once, so the stage and the panel counting its faults cannot
disagree. There is no `mode` prop — the two pages differ by the chrome they put
around it, which is the risk this section flagged and the thing to keep watching.

On the create page, editing a draft **changes what the icon is**. A composition
is a recipe; a drawing is not. So the spec handed back is a freeform path
element, the panel says so in as many words, and the library drawer's existing
offer — find the composition that reproduces this exactly — is the way back.

### Phase D — the rail shows ✅

Angle sets are drawn as the directions they permit, so which set is stricter is
seen rather than parsed, and "any angle" is visibly the absence of a rule rather
than a fourth option shaped like the other three. The three paragraphs above the
controls are now three short lines: the controls were always the explanation.

### Phase E — the three rings ✅

`safeArea` meant two things: the box the keylines are derived from, and a fence
nothing may cross. Those are different rules with different severities and
different things to measure. Split into live area (centrelines, warning) and
`trim` (ink, error), with sanctioned padding between. See the DECISIONS entry,
"A keyline is a target, and the safe area is the outermost keyline".

### Then

The grammar rules the user has in mind, onto a system that can hold them.

---

## Risks

**Adding a keyline to `ComposedIcon` touches the composer's public shape**, so
the renderer, the validator, the audit and the figma plugin all see it. It is an
addition rather than a change, but it needs a pass over every consumer.

**An SVG importer is a parser for other people's output**, which is the category
of code that meets input nobody predicted. It must fail loudly and change
nothing on failure — the code pane already has that shape and must keep it.

**One shared canvas across two pages is a component with two callers and a
temptation**, which is how a prop like `mode` gets born and how the two pages
start diverging again inside one file.
