import { defineConfig } from "vitest/config";

// Type tests (`*.test-d.ts`) are checked by `tsc` in `pnpm typecheck`, not by Vitest's experimental typecheck mode.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "hl7-to-fhir",
          root: "packages/hl7-to-fhir",
          include: ["test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "tooling",
          include: ["tooling/*.test.ts", "scripts/*.test.ts"],
          // Type-aware linting of the fixtures starts a TypeScript program, which takes a few seconds.
          testTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      // The library, whose quality is the product, and the scripts that gate commits, releases and packages.
      // The tooling fixtures and tests are inputs and checks, not code to cover.
      include: ["packages/hl7-to-fhir/src/**", "scripts/**/*.mjs"],
      // Only copies files and is run by `npm pack` (see `pnpm check:package`).
      exclude: ["scripts/copy-package-files.mjs"],
      thresholds: { lines: 95, branches: 95, functions: 95, statements: 95 },
    },
  },
});
