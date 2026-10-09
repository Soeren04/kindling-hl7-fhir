import { describe, expect, it } from "vitest";

import { adtWith, findings, validateSegments, validOru } from "./messages";

/** The span of the text `needle` in the message made of `segments`. */
function spanOf(
  segments: readonly string[],
  needle: string,
  fromSegment = 0,
): { start: number; end: number } {
  const text = segments.join("\r");
  const offset = segments.slice(0, fromSegment).join("\r").length;
  const start = text.indexOf(needle, offset);
  return { start, end: start + needle.length };
}

describe("validate", () => {
  it.each([
    ["ADT^A01", adtWith()],
    ["ORU^R01", validOru],
  ])("accepts a valid %s message", (_type, segments) => {
    expect(validateSegments(segments).issues).toStrictEqual([]);
  });

  it("reports structure and field issues together, in message order", () => {
    const [msh = "", evn] = adtWith({ evn: "EVN|A01" });
    const { issues } = validateSegments([msh, evn ?? "", "PID|1"]);
    expect(
      issues.map(({ code, location }) => [code, location.field]),
    ).toStrictEqual([
      ["REQUIRED_FIELD_MISSING", 2],
      // PV1 is missing at the end of PID, where PID-3 and PID-5 are missing too.
      ["SEGMENT_MISSING", undefined],
      ["REQUIRED_FIELD_MISSING", 3],
      ["REQUIRED_FIELD_MISSING", 5],
    ]);
  });

  describe("required fields", () => {
    it("reports an empty required field at its span", () => {
      const segments = adtWith({ pid: "PID|1||||Everyman^Adam" });
      const { issues } = validateSegments(segments);
      const field3 = spanOf(segments, "PID|1||", 2).end;
      expect(issues).toStrictEqual([
        {
          code: "REQUIRED_FIELD_MISSING",
          severity: "error",
          message: expect.any(String) as string,
          location: {
            span: { start: field3, end: field3 },
            segmentIndex: 2,
            segmentId: "PID",
            field: 3,
          },
        },
      ]);
    });

    it("reports a required field after the end of the segment at the end of the segment", () => {
      const segments = adtWith({ pid: "PID|1||PATID1234" });
      const { issues } = validateSegments(segments);
      const end = spanOf(segments, "PATID1234", 2).end;
      expect(findings(issues)).toStrictEqual([
        [
          "REQUIRED_FIELD_MISSING",
          {
            span: { start: end, end },
            segmentIndex: 2,
            segmentId: "PID",
            field: 5,
          },
        ],
      ]);
    });

    it("accepts the explicit null in a required field", () => {
      const segments = adtWith({ pid: 'PID|1||""||Everyman' });
      expect(validateSegments(segments).issues).toStrictEqual([]);
    });

    it("does not accept a field of empty repetitions and components", () => {
      const segments = adtWith({ pid: "PID|1||~^&||Everyman" });
      expect(findings(validateSegments(segments).issues)).toStrictEqual([
        [
          "REQUIRED_FIELD_MISSING",
          expect.objectContaining({ field: 3 }) as object,
        ],
      ]);
    });
  });

  describe("repetitions", () => {
    it("reports the first repetition too many of a field that does not repeat", () => {
      const segments = adtWith({ pv1: "PV1|1|I~O~E" });
      const { issues } = validateSegments(segments);
      expect(findings(issues)).toStrictEqual([
        [
          "TOO_MANY_REPETITIONS",
          {
            span: spanOf(segments, "O", 3),
            segmentIndex: 3,
            segmentId: "PV1",
            field: 2,
            repetition: 2,
          },
        ],
      ]);
    });

    it("counts empty repetitions between others", () => {
      const segments = adtWith({ pv1: "PV1|1|~I" });
      expect(findings(validateSegments(segments).issues)).toStrictEqual([
        [
          "TOO_MANY_REPETITIONS",
          expect.objectContaining({ field: 2, repetition: 2 }) as object,
        ],
      ]);
    });

    it("allows the number of repetitions a field defines, and any number when it repeats without limit", () => {
      const obr17 = `OBR|1|ORD0001|FIL0001|24331-1|||20240116080000||||||||||555~556`;
      expect(
        validateSegments([...validOru.slice(0, 2), obr17]).issues,
      ).toStrictEqual([]);
      expect(
        validateSegments(adtWith({ pid: "PID|1||A~B~C~D||Everyman" })).issues,
      ).toStrictEqual([]);
    });

    it("reports a third repetition of a field limited to two", () => {
      const obr17 = `OBR|1|ORD0001|FIL0001|24331-1|||20240116080000||||||||||555~556~557`;
      const segments = [...validOru.slice(0, 2), obr17];
      expect(findings(validateSegments(segments).issues)).toStrictEqual([
        [
          "TOO_MANY_REPETITIONS",
          {
            span: spanOf(segments, "557", 2),
            segmentIndex: 2,
            segmentId: "OBR",
            field: 17,
            repetition: 3,
          },
        ],
      ]);
    });
  });

  describe("unexpected fields", () => {
    const pid39 = `PID|1||PATID1234||Everyman${"|".repeat(34)}`;

    it("accepts values up to the last defined field", () => {
      const segments = adtWith({ pid: `${pid39}value` });
      expect(validateSegments(segments).issues).toStrictEqual([]);
    });

    it("reports each field after the last defined one that holds something", () => {
      const segments = adtWith({ pid: `${pid39}|value||""` });
      const { issues } = validateSegments(segments);
      expect(findings(issues)).toStrictEqual([
        [
          "UNEXPECTED_FIELD",
          {
            span: spanOf(segments, "value", 2),
            segmentIndex: 2,
            segmentId: "PID",
            field: 40,
          },
        ],
        [
          "UNEXPECTED_FIELD",
          {
            span: spanOf(segments, '""', 2),
            segmentIndex: 2,
            segmentId: "PID",
            field: 42,
          },
        ],
      ]);
    });

    it("reports a field the definition marks as not used (X) that holds something", () => {
      const [msh = "", pid = "", obr = "", obx = ""] = validOru;
      const reserved = `${obx}${"|".repeat(9)}reserved||""|2024`;
      const segments = [msh, pid, obr, reserved];
      const { issues } = validateSegments(segments);
      expect(findings(issues)).toStrictEqual([
        [
          "UNEXPECTED_FIELD",
          {
            span: spanOf(segments, "reserved", 3),
            segmentIndex: 3,
            segmentId: "OBX",
            field: 20,
          },
        ],
        [
          "UNEXPECTED_FIELD",
          {
            span: spanOf(segments, '""', 3),
            segmentIndex: 3,
            segmentId: "OBX",
            field: 22,
          },
        ],
      ]);
    });
  });

  it("checks only segments with a definition", () => {
    const segments = [
      ...adtWith(),
      "DG1|1|||||||||||||||||||||||||||||||||||||||||x",
    ];
    expect(validateSegments(segments).issues).toStrictEqual([]);
  });

  it("never puts message content into issue messages", () => {
    const segments = adtWith({
      evn: "EVN|Everyman",
      pid: `PID|Everyman||||Everyman~Everyman${"|Everyman".repeat(40)}`,
      pv1: "PV1|1|Everyman~Everyman",
    });
    const { issues } = validateSegments(segments);
    expect(issues.length).toBeGreaterThan(2);
    for (const { message } of issues) expect(message).not.toContain("Everyman");
  });
});
