import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Benchmarks are not part of `pnpm test` or `pnpm verify`: the root configuration only collects `test/`. Use
// `pnpm bench` for throughput and `pnpm bench:memory` for the memory report.
export default defineConfig({
  root: new URL("..", import.meta.url).pathname,
  resolve: {
    // Measure the built output, not the sources: `pnpm bench` and `pnpm bench:memory` build first.
    alias: {
      "hl7-to-fhir/hl7v2": fileURLToPath(
        new URL("../dist/hl7v2.js", import.meta.url),
      ),
    },
  },
  test: {
    include: ["bench/*.report.ts"],
    testTimeout: 120_000,
    reporters: ["verbose"],
    benchmark: { include: ["bench/*.bench.ts"] },
  },
});
