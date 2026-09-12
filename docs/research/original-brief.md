# The original brief

> **Superseded, kept for the record.** This is the specification the
> project started from. [PRODUCT.md](../PRODUCT.md) explicitly rejects its
> framing of the problem — it opens with "a missing icon", which the
> product document calls "a symptom, and the least interesting one". The
> MVP scope and out-of-scope lists here are also out of date. Read it as
> history.

---

# Icon Foundry — Agentic Coding Setup & MVP Specification

## Project

**Icon Foundry**  
**GitHub description:** A design-system-native icon foundry for creating, validating, and publishing custom icons in your own visual language.

## Mission

Build an open-source system that lets a designer create custom icons that consistently belong to a defined design language, then publish those icons directly into a Figma component/library workflow.

The core principle is:

> **The design system is the source of truth. The LLM is optional.**

Do not build another generic "prompt → SVG" application. Build an **icon compiler**:

```text
Icon intent
    ↓
Icon Language + primitives
    ↓
IconSpec
    ↓
Deterministic renderer
    ↓
Validator
    ↓
Figma component
```

AI can help interpret ambiguous natural-language intent, but it must not be responsible for defining or enforcing the visual language.

---

# Product Problem

Design teams often depend on third-party icon libraries such as Lucide, Material, Phosphor, etc. These libraries provide excellent foundations but eventually fail to cover product-specific concepts.

When a missing icon is needed, designers typically:

1. Search several icon libraries.
2. Find something "close enough".
3. Modify it manually.
4. Try to match stroke, proportions, spacing, and visual weight.
5. Export it.
6. Add it to Figma.
7. Repeat the process for the next missing icon.

This creates inconsistency and continued dependency on external libraries.

Icon Foundry should allow a team to define its own icon language and create the missing icons inside that system.

---

# North Star

A designer should be able to open Figma, describe an icon, choose the team's icon language/style, preview the result, validate it, and add it to the team's icon component library.

Example:

```text
Create icon

"Temperature controlled warehouse"

Style:
● Filled
○ Outline

Icon Language:
Company Icons v0.1

[Generate]
```

The result should be a native, reusable Figma component rather than an arbitrary AI-generated SVG.

---

# Architecture Principles

## 1. Deterministic first

Prefer deterministic geometry, composition, primitives, rules, and renderers.

Do not make an LLM call for something the system can calculate.

## 2. LLM as an optional semantic layer

An LLM may convert:

```text
"temperature controlled warehouse"
```

into:

```json
{
  "subject": "warehouse",
  "modifiers": ["temperature", "cold"]
}
```

It may also suggest composition.

It should not directly control final SVG geometry whenever deterministic primitives can solve the task.

## 3. Intermediate representation

Use an intermediate `IconSpec` representation between intent and output.

Example:

```json
{
  "name": "temperature-warehouse",
  "language": "company-icons",
  "style": "filled",
  "canvas": 24,
  "elements": [
    {
      "primitive": "warehouse",
      "x": 4,
      "y": 7,
      "width": 16,
      "height": 13
    },
    {
      "primitive": "snowflake",
      "x": 14,
      "y": 3,
      "size": 6
    }
  ]
}
```

The exact schema can evolve, but the separation must remain:

**intent ≠ IconSpec ≠ SVG ≠ Figma node**

## 4. One source of truth

The canonical icon representation should not be an exported SVG.

The canonical representation should be `IconSpec`.

SVG, Figma vectors, React output, etc. are render targets.

## 5. Validation is first-class

Every generated icon should be checked against the active Icon Language before it can be considered publish-ready.

---

# MVP Scope

Keep the first version deliberately small.

## MVP Goal

Prove this complete loop:

```text
Designer
  ↓
Describe icon
  ↓
Select icon language
  ↓
Compose from primitives
  ↓
Generate IconSpec
  ↓
Render SVG/vector geometry
  ↓
Validate
  ↓
Create Figma component
```

## MVP Features

### A. Icon Language

Implement a simple JSON-based design-language schema.

Minimum properties:

- canvas size
- grid
- safe area
- stroke width
- stroke cap
- stroke join
- corner radius
- fill/outline style
- detail level
- minimum negative space

Example:

```json
{
  "name": "Lucide-inspired",
  "version": "0.1.0",
  "canvas": 24,
  "grid": 1,
  "safeArea": 2,
  "stroke": {
    "width": 2,
    "cap": "round",
    "join": "round"
  },
  "cornerRadius": 2,
  "style": {
    "default": "outline"
  }
}
```

Do not attempt to automatically learn the entire Lucide language in the MVP.

Provide a manually defined starter language inspired by the principles the project is trying to demonstrate.

### B. Primitive Library

Create a small deterministic primitive library.

Start with approximately 20–30 primitives.

Examples:

**Shapes**
- circle
- square
- rounded rectangle
- triangle
- line
- arc

**Objects**
- building
- warehouse
- package
- document
- person
- vehicle
- device

**Symbols**
- plus
- minus
- check
- x
- warning
- snowflake
- thermometer
- location
- clock
- arrow

The primitives should be composable and reusable.

### C. Icon Composer

Build a deterministic composition engine.

It should support:

- positioning
- scaling
- alignment
- layering
- grouping
- basic transformations
- optical centering hooks
- style inheritance

Example:

```json
{
  "elements": [
    {
      "primitive": "warehouse",
      "position": [4, 6],
      "size": [16, 15]
    },
    {
      "primitive": "snowflake",
      "position": [14, 3],
      "size": [6, 6]
    }
  ]
}
```

### D. Renderer

Implement SVG output first.

Requirements:

- valid SVG
- predictable paths
- deterministic output
- no unnecessary metadata
- normalized dimensions
- design-language tokens applied consistently

Keep the renderer independent of the UI.

### E. Validator

Implement basic validation rules.

At minimum:

- canvas dimensions
- safe-area violations
- stroke consistency
- cap consistency
- join consistency
- unsupported colors
- excessive path/object count
- invalid geometry
- obvious off-grid coordinates

Validation should return structured results:

```json
{
  "valid": false,
  "issues": [
    {
      "severity": "warning",
      "rule": "strokeWeight",
      "message": "Element is 12% heavier than the configured stroke weight."
    }
  ]
}
```

### F. Figma Plugin

The MVP should include a Figma plugin.

The plugin should:

1. Accept an icon description.
2. Allow selecting the Icon Language.
3. Allow selecting outline/filled style.
4. Generate an IconSpec.
5. Preview the result.
6. Run validation.
7. Create native Figma vector nodes.
8. Wrap the result in a component.
9. Apply a predictable component name.

Example:

```text
Icon Foundry

Icon
[ temperature controlled warehouse ]

Language
[ Company Icons v0.1 ]

Style
[ Filled ]

        [ Preview ]

✓ 24 × 24
✓ Safe area
✓ Stroke rules
✓ Geometry

[ Create Component ]
```

### G. Optional LLM Adapter

The MVP may include an LLM adapter, but the application must remain usable without one.

Use the LLM only for:

- natural-language intent parsing
- semantic classification
- primitive selection
- composition suggestions

The LLM output must be converted into `IconSpec` and then validated.

Never blindly trust generated SVG.

---

# Explicitly Out of Scope for MVP

Do NOT build these yet:

- fine-tuning an image/SVG generation model
- autonomous multi-agent systems
- automatic training from designer edits
- complex Bézier neural generation
- automatic visual similarity scoring
- Figma team-library publishing automation if the API introduces unnecessary complexity
- MCP server
- React/native code generation
- cloud backend
- user authentication
- collaboration
- analytics
- billing
- marketplace
- automatic ingestion of every third-party icon library

These can come later.

---

# Suggested Repository Structure

Use a clean modular architecture.

```text
icon-foundry/
│
├── apps/
│   ├── web/
│   └── figma-plugin/
│
├── packages/
│   ├── icon-language/
│   ├── icon-primitives/
│   ├── icon-composer/
│   ├── icon-spec/
│   ├── icon-renderer/
│   ├── icon-validator/
│   └── icon-ai/
│
├── languages/
│   └── lucide-inspired/
│       └── language.json
│
├── primitives/
│   ├── shapes/
│   ├── objects/
│   └── symbols/
│
├── examples/
│
├── tests/
│
├── docs/
│
├── README.md
├── AGENTS.md
├── LICENSE
└── package.json
```

The exact framework can be chosen based on the existing SVG-ORA Studio repository if it is being used as a starting point. Reuse useful infrastructure rather than rewriting everything.

---

# Development Strategy

## Phase 1 — Foundation

Build:

- TypeScript types
- IconSpec schema
- Icon Language schema
- primitive definitions
- deterministic composition engine
- SVG renderer
- unit tests

No AI required.

## Phase 2 — Validator

Build validation around the Icon Language.

Create test icons that intentionally violate rules.

## Phase 3 — Figma

Build the Figma plugin.

Start by rendering SVG/vector geometry into native Figma nodes.

## Phase 4 — Semantic generation

Add an optional LLM adapter.

Natural language:

```text
"filled icon for temperature controlled warehouse"
```

becomes structured intent:

```json
{
  "subject": "warehouse",
  "modifiers": ["temperature-controlled"],
  "style": "filled"
}
```

Then deterministic code handles composition and rendering.

## Phase 5 — Polish

Add:

- better preview
- icon naming
- component naming conventions
- regeneration
- edit IconSpec
- duplicate detection
- export
- documentation

---

# Engineering Requirements

## TypeScript

Prefer TypeScript throughout the core system.

## Determinism

Given:

```text
same IconSpec
+
same Icon Language
```

the renderer should produce the same result.

Avoid randomness in the core rendering pipeline.

## Testability

Every core package should have unit tests.

Especially test:

- IconSpec parsing
- primitive geometry
- composition
- renderer output
- validator rules

## Separation of concerns

Do not mix:

- Figma APIs
- SVG rendering
- LLM calls
- design rules
- UI state

Keep them as independent modules.

## No hidden AI dependency

The application must clearly distinguish:

```text
Core engine
AI adapter
Figma adapter
```

The core engine must work without an API key.

---

# Definition of Done for MVP

A developer should be able to clone the repository and run the project locally.

A designer should be able to:

1. Open the Figma plugin.
2. Select an Icon Language.
3. Enter an icon concept.
4. Select outline or filled.
5. Generate an icon composition.
6. Preview it.
7. See validation results.
8. Create a native Figma component.
9. Reuse that component as part of an icon library.

A developer should also be able to use the core packages without Figma:

```text
IconSpec
    ↓
Icon Language
    ↓
Renderer
    ↓
SVG
```

No LLM API key should be required for this core workflow.

---

# Agent Instructions

When implementing this project:

1. Inspect the existing repository before changing architecture.
2. Reuse existing working code where appropriate.
3. Do not introduce an LLM dependency into the core renderer.
4. Do not build a generic prompt-to-SVG generator.
5. Keep `IconSpec` as the canonical intermediate representation.
6. Keep design rules in versioned Icon Language files.
7. Keep primitives deterministic and reusable.
8. Make validation independent from rendering.
9. Make the Figma plugin an adapter over the core engine.
10. Make AI an optional adapter.
11. Prefer simple, maintainable code over premature abstraction.
12. Add tests for every core behavior.
13. Document important architectural decisions.
14. Do not implement out-of-scope features unless required to make the MVP work.
15. When a design decision is ambiguous, prefer the solution that reduces vendor/LLM dependency and preserves portability.

The first implementation milestone should produce a **working deterministic icon compiler plus a minimal Figma plugin**, not an AI demo.
