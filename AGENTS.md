# Icon Foundry — agent notes

The full product and MVP specification lives in [docs/AGENTS.md](docs/AGENTS.md).
Architecture decisions are recorded in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Commands

```bash
pnpm install          # workspace install (Node 20+, pnpm 10)
pnpm typecheck        # tsc for core packages + the Figma plugin
pnpm test             # vitest across all packages
pnpm build            # bundle the Figma plugin into apps/figma-plugin/dist
pnpm examples         # render examples/*.json to examples/out and print validation
pnpm check            # typecheck + test + build
```

## Non-negotiables

1. `IconSpec` is the canonical representation. SVG and Figma nodes are outputs.
2. Core packages (`packages/*`) are deterministic: no randomness, no network, no Figma API, no vendor SDK.
3. Design rules live in versioned language files under `languages/`, never hard-coded in renderers.
4. Validation is independent from rendering.
5. The Figma plugin and the AI layer are adapters over the core engine; the core must work without either.
6. Every core behaviour gets a unit test next to its source.
