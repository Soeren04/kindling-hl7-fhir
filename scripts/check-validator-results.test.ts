import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  collectIssues,
  collectValidatedFiles,
  findMissingFiles,
  findValidationProblems,
  parseAllowlist,
} from "./check-validator-results.mjs";

const messageId = (id: string) => ({
  url: "http://hl7.org/fhir/StructureDefinition/operationoutcome-message-id",
  valueString: id,
});

const outcome = (file: string, issues: readonly object[]) => ({
  resourceType: "OperationOutcome",
  extension: [
    {
      url: "http://hl7.org/fhir/StructureDefinition/operationoutcome-file",
      valueString: file,
    },
  ],
  issue: issues,
});

const warning = {
  severity: "warning",
  code: "invariant",
  extension: [messageId("BUNDLE_BUNDLE_ENTRY_NOTFOUND")],
  expression: ["Bundle.entry[0]"],
  diagnostics: "Example warning",
};

describe("collectIssues", () => {
  it("reads the issues of a single OperationOutcome", () => {
    expect(collectIssues(outcome("bundle.json", [warning]))).toStrictEqual([
      {
        severity: "warning",
        messageId: "BUNDLE_BUNDLE_ENTRY_NOTFOUND",
        file: "bundle.json",
        location: "Bundle.entry[0]",
        text: "Example warning",
      },
    ]);
  });

  it("reads the issues of every OperationOutcome in a Bundle", () => {
    const output = {
      resourceType: "Bundle",
      entry: [
        { resource: outcome("a.json", [warning]) },
        {
          resource: outcome("b.json", [
            {
              severity: "error",
              location: ["Patient.gender"],
              details: { text: "Bad code" },
            },
          ]),
        },
      ],
    };
    expect(collectIssues(output)).toStrictEqual([
      expect.objectContaining({ file: "a.json", severity: "warning" }),
      {
        severity: "error",
        messageId: "<none>",
        file: "b.json",
        location: "Patient.gender",
        text: "Bad code",
      },
    ]);
  });

  it("returns no issues for a clean OperationOutcome", () => {
    expect(collectIssues(outcome("bundle.json", []))).toStrictEqual([]);
  });

  it.each([
    ["without entries", { resourceType: "Bundle", entry: [] }],
    ["without an entry list", { resourceType: "Bundle" }],
  ])("rejects a Bundle %s because nothing was validated", (_d, output) => {
    expect(() => collectIssues(output)).toThrow(
      "The validator output is a Bundle without entries",
    );
  });

  it("reports an issue without a usable severity as unknown", () => {
    const issues = collectIssues(
      outcome("bundle.json", [{ extension: [messageId("ODD")] }]),
    );
    expect(issues).toStrictEqual([
      {
        severity: "<unknown severity>",
        messageId: "ODD",
        file: "bundle.json",
        location: "<unknown location>",
        text: "",
      },
    ]);
    expect(findValidationProblems(issues, [])).toStrictEqual([
      "<unknown severity> ODD in bundle.json at <unknown location>: ",
    ]);
  });

  it.each([
    ["a non-object", "oops"],
    ["another resource type", { resourceType: "Patient" }],
    [
      "a Bundle with a non-OperationOutcome entry",
      {
        resourceType: "Bundle",
        entry: [{ resource: { resourceType: "Patient" } }],
      },
    ],
  ])("rejects %s", (_description, output) => {
    expect(() => collectIssues(output)).toThrow(
      "neither an OperationOutcome nor a Bundle",
    );
  });
});

describe("collectValidatedFiles", () => {
  it("names the file of every OperationOutcome", () => {
    const output = {
      resourceType: "Bundle",
      entry: [
        { resource: outcome("/home/runner/work/a.json", []) },
        { resource: outcome("b.json", [warning]) },
        { resource: { resourceType: "OperationOutcome", issue: [] } },
      ],
    };
    expect(collectValidatedFiles(output)).toStrictEqual([
      "/home/runner/work/a.json",
      "b.json",
    ]);
  });
});

describe("findMissingFiles", () => {
  it("matches files by the end of their path", () => {
    expect(
      findMissingFiles(
        ["/home/runner/work/golden/a.bundle.json", "golden\\b.bundle.json"],
        ["golden/a.bundle.json", "golden/b.bundle.json"],
      ),
    ).toStrictEqual([]);
  });

  it("reports an expected file the validator wrote no outcome for", () => {
    expect(
      findMissingFiles(
        ["golden/a.bundle.json"],
        ["golden/a.bundle.json", "golden/c.bundle.json"],
      ),
    ).toStrictEqual([
      "the validator output has no outcome for golden/c.bundle.json",
    ]);
  });

  it("does not take a file for another that only ends like it", () => {
    expect(
      findMissingFiles(["xa.bundle.json"], ["a.bundle.json"]),
    ).toHaveLength(1);
  });
});

describe("findValidationProblems", () => {
  const issue = {
    severity: "warning",
    messageId: "SOME_WARNING",
    file: "/work/golden/bundle.json",
    location: "Bundle",
    text: "Something to look at",
  };
  const allowed = {
    messageId: "SOME_WARNING",
    text: undefined,
    file: undefined,
    reason: "Expected for collection bundles",
  };
  const unusedProblem = (description: string) =>
    `allowlisted warning (${description}) no longer occurs; remove it from the allowlist`;

  it("passes when there are only information issues", () => {
    expect(
      findValidationProblems([{ ...issue, severity: "information" }], []),
    ).toStrictEqual([]);
  });

  it.each(["fatal", "error"])(
    "fails on %s issues even when an entry matches them",
    (severity) => {
      expect(
        findValidationProblems([{ ...issue, severity }], [allowed]),
      ).toStrictEqual([
        `${severity} SOME_WARNING in /work/golden/bundle.json at Bundle: Something to look at`,
        unusedProblem("messageId SOME_WARNING"),
      ]);
    },
  );

  it("fails on a warning that is not allowlisted", () => {
    expect(findValidationProblems([issue], [])).toStrictEqual([
      "warning SOME_WARNING in /work/golden/bundle.json at Bundle: Something to look at",
    ]);
  });

  it("accepts a warning by its message id", () => {
    expect(findValidationProblems([issue, issue], [allowed])).toStrictEqual([]);
  });

  it("accepts a warning that has no message id by its text", () => {
    const entry = { ...allowed, messageId: undefined, text: "to look at" };
    expect(
      findValidationProblems([{ ...issue, messageId: "<none>" }], [entry]),
    ).toStrictEqual([]);
  });

  it("does not match a text that the issue text lacks", () => {
    const entry = { ...allowed, messageId: undefined, text: "something else" };
    expect(findValidationProblems([issue], [entry])).toStrictEqual([
      "warning SOME_WARNING in /work/golden/bundle.json at Bundle: Something to look at",
      unusedProblem('text "something else"'),
    ]);
  });

  it("needs every key of an entry to match", () => {
    const entry = { ...allowed, text: "to look at" };
    expect(findValidationProblems([issue], [entry])).toStrictEqual([]);
    expect(
      findValidationProblems([{ ...issue, messageId: "OTHER" }], [entry]),
    ).toStrictEqual([
      "warning OTHER in /work/golden/bundle.json at Bundle: Something to look at",
      unusedProblem('messageId SOME_WARNING, text "to look at"'),
    ]);
    expect(
      findValidationProblems([{ ...issue, text: "Different" }], [entry]),
    ).toHaveLength(2);
  });

  it("restricts an entry with a file to that file", () => {
    const entry = { ...allowed, file: "golden/bundle.json" };
    expect(findValidationProblems([issue], [entry])).toStrictEqual([]);
    expect(
      findValidationProblems([{ ...issue, file: "/work/other.json" }], [entry]),
    ).toStrictEqual([
      "warning SOME_WARNING in /work/other.json at Bundle: Something to look at",
      unusedProblem("messageId SOME_WARNING, file golden/bundle.json"),
    ]);
  });

  it("matches the file by whole path segments, also with backslashes", () => {
    const entry = { ...allowed, file: "golden/bundle.json" };
    const windows = { ...issue, file: String.raw`C:\work\golden\bundle.json` };
    expect(findValidationProblems([windows], [entry])).toStrictEqual([]);
    const longer = { ...issue, file: "/work/xgolden/bundle.json" };
    expect(findValidationProblems([longer], [entry])).toHaveLength(2);
  });

  it("fails on an entry that no warning matches", () => {
    expect(findValidationProblems([], [allowed])).toStrictEqual([
      unusedProblem("messageId SOME_WARNING"),
    ]);
  });

  it("reports each unused entry on its own", () => {
    const other = { ...allowed, messageId: undefined, text: "Unrelated" };
    expect(findValidationProblems([issue], [allowed, other])).toStrictEqual([
      unusedProblem('text "Unrelated"'),
    ]);
  });
});

describe("parseAllowlist", () => {
  it("reads message ids, texts, files and reasons", () => {
    const allowlist = {
      warnings: [
        { messageId: "SOME_WARNING", reason: "Expected" },
        { text: "a text", file: "a/b.json", reason: "Also expected" },
        { messageId: "OTHER", text: "a text", reason: "Both" },
      ],
    };
    expect(parseAllowlist(allowlist)).toStrictEqual([
      {
        messageId: "SOME_WARNING",
        text: undefined,
        file: undefined,
        reason: "Expected",
      },
      {
        messageId: undefined,
        text: "a text",
        file: "a/b.json",
        reason: "Also expected",
      },
      {
        messageId: "OTHER",
        text: "a text",
        file: undefined,
        reason: "Both",
      },
    ]);
  });

  it("rejects a file without a warnings array", () => {
    expect(() => parseAllowlist({})).toThrow('needs a "warnings" array');
  });

  it("rejects an entry that is not an object", () => {
    expect(() => parseAllowlist({ warnings: ["SOME_WARNING"] })).toThrow(
      "must be an object",
    );
  });

  it.each([
    ["a missing reason", { messageId: "SOME_WARNING" }],
    ["a blank reason", { messageId: "SOME_WARNING", reason: "  " }],
    ["a reason that is no string", { text: "a text", reason: 1 }],
  ])("rejects an entry with %s", (_description, entry) => {
    expect(() => parseAllowlist({ warnings: [entry] })).toThrow(
      "needs a non-empty reason",
    );
  });

  it.each([
    ["neither", { reason: "Expected" }],
    ["only a file", { file: "a/b.json", reason: "Expected" }],
  ])("rejects an entry with %s of messageId and text", (_d, entry) => {
    expect(() => parseAllowlist({ warnings: [entry] })).toThrow(
      "needs a messageId or a text to match",
    );
  });

  it.each([
    ["messageId", { messageId: 1, reason: "Expected" }],
    ["text", { text: "", reason: "Expected" }],
    ["file", { text: "a text", file: ["a"], reason: "Expected" }],
  ])("rejects a %s that is not a non-empty string", (key, entry) => {
    expect(() => parseAllowlist({ warnings: [entry] })).toThrow(
      `The allowlist key "${key}" must be a non-empty string`,
    );
  });

  it("accepts the committed allowlist", async () => {
    const { default: allowlist } =
      (await import("../packages/hl7-to-fhir/test/validator-allowlist.json")) as {
        default: unknown;
      };
    expect(() => parseAllowlist(allowlist)).not.toThrow();
  });
});

const script = path.resolve(import.meta.dirname, "check-validator-results.mjs");
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function check(output: unknown, allowlist: unknown, ...files: string[]) {
  const directory = mkdtempSync(path.join(tmpdir(), "validator-results-"));
  directories.push(directory);
  const outputPath = path.join(directory, "output.json");
  const allowlistPath = path.join(directory, "allowlist.json");
  writeFileSync(outputPath, JSON.stringify(output));
  writeFileSync(allowlistPath, JSON.stringify(allowlist));
  return spawnSync(
    process.execPath,
    [script, outputPath, allowlistPath, ...files],
    { encoding: "utf8" },
  );
}

describe("check-validator-results.mjs", () => {
  const allowlist = {
    warnings: [
      { messageId: "BUNDLE_BUNDLE_ENTRY_NOTFOUND", reason: "Expected" },
    ],
  };
  const textAllowlist = {
    warnings: [{ text: "Example", file: "bundle.json", reason: "Expected" }],
  };

  it("passes when only allowlisted warnings occur", () => {
    expect(check(outcome("bundle.json", [warning]), allowlist)).toMatchObject({
      status: 0,
      stdout: "FHIR validator: 1 issue(s), 0 problem(s).\n",
      stderr: "",
    });
  });

  it("passes a warning without message id that an entry matches by text", () => {
    const withoutId = { ...warning, extension: [] };
    expect(
      check(outcome("/work/bundle.json", [withoutId]), textAllowlist),
    ).toMatchObject({ status: 0, stderr: "" });
  });

  it("fails an entry restricted to another file and names it as unused", () => {
    const result = check(outcome("other.json", [warning]), textAllowlist);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'allowlisted warning (text "Example", file bundle.json) no longer occurs',
    );
  });

  it("fails and names the problem when a warning is not allowlisted", () => {
    const result = check(outcome("bundle.json", [warning]), { warnings: [] });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("FHIR validator: 1 issue(s), 1 problem(s).\n");
    expect(result.stderr).toBe(
      "warning BUNDLE_BUNDLE_ENTRY_NOTFOUND in bundle.json at Bundle.entry[0]: Example warning\n",
    );
  });

  it("fails when a file passed after the allowlist has no outcome", () => {
    const result = check(
      outcome("bundle.json", [warning]),
      allowlist,
      "bundle.json",
      "skipped.json",
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(
      "the validator output has no outcome for skipped.json\n",
    );
  });

  it("fails when the validator output holds no OperationOutcome", () => {
    const result = check({ resourceType: "Bundle", entry: [] }, allowlist);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Bundle without entries");
  });

  it("fails with a usage message when an argument is missing", () => {
    const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Usage: check-validator-results.mjs");
  });
});
