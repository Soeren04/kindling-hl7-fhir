import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  platform: "neutral",
  target: "es2022",
  tsconfig: "tsconfig.lib.json",
  dts: true,
  // The output is unminified and mirrors the sources, so stack traces stay readable without source maps, and the
  // package does not ship maps that point into the unpublished src/ directory.
  sourcemap: false,
  clean: true,
});
