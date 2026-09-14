# The construction editor

Written 2026-09-14. **Accepted**, being built as M22–M26.

The set's construction method, stated by its author:

> Closer to technical drawings than to organic shapes — diagrams with a friendly
> finish. Start with lines that run horizontally, vertically, or at 45°, allow
> other angles where the concept demands them, then round the corners until the
> shape follows the idea. A cloud isn't built from circles. It starts as straight
> segments that get rounded joins. A fire icon is built the same way. Freeform
> curves, or curves taken from circles, are extremely rare.

This document plans the three Lucide Studio tools — **Tidy**, **Arcify**,
**Offify** — into that method, plus the editor and the tab they live on.

---

## The earlier objection, and why it does not stand

An earlier note in this project argued Tidy and Arcify were not worth porting:
they repair geometry that arrived as arbitrary hand-drawn SVG, and icon-foundry
composes from typed primitives with radii already declared in
`SizeTokens.cornerRadius`, so there is nothing to reverse-engineer.

That was right about the code and wrong about three things.

1. **`cornerRadius` is one number; the method needs a ramp.** Lucide's real rule
   is `deg > 120 ? 2 : deg > 60 ? 1 : 0.5` — the radius depends on how sharp the
   corner is, because a large radius on a 40° point eats the point. One number
   cannot express that, and the ramp is most of what makes the corners feel like
   one hand.
2. **Arbitrary geometry does enter this system**, through the one door that
   matters: a team drawing its own elements. That is how a vocabulary grows. A
   cloud and a flame are both in that category and neither is a built-in.
3. **Any cut operation produces fragments**, so the moment Offify exists, Tidy
   is not optional.

The correction is not "port them", it is **move them from the repair end of the
pipe to the construction end**. Same rules, applied where geometry is made
rather than after it has gone wrong.

## The substrate: a skeleton

All three tools and the editor need one representation, or each will invent its
own and they will disagree at the edges.

```ts
interface Skeleton {
  vertices: Point[];
  segments: Array<
    | { kind: "line"; from: number; to: number }
    | { kind: "arc"; from: number; to: number; radius: number; sweep: 0 | 1 }
  >;
  /** Radius stated at one joint, overriding the language's ramp there. */
  corners: Record<number, number>;
  closed: boolean;
}
```

A skeleton is **the drawing before its corners are rounded**. It converts to and
from path data, which keeps every existing primitive, element and freeform path
usable. The rounded geometry is derived from it, never stored — consistent with
*IconSpec is canonical, SVG is a render target*: change the ramp and every
skeleton in the set re-rounds.

This is also what makes the editor buildable. Dragging a vertex of a polyline is
tractable; dragging a control point of a cubic whose neighbours must stay
tangent is not. **The skeleton is why the point editor is a week and not a
quarter.**

## Tidy — `tidy()`

Lucide's `optimize.ts` is 1,230 lines and ~20 passes, run twice, each wrapped so
a pass that throws is skipped rather than killing the operation. Both of those
properties port: some passes only become applicable after earlier ones have
normalised things, and geometry from a cut or a paste is exactly the input that
makes a pass throw.

| Lucide pass | Here | Why |
| --- | --- | --- |
| `format` | ✅ | Round to 3 decimals. Already how the renderer emits. |
| `elementsToPath` | ✅ | `shapeToPathData` exists. |
| `smartClose` | ✅ | Weld a near-closed subpath shut. |
| `fixDots` | ✅ | A zero-length segment is a dot — and `optics.dotRatio` already says how big a dot is. |
| `mergeLines` | ✅ | Collinear runs become one segment. |
| `snapLinesToIntersection` | ✅ | The pass that makes a hand-drawn corner an actual corner. |
| `removeTinySegments` | ✅ | Threshold from the language, not a constant. |
| `mergeArcs`, `mergePaths` | ✅ | Fragments after a cut are the whole reason. |
| `segmentsToArc` | ⚠️ | Only useful for imported geometry. Defer. |
| `optimizeRect/Ellipse/HalfCircle`, `pathsToElement` | ✅✅ | **The most valuable pass here.** In Lucide, promoting four lines to a `<rect>` is cosmetic. Here it re-attaches drawn geometry to a *named primitive*, which carries construction traits and re-renders when the language changes. |
| `removeBackdrop` | ✅ | Drop a full-canvas rect. |
| `fillSmallCircles` | ⚠️ | Overlaps `fixDots`. Fold in. |
| `svgo` | ❌ | Our renderer already emits minimal deterministic SVG. Adding svgo would add a dependency to undo work we never did. |

Thresholds come from the language — `grid`, `stroke.width`, `minNegativeSpace`,
`minCutout` — rather than from constants, so tidying a 16px language and a 32px
one are not the same operation.

## Arcify — `arcify()`

The radius ramp becomes a language token:

```json
"construction": {
  "corners": [
    { "upTo": 60,  "radius": 0.5 },
    { "upTo": 120, "radius": 1 },
    {              "radius": 2 }
  ]
}
```

Stated in units at the primary optical size and scaled per size, like every
other length here.

**Defaults are derived, not imported.** Lucide's 2 / 1 / 0.5 are right for a
24-unit canvas with a 2px stroke; this project already names unevidenced
thresholds as its largest gap, and copying three magic numbers would add three
more. So the middle band defaults to the existing `cornerRadius` token, the
gentle band to `×2` and the sharp band to `×0.5`. Every existing language keeps
its present behaviour, a team that wants one number still has one, and the ramp
is there for a team that wants the method.

The two special cases are understood rather than copied. For a 90° corner
between two diagonals, `(1+√2)/2` places the arc's apex exactly **0.5 units**
from the true corner — a half step on Lucide's fixed grid. Our `grid` is a token
that differs per size, so the general rule is *snap the corner so it lands on the
grid*, which produces Lucide's constants at Lucide's grid and the right number
at every other.

Arcify runs at two moments: as an editor action, and at compose time for any
skeleton whose corners have not been overridden. The second is what makes corner
consistency structural rather than hoped for.

## Offify — `offify()`

Lucide's version is the odd one out: async, admin-gated, and dependent on an
Inkscape service behind `HOOK_URL` doing `select-all,path-cut`. **None of that is
needed here**, because we know what the geometry *is* rather than receiving it as
opaque path data.

The band is a strip between two parallel lines. Cutting against it is:

- **Outline style** — clip each stroke against two parallel half-planes. A line
  gives a linear root, an arc a quadratic, a cubic a cubic. Keep the pieces whose
  midpoint is outside the band. This is ordinary segment clipping, not boolean
  path algebra, and it is exact.
- **Filled style** — the band is added to the even-odd path as a **cutout**,
  which the renderer already does for every knock-out in the filled style. Close
  to free.

The slash itself comes from the language rather than from `M2 2 L 22 22`:

| Lucide | Here |
| --- | --- |
| Hardcoded diagonal | Direction from `grammar.diagonal`, angle from `grammar.angles` |
| Hardcoded band width | `stroke.width + 2 × minNegativeSpace` — the gap rule the language already states |
| Fixed 24px geometry | Scales per optical size |

So a team's `-off` icons match their language automatically, which the original
cannot do. And it runs in the browser, offline, for everyone — no service, no
admin role, no key.

The result is a **variant of the record**, like the filled version built in
M19–M21. That generalises `IconRecord.filled` into a variants map before a
second special case is hardcoded:

```ts
variants?: { filled?: Variant; off?: Variant };
```

## The Method tab

A third tab in the canvas row, beside Parts and Keylines. The row is views of the
drawing, and the three now answer the three questions a set has to answer:

| Tab | Asks |
| --- | --- |
| Parts | Do these look like the work of one hand? |
| Keylines | Are they the same size? |
| **Method** | **Are they built the same way?** |

**Middle column** — the selected part as its skeleton: vertices draggable,
snapping to the grid and to the angle set, segments coloured by angle, each joint
labelled with the radius the ramp gave it, and a skeleton ↔ rounded toggle. A
modifier key leaves the angle set, and doing so marks the part the same way a
trait exception does. The three actions sit on its toolbar with the keybindings
they have in Lucide Studio.

**Right column** — every construction decision, in one place for the first time.
Today they are scattered across all three columns: principles are prose on the
left, axes are under "The hand", angles under "Rules", corner radius under
"Sizes". That scattering is the reason it does not feel like one place to set the
language.

1. Personality axes — the *input*, with what they derive shown beside them
2. Angle set and tolerance
3. The radius ramp, drawn as sample corners at 30/60/90/120/150° at true size
4. Curve policy — how rare "extremely rare" is, and it is measured
5. Caps, joins, and the existing construction traits

The ramp needs the picture, not a number field. It is the one rule nobody can
see, and the row of sample corners redrawing under a drag is what makes it real.

## What the agent is told

The prompt already states the angle set and that corners come from the language.
What it lacks is the method and the refusals:

1. Draw the **skeleton** first: straight segments, on the angle set, on the grid.
   The engine rounds the joints.
2. An organic form is a polygon, not a circle. A cloud is straight segments with
   rounded joins. So is a flame.
3. Curves are exceptional, with a stated budget and a stated reason.

And the stronger half: `propose_element` takes a skeleton rather than path data,
so a model that has never read the prompt still cannot break the rule. Models are
unreliable at tangent arcs — they emit arcs whose radius and sweep do not meet
the adjoining lines, and it looks almost right. Removing the opportunity is worth
more than instructing against it.

## Milestones

| | What becomes true |
| --- | --- |
| **M22** | A skeleton exists, converts to and from path data, and every tool has one representation to share. |
| **M23** | Tidy: the pass pipeline, run twice, each pass caught, thresholds from the language. |
| **M24** | Arcify: the ramp is a language token, applied as an action and at compose time. |
| **M25** | The Method tab: the point editor, the three actions, the construction rail. |
| **M26** | Offify: in-process clipping, the slash from tokens, `off` as a record variant. |

Offify is last because it is the pass that most needs Tidy behind it, and the
editor comes before it so there is somewhere to watch it work.

## Risks

**The skeleton must not become a second source of truth.** If geometry can be
either a skeleton or path data, every pass needs two implementations and they
will drift. Path data stays the storage format; the skeleton is a parse of it,
the way `ResolvedSpec` is a parse of an `IconSpec`.

**Compose-time rounding costs something on every render.** Today paths are parsed
and passed through. Corner detection on every icon on every render is real work,
and the studio redraws the whole parts canvas on every slider drag. If it shows
up, the answer is memoising on (skeleton, ramp), not baking radii into storage.

**Clipping an arc against a band is the one genuinely fiddly piece of maths**
in this plan, and the place a wrong answer will be subtle rather than obvious.
It needs property tests — clip, then measure that every remaining point is
outside the band and that total length only decreased — rather than three
hand-picked examples.
