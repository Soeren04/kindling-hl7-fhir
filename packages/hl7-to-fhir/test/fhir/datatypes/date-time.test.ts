import { test as propertyTest } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  type DateTimeTarget,
  mapDr,
  mapDt,
  mapTm,
  mapTs,
  period,
} from "../../../src/fhir/datatypes/date-time";
import { part } from "../../../src/fhir/source";
import type { IssueCode } from "../../../src/shared/issue";
import { codes, mapping, type MappingOptions } from "../helpers";

/** The FHIR R4 formats of the primitive types (https://hl7.org/fhir/R4/datatypes.html), anchored, with `\d` for `[0-9]`. */
const year = String.raw`(\d(\d(\d[1-9]|[1-9]0)|[1-9]00)|[1-9]000)`;
const month = String.raw`(0[1-9]|1[0-2])`;
const day = String.raw`(0[1-9]|[12]\d|3[01])`;
const time = String.raw`([01]\d|2[0-3]):[0-5]\d:([0-5]\d|60)(\.\d+)?`;
const offset = String.raw`(Z|(\+|-)((0\d|1[0-3]):[0-5]\d|14:00))`;
const fhirFormats: Readonly<Record<DateTimeTarget | "time", RegExp>> = {
  date: new RegExp(`^${year}(-${month}(-${day})?)?$`, "u"),
  dateTime: new RegExp(
    `^${year}(-${month}(-${day}(T${time}${offset})?)?)?$`,
    "u",
  ),
  instant: new RegExp(`^${year}-${month}-${day}T${time}${offset}$`, "u"),
  time: new RegExp(`^${time}$`, "u"),
};

/** Maps PID-7 holding `value` to `target` and returns the result with the codes of the issues. */
function ts(
  value: string,
  target?: DateTimeTarget,
  options?: MappingOptions,
): { result: string | undefined; codes: IssueCode[] } {
  const { context, field, issues } = mapping(`PID|1||||||${value}`, options);
  return { result: mapTs(context, field(7), target), codes: codes(issues) };
}

describe("mapTs to dateTime", () => {
  it.each<[string, string | undefined, IssueCode[]]>([
    ["2024", "2024", []],
    ["202401", "2024-01", []],
    ["20240115", "2024-01-15", []],
    ["20240115+0100", "2024-01-15", []],
    ["20240115103045+0100", "2024-01-15T10:30:45+01:00", []],
    ["20240115103045.1234-0500", "2024-01-15T10:30:45.1234-05:00", []],
    ["20240115103045+0000", "2024-01-15T10:30:45+00:00", []],
    [
      "202401151030+0100",
      "2024-01-15T10:30:00+01:00",
      ["DATE_TIME_PRECISION_ADJUSTED"],
    ],
    [
      "2024011510-0330",
      "2024-01-15T10:00:00-03:30",
      ["DATE_TIME_PRECISION_ADJUSTED"],
    ],
    ["20240115103045", "2024-01-15", ["DATE_TIME_OFFSET_MISSING"]],
    ["2024011510", "2024-01-15", ["DATE_TIME_OFFSET_MISSING"]],
    ["20240115103045^S", "2024-01-15", ["DATE_TIME_OFFSET_MISSING"]],
    ["20240230", undefined, ["INVALID_DATE_TIME"]],
    // A leap second is invalid, as the validator reads it (ADR 0013).
    ["20240115235960+0100", undefined, ["INVALID_DATE_TIME"]],
    ["00000101", undefined, ["INVALID_DATE_TIME"]],
    ["2024-01-15", undefined, ["INVALID_DATE_TIME"]],
    ["", undefined, []],
    ['""', undefined, []],
  ])("maps %j to %j", (value, result, issued) => {
    expect(ts(value)).toStrictEqual({ result, codes: issued });
  });

  it("ignores TS.2, the degree of precision", () => {
    expect(ts("20240115103045+0100^D").result).toBe(
      "2024-01-15T10:30:45+01:00",
    );
  });

  it("takes the offset of MSH-7 for a time without one and says so", () => {
    const sent = { sent: "20240115110000-0500" };
    expect(ts("20240115103045", "dateTime", sent)).toStrictEqual({
      result: "2024-01-15T10:30:45-05:00",
      codes: ["DATE_TIME_OFFSET_ASSUMED"],
    });
  });

  it("takes the timezone option when MSH-7 has no offset and says so", () => {
    const options = { sent: "20240115110000", settings: { timezone: "Z" } };
    expect(ts("20240115103045", "dateTime", options)).toStrictEqual({
      result: "2024-01-15T10:30:45Z",
      codes: ["DATE_TIME_OFFSET_ASSUMED"],
    });
  });

  it("reports a borrowed offset before the zeros added to the time", () => {
    const sent = { sent: "20240115110000-0500" };
    expect(ts("202401151030", "instant", sent)).toStrictEqual({
      result: "2024-01-15T10:30:00-05:00",
      codes: ["DATE_TIME_OFFSET_ASSUMED", "DATE_TIME_PRECISION_ADJUSTED"],
    });
  });

  it("does not report an offset the value has itself", () => {
    const options = { sent: "20240115110000-0500" };
    expect(ts("20240115103045+0100", "dateTime", options).codes).toStrictEqual(
      [],
    );
  });

  it("reports the missing offset as a warning that names the value", () => {
    const { context, field, issues } = mapping("PID|1||||||20240115103045");
    mapTs(context, field(7));
    expect(issues).toStrictEqual([
      expect.objectContaining({
        code: "DATE_TIME_OFFSET_MISSING",
        severity: "warning",
        value: "20240115103045",
      }),
    ]);
  });

  it("prefers the value's offset to MSH-7 and MSH-7 to the timezone option", () => {
    const options = {
      sent: "20240115110000+0200",
      settings: { timezone: "-05:00" },
    };
    expect(ts("20240115103045+0100", "dateTime", options).result).toBe(
      "2024-01-15T10:30:45+01:00",
    );
    expect(ts("20240115103045", "dateTime", options).result).toBe(
      "2024-01-15T10:30:45+02:00",
    );
  });

  it("reports at TS.1 with the value", () => {
    const { context, field, issues } = mapping("PID|1||||||20240115103045");
    mapTs(context, field(7), "date");
    expect(issues).toStrictEqual([
      expect.objectContaining({
        code: "DATE_TIME_TRUNCATED",
        severity: "info",
        value: "20240115103045",
        location: expect.objectContaining({
          segmentId: "PID",
          field: 7,
          repetition: 1,
          component: 1,
        }) as unknown,
      }),
    ]);
  });

  it("reports a null value when the context asks for it", () => {
    expect(ts('""', "dateTime", { settings: { reportNulls: true } })).toEqual({
      result: undefined,
      codes: ["HL7_NULL_IGNORED"],
    });
  });

  it("reads a TS in a component from its first subcomponent", () => {
    const { context, field } = mapping(
      "PID|1||||Everyman^Adam^^^^^L^^^^^20240115103045+0100&S",
    );
    expect(mapTs(context, part(field(5), 12))).toBe(
      "2024-01-15T10:30:45+01:00",
    );
  });
});

describe("mapTs to instant", () => {
  it.each<[string, string | undefined, IssueCode[]]>([
    ["20240115103045+0100", "2024-01-15T10:30:45+01:00", []],
    ["20240115103045.5Z", undefined, ["INVALID_DATE_TIME"]],
    [
      "202401151030+0100",
      "2024-01-15T10:30:00+01:00",
      ["DATE_TIME_PRECISION_ADJUSTED"],
    ],
    ["20240115+0100", undefined, ["DATE_TIME_OMITTED"]],
    ["2024", undefined, ["DATE_TIME_OMITTED"]],
    ["20240115103045", undefined, ["DATE_TIME_OFFSET_MISSING"]],
  ])("maps %j to %j", (value, result, issued) => {
    expect(ts(value, "instant")).toStrictEqual({ result, codes: issued });
  });
});

describe("mapTs to date", () => {
  it.each<[string, string | undefined, IssueCode[]]>([
    ["19800101", "1980-01-01", []],
    ["1980", "1980", []],
    ["198001011030+0100", "1980-01-01", ["DATE_TIME_TRUNCATED"]],
    ["19800132", undefined, ["INVALID_DATE_TIME"]],
  ])("maps %j to %j", (value, result, issued) => {
    expect(ts(value, "date")).toStrictEqual({ result, codes: issued });
  });
});

describe("mapDt", () => {
  it.each<[string, string | undefined, IssueCode[]]>([
    ["20240115", "2024-01-15", []],
    ["202401", "2024-01", []],
    ["2024011510", undefined, ["INVALID_DATE"]],
    ["20241301", undefined, ["INVALID_DATE"]],
    ["", undefined, []],
    ['""', undefined, []],
  ])("maps CX.7 %j to %j", (value, result, issued) => {
    const { context, field, issues } = mapping(
      `PID|1||12345^^^HOSP^MR^^${value}`,
    );
    expect(mapDt(context, part(field(3), 7))).toBe(result);
    expect(codes(issues)).toStrictEqual(issued);
  });
});

describe("mapTm", () => {
  it.each<[string, string | undefined, IssueCode[]]>([
    ["103045", "10:30:45", []],
    ["103045.25", "10:30:45.25", []],
    ["1030", "10:30:00", ["DATE_TIME_PRECISION_ADJUSTED"]],
    ["10", "10:00:00", ["DATE_TIME_PRECISION_ADJUSTED"]],
    ["103045+0100", "10:30:45", ["TIME_OFFSET_DROPPED"]],
    [
      "1030-0500",
      "10:30:00",
      ["DATE_TIME_PRECISION_ADJUSTED", "TIME_OFFSET_DROPPED"],
    ],
    ["2400", undefined, ["INVALID_TIME"]],
    ["10:30", undefined, ["INVALID_TIME"]],
    ["", undefined, []],
  ])("maps %j to %j", (value, result, issued) => {
    const { context, field, issues } = mapping(`OBX|1|TM|||${value}`);
    expect(mapTm(context, field(5))).toBe(result);
    expect(codes(issues)).toStrictEqual(issued);
  });
});

describe("period", () => {
  it.each([
    ["2024-01-01", "2024-12-31", { start: "2024-01-01", end: "2024-12-31" }],
    ["2024-01-01", undefined, { start: "2024-01-01" }],
    [undefined, "2024-12-31", { end: "2024-12-31" }],
    [undefined, undefined, undefined],
  ])("makes %j and %j the period %j", (start, end, expected) => {
    // toStrictEqual tells a missing property from one that is undefined.
    expect(period(start, end)).toStrictEqual(expected);
  });
});

describe("mapDr", () => {
  const options = { settings: { timezone: "+01:00" } };

  it("maps both ends to a period", () => {
    const { context, field } = mapping(
      "PID|1||||Everyman^Adam^^^^^L^^^20240101&20241231",
      options,
    );
    expect(mapDr(context, part(field(5), 10))).toStrictEqual({
      start: "2024-01-01",
      end: "2024-12-31",
    });
  });

  it("maps a DR field with TS components", () => {
    const { context, field } = mapping(
      "PID|1|||20240101080000^20241231",
      options,
    );
    expect(mapDr(context, field(4))).toStrictEqual({
      start: "2024-01-01T08:00:00+01:00",
      end: "2024-12-31",
    });
  });

  it("keeps a period with one end and drops one without any", () => {
    const { context, field } = mapping("PID|1|||^20241231|^|x^y");
    expect(mapDr(context, field(4))).toStrictEqual({ end: "2024-12-31" });
    expect(mapDr(context, field(5))).toBeUndefined();
    expect(mapDr(context, field(6))).toBeUndefined();
    expect(mapDr(context, undefined)).toBeUndefined();
  });

  it("reports a null period once, at the period", () => {
    const { context, field, issues } = mapping('PID|1|||""', {
      settings: { reportNulls: true },
    });
    expect(mapDr(context, field(4))).toBeUndefined();
    expect(
      issues.map(({ code, location }) => [code, location.component]),
    ).toStrictEqual([["HL7_NULL_IGNORED", undefined]]);
  });
});

describe("the date and time mappers on any input", () => {
  const dateTimeCharacters = fc.constantFrom(
    ...Array.from("0123456789+-.Z ^&"),
  );
  const digits = (length: number): fc.Arbitrary<string> =>
    fc.string({
      unit: fc.constantFrom(...Array.from("0123456789")),
      minLength: length,
      maxLength: length,
    });
  /** Values of the shape of a DTM, TM or DT, most of them valid: precisions, fractions and offsets of any digits. */
  const shaped = fc
    .tuple(
      fc.constantFrom(2, 4, 6, 8, 10, 12, 14),
      fc.constantFrom("", ".5", ".1234", "."),
      fc.constantFrom("", "+", "-"),
    )
    .chain(([length, fraction, sign]) =>
      fc
        .tuple(digits(length), digits(4))
        .map(
          ([body, offset]) =>
            `${body}${fraction}${sign === "" ? "" : sign + offset}`,
        ),
    );
  const values = fc.oneof(
    shaped,
    fc.string({ unit: dateTimeCharacters, maxLength: 30 }),
  );
  const settings = fc.record({
    timezone: fc.constantFrom(undefined, "Z", "+01:00", "-14:00"),
    sent: fc.constantFrom("", "20240115103000", "20240115103000+0530"),
  });

  propertyTest.prop([values, settings])(
    "never throw and return only valid FHIR values",
    (value, { timezone, sent }) => {
      const { context, field } = mapping(
        `OBX|1|TS|||${value.replaceAll("|", "")}`,
        { sent, settings: { timezone } },
      );
      const source = field(5);
      for (const target of ["dateTime", "instant", "date"] as const) {
        const result = mapTs(context, source, target);
        if (result !== undefined) {
          expect(result).toMatch(fhirFormats[target]);
        }
      }
      const date = mapDt(context, source);
      if (date !== undefined) expect(date).toMatch(fhirFormats.date);
      const clock = mapTm(context, source);
      if (clock !== undefined) expect(clock).toMatch(fhirFormats.time);
    },
  );

  propertyTest.prop([values])("never invent an offset", (value) => {
    const { context, field } = mapping(`OBX|1|TS|||${value}`);
    const result = mapTs(context, field(5));
    // Without MSH-7 and the timezone option, the only source of an offset is the value itself.
    if (result?.includes("T") === true) {
      expect(value).toContain(result.slice(-6).replace(":", ""));
    }
  });
});
