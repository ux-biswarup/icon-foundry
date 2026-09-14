import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // App tests live beside the code they exercise. The component ones are
    // `.test.tsx` and declare `@vitest-environment jsdom` for themselves, so the
    // default stays node and no package pays for a DOM it does not use. The
    // app's own pure modules are plain `.test.ts` and want no DOM at all —
    // which is the point of their being separate from the components.
    include: ["packages/*/src/**/*.test.ts", "apps/web/src/**/*.test.ts", "apps/web/src/**/*.test.tsx"],
    environment: "node",
  },
});
