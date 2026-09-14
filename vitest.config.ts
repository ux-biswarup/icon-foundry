import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // App tests live beside the components they exercise. They are `.test.tsx`
    // and declare `@vitest-environment jsdom` for themselves, so the default
    // stays node and no package pays for a DOM it does not use.
    include: ["packages/*/src/**/*.test.ts", "apps/web/src/**/*.test.tsx"],
    environment: "node",
  },
});
