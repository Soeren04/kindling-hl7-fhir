import { describe, expect, it } from "vitest";

import { type GroupChild, groupSegments } from "../../../src/hl7v2/group";
import { validate } from "../../../src/hl7v2/validate";
import type { Issue } from "../../../src/shared/issue";
import { parsed } from "../helpers";
import { adtWith, findings, validateSegments } from "./messages";

const header = (version: string): string =>
  `MSH|^~\\&|ADT|HOSP|||20240115103000||ADT^A01^ADT_A01|1|P|${version}`;

/** The indexes of the segments of a group tree, in tree order. */
function segmentIndexes(children: readonly GroupChild[]): number[] {
  return children.flatMap((child) =>
    child.kind === "segment"
      ? [child.segmentIndex]
      : segmentIndexes(child.children),
  );
}

/** A message with a field issue (PID-3 missing, PID-8 not in table 0001) and a structure issue (no PV1). */
function flawed(msh: string): string[] {
  const [, evn = ""] = adtWith();
  return [msh, evn, "PID|1||||Everyman|||Q"];
}

describe("validate: version", () => {
  it.each(["2.5", "2.5.1"])("applies every rule to version %s", (version) => {
    const codes = validateSegments(flawed(header(version))).issues.map(
      ({ code }) => code,
    );
    expect(codes).toStrictEqual([
      "REQUIRED_FIELD_MISSING",
      "UNKNOWN_USER_DEFINED_CODE",
      "SEGMENT_MISSING",
    ]);
  });

  it.each(["2.3", "2.4", "2.6", "2.8.2", "2.51", "3.0"])(
    "checks neither the segment order nor the built-in definitions of version %s, and says so at MSH-12",
    (version) => {
      const msh = header(version);
      const { issues } = validateSegments(flawed(msh));
      expect(issues).toStrictEqual([
        {
          code: "UNSUPPORTED_VERSION",
          severity: "info",
          message: expect.any(String) as string,
          location: {
            span: { start: msh.length - version.length, end: msh.length },
            segmentIndex: 0,
            segmentId: "MSH",
            field: 12,
          },
          value: version,
        },
      ]);
    },
  );

  it.each([
    [
      "an ORU^R01 of version 2.8.2 with segments added after 2.5",
      [
        "MSH|^~\\&|LAB|HOSP|||20240116091500||ORU^R01^ORU_R01|1|P|2.8.2",
        "PID|1||PATID1234^^^HOSP^MR||Everyman^Adam",
        "PRT|1|AD",
        "OBX|1|NM|2093-3^Cholesterol^LN||196",
        "ORC|RE",
        "OBR|1",
        "PRT|2|AD",
        "OBX|1|NM|2093-3^Cholesterol^LN||196",
      ],
    ],
    [
      "an ADT^A01 of version 2.7 with segments added after 2.5",
      [
        "MSH|^~\\&|ADT|HOSP|||20240115103000||ADT^A01^ADT_A01|1|P|2.7",
        "EVN||20240115103000",
        "PID|1||PATID1234^^^HOSP^MR||Everyman^Adam",
        "ARV|1|A",
        "PV1|1|I",
        "UAC|KERB|data",
        "ARV|2|A",
      ],
    ],
  ])("groups %s without finding fault with the order", (_case, segments) => {
    const { message, issues } = validateSegments(segments);
    expect(issues.map(({ code }) => code)).toStrictEqual([
      "UNSUPPORTED_VERSION",
    ]);
    const grouping: Issue[] = [];
    const tree = groupSegments(message, () => false, grouping);
    expect(grouping).toStrictEqual([]);
    // Every segment is still in the tree, in message order.
    expect(segmentIndexes(tree.children)).toStrictEqual(
      segments.map((_, index) => index),
    );
  });

  it("applies every rule to a message without version and reports the missing MSH-12", () => {
    const msh = "MSH|^~\\&|ADT|HOSP|||20240115103000||ADT^A01^ADT_A01|1|P";
    const { issues } = validateSegments(flawed(msh));
    expect(
      findings(issues).map(([code, { field }]) => [code, field]),
    ).toStrictEqual([
      ["REQUIRED_FIELD_MISSING", 12],
      ["REQUIRED_FIELD_MISSING", 3],
      ["UNKNOWN_USER_DEFINED_CODE", 8],
      ["SEGMENT_MISSING", undefined],
    ]);
  });

  it("locates the version of a tree without MSH at the start", () => {
    const { message } = parsed(adtWith().join("\r"));
    const tree = {
      ...message,
      version: "2.3",
      segments: message.segments.slice(1),
    };
    expect(
      validate(tree).filter(({ code }) => code === "UNSUPPORTED_VERSION"),
    ).toStrictEqual([
      expect.objectContaining({ location: { span: { start: 0, end: 0 } } }),
    ]);
  });
});
