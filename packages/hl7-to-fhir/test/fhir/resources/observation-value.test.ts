import { describe, expect, it } from "vitest";

import {
  mapObservationValue,
  type ObservationValue,
} from "../../../src/fhir/resources/observation-value";
import type { IssueCode } from "../../../src/shared/issue";
import { codes, type MappingOptions } from "../helpers";
import { segment, segmentsMapping } from "./helpers";

const ucum = "http://unitsofmeasure.org";

/** Maps OBX-5 of an OBX with value type `type`, value `value` and units `units`. */
function value(
  type: string,
  observed: string,
  {
    units = "",
    inReport = true,
    options,
  }: { units?: string; inReport?: boolean; options?: MappingOptions } = {},
): { value: ObservationValue; codes: IssueCode[] } {
  const { context, at, issues } = segmentsMapping(
    [
      segment("OBX", {
        1: "1",
        2: type,
        3: "1234-5^Test^LN",
        5: observed,
        6: units,
        11: "F",
      }),
    ],
    options,
  );
  const mapped = mapObservationValue(context, at(1), {
    inReport,
    delimiters: { component: "^", subcomponent: "&" },
  });
  return { value: mapped, codes: codes(issues) };
}

describe("mapObservationValue", () => {
  describe("NM", () => {
    it("is a quantity with the unit of OBX-6", () => {
      expect(value("NM", "196", { units: "mg/dL" })).toStrictEqual({
        value: {
          kind: "value",
          value: { valueQuantity: { value: 196, unit: "mg/dL" } },
        },
        codes: [],
      });
    });

    it("gets the UCUM system and code only when OBX-6.3 names UCUM", () => {
      expect(
        value("NM", "196", { units: "mg/dL^milligram per deciliter^UCUM" })
          .value,
      ).toStrictEqual({
        kind: "value",
        value: {
          valueQuantity: {
            value: 196,
            unit: "milligram per deciliter",
            system: ucum,
            code: "mg/dL",
          },
        },
      });
    });

    it("takes the coding system of OBX-6.3 from the codeSystems option", () => {
      expect(
        value("NM", "5", {
          units: "mmol/L^^U",
          options: { settings: { codeSystems: { U: ucum } } },
        }).value,
      ).toStrictEqual({
        kind: "value",
        value: {
          valueQuantity: {
            value: 5,
            unit: "mmol/L",
            system: ucum,
            code: "mmol/L",
          },
        },
      });
    });

    it("keeps a unit of another system as text only", () => {
      expect(value("NM", "5", { units: "mmol/L^^L" }).value).toStrictEqual({
        kind: "value",
        value: { valueQuantity: { value: 5, unit: "mmol/L" } },
      });
    });

    it("keeps a value that is no number as a string and reports it", () => {
      expect(value("NM", "1,5")).toStrictEqual({
        value: { kind: "value", value: { valueString: "1,5" } },
        codes: ["NUMERIC_RESULT_KEPT_AS_TEXT"],
      });
    });

    it("keeps the trailing zeros of the number as its precision", () => {
      expect(value("NM", "1.50", { units: "mg/dL" })).toStrictEqual({
        value: {
          kind: "value",
          value: {
            valueQuantity: {
              value: 1.5,
              _value: {
                extension: [
                  {
                    url: "http://hl7.org/fhir/StructureDefinition/quantity-precision",
                    valueInteger: 2,
                  },
                ],
              },
              unit: "mg/dL",
            },
          },
        },
        codes: [],
      });
    });

    it("reports a number of more digits than a number holds", () => {
      expect(value("NM", "1234567890.123456789").codes).toStrictEqual([
        "NUMBER_PRECISION_LOST",
      ]);
    });
  });

  describe.each(["ST", "TX", "FT"])("%s", (type) => {
    it("is a string", () => {
      expect(value(type, "Reviewed").value).toStrictEqual({
        kind: "value",
        value: { valueString: "Reviewed" },
      });
    });

    it("joins repetitions as lines of one text", () => {
      expect(value(type, "First line~Second line").value).toStrictEqual({
        kind: "value",
        value: { valueString: "First line\nSecond line" },
      });
    });

    it("joins back text split at unescaped separators", () => {
      expect(value(type, "positive^see note&below").value).toStrictEqual({
        kind: "value",
        value: { valueString: "positive^see note&below" },
      });
    });
  });

  it("turns an escaped line break into a line feed", () => {
    expect(
      value("FT", String.raw`Fasting\.br\Drawn at 08:00`).value,
    ).toStrictEqual({
      kind: "value",
      value: { valueString: "Fasting\nDrawn at 08:00" },
    });
  });

  it.each(["CE", "CWE", "CNE", "CF"])(
    "maps %s to a CodeableConcept",
    (type) => {
      expect(value(type, "260385009^Negative^SCT").value).toStrictEqual({
        kind: "value",
        value: {
          valueCodeableConcept: {
            coding: [
              {
                system: "http://snomed.info/sct",
                code: "260385009",
                display: "Negative",
              },
            ],
          },
        },
      });
    },
  );

  describe("SN", () => {
    it("is a quantity with a comparator", () => {
      expect(value("SN", ">^100", { units: "mg/dL" }).value).toStrictEqual({
        kind: "value",
        value: {
          valueQuantity: { value: 100, comparator: ">", unit: "mg/dL" },
        },
      });
    });

    it("is a range for the separator -", () => {
      expect(value("SN", "^10^-^20", { units: "mg/dL" }).value).toStrictEqual({
        kind: "value",
        value: {
          valueRange: {
            low: { value: 10, unit: "mg/dL" },
            high: { value: 20, unit: "mg/dL" },
          },
        },
      });
    });

    it("is a ratio for the separator :", () => {
      expect(value("SN", "^1^:^128").value).toStrictEqual({
        kind: "value",
        value: {
          valueRatio: { numerator: { value: 1 }, denominator: { value: 128 } },
        },
      });
    });

    it("is absent for an error when FHIR cannot express it", () => {
      expect(value("SN", "<>^5")).toStrictEqual({
        value: { kind: "absent", reason: "error" },
        codes: ["STRUCTURED_NUMERIC_UNSUPPORTED"],
      });
    });
  });

  it.each<[string, string, Record<string, unknown>, IssueCode[]]>([
    ["DT", "20240115", { valueDateTime: "2024-01-15" }, []],
    [
      "TS",
      "20240115103000+0100",
      { valueDateTime: "2024-01-15T10:30:00+01:00" },
      [],
    ],
    [
      "DTM",
      "20240115103000",
      { valueDateTime: "2024-01-15T10:30:00+01:00" },
      ["DATE_TIME_OFFSET_ASSUMED"],
    ],
    ["TM", "103000", { valueTime: "10:30:00" }, []],
    [
      "DR",
      "20240115103000^20240116103000",
      {
        valuePeriod: {
          start: "2024-01-15T10:30:00+01:00",
          end: "2024-01-16T10:30:00+01:00",
        },
      },
      ["DATE_TIME_OFFSET_ASSUMED", "DATE_TIME_OFFSET_ASSUMED"],
    ],
  ])("maps %s %s", (type, observed, expected, reported) => {
    expect(value(type, observed)).toStrictEqual({
      value: { kind: "value", value: expected },
      codes: reported,
    });
  });

  it("is absent for an error when a value does not have the form of its type", () => {
    expect(value("DT", "20240230")).toStrictEqual({
      value: { kind: "absent", reason: "error" },
      codes: ["INVALID_DATE"],
    });
  });

  describe("ED", () => {
    it("is an attachment for the report", () => {
      expect(value("ED", "^AP^PDF^Base64^JVBERi0xLjQ=")).toStrictEqual({
        value: {
          kind: "attachments",
          attachments: [
            { contentType: "application/pdf", data: "JVBERi0xLjQ=" },
          ],
        },
        codes: [],
      });
    });

    it("is unsupported outside a report", () => {
      expect(
        value("ED", "^AP^PDF^Base64^JVBERi0xLjQ=", { inReport: false }),
      ).toStrictEqual({
        value: { kind: "absent", reason: "unsupported" },
        codes: ["UNSUPPORTED_VALUE_TYPE"],
      });
    });

    it("is absent for an error when no attachment can be decoded", () => {
      expect(value("ED", "^AP^PDF^Base64^not base64!")).toStrictEqual({
        value: { kind: "absent", reason: "error" },
        codes: ["INVALID_ENCAPSULATED_DATA"],
      });
    });
  });

  it("reports a value type without mapping and states it unsupported", () => {
    const { context, at, issues } = segmentsMapping([
      segment("OBX", { 2: "RP", 5: "doc.pdf" }),
    ]);
    expect(
      mapObservationValue(context, at(1), {
        inReport: true,
        delimiters: { component: "^", subcomponent: "&" },
      }),
    ).toStrictEqual({ kind: "absent", reason: "unsupported" });
    expect(
      issues.map(({ code, value: raw, location }) => [
        code,
        raw,
        location.field,
      ]),
    ).toStrictEqual([["UNSUPPORTED_VALUE_TYPE", "RP", 2]]);
  });

  it("reports a value without value type, located at OBX-2", () => {
    const { context, at, issues } = segmentsMapping([
      segment("OBX", { 3: "1234-5^Test^LN", 5: "196" }),
    ]);
    expect(
      mapObservationValue(context, at(1), {
        inReport: true,
        delimiters: { component: "^", subcomponent: "&" },
      }),
    ).toStrictEqual({ kind: "absent", reason: "unsupported" });
    expect(issues).toMatchObject([
      {
        code: "UNSUPPORTED_VALUE_TYPE",
        location: { segmentId: "OBX", field: 2 },
      },
    ]);
    expect(issues[0]?.value).toBeUndefined();
  });

  it("is none for an empty value, whatever the type", () => {
    expect(value("XYZ", "")).toStrictEqual({
      value: { kind: "none" },
      codes: [],
    });
  });

  it("is none for an explicit null, reported when asked to", () => {
    expect(
      value("NM", '""', { options: { settings: { reportNulls: true } } }),
    ).toStrictEqual({ value: { kind: "none" }, codes: ["HL7_NULL_IGNORED"] });
  });

  it("keeps a coded value that has only a text", () => {
    expect(value("CE", "^Free text").value).toStrictEqual({
      kind: "value",
      value: { valueCodeableConcept: { text: "Free text" } },
    });
  });

  describe("repetitions", () => {
    it("are values of their own for types other than text", () => {
      expect(value("NM", "1~2", { units: "mg/dL" }).value).toStrictEqual({
        kind: "components",
        values: [
          { valueQuantity: { value: 1, unit: "mg/dL" } },
          { valueQuantity: { value: 2, unit: "mg/dL" } },
        ],
      });
    });

    it("keep the reason of a repetition that cannot be read", () => {
      expect(value("DT", "20240115~20240230")).toStrictEqual({
        value: {
          kind: "components",
          values: [{ valueDateTime: "2024-01-15" }, "error"],
        },
        codes: ["INVALID_DATE"],
      });
    });

    it("skip empty repetitions", () => {
      expect(value("NM", "~5~").value).toStrictEqual({
        kind: "value",
        value: { valueQuantity: { value: 5 } },
      });
    });
  });
});
