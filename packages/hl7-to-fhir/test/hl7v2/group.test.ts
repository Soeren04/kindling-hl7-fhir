import { describe, expect, it } from "vitest";

import { defineSegment } from "../../src/hl7v2/define-segment";
import { group, type GroupChild, groupSegments } from "../../src/hl7v2/group";
import type { Hl7Message } from "../../src/hl7v2/model";
import type { Issue } from "../../src/shared/issue";
import { parsed } from "./helpers";

const adtHeader =
  "MSH|^~\\&|ADT|HOSP|||20240115103000||ADT^A01^ADT_A01|1|P|2.5.1";
const oruHeader =
  "MSH|^~\\&|LAB|HOSP|||20240115103000||ORU^R01^ORU_R01|1|P|2.5.1";

interface Grouped {
  readonly message: Hl7Message;
  readonly tree: ReturnType<typeof groupSegments>;
  readonly issues: Issue[];
}

/** Groups a message made of `segments` (one string per segment) without definitions of other segments. */
function grouped(
  segments: readonly string[],
  isDefined: (id: string) => boolean = () => false,
): Grouped {
  const { message } = parsed(segments.join("\r"));
  const issues: Issue[] = [];
  const tree = groupSegments(message, isDefined, issues);
  return { message, tree, issues };
}

/** The tree as indented lines: a group by its name, a segment by its identifier. */
function outline(
  message: Hl7Message,
  children: readonly GroupChild[],
  depth = 0,
): string[] {
  const indent = "  ".repeat(depth);
  return children.flatMap((child) =>
    child.kind === "segment"
      ? [`${indent}${message.segments[child.segmentIndex]?.id ?? "?"}`]
      : [
          `${indent}${child.name}`,
          ...outline(message, child.children, depth + 1),
        ],
  );
}

function outlineOf({ message, tree }: Grouped): string[] {
  return outline(message, tree.children);
}

/** The code and the segment of each issue, which is enough to tell what the matcher saw. */
function findings({ issues }: Grouped): string[] {
  return issues.map(({ code, location }) => {
    const index =
      location.segmentIndex === undefined
        ? ""
        : `[${String(location.segmentIndex)}]`;
    return `${code} ${location.segmentId ?? "?"}${index}`;
  });
}

describe("groupSegments", () => {
  describe("ADT_A01", () => {
    it("places the segments of a minimal message at the top level", () => {
      const result = grouped([
        adtHeader,
        "EVN|A01|20240115",
        "PID|1||1",
        "PV1|1|I",
      ]);
      expect(result.tree.structure).toBe("ADT_A01");
      expect(outlineOf(result)).toStrictEqual(["MSH", "EVN", "PID", "PV1"]);
      expect(result.issues).toStrictEqual([]);
    });

    it("matches ROL at each of its positions and in repeated groups", () => {
      const result = grouped([
        adtHeader,
        "EVN|A01",
        "PID|1",
        "ROL|1",
        "NK1|1",
        "PV1|1|I",
        "ROL|2",
        "ROL|3",
        "PR1|1",
        "ROL|4",
        "PR1|2",
        "IN1|1",
        "IN2",
        "IN3|1",
        "IN3|2",
        "ROL|5",
        "IN1|2",
      ]);
      expect(outlineOf(result)).toStrictEqual([
        "MSH",
        "EVN",
        "PID",
        "ROL",
        "NK1",
        "PV1",
        "ROL",
        "ROL",
        "PROCEDURE",
        "  PR1",
        "  ROL",
        "PROCEDURE",
        "  PR1",
        "INSURANCE",
        "  IN1",
        "  IN2",
        "  IN3",
        "  IN3",
        "  ROL",
        "INSURANCE",
        "  IN1",
      ]);
      expect(result.issues).toStrictEqual([]);
    });

    it("reports a missing required segment where it belongs", () => {
      const result = grouped([adtHeader, "PID|1", "PV1|1|I"]);
      expect(result.issues).toStrictEqual([
        expect.objectContaining({
          code: "SEGMENT_MISSING",
          severity: "error",
          location: {
            span: { start: adtHeader.length + 1, end: adtHeader.length + 1 },
            segmentId: "EVN",
          },
        }),
      ]);
    });

    it("reports required segments missing at the end of the message after its last segment", () => {
      const result = grouped([adtHeader, "EVN|A01"]);
      const end = adtHeader.length + "\rEVN|A01".length;
      expect(
        result.issues.map(({ code, location }) => [code, location]),
      ).toStrictEqual([
        ["SEGMENT_MISSING", { span: { start: end, end }, segmentId: "PID" }],
        ["SEGMENT_MISSING", { span: { start: end, end }, segmentId: "PV1" }],
      ]);
    });

    it("reports a segment before one that must precede it, and nothing as missing", () => {
      const result = grouped([adtHeader, "EVN|A01", "PV1|1|I", "PID|1"]);
      expect(findings(result)).toStrictEqual(["SEGMENT_OUT_OF_ORDER PV1[2]"]);
      // The misplaced segment stays in the tree, after the segment that was matched last.
      expect(outlineOf(result)).toStrictEqual(["MSH", "EVN", "PV1", "PID"]);
    });

    it("reports a segment that skips a required one that comes later as out of order", () => {
      const result = grouped([
        adtHeader,
        "EVN|A01",
        "PID|1",
        "OBX|1",
        "PV1|1|I",
        "PV2",
        "AL1|1",
      ]);
      expect(findings(result)).toStrictEqual(["SEGMENT_OUT_OF_ORDER OBX[3]"]);
      expect(outlineOf(result)).toStrictEqual([
        "MSH",
        "EVN",
        "PID",
        "OBX",
        "PV1",
        "PV2",
        "AL1",
      ]);
    });

    it("reports a repeating segment after the next one as out of order", () => {
      const result = grouped([
        adtHeader,
        "EVN|A01",
        "PID|1",
        "ROL|1",
        "NK1|1",
        "ROL|2",
        "PV1|1|I",
      ]);
      expect(findings(result)).toStrictEqual(["SEGMENT_OUT_OF_ORDER ROL[5]"]);
    });

    it("reports a required segment missing when it does not come later", () => {
      const result = grouped([adtHeader, "EVN|A01", "PID|1", "OBX|1", "AL1|1"]);
      expect(findings(result)).toStrictEqual(["SEGMENT_MISSING PV1"]);
      expect(result.issues[0]?.location.span.start).toBe(
        result.message.segments[3]?.span.start,
      );
    });

    it("reports a segment that occurs more often than allowed", () => {
      const result = grouped([
        adtHeader,
        "EVN|A01",
        "PID|1",
        "PID|2",
        "PV1|1|I",
      ]);
      expect(findings(result)).toStrictEqual(["SEGMENT_REPEATED PID[3]"]);
      expect(result.issues[0]?.severity).toBe("error");
    });

    it("reports a later MSH as repeated", () => {
      const result = grouped([
        adtHeader,
        "EVN|A01",
        "PID|1",
        "PV1|1|I",
        adtHeader,
      ]);
      expect(findings(result)).toStrictEqual(["SEGMENT_REPEATED MSH[4]"]);
    });

    it("reports a segment the structure does not contain as a warning and keeps it", () => {
      const result = grouped([
        adtHeader,
        "EVN|A01",
        "PID|1",
        "OBR|1",
        "PV1|1|I",
      ]);
      expect(result.issues).toStrictEqual([
        expect.objectContaining({
          code: "UNEXPECTED_SEGMENT",
          severity: "warning",
          location: {
            span: result.message.segments[3]?.span,
            segmentIndex: 3,
            segmentId: "OBR",
          },
        }),
      ]);
      expect(outlineOf(result)).toStrictEqual([
        "MSH",
        "EVN",
        "PID",
        "OBR",
        "PV1",
      ]);
    });

    it("reports a segment with an invalid identifier without naming it", () => {
      const result = grouped([
        adtHeader,
        "EVN|A01",
        "pid|1",
        "PID|1",
        "PV1|1|I",
      ]);
      expect(
        result.issues.map(({ code, location }) => [code, location]),
      ).toStrictEqual([
        [
          "UNEXPECTED_SEGMENT",
          { span: result.message.segments[2]?.span, segmentIndex: 2 },
        ],
      ]);
    });
  });

  describe("ORU_R01", () => {
    it("groups several orders with their observations and notes", () => {
      const result = grouped([
        oruHeader,
        "PID|1",
        "NTE|1",
        "PV1|1|O",
        "ORC|RE",
        "OBR|1",
        "NTE|1",
        "OBX|1",
        "NTE|1",
        "NTE|2",
        "OBX|2",
        "OBR|2",
        "OBX|1",
        "SPM|1",
        "OBX|1",
        "DSC|1",
      ]);
      expect(outlineOf(result)).toStrictEqual([
        "MSH",
        "PATIENT_RESULT",
        "  PATIENT",
        "    PID",
        "    NTE",
        "    VISIT",
        "      PV1",
        "  ORDER_OBSERVATION",
        "    ORC",
        "    OBR",
        "    NTE",
        "    OBSERVATION",
        "      OBX",
        "      NTE",
        "      NTE",
        "    OBSERVATION",
        "      OBX",
        "  ORDER_OBSERVATION",
        "    OBR",
        "    OBSERVATION",
        "      OBX",
        "    SPECIMEN",
        "      SPM",
        "      OBX",
        "DSC",
      ]);
      expect(result.issues).toStrictEqual([]);
    });

    it("starts a new order at an ORC, which may open the group", () => {
      const result = grouped([oruHeader, "ORC|RE", "OBR|1", "ORC|RE", "OBR|2"]);
      expect(outlineOf(result)).toStrictEqual([
        "MSH",
        "PATIENT_RESULT",
        "  ORDER_OBSERVATION",
        "    ORC",
        "    OBR",
        "  ORDER_OBSERVATION",
        "    ORC",
        "    OBR",
      ]);
      expect(result.issues).toStrictEqual([]);
    });

    it("starts a new patient result at a second PID", () => {
      const result = grouped([oruHeader, "PID|1", "OBR|1", "PID|2", "OBR|1"]);
      expect(outlineOf(result)).toStrictEqual([
        "MSH",
        "PATIENT_RESULT",
        "  PATIENT",
        "    PID",
        "  ORDER_OBSERVATION",
        "    OBR",
        "PATIENT_RESULT",
        "  PATIENT",
        "    PID",
        "  ORDER_OBSERVATION",
        "    OBR",
      ]);
    });

    it("reports the required segment of a group that never starts", () => {
      const result = grouped([oruHeader, "PID|1"]);
      expect(findings(result)).toStrictEqual(["SEGMENT_MISSING OBR"]);
    });

    it("reports the required segment of an order that ends without it", () => {
      const result = grouped([
        oruHeader,
        "ORC|RE",
        "ORC|RE",
        "OBR|1",
        "ORC|RE",
      ]);
      expect(findings(result)).toStrictEqual([
        "SEGMENT_REPEATED ORC[2]",
        "SEGMENT_MISSING OBR",
      ]);
      // The second ORC is repeated because the OBR of its order comes later; the last ORC has none.
      expect(result.issues[1]?.location.span.start).toBe(
        result.message.segments[4]?.span.end,
      );
    });

    it("reports a group that occurs more often than allowed as repeated", () => {
      const result = grouped([oruHeader, "PID|1", "PV1|1", "PV1|2", "OBR|1"]);
      expect(findings(result)).toStrictEqual(["SEGMENT_REPEATED PV1[3]"]);
    });

    it("reports a segment of a repeating group out of order, not repeated", () => {
      const result = grouped([
        oruHeader,
        "PID|1",
        "NTE|1",
        "PV1|1",
        "NTE|2",
        "OBR|1",
      ]);
      expect(findings(result)).toStrictEqual(["SEGMENT_OUT_OF_ORDER NTE[4]"]);
    });

    it("cannot place an observation without its order", () => {
      const result = grouped([oruHeader, "PID|1", "OBX|1"]);
      expect(findings(result)).toStrictEqual([
        "SEGMENT_OUT_OF_ORDER OBX[2]",
        "SEGMENT_MISSING OBR",
      ]);
      expect(outlineOf(result)).toStrictEqual([
        "MSH",
        "PATIENT_RESULT",
        "  PATIENT",
        "    PID",
        "    OBX",
      ]);
    });
  });

  describe("Z segments and defined segments", () => {
    it("keeps an undefined Z segment in the open group and reports it as information", () => {
      const result = grouped([oruHeader, "OBR|1", "OBX|1", "ZOB|1", "OBX|2"]);
      expect(outlineOf(result)).toStrictEqual([
        "MSH",
        "PATIENT_RESULT",
        "  ORDER_OBSERVATION",
        "    OBR",
        "    OBSERVATION",
        "      OBX",
        "      ZOB",
        "    OBSERVATION",
        "      OBX",
      ]);
      expect(result.issues).toStrictEqual([
        expect.objectContaining({
          code: "UNDEFINED_Z_SEGMENT",
          severity: "info",
          location: {
            span: result.message.segments[3]?.span,
            segmentIndex: 3,
            segmentId: "ZOB",
          },
        }),
      ]);
    });

    it("allows a defined Z segment anywhere", () => {
      const result = grouped(
        [adtHeader, "ZPI|1", "EVN|A01", "PID|1", "PV1|1|I", "ZPV|1"],
        (id) => id.startsWith("Z"),
      );
      expect(result.issues).toStrictEqual([]);
      expect(outlineOf(result)).toStrictEqual([
        "MSH",
        "ZPI",
        "EVN",
        "PID",
        "PV1",
        "ZPV",
      ]);
    });

    it("allows a defined segment the structure does not contain", () => {
      const result = grouped(
        [adtHeader, "EVN|A01", "PID|1", "PV1|1|I", "OBR|1"],
        (id) => id === "OBR",
      );
      expect(result.issues).toStrictEqual([]);
    });

    it("still reports a defined segment that the structure places elsewhere", () => {
      const result = grouped(
        [adtHeader, "PID|1", "EVN|A01", "PV1|1|I"],
        () => true,
      );
      expect(findings(result)).toStrictEqual(["SEGMENT_OUT_OF_ORDER PID[1]"]);
    });
  });

  describe("without a known structure", () => {
    it("places every segment at the top level for an unsupported structure", () => {
      const result = grouped([
        "MSH|^~\\&|ADT|HOSP|||20240115103000||ADT^A03^ADT_A03|1|P|2.5.1",
        "EVN|A03",
        "ZPI|1",
        "PID|1",
      ]);
      expect(result.tree.structure).toBe("ADT_A03");
      expect(outlineOf(result)).toStrictEqual(["MSH", "EVN", "ZPI", "PID"]);
      expect(findings(result)).toStrictEqual([
        "MESSAGE_STRUCTURE_UNSUPPORTED MSH[0]",
      ]);
    });

    it("leaves the structure out when MSH-9 identifies none", () => {
      const result = grouped(["MSH|^~\\&|ADT|HOSP", "PID|1"]);
      expect(result.tree).toStrictEqual({
        children: [
          { kind: "segment", segmentIndex: 0 },
          { kind: "segment", segmentIndex: 1 },
        ],
      });
      expect(findings(result)).toStrictEqual([
        "MESSAGE_STRUCTURE_UNKNOWN MSH[0]",
      ]);
    });
  });

  it("refers to segments by their index in the message", () => {
    const { tree } = grouped([oruHeader, "OBR|1", "OBX|1"]);
    expect(tree).toStrictEqual({
      structure: "ORU_R01",
      children: [
        { kind: "segment", segmentIndex: 0 },
        {
          kind: "group",
          name: "PATIENT_RESULT",
          children: [
            {
              kind: "group",
              name: "ORDER_OBSERVATION",
              children: [
                { kind: "segment", segmentIndex: 1 },
                {
                  kind: "group",
                  name: "OBSERVATION",
                  children: [{ kind: "segment", segmentIndex: 2 }],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("never puts message content into issue messages", () => {
    const result = grouped([
      adtHeader,
      "PID|1||Everyman",
      "XYZ|Everyman",
      "ZPI|Everyman",
    ]);
    expect(result.issues.length).toBeGreaterThan(0);
    for (const { message } of result.issues)
      expect(message).not.toContain("Everyman");
  });
});

describe("group", () => {
  it("returns the structure, the tree and the issues in message order", () => {
    const { message } = parsed(
      [adtHeader, "ZPI|1", "PID|1", "EVN|A01", "PV1|1|I"].join("\r"),
    );
    const groups = group(message);
    expect(groups.structure).toBe("ADT_A01");
    expect(outline(message, groups.children)).toStrictEqual([
      "MSH",
      "ZPI",
      "PID",
      "EVN",
      "PV1",
    ]);
    expect(
      groups.issues.map(({ code, location }) => [code, location.segmentIndex]),
    ).toStrictEqual([
      ["UNDEFINED_Z_SEGMENT", 1],
      ["SEGMENT_OUT_OF_ORDER", 2],
    ]);
  });

  it("allows the segments defined in the options anywhere", () => {
    const { message } = parsed([adtHeader, "ZPI|1"].join("\r"));
    const zpi = defineSegment({ id: "ZPI", fields: [] });
    expect(
      group(message, { segments: [zpi] }).issues.map(({ code }) => code),
    ).toStrictEqual(["SEGMENT_MISSING", "SEGMENT_MISSING", "SEGMENT_MISSING"]);
  });

  it("reports an unknown structure at the start of a message without segments", () => {
    const delimiters = { field: "|", component: "^", repetition: "~" };
    expect(group({ delimiters, segments: [] })).toStrictEqual({
      children: [],
      issues: [
        expect.objectContaining({
          code: "MESSAGE_STRUCTURE_UNKNOWN",
          location: { span: { start: 0, end: 0 } },
        }),
      ],
    });
  });

  it.each([
    ["a segment without fields", { id: "PID" }],
    ["a segment without span", { id: "PID", fields: [] }],
  ])("reports a tree with %s instead of throwing", (_case, segment) => {
    const tree = { segments: [segment] } as unknown as Hl7Message;
    expect(group(tree)).toStrictEqual({
      children: [],
      issues: [
        expect.objectContaining({
          code: "INVALID_TREE",
          location: { span: { start: 0, end: 0 }, segmentIndex: 0 },
        }),
      ],
    });
  });
});
