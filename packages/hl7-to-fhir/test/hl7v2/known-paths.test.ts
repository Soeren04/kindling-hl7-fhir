import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

import {
  knownPaths,
  knownPathsFile,
  knownPathsSource,
} from "../../../../scripts/known-paths-source";

describe("known paths", () => {
  it("match the committed file, which `pnpm update:known-paths` rewrites", () => {
    const committed = readFileSync(
      new URL(`../../../../${knownPathsFile}`, import.meta.url),
      "utf8",
    );
    expect(committed).toBe(knownPathsSource());
  });

  it("name fields and components of composite fields, and nothing deeper", () => {
    const paths = new Set(knownPaths());
    expect(paths).toContain("PID.5");
    expect(paths).toContain("PID.5.1");
    expect(paths).toContain("MSH.9.2");
    expect(paths).not.toContain("PID.5.1.1");
    expect(paths).not.toContain("PID.5[1]");
    expect(paths).not.toContain("PID.40");
  });

  it("stop at the field for a primitive or varying data type", () => {
    const paths = new Set(knownPaths());
    expect(paths).toContain("PID.1");
    expect(paths).not.toContain("PID.1.1");
    expect(paths).toContain("OBX.5");
    expect(paths).not.toContain("OBX.5.1");
  });

  it("contain no path twice", () => {
    const paths = knownPaths();
    expect(new Set(paths).size).toBe(paths.length);
  });
});
