import { describe, expect, it } from "vitest";

import { isValidSegmentId, parseSegment } from "../../src/hl7v2/segment";
import type { LocatedIssue } from "../../src/shared/issue";
import { fieldShape, segmentShape } from "./helpers";

const context = {
  delimiters: {
    field: "|",
    component: "^",
    repetition: "~",
    escape: "\\",
    subcomponent: "&",
  },
  charset: "ascii",
} as const;

describe("parseSegment", () => {
  it("parses only the given range of the input", () => {
    const input = "MSH|^~\\&\rPID|1|a^b\rPV1|1";
    const start = input.indexOf("PID");
    const issues: LocatedIssue[] = [];
    const segment = parseSegment(
      input,
      { start, end: input.indexOf("\rPV1") },
      1,
      context,
      issues,
    );
    expect(segment.id).toBe("PID");
    expect(segmentShape(segment)).toStrictEqual([[[["1"]]], [[["a"], ["b"]]]]);
    expect(segment.fields[1]?.span).toStrictEqual({
      start: start + 6,
      end: start + 9,
    });
    expect(issues).toStrictEqual([]);
  });

  it("does not split or unescape MSH-2", () => {
    const input = "MSH|^~\\&|\\F\\";
    const segment = parseSegment(
      input,
      { start: 0, end: input.length },
      0,
      context,
      [],
    );
    expect(fieldShape(segment.fields[1])).toStrictEqual([[["^~\\&"]]]);
    expect(fieldShape(segment.fields[2])).toStrictEqual([[["|"]]]);
  });
});

describe("isValidSegmentId", () => {
  it.each(["MSH", "PID", "ZPI", "Z01", "OBX", "QQQ"])("accepts %s", (id) => {
    expect(isValidSegmentId(id)).toBe(true);
  });

  it.each(["", "PI", "PIDX", "pid", "Pid", "1ID", "P-D", "ZP ", "ÄBC"])(
    "rejects %j",
    (id) => {
      expect(isValidSegmentId(id)).toBe(false);
    },
  );
});
