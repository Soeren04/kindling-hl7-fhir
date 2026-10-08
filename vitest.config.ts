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
    ],
    coverage: {
      provider: "v8",
      include: ["packages/hl7-to-fhir/src/**"],
      thresholds: { lines: 95, branches: 95, functions: 95, statements: 95 },
    },
  },
});
