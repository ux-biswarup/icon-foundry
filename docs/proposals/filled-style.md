# The filled style

Written 2026-09-14. **Accepted**, and being built as M19–M21.

Icons come in two styles. Outline icons are built from strokes, which is what
the engine draws today. Filled icons are built from solid shapes with the
interior details knocked out, cut directly from the fill.

**Not every icon has a filled version, and that is the normal state**, not a gap
to be closed. Which icons need one is a fact about a product — its tab bars, its
selected states, its empty states — and no measurement of a drawing can produce
it.

---

## The claim

> The filled style is already rendered. What is missing is that a filled version
> has no identity, no status, no coverage, and nowhere to be seen.

Everything below follows from taking that literally: this is not a new renderer,
it is a variant, a policy, and three switchers.

## What the engine already does

| Piece | Where | State |
| --- | --- | --- |
| Filled geometry is one path with `fill-rule="evenodd"`, so a hole is a hole | [renderer/index.ts](../../packages/icon-renderer/src/index.ts) | Built |
| `fillable` on every shape; closed shapes yes, lines and open arcs never | [geometry.ts](../../packages/icon-primitives/src/geometry.ts) | Built |
| `cutout()` marks a closed shape as a hole in the silhouette | [geometry.ts](../../packages/icon-primitives/src/geometry.ts) | Built |
| Primitives build different geometry per style via `ctx.style` | [primitive.ts](../../packages/icon-primitives/src/primitive.ts) | Built |
| A drawn element may carry an authored `filled` path set, falling back to its fillable outline paths | [path-primitive.ts](../../packages/icon-primitives/src/path-primitive.ts) | Built |
| Silhouette scored as closed ink against open ink | [scorers/index.ts](../../packages/icon-validator/src/scorers/index.ts) | Built |
| `style.default` and `style.allowed` on the language; `style` on a spec and on an element | [icon-language](../../packages/icon-language/src/types.ts) | Built |

So the rendering question is closed. The open questions are ownership,
feasibility and visibility.

## Four decisions

**1. The closed loop is the fill.** A filled version is derived from the same
`IconSpec` by rendering its closed geometry as solid and its declared cutouts as
holes. No second drawing is authored unless the derived one fails. This is the
whole reason the filled style is cheap: it is the outline's own closed loops,
read a different way.

**2. The policy lives in the language.** Which icons must have a filled version
is written in the language file, versions with it, and travels when a language
is copied. It is stated by concept tag rather than by icon name, because naming
individual icons in a language file means editing the language every time the
set grows.

**3. Coverage is left to a person.** The system never decides that an icon needs
a filled version. It decides something different and measurable — whether a
filled version *would work* — and reports the difference. This is the fourth
entry in the "Left to a person" list the Language page already shows, and
putting it anywhere else would be the exact failure the rest of the system is
built to avoid: implying an enforcement that does not exist.

**4. Both styles are asked for at creation.** The Create page offers both, and
after generation the system says which one did not survive, with the reason.
Finding out that half a set has no usable filled version at export time is
finding out too late.

## Feasibility: the measurable half

An icon cannot be filled when any of these is true. Each is a geometric fact
about the composed drawing, not an opinion about it.

| Reason | Test | Severity |
| --- | --- | --- |
| Nothing to fill | No shape in the composition is `fillable` | Impossible |
| The drawing is mostly line | Closed ink is a minority of total ink — the existing silhouette scorer | Warning |
| A knock-out closes up | A cutout narrower than `minCutout` at this optical size | Impossible at that size |
| Detail would vanish | Interior detail that is stroke-only has no hole to become, so the fill swallows it | Warning |

`minCutout` is new, and it is the filled analogue of `minNegativeSpace`: a hole
thinner than roughly a stroke width stops reading and the icon goes solid. It is
a token per optical size, because the size that fails is almost always 16.

**An impossible reason is reported, never worked around.** The system does not
quietly thicken a hole to make a check pass; that is drawing, and drawing is the
designer's.

## The data model

A style is a variant of an icon, not a second icon. The library enforces one
published icon per concept per language, and a `warehouse-filled` record would
double every concept and break that invariant.

```ts
interface IconRecord {
  spec: IconSpec;          // the outline drawing, canonical, unchanged
  filled?: {
    spec?: IconSpec;       // present only when the derived fill was not good enough
    status: "derived" | "draft" | "published";
  };
}
```

`filled` absent means there is no filled version, which is a normal state for
most icons in most sets. `status: "derived"` means the closed loops are enough
and nothing was drawn. A `spec` appears only when a person or the agent had to
draw the difference, and it then goes through the same draft → published path
elements already use.

## The language gains two things

```json
"style": {
  "default": "outline",
  "allowed": ["outline", "filled"],
  "filled": { "requiredFor": ["navigation", "state"] }
}
```

and `minCutout`, per optical size, beside `minNegativeSpace`.

`requiredFor` lists concept tags, not icon names. It is the one place a
product's answer to "which icons need this" is written down, by a person, once.

## Three switchers

**Library.** A chip pair beside the `icons / gaps / audit` view switch. Switching
to Filled **does not hide icons that have no filled version** — they stay in the
grid, dimmed, marked. A grid where a third of the set silently disappears
teaches nothing; one where it greys out shows coverage at a glance. A `missing
filled` filter joins the status filters.

**Language.** A style switch on the canvas bar beside Parts and Keylines,
redrawing every part filled. This is where the filled style of the *set* is
judged and where `minCutout` and the interior radius get tuned. Judging a filled
style one icon at a time is the mistake the parts canvas exists to correct.

**Create.** A checkbox for each style. After generation the result names any
style that failed and why, in the language of the reason table above.

## Coverage reuses the Gaps view

`Gaps` already answers "which concepts have no published icon". Filled coverage
is the same question one level down: which published icons whose concept is
listed in `requiredFor` have no filled version. Same list, same shape, one more
section.

## Build order

| Milestone | What becomes true |
| --- | --- |
| **M19** | The language can state its filled policy and its knock-out minimum, and the engine can say whether any given icon can be filled, and why not. |
| **M20** | An icon record carries a filled variant with a status, and the library reports coverage against the policy. |
| **M21** | The three switchers, and Create asking for both styles. |

M19 first because everything else consumes its answer. M21 last because a
switcher over a variant that does not exist has nothing to switch to.

## Deliberately not decided

**Codepoints and the font.** Records carry a codepoint that is assigned once and
never reused, so a set can ship as a font and be replaced without breaking a
reference. A filled variant in a font needs its own glyph and therefore its own
codepoint. Either it draws from the same sequence or filled variants stay out of
font output. It is a one-way door and nothing above depends on it, so it stays
open until a set is actually shipped as a font.

## Where this could be wrong

**`requiredFor` by concept tag may be too coarse.** A product usually needs
filled versions of a specific handful, not of a category. If tags turn out to be
the wrong grain, the fallback is an explicit list on the library rather than the
language — which would also move the policy out of the language, reversing the
decision above.

**"Derived is usually enough" is untested.** It holds for the built-in
vocabulary, which was drawn with cutouts declared. It may not hold for a set
drawn by a team that never thought about the filled style while drawing it, and
if most icons need an authored filled spec then the variant model is carrying
much more weight than this proposal assumes.
