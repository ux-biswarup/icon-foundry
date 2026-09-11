# Research: The making of Cursor's icons

Source: Marek Minor, "The making of Cursor's icons",
https://www.minoradventures.co/blog/the-making-of-cursors-icons
(read 2026-09-11). One designer, about a year, 600+ icons in two sizes and
two styles, every one drawn by hand.

This note extracts the rules and habits from that project and maps each one
onto Icon Foundry: what we already have, what the Language should be able to
express, and what the Studio should ask. Quotes are the author's.

---

## 1. Why the project existed

Cursor inherited VS Code's Codicons (roughly 470–500 icons) plus custom
additions with inconsistent documentation. The real limit was coverage:

> "Some of the concepts Cursor kept introducing don't exist in any icon library."

Same problem statement as ours. Their answer was to redraw everything as one
system, by hand, and to build infrastructure so the *next* icon is cheap. Our
answer is to make the system itself the infrastructure. The lesson is that the
system only works if the rules are precise enough to draw from.

## 2. Rules they defined, mapped to our layers

### Tokens (what `language.json` already models)

| Cursor rule | Value | Icon Foundry today | Gap |
| --- | --- | --- | --- |
| Two optical sizes, like type | 16px primary (used 12–20), 24px (22+) | One canvas | Tokens keyed by optical size |
| Stroke per size | 1.25px at 16, 1.5px at 24 | One stroke width | Same |
| Stroke does not snap to pixel grid | "goes against the standard advice" | Grid rule warns on off-grid boxes | Grid must be a *layout* grid, separate from pixel snapping; a language may opt out of pixel alignment |
| Corner rounding | "Not too geometric, not too bubbly. Just enough" | `cornerRadius` number | Studio should present this as before/after pairs, then store the number |
| More detail at 24 | "more detail available in extra space" | `limits` per language | Detail budget per optical size |

### Grammar (composition rules we do not model yet)

| Cursor rule | Icon Foundry mapping |
| --- | --- |
| **Optical shapes**: four underlying systems, square, circle, horizontal, vertical, so icons of different proportions read as the same size. "Diagonal shapes in particular sit awkwardly in all of them." | Each primitive should declare its optical shape; the composer picks the fitting box from the language's four optical boxes instead of one square safe area. This is the single biggest quality lever we are missing. |
| **Construction**: horizontal, vertical, 45° only; angles only when the concept demands; round corners after lines are set, no freeform curves | An `angles` policy in the grammar (`orthogonal-45` / `free`); a validator rule that measures line angles |
| **Closed shapes over open ones** for legibility at small sizes | A grammar preference the validator can warn on (open polylines that could close) |
| **Slashes cut flat, no fake shadows**; slash direction opposite to the pointer | `directionality` in Character: a canonical diagonal direction; the validator checks slash primitives against it |
| **Extended lines**, borrowing from monospace aesthetics | A form option in the Studio; affects how primitives terminate |
| **Natural proportions**, "to avoid the toy look": pencils tall, banknotes wide | Argues *for* our uniform-scale rule and against stretching; primitives must carry their true aspect |
| **Recurring elements drawn consistently every time**: 155+ tracked (folders, files, arrows, eyes, badges) | This is exactly our primitive registry. Their tracking table is our registry plus a Studio "elements" view |
| **Filled = solid shapes with interior details knocked out** | Confirms the cut-out feature in our known gaps is required, not optional |
| Not every icon needs both styles, only those the product needs | Style is per icon, not forced per set; keep `style` optional on IconSpec |

### Optical adjustments (micro rules a renderer can do)

| Cursor rule | Icon Foundry mapping |
| --- | --- |
| **Optical breaks**: a small notch where strokes meet, "the same way a text face opens up the tight corners of an A" | Renderer post-pass: detect junctions with more than two strokes and insert a gap of *n* units. Language token `junctionNotch` |
| **Stroke thinning** where many lines converge | Same pass, alternative strategy; probably a later refinement |
| **Dot sizing**: a terminal dot, an ellipsis dot, and a lone dot need different sizes | Primitive context needs a `role`; a `dot` primitive with three sizes derived from stroke width |
| **Cuts / gaps never less than 3 grid units**: "At 2.5 or less, shapes start touching and overlapping, merging into one blurry shape" | This is our unenforced `minNegativeSpace`. Now we have a value and a reason. Implement as a validator rule that measures the minimum distance between non-touching shapes and as a composer rule for the badge knockout |
| Explorations differing by 0.25px; 156 versions of a hamburger | The Studio must make comparing near-identical variants side by side trivial, at true size |

### Character (the psychology, in their words)

> "The standard I held the whole time is that the icons should not take your
> attention. Not too friendly, decorative, or trying to impress you with how
> clever they are. Utilitarian, but never ugly or too boring."

> "Icons are closer to technical drawings, diagrams with a friendly finish."

> "Nobody reads a paragraph and thinks about the typeface (except the
> designers), but set the same paragraph in the wrong one and everyone feels it."

Three observations for our Character layer:

1. The character is stated as a **tension between two poles with a target**
   (utilitarian, but not ugly; technical, but friendly finish). Our slider
   axes are the right shape for this. Cursor's language on our axes would be
   roughly geometric 80, minimal 75, technical 70, literal 60.
2. The character is **stated once and then enforced through hundreds of tiny
   rules**. Psychology without derived rules is a mood board. Our Studio must
   derive grammar and tokens from the character, and show that derivation.
3. **Consistency is the goal, cleverness is the enemy.** This should be a
   validator posture: penalise novelty per icon, reward reuse of recurring
   elements.

## 3. Their infrastructure, mapped to ours

| Cursor | Purpose | Icon Foundry equivalent |
| --- | --- | --- |
| Explorations file | tens or hundreds of attempts per concept, numbered | A "variants" surface in the plugin: generate N candidate IconSpecs, compare at true size |
| Overviews file | audit table: optical shape per icon, gap consistency, badge sizing, dot and notch standardisation, same folder everywhere | Our validator plus a set-level audit view. Most of their rows are rules we can compute across a whole set rather than one icon |
| Icons file | all finals as components with two properties: Filled, Size | Our component naming should become Figma variant properties, not slash names |
| Mirror overview to a phone | "a phone shows the icon at its absolute size" | The Studio and plugin preview must show icons at exact device pixels, not zoomed |
| Codepoint mapping and migration dashboard | replace 645 icons without breaking references | Out of scope for now; the lesson is that the icon's *name/identity* must be stable while its drawing changes, which IconSpec `name` already gives us |
| Companion site with 1,274 tags; "Searching 'search' should surface magnifying-glass" | Our primitive keywords are the seed of this; an icon set needs its own tag index, and the concepts table ("what is the icon for Bugbot?") is the vocabulary section of Character |
| `ship it` pipeline: register, compile fonts, regenerate site, verify docs, commit | Our `pnpm examples` is a toy version. A `publish` command that re-renders a set against a language version and diffs it is the right target |

## 4. What this changes in the Studio proposal

1. **Add optical shapes to Grammar and to primitives.** Four fitting boxes per
   language, one optical shape per primitive, composer chooses the box.
2. **Add optical sizes to Tokens in the first version**, not later. Cursor's
   whole system hinges on two sizes with different strokes and detail
   budgets. This answers open question 2 in the Studio doc.
3. **Give `minNegativeSpace` a real rule and a default of 3 grid units.**
4. **Make cut-outs for the filled style a first-class requirement.**
5. **Add a directionality decision to Character** with a visible consequence
   on slash-like primitives.
6. **Add a construction policy to Grammar**: allowed angles, closed-over-open,
   rounding-after-lines.
7. **Plan a renderer optical pass** for junction notches and dot roles, as a
   language-controlled feature that can be off.
8. **Design the Studio preview as true-size first**, zoomed second.
9. **Treat the set, not the icon, as the unit of audit.** Many of Cursor's
   consistency checks only make sense across the whole set.

## 5. What this says about generation

Cursor, an AI company, hired a human to hand-draw every icon, "for those
hundreds of small decisions." The article does not argue that machines cannot
draw icons; it shows how many *rules* the human was applying, most of them
unwritten until the article. That is the encouraging reading for us: nearly
every rule above is expressible as data, geometry, or a validator check. The
more of them a language captures, the smaller and safer the space any
generator, human or model, is allowed to move in.
