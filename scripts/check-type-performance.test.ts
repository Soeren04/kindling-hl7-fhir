import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  findBudgetProblems,
  readInstantiations,
} from "./check-type-performance.mjs";

describe("readInstantiations", () => {
  it("reads the count from the diagnostics", () => {
    const output = [
      "Files:                         67",
      "Types:                       4535",
      "Instantiations:              5361",
      "Memory used:               70000K",
    ].join("\n");
    expect(readInstantiations(output)).toBe(5361);
  });

  it.each([
    ["empty output", ""],
    ["other counters", "Types: 12\nSymbols: 5"],
    ["a count in a longer line", "Total Instantiations: 7"],
  ])("finds nothing in %s", (_description, output) => {
    expect(readInstantiations(output)).toBeUndefined();
  });
});

describe("findBudgetProblems", () => {
  it("accepts a count at or below the budget", () => {
    expect(findBudgetProblems(100, 100)).toStrictEqual([]);
    expect(findBudgetProblems(0, 100)).toStrictEqual([]);
  });

  it("rejects a count above the budget and names both numbers", () => {
    const [problem, ...others] = findBudgetProblems(101, 100);
    expect(others).toStrictEqual([]);
    expect(problem).toContain("101");
    expect(problem).toContain("100");
  });

  it("rejects a missing measurement", () => {
    expect(findBudgetProblems(undefined, 100)).toHaveLength(1);
  });
});

const script = path.resolve(import.meta.dirname, "check-type-performance.mjs");
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

/** Runs the script on a tiny project whose source is `source`. */
function check(source: string, ...args: string[]) {
  const root = mkdtempSync(path.join(tmpdir(), "type-performance-"));
  directories.push(root);
  writeFileSync(path.join(root, "index.ts"), source);
  writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { types: [], noEmit: true, strict: true },
      files: ["index.ts"],
    }),
  );
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

describe("check-type-performance.mjs", () => {
  it("accepts a project within the budget", () => {
    const result = check(
      "export const one: number = 1;",
      "tsconfig.json",
      "1000000",
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(
      /^Type budget: \d+ of 1000000 instantiations\.\n$/u,
    );
    expect(result.stderr).toBe("");
  });

  it("rejects a project over the budget", () => {
    const result = check("export const one: number = 1;", "tsconfig.json", "1");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("exceed the budget of 1");
  });

  it("fails on a type error instead of measuring", () => {
    const result = check(
      'export const one: number = "1";',
      "tsconfig.json",
      "1000000",
    );
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain("TS2322");
  });

  it.each([
    ["no arguments", []],
    ["a missing budget", ["tsconfig.json"]],
    ["a budget that is not a number", ["tsconfig.json", "many"]],
    ["a budget of zero", ["tsconfig.json", "0"]],
  ])("fails with a usage message for %s", (_description, args) => {
    const result = check("export {};", ...args);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Usage: check-type-performance.mjs <tsconfig> <budget>",
    );
  });
});
