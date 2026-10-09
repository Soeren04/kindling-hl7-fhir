import { describe, expect, it } from "vitest";

import { validate } from "../../../src/hl7v2/validate";
import { maxIssues } from "../../../src/shared/collect";
import type { Issue } from "../../../src/shared/issue";
import { parsed } from "../helpers";
import { adtWith, validOru } from "./messages";

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

/** A valid PID with PID-1 and the fields after PID-9 replaced by `rest`. */
const pidWith = (setId: string, rest: string): string =>
  `PID|${setId}||PATID1234||Everyman|||||${rest}`;

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

  it("stops checking fields once there are too many issues", () => {
    const [msh = "", pid = "", ...rest] = validOru;
    const notes = Array.from({ length: 2 * maxIssues }, () => "NTE|x");
    const issues = validated([msh, pid, ...notes, ...rest]);
    expect(counts(issues)).toStrictEqual([
      ["INVALID_SEQUENCE_ID", maxIssues],
      ["TOO_MANY_ISSUES", 1],
    ]);
    expect(issues[maxIssues - 1]?.location.segmentIndex).toBe(maxIssues + 1);
  });

  it("keeps the first issues of one segment in message order, whichever rule finds them", () => {
    const fields = "|".repeat(29) + "|a".repeat(2 * maxIssues);
    const issues = validated(adtWith({ pid: pidWith("x", fields) }));
    expect(counts(issues)).toStrictEqual([
      ["INVALID_SEQUENCE_ID", 1],
      ["UNEXPECTED_FIELD", maxIssues - 1],
      ["TOO_MANY_ISSUES", 1],
    ]);
    expect(issues[1]?.location.field).toBe(40);
  });

  it("keeps the extra subcomponent of an early component before many extra components", () => {
    const race = `x&s^b^c^d^e^f${"^z".repeat(2 * maxIssues)}`;
    const [first] = validated(adtWith({ pid: pidWith("1", race) }));
    expect(first?.code).toBe("UNEXPECTED_COMPONENT");
    expect(first?.location).toMatchObject({
      field: 10,
      component: 1,
      subcomponent: 2,
    });
  });
});
