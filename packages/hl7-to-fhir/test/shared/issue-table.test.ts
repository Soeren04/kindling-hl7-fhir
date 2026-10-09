import { describe, expect, it } from "vitest";

import type { IssueCode } from "../../src/shared/issue";
import { issue } from "../../src/shared/issue-table";

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
