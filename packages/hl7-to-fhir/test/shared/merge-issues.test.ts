import { describe, expect, it } from "vitest";

import { maxIssues } from "../../src/shared/collect";
import type { Issue, IssueCode } from "../../src/shared/issue";
import { issue } from "../../src/shared/issue-table";
import { mergeIssues } from "../../src/shared/merge-issues";

describe("mergeIssues", () => {
  const at = (code: IssueCode, start: number, end = start): Issue =>
    issue(code, { span: { start, end } });

  it("sorts the issues of every list by position and keeps an issue two lists found once", () => {
    const parsing = [at("BLANK_LINE_REMOVED", 9)];
    const validation = [at("INVALID_DATE_TIME", 4, 12)];
    const mapping = [at("INVALID_DATE_TIME", 4, 12), at("UNMAPPED_CODE", 4, 6)];
    expect(
      mergeIssues([parsing, validation, mapping], 20).map(({ code }) => code),
    ).toStrictEqual([
      "INVALID_DATE_TIME",
      "UNMAPPED_CODE",
      "BLANK_LINE_REMOVED",
    ]);
  });

  it("keeps issues of one code at different spans", () => {
    expect(
      mergeIssues(
        [[at("UNMAPPED_CODE", 4, 6)], [at("UNMAPPED_CODE", 4, 7)]],
        20,
      ),
    ).toHaveLength(2);
  });

  it("ends with one TOO_MANY_ISSUES when a list was cut, at the end of the input", () => {
    const cut = [at("UNKNOWN_ESCAPE", 1), at("TOO_MANY_ISSUES", 20)];
    expect(
      mergeIssues([cut, [at("UNMAPPED_CODE", 30)]], 50).map(
        ({ code, location }) => [code, location.span.start],
      ),
    ).toStrictEqual([
      ["UNKNOWN_ESCAPE", 1],
      ["UNMAPPED_CODE", 30],
      ["TOO_MANY_ISSUES", 50],
    ]);
  });

  it("reports at most one issue more than the limit", () => {
    const many = (offset: number): Issue[] =>
      Array.from({ length: maxIssues }, (_, index) =>
        at("UNKNOWN_ESCAPE", offset + index),
      );
    const merged = mergeIssues(
      [many(0), many(maxIssues).concat(at("TOO_MANY_ISSUES", 0))],
      0,
    );
    expect(merged).toHaveLength(maxIssues + 1);
    expect(
      merged.filter(({ code }) => code === "TOO_MANY_ISSUES"),
    ).toHaveLength(1);
  });
});
