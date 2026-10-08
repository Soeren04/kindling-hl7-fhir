import { defineConfig } from "vitest/config";

// Benchmarks are not part of `pnpm test` or `pnpm verify`: the root configuration only collects `test/`. Use
// `pnpm bench` for throughput and `pnpm bench:memory` for the memory report.
export default defineConfig({
  root: new URL("..", import.meta.url).pathname,
  test: {
    include: ["bench/*.report.ts"],
    testTimeout: 120_000,
    reporters: ["verbose"],
    benchmark: { include: ["bench/*.bench.ts"] },
  },
});
