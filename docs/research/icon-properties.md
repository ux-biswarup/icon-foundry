# What actually defines an icon language

Source material, 2026-09-12. A survey of the construction rules that published
icon systems write down, run to replace the guesses in
[../proposals/construction.md](../proposals/construction.md) §5 with something
grounded.

**Method.** Five search angles, twenty-two sources fetched, a hundred and ten
claims extracted, each surviving claim adversarially verified by three
independent votes with two refutations required to kill it. Twenty claims
confirmed, five killed, merged to fifteen findings.

**The dominant caveat, stated first.** The survey named eleven systems and only
two produced claims that survived verification: Google (Material Design 1, 2, 3
and Material Symbols) and IBM (Design Language and Carbon). Nothing from Apple
SF Symbols, Lucide, Feather, Phosphor, Fluent, Spectrum, Atlassian, Salesforce
or Polaris made it through. So **"widely adopted" below means "attested by two
independent vendors"**, which is a weak recurrence signal and should be read as
a floor rather than a consensus.

---

## 1. The finding that matters most

> **Only four construction properties are exposed as machine-tunable axes
> anywhere in the verified corpus, and all four are Google's.**

Material Symbols ships `FILL` (0–1), `wght` (100–700), `GRAD` (−50–200) and
`opsz` (20–48), confirmed against the shipped font's `fvar` table rather than
the marketing page. Material Design 2 separately names exactly three
customisable attributes for authoring a theme: stroke-and-fill, corner radius,
and colour. **IBM and Carbon expose zero axes or tokens for icon geometry.**

Everything else — grid, keylines, live area, terminals, joints, projection,
pixel snapping — is prose and diagrams, in both systems, including at the vendor
that ships the most parameterised icon font in existence.

Two consequences for this project, and they point in the same direction.

**The bet is real.** Parameterising construction is not table stakes that
everyone has and we lack. Nobody has done it. The reason a set drifts is that
its rules live in prose and in one designer's head, which is precisely the
problem [PRODUCT.md](../PRODUCT.md) claims to solve.

**Style families are how the industry fakes it.** Material ships Outlined,
Rounded and Sharp as discrete hand-authored variants, where Sharp drops both
exterior and interior radii to 0 and Rounded rounds both. That is a preset, not
a parameter. It is the same move as our two bundled languages, and it is the
ceiling of what you get without a compiler.

---

## 2. Properties attested by both vendors

Ranked by strength of attestation. These are the ones to treat as language
primitives.

| Property | Google | IBM / Carbon | We have it? |
| --- | --- | --- | --- |
| **Square canvas at a named size** | 24dp standard, 20dp dense | 32px master; Carbon 16 and 32 | Yes, `canvas` per optical size |
| **Live area, padding, trim as three rings** | 20×20dp live, 2dp padding, inside 24dp | 2px padding inside 32px; Carbon 1/16 ratio | **Partly.** We have one inset (`safeArea`), not three rings |
| **Whole-pixel fitting** | "Position icons on pixel within the icon grid" | Strokes expanded to full pixel values; centre borders forbidden | **No.** Our `grid` is a layout grid and says so |
| **Uniform stroke weight** | 2dp recommended; `wght` axis | 2px fixed, 1.5px fallback for complex detail | Yes, `stroke.width` |
| **Corner radius keyed to role** | Exterior 2dp, interior square, nothing ≤2dp wide rounds | 2px, increasable in multiples of two, square arrow tips | **No.** We have one global number |
| **Joint treatment, separate from radius** | Interior corners square in the outlined style | "Rounded exteriors with 90° interiors" | **No** |
| **Projection ban** | Face forward; no tilting or dimensionality | Same, plus angles quantised to 45° and 15° | Yes, via `grammar.angles` and `freeAngles` |
| **Keyline shapes with exact dimensions** | Square 18dp, circle 20dp, rects 20×16 and 16×20 | — | Yes, `optical` boxes |
| **Optical size variants** | `opsz` retunes stroke so form reads the same | One master scaled linearly | Yes, and we take Google's position |
| **Optical compensation** | `GRAD` axis, −25 for light-on-dark | Prose: no icon heavier than another | **No** |
| **Fill / silhouette state** | `FILL` axis | — | Yes, `style` |
| **Terminals and caps** | "Stroke terminal" named in the anatomy | Square caps, distinctive tips, from IBM Plex | Yes, `stroke.cap` |

---

## 3. The four corrections this forces on our design

### Corner radius is a rule set, not a number

The single most useful finding, and it contradicts what we shipped.

> M1: "A 2dp corner radius is used on the silhouette form of the icon. **Do not
> round the corners of strokes (shapes 2dp wide or less). Interior corners
> should be square.**"
>
> M2: "The recommended corner radius values are between 0dp and 4dp. If the
> stroke is 2dp or less, the corner radius must be 1dp."
>
> IBM: "Use a consistent corner radius of 2px... **Use squared corners when
> needed to reflect the real form of the metaphor.**"

Three rules, not one value:

1. **Exterior corners take the radius. Interior corners are square.** This is
   the cleanest recurrence in the whole corpus: two independent vendors,
   different numbers, identical structure.
2. **Nothing narrower than about two stroke widths rounds at all.**
3. **The radius is capped by the stroke it sits on.**

M3 later escalated rule 1 into a style family, where Rounded deliberately rounds
interiors too. So square interiors is a property of the outlined style rather
than a law — which is exactly the shape of thing that belongs in a language file
rather than in our code.

### Optical compensation is a real axis, and it is about dark backgrounds

`GRAD` exists because **a light symbol on a dark ground reads heavier than the
same symbol inverted**, and Google's own guidance is to apply roughly −25 grade
to reduce glare in that case. It is deliberately finer than weight and barely
changes the symbol's size.

This is independent confirmation of the reason for showing every part on both
grounds at once, and it suggests the correct fix is not "look at it and adjust
the stroke" but a named grade offset that applies only on dark.

### Live area is three rings with a sanctioned overshoot

> M3: "If additional visual weight is needed, content may extend into the
> padding between the live area and the trim area... No parts of the icon should
> extend outside of the trim area."
>
> IBM: "Only extend artwork into the padding for additional visual weight."

Our `safeArea` is a single hard inset that geometry may not enter. Both vendors
instead define an inner region you should stay inside and an outer region you
must not cross, with the gap between them available on purpose. That is a better
model and it is a small change: one more token, and the `safeArea` rule becomes
a warning at the live edge and an error at the trim edge.

The two vendors disagree on the ratio — Google holds padding constant at 2dp so
the live area shrinks at smaller sizes, Carbon scales it at 1/16 — which is a
good argument for it being a token rather than a constant.

### Pixel fitting is a rule we explicitly do not have

Our `grid` token documents itself as "a layout grid for element boxes, not a
pixel-snapping rule." Both vendors treat whole-pixel geometry as a hard
production constraint: no fractional coordinates, strokes expanded to full pixel
values, centre-aligned borders forbidden because they produce half pixels.

Worth adding as a checkable rule at the primary optical size. Worth **not**
adding as a constraint on authored geometry, since our composer works in canvas
units and scales.

---

## 4. What the survey did not find, and why that is the interesting part

Two properties were asked about by name and produced **zero** verified claims
across every system searched:

- **Detail budget.** No system documents which details get dropped at small
  sizes, or at what threshold. No minimum counter size, no minimum gap, no
  maximum element count.
- **Apertures.** Material's anatomy names "counter area" and "counter stroke" as
  labelled parts, which implies a governed property, but no system states a rule
  for how an opening is drawn or how narrow it may be.

The obvious reading is that these are craft knowledge nobody writes down. That
is not an argument against having them. It is the argument for it:

> **The properties nobody documents are the ones that live only in a designer's
> head, and moving a decision out of someone's head and into the system is the
> entire filter this product is ordered by.**

So our guessed traits — aperture, interior inset, accent size, slope, arrowhead
— have no external corroboration, and they should be labelled as ours rather
than as craft consensus. They came from reading our own primitives and from the
Cursor article, which is a real source but a single team's account. Keep the
ones our primitives demand; do not claim they are industry practice.

---

## 5. Open questions the survey could not settle

1. **Does anything besides Material Symbols expose geometry as tunable
   parameters?** SF Symbols has weight and scale, Phosphor ships six weights.
   Whether those are interpolable axes or discrete hand-drawn families decides
   whether "four axes, all Google" is the true ceiling or an artifact of thin
   coverage.
2. **Redraw per size, or scale one master?** The two verified systems disagree
   outright. Material's `opsz` retunes stroke weight so the form reads the same;
   IBM scales a single 32px master, and 97% of shipped Carbon icons carry only
   the 32px asset. We have taken Google's position without having known there
   was a disagreement.
3. **What live-area ratio is right?** Google 1/12 per side held constant,
   Carbon 1/16 scaled with size. No optical rationale surfaced for either.
4. **Is there a documented aperture or detail rule anywhere?** See §4. If the
   answer is genuinely no, that is a finding rather than a gap.

---

## 6. Sources

Primary, fetched and verified:

- Material Design 1 — https://m1.material.io/style/icons.html
- Material Design 2, system icons — https://m2.material.io/design/iconography/system-icons.html
- Material Design 3, designing icons — https://m3.material.io/styles/icons/designing-icons
- Material Symbols developer docs — https://developers.google.com/fonts/docs/material_symbols
- IBM Design Language, UI icons — https://www.ibm.com/design/language/iconography/ui-icons/design/
- IBM Design Language, contributing — https://www.ibm.com/design/language/iconography/ui-icons/contribute/
- Carbon, contribute icons — https://v10.carbondesignsystem.com/contributing/contribute-icons/
- OpenType design-variation axis registry — https://learn.microsoft.com/en-us/typography/opentype/spec/dvaraxisreg

Fetched but produced no claim that survived verification: Apple SF Symbols
guidelines and WWDC 2021 session 10250, Lucide's icon design guide and design
principles, Tabler, Shopify Polaris, Adobe Spectrum, Atlassian, Fluent 2,
Salesforce Lightning, GitHub Primer Octicons.

Related reading already in this folder: [cursor-icons.md](cursor-icons.md),
which is one team's account rather than a published specification, and which
supplied several of the trait guesses this survey could not corroborate.
