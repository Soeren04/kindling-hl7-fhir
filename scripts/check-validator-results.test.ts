import { describe, expect, it } from "vitest";

import {
  collectIssues,
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
