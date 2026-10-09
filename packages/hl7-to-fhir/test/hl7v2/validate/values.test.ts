import { describe, expect, it } from "vitest";

import type { Hl7Message, Subcomponent } from "../../../src/hl7v2/model";
import type { Span } from "../../../src/shared/issue";
import { validate } from "../../../src/hl7v2/validate";
import type { IssueCode } from "../../../src/shared/issue";
import { adtWith, findings, validateSegments, validOru } from "./messages";

/** The ORU^R01 message with OBX-2 and OBX-5 replaced. */
function observation(valueType: string, value: string): string[] {
  return [
    ...validOru.slice(0, 3),
    `OBX|1|${valueType}|2093-3^Cholesterol^LN||${value}||||||F`,
  ];
}

/** The code, position and value of every issue. */
function described(segments: readonly string[]): unknown[] {
  return validateSegments(segments).issues.map(({ code, location, value }) => {
    const { field, repetition, component, subcomponent } = location;
    return {
      code,
      at: [location.segmentId, field, repetition, component, subcomponent],
      value,
    };
  });
}

describe("validate: components", () => {
  it.each([
    [
      "a component after a primitive field",
      adtWith({ pv1: "PV1|1|I^X" }),
      ["PV1", 2, 1, 2, undefined],
    ],
    [
      "a subcomponent in a primitive field",
      adtWith({ pv1: "PV1|1|I&X" }),
      ["PV1", 2, 1, 1, 2],
    ],
    [
      "a component after the last one of a composite",
      adtWith({ pid: `PID|1||PATID1234||Everyman${"^".repeat(14)}X` }),
      ["PID", 5, 1, 15, undefined],
    ],
    [
      "a subcomponent after the last one of a composite component",
      adtWith({ pid: "PID|1||PATID1234^^^HOSP&1.2.3&ISO&X||Everyman" }),
      ["PID", 3, 1, 4, 4],
    ],
    [
      "a subcomponent in a primitive component",
      adtWith({ pid: "PID|1||PATID1234&X||Everyman" }),
      ["PID", 3, 1, 1, 2],
    ],
  ])("reports %s", (_case, segments, at) => {
    expect(described(segments)).toStrictEqual([
      { code: "UNEXPECTED_COMPONENT", at, value: undefined },
    ]);
  });

  it("accepts the components and subcomponents a type defines, and empty ones after them", () => {
    const pid =
      "PID|1||PATID1234^^^HOSP&1.2.3&ISO^MR||Everyman&Van&Everyman^Adam^^^^^L||19800101|M^&";
    expect(validateSegments(adtWith({ pid })).issues).toStrictEqual([]);
  });

  it.each([
    ["empty components", "M^^^"],
    ["empty subcomponents", "M&&&"],
    ["empty components and subcomponents", "M^&^&&"],
  ])(
    "does not report %s after the value of a primitive field",
    (_case, sex) => {
      const pid = `PID|1||PATID1234||Everyman|||${sex}`;
      expect(validateSegments(adtWith({ pid })).issues).toStrictEqual([]);
    },
  );

  it("does not report empty components and subcomponents after those a composite defines", () => {
    const pid = `PID|1||PATID1234^^^HOSP&1.2.3&ISO&^MR${"^".repeat(10)}&&||Everyman${"^".repeat(14)}^&`;
    expect(validateSegments(adtWith({ pid })).issues).toStrictEqual([]);
  });

  it.each([
    ["a null component", 'M^""', ["PID", 8, 1, 2, undefined]],
    ["a null subcomponent", 'M&""', ["PID", 8, 1, 1, 2]],
    ["a value after empty components", "M^^X", ["PID", 8, 1, 3, undefined]],
    ["a value after empty subcomponents", "M&&X", ["PID", 8, 1, 1, 3]],
  ])("reports %s after the value of a primitive field", (_case, sex, at) => {
    const pid = `PID|1||PATID1234||Everyman|||${sex}`;
    expect(described(adtWith({ pid }))).toStrictEqual([
      { code: "UNEXPECTED_COMPONENT", at, value: undefined },
    ]);
  });

  it("does not report empty nodes a tree holds after the value, which parse leaves out", () => {
    const { message } = validateSegments(adtWith());
    const empty = (span: Span): Subcomponent => ({ kind: "empty", span });
    const segments = message.segments.map((segment) => {
      if (segment.id !== "PID") return segment;
      const fields = segment.fields.map((field, index) => {
        const first = field.repetitions[0]?.components[0];
        if (index !== 7 || first === undefined) return field;
        const { span } = field;
        const widened = {
          ...first,
          subcomponents: [...first.subcomponents, empty(span)],
        };
        const trailing = { span, subcomponents: [empty(span)] };
        return {
          span,
          repetitions: [
            {
              span,
              components: [widened, trailing, { span, subcomponents: [] }],
            },
          ],
        };
      });
      return { ...segment, fields };
    });
    expect(validate({ ...message, segments })).toStrictEqual([]);
  });

  it("does not look inside a field whose type it does not know", () => {
    expect(
      validateSegments(observation("ED", "a^b^c&d^e^f^g")).issues,
    ).toStrictEqual([]);
  });
});

describe("validate: formats", () => {
  const invalid: [string, IssueCode, string[], unknown[], string][] = [
    [
      "a sequence ID (SI) in PID-1",
      "INVALID_SEQUENCE_ID",
      adtWith({ pid: "PID|A||PATID1234||Everyman" }),
      ["PID", 1, 1, 1, 1],
      "A",
    ],
    [
      "a date and time (TS.1) in PID-7",
      "INVALID_DATE_TIME",
      adtWith({ pid: "PID|1||PATID1234||Everyman||19800230" }),
      ["PID", 7, 1, 1, 1],
      "19800230",
    ],
    [
      "a code (IS) in PID-8",
      "MALFORMED_CODE",
      adtWith({ pid: "PID|1||PATID1234||Everyman|||M " }),
      ["PID", 8, 1, 1, 1],
      "M ",
    ],
    [
      "a code (ID) in a component",
      "MALFORMED_CODE",
      adtWith({ pid: "PID|1||PATID1234^^^HOSP^ MR||Everyman" }),
      ["PID", 3, 1, 5, 1],
      " MR",
    ],
    [
      "a number (NM) in a component",
      "INVALID_NUMBER",
      adtWith({ pid: "PID|1||PATID1234||Everyman||||||||^PRN^PH^^^5x5" }),
      ["PID", 13, 1, 6, 1],
      "5x5",
    ],
    [
      "a date and time nested in a component (XAD.13, TS.1)",
      "INVALID_DATE_TIME",
      adtWith({
        pid: `PID|1||PATID1234||Everyman||||||Street${"^".repeat(12)}2024-01-01`,
      }),
      ["PID", 11, 1, 13, 1],
      "2024-01-01",
    ],
    [
      "a date and time two levels down (XAD.12, DR.1, TS.1)",
      "INVALID_DATE_TIME",
      adtWith({
        pid: `PID|1||PATID1234||Everyman||||||Street${"^".repeat(11)}20241301`,
      }),
      ["PID", 11, 1, 12, 1],
      "20241301",
    ],
    [
      "a number (NM) in OBX-5",
      "INVALID_NUMBER",
      observation("NM", "1,5"),
      ["OBX", 5, 1, 1, 1],
      "1,5",
    ],
    [
      "a date (DT) in OBX-5",
      "INVALID_DATE",
      observation("DT", "20230229"),
      ["OBX", 5, 1, 1, 1],
      "20230229",
    ],
    [
      "a date-time in a date (DT) field",
      "INVALID_DATE",
      observation("DT", "20240115103000"),
      ["OBX", 5, 1, 1, 1],
      "20240115103000",
    ],
    [
      "the 31st of a month with 30 days (DT)",
      "INVALID_DATE",
      observation("DT", "20241131"),
      ["OBX", 5, 1, 1, 1],
      "20241131",
    ],
    [
      "a time (TM) in OBX-5",
      "INVALID_TIME",
      observation("TM", "2400"),
      ["OBX", 5, 1, 1, 1],
      "2400",
    ],
    [
      "a date and time (TS) in OBX-5",
      "INVALID_DATE_TIME",
      observation("TS", "yesterday"),
      ["OBX", 5, 1, 1, 1],
      "yesterday",
    ],
    [
      "a later repetition of OBX-5",
      "INVALID_NUMBER",
      observation("NM", "1~x"),
      ["OBX", 5, 2, 1, 1],
      "x",
    ],
  ];

  it.each(invalid)("reports %s", (_case, code, segments, at, value) => {
    expect(described(segments)).toStrictEqual([{ code, at, value }]);
  });

  it.each([
    [
      "values of every format",
      adtWith({
        pid: "PID|1||PATID1234^^^HOSP^MR||Everyman||19800101+0100|F||||||^PRN^PH^^^555^5552004",
      }),
    ],
    ["a number (NM) in OBX-5", observation("NM", "-0.5")],
    ["a date (DT) in OBX-5", observation("DT", "20240229")],
    ["a time (TM) in OBX-5", observation("TM", "103000.25+0100")],
    ["text in OBX-5", observation("ST", "1,5")],
    ["a type OBX-5 does not know", observation("XX", "1,5")],
    ["no type in OBX-2", observation("", "1,5")],
    [
      "the explicit null",
      adtWith({ pid: 'PID|""||PATID1234||Everyman||""|""' }),
    ],
  ])("accepts %s", (_case, segments) => {
    expect(validateSegments(segments).issues).toStrictEqual([]);
  });

  it("does not check a value the sender truncated", () => {
    const { message } = validateSegments(adtWith());
    expect(validate(withBirthDate(message, true))).toStrictEqual([]);
    expect(findings(validate(withBirthDate(message, false)))).toStrictEqual([
      ["INVALID_DATE_TIME", expect.objectContaining({ field: 7 }) as object],
    ]);
  });
});

/** The message with PID-7 replaced by an incomplete date, marked as truncated as a 2.7 message could hold it or not. */
function withBirthDate(message: Hl7Message, truncated: boolean): Hl7Message {
  const segments = message.segments.map((segment) => {
    if (segment.id !== "PID") return segment;
    const fields = segment.fields.map((field, index) => {
      if (index !== 6) return field;
      const span = field.span;
      const subcomponent = truncated
        ? ({ kind: "value", value: "198", truncated, span } as const)
        : ({ kind: "value", value: "198", span } as const);
      return {
        span,
        repetitions: [
          { span, components: [{ span, subcomponents: [subcomponent] }] },
        ],
      };
    });
    return { ...segment, fields };
  });
  return { ...message, segments };
}
