import { describe, expect, it } from "vitest";

import { inInputOrder, issue, report } from "../../src/shared/issue";
import type { IssueCode, LocatedIssue } from "../../src/shared/issue";

describe("issue", () => {
  it("takes severity and message from the definition of the code", () => {
    expect(
      issue("BLANK_LINE_REMOVED", { span: { start: 3, end: 4 } }),
    ).toStrictEqual({
      code: "BLANK_LINE_REMOVED",
      severity: "info",
      message: "An empty line between segments was removed.",
      location: { span: { start: 3, end: 4 } },
    });
  });

  it("adds the raw value only when there is one", () => {
    const location = { span: { start: 0, end: 3 } };
    expect(issue("INVALID_SEGMENT_ID", location, "pid")).toMatchObject({
      severity: "error",
      value: "pid",
    });
    expect(issue("INVALID_SEGMENT_ID", location)).not.toHaveProperty("value");
  });

  it.each<IssueCode>(["UNKNOWN_ESCAPE", "MLLP_FRAME_UNTERMINATED"])(
    "reports %s as a warning",
    (code) => {
      expect(issue(code, { span: { start: 0, end: 0 } }).severity).toBe(
        "warning",
      );
    },
  );
});

describe("report", () => {
  it("adds the issue to the list", () => {
    const issues: LocatedIssue[] = [];
    report(issues, "EMPTY_INPUT", { span: { start: 0, end: 0 } });
    expect(issues.map(({ code }) => code)).toStrictEqual(["EMPTY_INPUT"]);
  });
});

describe("inInputOrder", () => {
  it("sorts by start and keeps the order of issues at the same position", () => {
    const at = (code: IssueCode, start: number) =>
      issue(code, { span: { start, end: start } });
    const issues = [
      at("UNKNOWN_ESCAPE", 5),
      at("BLANK_LINE_REMOVED", 2),
      at("LOCAL_ESCAPE_KEPT", 5),
    ];
    expect(inInputOrder(issues).map(({ code }) => code)).toStrictEqual([
      "BLANK_LINE_REMOVED",
      "UNKNOWN_ESCAPE",
      "LOCAL_ESCAPE_KEPT",
    ]);
    expect(issues[0]?.code).toBe("UNKNOWN_ESCAPE");
  });
});
