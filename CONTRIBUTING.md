# Contributing

Thanks for helping build Icon Foundry.

## Setup

```bash
pnpm install
pnpm check
```

Requires Node 20+ and pnpm 10 (`corepack enable` will pick up the pinned version).

## Adding a primitive

1. Create it in `packages/icon-primitives/src/{shapes,objects,symbols}/index.ts` with `definePrimitive`.
2. Author geometry in a natural box (24-unit scale works well) and keep it a pure function of `PrimitiveContext`.
3. Add it to the category array at the bottom of the file. The registry and the primitive test suite pick it up automatically.
4. Add keywords so the intent parser can find it.

## Adding a validation rule

1. Add a `defineRule` in `packages/icon-validator/src/rules/index.ts` and append it to `builtInRules`.
2. Add a test with an intentionally violating spec in `validate.test.ts`.

## Adding an Icon Language

Copy `languages/lucide-inspired/language.json`, change the `id`, tune the tokens, and register it in `packages/icon-language/src/index.ts`.

## Pull requests

- Keep the core packages free of Figma, network and vendor SDK imports.
- Run `pnpm check` before opening a PR. CI runs the same command.
