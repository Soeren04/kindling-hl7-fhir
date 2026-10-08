import path from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

// The fixtures are globally ignored so they never break `pnpm lint`; `ignore: false` lints them anyway.
const eslint = new ESLint({ cwd: repositoryRoot, ignore: false });

async function errorRuleIds(fixture: string): Promise<readonly string[]> {
  const [result] = await eslint.lintFiles([
    path.join(import.meta.dirname, "fixtures/src", fixture),
  ]);
  if (result === undefined)
    throw new Error(`ESLint returned no result for ${fixture}`);
  expect(
    result.messages.filter((message) => message.fatal === true),
  ).toStrictEqual([]);
  return result.messages
    .filter((message) => message.severity === 2)
    .map((message) => message.ruleId ?? "<no rule id>");
}

describe("ESLint configuration", () => {
  it.each([
    ["shared/explicit-any.ts", "@typescript-eslint/no-explicit-any"],
    ["shared/floating-promise.ts", "@typescript-eslint/no-floating-promises"],
    ["shared/loose-equality.ts", "eqeqeq"],
    ["shared/malformed-tsdoc.ts", "tsdoc/syntax"],
    ["shared/warning-comment.ts", "no-warning-comments"],
    [
      "hl7v2/non-exhaustive-switch.ts",
      "@typescript-eslint/switch-exhaustiveness-check",
    ],
    ["hl7v2/super-linear-move.ts", "regexp/no-super-linear-move"],
    ["fhir/class-declaration.ts", "no-restricted-syntax"],
    ["fhir/class-expression.ts", "no-restricted-syntax"],
  ])("reports exactly %s with %s", async (fixture, ruleId) => {
    expect(await errorRuleIds(fixture)).toStrictEqual([ruleId]);
  });

  it("reports a quadratic-backtracking pattern with both regexp rules", async () => {
    expect(await errorRuleIds("hl7v2/super-linear-regexp.ts")).toStrictEqual([
      "regexp/no-trivially-nested-quantifier",
      "regexp/no-super-linear-backtracking",
    ]);
  });

  describe("in portable library code", () => {
    it.each([
      ["hl7v2/node-global.ts", "no-restricted-globals"],
      ["hl7v2/buffer-global.ts", "no-restricted-globals"],
      ["hl7v2/node-import.ts", "no-restricted-imports"],
      ["hl7v2/console-output.ts", "no-console"],
    ])("reports exactly %s with %s", async (fixture, ruleId) => {
      expect(await errorRuleIds(fixture)).toStrictEqual([ruleId]);
    });

    // One fixture per portable glob: src/*.ts, src/shared, src/hl7v2 and src/fhir.
    it.each([
      "index.ts",
      "shared/process-global.ts",
      "hl7v2/node-global.ts",
      "fhir/process-global.ts",
    ])("forbids Node globals in %s", async (fixture) => {
      expect(await errorRuleIds(fixture)).toStrictEqual([
        "no-restricted-globals",
      ]);
    });
  });

  it("reports nothing for clean library code", async () => {
    expect(await errorRuleIds("hl7v2/clean.ts")).toStrictEqual([]);
  });

  it("lets the CLI use Node globals and built-in modules", async () => {
    expect(await errorRuleIds("cli/main.ts")).toStrictEqual([]);
  });
});
