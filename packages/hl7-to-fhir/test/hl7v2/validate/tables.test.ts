import { describe, expect, it } from "vitest";

import { defineSegment } from "../../../src/hl7v2/define-segment";
import { validate } from "../../../src/hl7v2/validate";
import type { IssueCode } from "../../../src/shared/issue";
import { parsed } from "../helpers";
import { adtWith, validateSegments, validOru } from "./messages";

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

const header = (messageType: string): string =>
  `MSH|^~\\&|ADT|HOSP|||20240115103000||${messageType}|1|P|2.5.1`;

function oruWith(obr25: string, obx11: string): string[] {
  const [msh = "", pid = ""] = validOru;
  return [
    msh,
    pid,
    `OBR|1|ORD|FIL|24331-1|||20240116080000${"|".repeat(18)}${obr25}`,
    `OBX|1|NM|2093-3||196||||||${obx11}`,
  ];
}

describe("validate: tables", () => {
  const unknown: [string, IssueCode, string[], unknown[], string][] = [
    [
      "an event type (0003) in EVN-1",
      "UNKNOWN_CODE",
      adtWith({ evn: "EVN|A99|20240115" }),
      ["EVN", 1, 1, 1, 1],
      "A99",
    ],
    [
      "a message code (0076) in MSH-9.1",
      "UNKNOWN_CODE",
      adtWith({ msh: header("XYZ^A01^ADT_A01") }),
      ["MSH", 9, 1, 1, 1],
      "XYZ",
    ],
    [
      "a trigger event (0003) in MSH-9.2",
      "UNKNOWN_CODE",
      adtWith({ msh: header("ADT^A99^ADT_A01") }),
      ["MSH", 9, 1, 2, 1],
      "A99",
    ],
    [
      "an identifier type (0203) in CX.5",
      "UNKNOWN_CODE",
      adtWith({ pid: "PID|1||PATID1234^^^HOSP^QQ||Everyman" }),
      ["PID", 3, 1, 5, 1],
      "QQ",
    ],
    [
      "a result status (0123) in OBR-25",
      "UNKNOWN_CODE",
      oruWith("Q", "F"),
      ["OBR", 25, 1, 1, 1],
      "Q",
    ],
    [
      "an observation result status (0085) in OBX-11",
      "UNKNOWN_CODE",
      oruWith("F", "Q"),
      ["OBX", 11, 1, 1, 1],
      "Q",
    ],
    [
      "a sex (0001, user-defined) in PID-8",
      "UNKNOWN_USER_DEFINED_CODE",
      adtWith({ pid: "PID|1||PATID1234||Everyman|||Q" }),
      ["PID", 8, 1, 1, 1],
      "Q",
    ],
    [
      "a patient class (0004, user-defined) in PV1-2",
      "UNKNOWN_USER_DEFINED_CODE",
      adtWith({ pv1: "PV1|1|Q" }),
      ["PV1", 2, 1, 1, 1],
      "Q",
    ],
  ];

  it.each(unknown)("reports %s", (_case, code, segments, at, value) => {
    expect(described(segments)).toStrictEqual([{ code, at, value }]);
  });

  it("reports an unknown version (0104) in MSH-12 and a structure code (0354) in MSH-9.3", () => {
    const msh = "MSH|^~\\&|ADT|HOSP|||20240115103000||ADT^A01^ADT_A1|1|P|2.5.9";
    expect(described(adtWith({ msh }))).toStrictEqual([
      {
        code: "MESSAGE_STRUCTURE_MISMATCH",
        at: ["MSH", 9, 1, 3, undefined],
        value: "ADT_A1",
      },
      {
        code: "MESSAGE_STRUCTURE_UNSUPPORTED",
        at: ["MSH", 9, 1, 3, undefined],
        value: "ADT_A1",
      },
      { code: "UNKNOWN_CODE", at: ["MSH", 9, 1, 3, 1], value: "ADT_A1" },
      { code: "UNKNOWN_CODE", at: ["MSH", 12, 1, 1, 1], value: "2.5.9" },
    ]);
  });

  it.each([
    ["a local trigger event", "ADT^Z99^ADT_A01", []],
    [
      "a local message code and trigger event",
      "ZRR^Z01",
      ["MESSAGE_STRUCTURE_UNKNOWN"],
    ],
    [
      "a local message structure",
      "ZRR^Z01^ZRR_Z01",
      ["MESSAGE_STRUCTURE_UNSUPPORTED"],
    ],
  ])(
    "does not look up %s, which HL7 reserves for local use",
    (_case, messageType, codes) => {
      const segments = adtWith({ msh: header(messageType) });
      const found = validateSegments(segments).issues.map(({ code }) => code);
      expect(found).toStrictEqual(codes);
    },
  );

  it("still reports a code starting with Z in a table without local codes", () => {
    const segments = adtWith({ pid: "PID|1||PATID1234||Everyman|||Z" });
    expect(described(segments)).toStrictEqual([
      {
        code: "UNKNOWN_USER_DEFINED_CODE",
        at: ["PID", 8, 1, 1, 1],
        value: "Z",
      },
    ]);
  });

  it("accepts codes of every shipped table", () => {
    const segments = adtWith({
      msh: header("ADT^A04^ADT_A01"),
      pid: "PID|1||PATID1234^^^HOSP^MR||Everyman|||F",
      pv1: "PV1|1|O",
    });
    expect(validateSegments(segments).issues).toStrictEqual([]);
    expect(validateSegments(oruWith("C", "W")).issues).toStrictEqual([]);
  });

  it("does not look up a code that fails its format", () => {
    const segments = adtWith({ pid: "PID|1||PATID1234||Everyman|||Q " });
    expect(described(segments)).toStrictEqual([
      { code: "MALFORMED_CODE", at: ["PID", 8, 1, 1, 1], value: "Q " },
    ]);
  });

  it("looks up the code of a type without a format", () => {
    const { message } = parsed(adtWith().concat("ZPI|Q").join("\r"));
    const zpi = defineSegment({
      id: "ZPI",
      fields: [{ name: "sex", dataType: "ST", table: "0001" }],
    });
    expect(
      validate(message, { segments: [zpi] }).map(({ code }) => code),
    ).toStrictEqual(["UNKNOWN_USER_DEFINED_CODE"]);
  });

  it("does not check tables the library does not ship", () => {
    const segments = adtWith({
      pid: "PID|1||PATID1234||Everyman|||F||NOT-A-RACE",
    });
    expect(validateSegments(segments).issues).toStrictEqual([]);
  });

  it.each(["__proto__", "constructor", "toString", "hasOwnProperty"])(
    "treats %s as an unknown code",
    (code) => {
      const segments = adtWith({
        pid: `PID|1||PATID1234||Everyman|||${code}`,
      });
      expect(described(segments)).toStrictEqual([
        {
          code: "UNKNOWN_USER_DEFINED_CODE",
          at: ["PID", 8, 1, 1, 1],
          value: code,
        },
      ]);
    },
  );
});
