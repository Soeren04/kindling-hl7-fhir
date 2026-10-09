import { describe, expect, it } from "vitest";

import { validate } from "../../../src/hl7v2/validate";
import { maxIssues } from "../../../src/shared/collect";
import type { Issue } from "../../../src/shared/issue";
import { parsed } from "../helpers";
import { adtWith } from "./messages";

/** How often each code occurs, in the order the codes first occur. */
function counts(issues: readonly Issue[]): [string, number][] {
  const counted = new Map<string, number>();
  for (const { code } of issues) {
    counted.set(code, (counted.get(code) ?? 0) + 1);
  }
  return [...counted];
}

/** Validates the message made of `segments`. */
function validated(segments: readonly string[]): readonly Issue[] {
  return validate(parsed(segments.join("\r")).message);
}

describe("validate with more issues than it reports", () => {
  it("keeps the first issues and ends with TOO_MANY_ISSUES", () => {
    const zpi = Array.from({ length: 2 * maxIssues + 1 }, () => "ZPI|1");
    const { message } = parsed([...adtWith(), ...zpi].join("\r"));
    const end = message.segments.at(-1)?.span.end ?? 0;
    const issues = validate(message);
    expect(issues).toHaveLength(maxIssues + 1);
    expect(counts(issues)).toStrictEqual([
      ["UNDEFINED_Z_SEGMENT", maxIssues],
      ["TOO_MANY_ISSUES", 1],
    ]);
    expect(issues[maxIssues - 1]?.location.segmentIndex).toBe(maxIssues + 3);
    expect(issues.at(-1)?.location).toStrictEqual({
      span: { start: end, end },
    });
  });

  it("keeps an early field issue among many later segment issues", () => {
    const segments = adtWith({ pid: "PID|1||||Everyman" });
    const unexpected = Array.from({ length: 2 * maxIssues }, () => "XYZ|1");
    expect(counts(validated([...segments, ...unexpected]))).toStrictEqual([
      ["REQUIRED_FIELD_MISSING", 1],
      ["UNEXPECTED_SEGMENT", maxIssues - 1],
      ["TOO_MANY_ISSUES", 1],
    ]);
  });
});
