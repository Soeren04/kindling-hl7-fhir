import { describe, expect, it } from "vitest";

import { finishIssues, maxIssues, report } from "../../src/shared/collect";
import type { Issue, IssueCode } from "../../src/shared/issue";
import { issue } from "../../src/shared/issue-table";

describe("report", () => {
  it("adds the issue to the list", () => {
    const issues: Issue[] = [];
    report(issues, "EMPTY_INPUT", { span: { start: 0, end: 0 } });
    expect(issues.map(({ code }) => code)).toStrictEqual(["EMPTY_INPUT"]);
  });

  it("stops adding one issue past the limit", () => {
    const issues: Issue[] = [];
    for (let index = 0; index < maxIssues + 5; index++) {
      report(issues, "UNKNOWN_ESCAPE", { span: { start: index, end: index } });
    }
    expect(issues).toHaveLength(maxIssues + 1);
  });
});

describe("finishIssues", () => {
  it("replaces the issues past the limit with one warning at the end of the input", () => {
    const issues: Issue[] = [];
    for (let index = maxIssues; index >= 0; index--) {
      report(issues, "UNKNOWN_ESCAPE", { span: { start: index, end: index } });
    }
    const finished = finishIssues(issues, 50_000);
    expect(finished).toHaveLength(maxIssues + 1);
    expect(finished[maxIssues - 1]?.location.span.start).toBe(maxIssues - 1);
    expect(finished.at(-1)).toStrictEqual(
      issue("TOO_MANY_ISSUES", { span: { start: 50_000, end: 50_000 } }),
    );
  });

  it("keeps a list of exactly the limit", () => {
    const issues = Array.from({ length: maxIssues }, (_, index) =>
      issue("UNKNOWN_ESCAPE", { span: { start: index, end: index } }),
    );
    expect(finishIssues(issues, 0).at(-1)?.code).toBe("UNKNOWN_ESCAPE");
  });

  it("sorts by start and keeps the order of issues at the same position", () => {
    const at = (code: IssueCode, start: number) =>
      issue(code, { span: { start, end: start } });
    const issues = [
      at("UNKNOWN_ESCAPE", 5),
      at("BLANK_LINE_REMOVED", 2),
      at("LOCAL_ESCAPE_KEPT", 5),
    ];
    expect(finishIssues(issues, 10).map(({ code }) => code)).toStrictEqual([
      "BLANK_LINE_REMOVED",
      "UNKNOWN_ESCAPE",
      "LOCAL_ESCAPE_KEPT",
    ]);
    expect(issues[0]?.code).toBe("UNKNOWN_ESCAPE");
  });
});
