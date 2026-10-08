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
    ["shared/warning-comment.ts", "no-warning-comments"],
    ["hl7v2/node-global.ts", "no-restricted-globals"],
    ["hl7v2/node-import.ts", "no-restricted-imports"],
    ["hl7v2/super-linear-regexp.ts", "regexp/no-super-linear-backtracking"],
    ["fhir/class-declaration.ts", "no-restricted-syntax"],
  ])("reports %s with %s", async (fixture, ruleId) => {
    expect(await errorRuleIds(fixture)).toContain(ruleId);
  });

  it("reports nothing for clean library code", async () => {
    expect(await errorRuleIds("hl7v2/clean.ts")).toStrictEqual([]);
  });

  it("lets the CLI use Node globals and built-in modules", async () => {
    const ruleIds = await errorRuleIds("cli/main.ts");
    expect(ruleIds).not.toContain("no-restricted-globals");
    expect(ruleIds).not.toContain("no-restricted-imports");
  });
});
