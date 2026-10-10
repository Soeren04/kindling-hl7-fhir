import type { Quantity } from "fhir/r4";
import { describe, expect, it } from "vitest";

import { mapNm, readDecimal } from "../../../src/fhir/datatypes/nm";
import { mapSn, type StructuredNumeric } from "../../../src/fhir/datatypes/sn";
import type { IssueCode } from "../../../src/shared/issue";
import { codes, mapping } from "../helpers";

const precisionUrl =
  "http://hl7.org/fhir/StructureDefinition/quantity-precision";

/** A number with the decimal places a trailing zero would otherwise lose. */
function precise(value: number, places: number): Quantity {
  return {
    value,
    _value: { extension: [{ url: precisionUrl, valueInteger: places }] },
  };
}

describe("readDecimal", () => {
  it.each<[string, number | undefined]>([
    ["42", 42],
    ["-3.5", -3.5],
    ["+5", 5],
    [".5", 0.5],
    ["5.", 5],
    ["007", 7],
    ["1.50", 1.5],
    ["", undefined],
    ["-", undefined],
    ["1.2.3", undefined],
    ["1e3", undefined],
    ["0x10", undefined],
    [" 5", undefined],
    ["Infinity", undefined],
    ["9".repeat(400), undefined],
  ])("reads %j as %j", (text, number) => {
    expect(readDecimal(text)?.value).toBe(number);
  });

  it.each<[string, number | undefined]>([
    ["1.50", 2],
    ["5.0", 1],
    ["0.10", 2],
    ["-2.500", 3],
    ["1.5", undefined],
    ["100", undefined],
    ["5.", undefined],
    [".5", undefined],
  ])("reads the precision of %j as %j", (text, precision) => {
    expect(readDecimal(text)?.precision).toBe(precision);
  });

  it.each<[string, boolean]>([
    ["123456789012345", false],
    ["1234567890123456", true],
    ["0.123456789012345", false],
    ["0.1234567890123456", true],
    ["-12345678.12345678", true],
    ["1000000000000000000000", false],
    ["1234567890123450000000", false],
    ["0.000000000000000000001", false],
    ["1.500000000000000000000", false],
  ])("finds %j lossy: %j", (text, lossy) => {
    expect(readDecimal(text)?.lossy).toBe(lossy);
  });
});

describe("mapNm", () => {
  it.each<[string, Quantity | undefined, IssueCode[]]>([
    ["120.5", { value: 120.5 }, []],
    ["-0.25", { value: -0.25 }, []],
    ["1.50", precise(1.5, 2), []],
    ["5.0", precise(5, 1), []],
    [
      "12345678901234567",
      { value: 12345678901234568 },
      ["NUMBER_PRECISION_LOST"],
    ],
    ["positive", undefined, ["NON_NUMERIC_VALUE"]],
    [">100", undefined, ["NON_NUMERIC_VALUE"]],
    ["", undefined, []],
    ['""', undefined, []],
  ])("maps OBX-5 %j to %j", (value, quantity, issued) => {
    const { context, field, issues } = mapping(`OBX|1|NM|||${value}`);
    expect(mapNm(context, field(5))).toStrictEqual(quantity);
    expect(codes(issues)).toStrictEqual(issued);
  });

  it("reports a number of too many digits with the original", () => {
    const { context, field, issues } = mapping(
      "OBX|1|NM|||0.12345678901234567",
    );
    mapNm(context, field(5));
    expect(issues[0]).toMatchObject({
      severity: "warning",
      value: "0.12345678901234567",
    });
  });

  it("reports the value at its location", () => {
    const { context, field, issues } = mapping("OBX|1|NM|||high");
    mapNm(context, field(5));
    expect(issues[0]).toMatchObject({
      severity: "warning",
      value: "high",
      location: { segmentId: "OBX", field: 5, repetition: 1 },
    });
  });
});

describe("mapSn", () => {
  it.each<[string, StructuredNumeric | undefined]>([
    ["^100", { kind: "quantity", quantity: { value: 100 } }],
    ["=^100", { kind: "quantity", quantity: { value: 100 } }],
    [">^100", { kind: "quantity", quantity: { value: 100, comparator: ">" } }],
    [
      "<=^0.5",
      { kind: "quantity", quantity: { value: 0.5, comparator: "<=" } },
    ],
    [
      "^10^-^20",
      { kind: "range", range: { low: { value: 10 }, high: { value: 20 } } },
    ],
    ["^10^-", { kind: "range", range: { low: { value: 10 } } }],
    ["^^-^20", { kind: "range", range: { high: { value: 20 } } }],
    [
      "^1^:^128",
      {
        kind: "ratio",
        ratio: { numerator: { value: 1 }, denominator: { value: 128 } },
      },
    ],
    [
      "<^1^/^64",
      {
        kind: "ratio",
        ratio: {
          numerator: { value: 1, comparator: "<" },
          denominator: { value: 64 },
        },
      },
    ],
    ["", undefined],
    ['""', undefined],
  ])("maps %j", (value, result) => {
    const { context, field, issues } = mapping(`OBX|1|SN|||${value}`);
    expect(mapSn(context, field(5))).toStrictEqual(result);
    expect(issues).toStrictEqual([]);
  });

  it.each<[string, IssueCode, string | undefined, number | undefined]>([
    ["<>^5", "STRUCTURED_NUMERIC_UNSUPPORTED", "<>", 1],
    ["!^5", "STRUCTURED_NUMERIC_UNSUPPORTED", "!", 1],
    ["^2^+", "STRUCTURED_NUMERIC_UNSUPPORTED", "+", 3],
    ["^1^.^2", "STRUCTURED_NUMERIC_UNSUPPORTED", ".", 3],
    [">^10^-^20", "STRUCTURED_NUMERIC_UNSUPPORTED", ">", 1],
    ["^1^:", "STRUCTURED_NUMERIC_UNSUPPORTED", undefined, undefined],
    ["^1^^2", "STRUCTURED_NUMERIC_UNSUPPORTED", undefined, undefined],
    [">", "STRUCTURED_NUMERIC_UNSUPPORTED", undefined, undefined],
    ["^^-", "STRUCTURED_NUMERIC_UNSUPPORTED", undefined, undefined],
    ["^20^-^10", "STRUCTURED_NUMERIC_UNSUPPORTED", undefined, undefined],
    ["^0.5^-^-0.5", "STRUCTURED_NUMERIC_UNSUPPORTED", undefined, undefined],
    [">^lots", "NON_NUMERIC_VALUE", "lots", 2],
    ["^1^:^x", "NON_NUMERIC_VALUE", "x", 4],
  ])("leaves out %j with %s", (value, code, issueValue, component) => {
    const { context, field, issues } = mapping(`OBX|1|SN|||${value}`);
    expect(mapSn(context, field(5))).toBeUndefined();
    expect(codes(issues)).toStrictEqual([code]);
    expect(issues[0]?.value).toBe(issueValue);
    expect(issues[0]?.location.component).toBe(component);
  });

  it("keeps a range of equal ends, which rng-2 allows", () => {
    const { context, field, issues } = mapping("OBX|1|SN|||^5^-^5");
    expect(mapSn(context, field(5))).toStrictEqual({
      kind: "range",
      range: { low: { value: 5 }, high: { value: 5 } },
    });
    expect(issues).toStrictEqual([]);
  });

  it("keeps the precision of the numbers of every shape", () => {
    const { context, field, issues } = mapping("OBX|1|SN|||^1.50^-^2.0");
    expect(mapSn(context, field(5))).toStrictEqual({
      kind: "range",
      range: { low: precise(1.5, 2), high: precise(2, 1) },
    });
    expect(issues).toStrictEqual([]);
  });

  it("reports the numbers of too many digits at their parts", () => {
    const { context, field, issues } = mapping(
      "OBX|1|SN|||>^0.12345678901234567",
    );
    expect(mapSn(context, field(5))).toMatchObject({ kind: "quantity" });
    expect(
      issues.map(({ code, value, location }) => [
        code,
        value,
        location.component,
      ]),
    ).toStrictEqual([["NUMBER_PRECISION_LOST", "0.12345678901234567", 2]]);
  });

  it("does not report precision of a value that is left out", () => {
    const { context, field, issues } = mapping(
      "OBX|1|SN|||<>^0.12345678901234567",
    );
    expect(mapSn(context, field(5))).toBeUndefined();
    expect(codes(issues)).toStrictEqual(["STRUCTURED_NUMERIC_UNSUPPORTED"]);
  });

  it("reports a null value once, at the field", () => {
    const { context, field, issues } = mapping('OBX|1|SN|||""', {
      settings: { reportNulls: true },
    });
    expect(mapSn(context, field(5))).toBeUndefined();
    expect(
      issues.map(({ code, location }) => [code, location.component]),
    ).toStrictEqual([["HL7_NULL_IGNORED", undefined]]);
  });

  it("reports every number that is not one", () => {
    const { context, field, issues } = mapping("OBX|1|SN|||^a^-^b");
    expect(mapSn(context, field(5))).toBeUndefined();
    expect(issues.map(({ value }) => value)).toStrictEqual(["a", "b"]);
  });
});
