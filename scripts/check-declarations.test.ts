import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { findDeclarationProblems } from "./check-declarations.mjs";

const problemsOf = (text: string): string[] =>
  findDeclarationProblems(new Map([["hl7v2.d.ts", text]]));

const documentedUnion = [
  "/**",
  " * Why it failed.",
  " *",
  " * - `EMPTY` (error): nothing there.",
  " * - `TOO_LONG`: more than fits.",
  " */",
  'type FailureCode = "EMPTY" | "TOO_LONG";',
].join("\n");

describe("findDeclarationProblems", () => {
  it("accepts declarations that are clean", () => {
    expect(
      problemsOf(`${documentedUnion}\nexport type { FailureCode };`),
    ).toStrictEqual([]);
  });

  it("reports a generated name once, however often it is used", () => {
    expect(
      problemsOf(
        "interface Segment$1 {}\ndeclare const a: Segment$1;\ntype Field$2 = Segment$1;",
      ),
    ).toStrictEqual([
      "hl7v2.d.ts contains the generated name Segment$1; two declarations share a name, rename one in the source",
      "hl7v2.d.ts contains the generated name Field$2; two declarations share a name, rename one in the source",
    ]);
  });

  it("does not take a dollar sign in a string for a generated name", () => {
    expect(problemsOf('type Price = "costs $5";')).toStrictEqual([]);
  });

  it.each(["ADR 0008", "ADR-0008", "ADR0008"])(
    "reports a reference to %s",
    (reference) => {
      expect(problemsOf(`/** Reads fields (${reference}). */`)).toStrictEqual([
        `hl7v2.d.ts refers to ${reference}, which users cannot open; state the rule in the doc comment instead`,
      ]);
    },
  );

  it("does not report the word ADR without a number", () => {
    expect(problemsOf("/** An ADR explains why. */")).toStrictEqual([]);
  });

  it("reports a code that the doc comment leaves out", () => {
    const text = documentedUnion.replace(
      '"EMPTY" | "TOO_LONG"',
      '"EMPTY" | "TOO_LONG" | "NEW"',
    );
    expect(problemsOf(text)).toStrictEqual([
      "hl7v2.d.ts: FailureCode does not document NEW",
    ]);
  });

  it("reports a documented code that the union does not contain", () => {
    const text = documentedUnion.replace('"EMPTY" | "TOO_LONG"', '"EMPTY"');
    expect(problemsOf(text)).toStrictEqual([
      "hl7v2.d.ts: FailureCode documents TOO_LONG, which it does not contain",
    ]);
  });

  it("reports a union without a doc comment, also when another comment precedes it", () => {
    const text =
      '/** Something else. */\ntype Other = 1;\ntype FailureCode = "EMPTY";';
    expect(problemsOf(text)).toStrictEqual([
      "hl7v2.d.ts: FailureCode has no doc comment listing its codes",
    ]);
  });

  it("reads the codes of an Extract union", () => {
    const text = [
      "/**",
      " * - `A`: first.",
      " */",
      'type SubCode = Extract<IssueCode, "A" | "B">;',
    ].join("\n");
    expect(problemsOf(text)).toStrictEqual([
      "hl7v2.d.ts: SubCode does not document B",
    ]);
  });

  it("ignores types whose name does not end in Code", () => {
    expect(problemsOf('type Severity = "error" | "info";')).toStrictEqual([]);
  });
});

describe("the script", () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function run(files: Record<string, string>) {
    const directory = mkdtempSync(path.join(tmpdir(), "declarations-"));
    directories.push(directory);
    for (const [name, text] of Object.entries(files)) {
      writeFileSync(path.join(directory, name), text);
    }
    return spawnSync(
      process.execPath,
      [path.join(import.meta.dirname, "check-declarations.mjs"), directory],
      { encoding: "utf8" },
    );
  }

  it("succeeds for clean declarations", () => {
    expect(run({ "index.d.ts": documentedUnion }).status).toBe(0);
  });

  it("fails and names the problem", () => {
    const result = run({ "index.d.ts": "interface Segment$1 {}" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Declarations: index.d.ts contains");
  });

  it("fails when there are no declarations", () => {
    const result = run({});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no .d.ts files");
  });
});
