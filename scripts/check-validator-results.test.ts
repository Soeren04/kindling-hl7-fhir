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
    file: "bundle.json",
    location: "Bundle",
    text: "Something to look at",
  };
  const allowed = {
    messageId: "SOME_WARNING",
    reason: "Expected for collection bundles",
  };

  it("passes when there are only information issues", () => {
    expect(
      findValidationProblems([{ ...issue, severity: "information" }], []),
    ).toStrictEqual([]);
  });

  it.each(["fatal", "error"])(
    "fails on %s issues even when their id is allowlisted",
    (severity) => {
      expect(
        findValidationProblems([{ ...issue, severity }], [allowed]),
      ).toStrictEqual([
        `${severity} SOME_WARNING in bundle.json at Bundle: Something to look at`,
        "allowlisted warning SOME_WARNING no longer occurs; remove it from the allowlist",
      ]);
    },
  );

  it("fails on a warning that is not allowlisted", () => {
    expect(findValidationProblems([issue], [])).toStrictEqual([
      "warning SOME_WARNING in bundle.json at Bundle: Something to look at",
    ]);
  });

  it("accepts an allowlisted warning", () => {
    expect(findValidationProblems([issue, issue], [allowed])).toStrictEqual([]);
  });

  it("fails on an allowlist entry that no warning uses", () => {
    expect(findValidationProblems([], [allowed])).toStrictEqual([
      "allowlisted warning SOME_WARNING no longer occurs; remove it from the allowlist",
    ]);
  });
});

describe("parseAllowlist", () => {
  it("reads message ids and reasons", () => {
    const allowlist = {
      warnings: [{ messageId: "SOME_WARNING", reason: "Expected" }],
    };
    expect(parseAllowlist(allowlist)).toStrictEqual([
      { messageId: "SOME_WARNING", reason: "Expected" },
    ]);
  });

  it("rejects a file without a warnings array", () => {
    expect(() => parseAllowlist({})).toThrow('needs a "warnings" array');
  });

  it.each([
    ["a missing reason", { messageId: "SOME_WARNING" }],
    ["a blank reason", { messageId: "SOME_WARNING", reason: "  " }],
    ["a missing message id", { reason: "Expected" }],
  ])("rejects an entry with %s", (_description, entry) => {
    expect(() => parseAllowlist({ warnings: [entry] })).toThrow(
      "needs a messageId and a non-empty reason",
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

  it("passes when only allowlisted warnings occur", () => {
    expect(check(outcome("bundle.json", [warning]), allowlist)).toMatchObject({
      status: 0,
      stdout: "FHIR validator: 1 issue(s), 0 problem(s).\n",
      stderr: "",
    });
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
